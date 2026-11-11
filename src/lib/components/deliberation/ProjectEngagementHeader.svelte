<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import {
		BookOpen,
		MessagesSquare,
		CheckCircle2,
		Cpu,
		Layers,
		Archive,
		RotateCcw,
		Target,
		Network
	} from 'lucide-svelte';

	interface Props {
		isExperimentalEnabled?: boolean;
	}

	let { isExperimentalEnabled = true }: Props = $props();

	const activeEngagement = $derived(deliberationStore.activeEngagement);
	const activePosture = $derived(deliberationStore.activePosture);
	const viewMode = $derived(deliberationStore.deliberationViewMode);
	const activeSubject = $derived(deliberationStore.activeSubject);

	// Est-ce qu'on est actuellement positionné à l'échelle d'un Sujet ?
	const isInSubjectScope = $derived(
		(activePosture === 'deliberation' && viewMode === 'conversation') ||
			activePosture === 'rendu' ||
			activePosture === 'refinement'
	);

	function openProjectAppropriation() {
		deliberationStore.setPosture('appropriation');
	}

	function openProjectBoard() {
		deliberationStore.setPosture('deliberation');
		deliberationStore.setDeliberationViewMode('board');
	}

	function openProjectGraph() {
		deliberationStore.setPosture('deliberation');
		deliberationStore.setDeliberationViewMode('graph');
	}

	function openSubjectDeliberation() {
		deliberationStore.setPosture('deliberation');
		deliberationStore.setDeliberationViewMode('conversation');
	}

	function openSubjectRendu() {
		deliberationStore.setPosture('rendu');
	}

	function openSubjectRefinement() {
		deliberationStore.setPosture('refinement');
	}
</script>

<div class="space-y-2.5" data-testid="project-engagement-header">
	<!-- Alerte si l'espace actif est archivé (lecture seule) -->
	{#if activeEngagement.status === 'archived'}
		<div
			class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200 animate-in fade-in duration-150"
		>
			<div class="flex items-center gap-2">
				<Archive class="h-4 w-4 text-amber-600 shrink-0" />
				<span>
					<strong>Espace archivé</strong> : « {activeEngagement.title} » est en consultation seule.
					{#if activeEngagement.archivedAt}
						<span class="opacity-80 font-mono text-[11px]"
							>(archivé le {new Date(activeEngagement.archivedAt).toLocaleDateString('fr-FR')})</span
						>
					{/if}
				</span>
			</div>
			<div class="flex items-center gap-2 shrink-0">
				<button
					type="button"
					onclick={() => deliberationStore.unarchiveEngagement(activeEngagement.id)}
					class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
				>
					<RotateCcw class="h-3.5 w-3.5" />
					<span>Désarchiver</span>
				</button>
				<a
					href="/workspaces"
					class="px-2.5 py-1 rounded-lg border border-amber-500/30 bg-background/60 hover:bg-background text-xs font-semibold transition-colors inline-block"
				>
					Changer d'espace
				</a>
			</div>
		</div>
	{/if}

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- HIÉRARCHIE ERGONOMIQUE À 2 NIVEAUX (PROJET VS SUJET - PATTERN A)         -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="rounded-xl border bg-card p-2 shadow-2xs flex flex-col xl:flex-row xl:items-center justify-between gap-2">
		<!-- NIVEAU 1 : ÉCHELLE PROJET (CADRAGE & PILOTAGE GLOBAL) -->
		<div class="flex items-center gap-1.5 flex-wrap">
			<span
				class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1 shrink-0"
				title={activeEngagement.title}
			>
				<Layers class="h-3.5 w-3.5 text-primary shrink-0" />
				<span>Projet :</span>
				<span class="text-foreground font-semibold normal-case tracking-normal truncate max-w-[180px] sm:max-w-[240px]">
					{activeEngagement.title}
				</span>
			</span>

			<!-- Phase 1 : Corpus & Règles (Appropriation Documentaire) -->
			<button
				type="button"
				data-testid="phase-tab-appropriation"
				onclick={openProjectAppropriation}
				class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer {activePosture ===
				'appropriation'
					? 'bg-primary text-primary-foreground font-bold shadow-xs'
					: 'bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground font-medium'}"
			>
				<BookOpen class="h-3.5 w-3.5 shrink-0" />
				<span>Phase 1 · Corpus & Règles</span>
				<span
					class="font-mono text-[10px] px-1.5 py-0.2 rounded {activePosture === 'appropriation'
						? 'bg-primary-foreground/20 text-primary-foreground'
						: 'bg-background text-muted-foreground'}"
				>
					{deliberationStore.corpusDocuments.length} docs
				</span>
			</button>

			<!-- Vue d'ensemble : Tableau des Sujets (Matrice de maturité globale) -->
			<button
				type="button"
				data-testid="project-board-tab"
				onclick={openProjectBoard}
				class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer {activePosture ===
					'deliberation' && viewMode === 'board'
					? 'bg-primary text-primary-foreground font-bold shadow-xs'
					: 'bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground font-medium'}"
			>
				<Layers class="h-3.5 w-3.5 shrink-0" />
				<span>Tableau des Sujets</span>
				<span
					class="font-mono text-[10px] px-1.5 py-0.2 rounded {activePosture === 'deliberation' &&
					viewMode === 'board'
						? 'bg-primary-foreground/20 text-primary-foreground'
						: 'bg-background text-muted-foreground'}"
				>
					{deliberationStore.subjects.length}
				</span>
			</button>

			<!-- Vue d'ensemble : Graphe Causal & Analyse d'Impact (What-If Simulator) -->
			<button
				type="button"
				data-testid="project-graph-tab"
				onclick={openProjectGraph}
				class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer {activePosture ===
					'deliberation' && viewMode === 'graph'
					? 'bg-primary text-primary-foreground font-bold shadow-xs'
					: 'bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground font-medium'}"
			>
				<Network class="h-3.5 w-3.5 shrink-0" />
				<span>Graphe d'Impact & Décisions</span>
				<span
					class="font-mono text-[10px] px-1.5 py-0.2 rounded {activePosture === 'deliberation' &&
					viewMode === 'graph'
						? 'bg-primary-foreground/20 text-primary-foreground'
						: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold'}"
				>
					What-If
				</span>
			</button>
		</div>

		<div class="hidden xl:block h-6 w-px bg-border"></div>

		<!-- NIVEAU 2 : ÉCHELLE SUJET (INGÉNIERIE D'UNE SECTION : DÉLIBÉRATION -> RENDU -> RAFFINEMENT) -->
		<div class="flex items-center justify-between xl:justify-end gap-1.5 flex-wrap flex-1">
			<div class="flex items-center gap-1.5 flex-wrap">
				<span
					class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider font-mono flex items-center gap-1 shrink-0 {isInSubjectScope
						? 'text-primary'
						: 'text-muted-foreground'}"
					title="Vues d'instruction focalisées sur le sujet actif"
				>
					<Target class="h-3.5 w-3.5" />
					<span>Sujet {activeSubject ? activeSubject.section_ref : ''} :</span>
				</span>

				<!-- Phase 2 : Délibération & Arbitrage du Sujet -->
				<button
					type="button"
					data-testid="phase-tab-deliberation"
					onclick={openSubjectDeliberation}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer {activePosture ===
						'deliberation' && viewMode === 'conversation'
						? 'bg-primary text-primary-foreground font-bold shadow-xs'
						: 'bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground font-medium'}"
				>
					<MessagesSquare class="h-3.5 w-3.5 shrink-0" />
					<span>Phase 2 · Délibération</span>
				</button>

				<span class="text-muted-foreground/40 text-xs select-none hidden sm:inline">→</span>

				<!-- Phase 3 : Rendu HLD & Scellement du Sujet -->
				<button
					type="button"
					data-testid="phase-tab-rendu"
					onclick={openSubjectRendu}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer {activePosture ===
					'rendu'
						? 'bg-primary text-primary-foreground font-bold shadow-xs'
						: 'bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground font-medium'}"
				>
					<CheckCircle2 class="h-3.5 w-3.5 shrink-0" />
					<span>Phase 3 · Rendu HLD</span>
					{#if Object.keys(deliberationStore.frozenSnapshots).length > 0}
						<span
							class="font-mono text-[10px] px-1.5 py-0.2 rounded {activePosture === 'rendu'
								? 'bg-primary-foreground/20 text-primary-foreground'
								: 'bg-background text-muted-foreground'}"
						>
							{Object.keys(deliberationStore.frozenSnapshots).length} scellés
						</span>
					{/if}
				</button>

				{#if isExperimentalEnabled}
					<span class="text-muted-foreground/40 text-xs select-none hidden sm:inline">→</span>

					<!-- Phase 4 : Raffinement & Hydratation du Sujet -->
					<button
						type="button"
						data-testid="phase-tab-refinement"
						onclick={openSubjectRefinement}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer {activePosture ===
						'refinement'
							? 'bg-indigo-600 text-white font-bold shadow-xs'
							: 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-medium border border-indigo-500/20'}"
					>
						<Cpu class="h-3.5 w-3.5 shrink-0" />
						<span>Phase 4 · Raffinement</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>
