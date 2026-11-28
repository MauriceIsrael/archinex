import { describe, it, expect } from 'vitest';
import {
	EMERGENT_ARCHETYPES,
	evaluateEmergentBaselineGuards,
	scaffoldEmergentComponent,
	type EmergentArchetypeId
} from '$lib/domain/edp/emergentColdStart';
import type { LogicalComponent } from '$lib/domain/edp/componentCatalog';

function makeComponent(overrides: {
	name?: string;
	tenant?: string;
	dependsOn?: string[];
	storage?: unknown;
	modules?: unknown[];
} = {}): LogicalComponent {
	return {
		apiVersion: 'archinex.io/v1alpha1',
		kind: 'LogicalComponent',
		metadata: {
			name: overrides.name ?? 'custom-brick',
			displayName: 'Brique Personnalisée',
			tenant: overrides.tenant ?? 'tenant-custom'
		},
		spec: {
			...(overrides.dependsOn !== undefined ? { dependsOn: overrides.dependsOn } : {}),
			...(overrides.storage !== undefined ? { storage: overrides.storage } : {}),
			...(overrides.modules !== undefined ? { modules: overrides.modules } : {})
		}
	} as unknown as LogicalComponent;
}

describe('emergentColdStart — Couverture complète des 6 garde-fous et des 5 archétypes', () => {
	describe('evaluateEmergentBaselineGuards', () => {
		it('utilise les options par défaut (1 argument) et détecte tenant manquant, SIEM manquant et absence de modules', () => {
			const comp = makeComponent({ tenant: '   ', modules: [] });
			const res = evaluateEmergentBaselineGuards(comp);

			expect(res.compliant).toBe(false);
			expect(res.checkedRulesCount).toBe(6);
			const ids = res.violations.map((v) => v.ruleId);
			expect(ids).toContain('emergent.deny_missing_tenant_isolation');
			expect(ids).toContain('emergent.deny_missing_siem_observability');
			expect(ids).toContain('emergent.warn_missing_module_spec');
			// Pas d'exposition ni de données sensibles par défaut
			expect(ids).not.toContain('emergent.deny_unmanaged_secrets');
			expect(ids).not.toContain('emergent.deny_direct_unprotected_exposure');
			expect(ids).not.toContain('emergent.deny_unencrypted_persistent_data');
		});

		it('reste conforme si seul le warning missing_module_spec est émis (sans violation bloquante)', () => {
			const comp = makeComponent({
				tenant: 'tenant-ok',
				dependsOn: ['siem-soc'],
				modules: []
			});
			const res = evaluateEmergentBaselineGuards(comp, {
				externallyExposed: false,
				persistentStorage: false,
				handlesSensitiveData: false
			});

			expect(res.compliant).toBe(true);
			expect(res.violations).toHaveLength(1);
			expect(res.violations[0].ruleId).toBe('emergent.warn_missing_module_spec');
			expect(res.violations[0].severity).toBe('warning');
		});

		it('détecte emergent.deny_unencrypted_persistent_data via persistentStorage ou spec.storage', () => {
			const compWithStorage = makeComponent({
				tenant: 'tenant-data',
				dependsOn: ['siem-soc'],
				storage: { class: 'nvme' },
				modules: [{ name: 'engine', replicas: 2 }]
			});

			const res = evaluateEmergentBaselineGuards(compWithStorage, {
				externallyExposed: false,
				persistentStorage: false,
				handlesSensitiveData: true
			});

			expect(res.compliant).toBe(false);
			const ids = res.violations.map((v) => v.ruleId);
			expect(ids).toContain('emergent.deny_unmanaged_secrets');
			expect(ids).toContain('emergent.deny_unencrypted_persistent_data');
			expect(ids).not.toContain('emergent.warn_missing_module_spec');
		});

		it('accepte pki-ca comme protection d’exposition externe et d’ancrage chiffrement au repos', () => {
			const comp = makeComponent({
				tenant: 'tenant-mtls',
				dependsOn: ['siem-soc', 'vault-cluster', 'pki-ca'],
				modules: [{ name: 'gw', replicas: 2 }]
			});

			const res = evaluateEmergentBaselineGuards(comp, {
				externallyExposed: true,
				persistentStorage: true,
				handlesSensitiveData: true
			});

			expect(res.compliant).toBe(true);
			expect(res.violations).toEqual([]);
			expect(res.appliedTrustDependencies).toEqual(['pki-ca', 'siem-soc', 'vault-cluster']);
		});

		it('détecte emergent.deny_direct_unprotected_exposure si exposé sans WAF ni PKI', () => {
			const comp = makeComponent({
				tenant: 'tenant-exposed',
				dependsOn: ['siem-soc', 'vault-cluster'],
				modules: [{ name: 'edge', replicas: 2 }]
			});

			const res = evaluateEmergentBaselineGuards(comp, {
				externallyExposed: true,
				persistentStorage: false,
				handlesSensitiveData: true
			});

			expect(res.compliant).toBe(false);
			expect(res.violations.map((v) => v.ruleId)).toEqual(['emergent.deny_direct_unprotected_exposure']);
		});

		it('accepte ingress-waf-proxy seul (sans pki-ca) pour la garde exposition externe', () => {
			const comp = makeComponent({
				tenant: 'tenant-web',
				dependsOn: ['siem-soc', 'vault-cluster', 'ingress-waf-proxy'],
				modules: [{ name: 'api', replicas: 2 }]
			});

			const res = evaluateEmergentBaselineGuards(comp, {
				externallyExposed: true,
				persistentStorage: false,
				handlesSensitiveData: false
			});

			expect(res.compliant).toBe(true);
			expect(res.violations).toEqual([]);
		});
	});

	describe('scaffoldEmergentComponent', () => {
		it('instancie chaque archétype TOGAF avec ses valeurs par défaut et son candidat Porte G4', () => {
			const archetypes = Object.keys(EMERGENT_ARCHETYPES) as EmergentArchetypeId[];
			expect(archetypes).toHaveLength(5);

			for (const archetypeId of archetypes) {
				const bundle = scaffoldEmergentComponent({
					name: `brick-${archetypeId}`,
					archetypeId
				});

				expect(bundle.archetype.id).toBe(archetypeId);
				expect(bundle.guardEvaluation.compliant).toBe(true);
				expect(bundle.g4Candidate.kind).toBe('new_asset');
				expect(bundle.g4Candidate.togafDomain).toBe(EMERGENT_ARCHETYPES[archetypeId].togafDomain);
				expect(bundle.g4Candidate.anonymizedRationale).toContain(EMERGENT_ARCHETYPES[archetypeId].label);
			}
		});

		it('respecte les surcharges explicites false (externallyExposed, persistentStorage, handlesSensitiveData) et rationale personnalisé', () => {
			const bundle = scaffoldEmergentComponent({
				name: 'internal-worker',
				displayName: 'Worker Interne',
				archetypeId: 'batch_worker',
				externallyExposed: false,
				persistentStorage: false,
				handlesSensitiveData: false,
				requirementRefs: ['REQ-10', 'REQ-11'],
				rationale: '  Besoin métier spécifique de traitement asynchrone.  '
			});

			expect(bundle.guardEvaluation.compliant).toBe(true);
			expect(bundle.guardEvaluation.appliedTrustDependencies).not.toContain('ingress-waf-proxy');
			expect(bundle.guardEvaluation.appliedTrustDependencies).toContain('siem-soc');
			expect(bundle.g4Candidate.title).toBe('Worker Interne');
			expect(bundle.g4Candidate.anonymizedRationale).toBe(
				'Besoin métier spécifique de traitement asynchrone.'
			);
			expect(bundle.g4Candidate.ontologyLeafSkeleton.hydration_hints).toEqual({
				component_name: 'internal-worker',
				externally_exposed: false,
				persistent_storage: false
			});
		});
	});
});
