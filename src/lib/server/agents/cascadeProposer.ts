import { z } from 'zod';
import { localLlmClient, LocalLlmClient } from '../llm/localLlmClient';
import { encodeToyBow } from '../similarity/embeddings';
import type {
	CascadeQuestion,
	CascadePossibleDuplicate
} from '$lib/domain/cascade';

/**
 * Calcul du produit scalaire / similarité cosinus entre deux vecteurs normés.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dot / denom;
}

/**
 * Détecte si un texte proposé présente une similarité sémantique avec un sujet existant
 * au-delà du seuil calibré (A14).
 */
export function detectPossibleDuplicate(
	candidateText: string,
	existingSubjects: Array<{ id: string; name: string; sectionRef?: string; problemStatement?: string }>,
	calibratedThreshold: number
): CascadePossibleDuplicate | null {
	if (!existingSubjects || existingSubjects.length === 0 || !calibratedThreshold) {
		return null;
	}

	const candidateVec = encodeToyBow(candidateText);
	let bestMatch: CascadePossibleDuplicate | null = null;
	let highestScore = 0;

	for (const subj of existingSubjects) {
		const subjText = `${subj.name} ${subj.problemStatement || ''}`;
		const subjVec = encodeToyBow(subjText);
		const score = cosineSimilarity(candidateVec, subjVec);

		if (score >= calibratedThreshold && score > highestScore) {
			highestScore = score;
			bestMatch = {
				subjectId: subj.id,
				subjectName: subj.name,
				sectionRef: subj.sectionRef,
				score: Math.round(score * 1000) / 1000,
				threshold: calibratedThreshold
			};
		}
	}

	return bestMatch;
}

const CascadeProposerOutputSchema = z.object({
	questions: z.array(
		z.object({
			text: z.string().min(5),
			subjectName: z.string().min(2),
			grounds: z.string().min(5)
		})
	)
});

export interface CascadeProposerInput {
	parentSubject: {
		id: string;
		name: string;
		sectionRef?: string;
	};
	decision: {
		id: string;
		retainedOptionTitle?: string;
		rationale?: string;
		reversibility?: string;
	};
	affirmedFacts: Array<{ key: string; value: string }>;
	existingQuestions: Array<{ id: string; text: string; subjectName: string }>;
	existingSubjects: Array<{ id: string; name: string; sectionRef?: string; problemStatement?: string }>;
	calibratedThreshold?: number;
	client?: LocalLlmClient;
}

/**
 * Agent Proposeur de cascade (A29) :
 * - Identifie les angles morts non couverts par les règles de référence du référentiel.
 * - Propose au plus 2 questions complémentaires, chacune avec son fondement.
 * - Compare aux sujets existants pour détecter les doublons selon le seuil calibré (A14).
 * - En cas d'erreur ou d'indisponibilité du LLM, renvoie [] sans bloquer l'affirmation ni la cascade déterministe.
 */
export async function runCascadeProposerAgent(
	input: CascadeProposerInput
): Promise<CascadeQuestion[]> {
	const {
		parentSubject,
		decision,
		affirmedFacts,
		existingQuestions,
		existingSubjects,
		calibratedThreshold = 0.65,
		client = localLlmClient
	} = input;

	const factsSummary = affirmedFacts.map((f) => `- ${f.key}: ${f.value}`).join('\n');
	const coveredQuestions = existingQuestions.map((q) => `- ${q.subjectName}: « ${q.text} »`).join('\n');

	const systemPrompt = `Tu es l'agent Proposeur d'Archinex (rôle K15 / A29).
Ton rôle : après une décision d'architecture, détecter les angles morts techniques ou opérationnels non couverts par les règles standard.
Exemple : « Avez-vous évalué l'impact sur la latence du cœur 5G ? » ou « Quelle stratégie d'isolation des réseaux d'administration ? ».

RÈGLES IMPÉRATIVES :
1. Propose AU PLUS 2 questions complémentaires (0, 1 ou 2).
2. Ne propose JAMAIS une question déjà couverte par les questions existantes suivantes :
${coveredQuestions || '(aucune question existante)'}
3. Pour chaque question, fournis obligatoirement un fondement technique précis (grounds).
4. Tes suggestions sont proposées et llm-derived, elles ne dérivent d'aucune règle prédéfinie.
5. Réponds STRICTEMENT en JSON :
{"questions": [{"text": "...", "subjectName": "...", "grounds": "..."}]}`;

	const userMessage = `Sujet Parent : ${parentSubject.sectionRef || '§'} ${parentSubject.name}
Décision affirmée : ${decision.retainedOptionTitle || 'Option retenue'}
Motivation : ${decision.rationale || 'Non spécifiée'}
Réversibilité : ${decision.reversibility || 'costly'}

Faits affirmés en vigueur :
${factsSummary || '(aucun fait affirmé)'}

Formule au plus 2 questions complémentaires pertinentes :`;

	try {
		const timeoutMs = process.env.NODE_ENV === 'test' ? 300 : 15000;
		const response = await client.chat({
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage }
			],
			temperature: 0.3,
			format: 'json',
			timeoutMs
		});

		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			return [];
		}

		const parsed = JSON.parse(jsonMatch[0]);
		const validated = CascadeProposerOutputSchema.parse(parsed);

		// STRICTEMENT au plus 2 questions
		const cappedQuestions = validated.questions.slice(0, 2);

		const result: CascadeQuestion[] = cappedQuestions.map((q, idx) => {
			const candidateSearchText = `${q.subjectName} ${q.text}`;
			const possibleDuplicate = detectPossibleDuplicate(
				candidateSearchText,
				existingSubjects,
				calibratedThreshold
			);

			const qId = `q-agent-${parentSubject.id}-${idx + 1}`;
			const childId = `sub-child-agent-${parentSubject.id}-${idx + 1}`;

			return {
				id: qId,
				text: q.text,
				subjectName: q.subjectName,
				subjectSectionRef: `${parentSubject.sectionRef || '§4'}.${existingQuestions.length + idx + 1}`,
				sourceType: 'agent',
				mandatory: false,
				status: 'open',
				childSubjectId: childId,
				productionMode: 'llm-derived',
				grounds: q.grounds,
				lineage: {
					parentDecisionId: decision.id,
					parentSubjectId: parentSubject.id,
					parentSubjectName: parentSubject.name,
					triggeringFacts: affirmedFacts
					// Pas de ruleRef ni ruleName : ces questions ne dérivent pas d'une règle (Critère d'acceptation 1)
				},
				initialLevel: 'L0_named',
				prefillFraming: {
					problemStatement: q.text,
					scope: q.grounds
				},
				possibleDuplicate
			};
		});

		return result;
	} catch (err: any) {
		// RÈGLE CONTRACTUELLE (Critère d'acceptation 2) :
		// Une erreur du modèle n'empêche ni l'affirmation ni la cascade déterministe.
		// Rien n'est simulé localement : les questions de l'agent sont simplement absentes.
		console.warn('[CascadeProposer] Erreur ou délai dépassé du LLM local (questions omises) :', err?.message || err);
		return [];
	}
}
