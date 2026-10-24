import { describe, it, expect } from 'vitest';
import { buildHldFragment, renderHldFragmentMarkdown, type HldFragmentInput } from '$lib/domain/hldFragment';

const base = (): HldFragmentInput => ({
	subject: {
		id: 'sub-1',
		sectionRef: '§2.1',
		name: 'Topologie des datacenters',
		problemStatement: 'Comment tenir 99,99 % de disponibilité avec deux sites ?',
		nature: 'architecture',
		maturityLevel: 'L3_decided',
		deliberationStatus: 'arbitrated'
	},
	dependsOn: [{ id: 'sub-0', name: 'Choix des sites', maturityLevel: 'L1_framed' }],
	requirementRefs: ['SRC-abcd1234:3.1', 'SRC-abcd1234:9.9'],
	requirements: [{ id: 'SRC-abcd1234:3.1', clauseRef: '3.1', title: 'Disponibilité', criticality: 'bloquant' }],
	requirementsDossierPresent: true,
	criteria: [
		{ id: 'c1', subjectId: 'sub-1', name: 'Disponibilité', description: '', kind: 'nfr', weight: 5, author: 'm', role: 'lead_architect', productionMode: 'llm-derived', version: 1 },
		{ id: 'c2', subjectId: 'sub-1', name: 'Coût', description: '', kind: 'nfr', weight: 3, author: 'm', role: 'lead_architect', productionMode: 'human-authored', version: 1 }
	],
	options: [
		{ id: 'o1', subjectId: 'sub-1', title: 'Actif-actif', summary: 'Deux sites actifs', origin: 'llm-proposed', kbRefs: [], status: 'retained', author: 'm', role: 'x', productionMode: 'llm-derived', version: 1 },
		{ id: 'o2', subjectId: 'sub-1', title: 'Actif-passif', summary: 'Bascule', origin: 'human', kbRefs: [], status: 'rejected', author: 'h', role: 'x', productionMode: 'human-authored', version: 1 }
	] as any,
	evaluations: [
		{ optionId: 'o1', criterionId: 'c1', score: 2, justification: 'Pas de bascule', evidenceRefs: [], author: 'm', role: 'x', productionMode: 'llm-derived' },
		{ optionId: 'o1', criterionId: 'c2', score: -1, justification: 'Double capacité', evidenceRefs: [], author: 'm', role: 'x', productionMode: 'llm-derived' }
	],
	arguments: [
		{ id: 'a1', subjectId: 'sub-1', stance: 'objection', claim: 'Latence inter-sites', grounds: '', kbRefs: [], confidence: 'assumed', author: 'x', authorKind: 'human', productionMode: 'human-authored', round: 1, resolution: 'accepted_risk', version: 1, createdAt: '' },
		{ id: 'a2', subjectId: 'sub-1', stance: 'question', claim: 'Quel RPO ?', grounds: '', kbRefs: [], confidence: 'assumed', author: 'x', authorKind: 'human', productionMode: 'human-authored', round: 1, resolution: 'open', version: 1, createdAt: '' }
	] as any,
	decision: {
		id: 'd1',
		subjectId: 'sub-1',
		retainedOptionId: 'o1',
		rejected: [{ optionId: 'o2', reason: 'La bascule consomme le budget d’indisponibilité.' }],
		rationale: 'Seul l’actif-actif tient les quatre neuf.',
		reversibility: 'costly',
		arbiterId: 'lead',
		arbiterRole: 'lead_architect',
		decidedAt: '2026-10-11T10:00:00.000Z',
		acceptedViolations: [],
		kbCandidateIds: []
	},
	generatedAt: '2026-10-11T12:00:00.000Z'
});

describe('Fragment de HLD construit depuis la délibération', () => {
	it('reprend décision, options, exigences et provenance sans rien inventer', () => {
		const f = buildHldFragment(base());
		expect(f.status).toBe('decided');
		expect(f.options.find((o) => o.id === 'o1')).toMatchObject({ status: 'retained', proposedByModel: true, weightedScore: 0.88 });
		expect(f.options.find((o) => o.id === 'o2')).toMatchObject({ status: 'rejected', proposedByModel: false });
		expect(f.requirements.items.map((r) => r.clauseRef)).toEqual(['3.1']);
		expect(f.requirements.unresolvedRefs).toEqual(['SRC-abcd1234:9.9']);
		expect(f.context.dependsOn).toEqual(['Choix des sites (non tranché)']);
		expect(f.decision?.yStatement).toContain('nous avons retenu « Actif-actif » plutôt que « Actif-passif »');
		expect(f.decision?.yStatement).toContain('en acceptant le risque « Latence inter-sites »');
		expect(f.openPoints).toEqual(['Question ouverte : Quel RPO ?']);
		expect(f.provenance).toEqual({ modelProposedOptions: 1, humanOptions: 1, modelEvaluations: 2, humanEvaluations: 0 });
	});

	it('une décision d\'un autre architecte que le Lead reste « en revue »', () => {
		const input = base();
		input.subject.maturityLevel = 'L2_decomposed';
		input.subject.deliberationStatus = 'awaiting_review';
		expect(buildHldFragment(input).status).toBe('awaiting_review');
	});

	it('sans décision, le fragment montre la délibération sans conclure', () => {
		const input = base();
		input.decision = null;
		const f = buildHldFragment(input);
		expect(f.status).toBe('undecided');
		expect(f.decision).toBeUndefined();
		expect(renderHldFragmentMarkdown(f)).toContain('_Sujet non tranché._');
	});

	it('le Markdown suit le gabarit ADR : contexte, exigences, critères, options, décision', () => {
		const md = renderHldFragmentMarkdown(buildHldFragment(base()));
		const order = ['### Contexte et problème', '### Exigences couvertes', '### Critères de décision', '### Options étudiées', '### Décision'].map((h) => md.indexOf(h));
		expect(order.every((i) => i >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		expect(md).toContain('| 3.1 | Disponibilité | bloquant |');
	});
	it('dédoublonne les points ouverts, exigences et risques acceptés pour éviter les clés en double', () => {
		const input = base();
		input.requirementRefs = ['SRC-abcd1234:3.1', 'SRC-abcd1234:3.1'];
		input.arguments = [
			{ id: 'a1', subjectId: 'sub-1', stance: 'objection', claim: 'Latence inter-sites', grounds: '', kbRefs: [], confidence: 'assumed', author: 'x', authorKind: 'human', productionMode: 'human-authored', round: 1, resolution: 'accepted_risk', version: 1, createdAt: '' },
			{ id: 'a2', subjectId: 'sub-1', stance: 'objection', claim: 'Latence inter-sites', grounds: '', kbRefs: [], confidence: 'assumed', author: 'y', authorKind: 'human', productionMode: 'human-authored', round: 2, resolution: 'accepted_risk', version: 1, createdAt: '' },
			{ id: 'a3', subjectId: 'sub-1', stance: 'question', claim: 'Proposition de découpage du sujet pour lever la stagnation', grounds: '', kbRefs: [], confidence: 'assumed', author: 'agent', authorKind: 'llm', productionMode: 'llm-derived', round: 1, resolution: 'open', version: 1, createdAt: '' },
			{ id: 'a4', subjectId: 'sub-1', stance: 'question', claim: 'Proposition de découpage du sujet pour lever la stagnation', grounds: '', kbRefs: [], confidence: 'assumed', author: 'agent', authorKind: 'llm', productionMode: 'llm-derived', round: 2, resolution: 'open', version: 1, createdAt: '' }
		] as any;
		input.coverageWarnings = ['Avertissement 1', 'Avertissement 1'];

		const f = buildHldFragment(input);
		expect(f.openPoints).toEqual(['Question ouverte : Proposition de découpage du sujet pour lever la stagnation']);
		expect(f.consequences.acceptedRisks).toEqual(['Latence inter-sites']);
		expect(f.consequences.coverageWarnings).toEqual(['Avertissement 1']);
		expect(f.requirements.items.length).toBe(1);
	});
});