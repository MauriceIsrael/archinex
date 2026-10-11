/**
 * Client d'Inférence LLM (Local Souverain Ollama / Cloud Anthropic Claude)
 * 
 * - Par défaut : moteur local souverain sur le réseau d'entreprise (Ollama / vLLM sur localhost:11434).
 * - Multi-modèle & Cloud : si ANTHROPIC_API_KEY est configurée, active les modèles Claude
 *   (Sonnet, Opus, Haiku, Fable) pour une factorisation haute fidélité
 *   et des fenêtres de contexte étendues (jusqu'à 1M tokens).
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AnthropicBeta } from '@anthropic-ai/sdk/resources/beta/beta';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { LocalLlmConfig, LocalLlmModel, ChatOptions } from './types';

/** Résout les alias historiques (Claude 3.x) vers un modèle servi ; un identifiant non Claude retombe sur le modèle par défaut. */
export function resolveAnthropicModel(model: string, fallback: string): string {
	const m = model.toLowerCase();
	if (m === 'claude-3-7-sonnet' || m === 'claude-3-7-sonnet-20250219') return 'claude-sonnet-5-5';
	if (m === 'claude-3-5-sonnet' || m === 'claude-3-5-sonnet-20241022') return 'claude-sonnet-5-5';
	if (m === 'claude-3-5-haiku' || m === 'claude-3-5-haiku-20241022' || m === 'claude-3-haiku-20240307') return 'claude-haiku-5-5';
	if (!m.startsWith('claude')) return fallback;
	return model;
}

export interface AnthropicCapabilities {
	/** Réflexion adaptative + effort (`output_config.effort`) ; temperature refusée. */
	adaptiveThinking: boolean;
	/** Repli serveur en cas de refus du filtre de sécurité (`fallbacks: "default"`). */
	serverFallback: boolean;
	maxOutputTokens: number;
}

/** Capacités d'API par famille de modèle (Claude 4.6 et suivants : réflexion adaptative, 128k jetons de sortie). */
export function anthropicCapabilities(model: string): AnthropicCapabilities {
	const m = model.toLowerCase();
	const adaptiveThinking = /claude-(?:fable|mythos)-|claude-(?:opus|sonnet|haiku)-5|claude-opus-4-[678]|claude-sonnet-4-6/.test(m);
	const serverFallback = /^claude-(?:fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/.test(m);
	return { adaptiveThinking, serverFallback, maxOutputTokens: adaptiveThinking ? 128000 : 64000 };
}

export class LocalLlmClient {
	private anthropic?: Anthropic;
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
		this.anthropicModel = config.anthropicModel || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

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
			try {
				const controller = new AbortController();
				const timer = setTimeout(() => controller.abort(), 4000);
				const res = await fetch('https://api.anthropic.com/v1/models', {
					headers: {
						'x-api-key': this.anthropicApiKey,
						'anthropic-version': '2023-06-01'
					},
					signal: controller.signal
				});
				clearTimeout(timer);

				if (res.ok) {
					const data = await res.json();
					if (Array.isArray(data.data) && data.data.length > 0) {
						for (const m of data.data) {
							const tokenLabel = m.max_input_tokens >= 1000000 ? '1M tokens' : `${Math.round(m.max_input_tokens / 1000)}k tokens`;
							models.push({
								id: m.id,
								name: `${m.display_name || m.id} (Anthropic - ${tokenLabel})`,
								family: m.line || 'claude',
								contextLength: m.max_input_tokens || 200000
							});
						}
					}
				}
			} catch {
				// Fallback si l'appel API direct est indisponible
			}

			// Fallback statique garanti si la découverte dynamique n'a rien renvoyé
			if (models.length === 0) {
				models.push(
					{
						id: 'claude-sonnet-5-5',
						name: 'Claude Sonnet 5.5 (Anthropic - Haute fidélité, 1M tokens)',
						family: 'claude',
						contextLength: 1000000
					},
					{
						id: 'claude-haiku-5-5',
						name: 'Claude Haiku 5.5 (Anthropic - Ultra-rapide, 1M tokens)',
						family: 'claude',
						contextLength: 1000000
					},
					{
						id: 'claude-opus-5-5',
						name: 'Claude Opus 5.5 (Anthropic - Raisonnement profond, 1M tokens)',
						family: 'claude',
						contextLength: 1000000
					}
				);
			}

			// Tri par pertinence : Sonnet en tête (version la plus récente d'abord), puis Opus, puis Haiku
			models.sort((a, b) => {
				const score = (id: string) => {
					const s = id.toLowerCase();
					let base = 0;
					if (s.includes('sonnet')) base += 1000;
					else if (s.includes('opus')) base += 500;
					else if (s.includes('haiku')) base += 100;

					if (s.includes('5-5') || s.includes('5.5')) base += 50;
					else if (s.includes('5')) base += 40;
					else if (s.includes('4-5') || s.includes('4.5')) base += 30;
					else if (s.includes('3-7') || s.includes('3.7')) base += 20;
					else if (s.includes('3-5') || s.includes('3.5')) base += 10;
					return base;
				};
				return score(b.id) - score(a.id);
			});

			// Si aucune variable ANTHROPIC_MODEL n'est explicitement fixée, privilégier le modèle le plus pertinent
			if (!process.env.ANTHROPIC_MODEL && models.length > 0) {
				this.defaultModel = models[0].id;
			}
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

		console.log(
			`🤖 [LLM Client] Requête chat -> Modèle : "${targetModel}" | Fournisseur : ${useAnthropic ? 'Anthropic Claude Cloud' : `Local Ollama (${this.endpoint})`}`
		);

		if (useAnthropic) {
			return this.chatAnthropic(options, targetModel);
		}

		return this.chatLocal(options, targetModel);
	}

	/**
	 * Appel API Anthropic Messages (Claude 4.x / 5.x) via le SDK officiel, en flux (streaming) :
	 * une réponse longue n'est plus coupée par un délai HTTP, et le SDK relance seul les 429 / 5xx.
	 */
	private async chatAnthropic(options: ChatOptions, model: string): Promise<string> {
		const startTime = Date.now();
		const timeout = options.timeoutMs || this.timeoutMs;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);

		try {
			const resolvedModel = resolveAnthropicModel(model, this.anthropicModel);
			const caps = anthropicCapabilities(resolvedModel);

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

			// En flux, un plafond élevé ne coûte rien tant qu'il n'est pas atteint : il évite les troncatures.
			const maxTokens = Math.min(options.maxTokens || caps.maxOutputTokens, caps.maxOutputTokens);

			const payload: BetaMessageStreamParams = {
				model: resolvedModel,
				messages: formattedMessages,
				max_tokens: maxTokens
			};

			if (caps.adaptiveThinking) {
				// Réflexion adaptative : le modèle raisonne avant de répondre, l'effort en règle la profondeur.
				// Les paramètres d'échantillonnage (temperature) sont refusés par ces modèles.
				payload.thinking = { type: 'adaptive' };
				payload.output_config = { effort: options.effort ?? 'high' };
			} else {
				payload.temperature = options.temperature ?? this.temperature;
			}

			if (systemPrompt.trim().length > 0) {
				payload.system = systemPrompt;
			}

			const betas: AnthropicBeta[] = [];
			if (caps.serverFallback) {
				// Si le modèle décline la requête (filtre de sécurité), l'API la rejoue sur un modèle de repli.
				betas.push('server-side-fallback-2026-07-01');
				payload.fallbacks = 'default';
			}

			const inputChars = options.messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
			console.log(
				`🌐 [Anthropic API] Envoi requête (flux) -> Modèle : "${resolvedModel}", max_tokens : ${payload.max_tokens}${
					payload.output_config?.effort ? `, effort : ${payload.output_config.effort}` : ''
				}, caractères envoyés : ${inputChars.toLocaleString('fr-FR')}`
			);

			const data = await this.getAnthropic()
				.beta.messages.stream({ ...payload, ...(betas.length > 0 ? { betas } : {}) }, { signal: controller.signal })
				.finalMessage();

			clearTimeout(timer);

			const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
			const text = data.content
				.filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
				.map((block) => block.text)
				.join('');

			const inTok = data.usage?.input_tokens ?? '?';
			const outTok = data.usage?.output_tokens ?? '?';
			const stopReason = data.stop_reason;

			console.log(
				`✅ [Anthropic API] Réponse reçue en ${durationSec}s -> ${text.length.toLocaleString('fr-FR')} car. (modèle: ${data.model}, tokens: in=${inTok}, out=${outTok}, stop_reason="${stopReason}")`
			);

			if (stopReason === 'refusal') {
				const category = data.stop_details?.category ?? 'non précisée';
				throw new Error(`Le modèle Claude (${data.model}) a décliné la requête (catégorie : ${category}).`);
			}

			// Diagnostic de troncature et d'épuisement de budget max_tokens
			if (stopReason === 'max_tokens' && text.trim().length === 0) {
				throw new Error(
					`Le modèle Claude (${resolvedModel}) a consommé l'intégralité du quota max_tokens (${payload.max_tokens}) dans sa phase de réflexion interne sans émettre de texte.`
				);
			}

			if (stopReason === 'max_tokens' && text.trim().length > 0) {
				console.warn(
					`⚠️ [Anthropic API] Attention : Réponse tronquée par max_tokens (${payload.max_tokens}). Le JSON risque d'être incomplet.`
				);
			}

			if (text.trim().length === 0) {
				throw new Error(
					`Réponse vide reçue de l'API Anthropic (0 caractères, stop_reason="${stopReason}").`
				);
			}

			return text;
		} catch (err: unknown) {
			clearTimeout(timer);
			if (controller.signal.aborted) {
				console.error(`⏱️ [Anthropic API] Timeout après ${Math.round(timeout / 1000)}s !`);
				throw new Error(
					`Délai d'inférence Claude dépassé (${Math.round(timeout / 1000)}s). L'API Anthropic n'a pas répondu à temps.`
				);
			}
			if (err instanceof Anthropic.APIError) {
				console.error(`❌ [Anthropic API] Erreur HTTP ${err.status ?? '?'} :`, err.message.slice(0, 300));
				throw new Error(`Erreur Anthropic Claude (${err.status ?? 'réseau'}) : ${err.message.slice(0, 300)}`);
			}
			throw err;
		}
	}

	private getAnthropic(): Anthropic {
		// fetch résolu à l'appel : les tests peuvent substituer globalThis.fetch.
		this.anthropic ??= new Anthropic({ apiKey: this.anthropicApiKey, maxRetries: 4, fetch: (...args) => globalThis.fetch(...args) });
		return this.anthropic;
	}

	/**
	 * Appel API Ollama local souverain
	 */
	private async chatLocal(options: ChatOptions, model: string): Promise<string> {
		if (!this.isLocalNetworkUrl(this.endpoint)) {
			throw new Error(`Air-Gap Security: Appel refusé vers ${this.endpoint}`);
		}

		const startTime = Date.now();
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

			const inputChars = options.messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
			console.log(
				`🖥️ [Local Ollama] Appel en cours -> Modèle : "${model}" sur ${this.endpoint}, caractères envoyés : ${inputChars.toLocaleString('fr-FR')}`
			);

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

			const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

			if (!res.ok) {
				const errText = await res.text().catch(() => '');
				console.error(`❌ [Local Ollama] Erreur HTTP ${res.status} (${durationSec}s) :`, errText.slice(0, 200));
				throw new Error(
					`Erreur LLM local (${res.status} ${res.statusText}) : ${errText.slice(0, 200)}`
				);
			}

			const data = await res.json();
			const content = data.message?.content || data.response || '';
			console.log(
				`✅ [Local Ollama] Réponse reçue en ${durationSec}s -> ${content.length.toLocaleString('fr-FR')} caractères générés`
			);
			return content;
		} catch (err: unknown) {
			clearTimeout(timer);
			if (controller.signal.aborted) {
				console.error(`⏱️ [Local Ollama] Timeout après ${Math.round(timeout / 1000)}s !`);
				throw new Error(
					`Délai d'inférence LLM local dépassé (${Math.round(timeout / 1000)}s sur ${this.endpoint}). Le modèle local n'a pas répondu à temps.`
				);
			}
			throw err;
		}
	}
}

export const localLlmClient = new LocalLlmClient();
