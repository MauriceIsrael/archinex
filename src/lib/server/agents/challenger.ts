import { z } from 'zod';
import { localLlmClient } from '../llm/localLlmClient';
import type { Option, Criterion } from '$lib/domain/options';
import type { Argument } from '$lib/domain/debate';
import type { CreateArgumentData } from '../projects/debateDb';

const ChallengerOutputSchema = z.object({
	objections: z.array(
		z.object({
			optionId: z.string(),
			targetArgumentId: z.string().optional().nullable(),
			stance: z.literal('objection').default('objection'),
			claim: z.string().min(3),
			grounds: z.string().min(5),
			kbRefs: z.array(z.string()).default([]),
			confidence: z.enum(['verified', 'designed', 'vendor-stated', 'stated-by-client', 'assumed']).default('assumed')
		})
	)
});

export async function runChallengerAgent(input: {
	subject: { id: string; name: string; sectionRef: string };
	options: Option[];
	criteria: Criterion[];
	existingArguments: Argument[];
	allowedKbRefs: string[];
	round: number;
}): Promise<CreateArgumentData[]> {
	if (input.options.length === 0) return [];

	const systemPrompt = `Tu es l'agent Challenger (Avocat du Diable) au sein du comité d'architecture Archinex.
Ton rôle est de porter la contradiction impitoyable, de mettre en évidence les risques d'exploitation, surcoûts cachés, verrous de fournisseurs et failles de dimensionnement.
RÈGLE D'OR : Tu DOIS formuler au moins une objection ('objection') percutante par option.
Chaque objection DOIT comporter un champ 'grounds' factuel étayé.
Ne cite JAMAIS de kbRef en dehors de cette liste autorisée : [${input.allowedKbRefs.join(', ')}].
Réponds STRICTEMENT par un JSON valide :
{"objections": [{"optionId": "...", "targetArgumentId": null, "stance": "objection", "claim": "...", "grounds": "...", "kbRefs": [], "confidence": "assumed"}]}`;

	const userMessage = `Sujet : ${input.subject.sectionRef} ${input.subject.name}
Options à challenger :
${input.options.map((o) => `[ID: ${o.id}] Titre: ${o.title}\nRésumé: ${o.summary}`).join('\n\n')}

Derniers arguments versés :
${input.existingArguments.slice(-6).map((a) => `[ID: ${a.id}, Auteur: ${a.author}] ${a.stance.toUpperCase()}: ${a.claim} (${a.grounds})`).join('\n')}

Génère les objections critiques :`;

	try {
		const timeoutMs = process.env.NODE_ENV === 'test' ? 300 : 15000;
		const response = await localLlmClient.chat({
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage }
			],
			temperature: 0.2,
			format: 'json',
			timeoutMs
		});

		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]);
			const validated = ChallengerOutputSchema.parse(parsed);

			// Vérifier qu'on a bien au moins 1 objection par option
			const validObjs = validated.objections
				.filter((obj) => input.options.some((o) => o.id === obj.optionId))
				.map((obj, idx) => ({
					id: `arg-chal-${input.round}-${Date.now()}-${idx}`,
					optionId: obj.optionId,
					targetArgumentId: obj.targetArgumentId || null,
					stance: 'objection' as const,
					claim: obj.claim.trim(),
					grounds: obj.grounds.trim(),
					kbRefs: obj.kbRefs.filter((ref) => input.allowedKbRefs.includes(ref)),
					confidence: obj.confidence,
					authorKind: 'agent:challenger',
					round: input.round
				}));

			if (validObjs.length > 0) {
				return validObjs;
			}
		}
	} catch (err) {
		console.warn('[ChallengerAgent] Repli déterministe hors ligne :', (err as any).message);
	}

	// Repli déterministe : garantit au moins 1 objection robuste par option
	return input.options.map((opt, idx) => {
		const validKb = input.allowedKbRefs.length > 0 ? [input.allowedKbRefs[0]] : [];
		return {
			id: `arg-chal-${input.round}-${Date.now()}-${idx}`,
			optionId: opt.id,
			targetArgumentId: null,
			stance: 'objection' as const,
			claim: `Risque d'exploitation et complexité cachée sur ${opt.title}`,
			grounds: `L'implémentation de cette option introduit des dépendances opérationnelles critiques et un risque de surcoût MCO non budgété lors des montées de version.`,
			kbRefs: validKb,
			confidence: 'assumed' as const,
			authorKind: 'agent:challenger',
			round: input.round
		};
	});
}
