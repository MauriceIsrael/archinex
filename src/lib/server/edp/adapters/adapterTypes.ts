export type AdapterMode = 'live' | 'degraded';

export interface BaseAdapterOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  projectScope?: string;
}

export interface AdapterHealthResult {
  service: string;
  reachable: boolean;
  mode: AdapterMode;
  baseUrl: string;
  version?: string;
  checkedAt: string;
  errors: string[];
}

export interface HttpCallResult<T = unknown> {
  ok: boolean;
  status: number;
  headers: Headers | null;
  data: T | null;
  text: string;
  networkError: boolean;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 5000;

export function sanitizeBaseUrl(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '');
}

export function resolveAdapterFetch(fetchImpl?: typeof fetch): typeof fetch {
  return fetchImpl ?? globalThis.fetch;
}

/**
 * Exécute un appel HTTP avec timeout déterministe et capture propre des erreurs réseau
 * pour garantir un mode dégradé sans exception non gérée lorsque la stack Docker est hors-ligne.
 */
export async function fetchWithTimeout<T = unknown>(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  fetchImpl?: typeof fetch
): Promise<HttpCallResult<T>> {
  const fetchFn = resolveAdapterFetch(fetchImpl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, {
      ...init,
      signal: controller.signal
    });
    const text = await response.text();
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = null;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      data,
      text,
      networkError: false,
      error: response.ok ? undefined : `HTTP ${response.status}${text ? `: ${text.slice(0, 240)}` : ''}`
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      headers: null,
      data: null,
      text: '',
      networkError: true,
      error: isTimeout ? `Timeout après ${timeoutMs}ms (${url})` : message
    };
  } finally {
    clearTimeout(timer);
  }
}
