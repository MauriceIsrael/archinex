/**
 * Directeur Éditorial assisté par LLM (#427).
 * Évalue les signaux structurés d'un sujet via `LocalLlmClient` pour recommander les vues éditoriales
 * les plus pertinentes, un éventuel `focalId` (validé contre les identifiants réels du modèle)
 * et une annotation de marge — sans jamais laisser le LLM dessiner le SVG.
 * Repli automatique et transparent sur l'évaluateur déterministe si le LLM est indisponible.
 */

import { z } from 'zod';
import { LocalLlmClient } from '$lib/server/llm/localLlmClient';
import {
	recommendEditorialViews,
	type EditorialViewRecommendation,
	type SubjectEditorialSignals
} from '$lib/domain/editorialSvg';

const LlmRecommendationItemSchema = z.object({
	viewId: z.enum([
		'traceable-blocks',
		'requirement-traceability',
		'architecture-delta',
		'paired-policy-traces',
		'compensating-layers',
		'decision-heatmap'
	]),
	score: z.number().min(0).max(100),
	rationale: z.string().min(4).max(240),
	suggestedDetail: z.enum(['simplified', 'balanced', 'faithful']).default('balanced'),
	suggestedAudience: z.enum(['engineer', 'mixed', 'executive']).default('mixed'),
	focalId: z.string().optional()
});

const LlmRecommendationResponseSchema = z.object({
	recommendations: z.array(LlmRecommendationItemSchema).min(1).max(6),
	calloutText: z.string().max(120).optional()
});

export interface EditorialDirectorInput {
	subjectName: string;
	sectionRef?: string;
	signals: SubjectEditorialSignals;
	validEntityIds: string[];
}

export interface EditorialDirectorResult {
	source: 'llm' | 'deterministic';
	recommendations: EditorialViewRecommendation[];
	calloutText?: string;
	fallbackReason?: string;
}

const VIEW_LABELS: Record<EditorialViewRecommendation['viewId'], string> = {
	'traceable-blocks': 'Blocs Traçables (TOGAF)',
	'requirement-traceability': 'Traçabilité Exigences',
	'architecture-delta': 'Architecture Delta',
	'paired-policy-traces': 'Traces KB Appariées',
	'compensating-layers': 'Couches Compensatoires',
	'decision-heatmap': 'Matrice Décision'
};

export async function adviseEditorialViewsWithLlm(
	input: EditorialDirectorInput,
	llmClient?: Pick<LocalLlmClient, 'chat'>
): Promise<EditorialDirectorResult> {
	const baseline = recommendEditorialViews(input.signals);
	const validIds = new Set(input.validEntityIds);

	try {
		const client = llmClient ?? new LocalLlmClient();
		const systemPrompt = [
			`Tu es le Directeur Éditorial d'Archinex.`,
			`Ta mission : classer les vues SVG éditoriales les plus pertinentes à afficher pour un sujet d'architecture.`,
			`Tu ne dessines JAMAIS de SVG. Tu réponds UNIQUEMENT en JSON valide respectant :`,
			`{"recommendations":[{"viewId":"traceable-blocks|requirement-traceability|architecture-delta|paired-policy-traces|compensating-layers|decision-heatmap","score":0..100,"rationale":"1 phrase courte en français","suggestedDetail":"simplified|balanced|faithful","suggestedAudience":"engineer|mixed|executive","focalId":"optionnel, doit appartenir à validEntityIds"}],"calloutText":"optionnel, max 80 caractères"}`
		].join('\n');

		const userPrompt = JSON.stringify({
			subjectName: input.subjectName,
			sectionRef: input.sectionRef,
			signals: input.signals,
			validEntityIds: input.validEntityIds.slice(0, 20)
		});

		const raw = await client.chat({
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			temperature: 0.1,
			format: 'json'
		});

		const jsonMatch = raw.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			return {
				source: 'deterministic',
				recommendations: baseline,
				fallbackReason: 'Réponse LLM non JSON'
			};
		}

		const parsed = LlmRecommendationResponseSchema.safeParse(JSON.parse(jsonMatch[0]));
		if (!parsed.success) {
			return {
				source: 'deterministic',
				recommendations: baseline,
				fallbackReason: 'Schéma JSON LLM invalide'
			};
		}

		// Fusionne les recommandations LLM en validant chaque focalId contre les IDs réels
		const merged: EditorialViewRecommendation[] = parsed.data.recommendations.map((item) => ({
			viewId: item.viewId,
			label: VIEW_LABELS[item.viewId],
			score: Math.round(item.score),
			implementedInPilot: true,
			rationale: item.rationale,
			suggestedDetail: item.suggestedDetail,
			suggestedAudience: item.suggestedAudience,
			focalId: item.focalId && validIds.has(item.focalId) ? item.focalId : undefined,
			source: 'llm'
		}));

		// Complète avec les vues non citées depuis la baseline déterministe
		const seen = new Set(merged.map((m) => m.viewId));
		for (const base of baseline) {
			if (!seen.has(base.viewId)) merged.push(base);
		}
		merged.sort((a, b) => b.score - a.score);

		return {
			source: 'llm',
			recommendations: merged,
			calloutText: parsed.data.calloutText
		};
	} catch (err: unknown) {
		return {
			source: 'deterministic',
			recommendations: baseline,
			fallbackReason: err instanceof Error ? err.message : 'LLM indisponible'
		};
	}
}
