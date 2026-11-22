import {
  fetchWithTimeout,
  sanitizeBaseUrl,
  type AdapterHealthResult,
  type AdapterMode,
  type BaseAdapterOptions
} from './adapterTypes.js';

export const DEFAULT_TECHNITIUM_DNS_URL =
  process.env.TECHNITIUM_DNS_URL || 'http://127.0.0.1:5380';
export const DEFAULT_TECHNITIUM_DNS_USER =
  process.env.TECHNITIUM_DNS_USER || 'admin';
export const DEFAULT_TECHNITIUM_DNS_PASSWORD =
  process.env.TECHNITIUM_DNS_PASSWORD || 'adminpassword';

export interface DdiDnsClientOptions extends BaseAdapterOptions {
  username?: string;
  password?: string;
  token?: string;
}

export interface DdiZonesOptions extends DdiDnsClientOptions {
  zones: string[];
  provision?: boolean;
}

export interface DdiZoneStatus {
  zone: string;
  exists: boolean;
  provisioned: boolean;
}

export interface DdiZonesResult {
  reachable: boolean;
  mode: AdapterMode;
  baseUrl: string;
  zones: DdiZoneStatus[];
  compliant: boolean;
  checkedAt: string;
  errors: string[];
}

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'SRV';

export interface DdiFqdnRecordSpec {
  zone: string;
  fqdn: string;
  type: DnsRecordType;
  value: string;
  ttl?: number;
  provision?: boolean;
}

export interface DdiRecordsOptions extends DdiDnsClientOptions {
  records: DdiFqdnRecordSpec[];
  provision?: boolean;
}

export interface DdiRecordStatus {
  zone: string;
  fqdn: string;
  type: DnsRecordType;
  value: string;
  exists: boolean;
  provisioned: boolean;
}

export interface DdiRecordsResult {
  reachable: boolean;
  mode: AdapterMode;
  baseUrl: string;
  records: DdiRecordStatus[];
  compliant: boolean;
  checkedAt: string;
  errors: string[];
}

export interface DdiDnsPort {
  checkHealth(options?: DdiDnsClientOptions): Promise<AdapterHealthResult>;
  ensureZones(options: DdiZonesOptions): Promise<DdiZonesResult>;
  ensureFqdnRecords(options: DdiRecordsOptions): Promise<DdiRecordsResult>;
}

interface TechnitiumApiEnvelope<T = Record<string, unknown>> {
  status?: 'ok' | 'error' | 'invalid-token';
  errorMessage?: string;
  token?: string;
  response?: T;
}

/**
 * Adaptateur Technitium DNS / DDI (Port/Adapter) pour la vérification et la réservation
 * de zones DNS et d'enregistrements FQDN via l'API REST.
 */
export class DdiDnsAdapter implements DdiDnsPort {
  private readonly defaultOptions: DdiDnsClientOptions;

  constructor(defaultOptions: DdiDnsClientOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  private resolveConfig(override?: DdiDnsClientOptions) {
    return {
      baseUrl: sanitizeBaseUrl(
        override?.baseUrl || this.defaultOptions.baseUrl || DEFAULT_TECHNITIUM_DNS_URL
      ),
      username: override?.username || this.defaultOptions.username || DEFAULT_TECHNITIUM_DNS_USER,
      password: override?.password || this.defaultOptions.password || DEFAULT_TECHNITIUM_DNS_PASSWORD,
      token: override?.token || this.defaultOptions.token || process.env.TECHNITIUM_DNS_TOKEN,
      timeoutMs: override?.timeoutMs ?? this.defaultOptions.timeoutMs ?? 5000,
      fetchImpl: override?.fetchImpl ?? this.defaultOptions.fetchImpl
    };
  }

  private async authenticate(
    cfg: ReturnType<DdiDnsAdapter['resolveConfig']>
  ): Promise<{ reachable: boolean; token?: string; error?: string }> {
    if (cfg.token) {
      return { reachable: true, token: cfg.token };
    }

    const params = new URLSearchParams({
      user: cfg.username,
      pass: cfg.password,
      includeInfo: 'true'
    });

    const res = await fetchWithTimeout<TechnitiumApiEnvelope>(
      `${cfg.baseUrl}/api/user/login?${params.toString()}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
      cfg.timeoutMs,
      cfg.fetchImpl
    );

    if (res.networkError) {
      return { reachable: false, error: res.error };
    }

    if (!res.ok || res.data?.status !== 'ok' || !res.data?.token) {
      return {
        reachable: true,
        error: res.data?.errorMessage || res.error || 'Authentification Technitium DNS refusée'
      };
    }

    return { reachable: true, token: res.data.token };
  }

  async checkHealth(options?: DdiDnsClientOptions): Promise<AdapterHealthResult> {
    const cfg = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();

    const auth = await this.authenticate(cfg);
    if (!auth.reachable) {
      return {
        service: 'technitium-dns',
        reachable: false,
        mode: 'degraded',
        baseUrl: cfg.baseUrl,
        checkedAt,
        errors: [auth.error || 'Technitium DNS injoignable']
      };
    }

    if (!auth.token) {
      return {
        service: 'technitium-dns',
        reachable: true,
        mode: 'degraded',
        baseUrl: cfg.baseUrl,
        checkedAt,
        errors: [auth.error || 'Token Technitium indisponible']
      };
    }

    return {
      service: 'technitium-dns',
      reachable: true,
      mode: 'live',
      baseUrl: cfg.baseUrl,
      version: 'api-v1',
      checkedAt,
      errors: []
    };
  }

  async ensureZones(options: DdiZonesOptions): Promise<DdiZonesResult> {
    const cfg = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();
    const provisionDefault = options.provision ?? false;
    const errors: string[] = [];

    const auth = await this.authenticate(cfg);
    if (!auth.reachable || !auth.token) {
      return {
        reachable: auth.reachable,
        mode: 'degraded',
        baseUrl: cfg.baseUrl,
        zones: [],
        compliant: false,
        checkedAt,
        errors: [auth.error || 'Technitium DNS hors-ligne']
      };
    }

    const listRes = await fetchWithTimeout<
      TechnitiumApiEnvelope<{ zones?: Array<{ name?: string }> }>
    >(
      `${cfg.baseUrl}/api/zones/list?token=${encodeURIComponent(auth.token)}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
      cfg.timeoutMs,
      cfg.fetchImpl
    );

    if (listRes.networkError) {
      return {
        reachable: false,
        mode: 'degraded',
        baseUrl: cfg.baseUrl,
        zones: [],
        compliant: false,
        checkedAt,
        errors: [listRes.error || 'Technitium DNS hors-ligne']
      };
    }

    const existingZones = new Set(
      (listRes.data?.response?.zones || []).map((z) => String(z.name || '').toLowerCase())
    );

    const statuses: DdiZoneStatus[] = [];

    for (const zone of options.zones) {
      const normZone = zone.toLowerCase().replace(/\.+$/, '');
      let exists = existingZones.has(normZone);
      let provisioned = false;

      if (!exists && provisionDefault) {
        const createParams = new URLSearchParams({
          token: auth.token,
          zone: normZone,
          type: 'Primary'
        });
        const createRes = await fetchWithTimeout<TechnitiumApiEnvelope>(
          `${cfg.baseUrl}/api/zones/create?${createParams.toString()}`,
          { method: 'GET', headers: { Accept: 'application/json' } },
          cfg.timeoutMs,
          cfg.fetchImpl
        );
        if (createRes.ok && createRes.data?.status === 'ok') {
          exists = true;
          provisioned = true;
        } else {
          errors.push(
            `Zone ${normZone}: ${createRes.data?.errorMessage || createRes.error || 'Échec création'}`
          );
        }
      }

      statuses.push({ zone: normZone, exists, provisioned });
    }

    return {
      reachable: true,
      mode: 'live',
      baseUrl: cfg.baseUrl,
      zones: statuses,
      compliant: statuses.every((z) => z.exists),
      checkedAt,
      errors
    };
  }

  async ensureFqdnRecords(options: DdiRecordsOptions): Promise<DdiRecordsResult> {
    const cfg = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();
    const provisionDefault = options.provision ?? false;
    const errors: string[] = [];

    const auth = await this.authenticate(cfg);
    if (!auth.reachable || !auth.token) {
      return {
        reachable: auth.reachable,
        mode: 'degraded',
        baseUrl: cfg.baseUrl,
        records: [],
        compliant: false,
        checkedAt,
        errors: [auth.error || 'Technitium DNS hors-ligne']
      };
    }

    const recordStatuses: DdiRecordStatus[] = [];

    for (const spec of options.records) {
      const getParams = new URLSearchParams({
        token: auth.token,
        domain: spec.fqdn,
        zone: spec.zone,
        listZone: 'false'
      });

      const getRes = await fetchWithTimeout<
        TechnitiumApiEnvelope<{
          records?: Array<{
            name?: string;
            type?: string;
            rData?: { ipAddress?: string; cname?: string; text?: string; target?: string };
          }>;
        }>
      >(
        `${cfg.baseUrl}/api/zones/records/get?${getParams.toString()}`,
        { method: 'GET', headers: { Accept: 'application/json' } },
        cfg.timeoutMs,
        cfg.fetchImpl
      );

      if (getRes.networkError) {
        return {
          reachable: false,
          mode: 'degraded',
          baseUrl: cfg.baseUrl,
          records: recordStatuses,
          compliant: false,
          checkedAt,
          errors: [getRes.error || 'Technitium DNS hors-ligne']
        };
      }

      const existing = getRes.data?.response?.records || [];
      let exists =
        getRes.ok &&
        getRes.data?.status === 'ok' &&
        existing.some((r) => {
          if (String(r.type || '').toUpperCase() !== spec.type) return false;
          const observedVal =
            r.rData?.ipAddress || r.rData?.cname || r.rData?.text || r.rData?.target;
          return !observedVal || observedVal === spec.value;
        });

      let provisioned = false;
      const shouldProvision = (spec.provision ?? provisionDefault) && !exists;

      if (shouldProvision) {
        const addParams = new URLSearchParams({
          token: auth.token,
          domain: spec.fqdn,
          zone: spec.zone,
          type: spec.type,
          ttl: String(spec.ttl ?? 300)
        });
        if (spec.type === 'A' || spec.type === 'AAAA') {
          addParams.set('ipAddress', spec.value);
        } else if (spec.type === 'CNAME') {
          addParams.set('cname', spec.value);
        } else if (spec.type === 'TXT') {
          addParams.set('text', spec.value);
        } else if (spec.type === 'SRV') {
          addParams.set('target', spec.value);
        }

        const addRes = await fetchWithTimeout<TechnitiumApiEnvelope>(
          `${cfg.baseUrl}/api/zones/records/add?${addParams.toString()}`,
          { method: 'GET', headers: { Accept: 'application/json' } },
          cfg.timeoutMs,
          cfg.fetchImpl
        );

        if (addRes.ok && addRes.data?.status === 'ok') {
          exists = true;
          provisioned = true;
        } else {
          errors.push(
            `Record ${spec.fqdn} (${spec.type}): ${addRes.data?.errorMessage || addRes.error || 'Échec ajout'}`
          );
        }
      }

      recordStatuses.push({
        zone: spec.zone,
        fqdn: spec.fqdn,
        type: spec.type,
        value: spec.value,
        exists,
        provisioned
      });
    }

    return {
      reachable: true,
      mode: 'live',
      baseUrl: cfg.baseUrl,
      records: recordStatuses,
      compliant: recordStatuses.every((r) => r.exists),
      checkedAt,
      errors
    };
  }
}

export function createDdiDnsAdapter(options?: DdiDnsClientOptions): DdiDnsAdapter {
  return new DdiDnsAdapter(options);
}

export async function checkDdiDnsHealth(
  options?: DdiDnsClientOptions
): Promise<AdapterHealthResult> {
  return new DdiDnsAdapter(options).checkHealth();
}

export async function validateOrProvisionDnsZones(
  options: DdiZonesOptions
): Promise<DdiZonesResult> {
  return new DdiDnsAdapter(options).ensureZones(options);
}

export async function validateOrProvisionFqdnRecords(
  options: DdiRecordsOptions
): Promise<DdiRecordsResult> {
  return new DdiDnsAdapter(options).ensureFqdnRecords(options);
}
