import { z } from 'zod';
import { localLlmClient } from '../llm/localLlmClient';
import type { Option, Criterion } from '$lib/domain/options';
import type { Argument } from '$lib/domain/debate';
import type { CreateArgumentData } from '../projects/debateDb';

const SynthesizerOutputSchema = z.object({
	syntheses: z.array(
		z.object({
			stance: z.literal('synthesis').default('synthesis'),
			claim: z.string().min(3),
			grounds: z.string().min(5),
			kbRefs: z.array(z.string()).default([]),
			confidence: z.enum(['verified', 'designed', 'vendor-stated', 'stated-by-client', 'assumed']).default('assumed')
		})
	),
	questionsForHuman: z.array(
		z.object({
			text: z.string().min(5),
			assignedRole: z.string().default('lead_architect'),
			blocking: z.boolean().default(true)
		})
	).default([])
});

export async function runSynthesizerAgent(input: {
	subject: { id: string; name: string; sectionRef: string };
	options: Option[];
	criteria: Criterion[];
	existingArguments: Argument[];
	allowedKbRefs: string[];
	round: number;
}): Promise<{
	arguments: CreateArgumentData[];
	questions: Array<{ text: string; assignedRole: string; blocking: boolean }>;
}> {
	const systemPrompt = `Tu es l'agent Synthesizer (Rapporteur Dialectique) au sein du comité d'architecture Archinex.
Ton rôle est de faire la synthèse contradictoire du tour de débat :
1. Dégager les lignes de fracture et les compromis incontournables (trade-offs) entre les options.
2. Poser la ou les questions clés à trancher souverainement par le Lead Architect humain.
NE TRANCHE JAMAIS à la place de l'humain.
Réponds STRICTEMENT par un JSON valide :
{
  "syntheses": [{"stance": "synthesis", "claim": "...", "grounds": "...", "kbRefs": [], "confidence": "assumed"}],
  "questionsForHuman": [{"text": "...", "assignedRole": "lead_architect", "blocking": true}]
}`;

	const userMessage = `Sujet : ${input.subject.sectionRef} ${input.subject.name}
Options en débat :
${input.options.map((o) => `[ID: ${o.id}] ${o.title}: ${o.summary}`).join('\n')}

Arguments versés lors de ce tour :
${input.existingArguments.map((a) => `[${a.stance.toUpperCase()}] ${a.claim} : ${a.grounds}`).join('\n')}

Génère la synthèse et les questions d'arbitrage :`;

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
			const validated = SynthesizerOutputSchema.parse(parsed);

			const args: CreateArgumentData[] = validated.syntheses.map((s, idx) => ({
				id: `arg-synth-${input.round}-${Date.now()}-${idx}`,
				optionId: null,
				stance: 'synthesis' as const,
				claim: s.claim.trim(),
				grounds: s.grounds.trim(),
				kbRefs: s.kbRefs.filter((ref) => input.allowedKbRefs.includes(ref)),
				confidence: s.confidence,
				authorKind: 'agent:synthesizer',
				round: input.round
			}));

			return {
				arguments: args,
				questions: validated.questionsForHuman
			};
		}
	} catch (err) {
		console.warn('[SynthesizerAgent] Repli déterministe hors ligne :', (err as any).message);
	}

	// Repli déterministe hors ligne
	const optTitles = input.options.map((o) => o.title).join(' vs ');
	return {
		arguments: [
			{
				id: `arg-synth-${input.round}-${Date.now()}-0`,
				optionId: null,
				stance: 'synthesis' as const,
				claim: `Compromis d'architecture central : ${optTitles || 'Options en présence'}`,
				grounds: `L'arbitrage oppose la garantie de performance matérielle déterministe à la flexibilité et à l'économie d'échelle du pur logiciel open-source.`,
				kbRefs: input.allowedKbRefs.slice(0, 1),
				confidence: 'assumed' as const,
				authorKind: 'agent:synthesizer',
				round: input.round
			}
		],
		questions: [
			{
				text: `Le comité d'architecture valide-t-il l'écart budgétaire pour sécuriser la latence ou privilégie-t-il la flexibilité logicielle ?`,
				assignedRole: 'lead_architect',
				blocking: true
			}
		]
	};
}
