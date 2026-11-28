import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'svelte/server';
import ComplianceCheckBanner, {
	type UiCompliancePayload
} from '$lib/components/deliberation/ComplianceCheckBanner.svelte';

describe('ComplianceCheckBanner.svelte — Contrat de rendu et états de vérification KB', () => {
	it('affiche l’état loading lorsque loading=true', () => {
		const { html } = render(ComplianceCheckBanner, {
			props: { loading: true, compliance: null }
		});

		expect(html).toContain('data-testid="compliance-check-banner"');
		expect(html).toContain('data-check-status="loading"');
		expect(html).toContain('Vérification réglementaire auprès du Hub KB en cours');
		expect(html).not.toContain('data-testid="kb-status-checked"');
	});

	it('affiche not_checked (fail-closed) quand compliance est null, offline=true ou checkStatus=not_checked', () => {
		const nullRender = render(ComplianceCheckBanner, {
			props: { compliance: null, loading: false }
		});
		expect(nullRender.html).toContain('data-check-status="not_checked"');
		expect(nullRender.html).toContain('data-testid="kb-status-offline"');
		expect(nullRender.html).toContain('data-testid="kb-derogation-checkbox"');
		expect(nullRender.html).not.toContain('data-testid="kb-derogation-reason"');

		const offlineWithDerogation = render(ComplianceCheckBanner, {
			props: {
				compliance: {
					frameworks: ['NIS2'],
					offline: true,
					violations: [],
					unassessedCount: 0
				},
				derogationAcknowledged: true,
				derogationReason: 'Revue manuelle effectuée'
			}
		});
		expect(offlineWithDerogation.html).toContain('data-check-status="not_checked"');
		expect(offlineWithDerogation.html).toContain('data-testid="kb-derogation-reason"');
		expect(offlineWithDerogation.html).toContain('Provisional');
	});

	it('affiche partial avec la liste des règles non évaluées et la zone de dérogation motivée', () => {
		const payload: UiCompliancePayload = {
			frameworks: ['ISO27001', 'NIS2'],
			offline: false,
			checkStatus: 'partial',
			violations: [],
			unassessedCount: 2,
			unassessedRuleIds: ['KB-R-01', 'KB-R-02']
		};

		const { html } = render(ComplianceCheckBanner, {
			props: {
				compliance: payload,
				derogationAcknowledged: true
			}
		});

		expect(html).toContain('data-check-status="partial"');
		expect(html).toContain('data-testid="kb-status-partial"');
		expect(html).toContain('KB-R-01, KB-R-02');
		expect(html).toContain('data-testid="kb-derogation-checkbox"');
		expect(html).toContain('data-testid="kb-derogation-reason"');
	});

	it('affiche checked avec frameworks et hubRevision lorsqu’aucune violation n’affecte l’option sélectionnée', () => {
		const payload: UiCompliancePayload = {
			frameworks: ['ISO27001', 'SecNumCloud'],
			offline: false,
			checkStatus: 'checked',
			hubRevision: 'rev-42',
			violations: [
				{
					optionId: 'opt-other',
					typedId: 'KB-99',
					message: 'Violation sur une autre option',
					validated: true
				}
			],
			unassessedCount: 0,
			coverageWarnings: ['Couverture partielle sur le domaine secondaire']
		};

		const { html } = render(ComplianceCheckBanner, {
			props: {
				compliance: payload,
				selectedOptionId: 'opt-selected'
			}
		});

		expect(html).toContain('data-check-status="checked"');
		expect(html).toContain('data-testid="kb-status-checked"');
		expect(html).toContain('ISO27001, SecNumCloud');
		expect(html).toContain('rev rev-42');
		expect(html).toContain('data-testid="coverage-warning"');
		expect(html).toContain('Couverture partielle sur le domaine secondaire');
		expect(html).not.toContain('data-testid="decision-violations"');
	});

	it('affiche les violations de l’option sélectionnée (règle validée avec textarea et règle brouillon sans blocage)', () => {
		const payload: UiCompliancePayload = {
			frameworks: ['NIS2'],
			offline: false,
			checkStatus: 'checked',
			violations: [
				{
					optionId: 'opt-a',
					typedId: 'KB-VAL-01',
					message: 'Chiffrement au repos absent',
					validated: true,
					matchedTerms: ['plain-disk', 'no-kms']
				},
				{
					optionId: 'opt-a',
					typedId: 'KB-DRAFT-02',
					message: 'Alerte en brouillon',
					validated: false
				},
				{
					optionId: 'opt-b',
					typedId: 'KB-OTHER-03',
					message: 'Non pertinente pour opt-a',
					validated: true
				}
			],
			unassessedCount: 0
		};

		const { html } = render(ComplianceCheckBanner, {
			props: {
				compliance: payload,
				selectedOptionId: 'opt-a'
			}
		});

		expect(html).toContain('data-testid="decision-violations"');
		expect(html).toContain('KB-VAL-01');
		expect(html).toContain('plain-disk, no-kms');
		expect(html).toContain('justifiez pourquoi');
		expect(html).toContain('KB-DRAFT-02');
		expect(html).toContain('Règle encore en brouillon');
		expect(html).not.toContain('KB-OTHER-03');
	});

	it('ne contient aucun identifiant de projet codé en dur (AGENTS.md §1)', () => {
		const content = readFileSync(
			resolve(process.cwd(), 'src/lib/components/deliberation/ComplianceCheckBanner.svelte'),
			'utf-8'
		);
		expect(content).not.toMatch(/sub_lulu|DEMOLULU|LULUDEMO|REQ-Lot1/i);
	});
});
