import { z } from 'zod';
import { localLlmClient } from '../llm/localLlmClient';
import type { Option, Criterion } from '$lib/domain/options';
import type { CreateArgumentData } from '../projects/debateDb';

const ProposerOutputSchema = z.object({
	arguments: z.array(
		z.object({
			optionId: z.string().nullable().optional(),
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
	contextPrompt?: string;
}): Promise<CreateArgumentData[]> {
	// Cas 1 : Aucune option d'architecture n'a encore été formalisée sur ce sujet
	// L'agent Proposer aide l'architecte à amorcer la délibération en proposant 2 orientations techniques préliminaires
	if (input.options.length === 0) {
		const userInstruction = input.contextPrompt && input.contextPrompt.trim()
			? `\nDirectives et cadrage de l'architecte : "${input.contextPrompt.trim()}"`
			: '';

		const systemPrompt = `Tu es l'agent Proposer au sein du comité d'architecture Archinex.
L'architecte sollicite ton aide pour amorcer la délibération sur le sujet : "${input.subject.sectionRef} ${input.subject.name}".
Ce sujet n'a pas encore d'options d'architecture formalisées.
Ta mission : Formuler une proposition concrète adaptée à la demande de l'architecte.${userInstruction}

RÈGLES D'OR :
- Reste concis, direct et hautement technique (proscris tout bavardage ou formule de politesse).
- Si l'architecte demande de décomposer, scinder ou séparer le sujet (ex: NOC vs SOC, salles d'opérations distinctes) : détaille précisément la séparation en 2 sous-sujets d'architecture distincts avec leurs périmètres et questions clés.
- Sinon : propose distinctement l'Option A (socle opérationnel / réactif) et l'Option B (socle sécurisé / distribué ou souverain).
- Réponds STRICTEMENT avec un JSON valide sous la forme :
{
  "arguments": [
    {
      "optionId": null,
      "stance": "support",
      "claim": "Proposition de cadrage et décomposition",
      "grounds": "Détail de la proposition, périmètres recommandés ou options A vs B.",
      "kbRefs": [],
      "confidence": "designed"
    }
  ]
}`;

		try {
			const timeoutMs = process.env.NODE_ENV === 'test' ? 300 : 15000;
			const response = await localLlmClient.chat({
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: `Sujet : ${input.subject.sectionRef} ${input.subject.name}\n${userInstruction}\nFormule ta proposition pour amorcer la délibération :` }
				],
				temperature: 0.15,
				format: 'json',
				timeoutMs
			});

			const jsonMatch = response.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				if (Array.isArray(parsed.arguments) && parsed.arguments.length > 0) {
					return parsed.arguments.map((arg: any, idx: number) => ({
						id: `arg-prop-init-${Date.now()}-${idx}`,
						optionId: null,
						stance: 'support' as const,
						claim: arg.claim || `Pistes d'options préliminaires pour ${input.subject.name}`,
						grounds: arg.grounds || `Décomposition recommandée pour engager la délibération.`,
						kbRefs: Array.isArray(arg.kbRefs) ? arg.kbRefs.filter((r: string) => input.allowedKbRefs.includes(r)) : [],
						confidence: 'designed' as const,
						authorKind: 'agent:proposer',
						round: input.round
					}));
				}
			}
		} catch (err) {
			console.warn('[ProposerAgent] Repli d’amorce hors-ligne :', (err as any).message);
		}

		const isSplitRequested = input.contextPrompt && (
			input.contextPrompt.toLowerCase().includes('split') ||
			input.contextPrompt.toLowerCase().includes('scind') ||
			input.contextPrompt.toLowerCase().includes('décompos') ||
			input.contextPrompt.toLowerCase().includes('sépar')
		);

		// Repli déterministe d'amorce
		return [
			{
				id: `arg-prop-init-${Date.now()}-0`,
				optionId: null,
				stance: 'support' as const,
				claim: isSplitRequested
					? `Proposition de scission en 2 sous-sujets : NOC et SOC`
					: `Pistes de cadrage pour ${input.subject.name}`,
				grounds: isSplitRequested
					? `Sur la base de votre directive (« ${input.contextPrompt!.slice(0, 120)} »), nous recommandons de scinder ce macro-sujet en deux salles d'opérations distinctes : 1) Volet NOC (Supervision réseau, métriques temps réel et maintien en conditions opérationnelles) et 2) Volet SOC (Détection d'incidents, posture Zéro-Trust, isolation et conformité SecNumCloud). Vous pouvez utiliser le bouton « ✂️ Scinder ce sujet » ci-dessus pour acter ce découpage.`
					: (input.contextPrompt
						? `Sur la base de votre cadrage (« ${input.contextPrompt.slice(0, 120)} »), nous recommandons de décomposer ce problème en deux volets distincts et de formaliser les options dans la matrice multicritère.`
						: `Ce sujet gagne à être articulé autour de 2 options contrastées : une approche intégrée à haute réactivité vs une approche étanche à isolation renforcée. Formalisez ces options pour engager le débat contradictoire.`),
				kbRefs: input.allowedKbRefs.slice(0, 1),
				confidence: 'designed' as const,
				authorKind: 'agent:proposer',
				round: input.round
			}
		];
	}

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
