import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	COMPLETE_COMPONENT_CATALOG,
	DEFAULT_COMPONENT_CATALOG,
	DEFAULT_ENVIRONMENT_OVERLAYS,
	DEFAULT_VALUE_CATALOGS,
	instantiateCatalogFromOntologyBindings,
	lintBaseComponentNoHardcodedEnv,
	validateComponentAgainstCatalogs
} from '$lib/domain/edp/componentCatalog';
import { resolveComponentInstance, verifyCatalogDanglingReferences } from '$lib/domain/edp/refResolver';
import {
	TOGAF_REFERENCE_BUILDING_BLOCKS,
	matchReferenceBuildingBlock
} from '$lib/domain/edp/togafTaxonomy';
import type { OntologyCatalog } from '$lib/server/edp/ontologyClient';
import {
	composeMultiAxisHydration,
	computeRefinementCoverage,
	evaluateMultiAxisOracle,
	ratifyDefaultDecisionSlots
} from '$lib/server/edp/refinementCoverage';

const fixtureCatalog = JSON.parse(
	readFileSync(resolve(process.cwd(), 'tests/fixtures/edp/ontology_export.json'), 'utf8')
) as OntologyCatalog;

describe('Issue #322 : Socle ontologique, catalogue composants et règles Rego Terminaux / OS / MDM-EMM', () => {
	it('référence les 6 axes Terminaux / OS / MDM-EMM dans TOGAF_REFERENCE_BUILDING_BLOCKS avec leurs composants responsables', () => {
		const expectedMappings: Array<[string, string, string]> = [
			['Enrôlement zero-touch et gestion de flotte MDM / EMM des terminaux', 'endpoint-mdm-enrollment', 'mdm-emm'],
			['Enrôlement automatique des certificats terminaux via SCEP et EST', 'endpoint-pki-enrollment', 'pki-ca'],
			['Durcissement OS terminal, Verified Boot et attestation matérielle TPM', 'endpoint-os-hardening', 'endpoint-os-profile'],
			['Chiffrement local File-Based Encryption (FBE) des données sur le terminal', 'endpoint-local-encryption', 'endpoint-os-profile'],
			['Cloisonnement applicatif work profile et sandboxing terminal', 'endpoint-app-sandboxing', 'endpoint-os-profile'],
			['Mises à jour OTA signées par vagues avec partitionnement A/B et rollback', 'endpoint-ota-updates', 'mdm-emm']
		];

		for (const [text, expectedId, expectedComponent] of expectedMappings) {
			const block = matchReferenceBuildingBlock(text);
			expect(block?.id).toBe(expectedId);
			expect(block?.logicalComponentName).toBe(expectedComponent);
		}

		const endpointBlocks = TOGAF_REFERENCE_BUILDING_BLOCKS.filter((b) =>
			b.id.startsWith('endpoint-')
		);
		expect(endpointBlocks).toHaveLength(6);
	});

	it('valide les composants logiques mdm-emm et endpoint-os-profile sans dérive ni référence pendante sur prod/preprod/lab', () => {
		const mdm = DEFAULT_COMPONENT_CATALOG.find((c) => c.metadata.name === 'mdm-emm');
		const osProfile = DEFAULT_COMPONENT_CATALOG.find((c) => c.metadata.name === 'endpoint-os-profile');

		expect(mdm).toBeDefined();
		expect(osProfile).toBeDefined();

		for (const comp of [mdm!, osProfile!]) {
			expect(lintBaseComponentNoHardcodedEnv(comp)).toEqual([]);
			expect(validateComponentAgainstCatalogs(comp, DEFAULT_VALUE_CATALOGS)).toEqual([]);

			for (const overlay of DEFAULT_ENVIRONMENT_OVERLAYS) {
				const primaryDc = overlay.spec.datacenters[0] || 'dc1';
				const resolved = resolveComponentInstance(comp, overlay, primaryDc, DEFAULT_VALUE_CATALOGS);
				expect(resolved.unresolvedRefs).toEqual([]);
				expect(resolved.subnets.length).toBeGreaterThan(0);
			}
		}

		const audit = verifyCatalogDanglingReferences(COMPLETE_COMPONENT_CATALOG);
		expect(audit.valid).toBe(true);

		const instantiated = instantiateCatalogFromOntologyBindings(
			[
				'urn:archinex:ontology:endpoint:mdm:emm_zero_touch_enrollment',
				'urn:archinex:ontology:security:pki:endpoint_scep_est_enrollment',
				'urn:archinex:ontology:endpoint:os:hardened_verified_boot'
			],
			DEFAULT_COMPONENT_CATALOG
		);
		const names = instantiated.map((c) => c.metadata.name);
		expect(names).toContain('mdm-emm');
		expect(names).toContain('pki-ca');
		expect(names).toContain('endpoint-os-profile');
	});

	it('déclenche les axes Terminaux / OS / MDM-EMM, calcule la fermeture transitive et évalue les 6 règles Rego OPA', async () => {
		const endpointSubject = {
			subjectId: 'sub_endpoint_os_mdm_01',
			title: 'Architecture OS terminaux durcis, gestion de flotte MDM/EMM et mises à jour OTA',
			problem:
				'Définir le durcissement OS terminal (Verified Boot), le chiffrement local FBE, le sandboxing work profile, l’enrôlement MDM/EMM, SCEP/EST et les mises à jour OTA A/B.',
			decisionText:
				'Enrôlement MDM/EMM zero-touch, SCEP/EST sur PKI interne, OS durci Verified Boot, chiffrement FBE, work profile et OTA A/B signées.',
			autoBindFromText: true
		};

		const initialCoverage = computeRefinementCoverage(endpointSubject, fixtureCatalog);
		expect(initialCoverage.conscientiousMetrics?.phantomOracleCount).toBe(0);

		const axisUrns = initialCoverage.axes.map((a) => a.axisUrn);
		expect(axisUrns).toContain('urn:archinex:ontology:axis:endpoint_mdm_enrollment');
		expect(axisUrns).toContain('urn:archinex:ontology:axis:endpoint_pki_enrollment');
		expect(axisUrns).toContain('urn:archinex:ontology:axis:endpoint_os_hardening');
		expect(axisUrns).toContain('urn:archinex:ontology:axis:endpoint_local_encryption');
		expect(axisUrns).toContain('urn:archinex:ontology:axis:endpoint_app_sandboxing');
		expect(axisUrns).toContain('urn:archinex:ontology:axis:endpoint_ota_updates');
		// Fermeture transitive vers la PKI centrale
		expect(axisUrns).toContain('urn:archinex:ontology:axis:pki_hierarchy');

		const ratifiedBindings = ratifyDefaultDecisionSlots(initialCoverage);
		const ratifiedCoverage = computeRefinementCoverage(
			{ ...endpointSubject, explicitBindings: ratifiedBindings },
			fixtureCatalog
		);
		expect(ratifiedCoverage.conscientiousMetrics?.phantomOracleCount).toBe(0);

		// Cas nominal conforme
		const nominalHydrated = composeMultiAxisHydration(
			endpointSubject.subjectId,
			ratifiedCoverage.composedBindings,
			fixtureCatalog
		);
		expect(nominalHydrated.resolved_components?.some((c) => c.name === 'mdm-emm')).toBe(true);
		expect(nominalHydrated.resolved_components?.some((c) => c.name === 'endpoint-os-profile')).toBe(true);
		expect(nominalHydrated.resolved_components?.some((c) => c.name === 'pki-ca')).toBe(true);

		const nominalVerdict = await evaluateMultiAxisOracle(
			nominalHydrated,
			ratifiedCoverage.composedBindings,
			fixtureCatalog
		);
		expect(nominalVerdict.violations).toEqual([]);
		expect(nominalVerdict.verdict).toBe('compliant');

		// Cas de dérive : violation simultanée des 6 règles Terminaux / OS / MDM-EMM
		const violatedHydrated = composeMultiAxisHydration(
			endpointSubject.subjectId,
			ratifiedCoverage.composedBindings,
			fixtureCatalog,
			{
				endpointMdmManaged: false,
				endpointPkiProtocol: 'HTTP-PLAIN',
				endpointVerifiedBoot: false,
				endpointLocalEncryptionMode: 'none',
				endpointAppSandboxingMode: 'unrestricted',
				endpointOtaSignedAb: false
			}
		);

		const violatedVerdict = await evaluateMultiAxisOracle(
			violatedHydrated,
			ratifiedCoverage.composedBindings,
			fixtureCatalog
		);
		expect(violatedVerdict.verdict).toBe('violated');
		const violatedRules = violatedVerdict.violations.map((v) => v.rule);
		expect(violatedRules).toContain('data.archinex.edp.multiaxis.deny_unenrolled_endpoint_mdm');
		expect(violatedRules).toContain('data.archinex.edp.multiaxis.deny_unapproved_endpoint_pki_protocol');
		expect(violatedRules).toContain('data.archinex.edp.multiaxis.deny_unverified_endpoint_os_boot');
		expect(violatedRules).toContain('data.archinex.edp.multiaxis.deny_unencrypted_endpoint_storage');
		expect(violatedRules).toContain('data.archinex.edp.multiaxis.deny_missing_endpoint_app_sandbox');
		expect(violatedRules).toContain('data.archinex.edp.multiaxis.deny_unsigned_endpoint_ota_update');
	});
});
