export type DocumentOrigin = 'client' | 'contributor_external';

export type DocumentCategory =
	| 'cctp'
	| 'rfp_annex'
	| 'business_spec'
	| 'standard'
	| 'regulation'
	| 'vendor_whitepaper'
	| 'guideline'
	| 'benchmark';

export interface ExtractedClause {
	id: string;
	clauseRef: string;
	title: string;
	text: string;
	criticality: 'bloquant' | 'majeur' | 'info';
	impactSummary?: string;
}

export interface InducedRule {
	id: string;
	title: string;
	type: 'obligation' | 'interdiction' | 'recommandation';
	description: string;
	targetSubjectId?: string;
}

export interface CorpusDocument {
	id: string;
	title: string;
	origin: DocumentOrigin;
	category: DocumentCategory;
	categoryLabel: string;
	sourceOrAuthor: string;
	contributorRole?: string;
	version: string;
	pageCount?: number;
	extractedClausesCount: number;
	relatedSubjectIds: string[];
	summary: string;
	keyIdeas?: string[];
	inducedRules?: InducedRule[];
	keyClauses: ExtractedClause[];
	addedDate: string;
	lastUpdated: string;
}

export const INITIAL_CORPUS_DOCUMENTS: CorpusDocument[] = [
	// --- 1. DOCUMENTS CLIENT (MOA / CCTP / Donneur d'ordre) ---
	{
		id: 'DOC-CLI-01',
		title: 'CCTP Lot 2 · Spécifications Réseau Fédérateur & Tranches 5G',
		origin: 'client',
		category: 'cctp',
		categoryLabel: 'CCTP Contractuel',
		sourceOrAuthor: "Maîtrise d'Ouvrage (MOA Télécom)",
		version: 'v2.1',
		pageCount: 142,
		extractedClausesCount: 52,
		relatedSubjectIds: ['sub_sync', 'sub_core', 'sub_radio'],
		summary:
			'Cahier des charges principal fixant les exigences de débit, latence sub-microseconde, tranches prioritaires et interopérabilité pour le réseau fédérateur national.',
		keyIdeas: [
			'Réseau fédérateur 5G SA souverain pour les services régaliens et de sécurité publique (PPDR).',
			'Alignement de phase sub-microseconde (±1.5 µs) impératif sur l\'ensemble des stations de base.',
			'Étanchéité stricte des tranches critiques (Slicing) sans contention avec les trafics commerciaux.'
		],
		inducedRules: [
			{
				id: 'RULE-CLI-01',
				title: 'Synchronisation Phase PTP G.8275.1 Obligatoire',
				type: 'obligation',
				description: 'Interdiction du NTP classique. Le protocole IEEE 1588v2 / PTP profil télécom est requis.',
				targetSubjectId: 'sub_sync'
			},
			{
				id: 'RULE-CLI-02',
				title: 'Tranche MCX Étanche & Prioritaire',
				type: 'obligation',
				description: 'Réservation de ressources dédiées sur le plan de contrôle et le plan utilisateur (UPF).',
				targetSubjectId: 'sub_core'
			}
		],
		keyClauses: [
			{
				id: 'cl-cli-01',
				clauseRef: 'Art. 4.2.1',
				title: 'Synchronisation temporelle absolue',
				text: 'Le réseau de transmission doit maintenir une précision de phase globale de ±1.5 µs par rapport à la référence UTC sur l\'ensemble des stations de base.',
				criticality: 'bloquant',
				impactSummary: 'Impose l\'usage d\'horloges PTP G.8275.1 ou holdover rubidium.'
			},
			{
				id: 'cl-cli-02',
				clauseRef: 'Art. 4.4.3',
				title: 'Isolation stricte des tranches critiques (Slicing)',
				text: 'Les flux MCX (Mission Critical) doivent bénéficier d\'un plan de contrôle et de ressources radio strictement étanches sans contention.',
				criticality: 'bloquant',
				impactSummary: 'Contraint le choix de l\'architecture 5G SA (Standalone).'
			},
			{
				id: 'cl-cli-03',
				clauseRef: 'Art. 4.3.2',
				title: 'Couverture continue en bande prioritaire',
				text: 'Disponibilité radio exigée de 99.999% sur les corridors d\'intervention rapide.',
				criticality: 'majeur',
				impactSummary: 'Nécessite une redondance de transmission hertzienne/optique.'
			}
		],
		addedDate: '2026-09-01T08:00:00Z',
		lastUpdated: '2026-09-01T08:00:00Z'
	},
	{
		id: 'DOC-CLI-02',
		title: 'Annexe Sécurité & Résilience Opérationnelle des Datacenters',
		origin: 'client',
		category: 'rfp_annex',
		categoryLabel: 'Annexe Sécurité CCTP',
		sourceOrAuthor: 'RSSI Client (Homologation)',
		version: 'v1.4',
		pageCount: 48,
		extractedClausesCount: 24,
		relatedSubjectIds: ['sub_dc_resilience', 'sub_pqc'],
		summary:
			'Exigences d\'autonomie des infrastructures physiques, alimentation secourue, détection d\'intrusion et continuité d\'activité en cas d\'avarie majeure.',
		keyIdeas: [
			'Autonomie énergétique totale de 72 heures sans ravitaillement extérieur pour les nœuds nodaux.',
			'Chiffrement de bout en bout des liaisons d\'administration conforme aux standards ANSSI.',
			'Préparation obligatoire de la cryptographie post-quantique (PQC) pour la pérennité 10 ans.'
		],
		inducedRules: [
			{
				id: 'RULE-CLI-SEC-01',
				title: 'Alimentation Secourue 72h Sans Rupture',
				type: 'obligation',
				description: 'Groupes électrogènes redondés N+1 et cuves de carburant certifiées ICPE.',
				targetSubjectId: 'sub_dc_resilience'
			},
			{
				id: 'RULE-CLI-SEC-02',
				title: 'Chiffrement Homologué ANSSI & Hybridation PQC',
				type: 'obligation',
				description: 'Prohibition de suites cryptographiques dépréciées sur les flux inter-sites.',
				targetSubjectId: 'sub_pqc'
			}
		],
		keyClauses: [
			{
				id: 'cl-cli-04',
				clauseRef: 'Annexe §3.1.2',
				title: 'Autonomie énergétique continue 72h',
				text: 'Les sites centraux et nœuds de transit doivent disposer d\'une réserve carburant et de groupes électrogènes garantissant 72h d\'autonomie à pleine charge.',
				criticality: 'bloquant',
				impactSummary: 'Génère un surcoût de cuve enterrée ICPE (+95 k€).'
			},
			{
				id: 'cl-cli-05',
				clauseRef: 'Annexe §6.2.1',
				title: 'Chiffrement de bout en bout des liaisons d\'administration',
				text: 'Tous les flux de gestion doivent être protégés par un chiffrement conforme aux algorithmes homologués par l\'ANSSI.',
				criticality: 'majeur',
				impactSummary: 'Exige la préparation au chiffrement hybride post-quantique.'
			}
		],
		addedDate: '2026-09-01T08:00:00Z',
		lastUpdated: '2026-09-05T14:00:00Z'
	},
	{
		id: 'DOC-CLI-03',
		title: 'Spécification Métier · Terminaux Tactiques & Ergonomie PPDR',
		origin: 'client',
		category: 'business_spec',
		categoryLabel: 'Expression de Besoins Métier',
		sourceOrAuthor: 'État-Major Sécurité Civile & Police',
		version: 'v1.0',
		pageCount: 64,
		extractedClausesCount: 31,
		relatedSubjectIds: ['sub_ppdr'],
		summary:
			'Besoins opérationnels des primo-intervenants : push-to-talk, vidéo tactique, résistance IP68 et passage automatique réseau privé / public.',
		keyIdeas: [
			'Réactivité immédiate pour les situations d\'urgence vitale sur le terrain.',
			'Ouverture du canal voix (Push-to-Talk) en moins de 300 ms sur appui bouton d\'urgence.',
			'Transition continue et transparente sans coupure entre couverture dédiée et roaming opérateur.'
		],
		inducedRules: [
			{
				id: 'RULE-CLI-PPDR-01',
				title: 'Garantie Latence Voix MCPTT < 300 ms',
				type: 'obligation',
				description: 'Priorité préemptive sur les files d\'attente QoS radio et cœur de réseau.',
				targetSubjectId: 'sub_ppdr'
			}
		],
		keyClauses: [
			{
				id: 'cl-cli-06',
				clauseRef: 'EB §2.4',
				title: 'Temps d\'établissement d\'appel d\'urgence < 300 ms',
				text: 'L\'appui sur le bouton d\'urgence doit ouvrir le canal voix prioritaire en moins de 300 millisecondes sur tous les terminaux de la flotte.',
				criticality: 'bloquant',
				impactSummary: 'Dimensionne les files d\'attente QoS et la priorité ARP.'
			}
		],
		addedDate: '2026-09-03T11:00:00Z',
		lastUpdated: '2026-09-03T11:00:00Z'
	},
	{
		id: 'DOC-CLI-04',
		title: 'Cadrage Budgétaire & Jalons Contractuels de Déploiement',
		origin: 'client',
		category: 'cctp',
		categoryLabel: 'Cadre Financier MOA',
		sourceOrAuthor: 'Direction Financière & Achats Client',
		version: 'v1.2',
		pageCount: 18,
		extractedClausesCount: 8,
		relatedSubjectIds: ['sub_dc_resilience', 'sub_sync'],
		summary:
			'Plafonds budgétaires CAPEX/OPEX par tranche de déploiement et pénalités de retard sur les jalons critiques de mise en service.',
		keyClauses: [
			{
				id: 'cl-cli-07',
				clauseRef: 'Fin. §1.3',
				title: 'Plafond surcoût CAPEX Phase 1',
				text: 'Tout surcoût matériel au-delà de 350 k€ sur le lot infrastructure nécessite un arbitrage exprès du comité directeur.',
				criticality: 'info',
				impactSummary: 'Surveille la somme cumulée des options techniques retenues.'
			}
		],
		addedDate: '2026-09-02T09:30:00Z',
		lastUpdated: '2026-09-02T09:30:00Z'
	},

	// --- 2. DOCUMENTS EXTERNES (Contributeurs, Experts & Normes) ---
	{
		id: 'DOC-EXT-01',
		title: '3GPP Release 17 / TS 38.300 · NR and NG-RAN Architecture',
		origin: 'contributor_external',
		category: 'standard',
		categoryLabel: 'Norme Télécom Internationale',
		sourceOrAuthor: 'P. Durand',
		contributorRole: 'Architecte Infra / Réseau',
		version: 'Rel-17 v17.4.0',
		pageCount: 380,
		extractedClausesCount: 14,
		relatedSubjectIds: ['sub_sync', 'sub_radio'],
		summary:
			'Spécification de référence mondiale pour le fonctionnement de la radio 5G New Radio en mode TDD, imposant un alignement de phase sub-microseconde (±1.5 µs).',
		keyClauses: [
			{
				id: 'cl-ext-01',
				clauseRef: 'TS 38.300 §8.2',
				title: 'Alignement de trame TDD sans interférence',
				text: 'Tout décalage de phase supérieur à 3.0 µs entre cellules contiguës engendre une désynchronisation des créneaux émission/réception et un brouillage destructif.',
				criticality: 'bloquant',
				impactSummary: 'Justifie l\'exigence d\'horloges de haute stabilité.'
			}
		],
		addedDate: '2026-09-08T10:00:00Z',
		lastUpdated: '2026-09-08T10:00:00Z'
	},
	{
		id: 'DOC-EXT-02',
		title: 'Directive NIS2 & Recommandations ANSSI · Réseaux Vitaux',
		origin: 'contributor_external',
		category: 'regulation',
		categoryLabel: 'Cadre Réglementaire ANSSI',
		sourceOrAuthor: 'S. Bernard',
		contributorRole: 'Architecte Sécurité NIS2',
		version: 'Édition 2025',
		pageCount: 92,
		extractedClausesCount: 18,
		relatedSubjectIds: ['sub_sync', 'sub_dc_resilience', 'sub_pqc'],
		summary:
			'Réglementation européenne transposée imposant aux entités essentielles la résilience face au brouillage électromagnétique et aux cyberattaques étatiques sur le positionnement GNSS.',
		keyClauses: [
			{
				id: 'cl-ext-02',
				clauseRef: 'ANSSI R-07',
				title: 'Autonomie locale en cas de perte de signal satellite',
				text: 'Les systèmes de commande et télécommunications d\'importance vitale doivent pouvoir fonctionner au minimum 30 jours sans référence externe GNSS.',
				criticality: 'bloquant',
				impactSummary: 'Règle doctrinale imposant les oscillateurs atomiques locaux (Rubidium).'
			}
		],
		addedDate: '2026-09-10T14:15:00Z',
		lastUpdated: '2026-09-10T14:15:00Z'
	},
	{
		id: 'DOC-EXT-03',
		title: 'Uptime Institute Tier Standards & Norme EN 50600',
		origin: 'contributor_external',
		category: 'standard',
		categoryLabel: 'Standard Datacenter',
		sourceOrAuthor: 'P. Durand',
		contributorRole: 'Architecte Infra / Réseau',
		version: '2024 Rev',
		pageCount: 76,
		extractedClausesCount: 9,
		relatedSubjectIds: ['sub_dc_resilience'],
		summary:
			'Référentiel mondial de disponibilité des centres de données : critères de tolérance aux pannes (Tier IV) et de maintenance concurrente sans coupure (Tier III).',
		keyClauses: [
			{
				id: 'cl-ext-03',
				clauseRef: 'Tier III / Tier IV Matrix',
				title: 'Continuité d\'alimentation électrique sans interruption',
				text: 'La topologie Tier IV exige deux chemins de distribution actifs simultanément avec compartimentation physique étanche.',
				criticality: 'majeur',
				impactSummary: 'Arbitrage requis avec le donneur d\'ordre sur l\'investissement salle.'
			}
		],
		addedDate: '2026-09-11T09:00:00Z',
		lastUpdated: '2026-09-11T09:00:00Z'
	},
	{
		id: 'DOC-EXT-04',
		title: 'NIST FIPS 203/204 & Recommandations PQC ANSSI',
		origin: 'contributor_external',
		category: 'standard',
		categoryLabel: 'Norme Cryptographique',
		sourceOrAuthor: 'S. Bernard',
		contributorRole: 'Architecte Sécurité NIS2',
		version: 'FIPS Release 2024',
		pageCount: 45,
		extractedClausesCount: 6,
		relatedSubjectIds: ['sub_pqc'],
		summary:
			'Normes officielles pour la cryptographie post-quantique (ML-KEM / Kyber, ML-DSA / Dilithium) et règles de mise en œuvre en mode hybride avec courbes elliptiques.',
		keyClauses: [
			{
				id: 'cl-ext-04',
				clauseRef: 'FIPS 203 §4',
				title: 'Transition vers le chiffrement hybride classique + PQC',
				text: 'Les nouveaux protocoles TLS 1.3 de gestion réseau doivent supporter la négociation de clés combinées X25519 + ML-KEM-768.',
				criticality: 'majeur',
				impactSummary: 'Garantit l\'immunité contre les attaques Store Now Decrypt Later.'
			}
		],
		addedDate: '2026-09-18T16:00:00Z',
		lastUpdated: '2026-09-18T16:00:00Z'
	},
	{
		id: 'DOC-EXT-05',
		title: 'ITU-T G.8275.1 / Y.1369.1 Telecom Profile for Phase/Time',
		origin: 'contributor_external',
		category: 'standard',
		categoryLabel: 'Profil Télécom PTP',
		sourceOrAuthor: 'L. Moreau',
		contributorRole: 'Lead Architect',
		version: '2023 Amd.2',
		pageCount: 54,
		extractedClausesCount: 8,
		relatedSubjectIds: ['sub_sync'],
		summary:
			'Profil IEEE 1588 normalisé par l\'UIT pour la synchronisation précise de phase dans les réseaux télécoms avec support de synchronisation à chaque bond (Boundary Clock).',
		keyClauses: [
			{
				id: 'cl-ext-05',
				clauseRef: 'ITU-T §6.3',
				title: 'Support matériel PTP sur commutateurs de transit',
				text: 'Chaque commutateur ou routeur traversé doit intégrer une horloge Boundary Clock de classe C (< 10 ns par saut).',
				criticality: 'bloquant',
				impactSummary: 'Conditionne le choix des équipements de transmission optique.'
			}
		],
		addedDate: '2026-09-12T11:20:00Z',
		lastUpdated: '2026-09-12T11:20:00Z'
	}
];

export interface CorpusStats {
	totalDocuments: number;
	clientDocumentsCount: number;
	externalDocumentsCount: number;
	totalExtractedClauses: number;
	coveredSubjectsCount: number;
}

export function computeCorpusStats(
	documents: CorpusDocument[],
	allSubjectIds: string[]
): CorpusStats {
	const clientDocs = documents.filter((d) => d.origin === 'client');
	const externalDocs = documents.filter((d) => d.origin === 'contributor_external');
	const totalExtractedClauses = documents.reduce((acc, d) => acc + d.extractedClausesCount, 0);

	const coveredSubjectsSet = new Set<string>();
	for (const doc of documents) {
		for (const sId of doc.relatedSubjectIds) {
			if (allSubjectIds.includes(sId)) {
				coveredSubjectsSet.add(sId);
			}
		}
	}

	return {
		totalDocuments: documents.length,
		clientDocumentsCount: clientDocs.length,
		externalDocumentsCount: externalDocs.length,
		totalExtractedClauses,
		coveredSubjectsCount: coveredSubjectsSet.size
	};
}

export function filterCorpusDocuments(
	documents: CorpusDocument[],
	options: {
		filterOrigin?: 'all' | 'client' | 'external';
		searchQuery?: string;
		subjectId?: string;
	}
): CorpusDocument[] {
	const { filterOrigin = 'all', searchQuery = '', subjectId } = options;

	return documents.filter((doc) => {
		// Filter by origin
		if (filterOrigin === 'client' && doc.origin !== 'client') return false;
		if (filterOrigin === 'external' && doc.origin !== 'contributor_external') return false;

		// Filter by subject if specified
		if (subjectId && !doc.relatedSubjectIds.includes(subjectId)) {
			return false;
		}

		// Filter by search query
		if (searchQuery.trim().length > 0) {
			const query = searchQuery.toLowerCase().trim();
			const inTitle = doc.title.toLowerCase().includes(query);
			const inAuthor = doc.sourceOrAuthor.toLowerCase().includes(query);
			const inSummary = doc.summary.toLowerCase().includes(query);
			const inCategory = doc.categoryLabel.toLowerCase().includes(query);
			const inId = doc.id.toLowerCase().includes(query);
			const inClauses = doc.keyClauses.some(
				(c) =>
					c.clauseRef.toLowerCase().includes(query) ||
					c.title.toLowerCase().includes(query) ||
					c.text.toLowerCase().includes(query) ||
					(c.impactSummary && c.impactSummary.toLowerCase().includes(query))
			);

			if (!inTitle && !inAuthor && !inSummary && !inCategory && !inId && !inClauses) {
				return false;
			}
		}

		return true;
	});
}

export function getDocumentById(
	documents: CorpusDocument[],
	id: string
): CorpusDocument | undefined {
	return documents.find((doc) => doc.id === id);
}

export function getDocumentsForSubject(
	documents: CorpusDocument[],
	subjectId: string
): CorpusDocument[] {
	return documents.filter((doc) => doc.relatedSubjectIds.includes(subjectId));
}
