import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import CoverageMatrixView from '$lib/components/deliberation/CoverageMatrixView.svelte';
import { computeCoverageReport, type CoverageRequirementInput } from '$lib/domain/coverageModel';
import { renderCoverageMatrixCsv, renderCoverageMatrixSvg } from '$lib/domain/coverageExport';

describe('Issue #402 — Vue de couverture visuelle (matrice, accessibilité, exports, performance 1 000 exigences)', () => {
	it('affiche exactement les mêmes chiffres que coverageModel.ts et porte les états par icône + texte (sans couleur seule)', () => {
		const report = computeCoverageReport([
			{
				id: 'req-1',
				clauseRef: 'ART-1',
				title: 'Chiffrement de bout en bout',
				criticality: 'bloquant',
				domain: 'Sécurité',
				disposition: 'deliberated',
				subjects: [{ id: 's1', title: 'Sécurité réseau' }],
				decisions: [{ id: 'd1', subjectId: 's1', rationale: 'IPsec ESP validé', kbCheckStatus: 'checked' }],
				plannedObjects: [{ id: 'nb-1', kind: 'vpn', label: 'tun-01', realizedProven: true }]
			},
			{
				id: 'req-2',
				clauseRef: 'ART-2',
				title: 'Supervision centralisée',
				criticality: 'bloquant',
				domain: 'Observabilité',
				disposition: 'deliberated',
				subjects: [{ id: 's2', title: 'Observabilité' }]
			}
		]);

		const { html } = render(CoverageMatrixView, {
			props: { projectId: 'proj-test', report }
		});

		expect(html).toContain('data-testid="coverage-matrix-view"');
		expect(html).toContain(report.indicators.headline);
		expect(html).toContain('data-testid="coverage-desktop-matrix"');
		expect(html).toContain('data-testid="coverage-mobile-list"');
		expect(html).toContain('role="progressbar"');
		// États explicites en texte (pas la couleur seule)
		expect(html).toContain('Atteinte');
		expect(html).toContain('En attente');
		// Boutons d'export
		expect(html).toContain('data-testid="coverage-export-svg-btn"');
		expect(html).toContain('data-testid="coverage-export-png-btn"');
		expect(html).toContain('data-testid="coverage-export-csv-btn"');
	});

	it('rend 1 000 exigences sans blocage grâce au fenêtrage/pagination', () => {
		const thousand: CoverageRequirementInput[] = Array.from({ length: 1000 }, (_, i) => ({
			id: `req-${i + 1}`,
			clauseRef: `REQ-${String(i + 1).padStart(4, '0')}`,
			title: `Exigence fonctionnelle n°${i + 1}`,
			criticality: i % 3 === 0 ? 'bloquant' : i % 3 === 1 ? 'majeur' : 'info',
			domain: `Domaine-${(i % 5) + 1}`,
			disposition: 'deliberated'
		}));

		const start = performance.now();
		const report = computeCoverageReport(thousand);
		const { html } = render(CoverageMatrixView, {
			props: { projectId: 'proj-perf', report }
		});
		const elapsedMs = performance.now() - start;

		expect(report.items).toHaveLength(1000);
		expect(html).toContain('data-testid="coverage-pagination"');
		expect(html).toContain('sur 1000 exigences');
		// Seule la première fenêtre (60 lignes) est rendue dans le DOM
		expect(html).toContain('REQ-0001');
		expect(html).not.toContain('REQ-0500');
		expect(elapsedMs).toBeLessThan(2000);
	});

	it('exporte SVG et CSV de manière pure et déterministe', () => {
		const report = computeCoverageReport([
			{
				id: 'req-1',
				clauseRef: 'ART-1',
				title: 'Exigence 1',
				criticality: 'bloquant',
				disposition: 'deliberated'
			}
		]);

		const svg1 = renderCoverageMatrixSvg(report);
		const svg2 = renderCoverageMatrixSvg(report);
		expect(svg1).toBe(svg2);
		expect(svg1).toContain('<svg ');
		expect(svg1).toContain('ART-1');
		expect(svg1).toContain(report.indicators.headline);

		const csv1 = renderCoverageMatrixCsv(report);
		const csv2 = renderCoverageMatrixCsv(report);
		expect(csv1).toBe(csv2);
		expect(csv1).toContain('clause_ref');
		expect(csv1).toContain('ART-1');
	});
});
