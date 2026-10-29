import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateEdpPackage } from '../../src/lib/domain/edp/validateEdp.js';

function loadFixture(filename: string): unknown {
  const filepath = resolve(process.cwd(), 'tests/fixtures/edp', filename);
  return JSON.parse(readFileSync(filepath, 'utf-8'));
}

describe('EDP JSON Schema Contract (Issue #168)', () => {
  describe('Fixtures Valides', () => {
    const validFixtures = [
      'valid-adr012-baremetal.json',
      'valid-adr015-security-zones.json'
    ];

    it.each(validFixtures)('valide avec succès la fixture %s', (fixtureName) => {
      const fixture = loadFixture(fixtureName);
      const result = validateEdpPackage(fixture);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Fixtures Invalides Rejetées', () => {
    const invalidCases = [
      {
        fixture: 'invalid-missing-metadata.json',
        expectedKeyword: 'required',
        expectedField: 'metadata'
      },
      {
        fixture: 'invalid-missing-oracle.json',
        expectedKeyword: 'required',
        expectedField: 'verification_oracle'
      },
      {
        fixture: 'invalid-missing-selftest.json',
        expectedKeyword: 'required',
        expectedField: 'self_test'
      },
      {
        fixture: 'invalid-empty-expected-inputs.json',
        expectedKeyword: 'minItems',
        expectedField: 'expected_inputs'
      },
      {
        fixture: 'invalid-bad-status.json',
        expectedKeyword: 'enum',
        expectedField: 'status'
      },
      {
        fixture: 'invalid-bad-engine.json',
        expectedKeyword: 'enum',
        expectedField: 'engine'
      },
      {
        fixture: 'invalid-bad-sha256.json',
        expectedKeyword: 'pattern',
        expectedField: 'sha256'
      },
      {
        fixture: 'invalid-missing-provenance.json',
        expectedKeyword: 'required',
        expectedField: 'provenance'
      }
    ];

    it.each(invalidCases)(
      'rejette $fixture avec mot-clé "$expectedKeyword" ciblant "$expectedField"',
      ({ fixture, expectedKeyword, expectedField }) => {
        const data = loadFixture(fixture);
        const result = validateEdpPackage(data);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);

        const match = result.errors.some(
          (err) =>
            err.keyword === expectedKeyword &&
            (err.field === expectedField || err.path.includes(expectedField))
        );
        expect(match).toBe(true);
      }
    );
  });

  describe('Critères d’Acceptation Spécifiques', () => {
    it('refuse formellement un EDP sans bloc verification_oracle', () => {
      const valid = loadFixture('valid-adr012-baremetal.json') as any;
      const withoutOracle = { ...valid };
      delete withoutOracle.verification_oracle;

      const result = validateEdpPackage(withoutOracle);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'verification_oracle')).toBe(true);
    });

    it('refuse formellement un EDP sans self_test', () => {
      const valid = loadFixture('valid-adr012-baremetal.json') as any;
      const withoutSelfTest = JSON.parse(JSON.stringify(valid));
      delete withoutSelfTest.verification_oracle.self_test;

      const result = validateEdpPackage(withoutSelfTest);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'self_test')).toBe(true);
    });
  });
});

