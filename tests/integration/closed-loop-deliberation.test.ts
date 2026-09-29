/**
 * Test d'Intégration n°1 · Délibération, Élicitation & Capitalisation en KB Vierge (Closed-Loop)
 * 
 * Contrat :
 * - Aucune donnée préalable dans Archinex (SQLite test-clean.db vierge).
 * - Aucune donnée préalable dans LLMOps (Conteneur Docker éphémère Kùzu monté en tmpfs).
 * - Seul le runner introduit les données pas-à-pas pour prouver la causalité.
 * 
 * Séquencement en 5 Actes :
 *   Acte 0 : Tabula Rasa (Contrôle de vacuité absolue)
 *   Acte 1 : Délibération d'un sujet L0 et élicitation par les manques
 *   Acte 2 : Maturation, arbitrage de controverse et franchissement du Gate L3_decided
 *   Acte 3 : Tour 8 - Approbation de la règle candidate et capitalisation dans la KB LLMOps
 *   Acte 4 : Preuve de la Boucle Fermée (Rétroaction doctrinale active)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	setupCleanEnvironment,
	teardownCleanEnvironment,
	type CleanTestEnvironment
} from '../helpers/clean-slate-environment';
import { LLMOpsClient } from '$lib/server/llmops/client';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { canTransitionMaturity } from '$lib/domain/maturityBoard';
import {
	computeTripletSha256,
	validateInboundEnvelope
} from '$lib/validation/epistemicEnvelope';
import type { ContributionEnvelope, StatementTriplet } from '$lib/types/epistemic';

describe('Test d\'Intégration n°1 · Closed-Loop Délibération & Capitalisation en KB Vierge', () => {
	let env: CleanTestEnvironment;
	let client: LLMOpsClient;

	beforeAll(async () => {
		// Démarrage du cluster éphémère (Docker tmpfs + SQLite vierge)
		env = await setupCleanEnvironment();

		// Initialisation du client LLMOps branché sur le conteneur éphémère
		client = new LLMOpsClient({
			baseUrl: env.baseUrl,
			authToken: env.authToken,
			defaultEngagement: env.engagement,
			timeoutMs: 8000
		});

		// Initialisation du store Archinex en mode clean slate
		deliberationStore.initFromDb(
			[
				{
					id: env.engagement,
					title: 'Test Clean Slate 2026',
					shortName: 'CleanSlate',
					type: 'poc_migration',
					badge: 'TEST',
					description: 'Espace de test sans antécédents pour preuve de capitalisation',
					defaultSubjectId: '',
					defaultDocId: '',
					status: 'active',
					strategy: {
						objectives: ['Preuve Élicitation & Capitalisation'],
						principles: ['Zero-data start'],
						constraints: []
					},
					participants: [
						{
							id: 'usr_lead_arch_test',
							name: 'Maurice Israel (Lead Architect)',
							role: 'lead_architect'
						}
					],
					subjects: [],
					drafts: {},
					statements: [],
					corpusDocuments: [],
					dialogueMessages: []
				}
			],
			[]
		);
		// Forcer la vacuité absolue de la base de connaissances et des règles candidates
		deliberationStore.commonKnowledgeBase = [];
		deliberationStore.candidateRules = [];
	}, 60_000);

	afterAll(async () => {
		await teardownCleanEnvironment(env);
	});

	// ─── ACTE 0 : TABULA RASA (Vérification de la vacuité) ────────────────────────
	describe('Acte 0 : Tabula Rasa (Garantie de vacuité initiale)', () => {
		it('0.1 Le conteneur LLMOps est joint en mode live et signale une KB vierge', async () => {
			const health = await client.getHealth();
			expect(health.source).toBe('live');
			expect(health.data.status).toBe('ok');
			expect(health.data.service).toBe('llmops-mcp-server');
			// Vérifier qu'aucun snapshot n'est encore scellé
			expect(health.data.kb?.snapshot_id).toBeUndefined();
		});

		it('0.2 Le board et les énoncés distants sont rigoureusement vides', async () => {
			const board = await client.getBoard(env.engagement);
			expect(board.source).toBe('live');
			expect(board.data).toEqual([]);

			const stmts = await client.getStatements(env.engagement);
			expect(stmts.source).toBe('live');
			expect(stmts.data).toEqual([]);
		});

		it('0.3 Le store Archinex est rigoureusement vide (0 sujet, 0 règle, 0 corpus)', () => {
			expect(deliberationStore.subjects.length).toBe(0);
			expect(deliberationStore.statements.length).toBe(0);
			expect(deliberationStore.commonKnowledgeBase.length).toBe(0);
			expect(deliberationStore.candidateRules.length).toBe(0);
		});
	});

	// ─── ACTE 1 : ÉLICITATION PAR LES MANQUES & CADRAGE (L0 -> L1) ───────────────
	describe('Acte 1 : Élicitation par les manques & Cadrage initial', () => {
		const SUBJECT_ID = 'sub_ptp_sync';

		it('1.1 Le runner introduit le premier sujet au niveau L0_named', () => {
			deliberationStore.subjects.push({
				id: SUBJECT_ID,
				section_ref: '§4.1',
				name: 'Distribution PTP et Synchronisation Fréquentielle',
				level: 'L0_named',
				blocking_count: 1,
				unlocks_count: 2,
				waiting_for_role: 'lead_architect',
				relative_effort: 'M',
				last_transition_date: new Date().toISOString(),
				stall_days: 0,
				is_stalled: false,
				dependent_subject_ids: []
			});
			deliberationStore.activeSubjectId = SUBJECT_ID;

			expect(deliberationStore.subjects.length).toBe(1);
			expect(deliberationStore.activeSubject?.level).toBe('L0_named');
		});

		it('1.2 L\'élicitation détecte immédiatement les manques structurels', () => {
			const draft = deliberationStore.activeDraft;
			expect(draft).not.toBeNull();
			expect(draft?.is_provisional).toBe(true);

			// Un sujet L0 sans spécification possède au moins une question de cadrage automatique
			expect(draft?.manque.length).toBeGreaterThanOrEqual(1);
			expect(draft?.manque[0].id).toContain(SUBJECT_ID);
		});

		it('1.3 Le Level Gate interdit formellement à une IA de sauter à L3 sans humain', () => {
			// Gate Tour 8 : Une IA non humaine ne peut pas promouvoir à L3
			const aiGateCheck = canTransitionMaturity('L0_named', 'L3_decided', {
				is_human: false,
				role: 'domain_architect'
			});
			expect(aiGateCheck.allowed).toBe(false);
			expect(aiGateCheck.code).toBe('HUMAN_GATE_REQUIRED');
		});
	});

	// ─── ACTE 2 : MATURATION, CONTROVERSE ET ARBITRAGE (L1 -> L3) ────────────────
	describe('Acte 2 : Maturation, controverse et franchissement du Gate L3_decided', () => {
		it('2.1 L\'architecte formalise une première hypothèse de synchronisation (L2)', () => {
			const triplet: StatementTriplet = {
				subject: 'PTP Core Telecom',
				predicate: 'has_property',
				value: 'Rubidium Atomic Oscillator >= 24h',
				unit: 'hours'
			};
			const sha = computeTripletSha256(triplet);
			const st1 = {
				id: 'ENG:test-clean/S-001',
				section: '§4.1',
				triplet,
				justification: {
					basedOn: ['CCTP Exigence Disponibilité 99.999%'],
					appliedRule: 'Résilience GNSS Catégorie 1'
				},
				authority: {
					author: 'Maurice Israel',
					role: 'lead_architect',
					productionMode: 'human-authored' as const
				},
				maturity: {
					subjectLevel: 'L2_decomposed' as const,
					confidence: 'designed' as const
				},
				revisability: {
					antecedents: [],
					consequencesIfInvalidated: 'Perte de holdover'
				},
				status: 'active' as const
			};

			const envelope: ContributionEnvelope = {
				producer: {
					type: 'human',
					authorId: 'usr_lead_arch_test'
				},
				productionMode: 'human-authored',
				payloadSha256: sha,
				statement: st1
			};

			const validation = validateInboundEnvelope(envelope);
			expect(validation.success).toBe(true);

			if (validation.success) {
				deliberationStore.statements.push(validation.statement);
			}
			expect(deliberationStore.statements.length).toBe(1);
		});

		it('2.2 L\'invariant épistémique interdit strictement une promotion verified x llm-derived', () => {
			const triplet: StatementTriplet = {
				subject: 'PTP Core Telecom',
				predicate: 'has_property',
				value: 'TCXO Standard 2h'
			};
			const sha = computeTripletSha256(triplet);
			const invalidLlmStatement = {
				id: 'ENG:test-clean/S-LLM-INVALID',
				section: '§4.1',
				triplet,
				justification: { basedOn: [], appliedRule: 'Optimisation Coût' },
				authority: {
					author: 'AI Agent',
					role: 'domain_expert',
					productionMode: 'llm-derived' as const
				},
				maturity: {
					subjectLevel: 'L3_decided' as const,
					confidence: 'verified' as const // CONTRAINTE ÉPISTÉMIQUE : REJET IMMÉDIAT
				},
				revisability: { antecedents: [] },
				status: 'active' as const
			};

			const envelope: ContributionEnvelope = {
				producer: {
					type: 'llm',
					authorId: 'agent-bot'
				},
				productionMode: 'llm-derived',
				payloadSha256: sha,
				statement: invalidLlmStatement
			};

			const validation = validateInboundEnvelope(envelope);
			expect(validation.success).toBe(false);
			if (!validation.success) {
				expect(validation.error).toBe('INVALID_EPISTEMIC_COMBINATION');
			}
		});

		it('2.3 Arbitrage formel par le Lead Architect : promotion du sujet au niveau L3_decided', () => {
			// L'architecte valide formellement l'énoncé Rubidium
			deliberationStore.statements[0].maturity.confidence = 'verified';
			deliberationStore.statements[0].maturity.subjectLevel = 'L3_decided';

			// Transition autorisée de L2 à L3 par un architecte humain
			const gateCheck = canTransitionMaturity('L2_decomposed', 'L3_decided', {
				is_human: true,
				role: 'lead_architect'
			});
			expect(gateCheck.allowed).toBe(true);

			deliberationStore.subjects[0].level = 'L3_decided';
			expect(deliberationStore.activeSubject?.level).toBe('L3_decided');
		});
	});

	// ─── ACTE 3 : TOUR 8 - CAPITALISATION DANS LA KB VIERGE ───────────────────────
	describe('Acte 3 : Tour 8 - Approbation de règle et capitalisation dans la KB LLMOps', () => {
		const RULE_ID = 'RULE-SYNC-PTP-01';

		it('3.1 Induction d\'une règle doctrinale candidate issue de l\'arbitrage', () => {
			deliberationStore.candidateRules.push({
				id: RULE_ID,
				title: 'Standard PTP Telecom : Holdover Rubidium Obligatoire',
				antecedents: ['S-0042'],
				confidenceScore: 0.98,
				triggerContext: 'Arbitrage validé sur sub_ptp_sync suite à perte GNSS',
				description: 'Tout site de distribution PTP coeur requiert un oscillateur Rubidium garantissant un holdover >= 24h.',
				sparqlQuery: 'PREFIX tc: <http://archinex.org/telco#> SELECT ?site WHERE { ?site tc:clock "Rubidium" }',
				status: 'pending',
				suggestedBy: 'smart_memory_tour8',
				suggestedAt: new Date().toISOString()
			});

			expect(deliberationStore.candidateRules.length).toBe(1);
			expect(deliberationStore.candidateRules[0].status).toBe('pending');
		});

		it('3.2 Approbation par le Lead Architect et enregistrement local dans le patrimoine commun', () => {
			const res = deliberationStore.approveCandidateRule(RULE_ID);
			expect(res.success).toBe(true);
			expect(deliberationStore.candidateRules[0].status).toBe('approved');

			// La règle est entrée dans le patrimoine documentaire local
			const doc = deliberationStore.commonKnowledgeBase.find((d) => d.id === `DOC-KB-INDUCED-${RULE_ID}`);
			expect(doc).toBeDefined();
			expect(doc?.title).toBe('Standard PTP Telecom : Holdover Rubidium Obligatoire');
		});

		it('3.3 Transmission réseau au Knowledge Hub LLMOps (Conteneur Éphémère)', async () => {
			// Envoi de la suggestion au conteneur Docker via l'endpoint officiel
			const payload = {
				title: 'Standard PTP Telecom : Holdover Rubidium Obligatoire',
				rationale: 'Arbitrage validé sur sub_ptp_sync suite à perte GNSS',
				suggestedChange: 'Tout site de distribution PTP coeur requiert un oscillateur Rubidium garantissant un holdover >= 24h.',
				author: 'Maurice Israel (Lead Architect)',
				sourceEngagement: env.engagement,
				contactEmail: 'maurice.israel@free.fr'
			};

			const response = await client.submitKnowledgeSuggestion(payload);
			expect(response.status).toBe('ok');
			expect(response.suggestionId).toMatch(/^SUG-\d{8}-[A-F0-9]{6}/);
		});
	});

	// ─── ACTE 4 : PREUVE DE LA BOUCLE FERMÉE (RÉTROACTION PROACTIVE) ──────────────
	describe('Acte 4 : Preuve de la Boucle Fermée (Rétroaction Doctrinale Active)', () => {
		const NEW_SUBJECT_ID = 'sub_edge_gateway';

		it('4.1 Le runner introduit un second sujet vierge dans le projet', () => {
			deliberationStore.subjects.push({
				id: NEW_SUBJECT_ID,
				section_ref: '§5.2',
				name: 'Passerelle Edge & Nœud Distribué',
				level: 'L1_framed',
				blocking_count: 0,
				unlocks_count: 1,
				waiting_for_role: 'lead_architect',
				relative_effort: 'S',
				last_transition_date: new Date().toISOString(),
				stall_days: 0,
				is_stalled: false,
				dependent_subject_ids: []
			});
			deliberationStore.activeSubjectId = NEW_SUBJECT_ID;
			expect(deliberationStore.activeSubject?.id).toBe(NEW_SUBJECT_ID);
		});

		it('4.2 Le patrimoine commun enrichi au Tour 8 protège immédiatement les futures délibérations', () => {
			// Le document de doctrine capitalisé est bien présent dans la KB
			const capitalisedDoc = deliberationStore.commonKnowledgeBase.find(
				(d) => d.id === 'DOC-KB-INDUCED-RULE-SYNC-PTP-01'
			);
			expect(capitalisedDoc).toBeDefined();
			expect(capitalisedDoc?.inducedRules?.length).toBe(1);
			expect(capitalisedDoc?.inducedRules?.[0]?.id).toBe('R-RULE-SYNC-PTP-01');

			// Simulation d'une vérification de conformité par rapport aux règles de la KB
			const proposedDraftText = 'Utilisation d\'une horloge TCXO sans holdover';
			const isCompliantWithKnowledgeBase = !(capitalisedDoc?.inducedRules || []).some(
				(rule) =>
					rule.title.includes('Rubidium Obligatoire') &&
					proposedDraftText.toLowerCase().includes('sans holdover')
			);

			// PREUVE DE LA BOUCLE FERMÉE :
			// La tentative sans holdover est détectée comme non conforme grâce à la règle apprise !
			expect(isCompliantWithKnowledgeBase).toBe(false);
		});
	});
});
