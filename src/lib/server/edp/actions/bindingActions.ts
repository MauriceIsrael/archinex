import { loadOntologyCatalog } from '$lib/server/edp/ontologyClient';
import {
	computeRefinementCoverage,
	composeMultiAxisHydration,
	ratifyDefaultDecisionSlots,
	type LldHydrationOverrides
} from '$lib/server/edp/refinementCoverage';
import { instantiateCatalogFromOntologyBindings } from '$lib/domain/edp/componentCatalog';
import {
	loadProjectComponentCatalog,
	saveProjectComponentCatalog
} from '$lib/server/edp/componentCatalogRepository';
import {
	recordExplicitProjectSlotRatification,
	revokeProjectSlotRatification
} from '$lib/server/edp/decisionSlotRegistry';
import {
	buildDefaultEdpShell,
	loadPersistedEdpSnapshot,
	loadSubjectContext,
	upsertEdpRecord,
	type EdpActionContext,
	type EdpActionResult
} from './context';
import type { BindAspectInput, UnratifyInput } from './schemas';

export async function handleBindAspect(
	actionCtx: EdpActionContext,
	input: BindAspectInput
): Promise<EdpActionResult> {
	const { projectId, subjectId, actor } = actionCtx;
	const { leafUrn, axisUrn, bindMode, selectedConceptUrn, ratifyAllDefaults } = input;
	try {
		const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
		const ctx = await loadSubjectContext(subjectId, projectId);
		const snapshot = await loadPersistedEdpSnapshot(subjectId);
		const currentEdp = snapshot.parsedDb || buildDefaultEdpShell(ctx, 'proposed');

		const activeConcept = selectedConceptUrn || currentEdp.selectedConceptUrn || 'AUTO';
		const excludedLeafSet = new Set<string>(snapshot.excludedLeafUrns);
		const excludedAxisUrns = snapshot.excludedAxisUrns;

		const initialCoverage = computeRefinementCoverage(
			{
				subjectId,
				title: currentEdp.metadata?.title || ctx.title,
				problem: currentEdp.decision_context?.problem || ctx.problem,
				decisionText: currentEdp.decision_context?.decision || ctx.decisionText,
				structuredFacts: ctx.structuredFacts,
				explicitBindings: snapshot.explicitBindings,
				excludedLeafUrns: Array.from(excludedLeafSet),
				excludedAxisUrns,
				autoBindFromText: true,
				selectedConceptUrn: activeConcept
			},
			catalog
		);

		const updatedBindingMap = new Map<string, number | string>();
		for (const b of snapshot.explicitBindings) {
			updatedBindingMap.set(b.urn, b.revision);
		}

		const effectiveMode: 'add' | 'replace' | 'remove' = bindMode || 'add';
		const isEmergentLeaf =
			typeof leafUrn === 'string' &&
			leafUrn.startsWith('urn:archinex:ontology:application:emergent:');
		let resolvedTargetAxisUrn: string | undefined = axisUrn;

		if (leafUrn && (catalog.entities[leafUrn] || isEmergentLeaf)) {
			const targetAxisUrn =
				axisUrn ||
				(isEmergentLeaf
					? 'urn:archinex:ontology:axis:emergent_component_allocation'
					: (catalog.triplets || []).find(
							(t) => t.predicate === 'implemented_by' && t.object === leafUrn
						)?.subject);
			resolvedTargetAxisUrn = targetAxisUrn;

			if (effectiveMode === 'remove') {
				updatedBindingMap.delete(leafUrn);
				excludedLeafSet.add(leafUrn);
			} else {
				excludedLeafSet.delete(leafUrn);
				if (effectiveMode === 'replace' && targetAxisUrn) {
					if (isEmergentLeaf) {
						for (const existingUrn of [...updatedBindingMap.keys()]) {
							if (
								existingUrn !== leafUrn &&
								existingUrn.startsWith('urn:archinex:ontology:application:emergent:')
							) {
								updatedBindingMap.delete(existingUrn);
							}
						}
					} else {
						const siblingLeaves = (catalog.triplets || [])
							.filter((t) => t.predicate === 'implemented_by' && t.subject === targetAxisUrn)
							.map((t) => t.object);
						for (const sib of siblingLeaves) {
							if (sib !== leafUrn) {
								updatedBindingMap.delete(sib);
							}
						}
					}
				}
				updatedBindingMap.set(leafUrn, catalog.entities[leafUrn]?.revision ?? 1);
			}
		}

		let explicitBindings = Array.from(updatedBindingMap.entries()).map(([urn, revision]) => ({
			urn,
			revision
		}));

		if (ratifyAllDefaults === true) {
			explicitBindings = ratifyDefaultDecisionSlots(initialCoverage);
		}

		const excludedLeafUrns = Array.from(excludedLeafSet);
		const newCoverage = computeRefinementCoverage(
			{
				subjectId,
				title: currentEdp.metadata?.title || ctx.title,
				problem: currentEdp.decision_context?.problem || ctx.problem,
				decisionText: currentEdp.decision_context?.decision || ctx.decisionText,
				structuredFacts: ctx.structuredFacts,
				explicitBindings,
				excludedLeafUrns,
				excludedAxisUrns,
				autoBindFromText: true,
				selectedConceptUrn: activeConcept
			},
			catalog
		);

		if (projectId) {
			if (effectiveMode === 'remove' && resolvedTargetAxisUrn) {
				const updatedSlot = (newCoverage.decisionSlots || []).find(
					(s) => s.axisUrn === resolvedTargetAxisUrn
				);
				if (!updatedSlot || updatedSlot.bindingOrigin !== 'explicit') {
					await revokeProjectSlotRatification({
						projectId,
						axisUrn: resolvedTargetAxisUrn,
						previousLeafUrn: leafUrn,
						actorId: actor.id,
						actorRole: actor.role,
						reason: `Retrait explicite de la feuille ${leafUrn} sur le sujet ${subjectId}.`,
						source: 'phase4',
						requireAuthorizedRole: false
					});
				}
			}
			for (const slot of newCoverage.decisionSlots || []) {
				if (slot.bindingOrigin === 'explicit' && slot.boundLeafUrns[0]) {
					await recordExplicitProjectSlotRatification(
						{
							projectId,
							axisUrn: slot.axisUrn,
							leafUrn: slot.boundLeafUrns[0],
							actorId: actor.id,
							actorRole: actor.role,
							rationale: `Ratification explicite en Phase 4 sur le sujet ${subjectId} (${slot.axisTitle}).`
						},
						catalog
					);
				}
			}
			const currentBundle = loadProjectComponentCatalog(projectId);
			const nextComponents = instantiateCatalogFromOntologyBindings(
				explicitBindings.map((b) => b.urn),
				currentBundle.components,
				undefined,
				{ preserveBaseCatalog: currentBundle.components.length > 0 }
			);
			if (nextComponents.length !== currentBundle.components.length) {
				saveProjectComponentCatalog(projectId, {
					...currentBundle,
					components: nextComponents
				});
			}
		}

		const currentOverrides: LldHydrationOverrides = currentEdp.lldOverrides || {};
		const hydratedInventory = composeMultiAxisHydration(
			subjectId,
			newCoverage.composedBindings,
			catalog,
			currentOverrides
		);

		const updatedEdp = {
			...currentEdp,
			metadata: {
				...currentEdp.metadata,
				id: ctx.edpPrimaryKey
			},
			selectedConceptUrn: activeConcept,
			explicitBindings,
			excludedLeafUrns,
			excludedAxisUrns,
			decision_context: {
				...currentEdp.decision_context,
				ontology_bindings: newCoverage.composedBindings
			},
			refinementCoverage: newCoverage,
			hydratedInventory,
			lldOverrides: currentOverrides,
			lastVerdict: currentEdp.lastVerdict || {
				verdict: 'compliant',
				verified_at: new Date().toISOString(),
				violations: [],
				mutation_score: 100
			}
		};

		await upsertEdpRecord({
			edpPrimaryKey: ctx.edpPrimaryKey,
			subjectId,
			decisionId: ctx.subject?.decision?.id,
			status: updatedEdp.metadata.status || 'proposed',
			revision: updatedEdp.metadata.revision || 1,
			contentObj: updatedEdp
		});

		const responseMessage =
			effectiveMode === 'remove'
				? `Feuille ontologique ${leafUrn} retirée de l'axe (${newCoverage.metrics.axisCoveragePercent}% de couverture).`
				: ratifyAllDefaults === true
					? `Choix proposés du sujet ratifiés (${newCoverage.metrics.axisCoveragePercent}% de couverture).`
					: `Axe raffiné avec la feuille ontologique ${leafUrn} (${newCoverage.metrics.axisCoveragePercent}% de couverture).`;

		return {
			body: {
				success: true,
				edp: updatedEdp,
				refinementCoverage: newCoverage,
				hydratedInventory,
				message: responseMessage
			}
		};
	} catch (err: any) {
		return { status: 500, body: { success: false, error: err.message } };
	}
}

export async function handleUnratify(
	actionCtx: EdpActionContext,
	input: UnratifyInput
): Promise<EdpActionResult> {
	const { projectId, subjectId, actor } = actionCtx;
	const { axisUrn, leafUrn, reason, selectedConceptUrn } = input;
	try {
		const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
		const ctx = await loadSubjectContext(subjectId, projectId);
		const snapshot = await loadPersistedEdpSnapshot(subjectId);
		const currentEdp = snapshot.parsedDb || buildDefaultEdpShell(ctx, 'proposed');

		const activeConcept = selectedConceptUrn || currentEdp.selectedConceptUrn || 'AUTO';
		const axisLeaves = new Set<string>(
			axisUrn
				? (catalog.triplets || [])
						.filter((t) => t.predicate === 'implemented_by' && t.subject === axisUrn)
						.map((t) => t.object)
				: []
		);
		if (axisUrn === 'urn:archinex:ontology:axis:emergent_component_allocation') {
			for (const b of snapshot.explicitBindings) {
				if (b.urn.startsWith('urn:archinex:ontology:application:emergent:')) {
					axisLeaves.add(b.urn);
				}
			}
		}
		if (leafUrn) {
			axisLeaves.add(leafUrn);
		}

		const removedUrns = snapshot.explicitBindings
			.filter((b) => axisLeaves.has(b.urn))
			.map((b) => b.urn);
		const explicitBindings = snapshot.explicitBindings.filter((b) => !axisLeaves.has(b.urn));

		const newCoverage = computeRefinementCoverage(
			{
				subjectId,
				title: currentEdp.metadata?.title || ctx.title,
				problem: currentEdp.decision_context?.problem || ctx.problem,
				decisionText: currentEdp.decision_context?.decision || ctx.decisionText,
				structuredFacts: ctx.structuredFacts,
				explicitBindings,
				excludedLeafUrns: snapshot.excludedLeafUrns,
				excludedAxisUrns: snapshot.excludedAxisUrns,
				autoBindFromText: true,
				selectedConceptUrn: activeConcept
			},
			catalog
		);

		let revocation = null;
		if (projectId) {
			revocation = await revokeProjectSlotRatification({
				projectId,
				axisUrn,
				previousLeafUrn: leafUrn || removedUrns[0],
				actorId: actor.id,
				actorRole: actor.role,
				reason:
					reason ||
					`Révocation explicite en Phase 4 sur le sujet ${subjectId} (${axisUrn || leafUrn || 'axe'}).`,
				source: 'phase4',
				requireAuthorizedRole: false
			});
		}

		const currentOverrides: LldHydrationOverrides = currentEdp.lldOverrides || {};
		const hydratedInventory = composeMultiAxisHydration(
			subjectId,
			newCoverage.composedBindings,
			catalog,
			currentOverrides
		);

		const auditLog = Array.isArray(currentEdp.ratificationAuditLog)
			? [...currentEdp.ratificationAuditLog]
			: [];
		if (revocation) {
			auditLog.push(revocation);
		}

		const updatedEdp = {
			...currentEdp,
			metadata: {
				...currentEdp.metadata,
				id: ctx.edpPrimaryKey
			},
			selectedConceptUrn: activeConcept,
			explicitBindings,
			excludedLeafUrns: snapshot.excludedLeafUrns,
			excludedAxisUrns: snapshot.excludedAxisUrns,
			decision_context: {
				...currentEdp.decision_context,
				ontology_bindings: newCoverage.composedBindings
			},
			refinementCoverage: newCoverage,
			hydratedInventory,
			lldOverrides: currentOverrides,
			ratificationAuditLog: auditLog
		};

		await upsertEdpRecord({
			edpPrimaryKey: ctx.edpPrimaryKey,
			subjectId,
			decisionId: ctx.subject?.decision?.id,
			status: updatedEdp.metadata.status || 'proposed',
			revision: updatedEdp.metadata.revision || 1,
			contentObj: updatedEdp
		});

		return {
			body: {
				success: true,
				edp: updatedEdp,
				refinementCoverage: newCoverage,
				hydratedInventory,
				revocation,
				message: `Ratification révoquée sur l'axe (${newCoverage.metrics.axisCoveragePercent}% de couverture).`
			}
		};
	} catch (err: any) {
		return { status: 500, body: { success: false, error: err.message } };
	}
}
