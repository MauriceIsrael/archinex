import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPONENT_CATALOG,
  DEFAULT_VALUE_CATALOGS,
  evaluateComponentIntegrationCharter,
  type LogicalComponent,
  type OrganizationSpec
} from '../../src/lib/domain/edp/componentCatalog.js';
import { buildImpV2OpaInput } from '../../src/lib/domain/edp/refResolver.js';

describe('IMP V2 Lot 3 (#305) : Oracles OPA/Rego Axe 10, Charte d’intégration & Payload input.imp_v2', () => {
  it('vérifie la présence de toutes les règles Rego Axe 10 (IMP V2) dans edp/policies/multi_axis_refinement.rego', () => {
    const rego = readFileSync(
      resolve(process.cwd(), 'edp/policies/multi_axis_refinement.rego'),
      'utf8'
    );

    const expectedRules = [
      'deny_certificate_without_profile',
      'deny_inline_x509_certificate_properties',
      'deny_non_rgs_rsa_key_size',
      'deny_deprecated_tls_version',
      'deny_organization_with_component_sections',
      'deny_missing_driver_capability',
      'deny_integration_charter_violation',
      'deny_unprotected_cross_zone_firewall_path',
      'deny_ip_fabric_security_violation'
    ];

    for (const rule of expectedRules) {
      expect(rego, `Règle Rego manquante : ${rule}`).toContain(rule);
    }
  });

  it('évalue la charte d’intégration (§2.3) sur un composant conforme vs incomplet', () => {
    const validComp = DEFAULT_COMPONENT_CATALOG.find((c) => !c.metadata.external)!;
    const validRes = evaluateComponentIntegrationCharter(validComp);
    expect(validRes.eligible).toBe(true);
    expect(validRes.missing).toEqual([]);

    const incompleteComp: LogicalComponent = {
      ...structuredClone(validComp),
      metadata: { ...validComp.metadata, name: 'incomplete-svc' },
      spec: {
        class: 'business',
        compute: { modules: [] },
        firewall: { policy: 'deny-by-default', groups: [], rules: [] }
      }
    };
    const invalidRes = evaluateComponentIntegrationCharter(incompleteComp);
    expect(invalidRes.eligible).toBe(false);
    expect(invalidRes.missing.length).toBeGreaterThanOrEqual(3);
  });

  it('construit le payload input.imp_v2 déterministe pour l’oracle OPA Axe 10', () => {
    const comp = structuredClone(DEFAULT_COMPONENT_CATALOG.find((c) => !c.metadata.external)!);
    comp.spec.exposure = {
      entryPoints: [
        {
          name: 'ep-main',
          type: 'api-gateway',
          hostname: 'api.example.io',
          vip: 'ref(network.reserved[vip-api])',
          certificates: ['ref(certificates[c1])'],
          tls: { minVersion: 'tls1.2', termination: 'on-proxy' },
          routes: [{ path: '/v1', backend: 'ref(network.loadBalancers[lb].listeners[https])' }]
        }
      ]
    };

    const org: OrganizationSpec = {
      apiVersion: 'imp.example.io/v1',
      kind: 'Organization',
      metadata: {
        name: 'org-beta',
        displayName: 'Beta',
        status: 'active',
        version: '1.0.0',
        manifestVersion: 1
      },
      spec: {
        type: 'customer',
        dnsDomains: ['beta.example.io'],
        apns: [],
        consumes: [],
        contacts: { owner: 'beta@example.io', oncall: 'ops-beta' }
      }
    };

    const payload = buildImpV2OpaInput({
      components: [comp],
      organizations: [org],
      requiredDriverOperations: ['createTenant', 'applyFirewall'],
      catalogs: DEFAULT_VALUE_CATALOGS,
      evaluateCharter: true
    });

    expect(payload.certificate_profiles.map((p) => p.name)).toContain('tls-server-std');
    expect(payload.tls_min_versions).toEqual(['tls1.2']);
    expect(payload.organizations).toHaveLength(1);
    expect(payload.available_driver_operations).toContain('applyFirewall');
    expect(payload.required_driver_operations).toEqual(['createTenant', 'applyFirewall']);
    expect(payload.charter_checks).toHaveLength(1);
    expect(payload.charter_checks[0].eligible).toBe(true);
    expect(payload.firewall_path_errors).toEqual([]);
    expect(payload.ip_fabric_errors).toEqual([]);
  });
});
