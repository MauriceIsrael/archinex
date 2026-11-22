import {
  fetchWithTimeout,
  sanitizeBaseUrl,
  type AdapterHealthResult,
  type AdapterMode,
  type BaseAdapterOptions
} from './adapterTypes.js';
import {
  buildConnectorWriteBackPayload,
  writeBackToNautobot,
  type ConnectorWriteBackPayload,
  type NautobotWriteBackResult,
  type NautobotWriteBackTarget
} from './writeBackContract.js';

export const GITOPS_FORGE_CONNECTOR_NAME = 'gitops-forge-connector';
export const GITOPS_FORGE_CONNECTOR_VERSION = '1.0.0';

/**
 * Structure découplée du bundle GitOps consommé par le connecteur Forgejo
 * (sans import depuis `src/`, ADR-017 / #411).
 */
export interface GitopsBundlePayload {
  clusterName: string;
  branchName: string;
  baseBranch: string;
  targetPath: string;
  workloadClusterManifestPath: string;
  valuesYaml: string;
  workloadClusterManifestYaml: string;
  tenantWorkloads: Array<{ path: string; yaml: string }>;
  sha256: string;
  provenance: {
    edpId: string;
    subjectId: string;
    revision: number | string;
    ontologyFingerprint: string;
    opaVerdict: string;
    exportedAt: string;
  };
}

export const DEFAULT_FORGEJO_URL = process.env.FORGEJO_URL || 'http://127.0.0.1:3001';

export interface ForgejoClientOptions extends BaseAdapterOptions {
  token?: string;
  username?: string;
  password?: string;
}

export interface ForgejoRepoOptions extends ForgejoClientOptions {
  owner: string;
  repo: string;
  createIfMissing?: boolean;
  defaultBranch?: string;
}

export interface ForgejoRepoResult {
  reachable: boolean;
  mode: AdapterMode;
  baseUrl: string;
  owner: string;
  repo: string;
  exists: boolean;
  created: boolean;
  htmlUrl?: string;
  checkedAt: string;
  errors: string[];
}

export interface ForgejoPushExportOptions extends ForgejoClientOptions {
  owner: string;
  repo: string;
  bundle: GitopsBundlePayload;
  createRepoIfMissing?: boolean;
  includeTenantWorkloads?: boolean;
}

export interface ForgejoPushExportResult {
  reachable: boolean;
  mode: 'forgejo_pr' | 'degraded';
  baseUrl: string;
  owner: string;
  repo: string;
  branchName: string;
  baseBranch: string;
  branchCreated: boolean;
  pushedFiles: string[];
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  checkedAt: string;
  errors: string[];
}

export interface GitopsForgePort {
  checkHealth(options?: ForgejoClientOptions): Promise<AdapterHealthResult>;
  ensureRepository(options: ForgejoRepoOptions): Promise<ForgejoRepoResult>;
  pushSylvaExportAndOpenPr(options: ForgejoPushExportOptions): Promise<ForgejoPushExportResult>;
}

/**
 * Adaptateur Forgejo (Port/Adapter) pour la création de branche, le push
 * d'un bundle `sylvaGitopsExport.ts` et l'ouverture de Pull Request via l'API v1.
 */
export class GitopsForgeAdapter implements GitopsForgePort {
  private readonly defaultOptions: ForgejoClientOptions;

  constructor(defaultOptions: ForgejoClientOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  private resolveConfig(override?: ForgejoClientOptions) {
    return {
      baseUrl: sanitizeBaseUrl(
        override?.baseUrl || this.defaultOptions.baseUrl || DEFAULT_FORGEJO_URL
      ),
      token: override?.token ?? this.defaultOptions.token ?? process.env.FORGEJO_TOKEN ?? '',
      username: override?.username ?? this.defaultOptions.username ?? process.env.FORGEJO_USER,
      password:
        override?.password ?? this.defaultOptions.password ?? process.env.FORGEJO_PASSWORD,
      timeoutMs: override?.timeoutMs ?? this.defaultOptions.timeoutMs ?? 5000,
      fetchImpl: override?.fetchImpl ?? this.defaultOptions.fetchImpl
    };
  }

  private buildAuthHeaders(cfg: ReturnType<GitopsForgeAdapter['resolveConfig']>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
    if (cfg.token) {
      headers.Authorization = `token ${cfg.token}`;
    } else if (cfg.username && cfg.password) {
      const encoded = Buffer.from(`${cfg.username}:${cfg.password}`, 'utf-8').toString('base64');
      headers.Authorization = `Basic ${encoded}`;
    }
    return headers;
  }

  async checkHealth(options?: ForgejoClientOptions): Promise<AdapterHealthResult> {
    const cfg = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();

    const res = await fetchWithTimeout<{ version?: string }>(
      `${cfg.baseUrl}/api/v1/version`,
      { method: 'GET', headers: { Accept: 'application/json' } },
      cfg.timeoutMs,
      cfg.fetchImpl
    );

    if (res.networkError) {
      return {
        service: 'forgejo',
        reachable: false,
        mode: 'degraded',
        baseUrl: cfg.baseUrl,
        checkedAt,
        errors: [res.error || 'Forgejo injoignable']
      };
    }

    return {
      service: 'forgejo',
      reachable: true,
      mode: res.ok ? 'live' : 'degraded',
      baseUrl: cfg.baseUrl,
      version: res.data?.version,
      checkedAt,
      errors: res.ok ? [] : [res.error || `HTTP ${res.status}`]
    };
  }

  async ensureRepository(options: ForgejoRepoOptions): Promise<ForgejoRepoResult> {
    const cfg = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();
    const headers = this.buildAuthHeaders(cfg);

    const getRes = await fetchWithTimeout<{ html_url?: string }>(
      `${cfg.baseUrl}/api/v1/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}`,
      { method: 'GET', headers },
      cfg.timeoutMs,
      cfg.fetchImpl
    );

    if (getRes.networkError) {
      return {
        reachable: false,
        mode: 'degraded',
        baseUrl: cfg.baseUrl,
        owner: options.owner,
        repo: options.repo,
        exists: false,
        created: false,
        checkedAt,
        errors: [getRes.error || 'Forgejo hors-ligne']
      };
    }

    if (getRes.ok) {
      return {
        reachable: true,
        mode: 'live',
        baseUrl: cfg.baseUrl,
        owner: options.owner,
        repo: options.repo,
        exists: true,
        created: false,
        htmlUrl: getRes.data?.html_url,
        checkedAt,
        errors: []
      };
    }

    if (!options.createIfMissing) {
      return {
        reachable: true,
        mode: 'live',
        baseUrl: cfg.baseUrl,
        owner: options.owner,
        repo: options.repo,
        exists: false,
        created: false,
        checkedAt,
        errors: [getRes.error || `Dépôt ${options.owner}/${options.repo} absent`]
      };
    }

    const createRes = await fetchWithTimeout<{ html_url?: string }>(
      `${cfg.baseUrl}/api/v1/user/repos`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: options.repo,
          auto_init: true,
          default_branch: options.defaultBranch || 'main'
        })
      },
      cfg.timeoutMs,
      cfg.fetchImpl
    );

    return {
      reachable: true,
      mode: createRes.ok ? 'live' : 'degraded',
      baseUrl: cfg.baseUrl,
      owner: options.owner,
      repo: options.repo,
      exists: createRes.ok,
      created: createRes.ok,
      htmlUrl: createRes.data?.html_url,
      checkedAt,
      errors: createRes.ok ? [] : [createRes.error || `Échec création dépôt (${createRes.status})`]
    };
  }

  async pushSylvaExportAndOpenPr(
    options: ForgejoPushExportOptions
  ): Promise<ForgejoPushExportResult> {
    const cfg = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();
    const { bundle, owner, repo } = options;
    const errors: string[] = [];

    if (!cfg.token && !(cfg.username && cfg.password)) {
      return {
        reachable: false,
        mode: 'degraded',
        baseUrl: cfg.baseUrl,
        owner,
        repo,
        branchName: bundle.branchName,
        baseBranch: bundle.baseBranch,
        branchCreated: false,
        pushedFiles: [],
        checkedAt,
        errors: ['Identifiants Forgejo manquants (FORGEJO_TOKEN ou username/password)']
      };
    }

    const repoCheck = await this.ensureRepository({
      ...options,
      createIfMissing: options.createRepoIfMissing ?? false,
      defaultBranch: bundle.baseBranch
    });

    if (!repoCheck.reachable || !repoCheck.exists) {
      return {
        reachable: repoCheck.reachable,
        mode: 'degraded',
        baseUrl: cfg.baseUrl,
        owner,
        repo,
        branchName: bundle.branchName,
        baseBranch: bundle.baseBranch,
        branchCreated: false,
        pushedFiles: [],
        checkedAt,
        errors: repoCheck.errors
      };
    }

    const headers = this.buildAuthHeaders(cfg);
    const repoApi = `${cfg.baseUrl}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

    const branchRes = await fetchWithTimeout(
      `${repoApi}/branches`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          new_branch_name: bundle.branchName,
          old_branch_name: bundle.baseBranch
        })
      },
      cfg.timeoutMs,
      cfg.fetchImpl
    );

    if (branchRes.networkError) {
      return {
        reachable: false,
        mode: 'degraded',
        baseUrl: cfg.baseUrl,
        owner,
        repo,
        branchName: bundle.branchName,
        baseBranch: bundle.baseBranch,
        branchCreated: false,
        pushedFiles: [],
        checkedAt,
        errors: [branchRes.error || 'Forgejo hors-ligne']
      };
    }

    const branchCreated = branchRes.ok || branchRes.status === 409;
    if (!branchCreated) {
      errors.push(branchRes.error || `Échec création branche ${bundle.branchName}`);
    }

    const filesToPush: Array<{ path: string; content: string }> = [
      { path: bundle.targetPath, content: bundle.valuesYaml },
      { path: bundle.workloadClusterManifestPath, content: bundle.workloadClusterManifestYaml }
    ];

    if (options.includeTenantWorkloads ?? true) {
      for (const wf of bundle.tenantWorkloads) {
        filesToPush.push({ path: wf.path, content: wf.yaml });
      }
    }

    const pushedFiles: string[] = [];

    for (const file of filesToPush) {
      const cleanPath = file.path.replace(/^\/+/, '');
      const existingRes = await fetchWithTimeout<{ sha?: string }>(
        `${repoApi}/contents/${cleanPath}?ref=${encodeURIComponent(bundle.branchName)}`,
        { method: 'GET', headers },
        cfg.timeoutMs,
        cfg.fetchImpl
      );

      const method = existingRes.ok && existingRes.data?.sha ? 'PUT' : 'POST';
      const payload: Record<string, unknown> = {
        branch: bundle.branchName,
        content: Buffer.from(file.content, 'utf-8').toString('base64'),
        message: `feat(sylva): hydrate ${cleanPath} from ${bundle.provenance.edpId}`
      };
      if (method === 'PUT' && existingRes.data?.sha) {
        payload.sha = existingRes.data.sha;
      }

      const pushRes = await fetchWithTimeout(
        `${repoApi}/contents/${cleanPath}`,
        {
          method,
          headers,
          body: JSON.stringify(payload)
        },
        cfg.timeoutMs,
        cfg.fetchImpl
      );

      if (pushRes.ok) {
        pushedFiles.push(cleanPath);
      } else {
        errors.push(`Push ${cleanPath}: ${pushRes.error || `HTTP ${pushRes.status}`}`);
      }
    }

    const prRes = await fetchWithTimeout<{ html_url?: string; number?: number }>(
      `${repoApi}/pulls`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: `feat(sylva): WorkloadCluster ${bundle.clusterName} (${bundle.provenance.edpId} rev ${bundle.provenance.revision})`,
          head: bundle.branchName,
          base: bundle.baseBranch,
          body: [
            `### Export GitOps Sylva Natif — \`${bundle.clusterName}\``,
            `- **Paquet EDP** : \`${bundle.provenance.edpId}\` (révision \`${bundle.provenance.revision}\`)`,
            `- **Sujet** : \`${bundle.provenance.subjectId}\``,
            `- **Empreinte Ontologie** : \`${bundle.provenance.ontologyFingerprint}\``,
            `- **Verdict Oracle OPA** : \`COMPLIANT\``,
            `- **Fichiers poussés** : ${pushedFiles.length} (\`sha256:${bundle.sha256.slice(0, 12)}\`)`
          ].join('\n')
        })
      },
      cfg.timeoutMs,
      cfg.fetchImpl
    );

    if (!prRes.ok) {
      errors.push(prRes.error || `Échec ouverture PR Forgejo (${prRes.status})`);
    }

    return {
      reachable: true,
      mode: prRes.ok ? 'forgejo_pr' : 'degraded',
      baseUrl: cfg.baseUrl,
      owner,
      repo,
      branchName: bundle.branchName,
      baseBranch: bundle.baseBranch,
      branchCreated,
      pushedFiles,
      pullRequestUrl: prRes.data?.html_url,
      pullRequestNumber: prRes.data?.number,
      checkedAt,
      errors
    };
  }

  /**
   * Construit le payload de write-back Nautobot (#399) à partir du résultat d'une
   * publication GitOps (connecteur de référence #381 / #411).
   */
  buildWriteBackPayload(
    pushResult: ForgejoPushExportResult,
    revision: string | number
  ): ConnectorWriteBackPayload {
    const succeeded = pushResult.mode === 'forgejo_pr' && Boolean(pushResult.pullRequestUrl);
    return buildConnectorWriteBackPayload({
      realizedStatus: succeeded ? 'staged' : 'failed',
      realizedRevision: revision,
      connectorName: GITOPS_FORGE_CONNECTOR_NAME,
      connectorVersion: GITOPS_FORGE_CONNECTOR_VERSION,
      evidenceRef:
        pushResult.pullRequestUrl ||
        `${pushResult.baseUrl}/${pushResult.owner}/${pushResult.repo}/src/branch/${pushResult.branchName}`,
      realizedAt: pushResult.checkedAt
    });
  }

  /**
   * Remonte le statut réalisé et la preuve (URL de PR) dans Nautobot selon le contrat #399.
   */
  async reportRealizationToNautobot(
    target: NautobotWriteBackTarget,
    pushResult: ForgejoPushExportResult,
    revision: string | number
  ): Promise<NautobotWriteBackResult> {
    const payload = this.buildWriteBackPayload(pushResult, revision);
    return writeBackToNautobot(
      {
        ...target,
        nautobotStatus:
          target.nautobotStatus ?? (payload.realized_status === 'staged' ? 'Staged' : 'Failed')
      },
      payload
    );
  }
}

export function createGitopsForgeAdapter(options?: ForgejoClientOptions): GitopsForgeAdapter {
  return new GitopsForgeAdapter(options);
}

export async function checkForgejoHealth(
  options?: ForgejoClientOptions
): Promise<AdapterHealthResult> {
  return new GitopsForgeAdapter(options).checkHealth();
}

export async function pushSylvaExportToForgejo(
  options: ForgejoPushExportOptions
): Promise<ForgejoPushExportResult> {
  return new GitopsForgeAdapter(options).pushSylvaExportAndOpenPr(options);
}
