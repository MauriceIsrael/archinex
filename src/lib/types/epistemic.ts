/**
 * Types Épistémiques Fondamentaux d'Archinex
 * Issus du document « Cadre de travail » (rédigé à l'origine sous le titre « SmartMemory × LLMOps »)
 */

export type ConfidenceLevel =
	| 'verified'          // Prouvé formellement (preuve locale, benchmark, audit)
	| 'designed'          // Intention d'architecture de cadrage
	| 'vendor-stated'     // Affirmé par un fournisseur tiers (datasheet, SLA)
	| 'stated-by-client'  // Exigence brute exprimée par le client
	| 'assumed';          // Hypothèse de travail non arbitrée

export type EpistemicConfidence = ConfidenceLevel;

export type ProductionMode =
	| 'human-authored'               // Rédigé directement par un humain
	| 'llm-proposed-human-approved'  // Proposé par un LLM et validé par un humain
	| 'llm-derived';                 // Dérivé automatiquement par un agent sans relecture

export type SubjectMaturity =
	| 'L0_named'        // Sujet nommé, périmètre non défini
	| 'L1_framed'       // Cadré, questions clés identifiées
	| 'L2_decomposed'   // Décomposé en sous-systèmes / options
	| 'L3_decided'      // Décision arrêtée, prêt pour HLD opposable
	| 'L4_specified'    // Spécifié dans le détail d'implémentation
	| 'L5_archived';    // Archivé / Scellé dans le snapshot opposable

export type MaturityLevel = SubjectMaturity;

export type ArchitectRole =
	| 'Lead Architect'
	| 'Network Architect'
	| 'Security Architect'
	| 'Cloud Architect'
	| 'Data Architect'
	| 'Procurement Specialist'
	| 'Client / Sponsor'
	| 'AI Assistant'
	| 'lead_architect'
	| 'infra_expert_architect'
	| 'domain_architect'
	| 'domain_expert'
	| 'security_architect'
	| 'data_architect';

export interface StatementTriplet {
	subject: string;
	predicate: string;
	value: string | number | boolean;
	unit?: string;
}

export interface StatementJustification {
	answersQuestion?: string;      // ex: "Q-0007"
	basedOn: string[];             // ex: ["KH:ADR-0014@v1.2", "S-0031"]
	appliedRule?: string;          // ex: "holdover_from_tier_iv"
}

export interface ValidatorStamp {
	id: string;
	role: string;
	timestamp: string;             // ISO-8601
}

export interface StatementAuthority {
	author: string;
	role: ArchitectRole | string;
	productionMode: ProductionMode;
	validator?: ValidatorStamp;
}

export interface StatementMaturity {
	subjectLevel: SubjectMaturity;
	confidence: ConfidenceLevel;
}

export interface StatementRevisability {
	antecedents: string[];         // Identifiants des énoncés amont requis
	dependents?: string[];         // Identifiants des énoncés avals impactés si celui-ci tombe
	consequencesIfInvalidated?: string;
}

export interface Statement {
	id: string;                     // ex: "ENG:project-1/S-0042"
	section: string;                // ex: "§4.2"
	triplet: StatementTriplet;
	justification: StatementJustification;
	authority: StatementAuthority;
	maturity: StatementMaturity;
	revisability: StatementRevisability;
	status: 'active' | 'under_review' | 'contested' | 'superseded';
	createdAt: string;
	updatedAt: string;
}

export interface ContributionEnvelope {
	producer: {
		type: 'human' | 'llm';
		authorId: string;
		model?: string;
		provider?: string;
		promptSha256?: string;
	};
	validator?: ValidatorStamp;
	productionMode: ProductionMode;
	payloadSha256: string;          // SHA-256 calculé sur JSON canonique du triplet
	statement: Omit<Statement, 'createdAt' | 'updatedAt'>;
}

export type EpistemicValidationError =
	| 'INVALID_EPISTEMIC_COMBINATION'   // verified x llm-derived
	| 'VALIDATOR_REQUIRED'              // llm sans validateur
	| 'CHECKSUM_MISMATCH'               // falsification SHA
	| 'INVALID_PREDICATE'               // hors liste blanche
	| 'MALFORMED_ENVELOPE';
