import { describe, it, expect } from 'vitest';
import {
	buildEngagementBundle,
	type EngagementBundle,
	type BundleSubject,
	type BundleDecision,
	type BundleStatement,
	type BundleConflict,
	type BundleCompliance,
	type BundleRequirement,
	type SourceDocument,
	type ReuseLogEntry
} from '$lib/domain/engagementBundle';
import {
	verifyEngagementBundle,
	payloadSha256,
	sealEngagementBundle
} from '$lib/domain/bundleVerifier';
import { exportEngagementBundle } from '$lib/server/bundleExportService';

describe('E2E Acte 7 — Du scénario de bout en bout au dossier scellé (A18 - e2e-acte-7)', () => {
	// Données complètes issues du déroulé des Actes 0 à 6
	const sourceDoc: SourceDocument = {
		id: 'DOC-rfp-nordwave-mcx',
		kind: 'rfp',
		title: 'CCTP 5G & MCX — Plateforme d automatisation',
		language: 'fr',
		sha256: '0e6c1ef7cf614ff607ff8a16d7ec2071d0ca975d31ae7acee9f80d8949488766'
	};

	const requirements: BundleRequirement[] = [
		{
			id: 'REQ-mcx-4.1',
			source_document_id: 'DOC-rfp-nordwave-mcx',
			clause_ref: '4.1',
			text: 'La restauration de la configuration réseau doit s effectuer sans intervention manuelle.',
			language: 'fr'
		},
		{
			id: 'REQ-mcx-4.2',
			source_document_id: 'DOC-rfp-nordwave-mcx',
			clause_ref: '4.2',
			text: 'Notification obligatoire des incidents majeurs sous 24h selon NIS2.',
			language: 'fr'
		}
	];

	const subjectRipe: BundleSubject = {
		id: 'SUBJ-config-restore',
		title: 'Restauration de la configuration réseau',
		domains: ['network-automation'],
		maturity: 'L3_decided',
		status: 'decided',
		requirement_ids: ['REQ-mcx-4.1'],
		decision_ids: ['DEC-001']
	};

	const subjectUnripe: BundleSubject = {
		id: 'SUBJ-incident-notify',
		title: 'Notification d incident NIS2',
		domains: ['security-governance'],
		maturity: 'L1_framed',
		status: 'open',
		requirement_ids: ['REQ-mcx-4.2'],
		decision_ids: ['DEC-002']
	};

	const reuseLogEntry: ReuseLogEntry = {
		id: 'RL-001',
		matched_ref: 'ADR-0001',
		outcome: 'reused',
		assumptions: [
			{ text: 'Le plan de contrôle gère moins de 10 000 équipements.', status: 'holds' },
			{ text: 'Chaque site conserve un accès out-of-band.', status: 'holds' }
		],
		comment: null,
		by: '@lead-architect',
		at: '2026-10-03T14:00:00Z'
	};

	const decisionAsserted: BundleDecision = {
		id: 'DEC-001',
		subject_id: 'SUBJ-config-restore',
		status: 'reused',
		epistemic_status: 'reused_confirmed',
		assertion_level: 'asserted',
		decision: 'Déploiement d un réseau de secours out-of-band pour le plan de contrôle.',
		justification: 'Réutilisation confirmée du motif ADR-0001 avec toutes hypothèses validées.',
		derived_from: {
			kb_ref: 'ADR-0001',
			reuse_log_id: 'RL-001'
		},
		provenance: {
			basis: 'reuse_confirmation',
			by: ['@lead-architect'],
			at: '2026-10-03T14:00:00Z'
		}
	};

	const decisionProposed: BundleDecision = {
		id: 'DEC-002',
		subject_id: 'SUBJ-incident-notify',
		status: 'proposed',
		epistemic_status: 'ai_proposed',
		assertion_level: 'proposed',
		decision: 'Automatisation de l alerte CSIRT via webhook sécurisé.',
		justification: 'Proposition issue du débat d architecture (non encore validée par un humain).',
		provenance: {
			basis: 'ai_proposal',
			by: ['@archinex-ai'],
			at: '2026-10-03T14:00:00Z'
		}
	};

	const statementAsserted: BundleStatement = {
		id: 'ST-001',
		subject_id: 'SUBJ-config-restore',
		epistemic_status: 'validated',
		assertion_level: 'asserted',
		text: 'Bande passante out-of-band garantie à 1 Gbps.',
		property: 'oob_bandwidth',
		value: '1 Gbps',
		provenance: {
			basis: 'human_validation',
			by: ['@lead-architect'],
			at: '2026-10-03T14:00:00Z'
		}
	};

	const complianceEntry: BundleCompliance = {
		id: 'CMP-001',
		requirement_id: 'REQ-mcx-4.1',
		control_ref: 'ADR-0001',
		epistemic_status: 'validated',
		assertion_level: 'asserted',
		implementation_statement: 'Mis en œuvre via le réseau OOB dédié.',
		decision_ids: ['DEC-001'],
		provenance: {
			basis: 'human_validation',
			by: ['@lead-architect'],
			at: '2026-10-03T14:00:00Z'
		}
	};

	it('1. Exporte le dossier d engagement complet et passe le vérificateur TypeScript A16', () => {
		const bundle = buildEngagementBundle({
			engagement: {
				id: 'eng-nordwave-mcx',
				title: 'Plateforme 5G MCX Nordwave',
				language: 'fr',
				confidentiality: 'internal',
				client_label: 'Opérateur Nordwave'
			},
			pins: {
				llmops_contract_version: '1.13',
				kb: {
					snapshot_id: 'snapshot-2026-10-02-live',
					payload_sha256: 'db07996b49af0b2c782fd8831a115807764189c730bfb09b2853ba5db953f856'
				}
			},
			sourceDocuments: [sourceDoc],
			requirements,
			subjects: [subjectRipe, subjectUnripe],
			decisions: [decisionAsserted, decisionProposed],
			statements: [statementAsserted],
			compliance: [complianceEntry],
			kbReferences: [
				{
					ref: 'ADR-0001',
					version: 'v1.0',
					citable: true,
					confidence: 'verified',
					title: 'Out-of-band management network'
				}
			],
			reuseLog: [reuseLogEntry]
		});

		const problems = verifyEngagementBundle(bundle);
		expect(problems).toEqual([]);
	});

	it('2. Rejette les cas de mutation (sceau altéré, niveau asserted sans validateur)', () => {
		const bundle = buildEngagementBundle({
			engagement: {
				id: 'eng-nordwave-mcx',
				title: 'Plateforme 5G MCX Nordwave',
				language: 'fr',
				confidentiality: 'internal',
				client_label: 'Opérateur Nordwave'
			},
			sourceDocuments: [sourceDoc],
			requirements,
			subjects: [subjectRipe, subjectUnripe],
			decisions: [decisionAsserted, decisionProposed],
			statements: [statementAsserted],
			compliance: [complianceEntry],
			kbReferences: [{ ref: 'ADR-0001', citable: true }],
			reuseLog: [reuseLogEntry]
		});

		// Mutation 1 : Altération du sceau
		const tampered = structuredClone(bundle);
		tampered.checksum = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
		expect(verifyEngagementBundle(tampered).map((p) => p.code)).toContain('SEAL');

		// Mutation 2 : Affirmation sans validateur humain
		const unbacked = structuredClone(bundle);
		unbacked.data.statements[0].provenance.by = [];
		const sealedUnbacked = sealEngagementBundle(unbacked);
		expect(verifyEngagementBundle(sealedUnbacked).map((p) => p.code)).toContain('UNBACKED_CLAIM');
	});

	it('3. Épinglage KB : tout actif cité doit figurer dans kb_references', () => {
		const bundle = buildEngagementBundle({
			engagement: {
				id: 'eng-nordwave-mcx',
				title: 'Plateforme 5G MCX Nordwave',
				language: 'fr',
				confidentiality: 'internal',
				client_label: 'Opérateur Nordwave'
			},
			sourceDocuments: [sourceDoc],
			requirements,
			subjects: [subjectRipe],
			decisions: [decisionAsserted],
			statements: [statementAsserted],
			compliance: [complianceEntry],
			kbReferences: [], // Omission intentionnelle de ADR-0001
			reuseLog: [reuseLogEntry]
		});

		const problems = verifyEngagementBundle(bundle);
		expect(problems.map((p) => p.code)).toContain('KB_REF_UNLISTED');
	});

	it('4. Réutilisation : une décision issue de la base renvoie à son entrée du journal avec hypothèses jugées', () => {
		const unverifiedReuseLog: ReuseLogEntry = {
			...reuseLogEntry,
			assumptions: [{ text: 'Hypothèse non jugée', status: 'unknown' }]
		};

		const bundle = buildEngagementBundle({
			engagement: {
				id: 'eng-nordwave-mcx',
				title: 'Plateforme 5G MCX Nordwave',
				language: 'fr',
				confidentiality: 'internal',
				client_label: 'Opérateur Nordwave'
			},
			sourceDocuments: [sourceDoc],
			requirements,
			subjects: [subjectRipe],
			decisions: [decisionAsserted],
			statements: [statementAsserted],
			compliance: [complianceEntry],
			kbReferences: [{ ref: 'ADR-0001', citable: true }],
			reuseLog: [unverifiedReuseLog]
		});

		const problems = verifyEngagementBundle(bundle);
		expect(problems.map((p) => p.code)).toContain('REUSE_UNBACKED');
	});

	it('5. Deux étages épistémiques : is_provisional dérive rigoureusement de la maturité et des conflits', () => {
		// Tant que SUBJ-incident-notify est L1_framed, le bundle entier est provisoire
		const provisionalBundle = buildEngagementBundle({
			engagement: {
				id: 'eng-nordwave-mcx',
				title: 'Plateforme 5G MCX',
				language: 'fr',
				confidentiality: 'internal',
				client_label: 'Opérateur'
			},
			subjects: [subjectRipe, subjectUnripe],
			decisions: [decisionAsserted, decisionProposed],
			statements: [statementAsserted],
			kbReferences: [{ ref: 'ADR-0001', citable: true }],
			reuseLog: [reuseLogEntry]
		});

		expect(provisionalBundle.data.is_provisional).toBe(true);
		expect(provisionalBundle.data.provisional_reasons.unripe_subjects).toEqual(['SUBJ-incident-notify']);

		// Quand tous les sujets atteignent L3_decided et zéro conflit
		const matureSubjectUnripe: BundleSubject = {
			...subjectUnripe,
			maturity: 'L3_decided',
			status: 'decided',
			decision_ids: ['DEC-002']
		};
		const matureDecision: BundleDecision = {
			...decisionProposed,
			status: 'validated',
			epistemic_status: 'validated',
			assertion_level: 'asserted',
			provenance: {
				basis: 'human_validation',
				by: ['@lead-architect'],
				at: '2026-10-03T14:30:00Z'
			}
		};

		const matureBundle = buildEngagementBundle({
			engagement: {
				id: 'eng-nordwave-mcx',
				title: 'Plateforme 5G MCX',
				language: 'fr',
				confidentiality: 'internal',
				client_label: 'Opérateur'
			},
			subjects: [subjectRipe, matureSubjectUnripe],
			decisions: [decisionAsserted, matureDecision],
			statements: [statementAsserted],
			kbReferences: [{ ref: 'ADR-0001', citable: true }],
			reuseLog: [reuseLogEntry]
		});

		expect(matureBundle.data.is_provisional).toBe(false);
		expect(matureBundle.data.provisional_reasons.unripe_subjects).toEqual([]);
		expect(matureBundle.data.provisional_reasons.open_conflicts).toEqual([]);
	});

	it('6. Proposé jamais affirmé : une proposition IA non validée reste proposed', () => {
		expect(decisionProposed.epistemic_status).toBe('ai_proposed');
		expect(decisionProposed.assertion_level).toBe('proposed');
		expect(decisionProposed.status).toBe('proposed');
	});

	it('7. Déterminisme absolu : deux exports du même état donnent le même checksum exact', () => {
		const params = {
			engagement: {
				id: 'eng-mcx-deterministic',
				title: 'Test Déterminisme',
				language: 'fr',
				confidentiality: 'internal' as const,
				client_label: 'Client'
			},
			subjects: [subjectRipe],
			decisions: [decisionAsserted],
			statements: [statementAsserted],
			kbReferences: [{ ref: 'ADR-0001', citable: true }],
			reuseLog: [reuseLogEntry],
			createdAt: '2026-10-03T12:00:00Z',
			snapshotId: 'snap-001'
		};

		const export1 = buildEngagementBundle(params);
		const export2 = buildEngagementBundle(params);

		expect(export1.checksum).toBe(export2.checksum);
		expect(payloadSha256(export1.data)).toBe(payloadSha256(export2.data));
	});

	it('8. Vie privée : aucune adresse e-mail dans le fichier, handles uniquement', () => {
		const bundle = buildEngagementBundle({
			engagement: {
				id: 'eng-privacy',
				title: 'Privacy Test',
				language: 'fr',
				confidentiality: 'internal',
				client_label: 'Client'
			},
			subjects: [subjectRipe],
			decisions: [decisionAsserted],
			statements: [statementAsserted],
			kbReferences: [{ ref: 'ADR-0001', citable: true }],
			reuseLog: [reuseLogEntry]
		});

		const serialized = JSON.stringify(bundle);
		const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
		expect(emailPattern.test(serialized)).toBe(false);

		// Les acteurs sont des handles
		expect(decisionAsserted.provenance.by[0]).toBe('@lead-architect');
		expect(reuseLogEntry.by).toBe('@lead-architect');
	});
});
