import type { CorpusDocument, ExtractedClause } from './corpus';
import type { UpstreamDocInput, InitialSubjectInput } from './engagements';
import type { Statement, ArchitectRole } from '$lib/types/epistemic';

export type ComplianceStatus = 'compliant' | 'conflict' | 'gap' | 'unassessed';

export interface ClauseConfrontation {
	id: string;
	clauseRef: string;
	title: string;
	text: string;
	criticality: 'bloquant' | 'majeur' | 'info';
	status: ComplianceStatus;
	confidence: number;
	matchedDocumentId?: string;
	matchedDocumentTitle?: string;
	matchedRuleId?: string;
	rationale: string;
	suggestedSubjectName?: string;
	suggestedRole?: ArchitectRole;
	proposedEpistemicAction?: string;
}

export interface RfpConfrontationResult {
	document: UpstreamDocInput;
	confrontations: ClauseConfrontation[];
	stats: {
		totalClauses: number;
		compliantCount: number;
		conflictCount: number;
		gapCount: number;
		complianceRate: number;
	};
	suggestedInitialSubjects: InitialSubjectInput[];
}

/**
 * Modèles pré-configurés de CCTP / RFP pour test et amorçage rapide
 */
export const SAMPLE_RFP_TEMPLATES = [
	{
		id: 'rfp-mcx-5g',
		name: 'CCTP Télécom · Réseau Critique 5G SA & Slicing Souverain',
		description: 'Exigences régaliennes de latence sub-microseconde, chiffrement TLS 1.3 certifié ANSSI et autonomie locale.',
		text: `Art. 1.1 - Hébergement Souverain et Immunité Juridique
L'ensemble de la chaîne de traitement et des cœurs de réseau doit être opéré exclusivement sur le territoire national au sein d'une infrastructure qualifiée SecNumCloud 3.2, avec une immunité stricte contre toute juridiction extraterritoriale (notamment le Cloud Act).

Art. 2.1 - Synchronisation de Phase PTP et Autonomie Temporelle
Les passerelles nodales et stations de base doivent implémenter le profil télécom IEEE 1588v2 / ITU-T G.8275.1 avec une précision temporelle de phase meilleure que ±1.5 µs. En cas de perte du signal GNSS satellitaire, chaque nœud critique doit garantir un maintien autonome (Holdover) supérieur ou égal à 30 jours sans dérive de trame.

Art. 3.4 - Séparation Étanche des Tranches et Accélération UPF
Le plan de données UPF doit supporter l'accélération matérielle SR-IOV et le double attachement réseau Multus CNI. Aucune contention de bande passante ne sera admise entre les tranches d'urgence prioritaire (PPDR/MCPTT) et les flux administratifs généraux.

Art. 4.2 - Chiffrement en Transit et Homologation ANSSI
Tous les flux d'interconnexion inter-sites et de commande doivent être chiffrés de bout en bout en TLS 1.3 ou IPsec IKEv2 utilisant des suites cryptographiques certifiées par l'ANSSI. Tout protocole propriétaire non auditable est formellement interdit.

Art. 5.1 - Supervision Locale et Exploitation en Mode Déconnecté
En cas de rupture du lien métropolitain fédérateur, chaque site local de commandement doit demeurer 100% opérationnel de façon autonome, avec réplication asynchrone des états dès rétablissement du réseau.`
	},
	{
		id: 'rfp-cloud-nis2',
		name: 'Cahier des Charges · Socle Cloud Kubernetes Durci & NIS2',
		description: 'Conformité stricte Directive NIS2, Zero-Trust, conteneurs durcis et contrôle d\'accès basé sur les attributs (ABAC).',
		text: `Exigence SEC-01 - Durcissement du Socle Conteneurs (CIS Benchmark)
L'orchestrateur de conteneurs doit être certifié conforme au référentiel CIS Benchmark Kubernetes Niveau 2 et respecter les recommandations du guide d'hygiène ANSSI pour les architectures virtualisées.

Exigence SEC-02 - Chiffrement des Données au Repos
Toutes les partitions de stockage persistant et les bases de données intégrées doivent être chiffrées au repos via l'algorithme AES-256 XTS avec gestion de clés souveraine (KMS sur site ou certifié CC EAL4+).

Exigence GOV-01 - Notification d'Incident Sous 24 Heures (NIS2)
Le système doit intégrer des sondes de détection d'intrusion en temps réel capables de classifier et d'exporter les alertes de sécurité dans un format standardisé pour notification au CERT national dans le délai légal de 24 heures imposé par la directive NIS2.

Exigence NET-03 - Interdiction des Accès d'Administration sans MFA Matériel
Aucun accès distant aux plans de contrôle de la plateforme ne doit être autorisé sans authentification forte multifacteur reposant sur des clés cryptographiques matérielles certifiées FIPS 140-3.`
	},
	{
		id: 'rfp-frmcs-rail',
		name: 'CCTP Ferroviaire · Migration GSM-R vers 5G FRMCS Sol-Bord',
		description: 'Système critique ferroviaire sol-bord : temps de bascule sub-50ms, redondance active-active et signalisation ETCS.',
		text: `Clause 1.2 - Disponibilité Radio et Bascule Sub-50ms
La transmission des télégrammes de signalisation ferroviaire ETCS niveau 2/3 exige une double couverture radio géoredondante active-active garantissant un temps de bascule inférieur à 50 millisecondes à 320 km/h.

Clause 2.3 - Interopérabilité Européenne et Norme FRMCS
L'ensemble des équipements de bord et d'infrastructure au sol doit être strictement conforme aux spécifications d'interopérabilité de l'Agence de l'Union Européenne pour les Chemins de Fer (ERA) et aux profils 3GPP Rel-17 FRMCS.

Clause 3.1 - Isolation Matérielle des Réseaux d'Exploitation et Voyageurs
Les réseaux de sécurité des circulations et les services de connectivité voyageurs doivent être séparés physiquement ou par cloisonnement cryptographique inviolable avec étanchéité démontrable lors des audits de sécurité.`
	}
];

/**
 * Dépouille un texte de RFP/CCTP en clauses structurées
 */
export function shredRfpTextToClauses(rawText: string): ExtractedClause[] {
	if (!rawText || !rawText.trim()) return [];

	const lines = rawText.split('\n');
	const clauses: ExtractedClause[] = [];
	let currentClause: Partial<ExtractedClause> | null = null;
	let clauseCounter = 1;

	// Regex pour détecter les débuts d'articles ou exigences
	const articleRegex = /^(?:art(?:icle|\.)?|exigence|clause|req(?:uirement)?|§)\s*([\d\w.-]+)\s*[:-]?\s*(.*)$/i;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;

		const match = line.match(articleRegex);
		if (match) {
			if (currentClause && currentClause.text) {
				clauses.push(finalizeClause(currentClause, clauseCounter++));
			}
			currentClause = {
				clauseRef: match[1] ? `§${match[1]}` : `§${clauseCounter}.0`,
				title: match[2]?.trim() || `Exigence ${match[1] || clauseCounter}`,
				text: ''
			};
		} else if (currentClause) {
			currentClause.text = currentClause.text ? `${currentClause.text} ${line}` : line;
		} else {
			// Si aucun en-tête n'a encore été détecté, chaque paragraphe substantiel devient une clause
			if (line.length > 25) {
				clauses.push({
					id: `clause-${clauseCounter}`,
					clauseRef: `§${clauseCounter}.0`,
					title: line.slice(0, 50).trim() + (line.length > 50 ? '...' : ''),
					text: line,
					criticality: detectCriticality(line),
					impactSummary: 'Extrait analysé du cahier des charges'
				});
				clauseCounter++;
			}
		}
	}

	if (currentClause && currentClause.text) {
		clauses.push(finalizeClause(currentClause, clauseCounter));
	}

	// Fallback si aucune structure n'a été détectée
	if (clauses.length === 0) {
		const sentences = rawText
			.split(/(?<=[.!?])\s+/)
			.map((s) => s.trim())
			.filter((s) => s.length > 20);

		return sentences.map((sentence, idx) => ({
			id: `clause-${idx + 1}`,
			clauseRef: `§${idx + 1}.0`,
			title: sentence.slice(0, 45) + '...',
			text: sentence,
			criticality: detectCriticality(sentence),
			impactSummary: 'Clause extraite'
		}));
	}

	return clauses;
}

function detectCriticality(text: string): 'bloquant' | 'majeur' | 'info' {
	const lower = text.toLowerCase();
	if (
		lower.includes('doit obligatoirement') ||
		lower.includes('impératif') ||
		lower.includes('formellement interdit') ||
		lower.includes('stricte') ||
		lower.includes('sub-microseconde') ||
		lower.includes('bloquant') ||
		lower.includes('secnumcloud')
	) {
		return 'bloquant';
	}
	if (
		lower.includes('doit') ||
		lower.includes('exige') ||
		lower.includes('nécessite') ||
		lower.includes('requis')
	) {
		return 'majeur';
	}
	return 'info';
}

function finalizeClause(partial: Partial<ExtractedClause>, counter: number): ExtractedClause {
	const text = partial.text || partial.title || '';
	const fullContent = `${partial.title || ''} ${partial.text || ''}`.trim();
	return {
		id: partial.id || `clause-${counter}`,
		clauseRef: partial.clauseRef || `§${counter}.0`,
		title: partial.title || `Exigence ${counter}`,
		text,
		criticality: detectCriticality(fullContent),
		impactSummary: `Impact sur le dimensionnement et la validation d'architecture`
	};
}

/**
 * Confronte un ensemble de clauses extraites d'un RFP à la base de connaissances commune d'Archinex
 */
export function confrontClausesWithKnowledgeBase(
	clauses: ExtractedClause[],
	knowledgeBase: CorpusDocument[],
	existingStatements: Statement[] = []
): RfpConfrontationResult {
	const confrontations: ClauseConfrontation[] = [];
	const suggestedInitialSubjects: InitialSubjectInput[] = [];

	let compliantCount = 0;
	let conflictCount = 0;
	let gapCount = 0;

	for (const clause of clauses) {
		const confrontation = evaluateClauseCompliance(clause, knowledgeBase, existingStatements);
		confrontations.push(confrontation);

		if (confrontation.status === 'compliant') {
			compliantCount++;
		} else if (confrontation.status === 'conflict') {
			conflictCount++;
			// Génère un sujet de délibération pour le conflit détecté
			suggestedInitialSubjects.push({
				sectionRef: confrontation.clauseRef,
				name: confrontation.suggestedSubjectName || `Arbitrage : ${confrontation.title}`,
				waitingForRole: confrontation.suggestedRole || 'lead_architect',
				effort: 'L',
				initialRetenu: [`Instruction formelle de la controverse soulevée par ${confrontation.clauseRef}`],
				initialHypothesis: confrontation.rationale,
				initialConflict: `Contradiction détectée entre l'exigence "${confrontation.title}" et les règles du patrimoine commun.`,
				initialQuestion: `Comment concilier ou traiter la déviation imposée par ${confrontation.clauseRef} sans compromettre les principes directeurs ?`
			});
		} else {
			gapCount++;
			// Génère un sujet de réflexion pour l'écart / exigence non couverte
			suggestedInitialSubjects.push({
				sectionRef: confrontation.clauseRef,
				name: confrontation.suggestedSubjectName || `Cadrage : ${confrontation.title}`,
				waitingForRole: confrontation.suggestedRole || 'infra_expert_architect',
				effort: clause.criticality === 'bloquant' ? 'L' : 'M',
				initialRetenu: [`Définition de la solution de référence pour répondre à ${confrontation.clauseRef}`],
				initialHypothesis: `Conception d'une réponse architecturale vérifiée respectant l'exigence "${confrontation.title}".`,
				initialQuestion: `Quelles sont les options d'architecture et technologies qualifiées permettant de satisfaire ${confrontation.clauseRef} ?`
			});
		}
	}

	const totalClauses = clauses.length;
	const complianceRate = totalClauses > 0 ? Math.round((compliantCount / totalClauses) * 100) : 0;

	const document: UpstreamDocInput = {
		title: 'CCTP Analysé & Dépouillé',
		category: 'cctp',
		categoryLabel: 'CCTP Contractuel',
		sourceOrAuthor: "Maîtrise d'Ouvrage (RFP)",
		version: 'v1.0',
		pageCount: Math.max(1, Math.ceil(totalClauses / 4)),
		summary: `Dépouillement de ${totalClauses} exigences contractuelles confrontées au patrimoine commun (${complianceRate}% de couverture directe).`,
		keyIdeas: [
			`${compliantCount} exigence(s) directement couvertes par le socle et les standards capitalisés.`,
			`${conflictCount} contradiction(s) ou déviation(s) nécessitant un arbitrage humain immédiat.`,
			`${gapCount} exigence(s) spécifique(s) nécessitant la création de nouveaux sujets de maturité.`
		],
		clauses: clauses.map((c) => ({
			clauseRef: c.clauseRef,
			title: c.title,
			text: c.text,
			criticality: c.criticality,
			impactSummary: c.impactSummary
		}))
	};

	return {
		document,
		confrontations,
		stats: {
			totalClauses,
			compliantCount,
			conflictCount,
			gapCount,
			complianceRate
		},
		suggestedInitialSubjects
	};
}

/**
 * Évalue la conformité d'une clause vis-à-vis du corpus documentaire et des règles induites
 */
function evaluateClauseCompliance(
	clause: ExtractedClause,
	knowledgeBase: CorpusDocument[],
	existingStatements: Statement[]
): ClauseConfrontation {
	const clauseText = `${clause.title} ${clause.text}`.toLowerCase();

	// 1. Recherche de Conflits Connus (Règles d'interdiction doctrinales)
	if (
		clauseText.includes('cloud act') ||
		clauseText.includes('hors ue') ||
		clauseText.includes('protocole propriétaire') ||
		clauseText.includes('sans chiffrement') ||
		clauseText.includes('bypass') ||
		clauseText.includes('sans mfa')
	) {
		return {
			id: `conf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			clauseRef: clause.clauseRef,
			title: clause.title,
			text: clause.text,
			criticality: 'bloquant',
			status: 'conflict',
			confidence: 0.95,
			matchedDocumentId: 'DOC-EXT-04',
			matchedDocumentTitle: 'Doctrine ANSSI & Souveraineté Numérique',
			rationale:
				'Conflit critique : cette exigence enfreint les principes régalienne de souveraineté ou de sécurité Zero-Trust du patrimoine commun.',
			suggestedSubjectName: `Résolution Déviation : ${clause.title}`,
			suggestedRole: 'security_architect',
			proposedEpistemicAction: 'Ouvrir controverse L2 et préparer variante d\'exclusion.'
		};
	}

	// 2. Recherche de Correspondances Conformes (Standards & Doctrines existantes)
	for (const doc of knowledgeBase) {
		// Vérification sur les règles induites du document
		if (doc.inducedRules) {
			for (const rule of doc.inducedRules) {
				const ruleText = `${rule.title} ${rule.description}`.toLowerCase();
				if (computeKeywordOverlap(clauseText, ruleText) >= 2) {
					return {
						id: `conf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
						clauseRef: clause.clauseRef,
						title: clause.title,
						text: clause.text,
						criticality: clause.criticality,
						status: 'compliant',
						confidence: 0.92,
						matchedDocumentId: doc.id,
						matchedDocumentTitle: doc.title,
						matchedRuleId: rule.id,
						rationale: `Couvert par la règle capitalisée "${rule.title}" issue de "${doc.title}".`,
						suggestedRole: 'infra_expert_architect',
						proposedEpistemicAction: 'Rattacher à la règle existante sans surcoût.'
					};
				}
			}
		}

		// Vérification sur les clauses maîtresses du document
		if (doc.keyClauses) {
			for (const kc of doc.keyClauses) {
				const kcText = `${kc.title} ${kc.text}`.toLowerCase();
				if (computeKeywordOverlap(clauseText, kcText) >= 2) {
					return {
						id: `conf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
						clauseRef: clause.clauseRef,
						title: clause.title,
						text: clause.text,
						criticality: clause.criticality,
						status: 'compliant',
						confidence: 0.88,
						matchedDocumentId: doc.id,
						matchedDocumentTitle: doc.title,
						rationale: `Directement aligné avec la spécification standard "${kc.title}" (${kc.clauseRef}) du patrimoine commun.`,
						suggestedRole: 'infra_expert_architect',
						proposedEpistemicAction: 'Réutiliser la solution technique éprouvée.'
					};
				}
			}
		}

		// Vérification sur les idées clés
		if (doc.keyIdeas) {
			for (const idea of doc.keyIdeas) {
				if (computeKeywordOverlap(clauseText, idea.toLowerCase()) >= 2) {
					return {
						id: `conf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
						clauseRef: clause.clauseRef,
						title: clause.title,
						text: clause.text,
						criticality: clause.criticality,
						status: 'compliant',
						confidence: 0.82,
						matchedDocumentId: doc.id,
						matchedDocumentTitle: doc.title,
						rationale: `Conforme aux orientations stratégiques définies dans "${doc.title}".`,
						suggestedRole: 'lead_architect',
						proposedEpistemicAction: 'Validation formelle L3.'
					};
				}
			}
		}
	}

	// 3. Vérification des énoncés épistémiques déjà vérifiés (Statements)
	for (const stmt of existingStatements) {
		const stmtText = `${stmt.triplet.predicate} ${stmt.triplet.value}`.toLowerCase();
		if (computeKeywordOverlap(clauseText, stmtText) >= 2) {
			return {
				id: `conf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
				clauseRef: clause.clauseRef,
				title: clause.title,
				text: clause.text,
				criticality: clause.criticality,
				status: 'compliant',
				confidence: 0.85,
				rationale: `Déjà résolu et validé par l'énoncé épistémique ${stmt.id} ("${stmt.triplet.value}").`,
				suggestedRole: (stmt.authority.role as ArchitectRole) || 'lead_architect',
				proposedEpistemicAction: 'Héritage immédiat de la décision L3.'
			};
		}
	}

	// 4. Par défaut : Écart / À Délibérer (Nouvelle exigence non encore capitalisée)
	const role: ArchitectRole = clauseText.includes('sécurité') || clauseText.includes('chiffr') || clauseText.includes('certifi')
		? 'security_architect'
		: clauseText.includes('réseau') || clauseText.includes('infra') || clauseText.includes('matériel') || clauseText.includes('latence')
			? 'infra_expert_architect'
			: 'lead_architect';

	return {
		id: `conf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		clauseRef: clause.clauseRef,
		title: clause.title,
		text: clause.text,
		criticality: clause.criticality,
		status: 'gap',
		confidence: 0.65,
		rationale:
			'Exigence spécifique non couverte par le patrimoine de base existant. Nécessite l\'ouverture d\'une section et une instruction architecturale.',
		suggestedSubjectName: `${clause.title.slice(0, 45)}`,
		suggestedRole: role,
		proposedEpistemicAction: 'Créer un sujet de maturité L0/L1 et assigner un architecte responsable.'
	};
}

/**
 * Calcul de similarité par recouvrement de mots-clés techniques
 */
function computeKeywordOverlap(textA: string, textB: string): number {
	const KEYWORDS = [
		'ptp',
		'g.8275.1',
		'1588v2',
		'holdover',
		'rubidium',
		'gnss',
		'secnumcloud',
		'souverain',
		'souveraineté',
		'tls 1.3',
		'ipsec',
		'anssi',
		'nis2',
		'multus',
		'sr-iov',
		'dpdk',
		'upf',
		'cis benchmark',
		'zero-trust',
		'mfa',
		'frmcs',
		'gsm-r',
		'etcs',
		'active-active',
		'latence',
		'rke2',
		'slert',
		'temps réel'
	];

	let overlap = 0;
	for (const kw of KEYWORDS) {
		if (textA.includes(kw) && textB.includes(kw)) {
			overlap++;
		}
	}
	return overlap;
}
