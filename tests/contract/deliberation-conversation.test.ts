import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import SubjectMessageBubble from '$lib/components/deliberation/SubjectMessageBubble.svelte';
import PinnedObjections from '$lib/components/deliberation/PinnedObjections.svelte';
import SubjectDossierView from '$lib/components/deliberation/SubjectDossierView.svelte';
import SubjectConversationList from '$lib/components/deliberation/SubjectConversationList.svelte';
import SubjectThreadView from '$lib/components/deliberation/SubjectThreadView.svelte';
import SubjectProblemCard from '$lib/components/deliberation/SubjectProblemCard.svelte';
import MaturityStepper from '$lib/components/deliberation/MaturityStepper.svelte';
import CapitalizationPanel from '$lib/components/deliberation/CapitalizationPanel.svelte';
import {
	computeMaturityCriteria,
	getMilestoneContextualActions
} from '$lib/domain/maturityCriteria';
import {
	getArgumentVisualAttributes,
	formatMaturityMilestoneSeparator,
	formatAgentRole,
	formatStanceLabel,
	canCloseObjection,
	type Argument
} from '$lib/domain/debate';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { createTestDefaultEngagements } from '../fixtures/sample-data';

describe('A24 — Délibération : Un sujet = une conversation (Issue #35)', () => {
	beforeEach(() => {
		deliberationStore.initFromDb(createTestDefaultEngagements(), []);
	});

	const mockAgentArg: Argument = {
		id: 'arg-agent-1',
		subjectId: 'sub_1',
		optionId: 'opt-a',
		stance: 'objection',
		claim: 'Risque de latence sur le plan de contrôle',
		grounds: 'Les mécanismes de consensus distribué ajoutent 15 ms au p99.',
		kbRefs: ['RULE-SEC-01', 'RULE-NET-02'],
		confidence: 'assumed',
		author: 'ChallengerAgent',
		authorKind: 'agent:challenger',
		productionMode: 'llm-derived',
		round: 1,
		resolution: 'open',
		version: 1
	};

	const mockHumanArg: Argument = {
		id: 'arg-human-1',
		subjectId: 'sub_1',
		optionId: 'opt-a',
		targetArgumentId: 'arg-agent-1',
		stance: 'support',
		claim: 'Mise en cache locale validée sur banc d’essai',
		grounds: 'Mesures réelles p99 sous 2 ms avec cache distribué Redis/Valkey.',
		kbRefs: ['RULE-PERF-05'],
		confidence: 'verified',
		author: 'M. Israel (Lead Architect)',
		authorKind: 'human',
		productionMode: 'human-authored',
		round: 2,
		resolution: 'open',
		version: 1
	};

	const mockSynthesisArg: Argument = {
		id: 'arg-synth-1',
		subjectId: 'sub_1',
		stance: 'synthesis',
		claim: 'Compromis retenu : hybridation plan de contrôle et cache local',
		grounds: 'Conciliation des exigences de sécurité et des contraintes de débit.',
		kbRefs: ['RULE-HYB-01'],
		confidence: 'designed',
		author: 'SynthesizerAgent',
		authorKind: 'agent:synthesizer',
		productionMode: 'llm-derived',
		round: 2,
		resolution: 'open',
		version: 1
	};

	describe('1. Grammaire visuelle et distinction stricte Agent vs Humain', () => {
		it('attributs visuels de domaine distinguent agent (gauche, pointillés, IA) et humain (droite, solide)', () => {
			const agentAttrs = getArgumentVisualAttributes(mockAgentArg);
			expect(agentAttrs.alignment).toBe('left');
			expect(agentAttrs.bubbleStyle).toBe('dashed');
			expect(agentAttrs.isAgent).toBe(true);
			expect(agentAttrs.badgeLabel).toBe('IA');
			expect(agentAttrs.stanceLabel).toBe('Objection');

			const humanAttrs = getArgumentVisualAttributes(mockHumanArg);
			expect(humanAttrs.alignment).toBe('right');
			expect(humanAttrs.bubbleStyle).toBe('solid');
			expect(humanAttrs.isAgent).toBe(false);
			expect(humanAttrs.badgeLabel).toBe('Humain');
			expect(humanAttrs.stanceLabel).toBe('Soutien');
		});

		it('rendu HTML : un message d\'agent affiche la bordure pointillée et le badge IA, aligné à gauche', () => {
			const { html } = render(SubjectMessageBubble, {
				props: {
					argument: mockAgentArg,
					userRole: 'lead_architect',
					isHumanUser: true
				}
			});

			// Attributs de typage
			expect(html).toContain('data-author-kind="agent:challenger"');
			expect(html).toContain('data-is-agent="true"');
			expect(html).toContain('justify-start');

			// Style visuel pointillé
			expect(html).toContain('border-dashed');

			// Badge IA et rôle agent
			expect(html).toContain('IA');
			expect(html).toContain('Agent Challenger');

			// Fondement repliable Pourquoi ?
			expect(html).toContain('Pourquoi ?');
			expect(html).toContain('Les mécanismes de consensus distribué ajoutent 15 ms au p99.');

			// Puces kbRefs cliquables
			expect(html).toContain('/knowledge?rule=RULE-SEC-01');
			expect(html).toContain('§ RULE-SEC-01');
		});

		it('rendu HTML : un message humain affiche la bulle pleine, l\'avatar humain et l\'alignement à droite', () => {
			const { html } = render(SubjectMessageBubble, {
				props: {
					argument: mockHumanArg,
					targetArgument: mockAgentArg,
					userRole: 'lead_architect',
					isHumanUser: true
				}
			});

			// Attributs de typage
			expect(html).toContain('data-author-kind="human"');
			expect(html).toContain('data-is-agent="false"');
			expect(html).toContain('justify-end');

			// Pas de bordure pointillée
			expect(html).not.toContain('border-dashed');

			// Auteur humain et rôle
			expect(html).toContain('M. Israel (Lead Architect)');

			// Citation du message ciblé (targetArgumentId)
			expect(html).toContain('En réponse à ChallengerAgent');
			expect(html).toContain('Risque de latence sur le plan de contrôle');
		});

		it('rendu HTML : carte de synthèse pleine largeur (stance: synthesis)', () => {
			const { html } = render(SubjectMessageBubble, {
				props: {
					argument: mockSynthesisArg,
					userRole: 'lead_architect',
					isHumanUser: true
				}
			});

			expect(html).toContain('data-stance="synthesis"');
			expect(html).toContain('Synthèse de délibération');
			expect(html).toContain('Compromis retenu');
			expect(html).toContain('w-full');
		});

		it('séparateurs de jalon de maturité formatent correctement le texte du jalon', () => {
			expect(formatMaturityMilestoneSeparator('L2_decomposed')).toBe('── Passé à L2 · Décomposé ──');
			expect(formatMaturityMilestoneSeparator('L3_decided')).toBe('── Passé à L3 · Arbitré ──');
			expect(formatMaturityMilestoneSeparator('L1_framed')).toBe('── Passé à L1 · Cadré & Dilemme ──');
		});
	});

	describe('2. Objections ouvertes épinglées et habilitations d\'arbitrage', () => {
		it('affiche les objections ouvertes épinglées avec actions Répondre, Accepter le risque, Retirer pour un Lead Architect', () => {
			const { html } = render(PinnedObjections, {
				props: {
					objections: [mockAgentArg],
					userRole: 'lead_architect',
					isHumanUser: true
				}
			});

			expect(html).toContain('Objections ouvertes épinglées');
			expect(html).toContain('Répondre');
			expect(html).toContain('Accepter le risque');
			expect(html).toContain('Retirer');
			expect(html).not.toContain('Arbitrage réservé');
		});

		it('désactive les actions de levée d\'objection si l\'utilisateur est un viewer (canCloseObjection)', () => {
			expect(canCloseObjection('viewer', true)).toBe(false);

			const { html } = render(PinnedObjections, {
				props: {
					objections: [mockAgentArg],
					userRole: 'viewer',
					isHumanUser: true
				}
			});

			expect(html).toContain('Arbitrage réservé : Lead Architect / Expert');
			expect(html).toContain('disabled');
		});
	});

	describe('3. Dossier de consultation (lecture seule) et navigation', () => {
		it('rendu du Dossier : contient le brouillon télégraphique, la matrice et les compteurs', () => {
			const { html } = render(SubjectDossierView, {
				props: {
					subjectId: 'sub_1',
					projectId: 'cctp-mcx-nordwave',
					argumentsList: [mockAgentArg, mockHumanArg],
					isOpen: true
				}
			});

			expect(html).toContain('Dossier du sujet');
			expect(html).toContain('1 obj. ouverte(s) / 1');
			expect(html).toContain('3 ref(s) base'); // RULE-SEC-01, RULE-NET-02, RULE-PERF-05
			expect(html).toContain('Brouillon');
			expect(html).toContain('Matrice');
			expect(html).toContain('Doctrines');
		});

		it('clic sur un sujet dans le tableau de maturité active la vue conversationnelle', () => {
			expect(deliberationStore.deliberationViewMode).toBe('board');

			// Sélection d'un sujet
			const targetSubject = deliberationStore.subjects[0];
			expect(targetSubject).toBeDefined();

			deliberationStore.selectSubject(targetSubject.id);

			expect(deliberationStore.activeSubjectId).toBe(targetSubject.id);
			expect(deliberationStore.deliberationViewMode).toBe('conversation');

			// Retour au tableau
			deliberationStore.setDeliberationViewMode('board');
			expect(deliberationStore.deliberationViewMode).toBe('board');
		});
	});

	describe('4. Refonte UX : Espace Sujet Unifié, Timeline contextualisée et Cadrage compact', () => {
		it('fournit des actions d’assistance contextualisées pour chaque jalon L0 à L5', () => {
			const l1Actions = getMilestoneContextualActions('L1_framed');
			expect(l1Actions.some((a) => a.criterionActionType === 'edit_problem')).toBe(true);
			expect(l1Actions.some((a) => a.criterionActionType === 'add_doctrine_ref')).toBe(true);

			const l2Actions = getMilestoneContextualActions('L2_decomposed');
			expect(l2Actions.some((a) => a.agentRole === 'proposer')).toBe(true);
			expect(l2Actions.some((a) => a.targetTab === 'matrix')).toBe(true);

			const l3Actions = getMilestoneContextualActions('L3_decided');
			expect(l3Actions.some((a) => a.agentRole === 'verifier')).toBe(true);
			expect(l3Actions.some((a) => a.agentRole === 'challenger')).toBe(true);
			expect(l3Actions.some((a) => a.agentRole === 'synthesizer')).toBe(true);
			expect(l3Actions.some((a) => a.targetTab === 'matrix')).toBe(true);
			expect(l3Actions.some((a) => a.id === 'l3_prepare_kb')).toBe(true);

			const l4Actions = getMilestoneContextualActions('L4_specified');
			expect(l4Actions.some((a) => a.targetTab === 'cascade')).toBe(true);
			expect(l4Actions.some((a) => a.id === 'l4_prepare_kb')).toBe(true);
		});

		it('MaturityStepper affiche la timeline horizontale L0-L5 ouverte sur le prochain jalon avec critères et actions contextualisées', () => {
			const report = computeMaturityCriteria({
				subject: {
					id: 'sub_1',
					name: 'Authentification Critique',
					problemStatement: 'Quel MFA retenir ?',
					scope: '§ 3.1',
					level: 'L1_framed'
				},
				options: [{ id: 'o1', title: 'Option 1' }],
				arguments: [mockAgentArg],
				doctrineConstraintsCount: 2
			});

			const { html } = render(MaturityStepper, {
				props: {
					report,
					userRole: 'lead_architect',
					isHumanUser: true
				}
			});

			expect(html).toContain('data-testid="maturity-stepper"');
			expect(html).toContain('data-testid="milestone-step-L0"');
			expect(html).toContain('data-testid="milestone-step-L2"');
			expect(html).toContain('data-testid="maturity-criteria-panel"');
			expect(html).toContain('Critères de passage vers L2 (Décomposé)');
			expect(html).toContain('data-testid="milestone-contextual-actions"');
			expect(html).toContain('@proposer');
		});

		it('SubjectProblemCard affiche un bandeau compact sur 2 lignes par défaut et renvoie vers la Matrice sans dupliquer les cartes d’options', () => {
			const targetSubject = deliberationStore.subjects[0];
			const { html } = render(SubjectProblemCard, {
				props: {
					subject: targetSubject,
					options: [
						{ id: 'opt-1', title: 'Option Alpha', summary: 'Détail option alpha' },
						{ id: 'opt-2', title: 'Option Beta', summary: 'Détail option beta' }
					]
				}
			});

			expect(html).toContain('data-testid="subject-problem-card"');
			expect(html).toContain('Hypothèse :');
			expect(html).toContain('2 option(s) → Matrice');
			// Ne duplique pas le résumé des cartes d'options dans le fil
			expect(html).not.toContain('Détail option alpha');
		});

		it('SubjectThreadView fusionne le fil et les volets du dossier sous une barre d’onglets unifiée avec bascule Split', () => {
			const targetSubject = deliberationStore.subjects[0];
			deliberationStore.selectSubject(targetSubject.id);

			const { html } = render(SubjectThreadView, {
				props: {
					subjectId: targetSubject.id,
					projectId: deliberationStore.activeEngagement.id,
					userRole: 'lead_architect',
					isHumanUser: true
				}
			});

			expect(html).toContain('data-testid="unified-subject-workbench"');
			expect(html).toContain('data-testid="unified-workspace-tabs"');
			expect(html).toContain('data-testid="tab-unified-thread"');
			expect(html).toContain('data-testid="tab-unified-matrix"');
			expect(html).toContain('data-testid="tab-unified-kb"');
			expect(html).toContain('data-testid="tab-unified-cascade"');
			expect(html).toContain('data-testid="btn-toggle-split"');
		});

		it('SubjectConversationList et SubjectThreadView permettent de replier et redéplier la liste des sujets', () => {
			const listHtml = render(SubjectConversationList, {
				props: {
					selectedSubjectId: deliberationStore.subjects[0]?.id || '',
					sessionRole: 'lead_architect',
					isCollapsible: true
				}
			}).html;
			expect(listHtml).toContain('data-testid="collapse-subject-list-btn"');

			const threadCollapsedHtml = render(SubjectThreadView, {
				props: {
					subjectId: deliberationStore.subjects[0]?.id || '',
					projectId: deliberationStore.activeEngagement.id,
					userRole: 'lead_architect',
					isHumanUser: true,
					isSidebarCollapsed: true
				}
			}).html;
			expect(threadCollapsedHtml).toContain('data-testid="expand-subject-list-btn"');
		});

		it('CapitalizationPanel propose un bouton CTA très visible pour préparer les candidats KB', () => {
			const targetSubject = deliberationStore.subjects[0];
			const { html } = render(CapitalizationPanel, {
				props: {
					projectId: deliberationStore.activeEngagement.id,
					subjectId: targetSubject?.id || 'sub_1',
					decision: {
						id: 'dec_1',
						retainedOptionId: 'opt-1',
						rationale: 'Validation architecture',
						reversibility: 'reversible'
					} as any,
					options: [{ id: 'opt-1', title: 'Option 1' }] as any
				}
			});
			expect(html).toContain('data-testid="prepare-kb-candidates-cta"');
			expect(html).toContain('Préparer les Candidats KB maintenant');
		});
		it("SubjectThreadView affiche l'atelier de specification DLD et la decision haut niveau en onglet Doctrines & Brouillon", () => {
			const targetSubject = deliberationStore.subjects[0];
			const testDecision = {
				id: 'dec_test_1',
				subjectId: targetSubject.id,
				retainedOptionId: 'opt-a',
				rejected: [],
				rationale: "Validation de l'hybridation pour performance et souverainete.",
				reversibility: 'reversible' as const,
				arbiterId: 'Alice',
				arbiterRole: 'lead_architect',
				decidedAt: new Date().toISOString(),
				acceptedViolations: [],
				kbCandidateIds: []
			};

			const { html } = render(SubjectThreadView, {
				props: {
					subjectId: targetSubject.id,
					projectId: deliberationStore.activeEngagement.id,
					userRole: 'lead_architect',
					isHumanUser: true,
					initialActiveWorkspaceTab: 'kb',
					initialDecision: testDecision
				}
			});

			expect(html).toContain('Spécification Haut Niveau : Décision L3 Opposable');
			expect(html).toContain("Validation de l'hybridation pour performance et souverainete.");
			expect(html).toContain('data-testid="toggle-doctrine-drawer-btn"');
			expect(html).toContain('Doctrines applicables');
			expect(html).toContain('data-testid="detailed-spec-textarea"');
			expect(html).toContain('data-testid="bootstrap-spec-ai-btn"');
			expect(html).toContain('data-testid="save-detailed-spec-btn"');
			expect(html).toContain('data-testid="validate-l4-spec-btn"');

			// Piliers structurants de la délibération
			expect(html).toContain('Fil Directeur : Les 5 Piliers Structurants de la Délibération');
			expect(html).toContain('1. Question (Problème)');
			expect(html).toContain('2. Cadrage &amp; Hypothèse');
			expect(html).toContain('3. Options &amp; Variantes');
			expect(html).toContain('4. Critères &amp; Conformité');
			expect(html).toContain('5. Arbitrage L3 Acté');
			expect(html).toContain('data-testid="toggle-pillars-btn"');
		});
	});
});
