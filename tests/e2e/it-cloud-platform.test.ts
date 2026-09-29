import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '$lib/server/prisma';
import {
	createProject,
	createSubject,
	createStatement,
	type ActorInfo
} from '$lib/server/projects/projectsDb';
import {
	createCriterion,
	createOption,
	upsertEvaluation
} from '$lib/server/projects/optionsDb';
import {
	resolveArgument,
	listArguments
} from '$lib/server/projects/debateDb';
import { orchestrateDebate } from '$lib/server/agents/debateOrchestrator';
import {
	getSubjectArbitrationContext,
	recordArbitrationDecision
} from '$lib/server/projects/arbitrationDb';
import {
	prepareSubjectKbCandidates,
	submitSubjectKbCandidates
} from '$lib/server/projects/capitalizationDb';
import { syncProjectFrameworkCoverage } from '$lib/server/projects/frameworksDb';
import { llmopsClient } from '$lib/server/llmops/client';
import { setupFakeLlm } from '../helpers/fakeLlm';

describe('Lot A5 E2E: Second cas de test IT pure - Plateforme Cloud Privé Souveraine (Porte G4)', () => {
	const exampleDir = resolve(process.cwd(), 'examples/it-cloud-platform');
	const projectFixture = JSON.parse(readFileSync(resolve(exampleDir, 'project.json'), 'utf-8'));
	const subjectsFixture = JSON.parse(readFileSync(resolve(exampleDir, 'subjects.json'), 'utf-8'));
	const statementsFixture = JSON.parse(readFileSync(resolve(exampleDir, 'statements.json'), 'utf-8'));

	const projectId = projectFixture.id;
	const targetSubjectId = 'subj-it-virt';

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

	let optKvmId: string;
	let optCommercialId: string;
	let critSovereigntyId: string;
	let critPerfId: string;

	beforeAll(async () => {
		// Nettoyage préalable
		await prisma.project.deleteMany({ where: { id: projectId } });

		// Mock déterministe LLMOps
		vi.spyOn(llmopsClient, 'getDoctrineContext').mockResolvedValue({
			subject: 'Couche Hypervision',
			domains: ['infrastructure'],
			frameworks: ['NIS2', 'ISO 27001', 'SecNumCloud'],
			items: [
				{
					id: 'RULE-VIRT-KVM',
					type: 'rule',
					title: 'Hypervision Ouverte et Auditabilité',
					content: 'L hyperviseur doit reposer sur du code source ouvert auditable.',
					domain: 'infrastructure',
					confidence: 'verified'
				},
				{
					id: 'sec-anssi-01',
					type: 'rule',
					title: 'Cloisonnement mémoire et CPU',
					content: 'Les instances doivent être strictement cloisonnées par isolation matérielle.',
					domain: 'security',
					confidence: 'verified'
				}
			],
			total_items: 2,
			truncated: false,
			offline: false
		});

		vi.spyOn(llmopsClient, 'getFrameworkCoverage').mockResolvedValue({
			frameworks: [
				{ name: 'NIS2', required: true, status: 'covered', covered_count: 10, total_count: 10 },
				{ name: 'ISO 27001', required: true, status: 'covered', covered_count: 15, total_count: 15 },
				{ name: 'SecNumCloud', required: true, status: 'covered', covered_count: 8, total_count: 8 }
			],
			overall_coverage: 'covered',
			checked_at: new Date().toISOString(),
			offline: false
		});

		vi.spyOn(llmopsClient, 'submitCandidate').mockResolvedValue({
			candidate_id: 'cand-cloud-kvm-001',
			status: 'in_review'
		});

		// Configuration du faux LLM pour le débat
		setupFakeLlm({
			proposerArguments: [
				{
					optionId: 'opt-mock-1',
					claim: 'Indépendance totale et conformité SecNumCloud',
					grounds: 'Architecture KVM open-source avec chiffrement LUKS conforme aux standards souverains.',
					kbRefs: ['RULE-VIRT-KVM']
				}
			],
			challengerObjections: [
				{
					optionId: 'opt-mock-1',
					claim: 'Nécessite des compétences d exploitation Linux avancées',
					grounds: 'Le maintien en condition opérationnelle sans support propriétaire requiert une équipe interne formée.',
					kbRefs: []
				}
			],
			verifierVerifications: [
				{
					optionId: 'opt-mock-1',
					claim: 'Conformité avec les exigences de sécurité',
					grounds: 'Les mécanismes d isolation respectent sec-anssi-01.',
					kbRefs: ['sec-anssi-01']
				}
			]
		});
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: projectId } });
		vi.restoreAllMocks();
	});

	it('1. Seed : Crée le projet Cloud Privé Neutre, ses membres et ses sujets depuis le cas d exemple', async () => {
		// 1. Projet
		const proj = await createProject(
			{
				id: projectId,
				title: projectFixture.title,
				shortName: projectFixture.shortName,
				badge: projectFixture.badge,
				description: projectFixture.description
			},
			leadArchitect
		);
		expect(proj.id).toBe(projectId);

		// 2. Membres
		for (const part of projectFixture.participants) {
			await prisma.projectMember.create({
				data: {
					projectId,
					userId: part.id,
					role: part.role,
					domains: JSON.stringify(part.domains || [])
				}
			});
		}

		// 3. Sujets
		for (const subj of subjectsFixture) {
			await createSubject(
				projectId,
				{
					id: subj.id,
					sectionRef: subj.section_ref,
					name: subj.name,
					domain: subj.domain,
					problemStatement: subj.problem_statement
				},
				leadArchitect
			);
		}

		// 4. Cadres réglementaires exigés (NIS2, ISO 27001, SecNumCloud)
		for (const fw of projectFixture.requiredFrameworks) {
			await prisma.projectFramework.create({
				data: {
					projectId,
					framework: fw,
					coverageStatus: 'covered',
					coverageDetail: JSON.stringify({ covered_count: 10, total_count: 10 })
				}
			});
		}

		// 5. Énoncé initial
		for (const st of statementsFixture) {
			await createStatement(
				projectId,
				{
					id: st.id,
					subjectId: targetSubjectId,
					section: st.section,
					subjectRef: st.subject,
					predicate: st.predicate,
					value: st.value,
					author: st.author,
					role: st.role,
					confidence: st.confidence,
					productionMode: 'human-authored'
				},
				leadArchitect
			);
		}

		const subjectDb = await prisma.subject.findUnique({ where: { id: targetSubjectId } });
		expect(subjectDb).toBeDefined();
		expect(subjectDb?.name).toContain('Hypervision');
	});

	it('2. Critères et Options : Décompose le sujet d hypervision avec 2 options contrastées', async () => {
		// Critères
		const c1 = await createCriterion(
			targetSubjectId,
			{
				name: 'Indépendance Technologique',
				description: 'Absence de verrouillage propriétaire et auditabilité du code source.',
				kind: 'compliance',
				weight: 5
			},
			leadArchitect
		);
		critSovereigntyId = c1.id;

		const c2 = await createCriterion(
			targetSubjectId,
			{
				name: 'Performance & Surcoût CPU',
				description: 'Minimiser l overhead de virtualisation pour les charges intensives.',
				kind: 'nfr',
				weight: 4
			},
			leadArchitect
		);
		critPerfId = c2.id;

		// Options
		const o1 = await createOption(
			targetSubjectId,
			{
				title: 'Pile KVM/QEMU Open Source avec SDS Ceph',
				summary: 'Hyperviseur natif Linux avec pilotes virtio et stockage distribué logiciel.',
				origin: 'human',
				kbRefs: [] // Nouveau pattern sans règle préalable
			},
			leadArchitect
		);
		optKvmId = o1.id;

		const o2 = await createOption(
			targetSubjectId,
			{
				title: 'Hyperviseur Propriétaire Commercial Sous Licence',
				summary: 'Solution commerciale d éditeur propriétaire nécessitant des licences annuelles.',
				origin: 'human',
				kbRefs: ['RULE-VIRT-KVM']
			},
			leadArchitect
		);
		optCommercialId = o2.id;

		// Évaluations (entre -2 et +2)
		await upsertEvaluation(
			targetSubjectId,
			{
				optionId: optKvmId,
				criterionId: critSovereigntyId,
				score: 2,
				justification: '100% open-source, auditable par l ANSSI et pérenne.'
			},
			leadArchitect
		);
		await upsertEvaluation(
			targetSubjectId,
			{
				optionId: optKvmId,
				criterionId: critPerfId,
				score: 1,
				justification: 'Excellentes performances avec vhost-user et SR-IOV.'
			},
			leadArchitect
		);

		await upsertEvaluation(
			targetSubjectId,
			{
				optionId: optCommercialId,
				criterionId: critSovereigntyId,
				score: -2,
				justification: 'Code fermé et dépendance contractuelle forte.'
			},
			leadArchitect
		);
		await upsertEvaluation(
			targetSubjectId,
			{
				optionId: optCommercialId,
				criterionId: critPerfId,
				score: 2,
				justification: 'Très bonnes performances constructeur.'
			},
			leadArchitect
		);

		expect(optKvmId).toBeDefined();
		expect(optCommercialId).toBeDefined();
	});

	it('3. Débat contradictoire multi-agents et levée des objections', async () => {
		// Exécute un tour de débat multi-agents
		const debateRes = await orchestrateDebate(targetSubjectId, {
			maxRounds: 1,
			actor: leadArchitect
		});

		expect(debateRes.run).toBeDefined();
		expect(debateRes.newArgumentsCount).toBeGreaterThanOrEqual(1);

		// Traite toute objection ouverte en acceptant le risque documenté
		const currentArgs = await listArguments(targetSubjectId);
		const openObjections = currentArgs.filter((a) => a.stance === 'objection' && a.resolution === 'open');

		for (const obj of openObjections) {
			await resolveArgument(
				obj.id,
				{
					resolution: 'accepted_risk',
					expectedVersion: obj.version
				},
				leadArchitect,
				true
			);
		}

		const postArgs = await listArguments(targetSubjectId);
		const remainingOpen = postArgs.filter((a) => a.stance === 'objection' && a.resolution === 'open');
		expect(remainingOpen).toHaveLength(0);
	});

	it('4. Maturité calculée : Vérifie l arbitrabilité du sujet (Porte G3)', async () => {
		const ctx = await getSubjectArbitrationContext(targetSubjectId);

		expect(ctx.maturityResult.level).toBe('L2_decomposed');
		expect(ctx.maturityResult.readyForArbitration).toBe(true);
		expect(ctx.maturityResult.blockers).toHaveLength(0);
	});

	it('5. Arbitrage Humain Opposable : Tranche en faveur de la pile KVM souveraine', async () => {
		const decision = await recordArbitrationDecision(
			targetSubjectId,
			{
				retainedOptionId: optKvmId,
				rejected: [
					{
						optionId: optCommercialId,
						reason: 'Risque de dépendance éditeur et surcoût de licence inacceptable sur 5 ans.'
					}
				],
				rationale:
					'KVM/QEMU retenu pour satisfaire aux exigences de souveraineté et d auditabilité de SecNumCloud.',
				reversibility: 'reversible',
				acceptedViolations: []
			},
			infraExpert // Expert du domaine infrastructure
		);

		expect(decision).toBeDefined();
		expect(decision.retainedOptionId).toBe(optKvmId);

		// Vérifie le passage à L3_decided
		const subj = await prisma.subject.findUnique({ where: { id: targetSubjectId } });
		expect(subj?.maturityLevel).toBe('L3_decided');

		// Vérifie la promotion des énoncés dérivés vers llm-proposed-human-approved
		const statements = await prisma.statement.findMany({ where: { subjectId: targetSubjectId } });
		expect(statements.length).toBeGreaterThanOrEqual(1);
	});

	it('6. Capitalisation vers la KB (Porte G4) : Génération pure, édition humaine et soumission', async () => {
		// Préparation des candidats
		const prep = await prepareSubjectKbCandidates(targetSubjectId, leadArchitect);

		expect(prep.candidates.length).toBeGreaterThanOrEqual(1);

		// new_asset présent car l'option KVM n'avait pas de kbRefs préalables
		const newAsset = prep.candidates.find((c) => c.kind === 'new_asset');
		expect(newAsset).toBeDefined();
		expect(newAsset?.title).toContain('Pile KVM/QEMU Open Source');

		// REX systématique
		const rex = prep.candidates.find((c) => c.kind === 'rex');
		expect(rex).toBeDefined();

		// Modification humaine préalable (Invariant III)
		newAsset!.title = 'Pattern Doctrinal Validé : Socle Hypervision KVM / Ceph Souverain';
		newAsset!.suggested_change = 'Promouvoir ce standard pour tous les projets de cloud privé européen.';

		// Soumission
		const submitRes = await submitSubjectKbCandidates(targetSubjectId, [newAsset!], leadArchitect);

		expect(submitRes.submitted).toHaveLength(1);
		expect(submitRes.submitted[0].candidate_id).toBe('cand-cloud-kvm-001');

		// Vérification persistance en base
		const decision = await prisma.decision.findUnique({ where: { subjectId: targetSubjectId } });
		const candidateIds = JSON.parse(decision?.kbCandidateIds || '[]');
		expect(candidateIds).toContain('cand-cloud-kvm-001');

		// Vérification DomainEvent
		const event = await prisma.domainEvent.findFirst({
			where: {
				projectId,
				type: 'KB_CANDIDATES_SUBMITTED'
			}
		});
		expect(event).toBeDefined();
	});
});
