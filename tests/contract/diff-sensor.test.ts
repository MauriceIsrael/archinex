import { describe, it, expect } from 'vitest';
import { captureTextDiffAsStatement, createVariantExclusionStatement } from '$lib/domain/diffSensor';

describe('Diff Sensor Contract Tests (Lot 4 - diff-sensor)', () => {
	it('Scenario: Saisie d une correction manuscrite en un tour', () => {
		const originalText = 'holdover ≥ 30 j';
		const editedText = 'holdover ≥ 15 j';

		const result = captureTextDiffAsStatement({
			subjectId: 'sub_sync',
			sectionRef: '§4.2',
			originalText,
			editedText,
			authorName: 'M. Israel',
			role: 'infra_expert_architect',
			antecedentId: 'HYP-001',
			propertyPredicate: 'holdover_duration'
		});

		expect(result.hasDiff).toBe(true);
		expect(result.previousValue).toBe('holdover ≥ 30 j');
		expect(result.newValue).toBe('holdover ≥ 15 j');
		expect(result.statement).toBeDefined();

		const stmt = result.statement!;
		expect(stmt.authority.productionMode).toBe('human-authored');
		expect(stmt.authority.role).toBe('infra_expert_architect');
		expect(stmt.triplet.predicate).toBe('holdover_duration');
		expect(stmt.triplet.value).toBe('holdover ≥ 15 j');
		expect(stmt.justification.basedOn).toContain('HYP-001');
	});

	it('Scenario: Contestation et rejet d une variante divergente', () => {
		const stmt = createVariantExclusionStatement({
			subjectId: 'sub_sync',
			sectionRef: '§4.2',
			variantTitle: 'Variante B : GNSS + NTP dégradé',
			rejectionReason: 'Rejetée : perte d éligibilité MCX Priorité 1 en cas de brouillage',
			authorName: 'M. Israel',
			role: 'lead_architect'
		});

		expect(stmt.triplet.predicate).toBe('excludes_variant');
		expect(stmt.triplet.value).toContain('Variante B');
		expect(stmt.triplet.value).toContain('perte d éligibilité MCX');
		expect(stmt.authority.productionMode).toBe('human-authored');
	});

	it('Scenario: Règle d or du silence - Absence de modification ne produit aucun énoncé', () => {
		// Cas 1 : Texte identique (aucun changement)
		const identicalResult = captureTextDiffAsStatement({
			subjectId: 'sub_sync',
			sectionRef: '§4.2',
			originalText: 'holdover ≥ 30 j',
			editedText: 'holdover ≥ 30 j',
			authorName: 'M. Israel',
			role: 'infra_expert_architect'
		});
		expect(identicalResult.hasDiff).toBe(false);
		expect(identicalResult.statement).toBeUndefined();

		// Cas 2 : Texte vide ou espaces uniquement
		const emptyResult = captureTextDiffAsStatement({
			subjectId: 'sub_sync',
			sectionRef: '§4.2',
			originalText: 'holdover ≥ 30 j',
			editedText: '   ',
			authorName: 'M. Israel',
			role: 'infra_expert_architect'
		});
		expect(emptyResult.hasDiff).toBe(false);
		expect(emptyResult.statement).toBeUndefined();
	});
});
