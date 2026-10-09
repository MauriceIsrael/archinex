import { json, error, type RequestHandler } from '@sveltejs/kit';
import {
	factorizeRfpWithLocalLlm,
	buildSystemPrompt,
	type KbItemSummary
} from '$lib/server/llm/rfpFactorizer';
import { localLlmClient } from '$lib/server/llm/localLlmClient';
import { doctrineService } from '$lib/server/doctrine/doctrineService';
import { runArcKitRequirementsAudit } from '$lib/server/ingest/arckitRequirementsPipeline';
import type { FactorizedArchitecturalSubject } from '$lib/domain/factorization';

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
	try {
		const body = await request.json();
		const clauses = body.clauses;

		if (!Array.isArray(clauses) || clauses.length === 0) {
			throw error(400, 'Un tableau de clauses non vide est requis dans "clauses".');
		}

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
			}
		} catch {
			// En cas d'erreur de doctrine, on continue avec un tableau vide
		}

		// 1. Exécution prioritaire du Pipeline d'Audit et de Factorisation ArcKit
		const auditReport = runArcKitRequirementsAudit(clauses);
		if (auditReport.hardPoints && auditReport.hardPoints.length > 0) {
			const subjects: FactorizedArchitecturalSubject[] = auditReport.hardPoints.map((hp, idx) => ({
				id: `SUBJ-${String(idx + 1).padStart(2, '0')}`,
				lotId: `LOT-${hp.id}`,
				name: hp.name,
				sectionRef: hp.sectionRef,
				coveredClauseRefs: hp.coveredClauseRefs,
				matchedKbItemIds: [],
				knowledgeAlignment: 'novel_requirement',
				alignmentRationale: `Point dur d'architecture extrait selon la méthodologie ArcKit (couvre ${hp.coveredClauseRefs.length} exigences).`,
				initialLevel: 'L0_unassessed',
				waitingForRole: hp.waitingForRole,
				effort: hp.effort as 'S' | 'M',
				seed: {
					initialRetenu: hp.seed.initialRetenu,
					initialHypothesis: hp.seed.initialHypothesis,
					initialConflict: hp.seed.initialConflict,
					initialQuestion: hp.seed.initialQuestion,
					expertQuestions: hp.seed.expertQuestions
				}
			}));

			return json({
				status: 'ok',
				engine: 'arckit-requirements-audit',
				modelUsed: body.model || 'arckit-requirements-pipeline',
				summary: `Audit qualité & factorisation ArcKit : ${auditReport.totalCount} exigences analysées, ${auditReport.evacuatedCount} commodités évacuées (${Math.round((auditReport.evacuatedCount / auditReport.totalCount) * 100)}%), ${auditReport.clarificationCount} questions client et ${auditReport.hardPoints.length} points durs d'architecture extraits.`,
				totalClauses: auditReport.totalCount,
				coveredClausesCount: auditReport.requirements.filter((r) => r.disposition !== 'evacuated').length,
				coverageRate: 1.0,
				subjects,
				unassignedClauses: [],
				auditReport,
				evacuatedCount: auditReport.evacuatedCount,
				deliberatedCount: auditReport.deliberatedCount,
				clarificationCount: auditReport.clarificationCount,
				clarifications: auditReport.clarifications,
				allAuditedRequirements: auditReport.requirements
			});
		}

		const result = await factorizeRfpWithLocalLlm(
			{
				clauses,
				model: body.model || localLlmClient.getDefaultModel(),
				customPromptDirectives: body.customPromptDirectives,
				engagementId: body.engagementId,
				documentTitle: body.documentTitle
			},
			kbStandards
		);

		return json({
			...result,
			auditReport,
			evacuatedCount: auditReport.evacuatedCount,
			deliberatedCount: auditReport.deliberatedCount,
			clarificationCount: auditReport.clarificationCount,
			clarifications: auditReport.clarifications,
			allAuditedRequirements: auditReport.requirements
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Erreur interne lors de la factorisation.';
		return json({ status: 'error', error: message }, { status: 500 });
	}
};
