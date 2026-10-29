import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { verifyEdp } from '../../src/lib/server/edp/edpVerify.js';
import { sanitizeManifests, transformSylvaManifestsToRefinedInput } from '../../src/lib/server/edp/adapters/sylvaAdapter.js';
import { normalizeNautobotDevice, transformNautobotExportToRefinedInput } from '../../src/lib/server/edp/adapters/nautobotAdapter.js';
import { runEdpArchitectureGate } from '../../scripts/edp-gate.js';
import { validateRefinedInput } from '../../src/lib/domain/edp/validateRefinedInput.js';

describe('EDP Verify and Gate Contract Tests (Palier 4, Issues #182, #178, #179, #183, #185)', () => {
  const adr012Dir = resolve(process.cwd(), 'edp/examples/adr012-baremetal');
  const edpPath = resolve(adr012Dir, 'edp.json');
  const policyPath = resolve(adr012Dir, 'policy.rego');
  const testPath = resolve(adr012Dir, 'policy_test.rego');
  const passInputPath = resolve(adr012Dir, 'mocks/pass.json');
  const failInput1Path = resolve(adr012Dir, 'mocks/fail_rule_1_missing_oob.json');
  const failInput2Path = resolve(adr012Dir, 'mocks/fail_rule_2_bmc_url_mismatch.json');

  describe('Sylva Adapter (#178)', () => {
    it('redacts secrets and drops Secret kind manifests', () => {
      const manifests = [
        {
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: { name: 'cluster-secret' },
          data: { token: 'supersecret' }
        },
        {
          apiVersion: 'metal3.io/v1alpha1',
          kind: 'BareMetalHost',
          metadata: { name: 'node-01' },
          spec: {
            bmc: {
              address: 'redfish-virtualmedia://192.0.2.10/redfish/v1/Systems/1',
              password: 'bmcpassword123'
            }
          }
        }
      ];

      const sanitized = sanitizeManifests(manifests) as any[];
      expect(sanitized).toHaveLength(1);
      expect(sanitized[0].kind).toBe('BareMetalHost');
      expect(sanitized[0].spec.bmc.password).toBe('[REDACTED_SECRET]');
      expect(sanitized[0].spec.bmc.address).toBe('redfish-virtualmedia://192.0.2.10/redfish/v1/Systems/1');
    });

    it('transforms Sylva manifests into valid refined_input payload', () => {
      const rawManifests = JSON.parse(
        readFileSync(resolve(process.cwd(), 'tests/fixtures/edp/sylva/pass_manifests.json'), 'utf-8')
      );

      const refined = transformSylvaManifestsToRefinedInput({
        manifests: rawManifests,
        chartVersion: '0.4.1',
        command: 'helm template sylva-core sylva/sylva-core'
      });

      const validation = validateRefinedInput(refined, [
        { source: 'k8s_manifests', schema_version: '1.0' }
      ]);
      expect(validation.valid).toBe(true);
      expect(refined.sources.k8s_manifests.provenance.tool).toBe('helm');
      expect((refined.sources.k8s_manifests.content as any[])).toHaveLength(2);
    });
  });

  describe('Nautobot Adapter (#179)', () => {
    it('normalizes nautobot devices and removes CIDR mask from IP', () => {
      const rawDevice = {
        name: 'edge-worker-01',
        status: { name: 'Active', value: 'planned' },
        role: 'worker',
        oob_ip: { address: '192.0.2.11/24' },
        interfaces: [{ name: 'bmc', type: '1000base-t' }]
      };

      const normalized = normalizeNautobotDevice(rawDevice);
      expect(normalized.name).toBe('edge-worker-01');
      expect(normalized.status).toBe('planned');
      expect(normalized.oob_ip).toBe('192.0.2.11');
      expect(normalized.interfaces).toEqual([{ name: 'bmc', type: '1000base-t' }]);
    });

    it('transforms Nautobot devices into valid refined_input payload', () => {
      const rawDevices = JSON.parse(
        readFileSync(resolve(process.cwd(), 'tests/fixtures/edp/nautobot/pass_devices.json'), 'utf-8')
      );

      const refined = transformNautobotExportToRefinedInput({
        devices: rawDevices,
        version: '2.2.0'
      });

      const validation = validateRefinedInput(refined, [
        { source: 'nautobot_planned_devices', schema_version: '1.0' }
      ]);
      expect(validation.valid).toBe(true);
      expect(refined.sources.nautobot_planned_devices.provenance.tool).toBe('nautobot-gql-exporter');
      expect((refined.sources.nautobot_planned_devices.content as any[])).toHaveLength(1);
    });
  });

  describe('Verify EDP Service (#182)', () => {
    it('verifies compliant mock and emits sealed evidence bundle (exit code 0)', async () => {
      const result = await verifyEdp({
        edpInput: edpPath,
        inputPathOrData: passInputPath
      });

      expect(result.exitCode).toBe(0);
      expect(result.verdict).toBe('compliant');
      expect(result.evidenceBundle).toBeDefined();
      expect(result.evidenceBundle?.edp_id).toBe('EDP-ADR012-01');
      expect(result.evidenceBundle?.verdict).toBe('compliant');
      expect(result.evidenceBundle?.violations).toHaveLength(0);
      expect(result.evidenceBundle?.policy_sha256).toBeDefined();
      expect(result.evidenceBundle?.ontology_fingerprint).toBeDefined();
    });

    it('verifies non-compliant mock and returns violations (exit code 1)', async () => {
      const result = await verifyEdp({
        edpInput: edpPath,
        inputPathOrData: failInput1Path
      });

      expect(result.exitCode).toBe(1);
      expect(result.verdict).toBe('violated');
      expect(result.evidenceBundle).toBeDefined();
      expect(result.evidenceBundle?.verdict).toBe('violated');
      expect(result.evidenceBundle?.violations.length).toBeGreaterThan(0);
      expect(result.evidenceBundle?.violations).toContain('rule_oob_required');
    });

    it('returns insufficient_input when mandatory input fields are missing (exit code 2)', async () => {
      const emptyInput = {
        sources: {
          dummy: {
            provenance: {
              tool: 'manual',
              version: '1.0.0',
              command: 'test',
              sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
              collected_at: new Date().toISOString()
            },
            data: {}
          }
        }
      };

      const result = await verifyEdp({
        edpInput: edpPath,
        inputPathOrData: emptyInput
      });

      expect(result.exitCode).toBe(2);
      expect(result.verdict).toBe('insufficient_input');
    });

    it('returns exit code 3 when OPA is unavailable', async () => {
      const result = await verifyEdp({
        edpInput: edpPath,
        inputPathOrData: passInputPath,
        opaPath: resolve(process.cwd(), 'tools/bin/non-existent-opa-binary.exe')
      });

      expect(result.exitCode).toBe(3);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('EDP Architecture Gate (#185)', () => {
    it('successfully evaluates complete architecture gate for ADR-012', async () => {
      const result = await runEdpArchitectureGate({
        edpPath,
        policyPath,
        testPath,
        passInputPath,
        failInputPaths: [failInput1Path, failInput2Path]
      });

      expect(result.schemaValid).toBe(true);
      expect(result.opaTestPassed).toBe(true);
      expect(result.mutationScore).toBe(100);
      expect(result.allMutantsKilled).toBe(true);
      expect(result.passVerifyVerdict).toBe('compliant');
      expect(result.failVerifications).toHaveLength(2);
      expect(result.failVerifications.every((f) => f.expectedFail)).toBe(true);
      expect(result.gatePassed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
