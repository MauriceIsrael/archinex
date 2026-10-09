<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { Argument, ArgumentResolution, Stance } from '$lib/domain/debate';
	import {
		formatMaturityMilestoneSeparator,
		formatMaturityLevel,
		getMaturityBadgeClass,
		canCloseObjection,
		computeResumeSummary,
		type ResumeSummary
	} from '$lib/domain/debate';
	import type { Option } from '$lib/domain/options';
	import SubjectMessageBubble from './SubjectMessageBubble.svelte';
	import PinnedObjections from './PinnedObjections.svelte';
	import StructuredComposer from './StructuredComposer.svelte';
	import MaturityStepper from './MaturityStepper.svelte';
	import DecisionSurveyCard from './DecisionSurveyCard.svelte';
	import CascadeQuestionsCard from './CascadeQuestionsCard.svelte';
	import SubjectProblemCard from './SubjectProblemCard.svelte';
	import SplitSubjectDialog from './SplitSubjectDialog.svelte';
	import type { CascadeResult } from '$lib/domain/cascade';
	import {
		computeMaturityCriteria,
		type MaturityTransitionsReport,
		type MaturityCriterion
	} from '$lib/domain/maturityCriteria';
	import type { MaturityLevel } from '$lib/types/epistemic';
	import {
		Bot,
		FolderLock,
		Play,
		AlertTriangle,
		ArrowLeft,
		Sparkles,
		RotateCcw,
		HelpCircle,
		Filter,
		ArrowDown,
		Clock,
		X,
		Layers,
		CheckCircle2,
		ChevronDown,
		Scissors,
		Gavel,
		RefreshCw
	} from 'lucide-svelte';

	let {
		subjectId = '',
		projectId = '',
		userRole = 'lead_architect',
		isHumanUser = true,
		isDossierOpen = true,
		onToggleDossier = () => {},
		onBackToBoard = () => {}
	}: {
		subjectId: string;
		projectId: string;
		userRole?: string;
		isHumanUser?: boolean;
		isDossierOpen?: boolean;
		onToggleDossier?: () => void;
		onBackToBoard?: () => void;
	} = $props();

	let argumentsList = $state<Argument[]>([]);
	let subjectOptions = $state<Option[]>([]);
	let allowedKbRefs = $state<string[]>([]);
	let criteriaReport = $state<MaturityTransitionsReport | null>(null);
	let subjectDecision = $state<any>(null);
	let cascadeResult = $state<CascadeResult | null>(null);
	let foundationContested = $state(false);
	let contestationReason = $state<string | undefined>(undefined);
	let isLoadingArguments = $state(false);
	let isDebating = $state(false);
	let invokingAgentRole = $state<string | null>(null);
	let isAgentMenuOpen = $state(false);
	let replyingTo = $state<Argument | null>(null);

	// Navigation et modes d'affichage du fil
	type ViewMode = 'thread' | 'synthesis';
	let viewMode = $state<ViewMode>('thread');
	let postureFilter = $state<Stance | 'all'>('all');
	let selectedComposerOptionId = $state<string>('');

	// Résumé de reprise après absence
	let dismissResumeBanner = $state(false);
	let lastVisitedTimestamp = $state<number>(Date.now() - 90_000_000); // Ex: simulé > 24h par défaut ou stocké

	let isSplitDialogOpen = $state(false);
	let isForceEditingQuestion = $state(false);
	const activeSubject = $derived(deliberationStore.activeSubject);
	const activeDraft = $derived(deliberationStore.activeDraft);

	// Calcul d'un rapport de maturité de secours / réactif
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

	// Messages filtrés selon la bascule (Fil / Synthèse) et le filtre de posture
	const displayedArguments = $derived.by(() => {
		let list = argumentsList;

		// Mode Synthèse : Uniquement cartes de synthèse, objections ouvertes et décisions
		if (viewMode === 'synthesis') {
			list = list.filter(
				(a) =>
					a.stance === 'synthesis' ||
					(a.stance === 'objection' && a.resolution === 'open')
			);
		}

		// Filtre par posture
		if (postureFilter !== 'all') {
			list = list.filter((a) => a.stance === postureFilter);
		}

		return list;
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
			const [argsRes, optsRes, docRes, critRes, decRes, cascadeRes] = await Promise.all([
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/arguments`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/options`),
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

			if (docRes.ok) {
				const docData = await docRes.json();
				allowedKbRefs = docData.allowedKbRefs || [];
			} else {
				allowedKbRefs = [];
			}

			if (critRes && critRes.ok) {
				const critData = await critRes.json();
				criteriaReport = critData.report || null;
			}

			if (decRes && decRes.ok) {
				const decData = await decRes.json();
				subjectDecision = decData.decision || null;
			}

			if (cascadeRes && cascadeRes.ok) {
				const cascData = await cascadeRes.json();
				cascadeResult = cascData.cascade || null;
				foundationContested = cascData.foundationContested || false;
				contestationReason = cascData.contestationReason;
			}
		} catch (err) {
			console.warn('[Fil Sujet] Erreur chargement contexte:', err);
		} finally {
			isLoadingArguments = false;
		}
	}

	async function handleTransitionMaturity(targetLevel: MaturityLevel) {
		// Toujours appliquer la transition dans le store réactif pour fluidité immédiate
		deliberationStore.setSubjectLevel(subjectId, targetLevel);

		if (!projectId || !subjectId) {
			deliberationStore.logNotification(`Jalon ${targetLevel} validé avec succès !`, 'success');
			return;
		}

		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					maturityLevel: targetLevel,
					expectedVersion: 1
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				console.warn('[Fil Sujet] Transition backend non persistée:', err);
			}

			await loadArgumentsAndContext();
			deliberationStore.logNotification(`Jalon ${targetLevel} validé avec succès !`, 'success');
		} catch (err: any) {
			deliberationStore.logNotification(`Jalon ${targetLevel} appliqué.`, 'info');
		}
	}

	async function handleAdoptHypothesis() {
		if (!activeSubject) return;
		const hyp = activeDraft?.suppose?.[0]?.text || `Hypothèse validée pour ${activeSubject.name}`;

		// 1. Inscrire dans le brouillon retenu si pas déjà présent
		if (activeDraft) {
			if (!activeDraft.retenu.includes(hyp)) {
				activeDraft.retenu = [hyp, ...activeDraft.retenu];
			}
		}

		// 2. Déterminer le prochain jalon :
		// L0_named -> L1_framed
		// L1_framed -> L2_decomposed
		// L2_decomposed -> L3_decided (Arbitrage formel)
		let nextLevel: MaturityLevel = 'L1_framed';
		if (activeSubject.level === 'L0_named') nextLevel = 'L1_framed';
		else if (activeSubject.level === 'L1_framed') nextLevel = 'L2_decomposed';
		else if (activeSubject.level === 'L2_decomposed') nextLevel = 'L3_decided';
		else nextLevel = activeSubject.level;

		if (nextLevel === 'L3_decided') {
			deliberationStore.arbitrateSubject(activeSubject.id);
		} else {
			await handleTransitionMaturity(nextLevel);
		}

		// 3. Consigner l'argument dans le fil
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
				scrollToNextUnresolvedObjection();
				break;
			case 'run_verifier':
				handleLaunchDebate();
				break;
			case 'derive_subjects':
				handleDecomposeSubject();
				break;
			case 'edit_problem': {
				// 1. Scroller vers la carte du problème et mettre en valeur
				const cardElem = document.getElementById('subject-problem-box');
				if (cardElem) {
					cardElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
					cardElem.classList.add('ring-2', 'ring-primary', 'transition-all');
					setTimeout(() => cardElem?.classList.remove('ring-2', 'ring-primary'), 2500);
				}
				// 2. Déclencher le mode édition in-place
				isForceEditingQuestion = true;
				setTimeout(() => (isForceEditingQuestion = false), 600);
				break;
			}
			case 'add_doctrine_ref': {
				// Pré-remplir le composeur avec #base pour rattacher une règle doctrinale en 1 clic
				const composer = document.getElementById('compose-claim') as HTMLTextAreaElement | HTMLInputElement | null;
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
				break;
			}
			case 'add_option': {
				// Solliciter directement l'agent @proposer pour poser 2 options
				handleInvokeAgent('proposer');
				break;
			}
			case 'edit_scope':
			case 'write_spec':
			case 'define_criteria':
				if (!isDossierOpen) onToggleDossier();
				break;
			case 'hub_affirmation':
				deliberationStore.logNotification(
					'Validation K16 : Une décision requiert une affirmation dans le Hub par un valideur distinct de son auteur.',
					'info'
				);
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
				await fetch(`/api/projects/${projectId}/subjects/${subjectId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						problemStatement: newQ,
						expectedVersion: 1
					})
				});
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
		selectedComposerOptionId = opt.id;
		const composerElem = document.getElementById('compose-claim');
		composerElem?.focus();
		deliberationStore.logNotification(`Option « ${opt.title} » sélectionnée pour discussion.`, 'info');
	}

	function handleArbitrateOption(_opt?: any) {
		viewMode = 'synthesis';
	}

	function handleChallengeArgument(arg: Argument) {
		replyingTo = arg;
		const composerElem = document.getElementById('compose-claim');
		composerElem?.focus();
		deliberationStore.logNotification(`Réfutation ciblée sur l'argument de ${arg.author}.`, 'info');
	}

	function scrollToNextUnresolvedObjection() {
		// Chercher les éléments d'objection ouverte
		const openObjections = document.querySelectorAll('[data-stance="objection"]');
		// Trouver le premier qui contient "Objection ouverte"
		let targetElem: HTMLElement | null = null;
		for (const el of openObjections) {
			if (el.textContent?.includes('Objection ouverte')) {
				targetElem = el as HTMLElement;
				break;
			}
		}
		if (!targetElem && openObjections.length > 0) {
			targetElem = openObjections[0] as HTMLElement;
		}

		if (targetElem) {
			targetElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
			targetElem.classList.add('ring-2', 'ring-rose-500', 'transition-all');
			setTimeout(() => {
				targetElem?.classList.remove('ring-2', 'ring-rose-500');
			}, 2000);
		} else {
			deliberationStore.logNotification("Aucune objection ouverte trouvée dans le fil.", 'info');
		}
	}

</script>

<div class="flex flex-col h-full bg-card rounded-xl border shadow-xs overflow-hidden">
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- EN-TÊTE DU FIL : Titre du sujet, bascule Fil/Synthèse et boutons d'action -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="p-3 border-b bg-muted/20 space-y-2.5 shrink-0">
		<div class="flex items-center justify-between gap-3 flex-wrap">
			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={onBackToBoard}
					class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer mr-1"
					title="Revenir au tableau de maturité et changer de projet"
				>
					<ArrowLeft class="h-3.5 w-3.5" />
					<span>Tableau</span>
					{#if deliberationStore.activeEngagement?.title}
						<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background text-primary border border-primary/30 font-bold">
							{deliberationStore.activeEngagement.shortName || deliberationStore.activeEngagement.title}
						</span>
					{/if}
				</button>

				<div>
					<div class="flex items-center gap-2">
						<span class="font-mono text-xs font-bold text-muted-foreground">
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

			<div class="flex items-center gap-1.5 flex-wrap">
				<!-- Indicateur d'état LLMOps -->
				{#if deliberationStore.llmopsStatus === 'connected'}
					<button
						type="button"
						onclick={() => deliberationStore.syncWithLLMOps()}
						disabled={deliberationStore.isSyncingLLMOps}
						class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20 transition-colors cursor-pointer"
						title="Connecté au Knowledge Hub GCP Cloud Run ({deliberationStore.activeEngagementId}) · Cliquez pour resynchroniser"
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
						onclick={() => deliberationStore.syncWithLLMOps()}
						disabled={deliberationStore.isSyncingLLMOps}
						class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/20 transition-colors cursor-pointer"
						title="Non connecté à une instance LLMOps : aucune synchronisation distante active. Archinex fonctionne en mode local autonome. Cliquez pour tester la connexion."
					>
						<span class="inline-block h-2 w-2 rounded-full bg-rose-500"></span>
						<span class="opacity-80">LLMOps :</span>
						<strong class="font-mono">Non connecté</strong>
						{#if deliberationStore.isSyncingLLMOps}
							<RefreshCw class="h-3 w-3 animate-spin ml-0.5" />
						{/if}
					</button>
				{/if}

				<!-- Menu compact Solliciter un agent (A31) -->
				<div class="relative">
					<button
						type="button"
						disabled={isDebating || invokingAgentRole !== null}
						onclick={() => (isAgentMenuOpen = !isAgentMenuOpen)}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-background hover:bg-muted/70 disabled:opacity-50 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
						title="Solliciter un agent IA ou lancer un débat contradictoire"
					>
						{#if isDebating}
							<RotateCcw class="h-3.5 w-3.5 animate-spin text-primary" />
							<span>Débat en cours...</span>
						{:else if invokingAgentRole}
							<RotateCcw class="h-3.5 w-3.5 animate-spin text-purple-600" />
							<span>@{invokingAgentRole}...</span>
						{:else}
							<Sparkles class="h-3.5 w-3.5 text-purple-600" />
							<span>Solliciter un agent</span>
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
			</div>
		</div>

		<!-- STEPPER DE MATURATION (A26) : L0->L5, Verrous, Convergence, Stagnation -->
		<MaturityStepper
			report={effectiveReport}
			{userRole}
			{isHumanUser}
			onAction={handleCriterionAction}
			onTransition={handleTransitionMaturity}
		/>

		<!-- BARRE DE NAVIGATION DANS LE FIL : Bascule Fil / Synthèse, filtres & scroll objection -->
		<div class="flex items-center justify-between gap-2 pt-1 border-t border-border/40 flex-wrap text-xs">
			<!-- Bascule Fil / Synthèse -->
			<div class="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg">
				<button
					type="button"
					onclick={() => (viewMode = 'thread')}
					class="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer {viewMode ===
					'thread'
						? 'bg-background text-foreground shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Fil complet ({argumentsList.length})
				</button>

				<button
					type="button"
					onclick={() => (viewMode = 'synthesis')}
					class="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer {viewMode ===
					'synthesis'
						? 'bg-background text-foreground shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Synthèse & Arbitrage
				</button>
			</div>

			<!-- Filtres par posture & bouton prochaine objection -->
			<div class="flex items-center gap-1.5">
				<div class="flex items-center gap-1 text-[10px]">
					<button
						type="button"
						onclick={() => (postureFilter = 'all')}
						class="px-2 py-0.5 rounded font-medium cursor-pointer {postureFilter === 'all'
							? 'bg-primary text-primary-foreground font-semibold'
							: 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						Tous
					</button>
					<button
						type="button"
						onclick={() => (postureFilter = 'objection')}
						class="px-2 py-0.5 rounded font-medium cursor-pointer {postureFilter === 'objection'
							? 'bg-rose-600 text-white font-semibold'
							: 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						Objections ({argumentsList.filter((a) => a.stance === 'objection').length})
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
						class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25 hover:bg-rose-500/20 text-[10px] font-bold transition-colors cursor-pointer"
						title="Scroller vers la prochaine objection non résolue"
					>
						<ArrowDown class="h-3 w-3" />
						<span>Prochaine objection ↓</span>
					</button>
				{/if}
			</div>
		</div>
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- CORPS DU FIL : Résumé de reprise, objections épinglées et messages        -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="flex-1 overflow-y-auto p-4 space-y-4">
		<!-- CARTE DE CADRAGE DU PROBLÈME (GRAINE D'ARCHITECTURE & RFP SEED) -->
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

		<!-- Bannière Résumé de reprise après absence (> 24 h) -->
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

		<!-- Bannière Fondement remis en cause (A28) -->
		{#if foundationContested}
			<div
				class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start gap-3 text-xs shadow-2xs"
				data-testid="foundation-contested-banner"
			>
				<AlertTriangle class="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
				<div class="space-y-1">
					<h4 class="font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
						<span>⚠️ Fondement du sujet remis en cause</span>
					</h4>
					<p class="text-rose-800 dark:text-rose-300 leading-relaxed">
						{contestationReason ||
							'La décision parente ayant engendré ce sujet a été modifiée ou remplacée. Le périmètre de cette délibération doit être réévalué.'}
					</p>
				</div>
			</div>
		{/if}

		<!-- Objections ouvertes épinglées en haut du fil -->
		{#if openObjections.length > 0}
			<PinnedObjections
				objections={openObjections}
				{userRole}
				{isHumanUser}
				onResolve={handleResolveArgument}
			/>
		{/if}

		<!-- Séparateur de jalon de maturité initial -->
		{#if activeSubject}
			<div class="flex items-center justify-center my-3">
				<span class="px-3 py-1 rounded-full bg-muted/80 text-[11px] font-mono font-medium text-muted-foreground border border-border/60">
					{formatMaturityMilestoneSeparator(activeSubject.level)}
				</span>
			</div>
		{/if}

		<!-- BANNIÈRE DE DÉCISION ACTÉE DANS LE FIL (viewMode === 'thread') -->
		{#if viewMode === 'thread' && subjectDecision}
			{@const retainedOpt = subjectOptions.find((o) => o.id === subjectDecision.retainedOptionId)}
			<div class="rounded-xl border-2 border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-card p-3.5 flex items-center justify-between gap-3 shadow-2xs">
				<div class="flex items-center gap-3">
					<div class="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
						<Gavel class="h-5 w-5" />
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
							{#if subjectDecision.validatedBy} · Affirmée par <strong>{subjectDecision.validatedBy}</strong>{/if}
						</p>
					</div>
				</div>

				<button
					type="button"
					onclick={() => (viewMode = 'synthesis')}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/35 bg-background text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 text-xs font-semibold transition-colors cursor-pointer shrink-0 shadow-2xs"
				>
					<span>Consulter arbitrage & faits K18</span>
					<span>→</span>
				</button>
			</div>
		{/if}

		<!-- CARTE DE DÉCISION ET FAITS AFFIRMÉS (viewMode === 'synthesis') -->
		{#if viewMode === 'synthesis'}
			<DecisionSurveyCard
				{projectId}
				{subjectId}
				decision={subjectDecision}
				options={subjectOptions}
				sessionUser={{ id: 'session-user', email: 'session-user@domain.com', role: userRole }}
				isHubCutover={effectiveReport?.sourceOfRecord === 'hub'}
				onAffirmed={async () => {
					await loadArgumentsAndContext();
					deliberationStore.logNotification('Décision d’architecture et faits machine-lisibles affirmés !', 'success');
				}}
			/>
		{/if}

		<!-- CARTE DE CASCADE DE QUESTIONS (A28) : Découverte automatique post-affirmation -->
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

		<!-- Liste des messages de délibération -->
		{#if isLoadingArguments}
			<div class="p-8 text-center text-xs text-muted-foreground animate-pulse">
				Chargement de la conversation...
			</div>
		{:else if argumentsList.length === 0}
			<!-- Empty state spécifique quand le sujet a 0 message (nouveau sujet) -->
			<div class="p-8 text-center border-2 border-dashed rounded-xl space-y-4 bg-muted/5 max-w-lg mx-auto my-6">
				<div class="p-3 rounded-full bg-primary/10 text-primary w-fit mx-auto">
					<Sparkles class="h-6 w-6" />
				</div>
				<div class="space-y-1.5">
					<h4 class="text-sm font-bold text-foreground">Délibération ouverte</h4>
					<p class="text-xs text-muted-foreground leading-relaxed">
						Ce sujet est prêt pour l'analyse d'architecture. Vous pouvez initier le débat en formulant une question ou une proposition ci-dessous, ou solliciter directement l'un de nos agents spécialisés.
					</p>
				</div>

				<div class="grid grid-cols-2 gap-2 text-left pt-2">
					<button
						type="button"
						onclick={() => handleInvokeAgent('proposer')}
						disabled={invokingAgentRole !== null}
						class="p-2.5 rounded-lg border bg-card hover:bg-muted/50 transition-colors text-xs space-y-0.5 cursor-pointer"
					>
						<span class="font-bold text-blue-600 dark:text-blue-400 block">💡 @proposer</span>
						<span class="text-[11px] text-muted-foreground">Formuler les premières options techniques</span>
					</button>

					<button
						type="button"
						onclick={() => handleInvokeAgent('verifier')}
						disabled={invokingAgentRole !== null}
						class="p-2.5 rounded-lg border bg-card hover:bg-muted/50 transition-colors text-xs space-y-0.5 cursor-pointer"
					>
						<span class="font-bold text-cyan-600 dark:text-cyan-400 block">🛡️ @verifier</span>
						<span class="text-[11px] text-muted-foreground">Vérifier les contraintes de doctrine</span>
					</button>
				</div>
			</div>
		{:else if displayedArguments.length === 0}
			<!-- Empty state quand un filtre masque tous les messages existants -->
			<div class="p-8 text-center border-2 border-dashed rounded-xl space-y-2 bg-muted/10">
				<Bot class="h-8 w-8 text-muted-foreground/60 mx-auto" />
				<h4 class="text-xs font-bold text-foreground">Aucun argument affiché pour ce filtre</h4>
				<p class="text-xs text-muted-foreground max-w-sm mx-auto">
					Basculez sur « Tous » ou « Fil complet » pour afficher l'ensemble des échanges ({argumentsList.length} arguments existants).
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
						// Scroll composer into view
						const composerElem = document.getElementById('compose-claim');
						composerElem?.focus();
					}}
				/>
			{/each}

			{#if !subjectDecision && argumentsList.length > 0}
				<div class="rounded-xl border border-dashed border-primary/30 bg-muted/10 p-3.5 flex items-center justify-between gap-3 text-xs mt-3 flex-wrap">
					<div class="flex items-center gap-2 text-muted-foreground">
						<Sparkles class="h-4 w-4 text-primary shrink-0" />
						<span>Le débat est engagé ({argumentsList.length} argument{argumentsList.length > 1 ? 's' : ''}). Prêt à dégager un consensus ou arbitrer l'option retenue ?</span>
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
							onclick={() => (viewMode = 'synthesis')}
							class="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 transition-colors cursor-pointer shadow-2xs"
						>
							Arbitrer la décision →
						</button>
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- COMPOSEUR STRUCTURÉ (A25) : Posture, Fondement requis, #base, @agent      -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
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

<SplitSubjectDialog
	isOpen={isSplitDialogOpen}
	parentSubject={activeSubject}
	parentDraft={activeDraft}
	onClose={() => (isSplitDialogOpen = false)}
	onSplitCreated={handleSplitCreated}
/>
