/**
 * Moteur de Résolution ref(), Graphe d'Impact, Continuité LogicalInterfaces,
 * Flux Implicites & Simulation What-If (Lot 2 — Issue #284).
 */

import type {
  DatacenterCatalogEntry,
  EntityLifecycleStatus,
  EnvironmentOverlay,
  FirewallCatalogEntry,
  FirewallRuleSpec,
  LogicalComponent,
  LogicalInterfaceSpec,
  ModuleSpec,
  NicSpec,
  ValueCatalogs
} from './componentCatalog.js';
import { DEFAULT_VALUE_CATALOGS } from './componentCatalog.js';

export interface ReferenceEdge {
  from: string;
  to: string;
  kind: 'param' | 'catalog' | 'internal' | 'crossTenant' | 'generatedFrom';
  field: string;
}

export interface ReferenceGraph {
  edges: ReferenceEdge[];
}

export interface ResolvedNicIp {
  class: NicSpec['class'];
  subClass?: NicSpec['subClass'];
  index: number;
  vrf: string;
  subnet: string;
  cidr: string;
  ip: string;
  fqdn: string;
  defaultRoute: boolean;
}

export interface ResolvedModuleInstance {
  instanceIndex: number;
  hostname: string;
  nics: ResolvedNicIp[];
}

export interface ResolvedModule {
  name: string;
  kind: ModuleSpec['kind'];
  role: string;
  status: EntityLifecycleStatus;
  placement: ModuleSpec['placement'];
  replicas: number;
  chartVersion?: string;
  helm?: ModuleSpec['helm'];
  instances: ResolvedModuleInstance[];
}

export interface ResolvedSubnet {
  name: string;
  cidr: string;
  vrf: string;
  zone: string;
  class: NicSpec['class'];
  reservedIps: Record<string, string>;
}

export interface ResolvedComponentInstance {
  instanceKey: string; // <name>@<version> in <env>/<dc>
  name: string;
  tenant: string; // <tenant>-<env>
  environment: string;
  datacenter: string;
  functionalDomain: string;
  editor: string;
  external: boolean;
  status: EntityLifecycleStatus;
  version: string;
  manifestVersion: number;
  subnets: ResolvedSubnet[];
  modules: ResolvedModule[];
  explicitRules: FirewallRuleSpec[];
  implicitRules: FirewallRuleSpec[];
  effectiveRules: FirewallRuleSpec[];
  unresolvedRefs: string[];
  logicalInterfaces: LogicalInterfaceSpec[];
  continuityErrors: string[];
}

export interface WhatIfDcScenario {
  dcCount: number;
  datacenters: string[];
  totalInstances: number;
  totalNics: number;
  estimatedBareMetalHosts: number;
  resolvedPerDc: Array<{
    datacenter: string;
    drRole: DatacenterCatalogEntry['drRole'];
    components: ResolvedComponentInstance[];
  }>;
}

/**
 * Calcule une IPv4 dans un CIDR /24 (ou /16-/30) à partir d'un offset ordinal.
 */
export function computeIpFromCidrOffset(cidr: string, offset: number): string {
  const [baseIp, prefixStr] = cidr.split('/');
  const prefix = Number(prefixStr || '24');
  const octets = (baseIp || '').split('.').map(Number);
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
    throw new Error(`CIDR invalide pour résolution d'offset : '${cidr}'`);
  }
  const baseNum =
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const hostMask = prefix >= 32 ? 0 : (0xffffffff >>> prefix) >>> 0;
  const networkNum = (baseNum & (~hostMask >>> 0)) >>> 0;
  if (offset < 0 || offset > hostMask) {
    throw new Error(`Offset ${offset} hors plage du CIDR '${cidr}'`);
  }
  const target = (networkNum + offset) >>> 0;
  return [
    (target >>> 24) & 255,
    (target >>> 16) & 255,
    (target >>> 8) & 255,
    target & 255
  ].join('.');
}

/**
 * Résout une expression `ref(param.<key>)` avec priorité au scope DC (`dc.<dc>.<key>`), puis overlay global.
 */
export function resolveParamRef(
  expr: string | number,
  overlay: EnvironmentOverlay,
  datacenter: string,
  unresolvedRefs: string[]
): unknown {
  if (typeof expr !== 'string') return expr;
  const match = expr.match(/^ref\(param\.([^)]+)\)$/);
  if (!match) return expr;

  const key = match[1];
  const dcKey = `dc.${datacenter}.${key}`;
  if (dcKey in overlay.spec.substitutions) {
    return overlay.spec.substitutions[dcKey];
  }
  if (key in overlay.spec.substitutions) {
    return overlay.spec.substitutions[key];
  }
  unresolvedRefs.push(expr);
  return expr;
}

/**
 * Vérifie la continuité bout-en-bout des segments d'une liste de LogicalInterfaces.
 */
export function verifyLogicalInterfaceContinuity(
  logicalInterfaces: LogicalInterfaceSpec[]
): string[] {
  const errors: string[] = [];
  for (const li of logicalInterfaces) {
    if (li.flows.length <= 1) continue;
    for (let i = 0; i < li.flows.length - 1; i++) {
      const curr = li.flows[i];
      const next = li.flows[i + 1];
      if (curr.to !== next.from) {
        errors.push(
          `Discontinuité sur LogicalInterface '${li.name}' : segment '${curr.segment}' termine sur '${curr.to}' mais '${next.segment}' démarre sur '${next.from}'.`
        );
      }
    }
  }
  return errors;
}

/**
 * Génère de façon déterministe les flux firewall implicites (auto-generated)
 * à partir des déclarations de stockage NFS, NICs events, certificats autoRenew.
 * Règle "Explicit wins" : aucune duplication si une règle explicite couvre déjà (from|to|proto|ports).
 */
export function generateImplicitFlows(
  component: LogicalComponent,
  explicitRules: FirewallRuleSpec[]
): FirewallRuleSpec[] {
  if (component.metadata.external || component.metadata.status === 'inactive') {
    return [];
  }

  const implicit: FirewallRuleSpec[] = [];
  const explicitKeys = new Set(
    explicitRules.map((r) => `${r.from}|${r.to}|${r.proto}|${[...r.ports].sort().join(',')}`)
  );

  const pushIfNew = (rule: FirewallRuleSpec) => {
    const key = `${rule.from}|${rule.to}|${rule.proto}|${[...rule.ports].sort().join(',')}`;
    if (!explicitKeys.has(key)) {
      explicitKeys.add(key);
      implicit.push(rule);
    }
  };

  const compName = component.metadata.name;

  // 1. Flux NFS implicites (TCP/UDP 2049, 111) depuis storage.exports
  for (const exp of component.spec.storage?.exports || []) {
    for (const grant of exp.access) {
      if (grant.rights === 'none') continue;
      pushIfNew({
        id: `auto-nfs-${compName}-${exp.name}-${grant.grant.replace(/[^a-zA-Z0-9-]/g, '-')}`,
        from: grant.grant,
        to: `svm:${exp.svm}`,
        proto: 'tcp',
        ports: [111, 2049],
        action: 'allow',
        category: 'auto-generated',
        generatedBy: 'archinex-implicit-flow-engine',
        generatedFrom: `${compName}.storage.exports[${exp.name}]`
      });
    }
  }

  // 2. Flux d'observabilité implicites depuis les NICs de classe 'events'
  for (const mod of component.spec.compute?.modules || []) {
    if (mod.status === 'inactive') continue;
    const hasEventsNic = mod.nics.some((n) => n.class === 'events');
    if (hasEventsNic) {
      pushIfNew({
        id: `auto-obs-${compName}-${mod.name}-siem`,
        from: `module:${compName}.${mod.name}:events`,
        to: 'group:siem-collectors',
        proto: 'tcp',
        ports: [6514, 9090],
        action: 'allow',
        tlsVersion: 'tls1.3',
        category: 'auto-generated',
        generatedBy: 'archinex-implicit-flow-engine',
        generatedFrom: `${compName}.compute.modules[${mod.name}].nics[class=events]`
      });
    }
  }

  // 3. Flux de renouvellement PKI (ACME / internal-ca) si autoRenew: true
  for (const cert of component.spec.security?.certificates || []) {
    if (cert.autoRenew) {
      pushIfNew({
        id: `auto-pki-${compName}-${cert.name}`,
        from: `tenant:${component.metadata.tenant}`,
        to: 'group:pki-ca-endpoints',
        proto: 'tcp',
        ports: [443],
        action: 'allow',
        tlsVersion: 'tls1.3',
        category: 'auto-generated',
        generatedBy: 'archinex-implicit-flow-engine',
        generatedFrom: `${compName}.security.certificates[${cert.name}]`
      });
    }
  }

  // 4. Flux VPN implicites (IKE/ESP UDP 500, 4500 + DPD) depuis network.tunnels (§3.2.6, §3.5.4)
  for (const tunnel of component.spec.network?.tunnels || []) {
    if (tunnel.status === 'inactive') continue;
    pushIfNew({
      id: `auto-vpn-${compName}-${tunnel.name}`,
      from: `endpoint:${tunnel.endpoints.local}`,
      to: `endpoint:${tunnel.endpoints.remote}`,
      proto: 'udp',
      ports: [500, 4500],
      action: 'allow',
      category: 'auto-generated',
      generatedBy: 'archinex-implicit-flow-engine',
      generatedFrom: `${compName}.network.tunnels[${tunnel.name}]`
    });
  }

  // 5. Flux Object Storage S3 implicites (TCP 443) depuis storage.objectStores (§3.4.4, §3.5.4)
  for (const store of component.spec.storage?.objectStores || []) {
    for (const bucket of store.buckets) {
      for (const grant of bucket.access) {
        pushIfNew({
          id: `auto-s3-${compName}-${store.name}-${bucket.name}-${grant.grant.replace(/[^a-zA-Z0-9-]/g, '-')}`,
          from: grant.grant,
          to: `s3:${store.name}/${bucket.name}`,
          proto: 'tcp',
          ports: [443],
          action: 'allow',
          tlsVersion: 'tls1.3',
          category: 'auto-generated',
          generatedBy: 'archinex-implicit-flow-engine',
          generatedFrom: `${compName}.storage.objectStores[${store.name}].buckets[${bucket.name}]`
        });
      }
    }
  }

  // 6. Flux d'exposition implicites : entryPoints (proxy->backend), MFT, email (§3.11, §3.5.4)
  for (const ep of component.spec.exposure?.entryPoints || []) {
    if (ep.status === 'inactive') continue;
    for (const route of ep.routes) {
      pushIfNew({
        id: `auto-exp-${compName}-${ep.name}-${route.path.replace(/[^a-zA-Z0-9-]/g, '-')}`,
        from: `entryPoint:${ep.name}`,
        to: route.backend,
        proto: 'tcp',
        ports: [443],
        action: 'allow',
        tlsVersion: ep.tls.minVersion,
        category: 'auto-generated',
        generatedBy: 'archinex-implicit-flow-engine',
        generatedFrom: `${compName}.exposure.entryPoints[${ep.name}]`
      });
    }
  }

  for (const ft of component.spec.exposure?.fileTransfers || []) {
    if (ft.status === 'inactive') continue;
    const port = ft.protocol === 'sftp' ? 22 : ft.protocol === 'ftps' ? 990 : 443;
    for (const partner of ft.partners) {
      pushIfNew({
        id: `auto-mft-${compName}-${ft.name}-${partner.replace(/[^a-zA-Z0-9-]/g, '-')}`,
        from: `tenant:${component.metadata.tenant}`,
        to: partner,
        proto: 'tcp',
        ports: [port],
        action: 'allow',
        category: 'auto-generated',
        generatedBy: 'archinex-implicit-flow-engine',
        generatedFrom: `${compName}.exposure.fileTransfers[${ft.name}]`
      });
    }
  }

  for (const mail of component.spec.exposure?.email || []) {
    if (mail.status === 'inactive') continue;
    pushIfNew({
      id: `auto-mta-${compName}-${mail.name}`,
      from: `tenant:${component.metadata.tenant}`,
      to: mail.relay,
      proto: 'tcp',
      ports: [587],
      action: 'allow',
      tlsVersion: 'tls1.3',
      category: 'auto-generated',
      generatedBy: 'archinex-implicit-flow-engine',
      generatedFrom: `${compName}.exposure.email[${mail.name}]`
    });
  }

  // 7. Flux agents endpoint AV / EDR (§3.6, §3.5.4)
  const epSec = component.spec.security?.endpoint;
  if (epSec?.av || epSec?.edr) {
    pushIfNew({
      id: `auto-endpoint-sec-${compName}`,
      from: `tenant:${component.metadata.tenant}:events`,
      to: 'group:security-agents-managers',
      proto: 'tcp',
      ports: [443],
      action: 'allow',
      tlsVersion: 'tls1.3',
      category: 'auto-generated',
      generatedBy: 'archinex-implicit-flow-engine',
      generatedFrom: `${compName}.security.endpoint`
    });
  }

  return implicit;
}

/**
 * Projette une Base LogicalComponent × EnvironmentOverlay × Datacenter en une instance résolue.
 */
export function resolveComponentInstance(
  component: LogicalComponent,
  overlay: EnvironmentOverlay,
  datacenter: string,
  catalogs: ValueCatalogs = DEFAULT_VALUE_CATALOGS
): ResolvedComponentInstance {
  const env = overlay.metadata.environment;
  const unresolvedRefs: string[] = [];
  const vrfsByName = new Map((component.spec.network?.vrfs || []).map((v) => [v.name, v]));

  const resolvedSubnets: ResolvedSubnet[] = (component.spec.network?.subnets || []).map((sub) => {
    const resolvedCidr = String(resolveParamRef(sub.cidr, overlay, datacenter, unresolvedRefs));
    const reservedIps: Record<string, string> = {};
    if (sub.reserved && !resolvedCidr.startsWith('ref(')) {
      for (const [resName, resSpec] of Object.entries(sub.reserved)) {
        reservedIps[resName] = computeIpFromCidrOffset(resolvedCidr, resSpec.offset);
      }
    }
    return {
      name: sub.name,
      cidr: resolvedCidr,
      vrf: sub.vrf,
      zone: sub.zone,
      class: sub.class,
      reservedIps
    };
  });

  const subnetsByName = new Map(resolvedSubnets.map((s) => [s.name, s]));

  // Offset de décalage par DC pour éviter toute collision IP inter-DC en What-If (dc1=+0, dc2=+20, dc3=+40)
  const dcIndex = Math.max(0, catalogs.datacenters.findIndex((d) => d.name === datacenter));
  const dcOffsetShift = dcIndex * 20;

  const resolvedModules: ResolvedModule[] = (component.spec.compute?.modules || []).map((mod) => {
    const rawInstances = resolveParamRef(mod.instances, overlay, datacenter, unresolvedRefs);
    const replicas = Math.max(1, Number(rawInstances) || 1);
    const chartVersion = mod.helm
      ? String(resolveParamRef(mod.helm.version, overlay, datacenter, unresolvedRefs))
      : undefined;

    const instances: ResolvedModuleInstance[] = [];
    for (let idx = 0; idx < replicas; idx++) {
      const hostname = `${mod.name}-${datacenter}-${String(idx + 1).padStart(2, '0')}`;
      const orderedNics = [...mod.nics].sort((a, b) => a.index - b.index);
      const nics: ResolvedNicIp[] = orderedNics.map((nic) => {
        const sub = subnetsByName.get(nic.subnetRef);
        const cidr = sub?.cidr || 'unresolved';
        const vrfDomain = vrfsByName.get(nic.vrf)?.domain || `${nic.vrf}.internal`;
        let ip = 'dhcp';
        if (nic.ip.by === 'offset' && typeof nic.ip.value === 'number' && !cidr.startsWith('ref(') && cidr !== 'unresolved') {
          const effOffset = nic.ip.value + dcOffsetShift + (nic.ip.perInstance ? idx : 0);
          ip = computeIpFromCidrOffset(cidr, effOffset);
        } else if (nic.ip.by === 'reserved' && typeof nic.ip.value === 'string') {
          ip = sub?.reservedIps[nic.ip.value] || `reserved:${nic.ip.value}`;
        }
        return {
          class: nic.class,
          subClass: nic.subClass,
          index: nic.index,
          vrf: nic.vrf,
          subnet: nic.subnetRef,
          cidr,
          ip,
          fqdn: `${hostname}.${nic.subnetRef}.${vrfDomain}`,
          defaultRoute: Boolean(nic.defaultRoute)
        };
      });

      instances.push({ instanceIndex: idx + 1, hostname, nics });
    }

    return {
      name: mod.name,
      kind: mod.kind,
      role: mod.role,
      status: component.metadata.status === 'inactive' ? 'inactive' : mod.status,
      placement: mod.placement,
      replicas,
      chartVersion,
      helm: mod.helm ? { ...mod.helm, version: chartVersion || mod.helm.version } : undefined,
      instances
    };
  });

  const explicitRules: FirewallRuleSpec[] = (component.spec.firewall?.rules || []).map((r) => ({
    ...r,
    category: 'explicit'
  }));
  const implicitRules = generateImplicitFlows(component, explicitRules);
  const logicalInterfaces = component.spec.logicalInterfaces || [];
  const continuityErrors = verifyLogicalInterfaceContinuity(logicalInterfaces);

  return {
    instanceKey: `${component.metadata.name}@${component.metadata.version} in ${env}/${datacenter}`,
    name: component.metadata.name,
    tenant: `${component.metadata.tenant}-${env}`,
    environment: env,
    datacenter,
    functionalDomain: component.metadata.functionalDomain,
    editor: component.metadata.editor,
    external: component.metadata.external,
    status: component.metadata.status,
    version: component.metadata.version,
    manifestVersion: component.metadata.manifestVersion,
    subnets: resolvedSubnets,
    modules: resolvedModules,
    explicitRules,
    implicitRules,
    effectiveRules: [...explicitRules, ...implicitRules],
    unresolvedRefs,
    logicalInterfaces,
    continuityErrors
  };
}

/**
 * Construit le graphe complet des références `ref()` pour l'analyse d'impact.
 */
export function buildReferenceGraph(components: LogicalComponent[]): ReferenceGraph {
  const edges: ReferenceEdge[] = [];
  const refRegex = /ref\(([^)]+)\)/g;

  function scanValue(compName: string, path: string, val: unknown) {
    if (typeof val === 'string') {
      let m: RegExpExecArray | null;
      while ((m = refRegex.exec(val)) !== null) {
        const inner = m[1];
        if (inner.startsWith('param.')) {
          edges.push({ from: compName, to: inner, kind: 'param', field: path });
        } else if (inner.startsWith('catalog.')) {
          edges.push({ from: compName, to: inner, kind: 'catalog', field: path });
        } else if (inner.startsWith('component:')) {
          const targetComp = inner.slice('component:'.length).split('.')[0];
          edges.push({ from: compName, to: targetComp, kind: 'crossTenant', field: path });
        } else {
          edges.push({ from: compName, to: `${compName}.${inner}`, kind: 'internal', field: path });
        }
      }
    } else if (Array.isArray(val)) {
      val.forEach((item, i) => scanValue(compName, `${path}[${i}]`, item));
    } else if (val && typeof val === 'object') {
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        scanValue(compName, path ? `${path}.${k}` : k, v);
      }
    }
  }

  for (const comp of components) {
    scanValue(comp.metadata.name, 'spec', comp.spec);
    for (const rule of comp.spec.firewall?.rules || []) {
      if (rule.generatedFrom) {
        edges.push({
          from: `${comp.metadata.name}.firewall.rules[${rule.id}]`,
          to: rule.generatedFrom,
          kind: 'generatedFrom',
          field: 'generatedFrom'
        });
      }
    }
  }

  return { edges };
}

/**
 * Analyse d'impact bidirectionnelle (qui dépend de `target` / qu'impacte `source`).
 */
export function computeImpactRadius(graph: ReferenceGraph, nodeName: string) {
  const dependents = Array.from(
    new Set(graph.edges.filter((e) => e.to === nodeName).map((e) => e.from))
  );
  const dependencies = Array.from(
    new Set(graph.edges.filter((e) => e.from === nodeName).map((e) => e.to))
  );
  return { nodeName, dependents, dependencies };
}

/**
 * Simulation What-If (ex: 2 vs 3 Datacenters) à partir de la même Base + Overlay.
 */
export function simulateWhatIfDatacenters(
  components: LogicalComponent[],
  overlay: EnvironmentOverlay,
  dcCounts: number[] = [2, 3],
  catalogs: ValueCatalogs = DEFAULT_VALUE_CATALOGS
): WhatIfDcScenario[] {
  return dcCounts.map((count) => {
    const dcs = catalogs.datacenters.slice(0, count).map((d) => d.name);
    const resolvedPerDc = dcs.map((dc) => {
      const dcEntry = catalogs.datacenters.find((d) => d.name === dc);
      const resolved = components
        .filter((c) => !c.metadata.external && c.metadata.status !== 'inactive')
        .map((c) => resolveComponentInstance(c, overlay, dc, catalogs));
      return {
        datacenter: dc,
        drRole: dcEntry?.drRole || 'secondary',
        components: resolved
      };
    });

    const totalInstances = resolvedPerDc.reduce(
      (acc, dcItem) =>
        acc +
        dcItem.components.reduce(
          (cAcc, comp) => cAcc + comp.modules.reduce((mAcc, m) => mAcc + m.instances.length, 0),
          0
        ),
      0
    );
    const totalNics = resolvedPerDc.reduce(
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

    // Estimation : 1 pool SR-IOV + 1 pool Standard minimum par DC actif
    const estimatedBareMetalHosts = dcs.length * 2;

    return {
      dcCount: dcs.length,
      datacenters: dcs,
      totalInstances,
      totalNics,
      estimatedBareMetalHosts,
      resolvedPerDc
    };
  });
}

export interface CatalogDanglingReferenceReport {
  valid: boolean;
  danglingFirewallGroups: string[];
  missingDependencies: string[];
  missingVaultComponent: boolean;
}

/**
 * Audit d'intégrité référentielle d'un catalogue de composants logiques :
 * vérifie que chaque groupe firewall `group:<nom>` ciblé par une règle explicite ou implicite
 * (`pki-ca-endpoints`, `siem-collectors`, etc.), chaque `dependsOn` et chaque montage `vault://*`
 * est effectivement soutenu par un composant actif présent dans le catalogue.
 */
export function verifyCatalogDanglingReferences(
  components: LogicalComponent[]
): CatalogDanglingReferenceReport {
  const activeComponents = components.filter((c) => c.metadata.status !== 'inactive');
  const activeNames = new Set(activeComponents.map((c) => c.metadata.name));
  const declaredGroups = new Set<string>();

  for (const comp of activeComponents) {
    for (const grp of comp.spec.firewall?.groups || []) {
      declaredGroups.add(grp.name);
    }
  }

  const danglingGroupsSet = new Set<string>();
  const missingDepsSet = new Set<string>();
  let usesVault = false;

  for (const comp of activeComponents) {
    for (const dep of comp.spec.dependsOn || []) {
      if (!activeNames.has(dep)) {
        missingDepsSet.add(dep);
      }
    }

    if (comp.spec.security?.vault?.mount?.startsWith('vault://')) {
      usesVault = true;
    }
    for (const mod of comp.spec.compute?.modules || []) {
      if (mod.proxy?.accountRef?.startsWith('vault://')) {
        usesVault = true;
      }
    }

    const explicitRules = comp.spec.firewall?.rules || [];
    const implicitRules = generateImplicitFlows(comp, explicitRules);
    for (const rule of [...explicitRules, ...implicitRules]) {
      for (const endpoint of [rule.from, rule.to]) {
        if (typeof endpoint === 'string' && endpoint.startsWith('group:')) {
          const groupName = endpoint.slice('group:'.length).trim();
          if (groupName && !declaredGroups.has(groupName)) {
            danglingGroupsSet.add(groupName);
          }
        }
      }
    }
  }

  const missingVaultComponent = usesVault && !activeNames.has('vault-cluster');
  const danglingFirewallGroups = Array.from(danglingGroupsSet).sort();
  const missingDependencies = Array.from(missingDepsSet).sort();

  return {
    valid:
      danglingFirewallGroups.length === 0 &&
      missingDependencies.length === 0 &&
      !missingVaultComponent,
    danglingFirewallGroups,
    missingDependencies,
    missingVaultComponent
  };
}

export interface FirewallPathDeductionResult {
  fromZone: string;
  toZone: string;
  firewalls: FirewallCatalogEntry[];
  error?: string;
}

/**
 * Déduit la liste ordonnée des pare-feu traversés entre deux zones (IMP V2 §3.5.1).
 * Un flux inter-zone sans pare-feu sur le chemin retourne une erreur bloquante.
 */
export function deduceFirewallPath(
  fromZone: string,
  toZone: string,
  catalogs: ValueCatalogs = DEFAULT_VALUE_CATALOGS
): FirewallPathDeductionResult {
  if (fromZone === toZone) {
    return { fromZone, toZone, firewalls: [] };
  }

  const catalogFirewalls = catalogs.firewalls || [];
  // Recherche directe si un pare-feu couvre les deux zones
  const direct = catalogFirewalls.find(
    (fw) => fw.zones.includes(fromZone) && fw.zones.includes(toZone)
  );
  if (direct) {
    return { fromZone, toZone, firewalls: [direct] };
  }

  // Recherche BFS multi-sauts (ex. app -> dmz via fw-interzone-core -> untrusted-external via fw-external)
  const queue: Array<{ zone: string; path: FirewallCatalogEntry[] }> = [
    { zone: fromZone, path: [] }
  ];
  const visitedZones = new Set<string>([fromZone]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const fw of catalogFirewalls) {
      if (!fw.zones.includes(current.zone)) continue;
      if (fw.zones.includes(toZone)) {
        return { fromZone, toZone, firewalls: [...current.path, fw] };
      }
      for (const nextZone of fw.zones) {
        if (!visitedZones.has(nextZone)) {
          visitedZones.add(nextZone);
          queue.push({ zone: nextZone, path: [...current.path, fw] });
        }
      }
    }
  }

  return {
    fromZone,
    toZone,
    firewalls: [],
    error: `Flux inter-zones non protégé (${fromZone} -> ${toZone}) : aucun pare-feu déclaré ne couvre cette paire de zones.`
  };
}

/**
 * Résout la zone d'un opérande de règle pare-feu (`zone:<z>` ou `group:<g>`) à partir des composants connus.
 */
function resolveEndpointZone(endpoint: string, allComponents: LogicalComponent[]): string | null {
  if (endpoint.startsWith('zone:')) {
    return endpoint.slice('zone:'.length).trim();
  }
  if (!endpoint.startsWith('group:')) {
    return null;
  }
  const groupName = endpoint.slice('group:'.length).trim();
  for (const comp of allComponents) {
    const grp = comp.spec.firewall?.groups.find((g) => g.name === groupName);
    if (!grp) continue;
    // Résolution depuis le sélecteur de module -> NIC -> subnet -> zone
    const modMatch = grp.membersRef.match(/modules\[([^\]]+)\]/);
    const classMatch = grp.membersRef.match(/class=([a-zA-Z0-9_-]+)/);
    if (modMatch) {
      const mod = comp.spec.compute?.modules.find((m) => m.name === modMatch[1]);
      const nic = mod?.nics.find((n) => !classMatch || n.class === classMatch[1]);
      const subnet = comp.spec.network?.subnets?.find((s) => s.name === nic?.subnetRef);
      if (subnet) return subnet.zone;
    }
    if (comp.metadata.external) {
      return 'untrusted-external';
    }
  }
  return null;
}

/**
 * Valide les chemins pare-feu pour toutes les règles d'un composant (§3.5.1).
 */
export function validateComponentFirewallPaths(
  component: LogicalComponent,
  allComponents: LogicalComponent[],
  catalogs: ValueCatalogs = DEFAULT_VALUE_CATALOGS
): { deductions: Array<{ ruleId: string } & FirewallPathDeductionResult>; errors: string[] } {
  const deductions: Array<{ ruleId: string } & FirewallPathDeductionResult> = [];
  const errors: string[] = [];

  for (const rule of component.spec.firewall?.rules || []) {
    const fromZone = resolveEndpointZone(rule.from, allComponents);
    const toZone = resolveEndpointZone(rule.to, allComponents);
    if (!fromZone || !toZone) continue;

    const result = deduceFirewallPath(fromZone, toZone, catalogs);
    deductions.push({ ruleId: rule.id, ...result });
    if (result.error) {
      errors.push(`Règle '${rule.id}': ${result.error}`);
    }
  }

  return { deductions, errors };
}

export interface IpFabricValidationResult {
  errors: string[];
  warnings: string[];
}

/**
 * Valide le modèle IP Fabric, les whitelists routePropagation / bgpPropagation et la sécurité plan de contrôle (§3.2.8).
 */
export function validateIpFabricAndBgp(component: LogicalComponent): IpFabricValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fabric = component.spec.network?.fabric;
  const vrfs = component.spec.network?.vrfs || [];
  const routes = component.spec.network?.routes || [];

  if (fabric && fabric.underlay.peers.length > 0 && !fabric.security) {
    errors.push(
      `Composant '${component.metadata.name}': fabric.security est obligatoire lorsque des peers underlay sont déclarés (§3.2.8 règle 9).`
    );
  }

  const vrfByName = new Map(vrfs.map((v) => [v.name, v]));

  const isWhitelisted = (originVrfName: string, targetVrf: string, prefix: string): boolean => {
    const originVrf = vrfByName.get(originVrfName);
    const whitelist = originVrf?.fabric?.routePropagation || [];
    return whitelist.some(
      (entry) =>
        entry.action === 'allow' &&
        entry.to === targetVrf &&
        (entry.prefixes.includes(prefix) || entry.prefixes.includes('any'))
    );
  };

  for (const route of routes) {
    if (route.type === 'leaked' || route.type === 'static') {
      if (!isWhitelisted(route.from, route.to.vrf, route.to.prefix)) {
        errors.push(
          `Route '${route.name}' (${route.from} -> ${route.to.vrf}, ${route.to.prefix}) rejetée : aucune entrée 'allow' correspondante dans routePropagation (§3.2.8 règle 1).`
        );
      }
      if (route.type === 'static' && vrfByName.get(route.from)?.fabric?.bgpPropagation) {
        warnings.push(
          `Route statique '${route.name}' : privilégier bgpPropagation sur un VRF raccordé à la fabric (§3.2.8 règle 7).`
        );
      }
      // Vérification symétrie RT (§3.2.8 règle 3)
      if (!isWhitelisted(route.to.vrf, route.from, route.to.prefix)) {
        warnings.push(
          `Route '${route.name}' asymétrique : aucune politique d'import retour déclarée sur '${route.to.vrf}' vers '${route.from}' (§3.2.8 règle 3).`
        );
      }
    }
  }

  for (const vrf of vrfs) {
    for (const bgpRule of vrf.fabric?.bgpPropagation || []) {
      if (bgpRule.announce === 'none') continue;
      for (const prefix of bgpRule.prefixes) {
        if (!isWhitelisted(vrf.name, bgpRule.to, prefix)) {
          errors.push(
            `Annonce BGP sur '${vrf.name}' -> '${bgpRule.to}' (${prefix}) rejetée : absente de routePropagation (§3.2.8 règle 5).`
          );
        }
        if ((prefix.includes('vip') || prefix.includes('reserved')) && bgpRule.announce.anycastFrom.length < 2) {
          errors.push(
            `Annonce BGP VIP '${prefix}' sur '${vrf.name}' rejetée : anycastFrom doit déclarer au moins 2 leafs (§3.2.8 règle 8).`
          );
        }
      }
    }
  }

  return { errors, warnings };
}
