import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { llmopsClient } from '$lib/server/llmops/client';
import type {
	DoctrineContext,
	DoctrineItem,
	CheckOptionRequest,
	CheckResult,
	FrameworkCoverage,
	KbCandidate
} from '$lib/types/llmops';

export class DoctrineService {
	private cachedSealedSnapshot: any = null;

	private getSealedSnapshot(): any {
		if (this.cachedSealedSnapshot) return this.cachedSealedSnapshot;
		const snapshotPath = resolve(process.cwd(), 'tests/fixtures/llmops/llmops-sealed-snapshot.json');
		if (existsSync(snapshotPath)) {
			try {
				this.cachedSealedSnapshot = JSON.parse(readFileSync(snapshotPath, 'utf-8').replace(/^﻿/, ''));
				return this.cachedSealedSnapshot;
			} catch {
				// ignore
			}
		}
		return null;
	}

	/**
	 * Charge les règles doctrinales depuis le snapshot scellé en environnement hors-ligne/test.
	 * En production, cette méthode retourne un tableau vide.
	 */
	loadOfflineDoctrineFixtures(params: {
		subject?: string;
		domains?: string[];
		frameworks?: string[];
		maxItems?: number;
	} = {}): DoctrineItem[] {
		if (process.env.NODE_ENV === 'production') {
			return [];
		}

		const snapshot = this.getSealedSnapshot();
		if (!snapshot || !Array.isArray(snapshot.assets)) {
			return [];
		}

		let filtered = snapshot.assets.filter((a: any) => a.status === 'active' || !a.status);

		if (params.domains && params.domains.length > 0) {
			const requestedDomains = params.domains.map((d) => d.toLowerCase());
			filtered = filtered.filter((a: any) => {
				const assetDomains = (a.domain || '').toLowerCase().split(',').map((d: string) => d.trim());
				return requestedDomains.some((rd) => assetDomains.includes(rd));
			});
		}

		if (params.subject) {
			const terms = params.subject
				.toLowerCase()
				.split(/\s+/)
				.filter((w) => w.length > 2);
			if (terms.length > 0) {
				const matched = filtered.filter((a: any) => {
					const text = `${a.id} ${a.title || ''} ${a.domain || ''}`.toLowerCase();
					return terms.some((t) => text.includes(t));
				});
				if (matched.length > 0) {
					filtered = matched;
				}
			}
		}

		const items: DoctrineItem[] = filtered.map((a: any) => {
			const rawType = (a.type || 'rule').toLowerCase();
			const mappedType: DoctrineItem['type'] =
				rawType === 'decision' ? 'adr' :
				rawType === 'principle' ? 'principle' :
				rawType === 'pattern' ? 'pattern' :
				rawType === 'standard' ? 'standard' : 'rule';

			return {
				id: a.id,
				type: mappedType,
				title: a.title || a.id,
				content: a.title || a.id,
				domain: a.domain,
				confidence: a.confidence || 'verified'
			};
		});

		const max = params.maxItems || 20;
		return items.slice(0, max);
	}

	/**
	 * Récupère le contexte doctrinal applicable depuis LLMOps (priorité absolue au Hub REST/MCP).
	 * En environnement hors-ligne/test, active un fallback propre sur les fixtures scellées.
	 * En production, aucun repli gracieux n'est autorisé en cas d'indisponibilité.
	 */
	async getDoctrineContext(params: {
		topics?: string[];
		projectType?: string;
		domains?: string[];
		/** Référentiels applicables : LLMOps inclut alors tous leurs contrôles actifs, pertinents ou non au mot près. */
		frameworks?: string[];
		maxItems?: number;
		/** Budget total des extraits (LLMOps : 8000 caractères par défaut). */
		maxChars?: number;
	} = {}): Promise<DoctrineContext> {
		const subject = params.topics && params.topics.length > 0 ? params.topics.join(' ') : params.projectType;
		const ctx = await llmopsClient.getDoctrineContext({
			subject,
			domains: params.domains,
			frameworks: params.frameworks,
			max_items: params.maxItems,
			max_chars: params.maxChars
		});

		// 1. Si le Hub distant répond en live avec des règles, retour direct (priorité absolue)
		if (!ctx.offline && ctx.items && ctx.items.length > 0) {
			return ctx;
		}

		// 2. En mode hors-ligne / test (hors production), repli propre sur les fixtures scellées
		if (process.env.NODE_ENV !== 'production' && (ctx.offline || ctx.items.length === 0)) {
			const fallbackItems = this.loadOfflineDoctrineFixtures({
				subject,
				domains: params.domains,
				frameworks: params.frameworks,
				maxItems: params.maxItems
			});
			if (fallbackItems.length > 0) {
				return {
					subject,
					domains: params.domains,
					frameworks: params.frameworks,
					items: fallbackItems,
					total_items: fallbackItems.length,
					truncated: false,
					offline: true
				};
			}
		}

		return ctx;
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
	 * Soumet un candidat à la base de connaissances LLMOps (Porte G4)
	 */
	async submitKbCandidate(candidate: KbCandidate, actorEmail?: string): Promise<{ candidate_id: string; status: string }> {
		return llmopsClient.submitCandidate(candidate, actorEmail);
	}

	/**
	 * Récupère la liste des candidats de doctrine pour un engagement ou une source
	 */
	async listKbCandidates(filter: { source?: string; engagement?: string } = {}, actorEmail?: string): Promise<KbCandidate[]> {
		return llmopsClient.listCandidates(filter, actorEmail);
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
