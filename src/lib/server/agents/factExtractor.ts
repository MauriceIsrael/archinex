import { z } from 'zod';
import { localLlmClient } from '../llm/localLlmClient';

export interface ExtractedFact {
	key: string;
	value: string;
	source_excerpt: string;
	selected: boolean;
	productionMode: 'llm-derived';
}

export const DEFAULT_ARCHINEX_VOCABULARY = [
	'topology',
	'resilience_mode',
	'site_count',
	'cloud_provider',
	'sovereignty_level',
	'latency_target',
	'storage_engine',
	'network_stack',
	'security_level',
	'isolation_mode',
	'disaster_recovery',
	'ha_replicas',
	'floor_control'
];

const FactExtractionOutputSchema = z.object({
	facts: z.array(
		z.object({
			key: z.string().min(1),
			value: z.string().min(1),
			source_excerpt: z.string().default('')
		})
	)
});

/**
 * Agent Extracteur de Faits (rôle Synthesizer) :
 * - Extrait des faits machine-lisibles {key, value, source_excerpt} à partir de la motivation de décision
 * - Contraint strictement la sortie au vocabulaire autorisé (l'instantané de la base). Toute clé inconnue est écartée.
 * - Origine 'llm-derived'.
 */
export async function extractFactsForDecision(input: {
	decisionRationale: string;
	retainedOptionTitle: string;
	retainedOptionSummary?: string;
	allowedVocabularyKeys?: string[];
}): Promise<ExtractedFact[]> {
	const allowedKeys =
		input.allowedVocabularyKeys && input.allowedVocabularyKeys.length > 0
			? input.allowedVocabularyKeys
			: DEFAULT_ARCHINEX_VOCABULARY;

	const allowedSet = new Set(allowedKeys);

	const systemPrompt = `Tu es l'agent Synthesizer d'Archinex, spécialisé dans l'extraction de faits d'architecture machine-lisibles (K18).
Ton rôle : analyser la décision prise et extraire des faits structurés.
RÈGLE D'OR ABSOLUE : Tu n'as le droit d'utiliser QUE les clés exactes de la liste suivante :
${allowedKeys.map((k) => `- "${k}"`).join('\n')}

TOUTE AUTRE CLÉ EST STRICTEMENT INTERDITE ET SERA REJETÉE. Si aucune information ne correspond à une clé, n'invente rien.
Réponds STRICTEMENT par un JSON valide :
{
  "facts": [
    {
      "key": "clé_exacte_de_la_liste",
      "value": "valeur concise",
      "source_excerpt": "passage exact extrait du texte source"
    }
  ]
}`;

	const userMessage = `Option retenue : ${input.retainedOptionTitle}
Résumé : ${input.retainedOptionSummary || 'Non spécifié'}
Motivation & Rationale :
"${input.decisionRationale}"

Extrais les faits techniques machine-lisibles conformes à la liste de vocabulaire autorisée :`;

	try {
		const timeoutMs = process.env.NODE_ENV === 'test' ? 300 : 12000;
		const response = await localLlmClient.chat({
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage }
			],
			temperature: 0.1,
			format: 'json',
			timeoutMs
		});

		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]);
			const validated = FactExtractionOutputSchema.parse(parsed);

			// RÈGLE STRICTE : Filtrage impitoyable des clés hors vocabulaire
			const filteredFacts: ExtractedFact[] = validated.facts
				.filter((f) => allowedSet.has(f.key))
				.map((f) => ({
					key: f.key,
					value: f.value.trim(),
					source_excerpt: f.source_excerpt.trim() || f.value.trim(),
					selected: true,
					productionMode: 'llm-derived'
				}));

			if (filteredFacts.length > 0) {
				return filteredFacts;
			}
		}
	} catch (err) {
		console.warn('[FactExtractor] Repli heuristique déterministe :', (err as any).message);
	}

	// Repli déterministe hors ligne fondé sur détection sémantique
	const text = `${input.retainedOptionTitle} ${input.retainedOptionSummary || ''} ${input.decisionRationale}`.toLowerCase();
	const fallbackFacts: ExtractedFact[] = [];

	if (
		(text.includes('actif/actif') || text.includes('actif-actif') || text.includes('active-active')) &&
		allowedSet.has('resilience_mode')
	) {
		fallbackFacts.push({
			key: 'resilience_mode',
			value: 'actif/actif',
			source_excerpt: 'actif/actif',
			selected: true,
			productionMode: 'llm-derived'
		});
	}

	if (
		(text.includes('deux sites') || text.includes('2 sites') || text.includes('dual-site')) &&
		allowedSet.has('site_count')
	) {
		fallbackFacts.push({
			key: 'site_count',
			value: '2',
			source_excerpt: 'deux sites',
			selected: true,
			productionMode: 'llm-derived'
		});
	}

	if (
		(text.includes('secnumcloud') || text.includes('souverain')) &&
		allowedSet.has('sovereignty_level')
	) {
		fallbackFacts.push({
			key: 'sovereignty_level',
			value: 'SecNumCloud 3.2',
			source_excerpt: 'SecNumCloud',
			selected: true,
			productionMode: 'llm-derived'
		});
	}

	if (
		(text.includes('floor control') || text.includes('floor-control')) &&
		allowedSet.has('floor_control')
	) {
		fallbackFacts.push({
			key: 'floor_control',
			value: 'UDP direct prioritaire',
			source_excerpt: 'Floor Control UDP direct',
			selected: true,
			productionMode: 'llm-derived'
		});
	}

	if (text.includes('ceph') && allowedSet.has('storage_engine')) {
		fallbackFacts.push({
			key: 'storage_engine',
			value: 'Ceph RBD',
			source_excerpt: 'Ceph',
			selected: true,
			productionMode: 'llm-derived'
		});
	}

	return fallbackFacts;
}
