/**
 * Agrégation Projet & 3 Vues Mermaid Synchronisées (Lot 3 — Issue #285, Conv. 3f81312a).
 *
 * 1. Vue Logique (Composants fonctionnels, Cas d'usage & Interfaces Logiques S6a / Rx-N5 / WMS-WFS)
 * 2. Vue Déploiement (Datacenter -> Pool Sylva -> Tenant Namespace -> Module / Instance)
 * 3. Vue Physique / CMDB (Nautobot SSoT, NICs par classe, VRFs, IPs résolues, PDU 2N, composants hébergés)
 */

import type { LogicalComponent } from './componentCatalog.js';
import type { ResolvedComponentInstance, WhatIfDcScenario } from './refResolver.js';

export interface ProjectLogicalTopology {
  projectId: string;
  environment: string;
  datacenters: string[];
  components: LogicalComponent[];
  resolvedInstances: ResolvedComponentInstance[];
  orphanFlows: Array<{ sourceComponent: string; targetRef: string; ruleId: string }>;
  mermaid: {
    logicalView: string;
    deploymentView: string;
    physicalCmdbView: string;
  };
}

function safeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, '_');
}

function esc(raw: string): string {
  return raw.replace(/"/g, "'");
}

/**
 * Agrège les composants résolus (issus de plusieurs sujets d'un même Projet)
 * et détecte les flux orphelins dont la cible n'est pas présente dans le catalogue projet.
 */
export function composeProjectLogicalTopology(
  projectId: string,
  environment: string,
  datacenters: string[],
  components: LogicalComponent[],
  resolvedInstances: ResolvedComponentInstance[],
  nautobotDevices: Array<Record<string, unknown>> = []
): ProjectLogicalTopology {
  const knownNames = new Set(components.map((c) => c.metadata.name));
  const orphanFlows: ProjectLogicalTopology['orphanFlows'] = [];

  for (const comp of components) {
    for (const rule of comp.spec.firewall?.rules || []) {
      const m = rule.to.match(/^ref\(component:([^.)]+)/);
      if (m && !knownNames.has(m[1])) {
        orphanFlows.push({
          sourceComponent: comp.metadata.name,
          targetRef: m[1],
          ruleId: rule.id
        });
      }
    }
  }

  return {
    projectId,
    environment,
    datacenters,
    components,
    resolvedInstances,
    orphanFlows,
    mermaid: {
      logicalView: generateLogicalComponentViewMermaid(components),
      deploymentView: generateDeploymentViewMermaid(resolvedInstances, environment, datacenters),
      physicalCmdbView: generatePhysicalCmdbViewMermaid(resolvedInstances, nautobotDevices)
    }
  };
}

/**
 * Vue 1 : Vue Logique (Fonctionnelle & Flux) sans bruit d'infrastructure.
 */
export function generateLogicalComponentViewMermaid(components: LogicalComponent[]): string {
  const lines: string[] = ['flowchart LR'];

  // Regroupement par domaine fonctionnel
  const byDomain = new Map<string, LogicalComponent[]>();
  for (const comp of components) {
    const dom = comp.metadata.functionalDomain || 'other';
    if (!byDomain.has(dom)) byDomain.set(dom, []);
    byDomain.get(dom)!.push(comp);
  }

  for (const [domain, comps] of byDomain.entries()) {
    lines.push(`  subgraph DOM_${safeId(domain)}["Domaine : ${esc(domain)}"]`);
    for (const c of comps) {
      const id = `COMP_${safeId(c.metadata.name)}`;
      const tag = c.metadata.external ? ' (Externe)' : '';
      const statusBadge = c.metadata.status !== 'active' ? ` [${c.metadata.status}]` : '';
      lines.push(`    ${id}["${esc(c.metadata.displayName)}${tag}${statusBadge}"]`);
    }
    lines.push('  end');
  }

  // Liens logiques depuis firewall.rules et crossTenantContracts
  const seenEdges = new Set<string>();
  for (const c of components) {
    const srcId = `COMP_${safeId(c.metadata.name)}`;
    for (const rule of c.spec.firewall?.rules || []) {
      const toMatch = rule.to.match(/^ref\(component:([^.)]+)/);
      const fromMatch = rule.from.match(/^ref\(component:([^.)]+)/);
      const source = fromMatch ? `COMP_${safeId(fromMatch[1])}` : srcId;
      const target = toMatch ? `COMP_${safeId(toMatch[1])}` : fromMatch ? srcId : null;
      if (target && source !== target) {
        const label = rule.functionalFlow || `${rule.proto.toUpperCase()}/${rule.ports.join(',')}`;
        const key = `${source}->${target}:${label}`;
        if (!seenEdges.has(key)) {
          seenEdges.add(key);
          lines.push(`  ${source} -- "${esc(label)}" --> ${target}`);
        }
      }
    }
    for (const contract of c.spec.crossTenantContracts || []) {
      const target = `COMP_${safeId(contract.targetComponent)}`;
      const key = `${srcId}->${target}:contract`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        lines.push(`  ${srcId} -. "${esc(contract.purpose.slice(0, 40))}" .-> ${target}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Vue 2 : Vue Déploiement (Datacenter -> Pool Sylva -> Tenant Namespace -> Module / Instance).
 */
export function generateDeploymentViewMermaid(
  resolvedInstances: ResolvedComponentInstance[],
  environment: string,
  datacenters: string[]
): string {
  const lines: string[] = ['flowchart TB'];
  lines.push(`  subgraph ENV_${safeId(environment)}["Environnement : ${esc(environment.toUpperCase())}"]`);

  for (const dc of datacenters) {
    const dcInstances = resolvedInstances.filter((r) => r.datacenter === dc && !r.external);
    lines.push(`    subgraph DC_${safeId(dc)}["Datacenter : ${esc(dc)}"]`);

    const byPool = new Map<string, Array<{ comp: ResolvedComponentInstance; modName: string; replicas: number; status: string }>>();
    for (const comp of dcInstances) {
      for (const mod of comp.modules) {
        const pool = mod.placement.pool || mod.placement.requiredDataplane;
        if (!byPool.has(pool)) byPool.set(pool, []);
        byPool.get(pool)!.push({
          comp,
          modName: mod.name,
          replicas: mod.instances.length,
          status: mod.status
        });
      }
    }

    for (const [pool, items] of byPool.entries()) {
      lines.push(`      subgraph POOL_${safeId(dc)}_${safeId(pool)}["Pool Sylva : ${esc(pool)}"]`);
      for (const item of items) {
        const nodeId = `MOD_${safeId(dc)}_${safeId(item.comp.name)}_${safeId(item.modName)}`;
        lines.push(
          `        ${nodeId}["${esc(item.comp.name)} / ${esc(item.modName)}\\n(${item.replicas}x · ns: ${esc(item.comp.tenant)} · ${item.status})"]`
        );
      }
      lines.push('      end');
    }

    lines.push('    end');
  }

  lines.push('  end');
  return lines.join('\n');
}

/**
 * Vue 3 : Vue Physique / CMDB (Nautobot SSoT + NICs par classe + IPs résolues + Composants hébergés).
 */
export function generatePhysicalCmdbViewMermaid(
  resolvedInstances: ResolvedComponentInstance[],
  nautobotDevices: Array<Record<string, unknown>> = []
): string {
  const lines: string[] = ['flowchart LR'];

  if (nautobotDevices.length > 0) {
    lines.push('  subgraph NB["Inventaire Physique Nautobot (SSoT)"]');
    for (const dev of nautobotDevices) {
      const name = String(dev.name || 'srv');
      const dtype = String(dev.device_type || 'BareMetal');
      const pool = String(dev.cluster_pool || 'sylva-default');
      const oob = String(dev.oob_ip || 'N/A');
      const pdu = Array.isArray(dev.power_feeds) ? dev.power_feeds.join('+') : '2N';
      lines.push(
        `    DEV_${safeId(name)}["${esc(name)} (${esc(dtype)})\\nPool: ${esc(pool)} · OOB: ${esc(oob)} · PDU: ${esc(pdu)}"]`
      );
    }
    lines.push('  end');
  }

  lines.push('  subgraph NET["NICs Résolues & VRFs"]');
  for (const comp of resolvedInstances.filter((c) => !c.external)) {
    for (const mod of comp.modules) {
      const firstInst = mod.instances[0];
      if (!firstInst) continue;
      const nicSummary = firstInst.nics
        .map((n) => `${n.class}[${n.index}]: ${n.ip} (${n.vrf})`)
        .join('\\n');
      const modNode = `NIC_${safeId(comp.datacenter)}_${safeId(comp.name)}_${safeId(mod.name)}`;
      lines.push(`    ${modNode}["${esc(comp.name)}/${esc(mod.name)} (${esc(comp.datacenter)})\\n${esc(nicSummary)}"]`);

      // Raccordement visuel vers les hôtes Nautobot du même pool
      for (const dev of nautobotDevices) {
        const pool = String(dev.cluster_pool || '');
        if (pool && pool === mod.placement.pool) {
          lines.push(`    DEV_${safeId(String(dev.name))} --> ${modNode}`);
        }
      }
    }
  }
  lines.push('  end');

  return lines.join('\n');
}

/**
 * Formate un résumé comparatif What-If (ex: 2 vs 3 DCs) pour affichage UI et audit.
 */
export function summarizeWhatIfComparison(scenarios: WhatIfDcScenario[]) {
  return scenarios.map((s) => ({
    dcCount: s.dcCount,
    datacenters: s.datacenters,
    totalInstances: s.totalInstances,
    totalNics: s.totalNics,
    estimatedBareMetalHosts: s.estimatedBareMetalHosts,
    deploymentMermaid: generateDeploymentViewMermaid(
      s.resolvedPerDc.flatMap((d) => d.components),
      s.resolvedPerDc[0]?.components[0]?.environment || 'prod',
      s.datacenters
    )
  }));
}
