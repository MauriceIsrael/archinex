/**
 * Proposition aux experts OOB/OAM (LLMOps#192, Archinex#417) :
 *  - D2 : `deny_shared_oob_network` vérifie l'isolement du plan OOB (VRF dédiée), pas seulement les équipements ;
 *  - D4 : le niveau d'isolement se compare PAR RANG sur l'échelle du Hub (strict < air-gap-logical : plus isolé = conforme) ;
 *  - D6 : le plan usager porte un vrai `isolation_level` ; une valeur hors échelle est refusée à l'ingestion.
 */
import { describe, it, expect } from 'vitest';
import { loadOntologyCatalog, type OntologyCatalog } from '../../src/lib/server/edp/ontologyClient';
import { composeMultiAxisHydration, evaluateMultiAxisOracle } from '../../src/lib/server/edp/refinementCoverage';
import { compileOntologyProjections } from '../../src/lib/server/edp/projectionCompiler';

const U = 'urn:archinex:ontology:';
const urns = [
  'infrastructure:server:baremetal',
  'telecom:network:oob',
  'security:zone:oam',
  'security:zone:user_plane',
  'platform:env:iso_prod_3tiers',
  'facilities:power:dual_feed_2n'
].map((k) => U + k);

async function setup() {
  const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
  const bindings = urns.map((urn) => ({ urn, revision: catalog.entities[urn].revision }));
  return { catalog, bindings };
}

const rulesOf = (r: { violations: Array<{ rule: string }> }) => r.violations.map((v) => v.rule.split('.').pop());

describe('D2 : l’isolement du plan OOB est vérifié (deny_shared_oob_network)', () => {
  it('une architecture conforme déclare une VRF OOB et y place les interfaces de gestion, pas celles de données', async () => {
    const { catalog, bindings } = await setup();
    const inv = composeMultiAxisHydration('s-oob-ok', bindings, catalog, {});
    expect(inv.oob_segments).toEqual([{ name: 'OOB-MGMT-VRF', vrf: 'OOB-MGMT-VRF', dhcp_isolated: true }]);
    for (const dev of inv.nautobot_planned_devices as Array<{ interfaces: Array<{ type: string; vrf: string }> }>) {
      expect(dev.interfaces.filter((i) => i.type === 'management').map((i) => i.vrf)).toEqual(['OOB-MGMT-VRF']);
      expect(dev.interfaces.filter((i) => i.type === 'data').map((i) => i.vrf)).toEqual(['default']);
    }
    expect(rulesOf(await evaluateMultiAxisOracle(inv, bindings, catalog))).not.toContain('deny_shared_oob_network');
  });

  it('un plan OOB qui partage le réseau des données est une violation, avec sa clause', async () => {
    const { catalog, bindings } = await setup();
    const inv = composeMultiAxisHydration('s-oob-shared', bindings, catalog, { oobSharedNetwork: true });
    const res = await evaluateMultiAxisOracle(inv, bindings, catalog);
    const v = res.violations.find((x) => x.rule.endsWith('deny_shared_oob_network'));
    expect(res.verdict).toBe('violated');
    expect(v?.message).toContain('oob0');
    expect(v?.violated_clause_urn).toMatch(/^urn:archinex:kb:clause:/);
  });

  it('une VRF OOB qui porte aussi une interface de données est une violation', async () => {
    const { catalog, bindings } = await setup();
    const inv = composeMultiAxisHydration('s-oob-leak', bindings, catalog, {});
    for (const dev of inv.nautobot_planned_devices as Array<{ interfaces: Array<{ type: string; vrf: string }> }>) {
      for (const i of dev.interfaces) if (i.type === 'data') i.vrf = 'OOB-MGMT-VRF';
    }
    const res = await evaluateMultiAxisOracle(inv, bindings, catalog);
    expect(res.violations.some((x) => x.rule.endsWith('deny_shared_oob_network') && x.message.includes('interface de données'))).toBe(true);
  });

  it('aucune VRF OOB déclarée alors que la feuille l’exige est une violation', async () => {
    const { catalog, bindings } = await setup();
    const inv = composeMultiAxisHydration('s-oob-none', bindings, catalog, {});
    inv.oob_segments = [];
    const res = await evaluateMultiAxisOracle(inv, bindings, catalog);
    expect(res.violations.some((x) => x.rule.endsWith('deny_shared_oob_network') && x.message.includes('Aucune VRF OOB'))).toBe(true);
  });

  it('la règle est inerte quand requires_dedicated_vrf est faux (paramètre du Hub)', async () => {
    const { catalog, bindings } = await setup();
    const relaxed: OntologyCatalog = structuredClone(catalog);
    relaxed.entities[U + 'telecom:network:oob'].projections = {
      ...(relaxed.entities[U + 'telecom:network:oob'].projections as object),
      requires_dedicated_vrf: false
    };
    const inv = composeMultiAxisHydration('s-oob-off', bindings, relaxed, { oobSharedNetwork: true });
    expect(rulesOf(await evaluateMultiAxisOracle(inv, bindings, relaxed))).not.toContain('deny_shared_oob_network');
  });

  it('sans feuille OOB liée, aucune règle OOB ne se déclenche', async () => {
    const { catalog } = await setup();
    const bindings = urns.filter((u) => !u.endsWith('network:oob')).map((urn) => ({ urn, revision: catalog.entities[urn].revision }));
    const inv = composeMultiAxisHydration('s-no-oob', bindings, catalog, {});
    expect(inv.oob_segments).toEqual([]);
    expect(rulesOf(await evaluateMultiAxisOracle(inv, bindings, catalog))).not.toContain('deny_shared_oob_network');
  });
});

describe('D4 : l’isolement se compare par rang sur l’échelle du Hub', () => {
  it('le Hub exige strict pour OAM et pour le plan usager', async () => {
    const { catalog } = await setup();
    expect(catalog.entities[U + 'security:zone:oam'].projections).toMatchObject({ isolation_level: 'strict', bastion_required: true });
    expect(catalog.entities[U + 'security:zone:user_plane'].projections).toMatchObject({ isolation_level: 'strict', forwarding_profile: 'high_throughput' });
    expect(catalog.enumerations?.isolation_level.values.map((v) => v.value)).toEqual([
      'shared', 'segmented', 'strict', 'air-gap-logical', 'air-gap-physical'
    ]);
  });

  it.each([
    ['strict', false],
    ['air-gap-logical', false],
    ['air-gap-physical', false],
    ['segmented', true],
    ['shared', true],
    ['inconnu-du-hub', true]
  ])('zone OAM observée en %s : violation = %s', async (observed, violated) => {
    const { catalog, bindings } = await setup();
    const inv = composeMultiAxisHydration('s-rank', bindings, catalog, { oamIsolationLevel: observed });
    const res = await evaluateMultiAxisOracle(inv, bindings, catalog);
    expect(rulesOf(res).includes('deny_weak_oam_isolation')).toBe(violated);
  });

  it.each([
    ['air-gap-logical', false],
    ['segmented', true]
  ])('plan usager observé en %s : violation = %s', async (observed, violated) => {
    const { catalog, bindings } = await setup();
    const inv = composeMultiAxisHydration('s-up', bindings, catalog, { userPlaneIsolationLevel: observed });
    const res = await evaluateMultiAxisOracle(inv, bindings, catalog);
    expect(rulesOf(res).includes('deny_user_plane_management_leak')).toBe(violated);
  });

  it('une zone OAM qui n’impose pas le bastion est une violation (bastion_required)', async () => {
    const { catalog, bindings } = await setup();
    const inv = composeMultiAxisHydration('s-bastion', bindings, catalog, { oamBastionRequired: false });
    const res = await evaluateMultiAxisOracle(inv, bindings, catalog);
    expect(res.violations.some((x) => x.rule.endsWith('deny_oam_without_bastion_requirement') && x.message.includes('bastion_required'))).toBe(true);
  });
});

describe('ingestion : une valeur hors échelle est refusée, l’échelle fait partie de l’empreinte', () => {
  it('refuse une exigence hors énumération au lieu de la comparer', async () => {
    const { catalog, bindings } = await setup();
    const broken: OntologyCatalog = structuredClone(catalog);
    broken.entities[U + 'security:zone:oam'].projections = { isolation_level: 'high_throughput', bastion_required: true };
    expect(() => compileOntologyProjections(bindings, broken)).toThrow(/hors de l'énumération 'isolation_level'/);
  });

  it('modifier l’échelle change l’empreinte compilée', async () => {
    const { catalog, bindings } = await setup();
    const a = compileOntologyProjections(bindings, catalog).fingerprint;
    const reordered: OntologyCatalog = structuredClone(catalog);
    reordered.enumerations!.isolation_level.values.reverse();
    // l'exigence `strict` reste valide, seule l'échelle change
    expect(compileOntologyProjections(bindings, reordered).fingerprint).not.toBe(a);
    expect(compileOntologyProjections(bindings, catalog).fingerprint).toBe(a);
  });
});
