import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'svelte/server';
import DecisionCard from '$lib/components/deliberation/DecisionCard.svelte';
import {
	buildDecisionCardModel,
	renderDecisionCardMarkdown,
	renderDecisionCardSvg
} from '$lib/domain/decisionCard';

describe('Issue #403 — Carte de décision déterministe (ce que l’arbitre signe)', () => {
	const baseInput = {
		subjectId: 'sub-ha',
		subjectTitle: 'Résilience multi-sites',
		sectionRef: '§3.2',
		requirements: [
			{ id: 'req-1', clauseRef: 'REQ-10', title: 'RTO inférieur à 15 minutes', criticality: 'bloquant' }
		],
		options: [
			{
				id: 'opt-a',
				subjectId: 'sub-ha',
				title: 'Actif / Actif bi-site',
				description: 'Deux sites actifs',
				evaluations: { 'crit-1': { score: 5, justification: 'RTO quasi nul' } }
			},
			{
				id: 'opt-b',
				subjectId: 'sub-ha',
				title: 'Actif / Passif',
				description: 'Bascule manuelle',
				evaluations: { 'crit-1': { score: 2, justification: 'Bascule longue' } }
			}
		] as any[],
		criteria: [{ id: 'crit-1', subjectId: 'sub-ha', name: 'Résilience', weight: 3 }] as any[],
		argumentsList: [
			{
				id: 'arg-1',
				subjectId: 'sub-ha',
				optionId: 'opt-a',
				type: 'pro',
				content: 'Respecte le RTO contractuel',
				authorName: 'Alice',
				authorRole: 'lead_architect',
				isResolved: true
			},
			{
				id: 'arg-2',
				subjectId: 'sub-ha',
				optionId: 'opt-a',
				type: 'objection',
				content: 'Surcoût CAPEX à valider',
				authorName: 'Agent FinOps',
				authorRole: 'ai_agent',
				isResolved: false
			}
		] as any[],
		draftSelection: {
			retainedOptionId: 'opt-a',
			rationale: 'Seule option compatible avec le RTO < 15 min.',
			reversibility: 'costly' as const,
			derogationReason: 'Contrôle Hub KB différé'
		},
		plannedObjects: [{ id: 'nb-1', kind: 'cluster', label: 'ha-cluster-01', action: 'create' as const }]
	};

	it('affiche explicitement « Non vérifié » et « Inconnu » et ne les affiche JAMAIS comme « Conforme »', () => {
		const card = buildDecisionCardModel({
			...baseInput,
			kbCompliance: {
				offline: true,
				checkStatus: 'not_checked',
				frameworks: ['ISO27001'],
				unassessedRuleIds: ['KB-RULE-42'],
				violations: [
					{
						typedId: 'KB-RULE-07',
						framework: 'NIS2',
						title: 'Journalisation immuable',
						validated: false,
						reason: 'Règle en brouillon violée'
					}
				]
			}
		});

		expect(card.kbOffline).toBe(true);
		expect(card.kbConstraints.some((c) => c.verdict === 'non_verifie')).toBe(true);
		expect(card.kbConstraints.some((c) => c.verdict === 'inconnu')).toBe(true);
		expect(card.kbConstraints.some((c) => c.verdict === 'conforme')).toBe(false);
		expect(card.kbConstraints.find((c) => c.id === 'KB-RULE-07')?.ruleStatus).toBe('draft');

		const { html } = render(DecisionCard, { props: { card } });
		expect(html).toContain('data-testid="decision-card"');
		expect(html).toContain('data-verdict="non_verifie"');
		expect(html).toContain('data-verdict="inconnu"');
		expect(html).toContain('Non vérifié');
		expect(html).toContain('Inconnu');
		expect(html).toContain('Brouillon');
		expect(html).not.toContain('data-verdict="conforme"');
	});

	it('porte une source explicite sur chaque élément et génère des exports Markdown et SVG déterministes', () => {
		const card = buildDecisionCardModel({
			...baseInput,
			kbCompliance: {
				offline: false,
				checkStatus: 'checked',
				conformedRules: [{ typedId: 'KB-01', framework: 'ISO27001', title: 'Chiffrement', validated: true }]
			}
		});

		expect(card.sources.every((s) => Boolean(s.sourceRef.id))).toBe(true);
		expect(card.kbConstraints.every((c) => Boolean(c.sourceRef.id))).toBe(true);
		expect(card.optionsMatrix.every((o) => Boolean(o.sourceRef.id))).toBe(true);
		expect(card.consequences.plannedObjects.every((p) => Boolean(p.sourceRef.id))).toBe(true);

		const md = renderDecisionCardMarkdown(card);
		const svg = renderDecisionCardSvg(card);
		expect(md).toContain('# Carte de décision');
		expect(md).toContain('REQ-10');
		expect(md).toContain('Actif / Actif bi-site');
		expect(svg).toContain('<svg ');
		expect(svg).toContain('Carte de décision');
	});

	it('ne contient aucun identifiant de projet codé en dur dans DecisionCard.svelte (AGENTS.md §1)', () => {
		const content = readFileSync(
			resolve(process.cwd(), 'src/lib/components/deliberation/DecisionCard.svelte'),
			'utf-8'
		);
		expect(content).not.toMatch(/sub_lulu|DEMOLULU|LULUDEMO|REQ-Lot1|Lot 3/i);
	});
});
