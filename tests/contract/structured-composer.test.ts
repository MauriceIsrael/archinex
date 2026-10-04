import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import StructuredComposer from '$lib/components/deliberation/StructuredComposer.svelte';
import SubjectConversationList from '$lib/components/deliberation/SubjectConversationList.svelte';
import {
	validateArgument,
	extractMentions,
	calculateMaturityPercent,
	computeResumeSummary,
	type Argument
} from '$lib/domain/debate';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { createTestDefaultEngagements } from '../fixtures/sample-data';

describe('A25 — Composeur structuré, mentions et navigation dans le fil (Issue #36)', () => {
	beforeEach(() => {
		deliberationStore.initFromDb(createTestDefaultEngagements(), []);
	});

	describe('1. Validation stricte du Composeur Structuré', () => {
		it('Interdit tout argument sans fondement (grounds vide ou absent)', () => {
			const res1 = validateArgument({
				claim: 'Utilisation obligatoire de TLS 1.3',
				grounds: '',
				authorKind: 'human',
				productionMode: 'human-authored'
			});
			expect(res1.valid).toBe(false);
			expect(res1.reason).toMatch(/fondement|grounds/i);

			const res2 = validateArgument({
				claim: 'Utilisation obligatoire de TLS 1.3',
				grounds: '   ',
				authorKind: 'human',
				productionMode: 'human-authored'
			});
			expect(res2.valid).toBe(false);
		});

		it('Refuse toute référence hors doctrine (#base) avant l\'envoi', () => {
			const allowedKbRefs = ['RULE-SEC-01', 'RULE-NET-02'];

			// Référence inexistante
			const invalidRes = validateArgument(
				{
					claim: 'Plan de contrôle conforme à la doctrine',
					grounds: 'Application de la règle de sécurité mentionnée',
					kbRefs: ['RULE-UNKNOWN-99'],
					authorKind: 'human',
					productionMode: 'human-authored'
				},
				allowedKbRefs
			);
			expect(invalidRes.valid).toBe(false);
			expect(invalidRes.reason).toContain('RULE-UNKNOWN-99');

			// Référence autorisée
			const validRes = validateArgument(
				{
					claim: 'Plan de contrôle conforme à la doctrine',
					grounds: 'Application de la règle de sécurité certifiée',
					kbRefs: ['RULE-SEC-01'],
					authorKind: 'human',
					productionMode: 'human-authored'
				},
				allowedKbRefs
			);
			expect(validRes.valid).toBe(true);
		});

		it('Rendu HTML du composeur : propose les 4 postures et exige le fondement', () => {
			const { html } = render(StructuredComposer, {
				props: {
					subjectId: 'sub_1',
					projectId: 'cctp-mcx-nordwave',
					allowedKbRefs: ['RULE-SEC-01']
				}
			});

			expect(html).toContain('Soutenir');
			expect(html).toContain('Objecter');
			expect(html).toContain('Questionner');
			expect(html).toContain('Vérifier');
			expect(html).toContain('Fondement technique ou factuel (Obligatoire)');
			expect(html).toContain('disabled'); // Bouton d'envoi désactivé tant que non valide
		});
	});

	describe('2. Détection et extraction des mentions (# et @)', () => {
		it('Extrait correctement les règles #base et les mentions d\'agents @agent', () => {
			const text =
				"Je conteste ce choix (#RULE-SEC-01 et #RULE-NET-02). @challenger attaque l'option B et demande avis à @synthesizer et @alice.";
			const mentions = extractMentions(text);

			expect(mentions.kbRefs).toEqual(['RULE-SEC-01', 'RULE-NET-02']);
			expect(mentions.agentMentions).toEqual(['challenger', 'synthesizer']);
			expect(mentions.userMentions).toEqual(['alice']);
		});

		it('Gère les textes sans mention ou vides sans erreur', () => {
			const empty = extractMentions('');
			expect(empty.kbRefs).toEqual([]);
			expect(empty.agentMentions).toEqual([]);
			expect(empty.userMentions).toEqual([]);
		});
	});

	describe('3. Pastille « À vous » et Anneau de Maturité (Liste des Sujets)', () => {
		it('La pastille « À vous » s\'affiche lorsque waiting_for_role correspond au rôle de la session', () => {
			const targetSubject = deliberationStore.subjects[0];
			expect(targetSubject).toBeDefined();

			// Session avec le rôle attendu par le sujet
			const { html: htmlMatching } = render(SubjectConversationList, {
				props: {
					selectedSubjectId: targetSubject.id,
					sessionRole: targetSubject.waiting_for_role
				}
			});
			expect(htmlMatching).toContain('À vous');
			expect(htmlMatching).toContain('data-testid="badge-a-vous"');

			// Session avec un rôle différent : la pastille NE DOIT PAS s'afficher
			const { html: htmlDifferent } = render(SubjectConversationList, {
				props: {
					selectedSubjectId: targetSubject.id,
					sessionRole: 'random_role_non_matching'
				}
			});
			expect(htmlDifferent).not.toContain('data-testid="badge-a-vous"');
		});

		it('Calcule correctement le pourcentage pour l\'anneau de maturité (L0→L5)', () => {
			expect(calculateMaturityPercent('L0_named')).toBe(10);
			expect(calculateMaturityPercent('L1_framed')).toBe(25);
			expect(calculateMaturityPercent('L2_decomposed')).toBe(50);
			expect(calculateMaturityPercent('L3_decided')).toBe(75);
			expect(calculateMaturityPercent('L4_specified')).toBe(90);
			expect(calculateMaturityPercent('L5_archived')).toBe(100);
		});

		it('Rendu de l\'anneau SVG dans la liste des sujets', () => {
			const { html } = render(SubjectConversationList, {
				props: {
					sessionRole: 'lead_architect'
				}
			});

			expect(html).toContain('<svg');
			expect(html).toContain('stroke-dasharray="56.5"');
		});
	});

	describe('4. Navigation dans le fil & Résumé de reprise', () => {
		it('Génère le résumé de reprise après plus de 24 h d\'absence', () => {
			const pastDate = new Date(Date.now() - 90_000_000).toISOString(); // ~25 h
			const recentDate = new Date(Date.now() - 3_600_000).toISOString(); // 1 h ago

			const args: Argument[] = [
				{
					id: 'a1',
					subjectId: 's1',
					stance: 'support',
					claim: 'Nouveau message récent',
					grounds: 'Fondement validé',
					kbRefs: [],
					confidence: 'verified',
					author: 'Alice',
					authorKind: 'human',
					productionMode: 'human-authored',
					round: 1,
					resolution: 'open',
					version: 1,
					createdAt: recentDate
				},
				{
					id: 'a2',
					subjectId: 's1',
					stance: 'objection',
					claim: 'Objection résolue',
					grounds: 'Fondement traité',
					kbRefs: [],
					confidence: 'verified',
					author: 'Bob',
					authorKind: 'human',
					productionMode: 'human-authored',
					round: 1,
					resolution: 'answered',
					resolvedAt: recentDate,
					version: 2,
					createdAt: recentDate
				}
			];

			const summary = computeResumeSummary(args, pastDate, 'L2_decomposed', 'L1_framed');
			expect(summary).not.toBeNull();
			expect(summary?.hasRecentAbsence).toBe(true);
			expect(summary?.newMessagesCount).toBe(2);
			expect(summary?.resolvedObjectionsCount).toBe(1);
			expect(summary?.maturityTransition).toBe('L1→L2');
			expect(summary?.summaryText).toContain('2 message(s)');
			expect(summary?.summaryText).toContain('1 objection(s) levée(s)');
			expect(summary?.summaryText).toContain('L1→L2');
		});

		it('Ne génère aucun résumé de reprise si l\'absence est inférieure à 24 h', () => {
			const pastDate = new Date(Date.now() - 10_000_000).toISOString(); // ~2.7 h
			const summary = computeResumeSummary([], pastDate);
			expect(summary).toBeNull();
		});
	});
});
