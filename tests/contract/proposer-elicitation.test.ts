import { describe, it, expect, vi } from 'vitest';
import { runProposerAgent } from '$lib/server/agents/proposer';

describe('Proposer Agent Contract - Cadrage & Décomposition', () => {
	it('répond avec 2 options de cadrage même si le sujet a 0 option formalisée', async () => {
		const results = await runProposerAgent({
			subject: {
				id: 'sub-test-1',
				name: 'Architecture Centralisée SOC/NOC',
				sectionRef: '§1.2'
			},
			options: [],
			criteria: [],
			allowedKbRefs: ['KB-01-SECOPS'],
			round: 1
		});

		expect(results).toBeDefined();
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].authorKind).toBe('agent:proposer');
		expect(results[0].stance).toBe('support');
		expect(results[0].grounds).toContain('options');
	});

	it('traite une consigne de scission/split (NOC vs SOC) et propose la décomposition adéquate', async () => {
		const results = await runProposerAgent({
			subject: {
				id: 'sub-test-noc-soc',
				name: 'Architecture Centralisée SOC/NOC avec Zéro-Trust',
				sectionRef: '§1.2'
			},
			options: [],
			criteria: [],
			allowedKbRefs: ['KB-01-SECOPS'],
			round: 1,
			contextPrompt: 'Dans notre cas le NOC et le SOC doivent être vus comme des salles d\'opérations distinctes, peux-tu splitter le problème en 2 sujets ?'
		});

		expect(results).toBeDefined();
		expect(results.length).toBeGreaterThan(0);
		const arg = results[0];
		expect(arg.authorKind).toBe('agent:proposer');
		// Le fallback ou le LLM doit orienter vers le découpage NOC vs SOC et mentionner la scission
		expect(arg.grounds.toLowerCase()).toMatch(/noc|soc|salle|scind/);
	});
});
