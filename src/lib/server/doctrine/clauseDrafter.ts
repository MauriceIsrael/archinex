import { localLlmClient, type LocalLlmClient } from '$lib/server/llm/localLlmClient';
import type { DraftCheckClauseInput, DraftCheckClause } from '$lib/types/llmops';

const STOPWORDS = new Set([
	'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'l', 'et', 'ou', 'en', 'dans', 'sur', 'pour', 'par',
	'avec', 'sans', 'sous', 'ce', 'cet', 'cette', 'ces', 'qui', 'que', 'quoi', 'dont', 'où', 'est', 'sont', 'a',
	'ont', 'au', 'aux', 'ne', 'pas', 'plus', 'moins', 'tres', 'très', 'aussi', 'bien', 'comme', 'mais', 'donc',
	'the', 'a', 'an', 'and', 'or', 'in', 'on', 'for', 'with', 'without', 'under', 'this', 'that', 'these', 'to',
	'of', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'les',
	'toutes', 'tous', 'tout', 'toute', 'afin', 'doivent', 'doit', 'shall', 'must', 'should', 'all', 'any'
]);

/**
 * Mots-clés thématiques et équivalents bilingues (FR / EN) pour la génération de clauses.
 */
interface TopicPattern {
	pattern: RegExp;
	triggersFr: string[];
	triggersEn: string[];
	expectsFr: string[];
	expectsEn: string[];
	defaultMessage: string;
}

const TOPIC_PATTERNS: TopicPattern[] = [
	{
		pattern: /analyse.*risque|évaluation.*risque|risk.*analys|risk.*assess/i,
		triggersFr: ['analyse de risques', 'évaluation des risques', 'gestion des risques', 'cartographie des risques'],
		triggersEn: ['risk analysis', 'risk assessment', 'risk management', 'risk mapping'],
		expectsFr: ['ebios', 'iso 27005', 'méthodologie formelle', 'matrice des risques'],
		expectsEn: ['formal risk assessment', 'iso 27005', 'risk register', 'threat modeling'],
		defaultMessage: 'Les mesures techniques et organisationnelles doivent être fondées sur une analyse de risques formalisée.'
	},
	{
		pattern: /sauvegarde|continuité|backup|disaster.*recovery|reprise.*activité/i,
		triggersFr: ['sauvegarde', 'continuité d’activité', 'reprise d’activité', 'restauration des données', 'pca', 'pra'],
		triggersEn: ['backup', 'business continuity', 'disaster recovery', 'data restoration', 'bcp', 'drp'],
		expectsFr: ['sauvegarde hors-site', 'sauvegarde immuable', 'règle 3-2-1', 'chiffrée au repos', 'test périodique de restauration'],
		expectsEn: ['off-site backup', 'immutable backup', '3-2-1 backup', 'encrypted backup', 'restoration test'],
		defaultMessage: 'La continuité d’activité impose des sauvegardes régulières, chiffrées, immuables ou hors-site avec tests de restauration.'
	},
	{
		pattern: /authentif|accès|mfa|mot de passe|password|credential|identity|identit|least.*privilege/i,
		triggersFr: ['accès distant', 'authentification', 'connexion administrateur', 'comptes à privilèges', 'accès aux données'],
		triggersEn: ['remote access', 'authentication', 'admin access', 'privileged accounts', 'data access'],
		expectsFr: ['mfa', 'authentification multifacteur', 'double facteur', '2fa', 'fido2', 'moindre privilège'],
		expectsEn: ['mfa', 'multi-factor authentication', '2fa', 'fido2', 'least privilege', 'zero trust'],
		defaultMessage: 'Tout accès distant ou à privilège doit être protégé par une authentification multi-facteurs (MFA).'
	},
	{
		pattern: /chiffre|cryptograph|encrypt|tls|chiffrement/i,
		triggersFr: ['chiffrement', 'données sensibles', 'flux réseau', 'stockage des données', 'données au repos'],
		triggersEn: ['encryption', 'sensitive data', 'network traffic', 'data storage', 'data at rest'],
		expectsFr: ['chiffrement de bout en bout', 'aes-256', 'tls 1.3', 'chiffrement au repos', 'gestion des clés hsm'],
		expectsEn: ['end-to-end encryption', 'aes-256', 'tls 1.3', 'encryption at rest', 'hsm key management'],
		defaultMessage: 'Les données sensibles doivent faire l’objet d’un chiffrement robuste au repos et en transit.'
	},
	{
		pattern: /incident|notification|violation|csirt|alerte|breach/i,
		triggersFr: ['incident de sécurité', 'violation de données', 'détection d’intrusion', 'notification d’incident'],
		triggersEn: ['security incident', 'data breach', 'intrusion detection', 'incident notification'],
		expectsFr: ['procédure d’escalade', 'notification anssi', 'notification csirt', 'délai 24h', 'journalisation centralisée'],
		expectsEn: ['incident response plan', 'csirt notification', '24h notification', 'centralized logging'],
		defaultMessage: 'Les incidents de sécurité doivent être détectés et signalés aux autorités compétentes (CSIRT/ANSSI).'
	},
	{
		pattern: /chaine.*approvisionnement|fournisseur|tiers|supply.*chain|vendor|third.*party/i,
		triggersFr: ['fournisseur', 'sous-traitant', 'chaîne d’approvisionnement', 'prestataire tiers', 'service cloud tiers'],
		triggersEn: ['supplier', 'subcontractor', 'supply chain', 'third-party vendor', 'third-party cloud'],
		expectsFr: ['évaluation des risques tiers', 'clauses contractuelles de sécurité', 'audit fournisseur', 'secnumcloud'],
		expectsEn: ['third-party risk assessment', 'security sla', 'vendor audit', 'contractual safeguards'],
		defaultMessage: 'La sécurité de la chaîne d’approvisionnement et des tiers doit faire l’objet d’exigences contractuelles et d’audits.'
	},
	{
		pattern: /vulnérabilit|correctif|patch|vulnerability|mise à jour/i,
		triggersFr: ['gestion des vulnérabilités', 'mises à jour de sécurité', 'déploiement de correctifs', 'composants logiciels'],
		triggersEn: ['vulnerability management', 'security patches', 'patch management', 'software components'],
		expectsFr: ['scan de vulnérabilités', 'politique de correctifs', 'délai de patch critique', 'sbom'],
		expectsEn: ['vulnerability scanning', 'patch policy', 'critical patch sla', 'sbom'],
		defaultMessage: 'Une gestion continue des vulnérabilités et l’application rapide des correctifs de sécurité sont requises.'
	},
	{
		pattern: /journal|audit|log|traçabilit|monitoring|surveillance/i,
		triggersFr: ['journalisation', 'traces d’audit', 'surveillance des accès', 'monitoring de sécurité'],
		triggersEn: ['logging', 'audit trails', 'access monitoring', 'security monitoring'],
		expectsFr: ['siem', 'soc', 'centralisation des logs', 'conservation des traces', 'horodatage certifié'],
		expectsEn: ['siem', 'soc', 'log aggregation', 'audit retention', 'trusted timestamping'],
		defaultMessage: 'La journalisation et la surveillance continue des événements de sécurité sont indispensables pour la traçabilité.'
	}
];

/**
 * Extraction de termes pertinents à partir d'un texte.
 */
function extractTokens(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9àâäéèêëîïôöùûüç\-_]/gi, ' ')
		.split(/\s+/)
		.map((t) => t.replace(/^[-_]+|[-_]+$/g, '').trim())
		.filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Générateur déterministe de secours en cas d'indisponibilité ou d'erreur du LLM.
 */
export function generateFallbackClause(input: DraftCheckClauseInput): DraftCheckClause {
	const assetId = input.asset_id || (input as any).assetId || '';
	const title = input.asset_title || (input as any).assetTitle || '';
	const titleFr = input.asset_title_fr || (input as any).assetTitleFr || title;
	const excerpt = input.asset_excerpt || (input as any).assetExcerpt || '';
	const framework = input.framework || '';
	const sourceRef = input.source_ref || (input as any).sourceRef || '';
	const fullText = `${title} ${titleFr} ${excerpt}`.trim();

	// Recherche d'un patron thématique correspondant
	for (const tp of TOPIC_PATTERNS) {
		if (tp.pattern.test(fullText)) {
			const triggers = Array.from(new Set([...tp.triggersFr, ...tp.triggersEn]));
			const expects = Array.from(new Set([...tp.expectsFr, ...tp.expectsEn]));
			const prefix = framework ? `${framework}${sourceRef ? ` ${sourceRef}` : ''} : ` : '';

			return {
				kind: 'requires',
				when: { terms_any: triggers },
				expect: { terms_any: expects },
				message: `${prefix}${tp.defaultMessage}`,
				provenance: 'llm-derived'
			};
		}
	}

	// Si aucun patron thématique ne correspond, extraction basée sur les mots-clés du texte
	const tokens = extractTokens(fullText);
	const primaryTokens = Array.from(new Set(tokens)).slice(0, 5);

	const prefix = framework ? `${framework}${sourceRef ? ` ${sourceRef}` : ''} : ` : '';

	const whenTerms = Array.from(
		new Set([
			...primaryTokens,
			assetId ? assetId.toLowerCase() : '',
			titleFr ? titleFr.toLowerCase() : ''
		].filter((t) => t.length >= 3))
	).slice(0, 8);

	const expectTerms = Array.from(
		new Set([
			'conforme',
			'compliant',
			'politique formelle',
			'formal policy',
			'mesure de sécurité',
			'security measure',
			'contrôle documenté',
			'documented control'
		])
	);

	return {
		kind: 'requires',
		when: { terms_any: whenTerms.length ? whenTerms : ['exigence de conformité', 'compliance requirement'] },
		expect: { terms_any: expectTerms },
		message: `${prefix}Le respect de l'exigence « ${titleFr || title || assetId} » doit être explicitement documenté et justifié.`,
		provenance: 'llm-derived'
	};
}

/**
 * Rédige une clause vérifiable assistée par IA pour un contrôle qui n'en possède pas (Issue #99).
 */
export async function draftCheckClause(
	input: DraftCheckClauseInput,
	llm: LocalLlmClient = localLlmClient
): Promise<DraftCheckClause> {
	const assetId = input.asset_id || (input as any).assetId || '';
	const title = input.asset_title || (input as any).assetTitle || '';
	const titleFr = input.asset_title_fr || (input as any).assetTitleFr || title;
	const excerpt = input.asset_excerpt || (input as any).assetExcerpt || '';
	const framework = input.framework || '';
	const sourceRef = input.source_ref || (input as any).sourceRef || '';
	const domains = input.domain || (input as any).domains || [];

	const systemPrompt = `Tu es un expert en gouvernance d'architecture d'entreprise et en conformité réglementaire (NIS2, CRA, DORA, ISO 27001).
Ton rôle est de générer une clause de vérification déterministe (check clause) pour un contrôle architectural issu d'un référentiel réglementaire.

Une clause vérifiable évalue automatiquement les options d'architecture :
1. "when" (déclencheurs) : Liste de mots-clés ou expressions caractérisant la situation ou la brique d'architecture ciblée par l'exigence. Ces termes DOIVENT inclure des équivalents en FRANÇAIS et en ANGLAIS (en minuscules), afin de matcher les options rédigées dans l'une ou l'autre langue.
2. "kind" :
   - "requires" : si l'exigence impose une mesure, technologie ou garantie obligatoire dès que les déclencheurs ("when") sont mentionnés dans l'option.
   - "forbids" : si l'exigence interdit une pratique, une absence de contrôle ou une conception proscrite dès que les déclencheurs ("when") sont mentionnés.
3. "expect" : Si kind === "requires", liste de mots-clés ou expressions obligatoires que l'option DOIT mentionner pour satisfaire le contrôle. DOIT inclure les termes en FRANÇAIS et en ANGLAIS (en minuscules). Si kind === "forbids", omettre ou laisser vide.
4. "message" : Message court et clair en français destiné à l'architecte, rappelant le contrôle et son obligation réglementaire.

INSTRUCTION STRICTE :
Réponds EXCLUSIVEMENT par un objet JSON valide avec cette structure exacte :
{
  "kind": "requires" | "forbids",
  "when": { "terms_any": ["terme1_fr", "term1_en", ...] },
  "expect": { "terms_any": ["attendu1_fr", "expected1_en", ...] },
  "message": "...",
  "provenance": "llm-derived"
}`;

	const userPrompt = `Rédige la clause de vérification déterministe pour le contrôle suivant :

Identifiant : ${assetId}
Titre : ${title}
${titleFr ? `Titre FR : ${titleFr}` : ''}
${framework ? `Référentiel : ${framework}` : ''}
${sourceRef ? `Référence légale : ${sourceRef}` : ''}
${domains?.length ? `Domaines : ${domains.join(', ')}` : ''}

Texte officiel de l'exigence :
"""
${excerpt || title}
"""`;

	try {
		const raw = await llm.chat({
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			format: 'json',
			temperature: 0.1,
			timeoutMs: 15000
		});

		if (!raw || !raw.trim()) {
			return generateFallbackClause(input);
		}

		// Nettoyage Markdown JSON éventuel
		const clean = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
		const parsed = JSON.parse(clean);

		const kind = parsed.kind === 'forbids' ? 'forbids' : 'requires';

		const whenTermsAny = Array.isArray(parsed.when?.terms_any)
			? parsed.when.terms_any.map((t: unknown) => String(t).toLowerCase().trim()).filter(Boolean)
			: [];
		const whenTermsAll = Array.isArray(parsed.when?.terms_all)
			? parsed.when.terms_all.map((t: unknown) => String(t).toLowerCase().trim()).filter(Boolean)
			: undefined;

		const expectTermsAny = Array.isArray(parsed.expect?.terms_any)
			? parsed.expect.terms_any.map((t: unknown) => String(t).toLowerCase().trim()).filter(Boolean)
			: [];
		const expectTermsAll = Array.isArray(parsed.expect?.terms_all)
			? parsed.expect.terms_all.map((t: unknown) => String(t).toLowerCase().trim()).filter(Boolean)
			: undefined;

		// Si le modèle a produit des listes vides pour 'when', retomber sur le fallback
		if (whenTermsAny.length === 0 && (!whenTermsAll || whenTermsAll.length === 0)) {
			return generateFallbackClause(input);
		}

		if (kind === 'requires' && expectTermsAny.length === 0 && (!expectTermsAll || expectTermsAll.length === 0)) {
			return generateFallbackClause(input);
		}

		const message = typeof parsed.message === 'string' && parsed.message.trim()
			? parsed.message.trim()
			: `${framework ? `${framework} : ` : ''}Le contrôle ${titleFr || title} doit être respecté.`;

		return {
			kind,
			when: {
				terms_any: whenTermsAny,
				...(whenTermsAll && whenTermsAll.length > 0 ? { terms_all: whenTermsAll } : {})
			},
			...(kind === 'requires'
				? {
						expect: {
							terms_any: expectTermsAny,
							...(expectTermsAll && expectTermsAll.length > 0 ? { terms_all: expectTermsAll } : {})
						}
				  }
				: {}),
			message,
			provenance: 'llm-derived'
		};
	} catch (e) {
		console.warn(`[clauseDrafter] Échec de l'appel LLM pour ${assetId}, repli déterministe activé:`, e);
		return generateFallbackClause(input);
	}
}
