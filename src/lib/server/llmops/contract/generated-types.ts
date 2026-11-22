/* eslint-disable */
// FICHIER GÉNÉRÉ AUTOMATIQUEMENT depuis src/lib/server/llmops/contract/hub-openapi.json
// Ne pas modifier manuellement — exécuter `npm run llmops:gen-types`.

export const HUB_CONTRACT_ID = "CONTRAT-KH-API-V1" as const;
export const HUB_CONTRACT_SPEC_VERSION = "1.0.0" as const;
export const HUB_CONTRACT_VERSION = "1.0" as const;
export const HUB_SUPPORTED_CONTRACT_VERSIONS = ["1.0"] as const;
export type HubSupportedContractVersion = (typeof HUB_SUPPORTED_CONTRACT_VERSIONS)[number];

export const HUB_CONTRACT_PATHS = [
	"/health",
	"/snapshot/latest",
	"/api/knowledge/health",
	"/api/knowledge/candidates",
	"/api/knowledge/publications",
	"/api/knowledge/evals/{datasetId}",
	"/api/knowledge/evals/{datasetId}/runs",
	"/api/engagements",
	"/api/engagements/{engagementId}/members",
	"/api/engagements/{engagementId}/subjects",
	"/api/engagements/{engagementId}/statements",
	"/api/engagements/{engagementId}/decisions",
	"/api/engagements/{engagementId}/exports",
	"/api/doctrine/context",
	"/api/doctrine/check-option",
] as const;
export type HubContractPath = (typeof HUB_CONTRACT_PATHS)[number];

export interface HubContractHealth {
	status: string;
	plane: string;
	schema_version: string;
	service: string;
	engine_version: string;
	engine_commit: string;
	contract_version?: string;
}

export interface HubContractVersionNegotiation {
	clientVersion: string;
	serverVersion?: string | null;
	compatible: boolean;
	status: "negotiated" | "unversioned" | "mismatch";
}

export interface HubContractEnvelope {
	status: "ok" | "error";
	data?: unknown;
	error?: string;
	reason?: string;
	contract_version?: string;
}

export interface HubContractMember {
	email: string;
	role: "reader" | "contributor" | "decider" | "owner";
	displayName?: string;
}

export interface HubContractAuditEvent {
	id: string;
	action: string;
	actor: string;
	timestamp: string;
	target?: string;
}

export interface HubContractDoctrineQuery {
	engagement?: string;
	subject?: string;
	domains?: string[];
	frameworks?: string[];
	max_items?: number;
	max_chars?: number;
}

export interface HubContractEvalRunSummary {
	run_id: string;
	dataset_id: string;
	status: string;
	score?: number;
	total_cases?: number;
}
