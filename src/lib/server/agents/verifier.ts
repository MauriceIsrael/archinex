import { z } from 'zod';
import { localLlmClient } from '../llm/localLlmClient';
import type { Option } from '$lib/domain/options';
import type { VerificationVerdict } from '$lib/domain/debate';
import type { CreateArgumentData } from '../projects/debateDb';
import { INTERACTIVE_AGENT_TIMEOUT_MS } from './agentConfig';

const VerifierVerdictSchema = z.enum(['compliant', 'violates', 'not_applicable', 'unknown']);

const VerifierOutputSchema = z.object({
	verifications: z.array(
		z.object({
			optionId: z.string(),
			stance: z.literal('verification').default('verification'),
			verdict: VerifierVerdictSchema.default('unknown'),
			ruleId: z.string().optional(),
			evidence: z.string().optional(),
			claim: z.string().min(3),
			grounds: z.string().optional(),
			kbRefs: z.array(z.string()).optional(),
			confidence: z.enum(['verified', 'designed', 'vendor-stated', 'stated-by-client', 'assumed']).default('assumed')
		})
	)
});

export interface VerifierRunResult {
	status: 'evaluated' | 'not_evaluated';
	reason?: string;
	arguments: CreateArgumentData[];
}

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

function resolveOptionId(rawOptionId: string, options: Option[]): string | null {
	const trimmed = rawOptionId.trim();
	if (!trimmed) return options.length === 1 ? options[0].id : null;
	const exact = options.find((o) => o.id === trimmed);
	if (exact) return exact.id;
	const lower = trimmed.toLowerCase();
	const byTitle = options.filter((o) => o.title.trim().toLowerCase() === lower);
	if (byTitle.length === 1) return byTitle[0].id;
	return options.length === 1 ? options[0].id : null;
}

export async function runVerifierAgentWithStatus(input: {
	subject: { id: string; name: string; sectionRef: string };
	options: Option[];
	allowedKbRefs: string[];
	/** Règles de la doctrine (LLMOps), pertinentes pour le sujet d'abord : intitulé et extrait pour juger sur le texte. */
	doctrine?: Array<{ id: string; title?: string; excerpt?: string; relevant?: boolean; required?: boolean }>;
	round: number;
}): Promise<VerifierRunResult> {
	if (input.options.length === 0 || input.allowedKbRefs.length === 0) {
		// Pas de doctrine opposable pour ce sujet
		return { status: 'not_evaluated', reason: 'Aucune option ou règle doctrinale applicable.', arguments: [] };
	}

	const systemPrompt = `Tu es l'agent Verifier au sein du comité d'architecture Archinex.
Ton rôle est de vérifier rigoureusement la conformité des options d'architecture avec le référentiel de doctrine et les exigences de sécurité.
RÈGLE D'OR : Chaque vérification DOIT citer AU MOINS un identifiant de règle doctrinale existant parmi : [${input.allowedKbRefs.join(', ')}] (via ruleId et/ou kbRefs).
Chaque constat DOIT fournir un verdict structuré strict parmi : "compliant" | "violates" | "not_applicable" | "unknown", ainsi qu'un champ 'evidence' (ou 'grounds') explicitant l'analyse de conformité.
Utilise "unknown" si l'information est insuffisante pour conclure ; "unknown" ne vaut jamais "compliant".
En tant qu'agent IA (mode llm-derived), ne renvoie JAMAIS "confidence": "verified" (réservé à la validation humaine) ; utilise au maximum "designed" ou "assumed".
Réponds STRICTEMENT par un JSON valide :
{"verifications": [{"optionId": "...", "stance": "verification", "verdict": "compliant|violates|not_applicable|unknown", "ruleId": "...", "evidence": "...", "claim": "...", "grounds": "...", "kbRefs": ["..."], "confidence": "designed"}]}`;

	const userMessage = `Sujet : ${input.subject.sectionRef} ${input.subject.name}
Règles doctrinales applicables :
${describeRules(input)}

Options à vérifier :
${input.options.map((o) => `[ID: ${o.id}] Titre: ${o.title}\nRésumé: ${o.summary}`).join('\n\n')}

Génère les constats de vérification :`;

	try {
		const timeoutMs = INTERACTIVE_AGENT_TIMEOUT_MS;
		const response = await localLlmClient.chat({
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage }
			],
			temperature: 0.1,
			format: 'json',
			effort: 'medium',
			timeoutMs
		});

		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			console.warn('[VerifierAgent] Sortie LLM sans bloc JSON exploitable — état non évalué.');
			return { status: 'not_evaluated', reason: 'Sortie JSON invalide ou absente.', arguments: [] };
		}

		const parsed = JSON.parse(jsonMatch[0]);
		const validated = VerifierOutputSchema.parse(parsed);

		const validVerifications = validated.verifications
			.map((v, idx) => {
				const resolvedOptionId = resolveOptionId(v.optionId, input.options);
				if (!resolvedOptionId) return null;
				const rawRefs = [...(v.kbRefs ?? []), ...(v.ruleId ? [v.ruleId] : [])];
				const validKbRefs = Array.from(new Set(rawRefs.filter((ref) => input.allowedKbRefs.includes(ref))));
				if (validKbRefs.length === 0) return null;
				const groundsText = (v.grounds?.trim() || v.evidence?.trim() || '').trim();
				if (groundsText.length < 5) return null;
				const verdict: VerificationVerdict = v.verdict ?? 'unknown';
				return {
					id: `arg-verif-${input.round}-${Date.now()}-${idx}`,
					optionId: resolvedOptionId,
					stance: 'verification' as const,
					verdict,
					claim: v.claim.trim(),
					grounds: groundsText,
					kbRefs: validKbRefs,
					confidence: v.confidence,
					authorKind: 'agent:verifier',
					round: input.round
				};
			})
			.filter((v): v is NonNullable<typeof v> => v !== null);

		if (validVerifications.length > 0) {
			return { status: 'evaluated', arguments: validVerifications };
		}
		console.warn(
			'[VerifierAgent] Aucune vérification exploitable après filtrage (optionId/kbRefs/evidence non reconnus) — état non évalué.'
		);
		return {
			status: 'not_evaluated',
			reason: 'Aucune vérification exploitable après validation des identifiants d’option et de règle.',
			arguments: []
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.warn('[VerifierAgent] Modèle indisponible ou sortie invalide — état non évalué :', message);
		return {
			status: 'not_evaluated',
			reason: `Modèle indisponible ou sortie invalide : ${message}`,
			arguments: []
		};
	}
}

export async function runVerifierAgent(input: {
	subject: { id: string; name: string; sectionRef: string };
	options: Option[];
	allowedKbRefs: string[];
	doctrine?: Array<{ id: string; title?: string; excerpt?: string; relevant?: boolean; required?: boolean }>;
	round: number;
}): Promise<CreateArgumentData[]> {
	const result = await runVerifierAgentWithStatus(input);
	return result.arguments;
}
