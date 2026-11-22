import { loadOntologyCatalog } from '$lib/server/edp/ontologyClient';
import {
	computeRefinementCoverage,
	composeMultiAxisHydration,
	evaluateMultiAxisOracle,
	type LldHydrationOverrides
} from '$lib/server/edp/refinementCoverage';
import { pullLiveInventoryFromNautobot } from '$lib/server/edp/nautobotSync';
import {
	computeIntentHash,
	persistDriftFindings,
	recordOracleVerdict
} from '$lib/server/edp/driftService';
import { exportSylvaWorkloadClusterGitops } from '$lib/server/edp/sylvaGitopsExport';
import {
	loadPersistedEdpSnapshot,
	loadProjectNautobotOptions,
	loadSubjectContext,
	upsertEdpRecord,
	type EdpActionContext,
	type EdpActionResult
} from './context';
import type {
	ExportSylvaGitopsInput,
	SimulateDriftInput,
	VerifyEdpInput
} from './schemas';

const DRIFT_SCENARIO_OVERRIDES: Record<string, (base: LldHydrationOverrides) => LldHydrationOverrides> = {
	reset_clean: () => ({}),
	unapproved_hardware: (base) => ({ ...base, deviceType: 'Supermicro-Whitebox-NonHomologue' }),
	bmc_oob_mismatch: (base) => ({
		...base,
		bmcAddress: 'redfish+http://198.51.100.254/redfish/v1/Systems/1'
	}),
	unproxied_oam: (base) => ({ ...base, oamBastionRequired: false }),
	non_isoprod_staging: (base) => ({ ...base, stagingIsoprod: false }),
	single_power_feed: (base) => ({ ...base, powerFeedsCount: 1 }),
	s6a_direct_bypass_dea: (base) => ({ ...base, s6aDirectBypassDea: true }),
	orphan_partner_tenant: (base) => ({ ...base, orphanPartnerTenant: true })
};

async function runOracleVerification(
	actionCtx: EdpActionContext,
	options: {
		mode: 'verify' | 'simulate_drift';
		selectedConceptUrn?: string;
		driftScenario?: string;
		overrides?: Record<string, unknown>;
	}
): Promise<EdpActionResult> {
	const { projectId, subjectId } = actionCtx;
	try {
		const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
		const ctx = await loadSubjectContext(subjectId, projectId);
		const snapshot = await loadPersistedEdpSnapshot(subjectId);

		const activeConcept =
			options.selectedConceptUrn || snapshot.parsedDb?.selectedConceptUrn || 'AUTO';

		const coverage = computeRefinementCoverage(
			{
				subjectId,
				title: ctx.title,
				problem: ctx.problem,
				decisionText: ctx.decisionText,
				structuredFacts: ctx.structuredFacts,
				explicitBindings: snapshot.explicitBindings,
				excludedLeafUrns: snapshot.excludedLeafUrns,
				excludedAxisUrns: snapshot.excludedAxisUrns,
				autoBindFromText: true,
				selectedConceptUrn: activeConcept
			},
			catalog
		);

		let activeOverrides: LldHydrationOverrides = snapshot.parsedDb?.lldOverrides || {};
		if (options.mode === 'simulate_drift') {
			const scenarioApplier = options.driftScenario
				? DRIFT_SCENARIO_OVERRIDES[options.driftScenario]
				: undefined;
			if (scenarioApplier) {
				activeOverrides = scenarioApplier(activeOverrides);
			} else if (options.overrides) {
				activeOverrides = { ...activeOverrides, ...(options.overrides as LldHydrationOverrides) };
			}
		}

		const effectiveBindingsForEval = [...coverage.composedBindings];
		if (
			(activeOverrides.s6aDirectBypassDea || activeOverrides.orphanPartnerTenant) &&
			!effectiveBindingsForEval.some(
				(b) => b.urn === 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256'
			)
		) {
			effectiveBindingsForEval.push({
				urn: 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256',
				revision: 1
			});
		}

		const baselineInventory = composeMultiAxisHydration(
			subjectId,
			effectiveBindingsForEval,
			catalog,
			activeOverrides
		);

		const hasLocalDriftOverrides = Object.keys(activeOverrides).some(
			(k) => k !== 'reconciliationInstances' && k !== 'projectRequirementRefs'
		);
		let observedInventory = baselineInventory;
		let evaluationSource: 'nautobot_live' | 'local_simulated' | 'local_fallback' =
			hasLocalDriftOverrides ? 'local_simulated' : 'local_fallback';
		let liveDetectedDrifts: string[] = [];
		let persistedFindings: Awaited<ReturnType<typeof persistDriftFindings>> = [];
		const resolvedDecisionId = ctx.subject?.decision?.id || `DEC-${subjectId}`;

		if (options.mode === 'verify' && !hasLocalDriftOverrides) {
			const nautobotOpts = await loadProjectNautobotOptions(projectId);
			const livePull = await pullLiveInventoryFromNautobot(baselineInventory, {
				...nautobotOpts,
				driftContext: {
					projectId,
					subjectId,
					decisionId: resolvedDecisionId,
					clauseRefs: ctx.requirementClauses,
					sourceEvent: `nautobot_pull:${new Date().toISOString()}`
				}
			});
			if (livePull.reachable) {
				observedInventory = livePull.inventory;
				evaluationSource = 'nautobot_live';
				liveDetectedDrifts = livePull.detectedDrifts;
				if (livePull.findings.length > 0) {
					persistedFindings = await persistDriftFindings(livePull.findings);
				}
			}
		}

		const evalRes = await evaluateMultiAxisOracle(
			observedInventory,
			effectiveBindingsForEval,
			catalog
		);

		const preservedIntentInventory =
			evaluationSource === 'nautobot_live' && snapshot.parsedDb?.hydratedInventory
				? snapshot.parsedDb.hydratedInventory
				: baselineInventory;
		const intentHash = computeIntentHash(preservedIntentInventory);

		const lastVerdictPayload = {
			verdict: evalRes.verdict,
			verified_at: new Date().toISOString(),
			source: evaluationSource,
			provenance:
				evaluationSource === 'nautobot_live'
					? 'nautobot_live_pull'
					: evaluationSource === 'local_simulated'
						? 'local_simulation'
						: 'local_baseline',
			intent_hash: intentHash,
			live_detected_drifts: liveDetectedDrifts,
			driftFindingIds: persistedFindings.map((f) => f.id),
			violations: evalRes.violationMessages,
			detailedViolations: evalRes.violations,
			ontologyFingerprint: evalRes.ontologyFingerprint
		};

		await recordOracleVerdict({
			edpId: ctx.edpPrimaryKey,
			projectId,
			subjectId,
			decisionId: resolvedDecisionId,
			verdict: evalRes.verdict,
			source: evaluationSource,
			provenance: lastVerdictPayload.provenance,
			intentHash,
			ontologyFingerprint: evalRes.ontologyFingerprint,
			violations: evalRes.violationMessages,
			detailedViolations: evalRes.violations,
			driftFindingIds: persistedFindings.map((f) => f.id)
		});

		const updatedEdp = {
			...(snapshot.parsedDb || {
				metadata: {
					id: ctx.edpPrimaryKey,
					title: `${ctx.title} (${ctx.sectionRef.toUpperCase()})`,
					status: 'proposed',
					revision: 1
				},
				decision_context: {
					problem: ctx.problem,
					decision: ctx.decisionText,
					ontology_bindings: coverage.composedBindings
				}
			}),
			metadata: {
				...(snapshot.parsedDb?.metadata || {}),
				id: ctx.edpPrimaryKey,
				title: snapshot.parsedDb?.metadata?.title || `${ctx.title} (${ctx.sectionRef.toUpperCase()})`,
				status: snapshot.parsedDb?.metadata?.status || 'proposed',
				revision: snapshot.parsedDb?.metadata?.revision || 1
			},
			selectedConceptUrn: activeConcept,
			refinementCoverage: coverage,
			hydratedInventory: preservedIntentInventory,
			lldOverrides: activeOverrides,
			lastVerdict: lastVerdictPayload
		};

		if (!snapshot.parsedDb || evaluationSource !== 'nautobot_live') {
			await upsertEdpRecord({
				edpPrimaryKey: ctx.edpPrimaryKey,
				subjectId,
				decisionId: resolvedDecisionId,
				status: updatedEdp.metadata.status || 'proposed',
				revision: updatedEdp.metadata.revision || 1,
				policyHash: evalRes.ontologyFingerprint,
				contentObj: updatedEdp
			});
		}

		return {
			body: {
				success: true,
				edp: updatedEdp,
				verdict: evalRes.verdict,
				source: evaluationSource,
				liveDetectedDrifts,
				driftFindings: persistedFindings,
				evaluatedAxesCount: evalRes.evaluatedAxesCount,
				violations: evalRes.violationMessages,
				detailedViolations: evalRes.violations,
				ontologyFingerprint: evalRes.ontologyFingerprint,
				hydratedInventory: observedInventory,
				durationMs: evalRes.durationMs
			}
		};
	} catch (err: any) {
		return { status: 500, body: { success: false, error: err.message } };
	}
}

export async function handleVerifyEdp(
	actionCtx: EdpActionContext,
	input: VerifyEdpInput
): Promise<EdpActionResult> {
	return runOracleVerification(actionCtx, {
		mode: 'verify',
		selectedConceptUrn: input.selectedConceptUrn,
		overrides: input.overrides
	});
}

export async function handleSimulateDrift(
	actionCtx: EdpActionContext,
	input: SimulateDriftInput
): Promise<EdpActionResult> {
	return runOracleVerification(actionCtx, {
		mode: 'simulate_drift',
		selectedConceptUrn: input.selectedConceptUrn,
		driftScenario: input.driftScenario,
		overrides: input.overrides
	});
}

export async function handleExportSylvaGitops(
	actionCtx: EdpActionContext,
	input: ExportSylvaGitopsInput
): Promise<EdpActionResult> {
	const { projectId, subjectId } = actionCtx;
	try {
		const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
		const ctx = await loadSubjectContext(subjectId, projectId);
		const snapshot = await loadPersistedEdpSnapshot(subjectId);

		const activeConcept = input.selectedConceptUrn || snapshot.parsedDb?.selectedConceptUrn || 'AUTO';
		const activeOverrides: LldHydrationOverrides = snapshot.parsedDb?.lldOverrides || {};

		const coverage = computeRefinementCoverage(
			{
				subjectId,
				title: ctx.title,
				problem: ctx.problem,
				decisionText: ctx.decisionText,
				structuredFacts: ctx.structuredFacts,
				explicitBindings: snapshot.explicitBindings,
				excludedLeafUrns: snapshot.excludedLeafUrns,
				excludedAxisUrns: snapshot.excludedAxisUrns,
				autoBindFromText: true,
				selectedConceptUrn: activeConcept
			},
			catalog
		);

		const hydratedInventory = composeMultiAxisHydration(
			subjectId,
			coverage.composedBindings,
			catalog,
			activeOverrides
		);

		const currentVerdict: 'compliant' | 'violated' | 'insufficient_input' =
			snapshot.parsedDb?.lastVerdict?.verdict === 'violated'
				? 'violated'
				: snapshot.parsedDb?.lastVerdict?.verdict === 'insufficient_input'
					? 'insufficient_input'
					: 'compliant';

		const evalRes = await evaluateMultiAxisOracle(
			hydratedInventory,
			coverage.composedBindings,
			catalog
		);
		const effectiveVerdict: 'compliant' | 'violated' | 'insufficient_input' =
			currentVerdict === 'violated' || evalRes.verdict === 'violated'
				? 'violated'
				: currentVerdict === 'insufficient_input' || evalRes.verdict === 'insufficient_input'
					? 'insufficient_input'
					: 'compliant';

		const gitopsExport = await exportSylvaWorkloadClusterGitops({
			edpId: snapshot.parsedDb?.metadata?.id || ctx.edpPrimaryKey,
			subjectId,
			revision: snapshot.parsedDb?.metadata?.revision || 1,
			ontologyFingerprint: evalRes.ontologyFingerprint,
			opaVerdict: effectiveVerdict,
			hydratedInventory,
			repoUrl: input.repoUrl,
			baseBranch: input.baseBranch,
			gitToken: input.gitToken
		});

		const updatedEdp = {
			...(snapshot.parsedDb || {
				metadata: {
					id: ctx.edpPrimaryKey,
					title: `${ctx.title} (${ctx.sectionRef.toUpperCase()})`,
					status: 'proposed',
					revision: 1
				},
				decision_context: {
					problem: ctx.problem,
					decision: ctx.decisionText,
					ontology_bindings: coverage.composedBindings
				}
			}),
			refinementCoverage: coverage,
			hydratedInventory,
			sylvaGitopsExport: gitopsExport
		};

		await upsertEdpRecord({
			edpPrimaryKey: ctx.edpPrimaryKey,
			subjectId,
			decisionId: ctx.subject?.decision?.id,
			status: updatedEdp.metadata?.status || 'proposed',
			revision: updatedEdp.metadata?.revision || 1,
			policyHash: evalRes.ontologyFingerprint,
			contentObj: updatedEdp
		});

		return {
			body: {
				success: true,
				edp: updatedEdp,
				sylvaGitopsExport: gitopsExport,
				message: gitopsExport.pullRequestUrl
					? `PR/MR GitOps Sylva ouverte avec succès : ${gitopsExport.pullRequestUrl}`
					: `Artefact GitOps Sylva généré (${gitopsExport.targetPath}, sha256:${gitopsExport.sha256.slice(0, 10)}) prêt pour FluxCD !`
			}
		};
	} catch (err: any) {
		const status = err.statusCode || 500;
		return { status, body: { success: false, error: err.message } };
	}
}
