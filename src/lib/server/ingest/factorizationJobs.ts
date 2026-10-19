/**
 * Exécution des factorisations de RFP en tâche de fond.
 *
 * Le calcul ne vit plus dans la requête HTTP : le lancement renvoie aussitôt un identifiant d'exécution, le
 * calcul continue côté serveur et publie son avancement (puis des états partiels exploitables) en base.
 * Un rechargement de page ou une fermeture du navigateur ne perd donc rien. Si le serveur lui-même redémarre,
 * l'exécution passe en « interrompue » et peut être reprise : grâce au cache des étapes, la reprise repart
 * de la dernière étape terminée.
 */

import { localLlmClient } from '$lib/server/llm/localLlmClient';
import { factorizeRfpWithLocalLlm, isGrandContextModel, type KbItemSummary } from '$lib/server/llm/rfpFactorizer';
import { doctrineService } from '$lib/server/doctrine/doctrineService';
import { detectApplicableFrameworks } from '$lib/domain/regulatoryFrameworks';
import type { ExtractedClause } from '$lib/domain/corpus';
import type { RfpFactorizationResponse } from '$lib/domain/factorization';
import {
	runRequirementsAudit,
	toFactorizationResponse,
	canFallBackToDirectFactorization,
	canUseDirectHolisticPass,
	directPassMaxChars,
	totalClauseChars,
	type AuditProgress
} from './arckitRequirementsPipeline';
import {
	finishFactorizationRun,
	findCompletedRun,
	getFactorizationRunRequest,
	markInterruptedRuns,
	prismaStageCache,
	restartFactorizationRun,
	sha256,
	startFactorizationRun,
	updateFactorizationProgress,
	type FactorizationProgress,
	type FactorizationRunStatus
} from './factorizationRunsDb';

export interface FactorizeRequest {
	clauses: ExtractedClause[];
	model?: string;
	customPromptDirectives?: string;
	documentTitle?: string;
	engagementId?: string;
	projectType?: string;
	forceAudit?: boolean;
	/** Ignore les résultats antérieurs et le cache des étapes. */
	recompute?: boolean;
	sourceText?: string;
	/** Validation humaine préalable du découpage PDF (échantillon, anomalies acceptées). */
	extractionValidation?: import('$lib/domain/rfpExtractionReport').HumanExtractionValidation;
}

/** Issue d'un calcul : ce que l'API renvoie (corps et code HTTP) et ce qui est persisté. */
export interface FactorizeOutcome {
	runStatus: Exclude<FactorizationRunStatus, 'running' | 'interrupted'>;
	engine: 'audit' | 'direct' | 'fallback';
	httpStatus: number;
	body: Record<string, unknown>;
	result?: RfpFactorizationResponse;
	error?: string;
}

export type LaunchResult =
	| { kind: 'reused'; runId: string; result: RfpFactorizationResponse }
	| { kind: 'started' | 'running'; runId: string; done: Promise<FactorizeOutcome | null> };

// Survit au rechargement à chaud des modules en développement : sinon une exécution en cours, encore vivante
// dans l'ancienne instance du module, serait déclarée interrompue.
const state = ((globalThis as Record<string, unknown>).__archinexFactorizationJobs ??= {
	active: new Map<string, Promise<FactorizeOutcome | null>>(),
	reconciled: false
}) as { active: Map<string, Promise<FactorizeOutcome | null>>; reconciled: boolean };

/**
 * Au premier appel après un démarrage du serveur, toute exécution encore « en cours » en base a perdu son
 * calcul : elle passe en « interrompue », reprenable.
 */
export async function reconcileInterruptedRuns(): Promise<void> {
	if (state.reconciled) return;
	state.reconciled = true;
	try {
		const count = await markInterruptedRuns([...state.active.keys()]);
		if (count > 0) console.warn(`⚠️ [Factorisation] ${count} exécution(s) interrompue(s) par un redémarrage du serveur : reprenables.`);
	} catch (err) {
		state.reconciled = false;
		console.warn(`⚠️ [Factorisation] Rapprochement des exécutions impossible :`, err instanceof Error ? err.message : err);
	}
}

/**
 * Doctrine LLMOps pertinente pour un sujet (le hub exige un sujet de recherche). Avec les référentiels cités par
 * le RFP, LLMOps y joint leurs contrôles actifs : l'instruction propose alors des options conformes.
 */
async function doctrineForTopic(topic: string, frameworks: string[] = []): Promise<KbItemSummary[]> {
	const ctx = await doctrineService.getDoctrineContext({ topics: [topic], frameworks, maxItems: 20 });
	if (!ctx || !Array.isArray(ctx.items)) return [];
	return ctx.items.map((item) => ({
		id: item.id,
		title: item.title,
		category: (item.domain || item.type || 'ARCHITECTURE').toUpperCase(),
		ruleOrStatement: item.content
	}));
}

async function loadDoctrine(projectType?: string): Promise<KbItemSummary[]> {
	// Doctrine générale du type de projet ; la doctrine propre à chaque sujet est interrogée à l'instruction.
	if (!projectType) return [];
	try {
		const ctx = await doctrineService.getDoctrineContext({ projectType });
		if (ctx && Array.isArray(ctx.items)) {
			const kb = ctx.items.map((item) => ({
				id: item.id,
				title: item.title,
				category: (item.domain || item.type || 'ARCHITECTURE').toUpperCase(),
				ruleOrStatement: item.content
			}));
			console.log(`📚 [Factorisation] ${kb.length} règles de doctrine KB chargées.`);
			return kb;
		}
	} catch {
		// En cas d'erreur de doctrine, on continue sans
	}
	return [];
}

/** Empreinte des entrées : mêmes clauses, même modèle, même doctrine, mêmes consignes = même factorisation. */
function fingerprint(req: FactorizeRequest, model: string, kb: KbItemSummary[]): string {
	return sha256({
		clauses: req.clauses.map((c) => [c.clauseRef, c.title, c.text, c.criticality]),
		model,
		kb: kb.map((k) => [k.id, k.ruleOrStatement]),
		directives: req.customPromptDirectives ?? null,
		forceAudit: Boolean(req.forceAudit)
	});
}

/**
 * Lance une factorisation en tâche de fond et rend la main aussitôt.
 * Mêmes entrées déjà factorisées : le résultat persisté est renvoyé (sauf `recompute`).
 * Mêmes entrées en cours de calcul dans ce serveur : on se rattache à l'exécution existante.
 */
export async function launchFactorization(req: FactorizeRequest): Promise<LaunchResult> {
	await reconcileInterruptedRuns();
	const model = req.model || localLlmClient.getDefaultModel();
	const kb = await loadDoctrine(req.projectType);
	const inputSha256 = fingerprint(req, model, kb);

	if (!req.recompute) {
		const previous = await findCompletedRun(inputSha256).catch(() => null);
		if (previous) {
			console.log(`♻️ [Factorisation] Résultat déjà calculé pour ces entrées (run ${previous.id}) : renvoyé sans recalcul.`);
			return { kind: 'reused', runId: previous.id, result: previous.result };
		}
	}

	let runId: string;
	try {
		runId = await startFactorizationRun({
			inputSha256,
			documentTitle: req.documentTitle,
			model,
			clauseCount: req.clauses.length,
			sourceText: req.sourceText,
			request: { ...req, sourceText: undefined }
		});
		console.log(`🗄️ [Factorisation] Exécution persistée : ${runId}`);
	} catch (err) {
		// Sans persistance, pas de suivi possible : le calcul tourne quand même, l'appelant peut l'attendre.
		console.warn(`⚠️ [Factorisation] Persistance indisponible, le calcul continue sans :`, err instanceof Error ? err.message : err);
		const done = execute(null, req, model, kb).catch(() => null);
		return { kind: 'started', runId: '', done };
	}

	const done = execute(runId, req, model, kb).catch(() => null);
	return { kind: 'started', runId, done };
}

/** Reprend une exécution interrompue ou en échec, sur sa requête d'origine. Le cache évite de refaire les étapes acquises. */
export async function resumeFactorization(runId: string): Promise<{ runId: string; done: Promise<FactorizeOutcome | null> } | null> {
	await reconcileInterruptedRuns();
	const existing = state.active.get(runId);
	if (existing) return { runId, done: existing };
	const req = (await getFactorizationRunRequest(runId)) as FactorizeRequest | null;
	if (!req) return null;
	await restartFactorizationRun(runId);
	const model = req.model || localLlmClient.getDefaultModel();
	const kb = await loadDoctrine(req.projectType);
	console.log(`🔁 [Factorisation] Reprise de l'exécution ${runId}.`);
	return { runId, done: execute(runId, { ...req, recompute: false }, model, kb).catch(() => null) };
}

function execute(runId: string | null, req: FactorizeRequest, model: string, kb: KbItemSummary[]): Promise<FactorizeOutcome> {
	const run = (async () => {
		let outcome: FactorizeOutcome;
		try {
			outcome = await computeFactorization(req, model, kb, runId ? progressWriter(runId) : undefined);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Erreur interne lors de la factorisation.';
			console.error(`❌ [Factorisation] Erreur critique :`, err);
			outcome = { runStatus: 'error', engine: 'audit', httpStatus: 500, body: { status: 'error', error: message }, error: message };
		}
		if (outcome.result) {
			const validation = req.extractionValidation || {
				validated: false,
				sampleSize: 0,
				sampleItems: [],
				acceptedAnomaliesCount: 0,
				flaggedIssuesCount: 0,
				reportSummary: {
					pageCount: 1,
					clauseCount: req.clauses.length,
					coverageRate: 0,
					anomaliesCount: 0
				}
			};
			outcome.result.extractionValidation = validation;
			outcome.body = { ...outcome.body, extractionValidation: validation };
		}
		if (runId) {
			try {
				await finishFactorizationRun(runId, { status: outcome.runStatus, engine: outcome.engine, result: outcome.result, error: outcome.error });
			} catch (err) {
				console.warn(`⚠️ [Factorisation] Résultat non persisté (run ${runId}) :`, err instanceof Error ? err.message : err);
			}
		}
		return outcome;
	})();
	if (runId) {
		state.active.set(runId, run);
		void run.finally(() => state.active.delete(runId));
	}
	return run;
}

const STAGE_LABELS: Record<AuditProgress['stage'], string> = {
	classify: 'Tri des exigences',
	partition: 'Cartographie des décisions',
	instruct: 'Instruction des sujets',
	triage: 'Priorisation et dépendances'
};

/** Publie l'avancement en base (écritures sérialisées), avec l'état partiel aux étapes clés. */
function progressWriter(runId: string): (p: AuditProgress) => void {
	let chain = Promise.resolve();
	return (p) => {
		const progress: FactorizationProgress = { stage: p.stage, label: STAGE_LABELS[p.stage], done: p.done, total: p.total, updatedAt: new Date().toISOString() };
		const partial = p.snapshot ? { ...toFactorizationResponse(p.snapshot), inProgress: true } : undefined;
		chain = chain
			.then(() => updateFactorizationProgress(runId, progress, partial))
			.catch((err) => console.warn(`⚠️ [Factorisation] Avancement non enregistré :`, err instanceof Error ? err.message : err));
	};
}

/** Le calcul lui-même : passe directe (petits RFP, grand contexte) ou audit en étapes, avec replis. */
export async function computeFactorization(
	req: FactorizeRequest,
	model: string,
	kb: KbItemSummary[],
	onProgress?: (p: AuditProgress) => void
): Promise<FactorizeOutcome> {
	const startTime = Date.now();
	const { clauses } = req;
	const isGrandContext = isGrandContextModel(model);
	const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);

	console.log(`\n================================================================================`);
	console.log(`📥 [Factorisation] ${clauses.length} clauses — modèle "${model}" — ${req.documentTitle || '(Sans titre)'}`);
	console.log(`================================================================================\n`);

	const directRequest = {
		clauses,
		model,
		customPromptDirectives: req.customPromptDirectives,
		engagementId: req.engagementId,
		documentTitle: req.documentTitle
	};

	// Petits RFP avec un modèle à grand contexte : une seule passe globale, avec une vision d'ensemble des dilemmes.
	const directPassAllowed = canUseDirectHolisticPass(clauses);
	if (isGrandContext && !directPassAllowed) {
		console.warn(`⚠️ [Factorisation] RFP trop volumineux pour la passe directe (${totalClauseChars(clauses)} > ${directPassMaxChars()} caractères) : audit en étapes.`);
	}
	if (isGrandContext && directPassAllowed && !req.forceAudit) {
		const result = await factorizeRfpWithLocalLlm(directRequest, kb);
		if (result.status === 'fallback' || result.errorDetail) {
			console.warn(`⚠️ Repli heuristique (moteur IA indisponible) — passe directe en ${elapsed()}s (${result.subjects.length} sujets).`);
		} else {
			console.log(`🏁 [Factorisation] Passe directe terminée en ${elapsed()}s (${result.subjects.length} sujets).`);
		}
		const isFallback = result.status === 'fallback' || Boolean(result.errorDetail);
		return { runStatus: isFallback ? 'partial' : 'ok', engine: 'direct', httpStatus: 200, body: { ...result }, result };
	}

	// Gros RFP, modèles locaux ou forceAudit : audit en étapes (tri, contrôles, cartographie, instruction).
	console.info(`[Audit RFP] ${clauses.length} clauses, ${totalClauseChars(clauses)} caractères, modèle ${model}`);
	const frameworks = detectApplicableFrameworks(req.sourceText || clauses.map((c) => c.text).join(' ')).map((f) => f.code);
	if (frameworks.length) console.info(`[Audit RFP] Référentiels cités : ${frameworks.join(', ')}`);
	const audit = await runRequirementsAudit(clauses, {
		model,
		kbStandards: kb,
		cache: req.recompute ? undefined : prismaStageCache,
		onProgress,
		doctrineFor: (topic) => doctrineForTopic(topic, frameworks)
	});
	// Les motifs d'échec sont journalisés (sans contenu du RFP) : sans eux la cause d'une panne est introuvable.
	console.info(`[Audit RFP] statut : ${audit.status}, ${audit.subjects.length} sujet(s), ${audit.warnings.length} avertissement(s)`);
	for (const w of audit.warnings) console.warn(`[Audit RFP] ${w}`);

	if (audit.status === 'ok') {
		const result = toFactorizationResponse(audit);
		console.log(`🏁 [Factorisation] Audit réussi en ${elapsed()}s.`);
		return { runStatus: 'ok', engine: 'audit', httpStatus: 200, body: { ...result }, result };
	}

	// Gros RFP : la factorisation directe (un seul appel) échouerait sur le délai. On rend l'audit tel quel :
	// les clauses non classées sont « à qualifier », et la cause figure dans les avertissements.
	if (!canFallBackToDirectFactorization(clauses)) {
		if (audit.status === 'partial') {
			const result = toFactorizationResponse(audit);
			return { runStatus: 'partial', engine: 'audit', httpStatus: 200, body: { ...result }, result };
		}
		const cause = audit.warnings.slice(0, 3).join(' ') || 'modèle indisponible';
		const message = `L'audit des exigences n'a pas abouti et ce RFP (${clauses.length} clauses) est trop volumineux pour la factorisation directe. Cause : ${cause}`;
		return { runStatus: 'unavailable', engine: 'audit', httpStatus: 502, body: { status: 'error', error: message, message }, error: message };
	}

	// Repli : factorisation directe. Le rapport d'audit incomplet n'est PAS joint, pour ne pas afficher des
	// dispositions partielles ou contradictoires avec les sujets du moteur de repli.
	console.log(`⚠️ [Factorisation] Audit incomplet (${audit.warnings.join(' ') || 'modèle indisponible'}), repli vers la factorisation directe...`);
	const direct = await factorizeRfpWithLocalLlm(directRequest, kb);
	const auditNote = `L'audit des exigences n'a pas abouti (${audit.warnings.join(' ') || 'modèle indisponible'}).`;
	const result = { ...direct, warning: [auditNote, direct.warning].filter(Boolean).join(' ') };
	if (direct.status === 'fallback' || direct.errorDetail) {
		console.warn(`⚠️ Repli heuristique (moteur IA indisponible) — terminé en ${elapsed()}s.`);
	} else {
		console.log(`🏁 [Factorisation] Repli terminé en ${elapsed()}s.`);
	}
	return { runStatus: 'partial', engine: 'fallback', httpStatus: 200, body: { ...result }, result };
}
