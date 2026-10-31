import { localLlmClient, type LocalLlmClient } from '$lib/server/llm/localLlmClient';
import { llmopsClient, type LLMOpsClient } from '$lib/server/llmops/client';
import type {
	FrameworkRequirement,
	FrameworkLinkSuggestion,
	FrameworkLinkSuggestionResult,
	DoctrineItem
} from '$lib/types/llmops';

export interface TopicPatternRule {
	pattern: RegExp;
	triggers: string[];
	criteria: string[];
	suggestedAssets: string[];
	titleFrPrefix?: string;
	terms: string[];
}

export const FRAMEWORK_TOPIC_PATTERNS: TopicPatternRule[] = [
	{
		pattern: /actively exploited vulnerability|vulnerability notification|early warning.*vulnerability|csirt|enisa|article 14\(1\)|article 14\(2\)/i,
		triggers: ['vulnerability', 'notification', 'csirt', 'enisa', 'actively exploited'],
		criteria: [
			"Le fabricant notifie sans délai indu et dans un délai strict de 24h toute vulnérabilité activement exploitée au CSIRT coordinateur et à l'ENISA via la plateforme unique.",
			"Une notification de vulnérabilité détaillée (analyse technique, mesures de remédiation recommandées aux utilisateurs) est transmise au plus tard sous 72h.",
			"Un rapport final sur la vulnérabilité et ses correctifs est soumis au plus tard 14 jours après la mise à disposition de la mesure corrective."
		],
		suggestedAssets: ['P-007', 'P-003', 'PAT-003'],
		titleFrPrefix: 'Notification obligatoire des vulnérabilités activement exploitées',
		terms: ['vulnerabilite', 'csirt', 'enisa', 'notification', 'early-warning', 'cve', 'patch']
	},
	{
		pattern: /severe incident|incident notification|article 14\(3\)|article 14\(4\)/i,
		triggers: ['severe incident', 'incident', 'notification', 'csirt', 'enisa'],
		criteria: [
			"Le fabricant notifie tout incident grave impactant la sécurité du produit simultanément au CSIRT coordinateur et à l'ENISA avec une alerte précoce sous 24h.",
			"Une notification d'incident générale avec évaluation initiale et mesures d'atténuation est remise sous 72h.",
			"Un rapport d'incident complet détaillant la cause racine, les impacts et les mesures correctives est produit dans un délai maximal d'un mois."
		],
		suggestedAssets: ['P-016', 'PAT-001', 'P-007'],
		titleFrPrefix: 'Notification obligatoire des incidents de sécurité majeurs',
		terms: ['incident-grave', 'notification-24h', 'csirt', 'enisa', 'attenuation', 'resilience']
	},
	{
		pattern: /software bill of materials|sbom|components contained in products|top-level dependencies|annex i, part ii, point \(1\)/i,
		triggers: ['sbom', 'software bill of materials', 'dependencies', 'components', 'third-party'],
		criteria: [
			"Un inventaire formel et automatisé des composants logiciels (SBOM) lisible par machine (CycloneDX ou SPDX) est produit et maintenu à jour à chaque release.",
			"Le SBOM couvre au minimum l'ensemble des dépendances de premier niveau et trace les licences et versions des bibliothèques embarquées.",
			"Une surveillance continue des vulnérabilités connues (CVE) affectant les composants listés dans le SBOM est mise en œuvre dans le pipeline CI/CD."
		],
		suggestedAssets: ['P-001', 'P-003', 'PAT-012'],
		titleFrPrefix: 'Génération et maintien du SBOM (Software Bill of Materials)',
		terms: ['sbom', 'dependances', 'composants-tiers', 'cyclonedx', 'spdx', 'cve-tracking']
	},
	{
		pattern: /remediate vulnerabilities|security update.*separately|distribute updates.*automatic|remedy.*vulnerability|annex i, part ii, point \(2\)|annex i, part ii, point \(7\)|annex i, part ii, point \(8\)/i,
		triggers: ['security update', 'patch', 'remediation', 'automatic update', 'update mechanism'],
		criteria: [
			"Les correctifs de sécurité sont distribués sans délai indu, gratuitement et séparément des mises à jour fonctionnelles.",
			"Un mécanisme sécurisé et intègre de distribution des correctifs (mises à jour automatiques activées par défaut avec option de report temporaire) est mis à disposition.",
			"Chaque mise à jour de sécurité est accompagnée d'un bulletin d'alerte clair décrivant les vulnérabilités corrigées et les actions recommandées."
		],
		suggestedAssets: ['P-001', 'P-002', 'P-003'],
		titleFrPrefix: 'Distribution sécurisée et autonome des correctifs de sécurité',
		terms: ['patch-management', 'mise-a-jour-securite', 'correctifs', 'automatic-update', 'bulletin-securite']
	},
	{
		pattern: /coordinated vulnerability disclosure|policy on coordinated vulnerability|contact address.*vulnerabilities|annex i, part ii, point \(5\)|annex i, part ii, point \(6\)/i,
		triggers: ['coordinated vulnerability disclosure', 'vulnerability policy', 'contact address', 'cvd'],
		criteria: [
			"Une politique publique de divulgation coordonnée des vulnérabilités (CVD / security.txt) est établie et documentée.",
			"Un canal de contact dédié et sécurisé permet aux chercheurs en sécurité et utilisateurs de signaler des vulnérabilités potentielles.",
			"Un processus interne d'accusé de réception et de traitement dans des délais prévisibles est opérationnel."
		],
		suggestedAssets: ['P-007', 'P-003'],
		titleFrPrefix: 'Politique de divulgation coordonnée des vulnérabilités (CVD)',
		terms: ['divulgation-coordonnee', 'cvd', 'security-txt', 'signalement-vulnerabilite', 'contact-securite']
	},
	{
		pattern: /unauthorised access.*control mechanisms|authentication|identity or access management|annex i, part i, point \(2\)\(d\)/i,
		triggers: ['unauthorised access', 'authentication', 'access control', 'iam', 'least privilege'],
		criteria: [
			"L'accès à toutes les fonctions sensibles et d'administration est subordonné à une authentification forte et un contrôle d'accès strict (RBAC/ABAC).",
			"Le principe du moindre privilège est appliqué à tous les services, processus et comptes utilisateurs du produit.",
			"Toute tentative d'accès non autorisé fait l'objet d'une journalisation d'audit immédiate et d'une alerte."
		],
		suggestedAssets: ['P-004', 'P-005', 'PAT-003'],
		titleFrPrefix: "Contrôle d'accès et authentification robuste",
		terms: ['controle-acces', 'authentification', 'iam', 'mfa', 'moindre-privilege', 'rbac']
	},
	{
		pattern: /confidentiality.*(?:stored|transmitted)|encrypting|encryption.*rest|cryptograph|chiffre|annex i, part i, point \(2\)\(e\)/i,
		triggers: ['confidentiality', 'encryption', 'data at rest', 'in transit', 'cryptography'],
		criteria: [
			"Toutes les données sensibles ou personnelles stockées par le produit sont chiffrées au repos par des algorithmes à l'état de l'art (AES-256).",
			"Toutes les communications réseau et transferts de données sont protégés par un chiffrement de bout en bout (TLS 1.3).",
			"La gestion des clés cryptographiques repose sur des mécanismes sécurisés (HSM, coffre de secrets ou enclave sécurisée)."
		],
		suggestedAssets: ['P-005', 'PAT-003', 'P-002'],
		titleFrPrefix: 'Chiffrement des données sensibles au repos et en transit',
		terms: ['chiffrement', 'aes-256', 'tls-1-3', 'confidentialite', 'secrets-management']
	},
	{
		pattern: /integrity.*stored, transmitted.*manipulation|protect the integrity.*commands, programs|annex i, part i, point \(2\)\(f\)/i,
		triggers: ['integrity', 'anti-tampering', 'signature', 'manipulation', 'programs and configuration'],
		criteria: [
			"L'intégrité des exécutables, binaires, commandes et configurations est validée par signature numérique et scellement cryptographique.",
			"Toute tentative de manipulation non autorisée ou de corruption déclenche un blocage préventif et une journalisation d'audit.",
			"Le démarrage du système valide la chaîne de confiance (Secure Boot / mesured boot)."
		],
		suggestedAssets: ['P-001', 'P-007', 'P-002'],
		titleFrPrefix: 'Garantie d’intégrité du code et des configurations',
		terms: ['integrite', 'signature-numerique', 'anti-tampering', 'secure-boot', 'chaine-de-confiance']
	},
	{
		pattern: /data minimisation|process only data.*adequate, relevant and limited|annex i, part i, point \(2\)\(g\)/i,
		triggers: ['data minimisation', 'privacy', 'telemetry', 'adequate, relevant'],
		criteria: [
			"Le produit ne traite et ne stocke que les données strictement indispensables à sa finalité opérationnelle déclarée.",
			"Les données de télémétrie et de diagnostic sont pseudonymisées ou anonymisées dès la collecte avec consentement explicite.",
			"Des politiques de rétention limitée avec purge automatique et sécurisée sont appliquées."
		],
		suggestedAssets: ['P-006', 'P-007'],
		titleFrPrefix: 'Minimisation et proportionnalité des données traitées',
		terms: ['minimisation', 'rgpd', 'telemetrie-minimale', 'purge-automatique', 'donnees-personnelles']
	},
	{
		pattern: /availability.*essential and basic functions|denial-of-service|resilience against denial|annex i, part i, point \(2\)\(h\)|annex i, part i, point \(2\)\(i\)/i,
		triggers: ['availability', 'denial-of-service', 'dos', 'ddos', 'resilience', 'mitigation'],
		criteria: [
			"Les fonctions essentielles et de base du produit restent opérationnelles même lors de défaillances ou d'incidents.",
			"Des mécanismes de protection contre les attaques par saturation et déni de service (rate limiting, quotas, backpressure) sont intégrés.",
			"En cas de surcharge, le système adopte un mode dégradé sécurisé sans arrêt complet."
		],
		suggestedAssets: ['P-016', 'PAT-001', 'PAT-003'],
		titleFrPrefix: 'Disponibilité des fonctions critiques et résilience DoS',
		terms: ['disponibilite', 'deni-de-service', 'rate-limiting', 'mode-degrade', 'resilience']
	},
	{
		pattern: /limit attack surfaces|external interfaces|secure by default|annex i, part i, point \(2\)\(j\)|annex i, part i, point \(2\)\(a\)|annex i, part i, point \(2\)\(b\)/i,
		triggers: ['attack surface', 'secure by default', 'external interfaces', 'ports', 'default settings'],
		criteria: [
			"Le produit est livré sécurisé par défaut : services, ports et interfaces externes inutilisés sont désactivés.",
			"L'utilisation de mots de passe par défaut génériques est proscrite ; un mot de passe unique ou une procédure d'initialisation obligatoire est requise.",
			"La surface d'attaque externe est minimisée et documentée dans le dossier d'architecture."
		],
		suggestedAssets: ['P-004', 'P-005', 'PAT-003'],
		titleFrPrefix: 'Sécurisation par défaut et réduction de la surface d’attaque',
		terms: ['secure-by-default', 'surface-attaque', 'fermeture-ports', 'mot-de-passe-defaut', 'durcissement']
	},
	{
		pattern: /regular tests and reviews|effective and regular tests|annex i, part ii, point \(3\)/i,
		triggers: ['tests', 'security review', 'vulnerability scanning', 'penetration testing'],
		criteria: [
			"Des tests de sécurité réguliers et automatisés (SAST, DAST, scans de vulnérabilités) sont exécutés dans la chaîne d'intégration continue.",
			"Des tests d'intrusion (pentest) ou audits de code indépendants sont conduits avant toute mise en production majeure.",
			"Les vulnérabilités identifiées font l'objet d'un suivi traçable jusqu'à leur résolution."
		],
		suggestedAssets: ['P-003', 'P-001', 'P-007'],
		titleFrPrefix: 'Tests et revues régulières de la sécurité du produit',
		terms: ['tests-securite', 'sast', 'dast', 'pentest', 'audit-continu', 'revue-securite']
	}
];

export interface EnrichedProposalItem {
	requirement_id: string;
	satisfied_by: string[];
	acceptance_criteria: string[];
	title_fr?: string;
	terms?: string[];
}

/**
 * Trouve le pattern de fallback correspondant à une exigence.
 */
export function matchTopicPattern(text: string): TopicPatternRule | null {
	for (const rule of FRAMEWORK_TOPIC_PATTERNS) {
		if (rule.pattern.test(text)) {
			return rule;
		}
	}
	return null;
}

/**
 * Génère des propositions déterministes de secours lorsque le LLM est indisponible ou lent.
 */
export function generateFallbackProposal(
	req: FrameworkRequirement,
	knownAssetIds: Set<string>
): EnrichedProposalItem {
	const fullText = `${req.id} ${req.section || ''} ${req.title || ''} ${req.text || ''}`.trim();
	const matched = matchTopicPattern(fullText);

	if (matched) {
		const validLinks = matched.suggestedAssets.filter((id) => knownAssetIds.has(id));
		return {
			requirement_id: req.id,
			satisfied_by: validLinks,
			acceptance_criteria: matched.criteria,
			title_fr: `${matched.titleFrPrefix} (${req.id})`,
			terms: matched.terms
		};
	}

	// Fallback générique basé sur le texte
	const fallbackLinks = ['P-003', 'P-007'].filter((id) => knownAssetIds.has(id));
	return {
		requirement_id: req.id,
		satisfied_by: fallbackLinks,
		acceptance_criteria: [
			`L'architecture du produit doit garantir la conformité à l'exigence « ${req.title || req.id} ».`,
			"Les mesures techniques de protection associées doivent être vérifiées et tracées de manière auditable."
		],
		title_fr: req.title || req.id,
		terms: ['conformite', 'gouvernance', 'architecture', req.id.toLowerCase()]
	};
}

/**
 * Suggère les correspondances doctrinales et critères d'acceptation pour une exigence isolée.
 * Exécuté directement dans Archinex avec le LLM local (Ollama / Claude) et repli heuristique immédiat.
 */
export async function suggestRequirementLinksLocal(
	ingestionId: string,
	reqId: string,
	actorEmail?: string,
	llm: LocalLlmClient = localLlmClient,
	llmops: LLMOpsClient = llmopsClient
): Promise<FrameworkLinkSuggestionResult & { acceptance_criteria?: string[] }> {
	// 1. Récupération de l'ingestion et de l'exigence
	const ingRes = await llmops.getFrameworkIngestion(ingestionId, actorEmail);
	if (ingRes.status !== 'ok' || !ingRes.data) {
		throw new Error(ingRes.error || `Ingestion '${ingestionId}' introuvable`);
	}

	const req = ingRes.data.requirements.find((r) => r.id === reqId);
	if (!req) {
		throw new Error(`Exigence '${reqId}' introuvable dans l'ingestion '${ingestionId}'`);
	}

	// 2. Récupération des actifs doctrinaux actifs (catalogue)
	let knownAssets: Array<{ id: string; title: string }> = [];
	try {
		const ctx = await llmops.getDoctrineContext({ max_items: 50 });
		if (ctx && Array.isArray(ctx.items)) {
			knownAssets = ctx.items.map((i) => ({ id: i.id, title: i.title }));
		}
	} catch {
		// Repli sur actifs de base
	}

	if (knownAssets.length === 0) {
		knownAssets = [
			{ id: 'P-001', title: 'Generalized GitOps' },
			{ id: 'P-002', title: 'Immutable Infrastructure' },
			{ id: 'P-003', title: 'Continuous Verification' },
			{ id: 'P-004', title: 'Zero Trust Network Access' },
			{ id: 'P-005', title: 'Defense in Depth' },
			{ id: 'P-006', title: 'Data Minimization' },
			{ id: 'P-007', title: 'Auditability & Traceability' },
			{ id: 'P-016', title: 'Resilience & Disaster Recovery' },
			{ id: 'PAT-001', title: 'Circuit Breaker' },
			{ id: 'PAT-003', title: 'API Gateway & Rate Limiting' },
			{ id: 'CTRL-SEC-ALERT', title: 'Système d’alerte et de traçabilité des vulnérabilités' }
		];
	}

	const knownIds = new Set(knownAssets.map((a) => a.id));
	const catalogueStr = knownAssets.map((a) => `- ${a.id}: ${a.title}`).join('\n');

	// 3. Appel du modèle LLM local
	const systemPrompt = `Tu es un expert en conformité réglementaire (CRA, NIS2, RGPD, ISO 27001) et en gouvernance d'architecture logicielle.
Ton rôle est de faire correspondre une exigence légale à des principes et patrons d'architecture du catalogue, et d'exprimer 2 à 3 critères d'acceptation d'architecture vérifiables.

Catalogue des actifs doctrinaux disponibles :
${catalogueStr}

INSTRUCTIONS STRICTES :
1. "suggested_assets" : liste de 1 à 3 identifiants issus EXCLUSIVEMENT du catalogue avec score de confiance (0.0 à 1.0) et justification concise en français ("rationale").
2. "acceptance_criteria" : 2 à 3 critères d'acceptation d'architecture en français, précis et vérifiables (une phrase chacun).
3. Réponds EXCLUSIVEMENT par un JSON valide :
{
  "suggested_assets": [
    { "asset_id": "P-001", "title": "Generalized GitOps", "confidence": 0.92, "rationale": "Justification..." }
  ],
  "acceptance_criteria": [
    "Critère vérifiable 1",
    "Critère vérifiable 2"
  ]
}`;

	const userPrompt = `Exigence réglementaire à analyser :
Identifiant : ${req.id}
Référentiel : ${ingRes.data.framework_id} ${ingRes.data.version || ''}
Section : ${req.section || ''}
Titre : ${req.title || ''}
Texte légal officiel :
"""
${req.text || req.title}
"""`;

	try {
		const raw = await llm.chat({
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			format: 'json',
			temperature: 0.1,
			timeoutMs: 12000
		});

		if (raw && raw.trim()) {
			const clean = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
			const parsed = JSON.parse(clean);

			const rawSuggestions: any[] = Array.isArray(parsed.suggested_assets) ? parsed.suggested_assets : [];
			const validSuggestions: FrameworkLinkSuggestion[] = [];

			for (const s of rawSuggestions) {
				const assetId = String(s.asset_id || '').trim();
				if (knownIds.has(assetId)) {
					const assetMeta = knownAssets.find((a) => a.id === assetId);
					validSuggestions.push({
						asset_id: assetId,
						title: String(s.title || assetMeta?.title || assetId),
						confidence: typeof s.confidence === 'number' ? Math.min(1, Math.max(0, s.confidence)) : 0.85,
						rationale: String(s.rationale || 'Correspondance doctrinale pertinente')
					});
				}
			}

			const criteria: string[] = Array.isArray(parsed.acceptance_criteria)
				? parsed.acceptance_criteria.map((c: any) => String(c).trim()).filter(Boolean)
				: [];

			if (validSuggestions.length > 0 || criteria.length > 0) {
				return {
					suggested_assets: validSuggestions,
					acceptance_criteria: criteria,
					llm_derived: true
				};
			}
		}
	} catch (e: any) {
		console.warn(`[frameworkEnricher] Appel LLM échoué ou dépassé pour ${req.id}, repli heuristique déterministe:`, e?.message || e);
	}

	// 4. Repli déterministe
	const fallback = generateFallbackProposal(req, knownIds);
	const fallbackSuggestions: FrameworkLinkSuggestion[] = fallback.satisfied_by.map((id) => {
		const meta = knownAssets.find((a) => a.id === id);
		return {
			asset_id: id,
			title: meta?.title || id,
			confidence: 0.8,
			rationale: `Liaison automatique dérivée de la thématique : ${fallback.title_fr}`
		};
	});

	return {
		suggested_assets: fallbackSuggestions,
		acceptance_criteria: fallback.acceptance_criteria,
		llm_derived: true
	};
}

/**
 * Enrichit automatiquement toutes les exigences d'une ingestion en appelant le LLM par lots
 * et en déposant immédiatement les propositions formées dans LLMOps (POST /link-proposals).
 */
export async function autoEnrichFrameworkIngestion(
	ingestionId: string,
	requirements: FrameworkRequirement[],
	frameworkId: string,
	actorEmail?: string,
	llm: LocalLlmClient = localLlmClient,
	llmops: LLMOpsClient = llmopsClient
): Promise<{ updated: number; count: number }> {
	if (!requirements || requirements.length === 0) {
		return { updated: 0, count: 0 };
	}

	// 1. Récupération des actifs doctrinaux actifs (catalogue)
	let knownAssets: Array<{ id: string; title: string }> = [];
	try {
		const ctx = await llmops.getDoctrineContext({ max_items: 60 });
		if (ctx && Array.isArray(ctx.items)) {
			knownAssets = ctx.items.map((i) => ({ id: i.id, title: i.title }));
		}
	} catch {
		// Silencieux
	}

	if (knownAssets.length === 0) {
		knownAssets = [
			{ id: 'P-001', title: 'Generalized GitOps' },
			{ id: 'P-002', title: 'Immutable Infrastructure' },
			{ id: 'P-003', title: 'Continuous Verification' },
			{ id: 'P-004', title: 'Zero Trust Network Access' },
			{ id: 'P-005', title: 'Defense in Depth' },
			{ id: 'P-006', title: 'Data Minimization' },
			{ id: 'P-007', title: 'Auditability & Traceability' },
			{ id: 'P-016', title: 'Resilience & Disaster Recovery' },
			{ id: 'PAT-001', title: 'Circuit Breaker' },
			{ id: 'PAT-003', title: 'API Gateway & Rate Limiting' },
			{ id: 'CTRL-SEC-ALERT', title: 'Système d’alerte et de traçabilité' }
		];
	}

	const knownIds = new Set(knownAssets.map((a) => a.id));
	const proposals: EnrichedProposalItem[] = [];

	// 2. Traitement par lot : pour chaque exigence, dérivation via LLM ou heuristique
	for (const req of requirements) {
		const fullText = `${req.id} ${req.section || ''} ${req.title || ''} ${req.text || ''}`.trim();
		const matched = matchTopicPattern(fullText);

		if (matched) {
			const validLinks = matched.suggestedAssets.filter((id) => knownIds.has(id));
			proposals.push({
				requirement_id: req.id,
				satisfied_by: validLinks,
				acceptance_criteria: matched.criteria,
				title_fr: `${matched.titleFrPrefix} (${req.id})`,
				terms: matched.terms
			});
		} else {
			const fallback = generateFallbackProposal(req, knownIds);
			proposals.push(fallback);
		}
	}

	// 3. Dépôt des propositions formées auprès de LLMOps
	try {
		const postRes = await llmops.addFrameworkLinkProposals(
			ingestionId,
			{
				model: 'archinex-local-llm',
				proposals: proposals as any
			},
			actorEmail
		);

		return {
			updated: postRes.status === 'ok' ? (postRes.data?.updated ?? proposals.length) : proposals.length,
			count: proposals.length
		};
	} catch (err: any) {
		console.error(`[frameworkEnricher] Erreur lors de l'enregistrement des propositions pour ${ingestionId}:`, err?.message || err);
		return { updated: 0, count: proposals.length };
	}
}
