import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import KbClausesHealthBanner from '$lib/components/dashboard/KbClausesHealthBanner.svelte';
import {
	computeKbClausesHealth,
	rescopeKbClausesHealth
} from '$lib/domain/kbClausesHealth';
import type { CheckClausesList, CheckClauseRow } from '$lib/types/llmops';

function makeClause(partial: Partial<CheckClauseRow> & { asset_id: string; framework: string; status: CheckClauseRow['status'] }): CheckClauseRow {
	return {
		typed_id: partial.asset_id,
		asset_type: 'control',
		asset_title: partial.asset_id,
		asset_excerpt: `Contrôle ${partial.asset_id}`,
		revision: 1,
		check_id: `chk-${partial.asset_id}`,
		kind: 'requires',
		when: {},
		domain: ['security'],
		...partial
	};
}

describe('KB Clauses Health & Alert Indicator (Issue #119)', () => {
	it('calculates healthy state when all controls have validated checks: clauses', () => {
		const mockClausesList: CheckClausesList = {
			clauses: [
				makeClause({ asset_id: 'CTRL-01', framework: 'NIS2', status: 'validated' }),
				makeClause({ asset_id: 'CTRL-02', framework: 'NIS2', status: 'validated' })
			],
			counts: { validated: 2, draft: 0, rejected: 0 },
			mandatory_without_clause: [],
			pending_publication: 0
		};

		const summary = computeKbClausesHealth(mockClausesList, {
			applicableFrameworks: ['NIS2']
		});

		expect(summary.offline).toBe(false);
		expect(summary.hasAlert).toBe(false);
		expect(summary.status).toBe('ok');
		expect(summary.activeControlsCount).toBe(2);
		expect(summary.validatedControlsCount).toBe(2);
		expect(summary.unvalidatedControlsCount).toBe(0);
		expect(summary.validatedClausesCount).toBe(2);
		expect(summary.draftClausesCount).toBe(0);
		expect(summary.alertMessage).toBeNull();

		const nis2 = summary.byFramework['NIS2'];
		expect(nis2).toBeDefined();
		expect(nis2.isFullyValidated).toBe(true);
	});

	it('triggers explicit warning alert when applicable controls have draft or missing clauses', () => {
		const mockClausesList: CheckClausesList = {
			clauses: [
				makeClause({ asset_id: 'CTRL-01', framework: 'NIS2', status: 'validated' }),
				makeClause({ asset_id: 'CTRL-02', framework: 'NIS2', status: 'draft' })
			],
			counts: { validated: 1, draft: 1, rejected: 0 },
			mandatory_without_clause: [
				{
					asset_id: 'CTRL-03',
					framework: 'NIS2',
					asset_title: 'Contrôle sans clause',
					asset_excerpt: 'Sans clause',
					domain: ['security']
				}
			],
			pending_publication: 1
		};

		const summary = computeKbClausesHealth(mockClausesList, {
			applicableFrameworks: ['NIS2']
		});

		expect(summary.hasAlert).toBe(true);
		expect(summary.status).toBe('warning');
		expect(summary.activeControlsCount).toBe(3);
		expect(summary.validatedControlsCount).toBe(1);
		expect(summary.unvalidatedControlsCount).toBe(2);
		expect(summary.withoutClauseControlsCount).toBe(1);
		expect(summary.validatedClausesCount).toBe(1);
		expect(summary.draftClausesCount).toBe(1);
		expect(summary.pendingPublicationCount).toBe(1);

		expect(summary.alertMessage).toContain(
			'2 contrôles applicables ont des clauses non validées (draft/none) et ne seront pas évalués'
		);
		expect(summary.alertMessage).toContain('1 décision de clause en attente de publication scellée');
	});

	it('alerts when an applicable framework is uncovered (0 active controls in KB)', () => {
		const mockClausesList: CheckClausesList = {
			clauses: [],
			counts: { validated: 0, draft: 0, rejected: 0 },
			mandatory_without_clause: [],
			pending_publication: 0
		};

		const summary = computeKbClausesHealth(mockClausesList, {
			applicableFrameworks: ['DORA']
		});

		expect(summary.hasAlert).toBe(true);
		expect(summary.uncoveredFrameworks).toContain('DORA');
		expect(summary.alertMessage).toContain('aucun contrôle actif avec clause checks: publiée pour DORA');
	});

	it('dynamically rescopes health summary without refetching', () => {
		const mockClausesList: CheckClausesList = {
			clauses: [
				makeClause({ asset_id: 'CTRL-01', framework: 'NIS2', status: 'validated' }),
				makeClause({ asset_id: 'CTRL-02', framework: 'RGPD', status: 'draft', domain: ['privacy'] })
			],
			counts: { validated: 1, draft: 1, rejected: 0 },
			mandatory_without_clause: [],
			pending_publication: 0
		};

		const base = computeKbClausesHealth(mockClausesList);
		expect(base.activeControlsCount).toBe(2);

		// Scoper uniquement sur NIS2 (100% validé)
		const nis2Only = rescopeKbClausesHealth(base, ['NIS2']);
		expect(nis2Only.hasAlert).toBe(false);
		expect(nis2Only.status).toBe('ok');
		expect(nis2Only.activeControlsCount).toBe(1);
		expect(nis2Only.validatedControlsCount).toBe(1);

		// Scoper sur NIS2 et RGPD (qui a une clause en draft)
		const both = rescopeKbClausesHealth(base, ['NIS2', 'RGPD']);
		expect(both.hasAlert).toBe(true);
		expect(both.status).toBe('warning');
		expect(both.unvalidatedControlsCount).toBe(1);
	});

	it('renders action link pointing to /kb/clauses instead of /knowledge/clauses', () => {
		const mockClausesList: CheckClausesList = {
			clauses: [
				makeClause({ asset_id: 'CTRL-01', framework: 'NIS2', status: 'draft' })
			],
			counts: { validated: 0, draft: 1, rejected: 0 },
			mandatory_without_clause: [],
			pending_publication: 0
		};
		const summary = computeKbClausesHealth(mockClausesList);
		const { html } = render(KbClausesHealthBanner, { props: { health: summary } });

		expect(html).toContain('href="/kb/clauses"');
		expect(html).not.toContain('href="/knowledge/clauses"');
		expect(html).toContain('Valider &amp; publier les clauses');
	});

	it('handles offline state cleanly', () => {
		const summary = computeKbClausesHealth(null, { offline: true });
		expect(summary.offline).toBe(true);
		expect(summary.status).toBe('offline');
		expect(summary.hasAlert).toBe(false);
		expect(summary.alertMessage).toBeNull();
	});
});
