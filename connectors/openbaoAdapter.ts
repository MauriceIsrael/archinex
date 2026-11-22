import {
  fetchWithTimeout,
  sanitizeBaseUrl,
  type AdapterHealthResult,
  type AdapterMode,
  type BaseAdapterOptions
} from './adapterTypes.js';

export const DEFAULT_OPENBAO_URL = process.env.OPENBAO_URL || 'http://127.0.0.1:8200';
export const DEFAULT_OPENBAO_TOKEN = process.env.OPENBAO_TOKEN || 'archinex-bao-dev-token';

export interface OpenBaoClientOptions extends BaseAdapterOptions {
  token?: string;
}

export interface OpenBaoKvPathSpec {
  path: string;
  requiredKeys?: string[];
  seedData?: Record<string, string>;
  provision?: boolean;
}

export interface OpenBaoKvOptions extends OpenBaoClientOptions {
  mount?: string;
  paths: OpenBaoKvPathSpec[];
  provision?: boolean;
}

export interface OpenBaoKvPathStatus {
  path: string;
  exists: boolean;
  provisioned: boolean;
  missingKeys: string[];
  version?: number;
}

export interface OpenBaoKvResult {
  reachable: boolean;
  mode: AdapterMode;
  baseUrl: string;
  mount: string;
  mountReady: boolean;
  paths: OpenBaoKvPathStatus[];
  compliant: boolean;
  checkedAt: string;
  errors: string[];
}

export interface OpenBaoPkiRoleSpec {
  name: string;
  allowedDomains: string[];
  allowSubdomains?: boolean;
  maxTtl?: string;
  keyType?: 'rsa' | 'ec' | 'ed25519';
  provision?: boolean;
}

export interface OpenBaoPkiOptions extends OpenBaoClientOptions {
  mount?: string;
  roles: OpenBaoPkiRoleSpec[];
  provision?: boolean;
}

export interface OpenBaoPkiRoleStatus {
  name: string;
  exists: boolean;
  provisioned: boolean;
  allowedDomains: string[];
}

export interface OpenBaoPkiResult {
  reachable: boolean;
  mode: AdapterMode;
  baseUrl: string;
  mount: string;
  mountReady: boolean;
  roles: OpenBaoPkiRoleStatus[];
  compliant: boolean;
  checkedAt: string;
  errors: string[];
}

export interface OpenBaoPort {
  checkHealth(options?: OpenBaoClientOptions): Promise<AdapterHealthResult>;
  ensureKvPaths(options: OpenBaoKvOptions): Promise<OpenBaoKvResult>;
  ensurePkiRoles(options: OpenBaoPkiOptions): Promise<OpenBaoPkiResult>;
}

function normalizeMount(mount: string | undefined, fallback: string): string {
  return String(mount || fallback).replace(/^\/+|\/+$/g, '');
}

/**
 * Adaptateur OpenBao (Port/Adapter) pour la validation et le provisionnement
 * des chemins KV v2 et des rôles PKI X.509 via l'API HTTP v1.
 */
export class OpenBaoAdapter implements OpenBaoPort {
  private readonly defaultOptions: OpenBaoClientOptions;

  constructor(defaultOptions: OpenBaoClientOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  private resolveConfig(override?: OpenBaoClientOptions) {
    return {
      baseUrl: sanitizeBaseUrl(override?.baseUrl || this.defaultOptions.baseUrl || DEFAULT_OPENBAO_URL),
      token: override?.token ?? this.defaultOptions.token ?? DEFAULT_OPENBAO_TOKEN,
      timeoutMs: override?.timeoutMs ?? this.defaultOptions.timeoutMs ?? 5000,
      fetchImpl: override?.fetchImpl ?? this.defaultOptions.fetchImpl
    };
  }

  private authHeaders(token: string): Record<string, string> {
    return {
      'X-Vault-Token': token,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
  }

  private async ensureMount(
    baseUrl: string,
    token: string,
    mount: string,
    type: 'kv' | 'pki',
    provision: boolean,
    timeoutMs: number,
    fetchImpl?: typeof fetch
  ): Promise<{ reachable: boolean; ready: boolean; error?: string }> {
    const mountsRes = await fetchWithTimeout<Record<string, unknown>>(
      `${baseUrl}/v1/sys/mounts`,
      { method: 'GET', headers: this.authHeaders(token) },
      timeoutMs,
      fetchImpl
    );

    if (mountsRes.networkError) {
      return { reachable: false, ready: false, error: mountsRes.error };
    }
    if (!mountsRes.ok) {
      return { reachable: true, ready: false, error: mountsRes.error };
    }

    const mounts = (mountsRes.data as { data?: Record<string, unknown> })?.data || mountsRes.data || {};
    if (Object.prototype.hasOwnProperty.call(mounts, `${mount}/`)) {
      return { reachable: true, ready: true };
    }

    if (!provision) {
      return { reachable: true, ready: false, error: `Montage ${type} '${mount}/' absent` };
    }

    const body =
      type === 'kv'
        ? { type: 'kv', options: { version: '2' } }
        : { type: 'pki' };

    const createRes = await fetchWithTimeout(
      `${baseUrl}/v1/sys/mounts/${encodeURIComponent(mount)}`,
      {
        method: 'POST',
        headers: this.authHeaders(token),
        body: JSON.stringify(body)
      },
      timeoutMs,
      fetchImpl
    );

    if (createRes.networkError) {
      return { reachable: false, ready: false, error: createRes.error };
    }

    return {
      reachable: true,
      ready: createRes.ok,
      error: createRes.ok ? undefined : createRes.error
    };
  }

  async checkHealth(options?: OpenBaoClientOptions): Promise<AdapterHealthResult> {
    const { baseUrl, timeoutMs, fetchImpl } = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();

    const res = await fetchWithTimeout<{ version?: string; sealed?: boolean; initialized?: boolean }>(
      `${baseUrl}/v1/sys/health`,
      { method: 'GET', headers: { Accept: 'application/json' } },
      timeoutMs,
      fetchImpl
    );

    if (res.networkError) {
      return {
        service: 'openbao',
        reachable: false,
        mode: 'degraded',
        baseUrl,
        checkedAt,
        errors: [res.error || 'OpenBao injoignable']
      };
    }

    // OpenBao /v1/sys/health retourne 200 (active), 429 (standby), 472/473/501/503 selon état
    const isReachable = res.status > 0;
    const isHealthy = res.ok && !res.data?.sealed;

    return {
      service: 'openbao',
      reachable: isReachable,
      mode: isHealthy ? 'live' : 'degraded',
      baseUrl,
      version: res.data?.version,
      checkedAt,
      errors: isHealthy ? [] : [res.error || (res.data?.sealed ? 'OpenBao scellé (sealed)' : `HTTP ${res.status}`)]
    };
  }

  async ensureKvPaths(options: OpenBaoKvOptions): Promise<OpenBaoKvResult> {
    const { baseUrl, token, timeoutMs, fetchImpl } = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();
    const mount = normalizeMount(options.mount, 'secret');
    const provisionDefault = options.provision ?? false;
    const errors: string[] = [];

    const mountCheck = await this.ensureMount(
      baseUrl,
      token,
      mount,
      'kv',
      provisionDefault,
      timeoutMs,
      fetchImpl
    );

    if (!mountCheck.reachable) {
      return {
        reachable: false,
        mode: 'degraded',
        baseUrl,
        mount,
        mountReady: false,
        paths: [],
        compliant: false,
        checkedAt,
        errors: [mountCheck.error || 'OpenBao hors-ligne']
      };
    }

    if (mountCheck.error) {
      errors.push(mountCheck.error);
    }

    const statuses: OpenBaoKvPathStatus[] = [];

    for (const spec of options.paths) {
      const cleanPath = spec.path.replace(/^\/+|\/+$/g, '');
      const readRes = await fetchWithTimeout<{
        data?: { data?: Record<string, unknown>; metadata?: { version?: number } };
      }>(
        `${baseUrl}/v1/${encodeURIComponent(mount)}/data/${cleanPath}`,
        { method: 'GET', headers: this.authHeaders(token) },
        timeoutMs,
        fetchImpl
      );

      if (readRes.networkError) {
        return {
          reachable: false,
          mode: 'degraded',
          baseUrl,
          mount,
          mountReady: mountCheck.ready,
          paths: statuses,
          compliant: false,
          checkedAt,
          errors: [readRes.error || 'OpenBao hors-ligne']
        };
      }

      const existingData = readRes.data?.data?.data || {};
      const exists = readRes.ok && Boolean(readRes.data?.data);
      const missingKeys = (spec.requiredKeys || []).filter(
        (k) => !Object.prototype.hasOwnProperty.call(existingData, k)
      );

      let provisioned = false;
      let finalExists = exists;
      let finalMissing = missingKeys;
      let version = readRes.data?.data?.metadata?.version;

      const shouldProvision = (spec.provision ?? provisionDefault) && (!exists || missingKeys.length > 0);
      if (shouldProvision && spec.seedData && Object.keys(spec.seedData).length > 0) {
        const merged = { ...existingData, ...spec.seedData };
        const writeRes = await fetchWithTimeout<{ data?: { version?: number } }>(
          `${baseUrl}/v1/${encodeURIComponent(mount)}/data/${cleanPath}`,
          {
            method: 'POST',
            headers: this.authHeaders(token),
            body: JSON.stringify({ data: merged })
          },
          timeoutMs,
          fetchImpl
        );
        if (writeRes.ok) {
          provisioned = true;
          finalExists = true;
          finalMissing = (spec.requiredKeys || []).filter(
            (k) => !Object.prototype.hasOwnProperty.call(merged, k)
          );
          version = writeRes.data?.data?.version ?? version;
        } else {
          errors.push(`KV ${cleanPath}: ${writeRes.error || `HTTP ${writeRes.status}`}`);
        }
      }

      statuses.push({
        path: cleanPath,
        exists: finalExists,
        provisioned,
        missingKeys: finalMissing,
        version
      });
    }

    const compliant =
      mountCheck.ready && statuses.every((s) => s.exists && s.missingKeys.length === 0);

    return {
      reachable: true,
      mode: 'live',
      baseUrl,
      mount,
      mountReady: mountCheck.ready,
      paths: statuses,
      compliant,
      checkedAt,
      errors
    };
  }

  async ensurePkiRoles(options: OpenBaoPkiOptions): Promise<OpenBaoPkiResult> {
    const { baseUrl, token, timeoutMs, fetchImpl } = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();
    const mount = normalizeMount(options.mount, 'pki');
    const provisionDefault = options.provision ?? false;
    const errors: string[] = [];

    const mountCheck = await this.ensureMount(
      baseUrl,
      token,
      mount,
      'pki',
      provisionDefault,
      timeoutMs,
      fetchImpl
    );

    if (!mountCheck.reachable) {
      return {
        reachable: false,
        mode: 'degraded',
        baseUrl,
        mount,
        mountReady: false,
        roles: [],
        compliant: false,
        checkedAt,
        errors: [mountCheck.error || 'OpenBao hors-ligne']
      };
    }

    if (mountCheck.error) {
      errors.push(mountCheck.error);
    }

    const roleStatuses: OpenBaoPkiRoleStatus[] = [];

    for (const role of options.roles) {
      const readRes = await fetchWithTimeout<{
        data?: { allowed_domains?: string[] };
      }>(
        `${baseUrl}/v1/${encodeURIComponent(mount)}/roles/${encodeURIComponent(role.name)}`,
        { method: 'GET', headers: this.authHeaders(token) },
        timeoutMs,
        fetchImpl
      );

      if (readRes.networkError) {
        return {
          reachable: false,
          mode: 'degraded',
          baseUrl,
          mount,
          mountReady: mountCheck.ready,
          roles: roleStatuses,
          compliant: false,
          checkedAt,
          errors: [readRes.error || 'OpenBao hors-ligne']
        };
      }

      let exists = readRes.ok;
      let provisioned = false;
      let allowedDomains = readRes.data?.data?.allowed_domains || [];

      const shouldProvision = (role.provision ?? provisionDefault) && !exists;
      if (shouldProvision) {
        const writeRes = await fetchWithTimeout(
          `${baseUrl}/v1/${encodeURIComponent(mount)}/roles/${encodeURIComponent(role.name)}`,
          {
            method: 'POST',
            headers: this.authHeaders(token),
            body: JSON.stringify({
              allowed_domains: role.allowedDomains,
              allow_subdomains: role.allowSubdomains ?? true,
              max_ttl: role.maxTtl || '720h',
              key_type: role.keyType || 'ec'
            })
          },
          timeoutMs,
          fetchImpl
        );
        if (writeRes.ok) {
          exists = true;
          provisioned = true;
          allowedDomains = role.allowedDomains;
        } else {
          errors.push(`PKI role ${role.name}: ${writeRes.error || `HTTP ${writeRes.status}`}`);
        }
      }

      roleStatuses.push({
        name: role.name,
        exists,
        provisioned,
        allowedDomains
      });
    }

    const compliant = mountCheck.ready && roleStatuses.every((r) => r.exists);

    return {
      reachable: true,
      mode: 'live',
      baseUrl,
      mount,
      mountReady: mountCheck.ready,
      roles: roleStatuses,
      compliant,
      checkedAt,
      errors
    };
  }
}

export function createOpenBaoAdapter(options?: OpenBaoClientOptions): OpenBaoAdapter {
  return new OpenBaoAdapter(options);
}

export async function checkOpenBaoHealth(
  options?: OpenBaoClientOptions
): Promise<AdapterHealthResult> {
  return new OpenBaoAdapter(options).checkHealth();
}

export async function validateOrProvisionOpenBaoKv(
  options: OpenBaoKvOptions
): Promise<OpenBaoKvResult> {
  return new OpenBaoAdapter(options).ensureKvPaths(options);
}

export async function validateOrProvisionOpenBaoPki(
  options: OpenBaoPkiOptions
): Promise<OpenBaoPkiResult> {
  return new OpenBaoAdapter(options).ensurePkiRoles(options);
}
