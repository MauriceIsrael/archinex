import { describe, it, expect, vi } from 'vitest';
import {
	runRequirementsAudit,
	isLlmCreditOrQuotaError,
	PARTITION_MAX_CHARS,
	type StageCache,
	type LlmPort
} from '../../src/lib/server/ingest/arckitRequirementsPipeline';
import * as pipelineModule from '../../src/lib/server/ingest/arckitRequirementsPipeline';
import { computeFactorization, type FactorizeRequest } from '../../src/lib/server/ingest/factorizationJobs';
import type { ExtractedClause } from '../../src/lib/domain/corpus';

describe('Audit RFP — Détection de Quota, Reprise sur Cache et Notifications', () => {
	it('détecte correctement les messages d\'épuisement de crédits ou de quotas d\'API LLM', () => {
		const anthropicQuotaError = new Error(
			'{"type":"error","error":{"details":null,"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CgRY8BbEAPo2LX6rpjPT8"}'
		);
		const openaiQuotaError = new Error('You exceeded your current quota, please check your plan and billing details.');
		const http402 = new Error('HTTP 402 Payment Required: billing account inactive');
		const syntaxError = new Error('JSON invalide à la ligne 1');
		const timeoutError = new Error('Délai d\'inférence Claude dépassé');

		expect(isLlmCreditOrQuotaError(anthropicQuotaError)).toBe(true);
		expect(isLlmCreditOrQuotaError(openaiQuotaError)).toBe(true);
		expect(isLlmCreditOrQuotaError(http402)).toBe(true);
		expect(isLlmCreditOrQuotaError(syntaxError)).toBe(false);
		expect(isLlmCreditOrQuotaError(timeoutError)).toBe(false);
	});

	it('valide que PARTITION_MAX_CHARS est configuré à 250 000 pour découper les gros RFPs', () => {
		expect(PARTITION_MAX_CHARS).toBe(250_000);
	});

	it('interrompt précocement (fast-fail) l\'étape 1 dès qu\'une erreur de quota survient et évite l\'étape 3a', async () => {
		let callCount = 0;
		const fakeLlm: LlmPort = {
			async chat() {
				callCount++;
				if (callCount === 1) {
					// Premier lot réussi
					return JSON.stringify({
						items: [
							{ ref: 'REQ-01', disposition: 'deliberate', reason: 'Tension résilience vs coût' },
							{ ref: 'REQ-02', disposition: 'commodity', reason: 'Produit du commerce' }
						]
					});
				}
				// Deuxième lot : erreur de quota / solde insuffisant
				throw new Error('Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing.');
			}
		};

		const clauses: ExtractedClause[] = [
			{ id: '1', clauseRef: 'REQ-01', text: 'Clause 1', title: 'Titre 1', criticality: 'majeur' },
			{ id: '2', clauseRef: 'REQ-02', text: 'Clause 2', title: 'Titre 2', criticality: 'info' },
			{ id: '3', clauseRef: 'REQ-03', text: 'Clause 3', title: 'Titre 3', criticality: 'majeur' },
			{ id: '4', clauseRef: 'REQ-04', text: 'Clause 4', title: 'Titre 4', criticality: 'info' },
			{ id: '5', clauseRef: 'REQ-05', text: 'Clause 5', title: 'Titre 5', criticality: 'majeur' },
			{ id: '6', clauseRef: 'REQ-06', text: 'Clause 6', title: 'Titre 6', criticality: 'info' }
		];

		const memoryCache = new Map<string, unknown>();
		const stageCache: StageCache = {
			async get(k) { return memoryCache.get(k); },
			async set(k, s, v) { memoryCache.set(k, v); }
		};

		// 6 clauses avec batch size 2 = 3 lots. Le lot 1 réussit, le lot 2 échoue pour quota.
		const res = await runRequirementsAudit(clauses, {
			llm: fakeLlm,
			model: 'claude-sonnet-test',
			classifyBatchSize: 2,
			cache: stageCache,
			concurrency: 1
		});

		expect(res.quotaExceeded).toBe(true);
		expect(res.status).toBe('partial');
		expect(res.subjects).toHaveLength(0); // L'étape 3a a été sautée
		expect(res.warnings.some((w) => w.includes('solde de crédits d\'API LLM insuffisant'))).toBe(true);

		// Les clauses classées du lot 1 sont bien en cache
		expect(memoryCache.size).toBeGreaterThanOrEqual(1);

		// Lors d'une relance sans erreur, le lot 1 est rechargé du cache (aucun appel LLM pour lui)
		let rerunCalls = 0;
		const secondLlm: LlmPort = {
			async chat() {
				rerunCalls++;
				return JSON.stringify({
					items: [
						{ ref: 'REQ-03', disposition: 'deliberate', reason: 'Choix de protocole' },
						{ ref: 'REQ-04', disposition: 'deliberate', reason: 'Contrainte de délai' }
					]
				});
			}
		};

		const rerun = await runRequirementsAudit(clauses.slice(0, 4), {
			llm: secondLlm,
			model: 'claude-sonnet-test',
			classifyBatchSize: 2,
			cache: stageCache,
			concurrency: 1
		});

		// Lot 1 était en cache, donc secondLlm n'a été appelé que pour le lot 2 (REQ-03 et REQ-04) + l'étape 3a/3b
		expect(rerun.report.deliberatedCount).toBeGreaterThanOrEqual(1);
	});

	it('computeFactorization positionne le statut "partial" avec message clair si quotaExceeded est levé', async () => {
		const spy = vi.spyOn(pipelineModule, 'runRequirementsAudit').mockResolvedValueOnce({
			status: 'partial',
			quotaExceeded: true,
			report: {
				totalCount: 4,
				evacuatedCount: 1,
				deliberatedCount: 1,
				clarificationCount: 0,
				toQualifyCount: 2,
				categoryDistribution: { FR: 2, NFR: 2, INT: 0, FAC: 0, BR: 0, DR: 0 },
				requirements: [],
				clarifications: [],
				warnings: ["Interruption précoce : solde de crédits d'API LLM insuffisant"]
			},
			subjects: [],
			warnings: ["Interruption précoce : solde de crédits d'API LLM insuffisant (credit balance is too low)."],
			modelUsed: 'claude-sonnet-5-5'
		});

		const req: FactorizeRequest = {
			clauses: [
				{ id: '1', clauseRef: 'REQ-01', text: 'Clause 1', title: 'Titre 1', criticality: 'majeur' },
				{ id: '2', clauseRef: 'REQ-02', text: 'Clause 2', title: 'Titre 2', criticality: 'info' },
				{ id: '3', clauseRef: 'REQ-03', text: 'Clause 3', title: 'Titre 3', criticality: 'majeur' },
				{ id: '4', clauseRef: 'REQ-04', text: 'Clause 4', title: 'Titre 4', criticality: 'info' }
			],
			projectType: 'project_rfp',
			model: 'claude-sonnet-5-5',
			forceAudit: true
		};

		const outcome = await computeFactorization(req, 'claude-sonnet-5-5', [], undefined);

		expect(outcome.runStatus).toBe('partial');
		expect(outcome.error).toContain('Solde de crédits d\'API LLM insuffisant');
		expect(outcome.body).toHaveProperty('isQuotaExceeded', true);

		spy.mockRestore();
	});
});

