import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runVerifierAgent, runVerifierAgentWithStatus } from '$lib/server/agents/verifier';
import { runProposerWithProposal } from '$lib/server/agents/proposer';
import { localLlmClient } from '$lib/server/llm/localLlmClient';
import { FALLBACK_PREFIX, INTERACTIVE_AGENT_TIMEOUT_MS } from '$lib/server/agents/agentConfig';
import type { Option, Criterion } from '$lib/domain/options';

const sampleOptions: Option[] = [
	{
		id: 'opt-mesh',
		subjectId: 'sub-1',
		title: 'Service Mesh Chiffré',
		summary: 'Isolation mTLS de bout en bout entre microservices',
		origin: 'human',
		author: 'Architecte',
		role: 'lead_architect',
		productionMode: 'human-authored',
		status: 'proposed',
		kbRefs: [],
		version: 1
	},
	{
		id: 'opt-gateway',
		subjectId: 'sub-1',
		title: 'Passerelle Périmétrique',
		summary: 'Filtrage centralisé en entrée de zone',
		origin: 'human',
		author: 'Architecte',
		role: 'lead_architect',
		productionMode: 'human-authored',
		status: 'proposed',
		kbRefs: [],
		version: 1
	}
];

const sampleCriteria: Criterion[] = [
	{
		id: 'crit-sec',
		subjectId: 'sub-1',
		name: 'Sécurité',
		kind: 'nfr',
		weight: 5,
		description: 'Niveau de cloisonnement',
		author: 'Architecte',
		role: 'lead_architect',
		productionMode: 'human-authored',
		version: 1
	}
];

describe('Agents interactifs : Verifier & Proposer (repli déterministe, résolution optionId, budget)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('runVerifierAgent utilise effort=medium et INTERACTIVE_AGENT_TIMEOUT_MS', async () => {
		const chatSpy = vi.spyOn(localLlmClient, 'chat').mockResolvedValue(
			JSON.stringify({
				verifications: [
					{
						optionId: 'opt-mesh',
						stance: 'verification',
						claim: 'Conformité mTLS vérifiée',
						grounds: 'Le chiffrement mutuel couvre la règle SEC-01.',
						kbRefs: ['SEC-01'],
						confidence: 'verified'
					}
				]
			})
		);

		const res = await runVerifierAgent({
			subject: { id: 'sub-1', name: 'Cloisonnement', sectionRef: '§3.1' },
			options: sampleOptions,
			allowedKbRefs: ['SEC-01'],
			doctrine: [{ id: 'SEC-01', title: 'Chiffrement inter-services', relevant: true }],
			round: 1
		});

		expect(chatSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				effort: 'medium',
				timeoutMs: INTERACTIVE_AGENT_TIMEOUT_MS,
				format: 'json'
			})
		);
		expect(res).toHaveLength(1);
		expect(res[0].optionId).toBe('opt-mesh');
		expect(res[0].stance).toBe('verification');
	});

	it('runVerifierAgent résout optionId via le titre d’option si le modèle renvoie le titre au lieu de l’ID', async () => {
		vi.spyOn(localLlmClient, 'chat').mockResolvedValue(
			JSON.stringify({
				verifications: [
					{
						optionId: 'Service Mesh Chiffré',
						stance: 'verification',
						claim: 'Option conforme à la doctrine',
						grounds: 'Respecte les exigences de chiffrement en transit.',
						kbRefs: ['SEC-01'],
						confidence: 'verified'
					}
				]
			})
		);

		const res = await runVerifierAgent({
			subject: { id: 'sub-1', name: 'Cloisonnement', sectionRef: '§3.1' },
			options: sampleOptions,
			allowedKbRefs: ['SEC-01'],
			round: 1
		});

		expect(res).toHaveLength(1);
		expect(res[0].optionId).toBe('opt-mesh');
	});

	it('runVerifierAgent renvoie un verdict structuré (compliant/violates/not_applicable/unknown) et supporte ruleId/evidence (#384)', async () => {
		vi.spyOn(localLlmClient, 'chat').mockResolvedValue(
			JSON.stringify({
				verifications: [
					{
						optionId: 'opt-gateway',
						stance: 'verification',
						verdict: 'violates',
						ruleId: 'SEC-01',
						evidence: 'Absence de chiffrement mTLS est-ouest entre microservices.',
						claim: 'Non-conformité SEC-01',
						confidence: 'designed'
					}
				]
			})
		);

		const res = await runVerifierAgentWithStatus({
			subject: { id: 'sub-1', name: 'Cloisonnement', sectionRef: '§3.1' },
			options: sampleOptions,
			allowedKbRefs: ['SEC-01'],
			round: 1
		});

		expect(res.status).toBe('evaluated');
		expect(res.arguments).toHaveLength(1);
		expect(res.arguments[0].verdict).toBe('violates');
		expect(res.arguments[0].kbRefs).toEqual(['SEC-01']);
		expect(res.arguments[0].grounds).toContain('mTLS');
	});

	it('runVerifierAgent émet un état not_evaluated (aucun argument fabriqué) si le filtrage élimine tous les items LLM (#384)', async () => {
		vi.spyOn(localLlmClient, 'chat').mockResolvedValue(
			JSON.stringify({
				verifications: [
					{
						optionId: 'opt-inconnue',
						stance: 'verification',
						verdict: 'compliant',
						claim: 'Constat invalide',
						grounds: 'Référence hallucinée non présente dans allowedKbRefs.',
						kbRefs: ['RULE-HALLUCINEE'],
						confidence: 'assumed'
					}
				]
			})
		);

		const statusRes = await runVerifierAgentWithStatus({
			subject: { id: 'sub-1', name: 'Cloisonnement', sectionRef: '§3.1' },
			options: sampleOptions,
			allowedKbRefs: ['SEC-01'],
			round: 1
		});

		expect(statusRes.status).toBe('not_evaluated');
		expect(statusRes.arguments).toEqual([]);
	});

	it('runVerifierAgent émet not_evaluated sans argument sur sortie JSON invalide ou modèle indisponible (#384)', async () => {
		vi.spyOn(localLlmClient, 'chat').mockResolvedValue('not-json-at-all');
		const invalidJsonRes = await runVerifierAgentWithStatus({
			subject: { id: 'sub-1', name: 'Cloisonnement', sectionRef: '§3.1' },
			options: sampleOptions,
			allowedKbRefs: ['SEC-01'],
			round: 1
		});
		expect(invalidJsonRes.status).toBe('not_evaluated');
		expect(invalidJsonRes.arguments).toEqual([]);

		vi.spyOn(localLlmClient, 'chat').mockRejectedValue(new Error('ECONNREFUSED'));
		const offlineRes = await runVerifierAgentWithStatus({
			subject: { id: 'sub-1', name: 'Cloisonnement', sectionRef: '§3.1' },
			options: sampleOptions,
			allowedKbRefs: ['SEC-01'],
			round: 1
		});
		expect(offlineRes.status).toBe('not_evaluated');
		expect(offlineRes.arguments).toEqual([]);
	});

	it('runProposerWithProposal bascule sur le repli déterministe si tous les optionId LLM sont inconnus', async () => {
		vi.spyOn(localLlmClient, 'chat').mockResolvedValue(
			JSON.stringify({
				arguments: [
					{
						optionId: 'opt-inexistante',
						stance: 'support',
						claim: 'Soutien hors option',
						grounds: 'Option introuvable dans la liste fournie.',
						kbRefs: [],
						confidence: 'assumed'
					}
				]
			})
		);

		const res = await runProposerWithProposal({
			subject: { id: 'sub-1', name: 'Cloisonnement', sectionRef: '§3.1' },
			options: sampleOptions,
			criteria: sampleCriteria,
			allowedKbRefs: ['SEC-01'],
			round: 1
		});

		expect(res.arguments.length).toBe(sampleOptions.length);
		expect(res.arguments[0].claim.startsWith(FALLBACK_PREFIX)).toBe(true);
	});
});
