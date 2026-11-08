import { createHash } from 'node:crypto';
import { sanitizeManifests } from './adapters/sylvaAdapter.js';
import type { MultiAxisHydratedInventory } from './refinementCoverage.js';

export interface SylvaGitopsExportInput {
  edpId: string;
  subjectId: string;
  revision: number | string;
  ontologyFingerprint: string;
  opaVerdict: 'compliant' | 'violated';
  hydratedInventory: MultiAxisHydratedInventory;
  repoUrl?: string;
  baseBranch?: string;
  gitToken?: string;
  fetchImpl?: typeof fetch;
}

export interface SylvaGitopsExportResult {
  clusterName: string;
  branchName: string;
  baseBranch: string;
  targetPath: string;
  workloadClusterManifestPath: string;
  valuesYaml: string;
  workloadClusterManifestYaml: string;
  sha256: string;
  mode: 'github_pr' | 'gitlab_mr' | 'local_bundle';
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  provenance: {
    edpId: string;
    subjectId: string;
    revision: number | string;
    ontologyFingerprint: string;
    opaVerdict: 'compliant';
    exportedAt: string;
  };
}

/**
 * Sérialise un objet JSON déjà assaini en YAML déterministe lisible par Helm / FluxCD / Sylva
 * sans dépendance externe.
 */
export function serializeToDeterministicYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);

  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    if (
      value === '' ||
      /[:#{}[\],&*!|>'"%@`]/.test(value) ||
      /^\s|\s$/.test(value) ||
      /^(true|false|null|yes|no|on|off|\d+(\.\d+)?)$/i.test(value)
    ) {
      return JSON.stringify(value);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value
      .map((item) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const objLines = serializeToDeterministicYaml(item, indent + 1).split('\n');
          const firstLine = objLines[0]?.trimStart() || '';
          const rest = objLines.slice(1);
          return [`${pad}- ${firstLine}`, ...rest].join('\n');
        }
        return `${pad}- ${serializeToDeterministicYaml(item, indent + 1)}`;
      })
      .join('\n');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined
    );
    if (entries.length === 0) return '{}';
    return entries
      .map(([k, v]) => {
        const safeKey = /^[a-zA-Z0-9_.-]+$/.test(k) ? k : JSON.stringify(k);
        if (v && typeof v === 'object') {
          if (Array.isArray(v) && v.length === 0) {
            return `${pad}${safeKey}: []`;
          }
          if (!Array.isArray(v) && Object.keys(v as object).length === 0) {
            return `${pad}${safeKey}: {}`;
          }
          return `${pad}${safeKey}:\n${serializeToDeterministicYaml(v, indent + 1)}`;
        }
        return `${pad}${safeKey}: ${serializeToDeterministicYaml(v, indent + 1)}`;
      })
      .join('\n');
  }
  return String(value);
}

/**
 * Construit et exporte le descripteur GitOps Sylva (`workload-clusters/<cluster-name>/values.yaml`
 * et `workload-cluster.yaml`) et ouvre optionnellement une PR GitHub ou MR GitLab.
 * Refuse formellement l'export si le verdict de l'Oracle OPA est `violated`.
 */
export async function exportSylvaWorkloadClusterGitops(
  input: SylvaGitopsExportInput
): Promise<SylvaGitopsExportResult> {
  if (input.opaVerdict !== 'compliant') {
    const err = new Error(
      `Export GitOps Sylva refusé : le verdict courant de l'Oracle OPA est '${input.opaVerdict}'. Toutes les règles Rego doivent être conformes avant l'ouverture d'une PR/MR vers sylva-core.`
    );
    (err as any).statusCode = 409;
    throw err;
  }

  const rawSwc = input.hydratedInventory.sylva_workload_cluster_values;
  if (!rawSwc || typeof rawSwc !== 'object') {
    const err = new Error(
      'Aucun descripteur SylvaWorkloadCluster (sylva_workload_cluster_values) disponible dans l’inventaire hydraté.'
    );
    (err as any).statusCode = 400;
    throw err;
  }

  // Assainissement strict anti-secrets via sylvaAdapter
  const sanitizedSwc = sanitizeManifests(rawSwc) as Record<string, any>;
  const metadata = (sanitizedSwc.metadata || {}) as Record<string, any>;
  const spec = (sanitizedSwc.spec || {}) as Record<string, any>;

  const clusterName = String(metadata.name || `wc-${input.subjectId}`).replace(
    /[^a-zA-Z0-9-]/g,
    '-'
  );
  const exportedAt = new Date().toISOString();
  const baseBranch = input.baseBranch || process.env.SYLVA_GITOPS_BASE_BRANCH || 'main';
  const branchName = `gitops/sylva-${clusterName}-rev${input.revision}`;
  const targetPath = `workload-clusters/${clusterName}/values.yaml`;
  const workloadClusterManifestPath = `workload-clusters/${clusterName}/workload-cluster.yaml`;

  const helmValuesPayload = {
    cluster: {
      name: clusterName,
      capi_providers: spec.capi_providers || {
        infra_provider: 'capm3',
        bootstrap_provider: 'cabpr'
      },
      k8s_version: spec.k8s_version || 'v1.28.11+rke2r1',
      os_image_selector: spec.os_image_selector || {
        os: 'sle-micro',
        release: '5.5',
        hardened: true
      },
      baremetal_hosts: spec.baremetal_hosts || {},
      machine_deployments: spec.machine_deployments || {}
    },
    units: spec.units || {},
    security_zones: (input.hydratedInventory.security_zones || []).map((z: any) => ({
      zone_id: z.zone_id,
      isolation_level: z.isolation_level,
      proxy_required: z.proxy_required
    })),
    reconciliation_pivot: {
      tenant_ref: input.hydratedInventory.reconciliation_graph?.pivot_tenant_id || 'org-lot3-mno',
      ipsec_tunnel_ref:
        input.hydratedInventory.reconciliation_graph?.ipsec_tunnels?.[0]?.id ||
        'tun-ipsec-esp-lot3-secgw1'
    }
  };

  const sanitizedValues = sanitizeManifests(helmValuesPayload) as Record<string, unknown>;

  const headerComment = [
    '# ==============================================================================',
    '# Généré automatiquement par Archinex Phase 4 — GitOps Sylva Natif (FluxCD)',
    `# EDP ID               : ${input.edpId} (rev ${input.revision})`,
    `# Sujet source         : ${input.subjectId}`,
    `# Empreinte Ontologie  : ${input.ontologyFingerprint}`,
    '# Verdict Oracle OPA   : COMPLIANT',
    `# Chemin cible         : ${targetPath}`,
    '# =============================================================================='
  ].join('\n');

  const valuesYaml = `${headerComment}\n${serializeToDeterministicYaml(sanitizedValues)}\n`;
  const workloadClusterManifestYaml = `${headerComment}\n${serializeToDeterministicYaml(sanitizedSwc)}\n`;
  const sha256 = createHash('sha256').update(valuesYaml).digest('hex');

  const repoUrl = input.repoUrl ?? process.env.SYLVA_GITOPS_REPO_URL ?? '';
  const gitToken = input.gitToken ?? process.env.SYLVA_GITOPS_TOKEN ?? '';
  const fetchFn = input.fetchImpl || fetch;

  let mode: 'github_pr' | 'gitlab_mr' | 'local_bundle' = 'local_bundle';
  let pullRequestUrl: string | undefined;
  let pullRequestNumber: number | undefined;

  if (repoUrl && gitToken) {
    // 1. Support GitHub API (ex: https://github.com/org/sylva-core)
    const ghMatch = repoUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (ghMatch) {
      const [, owner, repo] = ghMatch;
      const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
      const headers = {
        Authorization: `Bearer ${gitToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      };

      const refRes = await fetchFn(`${apiBase}/git/ref/heads/${encodeURIComponent(baseBranch)}`, {
        headers
      });
      if (refRes.ok) {
        const refData = await refRes.json();
        const baseSha = refData?.object?.sha;

        if (baseSha) {
          await fetchFn(`${apiBase}/git/refs`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ref: `refs/heads/${branchName}`,
              sha: baseSha
            })
          });
        }

        await fetchFn(`${apiBase}/contents/${targetPath}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            message: `feat(sylva): hydrate workload-cluster ${clusterName} from ${input.edpId}`,
            content: Buffer.from(valuesYaml, 'utf-8').toString('base64'),
            branch: branchName
          })
        });

        const prRes = await fetchFn(`${apiBase}/pulls`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: `feat(sylva): WorkloadCluster ${clusterName} (${input.edpId} rev ${input.revision})`,
            head: branchName,
            base: baseBranch,
            body: [
              `### Export GitOps Sylva Natif — \`${clusterName}\``,
              `- **Paquet EDP** : \`${input.edpId}\` (révision \`${input.revision}\`)`,
              `- **Sujet** : \`${input.subjectId}\``,
              `- **Empreinte Ontologie** : \`${input.ontologyFingerprint}\``,
              `- **Verdict Oracle OPA** : \`COMPLIANT\``,
              `- **Fichier généré** : \`${targetPath}\` (\`sha256:${sha256.slice(0, 12)}\`)`
            ].join('\n')
          })
        });

        if (prRes.ok) {
          const prData = await prRes.json();
          mode = 'github_pr';
          pullRequestUrl = prData.html_url;
          pullRequestNumber = prData.number;
        }
      }
    } else if (/gitlab/i.test(repoUrl)) {
      // 2. Support GitLab API v4 (dépôt sylva-core hébergé sur GitLab)
      const parsed = new URL(repoUrl);
      const projectPath = parsed.pathname.replace(/^\/+|\.git$/g, '');
      const apiBase = `${parsed.origin}/api/v4/projects/${encodeURIComponent(projectPath)}`;
      const headers = {
        'PRIVATE-TOKEN': gitToken,
        'Content-Type': 'application/json'
      };

      await fetchFn(`${apiBase}/repository/commits`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          branch: branchName,
          start_branch: baseBranch,
          commit_message: `feat(sylva): hydrate workload-cluster ${clusterName} from ${input.edpId}`,
          actions: [
            {
              action: 'create',
              file_path: targetPath,
              content: valuesYaml
            },
            {
              action: 'create',
              file_path: workloadClusterManifestPath,
              content: workloadClusterManifestYaml
            }
          ]
        })
      });

      const mrRes = await fetchFn(`${apiBase}/merge_requests`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source_branch: branchName,
          target_branch: baseBranch,
          title: `feat(sylva): WorkloadCluster ${clusterName} (${input.edpId} rev ${input.revision})`,
          description: `Export GitOps Sylva généré par Archinex Phase 4 (\`${targetPath}\`, SHA-256: \`${sha256}\`).`
        })
      });

      if (mrRes.ok) {
        const mrData = await mrRes.json();
        mode = 'gitlab_mr';
        pullRequestUrl = mrData.web_url;
        pullRequestNumber = mrData.iid;
      }
    }
  }

  return {
    clusterName,
    branchName,
    baseBranch,
    targetPath,
    workloadClusterManifestPath,
    valuesYaml,
    workloadClusterManifestYaml,
    sha256,
    mode,
    pullRequestUrl,
    pullRequestNumber,
    provenance: {
      edpId: input.edpId,
      subjectId: input.subjectId,
      revision: input.revision,
      ontologyFingerprint: input.ontologyFingerprint,
      opaVerdict: 'compliant',
      exportedAt
    }
  };
}
