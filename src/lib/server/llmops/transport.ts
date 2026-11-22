/**
 * Couche transport & négociation de version du client LLMOps (Knowledge Hub).
 * Gère l'air-gap souverain (réseau local / liste blanche explicite), les délais par opération,
 * le cache mémoire avec déduplication singleflight et la négociation de version de contrat.
 */

import fs from 'node:fs';
import path from 'node:path';

import { ActorAssertionConfigError, actorIdentityHeaders } from './actorAssertion';
import type { LLMOpsHealth, LLMOpsSnapshot } from './types';
import { HubApiError } from '$lib/types/llmops';
import {
	HUB_CONTRACT_VERSION,
	HUB_SUPPORTED_CONTRACT_VERSIONS,
	type HubContractVersionNegotiation
} from './contract/generated-types';

export { HubApiError };
export {
	HUB_CONTRACT_ID,
	HUB_CONTRACT_SPEC_VERSION,
	HUB_CONTRACT_VERSION,
	HUB_SUPPORTED_CONTRACT_VERSIONS,
	type HubContractVersionNegotiation
} from './contract/generated-types';

export interface LLMOpsClientConfig {
	baseUrl?: string;
	authToken?: string;
	defaultEngagement?: string;
	/** Délai uniforme (ms) : prime sur les délais par opération (tests, diagnostic). */
	timeoutMs?: number;
	/** Hôtes autorisés en plus du réseau local (voir LLMOPS_ALLOWED_HOSTS). */
	allowedHosts?: string[];
	/** Durée de rétention du cache en mémoire pour les lectures GET (ms). Défaut : 30 000 ms (0 en test Vitest). */
	cacheTtlMs?: number;
	/** Version de contrat envoyée dans l'en-tête X-Hub-Contract-Version (défaut : HUB_CONTRACT_VERSION). */
	contractVersion?: string;
}

export const LLMOPS_DEFAULT_TIMEOUT_MS = 1500;
export const LLMOPS_GOVERNANCE_TIMEOUT_MS = 15_000;

export const OPERATION_TIMEOUTS: Array<{ method?: string; pattern: RegExp; ms: number }> = [
	{ method: 'POST', pattern: /\/api\/knowledge\/publications$/, ms: 300_000 },
	{ method: 'POST', pattern: /\/api\/knowledge\/candidates\/[^/]+\/promote$/, ms: 300_000 },
	{ method: 'POST', pattern: /\/api\/frameworks\/ingestions\/[^/]+\/apply$/, ms: 300_000 },
	{ method: 'POST', pattern: /\/api\/frameworks\/ingestions$/, ms: 150_000 },
	{ method: 'POST', pattern: /\/api\/knowledge\/(checks\/simulate|candidates\/validate)$/, ms: 30_000 },
	{ method: 'POST', pattern: /\/api\/knowledge\/evals\/[^/]+\/runs$/, ms: 60_000 },
	{ method: 'POST', pattern: /\/api\/knowledge\/candidates$/, ms: 30_000 },
	{ method: 'PATCH', pattern: /\/api\/knowledge\/candidates\/[^/]+$/, ms: 30_000 },
	{ method: 'POST', pattern: /\/api\/knowledge\/similar$/, ms: 30_000 },
	{ method: 'PUT', pattern: /\/api\/knowledge\/embeddings$/, ms: 60_000 },
	{ method: 'POST', pattern: /\/api\/knowledge\/reuse-confirmations$/, ms: 15_000 },
	{ method: 'POST', pattern: /\/api\/knowledge\/similarity-evals\/[^/]+\/runs$/, ms: 60_000 },
	{ method: 'POST', pattern: /\/api\/engagements\/[^/]+\/exports$/, ms: 60_000 },
	{ pattern: /\/api\/knowledge\/health$/, ms: 30_000 },
	{ pattern: /\/snapshot(\/|$)/, ms: LLMOPS_GOVERNANCE_TIMEOUT_MS },
	{ pattern: /\/api\/(knowledge|frameworks|engagements)(\/|$)/, ms: LLMOPS_GOVERNANCE_TIMEOUT_MS }
];

/** Vrai si `host` correspond à une entrée de liste (nom exact, ou `*.suffixe` pour tout sous-domaine). */
export function hostMatchesAllowList(host: string, allowed: string[]): boolean {
	const h = host.toLowerCase();
	return allowed.some((entry) => {
		const e = entry.trim().toLowerCase();
		if (!e) return false;
		if (e.startsWith('*.')) return h.endsWith(e.slice(1)) && h.length > e.length - 1;
		return h === e;
	});
}

/** Vérifie la compatibilité entre la version majeure du client et celle annoncée par le Hub. */
export function isContractVersionCompatible(
	clientVersion: string,
	serverVersion: string | null | undefined
): boolean {
	if (!serverVersion) return true;
	const cleanServer = serverVersion.trim().replace(/^v/i, '');
	if ((HUB_SUPPORTED_CONTRACT_VERSIONS as readonly string[]).includes(cleanServer)) {
		return true;
	}
	const clientMajor = clientVersion.trim().replace(/^v/i, '').split('.')[0];
	const serverMajor = cleanServer.split('.')[0];
	return Boolean(clientMajor && serverMajor && clientMajor === serverMajor);
}

function resolveDefaultAuthToken(): string {
	if (process.env.LLMOPS_AUTH_TOKEN) return process.env.LLMOPS_AUTH_TOKEN;

	try {
		const envPath = path.resolve(process.cwd(), '.env');
		if (fs.existsSync(envPath)) {
			const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed.startsWith('LLMOPS_AUTH_TOKEN=')) {
					const val = trimmed
						.slice('LLMOPS_AUTH_TOKEN='.length)
						.replace(/^["']|["']$/g, '')
						.trim();
					if (val) return val;
				}
			}
		}
	} catch {}

	try {
		const tokenPath = path.resolve(process.cwd(), '../LLMOps/.llmops-local-service-token');
		if (fs.existsSync(tokenPath)) {
			const val = fs.readFileSync(tokenPath, 'utf-8').trim();
			if (val) return val;
		}
	} catch {}

	return 'demo-local-sovereign-2026';
}

function resolveDefaultBaseUrl(): string {
	if (process.env.LLMOPS_BASE_URL) return process.env.LLMOPS_BASE_URL;

	try {
		const envPath = path.resolve(process.cwd(), '.env');
		if (fs.existsSync(envPath)) {
			const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed.startsWith('LLMOPS_BASE_URL=')) {
					const val = trimmed
						.slice('LLMOPS_BASE_URL='.length)
						.replace(/^["']|["']$/g, '')
						.trim();
					if (val) return val;
				}
			}
		}
	} catch {}

	return 'http://127.0.0.1:8000';
}

export class LLMOpsTransport {
	public baseUrl: string;
	public authToken: string;
	public defaultEngagement: string;
	public timeoutMs: number | undefined;
	public allowedHosts: string[];
	public cacheTtlMs: number;
	public readonly contractVersion: string;
	private cache = new Map<string, { value: any; expiresAt: number }>();
	private inFlight = new Map<string, Promise<any>>();
	private lastNegotiation: HubContractVersionNegotiation;

	constructor(config: LLMOpsClientConfig | string = {}, maybeAuthToken?: string) {
		const conf: LLMOpsClientConfig =
			typeof config === 'string' ? { baseUrl: config, authToken: maybeAuthToken } : config;
		this.baseUrl = (conf.baseUrl || resolveDefaultBaseUrl()).replace(/\/+$/, '');
		this.authToken = conf.authToken || resolveDefaultAuthToken();
		this.defaultEngagement =
			conf.defaultEngagement || process.env.LLMOPS_ENGAGEMENT || 'default-project';
		this.timeoutMs = conf.timeoutMs || Number(process.env.LLMOPS_TIMEOUT_MS) || undefined;
		this.allowedHosts = (conf.allowedHosts ?? (process.env.LLMOPS_ALLOWED_HOSTS || '').split(','))
			.map((h) => h.trim())
			.filter(Boolean);
		this.cacheTtlMs = conf.cacheTtlMs ?? (process.env.VITEST ? 0 : 30_000);
		this.contractVersion = conf.contractVersion || HUB_CONTRACT_VERSION;
		this.lastNegotiation = {
			clientVersion: this.contractVersion,
			serverVersion: null,
			compatible: true,
			status: 'unversioned'
		};
	}

	invalidateCache(prefix?: string): void {
		if (!prefix) {
			this.cache.clear();
			return;
		}
		for (const key of this.cache.keys()) {
			if (key.startsWith(prefix)) {
				this.cache.delete(key);
			}
		}
	}

	setCacheTtl(ttlMs: number): void {
		this.cacheTtlMs = Math.max(0, ttlMs);
	}

	async cachedFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs?: number): Promise<T> {
		const effectiveTtl = ttlMs ?? this.cacheTtlMs;
		const now = Date.now();

		if (effectiveTtl > 0) {
			const cached = this.cache.get(key);
			if (cached && cached.expiresAt > now) {
				return cached.value as T;
			}
		}

		if (this.inFlight.has(key)) {
			return this.inFlight.get(key)! as Promise<T>;
		}

		const promise = (async () => {
			try {
				const result = await fetcher();
				if (effectiveTtl > 0 && result !== undefined && result !== null) {
					const isErrorStatus =
						result &&
						typeof result === 'object' &&
						'status' in result &&
						((result as any).status === 'error' || (result as any).status === 'unavailable');
					const finalTtl = isErrorStatus ? Math.min(effectiveTtl, 2000) : effectiveTtl;
					this.cache.set(key, { value: result, expiresAt: Date.now() + finalTtl });
				}
				return result;
			} finally {
				this.inFlight.delete(key);
			}
		})();

		this.inFlight.set(key, promise);
		return promise;
	}

	timeoutFor(url: string, method = 'GET'): number {
		if (this.timeoutMs) return this.timeoutMs;
		let urlPath = url;
		try {
			urlPath = new URL(url).pathname;
		} catch {
			// chemin relatif : utilisé tel quel
		}
		const rule = OPERATION_TIMEOUTS.find(
			(r) => r.pattern.test(urlPath) && (!r.method || r.method === method.toUpperCase())
		);
		return rule ? rule.ms : LLMOPS_DEFAULT_TIMEOUT_MS;
	}

	setBaseUrl(url: string): void {
		this.baseUrl = url.replace(/\/+$/, '');
		this.invalidateCache();
	}

	getBaseUrl(): string {
		return this.baseUrl;
	}

	isLocalNetworkUrl(urlStr: string): boolean {
		try {
			const parsed = new URL(urlStr);
			const host = parsed.hostname.toLowerCase();
			if (hostMatchesAllowList(host, this.allowedHosts)) {
				return true;
			}
			if (
				host.includes('run.app') ||
				host.includes('googleapis.com') ||
				host.includes('amazonaws.com') ||
				host.includes('openai.com') ||
				host.includes('azure.com')
			) {
				return false;
			}

			return (
				host === 'localhost' ||
				host === '127.0.0.1' ||
				host === '::1' ||
				host === '0.0.0.0' ||
				!host.includes('.') ||
				host.endsWith('.local') ||
				host.endsWith('.internal') ||
				host.endsWith('.lan') ||
				host.endsWith('.home') ||
				/^192\.168\./.test(host) ||
				/^10\./.test(host) ||
				/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
			);
		} catch {
			return false;
		}
	}

	resolveRemoteEngagement(engagement?: string): string {
		return engagement || this.defaultEngagement;
	}

	getHeaders(
		engagement?: string,
		actorEmail?: string,
		idempotencyKey?: string
	): Record<string, string> {
		const eng = this.resolveRemoteEngagement(engagement || this.defaultEngagement);
		const headers: Record<string, string> = {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			Authorization: `Bearer ${this.authToken}`,
			'X-Engagement-Id': eng,
			'X-Hub-Contract-Version': this.contractVersion
		};
		if (actorEmail) {
			try {
				Object.assign(headers, actorIdentityHeaders(actorEmail));
			} catch (err) {
				if (err instanceof ActorAssertionConfigError) console.error(`[llmops] ${err.message}`);
				throw err;
			}
		}
		if (idempotencyKey) {
			headers['Idempotency-Key'] = idempotencyKey;
		}
		return headers;
	}

	async parseOrThrow<T>(res: Response): Promise<T> {
		if (res.ok) {
			const body = await res.json().catch(() => ({}));
			return (
				body && typeof body === 'object' && 'data' in body && body.data !== undefined
					? body.data
					: body
			) as T;
		}
		const errBody = await res.json().catch(() => ({}));
		const code = errBody.error || errBody.status || `HTTP_${res.status}`;
		const reason = errBody.reason || errBody.message || `Erreur HTTP ${res.status}`;
		throw new HubApiError(res.status, code, reason, errBody);
	}

	private recordServerContractVersion(serverVersion: string | null | undefined): void {
		if (!serverVersion) return;
		const compatible = isContractVersionCompatible(this.contractVersion, serverVersion);
		this.lastNegotiation = {
			clientVersion: this.contractVersion,
			serverVersion,
			compatible,
			status: compatible ? 'negotiated' : 'mismatch'
		};
	}

	getNegotiatedContractVersion(): HubContractVersionNegotiation {
		return { ...this.lastNegotiation };
	}

	async negotiateContractVersion(options: {
		bypassCache?: boolean;
	} = {}): Promise<HubContractVersionNegotiation> {
		const healthRes = await this.getHealth(options);
		if (healthRes.source === 'live') {
			const bodyVersion =
				(healthRes.data as any)?.contract_version || healthRes.data?.schema_version || null;
			if (bodyVersion && this.lastNegotiation.status === 'unversioned') {
				this.recordServerContractVersion(String(bodyVersion));
			}
		}
		return this.getNegotiatedContractVersion();
	}

	/** Point d'entrée public utilisé par les modules de domaine (délègue à `fetchWithTimeout` surchargeable en sous-classe). */
	request(url: string, options: RequestInit = {}): Promise<Response> {
		return this.fetchWithTimeout(url, options);
	}

	protected async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
		if (!this.isLocalNetworkUrl(url)) {
			console.warn(
				`🔒 [Air-Gap Souverain] Blocage d'exfiltration : tentative de connexion vers un cloud externe (${url}) bloquée net. Les données du RFP restent confinées à votre réseau local.`
			);
			throw new Error(
				`Air-Gap Security: External cloud access prohibited (${url}). Working in local network only.`
			);
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutFor(url, options.method || 'GET'));
		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal
			});
			clearTimeout(timer);
			const headerVersion =
				response.headers?.get?.('x-hub-contract-version') ||
				response.headers?.get?.('x-api-version');
			if (headerVersion) {
				this.recordServerContractVersion(headerVersion);
			}
			return response;
		} catch (err) {
			clearTimeout(timer);
			throw err;
		}
	}

	unreachableHealth(): LLMOpsHealth {
		return {
			status: 'unreachable',
			plane: 'none',
			schema_version: '',
			service: 'llmops-unreachable',
			engine_version: '',
			engine_commit: ''
		};
	}

	async getHealth(
		options: { bypassCache?: boolean } = {}
	): Promise<{ data: LLMOpsHealth; source: 'live' | 'offline-fallback' }> {
		const cacheKey = `health:${this.baseUrl}`;
		if (options.bypassCache) this.invalidateCache(cacheKey);
		return this.cachedFetch(
			cacheKey,
			async () => {
				try {
					const url = `${this.baseUrl}/health`;
					const res = await this.fetchWithTimeout(url);
					if (res.ok) {
						const data = (await res.json()) as LLMOpsHealth;
						const bodyVersion = (data as any)?.contract_version || data?.schema_version;
						if (bodyVersion && this.lastNegotiation.status === 'unversioned') {
							this.recordServerContractVersion(String(bodyVersion));
						}
						return { data, source: 'live' };
					}
				} catch {
					// Live unreachable -> fallback offline
				}

				return { data: this.unreachableHealth(), source: 'offline-fallback' };
			},
			5000
		);
	}

	async getLatestSnapshot(
		options: { bypassCache?: boolean } = {}
	): Promise<{ data: LLMOpsSnapshot; source: 'live' | 'offline-fallback' }> {
		const cacheKey = `snapshot:latest:${this.baseUrl}`;
		if (options.bypassCache) this.invalidateCache(cacheKey);
		return this.cachedFetch(cacheKey, async () => {
			try {
				const url = `${this.baseUrl}/snapshot/latest`;
				const res = await this.fetchWithTimeout(url, { headers: this.getHeaders() });
				if (res.ok) {
					const data = (await res.json()) as LLMOpsSnapshot;
					return { data, source: 'live' };
				}
			} catch (err: unknown) {
				const orig = err instanceof Error ? ` (${err.message})` : '';
				throw new Error(
					`LLMOps injoignable (${this.baseUrl}) : aucun instantané scellé disponible${orig}`
				);
			}

			throw new Error(`LLMOps injoignable (${this.baseUrl}) : aucun instantané scellé disponible.`);
		});
	}
}
