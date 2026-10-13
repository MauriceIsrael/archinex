import { describe, it, expect } from 'vitest';
import {
	detectApplicableFrameworks,
	isGenericFrameworkVersion,
	lookupDefaultFrameworkVersion
} from '$lib/domain/regulatoryFrameworks';
import { toViolations } from '$lib/server/compliance/complianceService';
import { LLMOpsClient } from '$lib/server/llmops/client';
import { coverageWarnings } from '$lib/domain/maturityRules';
import { vi, afterEach } from 'vitest';

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

describe('Couverture réglementaire lue dans LLMOps', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('lit le format servi (coverage par référentiel) et en tire des alertes, pas des blocages', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
			status: 'ok',
			engagement: 'lulu',
			applicable_frameworks: ['CRA', 'NIS2'],
			coverage: {
				CRA: { status: 'partial', expected: 29, present: 0, validated: 0, missing_ids: ['CRA-ART14-1'] },
				NIS2: { status: 'covered', expected: 19, present: 19, validated: 19, missing_ids: [] }
			}
		}), { status: 200, headers: { 'Content-Type': 'application/json' } })));

		const cov = await new LLMOpsClient({ baseUrl: 'http://127.0.0.1:8123' }).getFrameworkCoverage('lulu');
		expect(cov.offline).toBe(false);
		expect(cov.overall_coverage).toBe('partial');
		expect(cov.frameworks).toEqual([
			{ name: 'CRA', required: true, status: 'partial', covered_count: 0, total_count: 29, missing_clauses: ['CRA-ART14-1'] },
			{ name: 'NIS2', required: true, status: 'covered', covered_count: 19, total_count: 19, missing_clauses: [] }
		]);

		const warnings = coverageWarnings(cov.frameworks.map((f) => ({ frameworkId: f.name, name: f.name, status: f.status, validatedCount: f.covered_count, expectedCount: f.total_count })));
		expect(warnings).toHaveLength(1);
		expect(warnings[0].message).toContain('CRA (0 exigence(s) validée(s) sur 29)');
	});
});

describe('Versions officielles et détection des versions génériques (#93)', () => {
	it('identifie les versions génériques à refuser', () => {
		expect(isGenericFrameworkVersion('1.0')).toBe(true);
		expect(isGenericFrameworkVersion('1')).toBe(true);
		expect(isGenericFrameworkVersion('1.0.0')).toBe(true);
		expect(isGenericFrameworkVersion('v1')).toBe(true);
		expect(isGenericFrameworkVersion('v1.0')).toBe(true);
		expect(isGenericFrameworkVersion('latest')).toBe(true);
		expect(isGenericFrameworkVersion('draft')).toBe(true);
		expect(isGenericFrameworkVersion('')).toBe(true);
		expect(isGenericFrameworkVersion(null)).toBe(true);
		expect(isGenericFrameworkVersion(undefined)).toBe(true);

		// Versions légales authentiques autorisées
		expect(isGenericFrameworkVersion('2022/2555')).toBe(false);
		expect(isGenericFrameworkVersion('2024/2847')).toBe(false);
		expect(isGenericFrameworkVersion('2016/679')).toBe(false);
		expect(isGenericFrameworkVersion('2022')).toBe(false);
		expect(isGenericFrameworkVersion('3.2')).toBe(false);
	});

	it('pré-remplit la version officielle selon le catalogue ou complianceFrameworks', () => {
		expect(lookupDefaultFrameworkVersion('NIS2')).toBe('2022/2555');
		expect(lookupDefaultFrameworkVersion('nis2')).toBe('2022/2555');
		expect(lookupDefaultFrameworkVersion('Directive NIS 2')).toBe('2022/2555');
		expect(lookupDefaultFrameworkVersion('CRA')).toBe('2024/2847');
		expect(lookupDefaultFrameworkVersion('Cyber Resilience Act')).toBe('2024/2847');
		expect(lookupDefaultFrameworkVersion('RGPD')).toBe('2016/679');
		expect(lookupDefaultFrameworkVersion('SecNumCloud')).toBe('3.2');
		expect(lookupDefaultFrameworkVersion('ISO27001')).toBe('2022');

		// Avec liste issue de GET /api/compliance/frameworks
		const compliance = [
			{ framework: 'CUSTOM-SEC', version: '2025-v2', title: 'Custom Sec' },
			{ framework: 'NIS2', version: '2022/2555', title: 'NIS 2' }
		];
		expect(lookupDefaultFrameworkVersion('CUSTOM-SEC', compliance)).toBe('2025-v2');
		expect(lookupDefaultFrameworkVersion('INCONNU')).toBeUndefined();
	});
});

