import { describe, it, expect } from 'vitest';
import { computeMaturity, type MaturityComputationInput } from '$lib/domain/maturityRules';
import type { Criterion, Option, OptionEvaluation } from '$lib/domain/options';
import type { Argument } from '$lib/domain/debate';

describe('Lot A4 Contract: Maturity Rules & Arbitration Gate (computeMaturity)', () => {
	const baseSubject = {
		id: 'subj-test-1',
		name: 'Cœur de Réseau 5G & Tranches',
		problemStatement: 'Définir la topologie de déploiement du User Plane Function (UPF) pour garantir la latence ultra-faible.',
		maturityLevel: 'L0_named' as const
	};

	const crit1: Criterion = {
		id: 'crit-latence',
		subjectId: 'subj-test-1',
		name: 'Latence de transmission',
		description: 'Délai RTT sous 5ms',
		kind: 'nfr',
		weight: 5,
		author: 'Lead Architect',
		role: 'lead_architect',
		productionMode: 'human-authored',
		version: 1
	};

	const crit2: Criterion = {
		id: 'crit-resilience',
		subjectId: 'subj-test-1',
		name: 'Résilience & Redondance',
		description: 'Tolérance à la perte de site sans rupture de session',
		kind: 'risk',
		weight: 4,
		author: 'Lead Architect',
		role: 'lead_architect',
		productionMode: 'human-authored',
		version: 1
	};

	const opt1: Option = {
		id: 'opt-centralise',
		subjectId: 'subj-test-1',
		title: 'UPF Centralisé en Datacenter Régional',
		summary: 'Mutualisation des serveurs physiques',
		origin: 'human',
		kbRefs: ['SEC-001'],
		status: 'debated',
		author: 'Lead Architect',
		role: 'lead_architect',
		productionMode: 'human-authored',
		version: 1
	};

	const opt2: Option = {
		id: 'opt-edge',
		subjectId: 'subj-test-1',
		title: 'UPF Décentralisé au plus près de l\'antenne (Edge)',
		summary: 'Distribution des pods UPF sur micro-DC',
		origin: 'llm-proposed',
		kbRefs: ['NET-042'],
		status: 'debated',
		author: 'AI Assistant',
		role: 'AI Assistant',
		productionMode: 'llm-derived',
		version: 1
	};

	const evalOpt1Crit1: OptionEvaluation = {
		optionId: 'opt-centralise',
		criterionId: 'crit-latence',
		score: -1,
		justification: 'Latence de 12ms non conforme au SLA ultra-faible latence.',
		evidenceRefs: [],
		author: 'Lead Architect',
		role: 'lead_architect',
		productionMode: 'human-authored',
		version: 1
	};

	const evalOpt1Crit2: OptionEvaluation = {
		optionId: 'opt-centralise',
		criterionId: 'crit-resilience',
		score: 2,
		justification: 'Datacenter régional hautement redondé avec alimentation double adduction.',
		evidenceRefs: [],
		author: 'Lead Architect',
		role: 'lead_architect',
		productionMode: 'human-authored',
		version: 1
	};

	const evalOpt2Crit1: OptionEvaluation = {
		optionId: 'opt-edge',
		criterionId: 'crit-latence',
		score: 2,
		justification: 'Latence mesurée sous 2ms en local sur le site antenne.',
		evidenceRefs: [],
		author: 'Lead Architect',
		role: 'lead_architect',
		productionMode: 'human-authored',
		version: 1
	};

	const evalOpt2Crit2: OptionEvaluation = {
		optionId: 'opt-edge',
		criterionId: 'crit-resilience',
		score: 0,
		justification: 'Vulnérabilité aux pannes physiques locales isolées.',
		evidenceRefs: [],
		author: 'Lead Architect',
		role: 'lead_architect',
		productionMode: 'human-authored',
		version: 1
	};

	it('1. Détecte MISSING_PROBLEM_STATEMENT et reste à L0_named si le cadrage est vide', () => {
		const res = computeMaturity({
			subject: { ...baseSubject, problemStatement: '' },
			criteria: [crit1, crit2],
			options: [opt1, opt2],
			evaluations: [evalOpt1Crit1, evalOpt1Crit2, evalOpt2Crit1, evalOpt2Crit2],
			arguments: []
		});

		expect(res.level).toBe('L0_named');
		expect(res.readyForArbitration).toBe(false);
		expect(res.blockers.some((b) => b.code === 'MISSING_PROBLEM_STATEMENT')).toBe(true);
	});

	it('2. Détecte MISSING_CRITERIA si moins de 2 critères sont définis', () => {
		const res = computeMaturity({
			subject: baseSubject,
			criteria: [crit1],
			options: [opt1, opt2],
			evaluations: [evalOpt1Crit1, evalOpt2Crit1],
			arguments: []
		});

		expect(res.level).toBe('L0_named');
		expect(res.readyForArbitration).toBe(false);
		expect(res.blockers.some((b) => b.code === 'MISSING_CRITERIA')).toBe(true);
	});

	it('3. Détecte INSUFFICIENT_OPTIONS si moins de 2 options sont définies et cale à L1_framed', () => {
		const res = computeMaturity({
			subject: baseSubject,
			criteria: [crit1, crit2],
			options: [opt1],
			evaluations: [evalOpt1Crit1, evalOpt1Crit2],
			arguments: []
		});

		expect(res.level).toBe('L1_framed');
		expect(res.readyForArbitration).toBe(false);
		expect(res.blockers.some((b) => b.code === 'INSUFFICIENT_OPTIONS')).toBe(true);
	});

	it('4. Détecte UNEVALUATED_OPTION si une option manque d\'évaluation sur un critère', () => {
		const res = computeMaturity({
			subject: baseSubject,
			criteria: [crit1, crit2],
			options: [opt1, opt2],
			evaluations: [evalOpt1Crit1, evalOpt1Crit2, evalOpt2Crit1], // evalOpt2Crit2 manque
			arguments: []
		});

		expect(res.level).toBe('L1_framed');
		expect(res.readyForArbitration).toBe(false);
		const blocker = res.blockers.find((b) => b.code === 'UNEVALUATED_OPTION');
		expect(blocker).toBeDefined();
		expect(blocker?.targetId).toBe(opt2.id);
	});

	it('5. Détecte OPEN_OBJECTION si une objection du débat est toujours ouverte', () => {
		const openObjection: Argument = {
			id: 'arg-obj-1',
			subjectId: baseSubject.id,
			optionId: opt2.id,
			stance: 'objection',
			claim: 'Surcoût opérationnel des micro-DC',
			grounds: 'La dispersion sur 45 sites multiplie le coût de MCO par 3.',
			kbRefs: [],
			confidence: 'assumed',
			author: 'Challenger',
			authorKind: 'agent:challenger',
			productionMode: 'llm-derived',
			round: 1,
			resolution: 'open',
			version: 1
		};

		const res = computeMaturity({
			subject: baseSubject,
			criteria: [crit1, crit2],
			options: [opt1, opt2],
			evaluations: [evalOpt1Crit1, evalOpt1Crit2, evalOpt2Crit1, evalOpt2Crit2],
			arguments: [openObjection]
		});

		expect(res.level).toBe('L2_decomposed');
		expect(res.readyForArbitration).toBe(false);
		expect(res.blockers.some((b) => b.code === 'OPEN_OBJECTION')).toBe(true);
	});

	it('6. Lève le blocage d\'objection si l\'objection est "accepted_risk" ou "answered"', () => {
		const resolvedObjection: Argument = {
			id: 'arg-obj-1',
			subjectId: baseSubject.id,
			optionId: opt2.id,
			stance: 'objection',
			claim: 'Surcoût opérationnel des micro-DC',
			grounds: 'La dispersion sur 45 sites multiplie le coût de MCO par 3.',
			kbRefs: [],
			confidence: 'assumed',
			author: 'Challenger',
			authorKind: 'agent:challenger',
			productionMode: 'llm-derived',
			round: 1,
			resolution: 'accepted_risk',
			resolvedBy: 'Lead Architect',
			version: 2
		};

		const res = computeMaturity({
			subject: baseSubject,
			criteria: [crit1, crit2],
			options: [opt1, opt2],
			evaluations: [evalOpt1Crit1, evalOpt1Crit2, evalOpt2Crit1, evalOpt2Crit2],
			arguments: [resolvedObjection]
		});

		expect(res.level).toBe('L2_decomposed');
		expect(res.blockers.some((b) => b.code === 'OPEN_OBJECTION')).toBe(false);
		expect(res.readyForArbitration).toBe(true);
	});

	it('7. Détecte UNRESOLVED_VIOLATION si une vérification de violation n\'est pas couverte par acceptedViolations', () => {
		const violationArg: Argument = {
			id: 'arg-verif-viol',
			subjectId: baseSubject.id,
			optionId: opt1.id,
			stance: 'verification',
			claim: 'Violation de la doctrine de résilience télécom',
			grounds: 'Non conforme à la règle NIS2-042 sur la redondance géographique distante.',
			kbRefs: ['NIS2-042'],
			confidence: 'assumed',
			author: 'Verifier',
			authorKind: 'agent:verifier',
			productionMode: 'llm-derived',
			round: 1,
			resolution: 'open',
			version: 1
		};

		// Sans acceptedViolations
		const res1 = computeMaturity({
			subject: baseSubject,
			criteria: [crit1, crit2],
			options: [opt1, opt2],
			evaluations: [evalOpt1Crit1, evalOpt1Crit2, evalOpt2Crit1, evalOpt2Crit2],
			arguments: [violationArg]
		});
		expect(res1.readyForArbitration).toBe(false);
		expect(res1.blockers.some((b) => b.code === 'UNRESOLVED_VIOLATION')).toBe(true);

		// Avec exception justifiée
		const res2 = computeMaturity({
			subject: baseSubject,
			criteria: [crit1, crit2],
			options: [opt1, opt2],
			evaluations: [evalOpt1Crit1, evalOpt1Crit2, evalOpt2Crit1, evalOpt2Crit2],
			arguments: [violationArg],
			acceptedViolations: [
				{ typedId: 'NIS2-042', justification: 'Dispense accordée par l\'ANSSI pour la phase pilote.' }
			]
		});
		expect(res2.blockers.some((b) => b.code === 'UNRESOLVED_VIOLATION')).toBe(false);
		expect(res2.readyForArbitration).toBe(true);
	});

	it('8. Détecte OPEN_BLOCKING_QUESTION si une question bloquante est en suspens', () => {
		const blockingQuestion: Argument = {
			id: 'arg-q-1',
			subjectId: baseSubject.id,
			stance: 'question',
			claim: 'Question bloquante sur l\'homologation secrète défense',
			grounds: 'Le client exige-t-il une certification SecNumCloud 3.2 dès la tranche 1 ?',
			kbRefs: [],
			confidence: 'assumed',
			author: 'Synthesizer',
			authorKind: 'agent:synthesizer',
			productionMode: 'llm-derived',
			round: 1,
			resolution: 'open',
			version: 1
		};

		const res = computeMaturity({
			subject: baseSubject,
			criteria: [crit1, crit2],
			options: [opt1, opt2],
			evaluations: [evalOpt1Crit1, evalOpt1Crit2, evalOpt2Crit1, evalOpt2Crit2],
			arguments: [blockingQuestion]
		});

		expect(res.readyForArbitration).toBe(false);
		expect(res.blockers.some((b) => b.code === 'OPEN_BLOCKING_QUESTION')).toBe(true);
	});

	it('9. Détecte COVERAGE_INCOMPLETE si un référentiel requis n\'est pas "covered"', () => {
		const res = computeMaturity({
			subject: baseSubject,
			criteria: [crit1, crit2],
			options: [opt1, opt2],
			evaluations: [evalOpt1Crit1, evalOpt1Crit2, evalOpt2Crit1, evalOpt2Crit2],
			arguments: [],
			requiredFrameworks: [
				{ frameworkId: 'NIS2', name: 'Directive NIS 2', status: 'covered' },
				{ frameworkId: 'RGS_V2', name: 'Référentiel Général de Sécurité v2', status: 'partial' }
			]
		});

		expect(res.readyForArbitration).toBe(false);
		const fwBlocker = res.blockers.find((b) => b.code === 'COVERAGE_INCOMPLETE');
		expect(fwBlocker).toBeDefined();
		expect(fwBlocker?.targetId).toBe('RGS_V2');
	});

	it('10. Valide readyForArbitration: true quand toutes les exigences sont satisfaites', () => {
		const res = computeMaturity({
			subject: baseSubject,
			criteria: [crit1, crit2],
			options: [opt1, opt2],
			evaluations: [evalOpt1Crit1, evalOpt1Crit2, evalOpt2Crit1, evalOpt2Crit2],
			arguments: [],
			requiredFrameworks: [
				{ frameworkId: 'NIS2', name: 'Directive NIS 2', status: 'covered' }
			]
		});

		expect(res.level).toBe('L2_decomposed');
		expect(res.readyForArbitration).toBe(true);
		expect(res.blockers.length).toBe(0);
	});

	it('11. Préserve L3_decided, L4_specified ou L5_archived et n\'autorise plus de ré-arbitrage sans révision', () => {
		const resL3 = computeMaturity({
			subject: { ...baseSubject, maturityLevel: 'L3_decided' },
			criteria: [crit1, crit2],
			options: [opt1, opt2],
			evaluations: [evalOpt1Crit1, evalOpt1Crit2, evalOpt2Crit1, evalOpt2Crit2],
			arguments: []
		});

		expect(resL3.level).toBe('L3_decided');
		expect(resL3.readyForArbitration).toBe(false);
		expect(resL3.blockers.length).toBe(0);
	});
});
