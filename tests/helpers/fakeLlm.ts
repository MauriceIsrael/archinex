import { vi } from 'vitest';
import { localLlmClient } from '$lib/server/llm/localLlmClient';

export interface FakeLlmScenario {
	proposerArguments?: Array<{ optionId: string; claim: string; grounds: string; kbRefs?: string[] }>;
	challengerObjections?: Array<{ optionId: string; claim: string; grounds: string; kbRefs?: string[] }>;
	verifierVerifications?: Array<{ optionId: string; claim: string; grounds: string; kbRefs: string[] }>;
	syntheses?: Array<{ claim: string; grounds: string; kbRefs?: string[] }>;
}

/**
 * Configure un mock déterministe pour localLlmClient.chat
 */
export function setupFakeLlm(scenario: FakeLlmScenario = {}) {
	return vi.spyOn(localLlmClient, 'chat').mockImplementation(async (options: any) => {
		const messages = options.messages || [];
		const sysPrompt = messages.find((m: any) => m.role === 'system')?.content || '';

		if (sysPrompt.includes('Proposer')) {
			return JSON.stringify({
				arguments: scenario.proposerArguments || [
					{
						optionId: 'opt-mock-1',
						stance: 'support',
						claim: 'Adéquation éprouvée aux exigences de latence',
						grounds: 'Validation par benchmark interne confirmant < 5ms.',
						kbRefs: [],
						confidence: 'verified'
					}
				]
			});
		}

		if (sysPrompt.includes('Challenger')) {
			return JSON.stringify({
				objections: scenario.challengerObjections || [
					{
						optionId: 'opt-mock-1',
						targetArgumentId: null,
						stance: 'objection',
						claim: 'Surcoût d exploitation et dépendance matérielle',
						grounds: 'Le maintien en condition opérationnelle engendre un surcoût annuel significatif.',
						kbRefs: [],
						confidence: 'assumed'
					}
				]
			});
		}

		if (sysPrompt.includes('Verifier')) {
			return JSON.stringify({
				verifications: scenario.verifierVerifications || [
					{
						optionId: 'opt-mock-1',
						stance: 'verification',
						claim: 'Conformité avec les exigences de sécurité',
						grounds: 'Les algorithmes cryptographiques respectent les recommandations officielles.',
						kbRefs: ['sec-anssi-01'],
						confidence: 'verified'
					}
				]
			});
		}

		if (sysPrompt.includes('Synthesizer')) {
			return JSON.stringify({
				syntheses: scenario.syntheses || [
					{
						stance: 'synthesis',
						claim: 'Dilemme central : Coût vs Résilience déterministe',
						grounds: 'L arbitrage oppose le coût d acquisition matériel à la flexibilité logicielle.',
						kbRefs: [],
						confidence: 'assumed'
					}
				],
				questionsForHuman: [
					{
						text: 'Le comité valide-t-il le surcoût matériel pour garantir l isolation physique ?',
						assignedRole: 'lead_architect',
						blocking: true
					}
				]
			});
		}

		return JSON.stringify({ status: 'ok' });
	});
}
