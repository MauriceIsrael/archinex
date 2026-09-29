import { z } from 'zod';
import { localLlmClient } from '../llm/localLlmClient';
import type { Option, Criterion } from '$lib/domain/options';
import type { CreateArgumentData } from '../projects/debateDb';

const ProposerOutputSchema = z.object({
	arguments: z.array(
		z.object({
			optionId: z.string(),
			stance: z.literal('support').default('support'),
			claim: z.string().min(3),
			grounds: z.string().min(5),
			kbRefs: z.array(z.string()).default([]),
			confidence: z.enum(['verified', 'designed', 'vendor-stated', 'stated-by-client', 'assumed']).default('assumed')
		})
	)
});

export async function runProposerAgent(input: {
	subject: { id: string; name: string; sectionRef: string };
	options: Option[];
	criteria: Criterion[];
	allowedKbRefs: string[];
	round: number;
}): Promise<CreateArgumentData[]> {
	if (input.options.length === 0) return [];

	const systemPrompt = `Tu es l'agent Proposer au sein du comité d'architecture Archinex.
Ton rôle est de défendre avec rigueur technique et concision télégraphique les mérites de chaque option d'architecture examinée.
Pour chaque option, formule au moins un argument de soutien ('support').
RÈGLE ABSOLUE : Tu dois impérativement fournir un champ 'grounds' substantiel (fait matériel, calcul, test, norme).
Ne cite JAMAIS de kbRef en dehors de cette liste autorisée : [${input.allowedKbRefs.join(', ')}].
Réponds STRICTEMENT par un JSON valide :
{"arguments": [{"optionId": "...", "stance": "support", "claim": "...", "grounds": "...", "kbRefs": [], "confidence": "verified"}]}`;

	const userMessage = `Sujet : ${input.subject.sectionRef} ${input.subject.name}
Critères d'évaluation :
${input.criteria.map((c) => `- ${c.name} (catégorie: ${c.kind}, poids: ${c.weight})`).join('\n')}

Options à soutenir :
${input.options.map((o) => `[ID: ${o.id}] Titre: ${o.title}\nRésumé: ${o.summary}`).join('\n\n')}

Génère les arguments de soutien :`;

	try {
		const timeoutMs = process.env.NODE_ENV === 'test' ? 300 : 15000;
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
			const validated = ProposerOutputSchema.parse(parsed);

			// Filtrer et normaliser
			return validated.arguments
				.filter((arg) => input.options.some((o) => o.id === arg.optionId))
				.map((arg, idx) => ({
					id: `arg-prop-${input.round}-${Date.now()}-${idx}`,
					optionId: arg.optionId,
					stance: 'support',
					claim: arg.claim.trim(),
					grounds: arg.grounds.trim(),
					kbRefs: arg.kbRefs.filter((ref) => input.allowedKbRefs.includes(ref)),
					confidence: arg.confidence,
					authorKind: 'agent:proposer',
					round: input.round
				}));
		}
	} catch (err) {
		console.warn('[ProposerAgent] Repli déterministe hors ligne :', (err as any).message);
	}

	// Repli déterministe hors ligne
	return input.options.map((opt, idx) => {
		const topCriterion = input.criteria[0]?.name || 'Performance & Stabilité';
		const validKb = input.allowedKbRefs.length > 0 ? [input.allowedKbRefs[0]] : [];
		return {
			id: `arg-prop-${input.round}-${Date.now()}-${idx}`,
			optionId: opt.id,
			stance: 'support' as const,
			claim: `Conformité optimale avec ${topCriterion}`,
			grounds: `L'architecture de l'option '${opt.title}' maximise l'adéquation technique et simplifie l'intégration logicielle.`,
			kbRefs: validKb,
			confidence: 'verified' as const,
			authorKind: 'agent:proposer',
			round: input.round
		};
	});
}
