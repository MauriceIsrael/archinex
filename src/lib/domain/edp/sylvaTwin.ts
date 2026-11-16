/**
 * Jumeau Numérique Pré-Déploiement de Sylva (Issues #292, #293, #294)
 *
 * Remplace le simulateur What-If naïf (« 2 vs 3 DCs » purement multiplicatif) par un modèle
 * d'architecture exécutable compilé depuis l'inventaire hydraté (Phase 4) et le catalogue
 * de composants logiques (Base × Overlay × Datacenter).
 *
 * Fonctionnalités clés :
 * 1. Baseline 3 DCs par défaut ('3dc-active') comparée à '2dc-witness' (2 DCs + Témoin/Arbiter)
 *    et '2dc-split' (2 DCs secs sans témoin).
 * 2. Simulation déterministe d'injections de pannes (dc_loss, host_loss, power_feed_loss,
 *    inter_dc_link_partition) : calcul de quorum etcd RKE2, quorum d'écriture stockage (RF=3),
 *    bin-packing CPU/RAM/Hugepages/SR-IOV VFs et continuité des flux de médiation.
 * 3. Double mode d'arbitrage :
 *    - 'proposal' (à la main de l'équipe d'architecture : recommandation argumentée Gold/Silver/Bronze)
 *    - 'client-mandated' (imposé par le client / CCTP : vérification formelle et détection de contradictions).
 * 4. Génération déterministe du bouchon Redfish `sushy-tools` (`sushy-emulator.conf`) et des
 *    manifestes de nœuds `KWOK` (Kubernetes WithOut Kubelet) pour exécution en CI.
 */

import {
  DEFAULT_COMPONENT_CATALOG,
  DEFAULT_ENVIRONMENT_OVERLAYS,
  DEFAULT_VALUE_CATALOGS,
  type DatacenterCatalogEntry,
  type EnvironmentOverlay,
  type LogicalComponent,
  type ValueCatalogs
} from './componentCatalog.js';
import {
  resolveComponentInstance,
  type ResolvedComponentInstance
} from './refResolver.js';

export const SYLVA_LATEST_RELEASE = '1.5.0-latest';

export type SylvaTopologyProfileId = '3dc-active' | '2dc-witness' | '2dc-split';
export type SylvaStretchStrategy = 'stretched-cluster' | 'per-dc-autonomous';
export type TwinArbitrationMode = 'proposal' | 'client-mandated';
export type TwinFidelityTier = 0 | 1 | 2 | 3 | 4;

export interface TwinModelAssumption {
  code: string;
  target: string;
  assumedValue: string | number | boolean;
  rationale: string;
}

export interface FailureDomainSpec {
  id: string;
  region: string;
  failureDomain: string;
  drRole: DatacenterCatalogEntry['drRole'] | 'witness';
  workloadBearing: boolean;
  powerFeeds: string[];
}

export interface TwinBareMetalHost {
  name: string;
  uuid: string;
  datacenter: string;
  pool: string;
  deviceType: string;
  role: 'control-plane' | 'worker' | 'witness';
  dataplaneProfile: 'sriov-dpdk-numa' | 'cilium-nis2' | 'witness-quorum';
  bmcAddress: string;
  oobIp: string;
  bootMACAddress: string;
  powerFeeds: string[];
  powerState: 'On' | 'Off';
  capacity: {
    cpuCores: number;
    memoryGiB: number;
    hugepages1Gi: number;
    sriovVfs: number;
  };
}

export interface TwinWorkloadDemand {
  componentName: string;
  moduleName: string;
  datacenter: string;
  pool: string;
  requiredDataplane: string;
  replicas: number;
  cpuCoresTotal: number;
  memoryGiBTotal: number;
  hugepages1GiTotal: number;
  sriovVfsTotal: number;
  storageTiers: string[];
}

export interface SylvaUnitDagNode {
  unit: string;
  enabled: boolean;
  dependsOn: string[];
}

export interface SylvaTwinModel {
  sylvaRelease: string;
  profileId: SylvaTopologyProfileId;
  profileLabel: string;
  tierBadge: 'Gold' | 'Silver' | 'Bronze';
  stretchStrategy: SylvaStretchStrategy;
  environment: string;
  failureDomains: FailureDomainSpec[];
  etcdControlPlane: {
    totalMembers: number;
    quorumSize: number;
    membersByDomain: Record<string, number>;
    managementClusterStretched: boolean;
  };
  storageReplication: {
    engine: 'longhorn-ceph-rf3';
    replicationFactor: number;
    writeQuorum: number;
    replicasByDomain: Record<string, number>;
  };
  bareMetalHosts: TwinBareMetalHost[];
  workloadDemands: TwinWorkloadDemand[];
  declaredNamespaces?: Array<{
    component: string;
    name: string;
    zone: string;
    quotas: { cpu: number | string; memory: string; persistentVolumeClaims?: number };
  }>;
  resolvedPerDc: Array<{
    datacenter: string;
    drRole: FailureDomainSpec['drRole'];
    workloadBearing: boolean;
    components: ResolvedComponentInstance[];
  }>;
  unitDag: SylvaUnitDagNode[];
  unitDagValid: boolean;
  assumptions: TwinModelAssumption[];
}

export type FaultKind =
  | 'dc_loss_primary'
  | 'dc_loss_secondary'
  | 'host_loss_sriov'
  | 'power_feed_loss_pdu_a'
  | 'inter_dc_link_partition';

export interface FaultSimulationResult {
  faultId: FaultKind;
  faultLabel: string;
  affectedTarget: string;
  etcdSurvivingMembers: number;
  etcdTotalMembers: number;
  etcdQuorumSurvives: boolean;
  storageSurvivingReplicas: number;
  storageWriteQuorum: number;
  storageWritable: boolean;
  managementPlaneAvailable: boolean;
  rescheduledWorkloadsFit: boolean;
  unschedulableModules: string[];
  headroomAfterFault: {
    cpuPct: number;
    memoryPct: number;
    hugepagesPct: number;
    sriovVfPct: number;
  };
  mediationFlowsReachable: boolean;
  bmcRedfishReachableCount: number;
  bmcRedfishTotalCount: number;
  estimatedRtoSeconds: number;
  survivesZeroTouch: boolean;
  explanation: string;
}

export interface SushyRedfishSystemEntry {
  uuid: string;
  name: string;
  datacenter: string;
  pool: string;
  deviceType: string;
  bmcAddress: string;
  oobIp: string;
  bootMACAddress: string;
  powerState: 'On' | 'Off';
  vcpus: number;
  memoryGiB: number;
  redfishPath: string;
}

export interface SushyEmulatorBundle {
  driver: 'fake-in-memory';
  image: string;
  listenPort: number;
  systems: SushyRedfishSystemEntry[];
  configText: string;
}

export interface SylvaTwinProfileEvaluation {
  profileId: SylvaTopologyProfileId;
  profileLabel: string;
  tierBadge: 'Gold' | 'Silver' | 'Bronze';
  dcCount: number;
  workloadDcCount: number;
  hasWitnessSite: boolean;
  datacenters: string[];
  totalInstances: number;
  totalNics: number;
  estimatedBareMetalHosts: number;
  model: SylvaTwinModel;
  faultResults: FaultSimulationResult[];
  allFaultsSurviveZeroTouch: boolean;
  primaryDcLossSurvives: boolean;
  worstCaseRtoSeconds: number;
  sushyEmulator: SushyEmulatorBundle;
  kwokNodes: Array<Record<string, unknown>>;
}

export interface TwinGovernanceRequirements {
  mode: TwinArbitrationMode;
  mandatedProfileId?: SylvaTopologyProfileId;
  requireEtcdQuorumOnDcLoss: boolean;
  requireStorageWritableOnDcLoss: boolean;
  requireWorkloadCapacityOnDcLoss: boolean;
  requireSinglePowerFeedSurvival: boolean;
  requireBmcRedfishBound: boolean;
  maxAllowedRtoSeconds: number;
}

export interface TwinArbitrationViolation {
  rule: string;
  profileId: SylvaTopologyProfileId;
  faultId?: FaultKind;
  message: string;
  violatedRequirementId: string;
}

export interface SylvaTwinArbitrationReport {
  sylvaRelease: string;
  fidelity: TwinFidelityTier;
  engine: 'archinex-sylva-twin-t1';
  mode: TwinArbitrationMode;
  defaultProfileId: SylvaTopologyProfileId;
  recommendedProfileId: SylvaTopologyProfileId;
  recommendationRationale: string;
  requirements: TwinGovernanceRequirements;
  profiles: SylvaTwinProfileEvaluation[];
  violations: TwinArbitrationViolation[];
  verdict: 'compliant' | 'violated';
}

export const DEFAULT_TWIN_GOVERNANCE_REQUIREMENTS: TwinGovernanceRequirements = {
  mode: 'proposal',
  requireEtcdQuorumOnDcLoss: true,
  requireStorageWritableOnDcLoss: true,
  requireWorkloadCapacityOnDcLoss: true,
  requireSinglePowerFeedSurvival: true,
  requireBmcRedfishBound: true,
  maxAllowedRtoSeconds: 0
};

/**
 * Génère un UUID v5-like déterministe (format 8-4-4-4-12) à partir d'un identifiant stable.
 */
export function deterministicUuidFromKey(key: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0x12345678;
  let h4 = 0x9abcdef0;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
    h3 = Math.imul(h3 ^ (c * 31), 0xc2b2ae35) >>> 0;
    h4 = Math.imul(h4 ^ (c * 17 + 7), 0x27d4eb2f) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  const raw = `${hex(h1)}${hex(h2)}${hex(h3)}${hex(h4)}`;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-a${raw.slice(17, 20)}-${raw.slice(20, 32)}`;
}

/**
 * Extrait et valide le DAG des unités Sylva (capi -> cilium -> multus -> sriov -> ...).
 */
export function buildSylvaUnitDag(
  sylvaValues?: Record<string, unknown>,
  hasSriovWorkloads = true
): { unitDag: SylvaUnitDagNode[]; valid: boolean } {
  const spec = (sylvaValues?.spec || {}) as Record<string, any>;
  const units = (spec.units || {}) as Record<string, { enabled?: boolean }>;

  const isEnabled = (name: string, fallback: boolean) =>
    units[name]?.enabled !== undefined ? Boolean(units[name].enabled) : fallback;

  const ciliumEnabled = isEnabled('cilium', true);
  const multusEnabled = isEnabled('multus', hasSriovWorkloads);
  const sriovEnabled = isEnabled('sriov', hasSriovWorkloads);
  const sriovResEnabled = isEnabled('sriov-resources', hasSriovWorkloads);

  const unitDag: SylvaUnitDagNode[] = [
    { unit: 'capi', enabled: true, dependsOn: [] },
    { unit: 'metal3-capm3', enabled: true, dependsOn: ['capi'] },
    { unit: 'cilium', enabled: ciliumEnabled, dependsOn: ['capi'] },
    { unit: 'multus', enabled: multusEnabled, dependsOn: ['cilium'] },
    { unit: 'sriov', enabled: sriovEnabled, dependsOn: ['multus'] },
    { unit: 'sriov-resources', enabled: sriovResEnabled, dependsOn: ['sriov'] },
    { unit: 'metallb', enabled: isEnabled('metallb', true), dependsOn: ['cilium'] },
    { unit: 'vault', enabled: isEnabled('vault', true), dependsOn: ['cilium'] },
    { unit: 'kyverno', enabled: isEnabled('kyverno', true), dependsOn: ['cilium'] },
    { unit: 'monitoring', enabled: isEnabled('monitoring', true), dependsOn: ['cilium', 'vault'] }
  ];

  // Un DAG est valide si toute unité activée a ses dépendances activées
  const enabledSet = new Set(unitDag.filter((u) => u.enabled).map((u) => u.unit));
  const valid = unitDag
    .filter((u) => u.enabled)
    .every((u) => u.dependsOn.every((dep) => enabledSet.has(dep)));

  return { unitDag, valid };
}

/**
 * Construit le modèle exécutable du Jumeau Numérique de Sylva pour un profil topologique donné.
 * Par défaut, le profil est '3dc-active' (3 Datacenters Actif/Actif/Actif).
 */
export function buildSylvaTwinModel(options: {
  components?: LogicalComponent[];
  overlay?: EnvironmentOverlay;
  catalogs?: ValueCatalogs;
  profileId?: SylvaTopologyProfileId;
  stretchStrategy?: SylvaStretchStrategy;
  hydratedPowerFeeds?: string[];
  sylvaValues?: Record<string, unknown>;
} = {}): SylvaTwinModel {
  const components = options.components || DEFAULT_COMPONENT_CATALOG;
  const overlay = options.overlay || DEFAULT_ENVIRONMENT_OVERLAYS[0];
  const catalogs = options.catalogs || DEFAULT_VALUE_CATALOGS;
  const profileId: SylvaTopologyProfileId = options.profileId || '3dc-active';
  const stretchStrategy: SylvaStretchStrategy = options.stretchStrategy || 'stretched-cluster';
  const powerFeeds =
    options.hydratedPowerFeeds && options.hydratedPowerFeeds.length > 0
      ? options.hydratedPowerFeeds
      : ['PDU-A', 'PDU-B'];

  const assumptions: TwinModelAssumption[] = [];

  // 1. Construction des domaines de défaillance selon le profil (3 DCs par défaut)
  const dcCatalog = catalogs.datacenters;
  const dc1 = dcCatalog[0] || { name: 'dc1', region: 'eu-west-1', failureDomain: 'az-1', drRole: 'primary' };
  const dc2 = dcCatalog[1] || { name: 'dc2', region: 'eu-west-1', failureDomain: 'az-2', drRole: 'secondary' };
  const dc3 = dcCatalog[2] || { name: 'dc3', region: 'eu-west-2', failureDomain: 'az-3', drRole: 'tertiary' };

  let failureDomains: FailureDomainSpec[] = [];
  let profileLabel = '';
  let tierBadge: 'Gold' | 'Silver' | 'Bronze' = 'Gold';
  let membersByDomain: Record<string, number> = {};
  let replicasByDomain: Record<string, number> = {};
  let managementClusterStretched = true;

  if (profileId === '3dc-active') {
    profileLabel = '3 DCs Actif/Actif/Actif (Baseline Sylva Gold)';
    tierBadge = 'Gold';
    failureDomains = [
      { ...dc1, id: dc1.name, workloadBearing: true, powerFeeds },
      { ...dc2, id: dc2.name, workloadBearing: true, powerFeeds },
      { ...dc3, id: dc3.name, workloadBearing: true, powerFeeds }
    ];
    membersByDomain = { [dc1.name]: 1, [dc2.name]: 1, [dc3.name]: 1 };
    replicasByDomain = { [dc1.name]: 1, [dc2.name]: 1, [dc3.name]: 1 };
    managementClusterStretched = true;
  } else if (profileId === '2dc-witness') {
    profileLabel = '2 DCs + Site Témoin / Arbiter (Sylva Silver)';
    tierBadge = 'Silver';
    const witnessId = `${dc3.name}-witness`;
    failureDomains = [
      { ...dc1, id: dc1.name, workloadBearing: true, powerFeeds },
      { ...dc2, id: dc2.name, workloadBearing: true, powerFeeds },
      {
        id: witnessId,
        region: dc3.region,
        failureDomain: dc3.failureDomain,
        drRole: 'witness',
        workloadBearing: false,
        powerFeeds
      }
    ];
    membersByDomain = { [dc1.name]: 1, [dc2.name]: 1, [witnessId]: 1 };
    replicasByDomain = { [dc1.name]: 1, [dc2.name]: 1, [witnessId]: 1 };
    managementClusterStretched = true;
    assumptions.push({
      code: 'witness-lightweight-arbiter',
      target: witnessId,
      assumedValue: true,
      rationale:
        'Le 3e site témoin héberge uniquement un nœud léger de quorum etcd et tie-breaker stockage (aucun workload métier ni SR-IOV).'
    });
  } else {
    profileLabel = '2 DCs Secs sans Témoin (Asymétrique 2+1 · Bronze)';
    tierBadge = 'Bronze';
    failureDomains = [
      { ...dc1, id: dc1.name, workloadBearing: true, powerFeeds },
      { ...dc2, id: dc2.name, workloadBearing: true, powerFeeds }
    ];
    membersByDomain = { [dc1.name]: 2, [dc2.name]: 1 };
    replicasByDomain = { [dc1.name]: 2, [dc2.name]: 1 };
    managementClusterStretched = false;
    assumptions.push({
      code: 'asymmetric-2dc-quorum',
      target: dc1.name,
      assumedValue: '2+1',
      rationale:
        'Sur 2 DCs sans site témoin, 2 des 3 membres etcd et réplicas stockage résident sur dc1 : la perte de dc1 fait tomber le quorum.'
    });
  }

  // 2. Résolution des composants sur chaque DC porteur de charge
  const activeComponents = components.filter(
    (c) => !c.metadata.external && c.metadata.status !== 'inactive'
  );

  const resolvedPerDc = failureDomains.map((dom) => ({
    datacenter: dom.id,
    drRole: dom.drRole,
    workloadBearing: dom.workloadBearing,
    components: dom.workloadBearing
      ? activeComponents.map((c) => resolveComponentInstance(c, overlay, dom.id, catalogs))
      : []
  }));

  // 3. Extraction de la demande de capacité par workload
  const workloadDemands: TwinWorkloadDemand[] = [];
  for (const dcItem of resolvedPerDc) {
    if (!dcItem.workloadBearing) continue;
    for (const comp of dcItem.components) {
      const baseComp = components.find((b) => b.metadata.name === comp.name);
      for (const mod of comp.modules) {
        const baseMod = baseComp?.spec.compute?.modules.find((m) => m.name === mod.name);
        const isSriov =
          mod.placement.requiredDataplane === 'sriov-dpdk' ||
          Boolean(mod.placement.pool?.includes('sriov'));
        const replicas = mod.instances.length;
        const cpuPerReplica = isSriov ? 8 : 4;
        const memPerReplica = isSriov ? 32 : 8;
        const hugepagesPerReplica = isSriov ? 16 : 0;
        const sriovVfsPerReplica = isSriov
          ? Math.max(
              1,
              (mod.instances[0]?.nics || []).filter(
                (n) => n.class === 'business' || n.class === 'internal'
              ).length
            )
          : 0;
        const storageTiers = (baseMod?.storage || []).map((m) => m.tier);

        workloadDemands.push({
          componentName: comp.name,
          moduleName: mod.name,
          datacenter: dcItem.datacenter,
          pool: mod.placement.pool || (isSriov ? 'sylva-cnf-sriov-dpdk' : 'sylva-general-compute'),
          requiredDataplane: mod.placement.requiredDataplane,
          replicas,
          cpuCoresTotal: replicas * cpuPerReplica,
          memoryGiBTotal: replicas * memPerReplica,
          hugepages1GiTotal: replicas * hugepagesPerReplica,
          sriovVfsTotal: replicas * sriovVfsPerReplica,
          storageTiers
        });
      }
    }
  }

  assumptions.push({
    code: 'default-hardware-sizing-profiles',
    target: 'Dell-PowerEdge-R750 / HPE-ProLiant-DL380-Gen11',
    assumedValue: '64c/256Gi/64Gi-HP/16VF & 48c/192Gi',
    rationale:
      'Capacités physiques unitaires déduites des profils matériels standards Telco Bare-Metal (capm3) de l’ontologie.'
  });

  // 4. Construction des hôtes Bare-Metal par domaine de défaillance
  const bareMetalHosts: TwinBareMetalHost[] = [];
  let hostCounter = 10;

  for (const [domIdx, dom] of failureDomains.entries()) {
    if (dom.workloadBearing) {
      // Hôte 1 du DC : Pool SR-IOV / DPDK + membre control-plane RKE2
      const sriovHostName = `srv-${dom.id}-sriov-01`;
      const sriovOobIp = `192.0.2.${hostCounter}`;
      hostCounter += 1;
      bareMetalHosts.push({
        name: sriovHostName,
        uuid: deterministicUuidFromKey(`${profileId}:${sriovHostName}`),
        datacenter: dom.id,
        pool: 'sylva-cnf-sriov-dpdk',
        deviceType: 'Dell-PowerEdge-R750',
        role: 'worker',
        dataplaneProfile: 'sriov-dpdk-numa',
        bmcAddress: `redfish+http://${sriovOobIp}:8000/redfish/v1/Systems/${deterministicUuidFromKey(`${profileId}:${sriovHostName}`)}`,
        oobIp: `${sriovOobIp}/24`,
        bootMACAddress: `52:54:00:${(10 + domIdx).toString(16).padStart(2, '0')}:01:01`,
        powerFeeds: [...dom.powerFeeds],
        powerState: 'On',
        capacity: {
          cpuCores: 64,
          memoryGiB: 256,
          hugepages1Gi: 64,
          sriovVfs: 16
        }
      });

      // Hôte 2 du DC : Pool General Compute + Control-Plane
      const genHostName = `srv-${dom.id}-compute-01`;
      const genOobIp = `192.0.2.${hostCounter}`;
      hostCounter += 1;
      bareMetalHosts.push({
        name: genHostName,
        uuid: deterministicUuidFromKey(`${profileId}:${genHostName}`),
        datacenter: dom.id,
        pool: 'sylva-general-compute',
        deviceType: 'HPE-ProLiant-DL380-Gen11',
        role: 'control-plane',
        dataplaneProfile: 'cilium-nis2',
        bmcAddress: `redfish+http://${genOobIp}:8000/redfish/v1/Systems/${deterministicUuidFromKey(`${profileId}:${genHostName}`)}`,
        oobIp: `${genOobIp}/24`,
        bootMACAddress: `52:54:00:${(10 + domIdx).toString(16).padStart(2, '0')}:02:02`,
        powerFeeds: [...dom.powerFeeds],
        powerState: 'On',
        capacity: {
          cpuCores: 48,
          memoryGiB: 192,
          hugepages1Gi: 0,
          sriovVfs: 0
        }
      });
    } else {
      // Hôte Témoin / Arbiter léger (cas '2dc-witness')
      const witHostName = `srv-${dom.id}-arbiter-01`;
      const witOobIp = `192.0.2.${hostCounter}`;
      hostCounter += 1;
      bareMetalHosts.push({
        name: witHostName,
        uuid: deterministicUuidFromKey(`${profileId}:${witHostName}`),
        datacenter: dom.id,
        pool: 'sylva-witness-quorum',
        deviceType: 'Dell-PowerEdge-XR11-Witness',
        role: 'witness',
        dataplaneProfile: 'witness-quorum',
        bmcAddress: `redfish+http://${witOobIp}:8000/redfish/v1/Systems/${deterministicUuidFromKey(`${profileId}:${witHostName}`)}`,
        oobIp: `${witOobIp}/24`,
        bootMACAddress: `52:54:00:${(10 + domIdx).toString(16).padStart(2, '0')}:03:03`,
        powerFeeds: [...dom.powerFeeds],
        powerState: 'On',
        capacity: {
          cpuCores: 16,
          memoryGiB: 32,
          hugepages1Gi: 0,
          sriovVfs: 0
        }
      });
    }
  }

  const declaredNamespaces = activeComponents.flatMap((c) =>
    (c.spec.compute?.namespaces || [])
      .filter((ns) => ns.status !== 'inactive')
      .map((ns) => ({
        component: c.metadata.name,
        name: ns.name,
        zone: ns.zone,
        quotas: ns.quotas
      }))
  );

  // Injection des hôtes bare-metal déclarés explicitement via compute.hardware (IMP V2 §3.3.2)
  const declaredHardware = activeComponents.flatMap((c) =>
    (c.spec.compute?.hardware || [])
      .filter((hw) => hw.status !== 'inactive')
      .map((hw) => ({ component: c.metadata.name, hw }))
  );

  for (const [idx, item] of declaredHardware.entries()) {
    const { hw } = item;
    const dom = failureDomains.find((d) => d.workloadBearing) || failureDomains[0];
    if (!dom) continue;
    const memMatch = hw.memory.match(/^(\d+)/);
    const memGiB = memMatch ? Number(memMatch[1]) : 128;
    const isSriovHw = hw.role.includes('sriov') || hw.role.includes('cnf');
    const uuid = deterministicUuidFromKey(`${profileId}:declared:${hw.name}`);
    const oobIp = `192.0.2.${100 + idx}`;
    bareMetalHosts.push({
      name: hw.name,
      uuid,
      datacenter: dom.id,
      pool: isSriovHw ? 'sylva-cnf-sriov-dpdk' : 'sylva-general-compute',
      deviceType: hw.model,
      role: hw.role.includes('control') ? 'control-plane' : 'worker',
      dataplaneProfile: isSriovHw ? 'sriov-dpdk-numa' : 'cilium-nis2',
      bmcAddress: `redfish+http://${oobIp}:8000/redfish/v1/Systems/${uuid}`,
      oobIp: `${oobIp}/24`,
      bootMACAddress: `52:54:00:dd:${(idx + 1).toString(16).padStart(2, '0')}:01`,
      powerFeeds: [...dom.powerFeeds],
      powerState: 'On',
      capacity: {
        cpuCores: hw.cpu.sockets * hw.cpu.cores,
        memoryGiB: memGiB,
        hugepages1Gi: isSriovHw ? 64 : 0,
        sriovVfs: isSriovHw ? 16 : 0
      }
    });
  }

  const hasSriov = workloadDemands.some((w) => w.sriovVfsTotal > 0);
  const { unitDag, valid: unitDagValid } = buildSylvaUnitDag(options.sylvaValues, hasSriov);

  return {
    sylvaRelease: SYLVA_LATEST_RELEASE,
    profileId,
    profileLabel,
    tierBadge,
    stretchStrategy,
    environment: overlay.metadata.environment,
    failureDomains,
    etcdControlPlane: {
      totalMembers: 3,
      quorumSize: 2,
      membersByDomain,
      managementClusterStretched
    },
    storageReplication: {
      engine: 'longhorn-ceph-rf3',
      replicationFactor: 3,
      writeQuorum: 2,
      replicasByDomain
    },
    bareMetalHosts,
    workloadDemands,
    ...(declaredNamespaces.length > 0 ? { declaredNamespaces } : {}),
    resolvedPerDc,
    unitDag,
    unitDagValid,
    assumptions
  };
}

/**
 * Simule une injection de panne sur le modèle du Jumeau Sylva et retourne les métriques exactes de survie.
 */
export function simulateTwinFault(
  model: SylvaTwinModel,
  faultId: FaultKind
): FaultSimulationResult {
  const primaryDc = model.failureDomains[0]?.id || 'dc1';
  const secondaryDc = model.failureDomains[1]?.id || 'dc2';

  let faultLabel = '';
  let affectedTarget = '';
  let survivingDomainIds = new Set(model.failureDomains.map((d) => d.id));
  let survivingHosts = [...model.bareMetalHosts];
  let mediationFlowsReachable = true;

  if (faultId === 'dc_loss_primary') {
    faultLabel = `Perte complète du Datacenter Primaire (${primaryDc})`;
    affectedTarget = primaryDc;
    survivingDomainIds.delete(primaryDc);
    survivingHosts = survivingHosts.filter((h) => h.datacenter !== primaryDc);
  } else if (faultId === 'dc_loss_secondary') {
    faultLabel = `Perte complète du Datacenter Secondaire (${secondaryDc})`;
    affectedTarget = secondaryDc;
    survivingDomainIds.delete(secondaryDc);
    survivingHosts = survivingHosts.filter((h) => h.datacenter !== secondaryDc);
  } else if (faultId === 'host_loss_sriov') {
    const targetHost =
      model.bareMetalHosts.find(
        (h) => h.datacenter === primaryDc && h.pool === 'sylva-cnf-sriov-dpdk'
      ) || model.bareMetalHosts[0];
    faultLabel = `Panne serveur Bare-Metal SR-IOV (${targetHost?.name || 'srv-dc1'})`;
    affectedTarget = targetHost?.name || 'srv-dc1-sriov-01';
    survivingHosts = survivingHosts.filter((h) => h.name !== affectedTarget);
  } else if (faultId === 'power_feed_loss_pdu_a') {
    faultLabel = 'Perte de la voie d’alimentation électrique PDU-A';
    affectedTarget = 'PDU-A';
    // Un serveur survit à la perte de PDU-A s'il possède au moins une autre adduction (ex: PDU-B)
    survivingHosts = survivingHosts.filter((h) =>
      h.powerFeeds.some((feed) => feed !== 'PDU-A')
    );
    for (const dom of model.failureDomains) {
      const hasBackupFeed = dom.powerFeeds.some((f) => f !== 'PDU-A');
      if (!hasBackupFeed) {
        survivingDomainIds.delete(dom.id);
      }
    }
  } else if (faultId === 'inter_dc_link_partition') {
    faultLabel = `Partition réseau WAN isolant ${primaryDc}`;
    affectedTarget = `wan-link-${primaryDc}`;
    survivingDomainIds.delete(primaryDc);
    survivingHosts = survivingHosts.filter((h) => h.datacenter !== primaryDc);
  }

  // 1. Calcul du quorum etcd RKE2
  let etcdSurvivingMembers = 0;
  for (const [domId, count] of Object.entries(model.etcdControlPlane.membersByDomain)) {
    if (survivingDomainIds.has(domId)) {
      etcdSurvivingMembers += count;
    }
  }
  const etcdQuorumSurvives = etcdSurvivingMembers >= model.etcdControlPlane.quorumSize;

  // 2. Calcul du quorum d'écriture Stockage (Longhorn / Ceph RF=3)
  let storageSurvivingReplicas = 0;
  for (const [domId, count] of Object.entries(model.storageReplication.replicasByDomain)) {
    if (survivingDomainIds.has(domId)) {
      storageSurvivingReplicas += count;
    }
  }
  const storageWritable = storageSurvivingReplicas >= model.storageReplication.writeQuorum;

  // 3. Calcul du bin-packing (re-scheduling de la charge nominale totale d'un site + charge survivante)
  // Pour garantir que le SI absorbe 100 % du trafic nominal après la perte d'un DC ou d'un hôte,
  // les hôtes survivants doivent pouvoir héberger au minimum la charge nominale de 2 sites actifs
  // (ou la totalité des workloads d'un site reportée sur les survivants).
  const workloadsPerSingleDc = model.workloadDemands.filter((w) => w.datacenter === primaryDc);
  const survivingWorkloadDcs = Math.max(
    1,
    Array.from(survivingDomainIds).filter((id) =>
      model.failureDomains.find((d) => d.id === id)?.workloadBearing
    ).length
  );

  // Charge minimale devant continuer à tourner sans dégradation = 2× la charge unitaire d'un DC
  // (les pods du DC tombé sont re-schedulés sur le(s) DC(s) survivant(s)).
  const requiredActiveDcEquivalents = 2;
  const unschedulableModules: string[] = [];

  const pools = ['sylva-cnf-sriov-dpdk', 'sylva-general-compute'];
  let totalCpuCap = 0;
  let totalCpuReq = 0;
  let totalMemCap = 0;
  let totalMemReq = 0;
  let totalHpCap = 0;
  let totalHpReq = 0;
  let totalVfCap = 0;
  let totalVfReq = 0;

  for (const pool of pools) {
    const poolHosts = survivingHosts.filter((h) => h.pool === pool);
    const poolCapCpu = poolHosts.reduce((a, h) => a + h.capacity.cpuCores, 0);
    const poolCapMem = poolHosts.reduce((a, h) => a + h.capacity.memoryGiB, 0);
    const poolCapHp = poolHosts.reduce((a, h) => a + h.capacity.hugepages1Gi, 0);
    const poolCapVf = poolHosts.reduce((a, h) => a + h.capacity.sriovVfs, 0);

    const poolDemandsSingleDc = workloadsPerSingleDc.filter((w) => w.pool === pool);
    const reqCpu =
      poolDemandsSingleDc.reduce((a, w) => a + w.cpuCoresTotal, 0) * requiredActiveDcEquivalents;
    const reqMem =
      poolDemandsSingleDc.reduce((a, w) => a + w.memoryGiBTotal, 0) * requiredActiveDcEquivalents;
    const reqHp =
      poolDemandsSingleDc.reduce((a, w) => a + w.hugepages1GiTotal, 0) * requiredActiveDcEquivalents;
    const reqVf =
      poolDemandsSingleDc.reduce((a, w) => a + w.sriovVfsTotal, 0) * requiredActiveDcEquivalents;

    totalCpuCap += poolCapCpu;
    totalCpuReq += reqCpu;
    totalMemCap += poolCapMem;
    totalMemReq += reqMem;
    totalHpCap += poolCapHp;
    totalHpReq += reqHp;
    totalVfCap += poolCapVf;
    totalVfReq += reqVf;

    if (
      reqCpu > poolCapCpu ||
      reqMem > poolCapMem ||
      reqHp > poolCapHp ||
      reqVf > poolCapVf
    ) {
      for (const w of poolDemandsSingleDc) {
        unschedulableModules.push(`${w.componentName}/${w.moduleName} (${pool})`);
      }
    }
  }

  const rescheduledWorkloadsFit = unschedulableModules.length === 0 && survivingWorkloadDcs >= 1;
  mediationFlowsReachable = survivingWorkloadDcs >= 1;

  const pctHeadroom = (cap: number, req: number) =>
    cap <= 0 ? (req === 0 ? 100 : 0) : Math.max(0, Math.round(((cap - req) / cap) * 100));

  const headroomAfterFault = {
    cpuPct: pctHeadroom(totalCpuCap, totalCpuReq),
    memoryPct: pctHeadroom(totalMemCap, totalMemReq),
    hugepagesPct: pctHeadroom(totalHpCap, totalHpReq),
    sriovVfPct: pctHeadroom(totalVfCap, totalVfReq)
  };

  const managementPlaneAvailable =
    etcdQuorumSurvives &&
    (model.etcdControlPlane.managementClusterStretched || !faultId.includes('primary'));

  const survivesZeroTouch =
    etcdQuorumSurvives &&
    storageWritable &&
    rescheduledWorkloadsFit &&
    mediationFlowsReachable;

  const estimatedRtoSeconds = survivesZeroTouch ? 0 : !etcdQuorumSurvives ? 3600 : 900;

  const reasons: string[] = [];
  if (!etcdQuorumSurvives) {
    reasons.push(
      `Perte de quorum etcd (${etcdSurvivingMembers}/${model.etcdControlPlane.totalMembers} survivant < ${model.etcdControlPlane.quorumSize})`
    );
  } else {
    reasons.push(
      `Quorum etcd maintenu (${etcdSurvivingMembers}/${model.etcdControlPlane.totalMembers})`
    );
  }
  if (!storageWritable) {
    reasons.push(
      `Stockage en lecture seule (${storageSurvivingReplicas}/${model.storageReplication.replicationFactor} réplicas < quorum ${model.storageReplication.writeQuorum})`
    );
  } else {
    reasons.push(
      `Stockage écrivable (${storageSurvivingReplicas}/${model.storageReplication.replicationFactor})`
    );
  }
  if (!rescheduledWorkloadsFit) {
    reasons.push(`Capacité insuffisante pour re-scheduler : ${unschedulableModules.join(', ')}`);
  } else {
    reasons.push(
      `Re-scheduling OK (marge CPU ${headroomAfterFault.cpuPct}%, SR-IOV ${headroomAfterFault.sriovVfPct}%)`
    );
  }

  return {
    faultId,
    faultLabel,
    affectedTarget,
    etcdSurvivingMembers,
    etcdTotalMembers: model.etcdControlPlane.totalMembers,
    etcdQuorumSurvives,
    storageSurvivingReplicas,
    storageWriteQuorum: model.storageReplication.writeQuorum,
    storageWritable,
    managementPlaneAvailable,
    rescheduledWorkloadsFit,
    unschedulableModules,
    headroomAfterFault,
    mediationFlowsReachable,
    bmcRedfishReachableCount: survivingHosts.length,
    bmcRedfishTotalCount: model.bareMetalHosts.length,
    estimatedRtoSeconds,
    survivesZeroTouch,
    explanation: reasons.join(' · ')
  };
}

/**
 * Génère la configuration déterministe pour `sushy-tools` (`sushy-emulator`)
 * afin de bouchonner les contrôleurs BMC Redfish des `BareMetalHost` CAPI `capm3` en CI.
 */
export function generateSushyEmulatorConfig(model: SylvaTwinModel): SushyEmulatorBundle {
  const systems: SushyRedfishSystemEntry[] = model.bareMetalHosts.map((h) => ({
    uuid: h.uuid,
    name: h.name,
    datacenter: h.datacenter,
    pool: h.pool,
    deviceType: h.deviceType,
    bmcAddress: h.bmcAddress,
    oobIp: h.oobIp,
    bootMACAddress: h.bootMACAddress,
    powerState: h.powerState,
    vcpus: h.capacity.cpuCores,
    memoryGiB: h.capacity.memoryGiB,
    redfishPath: `/redfish/v1/Systems/${h.uuid}`
  }));

  const systemsPythonLiteral = systems
    .map(
      (s) =>
        `    {\n` +
        `        "uuid": "${s.uuid}",\n` +
        `        "name": "${s.name}",\n` +
        `        "driver": "fake",\n` +
        `        "power_state": "${s.powerState}",\n` +
        `        "vcpus": ${s.vcpus},\n` +
        `        "memory_mib": ${s.memoryGiB * 1024},\n` +
        `        "boot_mac": "${s.bootMACAddress}",\n` +
        `        "datacenter": "${s.datacenter}",\n` +
        `        "sylva_pool": "${s.pool}"\n` +
        `    }`
    )
    .join(',\n');

  const configText = [
    '# Configuration auto-générée par le Jumeau Numérique Archinex pour sushy-tools (sushy-emulator)',
    `# Profil topologique : ${model.profileId} (${model.profileLabel})`,
    `# Cible Sylva : ${model.sylvaRelease} · Provider CAPI : capm3 (Metal3 Redfish)`,
    'SUSHY_EMULATOR_LISTEN_IP = "0.0.0.0"',
    'SUSHY_EMULATOR_LISTEN_PORT = 8000',
    'SUSHY_EMULATOR_FAKE_DRIVER = True',
    'SUSHY_EMULATOR_OS_CLOUD = None',
    'SUSHY_EMULATOR_LIBVIRT_URI = None',
    'SUSHY_EMULATOR_FAKE_SYSTEMS = [',
    systemsPythonLiteral,
    ']'
  ].join('\n');

  return {
    driver: 'fake-in-memory',
    image: 'quay.io/metal3-io/sushy-tools:latest',
    listenPort: 8000,
    systems,
    configText
  };
}

/**
 * Génère les manifestes `Node` Kubernetes pour KWOK (Kubernetes WithOut Kubelet)
 * afin d'exécuter le vrai kube-scheduler en CI (Palier T2) sur la topologie du jumeau.
 */
export function generateKwokNodeManifests(model: SylvaTwinModel): Array<Record<string, unknown>> {
  return model.bareMetalHosts.map((h) => {
    const labels: Record<string, string> = {
      'kubernetes.io/hostname': h.name,
      'topology.kubernetes.io/zone': h.datacenter,
      'sylva.org/pool': h.pool,
      'sylva.org/dataplane': h.dataplaneProfile
    };
    if (h.role === 'control-plane' || h.role === 'witness') {
      labels['node-role.kubernetes.io/control-plane'] = 'true';
    }

    const node: Record<string, unknown> = {
      apiVersion: 'v1',
      kind: 'Node',
      metadata: {
        name: h.name,
        annotations: {
          'kwok.x-k8s.io/node': 'fake',
          'metal3.io/BareMetalHost': `sylva-system/${h.name}`,
          'archinex.io/bmc-redfish': h.bmcAddress
        },
        labels
      },
      status: {
        phase: 'Running',
        conditions: [
          {
            type: 'Ready',
            status: 'True',
            reason: 'KubeletReady',
            message: 'kwok fake node ready'
          }
        ],
        allocatable: {
          cpu: String(h.capacity.cpuCores),
          memory: `${h.capacity.memoryGiB}Gi`,
          'hugepages-1Gi': `${h.capacity.hugepages1Gi}Gi`,
          'intel.com/sriov_netdevice': String(h.capacity.sriovVfs),
          pods: '110'
        },
        capacity: {
          cpu: String(h.capacity.cpuCores),
          memory: `${h.capacity.memoryGiB}Gi`,
          'hugepages-1Gi': `${h.capacity.hugepages1Gi}Gi`,
          'intel.com/sriov_netdevice': String(h.capacity.sriovVfs),
          pods: '110'
        }
      }
    };

    if (h.role === 'witness') {
      node.spec = {
        taints: [
          {
            key: 'sylva.org/witness-only',
            value: 'true',
            effect: 'NoSchedule'
          }
        ]
      };
    }

    return node;
  });
}

/**
 * Génère les manifestes `Namespace` et `Deployment` Kubernetes pour le runner KWOK (Palier T2)
 * à partir des demandes de charge `workloadDemands` du modèle T1.
 */
export function generateKwokWorkloadManifests(
  model: SylvaTwinModel,
  namespace = 'sylva-twin-sim'
): Array<Record<string, unknown>> {
  const nsManifest: Record<string, unknown> = {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: namespace,
      labels: {
        'sylva.org/twin-profile': model.profileId
      }
    }
  };

  // Agrège les demandes par module pour permettre au kube-scheduler de répartir via topologySpreadConstraints
  const byModule = new Map<
    string,
    {
      moduleName: string;
      componentName: string;
      pool: string;
      requiredDataplane: string;
      replicas: number;
      cpuCoresTotal: number;
      memoryGiBTotal: number;
      hugepages1GiTotal: number;
      sriovVfsTotal: number;
    }
  >();

  for (const d of model.workloadDemands) {
    const existing = byModule.get(d.moduleName);
    if (existing) {
      existing.replicas += d.replicas;
      existing.cpuCoresTotal += d.cpuCoresTotal;
      existing.memoryGiBTotal += d.memoryGiBTotal;
      existing.hugepages1GiTotal += d.hugepages1GiTotal;
      existing.sriovVfsTotal += d.sriovVfsTotal;
    } else {
      byModule.set(d.moduleName, {
        moduleName: d.moduleName,
        componentName: d.componentName,
        pool: d.pool,
        requiredDataplane: d.requiredDataplane,
        replicas: d.replicas,
        cpuCoresTotal: d.cpuCoresTotal,
        memoryGiBTotal: d.memoryGiBTotal,
        hugepages1GiTotal: d.hugepages1GiTotal,
        sriovVfsTotal: d.sriovVfsTotal
      });
    }
  }

  const deployments: Array<Record<string, unknown>> = [];
  for (const mod of byModule.values()) {
    const safeReplicas = Math.max(1, mod.replicas);
    const cpuPerPod = Math.max(1, Math.round(mod.cpuCoresTotal / safeReplicas));
    const memPerPod = Math.max(1, Math.round(mod.memoryGiBTotal / safeReplicas));
    const hpPerPod = mod.hugepages1GiTotal > 0 ? Math.max(1, Math.round(mod.hugepages1GiTotal / safeReplicas)) : 0;
    const vfPerPod = mod.sriovVfsTotal > 0 ? Math.max(1, Math.round(mod.sriovVfsTotal / safeReplicas)) : 0;

    const requests: Record<string, string> = {
      cpu: String(cpuPerPod),
      memory: `${memPerPod}Gi`
    };
    const limits: Record<string, string> = {
      cpu: String(cpuPerPod),
      memory: `${memPerPod}Gi`
    };
    if (hpPerPod > 0) {
      requests['hugepages-1Gi'] = `${hpPerPod}Gi`;
      limits['hugepages-1Gi'] = `${hpPerPod}Gi`;
    }
    if (vfPerPod > 0) {
      requests['intel.com/sriov_netdevice'] = String(vfPerPod);
      limits['intel.com/sriov_netdevice'] = String(vfPerPod);
    }

    const isSriov = mod.pool === 'sylva-cnf-sriov-dpdk' || vfPerPod > 0 || hpPerPod > 0;
    const podSpec: Record<string, unknown> = {
      terminationGracePeriodSeconds: 0,
      topologySpreadConstraints: [
        {
          maxSkew: 1,
          topologyKey: 'topology.kubernetes.io/zone',
          whenUnsatisfiable: 'ScheduleAnyway',
          labelSelector: {
            matchLabels: {
              'sylva.org/module': mod.moduleName
            }
          }
        }
      ],
      containers: [
        {
          name: mod.moduleName,
          image: 'registry.k8s.io/pause:3.9',
          resources: {
            requests,
            limits
          }
        }
      ]
    };

    if (isSriov) {
      podSpec.nodeSelector = {
        'sylva.org/pool': 'sylva-cnf-sriov-dpdk'
      };
    } else {
      podSpec.affinity = {
        nodeAffinity: {
          preferredDuringSchedulingIgnoredDuringExecution: [
            {
              weight: 80,
              preference: {
                matchExpressions: [
                  {
                    key: 'sylva.org/pool',
                    operator: 'In',
                    values: ['sylva-general-compute']
                  }
                ]
              }
            }
          ]
        }
      };
    }

    deployments.push({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: `twin-${mod.moduleName}`,
        namespace,
        labels: {
          'app.kubernetes.io/name': mod.moduleName,
          'sylva.org/component': mod.componentName,
          'sylva.org/module': mod.moduleName,
          'sylva.org/pool': mod.pool
        }
      },
      spec: {
        replicas: safeReplicas,
        selector: {
          matchLabels: {
            'sylva.org/module': mod.moduleName
          }
        },
        template: {
          metadata: {
            labels: {
              'app.kubernetes.io/name': mod.moduleName,
              'sylva.org/module': mod.moduleName,
              'sylva.org/pool': mod.pool
            }
          },
          spec: podSpec
        }
      }
    });
  }

  return [nsManifest, ...deployments];
}

export interface KwokClusterPlacementObservation {
  clusterName: string;
  k8sVersion?: string;
  baseline: {
    totalPods: number;
    scheduledPods: number;
    pendingPods: number;
    unschedulablePodNames: string[];
    podsByZone: Record<string, number>;
  };
  dcLossPrimary: {
    drainedZone: string;
    totalPods: number;
    scheduledPods: number;
    pendingPods: number;
    unschedulablePodNames: string[];
    podsByZone: Record<string, number>;
  };
}

export interface T1T2CalibrationReport {
  profileId: SylvaTopologyProfileId;
  sylvaRelease: string;
  fidelityReached: 2;
  calibrated: boolean;
  t1BaselineFit: boolean;
  t2BaselineFit: boolean;
  t1DcLossFit: boolean;
  t2DcLossFit: boolean;
  discrepancies: string[];
  summary: string;
}

/**
 * Confronte les prédictions analytiques T1 aux placements réels observés sur le
 * kube-scheduler via KWOK (Palier T2) avant et après injection de panne `dc_loss_primary`.
 */
export function calibrateT1WithKwokResults(
  t1Eval: SylvaTwinProfileEvaluation,
  observation: KwokClusterPlacementObservation
): T1T2CalibrationReport {
  const totalCpuCap = t1Eval.model.bareMetalHosts
    .filter((h) => h.role !== 'witness')
    .reduce((acc, h) => acc + h.capacity.cpuCores, 0);
  const totalCpuReq = t1Eval.model.workloadDemands.reduce((acc, d) => acc + d.cpuCoresTotal, 0);
  const t1BaselineFit = totalCpuReq <= totalCpuCap;

  const dc1Loss = t1Eval.faultResults.find((f) => f.faultId === 'dc_loss_primary');
  const t1DcLossFit = dc1Loss ? dc1Loss.rescheduledWorkloadsFit : false;

  const t2BaselineFit =
    observation.baseline.totalPods > 0 &&
    observation.baseline.pendingPods === 0 &&
    observation.baseline.scheduledPods === observation.baseline.totalPods;

  const t2DcLossFit =
    observation.dcLossPrimary.totalPods > 0 &&
    observation.dcLossPrimary.pendingPods === 0 &&
    observation.dcLossPrimary.scheduledPods === observation.dcLossPrimary.totalPods;

  const discrepancies: string[] = [];
  if (t1BaselineFit !== t2BaselineFit) {
    discrepancies.push(
      `Baseline mismatch: T1 predicted fit=${t1BaselineFit}, KWOK kube-scheduler observed fit=${t2BaselineFit} (pending=${observation.baseline.pendingPods}: ${observation.baseline.unschedulablePodNames.join(', ')})`
    );
  }
  if (t1DcLossFit !== t2DcLossFit) {
    discrepancies.push(
      `dc_loss_primary mismatch: T1 predicted fit=${t1DcLossFit}, KWOK kube-scheduler observed fit=${t2DcLossFit} (pending=${observation.dcLossPrimary.pendingPods}: ${observation.dcLossPrimary.unschedulablePodNames.join(', ')})`
    );
  }

  const calibrated = discrepancies.length === 0;
  const summary = calibrated
    ? `Calibration T1 ↔ T2 réussie pour '${t1Eval.profileId}' : ${observation.baseline.scheduledPods}/${observation.baseline.totalPods} pods planifiés à l'état nominal et ${observation.dcLossPrimary.scheduledPods}/${observation.dcLossPrimary.totalPods} re-planifiés après perte de ${observation.dcLossPrimary.drainedZone}.`
    : `Dérive T1 ↔ T2 détectée pour '${t1Eval.profileId}' : ${discrepancies.join(' | ')}`;

  return {
    profileId: t1Eval.profileId,
    sylvaRelease: t1Eval.model.sylvaRelease,
    fidelityReached: 2,
    calibrated,
    t1BaselineFit,
    t2BaselineFit,
    t1DcLossFit,
    t2DcLossFit,
    discrepancies,
    summary
  };
}

const DEFAULT_FAULT_SUITE: FaultKind[] = [
  'dc_loss_primary',
  'dc_loss_secondary',
  'host_loss_sriov',
  'power_feed_loss_pdu_a',
  'inter_dc_link_partition'
];

/**
 * Évalue un profil topologique complet sous la suite de pannes de référence.
 */
export function evaluateSylvaTopologyProfile(options: {
  profileId: SylvaTopologyProfileId;
  components?: LogicalComponent[];
  overlay?: EnvironmentOverlay;
  catalogs?: ValueCatalogs;
  hydratedPowerFeeds?: string[];
  sylvaValues?: Record<string, unknown>;
}): SylvaTwinProfileEvaluation {
  const model = buildSylvaTwinModel(options);
  const faultResults = DEFAULT_FAULT_SUITE.map((f) => simulateTwinFault(model, f));

  const totalInstances = model.resolvedPerDc.reduce(
    (acc, dcItem) =>
      acc +
      dcItem.components.reduce(
        (cAcc, comp) => cAcc + comp.modules.reduce((mAcc, m) => mAcc + m.instances.length, 0),
        0
      ),
    0
  );

  const totalNics = model.resolvedPerDc.reduce(
    (acc, dcItem) =>
      acc +
      dcItem.components.reduce(
        (cAcc, comp) =>
          cAcc +
          comp.modules.reduce(
            (mAcc, m) => mAcc + m.instances.reduce((iAcc, inst) => iAcc + inst.nics.length, 0),
            0
          ),
        0
      ),
    0
  );

  const primaryLoss = faultResults.find((f) => f.faultId === 'dc_loss_primary');
  const allFaultsSurviveZeroTouch = faultResults.every((f) => f.survivesZeroTouch);
  const worstCaseRtoSeconds = Math.max(0, ...faultResults.map((f) => f.estimatedRtoSeconds));
  const workloadDcs = model.failureDomains.filter((d) => d.workloadBearing);
  const hasWitnessSite = model.failureDomains.some((d) => !d.workloadBearing);

  return {
    profileId: model.profileId,
    profileLabel: model.profileLabel,
    tierBadge: model.tierBadge,
    dcCount: model.failureDomains.length,
    workloadDcCount: workloadDcs.length,
    hasWitnessSite,
    datacenters: model.failureDomains.map((d) => d.id),
    totalInstances,
    totalNics,
    estimatedBareMetalHosts: model.bareMetalHosts.length,
    model,
    faultResults,
    allFaultsSurviveZeroTouch,
    primaryDcLossSurvives: Boolean(primaryLoss?.survivesZeroTouch),
    worstCaseRtoSeconds,
    sushyEmulator: generateSushyEmulatorConfig(model),
    kwokNodes: generateKwokNodeManifests(model)
  };
}

/**
 * Exécute la matrice complète du Jumeau Numérique de Sylva (3 DCs par défaut vs 2 DCs + Témoin vs 2 DCs secs)
 * et produit le rapport d'arbitrage selon le mode ('proposal' ou 'client-mandated').
 */
export function runSylvaDigitalTwinMatrix(options: {
  components?: LogicalComponent[];
  overlay?: EnvironmentOverlay;
  catalogs?: ValueCatalogs;
  hydratedPowerFeeds?: string[];
  sylvaValues?: Record<string, unknown>;
  governance?: Partial<TwinGovernanceRequirements>;
} = {}): SylvaTwinArbitrationReport {
  const requirements: TwinGovernanceRequirements = {
    ...DEFAULT_TWIN_GOVERNANCE_REQUIREMENTS,
    ...(options.governance || {})
  };

  const profileOrder: SylvaTopologyProfileId[] = ['3dc-active', '2dc-witness', '2dc-split'];
  const profiles = profileOrder.map((profileId) =>
    evaluateSylvaTopologyProfile({
      profileId,
      components: options.components,
      overlay: options.overlay,
      catalogs: options.catalogs,
      hydratedPowerFeeds: options.hydratedPowerFeeds,
      sylvaValues: options.sylvaValues
    })
  );

  // Détermination du profil cible soumis à vérification :
  // - en mode 'client-mandated' : le profil imposé par le client (par défaut '2dc-split' si le client fixe 2 DCs secs)
  // - en mode 'proposal' : la baseline '3dc-active' (3 DCs par défaut)
  const targetProfileId: SylvaTopologyProfileId =
    requirements.mode === 'client-mandated'
      ? requirements.mandatedProfileId || '2dc-split'
      : '3dc-active';

  const targetEval = profiles.find((p) => p.profileId === targetProfileId) || profiles[0];
  const violations: TwinArbitrationViolation[] = [];

  const dcPrimaryLoss = targetEval.faultResults.find((f) => f.faultId === 'dc_loss_primary');
  const pduLoss = targetEval.faultResults.find((f) => f.faultId === 'power_feed_loss_pdu_a');

  if (requirements.requireEtcdQuorumOnDcLoss && dcPrimaryLoss && !dcPrimaryLoss.etcdQuorumSurvives) {
    violations.push({
      rule: 'twin_rule_01_etcd_quorum_on_dc_loss',
      profileId: targetProfileId,
      faultId: 'dc_loss_primary',
      message: `Profil '${targetProfileId}' : la perte du Datacenter primaire fait tomber le quorum etcd RKE2 (${dcPrimaryLoss.etcdSurvivingMembers}/${dcPrimaryLoss.etcdTotalMembers} survivant < quorum 2).`,
      violatedRequirementId: 'REQ-Twin-Quorum-01'
    });
  }

  if (
    requirements.requireStorageWritableOnDcLoss &&
    dcPrimaryLoss &&
    !dcPrimaryLoss.storageWritable
  ) {
    violations.push({
      rule: 'twin_rule_02_storage_writable_on_dc_loss',
      profileId: targetProfileId,
      faultId: 'dc_loss_primary',
      message: `Profil '${targetProfileId}' : la perte du Datacenter primaire bloque l'écriture stockage (${dcPrimaryLoss.storageSurvivingReplicas} réplica(s) survivant(s) < quorum 2).`,
      violatedRequirementId: 'REQ-Twin-Storage-02'
    });
  }

  if (
    requirements.requireWorkloadCapacityOnDcLoss &&
    dcPrimaryLoss &&
    !dcPrimaryLoss.rescheduledWorkloadsFit
  ) {
    violations.push({
      rule: 'twin_rule_03_workload_capacity_on_dc_loss',
      profileId: targetProfileId,
      faultId: 'dc_loss_primary',
      message: `Profil '${targetProfileId}' : capacité Bare-Metal / SR-IOV insuffisante après perte de DC (${dcPrimaryLoss.unschedulableModules.join(', ')}).`,
      violatedRequirementId: 'REQ-Twin-Capacity-03'
    });
  }

  if (requirements.requireSinglePowerFeedSurvival && pduLoss && !pduLoss.survivesZeroTouch) {
    violations.push({
      rule: 'twin_rule_04_dual_power_feed_survival',
      profileId: targetProfileId,
      faultId: 'power_feed_loss_pdu_a',
      message: `Profil '${targetProfileId}' : la perte de la voie électrique PDU-A provoque une interruption de service (absence de double adduction 2N).`,
      violatedRequirementId: 'REQ-Lot1-1343'
    });
  }

  if (
    requirements.requireBmcRedfishBound &&
    targetEval.sushyEmulator.systems.some((s) => !s.bmcAddress.startsWith('redfish+http'))
  ) {
    violations.push({
      rule: 'twin_rule_05_bmc_redfish_bound',
      profileId: targetProfileId,
      message: `Profil '${targetProfileId}' : au moins un BareMetalHost n'est pas rattaché à une URL BMC Redfish valide pour sushy-emulator / capm3.`,
      violatedRequirementId: 'REQ-Sylva-02'
    });
  }

  if (targetEval.worstCaseRtoSeconds > requirements.maxAllowedRtoSeconds) {
    violations.push({
      rule: 'twin_rule_06_rto_budget_exceeded',
      profileId: targetProfileId,
      message: `Profil '${targetProfileId}' : RTO pire cas estimé à ${targetEval.worstCaseRtoSeconds}s > cible maximale ${requirements.maxAllowedRtoSeconds}s.`,
      violatedRequirementId: 'REQ-Twin-RTO-06'
    });
  }

  // Recommandation argumentée
  const goldProfile = profiles.find((p) => p.profileId === '3dc-active')!;
  const silverProfile = profiles.find((p) => p.profileId === '2dc-witness')!;

  let recommendedProfileId: SylvaTopologyProfileId = '3dc-active';
  let recommendationRationale = '';

  if (requirements.mode === 'proposal') {
    if (goldProfile.allFaultsSurviveZeroTouch) {
      recommendedProfileId = '3dc-active';
      recommendationRationale =
        `Baseline recommandée : 3 DCs Actif/Actif/Actif (${goldProfile.estimatedBareMetalHosts} hôtes Bare-Metal). ` +
        `Garantit le maintien du quorum etcd (2/3), l'écriture stockage (RF=3) et une marge SR-IOV/CPU positive (RTO = 0s) sur perte de n'importe quel DC. ` +
        `Alternative frugale : '2dc-witness' (2 DCs + 1 nœud témoin léger, ${silverProfile.estimatedBareMetalHosts} hôtes) maintient également le quorum automatique si un 3e DC complet n'est pas disponible.`;
    } else {
      recommendedProfileId = '2dc-witness';
      recommendationRationale =
        'Recommandation : 2 DCs + Témoin avec ajout de serveurs Bare-Metal dans les pools saturés.';
    }
  } else {
    recommendedProfileId = violations.length === 0 ? targetProfileId : '2dc-witness';
    recommendationRationale =
      violations.length === 0
        ? `Exigence client ('${targetProfileId}') validée sans réserve par le jumeau numérique Sylva.`
        : `Attention — Exigences client contradictoires sur '${targetProfileId}' (${violations.length} violation(s)). ` +
          `Une topologie 2 DCs sans témoin ne peut pas garantir un RTO=0 sur perte du DC primaire (perte du quorum etcd 1/3). ` +
          `Proposition de réserve technique : basculer vers '2dc-witness' (+1 nœud témoin léger) ou '3dc-active' (3 DCs).`;
  }

  return {
    sylvaRelease: SYLVA_LATEST_RELEASE,
    fidelity: 1,
    engine: 'archinex-sylva-twin-t1',
    mode: requirements.mode,
    defaultProfileId: '3dc-active',
    recommendedProfileId,
    recommendationRationale,
    requirements,
    profiles,
    violations,
    verdict: violations.length === 0 ? 'compliant' : 'violated'
  };
}
