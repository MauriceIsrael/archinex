import { prisma } from '$lib/server/prisma';
import {
	getSubjectArbitrationContext,
	recordArbitrationDecision,
	MaturityUnreadyError
} from '$lib/server/projects/arbitrationDb';
import { updateSubject, type ActorInfo } from '$lib/server/projects/projectsDb';
import { createOption } from '$lib/server/projects/optionsDb';
import {
	handleHydrateEdp,
	handleSynthesizeEdp
} from '$lib/server/edp/actions/hydrationAndSynthesis';
import type { EdpActionContext } from '$lib/server/edp/actions/context';
import type { Criterion, Option, OptionEvaluation } from '$lib/domain/options';
import type { NautobotSyncSummary } from '$lib/server/edp/nautobotSync';

export interface TurboModeOptions {
	projectId: string;
	actorId?: string;
	dryRun?: boolean;
	skipNautobot?: boolean;
	acceptViolations?: boolean;
	subjectIds?: string[];
}

export interface TurboSubjectReport {
	subjectId: string;
	subjectName: string;
	initialLevel: string;
	finalLevel: string;
	retainedOptionId?: string;
	retainedOptionTitle?: string;
	selectionMethod: 'weighted_score' | 'retained_status' | 'first_option' | 'synthesized_default' | 'already_decided';
	edpSynthesized: boolean;
	nautobotSynced: boolean;
	nautobotSummary?: Partial<NautobotSyncSummary>;
	warnings: string[];
	error?: string;
}

export interface TurboRunReport {
	projectId: string;
	projectTitle: string;
	dryRun: boolean;
	actorId: string;
	startedAt: string;
	finishedAt: string;
	durationMs: number;
	totalSubjects: number;
	processedCount: number;
	l3DecidedCount: number;
	l4SpecifiedCount: number;
	edpSynthesizedCount: number;
	nautobotSyncedSubjects: number;
	nautobotTotals: {
		tenantsSynced: number;
		circuitsSynced: number;
		prefixesSynced: number;
		vlansSynced: number;
		devicesSynced: number;
		vpnTunnelsSynced: number;
		tagsSynced: number;
		vrfsSynced: number;
		interfacesSynced: number;
		ipAddressesSynced: number;
	};
	errorsCount: number;
	subjects: TurboSubjectReport[];
}

export interface SelectedOptionResult {
	option: Option;
	method: 'weighted_score' | 'retained_status' | 'first_option';
	score?: number;
}

/**
 * Sélectionne l'option recommandée pour un sujet selon les évaluations pondérées,
 * ou par repli déterministe (option déjà marquée `retained`, sinon première option).
 */
export function selectRecommendedOption(
	options: Option[],
	criteria: Criterion[],
	evaluations: OptionEvaluation[]
): SelectedOptionResult | null {
	if (!options || options.length === 0) return null;

	const retained = options.find((o) => o.status === 'retained');
	if (evaluations.length > 0 && criteria.length > 0) {
		const weightByCriterion = new Map(criteria.map((c) => [c.id, c.weight || 3]));
		let bestOption: Option | null = null;
		let bestScore = -Infinity;

		for (const opt of options) {
			const optEvals = evaluations.filter((e) => e.optionId === opt.id);
			if (optEvals.length === 0) continue;
			const weightedSum = optEvals.reduce((sum, ev) => {
				const w = weightByCriterion.get(ev.criterionId) ?? 3;
				return sum + ev.score * w;
			}, 0);
			if (weightedSum > bestScore) {
				bestScore = weightedSum;
				bestOption = opt;
			}
		}

		if (bestOption) {
			return { option: bestOption, method: 'weighted_score', score: bestScore };
		}
	}

	if (retained) {
		return { option: retained, method: 'retained_status' };
	}

	return { option: options[0], method: 'first_option' };
}

const TURBO_RATIONALE =
	'[TURBO-AUTO] Décision automatisée basée sur les recommandations (non revue par un humain, générée pour peuplement rapide CMDB / démonstration).';

const TURBO_DEROGATION_REASON =
	'[TURBO-AUTO] Dérogation automatique en mode Turbo (arbitrage sans vérification KB complète préalable).';

async function decideSubjectL3Turbo(
	subjectId: string,
	retainedOption: Option,
	allOptions: Option[],
	actor: ActorInfo,
	acceptViolations: boolean,
	warnings: string[]
): Promise<void> {
	const rejected = allOptions
		.filter((o) => o.id !== retainedOption.id)
		.map((o) => ({
			optionId: o.id,
			reason: '[TURBO-AUTO] Écartée au profit de l’option recommandée.'
		}));

	const baseInput = {
		retainedOptionId: retainedOption.id,
		rejected,
		rationale: TURBO_RATIONALE,
		reversibility: 'reversible' as const,
		fastTrack: true,
		fastTrackRationale: TURBO_RATIONALE,
		complianceCheckDerogation: {
			acknowledged: true,
			reason: TURBO_DEROGATION_REASON
		}
	};

	try {
		await recordArbitrationDecision(subjectId, baseInput, actor);
	} catch (err) {
		if (err instanceof MaturityUnreadyError && acceptViolations) {
			const violationBlockers = err.blockers.filter((b) => b.code === 'UNRESOLVED_VIOLATION');
			if (violationBlockers.length > 0) {
				warnings.push(
					`[TURBO-AUTO] ${violationBlockers.length} écart(s) réglementaire(s) accepté(s) automatiquement.`
				);
				await recordArbitrationDecision(
					subjectId,
					{
						...baseInput,
						acceptedViolations: violationBlockers.map((b) => ({
							typedId: b.targetId || 'UNKNOWN_RULE',
							justification: '[TURBO-AUTO] Acceptation automatique en mode Turbo (non revu par un humain).'
						}))
					},
					actor
				);
				return;
			}
		}
		throw err;
	}
}

/**
 * Exécute le mode Turbo sur un projet :
 * - Arbitre les sujets non décidés en L3 (Fast-Track + dérogation explicite `[TURBO-AUTO]`)
 * - Homologue les sujets en L4 (`L4_specified`)
 * - Synthétise les EDP (fragments HLD + bindings ontologie)
 * - Hydrate la CMDB Nautobot (sauf si `skipNautobot` ou `dryRun`)
 */
export async function runTurboModeForProject(options: TurboModeOptions): Promise<TurboRunReport> {
	const startedAt = new Date();
	const projectId = options.projectId;
	const dryRun = Boolean(options.dryRun);
	const skipNautobot = Boolean(options.skipNautobot);
	const acceptViolations = options.acceptViolations ?? true;
	const actorId = options.actorId?.trim() || 'turbo-lead-architect';

	const actor: ActorInfo = {
		userId: actorId,
		role: 'lead_architect',
		productionMode: 'llm-proposed-human-approved'
	};

	const project = await prisma.project.findUnique({
		where: { id: projectId },
		select: { id: true, title: true }
	});
	if (!project) {
		throw new Error(`Projet introuvable : ${projectId}`);
	}

	const subjects = await prisma.subject.findMany({
		where: {
			projectId,
			...(options.subjectIds && options.subjectIds.length > 0
				? { id: { in: options.subjectIds } }
				: {})
		},
		orderBy: { createdAt: 'asc' }
	});

	const reports: TurboSubjectReport[] = [];
	const nautobotTotals = {
		tenantsSynced: 0,
		circuitsSynced: 0,
		prefixesSynced: 0,
		vlansSynced: 0,
		devicesSynced: 0,
		vpnTunnelsSynced: 0,
		tagsSynced: 0,
		vrfsSynced: 0,
		interfacesSynced: 0,
		ipAddressesSynced: 0
	};

	let l3DecidedCount = 0;
	let l4SpecifiedCount = 0;
	let edpSynthesizedCount = 0;
	let nautobotSyncedSubjects = 0;
	let errorsCount = 0;

	for (const subj of subjects) {
		const report: TurboSubjectReport = {
			subjectId: subj.id,
			subjectName: subj.name,
			initialLevel: subj.maturityLevel,
			finalLevel: subj.maturityLevel,
			selectionMethod: 'already_decided',
			edpSynthesized: false,
			nautobotSynced: false,
			warnings: []
		};

		try {
			const ctx = await getSubjectArbitrationContext(subj.id);
			let allOptions = ctx.options;
			let selected = selectRecommendedOption(allOptions, ctx.criteria, ctx.evaluations);

			// 1. Passage L3 si nécessaire
			const needsDecision = !['L3_decided', 'L4_specified', 'L5_archived'].includes(
				subj.maturityLevel
			);

			if (needsDecision) {
				if (!selected) {
					report.selectionMethod = 'synthesized_default';
					if (!dryRun) {
						const createdOpt = await createOption(
							subj.id,
							{
								title: `Architecture recommandée — ${subj.name}`,
								summary:
									'Option par défaut générée en mode Turbo à partir du cadrage du sujet et des recommandations ontologiques.',
								origin: 'llm-proposed',
								status: 'proposed'
							},
							actor
						);
						const refreshedCtx = await getSubjectArbitrationContext(subj.id);
						allOptions = refreshedCtx.options;
						selected = selectRecommendedOption(allOptions, refreshedCtx.criteria, refreshedCtx.evaluations);
						if (!selected) {
							selected = {
								option: {
									id: createdOpt.id,
									subjectId: subj.id,
									title: createdOpt.title,
									summary: createdOpt.summary,
									origin: 'llm-proposed',
									kbRefs: [],
									status: 'proposed',
									author: actor.userId,
									role: actor.role,
									productionMode: 'llm-proposed-human-approved',
									version: 1
								},
								method: 'first_option'
							};
						}
					} else {
						report.warnings.push('Aucune option existante ; une option par défaut serait créée hors dry-run.');
					}
				} else {
					report.selectionMethod = selected.method;
				}

				if (selected) {
					report.retainedOptionId = selected.option.id;
					report.retainedOptionTitle = selected.option.title;

					if (!dryRun) {
						await decideSubjectL3Turbo(
							subj.id,
							selected.option,
							allOptions,
							actor,
							acceptViolations,
							report.warnings
						);
						l3DecidedCount++;
						report.finalLevel = 'L3_decided';
					} else {
						l3DecidedCount++;
						report.finalLevel = 'L3_decided';
					}
				}
			} else if (selected) {
				report.retainedOptionId = selected.option.id;
				report.retainedOptionTitle = selected.option.title;
			}

			// 2. Passage L4 si non encore L4/L5
			if (!['L4_specified', 'L5_archived'].includes(report.finalLevel)) {
				if (!dryRun) {
					const fresh = await prisma.subject.findUnique({
						where: { id: subj.id },
						select: { version: true, maturityLevel: true }
					});
					if (fresh && ['L3_decided', 'L4_specified', 'L5_archived'].includes(fresh.maturityLevel)) {
						await updateSubject(
							projectId,
							subj.id,
							{
								expectedVersion: fresh.version,
								maturityLevel: 'L4_specified',
								deliberationStatus: 'closed'
							},
							actor
						);
						report.finalLevel = 'L4_specified';
						l4SpecifiedCount++;
					}
				} else {
					report.finalLevel = 'L4_specified';
					l4SpecifiedCount++;
				}
			}

			// 3. Synthèse EDP + Hydratation Nautobot
			const actionCtx: EdpActionContext = {
				projectId,
				subjectId: subj.id,
				actor: { id: actor.userId, role: actor.role }
			};

			if (!dryRun) {
				const synthRes = await handleSynthesizeEdp(actionCtx, {});
				if (synthRes.body?.success) {
					report.edpSynthesized = true;
					edpSynthesizedCount++;
				} else {
					report.warnings.push(`Synthèse EDP partielle : ${String(synthRes.body?.error || 'inconnue')}`);
				}
			} else {
				report.edpSynthesized = true;
				edpSynthesizedCount++;
			}

			if (!skipNautobot) {
				const hydRes = await handleHydrateEdp(actionCtx, { dryRun });
				const summary = hydRes.body?.nautobotSyncSummary as NautobotSyncSummary | undefined;
				if (summary) {
					report.nautobotSummary = {
						reachable: summary.reachable,
						dryRun: summary.dryRun,
						tenantsSynced: summary.tenantsSynced,
						circuitsSynced: summary.circuitsSynced,
						prefixesSynced: summary.prefixesSynced,
						vlansSynced: summary.vlansSynced,
						devicesSynced: summary.devicesSynced,
						vpnTunnelsSynced: summary.vpnTunnelsSynced,
						tagsSynced: summary.tagsSynced,
						vrfsSynced: summary.vrfsSynced,
						interfacesSynced: summary.interfacesSynced,
						ipAddressesSynced: summary.ipAddressesSynced,
						errors: summary.errors
					};
					nautobotTotals.tenantsSynced += summary.tenantsSynced || 0;
					nautobotTotals.circuitsSynced += summary.circuitsSynced || 0;
					nautobotTotals.prefixesSynced += summary.prefixesSynced || 0;
					nautobotTotals.vlansSynced += summary.vlansSynced || 0;
					nautobotTotals.devicesSynced += summary.devicesSynced || 0;
					nautobotTotals.vpnTunnelsSynced += summary.vpnTunnelsSynced || 0;
					nautobotTotals.tagsSynced += summary.tagsSynced || 0;
					nautobotTotals.vrfsSynced += summary.vrfsSynced || 0;
					nautobotTotals.interfacesSynced += summary.interfacesSynced || 0;
					nautobotTotals.ipAddressesSynced += summary.ipAddressesSynced || 0;
				}
				if (hydRes.body?.nautobotSynced) {
					report.nautobotSynced = true;
					nautobotSyncedSubjects++;
				} else if (hydRes.body?.message) {
					report.warnings.push(String(hydRes.body.message));
				}
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			report.error = msg;
			errorsCount++;
		}

		reports.push(report);
	}

	const finishedAt = new Date();
	return {
		projectId,
		projectTitle: project.title,
		dryRun,
		actorId,
		startedAt: startedAt.toISOString(),
		finishedAt: finishedAt.toISOString(),
		durationMs: finishedAt.getTime() - startedAt.getTime(),
		totalSubjects: subjects.length,
		processedCount: reports.length,
		l3DecidedCount,
		l4SpecifiedCount,
		edpSynthesizedCount,
		nautobotSyncedSubjects,
		nautobotTotals,
		errorsCount,
		subjects: reports
	};
}
