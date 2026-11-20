import { spawn } from 'node:child_process';
import {
  fetchWithTimeout,
  sanitizeBaseUrl,
  type AdapterHealthResult,
  type AdapterMode,
  type BaseAdapterOptions
} from './adapterTypes.js';

export const DEFAULT_ZOT_URL = process.env.ZOT_URL || 'http://127.0.0.1:5000';
export const DEFAULT_TRIVY_SERVER_URL = process.env.TRIVY_SERVER_URL || 'http://127.0.0.1:4954';

export type TrivySeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export interface OciSupplyChainOptions extends BaseAdapterOptions {
  zotUrl?: string;
  trivyUrl?: string;
  scanRunner?: (args: {
    imageRef: string;
    trivyServerUrl: string;
    timeoutMs: number;
  }) => Promise<{ exitCode: number | null; stdout: string; stderr: string; unavailable?: boolean }>;
}

export interface OciSupplyChainHealthResult {
  reachable: boolean;
  mode: AdapterMode;
  zot: AdapterHealthResult;
  trivy: AdapterHealthResult;
  checkedAt: string;
  errors: string[];
}

export interface OciArtifactVerifyOptions extends OciSupplyChainOptions {
  repository: string;
  reference: string;
  requireSignature?: boolean;
}

export interface OciArtifactVerifyResult {
  reachable: boolean;
  mode: AdapterMode;
  zotUrl: string;
  repository: string;
  reference: string;
  exists: boolean;
  digest?: string;
  signed: boolean;
  signatureMethod?: 'oci_referrers' | 'cosign_tag' | 'none';
  compliant: boolean;
  checkedAt: string;
  errors: string[];
}

export interface TrivyScanOptions extends OciSupplyChainOptions {
  imageRef: string;
  failOnSeverities?: TrivySeverity[];
}

export interface TrivyVulnerabilitySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
  total: number;
}

export interface TrivyScanResult {
  reachable: boolean;
  mode: AdapterMode;
  trivyUrl: string;
  imageRef: string;
  scanStatus: 'pass' | 'fail' | 'unavailable';
  summary: TrivyVulnerabilitySummary;
  passedPolicy: boolean;
  checkedAt: string;
  errors: string[];
}

export interface OciSupplyChainPort {
  checkHealth(options?: OciSupplyChainOptions): Promise<OciSupplyChainHealthResult>;
  verifyArtifactAndSignature(options: OciArtifactVerifyOptions): Promise<OciArtifactVerifyResult>;
  scanArtifactCve(options: TrivyScanOptions): Promise<TrivyScanResult>;
}

function defaultTrivyCliRunner(args: {
  imageRef: string;
  trivyServerUrl: string;
  timeoutMs: number;
}): Promise<{ exitCode: number | null; stdout: string; stderr: string; unavailable?: boolean }> {
  return new Promise((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    let child: ReturnType<typeof spawn>;

    try {
      child = spawn(
        'trivy',
        ['image', '--server', args.trivyServerUrl, '--format', 'json', '--quiet', args.imageRef],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (err: unknown) {
      return resolvePromise({
        exitCode: null,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
        unavailable: true
      });
    }

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, args.timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolvePromise({
        exitCode: null,
        stdout,
        stderr: err.message,
        unavailable: true
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ exitCode: code, stdout, stderr });
    });
  });
}

function summarizeTrivyJson(rawJson: string): TrivyVulnerabilitySummary {
  const summary: TrivyVulnerabilitySummary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
    total: 0
  };

  if (!rawJson.trim()) return summary;

  const parsed = JSON.parse(rawJson) as {
    Results?: Array<{
      Vulnerabilities?: Array<{ Severity?: string }>;
    }>;
  };

  for (const result of parsed.Results || []) {
    for (const vuln of result.Vulnerabilities || []) {
      const sev = String(vuln.Severity || 'UNKNOWN').toUpperCase();
      summary.total += 1;
      if (sev === 'CRITICAL') summary.critical += 1;
      else if (sev === 'HIGH') summary.high += 1;
      else if (sev === 'MEDIUM') summary.medium += 1;
      else if (sev === 'LOW') summary.low += 1;
      else summary.unknown += 1;
    }
  }

  return summary;
}

/**
 * Adaptateur Zot + Trivy (Port/Adapter) pour la vérification d'artefacts OCI,
 * de signatures Cosign / OCI Referrers et le scan CVE via `trivy server`.
 */
export class OciSupplyChainAdapter implements OciSupplyChainPort {
  private readonly defaultOptions: OciSupplyChainOptions;

  constructor(defaultOptions: OciSupplyChainOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  private resolveConfig(override?: OciSupplyChainOptions) {
    return {
      zotUrl: sanitizeBaseUrl(
        override?.zotUrl || override?.baseUrl || this.defaultOptions.zotUrl || DEFAULT_ZOT_URL
      ),
      trivyUrl: sanitizeBaseUrl(
        override?.trivyUrl || this.defaultOptions.trivyUrl || DEFAULT_TRIVY_SERVER_URL
      ),
      timeoutMs: override?.timeoutMs ?? this.defaultOptions.timeoutMs ?? 5000,
      fetchImpl: override?.fetchImpl ?? this.defaultOptions.fetchImpl,
      scanRunner: override?.scanRunner ?? this.defaultOptions.scanRunner ?? defaultTrivyCliRunner
    };
  }

  async checkHealth(options?: OciSupplyChainOptions): Promise<OciSupplyChainHealthResult> {
    const cfg = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();

    const [zotRes, trivyRes] = await Promise.all([
      fetchWithTimeout(
        `${cfg.zotUrl}/v2/`,
        { method: 'GET', headers: { Accept: 'application/json' } },
        cfg.timeoutMs,
        cfg.fetchImpl
      ),
      fetchWithTimeout(
        `${cfg.trivyUrl}/healthz`,
        { method: 'GET' },
        cfg.timeoutMs,
        cfg.fetchImpl
      )
    ]);

    const zotHealth: AdapterHealthResult = {
      service: 'zot',
      reachable: !zotRes.networkError && zotRes.status > 0,
      mode: zotRes.ok ? 'live' : 'degraded',
      baseUrl: cfg.zotUrl,
      version: zotRes.headers?.get('Docker-Distribution-Api-Version') || undefined,
      checkedAt,
      errors: zotRes.ok ? [] : [zotRes.error || 'Zot injoignable']
    };

    const trivyHealth: AdapterHealthResult = {
      service: 'trivy',
      reachable: !trivyRes.networkError && trivyRes.status > 0,
      mode: trivyRes.ok ? 'live' : 'degraded',
      baseUrl: cfg.trivyUrl,
      checkedAt,
      errors: trivyRes.ok ? [] : [trivyRes.error || 'Trivy server injoignable']
    };

    const allReachable = zotHealth.reachable && trivyHealth.reachable;
    const allLive = zotHealth.mode === 'live' && trivyHealth.mode === 'live';

    return {
      reachable: allReachable,
      mode: allLive ? 'live' : 'degraded',
      zot: zotHealth,
      trivy: trivyHealth,
      checkedAt,
      errors: [...zotHealth.errors, ...trivyHealth.errors]
    };
  }

  async verifyArtifactAndSignature(
    options: OciArtifactVerifyOptions
  ): Promise<OciArtifactVerifyResult> {
    const cfg = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();
    const errors: string[] = [];
    const repo = options.repository.replace(/^\/+|\/+$/g, '');

    const manifestHeaders = {
      Accept: [
        'application/vnd.oci.image.manifest.v1+json',
        'application/vnd.oci.image.index.v1+json',
        'application/vnd.docker.distribution.manifest.v2+json'
      ].join(', ')
    };

    const headRes = await fetchWithTimeout(
      `${cfg.zotUrl}/v2/${repo}/manifests/${encodeURIComponent(options.reference)}`,
      { method: 'HEAD', headers: manifestHeaders },
      cfg.timeoutMs,
      cfg.fetchImpl
    );

    if (headRes.networkError) {
      return {
        reachable: false,
        mode: 'degraded',
        zotUrl: cfg.zotUrl,
        repository: repo,
        reference: options.reference,
        exists: false,
        signed: false,
        signatureMethod: 'none',
        compliant: false,
        checkedAt,
        errors: [headRes.error || 'Zot hors-ligne']
      };
    }

    const exists = headRes.ok;
    const digest = headRes.headers?.get('Docker-Content-Digest') || undefined;

    if (!exists) {
      errors.push(`Artefact OCI '${repo}:${options.reference}' absent (${headRes.status})`);
      return {
        reachable: true,
        mode: 'live',
        zotUrl: cfg.zotUrl,
        repository: repo,
        reference: options.reference,
        exists: false,
        signed: false,
        signatureMethod: 'none',
        compliant: false,
        checkedAt,
        errors
      };
    }

    let signed = false;
    let signatureMethod: 'oci_referrers' | 'cosign_tag' | 'none' = 'none';

    if (digest) {
      const refRes = await fetchWithTimeout<{ manifests?: Array<{ artifactType?: string }> }>(
        `${cfg.zotUrl}/v2/${repo}/referrers/${encodeURIComponent(digest)}`,
        { method: 'GET', headers: { Accept: 'application/vnd.oci.image.index.v1+json' } },
        cfg.timeoutMs,
        cfg.fetchImpl
      );

      if (refRes.ok && Array.isArray(refRes.data?.manifests) && refRes.data.manifests.length > 0) {
        signed = true;
        signatureMethod = 'oci_referrers';
      } else {
        const cosignTag = `${digest.replace(':', '-')}.sig`;
        const sigTagRes = await fetchWithTimeout(
          `${cfg.zotUrl}/v2/${repo}/manifests/${encodeURIComponent(cosignTag)}`,
          { method: 'HEAD', headers: manifestHeaders },
          cfg.timeoutMs,
          cfg.fetchImpl
        );
        if (sigTagRes.ok) {
          signed = true;
          signatureMethod = 'cosign_tag';
        }
      }
    }

    const requireSig = options.requireSignature ?? true;
    const compliant = exists && (!requireSig || signed);
    if (requireSig && !signed) {
      errors.push(`Signature Cosign / OCI Referrers absente pour '${repo}:${options.reference}'`);
    }

    return {
      reachable: true,
      mode: 'live',
      zotUrl: cfg.zotUrl,
      repository: repo,
      reference: options.reference,
      exists,
      digest,
      signed,
      signatureMethod,
      compliant,
      checkedAt,
      errors
    };
  }

  async scanArtifactCve(options: TrivyScanOptions): Promise<TrivyScanResult> {
    const cfg = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();
    const failOn = new Set<TrivySeverity>(options.failOnSeverities || ['CRITICAL']);
    const emptySummary: TrivyVulnerabilitySummary = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0,
      total: 0
    };

    const healthRes = await fetchWithTimeout(
      `${cfg.trivyUrl}/healthz`,
      { method: 'GET' },
      cfg.timeoutMs,
      cfg.fetchImpl
    );

    if (healthRes.networkError || !healthRes.ok) {
      return {
        reachable: false,
        mode: 'degraded',
        trivyUrl: cfg.trivyUrl,
        imageRef: options.imageRef,
        scanStatus: 'unavailable',
        summary: emptySummary,
        passedPolicy: false,
        checkedAt,
        errors: [healthRes.error || 'Trivy server hors-ligne']
      };
    }

    const scanExec = await cfg.scanRunner({
      imageRef: options.imageRef,
      trivyServerUrl: cfg.trivyUrl,
      timeoutMs: cfg.timeoutMs
    });

    if (scanExec.unavailable || scanExec.exitCode === null) {
      return {
        reachable: true,
        mode: 'degraded',
        trivyUrl: cfg.trivyUrl,
        imageRef: options.imageRef,
        scanStatus: 'unavailable',
        summary: emptySummary,
        passedPolicy: false,
        checkedAt,
        errors: [scanExec.stderr || 'Binaire CLI trivy indisponible localement']
      };
    }

    if (scanExec.exitCode !== 0) {
      return {
        reachable: true,
        mode: 'degraded',
        trivyUrl: cfg.trivyUrl,
        imageRef: options.imageRef,
        scanStatus: 'unavailable',
        summary: emptySummary,
        passedPolicy: false,
        checkedAt,
        errors: [scanExec.stderr || `Échec scan Trivy (code ${scanExec.exitCode})`]
      };
    }

    let summary: TrivyVulnerabilitySummary;
    try {
      summary = summarizeTrivyJson(scanExec.stdout);
    } catch (err: unknown) {
      return {
        reachable: true,
        mode: 'degraded',
        trivyUrl: cfg.trivyUrl,
        imageRef: options.imageRef,
        scanStatus: 'unavailable',
        summary: emptySummary,
        passedPolicy: false,
        checkedAt,
        errors: [`Sortie JSON Trivy invalide: ${err instanceof Error ? err.message : String(err)}`]
      };
    }

    const hasBlockingVulns =
      (failOn.has('CRITICAL') && summary.critical > 0) ||
      (failOn.has('HIGH') && summary.high > 0) ||
      (failOn.has('MEDIUM') && summary.medium > 0) ||
      (failOn.has('LOW') && summary.low > 0);

    return {
      reachable: true,
      mode: 'live',
      trivyUrl: cfg.trivyUrl,
      imageRef: options.imageRef,
      scanStatus: hasBlockingVulns ? 'fail' : 'pass',
      summary,
      passedPolicy: !hasBlockingVulns,
      checkedAt,
      errors: hasBlockingVulns
        ? [`Vulnérabilités bloquantes détectées (critical=${summary.critical}, high=${summary.high})`]
        : []
    };
  }
}

export function createOciSupplyChainAdapter(
  options?: OciSupplyChainOptions
): OciSupplyChainAdapter {
  return new OciSupplyChainAdapter(options);
}

export async function checkOciSupplyChainHealth(
  options?: OciSupplyChainOptions
): Promise<OciSupplyChainHealthResult> {
  return new OciSupplyChainAdapter(options).checkHealth();
}

export async function verifyOciArtifact(
  options: OciArtifactVerifyOptions
): Promise<OciArtifactVerifyResult> {
  return new OciSupplyChainAdapter(options).verifyArtifactAndSignature(options);
}

export async function scanOciArtifactWithTrivy(
  options: TrivyScanOptions
): Promise<TrivyScanResult> {
  return new OciSupplyChainAdapter(options).scanArtifactCve(options);
}
