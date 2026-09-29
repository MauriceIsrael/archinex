import { llmopsClient } from '$lib/server/llmops/client';
import type {
	DoctrineContext,
	DoctrineItem,
	CheckOptionRequest,
	CheckResult,
	FrameworkCoverage
} from '$lib/types/llmops';

export class DoctrineService {
	/**
	 * Récupère le contexte doctrinal applicable depuis LLMOps (ou le snapshot offline si déconnecté).
	 * Zéro règle en dur dans le code source.
	 */
	async getDoctrineContext(params: {
		topics?: string[];
		projectType?: string;
		domains?: string[];
		maxItems?: number;
	} = {}): Promise<DoctrineContext> {
		const subject = params.topics && params.topics.length > 0 ? params.topics.join(' ') : params.projectType;
		return llmopsClient.getDoctrineContext({
			subject,
			domains: params.domains,
			max_items: params.maxItems
		});
	}

	/**
	 * Évalue la conformité d'une option architecturale par rapport à la doctrine (L1/L2)
	 */
	async checkOption(request: CheckOptionRequest): Promise<CheckResult> {
		return llmopsClient.checkOption({
			option: {
				id: request.option_id || 'opt-custom',
				title: request.option_label,
				summary: request.option_description || request.option_label,
				kbRefs: request.rules
			},
			frameworks: request.frameworks
		});
	}

	/**
	 * Récupère la couverture des cadres réglementaires et doctrinaux
	 */
	async getFrameworkCoverage(project?: string): Promise<FrameworkCoverage> {
		return llmopsClient.getFrameworkCoverage(project);
	}

	/**
	 * Met à jour les cadres applicables pour un projet
	 */
	async setApplicableFrameworks(project: string, frameworks: string[]): Promise<boolean> {
		const res = await llmopsClient.setApplicableFrameworks(project, frameworks);
		return res.status === 'ok';
	}

	/**
	 * Détecte les règles applicables sur la base d'une liste de règles fournies dynamiquement
	 */
	detectRecallsFromRules(content: string, rules: DoctrineItem[]): DoctrineItem[] {
		const lower = content.toLowerCase();
		return rules.filter((item) => {
			const titleMatch = item.title && lower.includes(item.title.toLowerCase());
			const contentMatch = item.content && item.content.toLowerCase().split(/\s+/).some((w: string) => w.length > 5 && lower.includes(w));
			return Boolean(titleMatch || contentMatch);
		});
	}
}

export const doctrineService = new DoctrineService();
