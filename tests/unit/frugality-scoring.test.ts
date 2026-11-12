import { describe, it, expect } from 'vitest';
import {
	extractSubjectFrugalityOpportunity,
	computeTopFrugalityOpportunities,
	type SubjectMatrixInput
} from '$lib/domain/frugalityScoring';

describe('Frugality Opportunities Domain Logic', () => {
	it('identifie un "no-brainer" où l\'option frugale est plus économique sans compromis technique', () => {
		const subject: SubjectMatrixInput = {
			id: 'subj-1',
			name: 'Base de données relationnelle',
			sectionRef: '§2.1',
			criteria: [
				{ id: 'crit-cost', name: 'Coût TCO', kind: 'cost', weight: 4 },
				{ id: 'crit-perf', name: 'Performance requise', kind: 'functional', weight: 5 }
			],
			options: [
				{
					id: 'opt-pg',
					title: 'PostgreSQL Managé',
					summary: 'Instance managée avec réplication HA',
					evaluations: [
						{ criterionId: 'crit-cost', score: 2, justification: 'Coût modéré et licences open-source' },
						{ criterionId: 'crit-perf', score: 1, justification: 'Amplement suffisant pour les 500 TPS' }
					]
				},
				{
					id: 'opt-spanner',
					title: 'Cloud Spanner',
					summary: 'Base distribuée multi-régions',
					evaluations: [
						{ criterionId: 'crit-cost', score: -1, justification: 'Tarification plancher très élevée' },
						{ criterionId: 'crit-perf', score: 1, justification: 'Haute scalabilité globale' }
					]
				}
			]
		};

		const opp = extractSubjectFrugalityOpportunity(subject);
		expect(opp).not.toBeNull();
		expect(opp?.frugalOption.id).toBe('opt-pg');
		expect(opp?.referenceOption.id).toBe('opt-spanner');
		expect(opp?.costDelta).toBe(3); // 2 - (-1)
		expect(opp?.techDelta).toBe(0); // 1 - 1
		expect(opp?.verdict).toBe('no-brainer');
		expect(opp?.decisionStatus).toBe('open');
	});

	it('identifie un compromis technique acceptable', () => {
		const subject: SubjectMatrixInput = {
			id: 'subj-2',
			name: 'Stockage & Archivage',
			sectionRef: '§3.4',
			criteria: [
				{ id: 'c-cost', name: 'Coût stockage', kind: 'cost', weight: 3 },
				{ id: 'c-rpo', name: 'RPO / Latence', kind: 'nfr', weight: 4 }
			],
			options: [
				{
					id: 'opt-s3-glacier',
					title: 'S3 Standard + Glacier',
					summary: 'Archivage avec cycle de vie automatique',
					evaluations: [
						{ criterionId: 'c-cost', score: 2, justification: 'Économie de 60% sur le stockage froid' },
						{ criterionId: 'c-rpo', score: 0.8, justification: 'Délai de restauration de quelques minutes' }
					]
				},
				{
					id: 'opt-multi-active',
					title: 'Multi-Cloud Actif-Actif',
					summary: 'Réplication temps réel synchrone',
					evaluations: [
						{ criterionId: 'c-cost', score: -1, justification: 'Double facturation et bande passante sortante' },
						{ criterionId: 'c-rpo', score: 1.5, justification: 'RPO quasi-nul en temps réel' }
					]
				}
			]
		};

		const opp = extractSubjectFrugalityOpportunity(subject);
		expect(opp).not.toBeNull();
		expect(opp?.frugalOption.id).toBe('opt-s3-glacier');
		expect(opp?.costDelta).toBe(3);
		expect(opp?.techDelta).toBeCloseTo(0.7, 1);
		expect(opp?.verdict).toBe('acceptable-tradeoff');
	});

	it('identifie un compromis technique minime', () => {
		const subject: SubjectMatrixInput = {
			id: 'subj-2b',
			name: 'Cache applicatif',
			sectionRef: '§3.5',
			criteria: [
				{ id: 'c-cost', name: 'Coût', kind: 'cost', weight: 3 },
				{ id: 'c-hit', name: 'Hit ratio', kind: 'nfr', weight: 4 }
			],
			options: [
				{
					id: 'opt-redis-single',
					title: 'Redis Standalone',
					summary: 'Instance simple avec persistance',
					evaluations: [
						{ criterionId: 'c-cost', score: 2, justification: 'Coût très faible' },
						{ criterionId: 'c-hit', score: 1.0, justification: 'Très bon débit' }
					]
				},
				{
					id: 'opt-redis-cluster',
					title: 'Redis Cluster 6 Nœuds',
					summary: 'Cluster distribué sharding',
					evaluations: [
						{ criterionId: 'c-cost', score: -0.5, justification: '6 instances coûteuses' },
						{ criterionId: 'c-hit', score: 1.2, justification: 'Hit ratio maximal' }
					]
				}
			]
		};

		const opp = extractSubjectFrugalityOpportunity(subject);
		expect(opp).not.toBeNull();
		expect(opp?.costDelta).toBe(2.5);
		expect(opp?.techDelta).toBeCloseTo(0.2, 1);
		expect(opp?.verdict).toBe('negligible-compromise');
	});

	it('ignore un sujet si le compromis technique est dramatique (techDelta > 1.0)', () => {
		const subject: SubjectMatrixInput = {
			id: 'subj-3',
			name: 'Chiffrement HSM',
			sectionRef: '§6.1',
			criteria: [
				{ id: 'c-cost', name: 'Coût', kind: 'cost', weight: 3 },
				{ id: 'c-sec', name: 'Sécurité et certification', kind: 'compliance', weight: 5 }
			],
			options: [
				{
					id: 'opt-software-keys',
					title: 'Clés logicielles sur disque',
					summary: 'Pas de boîtier cryptographique dédié',
					evaluations: [
						{ criterionId: 'c-cost', score: 2, justification: 'Gratuit' },
						{ criterionId: 'c-sec', score: -2, justification: 'Non conforme aux exigences ANSSI/SecNumCloud' }
					]
				},
				{
					id: 'opt-hsm',
					title: 'HSM Dédié Qualifié',
					summary: 'Appliance physique certifiée',
					evaluations: [
						{ criterionId: 'c-cost', score: -1, justification: 'Coût d acquisition élevé' },
						{ criterionId: 'c-sec', score: 2, justification: 'Conformité totale et inviolabilité' }
					]
				}
			]
		};

		const opp = extractSubjectFrugalityOpportunity(subject);
		// techDelta = 2 - (-2) = 4 > 0.8 -> rejeté car compromis inacceptable
		expect(opp).toBeNull();
	});

	it('ignore un sujet sans critère de coût ou avec une seule option', () => {
		const subjectWithoutCost: SubjectMatrixInput = {
			id: 'subj-4',
			name: 'Choix de protocole',
			sectionRef: '§1.2',
			criteria: [{ id: 'c-perf', name: 'Débit', kind: 'nfr', weight: 3 }],
			options: [
				{ id: 'opt-grpc', title: 'gRPC', summary: 'RPC', evaluations: [{ criterionId: 'c-perf', score: 1 }] },
				{ id: 'opt-rest', title: 'REST', summary: 'HTTP', evaluations: [{ criterionId: 'c-perf', score: 0 }] }
			]
		};
		expect(extractSubjectFrugalityOpportunity(subjectWithoutCost)).toBeNull();
	});

	it('calcule et classe le Top 5 des opportunités', () => {
		const subjects: SubjectMatrixInput[] = [
			{
				id: 's1',
				name: 'Sujet Petit Gain',
				sectionRef: '§1.0',
				criteria: [
					{ id: 'cost', name: 'Coût', kind: 'cost', weight: 3 },
					{ id: 'perf', name: 'Perf', kind: 'nfr', weight: 3 }
				],
				options: [
					{
						id: 'o1',
						title: 'Frugal',
						summary: '',
						evaluations: [
							{ criterionId: 'cost', score: 1 },
							{ criterionId: 'perf', score: 1 }
						]
					},
					{
						id: 'o2',
						title: 'Ref',
						summary: '',
						evaluations: [
							{ criterionId: 'cost', score: 0.4 },
							{ criterionId: 'perf', score: 1.1 }
						]
					}
				]
			},
			{
				id: 's2',
				name: 'Sujet Énorme Gain',
				sectionRef: '§2.0',
				criteria: [
					{ id: 'cost', name: 'Coût', kind: 'cost', weight: 3 },
					{ id: 'perf', name: 'Perf', kind: 'nfr', weight: 3 }
				],
				options: [
					{
						id: 'o3',
						title: 'Frugal 2',
						summary: '',
						evaluations: [
							{ criterionId: 'cost', score: 2 },
							{ criterionId: 'perf', score: 1.5 }
						]
					},
					{
						id: 'o4',
						title: 'Ref 2',
						summary: '',
						evaluations: [
							{ criterionId: 'cost', score: -1.5 },
							{ criterionId: 'perf', score: 1.5 }
						]
					}
				]
			}
		];

		const top = computeTopFrugalityOpportunities(subjects, 5);
		expect(top.length).toBe(2);
		expect(top[0].subjectId).toBe('s2'); // Le plus gros gain passe en premier
		expect(top[0].verdict).toBe('no-brainer');
	});
});
