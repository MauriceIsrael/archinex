/**
 * Accompagnement du Cold Start ontologique pour les briques émergentes hors catalogue (Issue #444).
 *
 * Permet à une équipe d'architecture en phase RFP d'instancier immédiatement un composant logique
 * absent de l'ontologie LLMOps à partir d'archétypes TOGAF génériques, d'évaluer un socle de
 * garde-fous transverses déterministes sans écrire de Rego sur-mesure pendant l'offre, et de
 * préparer automatiquement le candidat de capitalisation Porte G4 (`new_asset`) pour enrichir
 * LLMOps après la remise.
 */

import {
	createEmergentLogicalComponent,
	type LogicalComponent
} from './componentCatalog.js';
import type { TogafDomainId } from './togafTaxonomy.js';

export type EmergentArchetypeId =
	| 'web_api_service'
	| 'data_pipeline_store'
	| 'realtime_gateway'
	| 'external_saas_connector'
	| 'batch_worker';

export interface EmergentArchetypeTemplate {
	id: EmergentArchetypeId;
	label: string;
	togafDomain: TogafDomainId;
	description: string;
	defaultExternallyExposed: boolean;
	defaultPersistentStorage: boolean;
	defaultTrustDependencies: string[];
	defaultProtocols: string[];
}

export const EMERGENT_ARCHETYPES: Record<EmergentArchetypeId, EmergentArchetypeTemplate> = {
	web_api_service: {
		id: 'web_api_service',
		label: 'Service Web / API Métier',
		togafDomain: 'application-business',
		description: 'Service applicatif HTTP/gRPC exposé derrière un reverse proxy WAF avec authentification IAM.',
		defaultExternallyExposed: true,
		defaultPersistentStorage: true,
		defaultTrustDependencies: ['iam-keycloak', 'vault-cluster', 'ingress-waf-proxy', 'siem-soc'],
		defaultProtocols: ['HTTPS/TLS1.3', 'gRPC/mTLS']
	},
	data_pipeline_store: {
		id: 'data_pipeline_store',
		label: 'Pipeline Data / Entrepôt Analytique',
		togafDomain: 'data-persistence',
		description: 'Brique d’ingestion, de transformation ou de stockage analytique nécessitant chiffrement au repos et traçabilité.',
		defaultExternallyExposed: false,
		defaultPersistentStorage: true,
		defaultTrustDependencies: ['vault-cluster', 'pki-ca', 'siem-soc'],
		defaultProtocols: ['TLS1.3', 'S3/HTTPS']
	},
	realtime_gateway: {
		id: 'realtime_gateway',
		label: 'Passerelle Temps Réel / Flux Média ou IoT',
		togafDomain: 'network-connectivity',
		description: 'Passerelle réseau ou de médiation protocolaire à faible latence avec cloisonnement de zone strict.',
		defaultExternallyExposed: true,
		defaultPersistentStorage: false,
		defaultTrustDependencies: ['pki-ca', 'vault-cluster', 'siem-soc'],
		defaultProtocols: ['mTLS', 'IPsec/IKEv2']
	},
	external_saas_connector: {
		id: 'external_saas_connector',
		label: 'Connecteur Tiers / SaaS Externe',
		togafDomain: 'network-connectivity',
		description: 'Médiation sortante contrôlée vers un service SaaS ou partenaire externe via proxy explicite.',
		defaultExternallyExposed: false,
		defaultPersistentStorage: false,
		defaultTrustDependencies: ['ingress-waf-proxy', 'vault-cluster', 'siem-soc'],
		defaultProtocols: ['HTTPS/TLS1.3']
	},
	batch_worker: {
		id: 'batch_worker',
		label: 'Traitement Asynchrone / Worker Batch',
		togafDomain: 'platform-compute',
		description: 'Charge de calcul interne sans exposition entrante, pilotée par file d’événements ou ordonnanceur.',
		defaultExternallyExposed: false,
		defaultPersistentStorage: false,
		defaultTrustDependencies: ['vault-cluster', 'siem-soc'],
		defaultProtocols: ['mTLS']
	}
};

export interface EmergentComponentRequest {
	name: string;
	displayName?: string;
	archetypeId: EmergentArchetypeId;
	externallyExposed?: boolean;
	persistentStorage?: boolean;
	handlesSensitiveData?: boolean;
	requirementRefs?: string[];
	rationale?: string;
}

export interface EmergentGuardViolation {
	ruleId: string;
	severity: 'blocking' | 'warning';
	message: string;
	remediation: string;
}

export interface EmergentGuardEvaluationResult {
	compliant: boolean;
	checkedRulesCount: number;
	violations: EmergentGuardViolation[];
	appliedTrustDependencies: string[];
}

export interface EmergentG4CapitalizationCandidate {
	kind: 'new_asset';
	proposedLeafUrn: string;
	title: string;
	togafDomain: TogafDomainId;
	archetypeId: EmergentArchetypeId;
	baselineCompliant: boolean;
	ontologyLeafSkeleton: {
		urn: string;
		domain: TogafDomainId;
		kind: 'technical_leaf';
		status: 'draft_candidate';
		required_trust_dependencies: string[];
		baseline_guards: string[];
		hydration_hints: {
			component_name: string;
			externally_exposed: boolean;
			persistent_storage: boolean;
		};
	};
	anonymizedRationale: string;
}

export interface EmergentColdStartBundle {
	component: LogicalComponent;
	archetype: EmergentArchetypeTemplate;
	guardEvaluation: EmergentGuardEvaluationResult;
	g4Candidate: EmergentG4CapitalizationCandidate;
}

/**
 * Évalue les 6 garde-fous transverses génériques sur un composant émergent
 * (sans nécessiter de règle OPA Rego spécifique pendant la phase RFP).
 */
export function evaluateEmergentBaselineGuards(
	component: LogicalComponent,
	options: {
		externallyExposed?: boolean;
		persistentStorage?: boolean;
		handlesSensitiveData?: boolean;
		trustDependencies?: string[];
	} = {}
): EmergentGuardEvaluationResult {
	const violations: EmergentGuardViolation[] = [];
	const trustDeps = new Set<string>([
		...(options.trustDependencies ?? []),
		...((component.spec as any)?.dependsOn ?? [])
	]);

	// Garde 1 : Cloisonnement Tenant obligatoire
	if (!component.metadata.tenant || !component.metadata.tenant.trim()) {
		violations.push({
			ruleId: 'emergent.deny_missing_tenant_isolation',
			severity: 'blocking',
			message: `Le composant émergent '${component.metadata.name}' ne déclare aucun tenant de cloisonnement.`,
			remediation: 'Assigner un tenant dédié (`tenant-<nom>`) pour garantir l’isolation multi-tenant.'
		});
	}

	// Garde 2 : Gestion des secrets (Vault / coffre requis dès que des données sensibles ou une exposition existent)
	if ((options.handlesSensitiveData || options.externallyExposed) && !trustDeps.has('vault-cluster')) {
		violations.push({
			ruleId: 'emergent.deny_unmanaged_secrets',
			severity: 'blocking',
			message: `Le composant émergent '${component.metadata.name}' manipule des données sensibles ou est exposé sans rattachement au coffre de secrets (vault-cluster).`,
			remediation: 'Rattacher `vault-cluster` aux dépendances de confiance pour interdire tout secret statique.'
		});
	}

	// Garde 3 : Observabilité & Journalisation SIEM obligatoire
	if (!trustDeps.has('siem-soc')) {
		violations.push({
			ruleId: 'emergent.deny_missing_siem_observability',
			severity: 'blocking',
			message: `Le composant émergent '${component.metadata.name}' n’est pas raccordé au puits de journaux SIEM (siem-soc).`,
			remediation: 'Ajouter la dépendance `siem-soc` pour garantir la traçabilité d’audit.'
		});
	}

	// Garde 4 : Périmètre d’exposition externe (WAF / Reverse Proxy ou PKI obligatoire si exposé)
	if (options.externallyExposed && !trustDeps.has('ingress-waf-proxy') && !trustDeps.has('pki-ca')) {
		violations.push({
			ruleId: 'emergent.deny_direct_unprotected_exposure',
			severity: 'blocking',
			message: `Le composant émergent '${component.metadata.name}' est exposé vers l’extérieur sans passerelle WAF (` + '`ingress-waf-proxy`' + `) ni PKI (` + '`pki-ca`' + `).`,
			remediation: 'Intercaler `ingress-waf-proxy` ou imposer un chiffrement mTLS ancré sur `pki-ca`.'
		});
	}

	// Garde 5 : Stockage persistant -> chiffrement au repos requis si données sensibles
	const hasStorageTier = Boolean((component.spec as any)?.storage || options.persistentStorage);
	if (hasStorageTier && options.handlesSensitiveData && !trustDeps.has('vault-cluster') && !trustDeps.has('pki-ca')) {
		violations.push({
			ruleId: 'emergent.deny_unencrypted_persistent_data',
			severity: 'blocking',
			message: `Le composant émergent '${component.metadata.name}' stocke des données sensibles sans ancrage KMS/Vault pour le chiffrement au repos.`,
			remediation: 'Activer le chiffrement au repos (LUKS2/KMS) adossé à `vault-cluster`.'
		});
	}

	// Garde 6 : Au moins un module d’exécution défini
	const modules = (component.spec as any)?.modules;
	if (!Array.isArray(modules) || modules.length === 0) {
		violations.push({
			ruleId: 'emergent.warn_missing_module_spec',
			severity: 'warning',
			message: `Le composant émergent '${component.metadata.name}' ne déclare aucun module d’exécution détaillé.`,
			remediation: 'Définir au moins un module logique avec sa réplication cible.'
		});
	}

	return {
		compliant: violations.filter((v) => v.severity === 'blocking').length === 0,
		checkedRulesCount: 6,
		violations,
		appliedTrustDependencies: Array.from(trustDeps).sort()
	};
}

/**
 * Instancie un composant émergent à partir d'un archétype TOGAF, évalue les garde-fous
 * transverses génériques et prépare le candidat Porte G4 pour LLMOps.
 */
export function scaffoldEmergentComponent(request: EmergentComponentRequest): EmergentColdStartBundle {
	const archetype = EMERGENT_ARCHETYPES[request.archetypeId];
	const component = createEmergentLogicalComponent(request.name, request.displayName);

	const externallyExposed = request.externallyExposed ?? archetype.defaultExternallyExposed;
	const persistentStorage = request.persistentStorage ?? archetype.defaultPersistentStorage;
	const handlesSensitiveData = request.handlesSensitiveData ?? true;

	const trustDependencies = Array.from(
		new Set([
			...archetype.defaultTrustDependencies,
			...(externallyExposed ? ['ingress-waf-proxy'] : []),
			...(handlesSensitiveData ? ['vault-cluster', 'siem-soc'] : ['siem-soc'])
		])
	).sort();

	// Enrichissement générique des dépendances sans toucher aux constantes d'un autre composant
	const specAny = component.spec as Record<string, any>;
	specAny.dependsOn = Array.from(new Set([...(specAny.dependsOn ?? []), ...trustDependencies]));
	specAny.emergentMetadata = {
		archetypeId: archetype.id,
		togafDomain: archetype.togafDomain,
		externallyExposed,
		persistentStorage,
		handlesSensitiveData,
		requirementRefs: request.requirementRefs ?? []
	};

	const guardEvaluation = evaluateEmergentBaselineGuards(component, {
		externallyExposed,
		persistentStorage,
		handlesSensitiveData,
		trustDependencies
	});

	const leafUrn = `urn:archinex:ontology:${archetype.togafDomain}:emergent:${component.metadata.name}`;
	const g4Candidate: EmergentG4CapitalizationCandidate = {
		kind: 'new_asset',
		proposedLeafUrn: leafUrn,
		title: component.metadata.displayName || component.metadata.name,
		togafDomain: archetype.togafDomain,
		archetypeId: archetype.id,
		baselineCompliant: guardEvaluation.compliant,
		ontologyLeafSkeleton: {
			urn: leafUrn,
			domain: archetype.togafDomain,
			kind: 'technical_leaf',
			status: 'draft_candidate',
			required_trust_dependencies: guardEvaluation.appliedTrustDependencies,
			baseline_guards: [
				'emergent.deny_missing_tenant_isolation',
				'emergent.deny_unmanaged_secrets',
				'emergent.deny_missing_siem_observability',
				'emergent.deny_direct_unprotected_exposure',
				'emergent.deny_unencrypted_persistent_data'
			],
			hydration_hints: {
				component_name: component.metadata.name,
				externally_exposed: externallyExposed,
				persistent_storage: persistentStorage
			}
		},
		anonymizedRationale:
			request.rationale?.trim() ||
			`Capacité émergente hors catalogue instanciée depuis l’archétype générique '${archetype.label}' (${archetype.togafDomain}).`
	};

	return {
		component,
		archetype,
		guardEvaluation,
		g4Candidate
	};
}
