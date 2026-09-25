import type { ArchitectRole } from '$lib/types/epistemic';

export interface DialogueMessage {
	id: string;
	channel: 'internal' | 'discord';
	author: string;
	role: ArchitectRole;
	content: string;
	timestamp: string;
	isAi?: boolean;
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
		keywords: [/nis2/i, /groupe électrogène/i, /double adduction/i, /autonomie/i],
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
