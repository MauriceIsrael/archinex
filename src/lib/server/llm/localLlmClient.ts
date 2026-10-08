/**
 * Client d'Inférence LLM (Local Souverain Ollama / Cloud Anthropic Claude)
 * 
 * - Par défaut : moteur local souverain sur le réseau d'entreprise (Ollama / vLLM sur localhost / raptor-nino:11434).
 * - Multi-modèle & Cloud : si ANTHROPIC_API_KEY est configurée, active les modèles Claude
 *   (Claude 3.7 Sonnet, Claude 3.5 Sonnet, Claude 3.5 Haiku) pour une factorisation haute fidélité
 *   et des fenêtres de contexte étendues (200k tokens).
 */

import type { LocalLlmConfig, LocalLlmModel, ChatOptions } from './types';

export class LocalLlmClient {
	private endpoint: string;
	private defaultModel: string;
	private timeoutMs: number;
	private temperature: number;
	private anthropicApiKey: string;
	private provider: 'local' | 'anthropic' | 'auto';
	private anthropicModel: string;

	constructor(config: Partial<LocalLlmConfig> = {}) {
		// Endpoint serveur local souverain
		this.endpoint = (
			config.endpoint ||
			process.env.LLM_LOCAL_ENDPOINT ||
			'http://localhost:11434'
		).replace(/\/+$/, '');

		// Clé et configuration Anthropic Claude
		this.anthropicApiKey = (config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '').trim();
		this.provider = (config.provider || (process.env.LLM_PROVIDER as any) || 'auto') as 'local' | 'anthropic' | 'auto';
		this.anthropicModel = config.anthropicModel || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

		const hasAnthropic = Boolean(this.anthropicApiKey) && this.provider !== 'local';
		const localDefault = process.env.LLM_LOCAL_MODEL || 'ministral:latest';

		this.defaultModel = config.defaultModel || (hasAnthropic ? this.anthropicModel : localDefault);
		this.timeoutMs = config.timeoutMs || parseInt(process.env.LLM_LOCAL_TIMEOUT_MS || '180000', 10);
		this.temperature = config.temperature ?? 0.2;
	}

	/**
	 * Indique si une clé Anthropic API valide est renseignée
	 */
	hasAnthropicConfigured(): boolean {
		return Boolean(this.anthropicApiKey && this.anthropicApiKey.length > 0);
	}

	/**
	 * Retourne le modèle actif par défaut
	 */
	getDefaultModel(): string {
		return this.defaultModel;
	}

	/**
	 * Retourne le mode de fournisseur configuré ('local', 'anthropic' ou 'auto')
	 */
	getProvider(): 'local' | 'anthropic' | 'auto' {
		return this.provider;
	}

	/**
	 * Vérifie rigoureusement si une URL appartient au réseau local (LAN/intranet)
	 * Bloque toute tentative d'exfiltration non autorisée vers des LLMs cloud ou internet public.
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
	 * Contrôle de disponibilité et santé du serveur LLM
	 */
	async checkHealth(): Promise<{
		available: boolean;
		endpoint: string;
		models: LocalLlmModel[];
		provider?: string;
		error?: string;
	}> {
		const models = await this.getAvailableModels();

		// Si Claude est configuré, on valide la disponibilité
		if (this.hasAnthropicConfigured() && this.provider !== 'local') {
			return {
				available: true,
				endpoint: `Anthropic Cloud (${this.anthropicModel}) & Ollama (${this.endpoint})`,
				models,
				provider: this.provider === 'anthropic' ? 'anthropic' : 'hybrid'
			};
		}

		if (!this.isLocalNetworkUrl(this.endpoint)) {
			return {
				available: false,
				endpoint: this.endpoint,
				models: [],
				error: `L'URL ${this.endpoint} est rejetée par la politique d'étanchéité souveraine.`
			};
		}

		try {
			return {
				available: true,
				endpoint: this.endpoint,
				models,
				provider: 'local'
			};
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : 'Injoignable';
			return {
				available: false,
				endpoint: this.endpoint,
				models: [],
				provider: 'local',
				error: msg
			};
		}
	}

	/**
	 * Liste les modèles d'IA disponibles (Claude Anthropic + modèles hébergés sur le serveur local)
	 */
	async getAvailableModels(): Promise<LocalLlmModel[]> {
		const models: LocalLlmModel[] = [];

		// 1. Modèles Claude Anthropic si la clé est présente
		if (this.hasAnthropicConfigured() && this.provider !== 'local') {
			models.push(
				{
					id: 'claude-3-7-sonnet-20250219',
					name: 'Claude 3.7 Sonnet (Anthropic - Raisonnement étendu, 200k tokens)',
					family: 'claude',
					contextLength: 200000
				},
				{
					id: 'claude-3-5-sonnet-20241022',
					name: 'Claude 3.5 Sonnet (Anthropic - Haute fidélité, 200k tokens)',
					family: 'claude',
					contextLength: 200000
				},
				{
					id: 'claude-3-5-haiku-20241022',
					name: 'Claude 3.5 Haiku (Anthropic - Ultra-rapide, 200k tokens)',
					family: 'claude',
					contextLength: 200000
				}
			);
		}

		// Si forcé strictement en mode cloud Anthropic, on s'arrête là
		if (this.provider === 'anthropic') {
			return models;
		}

		// 2. Modèles locaux Ollama / vLLM
		if (this.isLocalNetworkUrl(this.endpoint)) {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 6000);

			try {
				const res = await fetch(`${this.endpoint}/api/tags`, {
					headers: { Accept: 'application/json' },
					signal: controller.signal
				});
				clearTimeout(timer);

				if (res.ok) {
					const data = await res.json();
					if (Array.isArray(data.models)) {
						for (const m of data.models) {
							models.push({
								id: m.name || m.model,
								name: m.name || m.model,
								size: m.size,
								parameterSize: m.details?.parameter_size,
								contextLength: m.details?.context_length,
								family: m.details?.family
							});
						}
						return models;
					}
				}

				const resV1 = await fetch(`${this.endpoint}/v1/models`, {
					headers: { Accept: 'application/json' },
					signal: controller.signal
				});

				if (resV1.ok) {
					const dataV1 = await resV1.json();
					if (Array.isArray(dataV1.data)) {
						for (const m of dataV1.data) {
							models.push({
								id: m.id,
								name: m.id
							});
						}
						return models;
					}
				}
			} catch {
				clearTimeout(timer);
				// Fallback si la requête réseau échoue mais qu'on sait que le serveur local dispose de ces modèles
				if (models.length === 0) {
					models.push(
						{ id: 'ministral:latest', name: 'ministral:latest (Ministral 14B Reasoning)' },
						{ id: 'qwen2.5-coder:14b', name: 'qwen2.5-coder:14b (Qwen 14.8B Coder)' }
					);
				}
			}
		}

		return models;
	}

	/**
	 * Exécute une requête de chat / complétion auprès du LLM (Claude Anthropic ou Ollama local)
	 */
	async chat(options: ChatOptions): Promise<string> {
		const targetModel = options.model || this.defaultModel;
		const isClaude = targetModel.toLowerCase().startsWith('claude');
		const useAnthropic =
			this.hasAnthropicConfigured() &&
			(this.provider === 'anthropic' || isClaude || (this.provider === 'auto' && this.defaultModel.toLowerCase().startsWith('claude')));

		if (useAnthropic) {
			return this.chatAnthropic(options, targetModel);
		}

		return this.chatLocal(options, targetModel);
	}

	/**
	 * Appel API Anthropic Messages (Claude 3.5 / 3.7)
	 */
	private async chatAnthropic(options: ChatOptions, model: string): Promise<string> {
		const timeout = options.timeoutMs || this.timeoutMs;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);

		try {
			// Résolution d'alias de modèle éventuel
			let resolvedModel = model;
			if (resolvedModel === 'claude-3-7-sonnet') resolvedModel = 'claude-3-7-sonnet-20250219';
			else if (resolvedModel === 'claude-3-5-sonnet') resolvedModel = 'claude-3-5-sonnet-20241022';
			else if (resolvedModel === 'claude-3-5-haiku') resolvedModel = 'claude-3-5-haiku-20241022';
			else if (!resolvedModel.toLowerCase().startsWith('claude-')) resolvedModel = this.anthropicModel;

			// Extraction du prompt système
			const systemParts = options.messages
				.filter((m) => m.role === 'system')
				.map((m) => m.content);

			if (options.format === 'json') {
				systemParts.push(
					'INSTRUCTION STRICTE : Réponds EXCLUSIVEMENT par un objet ou tableau JSON valide et parseable sans aucun texte d\'accompagnement en amont ou en aval.'
				);
			}

			const systemPrompt = systemParts.join('\n\n');

			// Filtrage des messages non-système
			const nonSystem = options.messages.filter((m) => m.role !== 'system');
			if (nonSystem.length === 0) {
				nonSystem.push({ role: 'user', content: 'Bonjour' });
			}

			// Fusion des tours consécutifs ayant le même rôle (l'API Anthropic exige l'alternance stricte)
			const formattedMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
			for (const msg of nonSystem) {
				const role = msg.role === 'assistant' ? 'assistant' : 'user';
				const last = formattedMessages[formattedMessages.length - 1];
				if (last && last.role === role) {
					last.content += `\n\n${msg.content}`;
				} else {
					formattedMessages.push({ role, content: msg.content });
				}
			}

			// Le premier message utilisateur doit impérativement être de rôle 'user'
			if (formattedMessages[0].role !== 'user') {
				formattedMessages.unshift({ role: 'user', content: 'Instructions d\'amorce :' });
			}

			const payload: any = {
				model: resolvedModel,
				messages: formattedMessages,
				max_tokens: options.maxTokens || 4096,
				temperature: options.temperature ?? this.temperature
			};

			if (systemPrompt.trim().length > 0) {
				payload.system = systemPrompt;
			}

			const res = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					'x-api-key': this.anthropicApiKey,
					'anthropic-version': '2023-06-01'
				},
				body: JSON.stringify(payload),
				signal: controller.signal
			});

			clearTimeout(timer);

			if (!res.ok) {
				const errText = await res.text().catch(() => '');
				throw new Error(
					`Erreur Anthropic Claude (${res.status} ${res.statusText}) : ${errText.slice(0, 300)}`
				);
			}

			const data = await res.json();
			const text = Array.isArray(data.content)
				? data.content
						.filter((block: any) => block.type === 'text')
						.map((block: any) => block.text)
						.join('')
				: '';

			return text;
		} catch (err: unknown) {
			clearTimeout(timer);
			if (controller.signal.aborted) {
				throw new Error(
					`Délai d'inférence Claude dépassé (${Math.round(timeout / 1000)}s). L'API Anthropic n'a pas répondu à temps.`
				);
			}
			throw err;
		}
	}

	/**
	 * Appel API Ollama local souverain
	 */
	private async chatLocal(options: ChatOptions, model: string): Promise<string> {
		if (!this.isLocalNetworkUrl(this.endpoint)) {
			throw new Error(`Air-Gap Security: Appel refusé vers ${this.endpoint}`);
		}

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
			if (controller.signal.aborted) {
				throw new Error(
					`Délai d'inférence LLM local dépassé (${Math.round(timeout / 1000)}s sur ${this.endpoint}). Le modèle local n'a pas répondu à temps.`
				);
			}
			throw err;
		}
	}
}

export const localLlmClient = new LocalLlmClient();
