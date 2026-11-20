import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runVerifierAgent } from '$lib/server/agents/verifier';
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

	it('runVerifierAgent bascule sur le repli déterministe si le filtrage optionId/kbRefs élimine tous les items LLM', async () => {
		vi.spyOn(localLlmClient, 'chat').mockResolvedValue(
			JSON.stringify({
				verifications: [
					{
						optionId: 'opt-inconnue',
						stance: 'verification',
						claim: 'Constat invalide',
						grounds: 'Référence hallucinée non présente dans allowedKbRefs.',
						kbRefs: ['RULE-HALLUCINEE'],
						confidence: 'assumed'
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

		expect(res.length).toBeGreaterThan(0);
		expect(res[0].claim.startsWith(FALLBACK_PREFIX)).toBe(true);
		expect(res[0].kbRefs).toEqual(['SEC-01']);
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
