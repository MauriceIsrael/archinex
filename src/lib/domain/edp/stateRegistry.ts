/**
 * State Registry (consolidating registry), Quarantaine/GC, Export CMDB unidirectionnel
 * & Matrices Documentaires V2 (IMP V2 Lot 5 — Issues #302, #307, §8.3, §8.7, §9).
 */

import type {
  CertificateProfileCatalogEntry,
  EntityLifecycleStatus,
  LogicalComponent,
  ValueCatalogs
} from './componentCatalog.js';
import { DEFAULT_VALUE_CATALOGS } from './componentCatalog.js';
import {
  deduceFirewallPath,
  generateImplicitFlows,
  type ResolvedComponentInstance
} from './refResolver.js';

export interface ResolvedValueSnapshotEntry {
  instanceKey: string;
  manifestVersion: number;
  resolvedAt: string;
  resolvedIps: Record<string, string>;
  resolvedReplicas: Record<string, number>;
  resolvedSubnets: Record<string, string>;
}

export interface RegistryOperationEntry {
  operationId: string;
  script: string;
  user: string;
  timestamp: string;
  instanceKey: string;
  manifestVersion: number;
  phaseResult: 'done' | 'failed' | 'rolled-back';
}

export interface QuarantineEntry {
  entityId: string;
  entityKind: 'component' | 'module' | 'vrf' | 'vlan' | 'certificate' | 'storage';
  status: 'inactive';
  reason: string;
  quarantinedAt: string;
  eligibleForGcAt: string;
  retainProtected: boolean;
}

export interface CmdbMappingRule {
  entityFamily: 'component' | 'module' | 'vrf' | 'certificate';
  ciClass: string;
  attributes: Record<string, string>;
}

export interface CmdbCiRecord {
  ciClass: string;
  ciId: string;
  attributes: Record<string, unknown>;
}

export interface ImpStateRegistry {
  operations: RegistryOperationEntry[];
  snapshots: Record<string, ResolvedValueSnapshotEntry>;
  quarantine: Record<string, QuarantineEntry>;
  inventory: Record<string, ResolvedComponentInstance>;
}

export function createEmptyStateRegistry(): ImpStateRegistry {
  return {
    operations: [],
    snapshots: {},
    quarantine: {},
    inventory: {}
  };
}

/**
 * Enregistre une opération de réconciliation (registre immutable-append, §8.3 règle 3)
 * et met à jour le snapshot de valeurs résolues pour les prochains diffs (§8.3 règle 5).
 */
export function recordRegistryOperation(
  registry: ImpStateRegistry,
  params: {
    operationId: string;
    script: string;
    user: string;
    timestamp: string;
    resolved: ResolvedComponentInstance;
    phaseResult?: 'done' | 'failed' | 'rolled-back';
  }
): ImpStateRegistry {
  const { resolved } = params;
  const resolvedIps: Record<string, string> = {};
  const resolvedReplicas: Record<string, number> = {};
  const resolvedSubnets: Record<string, string> = {};

  for (const sub of resolved.subnets) {
    resolvedSubnets[sub.name] = sub.cidr;
  }
  for (const mod of resolved.modules) {
    resolvedReplicas[mod.name] = mod.replicas;
    for (const inst of mod.instances) {
      for (const nic of inst.nics) {
        resolvedIps[`${mod.name}[${inst.instanceIndex}].nics[${nic.index}]`] = nic.ip;
      }
    }
  }

  const nextOp: RegistryOperationEntry = {
    operationId: params.operationId,
    script: params.script,
    user: params.user,
    timestamp: params.timestamp,
    instanceKey: resolved.instanceKey,
    manifestVersion: resolved.manifestVersion,
    phaseResult: params.phaseResult ?? 'done'
  };

  return {
    ...registry,
    operations: [...registry.operations, nextOp],
    snapshots: {
      ...registry.snapshots,
      [resolved.instanceKey]: {
        instanceKey: resolved.instanceKey,
        manifestVersion: resolved.manifestVersion,
        resolvedAt: params.timestamp,
        resolvedIps,
        resolvedReplicas,
        resolvedSubnets
      }
    },
    inventory: {
      ...registry.inventory,
      [resolved.instanceKey]: resolved
    }
  };
}

export interface SnapshotDiffItem {
  field: string;
  recordedValue: string | number;
  nextValue: string | number;
}

/**
 * Compare une instance résolue au snapshot enregistré lors du dernier déploiement (§8.3 règle 5).
 */
export function diffResolvedAgainstSnapshot(
  registry: ImpStateRegistry,
  nextResolved: ResolvedComponentInstance
): SnapshotDiffItem[] {
  const prev = registry.snapshots[nextResolved.instanceKey];
  if (!prev) return [];

  const diffs: SnapshotDiffItem[] = [];
  for (const mod of nextResolved.modules) {
    const prevRep = prev.resolvedReplicas[mod.name];
    if (prevRep !== undefined && prevRep !== mod.replicas) {
      diffs.push({
        field: `modules.${mod.name}.replicas`,
        recordedValue: prevRep,
        nextValue: mod.replicas
      });
    }
    for (const inst of mod.instances) {
      for (const nic of inst.nics) {
        const key = `${mod.name}[${inst.instanceIndex}].nics[${nic.index}]`;
        const prevIp = prev.resolvedIps[key];
        if (prevIp !== undefined && prevIp !== nic.ip) {
          diffs.push({
            field: key,
            recordedValue: prevIp,
            nextValue: nic.ip
          });
        }
      }
    }
  }

  return diffs;
}

/**
 * Place une entité en quarantaine (`status: 'inactive'`) avant suppression physique par GC (§7.4 règle 5, §8.7).
 */
export function placeEntityInQuarantine(
  registry: ImpStateRegistry,
  params: {
    entityId: string;
    entityKind: QuarantineEntry['entityKind'];
    reason: string;
    quarantinedAt: string;
    graceDays: number;
    retainProtected?: boolean;
  }
): ImpStateRegistry {
  const start = new Date(params.quarantinedAt);
  const gcDate = new Date(start.getTime() + params.graceDays * 86_400_000);

  return {
    ...registry,
    quarantine: {
      ...registry.quarantine,
      [params.entityId]: {
        entityId: params.entityId,
        entityKind: params.entityKind,
        status: 'inactive',
        reason: params.reason,
        quarantinedAt: params.quarantinedAt,
        eligibleForGcAt: gcDate.toISOString(),
        retainProtected: Boolean(params.retainProtected)
      }
    }
  };
}

/**
 * Liste les entités en quarantaine dont le délai de grâce est expiré et qui ne sont pas protégées par `retain` (§8.7).
 */
export function listGcEligibleEntities(
  registry: ImpStateRegistry,
  nowIso: string
): QuarantineEntry[] {
  const nowMs = new Date(nowIso).getTime();
  return Object.values(registry.quarantine).filter(
    (q) => !q.retainProtected && new Date(q.eligibleForGcAt).getTime() <= nowMs
  );
}

/**
 * Export CMDB unidirectionnel (platform -> CMDB) à partir du registre d'état (§8.3 règle 7).
 */
export function exportCmdbRecords(
  registry: ImpStateRegistry,
  mappings: CmdbMappingRule[]
): CmdbCiRecord[] {
  const records: CmdbCiRecord[] = [];
  const compMapping = mappings.find((m) => m.entityFamily === 'component');
  const modMapping = mappings.find((m) => m.entityFamily === 'module');

  for (const inst of Object.values(registry.inventory)) {
    if (compMapping) {
      records.push({
        ciClass: compMapping.ciClass,
        ciId: inst.instanceKey,
        attributes: {
          name: inst.name,
          tenant: inst.tenant,
          environment: inst.environment,
          datacenter: inst.datacenter,
          functionalDomain: inst.functionalDomain,
          editor: inst.editor,
          manifestVersion: inst.manifestVersion,
          status: inst.status
        }
      });
    }
    if (modMapping) {
      for (const mod of inst.modules) {
        records.push({
          ciClass: modMapping.ciClass,
          ciId: `${inst.instanceKey}/${mod.name}`,
          attributes: {
            component: inst.name,
            module: mod.name,
            kind: mod.kind,
            replicas: mod.replicas,
            status: mod.status
          }
        });
      }
    }
  }

  return records;
}

// ============================================================================
// MATRICES DOCUMENTAIRES V2 (§9)
// ============================================================================

export interface CertificateMatrixRow {
  component: string;
  certificate: string;
  type: string;
  profile: string;
  algorithm?: string;
  keySize?: number;
  validityDays?: number;
  issuanceMethod: string;
  boundToVip?: string;
  sslTermination?: string;
  status: EntityLifecycleStatus;
}

export function buildCertificateMatrixV2(
  components: LogicalComponent[],
  catalogs: ValueCatalogs = DEFAULT_VALUE_CATALOGS
): CertificateMatrixRow[] {
  const rows: CertificateMatrixRow[] = [];

  for (const comp of components) {
    const profiles: CertificateProfileCatalogEntry[] = [
      ...(catalogs.certificateProfiles || []),
      ...(comp.spec.security?.certificateProfiles || [])
    ];
    for (const cert of comp.spec.security?.certificates || []) {
      const match = cert.profile?.match(/certificateProfiles\[([^\]]+)\]/);
      const profileName = match ? match[1] : cert.profile || 'inline';
      const prof = profiles.find((p) => p.name === profileName);
      rows.push({
        component: comp.metadata.name,
        certificate: cert.name,
        type: cert.type,
        profile: profileName,
        algorithm: prof?.algorithm ?? cert.algorithm,
        keySize: prof?.keySize ?? cert.keySize,
        validityDays: prof?.validityDays ?? cert.validityDays,
        issuanceMethod: cert.issuanceMethod,
        boundToVip: cert.boundToVip,
        sslTermination: cert.sslTermination,
        status: cert.status ?? comp.metadata.status
      });
    }
  }

  return rows;
}

export interface FirewallMatrixV2Row {
  component: string;
  ruleId: string;
  functionalFlow: string;
  from: string;
  to: string;
  proto: string;
  ports: number[];
  action: 'allow' | 'deny';
  category: 'explicit' | 'auto-generated';
  generatedFrom?: string;
  firewallPath: string[];
  sslTermination?: string;
  tlsVersion?: string;
}

export function buildFirewallMatrixV2(
  components: LogicalComponent[],
  catalogs: ValueCatalogs = DEFAULT_VALUE_CATALOGS
): FirewallMatrixV2Row[] {
  const rows: FirewallMatrixV2Row[] = [];

  for (const comp of components) {
    const explicit = comp.spec.firewall?.rules || [];
    const implicit = generateImplicitFlows(comp, explicit);
    for (const rule of [...explicit, ...implicit]) {
      const fromZone = rule.from.startsWith('zone:') ? rule.from.slice(5) : undefined;
      const toZone = rule.to.startsWith('zone:') ? rule.to.slice(5) : undefined;
      const deduced =
        fromZone && toZone
          ? deduceFirewallPath(fromZone, toZone, catalogs).firewalls.map((f) => f.name)
          : [];
      rows.push({
        component: comp.metadata.name,
        ruleId: rule.id,
        functionalFlow: rule.functionalFlow || 'unassigned',
        from: rule.from,
        to: rule.to,
        proto: rule.proto,
        ports: rule.ports,
        action: rule.action,
        category: rule.category || 'explicit',
        generatedFrom: rule.generatedFrom,
        firewallPath: deduced,
        sslTermination: rule.sslTermination,
        tlsVersion: rule.tlsVersion
      });
    }
  }

  return rows;
}

export interface BgpRoutingAnnexRow {
  component: string;
  vrf: string;
  kind: 'routePropagation' | 'bgpPropagation' | 'explicitRoute';
  targetVrf: string;
  prefixes: string[];
  anycastFrom?: string[];
  reason?: string;
}

export function buildBgpRoutingAnnexV2(components: LogicalComponent[]): BgpRoutingAnnexRow[] {
  const rows: BgpRoutingAnnexRow[] = [];

  for (const comp of components) {
    for (const vrf of comp.spec.network?.vrfs || []) {
      for (const rp of vrf.fabric?.routePropagation || []) {
        if (rp.action === 'allow') {
          rows.push({
            component: comp.metadata.name,
            vrf: vrf.name,
            kind: 'routePropagation',
            targetVrf: rp.to,
            prefixes: rp.prefixes
          });
        }
      }
      for (const bp of vrf.fabric?.bgpPropagation || []) {
        if (bp.announce !== 'none') {
          rows.push({
            component: comp.metadata.name,
            vrf: vrf.name,
            kind: 'bgpPropagation',
            targetVrf: bp.to,
            prefixes: bp.prefixes,
            anycastFrom: bp.announce.anycastFrom
          });
        }
      }
    }
    for (const rt of comp.spec.network?.routes || []) {
      rows.push({
        component: comp.metadata.name,
        vrf: rt.from,
        kind: 'explicitRoute',
        targetVrf: rt.to.vrf,
        prefixes: [rt.to.prefix],
        reason: rt.reason
      });
    }
  }

  return rows;
}

export interface ExposureMatrixRow {
  component: string;
  kind: 'entryPoint' | 'fileTransfer' | 'email';
  name: string;
  endpointOrTarget: string;
  security: string;
  status: EntityLifecycleStatus;
}

export function buildExposureMatrixV2(components: LogicalComponent[]): ExposureMatrixRow[] {
  const rows: ExposureMatrixRow[] = [];

  for (const comp of components) {
    const exp = comp.spec.exposure;
    if (!exp) continue;
    for (const ep of exp.entryPoints || []) {
      rows.push({
        component: comp.metadata.name,
        kind: 'entryPoint',
        name: ep.name,
        endpointOrTarget: `${ep.hostname} (${ep.vip})`,
        security: `${ep.tls.minVersion} / ${ep.tls.termination}`,
        status: ep.status ?? comp.metadata.status
      });
    }
    for (const ft of exp.fileTransfers || []) {
      rows.push({
        component: comp.metadata.name,
        kind: 'fileTransfer',
        name: ft.name,
        endpointOrTarget: `${ft.protocol} (${ft.direction})`,
        security: ft.encryption?.atRest || 'transport-only',
        status: ft.status ?? comp.metadata.status
      });
    }
    for (const em of exp.email || []) {
      rows.push({
        component: comp.metadata.name,
        kind: 'email',
        name: em.name,
        endpointOrTarget: `${em.sender} -> ${em.relay}`,
        security: `${em.security.transport}${em.security.signing ? '+' + em.security.signing : ''}`,
        status: em.status ?? comp.metadata.status
      });
    }
  }

  return rows;
}
