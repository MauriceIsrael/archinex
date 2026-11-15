import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExtractedClause } from '$lib/domain/corpus';
import {
	DEFAULT_COMPONENT_CATALOG,
	DEFAULT_ENVIRONMENT_OVERLAYS,
	DEFAULT_VALUE_CATALOGS,
	createEmergentLogicalComponent,
	instantiateCatalogFromOntologyBindings,
	lintBaseComponentNoHardcodedEnv,
	validateComponentAgainstCatalogs
} from '$lib/domain/edp/componentCatalog';
import { resolveComponentInstance } from '$lib/domain/edp/refResolver';
import { runSylvaDigitalTwinMatrix } from '$lib/domain/edp/sylvaTwin';
import {
	detectEmergentCapabilityNeed,
	matchReferenceBuildingBlock
} from '$lib/domain/edp/togafTaxonomy';
import type { OntologyCatalog } from '$lib/server/edp/ontologyClient';
import {
	composeMultiAxisHydration,
	computeRefinementCoverage,
	evaluateMultiAxisOracle,
	ratifyDefaultDecisionSlots
} from '$lib/server/edp/refinementCoverage';
import {
	buildLiveArchitectureLockSnapshot,
	recordExplicitProjectSlotRatification,
	resetProjectSlotRegistry
} from '$lib/server/edp/decisionSlotRegistry';
import {
	applyClassificationInvariants,
	buildAuditReport
} from '$lib/server/ingest/arckitRequirementsPipeline';

const fixtureCatalog = JSON.parse(
	readFileSync(resolve(process.cwd(), 'tests/fixtures/edp/ontology_export.json'), 'utf8')
) as OntologyCatalog;

describe('Allocation explicite SIG (§9.4, §11 DEMOLULU) & Sujets RFP inédits / émergents (ex: IoT)', () => {
	it('expose les axes SIG (fusion de localisation + moteur cartographique) sur sub_lulu_64 en « Défaut proposé » puis alloue explicitement gis-server / ptt-server', async () => {
		const sigInput = {
			subjectId: 'sub_lulu_64',
			title:
				'§9.4, §11 · Fusion de localisation multi-sources du SIG : pipeline, fréquence, cloisonnement et géofencing',
			problem:
				'Arbitrer entre fusion de localisation 100 % serveur vs hybride terminal/serveur, cadencement et cloisonnement des identités radio.',
			decisionText: 'Fusion centrale, géofencing hybride (REQ-Lot1-786, REQ-Lot1-795, REQ-Lot1-819, REQ-Lot1-830).',
			autoBindFromText: true
		};

		// 1. Avant décision explicite en Phase 4 : les axes SIG remontent mais restent en `default_proposed` (Zéro Défaut Silencieux)
		const initialCoverage = computeRefinementCoverage(sigInput, fixtureCatalog);

		const fusionAxis = initialCoverage.axes.find(
			(a) => a.axisUrn === 'urn:archinex:ontology:axis:gis_location_fusion'
		);
		const tileAxis = initialCoverage.axes.find(
			(a) => a.axisUrn === 'urn:archinex:ontology:axis:gis_tile_engine'
		);

		expect(fusionAxis).toBeDefined();
		expect(tileAxis).toBeDefined();
		expect(fusionAxis?.bindingOrigin).toBe('default_proposed');
		expect(fusionAxis?.requiresRatification).toBe(true);
		expect(fusionAxis?.boundLeaves).toHaveLength(1);
		expect(fusionAxis?.boundLeaves[0].urn).toBe(
			'urn:archinex:ontology:application:gis:central_fusion_hybrid_geofencing'
		);
		expect(fusionAxis?.instantiatedComponents).toEqual(['gis-server', 'ptt-server']);
		expect(tileAxis?.bindingOrigin).toBe('default_proposed');
		expect(tileAxis?.requiresRatification).toBe(true);
		expect(tileAxis?.instantiatedComponents).toContain('gis-server');
		expect(initialCoverage.conscientiousMetrics?.isConscientiouslyComplete).toBe(false);

		// 2. L'architecte peut arbitrer explicitement vers une variante 100 % gis-server ou distribuée ptt-server
		const serverOnlyCoverage = computeRefinementCoverage(
			{
				...sigInput,
				explicitBindings: [
					{
						urn: 'urn:archinex:ontology:application:gis:central_fusion_server_only_geofencing',
						revision: 1
					},
					{
						urn: 'urn:archinex:ontology:application:gis:geoserver_postgis_offline',
						revision: 1
					}
				]
			},
			fixtureCatalog
		);
		const serverOnlyAxis = serverOnlyCoverage.axes.find(
			(a) => a.axisUrn === 'urn:archinex:ontology:axis:gis_location_fusion'
		);
		expect(serverOnlyAxis?.bindingOrigin).toBe('explicit');
		expect(serverOnlyAxis?.requiresRatification).toBe(false);
		expect(serverOnlyAxis?.instantiatedComponents).toEqual(['gis-server']);

		// 3. Ratification complète du choix hybride retenu + évaluation OPA + Jumeau Numérique Sylva
		const ratifiedBindings = ratifyDefaultDecisionSlots(initialCoverage);
		const ratifiedCoverage = computeRefinementCoverage(
			{
				...sigInput,
				explicitBindings: ratifiedBindings
			},
			fixtureCatalog
		);
		expect(ratifiedCoverage.conscientiousMetrics?.defaultProposedSlots).toBe(0);
		expect(ratifiedCoverage.conscientiousMetrics?.humanRatifiedRatio).toBe(1);
		expect(ratifiedCoverage.conscientiousMetrics?.phantomOracleCount).toBe(0);

		const hydrated = composeMultiAxisHydration(
			'sub_lulu_64',
			ratifiedCoverage.composedBindings,
			fixtureCatalog
		);
		expect(hydrated.resolved_components?.some((c) => c.name === 'gis-server')).toBe(true);
		expect(hydrated.resolved_components?.some((c) => c.name === 'ptt-server')).toBe(true);
		expect(hydrated.sylva_twin_report?.profiles).toHaveLength(3);

		const verdict = await evaluateMultiAxisOracle(
			hydrated,
			ratifiedCoverage.composedBindings,
			fixtureCatalog
		);
		expect(verdict.verdict).toBe('compliant');
		expect(verdict.violations).toHaveLength(0);
	});

	it('détecte dès la Phase 1 (Ingestion) un sujet inédit (IoT / LoRaWAN / MQTT) sans perte silencieuse et l’instancie jusqu’au Jumeau Sylva', async () => {
		expect(
			matchReferenceBuildingBlock(
				'Collecte des capteurs IoT terrain via passerelles LoRaWAN et courtier MQTT sécurisé'
			)
		).toBeUndefined();

		const detection = detectEmergentCapabilityNeed(
			'Collecte des capteurs IoT terrain via passerelles LoRaWAN et courtier MQTT sécurisé',
			'FR'
		);
		expect(detection).toBeDefined();
		expect(detection?.isEmergent).toBe(true);
		expect(detection?.suggestedComponentName).toBe('iot-gateway');
		expect(detection?.candidateExistingComponents).toContain('gis-server');

		// 1. Phase 1 Ingestion : clauses IoT (délibérée + commodité) + clause commodité exotique sans brique connue
		const clauses: ExtractedClause[] = [
			{
				id: 'iot-1',
				clauseRef: 'REQ-IOT-01',
				title: 'Médiation IoT LoRaWAN et MQTT',
				text: 'Le système doit ingérer les télémesures des capteurs IoT terrain via LoRaWAN et MQTT.',
				criticality: 'majeur'
			},
			{
				id: 'iot-2',
				clauseRef: 'REQ-IOT-02',
				title: 'Passerelle IoT de télémétrie',
				text: 'Les capteurs IoT envoient leurs trames périodiques vers la passerelle IoT.',
				criticality: 'info'
			},
			{
				id: 'unmapped-1',
				clauseRef: 'REQ-MISC-01',
				title: 'Signalétique des baies',
				text: 'Chaque baie reçoit un étiquetage gravé normalisé.',
				criticality: 'info'
			}
		];

		const audited = applyClassificationInvariants(clauses, [
			{
				ref: 'REQ-IOT-01',
				category: 'FR',
				disposition: 'deliberate',
				reason: 'Arbitrage d architecture sur le composant responsable de la chaîne IoT.'
			},
			{
				ref: 'REQ-IOT-02',
				category: 'FR',
				disposition: 'commodity',
				reason: 'Collecte périodique standard des trames capteurs.'
			},
			{
				ref: 'REQ-MISC-01',
				category: 'FAC',
				disposition: 'commodity',
				reason: 'Étiquetage physique standard des baies en salle.'
			}
		]);

		const report = buildAuditReport(audited, []);
		// Zéro perte silencieuse des commodités évacuées (même hors catalogue des 30 briques)
		expect(report.evacuatedCount).toBe(2);
		expect(report.commoditySlots?.length).toBe(2);
		expect(report.emergentSlots?.length).toBeGreaterThanOrEqual(1);
		expect(report.emergentSlots?.[0].suggestedComponentName).toBe('iot-gateway');
		expect(report.emergentSlots?.[0].status).toBe('open');

		// 2. Phase 4 Raffinement : le sujet IoT expose dynamiquement l'axe d'allocation de composant émergent
		const iotSubjectCoverage = computeRefinementCoverage(
			{
				subjectId: 'subj-iot-01',
				title: 'Collecte et médiation des capteurs IoT LoRaWAN / MQTT',
				problem: 'Quel composant logique doit porter l ingestion MQTT et le décodage LoRaWAN ?',
				decisionText: 'Isolation de la collecte IoT et corrélation géospatiale.',
				isNovelSubject: true,
				autoBindFromText: true
			},
			fixtureCatalog
		);

		const emergentAxis = iotSubjectCoverage.axes.find(
			(a) => a.axisUrn === 'urn:archinex:ontology:axis:emergent_component_allocation'
		);
		expect(emergentAxis).toBeDefined();
		expect(emergentAxis?.requiresRatification).toBe(true);
		expect(emergentAxis?.bindingOrigin).toBe('default_proposed');
		expect(emergentAxis?.instantiatedComponents).toContain('iot-gateway');
		expect(
			emergentAxis?.candidateLeaves.some(
				(c) => c.urn === 'urn:archinex:ontology:application:emergent:new_iot_gateway'
			)
		).toBe(true);
		expect(
			emergentAxis?.candidateLeaves.some(
				(c) => c.urn === 'urn:archinex:ontology:application:emergent:allocate_gis_server'
			)
		).toBe(true);

		// 3. Choix explicite de l'architecte : instancier le nouveau composant logique `iot-gateway`
		const ratifiedIotCoverage = computeRefinementCoverage(
			{
				subjectId: 'subj-iot-01',
				title: 'Collecte et médiation des capteurs IoT LoRaWAN / MQTT',
				problem: 'Quel composant logique doit porter l ingestion MQTT et le décodage LoRaWAN ?',
				explicitBindings: [
					{
						urn: 'urn:archinex:ontology:application:emergent:new_iot_gateway',
						revision: 1
					}
				],
				autoBindFromText: false
			},
			fixtureCatalog
		);
		const ratifiedEmergentAxis = ratifiedIotCoverage.axes.find(
			(a) => a.axisUrn === 'urn:archinex:ontology:axis:emergent_component_allocation'
		);
		expect(ratifiedEmergentAxis?.bindingOrigin).toBe('explicit');
		expect(ratifiedEmergentAxis?.requiresRatification).toBe(false);
		expect(ratifiedEmergentAxis?.instantiatedComponents).toEqual(['iot-gateway']);

		// 4. Phase 5 Consolidation : instanciation dans le catalogue Base × Overlay × DC et Jumeau Sylva
		const iotComp = createEmergentLogicalComponent('iot-gateway');
		expect(lintBaseComponentNoHardcodedEnv(iotComp)).toEqual([]);
		expect(validateComponentAgainstCatalogs(iotComp, DEFAULT_VALUE_CATALOGS)).toEqual([]);

		const catalogWithIot = instantiateCatalogFromOntologyBindings(
			['urn:archinex:ontology:application:emergent:new_iot_gateway'],
			DEFAULT_COMPONENT_CATALOG
		);
		expect(catalogWithIot.some((c) => c.metadata.name === 'iot-gateway')).toBe(true);
		expect(catalogWithIot.some((c) => c.metadata.name === 'pki-ca')).toBe(true);
		expect(catalogWithIot.some((c) => c.metadata.name === 'vault-cluster')).toBe(true);

		for (const overlay of DEFAULT_ENVIRONMENT_OVERLAYS) {
			const dc = overlay.spec.datacenters[0] || 'dc1';
			const resolved = resolveComponentInstance(iotComp, overlay, dc, DEFAULT_VALUE_CATALOGS);
			expect(resolved.unresolvedRefs).toEqual([]);
			expect(resolved.modules[0].instances[0].nics.length).toBe(3);
		}

		const twinReport = runSylvaDigitalTwinMatrix({
			components: catalogWithIot,
			overlay: DEFAULT_ENVIRONMENT_OVERLAYS[0],
			catalogs: DEFAULT_VALUE_CATALOGS
		});
		expect(twinReport.profiles).toHaveLength(3);
		expect(twinReport.recommendedProfileId).toBe('3dc-active');
	});

	it('fournit à tout instant une vue en direct de l’architecture lockée (buildLiveArchitectureLockSnapshot) distinguant composants verrouillés, proposés et émergents', async () => {
		const testProjectId = 'lulu-live-lock-test';
		resetProjectSlotRegistry(testProjectId);

		try {
			// 1. À l’instant initial (avant toute ratification humaine) : état partial_live_lock, 0 composant verrouillé
			const initialSnap = await buildLiveArchitectureLockSnapshot(
				{
					projectId: testProjectId,
					projectTitle: 'DEMOLULU Live Lock',
					title: '§9.4, §11 · Fusion de localisation multi-sources du SIG : pipeline et géofencing',
					decisionText: 'Fusion centrale et géofencing hybride.'
				},
				fixtureCatalog
			);
			expect(initialSnap.lockState).toBe('partial_live_lock');
			expect(initialSnap.summary.lockedSlotsCount).toBe(0);
			expect(initialSnap.summary.defaultProposedSlotsCount).toBeGreaterThan(0);

			const gisBefore = initialSnap.components.find((c) => c.name === 'gis-server');
			expect(gisBefore?.lockStatus).toBe('default_proposed');

			// 2. L’architecte ratifie en Phase 4 le sujet SIG (gis_location_fusion) et un sujet émergent IoT (iot-gateway)
			await recordExplicitProjectSlotRatification(
				{
					projectId: testProjectId,
					axisUrn: 'urn:archinex:ontology:axis:gis_location_fusion',
					leafUrn: 'urn:archinex:ontology:application:gis:central_fusion_hybrid_geofencing',
					actorId: 'lead@archinex.local',
					actorRole: 'lead_architect',
					rationale: 'Arbitrage SIG §9.4/§11 : fusion centrale gis-server + géofencing hybride ptt-server'
				},
				fixtureCatalog
			);

			await recordExplicitProjectSlotRatification(
				{
					projectId: testProjectId,
					axisUrn: 'urn:archinex:ontology:axis:emergent_component_allocation',
					leafUrn: 'urn:archinex:ontology:application:emergent:new_iot_gateway',
					actorId: 'lead@archinex.local',
					actorRole: 'lead_architect',
					rationale: 'Création du composant dédié iot-gateway pour la collecte LoRaWAN/MQTT'
				},
				fixtureCatalog
			);

			const updatedSnap = await buildLiveArchitectureLockSnapshot(
				{
					projectId: testProjectId,
					projectTitle: 'DEMOLULU Live Lock',
					title: '§9.4, §11 · Fusion de localisation multi-sources du SIG : pipeline et géofencing',
					decisionText: 'Fusion centrale et géofencing hybride.'
				},
				fixtureCatalog
			);

			expect(updatedSnap.summary.lockedSlotsCount).toBe(2);
			expect(updatedSnap.liveIntegritySha256).not.toBe(initialSnap.liveIntegritySha256);

			const gisAfter = updatedSnap.components.find((c) => c.name === 'gis-server');
			const pttAfter = updatedSnap.components.find((c) => c.name === 'ptt-server');
			const iotAfter = updatedSnap.components.find((c) => c.name === 'iot-gateway');

			expect(gisAfter?.lockStatus).toBe('locked');
			expect(gisAfter?.coveredRequirementRefs).toContain('REQ-Lot1-786');
			expect(pttAfter?.lockStatus).toBe('locked');
			expect(iotAfter?.lockStatus).toBe('emergent_locked');
			expect(iotAfter?.layer).toBe('application-business');

			expect(updatedSnap.mermaidLockedOnly).toContain('gis-server');
			expect(updatedSnap.mermaidLockedOnly).toContain('ptt-server');
			expect(updatedSnap.mermaidLockedOnly).toContain('iot-gateway');
		} finally {
			resetProjectSlotRegistry(testProjectId);
		}
	});
});
