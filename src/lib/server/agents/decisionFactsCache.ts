import { createHash } from 'node:crypto';
import { prisma } from '$lib/server/prisma';
import { extractFactsForDecision, type ExtractedFact } from './factExtractor';

export interface DecisionFactsCacheInput {
	projectId?: string;
	subjectId?: string;
	decisionRationale: string;
	retainedOptionTitle: string;
	retainedOptionSummary?: string;
	allowedVocabularyKeys?: string[];
	keyHints?: Record<string, string>;
}

export type CacheSource = 'live' | 'cache-memory' | 'cache-db';

export interface CachedFactsResult {
	facts: ExtractedFact[];
	source: CacheSource;
}

/**
 * Calcule une clé de hachage SHA-256 déterministe basée sur le contenu de la décision et le vocabulaire imposé.
 */
export function computeDecisionFactsCacheKey(input: DecisionFactsCacheInput): string {
	const normalized = {
		projectId: (input.projectId || '').trim(),
		subjectId: (input.subjectId || '').trim(),
		rationale: (input.decisionRationale || '').trim(),
		optionTitle: (input.retainedOptionTitle || '').trim(),
		optionSummary: (input.retainedOptionSummary || '').trim(),
		vocabulary: (input.allowedVocabularyKeys || []).slice().sort(),
		keyHints: input.keyHints
			? Object.entries(input.keyHints).sort(([a], [b]) => a.localeCompare(b))
			: []
	};

	const raw = JSON.stringify(normalized);
	const hash = createHash('sha256').update(raw).digest('hex');
	return `dfacts:${hash}`;
}

// Cache en mémoire pour un accès ultra-rapide (< 1 ms) sans requête réseau ni I/O
const memoryFactsCache = new Map<string, { facts: ExtractedFact[]; cachedAt: number }>();

// Singleflight : déduplication des requêtes concurrentes en vol pour la même clé
const inFlightRequests = new Map<string, Promise<CachedFactsResult>>();

/**
 * Récupère les faits extraits depuis le cache (mémoire ou persistant) ou exécute l'extraction LLM avec déduplication in-flight.
 */
export async function getOrExtractFactsWithCache(
	input: DecisionFactsCacheInput
): Promise<CachedFactsResult> {
	const key = computeDecisionFactsCacheKey(input);

	// 1. Vérification du cache mémoire
	const memHit = memoryFactsCache.get(key);
	if (memHit) {
		return { facts: memHit.facts, source: 'cache-memory' };
	}

	// 2. Déduplication in-flight (si une requête pour la même clé est déjà en cours)
	const existingFlight = inFlightRequests.get(key);
	if (existingFlight) {
		return existingFlight;
	}

	// 3. Lancer l'exécution avec protection Singleflight
	const executePromise = (async (): Promise<CachedFactsResult> => {
		// Vérification du cache persistant en base (survit aux redémarrages serveur)
		try {
			const dbRow = await prisma.factorizationStageCache.findUnique({
				where: { key },
				select: { value: true }
			});
			if (dbRow?.value) {
				const parsed = JSON.parse(dbRow.value) as ExtractedFact[];
				memoryFactsCache.set(key, { facts: parsed, cachedAt: Date.now() });
				return { facts: parsed, source: 'cache-db' };
			}
		} catch (err: any) {
			// Tolérance si la base n'est pas accessible ou en environnement de test isolé
			console.warn('[DecisionFactsCache] Erreur lecture cache base :', err?.message || err);
		}

		// Aucun cache : appel réel au LLM (Claude Sonnet 5.5 ou fallback local)
		const extracted = await extractFactsForDecision({
			decisionRationale: input.decisionRationale,
			retainedOptionTitle: input.retainedOptionTitle,
			retainedOptionSummary: input.retainedOptionSummary,
			allowedVocabularyKeys: input.allowedVocabularyKeys,
			keyHints: input.keyHints
		});

		// Mise en cache en mémoire
		memoryFactsCache.set(key, { facts: extracted, cachedAt: Date.now() });

		// Sauvegarde asynchrone dans le cache persistant
		try {
			const serialized = JSON.stringify(extracted);
			await prisma.factorizationStageCache.upsert({
				where: { key },
				create: {
					key,
					stage: 'decision_facts',
					value: serialized
				},
				update: {
					value: serialized
				}
			});
		} catch (err: any) {
			console.warn('[DecisionFactsCache] Erreur écriture cache base :', err?.message || err);
		}

		return { facts: extracted, source: 'live' };
	})();

	inFlightRequests.set(key, executePromise);

	try {
		return await executePromise;
	} finally {
		inFlightRequests.delete(key);
	}
}

/**
 * Invalide ou vide le cache mémoire (utile pour les tests et réinitialisations).
 */
export function clearDecisionFactsMemoryCache(): void {
	memoryFactsCache.clear();
	inFlightRequests.clear();
}

/**
 * Vide complètement le cache mémoire ET le cache persistant en base (utile pour les tests isolés).
 */
export async function clearAllDecisionFactsCache(): Promise<void> {
	clearDecisionFactsMemoryCache();
	try {
		await prisma.factorizationStageCache.deleteMany({ where: { stage: 'decision_facts' } });
	} catch {
		// Ignore si base indisponible
	}
}

/**
 * Supprime une entrée spécifique du cache mémoire et de la base.
 */
export async function invalidateDecisionFactsCache(input: DecisionFactsCacheInput): Promise<void> {
	const key = computeDecisionFactsCacheKey(input);
	memoryFactsCache.delete(key);
	inFlightRequests.delete(key);
	try {
		await prisma.factorizationStageCache.delete({ where: { key } });
	} catch {
		// Clé potentiellement inexistante
	}
}
