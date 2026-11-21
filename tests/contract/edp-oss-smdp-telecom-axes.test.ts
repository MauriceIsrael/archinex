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
import { matchReferenceBuildingBlock } from '$lib/domain/edp/togafTaxonomy';
import type { OntologyCatalog } from '$lib/server/edp/ontologyClient';
import {
	composeMultiAxisHydration,
	computeRefinementCoverage,
	evaluateMultiAxisOracle,
	ratifyDefaultDecisionSlots
} from '$lib/server/edp/refinementCoverage';
import { readFixtureCatalog } from '../helpers/ontologyFixture';

const fixtureCatalog = readFixtureCatalog() as OntologyCatalog;

describe('Issue #326 : Axes & composants OSS/SMO/CMDB, eSIM SM-DP+, N3IWF/WLAN, eMBMS/Slicing & PQC', () => {
	it('associe les 9 nouveaux axes de TOGAF_REFERENCE_BUILDING_BLOCKS à leurs composants responsables', () => {
		const expectations: Array<[string, string, string]> = [
			['Gouvernance eSIM SM-DP+ GSMA SGP.22 certifiée SAS-SM avec 4-yeux', 'esim-smdp-provisioning', 'esim-smdp'],
			['Médiation OSS / EMS et modèle NRM unifié 3GPP TS 28.532', 'oss-smo-mediation', 'oss-smo-mediation'],
			['Automatisation SMO boucle fermée avec Human-in-the-Loop et corrélation RCA', 'oss-automation-hitl', 'oss-smo-mediation'],
			['Réconciliation inventaire réseau et CMDB ITSM', 'cmdb-asset-inventory', 'cmdb-inventory'],
			['Assurance de service par sondes actives et gouvernance QoS 5QI', 'service-assurance-probes', 'oss-smo-mediation'],
			['Interworking Wi-Fi WLAN offload non-3GPP via N3IWF et ePDG', 'non3gpp-wlan-interworking', 'n3iwf-epdg-gateway'],
			['Tranchage réseau 5G network slicing S-NSSAI et SST', 'core-5g-network-slicing', 'core-network'],
			['Diffusion multicast broadcast groupe mission-critical via eMBMS et 5MBS', 'embms-multicast-broadcast', 'ptt-server'],
			['Cryptographie post-quantique PQC ML-KEM ML-DSA et crypto-agilité', 'pqc-crypto-agility', 'pki-ca']
		];

		for (const [text, expectedAxisId, expectedComponent] of expectations) {
			const block = matchReferenceBuildingBlock(text);
			expect(block?.id).toBe(expectedAxisId);
			expect(block?.logicalComponentName).toBe(expectedComponent);
		}
	});

	it('valide les 4 nouveaux composants (esim-smdp, oss-smo-mediation, cmdb-inventory, n3iwf-epdg-gateway) sur prod/preprod/lab', () => {
		const targetNames = ['esim-smdp', 'oss-smo-mediation', 'cmdb-inventory', 'n3iwf-epdg-gateway'];

		for (const name of targetNames) {
			const comp = DEFAULT_COMPONENT_CATALOG.find((c) => c.metadata.name === name);
			expect(comp).toBeDefined();
			expect(lintBaseComponentNoHardcodedEnv(comp!)).toEqual([]);
			expect(validateComponentAgainstCatalogs(comp!, DEFAULT_VALUE_CATALOGS)).toEqual([]);

			for (const overlay of DEFAULT_ENVIRONMENT_OVERLAYS) {
				const primaryDc = overlay.spec.datacenters[0] || 'dc1';
				const resolved = resolveComponentInstance(comp!, overlay, primaryDc, DEFAULT_VALUE_CATALOGS);
				expect(resolved.unresolvedRefs).toEqual([]);
				expect(resolved.subnets.length).toBeGreaterThan(0);
			}
		}

		expect(verifyCatalogDanglingReferences(COMPLETE_COMPONENT_CATALOG).valid).toBe(true);

		const instantiated = instantiateCatalogFromOntologyBindings(
			[
				'urn:archinex:ontology:security:esim:smdp_sas_sm_eu_hsm',
				'urn:archinex:ontology:operations:oss:unified_nrm_ts28532_mediation',
				'urn:archinex:ontology:operations:cmdb:nautobot_itsm_reconciliation',
				'urn:archinex:ontology:network:interworking:n3iwf_epdg_ipsec'
			],
			DEFAULT_COMPONENT_CATALOG
		);
		const names = instantiated.map((c) => c.metadata.name);
		for (const expected of targetNames) {
			expect(names).toContain(expected);
		}
	});

	it('déclenche les 9 axes, calcule leurs prérequis transitifs et valide les 9 règles Rego OPA (nominal + dérive)', async () => {
		const subject = {
			subjectId: 'sub_telecom_oss_smdp_01',
			title: 'Architecture OSS/SMO/CMDB, eSIM SM-DP+, N3IWF WLAN, eMBMS, 5G Slicing et PQC',
			problem:
				'Couvrir le provisioning eSIM SM-DP+ SAS-SM 4-yeux, la médiation OSS NRM TS 28.532, le SMO Human-in-the-Loop, la CMDB ITSM, les sondes actives 5QI, l’interworking WLAN N3IWF/ePDG, le network slicing 5G S-NSSAI, la diffusion eMBMS/5MBS et la crypto-agilité PQC ML-KEM.',
			decisionText:
				'SM-DP+ SAS-SM UE, NRM 3GPP TS 28.532, SMO HITL, CMDB synchronisée, sondes non-invasives, N3IWF IPsec, slicing S-NSSAI, eMBMS authentifié et PQC hybride.',
			autoBindFromText: true
		};

		const initialCoverage = computeRefinementCoverage(subject, fixtureCatalog);
		expect(initialCoverage.conscientiousMetrics?.phantomOracleCount).toBe(0);

		const axisUrns = initialCoverage.axes.map((a) => a.axisUrn);
		expect(axisUrns).toContain('urn:archinex:ontology:axis:esim_smdp_provisioning');
		expect(axisUrns).toContain('urn:archinex:ontology:axis:oss_smo_mediation');
		expect(axisUrns).toContain('urn:archinex:ontology:axis:oss_automation_hitl');
		expect(axisUrns).toContain('urn:archinex:ontology:axis:cmdb_asset_inventory');
		expect(axisUrns).toContain('urn:archinex:ontology:axis:service_assurance_probes');
		expect(axisUrns).toContain('urn:archinex:ontology:axis:non3gpp_wlan_interworking');
		expect(axisUrns).toContain('urn:archinex:ontology:axis:core_5g_network_slicing');
		expect(axisUrns).toContain('urn:archinex:ontology:axis:embms_multicast_broadcast');
		expect(axisUrns).toContain('urn:archinex:ontology:axis:pqc_crypto_agility');
		// Prérequis transitifs
		expect(axisUrns).toContain('urn:archinex:ontology:axis:hsm_key_custody');
		expect(axisUrns).toContain('urn:archinex:ontology:axis:pki_hierarchy');
		expect(axisUrns).toContain('urn:archinex:ontology:axis:wan_interco_encryption');

		const ratifiedBindings = ratifyDefaultDecisionSlots(initialCoverage);
		const ratifiedCoverage = computeRefinementCoverage(
			{ ...subject, explicitBindings: ratifiedBindings },
			fixtureCatalog
		);
		expect(ratifiedCoverage.conscientiousMetrics?.phantomOracleCount).toBe(0);

		const nominalHydrated = composeMultiAxisHydration(
			subject.subjectId,
			ratifiedCoverage.composedBindings,
			fixtureCatalog
		);
		const resolvedNames = (nominalHydrated.resolved_components || []).map((c) => c.name);
		expect(resolvedNames).toContain('esim-smdp');
		expect(resolvedNames).toContain('oss-smo-mediation');
		expect(resolvedNames).toContain('cmdb-inventory');
		expect(resolvedNames).toContain('n3iwf-epdg-gateway');

		const nominalVerdict = await evaluateMultiAxisOracle(
			nominalHydrated,
			ratifiedCoverage.composedBindings,
			fixtureCatalog
		);
		expect(nominalVerdict.violations).toEqual([]);
		expect(nominalVerdict.verdict).toBe('compliant');

		const violatedHydrated = composeMultiAxisHydration(
			subject.subjectId,
			ratifiedCoverage.composedBindings,
			fixtureCatalog,
			{
				esimSasSmCertified: false,
				esimFourEyesApproval: false,
				ossNrmStandard: 'proprietary-unmapped',
				smoHitlApproval: false,
				cmdbSyncEnabled: false,
				serviceAssuranceProbesNonInvasive: false,
				non3gppIpsecEnforced: false,
				core5gSliceIsolation: false,
				embmsAuthenticated: false,
				pqcHybridAgility: false
			}
		);

		const violatedVerdict = await evaluateMultiAxisOracle(
			violatedHydrated,
			ratifiedCoverage.composedBindings,
			fixtureCatalog
		);
		expect(violatedVerdict.verdict).toBe('violated');
		const violatedRules = violatedVerdict.violations.map((v) => v.rule);
		expect(violatedRules).toContain('data.archinex.edp.multiaxis.deny_unaccredited_esim_smdp');
		expect(violatedRules).toContain('data.archinex.edp.multiaxis.deny_unstandardized_oss_nrm_mediation');
		expect(violatedRules).toContain('data.archinex.edp.multiaxis.deny_unapproved_closed_loop_automation');
		expect(violatedRules).toContain('data.archinex.edp.multiaxis.deny_desynchronized_cmdb_inventory');
		expect(violatedRules).toContain('data.archinex.edp.multiaxis.deny_missing_service_assurance_probes');
		expect(violatedRules).toContain('data.archinex.edp.multiaxis.deny_unencrypted_non3gpp_interworking');
		expect(violatedRules).toContain('data.archinex.edp.multiaxis.deny_unisolated_5g_network_slice');
		expect(violatedRules).toContain('data.archinex.edp.multiaxis.deny_unauthenticated_embms_broadcast');
		expect(violatedRules).toContain('data.archinex.edp.multiaxis.deny_non_pqc_crypto_agility');
	});
});
