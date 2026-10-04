import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import SubjectMessageBubble from '$lib/components/deliberation/SubjectMessageBubble.svelte';
import PinnedObjections from '$lib/components/deliberation/PinnedObjections.svelte';
import SubjectDossierView from '$lib/components/deliberation/SubjectDossierView.svelte';
import SubjectConversationList from '$lib/components/deliberation/SubjectConversationList.svelte';
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
});
