<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { Argument, ArgumentResolution, Stance } from '$lib/domain/debate';
	import { countOpenObjections, computeResumeSummary, type ResumeSummary } from '$lib/domain/debate';
	import type {
		Criterion,
		Option,
		OptionEvaluation,
		TradeOff,
		Decision
	} from '$lib/domain/options';
	import MaturityStepper from './MaturityStepper.svelte';
	import SplitSubjectDialog from './SplitSubjectDialog.svelte';
	import type { SubjectRequirementItem } from './SubjectRequirementsDrawer.svelte';
	import SubjectThreadHeader from './thread/SubjectThreadHeader.svelte';
	import SubjectDiscussionPane from './thread/SubjectDiscussionPane.svelte';
	import SubjectMatrixPane from './thread/SubjectMatrixPane.svelte';
	import SubjectDoctrinePane from './thread/SubjectDoctrinePane.svelte';
	import SubjectCascadePane from './thread/SubjectCascadePane.svelte';
	import {
		buildDetailedSpecTemplate,
		patchSubjectWithRetry,
		type CachedCascade,
		type CachedDoctrine,
		type CachedWorkbench,
		type SubjectDoctrineItem,
		type SubjectSessionUser,
		type UnifiedWorkspaceTab
	} from './thread/types';
	import type { CascadeResult, DiscoveryTreeData } from '$lib/domain/cascade';
	import {
		computeMaturityCriteria,
		type MaturityTransitionsReport,
		type MaturityCriterion,
		type MilestoneContextualAction
	} from '$lib/domain/maturityCriteria';
	import type { MaturityLevel } from '$lib/types/epistemic';
	import { BookOpen, GitFork, MessagesSquare, Scale } from 'lucide-svelte';

	let {
		subjectId = '',
		projectId = '',
		userRole = 'lead_architect',
		sessionUser = null,
		isHumanUser = true,
		isSidebarCollapsed = false,
		onToggleSidebar = () => {},
		isDossierOpen = false,
		onToggleDossier = () => {},
		onBackToBoard = () => {},
		initialActiveWorkspaceTab = 'thread',
		initialDecision = null,
		initialRequirements = []
	}: {
		subjectId: string;
		projectId: string;
		userRole?: string;
		sessionUser?: SubjectSessionUser | null;
		isHumanUser?: boolean;
		isSidebarCollapsed?: boolean;
		onToggleSidebar?: () => void;
		isDossierOpen?: boolean;
		onToggleDossier?: () => void;
		onBackToBoard?: () => void;
		initialActiveWorkspaceTab?: UnifiedWorkspaceTab;
		initialDecision?: Decision | null;
		initialRequirements?: SubjectRequirementItem[];
	} = $props();

	let activeWorkspaceTab = $state<UnifiedWorkspaceTab>(initialActiveWorkspaceTab);
	let isSplitView = $state(false);
	let splitRightTab = $derived<Exclude<UnifiedWorkspaceTab, 'thread'>>(
		activeWorkspaceTab === 'thread' ? 'matrix' : activeWorkspaceTab
	);

	// ─── État des données du sujet ──────────────────────────────────────────────────
	let argumentsList = $state<Argument[]>([]);
	let subjectOptions = $state<Option[]>([]);
	let matrixCriteria = $state<Criterion[]>([]);
	let matrixEvaluations = $state<OptionEvaluation[]>([]);
	let matrixTradeOffs = $state<TradeOff[]>([]);
	let allowedKbRefs = $state<string[]>([]);
	let subjectRequirements = $state<SubjectRequirementItem[]>(initialRequirements);
	let requirementsUnresolvedRefs = $state<string[]>([]);
	let requirementsDossierPresent = $state<boolean>(true);
	let criteriaReport = $state<MaturityTransitionsReport | null>(null);
	let subjectDecision = $state<Decision | null>(initialDecision);
	let singleOptionRationale = $state<string | null | undefined>(undefined);
	let cascadeResult = $state<CascadeResult | null>(null);
	let foundationContested = $state(false);
	let contestationReason = $state<string | undefined>(undefined);
	let isLoadingArguments = $state(false);
	let isLoadingMatrix = $state(false);
	let isDebating = $state(false);
	let invokingAgentRole = $state<string | null>(null);
	let replyingTo = $state<Argument | null>(null);

	let doctrineItems = $state<SubjectDoctrineItem[]>([]);
	let isLoadingDoctrine = $state(false);
	let treeSeries = $state<any[]>([]);
	let discoveryTree = $state<DiscoveryTreeData | null>(null);
	let isLoadingTree = $state(false);
	let isProposingAnglesMorts = $state(false);

	let postureFilter = $state<Stance | 'all'>('all');
	let selectedComposerOptionId = $state<string>('');
	let dismissResumeBanner = $state(false);
	let lastVisitedTimestamp = $state<number>(Date.now() - 90_000_000);
	let isSplitDialogOpen = $state(false);
	let isForceEditingQuestion = $state(false);
	let detailedSpecText = $state('');

	$effect(() => {
		if (subjectId) {
			const storeVal = deliberationStore.getDetailedSpec(subjectId);
			if (storeVal) {
				detailedSpecText = storeVal;
			} else if (typeof window !== 'undefined') {
				try {
					const saved = localStorage.getItem(`archinex:spec:${projectId}:${subjectId}`);
					detailedSpecText = saved || '';
					if (saved) deliberationStore.setDetailedSpec(subjectId, saved);
				} catch {
					detailedSpecText = '';
				}
			}
		}
	});

	function handleGenerateSpecFromDecision() {
		detailedSpecText = buildDetailedSpecTemplate(subjectDecision, subjectOptions);
		void handleSaveDetailedSpec();
	}

	async function handleSaveDetailedSpec() {
		if (subjectId) {
			deliberationStore.setDetailedSpec(subjectId, detailedSpecText);
		}
		if (typeof window !== 'undefined' && projectId && subjectId) {
			try {
				localStorage.setItem(`archinex:spec:${projectId}:${subjectId}`, detailedSpecText);
			} catch {}
		}
		if (projectId && subjectId && detailedSpecText && detailedSpecText.trim().length > 0) {
			try {
				const res = await patchSubjectWithRetry(projectId, subjectId, {
					deliberationStatus: 'specified'
				});
				if (!res.ok) {
					const err = await res.json().catch(() => ({}));
					deliberationStore.logNotification(
						err.error ||
							(res.status === 401
								? 'Non authentifié : veuillez vous connecter pour enregistrer.'
								: 'Échec de sauvegarde'),
						'warning'
					);
					return false;
				}
			} catch {
				return false;
			}
		}
		deliberationStore.logNotification('Spécification technique détaillée enregistrée.', 'success');
		return true;
	}

	async function handleApproveSpecL4() {
		await handleSaveDetailedSpec();
		if (projectId && subjectId) {
			try {
				const res = await patchSubjectWithRetry(projectId, subjectId, {
					maturityLevel: 'L4_specified',
					deliberationStatus: 'specified'
				});
				if (!res.ok) {
					const err = await res.json().catch(() => ({}));
					console.warn('[Homologation L4] Erreur backend :', err);
					deliberationStore.logNotification(
						err.error ||
							(res.status === 401
								? 'Non authentifié : veuillez vous connecter en Lead Architect pour homologuer le jalon L4.'
								: "Échec de l'homologation L4"),
						'warning'
					);
					await loadArgumentsAndContext();
					return;
				}
				deliberationStore.setSubjectLevel(subjectId, 'L4_specified');
				await loadArgumentsAndContext();
			} catch (err) {
				console.warn('[Homologation L4] Erreur backend :', err);
				deliberationStore.logNotification(
					"Erreur de communication lors de l'homologation L4",
					'warning'
				);
				return;
			}
		} else {
			deliberationStore.setSubjectLevel(subjectId, 'L4_specified');
		}
		deliberationStore.logNotification(
			'✅ Spécification technique homologuée ! Le sujet franchit le jalon L4 (Spécifié).',
			'success'
		);
	}

	const activeSubject = $derived(deliberationStore.activeSubject);
	const activeDraft = $derived(deliberationStore.activeDraft);

	$effect(() => {
		if (deliberationStore.pendingDecisionSubjectId) {
			activeWorkspaceTab = 'matrix';
			deliberationStore.pendingDecisionSubjectId = null;
		}
	});

	const openObjectionsCount = $derived(countOpenObjections(argumentsList));
	const totalObjectionsCount = $derived(
		argumentsList.filter((a) => a.stance === 'objection').length
	);
	const citedKbRefs = $derived.by(() => {
		const set = new Set<string>();
		for (const a of argumentsList) {
			if (a.kbRefs && Array.isArray(a.kbRefs)) {
				for (const ref of a.kbRefs) {
					if (ref) set.add(ref);
				}
			}
		}
		return Array.from(set);
	});

	const relevantDoctrine = $derived(
		doctrineItems.filter((i) =>
			typeof i.relevant === 'boolean' ? i.relevant : !i.required || (i.relevance ?? 0) > 0.1
		)
	);
	const requiredByFramework = $derived.by(() => {
		const groups = new Map<string, SubjectDoctrineItem[]>();
		for (const i of doctrineItems.filter((x) => x.required && !relevantDoctrine.includes(x))) {
			const key = i.framework || 'Référentiel';
			groups.set(key, [...(groups.get(key) ?? []), i]);
		}
		return [...groups.entries()];
	});

	const computedReport = $derived.by<MaturityTransitionsReport | null>(() => {
		if (!activeSubject) return null;
		const problem = activeDraft?.manque?.[0]?.question || activeSubject.name;
		const doctrineCount = (activeDraft?.retenu?.length || 0) + (allowedKbRefs?.length || 0) + 1;
		return computeMaturityCriteria({
			subject: {
				id: activeSubject.id,
				name: activeSubject.name,
				problemStatement: problem,
				scope: activeSubject.section_ref,
				sectionRef: activeSubject.section_ref,
				level: activeSubject.level,
				hubLevel: activeSubject.level,
				is_stalled: activeSubject.is_stalled,
				stall_days: activeSubject.stall_days
			},
			criteria: matrixCriteria.map((c) => ({ id: c.id, name: c.name })),
			options: subjectOptions.map((o) => ({ id: o.id, title: o.title, status: o.status })),
			arguments: argumentsList,
			doctrineConstraintsCount: doctrineCount,
			specificationPresent: Boolean(detailedSpecText && detailedSpecText.trim().length > 0),
			derivedSubjects: deliberationStore.subjects
				.filter(
					(s) =>
						s.id !== activeSubject.id &&
						(s.parent_subject_id === activeSubject.id ||
							(activeSubject.section_ref && s.section_ref?.startsWith(activeSubject.section_ref + '.')))
				)
				.map((s) => ({ id: s.id, level: s.level })),
			decision: subjectDecision
				? {
						retainedOptionId: subjectDecision.retainedOptionId,
						authorId: subjectDecision.arbiterId,
						authorRole: subjectDecision.arbiterRole,
						affirmedBy: subjectDecision.validatedBy,
						status: subjectDecision.validatedBy ? 'active' : 'proposed'
					}
				: null,
			actor: {
				userId: sessionUser?.id || 'current-user',
				role: userRole,
				isHuman: isHumanUser
			}
		});
	});

	const effectiveReport = $derived.by<MaturityTransitionsReport | null>(() => {
		const base = computedReport || criteriaReport;
		if (!base) return null;
		if (!detailedSpecText || detailedSpecText.trim().length === 0) return base;
		const l4 = base.transitions?.L4_specified;
		if (!l4) return base;
		const specCrit = l4.criteria.find((c) => c.id === 'specification_drafted');
		if (!specCrit || specCrit.satisfied) return base;

		const updatedCriteria = l4.criteria.map((c) =>
			c.id === 'specification_drafted' ? { ...c, satisfied: true } : c
		);
		const updatedMissing = l4.missingReasons.filter(
			(r) => !r.includes('Spécification technique rédigée')
		);
		return {
			...base,
			transitions: {
				...base.transitions,
				L4_specified: {
					...l4,
					criteria: updatedCriteria,
					missingReasons: updatedMissing,
					allowed: updatedMissing.length === 0
				}
			}
		};
	});

	const openObjections = $derived(
		argumentsList.filter((a) => a.stance === 'objection' && a.resolution === 'open')
	);
	const resumeSummary = $derived.by<ResumeSummary | null>(() => {
		if (dismissResumeBanner || argumentsList.length === 0) return null;
		return computeResumeSummary(
			argumentsList,
			lastVisitedTimestamp,
			activeSubject?.level,
			'L1_framed'
		);
	});
	const displayedArguments = $derived.by(() => {
		if (postureFilter === 'all') return argumentsList;
		return argumentsList.filter((a) => a.stance === postureFilter);
	});

	const workbenchCache = new Map<string, CachedWorkbench>();
	const cascadeCache = new Map<string, CachedCascade>();
	const doctrineCache = new Map<string, CachedDoctrine>();
	let activeLoadController: AbortController | null = null;
	let activeLoadSeq = 0;

	function syncWorkbenchCache() {
		if (!projectId || !subjectId) return;
		const key = `${projectId}:${subjectId}`;
		const existing = workbenchCache.get(key);
		if (!existing) return;
		workbenchCache.set(key, {
			...existing,
			arguments: argumentsList,
			options: subjectOptions,
			criteria: matrixCriteria,
			evaluations: matrixEvaluations,
			tradeOffs: matrixTradeOffs,
			decision: subjectDecision,
			criteriaReport,
			requirements: subjectRequirements,
			requirementsUnresolvedRefs,
			requirementsDossierPresent
		});
	}

	$effect(() => {
		if (subjectId && projectId) {
			void loadArgumentsAndContext({ force: false });
		}
	});

	async function loadArgumentsAndContext(options: { force?: boolean } = { force: true }) {
		if (!projectId || !subjectId) return;
		const targetProjectId = projectId;
		const targetSubjectId = subjectId;
		const cacheKey = `${targetProjectId}:${targetSubjectId}`;
		const force = options.force ?? true;

		activeLoadController?.abort();
		const controller = new AbortController();
		activeLoadController = controller;
		const seq = ++activeLoadSeq;

		const cachedWb = workbenchCache.get(cacheKey);
		const cachedCasc = cascadeCache.get(cacheKey);
		const cachedDoc = doctrineCache.get(cacheKey);

		if (cachedWb) {
			argumentsList = cachedWb.arguments;
			subjectOptions = cachedWb.options;
			matrixCriteria = cachedWb.criteria;
			matrixEvaluations = cachedWb.evaluations;
			matrixTradeOffs = cachedWb.tradeOffs;
			subjectDecision = cachedWb.decision;
			criteriaReport = cachedWb.criteriaReport;
			singleOptionRationale = cachedWb.singleOptionRationale;
			subjectRequirements = cachedWb.requirements;
			requirementsUnresolvedRefs = cachedWb.requirementsUnresolvedRefs;
			requirementsDossierPresent = cachedWb.requirementsDossierPresent;
			isLoadingArguments = false;
		} else if (!force) {
			argumentsList = [];
			subjectOptions = [];
			matrixCriteria = [];
			matrixEvaluations = [];
			matrixTradeOffs = [];
			subjectDecision = initialDecision;
			criteriaReport = null;
			singleOptionRationale = undefined;
			subjectRequirements = initialRequirements;
			requirementsUnresolvedRefs = [];
			requirementsDossierPresent = true;
			isLoadingArguments = true;
		}

		if (cachedCasc) {
			cascadeResult = cachedCasc.cascade;
			treeSeries = cachedCasc.treeSeries;
			discoveryTree = cachedCasc.discoveryTree;
			foundationContested = cachedCasc.foundationContested;
			contestationReason = cachedCasc.contestationReason;
		} else if (!force) {
			cascadeResult = null;
			treeSeries = [];
			discoveryTree = null;
			foundationContested = false;
			contestationReason = undefined;
		}

		if (cachedDoc) {
			allowedKbRefs = cachedDoc.allowedKbRefs;
			doctrineItems = cachedDoc.items;
		} else if (!force) {
			allowedKbRefs = [];
			doctrineItems = [];
		}

		const cascadePromise = fetch(
			`/api/projects/${targetProjectId}/subjects/${targetSubjectId}/cascade`,
			{ signal: controller.signal }
		)
			.then(async (res) => {
				if (!res.ok || controller.signal.aborted || seq !== activeLoadSeq) return;
				const cascData = await res.json();
				if (controller.signal.aborted || seq !== activeLoadSeq) return;
				const nextCasc: CachedCascade = {
					cascade: cascData.cascade || null,
					treeSeries: cascData.treeSeries || [],
					discoveryTree: cascData.discoveryTree || null,
					foundationContested: cascData.foundationContested || false,
					contestationReason: cascData.contestationReason
				};
				cascadeResult = nextCasc.cascade;
				treeSeries = nextCasc.treeSeries;
				discoveryTree = nextCasc.discoveryTree;
				foundationContested = nextCasc.foundationContested;
				contestationReason = nextCasc.contestationReason;
				cascadeCache.set(cacheKey, nextCasc);
			})
			.catch(() => {});

		const doctrinePromise =
			!force && cachedDoc
				? Promise.resolve()
				: fetch(`/api/projects/${targetProjectId}/subjects/${targetSubjectId}/doctrine-context`, {
						signal: controller.signal
					})
						.then(async (res) => {
							if (controller.signal.aborted || seq !== activeLoadSeq) return;
							if (res.ok) {
								const docData = await res.json();
								if (controller.signal.aborted || seq !== activeLoadSeq) return;
								const nextDoc: CachedDoctrine = {
									allowedKbRefs: docData.allowedKbRefs || [],
									items: docData.items || []
								};
								allowedKbRefs = nextDoc.allowedKbRefs;
								doctrineItems = nextDoc.items;
								doctrineCache.set(cacheKey, nextDoc);
							}
						})
						.catch(() => {});

		try {
			const wbRes = await fetch(
				`/api/projects/${targetProjectId}/subjects/${targetSubjectId}/workbench`,
				{ signal: controller.signal }
			);
			if (controller.signal.aborted || seq !== activeLoadSeq) return;

			if (wbRes.ok) {
				const wb = await wbRes.json();
				if (controller.signal.aborted || seq !== activeLoadSeq) return;

				const nextWb: CachedWorkbench = {
					singleOptionRationale: wb.subject?.singleOptionRationale ?? null,
					arguments: Array.isArray(wb.arguments) ? wb.arguments : [],
					options: Array.isArray(wb.options) ? wb.options : [],
					criteria: Array.isArray(wb.criteria) ? wb.criteria : [],
					evaluations: Array.isArray(wb.evaluations) ? wb.evaluations : [],
					tradeOffs: Array.isArray(wb.tradeOffs) ? wb.tradeOffs : [],
					decision: wb.decision || null,
					criteriaReport: wb.criteriaReport || null,
					requirements: Array.isArray(wb.requirements) ? wb.requirements : [],
					requirementsUnresolvedRefs: Array.isArray(wb.requirementsUnresolvedRefs)
						? wb.requirementsUnresolvedRefs
						: [],
					requirementsDossierPresent: wb.requirementsDossierPresent !== false
				};

				argumentsList = nextWb.arguments;
				subjectOptions = nextWb.options;
				matrixCriteria = nextWb.criteria;
				matrixEvaluations = nextWb.evaluations;
				matrixTradeOffs = nextWb.tradeOffs;
				subjectDecision = nextWb.decision;
				criteriaReport = nextWb.criteriaReport;
				singleOptionRationale = nextWb.singleOptionRationale;
				subjectRequirements = nextWb.requirements;
				requirementsUnresolvedRefs = nextWb.requirementsUnresolvedRefs;
				requirementsDossierPresent = nextWb.requirementsDossierPresent;
				workbenchCache.set(cacheKey, nextWb);

				if (wb.subject?.maturityLevel) {
					deliberationStore.applyServerSubjectLevel(
						targetSubjectId,
						wb.subject.maturityLevel,
						wb.subject.deliberationStatus
					);
				}
			}
		} catch (err: any) {
			if (err?.name !== 'AbortError') {
				console.warn('[Espace Sujet] Erreur chargement contexte:', err);
			}
		} finally {
			if (seq === activeLoadSeq) {
				isLoadingArguments = false;
			}
		}

		void Promise.all([cascadePromise, doctrinePromise]);
	}

	async function refreshMatrixData() {
		if (!projectId || !subjectId) return;
		isLoadingMatrix = true;
		try {
			const [cRes, oRes, eRes, tRes, dRes] = await Promise.all([
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/criteria`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/options`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/evaluations`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/tradeoffs`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/decision`)
			]);
			if (cRes.ok) {
				const cData = await cRes.json();
				matrixCriteria = Array.isArray(cData) ? cData : cData.criteria || [];
			}
			if (oRes.ok) {
				const oData = await oRes.json();
				subjectOptions = Array.isArray(oData) ? oData : oData.options || [];
			}
			if (eRes.ok) {
				const eData = await eRes.json();
				matrixEvaluations = Array.isArray(eData) ? eData : eData.evaluations || [];
			}
			if (tRes.ok) {
				const tData = await tRes.json();
				matrixTradeOffs = Array.isArray(tData) ? tData : tData.tradeOffs || [];
			}
			if (dRes.ok) {
				const dData = await dRes.json();
				subjectDecision = dData.decision || null;
			}
		} catch (err) {
			console.warn('[Matrice] Erreur rafraîchissement:', err);
		} finally {
			isLoadingMatrix = false;
		}
	}

	async function refreshTreeData() {
		if (!projectId || !subjectId) return;
		isLoadingTree = true;
		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/cascade`);
			if (res.ok) {
				const data = await res.json();
				treeSeries = data.treeSeries || [];
				discoveryTree = data.discoveryTree || null;
				cascadeResult = data.cascade || cascadeResult;
			}
		} catch {
			// ignore
		} finally {
			isLoadingTree = false;
		}
	}

	async function handleProposeAnglesMortsFromTree() {
		if (!projectId || !subjectId || isProposingAnglesMorts) return;
		isProposingAnglesMorts = true;
		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/cascade/propose`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: '{}'
			});
			if (res.ok) await loadArgumentsAndContext();
		} catch (err) {
			console.warn('[Cascade] Erreur agent proposeur :', err);
		} finally {
			isProposingAnglesMorts = false;
		}
	}

	async function handleTransitionMaturity(targetLevel: MaturityLevel) {
		if (targetLevel === 'L4_specified') {
			await handleApproveSpecL4();
			return;
		}
		if (targetLevel === 'L3_decided' && activeSubject?.level !== 'L3_decided') {
			activeWorkspaceTab = 'matrix';
			deliberationStore.requestFormalDecision(subjectId);
			return;
		}
		if (!projectId || !subjectId) {
			deliberationStore.setSubjectLevel(subjectId, targetLevel);
			deliberationStore.logNotification(`Jalon ${targetLevel} validé avec succès !`, 'success');
			return;
		}

		try {
			const res = await patchSubjectWithRetry(projectId, subjectId, {
				maturityLevel: targetLevel
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				deliberationStore.logNotification(
					err.error ||
						(res.status === 401
							? 'Non authentifié : veuillez vous connecter pour valider ce jalon.'
							: `Échec de validation du jalon ${targetLevel}`),
					'warning'
				);
				await loadArgumentsAndContext();
				return;
			}
			deliberationStore.setSubjectLevel(subjectId, targetLevel);
			await loadArgumentsAndContext();
			deliberationStore.logNotification(`Jalon ${targetLevel} validé avec succès !`, 'success');
		} catch {
			deliberationStore.logNotification(
				`Erreur de communication pour le jalon ${targetLevel}.`,
				'warning'
			);
		}
	}

	async function handleAdoptHypothesis() {
		if (!activeSubject) return;
		const hyp = activeDraft?.suppose?.[0]?.text || `Hypothèse validée pour ${activeSubject.name}`;
		if (activeDraft && !activeDraft.retenu.includes(hyp)) {
			activeDraft.retenu = [hyp, ...activeDraft.retenu];
		}

		let nextLevel: MaturityLevel = 'L1_framed';
		if (activeSubject.level === 'L0_named') nextLevel = 'L1_framed';
		else if (activeSubject.level === 'L1_framed') nextLevel = 'L2_decomposed';
		else if (activeSubject.level === 'L2_decomposed') nextLevel = 'L3_decided';
		else nextLevel = activeSubject.level;

		if (nextLevel === 'L3_decided') {
			activeWorkspaceTab = 'matrix';
			deliberationStore.requestFormalDecision(activeSubject.id);
		} else {
			await handleTransitionMaturity(nextLevel);
		}

		try {
			if (projectId && subjectId) {
				const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/arguments`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						stance: 'support',
						claim: `Adoption de l'hypothèse de cadrage : ${hyp}`,
						grounds: `Validé par l'architecte (${userRole}). Cette hypothèse devient l'orientation de référence pour la section ${activeSubject.section_ref}.`,
						kbRefs: []
					})
				});
				if (res.ok) {
					handleArgumentCreated(await res.json());
				} else {
					const err = await res.json().catch(() => ({}));
					const msg = err.reason || err.error || err.message;
					if (msg) deliberationStore.logNotification(msg, 'warning');
				}
			} else {
				deliberationStore.sendSubjectMessage(
					`✅ Hypothèse validée par l'architecte : « ${hyp} » (Passage au jalon ${nextLevel})`
				);
			}
		} catch {}

		deliberationStore.logNotification(
			`Hypothèse retenue ! Le sujet progresse vers ${nextLevel}.`,
			'success'
		);
	}

	function handleCriterionAction(crit: MaturityCriterion) {
		switch (crit.actionType) {
			case 'resolve_objection':
				activeWorkspaceTab = 'thread';
				scrollToNextUnresolvedObjection();
				break;
			case 'run_verifier':
				void handleInvokeAgent('verifier');
				break;
			case 'derive_subjects':
				activeWorkspaceTab = 'cascade';
				break;
			case 'edit_problem': {
				activeWorkspaceTab = 'thread';
				const cardElem = document.getElementById('subject-problem-box');
				if (cardElem) {
					cardElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
					cardElem.classList.add('ring-2', 'ring-primary', 'transition-all');
					setTimeout(() => cardElem?.classList.remove('ring-2', 'ring-primary'), 2500);
				}
				isForceEditingQuestion = true;
				setTimeout(() => (isForceEditingQuestion = false), 600);
				break;
			}
			case 'add_doctrine_ref': {
				activeWorkspaceTab = 'thread';
				setTimeout(() => {
					const composer = document.getElementById('compose-claim') as
						| HTMLTextAreaElement
						| HTMLInputElement
						| null;
					if (composer) {
						composer.scrollIntoView({ behavior: 'smooth', block: 'center' });
						if (!composer.value.includes('#base')) {
							composer.value = '#base ' + (composer.value || '');
						}
						composer.focus();
						deliberationStore.logNotification(
							'Composeur pré-rempli avec #base : mentionnez une règle pour rattacher la doctrine.',
							'info'
						);
					} else {
						deliberationStore.sendSubjectMessage(
							`📌 Standard doctrinal rattaché : respect des contraintes d'architecture de référence (#base) sur la section ${activeSubject?.section_ref}.`
						);
						deliberationStore.logNotification('Contrainte doctrinale rattachée !', 'success');
					}
				}, 50);
				break;
			}
			case 'add_option':
				void handleInvokeAgent('proposer');
				break;
			case 'define_criteria':
				activeWorkspaceTab = 'matrix';
				void refreshMatrixData();
				break;
			case 'edit_scope':
			case 'write_spec':
				activeWorkspaceTab = 'kb';
				break;
			case 'hub_affirmation':
				activeWorkspaceTab = 'matrix';
				void refreshMatrixData();
				if (!subjectDecision) {
					deliberationStore.requestFormalDecision(subjectId);
				} else {
					deliberationStore.logNotification(
						"Consultez la carte de co-signature et les faits d'architecture dans le volet Options, Matrice & Arbitrage.",
						'info'
					);
				}
				break;
			case 'lead_gate':
				deliberationStore.logNotification(
					'Réservé exclusivement au Lead Architect humain.',
					'warning'
				);
				break;
			default:
				break;
		}
	}

	function handleContextualMilestoneAction(act: MilestoneContextualAction) {
		if (act.agentRole) {
			void handleInvokeAgent(act.agentRole);
			return;
		}
		if (act.targetTab) {
			activeWorkspaceTab = act.targetTab;
			if (act.targetTab === 'matrix') {
				void refreshMatrixData();
				if (act.id === 'l3_prepare_kb' || act.id === 'l4_prepare_kb') {
					setTimeout(() => {
						document
							.getElementById('capitalization-section')
							?.scrollIntoView({ behavior: 'smooth' });
					}, 80);
				}
			}
			if (act.targetTab === 'cascade') void refreshTreeData();
		}
		if (act.criterionActionType) {
			handleCriterionAction({
				id: act.id,
				label: act.label,
				description: act.description,
				satisfied: false,
				actionLabel: act.label,
				actionType: act.criterionActionType
			});
		}
	}

	async function handleLaunchDebate() {
		if (isDebating || !projectId || !subjectId) return;
		isDebating = true;
		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/debate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ maxRounds: 3 })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || 'Erreur lors du lancement du débat multi-agents');
			}
			await loadArgumentsAndContext();
			deliberationStore.logNotification('Débat contradictoire multi-agents exécuté.', 'success');
		} catch (err: any) {
			deliberationStore.logNotification(err.message || 'Erreur lors du débat', 'warning');
		} finally {
			isDebating = false;
		}
	}

	async function handleResolveArgument(arg: Argument, resolution: ArgumentResolution) {
		if (!projectId || !subjectId) return;
		try {
			const res = await fetch(
				`/api/projects/${projectId}/subjects/${subjectId}/arguments/${arg.id}/resolve`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ resolution, expectedVersion: arg.version })
				}
			);
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || "Erreur lors de la résolution de l'argument");
			}
			const updated = await res.json();
			const idx = argumentsList.findIndex((a) => a.id === arg.id);
			if (idx !== -1) argumentsList[idx] = updated;
			deliberationStore.logNotification(`Statut de l'objection mis à jour : ${resolution}`, 'success');
		} catch (err: any) {
			deliberationStore.logNotification(err.message, 'warning');
		}
	}

	function handleArgumentCreated(created: Argument, triggeredArgs?: Argument[]) {
		argumentsList = [...argumentsList, created];
		if (triggeredArgs && triggeredArgs.length > 0) {
			argumentsList = [...argumentsList, ...triggeredArgs];
			deliberationStore.logNotification(
				`Réponse générée par ${triggeredArgs.map((a) => a.author).join(', ')}`,
				'info'
			);
		}
		syncWorkbenchCache();
	}

	async function handleInvokeAgent(role: 'challenger' | 'proposer' | 'verifier' | 'synthesizer') {
		if (!projectId || !subjectId) return;
		if (invokingAgentRole || isDebating) {
			deliberationStore.logNotification(
				`Un agent (@${invokingAgentRole || 'débat'}) est déjà en cours d'exécution. Veuillez patienter.`,
				'info'
			);
			return;
		}
		const targetProjectId = projectId;
		const targetSubjectId = subjectId;
		invokingAgentRole = role;
		deliberationStore.logNotification(
			role === 'verifier'
				? 'Vérificateur sollicité : il confronte les options à la doctrine en cours d’analyse…'
				: `Agent @${role} sollicité : génération en cours…`,
			'info'
		);

		const controller = new AbortController();
		const timeoutTimer = setTimeout(() => controller.abort(), 135_000);
		try {
			const res = await fetch(
				`/api/projects/${targetProjectId}/subjects/${targetSubjectId}/debate`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ agentRole: role }),
					signal: controller.signal
				}
			);
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || `Erreur lors de la sollicitation de l'agent @${role}`);
			}
			const data = await res.json();
			const producedCount = Array.isArray(data.arguments) ? data.arguments.length : 0;
			if (projectId === targetProjectId && subjectId === targetSubjectId) {
				await loadArgumentsAndContext();
			}
			if (producedCount === 0) {
				deliberationStore.logNotification(
					data.message || `L'agent @${role} n'a produit aucune contribution sur ce sujet.`,
					'warning'
				);
			} else {
				deliberationStore.logNotification(
					data.message ||
						(role === 'verifier'
							? `Vérificateur terminé : ${producedCount} constat(s) de conformité publié(s) dans le fil.`
							: `L'agent @${role} a publié ${producedCount} contribution(s) dans le fil.`),
					'success'
				);
			}
		} catch (err: any) {
			const message =
				err?.name === 'AbortError'
					? `Délai d'attente dépassé pour l'agent @${role}. Réessayez ou vérifiez la disponibilité du modèle LLM.`
					: err?.message || 'Erreur agent';
			deliberationStore.logNotification(message, 'warning');
		} finally {
			clearTimeout(timeoutTimer);
			invokingAgentRole = null;
		}
	}

	async function handleUpdateDraftQuestion(newQ: string) {
		deliberationStore.updateDraftQuestion(subjectId, newQ);
		if (projectId && subjectId) {
			try {
				await patchSubjectWithRetry(projectId, subjectId, { problemStatement: newQ });
			} catch {}
		}
		deliberationStore.logNotification('Problème d’architecture reformulé et enregistré.', 'success');
	}

	function handleUpdateDraftHypothesis(newH: string) {
		deliberationStore.updateDraftHypothesis(subjectId, newH);
		deliberationStore.logNotification('Hypothèse de cadrage mise à jour.', 'info');
	}

	async function handleSplitCreated(childAId: string, childBId: string) {
		isSplitDialogOpen = false;
		await handleTransitionMaturity('L2_decomposed');
		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/arguments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					stance: 'question',
					claim: 'Décomposition du macro-sujet en 2 sous-problèmes distincts',
					grounds: `Ce sujet a été décomposé en 2 sous-sujets d'architecture distincts pour lever la complexité : 1) ${deliberationStore.subjects.find((s) => s.id === childAId)?.name || 'Sous-problème A'} et 2) ${deliberationStore.subjects.find((s) => s.id === childBId)?.name || 'Sous-problème B'}. La délibération se poursuit au sein de chacun de ces volets.`,
					kbRefs: []
				})
			});
			if (res.ok) handleArgumentCreated(await res.json());
		} catch {}
		await loadArgumentsAndContext();
		deliberationStore.logNotification(
			'Sujet décomposé avec succès en 2 sous-problèmes !',
			'success'
		);
	}

	function handleSelectOptionForDiscussion(opt: any) {
		activeWorkspaceTab = 'thread';
		selectedComposerOptionId = opt.id;
		document.getElementById('compose-claim')?.focus();
		deliberationStore.logNotification(
			`Option « ${opt.title} » sélectionnée pour discussion.`,
			'info'
		);
	}

	function handleOpenMatrix(scrollToCapitalization = false) {
		activeWorkspaceTab = 'matrix';
		void refreshMatrixData();
		if (scrollToCapitalization) {
			setTimeout(() => {
				document.getElementById('capitalization-section')?.scrollIntoView({ behavior: 'smooth' });
			}, 80);
		}
	}

	function handleChallengeArgument(arg: Argument) {
		activeWorkspaceTab = 'thread';
		replyingTo = arg;
		document.getElementById('compose-claim')?.focus();
		deliberationStore.logNotification(`Réfutation ciblée sur l'argument de ${arg.author}.`, 'info');
	}

	function scrollToNextUnresolvedObjection() {
		const openEls = document.querySelectorAll('[data-stance="objection"]');
		let targetElem: HTMLElement | null = null;
		for (const el of openEls) {
			if (el.textContent?.includes('Objection ouverte')) {
				targetElem = el as HTMLElement;
				break;
			}
		}
		if (!targetElem && openEls.length > 0) targetElem = openEls[0] as HTMLElement;
		if (targetElem) {
			targetElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
			targetElem.classList.add('ring-2', 'ring-rose-500', 'transition-all');
			setTimeout(() => targetElem?.classList.remove('ring-2', 'ring-rose-500'), 2000);
		} else {
			deliberationStore.logNotification('Aucune objection ouverte trouvée dans le fil.', 'info');
		}
	}
</script>

{#snippet renderThreadPane()}
	<SubjectDiscussionPane
		{projectId}
		{subjectId}
		{activeSubject}
		{activeDraft}
		{userRole}
		{isHumanUser}
		{sessionUser}
		{argumentsList}
		{displayedArguments}
		{openObjections}
		{totalObjectionsCount}
		{subjectOptions}
		{subjectDecision}
		{subjectRequirements}
		{requirementsUnresolvedRefs}
		{requirementsDossierPresent}
		{allowedKbRefs}
		{resumeSummary}
		{foundationContested}
		{contestationReason}
		{isLoadingArguments}
		{invokingAgentRole}
		{isForceEditingQuestion}
		bind:postureFilter
		bind:selectedComposerOptionId
		bind:replyingTo
		onDismissResumeBanner={() => (dismissResumeBanner = true)}
		onScrollToNextObjection={scrollToNextUnresolvedObjection}
		onInvokeAgent={(role) => void handleInvokeAgent(role)}
		onOpenSplitDialog={() => (isSplitDialogOpen = true)}
		onUpdateDraftQuestion={handleUpdateDraftQuestion}
		onUpdateDraftHypothesis={handleUpdateDraftHypothesis}
		onAdoptHypothesis={handleAdoptHypothesis}
		onSelectOptionForDiscussion={handleSelectOptionForDiscussion}
		onArbitrateOption={() => handleOpenMatrix(false)}
		onResolveArgument={handleResolveArgument}
		onChallengeArgument={handleChallengeArgument}
		onArgumentCreated={handleArgumentCreated}
		onOpenMatrix={handleOpenMatrix}
	/>
{/snippet}

{#snippet renderMatrixPane()}
	<SubjectMatrixPane
		{projectId}
		{subjectId}
		{userRole}
		{sessionUser}
		{isLoadingMatrix}
		bind:criteria={matrixCriteria}
		bind:options={subjectOptions}
		bind:evaluations={matrixEvaluations}
		bind:tradeOffs={matrixTradeOffs}
		bind:decision={subjectDecision}
		{singleOptionRationale}
		{effectiveReport}
		{invokingAgentRole}
		onSyncCache={syncWorkbenchCache}
		onReloadContext={() => loadArgumentsAndContext()}
		onInvokeProposer={() => void handleInvokeAgent('proposer')}
	/>
{/snippet}

{#snippet renderDoctrinesAndDraftPane()}
	<SubjectDoctrinePane
		{subjectId}
		{activeSubject}
		{activeDraft}
		{subjectDecision}
		{subjectOptions}
		{matrixCriteria}
		{doctrineItems}
		{citedKbRefs}
		{relevantDoctrine}
		{requiredByFramework}
		{isLoadingDoctrine}
		bind:detailedSpecText
		onOpenMatrix={() => handleOpenMatrix(false)}
		onGenerateSpecFromDecision={handleGenerateSpecFromDecision}
		onSaveDetailedSpec={handleSaveDetailedSpec}
		onApproveSpecL4={handleApproveSpecL4}
	/>
{/snippet}

{#snippet renderCascadeAndRulesPane()}
	<SubjectCascadePane
		{projectId}
		{subjectId}
		{cascadeResult}
		{discoveryTree}
		{treeSeries}
		{isLoadingTree}
		{isProposingAnglesMorts}
		onReloadContext={() => loadArgumentsAndContext()}
		onOpenMatrix={() => handleOpenMatrix(false)}
		onProposeAnglesMorts={handleProposeAnglesMortsFromTree}
		onRefreshTree={() => void refreshTreeData()}
	/>
{/snippet}

<div class="flex flex-col h-full bg-card rounded-xl border shadow-xs overflow-hidden" data-testid="unified-subject-workbench">
	<SubjectThreadHeader
		{activeSubject}
		{isSidebarCollapsed}
		{openObjectionsCount}
		{totalObjectionsCount}
		citedKbRefsCount={citedKbRefs.length}
		{isDebating}
		{invokingAgentRole}
		bind:isSplitView
		{onBackToBoard}
		{onToggleSidebar}
		onInvokeAgent={(role) => void handleInvokeAgent(role)}
		onLaunchDebate={() => void handleLaunchDebate()}
	/>

	<div class="shrink-0">
		<MaturityStepper
			report={effectiveReport}
			{userRole}
			{isHumanUser}
			{invokingAgentRole}
			onAction={handleCriterionAction}
			onContextualAction={handleContextualMilestoneAction}
			onTransition={handleTransitionMaturity}
		/>
	</div>

	<div
		class="px-3.5 py-1.5 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap shrink-0"
		data-testid="unified-workspace-tabs"
	>
		<div class="flex items-center gap-1 overflow-x-auto">
			<button
				type="button"
				data-testid="tab-unified-thread"
				onclick={() => (activeWorkspaceTab = 'thread')}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap {activeWorkspaceTab ===
					'thread' && !isSplitView
					? 'bg-background text-foreground shadow-2xs border'
					: isSplitView
						? 'bg-primary/10 text-primary border border-primary/20'
						: 'text-muted-foreground hover:text-foreground hover:bg-background/50'}"
			>
				<MessagesSquare class="h-3.5 w-3.5 text-primary" />
				<span>Délibération & Cadrage</span>
				<span class="px-1.5 py-0.2 rounded-full bg-muted text-[10px] font-mono">
					{argumentsList.length}
				</span>
			</button>

			<button
				type="button"
				data-testid="tab-unified-matrix"
				onclick={() => handleOpenMatrix(false)}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap {(isSplitView ? splitRightTab === 'matrix' : activeWorkspaceTab === 'matrix')
					? 'bg-background text-foreground shadow-2xs border'
					: 'text-muted-foreground hover:text-foreground hover:bg-background/50'}"
			>
				<Scale class="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
				<span>Options, Matrice & Arbitrage</span>
				<span class="px-1.5 py-0.2 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 text-[10px] font-mono">
					{subjectOptions.length} opt · {matrixCriteria.length} crit
				</span>
			</button>

			<button
				type="button"
				data-testid="tab-unified-kb"
				onclick={() => (activeWorkspaceTab = 'kb')}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap {(isSplitView ? splitRightTab === 'kb' : activeWorkspaceTab === 'kb')
					? 'bg-background text-foreground shadow-2xs border'
					: 'text-muted-foreground hover:text-foreground hover:bg-background/50'}"
			>
				<BookOpen class="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
				<span>Doctrines, RFP & Brouillon</span>
				<span class="px-1.5 py-0.2 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono">
					{doctrineItems.length + citedKbRefs.length}
				</span>
			</button>

			<button
				type="button"
				data-testid="tab-unified-cascade"
				onclick={() => {
					activeWorkspaceTab = 'cascade';
					void refreshTreeData();
				}}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap {(isSplitView ? splitRightTab === 'cascade' : activeWorkspaceTab === 'cascade')
					? 'bg-background text-foreground shadow-2xs border'
					: 'text-muted-foreground hover:text-foreground hover:bg-background/50'}"
			>
				<GitFork class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
				<span>Cascade & Règles</span>
				{#if cascadeResult?.questions?.length}
					<span class="px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono">
						{cascadeResult.questions.length}
					</span>
				{/if}
			</button>
		</div>
	</div>

	<div class="flex-1 min-h-0 overflow-hidden">
		{#if isSplitView}
			<div class="grid grid-cols-1 xl:grid-cols-12 h-full divide-y xl:divide-y-0 xl:divide-x divide-border">
				<div class="xl:col-span-6 h-full min-h-0 overflow-hidden">
					{@render renderThreadPane()}
				</div>
				<div class="xl:col-span-6 h-full min-h-0 overflow-hidden bg-muted/5">
					{#if splitRightTab === 'matrix'}
						{@render renderMatrixPane()}
					{:else if splitRightTab === 'kb'}
						{@render renderDoctrinesAndDraftPane()}
					{:else}
						{@render renderCascadeAndRulesPane()}
					{/if}
				</div>
			</div>
		{:else if activeWorkspaceTab === 'thread'}
			{@render renderThreadPane()}
		{:else if activeWorkspaceTab === 'matrix'}
			{@render renderMatrixPane()}
		{:else if activeWorkspaceTab === 'kb'}
			{@render renderDoctrinesAndDraftPane()}
		{:else if activeWorkspaceTab === 'cascade'}
			{@render renderCascadeAndRulesPane()}
		{/if}
	</div>
</div>

<SplitSubjectDialog
	isOpen={isSplitDialogOpen}
	parentSubject={activeSubject}
	parentDraft={activeDraft}
	onClose={() => (isSplitDialogOpen = false)}
	onSplitCreated={handleSplitCreated}
/>
