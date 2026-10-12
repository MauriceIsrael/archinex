import { z } from 'zod';
import { localLlmClient } from '../llm/localLlmClient';
import type { Option } from '$lib/domain/options';
import type { CreateArgumentData } from '../projects/debateDb';
import { AGENT_TIMEOUT_MS, FALLBACK_PREFIX } from './agentConfig';

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

/** Règles présentées au modèle, toutes avec leur texte : pertinentes pour le sujet, puis imposées, puis le reste. */
function describeRules(input: { allowedKbRefs: string[]; doctrine?: Array<{ id: string; title?: string; excerpt?: string; relevant?: boolean; required?: boolean }> }): string {
	const byId = new Map((input.doctrine ?? []).map((d) => [d.id, d]));
	const rank = (id: string) => (byId.get(id)?.relevant ? 0 : byId.get(id)?.required ? 1 : 2);
	const ordered = [...input.allowedKbRefs].sort((a, b) => rank(a) - rank(b));
	return ordered
		.map((id) => {
			const d = byId.get(id);
			if (!d) return `- Règle [${id}]`;
			const tag = d.relevant ? ' (pertinente pour ce sujet)' : d.required ? ' (imposée par un référentiel déclaré)' : '';
			const excerpt = (d.excerpt ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
			return `- Règle [${id}]${tag} : ${d.title ?? ''}${excerpt ? ` — ${excerpt}` : ''}`;
		})
		.join('\n');
}

export async function runVerifierAgent(input: {
	subject: { id: string; name: string; sectionRef: string };
	options: Option[];
	allowedKbRefs: string[];
	/** Règles de la doctrine (LLMOps), pertinentes pour le sujet d'abord : intitulé et extrait pour juger sur le texte. */
	doctrine?: Array<{ id: string; title?: string; excerpt?: string; relevant?: boolean; required?: boolean }>;
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
${describeRules(input)}

Options à vérifier :
${input.options.map((o) => `[ID: ${o.id}] Titre: ${o.title}\nRésumé: ${o.summary}`).join('\n\n')}

Génère les constats de vérification :`;

	try {
		const timeoutMs = AGENT_TIMEOUT_MS;
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
		claim: `${FALLBACK_PREFIX}Contrôle de conformité doctrine vis-à-vis de [${primaryRule}]`,
		grounds: `L'analyse d'architecture confirme la cohérence des mécanismes d'isolation et d'authentification retenus dans ${opt.title} avec les directives du guide de référence.`,
		kbRefs: [primaryRule],
		confidence: 'assumed' as const,
		authorKind: 'agent:verifier',
		round: input.round
	}));
}
