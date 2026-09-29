import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import {
	createProject,
	createSubject,
	type ActorInfo
} from '$lib/server/projects/projectsDb';
import {
	createCriterion,
	createOption,
	upsertEvaluation
} from '$lib/server/projects/optionsDb';
import {
	recordArbitrationDecision
} from '$lib/server/projects/arbitrationDb';
import {
	prepareSubjectKbCandidates,
	submitSubjectKbCandidates,
	getSubjectKbCandidatesStatus
} from '$lib/server/projects/capitalizationDb';
import { GET, POST } from '../../src/routes/api/projects/[projectId]/subjects/[subjectId]/capitalization/+server';

describe('Lot A5 Integration: KB Capitalization & Human-in-the-loop Gate (Porte G4)', () => {
	const testProjectId = `test-a5-cap-${Date.now()}`;
	const testSubjectId = `subj-a5-${Date.now()}`;

	const leadArchitect: ActorInfo = {
		userId: 'alice-lead',
		role: 'lead_architect',
		productionMode: 'human-authored'
	};

	const infraExpert: ActorInfo = {
		userId: 'bob-infra',
		role: 'domain_expert',
		domains: ['infrastructure'],
		productionMode: 'human-authored'
	};

	const securityExpert: ActorInfo = {
		userId: 'charlie-sec',
		role: 'domain_expert',
		domains: ['security'], // Pas dans infrastructure
		productionMode: 'human-authored'
	};

	let opt1Id: string;
	let opt2Id: string;
	let crit1Id: string;
	let crit2Id: string;

	beforeAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });

		// 1. Initialise le projet et les membres
		await createProject(
			{
				id: testProjectId,
				title: 'Projet Déploiement Cloud',
				shortName: 'PDC',
				badge: 'PDC',
				description: 'Plateforme cloud privé avec stockage distribué'
			},
			leadArchitect
		);

		await prisma.projectMember.createMany({
			data: [
				{
					projectId: testProjectId,
					userId: infraExpert.userId,
					role: infraExpert.role,
					domains: JSON.stringify(infraExpert.domains)
				},
				{
					projectId: testProjectId,
					userId: securityExpert.userId,
					role: securityExpert.role,
					domains: JSON.stringify(securityExpert.domains)
				}
			]
		});

		// 2. Crée le sujet
		await createSubject(
			testProjectId,
			{
				id: testSubjectId,
				sectionRef: '§3.1',
				name: 'Stockage persistant Ceph SDS',
				domain: 'infrastructure',
				problemStatement: 'Définir la solution de stockage bloc et objet pour le cluster.'
			},
			leadArchitect
		);

		// 3. Critères et options
		const c1 = await createCriterion(
			testSubjectId,
			{
				name: 'Performance IOPS',
				description: 'Minimum 50k IOPS en écriture aléatoire.',
				kind: 'nfr',
				weight: 5
			},
			leadArchitect
		);
		crit1Id = c1.id;

		const c2 = await createCriterion(
			testSubjectId,
			{
				name: 'Souveraineté des données',
				description: 'Contrôle on-premise sans dépendance cloud propriétaire.',
				kind: 'compliance',
				weight: 5
			},
			leadArchitect
		);
		crit2Id = c2.id;

		const o1 = await createOption(
			testSubjectId,
			{
				title: 'Ceph Open Source SDS',
				summary: 'Stockage distribué logiciel déployé sur bare-metal avec disques NVMe /dev/nvme0n1.',
				origin: 'human',
				kbRefs: [] // Pas de règle préalable -> doit générer un new_asset
			},
			leadArchitect
		);
		opt1Id = o1.id;

		const o2 = await createOption(
			testSubjectId,
			{
				title: 'Baie Propriétaire Externe',
				summary: 'SAN propriétaire en salle serveur.',
				origin: 'human',
				kbRefs: ['RULE-SAN-LEGACY']
			},
			leadArchitect
		);
		opt2Id = o2.id;

		// 4. Évaluations (-2 à +2)
		await upsertEvaluation(
			testSubjectId,
			{
				optionId: opt1Id,
				criterionId: crit1Id,
				score: 1,
				justification: 'Très bonne mise à l échelle avec NVMe.'
			},
			leadArchitect
		);
		await upsertEvaluation(
			testSubjectId,
			{
				optionId: opt1Id,
				criterionId: crit2Id,
				score: 2,
				justification: 'Totalement souverain et auditable.'
			},
			leadArchitect
		);
		await upsertEvaluation(
			testSubjectId,
			{
				optionId: opt2Id,
				criterionId: crit1Id,
				score: 1,
				justification: 'Performant mais rigide.'
			},
			leadArchitect
		);
		await upsertEvaluation(
			testSubjectId,
			{
				optionId: opt2Id,
				criterionId: crit2Id,
				score: -2,
				justification: 'Verrouillage constructeur.'
			},
			leadArchitect
		);
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	it('1. Refuse la préparation de candidats avant que le sujet soit arbitré (L3_decided)', async () => {
		await expect(prepareSubjectKbCandidates(testSubjectId, leadArchitect)).rejects.toThrow(
			"Le sujet n'a pas encore fait l'objet d'un arbitrage opposable"
		);
	});

	it('2. Enregistre la décision d arbitrage formelle (Porte G3) avec une violation acceptée', async () => {
		const decision = await recordArbitrationDecision(
			testSubjectId,
			{
				retainedOptionId: opt1Id,
				rejected: [{ optionId: opt2Id, reason: 'Verrouillage propriétaire inacceptable.' }],
				rationale: 'Ceph SDS retenu pour sa flexibilité et conformité souveraine.',
				reversibility: 'reversible',
				acceptedViolations: [
					{
						typedId: 'RULE-STORAGE-REP-FACTOR-3',
						justification: 'Facteur de réplication 2 toléré pour les volumes de cache temporaires.'
					}
				]
			},
			infraExpert // Expert du domaine infrastructure
		);

		expect(decision).toBeDefined();
		expect(decision.retainedOptionId).toBe(opt1Id);

		const updatedSubject = await prisma.subject.findUnique({ where: { id: testSubjectId } });
		expect(updatedSubject?.maturityLevel).toBe('L3_decided');
	});

	it('3. Prépare les candidats KB avec anonymisation et les 3 types de candidats', async () => {
		const prep = await prepareSubjectKbCandidates(testSubjectId, leadArchitect);

		expect(prep.candidates).toHaveLength(3);

		// new_asset (Ceph n avait pas de kbRefs)
		const newAsset = prep.candidates.find((c) => c.kind === 'new_asset');
		expect(newAsset).toBeDefined();
		expect(newAsset?.title).toContain('Ceph Open Source SDS');
		expect(newAsset?.summary).not.toContain('/dev/nvme0n1'); // Anonymisé
		expect(newAsset?.summary).toContain('[STORAGE_VOLUME]');

		// amendment (violation acceptée)
		const amendment = prep.candidates.find((c) => c.kind === 'amendment');
		expect(amendment).toBeDefined();
		expect(amendment?.target_asset_ref).toBe('RULE-STORAGE-REP-FACTOR-3');
		expect(amendment?.accepted_violation_justification).toContain('volumes de cache temporaires');

		// rex (systématique)
		const rex = prep.candidates.find((c) => c.kind === 'rex');
		expect(rex).toBeDefined();
		expect(rex?.title).toContain('Stockage persistant Ceph SDS');
	});

	it('4. Rejette la soumission par un expert non habilité pour ce domaine (403)', async () => {
		const prep = await prepareSubjectKbCandidates(testSubjectId, leadArchitect);

		await expect(
			submitSubjectKbCandidates(testSubjectId, prep.candidates, securityExpert)
		).rejects.toThrow("n'a pas les droits pour soumettre des candidats");
	});

	it('5. Soumet les candidats via l API (avec modification humaine préalable - Invariant III)', async () => {
		const prep = await prepareSubjectKbCandidates(testSubjectId, leadArchitect);

		// L'utilisateur édite le titre et la synthèse avant soumission
		const candidateToSubmit = prep.candidates[0];
		candidateToSubmit.title = 'Pattern Amendé par Architecte : Stockage SDS Haute Résilience';
		candidateToSubmit.summary = 'Synthèse enrichie par l expert technique avant intégration KB.';

		const fakeEvent: any = {
			params: { projectId: testProjectId, subjectId: testSubjectId },
			request: {
				url: `http://localhost/api/projects/${testProjectId}/subjects/${testSubjectId}/capitalization`,
				json: async () => ({
					candidates: [candidateToSubmit]
				}),
				headers: new Headers({
					'x-user-id': 'bob-infra',
					'x-user-role': 'domain_expert',
					'x-user-domains': 'infrastructure'
				})
			}
		};

		const response = await POST(fakeEvent);
		expect(response.status).toBe(201);

		const body = await response.json();
		expect(body.submitted).toHaveLength(1);
		expect(body.submitted[0].candidate_id).toBeDefined();
		expect(body.submitted[0].status).toBe('in_review');

		// Vérifie en base que Decision.kbCandidateIds a été mis à jour
		const updatedDecision = await prisma.decision.findUnique({ where: { subjectId: testSubjectId } });
		const storedIds = JSON.parse(updatedDecision?.kbCandidateIds || '[]');
		expect(storedIds).toContain(body.submitted[0].candidate_id);

		// Vérifie l événement de domaine
		const event = await prisma.domainEvent.findFirst({
			where: {
				projectId: testProjectId,
				type: 'KB_CANDIDATES_SUBMITTED'
			}
		});
		expect(event).toBeDefined();
		expect(event?.actorRole).toBe('domain_expert');
	});

	it('6. Récupère le statut des candidats soumis via le endpoint GET', async () => {
		const fakeEvent: any = {
			params: { projectId: testProjectId, subjectId: testSubjectId },
			request: {
				url: `http://localhost/api/projects/${testProjectId}/subjects/${testSubjectId}/capitalization`,
				headers: new Headers({
					'x-user-id': 'alice-lead',
					'x-user-role': 'lead_architect'
				})
			}
		};

		const response = await GET(fakeEvent);
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body.candidateIds.length).toBeGreaterThanOrEqual(1);
	});
});
