<script lang="ts">

	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { Argument, ArgumentResolution, Stance } from '$lib/domain/debate';
	import {
		countOpenObjections,
		formatMaturityMilestoneSeparator,
		formatMaturityLevel,
		getMaturityBadgeClass,
		computeResumeSummary,
		type ResumeSummary
	} from '$lib/domain/debate';
	import type {
		Criterion,
		Option,
		OptionEvaluation,
		TradeOff,
		Decision
	} from '$lib/domain/options';
	import SubjectMessageBubble from './SubjectMessageBubble.svelte';
	import PinnedObjections from './PinnedObjections.svelte';
	import StructuredComposer from './StructuredComposer.svelte';
	import MaturityStepper from './MaturityStepper.svelte';
	import DecisionSurveyCard from './DecisionSurveyCard.svelte';
	import CascadeQuestionsCard from './CascadeQuestionsCard.svelte';
	import SubjectProblemCard from './SubjectProblemCard.svelte';
	import SplitSubjectDialog from './SplitSubjectDialog.svelte';
	import OptionsMatrix from './OptionsMatrix.svelte';
	import TelegraphicDraftView from './TelegraphicDraftView.svelte';
	import CapitalizationPanel from './CapitalizationPanel.svelte';
	import ProjectRulesPanel from './ProjectRulesPanel.svelte';
	import KnowledgeTreeChart from '$lib/components/knowledge/KnowledgeTreeChart.svelte';
	import type { CascadeResult } from '$lib/domain/cascade';
	import {
		computeMaturityCriteria,
		type MaturityTransitionsReport,
		type MaturityCriterion,
		type MilestoneContextualAction
	} from '$lib/domain/maturityCriteria';
	import type { MaturityLevel } from '$lib/types/epistemic';
	import {
		Bot,
		AlertTriangle,
		ArrowLeft,
		Sparkles,
		RotateCcw,
		ArrowDown,
		Clock,
		X,
		ChevronDown,
		Gavel,
		RefreshCw,
		MessagesSquare,
		Scale,
		BookOpen,
		GitFork,
		ShieldAlert,
		Columns2,
		Maximize2,
		ExternalLink,
		FileText,
		PanelLeftOpen,
		Database,
		CheckCircle2
	} from 'lucide-svelte';

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
		onBackToBoard = () => {}
	}: {
		subjectId: string;
		projectId: string;
		userRole?: string;
		sessionUser?: { id: string; email: string; role?: string } | null;
		isHumanUser?: boolean;
		isSidebarCollapsed?: boolean;
		onToggleSidebar?: () => void;
		isDossierOpen?: boolean;
		onToggleDossier?: () => void;
		onBackToBoard?: () => void;
	} = $props();

	// ─── État de navigation unifié (Onglets pleine largeur + Mode Split optionnel) ───
	type UnifiedWorkspaceTab = 'thread' | 'matrix' | 'kb' | 'cascade';
	let activeWorkspaceTab = $state<UnifiedWorkspaceTab>('thread');
	let isSplitView = $state(true);
	// En mode Split, la colonne de gauche affiche le fil ('thread') et la colonne de droite affiche l'un des 3 volets d'analyse :
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
	let criteriaReport = $state<MaturityTransitionsReport | null>(null);
	let subjectDecision = $state<Decision | null>(null);
	let cascadeResult = $state<CascadeResult | null>(null);
	let foundationContested = $state(false);
	let contestationReason = $state<string | undefined>(undefined);
	let isLoadingArguments = $state(false);
	let isLoadingMatrix = $state(false);
	let isDebating = $state(false);
	let invokingAgentRole = $state<string | null>(null);
	let isAgentMenuOpen = $state(false);
	let replyingTo = $state<Argument | null>(null);

	// Doctrine & Arbre cascade (fusionnés depuis l'ancien SubjectDossierView)
	interface DoctrineItem {
		id: string;
		type: string;
		title: string;
		status?: string;
		confidence?: string;
		excerpt?: string;
		source_ref?: string;
		relevance?: number;
		framework?: string;
		required?: boolean;
		relevant?: boolean;
		relevance_method?: string;
	}
	let doctrineItems = $state<DoctrineItem[]>([]);
	let isLoadingDoctrine = $state(false);
	let treeSeries = $state<any[]>([]);
	let isLoadingTree = $state(false);

	// Filtre de posture dans le fil
	let postureFilter = $state<Stance | 'all'>('all');
	let selectedComposerOptionId = $state<string>('');

	// Résumé de reprise après absence
	let dismissResumeBanner = $state(false);
	let lastVisitedTimestamp = $state<number>(Date.now() - 90_000_000);

	let isSplitDialogOpen = $state(false);
	let isForceEditingQuestion = $state(false);
	const activeSubject = $derived(deliberationStore.activeSubject);
	const activeDraft = $derived(deliberationStore.activeDraft);

	// Raccourci externe vers l'arbitrage formel (ex: clic depuis un autre composant)
	$effect(() => {
		if (deliberationStore.pendingDecisionSubjectId) {
			activeWorkspaceTab = 'matrix';
			deliberationStore.pendingDecisionSubjectId = null;
		}
	});

	// Compteurs synthétiques unifiés
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
	const searchMethod = $derived(doctrineItems.find((i) => i.relevance_method)?.relevance_method);
	const requiredByFramework = $derived.by(() => {
		const groups = new Map<string, DoctrineItem[]>();
		for (const i of doctrineItems.filter((x) => x.required && !relevantDoctrine.includes(x))) {
			const key = i.framework || 'Référentiel';
			groups.set(key, [...(groups.get(key) ?? []), i]);
		}
		return [...groups.entries()];
	});

	// Calcul réactif du rapport de maturité
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
			options: subjectOptions.map((o) => ({ id: o.id, title: o.title })),
			arguments: argumentsList,
			doctrineConstraintsCount: doctrineCount,
			actor: {
				userId: 'current-user',
				role: userRole,
				isHuman: isHumanUser
			}
		});
	});

	const effectiveReport = $derived(criteriaReport || computedReport);

	// Objections ouvertes (épinglées en haut)
	const openObjections = $derived(
		argumentsList.filter((a) => a.stance === 'objection' && a.resolution === 'open')
	);

	// Résumé de reprise calculé
	const resumeSummary = $derived.by<ResumeSummary | null>(() => {
		if (dismissResumeBanner || argumentsList.length === 0) return null;
		return computeResumeSummary(
			argumentsList,
			lastVisitedTimestamp,
			activeSubject?.level,
			'L1_framed'
		);
	});

	// Messages filtrés selon le filtre de posture
	const displayedArguments = $derived.by(() => {
		if (postureFilter === 'all') return argumentsList;
		return argumentsList.filter((a) => a.stance === postureFilter);
	});

	$effect(() => {
		if (subjectId && projectId) {
			loadArgumentsAndContext();
		}
	});

	async function loadArgumentsAndContext() {
		if (!projectId || !subjectId) return;
		isLoadingArguments = true;
		try {
			const [argsRes, optsRes, critListRes, evalsRes, tradeRes, docRes, critRes, decRes, cascadeRes] =
				await Promise.all([
					fetch(`/api/projects/${projectId}/subjects/${subjectId}/arguments`),
					fetch(`/api/projects/${projectId}/subjects/${subjectId}/options`),
					fetch(`/api/projects/${projectId}/subjects/${subjectId}/criteria`).catch(() => null),
					fetch(`/api/projects/${projectId}/subjects/${subjectId}/evaluations`).catch(() => null),
					fetch(`/api/projects/${projectId}/subjects/${subjectId}/tradeoffs`).catch(() => null),
					fetch(`/api/projects/${projectId}/subjects/${subjectId}/doctrine-context`),
					fetch(`/api/projects/${projectId}/subjects/${subjectId}/maturity-criteria`).catch(() => null),
					fetch(`/api/projects/${projectId}/subjects/${subjectId}/decision`).catch(() => null),
					fetch(`/api/projects/${projectId}/subjects/${subjectId}/cascade`).catch(() => null)
				]);

			if (argsRes.ok) {
				const data = await argsRes.json();
				argumentsList = Array.isArray(data) ? data : (data.arguments || []);
			} else {
				argumentsList = [];
			}

			if (optsRes.ok) {
				const optsData = await optsRes.json();
				subjectOptions = Array.isArray(optsData) ? optsData : (optsData.options || []);
			} else {
				subjectOptions = [];
			}

			if (critListRes && critListRes.ok) {
				const cData = await critListRes.json();
				matrixCriteria = Array.isArray(cData) ? cData : (cData.criteria || []);
			} else {
				matrixCriteria = [];
			}

			if (evalsRes && evalsRes.ok) {
				const eData = await evalsRes.json();
				matrixEvaluations = Array.isArray(eData) ? eData : (eData.evaluations || []);
			} else {
				matrixEvaluations = [];
			}

			if (tradeRes && tradeRes.ok) {
				const tData = await tradeRes.json();
				matrixTradeOffs = Array.isArray(tData) ? tData : (tData.tradeOffs || []);
			} else {
				matrixTradeOffs = [];
			}

			if (docRes.ok) {
				const docData = await docRes.json();
				allowedKbRefs = docData.allowedKbRefs || [];
				doctrineItems = docData.items || [];
			} else {
				allowedKbRefs = [];
				doctrineItems = [];
			}

			if (critRes && critRes.ok) {
				const critData = await critRes.json();
				criteriaReport = critData.report || null;
			}

			if (decRes && decRes.ok) {
				const decData = await decRes.json();
				subjectDecision = decData.decision || null;
			}

			void deliberationStore.refreshSubjectFromServer(subjectId, projectId);

			if (cascadeRes && cascadeRes.ok) {
				const cascData = await cascadeRes.json();
				cascadeResult = cascData.cascade || null;
				treeSeries = cascData.treeSeries || [];
				foundationContested = cascData.foundationContested || false;
				contestationReason = cascData.contestationReason;
			}
		} catch (err) {
			console.warn('[Espace Sujet] Erreur chargement contexte:', err);
		} finally {
			isLoadingArguments = false;
		}
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
				matrixCriteria = Array.isArray(cData) ? cData : (cData.criteria || []);
			}
			if (oRes.ok) {
				const oData = await oRes.json();
				subjectOptions = Array.isArray(oData) ? oData : (oData.options || []);
			}
			if (eRes.ok) {
				const eData = await eRes.json();
				matrixEvaluations = Array.isArray(eData) ? eData : (eData.evaluations || []);
			}
			if (tRes.ok) {
				const tData = await tRes.json();
				matrixTradeOffs = Array.isArray(tData) ? tData : (tData.tradeOffs || []);
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
				cascadeResult = data.cascade || cascadeResult;
			}
		} catch {
			// ignore
		} finally {
			isLoadingTree = false;
		}
	}

	async function patchSubject(payload: Record<string, unknown>): Promise<Response> {
		const url = `/api/projects/${projectId}/subjects/${subjectId}`;
		const current = await fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
		const send = (expectedVersion: number) =>
			fetch(url, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...payload, expectedVersion })
			});
		let res = await send(current?.subject?.version ?? 1);
		if (res.status === 409) {
			const conflict = await res.clone().json().catch(() => ({}));
			if (typeof conflict.currentVersion === 'number') res = await send(conflict.currentVersion);
		}
		return res;
	}

	async function handleTransitionMaturity(targetLevel: MaturityLevel) {
		if (
			targetLevel === 'L3_decided' ||
			targetLevel === 'L4_specified' ||
			targetLevel === 'L5_archived'
		) {
			activeWorkspaceTab = 'matrix';
			deliberationStore.requestFormalDecision(subjectId);
			return;
		}
		deliberationStore.setSubjectLevel(subjectId, targetLevel);

		if (!projectId || !subjectId) {
			deliberationStore.logNotification(`Jalon ${targetLevel} validé avec succès !`, 'success');
			return;
		}

		try {
			const res = await patchSubject({ maturityLevel: targetLevel });
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				console.warn('[Espace Sujet] Transition backend non persistée:', err);
			}
			await loadArgumentsAndContext();
			deliberationStore.logNotification(`Jalon ${targetLevel} validé avec succès !`, 'success');
		} catch {
			deliberationStore.logNotification(`Jalon ${targetLevel} appliqué.`, 'info');
		}
	}

	async function handleAdoptHypothesis() {
		if (!activeSubject) return;
		const hyp = activeDraft?.suppose?.[0]?.text || `Hypothèse validée pour ${activeSubject.name}`;

		if (activeDraft) {
			if (!activeDraft.retenu.includes(hyp)) {
				activeDraft.retenu = [hyp, ...activeDraft.retenu];
			}
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
					const created = await res.json();
					handleArgumentCreated(created);
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

	async function handleDecomposeSubject() {
		if (!projectId || !subjectId) return;
		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/arguments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					stance: 'question',
					claim: 'Proposition de découpage du sujet pour lever la stagnation',
					grounds:
						'Ce sujet stagne depuis plus de 14 jours. Il est recommandé de le découper en 2 sous-sujets distincts : 1) Spécification du cœur fonctionnel, 2) Interfaces et adaptateurs techniques.',
					kbRefs: []
				})
			});

			if (res.ok) {
				const created = await res.json();
				handleArgumentCreated(created);
				deliberationStore.logNotification(
					'Relance postée par l’agent : proposition de découpage.',
					'info'
				);
			}
		} catch (err: any) {
			deliberationStore.logNotification(err.message, 'warning');
		}
	}

	function handleCriterionAction(crit: MaturityCriterion) {
		switch (crit.actionType) {
			case 'resolve_objection':
				activeWorkspaceTab = 'thread';
				scrollToNextUnresolvedObjection();
				break;
			case 'run_verifier':
				deliberationStore.logNotification(
					'Vérificateur sollicité : il confronte les options à la doctrine (peut prendre une minute).',
					'info'
				);
				handleInvokeAgent('verifier');
				break;
			case 'derive_subjects':
				isSplitDialogOpen = true;
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
				handleInvokeAgent('proposer');
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
						'Consultez la carte d’affirmation K16 et les faits K18 dans le volet Options, Matrice & Arbitrage.',
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
						document.getElementById('capitalization-section')?.scrollIntoView({ behavior: 'smooth' });
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
					body: JSON.stringify({
						resolution,
						expectedVersion: arg.version
					})
				}
			);

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || "Erreur lors de la résolution de l'argument");
			}

			const updated = await res.json();
			const idx = argumentsList.findIndex((a) => a.id === arg.id);
			if (idx !== -1) {
				argumentsList[idx] = updated;
			}
			deliberationStore.logNotification(
				`Statut de l'objection mis à jour : ${resolution}`,
				'success'
			);
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
	}

	async function handleInvokeAgent(role: 'challenger' | 'proposer' | 'verifier' | 'synthesizer') {
		if (invokingAgentRole || isDebating || !projectId || !subjectId) return;
		invokingAgentRole = role;
		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/debate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ agentRole: role })
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || `Erreur lors de la sollicitation de l'agent @${role}`);
			}

			const data = await res.json();
			await loadArgumentsAndContext();
			deliberationStore.logNotification(
				data.message || `L'agent @${role} est intervenu avec succès.`,
				'success'
			);
		} catch (err: any) {
			deliberationStore.logNotification(err.message || 'Erreur agent', 'warning');
		} finally {
			invokingAgentRole = null;
		}
	}

	async function handleUpdateDraftQuestion(newQ: string) {
		deliberationStore.updateDraftQuestion(subjectId, newQ);
		if (projectId && subjectId) {
			try {
				await patchSubject({ problemStatement: newQ });
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
			if (res.ok) {
				const created = await res.json();
				handleArgumentCreated(created);
			}
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
		const composerElem = document.getElementById('compose-claim');
		composerElem?.focus();
		deliberationStore.logNotification(
			`Option « ${opt.title} » sélectionnée pour discussion.`,
			'info'
		);
	}

	function handleArbitrateOption(_opt?: any) {
		activeWorkspaceTab = 'matrix';
		void refreshMatrixData();
	}

	function handleChallengeArgument(arg: Argument) {
		activeWorkspaceTab = 'thread';
		replyingTo = arg;
		const composerElem = document.getElementById('compose-claim');
		composerElem?.focus();
		deliberationStore.logNotification(
			`Réfutation ciblée sur l'argument de ${arg.author}.`,
			'info'
		);
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
		if (!targetElem && openEls.length > 0) {
			targetElem = openEls[0] as HTMLElement;
		}

		if (targetElem) {
			targetElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
			targetElem.classList.add('ring-2', 'ring-rose-500', 'transition-all');
			setTimeout(() => {
				targetElem?.classList.remove('ring-2', 'ring-rose-500');
			}, 2000);
		} else {
			deliberationStore.logNotification('Aucune objection ouverte trouvée dans le fil.', 'info');
		}
	}
</script>

<!-- ═════════════════════════════════════════════════════════════════════════ -->
<!-- SNIPPETS DE RENDU DES VOLETS UNIFIÉS (ZÉRO DOUBLON)                       -->
<!-- ═════════════════════════════════════════════════════════════════════════ -->

{#snippet renderThreadPane()}
	<div class="flex flex-col h-full min-h-0">
		<!-- Barre de filtre rapide du fil -->
		<div class="px-4 py-2 border-b bg-muted/10 flex items-center justify-between gap-2 flex-wrap text-xs shrink-0">
			<div class="flex items-center gap-1 text-[11px]">
				<span class="text-muted-foreground font-medium mr-1">Filtrer le fil :</span>
				<button
					type="button"
					onclick={() => (postureFilter = 'all')}
					class="px-2 py-0.5 rounded font-medium cursor-pointer {postureFilter === 'all'
						? 'bg-primary text-primary-foreground font-semibold'
						: 'bg-muted text-muted-foreground hover:text-foreground'}"
				>
					Tous ({argumentsList.length})
				</button>
				<button
					type="button"
					onclick={() => (postureFilter = 'objection')}
					class="px-2 py-0.5 rounded font-medium cursor-pointer {postureFilter === 'objection'
						? 'bg-rose-600 text-white font-semibold'
						: 'bg-muted text-muted-foreground hover:text-foreground'}"
				>
					Objections ({totalObjectionsCount})
				</button>
				<button
					type="button"
					onclick={() => (postureFilter = 'synthesis')}
					class="px-2 py-0.5 rounded font-medium cursor-pointer {postureFilter === 'synthesis'
						? 'bg-indigo-600 text-white font-semibold'
						: 'bg-muted text-muted-foreground hover:text-foreground'}"
				>
					Synthèses ({argumentsList.filter((a) => a.stance === 'synthesis').length})
				</button>
			</div>

			{#if openObjections.length > 0}
				<button
					type="button"
					onclick={scrollToNextUnresolvedObjection}
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25 hover:bg-rose-500/20 text-[10px] font-bold transition-colors cursor-pointer"
					title="Scroller vers la prochaine objection non résolue"
				>
					<ArrowDown class="h-3 w-3" />
					<span>Prochaine objection ↓</span>
				</button>
			{/if}
		</div>

		<!-- Corps scrollable du fil -->
		<div class="flex-1 overflow-y-auto p-4 space-y-3.5">
			{#if activeSubject && (activeSubject.nature || activeSubject.depends_on_subject_ids?.length)}
				<div class="flex flex-wrap items-center gap-2 text-[11px]">
					{#if activeSubject.nature && activeSubject.nature !== 'architecture'}
						<span class="px-2 py-0.5 rounded-full font-bold border bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20">
							{activeSubject.nature === 'contractuel' ? 'Sujet contractuel' : 'Sujet organisationnel'}
						</span>
					{/if}
					{#if activeSubject.depends_on_subject_ids?.length}
						<span class="text-muted-foreground"><strong>À trancher après :</strong></span>
						{#each activeSubject.depends_on_subject_ids as depId (depId)}
							{@const dep = deliberationStore.activeEngagement?.subjects.find((s) => s.id === depId)}
							<button
								type="button"
								onclick={() => deliberationStore.selectSubject(depId)}
								class="px-2 py-0.5 rounded-md border hover:bg-muted/40 cursor-pointer {dep && ['L3_decided', 'L4_specified', 'L5_archived'].includes(dep.level) ? 'text-emerald-700 dark:text-emerald-300 border-emerald-500/30' : 'text-amber-700 dark:text-amber-300 border-amber-500/30'}"
							>
								{dep?.name ?? depId}
							</button>
						{/each}
					{/if}
				</div>
			{/if}

			<!-- Bandeau Cadrage compact (2 lignes par défaut, dépliable, sans doublon d'options) -->
			{#if activeSubject}
				<SubjectProblemCard
					subject={activeSubject}
					draft={activeDraft}
					options={subjectOptions}
					isInvokingAgent={invokingAgentRole !== null}
					onInvokeProposer={() => handleInvokeAgent('proposer')}
					onSplit={() => (isSplitDialogOpen = true)}
					onUpdateQuestion={handleUpdateDraftQuestion}
					onUpdateHypothesis={handleUpdateDraftHypothesis}
					onAdoptHypothesis={handleAdoptHypothesis}
					onSelectOption={handleSelectOptionForDiscussion}
					onArbitrateOption={handleArbitrateOption}
					{isForceEditingQuestion}
				/>
			{/if}

			{#if resumeSummary}
				<div class="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 flex items-center justify-between gap-3 text-xs shadow-2xs">
					<div class="flex items-center gap-2">
						<Clock class="h-4 w-4 text-blue-600 shrink-0" />
						<div>
							<strong class="text-blue-900 dark:text-blue-200">Résumé de reprise :</strong>
							<span class="text-blue-800 dark:text-blue-300 ml-1">{resumeSummary.summaryText}</span>
						</div>
					</div>
					<button
						type="button"
						onclick={() => (dismissResumeBanner = true)}
						class="p-1 text-blue-700 hover:text-blue-950 dark:hover:text-blue-100 transition-colors cursor-pointer"
						title="Masquer le résumé"
					>
						<X class="h-3.5 w-3.5" />
					</button>
				</div>
			{/if}

			{#if foundationContested}
				<div
					class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start gap-3 text-xs shadow-2xs"
					data-testid="foundation-contested-banner"
				>
					<AlertTriangle class="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
					<div class="space-y-1">
						<h4 class="font-bold text-rose-900 dark:text-rose-200">
							⚠️ Fondement du sujet remis en cause
						</h4>
						<p class="text-rose-800 dark:text-rose-300 leading-relaxed">
							{contestationReason ||
								'La décision parente ayant engendré ce sujet a été modifiée ou remplacée. Le périmètre de cette délibération doit être réévalué.'}
						</p>
					</div>
				</div>
			{/if}

			{#if openObjections.length > 0}
				<PinnedObjections
					objections={openObjections}
					{userRole}
					{isHumanUser}
					onResolve={handleResolveArgument}
				/>
			{/if}

			{#if activeSubject}
				<div class="flex items-center justify-center my-2">
					<span class="px-3 py-1 rounded-full bg-muted/80 text-[11px] font-mono font-medium text-muted-foreground border border-border/60">
						{formatMaturityMilestoneSeparator(activeSubject.level)}
					</span>
				</div>
			{/if}

			<!-- Bannière synthétique de décision actée (renvoie vers le volet Matrice & Arbitrage) -->
			{#if subjectDecision}
				{@const retainedOpt = subjectOptions.find((o) => o.id === subjectDecision?.retainedOptionId)}
				<div class="rounded-xl border-2 border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-card p-3 flex items-center justify-between gap-3 shadow-2xs">
					<div class="flex items-center gap-2.5">
						<div class="p-2 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
							<Gavel class="h-4 w-4" />
						</div>
						<div>
							<div class="flex items-center gap-2">
								<span class="text-xs font-bold text-foreground">Décision d'architecture actée</span>
								<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
									L3 · Décidé
								</span>
							</div>
							<p class="text-xs text-muted-foreground mt-0.5">
								Option retenue : <strong class="text-foreground">{retainedOpt?.title || subjectDecision.retainedOptionId}</strong>
								{#if (subjectDecision as any).validatedBy} · Affirmée par <strong>{(subjectDecision as any).validatedBy}</strong>{/if}
							</p>
						</div>
					</div>

					<div class="flex items-center gap-2 shrink-0">
						<button
							type="button"
							data-testid="thread-banner-kb-candidates-btn"
							onclick={() => {
								activeWorkspaceTab = 'matrix';
								void refreshMatrixData();
								setTimeout(() => {
									document.getElementById('capitalization-section')?.scrollIntoView({ behavior: 'smooth' });
								}, 80);
							}}
							class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
							title="Préparer et transmettre les candidats de capitalisation à LLMOps (Porte G4)"
						>
							<Database class="h-3.5 w-3.5" />
							<span>Candidats KB (G4)</span>
						</button>

						<button
							type="button"
							onclick={() => {
								activeWorkspaceTab = 'matrix';
								void refreshMatrixData();
							}}
							class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/35 bg-background text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
						>
							<span>Matrice & Faits K18 →</span>
						</button>
					</div>
				</div>
			{/if}

			<!-- Liste des messages -->
			{#if isLoadingArguments}
				<div class="p-8 text-center text-xs text-muted-foreground animate-pulse">
					Chargement de la conversation...
				</div>
			{:else if argumentsList.length === 0}
				<div class="p-6 text-center border-2 border-dashed rounded-xl space-y-3 bg-muted/5 max-w-lg mx-auto my-4">
					<div class="p-2.5 rounded-full bg-primary/10 text-primary w-fit mx-auto">
						<Sparkles class="h-5 w-5" />
					</div>
					<div class="space-y-1">
						<h4 class="text-sm font-bold text-foreground">Délibération ouverte</h4>
						<p class="text-xs text-muted-foreground leading-relaxed">
							Initiez le débat ci-dessous ou utilisez les actions contextualisées du jalon en haut de l'écran.
						</p>
					</div>
				</div>
			{:else if displayedArguments.length === 0}
				<div class="p-8 text-center border-2 border-dashed rounded-xl space-y-2 bg-muted/10">
					<Bot class="h-8 w-8 text-muted-foreground/60 mx-auto" />
					<h4 class="text-xs font-bold text-foreground">Aucun argument affiché pour ce filtre</h4>
					<p class="text-xs text-muted-foreground max-w-sm mx-auto">
						Basculez sur « Tous » pour afficher l'ensemble des échanges ({argumentsList.length} arguments).
					</p>
				</div>
			{:else}
				{#each displayedArguments as arg (arg.id)}
					{@const targetArg = arg.targetArgumentId
						? argumentsList.find((a) => a.id === arg.targetArgumentId) || null
						: null}

					<SubjectMessageBubble
						argument={arg}
						targetArgument={targetArg}
						{userRole}
						{isHumanUser}
						onResolve={handleResolveArgument}
						onChallenge={handleChallengeArgument}
						onArbitrateOption={handleArbitrateOption}
						onSplit={() => (isSplitDialogOpen = true)}
						onReply={(target) => {
							replyingTo = target;
							const composerElem = document.getElementById('compose-claim');
							composerElem?.focus();
						}}
					/>
				{/each}

				{#if !subjectDecision && argumentsList.length > 0}
					<div class="rounded-xl border border-dashed border-primary/30 bg-muted/10 p-3 flex items-center justify-between gap-3 text-xs mt-2 flex-wrap">
						<div class="flex items-center gap-2 text-muted-foreground">
							<Sparkles class="h-4 w-4 text-primary shrink-0" />
							<span>Prêt à évaluer les alternatives ou trancher la décision ?</span>
						</div>
						<div class="flex items-center gap-2">
							<button
								type="button"
								onclick={() => handleInvokeAgent('synthesizer')}
								disabled={invokingAgentRole !== null}
								class="px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/25 hover:bg-purple-500/20 text-[11px] font-semibold transition-colors cursor-pointer"
							>
								⚖️ @synthesizer
							</button>
							<button
								type="button"
								onclick={() => {
									activeWorkspaceTab = 'matrix';
									void refreshMatrixData();
								}}
								class="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 transition-colors cursor-pointer shadow-2xs"
							>
								Ouvrir Matrice & Arbitrer →
							</button>
						</div>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Composeur structuré épinglé en bas du fil -->
		<div class="p-3 border-t bg-muted/20 shrink-0">
			<StructuredComposer
				{subjectId}
				{projectId}
				options={subjectOptions}
				bind:selectedOptionId={selectedComposerOptionId}
				{allowedKbRefs}
				{replyingTo}
				onCancelReply={() => (replyingTo = null)}
				onArgumentCreated={handleArgumentCreated}
				onError={(msg) => deliberationStore.logNotification(msg, 'warning')}
			/>
		</div>
	</div>
{/snippet}

{#snippet renderMatrixPane()}
	<div class="h-full overflow-y-auto p-4 space-y-5" data-testid="unified-matrix-pane">
		<!-- 1. Matrice Multicritères, Propositions d'Options & Arbitrage Formel L3 -->
		<div class="space-y-3">
			{#if isLoadingMatrix}
				<div class="text-xs font-mono text-muted-foreground animate-pulse">
					Synchronisation de la matrice...
				</div>
			{/if}
			<OptionsMatrix
				{projectId}
				{subjectId}
				bind:criteria={matrixCriteria}
				bind:options={subjectOptions}
				bind:evaluations={matrixEvaluations}
				bind:tradeOffs={matrixTradeOffs}
				bind:decision={subjectDecision}
				userRole={deliberationStore.currentRole}
				onDecisionMade={() => {
					void loadArgumentsAndContext();
					deliberationStore.refreshSubjectFromServer(subjectId, projectId);
				}}
				onError={(msg) => deliberationStore.logNotification(msg, 'warning')}
			/>
		</div>

		<!-- 2. Affirmation Collégiale (K16) & Extraction des Faits Machine-Lisibles (K18) -->
		<div class="pt-4 border-t border-border/60">
			<DecisionSurveyCard
				{projectId}
				{subjectId}
				decision={subjectDecision}
				options={subjectOptions}
				sessionUser={sessionUser
					? { id: sessionUser.id, email: sessionUser.email, role: sessionUser.role || userRole }
					: { id: 'anonymous', email: '', role: userRole }}
				isHubCutover={effectiveReport?.sourceOfRecord === 'hub'}
				onAffirmed={async () => {
					await loadArgumentsAndContext();
					deliberationStore.logNotification(
						'Décision d’architecture et faits machine-lisibles affirmés !',
						'success'
					);
				}}
			/>
		</div>
	</div>
{/snippet}

{#snippet renderDoctrinesAndDraftPane()}
	<div class="h-full overflow-y-auto p-4 space-y-5 text-xs" data-testid="unified-doctrines-pane">
		<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
			<!-- Colonne A : Doctrines applicables (LLMOps) & Règles mobilisées dans le débat -->
			<div class="space-y-3 rounded-xl border bg-card/50 p-3.5">
				<div class="flex items-center justify-between pb-2 border-b text-foreground font-bold">
					<span class="flex items-center gap-1.5">
						<BookOpen class="h-4 w-4 text-indigo-500" />
						<span>
							Doctrine applicable (LLMOps){#if searchMethod}
								· recherche {searchMethod === 'lexical'
									? 'par mots-clés'
									: searchMethod === 'semantic'
										? 'sémantique'
										: 'hybride'}{/if}
						</span>
					</span>
					<span class="font-mono text-[10px] text-muted-foreground">
						{isLoadingDoctrine ? '…' : `${doctrineItems.length} élément(s)`}
					</span>
				</div>

				{#if !isLoadingDoctrine && doctrineItems.length === 0}
					<div class="p-3 rounded-lg border border-dashed text-center text-muted-foreground">
						Aucune doctrine applicable renvoyée par LLMOps pour ce sujet.
					</div>
				{/if}

				{#if relevantDoctrine.length}
					<div class="space-y-1.5">
						<p class="text-[11px] font-semibold text-foreground">Pertinente pour ce sujet</p>
						{#each relevantDoctrine as item (item.id)}
							<div class="rounded-lg border bg-card p-2.5 space-y-0.5">
								<div class="flex items-center gap-2">
									<span class="font-mono font-bold text-indigo-600 dark:text-indigo-400">{item.id}</span>
									<span class="text-[10px] text-muted-foreground">
										{item.type}{item.confidence ? ` · ${item.confidence}` : ''}
									</span>
								</div>
								<p class="text-foreground font-medium">{item.title}</p>
							</div>
						{/each}
					</div>
				{/if}

				{#each requiredByFramework as [framework, items] (framework)}
					<details class="rounded-lg border bg-muted/20 p-2.5">
						<summary class="cursor-pointer font-semibold">
							Contrôles {framework} imposés par les référentiels déclarés ({items.length})
						</summary>
						<ul class="mt-2 space-y-1">
							{#each items as item (item.id)}
								<li><span class="font-mono font-semibold">{item.id}</span> — {item.title}</li>
							{/each}
						</ul>
					</details>
				{/each}

				<div class="flex items-center justify-between pt-2 pb-1 border-b text-muted-foreground font-semibold">
					<span>Règles doctrinales mobilisées dans le débat</span>
					<span class="font-mono text-[10px]">{citedKbRefs.length} identifiée(s)</span>
				</div>

				{#if citedKbRefs.length === 0}
					<div class="p-3 rounded-lg border border-dashed text-center text-muted-foreground">
						Aucune règle doctrinale citée explicitement dans les arguments de ce sujet.
					</div>
				{:else}
					<div class="space-y-2">
						{#each citedKbRefs as ref}
							<div class="rounded-lg border bg-card p-2.5 flex items-center justify-between gap-2">
								<div class="flex items-center gap-2">
									<BookOpen class="h-3.5 w-3.5 text-indigo-500 shrink-0" />
									<div>
										<span class="font-mono font-bold text-foreground">§ {ref}</span>
										<p class="text-[10px] text-muted-foreground">
											Règle mobilisée dans l'argumentation contradictoire
										</p>
									</div>
								</div>
								<a
									href={`/knowledge?rule=${encodeURIComponent(ref)}`}
									class="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline px-2 py-1 rounded bg-primary/10 shrink-0"
								>
									<span>Fiche</span>
									<ExternalLink class="h-3 w-3" />
								</a>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Colonne B : Spécification Télégraphique (5 colonnes) -->
			<div class="space-y-3 rounded-xl border bg-card/50 p-3.5">
				<div class="flex items-center justify-between pb-2 border-b text-foreground font-bold">
					<span class="flex items-center gap-1.5">
						<FileText class="h-4 w-4 text-primary" />
						<span>Spécification télégraphique du sujet</span>
					</span>
					<span class="text-[10px] font-mono text-muted-foreground">5 colonnes</span>
				</div>
				<TelegraphicDraftView readOnlyMode={true} />
			</div>
		</div>
	</div>
{/snippet}

{#snippet renderCascadeAndRulesPane()}
	<div class="h-full overflow-y-auto p-4 space-y-5 text-xs" data-testid="unified-cascade-pane">
		<!-- 1. Questions en cascade générées post-décision (A28) -->
		{#if cascadeResult && cascadeResult.questions && cascadeResult.questions.length > 0}
			<CascadeQuestionsCard
				{projectId}
				{subjectId}
				cascade={cascadeResult}
				onNavigateToChild={(childId) => {
					deliberationStore.selectSubject(childId);
				}}
				onQuestionUpdated={async () => {
					await loadArgumentsAndContext();
				}}
			/>
		{/if}

		<!-- 2. Arbre de découverte (Généalogie cascade) & Règles du projet -->
		<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
			<div class="space-y-3 rounded-xl border bg-card/50 p-3.5" data-testid="dossier-discovery-tree">
				<div class="flex items-center justify-between pb-2 border-b text-foreground font-bold">
					<span class="flex items-center gap-1.5">
						<GitFork class="h-4 w-4 text-primary" />
						<span>Arbre de découverte (Parents → Décisions → Enfants)</span>
					</span>
				</div>
				{#if isLoadingTree}
					<div class="p-8 text-center text-muted-foreground animate-pulse">
						Génération de l'arbre généalogique...
					</div>
				{:else if treeSeries && treeSeries.length > 0}
					<div class="rounded-xl border bg-card p-2 min-h-[380px]">
						<KnowledgeTreeChart series={treeSeries} height="380px" />
					</div>
				{:else}
					<div class="p-8 text-center text-muted-foreground border-2 border-dashed rounded-xl">
						Aucune cascade de décision générée pour ce sujet.
					</div>
				{/if}
			</div>

			<div class="space-y-3 rounded-xl border bg-card/50 p-3.5" data-testid="dossier-project-rules">
				<ProjectRulesPanel
					{projectId}
					{subjectId}
					onRuleChanged={() => {
						void refreshTreeData();
					}}
				/>
			</div>
		</div>
	</div>
{/snippet}

<!-- ═════════════════════════════════════════════════════════════════════════ -->
<!-- CONTENEUR PRINCIPAL UNIFIÉ DU SUJET (PANNEAU DROIT FUSIONNÉ)              -->
<!-- ═════════════════════════════════════════════════════════════════════════ -->
<div class="flex flex-col h-full bg-card rounded-xl border shadow-xs overflow-hidden" data-testid="unified-subject-workbench">
	<!-- ─────────────────────────────────────────────────────────────────────── -->
	<!-- 1. EN-TÊTE UNIQUE DU SUJET                                              -->
	<!-- ─────────────────────────────────────────────────────────────────────── -->
	<div class="px-3.5 py-2.5 border-b bg-muted/20 flex items-center justify-between gap-3 flex-wrap shrink-0">
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={onBackToBoard}
				class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
				title="Revenir au tableau de maturité"
			>
				<ArrowLeft class="h-3.5 w-3.5" />
				<span>Tableau</span>
				{#if deliberationStore.activeEngagement?.title}
					<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background text-primary border border-primary/30 font-bold">
						{deliberationStore.activeEngagement.shortName || deliberationStore.activeEngagement.title}
					</span>
				{/if}
			</button>

			{#if isSidebarCollapsed}
				<button
					type="button"
					data-testid="expand-subject-list-btn"
					onclick={onToggleSidebar}
					class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-card hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer shadow-2xs"
					title="Déplier la liste des sujets"
				>
					<PanelLeftOpen class="h-3.5 w-3.5 text-primary" />
					<span class="hidden sm:inline">Sujets</span>
					<span class="text-[10px] font-mono px-1 rounded bg-primary/10 text-primary font-bold">
						{deliberationStore.sortedSubjects.length}
					</span>
				</button>
			{/if}

			<div>
				<div class="flex items-center gap-2 flex-wrap">
					<span class="font-mono text-xs font-bold text-primary">
						{activeSubject?.section_ref || '§'}
					</span>
					<h2 class="text-sm font-bold text-foreground leading-none">
						{activeSubject?.name || 'Sujet non sélectionné'}
					</h2>
					{#if activeSubject}
						<span class="inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-bold border {getMaturityBadgeClass(activeSubject.level)}">
							{formatMaturityLevel(activeSubject.level)}
						</span>
					{/if}
				</div>
				<div class="text-[11px] text-muted-foreground mt-0.5">
					Attente : <strong class="text-foreground">{activeSubject?.waiting_for_role || '—'}</strong> · Effort : <span class="font-mono">{activeSubject?.relative_effort || 'M'}</span>
				</div>
			</div>
		</div>

		<!-- Compteurs synthétiques, LLMOps, Menu Agents & Bascule Split -->
		<div class="flex items-center gap-1.5 flex-wrap">
			<!-- Badges Objections & Doctrines (fusionnés depuis l'ancien en-tête Dossier) -->
			<span
				class="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[10px] font-bold border {openObjectionsCount > 0
					? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25'
					: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'}"
				title="Objections ouvertes sur le total des objections du sujet"
			>
				<ShieldAlert class="h-3 w-3" />
				<span>{openObjectionsCount} obj. ouverte(s) / {totalObjectionsCount}</span>
			</span>

			<span
				class="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[10px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25"
				title="Références doctrinales mobilisées dans la délibération"
			>
				<BookOpen class="h-3 w-3" />
				<span>{citedKbRefs.length} ref(s) base</span>
			</span>

			<!-- Indicateur LLMOps -->
			{#if deliberationStore.llmopsStatus === 'connected'}
				<button
					type="button"
					onclick={() => deliberationStore.syncWithLLMOps(undefined, undefined, { silent: false })}
					disabled={deliberationStore.isSyncingLLMOps}
					class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20 transition-colors cursor-pointer"
					title="Connecté au Knowledge Hub LLMOps · Cliquez pour resynchroniser"
				>
					<span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
					<span class="opacity-80">LLMOps :</span>
					<strong class="font-mono">En ligne</strong>
					{#if deliberationStore.isSyncingLLMOps}
						<RefreshCw class="h-3 w-3 animate-spin ml-0.5" />
					{/if}
				</button>
			{:else}
				<button
					type="button"
					onclick={() => deliberationStore.syncWithLLMOps(undefined, undefined, { silent: false })}
					disabled={deliberationStore.isSyncingLLMOps}
					class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/20 transition-colors cursor-pointer"
					title="Non connecté à LLMOps · Cliquez pour tester la connexion"
				>
					<span class="inline-block h-2 w-2 rounded-full bg-rose-500"></span>
					<span class="opacity-80">LLMOps :</span>
					<strong class="font-mono">Non connecté</strong>
					{#if deliberationStore.isSyncingLLMOps}
						<RefreshCw class="h-3 w-3 animate-spin ml-0.5" />
					{/if}
				</button>
			{/if}

			<!-- Menu Solliciter un agent -->
			<div class="relative">
				<button
					type="button"
					disabled={isDebating || invokingAgentRole !== null}
					onclick={() => (isAgentMenuOpen = !isAgentMenuOpen)}
					class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-background hover:bg-muted/70 disabled:opacity-50 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
				>
					{#if isDebating}
						<RotateCcw class="h-3.5 w-3.5 animate-spin text-primary" />
						<span>Débat...</span>
					{:else if invokingAgentRole}
						<RotateCcw class="h-3.5 w-3.5 animate-spin text-purple-600" />
						<span>@{invokingAgentRole}...</span>
					{:else}
						<Sparkles class="h-3.5 w-3.5 text-purple-600" />
						<span>Agents IA</span>
						<ChevronDown class="h-3 w-3 text-muted-foreground transition-transform {isAgentMenuOpen ? 'rotate-180' : ''}" />
					{/if}
				</button>

				{#if isAgentMenuOpen}
					<div
						class="absolute right-0 mt-1 w-56 rounded-xl border bg-popover text-popover-foreground shadow-lg z-30 p-1.5 space-y-1 text-xs"
						role="menu"
					>
						<div class="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b mb-1">
							Interpeller un agent IA
						</div>
						<button
							type="button"
							onclick={() => {
								isAgentMenuOpen = false;
								handleInvokeAgent('challenger');
							}}
							class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-rose-500/10 text-rose-700 dark:text-rose-400 font-semibold cursor-pointer transition-colors text-left"
						>
							<span>⚔️</span>
							<div>
								<div class="leading-none">@challenger</div>
								<div class="text-[10px] font-normal text-muted-foreground mt-0.5">Trouver failles & objections</div>
							</div>
						</button>
						<button
							type="button"
							onclick={() => {
								isAgentMenuOpen = false;
								handleInvokeAgent('proposer');
							}}
							class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-semibold cursor-pointer transition-colors text-left"
						>
							<span>💡</span>
							<div>
								<div class="leading-none">@proposer</div>
								<div class="text-[10px] font-normal text-muted-foreground mt-0.5">Suggérer une nouvelle option</div>
							</div>
						</button>
						<button
							type="button"
							onclick={() => {
								isAgentMenuOpen = false;
								handleInvokeAgent('verifier');
							}}
							class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 font-semibold cursor-pointer transition-colors text-left"
						>
							<span>🛡️</span>
							<div>
								<div class="leading-none">@verifier</div>
								<div class="text-[10px] font-normal text-muted-foreground mt-0.5">Contrôler conformité doctrine</div>
							</div>
						</button>
						<button
							type="button"
							onclick={() => {
								isAgentMenuOpen = false;
								handleInvokeAgent('synthesizer');
							}}
							class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-purple-500/10 text-purple-700 dark:text-purple-400 font-semibold cursor-pointer transition-colors text-left"
						>
							<span>⚖️</span>
							<div>
								<div class="leading-none">@synthesizer</div>
								<div class="text-[10px] font-normal text-muted-foreground mt-0.5">Résumer et arbitrer</div>
							</div>
						</button>
						<div class="border-t my-1"></div>
						<button
							type="button"
							onclick={() => {
								isAgentMenuOpen = false;
								handleLaunchDebate();
							}}
							class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-semibold cursor-pointer transition-colors text-left"
						>
							<span>⚡</span>
							<div>
								<div class="leading-none">Débat complet</div>
								<div class="text-[10px] font-normal text-muted-foreground mt-0.5">Tour contradictoire automatisé</div>
							</div>
						</button>
					</div>
				{/if}
			</div>

			<!-- Bascule Mode Onglets Pleine Largeur vs Mode Split Côte-à-côte (sur grand écran) -->
			<button
				type="button"
				data-testid="btn-toggle-split"
				onclick={() => (isSplitView = !isSplitView)}
				class="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer {isSplitView
					? 'bg-primary text-primary-foreground border-primary shadow-2xs'
					: 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
				title={isSplitView
					? 'Revenir aux onglets unifiés pleine largeur'
					: 'Afficher le Fil et la Matrice côte à côte sur grand écran'}
			>
				{#if isSplitView}
					<Maximize2 class="h-3.5 w-3.5" />
					<span>Pleine largeur</span>
				{:else}
					<Columns2 class="h-3.5 w-3.5" />
					<span>Vue Split (Fil + Matrice)</span>
				{/if}
			</button>
		</div>
	</div>

	<!-- ─────────────────────────────────────────────────────────────────────── -->
	<!-- 2. TIMELINE HORIZONTALE DE MATURATION + CRITÈRES & ACTIONS EN HAUT      -->
	<!-- ─────────────────────────────────────────────────────────────────────── -->
	<div class="shrink-0">
		<MaturityStepper
			report={effectiveReport}
			{userRole}
			{isHumanUser}
			onAction={handleCriterionAction}
			onContextualAction={handleContextualMilestoneAction}
			onTransition={handleTransitionMaturity}
		/>
	</div>

	<!-- ─────────────────────────────────────────────────────────────────────── -->
	<!-- 3. BARRE D'ONGLETS UNIFIÉS DU SUJET (Remplace Fil + Dossier séparés)    -->
	<!-- ─────────────────────────────────────────────────────────────────────── -->
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
				onclick={() => {
					activeWorkspaceTab = 'matrix';
					void refreshMatrixData();
				}}
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

	<!-- ─────────────────────────────────────────────────────────────────────── -->
	<!-- 4. CORPS DE L'ESPACE UNIFIÉ (ONGLETS PLEINE LARGEUR OU VUE SPLIT)       -->
	<!-- ─────────────────────────────────────────────────────────────────────── -->
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