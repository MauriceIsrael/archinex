import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { llmopsClient } from '$lib/server/llmops/client';
import { buildEngagementProfileFromWorkspaceInput, type InitialSubjectInput } from '$lib/domain/engagements';
import { getEngagementByIdFromDb, saveEngagementToDb } from '$lib/server/engagementsDb';
import { getSubjectArbitrationContext, recordArbitrationDecision } from '$lib/server/projects/arbitrationDb';
import { exportEngagementBundle } from '$lib/server/bundleExportService';
import { loadHldFragment } from '$lib/server/projects/hldFragmentDb';
import type { ActorInfo } from '$lib/server/projects/projectsDb';

/**
 * Bout en bout de la délibération : sujets issus de la factorisation d'un RFP (avec la proposition d'options,
 * de critères et d'évaluations du modèle) → espace de délibération → décision formelle → dossier exporté.
 */
describe('Du RFP factorisé à la décision formelle', () => {
	const stamp = Date.now();
	const projectId = `test-rfp2dec-${stamp}`;
	const lead: ActorInfo = { userId: 'alice-lead', role: 'lead_architect', productionMode: 'human-authored' };

	const subjects: InitialSubjectInput[] = [
		{
			id: `sub-ha-${stamp}`,
			factorizationId: 'SUBJ-01',
			name: 'Haute disponibilité du cœur : actif-actif ou actif-passif',
			waitingForRole: 'lead_architect',
			effort: 'L',
			initialQuestion: 'Quelle topologie de redondance tient 99,999 % avec la maintenance comptée comme indisponibilité ?',
			nature: 'architecture',
			dependsOn: ['SUBJ-02'],
			proposal: {
				options: [
					{ title: 'Actif-actif géoredondant', summary: 'Deux sites chauds partageant la charge.' },
					{ title: 'Actif-passif avec bascule', summary: 'Un site primaire et un secours chaud.' }
				],
				criteria: [
					{ name: 'Disponibilité', kind: 'nfr', weight: 5, description: 'Tenue des cinq neuf.' },
					{ name: 'Coût', kind: 'cost', weight: 3, description: 'Investissement et exploitation.' }
				],
				evaluations: [
					{ option: 'Actif-actif géoredondant', criterion: 'Disponibilité', score: 2, justification: 'Aucune bascule à opérer.' },
					{ option: 'Actif-actif géoredondant', criterion: 'Coût', score: -1, justification: 'Double capacité permanente.' },
					{ option: 'Actif-passif avec bascule', criterion: 'Disponibilité', score: 0, justification: 'La bascule consomme du budget.' },
					{ option: 'Actif-passif avec bascule', criterion: 'Coût', score: 1, justification: 'Secours sous-dimensionné.' }
				]
			}
		},
		{
			id: `sub-tier4-${stamp}`,
			factorizationId: 'SUBJ-02',
			name: 'Hébergement en datacentres Tier IV imposés au Luxembourg',
			waitingForRole: 'infra_expert_architect',
			initialQuestion: 'Comment répartir les plateformes entre les datacentres Tier IV imposés ?',
			nature: 'architecture',
			proposal: {
				options: [{ title: 'Datacentres Tier IV au Luxembourg', summary: 'Exigence imposée par le RFP.' }],
				singleOptionRationale: 'Le RFP impose les sites : aucune alternative recevable.',
				criteria: [{ name: 'Conformité au RFP', kind: 'compliance', weight: 5, description: 'Sites imposés.' }],
				evaluations: [{ option: 'Datacentres Tier IV au Luxembourg', criterion: 'Conformité au RFP', score: 2, justification: 'Conforme par construction.' }]
			}
		}
	];

	beforeAll(async () => {
		vi.spyOn(llmopsClient, 'getFrameworkCoverage').mockResolvedValue({ frameworks: [] } as never);
		// Conformité : aucune règle ne se déclenche par défaut (le test dédié fournit ses verdicts)
		vi.spyOn(llmopsClient, 'checkOption').mockResolvedValue({ verdicts: [] } as never);
		await prisma.project.deleteMany({ where: { id: projectId } });
	});

	afterAll(async () => {
		vi.restoreAllMocks();
		await prisma.project.deleteMany({ where: { id: projectId } });
		await prisma.engagement.deleteMany({ where: { id: projectId } });
	});

	it('importe les sujets avec énoncé, nature, dépendances et la proposition du modèle', async () => {
		const { engagement: profile } = buildEngagementProfileFromWorkspaceInput({
			id: projectId,
			title: 'RFP de test',
			type: 'project_rfp',
			description: 'Bout en bout',
			strategy: { objectives: [], principles: [], constraints: [] },
			participants: [],
			initialSubjects: subjects
		});
		await saveEngagementToDb(profile);

		const ha = await prisma.subject.findUniqueOrThrow({ where: { id: subjects[0].id! }, include: { options: true, criteria: true } });
		expect(ha.problemStatement).toBe(subjects[0].initialQuestion);
		expect(ha.nature).toBe('architecture');
		expect(JSON.parse(ha.dependsOn)).toEqual([subjects[1].id]); // SUBJ-02 traduit en identifiant d'espace
		expect(ha.options.map((o) => o.title).sort()).toEqual(['Actif-actif géoredondant', 'Actif-passif avec bascule']);
		expect(ha.options.every((o) => o.origin === 'llm-proposed' && o.productionMode === 'llm-derived')).toBe(true);
		expect(ha.criteria).toHaveLength(2);
		expect(await prisma.optionEvaluation.count({ where: { option: { subjectId: ha.id } } })).toBe(4);

		const tier4 = await prisma.subject.findUniqueOrThrow({ where: { id: subjects[1].id! } });
		expect(tier4.singleOptionRationale).toContain('impose');
	});

	it('une sauvegarde du profil client n\'écrase ni l\'énoncé ni la proposition', async () => {
		const { engagement: profile } = buildEngagementProfileFromWorkspaceInput({
			id: projectId,
			title: 'RFP de test',
			type: 'project_rfp',
			description: 'Bout en bout',
			strategy: { objectives: [], principles: [], constraints: [] },
			participants: [],
			initialSubjects: subjects.map((s) => ({ ...s, initialQuestion: undefined, problemStatement: undefined, proposal: undefined }))
		});
		await saveEngagementToDb(profile);
		const ha = await prisma.subject.findUniqueOrThrow({ where: { id: subjects[0].id! }, include: { options: true } });
		expect(ha.problemStatement).toBe(subjects[0].initialQuestion);
		expect(ha.options).toHaveLength(2); // pas de doublon
	});

	it('la proposition du modèle suffit à rendre le sujet arbitrable, y compris avec une option unique justifiée', async () => {
		const ha = await getSubjectArbitrationContext(subjects[0].id!);
		expect(ha.maturityResult.blockers).toEqual([]);
		expect(ha.maturityResult.readyForArbitration).toBe(true);

		const tier4 = await getSubjectArbitrationContext(subjects[1].id!);
		expect(tier4.maturityResult.blockers).toEqual([]);
		expect(tier4.maturityResult.readyForArbitration).toBe(true);
	});

	it('une option jugée non conforme par une règle validée ne se retient qu\'avec un écart accepté et justifié', async () => {
		const option = (await getSubjectArbitrationContext(subjects[1].id!)).options[0];
		vi.mocked(llmopsClient.checkOption).mockResolvedValue({
			verdicts: [
				{ typed_id: 'control:NIS2-ART21-2J', check_id: 'NIS2-ART21-2J-C1', verdict: 'violates', message: 'Authentification multifacteur exigée.', check_status: 'validated' },
				{ typed_id: 'principle:P-001', check_id: 'P-001-C1', verdict: 'violates', message: 'Règle en brouillon.', check_status: 'draft' }
			]
		} as never);
		const base = { retainedOptionId: option.id, rejected: [], rationale: 'Le RFP impose les sites.', reversibility: 'irreversible' as const };

		// La règle validée bloque ; la règle en brouillon ne bloque pas
		await expect(recordArbitrationDecision(subjects[1].id!, base, lead)).rejects.toMatchObject({
			name: 'MaturityUnreadyError',
			blockers: [expect.objectContaining({ code: 'UNRESOLVED_VIOLATION', targetId: 'control:NIS2-ART21-2J' })]
		});

		const accepted = [{ typedId: 'control:NIS2-ART21-2J', justification: 'MFA portée par le bastion d’administration du client.' }];
		const decision = await recordArbitrationDecision(subjects[1].id!, { ...base, acceptedViolations: accepted }, lead);
		expect(decision.acceptedViolations).toEqual(accepted);
		vi.mocked(llmopsClient.checkOption).mockResolvedValue({ verdicts: [] } as never);
	});

	it('décision formelle par un humain, puis le niveau L3 n\'est pas défait par une sauvegarde client', async () => {
		const ctx = await getSubjectArbitrationContext(subjects[0].id!);
		const retained = ctx.options.find((o) => o.title === 'Actif-actif géoredondant')!;
		const rejected = ctx.options.find((o) => o.id !== retained.id)!;
		const decision = await recordArbitrationDecision(
			subjects[0].id!,
			{
				retainedOptionId: retained.id,
				rejected: [{ optionId: rejected.id, reason: 'La bascule consomme le budget d\'indisponibilité.' }],
				rationale: 'Seul l\'actif-actif tient les cinq neuf avec la maintenance comptée comme indisponibilité.',
				reversibility: 'costly'
			},
			lead
		);
		expect(decision.retainedOptionId).toBe(retained.id);

		const { engagement: profile } = buildEngagementProfileFromWorkspaceInput({
			id: projectId,
			title: 'RFP de test',
			type: 'project_rfp',
			description: 'Bout en bout',
			strategy: { objectives: [], principles: [], constraints: [] },
			participants: [],
			initialSubjects: subjects.map((s) => ({ ...s, level: 'L1_framed' as const }))
		});
		await saveEngagementToDb(profile);
		const ha = await prisma.subject.findUniqueOrThrow({ where: { id: subjects[0].id! } });
		expect(ha.maturityLevel).toBe('L3_decided');

		// Le tableau, rechargé depuis l'espace, montre le niveau décidé même si la copie client est restée en L1.
		const reloaded = await getEngagementByIdFromDb(projectId);
		expect(reloaded?.subjects.find((s) => s.id === subjects[0].id)?.level).toBe('L3_decided');
		expect(reloaded?.drafts[subjects[0].id!]?.maturity).toBe('L3_decided');
	});

	it('le dossier exporté porte la décision', async () => {
		const { bundle } = await exportEngagementBundle({ projectId, confidentiality: 'internal', actorHandle: '@alice' });
		const text = JSON.stringify(bundle);
		expect(text).toContain('Actif-actif géoredondant');
		expect(text).toContain('cinq neuf');
	});

	it('le fragment de HLD du sujet décidé reprend la décision et les options proposées', async () => {
		const { fragment, markdown } = await loadHldFragment(projectId, subjects[0].id!);
		expect(fragment.status).toBe('decided');
		expect(fragment.decision?.retained).toBe('Actif-actif géoredondant');
		expect(fragment.options.some((o) => o.proposedByModel)).toBe(true);
		expect(markdown).toContain('### Décision');
	});
});
