import { describe, it, expect, vi } from 'vitest';
import { loadOntologyCatalog } from '$lib/server/edp/ontologyClient';
import {
  decomposeIntentionClauses,
  computeRefinementCoverage,
  composeMultiAxisHydration,
  evaluateMultiAxisOracle,
  extractClauseIdentifiers,
  findStrongLinkForLeaf
} from '$lib/server/edp/refinementCoverage';
import { evaluateSylvaGoldenRules } from '$lib/server/edp/sylvaValidation';
import { syncHydratedInventoryToNautobot } from '$lib/server/edp/nautobotSync';

describe('EDP Strong Clause <-> Ontology Leaf Link Contract (Issue #262)', () => {
  it('1. Extrait fidèlement les URNs de clauses et identifiants d’exigences', () => {
    const text = 'Conformité obligatoire avec REQ-Lot1-1343 et la doctrine urn:archinex:kb:clause:nis2:art21_crypto.';
    const ids = extractClauseIdentifiers(text);
    expect(ids).toContain('REQ-Lot1-1343');
    expect(ids).toContain('urn:archinex:kb:clause:nis2:art21_crypto');
  });

  it('2. Résout une feuille d’ontologie via Lien Fort (governed_by_clauses & satisfies_clause) de manière déterministe', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const leafBaremetal = catalog.entities['urn:archinex:ontology:infrastructure:server:baremetal'];
    expect(leafBaremetal).toBeDefined();

    // Vérification directe de findStrongLinkForLeaf via governed_by_clauses
    const linkBaremetal = findStrongLinkForLeaf(leafBaremetal, ['REQ-Lot1-268'], catalog);
    expect(linkBaremetal).not.toBeNull();
    expect(linkBaremetal?.matchedIdentifier).toBe('REQ-Lot1-268');
    expect(linkBaremetal?.isUrn).toBe(false);

    // Vérification directe de findStrongLinkForLeaf via triplet satisfies_clause
    const leafCrypto = catalog.entities['urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256'];
    const linkCryptoTriplet = findStrongLinkForLeaf(leafCrypto, ['REQ-Lot1-1343'], catalog);
    expect(linkCryptoTriplet).not.toBeNull();
    expect(linkCryptoTriplet?.matchedIdentifier).toBe('REQ-Lot1-1343');

    // Décomposition des intentions : priorité absolue au lien fort sur le scoring lexical
    const clauses = decomposeIntentionClauses(
      {
        subjectId: 'sub-test-262',
        title: 'Chiffrement IPsec ESP',
        structuredFacts: [
          {
            id: 'fact-1',
            statement: 'Raccordement inter-sites selon la clause urn:archinex:kb:clause:nis2:art21_crypto (exigence REQ-Lot1-1343)'
          },
          {
            id: 'fact-2',
            statement: 'Substrat matériel selon exigence REQ-Lot1-268'
          },
          {
            id: 'fact-3',
            statement: 'Clause ad-hoc non répertoriée avec mots-clés oob et administration'
          }
        ]
      },
      catalog,
      new Set([
        'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256',
        'urn:archinex:ontology:infrastructure:server:baremetal'
      ])
    );

    // Clause 1 : liée fortement à ipsec_ikev2_aes256
    const cl1 = clauses.find((c) => c.text.includes('urn:archinex:kb:clause:nis2:art21_crypto'));
    expect(cl1).toBeDefined();
    expect(cl1?.matchMethod).toBe('strong_link');
    expect(cl1?.matchedLeafUrn).toBe('urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256');
    expect(cl1?.matchedClauseUrn).toBe('urn:archinex:kb:clause:nis2:art21_crypto');
    expect(cl1?.matchedRequirementId).toBe('REQ-Lot1-1343');
    expect(cl1?.status).toBe('covered');

    // Clause 2 : liée fortement à infrastructure:server:baremetal
    const cl2 = clauses.find((c) => c.text.includes('REQ-Lot1-268'));
    expect(cl2).toBeDefined();
    expect(cl2?.matchMethod).toBe('strong_link');
    expect(cl2?.matchedLeafUrn).toBe('urn:archinex:ontology:infrastructure:server:baremetal');
    expect(cl2?.matchedRequirementId).toBe('REQ-Lot1-268');

    // Clause 3 : repli heuristique
    const cl3 = clauses.find((c) => c.text.includes('Clause ad-hoc'));
    expect(cl3).toBeDefined();
    expect(cl3?.matchMethod).toBe('heuristic');
    expect(cl3?.matchedLeafUrn).toBe('urn:archinex:ontology:telecom:network:oob');
  });

  it('3. Rétro-traçabilité des violations OPA dans multi_axis_refinement.rego (violated_clause_urn & violated_requirement_id)', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const bindings = [
      { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
      { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 },
      { urn: 'urn:archinex:ontology:security:zone:oam', revision: 2 },
      { urn: 'urn:archinex:ontology:platform:env:iso_prod_3tiers', revision: 1 },
      { urn: 'urn:archinex:ontology:facilities:power:dual_feed_2n', revision: 1 },
      { urn: 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256', revision: 1 }
    ];

    // Simulation d'une dérive matérielle (Drift HW non homologué)
    const driftHwInventory = composeMultiAxisHydration('sub-drift-hw', bindings, catalog, {
      deviceType: 'Supermicro-Unapproved-Whitebox'
    });

    const hwEval = await evaluateMultiAxisOracle(driftHwInventory, bindings, catalog);
    expect(hwEval.verdict).toBe('violated');
    const hwViolation = hwEval.violations.find((v) =>
      v.rule.includes('deny_unapproved_hardware_profile')
    );
    expect(hwViolation).toBeDefined();
    expect(hwViolation?.violated_clause_urn).toBe('urn:archinex:kb:clause:infrastructure:baremetal_sylva');
    expect(hwViolation?.violated_requirement_id).toBe('REQ-Lot1-268');

    // Simulation d'une dérive cryptographique WAN (Contournement de médiation S6a)
    const driftBypassInventory = composeMultiAxisHydration('sub-drift-wan', bindings, catalog, {
      s6aDirectBypassDea: true
    });
    const wanEval = await evaluateMultiAxisOracle(driftBypassInventory, bindings, catalog);
    expect(wanEval.verdict).toBe('violated');
    const wanViolation = wanEval.violations.find((v) =>
      v.rule.includes('deny_unmediated_s6a_direct_flow')
    );
    expect(wanViolation).toBeDefined();
    expect(wanViolation?.violated_clause_urn).toBe('urn:archinex:kb:clause:nis2:art21_crypto');
    expect(wanViolation?.violated_requirement_id).toBe('REQ-Lot1-1343');
  });

  it('4. Rétro-traçabilité des violations OPA dans sylva_golden_rules.rego', async () => {
    // Évaluation d'un manifest non conforme (Cilium désactivé, image non durcie)
    const nonCompliantManifest = {
      spec: {
        units: {
          cilium: { enabled: false },
          monitoring: { enabled: false }
        },
        os_image_selector: {
          hardened: false
        }
      }
    };

    const sylvaEval = await evaluateSylvaGoldenRules(nonCompliantManifest);
    expect(sylvaEval.verdict).toBe('violated');
    expect(sylvaEval.violations.length).toBeGreaterThanOrEqual(2);

    const ciliumViolation = sylvaEval.violations.find((v) =>
      v.rule.includes('cni_cilium_mandatory')
    );
    expect(ciliumViolation).toBeDefined();
    expect(ciliumViolation?.violated_clause_urn).toBe('urn:archinex:kb:clause:sylva:cilium_mandatory');
    expect(ciliumViolation?.violated_requirement_id).toBe('REQ-Sylva-01');

    const osViolation = sylvaEval.violations.find((v) =>
      v.rule.includes('os_image_hardened')
    );
    expect(osViolation).toBeDefined();
    expect(osViolation?.violated_clause_urn).toBe('urn:archinex:kb:clause:sylva:hardened_os');
    expect(osViolation?.violated_requirement_id).toBe('REQ-Sylva-03');
  });

  it('5. Empreinte de traçabilité dans les artefacts hydratés SylvaWorkloadCluster et Nautobot 2.x', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const bindings = [
      { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
      { urn: 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256', revision: 1 },
      { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 }
    ];

    const hydrated = composeMultiAxisHydration('sub-trace-test', bindings, catalog);

    // Vérification des annotations KRM Sylva
    const annotations = (hydrated.sylva_workload_cluster_values as any)?.metadata?.annotations;
    expect(annotations).toBeDefined();
    expect(annotations['archinex.io/satisfied-clauses']).toBeDefined();
    expect(annotations['archinex.io/satisfied-clauses']).toContain('urn:archinex:kb:clause:nis2:art21_crypto');
    expect(annotations['archinex.io/satisfied-clauses']).toContain('REQ-Lot1-1343');
    expect(annotations['archinex.io/satisfied-clauses']).toContain('REQ-Lot1-268');

    expect(annotations['archinex.io/evaluated-triplets']).toBeDefined();
    expect(annotations['archinex.io/evaluated-triplets']).toContain('tr-008');

    // Vérification de la transmission vers Nautobot (Custom Fields & Tags)
    const mockPostOrPatch = vi.fn();
    const fakeFetch: typeof fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/status/')) {
        return new Response(JSON.stringify({ 'nautobot-server': '2.2.0' }), { status: 200 });
      }
      if (urlStr.includes('/api/extras/statuses/')) {
        return new Response(JSON.stringify({ results: [{ id: 'stat-planned', name: 'Planned' }, { id: 'stat-active', name: 'Active' }] }), { status: 200 });
      }
      if (urlStr.includes('/api/dcim/locations/')) {
        return new Response(JSON.stringify({ results: [{ id: 'loc-1', name: 'pop-valmondois', location_type: { id: 'lt-1' } }] }), { status: 200 });
      }
      if (urlStr.includes('/api/dcim/manufacturers/')) {
        return new Response(JSON.stringify({ results: [{ id: 'mfr-1' }] }), { status: 200 });
      }
      if (urlStr.includes('/api/dcim/device-types/')) {
        return new Response(JSON.stringify({ results: [{ id: 'dt-1' }] }), { status: 200 });
      }
      if (urlStr.includes('/api/extras/roles/')) {
        return new Response(JSON.stringify({ results: [{ id: 'role-1' }] }), { status: 200 });
      }

      if (init?.method === 'POST' || init?.method === 'PATCH') {
        mockPostOrPatch(urlStr, JSON.parse(String(init.body)));
      }

      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });

    const syncSummary = await syncHydratedInventoryToNautobot(hydrated, {
      baseUrl: 'http://nautobot.local',
      token: 'fake-token',
      fetchImpl: fakeFetch
    });

    expect(syncSummary.reachable).toBe(true);
    // Vérifier qu'au moins un appel de création/maj d'équipement a inclus custom_fields.satisfied_clauses
    const deviceCalls = mockPostOrPatch.mock.calls.filter(([url]) => url.includes('/api/dcim/devices/'));
    expect(deviceCalls.length).toBeGreaterThan(0);
    const firstDevPayload = deviceCalls[0][1];
    expect(firstDevPayload.custom_fields?.satisfied_clauses).toBeDefined();
    expect(firstDevPayload.custom_fields.satisfied_clauses).toContain('REQ-Lot1-1343');
    expect(Array.isArray(firstDevPayload.tags)).toBe(true);
  });
});
