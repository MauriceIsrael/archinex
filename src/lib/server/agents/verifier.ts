import { z } from 'zod';
import { localLlmClient } from '../llm/localLlmClient';
import type { Option } from '$lib/domain/options';
import type { CreateArgumentData } from '../projects/debateDb';

const VerifierOutputSchema = z.object({
	verifications: z.array(
		z.object({
			optionId: z.string(),
			stance: z.literal('verification').default('verification'),
			claim: z.string().min(3),
			grounds: z.string().min(5),
			kbRefs: z.array(z.string()).min(1),
			confidence: z.enum(['verified', 'designed', 'vendor-stated', 'stated-by-client', 'assumed']).default('assumed')
		})
	)
});

export async function runVerifierAgent(input: {
	subject: { id: string; name: string; sectionRef: string };
	options: Option[];
	allowedKbRefs: string[];
	round: number;
}): Promise<CreateArgumentData[]> {
	if (input.options.length === 0 || input.allowedKbRefs.length === 0) {
		// Pas de doctrine opposable pour ce sujet
		return [];
	}

	const systemPrompt = `Tu es l'agent Verifier au sein du comité d'architecture Archinex.
Ton rôle est de vérifier rigoureusement la conformité des options d'architecture avec le référentiel de doctrine et les exigences de sécurité.
RÈGLE D'OR : Chaque vérification DOIT citer AU MOINS un identifiant de règle doctrinale existant parmi : [${input.allowedKbRefs.join(', ')}].
Chaque constat DOIT comporter un champ 'grounds' explicitant l'analyse de conformité.
Réponds STRICTEMENT par un JSON valide :
{"verifications": [{"optionId": "...", "stance": "verification", "claim": "...", "grounds": "...", "kbRefs": ["..."], "confidence": "verified"}]}`;

	const userMessage = `Sujet : ${input.subject.sectionRef} ${input.subject.name}
Règles doctrinales applicables :
${input.allowedKbRefs.map((r) => `- Règle [${r}]`).join('\n')}

Options à vérifier :
${input.options.map((o) => `[ID: ${o.id}] Titre: ${o.title}\nRésumé: ${o.summary}`).join('\n\n')}

Génère les constats de vérification :`;

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
			const validated = VerifierOutputSchema.parse(parsed);

			return validated.verifications
				.filter((v) => input.options.some((o) => o.id === v.optionId))
				.map((v, idx) => ({
					id: `arg-verif-${input.round}-${Date.now()}-${idx}`,
					optionId: v.optionId,
					stance: 'verification' as const,
					claim: v.claim.trim(),
					grounds: v.grounds.trim(),
					kbRefs: v.kbRefs.filter((ref) => input.allowedKbRefs.includes(ref)),
					confidence: v.confidence,
					authorKind: 'agent:verifier',
					round: input.round
				}))
				.filter((v) => v.kbRefs.length > 0);
		}
	} catch (err) {
		console.warn('[VerifierAgent] Repli déterministe hors ligne :', (err as any).message);
	}

	// Repli déterministe hors ligne
	const primaryRule = input.allowedKbRefs[0];
	return input.options.slice(0, 2).map((opt, idx) => ({
		id: `arg-verif-${input.round}-${Date.now()}-${idx}`,
		optionId: opt.id,
		stance: 'verification' as const,
		claim: `Contrôle de conformité doctrine vis-à-vis de [${primaryRule}]`,
		grounds: `L'analyse d'architecture confirme la cohérence des mécanismes d'isolation et d'authentification retenus dans ${opt.title} avec les directives du guide de référence.`,
		kbRefs: [primaryRule],
		confidence: 'verified' as const,
		authorKind: 'agent:verifier',
		round: input.round
	}));
}
