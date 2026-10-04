import { describe, it, expect } from 'vitest';
import {
	computeMaturityCriteria,
	calculateConvergence,
	type MaturityCriteriaInput
} from '$lib/domain/maturityCriteria';
import { canTransitionMaturity } from '$lib/domain/maturityBoard';
import type { Argument } from '$lib/domain/debate';

describe('Lot A26 Contract: Maturity Criteria Stepper, Locks, Convergence & Stagnation (#37)', () => {
	it('1. L0 -> L1 : valide les 3 critères (problème formulé, périmètre, contrainte #base)', () => {
		// Sujet brut non cadré
		const rawInput: MaturityCriteriaInput = {
			subject: {
				id: 'sub-1',
				name: 'Authentification forte',
				level: 'L0_named',
				problemStatement: null,
				scope: null,
				sectionRef: null
			},
			doctrineConstraintsCount: 0
		};

		const report = computeMaturityCriteria(rawInput);
		const l1Transition = report.transitions.L1_framed;

		expect(l1Transition.allowed).toBe(false);
		expect(l1Transition.criteria).toHaveLength(3);
		expect(l1Transition.criteria[0].satisfied).toBe(false); // Problème
		expect(l1Transition.criteria[1].satisfied).toBe(false); // Périmètre
		expect(l1Transition.criteria[2].satisfied).toBe(false); // #base
		expect(l1Transition.missingReasons).toEqual([
			'Problème d’architecture formulé',
			'Périmètre délimité',
			'Au moins une contrainte de la base rattachée'
		]);

		// Complétion des 3 critères
		const satisfiedInput: MaturityCriteriaInput = {
			subject: {
				id: 'sub-1',
				name: 'Authentification forte',
				level: 'L0_named',
				problemStatement: 'Garantir une authentification multifacteur pour le plan de contrôle',
				scope: 'Périmètre IAM Cloud & Bastion',
				sectionRef: '§3.2'
			},
			doctrineConstraintsCount: 1
		};

		const satisfiedReport = computeMaturityCriteria(satisfiedInput);
		expect(satisfiedReport.transitions.L1_framed.allowed).toBe(true);
		expect(satisfiedReport.transitions.L1_framed.criteria.every((c) => c.satisfied)).toBe(true);
	});

	it('2. L1 -> L2 : exige au moins 2 options, des critères de choix et aucune question ouverte', () => {
		const inputWithQuestion: MaturityCriteriaInput = {
			subject: {
				id: 'sub-2',
				name: 'Stockage distribué',
				level: 'L1_framed',
				problemStatement: 'Choisir le stockage distribué',
				sectionRef: '§5.1'
			},
			options: [{ id: 'opt-ceph', title: 'Ceph OSD' }],
			criteria: [{ id: 'crit-perf', name: 'Performance IOPS' }],
			openQuestionsCount: 1
		};

		const report = computeMaturityCriteria(inputWithQuestion);
		const l2Transition = report.transitions.L2_decomposed;

		expect(l2Transition.allowed).toBe(false);
		expect(l2Transition.criteria.find((c) => c.id === 'options_plurality')?.satisfied).toBe(false);
		expect(l2Transition.criteria.find((c) => c.id === 'selection_criteria')?.satisfied).toBe(false);
		expect(l2Transition.criteria.find((c) => c.id === 'no_open_questions')?.satisfied).toBe(false);

		// Complétion des critères L2
		const completeInput: MaturityCriteriaInput = {
			...inputWithQuestion,
			options: [
				{ id: 'opt-ceph', title: 'Ceph OSD' },
				{ id: 'opt-rook', title: 'Rook Operator' }
			],
			criteria: [
				{ id: 'crit-perf', name: 'Performance IOPS' },
				{ id: 'crit-resil', name: 'Résilience' }
			],
			openQuestionsCount: 0
		};

		const completeReport = computeMaturityCriteria(completeInput);
		expect(completeReport.transitions.L2_decomposed.allowed).toBe(true);
	});

	it('3. L2 -> L3 : verrouillé à un décideur distinct de son auteur (K16), bloque les objections et vérificateur non passé', () => {
		const openObjection: Argument = {
			id: 'arg-obj-1',
			subjectId: 'sub-3',
			stance: 'objection',
			claim: 'Vulnérabilité CVE sur le composant',
			grounds: 'Risque élevé d injection',
			kbRefs: ['SEC-01'],
			confidence: 'verified',
			author: 'Agent Sécurité',
			authorKind: 'agent',
			productionMode: 'llm-derived',
			round: 1,
			resolution: 'open',
			version: 1,
			createdAt: new Date().toISOString()
		};

		const inputBlocked: MaturityCriteriaInput = {
			subject: {
				id: 'sub-3',
				name: 'Passerelle API',
				level: 'L2_decomposed'
			},
			arguments: [openObjection],
			verifierPassed: false,
			decision: {
				authorId: 'alice-architect',
				affirmedBy: 'alice-architect', // TENTATIVE D'AUTO-VALIDATION (PROSCRITE K16)
				status: 'proposed'
			},
			actor: {
				userId: 'alice-architect',
				role: 'contributor',
				isHuman: true
			}
		};

		const report = computeMaturityCriteria(inputBlocked);
		const l3Transition = report.transitions.L3_decided;

		expect(l3Transition.allowed).toBe(false);
		expect(l3Transition.locked).toBe(true);
		expect(l3Transition.lockRole).toBe('Décideur distinct (K16)');
		expect(l3Transition.missingReasons).toContain('Aucune objection ouverte (ou risque accepté)');
		expect(l3Transition.missingReasons).toContain('Vérificateur d’architecture passé');
		expect(l3Transition.missingReasons).toContain(
			'Décision affirmée dans le Hub par un decider distinct de son auteur'
		);

		// Un contributeur voit pourquoi L3 lui est inaccessible et qui peut le débloquer
		expect(l3Transition.unblockHint).toContain('Décideur distinct (K16)');
	});

	it('4. L2 -> L3 : validation réussie avec décideur distinct et objections résolues', () => {
		const resolvedObjection: Argument = {
			id: 'arg-obj-2',
			subjectId: 'sub-3',
			stance: 'objection',
			claim: 'Question de coût',
			grounds: 'Accepté par le sponsor',
			kbRefs: [],
			confidence: 'assumed',
			author: 'FinOps',
			authorKind: 'human',
			productionMode: 'human-authored',
			round: 1,
			resolution: 'accepted_risk', // Risque accepté -> non bloquant
			version: 1,
			createdAt: new Date().toISOString()
		};

		const inputAllowed: MaturityCriteriaInput = {
			subject: {
				id: 'sub-3',
				name: 'Passerelle API',
				level: 'L2_decomposed'
			},
			arguments: [resolvedObjection],
			verifierPassed: true,
			decision: {
				authorId: 'alice-architect',
				affirmedBy: 'bob-decider', // DÉCIDEUR DISTINCT (K16)
				status: 'active'
			},
			actor: {
				userId: 'bob-decider',
				role: 'domain_expert',
				isHuman: true
			}
		};

		const report = computeMaturityCriteria(inputAllowed);
		expect(report.transitions.L3_decided.allowed).toBe(true);
	});

	it('5. L3 -> L4 : exige sujets dérivés L1+ (A28), spécification rédigée et rôle Lead Architect', () => {
		const inputNonLead: MaturityCriteriaInput = {
			subject: {
				id: 'sub-4',
				name: 'Supervision globale',
				level: 'L3_decided'
			},
			derivedSubjects: [{ id: 'child-1', level: 'L0_named' }], // Sous-sujet encore en L0
			specificationPresent: false,
			actor: {
				userId: 'bob-expert',
				role: 'domain_expert', // Non Lead Architect
				isHuman: true
			}
		};

		const reportNonLead = computeMaturityCriteria(inputNonLead);
		const l4Transition = reportNonLead.transitions.L4_specified;

		expect(l4Transition.allowed).toBe(false);
		expect(l4Transition.locked).toBe(true);
		expect(l4Transition.lockRole).toBe('Lead Architect');
		expect(l4Transition.missingReasons).toEqual([
			'Sujets dérivés traités jusqu’à L1 au moins (A28)',
			'Spécification technique rédigée',
			'Validation par le Lead Architect'
		]);

		// Complétion complète L3 -> L4 par Lead Architect
		const inputLead: MaturityCriteriaInput = {
			subject: {
				id: 'sub-4',
				name: 'Supervision globale',
				level: 'L3_decided'
			},
			derivedSubjects: [{ id: 'child-1', level: 'L1_framed' }],
			specificationPresent: true,
			actor: {
				userId: 'claire-lead',
				role: 'lead_architect',
				isHuman: true
			}
		};

		const reportLead = computeMaturityCriteria(inputLead);
		expect(reportLead.transitions.L4_specified.allowed).toBe(true);
	});

	it('6. Cohérence avec le Hub : projet basculé affiche la maturité du Hub même si critères locaux tous verts', () => {
		const cutoverInput: MaturityCriteriaInput = {
			subject: {
				id: 'sub-hub-1',
				name: 'Cœur Réseau',
				level: 'L2_decomposed',
				hubLevel: 'L1_framed' // Le Hub est en retard (SoR Hub = L1)
			},
			isHubCutover: true,
			// Critères locaux L1 tous verts
			doctrineConstraintsCount: 2,
			options: [{ id: 'o1', title: 'O1' }, { id: 'o2', title: 'O2' }],
			criteria: [{ id: 'c1', name: 'C1' }, { id: 'c2', name: 'C2' }]
		};

		const report = computeMaturityCriteria(cutoverInput);

		expect(report.sourceOfRecord).toBe('hub');
		expect(report.displayedLevel).toBe('L1_framed'); // Strictement la maturité du Hub !
		expect(report.currentLevel).toBe('L2_decomposed');
	});

	it('7. Jauge de convergence : calcule le ratio soutiens et objections résolues vs ouvertes', () => {
		const args: Argument[] = [
			{
				id: '1',
				subjectId: 's',
				stance: 'support',
				claim: 'Support 1',
				grounds: 'G1',
				kbRefs: [],
				confidence: 'assumed',
				author: 'A',
				authorKind: 'agent',
				productionMode: 'llm-derived',
				round: 1,
				resolution: 'answered',
				version: 1,
				createdAt: ''
			},
			{
				id: '2',
				subjectId: 's',
				stance: 'support',
				claim: 'Support 2',
				grounds: 'G2',
				kbRefs: [],
				confidence: 'assumed',
				author: 'B',
				authorKind: 'human',
				productionMode: 'human-authored',
				round: 1,
				resolution: 'answered',
				version: 1,
				createdAt: ''
			},
			{
				id: '3',
				subjectId: 's',
				stance: 'objection',
				claim: 'Objection résolue',
				grounds: 'G3',
				kbRefs: [],
				confidence: 'assumed',
				author: 'C',
				authorKind: 'human',
				productionMode: 'human-authored',
				round: 1,
				resolution: 'accepted_risk',
				version: 1,
				createdAt: ''
			},
			{
				id: '4',
				subjectId: 's',
				stance: 'objection',
				claim: 'Objection ouverte',
				grounds: 'G4',
				kbRefs: [],
				confidence: 'assumed',
				author: 'D',
				authorKind: 'human',
				productionMode: 'human-authored',
				round: 1,
				resolution: 'open',
				version: 1,
				createdAt: ''
			}
		];

		const stats = calculateConvergence(args);
		expect(stats.supportsCount).toBe(2);
		expect(stats.resolvedObjectionsCount).toBe(1);
		expect(stats.openObjectionsCount).toBe(1);
		// (2 soutiens + 1 résolue) / (3 résolues/positives + 1 ouverte) = 3/4 = 75%
		expect(stats.ratioPercent).toBe(75);
	});

	it('8. Détection de stagnation (is_stalled) : active suggestDecomposition et message de relance', () => {
		const stalledInput: MaturityCriteriaInput = {
			subject: {
				id: 'sub-stalled',
				name: 'Orchestration Kubernetes',
				level: 'L2_decomposed',
				is_stalled: true,
				stall_days: 18
			}
		};

		const report = computeMaturityCriteria(stalledInput);
		expect(report.isStalled).toBe(true);
		expect(report.stallDays).toBe(18);
		expect(report.suggestDecomposition).toBe(true);
		expect(report.relanceMessage).toContain('Ce sujet stagne depuis 18 jours');
		expect(report.relanceMessage).toContain('découper le sujet');
	});

	it('9. canTransitionMaturity intègre les critères calculés et retourne des motifs de refus explicites', () => {
		const humanActor = { role: 'domain_expert' as const, is_human: true };

		const criteriaInputUnmet: MaturityCriteriaInput = {
			subject: {
				id: 'sub-test',
				name: 'Test',
				level: 'L1_framed'
			},
			options: [], // 0 options -> pas de L2
			criteria: []
		};

		const resUnmet = canTransitionMaturity('L1_framed', 'L2_decomposed', humanActor, criteriaInputUnmet);
		expect(resUnmet.allowed).toBe(false);
		expect(resUnmet.code).toBe('CRITERIA_UNMET');
		expect(resUnmet.reason).toContain('Au moins 2 options d’architecture');
		expect(resUnmet.missingCriteria).toBeDefined();
		expect(resUnmet.missingCriteria?.length).toBeGreaterThan(0);
	});
});
