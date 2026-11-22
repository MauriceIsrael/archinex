import { describe, expect, it } from 'vitest';
import { computeMaturity } from '$lib/domain/maturityRules';
import {
	classifyObjectionSeverity,
	countBlockingOpenObjections,
	countOpenObjections,
	type Argument
} from '$lib/domain/debate';
import { CreateDecisionSchema } from '$lib/schemas/decisionApiSchemas';
import { composeMultiAxisHydration } from '$lib/server/edp/refinementCoverage';
import { syncHydratedInventoryToNautobot } from '$lib/server/edp/nautobotSync';
import { loadOntologyCatalog } from '$lib/server/edp/ontologyClient';

function makeBaseOption() {
	return {
		id: 'opt-1',
		subjectId: 'sub-rfp-1',
		title: 'Architecture cible standardisée',
		summary: 'Topologie conforme aux exigences du cahier des charges',
		origin: 'human' as const,
		kbRefs: [],
		status: 'proposed' as const,
		author: 'Lead Architect',
		role: 'lead_architect',
		productionMode: 'human-authored' as const,
		version: 1
	};
}

function makeObjection(overrides: Partial<Argument> = {}): Argument {
	return {
		id: 'arg-obj-1',
		subjectId: 'sub-rfp-1',
		optionId: 'opt-1',
		stance: 'objection',
		claim: 'Risque sur la latence inter-sites',
		grounds: 'La latence WAN dépasse le budget nominal de 5 ms.',
		kbRefs: [],
		confidence: 'designed',
		author: 'agent:challenger',
		authorKind: 'agent:challenger',
		productionMode: 'llm-derived',
		round: 1,
		resolution: 'open',
		version: 1,
		...overrides
	};
}

describe('RFP Fast-Track G3, Triage Objections & Granularité CMDB Planned (#442, #445, #447)', () => {
	describe('1. Mode Fast-Track G3 (#442)', () => {
		it('lève MISSING_CRITERIA, INSUFFICIENT_OPTIONS et UNEVALUATED_OPTION lorsque fastTrackRationale est motivé (>= 10 caractères)', () => {
			const res = computeMaturity({
				subject: {
					id: 'sub-rfp-1',
					name: 'Choix topologie interconnexion',
					problemStatement: 'Définir le mode de raccordement nominal au réseau partenaire.'
				},
				criteria: [],
				options: [makeBaseOption()],
				evaluations: [],
				arguments: [],
				fastTrack: true,
				fastTrackRationale: 'Exigence contractuelle impérative sans variante admissible.'
			});

			expect(res.level).toBe('L2_decomposed');
			expect(res.readyForArbitration).toBe(true);
			expect(res.blockers).toEqual([]);
		});

		it('maintient les garde-fous critiques en mode Fast-Track (problemStatement, option existante, violation KB, objection bloquante)', () => {
			const resMissingProblem = computeMaturity({
				subject: {
					id: 'sub-rfp-1',
					name: 'Sujet sans problème',
					problemStatement: ''
				},
				criteria: [],
				options: [makeBaseOption()],
				evaluations: [],
				arguments: [],
				fastTrack: true,
				fastTrackRationale: 'Justification Fast-Track suffisante.'
			});
			expect(resMissingProblem.readyForArbitration).toBe(false);
			expect(resMissingProblem.blockers.map((b) => b.code)).toContain('MISSING_PROBLEM_STATEMENT');

			const resWithViolation = computeMaturity({
				subject: {
					id: 'sub-rfp-1',
					name: 'Sujet avec violation KB',
					problemStatement: 'Problème clairement cadré.'
				},
				criteria: [],
				options: [makeBaseOption()],
				evaluations: [],
				arguments: [
					{
						id: 'arg-v1',
						subjectId: 'sub-rfp-1',
						optionId: 'opt-1',
						stance: 'verification',
						verdict: 'violates',
						claim: 'Non-conformité doctrinale détectée',
						grounds: 'Viole la règle de cloisonnement.',
						kbRefs: ['RULE-SEC-01'],
						confidence: 'designed',
						author: 'agent:verifier',
						authorKind: 'agent:verifier',
						productionMode: 'llm-derived',
						round: 1,
						resolution: 'open',
						version: 1
					}
				],
				fastTrack: true,
				fastTrackRationale: 'Justification Fast-Track suffisante.'
			});
			expect(resWithViolation.readyForArbitration).toBe(false);
			expect(resWithViolation.blockers.map((b) => b.code)).toContain('UNRESOLVED_VIOLATION');
		});

		it('valide le schéma CreateDecisionSchema en mode Fast-Track', () => {
			const invalid = CreateDecisionSchema.safeParse({
				retainedOptionId: 'opt-1',
				rationale: 'Décision motivée pour le dossier RFP.',
				reversibility: 'costly',
				fastTrack: true,
				fastTrackRationale: 'court'
			});
			expect(invalid.success).toBe(false);

			const valid = CreateDecisionSchema.safeParse({
				retainedOptionId: 'opt-1',
				rationale: 'Décision motivée pour le dossier RFP.',
				reversibility: 'costly',
				fastTrack: true,
				fastTrackRationale: 'Contrainte cliente explicite sans alternative viable.'
			});
			expect(valid.success).toBe(true);
		});
	});

	describe('2. Réduction de la fatigue d’objections LLM (#445)', () => {
		it('distingue les objections bloquantes des objections consultatives (advisory)', () => {
			const blockingHuman = makeObjection({
				authorKind: 'human',
				productionMode: 'human-authored',
				claim: 'Remarque non bloquante mais humaine'
			});
			expect(classifyObjectionSeverity(blockingHuman)).toBe('blocking');

			const advisoryAgent = makeObjection({
				id: 'arg-obj-adv',
				claim: '[Advisory] Point d’attention mineur sur la documentation',
				grounds: 'Remarque consultative sans caractère bloquant pour le HLD.',
				kbRefs: []
			});
			expect(classifyObjectionSeverity(advisoryAgent)).toBe('advisory');

			const explicitAdvisory = makeObjection({
				id: 'arg-obj-exp',
				severity: 'advisory'
			});
			expect(classifyObjectionSeverity(explicitAdvisory)).toBe('advisory');

			const allArgs = [blockingHuman, advisoryAgent, explicitAdvisory];
			expect(countOpenObjections(allArgs)).toBe(3);
			expect(countBlockingOpenObjections(allArgs)).toBe(1);
		});

		it('transforme les objections consultatives en avertissements non bloquants dans computeMaturity', () => {
			const advisoryObj = makeObjection({
				severity: 'advisory',
				claim: 'Suggestion d’optimisation mineure'
			});
			const res = computeMaturity({
				subject: {
					id: 'sub-rfp-1',
					name: 'Sujet avec objection consultative',
					problemStatement: 'Problème cadré.'
				},
				criteria: [],
				options: [makeBaseOption()],
				evaluations: [],
				arguments: [advisoryObj],
				fastTrack: true,
				fastTrackRationale: 'Arbitrage direct en mode RFP.'
			});

			expect(res.readyForArbitration).toBe(true);
			expect(res.blockers).toEqual([]);
			expect(res.warnings.map((w) => w.code)).toContain('ADVISORY_OBJECTION');
		});
	});

	describe('3. Granularité CMDB Planned-Capacity vs Planned-Allocated (#447)', () => {
		it('hydrate en mode capacity_sizing (Planned-Capacity) en marquant les allocations IP nominales comme différées au LLD', async () => {
			const catalog = await loadOntologyCatalog();
			const bindings = [
				{
					axisUrn: 'urn:archinex:ontology:axis:compute_substrate',
					urn: 'urn:archinex:ontology:infrastructure:server:baremetal',
					revision: 1
				}
			];

			const capacityHydrated = composeMultiAxisHydration('sub-rfp-cap', bindings, catalog, {
				planningGranularity: 'capacity_sizing'
			});
			expect(capacityHydrated.planning_granularity).toBe('capacity_sizing');
			expect(capacityHydrated.planning_stage_label).toBe('Planned-Capacity');
			expect(capacityHydrated.capacity_summary?.nominal_allocations_deferred).toBe(true);
			expect(capacityHydrated.capacity_summary?.total_planned_devices).toBeGreaterThan(0);
			expect(capacityHydrated.nautobot_planned_devices[0].planning_stage_label).toBe('Planned-Capacity');
			expect(capacityHydrated.nautobot_planned_devices[0].ip_allocation_mode).toBe('deferred_to_lld');

			const lldHydrated = composeMultiAxisHydration('sub-rfp-lld', bindings, catalog, {
				planningGranularity: 'lld_allocated'
			});
			expect(lldHydrated.planning_granularity).toBe('lld_allocated');
			expect(lldHydrated.planning_stage_label).toBe('Planned-Allocated');
			expect(lldHydrated.capacity_summary?.nominal_allocations_deferred).toBe(false);
			expect(lldHydrated.nautobot_planned_devices[0].ip_allocation_mode).toBe('nominal_allocated');
		});

		it('diffère la création des adresses IP nominales dans Nautobot en mode capacity_sizing tout en synchronisant équipements et interfaces', async () => {
			const catalog = await loadOntologyCatalog();
			const bindings = [
				{
					axisUrn: 'urn:archinex:ontology:axis:compute_substrate',
					urn: 'urn:archinex:ontology:infrastructure:server:baremetal',
					revision: 1
				}
			];
			const capacityHydrated = composeMultiAxisHydration('sub-rfp-cap', bindings, catalog, {
				planningGranularity: 'capacity_sizing'
			});

			const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = (init?.method || 'GET').toUpperCase();
				if (url.endsWith('/api/status/')) {
					return new Response(JSON.stringify({ 'nautobot-version': '2.2.0' }), { status: 200 });
				}
				if (method === 'GET') {
					if (url.includes('/api/extras/statuses/')) {
						return new Response(
							JSON.stringify({ results: [{ id: 'st-planned', name: 'Planned', content_types: [] }] }),
							{ status: 200 }
						);
					}
					if (url.includes('/api/dcim/locations/')) {
						return new Response(
							JSON.stringify({ results: [{ id: 'loc-1', name: 'Site-1' }] }),
							{ status: 200 }
						);
					}
					if (url.includes('/api/ipam/namespaces/')) {
						return new Response(
							JSON.stringify({ results: [{ id: 'ns-1', name: 'Global' }] }),
							{ status: 200 }
						);
					}
					return new Response(JSON.stringify({ results: [] }), { status: 200 });
				}
				const body = init?.body ? JSON.parse(String(init.body)) : {};
				return new Response(JSON.stringify({ id: `id-${Math.random().toString(36).slice(2, 8)}`, ...body }), {
					status: 201
				});
			};

			const summaryCap = await syncHydratedInventoryToNautobot(capacityHydrated, {
				fetchImpl: fakeFetch as typeof fetch
			});
			expect(summaryCap.reachable).toBe(true);
			expect(summaryCap.planningGranularity).toBe('capacity_sizing');
			expect(summaryCap.planningStageLabel).toBe('Planned-Capacity');
			expect(summaryCap.devicesSynced).toBeGreaterThan(0);
			expect(summaryCap.interfacesSynced).toBeGreaterThan(0);
			expect(summaryCap.ipAddressesSynced).toBe(0);
			expect(summaryCap.deferredIpAllocationsCount).toBeGreaterThan(0);

			const summaryLld = await syncHydratedInventoryToNautobot(capacityHydrated, {
				planningGranularity: 'lld_allocated',
				fetchImpl: fakeFetch as typeof fetch
			});
			expect(summaryLld.planningGranularity).toBe('lld_allocated');
			expect(summaryLld.planningStageLabel).toBe('Planned-Allocated');
			expect(summaryLld.ipAddressesSynced).toBeGreaterThan(0);
			expect(summaryLld.deferredIpAllocationsCount).toBe(0);
		});
	});
});
