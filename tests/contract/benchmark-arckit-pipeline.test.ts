/**
 * Tests de contrat de l'adaptateur de banc de test boîte noire avec le pipeline ArcKit (#121).
 *
 * Vérifie :
 *   1. L'intégration du pipeline ArcKit (runRequirementsAudit) dans benchmarkRunner :
 *      - Triage des exigences (deliberated, evacuated, clarification_needed, to_qualify).
 *      - Évacuation des commodités sans polluer les sujets de délibération.
 *      - Repêchage des exigences bloquantes en "to_qualify".
 *      - Conversion des clarifications en gaps et questions.
 *      - Factorisation N clauses -> K sujets d'architecture.
 *   2. Mode S2 (autonome) avec pipeline ArcKit : bundle valide, décisions proposées, sceau canonique.
 *   3. Mode S3 (assisté) avec pipeline ArcKit : rejeu d'arbitrages experts sur sujets factorisés.
 *   4. Élicitation multi-critères approfondie via `elicit: true`.
 *   5. Intégrité cryptographique stricte (verifyEngagementBundle) sur tous les bundles produits.
 */

import { describe, it, expect } from 'vitest';
import {
	runBenchmarkCase,
	type RFPCaseInput,
	type ExpertActionFixture
} from '../../src/lib/server/benchmark/benchmarkRunner';
import { verifyEngagementBundle } from '../../src/lib/domain/bundleVerifier';
import type { LlmPort } from '../../src/lib/server/ingest/arckitRequirementsPipeline';

const RFP_TEXT_SAMPLE = `
Art. 1.1 - Autonomie temporelle GNSS
En cas de perte de signal satellite, les équipements doivent maintenir une précision sous 1.5 microseconde pendant au moins 30 jours (holdover autonome).

Art. 1.2 - Chiffrement SecNumCloud
L'hébergement des fonctions de commande doit obligatoirement être certifié SecNumCloud 3.2.

Art. 1.3 - Mobilier de bureau et aménagement
Les salles informatiques doivent être équipées de bureaux standards et de chaises ergonomiques.

Art. 1.4 - Délais de bascule réseau
La bascule entre le site primaire et le site secondaire s'effectue dans un délai nominal.
`;

const sampleCase: RFPCaseInput = {
	id: 'TC-ARCKIT-001',
	title: 'RFP Télécom Critique - Évaluation ArcKit',
	rfp_text: RFP_TEXT_SAMPLE,
	language: 'fr'
};

function createMockArcKitLlm(): LlmPort {
	return {
		async chat({ messages }) {
			const system = messages[0].content;
			// Étape 1 : Classement
			if (system.includes('Tu tries les exigences')) {
				return JSON.stringify({
					items: [
						{
							ref: '§1.1',
							category: 'NFR',
							disposition: 'deliberate',
							reason: 'Tension forte entre coût des oscillateurs rubidium et tolérance aux pannes.'
						},
						{
							ref: '§1.2',
							category: 'NFR',
							disposition: 'commodity',
							reason: 'Exigence de commodité standard du marché.' // Clause bloquante : sera repêchée en to_qualify par les invariants !
						},
						{
							ref: '§1.3',
							category: 'FAC',
							disposition: 'commodity',
							reason: 'Mobilier de bureau hors périmètre d\'architecture technique.'
						},
						{
							ref: '§1.4',
							category: 'NFR',
							disposition: 'clarify',
							question: 'Quel est le RTO/RPO maximal toléré en secondes lors de la bascule inter-site ?'
						}
					]
				});
			}

			// Étape 2 : Regroupement / Partition des sujets (3a)
			if (system.includes('cartographier les DÉCISIONS') || system.includes('décisions d\'architecture')) {
				return JSON.stringify({
					subjects: [
						{
							name: 'Autonomie de synchronisation et résilience GNSS',
							dilemma: 'Oscillateur atomique local ou distribution PTP secourue',
							sectionRef: '§1',
							coveredClauseRefs: ['§1.1']
						}
					]
				});
			}

			// Étape 3 : Instruction de sujet (3b)
			if (system.includes('Tu instruis UN sujet')) {
				return JSON.stringify({
					name: 'Autonomie de synchronisation et résilience GNSS',
					waitingForRole: 'infra_expert_architect',
					effort: 'M',
					knowledgeAlignment: 'novel_requirement',
					matchedKbItemIds: [],
					alignmentRationale: 'Non couvert par la doctrine standard.',
					seed: {
						initialQuestion: 'Quel compromis adopter entre oscillateurs locaux et distribution PTP réseau ?',
						expertQuestions: ['Quelle est la dérive maximale tolérée par les trames radio ?'],
						initialHypothesis: 'Oscillateur Rubidium local par nœud critique.',
						initialConflict: 'Le coût des horloges atomiques locales excède l\'enveloppe budgétaire initiale.',
						initialRetenu: ['§1.1 : Autonomie temporelle GNSS']
					},
					proposal: {
						options: [
							{ title: 'Oscillateur Rubidium autonome', summary: '30 jours de holdover garanti sans lien externe.' },
							{ title: 'Distribution PTP réseau secourue', summary: 'Moins coûteux mais dépend du lien opérateur.' }
						],
						criteria: [
							{ name: 'Autonomie', kind: 'compliance', weight: 5, description: 'Tenue sans GNSS' },
							{ name: 'Coût', kind: 'cost', weight: 4, description: 'Investissement initial' }
						],
						evaluations: [
							{ option: 'Oscillateur Rubidium autonome', criterion: 'Autonomie', score: 2, justification: 'Parfaite conformité' }
						]
					}
				});
			}

			// Étape 4 : Triage ATAM
			if (system.includes('ATAM') || system.includes('plan de délibération')) {
				return JSON.stringify({
					subjects: [
						{
							id: 'sub-1',
							importance: 'H',
							difficulty: 'M',
							nature: 'architecture',
							dependsOn: [],
							overlapsWith: [],
							rationale: 'Impact direct sur la conformité de l\'offre'
						}
					]
				});
			}

			// Par défaut (ex: élicitation détaillée via elicitSubjectDetails)
			return JSON.stringify({
				summary: 'Élicitation détaillée du sujet',
				criteria: [
					{ name: 'Résilience opérationnelle', description: 'Tenue en mode dégradé', kind: 'compliance', weight: 5 },
					{ name: 'Coût matériel', description: 'Investissement CAPEX', kind: 'cost', weight: 3 },
					{ name: 'Complexité MCO', description: 'Maintenance des oscillateurs', kind: 'risk', weight: 2 }
				],
				options: [
					{ title: 'Option A - Rubidium', summary: 'Autonomie maximale', origin: 'llm-proposed', status: 'proposed', kbRefs: [] },
					{ title: 'Option B - OCXO double', summary: 'Compromis 15 jours', origin: 'llm-proposed', status: 'proposed', kbRefs: [] },
					{ title: 'Option C - Réseau PTP', summary: 'Dépendance réseau', origin: 'llm-proposed', status: 'proposed', kbRefs: [] }
				],
				suppose: [{ text: 'Le site dispose d\'une climatisation stable', consequence: 'Faible dérive thermique', cost_hint: 'Inclus' }],
				conflit: [{ text: 'Contrainte budgétaire vs Holdover 30j', opposing_reference: '§1.1', requires_arbitration: true }],
				manque: [{ id: 'Q-01', question: 'Quelle est la température ambiante de la baie ?', assigned_role: 'infra_expert_architect' }]
			});
		}
	};
}

describe('Banc de Test Boîte Noire avec Pipeline ArcKit (#121)', () => {
	it('Mode S2 (Autonome) avec pipeline ArcKit : filtre les commodités, repêche les clauses dures, et produit un bundle intègre', async () => {
		const llm = createMockArcKitLlm();
		const result = await runBenchmarkCase(sampleCase, {
			mode: 's2',
			pipeline: 'arckit',
			llm,
			modelId: 'test-arckit-llm',
			referenceDate: '2026-01-01T00:00:00.000Z'
		});

		// 1. Vérification des artefacts et métriques ArcKit
		expect(result.arckitReport).toBeDefined();
		expect(result.factorizedSubjects).toBeDefined();
		expect(result.arckitReport!.totalCount).toBe(4);

		// Mobilier de bureau (§1.3) doit être évacué
		expect(result.arckitReport!.evacuatedCount).toBe(1);
		const evacuated = result.arckitReport!.requirements.find((r) => r.clauseRef === '§1.3')!;
		expect(evacuated.disposition).toBe('evacuated');
		expect(evacuated.evacuationReason).toContain('Mobilier');

		// Chiffrement SecNumCloud (§1.2) est bloquant : le LLM proposait 'commodity', mais les invariants l'ont repêché en 'to_qualify'
		const hardReq = result.arckitReport!.requirements.find((r) => r.clauseRef === '§1.2')!;
		expect(hardReq.disposition).toBe('to_qualify');
		expect(hardReq.qualifyReason).toContain('Clause bloquante');

		// Délais de bascule (§1.4) demande clarification
		const clarifyReq = result.arckitReport!.requirements.find((r) => r.clauseRef === '§1.4')!;
		expect(clarifyReq.disposition).toBe('clarification_needed');
		expect(result.questions.some((q) => q.includes('RTO/RPO'))).toBe(true);

		// 2. Les sujets d'architecture factorisés sont bien les BundleSubject du bundle
		expect(result.bundle.data.subjects.length).toBe(1);
		const subj = result.bundle.data.subjects[0];
		expect(subj.title).toBe('Autonomie de synchronisation et résilience GNSS');

		// L'exigence évacuée §1.3 ne doit PAS être rattachée aux sujets de délibération
		const evacuatedBundleReq = result.bundle.data.requirements.find((r) => r.clause_ref === '§1.3')!;
		expect(subj.requirement_ids).not.toContain(evacuatedBundleReq.id);

		// Les questions de seed sont bien rattachées
		expect(subj.open_questions!.length).toBeGreaterThanOrEqual(1);

		// 3. Conflits identifiés depuis l'instruction
		expect(result.conflicts.some((c) => c.includes('budgétaire'))).toBe(true);

		// 4. Décisions autonomes générées en mode S2
		expect(result.declared_provisional).toBe(true);
		expect(result.bundle.data.decisions).toHaveLength(1);
		expect(result.bundle.data.decisions[0].assertion_level).toBe('proposed');
		expect(result.bundle.data.decisions[0].decision).toContain('Oscillateur Rubidium');

		// 5. Validité cryptographique stricte
		const problems = verifyEngagementBundle(result.bundle);
		expect(problems).toEqual([]);
		expect(result.bundle.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
	});

	it('Mode S3 (Assisté) avec pipeline ArcKit : rejoue les arbitrages d\'experts sur les sujets factorisés', async () => {
		const llm = createMockArcKitLlm();
		const fixtures: ExpertActionFixture[] = [
			{
				topic: 'Autonomie de synchronisation',
				actor: '@lead-architect',
				action: 'arbitrate',
				selected_option: 'Oscillateur Rubidium autonome',
				decision: 'Retenu : Oscillateur Rubidium avec maintien 30 jours',
				rationale: 'Contrainte normative absolue pour le service critique.'
			}
		];

		const result = await runBenchmarkCase(sampleCase, {
			mode: 's3',
			pipeline: 'arckit',
			llm,
			expertFixtures: fixtures,
			modelId: 'test-arckit-llm'
		});

		// L'expert a interagi et arbitré le sujet factorisé
		expect(result.expert_interactions).toBe(1);
		expect(result.expert_unanswered).toBe(0);

		// Le sujet passe en L3_decided
		const subj = result.bundle.data.subjects[0];
		expect(subj.maturity).toBe('L3_decided');
		expect(subj.status).toBe('decided');

		// La décision est affirmée par l'humain
		const dec = result.bundle.data.decisions[0];
		expect(dec.assertion_level).toBe('asserted');
		expect(dec.epistemic_status).toBe('validated');
		expect(dec.provenance.by).toEqual(['@lead-architect']);

		// Sceau et intégrité vérifiés
		const problems = verifyEngagementBundle(result.bundle);
		expect(problems).toEqual([]);
	});

	it('Élicitation approfondie avec option elicit: true', async () => {
		const llm = createMockArcKitLlm();
		const result = await runBenchmarkCase(sampleCase, {
			mode: 's2',
			pipeline: 'arckit',
			llm,
			elicit: true,
			modelId: 'test-arckit-llm'
		});

		// Les questions d'élicitation issues du manque doivent être enrichies
		const subj = result.bundle.data.subjects[0];
		expect(subj.open_questions!.some((q) => q.text.includes('infra_expert_architect'))).toBe(true);

		// Le bundle reste parfaitement intègre
		const problems = verifyEngagementBundle(result.bundle);
		expect(problems).toEqual([]);
	});
});
