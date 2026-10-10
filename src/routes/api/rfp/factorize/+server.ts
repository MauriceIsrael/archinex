import { json, error, type RequestHandler } from '@sveltejs/kit';
import {
	factorizeRfpWithLocalLlm,
	buildSystemPrompt,
	isGrandContextModel,
	type KbItemSummary
} from '$lib/server/llm/rfpFactorizer';
import { localLlmClient } from '$lib/server/llm/localLlmClient';
import { doctrineService } from '$lib/server/doctrine/doctrineService';
import {
	runRequirementsAudit,
	toFactorizationResponse,
	canFallBackToDirectFactorization,
	canUseDirectHolisticPass,
	directPassMaxChars,
	totalClauseChars
} from '$lib/server/ingest/arckitRequirementsPipeline';

/**
 * GET /api/rfp/factorize
 * Renvoie les informations d'environnement : modèles disponibles sur le LLM local,
 * état de santé et prompt système d'orientation modifiable.
 */
export const GET: RequestHandler = async () => {
	try {
		const health = await localLlmClient.checkHealth();
		const defaultPrompt = buildSystemPrompt();

		return json({
			status: 'ok',
			serverEndpoint: health.endpoint,
			available: health.available,
			defaultModel: localLlmClient.getDefaultModel(),
			models: health.models,
			defaultSystemPrompt: defaultPrompt,
			kbStandardsCount: 0,
			error: health.error
		});
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : 'Erreur interne';
		return json({
			status: 'error',
			available: false,
			defaultModel: localLlmClient.getDefaultModel(),
			models: [
				{ id: 'ministral:latest', name: 'ministral:latest (Raisonnement 14B)' },
				{ id: 'qwen2.5-coder:14b', name: 'qwen2.5-coder:14b (Structure 14B)' }
			],
			defaultSystemPrompt: buildSystemPrompt(),
			error: msg
		});
	}
};

/**
 * POST /api/rfp/factorize
 * Lance la factorisation sémantique des clauses en 8-12 sujets d'architecture majeurs
 */
export const POST: RequestHandler = async ({ request }) => {
	const reqStartTime = Date.now();
	try {
		const body = await request.json();
		const clauses = body.clauses;

		if (!Array.isArray(clauses) || clauses.length === 0) {
			throw error(400, 'Un tableau de clauses non vide est requis dans "clauses".');
		}

		const model = body.model || localLlmClient.getDefaultModel();
		const isGrandContext = isGrandContextModel(model);

		console.log(`\n================================================================================`);
		console.log(`📥 [API /api/rfp/factorize] Requête reçue pour ${clauses.length} clauses`);
		console.log(`   - Modèle cible : "${model}"`);
		console.log(`   - Architecture moteur : ${isGrandContext ? 'Grand Contexte (Passe directe holistique)' : 'Audit en étapes / Map-Reduce'}`);
		console.log(`   - Titre document : ${body.documentTitle || '(Sans titre)'}`);
		console.log(`================================================================================\n`);

		// Récupération de la doctrine applicable depuis LLMOps
		let kbStandards: KbItemSummary[] = [];
		try {
			const ctx = await doctrineService.getDoctrineContext({
				projectType: body.projectType
			});
			if (ctx && Array.isArray(ctx.items)) {
				kbStandards = ctx.items.map((item) => ({
					id: item.id,
					title: item.title,
					category: (item.domain || item.type || 'ARCHITECTURE').toUpperCase(),
					ruleOrStatement: item.content
				}));
				console.log(`📚 [API /api/rfp/factorize] ${kbStandards.length} règles de doctrine KB chargées.`);
			}
		} catch {
			// En cas d'erreur de doctrine, on continue avec un tableau vide
		}

		// Pour les modèles à grand contexte (Claude 200k), la factorisation directe holistique est
		// privilégiée : elle traite jusqu'à 2 500 exigences en une seule passe globale (20-30s)
		// avec une vision d'ensemble des dilemmes, évitant le découpage en 40 micro-appels d'audit séparés.
		const directPassAllowed = canUseDirectHolisticPass(clauses);
		if (isGrandContext && !directPassAllowed) {
			console.warn(
				`⚠️ [API /api/rfp/factorize] RFP trop volumineux pour la passe directe (${totalClauseChars(clauses)} > ${directPassMaxChars()} caractères) : audit en étapes.`
			);
		}
		if (isGrandContext && directPassAllowed && !body.forceAudit) {
			console.log(`🚀 [API /api/rfp/factorize] Exécution directe holistique via factorizeRfpWithLocalLlm...`);
			const result = await factorizeRfpWithLocalLlm(
				{
					clauses,
					model,
					customPromptDirectives: body.customPromptDirectives,
					engagementId: body.engagementId,
					documentTitle: body.documentTitle
				},
				kbStandards
			);
			const totalReqSec = ((Date.now() - reqStartTime) / 1000).toFixed(1);
			console.log(`🏁 [API /api/rfp/factorize] Terminé avec succès en ${totalReqSec}s (${result.subjects.length} sujets générés).`);
			return json(result);
		}

		// Pour les modèles locaux à contexte restreint ou si forceAudit est demandé :
		// 1. Audit en étapes (classement, contrôles, regroupement en sujets) par le modèle configuré
		console.log(`🔍 [API /api/rfp/factorize] Lancement du pipeline d'audit en étapes (classement & contrôles)...`);
		const sizeChars = totalClauseChars(clauses);
		console.info(`[Audit RFP] ${clauses.length} clauses, ${sizeChars} caractères, modèle ${model}`);
		const audit = await runRequirementsAudit(clauses, { model, kbStandards });
		// Les motifs d'échec sont journalisés (sans contenu du RFP) : sans eux la cause d'une panne est introuvable.
		console.info(`[Audit RFP] statut : ${audit.status}, ${audit.subjects.length} sujet(s), ${audit.warnings.length} avertissement(s)`);
		for (const w of audit.warnings) console.warn(`[Audit RFP] ${w}`);
		if (audit.status === 'ok') {
			const totalReqSec = ((Date.now() - reqStartTime) / 1000).toFixed(1);
			console.log(`🏁 [API /api/rfp/factorize] Audit réussi en ${totalReqSec}s.`);
			return json(toFactorizationResponse(audit));
		}

		// Gros RFP : la factorisation directe (un seul appel) échouerait sur le délai. On rend l'audit tel quel :
		// les clauses non classées sont « à qualifier », et la cause figure dans les avertissements.
		if (!canFallBackToDirectFactorization(clauses)) {
			if (audit.status === 'partial') {
				return json(toFactorizationResponse(audit));
			}
			const cause = audit.warnings.slice(0, 3).join(' ') || 'modèle indisponible';
			const message = `L'audit des exigences n'a pas abouti et ce RFP (${clauses.length} clauses) est trop volumineux pour la factorisation directe. Cause : ${cause}`;
			return json({ status: 'error', error: message, message }, { status: 502 });
		}

		// 2. Repli : factorisation directe. Le rapport d'audit incomplet n'est PAS joint, pour ne pas
		//    afficher des dispositions partielles ou contradictoires avec les sujets du moteur de repli.
		console.log(`⚠️ [API /api/rfp/factorize] Audit incomplet (${audit.warnings.join(' ') || 'modèle indisponible'}), repli vers factorizeRfpWithLocalLlm...`);
		const result = await factorizeRfpWithLocalLlm(
			{
				clauses,
				model,
				customPromptDirectives: body.customPromptDirectives,
				engagementId: body.engagementId,
				documentTitle: body.documentTitle
			},
			kbStandards
		);

		const auditNote = `L'audit des exigences n'a pas abouti (${audit.warnings.join(' ') || 'modèle indisponible'}).`;
		const totalReqSec = ((Date.now() - reqStartTime) / 1000).toFixed(1);
		console.log(`🏁 [API /api/rfp/factorize] Repli terminé en ${totalReqSec}s.`);
		return json({
			...result,
			warning: [auditNote, result.warning].filter(Boolean).join(' ')
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Erreur interne lors de la factorisation.';
		console.error(`❌ [API /api/rfp/factorize] Erreur critique :`, err);
		return json({ status: 'error', error: message }, { status: 500 });
	}
};
