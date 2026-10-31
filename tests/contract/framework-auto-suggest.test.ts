import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';
import {
	suggestRequirementLinksLocal,
	autoEnrichFrameworkIngestion,
	matchTopicPattern,
	generateFallbackProposal
} from '../../src/lib/server/frameworks/frameworkEnricher';
import type { FrameworkRequirement } from '../../src/lib/types/llmops';

describe('Contract: Framework Ingestion Auto-Enrichment & Local Suggestion (Issue #93 & #99)', () => {
	let fakeLlmops: FakeLlmopsServer;
	let client: LLMOpsClient;

	beforeAll(async () => {
		fakeLlmops = await startFakeLlmopsServer();
		client = new LLMOpsClient({
			baseUrl: fakeLlmops.url,
			authToken: 'test-token-auto-suggest'
		});
	});

	afterAll(async () => {
		await fakeLlmops.close();
	});

	it('1. matchTopicPattern identifie correctement les thématiques réglementaires (CRA / NIS2)', () => {
		const vulnText = 'A manufacturer shall notify any actively exploited vulnerability to CSIRT within 24 hours';
		const matchedVuln = matchTopicPattern(vulnText);
		expect(matchedVuln).not.toBeNull();
		expect(matchedVuln?.triggers).toContain('vulnerability');

		const sbomText = 'Draw up a software bill of materials covering top-level dependencies';
		const matchedSbom = matchTopicPattern(sbomText);
		expect(matchedSbom).not.toBeNull();
		expect(matchedSbom?.triggers).toContain('sbom');

		const cryptoText = 'Protect confidentiality of stored and transmitted data by encrypting at rest and in transit';
		const matchedCrypto = matchTopicPattern(cryptoText);
		expect(matchedCrypto).not.toBeNull();
		expect(matchedCrypto?.triggers).toContain('encryption');
	});

	it('2. generateFallbackProposal produit des propositions complètes avec critères d’acceptation et liens valides', () => {
		const req: FrameworkRequirement = {
			id: 'CRA-ANXI-PI-2E',
			framework_id: 'CRA',
			section: 'Annex I, Part I, point (2)(e)',
			title: 'Data confidentiality and encryption',
			text: 'protect the confidentiality of stored, transmitted or otherwise processed data, personal or other, such as by encrypting relevant data at rest or in transit',
			domain: 'security',
			status: 'pending',
			mapped_assets: []
		};

		const knownIds = new Set(['P-001', 'P-005', 'PAT-003']);
		const proposal = generateFallbackProposal(req, knownIds);

		expect(proposal.requirement_id).toBe('CRA-ANXI-PI-2E');
		expect(proposal.satisfied_by.length).toBeGreaterThan(0);
		expect(proposal.satisfied_by).toContain('P-005');
		expect(proposal.acceptance_criteria.length).toBeGreaterThanOrEqual(2);
		expect(proposal.acceptance_criteria[0]).toMatch(/chiffr/i);
		expect(proposal.title_fr).toBeDefined();
		expect(proposal.terms).toBeDefined();
	});

	it('3. suggestRequirementLinksLocal produit des suggestions locales étiquetées llm-derived sans 404', async () => {
		// Mock local LLM qui renvoie une réponse JSON
		const mockLlm: any = {
			chat: async () =>
				JSON.stringify({
					suggested_assets: [
						{ asset_id: 'P-001', title: 'Generalized GitOps', confidence: 0.95, rationale: 'Traçabilité et automatisation' }
					],
					acceptance_criteria: [
						"Les configurations de sécurité doivent être tracées sous contrôle de version.",
						"Aucun déploiement manuel en production n'est autorisé."
					]
				})
		};

		const res = await suggestRequirementLinksLocal(
			'ing-nis2-01',
			'req-nis2-01',
			'expert@archinex.local',
			mockLlm,
			client
		);

		expect(res.llm_derived).toBe(true);
		expect(res.suggested_assets.length).toBeGreaterThan(0);
		expect(res.suggested_assets[0].asset_id).toBe('P-001');
		expect(res.suggested_assets[0].confidence).toBe(0.95);
		expect(res.acceptance_criteria).toBeDefined();
		expect(res.acceptance_criteria!.length).toBe(2);
	});

	it('4. suggestRequirementLinksLocal bascule sur le repli déterministe si le LLM local échoue', async () => {
		// Mock LLM qui échoue (ex: LLM offline ou timeout)
		const failingLlm: any = {
			chat: async () => {
				throw new Error('Connexion refusée sur http://localhost:11434');
			}
		};

		const res = await suggestRequirementLinksLocal(
			'ing-nis2-01',
			'req-nis2-01',
			'expert@archinex.local',
			failingLlm,
			client
		);

		expect(res.llm_derived).toBe(true);
		expect(res.suggested_assets).toBeDefined();
		expect(res.suggested_assets.length).toBeGreaterThan(0);
		expect(res.acceptance_criteria).toBeDefined();
		expect(res.acceptance_criteria!.length).toBeGreaterThan(0);
	});

	it('5. autoEnrichFrameworkIngestion enrichit l’ensemble des exigences et dépose les propositions dans LLMOps', async () => {
		const reqs: FrameworkRequirement[] = [
			{
				id: 'CRA-ART14-1',
				framework_id: 'CRA',
				section: 'Article 14(1)',
				title: 'Actively exploited vulnerability notification',
				text: 'A manufacturer shall notify any actively exploited vulnerability to CSIRT within 24 hours',
				domain: 'security',
				status: 'pending',
				mapped_assets: []
			},
			{
				id: 'CRA-ANXI-PII-1',
				framework_id: 'CRA',
				section: 'Annex I, Part II, point (1)',
				title: 'Software bill of materials',
				text: 'draw up a software bill of materials in a commonly used and machine-readable format',
				domain: 'security',
				status: 'pending',
				mapped_assets: []
			}
		];

		const mockLlm: any = {
			chat: async () => {
				throw new Error('Repli déterministe testé');
			}
		};

		const result = await autoEnrichFrameworkIngestion(
			'ing-nis2-01',
			reqs,
			'CRA',
			'expert@archinex.local',
			mockLlm,
			client
		);

		expect(result.count).toBe(2);
		expect(result.updated).toBeGreaterThanOrEqual(1);
	});
});
