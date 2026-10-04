<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { Argument, ArgumentResolution, Stance } from '$lib/domain/debate';
	import {
		formatMaturityMilestoneSeparator,
		canCloseObjection,
		computeResumeSummary,
		type ResumeSummary
	} from '$lib/domain/debate';
	import type { Option } from '$lib/domain/options';
	import SubjectMessageBubble from './SubjectMessageBubble.svelte';
	import PinnedObjections from './PinnedObjections.svelte';
	import StructuredComposer from './StructuredComposer.svelte';
	import MaturityStepper from './MaturityStepper.svelte';
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
		CheckCircle2
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
	let isLoadingArguments = $state(false);
	let isDebating = $state(false);

	// Navigation et modes d'affichage du fil
	type ViewMode = 'thread' | 'synthesis';
	let viewMode = $state<ViewMode>('thread');
	let postureFilter = $state<Stance | 'all'>('all');

	// Résumé de reprise après absence
	let dismissResumeBanner = $state(false);
	let lastVisitedTimestamp = $state<number>(Date.now() - 90_000_000); // Ex: simulé > 24h par défaut ou stocké

	const activeSubject = $derived(deliberationStore.activeSubject);

	// Calcul d'un rapport de maturité de secours / réactif
	const computedReport = $derived.by<MaturityTransitionsReport | null>(() => {
		if (!activeSubject) return null;
		return computeMaturityCriteria({
			subject: {
				id: activeSubject.id,
				name: activeSubject.name,
				problemStatement: null,
				sectionRef: activeSubject.section_ref,
				level: activeSubject.level,
				hubLevel: activeSubject.level,
				is_stalled: activeSubject.is_stalled,
				stall_days: activeSubject.stall_days
			},
			options: subjectOptions.map((o) => ({ id: o.id, title: o.title })),
			arguments: argumentsList,
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
			const [argsRes, optsRes, docRes, critRes] = await Promise.all([
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/arguments`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/options`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/doctrine-context`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/maturity-criteria`).catch(() => null)
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
		} catch (err) {
			console.warn('[Fil Sujet] Erreur chargement contexte:', err);
		} finally {
			isLoadingArguments = false;
		}
	}

	async function handleTransitionMaturity(targetLevel: MaturityLevel) {
		if (!projectId || !subjectId) return;
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
				throw new Error(err.message || 'Échec de la transition de maturité');
			}

			await loadArgumentsAndContext();
			deliberationStore.logNotification(`Jalon ${targetLevel} validé avec succès !`, 'success');
		} catch (err: any) {
			deliberationStore.logNotification(err.message, 'warning');
		}
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
			case 'edit_problem':
			case 'edit_scope':
			case 'write_spec':
			case 'add_option':
			case 'define_criteria':
				if (!isDossierOpen) onToggleDossier();
				break;
			case 'add_doctrine_ref':
				deliberationStore.logNotification(
					'Utilisez le composeur avec #base pour rattacher une règle doctrinale.',
					'info'
				);
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

	function scrollToNextUnresolvedObjection() {
		const elem = document.querySelector('[data-stance="objection"]');
		if (elem) {
			elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
		} else {
			deliberationStore.logNotification("Aucune objection non résolue dans le fil.", 'info');
		}
	}

	function getLevelBadgeClass(level: string) {
		switch (level) {
			case 'L0_named': return 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20';
			case 'L1_framed': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
			case 'L2_decomposed': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
			case 'L3_decided': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
			case 'L4_specified': return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20';
			case 'L5_archived': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
			default: return 'bg-muted text-muted-foreground';
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
					class="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer mr-1"
					title="Revenir au tableau de maturité"
				>
					<ArrowLeft class="h-3.5 w-3.5" />
					<span>Tableau</span>
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
							<span class="inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] font-semibold border {getLevelBadgeClass(activeSubject.level)}">
								{activeSubject.level}
							</span>
						{/if}
					</div>
					<div class="text-[11px] text-muted-foreground mt-0.5">
						Attente : <strong class="text-foreground">{activeSubject?.waiting_for_role || '—'}</strong> · Effort : <span class="font-mono">{activeSubject?.relative_effort || 'M'}</span>
					</div>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<!-- Lancer le débat multi-agents -->
				<button
					type="button"
					disabled={isDebating}
					onclick={handleLaunchDebate}
					class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
					title="Déclencher les agents Proposer, Challenger et Synthesizer"
				>
					{#if isDebating}
						<RotateCcw class="h-3.5 w-3.5 animate-spin" />
						<span>Débat...</span>
					{:else}
						<Sparkles class="h-3.5 w-3.5" />
						<span>Débat IA</span>
					{/if}
				</button>

				<!-- Toggle Dossier -->
				<button
					type="button"
					onclick={onToggleDossier}
					class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer {isDossierOpen
						? 'bg-primary/10 border-primary/30 text-primary'
						: 'bg-background hover:bg-muted text-foreground'}"
					title="Afficher ou masquer le dossier de consultation"
				>
					<FolderLock class="h-3.5 w-3.5" />
					<span>{isDossierOpen ? 'Masquer dossier' : 'Dossier'}</span>
				</button>
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

		<!-- Liste des messages de délibération -->
		{#if isLoadingArguments}
			<div class="p-8 text-center text-xs text-muted-foreground animate-pulse">
				Chargement de la conversation...
			</div>
		{:else if displayedArguments.length === 0}
			<div class="p-8 text-center border-2 border-dashed rounded-xl space-y-2 bg-muted/10">
				<Bot class="h-8 w-8 text-muted-foreground/60 mx-auto" />
				<h4 class="text-xs font-bold text-foreground">Aucun argument affiché pour ce filtre</h4>
				<p class="text-xs text-muted-foreground max-w-sm mx-auto">
					Basculez sur « Fil complet » ou utilisez le composeur ci-dessous pour poster votre analyse.
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
				/>
			{/each}
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
			{allowedKbRefs}
			onArgumentCreated={handleArgumentCreated}
			onError={(msg) => deliberationStore.logNotification(msg, 'warning')}
		/>
	</div>
</div>
