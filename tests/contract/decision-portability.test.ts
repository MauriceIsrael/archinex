import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { CreateDecisionSchema } from '$lib/schemas/decisionApiSchemas';
import { recordDecisionInHub, type DecisionRow } from '$lib/server/projects/hubDecisions';
import type { LLMOpsClient } from '$lib/server/llmops/client';
import { recordArbitrationDecision, getSubjectArbitrationContext } from '$lib/server/projects/arbitrationDb';

describe('Portabilité des Décisions & Filtrage du Moissonnage (#120)', () => {
	describe('Validation Zod (CreateDecisionSchema)', () => {
		it('utilise project_specific comme valeur par défaut si non précisé', () => {
			const parsed = CreateDecisionSchema.safeParse({
				retainedOptionId: 'opt-1',
				rejected: [],
				rationale: 'Motivation substantielle pour arbitrage.',
				reversibility: 'reversible'
			});

			expect(parsed.success).toBe(true);
			if (parsed.success) {
				expect(parsed.data.portability).toBe('project_specific');
			}
		});

		it('accepte les 3 valeurs valides de portabilité', () => {
			const values = [
				'project_specific',
				'reusable_product_capability',
				'reusable_architecture_doctrine'
			] as const;

			for (const val of values) {
				const parsed = CreateDecisionSchema.safeParse({
					retainedOptionId: 'opt-1',
					rejected: [],
					rationale: 'Motivation substantielle pour arbitrage.',
					reversibility: 'costly',
					portability: val
				});

				expect(parsed.success).toBe(true);
				if (parsed.success) {
					expect(parsed.data.portability).toBe(val);
				}
			}
		});

		it('refuse une valeur de portabilité invalide', () => {
			const parsed = CreateDecisionSchema.safeParse({
				retainedOptionId: 'opt-1',
				rejected: [],
				rationale: 'Motivation substantielle pour arbitrage.',
				reversibility: 'costly',
				portability: 'unknown_portability' as any
			});

			expect(parsed.success).toBe(false);
		});
	});

	describe('Persistance et Round-trip en Base de Données', () => {
		const testProjectId = 'test-proj-portability-120';
		const testSubjectId = 'sub-portability-120';
		const testOptionId = 'opt-portability-120';

		beforeAll(async () => {
			await prisma.project.deleteMany({ where: { id: testProjectId } });
			await prisma.project.create({
				data: {
					id: testProjectId,
					title: 'Projet Test Portabilité',
					shortName: 'proj-port-120',
					type: 'project_rfp',
					badge: 'A120',
					description: 'Test round-trip portabilité'
				}
			});

			await prisma.subject.create({
				data: {
					id: testSubjectId,
					projectId: testProjectId,
					sectionRef: '§1',
					name: 'Stockage & Persistance',
					problemStatement: 'Quelle stratégie de stockage persistant pour le cluster ?',
					maturityLevel: 'L2_decomposed',
					singleOptionRationale: 'Choix standard imposé par le catalogue'
				}
			});

			await prisma.criterion.create({
				data: {
					id: 'crit-portability-120',
					subjectId: testSubjectId,
					name: 'Résilience & IOPS',
					description: 'Tenue en charge',
					kind: 'technical',
					weight: 1,
					author: 'lead@example.com',
					productionMode: 'human-authored',
					version: 1
				}
			});

			await prisma.option.create({
				data: {
					id: testOptionId,
					subjectId: testSubjectId,
					title: 'Option Ceph Managé',
					summary: 'Ceph cluster sur bare-metal',
					origin: 'human',
					author: 'lead_architect',
					productionMode: 'human-authored',
					kbRefs: '[]'
				}
			});

			await prisma.optionEvaluation.create({
				data: {
					id: 'eval-portability-120',
					optionId: testOptionId,
					criterionId: 'crit-portability-120',
					score: 2,
					justification: 'Très haute résilience distribuée sans SPOF.',
					author: 'lead@example.com',
					productionMode: 'human-authored',
					version: 1
				}
			});
		});

		afterAll(async () => {
			await prisma.project.deleteMany({ where: { id: testProjectId } });
		});

		it('enregistre et restitue la portabilité reusable_product_capability', async () => {
			await recordArbitrationDecision(
				testSubjectId,
				{
					retainedOptionId: testOptionId,
					rejected: [],
					rationale: 'Arbitrage pour capacité produit standard.',
					reversibility: 'costly',
					portability: 'reusable_product_capability',
					complianceStatus: 'Compliant'
				},
				{ userId: 'lead@example.com', role: 'lead_architect', productionMode: 'human-authored' }
			);

			const ctx = await getSubjectArbitrationContext(testSubjectId);
			expect(ctx.decision).toBeDefined();
			expect(ctx.decision?.portability).toBe('reusable_product_capability');
			expect(ctx.decision?.complianceStatus).toBe('Compliant');
		});
	});

	describe('Transmission au Hub dans recordDecisionInHub', () => {
		const PID = 'test-hubdec-portability-120';
		const SID = `${PID}-s1`;
		const AUTHOR = 'user-hubdec-portability';
		const project = { id: PID, shortName: PID, strategy: JSON.stringify({ systemOfRecord: 'hub', hubEngagementId: 'eng-hubdec-port' }) };

		beforeAll(async () => {
			await prisma.project.deleteMany({ where: { id: PID } });
			await prisma.user.deleteMany({ where: { id: AUTHOR } });
			await prisma.user.create({ data: { id: AUTHOR, name: 'Alice', email: 'alice.portability@exemple.org', passwordHash: 'h', role: 'lead_architect' } });

			await prisma.project.create({ data: { id: PID, shortName: PID, type: 'project_rfp', badge: 'RFP', title: 'Projet', description: 't', strategy: project.strategy } });
			await prisma.subject.create({ data: { id: SID, projectId: PID, sectionRef: '§1', name: 'Autonomie', maturityLevel: 'L2_decomposed' } });
			await prisma.option.createMany({
				data: [
					{ id: `${SID}-a`, subjectId: SID, title: 'Horloge locale', summary: 'a', origin: 'human', author: 'x', productionMode: 'human-authored', kbRefs: '[]' },
					{ id: `${SID}-b`, subjectId: SID, title: 'Réseau externe', summary: 'b', origin: 'human', author: 'x', productionMode: 'human-authored', kbRefs: '[]' }
				]
			});
		});

		afterAll(async () => {
			await prisma.project.deleteMany({ where: { id: PID } });
			await prisma.user.deleteMany({ where: { id: AUTHOR } });
		});

		function makeFakeClient(onAddDecision: (payload: any) => void) {
			return {
				addRequirements: async () => ({ created: [], unchanged: [] }),
				addSubject: async () => ({ created: true, subject: 's' }),
				addDecision: async (_engId: string, payload: any) => {
					onAddDecision(payload);
					return { decision: { id: 'D-test123', status: 'proposed' }, created: true };
				},
				assertDecision: async () => ({ decision: { id: 'D-test123', status: 'active' } }),
				advanceSubjectMaturity: async () => ({ subject: 's', level: 'L3_decided' })
			} as unknown as LLMOpsClient;
		}

		it('transmet portability: project_specific et harvestable: false au Hub', async () => {
			let capturedPayload: any = null;
			const client = makeFakeClient((p) => { capturedPayload = p; });

			const decisionRow: DecisionRow = {
				id: 'dec-p1',
				retainedOptionId: `${SID}-a`,
				rejected: JSON.stringify([{ optionId: `${SID}-b`, reason: 'Non souverain' }]),
				rationale: 'Horloge locale indispensable.',
				reversibility: 'costly',
				arbiterId: AUTHOR,
				acceptedViolations: JSON.stringify([{ typedId: 'PORTABILITY:project_specific', justification: '' }]),
				portability: 'project_specific'
			};

			const res = await recordDecisionInHub(
				project as any,
				{ id: SID, name: 'Autonomie', problemStatement: '30 jours' },
				decisionRow,
				[],
				'bob.portability@exemple.org',
				client
			);

			expect(res.hubDecisionId).toBe('D-test123');
			expect(capturedPayload).toBeDefined();
			expect(capturedPayload.portability).toBe('project_specific');
			expect(capturedPayload.harvestable).toBe(false);
			expect(capturedPayload.accepted_violations).toEqual([]);
		});

		it('transmet portability: reusable_architecture_doctrine et harvestable: true au Hub', async () => {
			let capturedPayload: any = null;
			const client = makeFakeClient((p) => { capturedPayload = p; });

			const decisionRow: DecisionRow = {
				id: 'dec-p2',
				retainedOptionId: `${SID}-a`,
				rejected: '[]',
				rationale: 'Pattern de redondance souverain.',
				reversibility: 'reversible',
				arbiterId: AUTHOR,
				acceptedViolations: JSON.stringify([{ typedId: 'PORTABILITY:reusable_architecture_doctrine', justification: '' }]),
				portability: 'reusable_architecture_doctrine'
			};

			await recordDecisionInHub(
				project as any,
				{ id: SID, name: 'Autonomie', problemStatement: '30 jours' },
				decisionRow,
				[],
				'bob.portability@exemple.org',
				client
			);

			expect(capturedPayload).toBeDefined();
			expect(capturedPayload.portability).toBe('reusable_architecture_doctrine');
			expect(capturedPayload.harvestable).toBe(true);
		});
	});
});
