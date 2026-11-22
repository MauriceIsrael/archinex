import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_URN_TO_COMPONENT,
	resolveTargetComponentsForUrns
} from '$lib/domain/edp/componentCatalog';
import type { OntologyCatalog } from '$lib/server/edp/ontologyClient';
import {
	collectInstantiatedComponents,
	computeRefinementCoverage
} from '$lib/server/edp/refinementCoverage';
import { readFixtureCatalog } from '../helpers/ontologyFixture';

const fixtureCatalog = readFixtureCatalog() as OntologyCatalog;

describe('Issue #321 : Composant cible unifié, motif d’activation & filtrage de pertinence des axes', () => {
	it('résout le composant cible via DEFAULT_URN_TO_COMPONENT et le catalogue projet même sans triplet instantiates_component', () => {
		const iamUrn = 'urn:archinex:ontology:security:iam:oidc_fido2_rbac';
		expect(DEFAULT_URN_TO_COMPONENT[iamUrn]).toBe('iam-keycloak');

		const resolved = collectInstantiatedComponents([iamUrn], fixtureCatalog);
		expect(resolved).toContain('iam-keycloak');

		const withCustomMap = resolveTargetComponentsForUrns([iamUrn], {
			customMap: { [iamUrn]: 'custom-sso-gateway' },
			entities: fixtureCatalog.entities,
			triplets: fixtureCatalog.triplets
		});
		expect(withCustomMap).toContain('custom-sso-gateway');
		expect(withCustomMap).toContain('iam-keycloak');

		const coverage = computeRefinementCoverage(
			{
				subjectId: 'sub_321_iam',
				title: 'Socle IAM OIDC et RBAC',
				problem: 'Fédération OIDC FIDO2 et gestion des secrets dynamiques Vault.',
				explicitBindings: [{ urn: iamUrn, revision: 1 }],
				autoBindFromText: true
			},
			fixtureCatalog
		);

		const iamAxis = coverage.axes.find(
			(a) => a.axisUrn === 'urn:archinex:ontology:axis:iam_federation_mfa'
		);
		expect(iamAxis).toBeDefined();
		expect(iamAxis?.instantiatedComponents).toContain('iam-keycloak');
		expect(iamAxis?.boundLeaves[0]?.targetComponents).toContain('iam-keycloak');
	});

	it('expose le motif d’activation (concept, exigence, mot-clé ou liaison explicite) sur chaque axe', () => {
		const hsmUrn = 'urn:archinex:ontology:security:hsm:eviden_proteccio';
		const coverage = computeRefinementCoverage(
			{
				subjectId: 'sub_321_motif',
				title: 'Coffre de secrets et racine HSM',
				problem: 'Garantir REQ-Lot1-1343 avec HSM matériel et PKI interne.',
				decisionText: 'Déploiement HSM matériel et coffre OpenBao.',
				explicitBindings: [{ urn: hsmUrn, revision: 1 }],
				autoBindFromText: true
			},
			fixtureCatalog
		);

		const hsmAxis = coverage.axes.find(
			(a) => a.axisUrn === 'urn:archinex:ontology:axis:hsm_key_custody'
		);
		expect(hsmAxis?.activationReason).toBeDefined();
		expect(hsmAxis?.activationReason?.source).toBe('explicit_binding');
		expect(hsmAxis?.activationReason?.matchedComponents).toContain('hsm-appliance');
		expect(hsmAxis?.relevanceLevel).toBe('high');

		const vaultAxis = coverage.axes.find(
			(a) => a.axisUrn === 'urn:archinex:ontology:axis:secrets_vault_management'
		);
		expect(vaultAxis?.activationReason).toBeDefined();
		expect(vaultAxis?.activationReason?.summary.length).toBeGreaterThan(10);
	});

	it('filtre les axes datacenter/cœur hors-périmètre sur un sujet applicatif/terminal (ex: OS terminaux)', () => {
		const coverage = computeRefinementCoverage(
			{
				subjectId: 'sub_321_os_terminaux',
				title: 'OS terminaux mobiles terrain',
				problem:
					'Sélection de l’OS des terminaux durcis (Android AOSP vs Linux embarqué) et durcissement applicatif MDM.',
				decisionText: 'Standardisation sur un OS durci pour terminaux mobiles avec gestion de flotte.',
				autoBindFromText: true,
				selectedConceptUrn: 'AUTO'
			},
			fixtureCatalog
		);

		const hasDatacenterAxes = coverage.axes.some((a) =>
			[
				'urn:archinex:ontology:axis:compute_substrate',
				'urn:archinex:ontology:axis:oob_management',
				'urn:archinex:ontology:axis:power_cooling_resilience',
				'urn:archinex:ontology:axis:network_underlay_fabric'
			].includes(a.axisUrn)
		);
		expect(hasDatacenterAxes).toBe(false);
	});

	it('permet d’écarter manuellement un axe hors-périmètre via excludedAxisUrns sans polluer composedBindings', () => {
		const baseInput = {
			subjectId: 'sub_321_dismiss',
			title: 'Plateforme Cluster Telco Cloud',
			problem: 'Déploiement bare-metal avec réseau OOB et énergie 2N.',
			decisionText: 'Cluster Sylva sur serveurs Bare-Metal avec double alimentation 2N.',
			autoBindFromText: true,
			selectedConceptUrn: 'AUTO'
		};

		const initial = computeRefinementCoverage(baseInput, fixtureCatalog);
		const powerAxisUrn = 'urn:archinex:ontology:axis:power_cooling_resilience';
		expect(initial.axes.some((a) => a.axisUrn === powerAxisUrn)).toBe(true);

		const afterDismiss = computeRefinementCoverage(
			{
				...baseInput,
				excludedAxisUrns: [powerAxisUrn]
			},
			fixtureCatalog
		);

		expect(afterDismiss.axes.some((a) => a.axisUrn === powerAxisUrn)).toBe(false);
		const dismissedAxis = afterDismiss.outOfScopeAxes?.find((a) => a.axisUrn === powerAxisUrn);
		expect(dismissedAxis).toBeDefined();
		expect(dismissedAxis?.isOutOfScope).toBe(true);
		expect(dismissedAxis?.isManuallyExcluded).toBe(true);
		expect(
			afterDismiss.composedBindings.some((b) =>
				dismissedAxis?.candidateLeaves.some((c) => c.urn === b.urn)
			)
		).toBe(false);
	});

	it('intègre l’affichage composant cible, motif d’activation et masquage hors-périmètre dans Phase4RefinementHub et API EDP', () => {
		const phase4Content = readFileSync(
			resolve(process.cwd(), 'src/lib/components/deliberation/Phase4RefinementHub.svelte'),
			'utf8'
		);
		expect(phase4Content).toContain('phase4-axis-components');
		expect(phase4Content).toContain('phase4-leaf-components');
		expect(phase4Content).toContain('phase4-leaf-rego-rules');
		expect(phase4Content).toContain('phase4-axis-activation-reason');
		expect(phase4Content).toContain('phase4-dismiss-axis-btn');
		expect(phase4Content).toContain('phase4-out-of-scope-panel');
		expect(phase4Content).toContain('phase4-restore-axis-btn');

		const apiContent = readFileSync(
			resolve(process.cwd(), 'src/routes/api/projects/[projectId]/subjects/[subjectId]/edp/+server.ts'),
			'utf8'
		);
		expect(apiContent).toContain("action === 'dismiss_axis'");
		expect(apiContent).toContain("action === 'restore_axis'");
		expect(apiContent).toContain('excludedAxisUrns');
	});
});
