import {
  fetchWithTimeout,
  sanitizeBaseUrl,
  type AdapterHealthResult,
  type AdapterMode,
  type BaseAdapterOptions
} from './adapterTypes.js';

export const DEFAULT_BATFISH_URL = process.env.BATFISH_URL || 'http://127.0.0.1:9997';

export interface BatfishClientOptions extends BaseAdapterOptions {}

export interface BatfishSnapshotOptions extends BatfishClientOptions {
  networkName: string;
  snapshotName: string;
  /** Map chemin relatif -> contenu texte des configurations réseau (FRR, BGP, ACL, iptables, Cilium, etc.) */
  configs?: Record<string, string>;
}

export interface BatfishSnapshotResult {
  reachable: boolean;
  mode: AdapterMode;
  baseUrl: string;
  networkName: string;
  snapshotName: string;
  submittedFilesCount: number;
  created: boolean;
  checkedAt: string;
  errors: string[];
}

export type BatfishFlowExpected = 'permit' | 'deny';

export interface BatfishReachabilityAssertion {
  id: string;
  description?: string;
  sourceIps: string;
  destinationIps: string;
  protocol?: 'tcp' | 'udp' | 'sctp' | 'icmp' | 'any';
  dstPorts?: string;
  vrf?: string;
  filterName?: string;
  expected: BatfishFlowExpected;
}

export interface BatfishAssertionEvaluation {
  id: string;
  description?: string;
  expected: BatfishFlowExpected;
  observedDisposition: string;
  passed: boolean;
  details?: string;
}

export interface BatfishVerifyOptions extends BatfishClientOptions {
  networkName: string;
  snapshotName: string;
  assertions: BatfishReachabilityAssertion[];
}

export interface BatfishVerificationResult {
  reachable: boolean;
  mode: AdapterMode;
  baseUrl: string;
  networkName: string;
  snapshotName: string;
  verdict: 'compliant' | 'violated' | 'unavailable';
  assertions: BatfishAssertionEvaluation[];
  violationsCount: number;
  checkedAt: string;
  errors: string[];
}

export interface BatfishPort {
  checkHealth(options?: BatfishClientOptions): Promise<AdapterHealthResult>;
  submitSnapshot(options: BatfishSnapshotOptions): Promise<BatfishSnapshotResult>;
  verifyReachabilityAndAcls(options: BatfishVerifyOptions): Promise<BatfishVerificationResult>;
}

const PERMIT_DISPOSITIONS = new Set([
  'ACCEPTED',
  'DELIVERED_TO_SUBNET',
  'EXITS_NETWORK'
]);

const DENY_DISPOSITIONS = new Set([
  'DENIED_IN',
  'DENIED_OUT',
  'NO_ROUTE',
  'NULL_ROUTED',
  'INSUFFICIENT_INFO'
]);

function evaluateFlowDisposition(
  disposition: string,
  expected: BatfishFlowExpected
): boolean {
  const norm = String(disposition || '').toUpperCase();
  if (expected === 'permit') {
    return PERMIT_DISPOSITIONS.has(norm);
  }
  return DENY_DISPOSITIONS.has(norm) || !PERMIT_DISPOSITIONS.has(norm);
}

/**
 * Adaptateur Batfish (Port/Adapter) pour la soumission de snapshots réseau
 * et la vérification d'atteignabilité / ACL via l'API HTTP Coordinator v2.
 */
export class BatfishAdapter implements BatfishPort {
  private readonly defaultOptions: BatfishClientOptions;

  constructor(defaultOptions: BatfishClientOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  private resolveConfig(override?: BatfishClientOptions) {
    return {
      baseUrl: sanitizeBaseUrl(override?.baseUrl || this.defaultOptions.baseUrl || DEFAULT_BATFISH_URL),
      timeoutMs: override?.timeoutMs ?? this.defaultOptions.timeoutMs ?? 5000,
      fetchImpl: override?.fetchImpl ?? this.defaultOptions.fetchImpl
    };
  }

  async checkHealth(options?: BatfishClientOptions): Promise<AdapterHealthResult> {
    const { baseUrl, timeoutMs, fetchImpl } = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();

    const versionRes = await fetchWithTimeout<{ version?: string }>(
      `${baseUrl}/v2/version`,
      { method: 'GET', headers: { Accept: 'application/json' } },
      timeoutMs,
      fetchImpl
    );

    if (versionRes.ok) {
      return {
        service: 'batfish',
        reachable: true,
        mode: 'live',
        baseUrl,
        version: versionRes.data?.version || versionRes.text || 'v2',
        checkedAt,
        errors: []
      };
    }

    // Certains déploiements Batfish exposent /v2/networks sans /v2/version
    if (!versionRes.networkError && versionRes.status === 404) {
      const networksRes = await fetchWithTimeout<unknown>(
        `${baseUrl}/v2/networks`,
        { method: 'GET', headers: { Accept: 'application/json' } },
        timeoutMs,
        fetchImpl
      );
      if (networksRes.ok) {
        return {
          service: 'batfish',
          reachable: true,
          mode: 'live',
          baseUrl,
          version: 'v2',
          checkedAt,
          errors: []
        };
      }
    }

    return {
      service: 'batfish',
      reachable: false,
      mode: 'degraded',
      baseUrl,
      checkedAt,
      errors: [versionRes.error || 'Batfish injoignable']
    };
  }

  async submitSnapshot(options: BatfishSnapshotOptions): Promise<BatfishSnapshotResult> {
    const { baseUrl, timeoutMs, fetchImpl } = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();
    const errors: string[] = [];
    const configs = options.configs || {};
    const submittedFilesCount = Object.keys(configs).length;

    const netRes = await fetchWithTimeout(
      `${baseUrl}/v2/networks/${encodeURIComponent(options.networkName)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: options.networkName })
      },
      timeoutMs,
      fetchImpl
    );

    if (netRes.networkError) {
      return {
        reachable: false,
        mode: 'degraded',
        baseUrl,
        networkName: options.networkName,
        snapshotName: options.snapshotName,
        submittedFilesCount: 0,
        created: false,
        checkedAt,
        errors: [netRes.error || 'Batfish hors-ligne']
      };
    }

    if (!netRes.ok && netRes.status !== 409) {
      errors.push(netRes.error || `Échec création réseau Batfish (${netRes.status})`);
      return {
        reachable: true,
        mode: 'degraded',
        baseUrl,
        networkName: options.networkName,
        snapshotName: options.snapshotName,
        submittedFilesCount: 0,
        created: false,
        checkedAt,
        errors
      };
    }

    const snapRes = await fetchWithTimeout(
      `${baseUrl}/v2/networks/${encodeURIComponent(options.networkName)}/snapshots/${encodeURIComponent(options.snapshotName)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          snapshot: options.snapshotName,
          configs
        })
      },
      timeoutMs,
      fetchImpl
    );

    if (snapRes.networkError) {
      return {
        reachable: false,
        mode: 'degraded',
        baseUrl,
        networkName: options.networkName,
        snapshotName: options.snapshotName,
        submittedFilesCount: 0,
        created: false,
        checkedAt,
        errors: [snapRes.error || 'Batfish hors-ligne']
      };
    }

    if (!snapRes.ok) {
      errors.push(snapRes.error || `Échec soumission snapshot (${snapRes.status})`);
    }

    return {
      reachable: true,
      mode: snapRes.ok ? 'live' : 'degraded',
      baseUrl,
      networkName: options.networkName,
      snapshotName: options.snapshotName,
      submittedFilesCount: snapRes.ok ? submittedFilesCount : 0,
      created: snapRes.ok,
      checkedAt,
      errors
    };
  }

  async verifyReachabilityAndAcls(
    options: BatfishVerifyOptions
  ): Promise<BatfishVerificationResult> {
    const { baseUrl, timeoutMs, fetchImpl } = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();
    const errors: string[] = [];
    const evaluations: BatfishAssertionEvaluation[] = [];

    for (const assertion of options.assertions) {
      const endpoint = assertion.filterName
        ? `${baseUrl}/v2/networks/${encodeURIComponent(options.networkName)}/snapshots/${encodeURIComponent(options.snapshotName)}/questions/filterLineReachability`
        : `${baseUrl}/v2/networks/${encodeURIComponent(options.networkName)}/snapshots/${encodeURIComponent(options.snapshotName)}/questions/reachability`;

      const queryBody = {
        headers: {
          srcIps: assertion.sourceIps,
          dstIps: assertion.destinationIps,
          ipProtocols: assertion.protocol && assertion.protocol !== 'any' ? [assertion.protocol.toUpperCase()] : undefined,
          dstPorts: assertion.dstPorts
        },
        vrf: assertion.vrf,
        filters: assertion.filterName
      };

      const res = await fetchWithTimeout<{
        answerElements?: Array<{
          rows?: Array<{
            Flow?: unknown;
            Traces?: Array<{ disposition?: string }>;
            disposition?: string;
            Action?: string;
          }>;
        }>;
        disposition?: string;
      }>(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(queryBody)
        },
        timeoutMs,
        fetchImpl
      );

      if (res.networkError) {
        return {
          reachable: false,
          mode: 'degraded',
          baseUrl,
          networkName: options.networkName,
          snapshotName: options.snapshotName,
          verdict: 'unavailable',
          assertions: [],
          violationsCount: 0,
          checkedAt,
          errors: [res.error || 'Batfish hors-ligne']
        };
      }

      if (!res.ok) {
        errors.push(`Assertion ${assertion.id}: ${res.error || `HTTP ${res.status}`}`);
        evaluations.push({
          id: assertion.id,
          description: assertion.description,
          expected: assertion.expected,
          observedDisposition: 'ERROR',
          passed: false,
          details: res.error
        });
        continue;
      }

      const rows = res.data?.answerElements?.[0]?.rows || [];
      const firstTraceDisposition = rows[0]?.Traces?.[0]?.disposition || rows[0]?.disposition;
      const rawDisposition =
        firstTraceDisposition ||
        res.data?.disposition ||
        (rows[0]?.Action ? String(rows[0].Action).toUpperCase() : undefined) ||
        (rows.length === 0 ? 'NO_ROUTE' : 'UNKNOWN');

      const passed = evaluateFlowDisposition(rawDisposition, assertion.expected);
      evaluations.push({
        id: assertion.id,
        description: assertion.description,
        expected: assertion.expected,
        observedDisposition: String(rawDisposition).toUpperCase(),
        passed
      });
    }

    const violationsCount = evaluations.filter((a) => !a.passed).length;
    return {
      reachable: true,
      mode: errors.length > 0 && evaluations.every((e) => e.observedDisposition === 'ERROR') ? 'degraded' : 'live',
      baseUrl,
      networkName: options.networkName,
      snapshotName: options.snapshotName,
      verdict: violationsCount > 0 ? 'violated' : 'compliant',
      assertions: evaluations,
      violationsCount,
      checkedAt,
      errors
    };
  }
}

export function createBatfishAdapter(options?: BatfishClientOptions): BatfishAdapter {
  return new BatfishAdapter(options);
}

export async function checkBatfishHealth(
  options?: BatfishClientOptions
): Promise<AdapterHealthResult> {
  return new BatfishAdapter(options).checkHealth();
}

export async function submitBatfishSnapshot(
  options: BatfishSnapshotOptions
): Promise<BatfishSnapshotResult> {
  return new BatfishAdapter(options).submitSnapshot(options);
}

export async function verifyBatfishReachabilityAndAcls(
  options: BatfishVerifyOptions
): Promise<BatfishVerificationResult> {
  return new BatfishAdapter(options).verifyReachabilityAndAcls(options);
}

/**
 * Construit le bloc `batfish_verification` injectable dans l'entrée OPA (`multi_axis_refinement.rego`).
 */
export function buildBatfishOpaInput(result: BatfishVerificationResult) {
  return {
    reachable: result.reachable,
    mode: result.mode,
    verdict: result.verdict,
    network_name: result.networkName,
    snapshot_name: result.snapshotName,
    violations_count: result.violationsCount,
    failed_assertions: result.assertions
      .filter((a) => !a.passed)
      .map((a) => ({
        id: a.id,
        expected: a.expected,
        observed_disposition: a.observedDisposition,
        description: a.description
      }))
  };
}
