import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'svelte/server';
import Phase4NautobotPlanPreview from '$lib/components/deliberation/Phase4NautobotPlanPreview.svelte';
import Phase4DriftDemoDrawer from '$lib/components/deliberation/Phase4DriftDemoDrawer.svelte';
import Phase5RealizationPanel from '$lib/components/deliberation/Phase5RealizationPanel.svelte';

describe('Issue #405 — Phases 4 et 5 recentrées sur l’intention, la planification et la lecture de la réalisation', () => {
	const root = process.cwd();

	it('Phase 4 retire les boutons d’hydratation multi-outils et ne conserve qu’un lien unique vers Nautobot', () => {
		const phase4Src = readFileSync(
			resolve(root, 'src/lib/components/deliberation/Phase4RefinementHub.svelte'),
			'utf-8'
		);

		expect(phase4Src).not.toContain('Hydrater Nautobot & Sylva');
		expect(phase4Src).not.toContain('Ouvrir PR/MR GitOps Sylva');
		expect(phase4Src).not.toContain('phase4-hydrate-btn');
		expect(phase4Src).not.toContain('phase4-export-sylva-gitops-btn');
		expect(phase4Src).not.toContain('/circuits/circuits/');
		expect(phase4Src).not.toContain('/vpn/vpn-tunnels/');
		expect(phase4Src).not.toContain('/tenancy/tenants/');
		expect(phase4Src).not.toContain('/dcim/devices/');

		const { html: planHtml } = render(Phase4NautobotPlanPreview, {
			props: {
				hydrated: { nautobot_planned_devices: [{ name: 'node-01', status: 'Planned', device_type: 'Server' }] },
				edpStatus: 'validated'
			}
		});
		expect(planHtml).toContain('data-testid="phase4-nautobot-plan-preview"');
		expect(planHtml).toContain('data-testid="phase4-nautobot-link"');
		expect(planHtml).toContain('Ouvrir dans Nautobot');
		expect(planHtml).toContain('dry-run');
	});

	it('isole le simulateur de dérive dans un tiroir de démonstration replié hors parcours principal', () => {
		const { html } = render(Phase4DriftDemoDrawer);
		expect(html).toContain('data-testid="phase4-drift-demo-drawer"');
		expect(html).toContain('<details');
		expect(html).toContain('Mode démonstration (hors parcours principal)');
	});

	it('Phase 5 affiche l’état de réalisation Nautobot en lecture seule et limite les actions à remédier / amender / déroger', () => {
		const { html } = render(Phase5RealizationPanel, {
			props: {
				lastReconciliationAt: '2026-10-01T12:00:00Z',
				items: [
					{ id: 'obj-1', label: 'cluster-01', state: 'realized_proven' },
					{ id: 'obj-2', label: 'gw-01', state: 'unverified', staleDecision: true, detail: 'Écart détecté' }
				]
			}
		});

		expect(html).toContain('data-testid="phase5-realization-panel"');
		expect(html).toContain('data-testid="phase5-nautobot-link"');
		expect(html).toContain('Planifié');
		expect(html).toContain('Réalisé prouvé');
		expect(html).toContain('Non vérifié');
		expect(html).toContain('Décision caduque');
		expect(html).toContain('data-testid="phase5-action-remediate"');
		expect(html).toContain('data-testid="phase5-action-amend"');
		expect(html).toContain('data-testid="phase5-action-derogate"');
		expect(html).not.toContain('Hydrater Nautobot & Sylva');
	});
});
