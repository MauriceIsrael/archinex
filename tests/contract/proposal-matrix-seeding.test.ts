import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { localLlmClient } from '$lib/server/llm/localLlmClient';
import { factorizeRfpWithLocalLlm } from '$lib/server/llm/rfpFactorizer';
import { runProposerWithProposal } from '$lib/server/agents/proposer';
import { seedSubjectProposal } from '$lib/server/projects/proposalSeeder';
import { listCriteria, listEvaluations, listOptions } from '$lib/server/projects/optionsDb';

describe('Proposal Matrix Seeding (Direct Factorization & @proposer)', () => {
	const testProjectId = 'test-proj-proposal-matrix-1';
	const testSubjectId = 'test-subj-proposal-matrix-1';

	beforeEach(async () => {
		vi.restoreAllMocks();
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	it('factorizeRfpWithLocalLlm normalizes and attaches proposal on subjects in direct pass', async () => {
		vi.spyOn(localLlmClient, 'chat').mockResolvedValueOnce(
			JSON.stringify({
				summary: 'Synthèse test.',
				subjects: [
					{
						id: 'SUBJ-01',
						lotId: 'LOT-07-DATA',
						name: 'Stratégie de fusion de données : Centralisée vs Pré-fusion',
						sectionRef: 'REQ-10',
						coveredClauseRefs: ['REQ-10'],
						matchedKbItemIds: [],
						knowledgeAlignment: 'novel_requirement',
						alignmentRationale: 'Arbitrage d’architecture.',
						initialLevel: 'L1_dilemma',
						waitingForRole: 'lead_architect',
						effort: 'M',
						seed: {
							initialRetenu: ['[REQ-10] Corrélation multi-sources'],
							initialHypothesis: 'Centraliser la fusion',
							initialConflict: 'Latence vs Gouvernance',
							initialQuestion: 'Où exécuter la fusion ?'
						},
						proposal: {
							options: [
								{ title: 'Fusion centralisée', summary: 'Moteur unique côté serveur.' },
								{ title: 'Pré-fusion en bordure', summary: 'Agrégation préalable par source.' }
							],
							singleOptionRationale: null,
							criteria: [
								{ name: 'Traçabilité', kind: 'compliance', weight: 5, description: 'Auditabilité des sources brutes.' },
								{ name: 'Latence', kind: 'nfr', weight: 4, description: 'Temps de traitement bout-en-bout.' }
							],
							evaluations: [
								{ option: 'Fusion centralisée', criterion: 'Traçabilité', score: 2, justification: 'Conservation brute.' },
								{ option: 'Pré-fusion en bordure', criterion: 'Latence', score: 1, justification: 'Moins de volume transporté.' },
								{ option: 'Option inexistante', criterion: 'Latence', score: 2, justification: 'Doit être filtrée.' }
							]
						}
					}
				]
			})
		);

		const res = await factorizeRfpWithLocalLlm({
			model: 'claude-sonnet-5-5',
			clauses: [
				{
					id: 'c1',
					clauseRef: 'REQ-10',
					title: 'Corrélation multi-sources',
					text: 'Le système doit corréler plusieurs flux hétérogènes.',
					criticality: 'majeur'
				}
			]
		});

		expect(res.status).toBe('ok');
		expect(res.subjects).toHaveLength(1);
		const proposal = res.subjects[0].proposal;
		expect(proposal).toBeDefined();
		expect(proposal!.options.map((o) => o.title)).toEqual(['Fusion centralisée', 'Pré-fusion en bordure']);
		expect(proposal!.criteria.map((c) => c.name)).toEqual(['Traçabilité', 'Latence']);
		expect(proposal!.evaluations).toHaveLength(2);
	});

	it('runProposerWithProposal returns both arguments and normalized proposal when options are empty', async () => {
		vi.spyOn(localLlmClient, 'chat').mockResolvedValueOnce(
			JSON.stringify({
				arguments: [
					{
						optionId: null,
						stance: 'support',
						claim: 'Deux options contrastées identifiées',
						grounds: 'Centralisé vs distribué selon les contraintes de latence.',
						kbRefs: [],
						confidence: 'designed'
					}
				],
				proposal: {
					options: [
						{ title: 'Architecture A', summary: 'Approche centralisée.' },
						{ title: 'Architecture B', summary: 'Approche distribuée.' }
					],
					singleOptionRationale: null,
					criteria: [{ name: 'Maintenabilité', kind: 'nfr', weight: 4, description: 'Simplicité d’exploitation.' }],
					evaluations: [
						{ option: 'Architecture A', criterion: 'Maintenabilité', score: 2, justification: 'Déploiement unique.' },
						{ option: 'Architecture B', criterion: 'Maintenabilité', score: -1, justification: 'Plusieurs nœuds à opérer.' }
					]
				}
			})
		);

		const result = await runProposerWithProposal({
			subject: { id: 's1', name: 'Arbitrage A vs B', sectionRef: '§1.1' },
			options: [],
			criteria: [],
			allowedKbRefs: [],
			round: 1
		});

		expect(result.arguments).toHaveLength(1);
		expect(result.arguments[0].authorKind).toBe('agent:proposer');
		expect(result.proposal).toBeDefined();
		expect(result.proposal!.options).toHaveLength(2);
		expect(result.proposal!.criteria).toHaveLength(1);
		expect(result.proposal!.evaluations).toHaveLength(2);
	});

	it('seedSubjectProposal materializes options/criteria/evaluations without duplicating existing criteria', async () => {
		await prisma.project.create({
			data: {
				id: testProjectId,
				title: 'Test Proposal Matrix',
				shortName: 'TPM',
				type: 'rfp',
				badge: 'TEST',
				description: 'Test',
				status: 'active',
				strategy: 'test'
			}
		});
		await prisma.subject.create({
			data: {
				id: testSubjectId,
				projectId: testProjectId,
				sectionRef: '§1.1',
				name: 'Sujet test',
				domain: 'general',
				problemStatement: 'Test',
				maturityLevel: 'L1_dilemma',
				deliberationStatus: 'open',
				waitingForRole: 'lead_architect',
				relativeEffort: 'M'
			}
		});

		await seedSubjectProposal(testSubjectId, {
			options: [{ title: 'Option 1', summary: 'Résumé 1' }],
			criteria: [{ name: 'Coût', kind: 'cost', weight: 3, description: 'TCO' }],
			evaluations: [{ option: 'Option 1', criterion: 'Coût', score: 1, justification: 'Maîtrisé' }]
		});

		// Second call with overlapping criterion name should reuse existing criterion
		await seedSubjectProposal(testSubjectId, {
			options: [{ title: 'Option 2', summary: 'Résumé 2' }],
			criteria: [{ name: 'coût', kind: 'cost', weight: 3, description: 'TCO' }],
			evaluations: [{ option: 'Option 2', criterion: 'coût', score: -1, justification: 'Plus élevé' }]
		});

		const [opts, crits, evals] = await Promise.all([
			listOptions(testSubjectId),
			listCriteria(testSubjectId),
			listEvaluations(testSubjectId)
		]);
		expect(opts).toHaveLength(2);
		expect(opts.every((o) => o.origin === 'llm-proposed')).toBe(true);
		expect(crits).toHaveLength(1);
		expect(evals).toHaveLength(2);
	});
});
