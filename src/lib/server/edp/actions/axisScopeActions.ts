import { loadOntologyCatalog } from '$lib/server/edp/ontologyClient';
import {
	computeRefinementCoverage,
	composeMultiAxisHydration,
	type LldHydrationOverrides
} from '$lib/server/edp/refinementCoverage';
import {
	buildDefaultEdpShell,
	loadPersistedEdpSnapshot,
	loadSubjectContext,
	upsertEdpRecord,
	type EdpActionContext,
	type EdpActionResult
} from './context';
import type { AxisScopeInput } from './schemas';

async function updateAxisScope(
	actionCtx: EdpActionContext,
	input: AxisScopeInput,
	mode: 'dismiss' | 'restore'
): Promise<EdpActionResult> {
	const { projectId, subjectId } = actionCtx;
	const { axisUrn, selectedConceptUrn } = input;
	try {
		const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
		const ctx = await loadSubjectContext(subjectId, projectId);
		const snapshot = await loadPersistedEdpSnapshot(subjectId);
		const currentEdp = snapshot.parsedDb || buildDefaultEdpShell(ctx, 'draft', subjectId);

		const activeConcept = selectedConceptUrn || currentEdp.selectedConceptUrn || 'AUTO';
		const excludedAxisSet = new Set<string>(snapshot.excludedAxisUrns);

		let explicitBindings = snapshot.explicitBindings;
		if (mode === 'dismiss') {
			excludedAxisSet.add(axisUrn);
			const axisLeaves = new Set<string>(
				(catalog.triplets || [])
					.filter((t) => t.predicate === 'implemented_by' && t.subject === axisUrn)
					.map((t) => t.object)
			);
			explicitBindings = snapshot.explicitBindings.filter((b) => !axisLeaves.has(b.urn));
		} else {
			excludedAxisSet.delete(axisUrn);
		}

		const excludedAxisUrns = Array.from(excludedAxisSet);
		const newCoverage = computeRefinementCoverage(
			{
				subjectId,
				title: currentEdp.metadata?.title || ctx.title,
				problem: currentEdp.decision_context?.problem || ctx.problem,
				decisionText: currentEdp.decision_context?.decision || ctx.decisionText,
				structuredFacts: ctx.structuredFacts,
				explicitBindings,
				excludedLeafUrns: snapshot.excludedLeafUrns,
				excludedAxisUrns,
				autoBindFromText: true,
				selectedConceptUrn: activeConcept
			},
			catalog
		);

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
			excludedLeafUrns: snapshot.excludedLeafUrns,
			excludedAxisUrns,
			decision_context: {
				...currentEdp.decision_context,
				ontology_bindings: newCoverage.composedBindings
			},
			refinementCoverage: newCoverage,
			hydratedInventory,
			lldOverrides: currentOverrides
		};

		await upsertEdpRecord({
			edpPrimaryKey: ctx.edpPrimaryKey,
			subjectId,
			status: snapshot.fromDb?.status || 'draft',
			revision: snapshot.fromDb?.revision || 1,
			includeProvenanceFields: false,
			contentObj: updatedEdp
		});

		return {
			body: {
				success: true,
				edp: updatedEdp,
				refinementCoverage: newCoverage,
				hydratedInventory,
				message:
					mode === 'dismiss'
						? 'Axe écarté du périmètre du sujet.'
						: 'Axe réintégré dans le périmètre du sujet.'
			}
		};
	} catch (err: any) {
		return { status: 500, body: { success: false, error: err.message } };
	}
}

export async function handleDismissAxis(
	actionCtx: EdpActionContext,
	input: AxisScopeInput
): Promise<EdpActionResult> {
	return updateAxisScope(actionCtx, input, 'dismiss');
}

export async function handleRestoreAxis(
	actionCtx: EdpActionContext,
	input: AxisScopeInput
): Promise<EdpActionResult> {
	return updateAxisScope(actionCtx, input, 'restore');
}
