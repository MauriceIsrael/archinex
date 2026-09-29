import { describe, it, expect } from 'vitest';
import {
	validateArgument,
	groupArgumentsByOption,
	countOpenObjections,
	canCloseObjection,
	type Argument
} from '$lib/domain/debate';

describe('Debate Arguments Domain Contract (Gate G3)', () => {
	const validAgentArg: Partial<Argument> = {
		claim: 'Consommation CPU excessive du plan de données',
		grounds: 'Le traitement DPI à 100 Gbps en user-space requiert 16 cœurs dédiés par nœud',
		stance: 'objection',
		kbRefs: ['sec-anssi-01'],
		author: 'challenger-agent',
		authorKind: 'agent:challenger',
		productionMode: 'llm-derived'
	};

	it('1. Valide un argument agent conforme', () => {
		const res = validateArgument(validAgentArg, ['sec-anssi-01', 'perf-02']);
		expect(res.valid).toBe(true);
	});

	it('2. Rejette impérativement un argument sans fondement (grounds vide)', () => {
		const res1 = validateArgument({
			...validAgentArg,
			grounds: ''
		});
		expect(res1.valid).toBe(false);
		expect(res1.reason).toMatch(/grounds/i);

		const res2 = validateArgument({
			...validAgentArg,
			grounds: '   '
		});
		expect(res2.valid).toBe(false);
	});

	it('3. Rejette un argument sans affirmation (claim vide)', () => {
		const res = validateArgument({
			...validAgentArg,
			claim: '  '
		});
		expect(res.valid).toBe(false);
		expect(res.reason).toMatch(/claim/i);
	});

	it('4. Rejette un kbRef inventé par l\'agent non présent dans la doctrine du sujet', () => {
		const res = validateArgument(
			{
				...validAgentArg,
				kbRefs: ['invented-rule-999']
			},
			['sec-anssi-01', 'perf-02']
		);
		expect(res.valid).toBe(false);
		expect(res.reason).toMatch(/invented-rule-999/);
	});

	it('5. Valide les contraintes de productionMode entre agent et humain', () => {
		// Agent avec human-authored -> Rejet
		const badAgent = validateArgument({
			...validAgentArg,
			productionMode: 'human-authored'
		});
		expect(badAgent.valid).toBe(false);
		expect(badAgent.reason).toMatch(/llm-derived/);

		// Humain avec llm-derived -> Rejet
		const badHuman = validateArgument({
			...validAgentArg,
			authorKind: 'human',
			productionMode: 'llm-derived'
		});
		expect(badHuman.valid).toBe(false);
		expect(badHuman.reason).toMatch(/human-authored/);

		// Humain avec human-authored -> Valide
		const goodHuman = validateArgument({
			...validAgentArg,
			authorKind: 'human',
			productionMode: 'human-authored'
		});
		expect(goodHuman.valid).toBe(true);
	});

	it('6. Regroupe correctement les arguments par optionId', () => {
		const args: Argument[] = [
			{
				id: 'arg-1',
				subjectId: 'subj-1',
				optionId: 'opt-a',
				stance: 'support',
				claim: 'Excellente intégration',
				grounds: 'Pilotes certifiés constructeur',
				kbRefs: [],
				confidence: 'verified',
				author: 'alice',
				authorKind: 'human',
				productionMode: 'human-authored',
				round: 1,
				resolution: 'open',
				version: 1
			},
			{
				id: 'arg-2',
				subjectId: 'subj-1',
				optionId: 'opt-a',
				stance: 'objection',
				claim: 'Coût excessif',
				grounds: 'Facturation à la socket prohibitive',
				kbRefs: [],
				confidence: 'assumed',
				author: 'challenger',
				authorKind: 'agent:challenger',
				productionMode: 'llm-derived',
				round: 1,
				resolution: 'open',
				version: 1
			},
			{
				id: 'arg-3',
				subjectId: 'subj-1',
				optionId: 'opt-b',
				stance: 'support',
				claim: 'Open source pérenne',
				grounds: 'Code audité sous licence Apache 2.0',
				kbRefs: [],
				confidence: 'assumed',
				author: 'proposer',
				authorKind: 'agent:proposer',
				productionMode: 'llm-derived',
				round: 1,
				resolution: 'open',
				version: 1
			},
			{
				id: 'arg-4',
				subjectId: 'subj-1',
				optionId: null,
				stance: 'synthesis',
				claim: 'Compromis coût vs support industriel',
				grounds: 'Deux paradigmes économiques opposés',
				kbRefs: [],
				confidence: 'assumed',
				author: 'synthesizer',
				authorKind: 'agent:synthesizer',
				productionMode: 'llm-derived',
				round: 1,
				resolution: 'open',
				version: 1
			}
		];

		const grouped = groupArgumentsByOption(args);
		expect(grouped.get('opt-a')?.length).toBe(2);
		expect(grouped.get('opt-b')?.length).toBe(1);
		expect(grouped.get(null)?.length).toBe(1);

		expect(countOpenObjections(args)).toBe(1);
	});

	it('7. Vérifie les permissions de clôture d\'une objection (Invariant III)', () => {
		// Agent ne peut jamais clore
		expect(canCloseObjection('lead_architect', false)).toBe(false);
		// Viewer humain ne peut pas clore
		expect(canCloseObjection('viewer', true)).toBe(false);
		// Expert humain ou Lead Architect peuvent clore
		expect(canCloseObjection('domain_expert', true)).toBe(true);
		expect(canCloseObjection('lead_architect', true)).toBe(true);
	});
});
