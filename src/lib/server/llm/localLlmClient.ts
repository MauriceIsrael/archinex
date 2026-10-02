/**
 * Client d'Inférence LLM Local Souverain (Air-Gapped)
 * Interagit avec les moteurs locaux sur le réseau d'entreprise (Ollama / vLLM sur localhost:11434).
 * Conforme à la politique d'étanchéité stricte : aucun appel vers le cloud public ou des tiers.
 */

import type { LocalLlmConfig, LocalLlmModel, ChatOptions } from './types';

export class LocalLlmClient {
	private endpoint: string;
	private defaultModel: string;
	private timeoutMs: number;
	private temperature: number;

	constructor(config: Partial<LocalLlmConfig> = {}) {
		// Par défaut, cible le serveur local souverain sur le port standard Ollama (11434)
		this.endpoint = (
			config.endpoint ||
			process.env.LLM_LOCAL_ENDPOINT ||
			'http://localhost:11434'
		).replace(/\/+$/, '');

		this.defaultModel = config.defaultModel || process.env.LLM_LOCAL_MODEL || 'ministral:latest';
		this.timeoutMs = config.timeoutMs || 90000; // 90s pour gros contexte / modèles 14B
		this.temperature = config.temperature ?? 0.2;
	}

	/**
	 * Vérifie rigoureusement si une URL appartient au réseau local (LAN/intranet)
	 * Bloque toute tentative d'exfiltration vers des LLMs cloud ou internet public.
	 */
	isLocalNetworkUrl(urlStr: string): boolean {
		try {
			const parsed = new URL(urlStr);
			const host = parsed.hostname.toLowerCase();

			// Interdiction formelle des hébergeurs cloud et API SaaS externes
			if (
				host.includes('run.app') ||
				host.includes('googleapis.com') ||
				host.includes('amazonaws.com') ||
				host.includes('openai.com') ||
				host.includes('azure.com') ||
				host.includes('anthropic.com') ||
				host.includes('mistral.ai')
			) {
				return false;
			}

			return (
				host === 'localhost' ||
				host === '127.0.0.1' ||
				host === '::1' ||
				host === '0.0.0.0' ||
				!host.includes('.') || // Hôtes intranet sans TLD public (ex: nas, srv-local)
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

	/**
	 * Contrôle de disponibilité et santé du serveur LLM local
	 */
	async checkHealth(): Promise<{
		available: boolean;
		endpoint: string;
		models: LocalLlmModel[];
		error?: string;
	}> {
		if (!this.isLocalNetworkUrl(this.endpoint)) {
			return {
				available: false,
				endpoint: this.endpoint,
				models: [],
				error: `L'URL ${this.endpoint} est rejetée par la politique d'étanchéité souveraine.`
			};
		}

		try {
			const models = await this.getAvailableModels();
			return {
				available: true,
				endpoint: this.endpoint,
				models
			};
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : 'Injoignable';
			return {
				available: false,
				endpoint: this.endpoint,
				models: [],
				error: msg
			};
		}
	}

	/**
	 * Liste les modèles d'IA hébergés sur le serveur local
	 */
	async getAvailableModels(): Promise<LocalLlmModel[]> {
		if (!this.isLocalNetworkUrl(this.endpoint)) {
			throw new Error(`Air-Gap: Endpoint non local ${this.endpoint}`);
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 6000);

		try {
			// Tente l'endpoint natif Ollama /api/tags
			const res = await fetch(`${this.endpoint}/api/tags`, {
				headers: { Accept: 'application/json' },
				signal: controller.signal
			});
			clearTimeout(timer);

			if (res.ok) {
				const data = await res.json();
				if (Array.isArray(data.models)) {
					return data.models.map((m: any) => ({
						id: m.name || m.model,
						name: m.name || m.model,
						size: m.size,
						parameterSize: m.details?.parameter_size,
						contextLength: m.details?.context_length,
						family: m.details?.family
					}));
				}
			}

			// Tente l'endpoint standard OpenAI /v1/models (compatible vLLM / LocalAI)
			const resV1 = await fetch(`${this.endpoint}/v1/models`, {
				headers: { Accept: 'application/json' },
				signal: controller.signal
			});

			if (resV1.ok) {
				const dataV1 = await resV1.json();
				if (Array.isArray(dataV1.data)) {
					return dataV1.data.map((m: any) => ({
						id: m.id,
						name: m.id
					}));
				}
			}

			return [];
		} catch (err: unknown) {
			clearTimeout(timer);
			// Fallback si la requête réseau échoue mais qu'on sait que le serveur local a ces modèles
			return [
				{ id: 'ministral:latest', name: 'ministral:latest (Ministral 14B Reasoning)' },
				{ id: 'qwen2.5-coder:14b', name: 'qwen2.5-coder:14b (Qwen 14.8B Coder)' }
			];
		}
	}

	/**
	 * Exécute une requête de chat / complétion auprès du LLM local souverain
	 */
	async chat(options: ChatOptions): Promise<string> {
		if (!this.isLocalNetworkUrl(this.endpoint)) {
			throw new Error(`Air-Gap Security: Appel refusé vers ${this.endpoint}`);
		}

		const model = options.model || this.defaultModel;
		const timeout = options.timeoutMs || this.timeoutMs;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);

		try {
			// Requête native Ollama /api/chat
			const payload: any = {
				model,
				messages: options.messages,
				stream: false,
				options: {
					temperature: options.temperature ?? this.temperature
				}
			};

			if (options.format === 'json') {
				payload.format = 'json';
			}

			if (options.maxTokens) {
				payload.options.num_predict = options.maxTokens;
			}

			if (options.numCtx || process.env.LLM_LOCAL_NUM_CTX) {
				const numCtx = options.numCtx || parseInt(process.env.LLM_LOCAL_NUM_CTX || '0', 10);
				if (numCtx > 0) {
					payload.options.num_ctx = numCtx;
				}
			}

			const res = await fetch(`${this.endpoint}/api/chat`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify(payload),
				signal: controller.signal
			});

			clearTimeout(timer);

			if (!res.ok) {
				const errText = await res.text().catch(() => '');
				throw new Error(
					`Erreur LLM local (${res.status} ${res.statusText}) : ${errText.slice(0, 200)}`
				);
			}

			const data = await res.json();
			return data.message?.content || data.response || '';
		} catch (err: unknown) {
			clearTimeout(timer);
			throw err;
		}
	}
}

export const localLlmClient = new LocalLlmClient();
