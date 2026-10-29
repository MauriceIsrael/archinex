import { describe, it, expect } from 'vitest';
import {
  validateRefinedInput,
  type ExpectedSourceContract,
  type RefinedInputPayload
} from '../../src/lib/domain/edp/validateRefinedInput.js';

describe('EDP Refinement Input Contract (Issue #170)', () => {
  const dummySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  const expectedInputs: ExpectedSourceContract[] = [
    { source: 'k8s_manifests', schema_version: 'v1alpha1' },
    { source: 'nautobot_planned_devices', schema_version: 'v2.0' }
  ];

  const validPayload: RefinedInputPayload = {
    sources: {
      k8s_manifests: {
        provenance: {
          tool: 'helm',
          version: 'v3.14.0',
          command: 'helm template sylva-core',
          sha256: dummySha256,
          generated_at: '2026-10-29T10:00:00Z'
        },
        content: [{ kind: 'Cluster', metadata: { name: 'cluster-edge-01' } }]
      },
      nautobot_planned_devices: {
        provenance: {
          tool: 'nautobot-gql-exporter',
          version: '1.2.0',
          command: 'query { devices(status: "planned") }',
          sha256: dummySha256,
          generated_at: '2026-10-29T10:05:00Z'
        },
        content: [{ name: 'srv-edge-01', status: 'planned' }]
      }
    }
  };

  it('valide avec succès une entrée complète avec provenance certifiée', () => {
    const result = validateRefinedInput(validPayload, expectedInputs);
    expect(result.valid).toBe(true);
    expect(result.verdict).toBe('compliant');
    expect(result.missing_sources).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('refuse une entrée omettant une des sources déclarées (verdict: insufficient_input)', () => {
    const incompletePayload: RefinedInputPayload = {
      sources: {
        k8s_manifests: validPayload.sources.k8s_manifests
      }
    };

    const result = validateRefinedInput(incompletePayload, expectedInputs);
    expect(result.valid).toBe(false);
    expect(result.verdict).toBe('insufficient_input');
    expect(result.missing_sources).toContain('nautobot_planned_devices');
    expect(result.errors.some((e) => e.includes('nautobot_planned_devices'))).toBe(true);
  });

  it('refuse une source déclarée présente mais vide (verdict: insufficient_input nommant la source)', () => {
    const emptyPayload: RefinedInputPayload = {
      sources: {
        k8s_manifests: validPayload.sources.k8s_manifests,
        nautobot_planned_devices: {
          provenance: validPayload.sources.nautobot_planned_devices.provenance,
          content: [] // Liste vide
        }
      }
    };

    const result = validateRefinedInput(emptyPayload, expectedInputs);
    expect(result.valid).toBe(false);
    expect(result.verdict).toBe('insufficient_input');
    expect(result.missing_sources).toContain('nautobot_planned_devices');
    expect(
      result.errors.some((e) => e.includes('nautobot_planned_devices') && e.includes('vide'))
    ).toBe(true);
  });

  it('refuse une entrée dont la provenance est manquante ou incomplète', () => {
    const badProvenancePayload = {
      sources: {
        k8s_manifests: {
          provenance: {
            tool: 'helm'
            // manque version, command, sha256, generated_at
          },
          content: [{ kind: 'Cluster' }]
        },
        nautobot_planned_devices: validPayload.sources.nautobot_planned_devices
      }
    };

    const result = validateRefinedInput(badProvenancePayload, expectedInputs);
    expect(result.valid).toBe(false);
    expect(result.verdict).toBe('insufficient_input');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('refuse une entrée contenant une source non déclarée dans l’EDP (verdict: violated)', () => {
    const undeclaredPayload: RefinedInputPayload = {
      sources: {
        ...validPayload.sources,
        unauthorized_netbox_dump: {
          provenance: {
            tool: 'curl',
            version: '8.0',
            command: 'curl http://netbox/api',
            sha256: dummySha256,
            generated_at: '2026-10-29T10:00:00Z'
          },
          content: { test: true }
        }
      }
    };

    const result = validateRefinedInput(undeclaredPayload, expectedInputs);
    expect(result.valid).toBe(false);
    expect(result.verdict).toBe('violated');
    expect(result.errors.some((e) => e.includes('unauthorized_netbox_dump'))).toBe(true);
  });
});

