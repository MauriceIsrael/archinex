import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	computeDecisionFactsCacheKey,
	getOrExtractFactsWithCache,
	clearAllDecisionFactsCache,
	invalidateDecisionFactsCache
} from '$lib/server/agents/decisionFactsCache';
import * as factExtractorModule from '$lib/server/agents/factExtractor';

describe('Decision Facts Cache & Singleflight Optimization', () => {
	beforeEach(async () => {
		await clearAllDecisionFactsCache();
		vi.restoreAllMocks();
	});

	it('calcule une clé SHA-256 déterministe indépendante de l’ordre des clés de vocabulaire', () => {
		const key1 = computeDecisionFactsCacheKey({
			projectId: 'p1',
			subjectId: 's1',
			decisionRationale: 'Architecture multi-site active/active',
			retainedOptionTitle: 'Option HA',
			allowedVocabularyKeys: ['site_count', 'topology', 'resilience_mode']
		});

		const key2 = computeDecisionFactsCacheKey({
			projectId: 'p1',
			subjectId: 's1',
			decisionRationale: 'Architecture multi-site active/active',
			retainedOptionTitle: 'Option HA',
			allowedVocabularyKeys: ['resilience_mode', 'site_count', 'topology']
		});

		expect(key1).toBe(key2);
		expect(key1.startsWith('dfacts:')).toBe(true);
	});

	it('retourne les faits en live au 1er appel puis sert le cache-mémoire sans réinterroger le LLM', async () => {
		const mockExtractor = vi.spyOn(factExtractorModule, 'extractFactsForDecision').mockResolvedValue([
			{
				key: 'site_count',
				value: '2',
				source_excerpt: 'multi-site',
				selected: true,
				productionMode: 'llm-derived'
			}
		]);

		const input = {
			projectId: 'proj-cache-test',
			subjectId: 'sub-cache-test',
			decisionRationale: 'Déploiement sur 2 sites redondés',
			retainedOptionTitle: 'Option Cloud Bi-Site',
			allowedVocabularyKeys: ['site_count']
		};

		// 1er appel : extraction live
		const result1 = await getOrExtractFactsWithCache(input);
		expect(result1.source).toBe('live');
		expect(result1.facts.length).toBe(1);
		expect(result1.facts[0].key).toBe('site_count');
		expect(mockExtractor).toHaveBeenCalledTimes(1);

		// 2e appel avec mêmes paramètres : servi depuis le cache mémoire (0 token LLM)
		const result2 = await getOrExtractFactsWithCache(input);
		expect(result2.source).toBe('cache-memory');
		expect(result2.facts).toEqual(result1.facts);
		expect(mockExtractor).toHaveBeenCalledTimes(1); // toujours 1 seul appel !
	});

	it('déduplique les requêtes concurrentes en vol (Singleflight) pour éviter les appels LLM en doublon', async () => {
		let callCount = 0;
		vi.spyOn(factExtractorModule, 'extractFactsForDecision').mockImplementation(async () => {
			callCount++;
			// Simule un délai de traitement LLM de 50ms
			await new Promise((res) => setTimeout(res, 50));
			return [
				{
					key: 'topology',
					value: 'mesh',
					source_excerpt: 'réseau maillé',
					selected: true,
					productionMode: 'llm-derived'
				}
			];
		});

		const input = {
			projectId: 'proj-singleflight',
			subjectId: 'sub-singleflight',
			decisionRationale: 'Architecture maillée résiliente',
			retainedOptionTitle: 'Option Mesh',
			allowedVocabularyKeys: ['topology']
		};

		// Lancement simultané de 3 requêtes identiques
		const [resA, resB, resC] = await Promise.all([
			getOrExtractFactsWithCache(input),
			getOrExtractFactsWithCache(input),
			getOrExtractFactsWithCache(input)
		]);

		// Un seul appel réel au LLM doit avoir eu lieu
		expect(callCount).toBe(1);
		expect(resA.facts[0].value).toBe('mesh');
		expect(resB.facts[0].value).toBe('mesh');
		expect(resC.facts[0].value).toBe('mesh');
	});

	it('invalide correctement le cache pour forcer un rafraîchissement si nécessaire', async () => {
		const mockExtractor = vi.spyOn(factExtractorModule, 'extractFactsForDecision').mockResolvedValue([
			{
				key: 'resilience_mode',
				value: 'active_active',
				source_excerpt: 'actif/actif',
				selected: true,
				productionMode: 'llm-derived'
			}
		]);

		const input = {
			projectId: 'proj-invalidate',
			subjectId: 'sub-invalidate',
			decisionRationale: 'Actif/actif',
			retainedOptionTitle: 'HA',
			allowedVocabularyKeys: ['resilience_mode']
		};

		await getOrExtractFactsWithCache(input);
		expect(mockExtractor).toHaveBeenCalledTimes(1);

		// Invalidation
		await invalidateDecisionFactsCache(input);

		// Appel suivant : ré-extraction live
		const resAfterInvalidate = await getOrExtractFactsWithCache(input);
		expect(resAfterInvalidate.source).toBe('live');
		expect(mockExtractor).toHaveBeenCalledTimes(2);
	});
});
