import { describe, it, expect } from 'vitest';
import { detectApplicableFrameworks } from '$lib/domain/regulatoryFrameworks';
import { toViolations } from '$lib/server/compliance/complianceService';

describe('Référentiels réglementaires cités par un RFP', () => {
	it('détecte les référentiels cités, du plus cité au moins cité, avec un extrait', () => {
		const rfp = `The following requirement is derived from article 21 of Directive (EU) 2022/2555 ("NIS2 Directive").
			The operator shall comply with GDPR. Any violation of GDPR shall be reported. The system shall comply with EN ISO/IEC 27001.
			Products shall meet the Cyber Resilience Act.`;
		const found = detectApplicableFrameworks(rfp);
		// À égalité de mentions, l'ordre du catalogue est conservé
		expect(found.map((f) => f.code)).toEqual(['NIS2', 'RGPD', 'CRA', 'ISO27001']);
		expect(found[0].mentions).toBe(2);
		expect(found.find((f) => f.code === 'ISO27001')?.excerpt).toContain('ISO/IEC 27001');
	});

	it('ne propose rien sans mention explicite', () => {
		expect(detectApplicableFrameworks('Disponibilité de 99,99 % sur deux sites redondés.')).toEqual([]);
	});
});

describe('Verdicts de conformité LLMOps', () => {
	it('ne retient que les violations ; seules les clauses validées sont bloquantes', () => {
		const violations = toViolations('opt-1', [
			{ typed_id: 'control:NIS2-ART21-2J', check_id: 'C1', verdict: 'violates', message: 'MFA exigée.', check_status: 'validated', matched_terms: ['mot de passe seul'] },
			{ typed_id: 'principle:P-001', check_id: 'C2', verdict: 'violates', message: null, check_status: 'draft' },
			{ typed_id: 'control:RGPD-ART32', verdict: 'unassessed' },
			{ typed_id: 'control:NIS2-ART21-2H', verdict: 'supports', check_status: 'validated' }
		]);
		expect(violations).toEqual([
			{ optionId: 'opt-1', typedId: 'control:NIS2-ART21-2J', checkId: 'C1', message: 'MFA exigée.', matchedTerms: ['mot de passe seul'], sourceRef: null, validated: true },
			{ optionId: 'opt-1', typedId: 'principle:P-001', checkId: 'C2', message: 'Non conforme à principle:P-001', matchedTerms: [], sourceRef: null, validated: false }
		]);
	});
});
