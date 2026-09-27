import type { ArchitectRole } from '$lib/types/epistemic';

export interface DialogueMessage {
	id: string;
	channel: 'internal' | 'discord';
	author: string;
	role: ArchitectRole;
	content: string;
	timestamp: string;
	isAi?: boolean;
	subjectId?: string;
}

export interface DoctrineRecallRule {
	id: string; // ex: "KH:ADR-0014"
	title: string;
	keywords: RegExp[];
	summary: string;
	referenceDocument: string;
	enforcementLevel: 'mandatory' | 'recommended';
	guidance: string;
}

export const KNOWN_DOCTRINE_RULES: DoctrineRecallRule[] = [
	{
		id: 'KH:ADR-0014',
		title: 'Tenue en holdover & Architecture Tier IV pour sites nodaux MCX',
		keywords: [/holdover/i, /rubidium/i, /tier\s*iv/i, /synchronisation r[ée]seau/i, /\bptp\b/i],
		summary: 'Holdover de 30 jours requis sans GNSS sur les nœuds nodaux MCX Priorité 1.',
		referenceDocument: 'ADR-0014-v1.2 (PTP & Holdover Strategy)',
		enforcementLevel: 'mandatory',
		guidance: 'Le dimensionnement impose une double alimentation et des horloges atomiques locales.'
	},
	{
		id: 'KH:ADR-0008',
		title: 'Résilience NIS2 : Double adduction et autonomie 72h',
		keywords: [/nis2/i, /groupe électrogène/i, /double adduction/i, /autonomie/i, /72h/i, /énergie/i],
		summary: 'Conformité NIS2 Article 21 : alimentation secourue 72h et double adduction réseau télécom.',
		referenceDocument: 'ADR-0008-v2.0 (NIS2 Critical Infrastructure Mandates)',
		enforcementLevel: 'mandatory',
		guidance: 'Toute dérogation requiert l\'homologation conjointe du Lead Architect et du RSSI.'
	},
	{
		id: 'KH:P-0023',
		title: 'Principe : Souveraineté et chiffrement post-quantique (PQC)',
		keywords: [/pqc/i, /post-quantique/i, /chiffrement/i, /kyber/i, /dilithium/i],
		summary: 'Tous les flux d\'interconnexion inter-datacenter doivent intégrer une couche hybride PQC.',
		referenceDocument: 'P-0023 (Cryptographic Agility & Sovereignty)',
		enforcementLevel: 'mandatory',
		guidance: 'Privilégier les algorithmes recommandés par l\'ANSSI (ML-KEM / Crystals-Kyber).'
	},
	{
		id: 'KH:ADR-0015',
		title: 'Isolation Physique & Souveraineté Locale des Données',
		keywords: [/souverain/i, /local/i, /isolation/i, /fuite/i, /base de donn[ée]es/i, /stockage/i],
		summary: 'Zero-cloud leak : les bases épistémiques et documents restent confinés sur la machine locale.',
		referenceDocument: 'ADR-0015 (Physical Database Isolation & Local Sovereignty)',
		enforcementLevel: 'mandatory',
		guidance: 'Interdiction de router les clauses ou arbitrages vers des endpoints LLM non maîtrisés.'
	},
	{
		id: 'KH:RULE-NET-01',
		title: 'Séparation Trafic OAM / UPF par Multus CNI & SR-IOV',
		keywords: [/multus/i, /cni/i, /sr-iov/i, /dpdk/i, /upf/i, /oam/i, /interface r[ée]seau/i],
		summary: 'Séparation physique ou logique stricte du trafic d\'administration et du plan de données utilisateur.',
		referenceDocument: 'Architecture Standard NET-01 (Multi-CNI Telco Blueprint)',
		enforcementLevel: 'mandatory',
		guidance: 'Configurer obligatoirement deux CNI distincts pour éviter l\'engorgement du plan de contrôle.'
	},
	{
		id: 'KH:RULE-SEC-01',
		title: 'Durcissement Kubernetes CIS Benchmark Level 2 & FIPS 140-3',
		keywords: [/rke2/i, /durcissement/i, /cis\s*benchmark/i, /fips/i, /etcd/i, /chiffrement au repos/i],
		summary: 'Tout cluster K8s hébergeant des fonctions critiques doit être durci selon CIS L2 et chiffré FIPS.',
		referenceDocument: 'Security Standard SEC-01 (Hardened Container Platform)',
		enforcementLevel: 'mandatory',
		guidance: 'Appliquer les profils de conformité RKE2 et NeuVector pour l\'inspection Zero-Trust.'
	},
	{
		id: 'KH:RULE-TELCO-02',
		title: 'Noyau SLERT Temps Réel & Isolement CPU (isolcpus / nohz_full)',
		keywords: [/slert/i, /temps r[ée]el/i, /gigue/i, /latence/i, /isolcpus/i, /nohz_full/i, /o-ran/i],
		summary: 'Garantie de latence de traitement déterministe sub-20 µs pour charges télécoms sensibles.',
		referenceDocument: 'Telco Platform Spec RT-02 (Real-Time Compute Profile)',
		enforcementLevel: 'mandatory',
		guidance: 'Dédier des cœurs CPU isolés sans interruption noyau aux fonctions radio et réseau.'
	},
	{
		id: 'KH:RULE-MCX-03',
		title: 'Priorité Préemptive Voix MCPTT < 300 ms (PPDR)',
		keywords: [/mcx/i, /mcptt/i, /ppdr/i, /300\s*ms/i, /bouton d'urgence/i, /pr[ée]emption/i, /tranche/i],
		summary: 'Préemption immédiate des flux multimédias tactiques sur les canaux voix d\'urgence.',
		referenceDocument: 'Mission Critical Service Design MCX-03 (Emergency Voice SLA)',
		enforcementLevel: 'mandatory',
		guidance: 'Dimensionner les files d\'attente réseau 5G avec le profil QoS QCI 65/69.'
	}
];

/**
 * Détecte de manière proactive les doctrines ou ADRs applicables aux termes mentionnés dans un échange.
 */
export function detectProactiveDoctrineRecalls(content: string): DoctrineRecallRule[] {
	return KNOWN_DOCTRINE_RULES.filter((rule) =>
		rule.keywords.some((kw) => kw.test(content))
	);
}

/**
 * Retourne les règles de la base de connaissance (SmartMemory / ADRs) applicables à un document du corpus.
 */
export function getApplicableDoctrineRules(doc: {
	title: string;
	summary: string;
	categoryLabel?: string;
	keyIdeas?: string[];
	keyClauses?: Array<{ title: string; text: string; impactSummary?: string }>;
	relatedSubjectIds?: string[];
}): DoctrineRecallRule[] {
	const textToSearch = [
		doc.title,
		doc.summary,
		doc.categoryLabel || '',
		...(doc.keyIdeas || []),
		...(doc.keyClauses || []).map((c) => `${c.title} ${c.text} ${c.impactSummary || ''}`)
	].join(' ');

	const matched = KNOWN_DOCTRINE_RULES.filter((rule) =>
		rule.keywords.some((kw) => kw.test(textToSearch))
	);

	if (matched.length === 0) {
		return [KNOWN_DOCTRINE_RULES[0], KNOWN_DOCTRINE_RULES[2]];
	}
	return matched;
}
