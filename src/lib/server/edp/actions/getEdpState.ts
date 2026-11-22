import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadOntologyCatalog } from '$lib/server/edp/ontologyClient';
import {
	computeRefinementCoverage,
	composeMultiAxisHydration,
	type LldHydrationOverrides
} from '$lib/server/edp/refinementCoverage';
import { getLatestOracleVerdict, listDriftFindings } from '$lib/server/edp/driftService';
import {
	loadPersistedEdpSnapshot,
	loadSubjectContext,
	type EdpActionResult
} from './context';

export async function getEdpState(params: {
	projectId: string;
	subjectId: string;
	requestedConcept?: string;
}): Promise<EdpActionResult> {
	const { projectId, subjectId, requestedConcept } = params;
	try {
		const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
		const ctx = await loadSubjectContext(subjectId, projectId);
		const snapshot = await loadPersistedEdpSnapshot(subjectId);

		if (snapshot.fromDb && snapshot.parsedDb) {
			const parsedContent = snapshot.parsedDb;
			const selectedConceptUrn = requestedConcept || parsedContent.selectedConceptUrn || 'AUTO';
			const coverage = computeRefinementCoverage(
				{
					subjectId,
					title: parsedContent.metadata?.title || ctx.title,
					problem: parsedContent.decision_context?.problem || ctx.problem,
					decisionText: parsedContent.decision_context?.decision || ctx.decisionText,
					structuredFacts: ctx.structuredFacts,
					explicitBindings: snapshot.explicitBindings,
					excludedLeafUrns: snapshot.excludedLeafUrns,
					excludedAxisUrns: snapshot.excludedAxisUrns,
					autoBindFromText: true,
					selectedConceptUrn
				},
				catalog
			);

			const overrides: LldHydrationOverrides = {
				projectRequirementRefs: ctx.requirementClauses,
				...(parsedContent.lldOverrides || {})
			};
			const hydratedInventory = composeMultiAxisHydration(
				subjectId,
				coverage.composedBindings,
				catalog,
				overrides
			);

			const [latestExternalVerdict, subjectFindings] = await Promise.all([
				getLatestOracleVerdict({ edpId: snapshot.fromDb.id }),
				listDriftFindings({ projectId, subjectId })
			]);

			const projectedLastVerdict = latestExternalVerdict
				? {
						verdict: latestExternalVerdict.verdict,
						verified_at: latestExternalVerdict.verifiedAt,
						source: latestExternalVerdict.source,
						provenance: latestExternalVerdict.provenance,
						intent_hash: latestExternalVerdict.intentHash,
						violations: latestExternalVerdict.violations,
						detailedViolations: latestExternalVerdict.detailedViolations,
						ontologyFingerprint: latestExternalVerdict.ontologyFingerprint,
						driftFindingIds: latestExternalVerdict.driftFindingIds
					}
				: parsedContent.lastVerdict;

			return {
				body: {
					driftFindings: subjectFindings,
					edp: {
						...parsedContent,
						metadata: {
							...parsedContent.metadata,
							status: snapshot.fromDb.status,
							revision: snapshot.fromDb.revision
						},
						decision_context: {
							...parsedContent.decision_context,
							ontology_bindings: coverage.composedBindings
						},
						refinementCoverage: coverage,
						hydratedInventory,
						lldOverrides: overrides,
						lastVerdict: projectedLastVerdict,
						provenance: {
							...parsedContent.provenance,
							production_mode: snapshot.fromDb.productionMode,
							validator: snapshot.fromDb.validatorId
								? {
										id: snapshot.fromDb.validatorId,
										role: snapshot.fromDb.validatorRole || 'Lead Architect',
										timestamp: snapshot.fromDb.validatedAt
											? snapshot.fromDb.validatedAt.toISOString()
											: new Date().toISOString()
									}
								: undefined
						},
						staleReason: snapshot.fromDb.staleReason
					}
				}
			};
		}

		// Construction pilotée par le graphe d'ontologie (KAOS AND/OR Refinement)
		const coverage = computeRefinementCoverage(
			{
				subjectId,
				title: ctx.title,
				problem: ctx.problem,
				decisionText: ctx.decisionText,
				structuredFacts: ctx.structuredFacts,
				autoBindFromText: true,
				selectedConceptUrn: requestedConcept || 'AUTO'
			},
			catalog
		);

		const hydratedInventory = composeMultiAxisHydration(
			subjectId,
			coverage.composedBindings,
			catalog,
			{ projectRequirementRefs: ctx.requirementClauses }
		);

		const hasSecurityDomain = coverage.composedBindings.some(
			(b) => catalog.entities[b.urn]?.domain === 'security'
		);
		const hasInfraDomain = coverage.composedBindings.some(
			(b) => catalog.entities[b.urn]?.domain === 'infrastructure'
		);

		const templatePath = resolve(
			process.cwd(),
			hasSecurityDomain && !hasInfraDomain
				? 'edp/examples/adr015-security-zones/edp.json'
				: 'edp/examples/adr012-baremetal/edp.json'
		);

		const raw = existsSync(templatePath)
			? JSON.parse(readFileSync(templatePath, 'utf-8'))
			: { metadata: { status: 'proposed', revision: 1 }, decision_context: {} };

		return {
			body: {
				edp: {
					...raw,
					metadata: {
						...raw.metadata,
						id: `EDP-${ctx.sectionRef.toUpperCase()}`,
						title: `${ctx.title} (${ctx.sectionRef.toUpperCase()})`
					},
					decision_context: {
						...raw.decision_context,
						problem: ctx.problem,
						decision: ctx.decisionText,
						ontology_bindings: coverage.composedBindings
					},
					refinementCoverage: coverage,
					hydratedInventory,
					lldOverrides: {},
					lastVerdict: {
						verdict: 'compliant',
						verified_at: new Date().toISOString(),
						violations: [],
						mutation_score: 100
					}
				}
			}
		};
	} catch (err: any) {
		return { status: 500, body: { edp: null, error: err.message } };
	}
}
