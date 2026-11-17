import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('$app/environment', () => ({
	browser: false,
	dev: true,
	building: false,
	version: 'test'
}));

import { render } from 'svelte/server';
import ProjectEngagementHeader from '$lib/components/deliberation/ProjectEngagementHeader.svelte';
import Phase5ConsolidationHub from '$lib/components/deliberation/Phase5ConsolidationHub.svelte';
import '$lib/i18n';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { createTestDefaultEngagements } from '../fixtures/sample-data';

describe('Issue #314 — Positionnement Phase 5 à droite de Phase 4 & Piliers transverses', () => {
	beforeEach(() => {
		deliberationStore.initFromDb(createTestDefaultEngagements(), []);
	});

	it('place Phase 5 · Consolidation et Architecture Lockée à droite de Phase 4 · Raffinement dans ProjectEngagementHeader', () => {
		const { html } = render(ProjectEngagementHeader, {
			props: {
				isExperimentalEnabled: true,
				onOpenQuickAsk: () => {},
				onOpenLiveLock: () => {}
			}
		});

		const idxPhase1 = html.indexOf('data-testid="phase-tab-appropriation"');
		const idxBoard = html.indexOf('data-testid="project-board-tab"');
		const idxGraph = html.indexOf('data-testid="project-graph-tab"');
		const idxQuickAsk = html.indexOf('data-testid="quick-ask-trigger"');
		const idxPhase2 = html.indexOf('data-testid="phase-tab-deliberation"');
		const idxPhase3 = html.indexOf('data-testid="phase-tab-rendu"');
		const idxPhase4 = html.indexOf('data-testid="phase-tab-refinement"');
		const idxPhase5 = html.indexOf('data-testid="phase-tab-consolidation"');
		const idxLiveLock = html.indexOf('data-testid="live-lock-quick-open-btn"');

		expect(idxPhase1).toBeGreaterThan(-1);
		expect(idxBoard).toBeGreaterThan(idxPhase1);
		expect(idxGraph).toBe(-1);
		expect(idxQuickAsk).toBeGreaterThan(idxBoard);
		expect(html).toContain('Assistant Exigences');

		// Flux sujet/consolidation : Assistant Exigences (centre) -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 -> Architecture Lockée
		expect(idxPhase2).toBeGreaterThan(idxQuickAsk);
		expect(idxPhase3).toBeGreaterThan(idxPhase2);
		expect(idxPhase4).toBeGreaterThan(idxPhase3);
		expect(idxPhase5).toBeGreaterThan(idxPhase4);
		expect(idxLiveLock).toBeGreaterThan(idxPhase5);
	});

	it('structure Phase5ConsolidationHub autour des 4 piliers transverses (Socle, Sécurité, Gestion, GitOps)', () => {
		const { html } = render(Phase5ConsolidationHub);

		expect(html).toContain('data-testid="phase5-transverse-pillars"');
		expect(html).toContain('data-testid="phase5-pillar-socle"');
		expect(html).toContain('Socle / Architecture transverse');
		expect(html).toContain('data-testid="phase5-pillar-security"');
		expect(html).toContain('Sécurité');
		expect(html).toContain('data-testid="phase5-pillar-governance"');
		expect(html).toContain('Gestion / Gouvernance');
		expect(html).toContain('data-testid="phase5-pillar-gitops"');
		expect(html).toContain('GitOps / Exploitation');

		// Accès directs aux artefacts
		expect(html).toContain('data-testid="pillar-socle-topology-btn"');
		expect(html).toContain('data-testid="pillar-socle-cartography-btn"');
		expect(html).toContain('data-testid="pillar-security-filter-btn"');
		expect(html).toContain('data-testid="pillar-security-slots-btn"');
		expect(html).toContain('data-testid="pillar-governance-manifest-btn"');
		expect(html).toContain('data-testid="pillar-governance-slots-btn"');
		expect(html).toContain('data-testid="pillar-gitops-catalog-btn"');
		expect(html).toContain('data-testid="pillar-gitops-sushy-btn"');
		expect(html).toContain('data-testid="phase5-jump-impact-graph-btn"');
		expect(html).toContain('data-testid="phase5-impact-graph-section"');
	});
});
