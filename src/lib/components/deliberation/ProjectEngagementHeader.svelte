<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import {
		computePhaseNavigation,
		type PhaseStatus,
		type NextAction
	} from '$lib/domain/phaseNavigation';
	import {
		BookOpen,
		MessagesSquare,
		CheckCircle2,
		Cpu,
		Layers,
		Archive,
		RotateCcw,
		Target,
		Bot,
		Lock,
		ArrowRight,
		Circle,
		Clock,
		AlertCircle,
		AlertTriangle,
		HelpCircle,
		ShieldCheck
	} from 'lucide-svelte';
	import { formatRelativeAgeFr } from '$lib/domain/edp/driftMetrics';

	interface HeaderDriftSummary {
		posture: 'unverified' | 'drift_detected' | 'no_drift';
		openCount: number;
		staleCount: number;
		lastSuccessAgeMs: number | null;
	}

	interface Props {
		onOpenQuickAsk?: () => void;
		onOpenLiveLock?: () => void;
		driftSummary?: HeaderDriftSummary | null;
	}

	let { onOpenQuickAsk, onOpenLiveLock, driftSummary = null }: Props = $props();

	let fetchedDrift = $state<HeaderDriftSummary | null>(null);
	const effectiveDrift = $derived<HeaderDriftSummary>(
		driftSummary ??
			fetchedDrift ?? {
				posture: 'unverified',
				openCount: 0,
				staleCount: 0,
				lastSuccessAgeMs: null
			}
	);

	const activeEngagement = $derived(deliberationStore.activeEngagement);
	const activePosture = $derived(deliberationStore.activePosture);
	const viewMode = $derived(deliberationStore.deliberationViewMode);
	const activeSubject = $derived(deliberationStore.activeSubject);

	$effect(() => {
		const pid = activeEngagement?.id;
		if (!pid || typeof window === 'undefined' || driftSummary) return;
		let cancelled = false;
		fetch(`/api/projects/${encodeURIComponent(pid)}/drift`)
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (cancelled || !data || data.status === 'error') return;
				fetchedDrift = {
					posture: data.posture ?? 'unverified',
					openCount: data.indicators?.openBySeverity?.total ?? 0,
					staleCount: data.indicators?.staleDecisionsCount ?? 0,
					lastSuccessAgeMs: data.reconciliation?.lastSuccessAgeMs ?? null
				};
			})
			.catch(() => {
				// Non bloquant : l'état reste « non vérifié » (jamais vert)
			});
		return () => {
			cancelled = true;
		};
	});

	const driftPillMeta = $derived.by(() => {
		if (effectiveDrift.posture === 'no_drift') {
			return {
				label: 'Aucune dérive',
				cls: 'bg-emerald-100 hover:bg-emerald-200/80 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700',
				title: `Aucune dérive détectée (dernière réconciliation : ${formatRelativeAgeFr(effectiveDrift.lastSuccessAgeMs)}). Cliquer pour ouvrir la vue Dérive.`
			};
		}
		if (effectiveDrift.posture === 'drift_detected') {
			const parts: string[] = [];
			if (effectiveDrift.openCount > 0) parts.push(`${effectiveDrift.openCount} écart(s)`);
			if (effectiveDrift.staleCount > 0) parts.push(`${effectiveDrift.staleCount} stale`);
			return {
				label: `Dérive : ${parts.join(' · ') || 'active'}`,
				cls: 'bg-rose-100 hover:bg-rose-200/80 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200 border-rose-300 dark:border-rose-700',
				title: `Dérive active détectée (${parts.join(', ')}). Cliquer pour ouvrir la vue Dérive.`
			};
		}
		return {
			label: 'Dérive : Non vérifié',
			cls: 'bg-amber-100 hover:bg-amber-200/80 text-amber-950 dark:bg-amber-950/60 dark:text-amber-200 border-amber-400 dark:border-amber-700',
			title:
				effectiveDrift.lastSuccessAgeMs !== null
					? `Réconciliation périmée ou Nautobot injoignable (dernier succès : ${formatRelativeAgeFr(effectiveDrift.lastSuccessAgeMs)}). Cliquer pour ouvrir la vue Dérive.`
					: 'Aucune réconciliation Nautobot effectuée : état non vérifié. Cliquer pour ouvrir la vue Dérive.'
		};
	});

	function openDriftView() {
		deliberationStore.setPosture('consolidation');
		if (typeof document !== 'undefined') {
			setTimeout(() => {
				document
					.getElementById('phase5-drift-view')
					?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}, 60);
		}
	}

	// Est-ce qu'on est actuellement positionné à l'échelle d'un Sujet ?
	const isInSubjectScope = $derived(
		(activePosture === 'deliberation' && viewMode === 'conversation') ||
			activePosture === 'rendu' ||
			activePosture === 'refinement'
	);

	// État calculé de chaque phase + prochaine action unique
	const nav = $derived(
		computePhaseNavigation({
			corpusCount: deliberationStore.corpusDocuments.length,
			subjects: deliberationStore.subjects,
			activeSubject,
			frozenSnapshotIds: Object.keys(deliberationStore.frozenSnapshots),
			isArchived: activeEngagement.status === 'archived'
		})
	);

	function openProjectAppropriation() {
		deliberationStore.setPosture('appropriation');
	}

	function openProjectBoard() {
		deliberationStore.setPosture('deliberation');
		deliberationStore.setDeliberationViewMode('board');
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

	function openProjectConsolidation() {
		deliberationStore.setPosture('consolidation');
	}

	function runNextAction(action: NextAction) {
		if (action.phaseId === 'appropriation') {
			openProjectAppropriation();
		} else if (action.phaseId === 'deliberation') {
			if (action.viewMode === 'board') {
				openProjectBoard();
			} else {
				openSubjectDeliberation();
			}
		} else if (action.phaseId === 'rendu') {
			openSubjectRendu();
		} else if (action.phaseId === 'refinement') {
			openSubjectRefinement();
		} else if (action.phaseId === 'consolidation') {
			openProjectConsolidation();
		}
	}

	function statusDotClass(status: PhaseStatus, isActive: boolean): string {
		if (isActive) {
			if (status === 'ready') return 'text-emerald-200';
			if (status === 'blocked') return 'text-amber-200';
			if (status === 'in_progress') return 'text-sky-200';
			return 'text-primary-foreground/70';
		}
		if (status === 'ready') return 'text-emerald-600 dark:text-emerald-400';
		if (status === 'blocked') return 'text-amber-600 dark:text-amber-400';
		if (status === 'in_progress') return 'text-sky-600 dark:text-sky-400';
		return 'text-muted-foreground/70';
	}

	function stepButtonClass(status: PhaseStatus, isActive: boolean): string {
		if (isActive) {
			return 'bg-primary text-primary-foreground font-bold shadow-xs border border-primary';
		}
		if (status === 'ready') {
			return 'bg-emerald-500/8 hover:bg-emerald-500/15 text-foreground font-medium border border-emerald-500/25';
		}
		if (status === 'blocked') {
			return 'bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground font-medium border border-dashed border-amber-500/35';
		}
		if (status === 'in_progress') {
			return 'bg-sky-500/8 hover:bg-sky-500/15 text-foreground font-medium border border-sky-500/25';
		}
		return 'bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground font-medium border border-transparent';
	}
</script>

{#snippet statusIcon(status: PhaseStatus, isActive: boolean)}
	{#if status === 'ready'}
		<CheckCircle2 class="h-3 w-3 shrink-0 {statusDotClass(status, isActive)}" aria-hidden="true" />
	{:else if status === 'in_progress'}
		<Clock class="h-3 w-3 shrink-0 {statusDotClass(status, isActive)}" aria-hidden="true" />
	{:else if status === 'blocked'}
		<AlertCircle class="h-3 w-3 shrink-0 {statusDotClass(status, isActive)}" aria-hidden="true" />
	{:else}
		<Circle class="h-3 w-3 shrink-0 {statusDotClass(status, isActive)}" aria-hidden="true" />
	{/if}
{/snippet}

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
	<!-- STEPPER À ÉTATS PAR PHASE + PROCHAINE ACTION UNIQUE                       -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<nav
		aria-label="Navigation par phase du projet"
		class="rounded-xl border bg-card p-2 shadow-2xs flex flex-col gap-2"
	>
		<div class="flex flex-col xl:flex-row xl:items-center justify-between gap-2">
			<!-- NIVEAU 1 : ÉCHELLE PROJET (CADRAGE & PILOTAGE GLOBAL) -->
			<div class="flex items-center gap-1.5 flex-wrap">
				<span
					class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1 shrink-0"
					title={`Périmètre Projet : ${activeEngagement.title}`}
				>
					<Layers class="h-3.5 w-3.5 text-primary shrink-0" />
					<span>Projet :</span>
				</span>

				<!-- Phase 1 : Corpus & Règles (Appropriation Documentaire) -->
				<button
					type="button"
					data-testid="phase-tab-appropriation"
					data-phase-status={nav.phases.appropriation.status}
					aria-current={activePosture === 'appropriation' ? 'step' : undefined}
					aria-label={`Phase 1 · Corpus & Règles — ${nav.phases.appropriation.statusLabel} : ${nav.phases.appropriation.reason}`}
					title={`${nav.phases.appropriation.statusLabel} — ${nav.phases.appropriation.reason}`}
					onclick={openProjectAppropriation}
					class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer {stepButtonClass(
						nav.phases.appropriation.status,
						activePosture === 'appropriation'
					)}"
				>
					{@render statusIcon(nav.phases.appropriation.status, activePosture === 'appropriation')}
					<BookOpen class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span>Phase 1 · Corpus</span>
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
					aria-current={activePosture === 'deliberation' && viewMode === 'board' ? 'page' : undefined}
					title="Afficher le tableau de maturité global de tous les sujets du projet"
					onclick={openProjectBoard}
					class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer {activePosture ===
						'deliberation' && viewMode === 'board'
						? 'bg-primary text-primary-foreground font-bold shadow-xs border border-primary'
						: 'bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground font-medium border border-transparent'}"
				>
					<Layers class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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

				<!-- Vue Couverture visuelle des exigences (Issue #402) -->
				<button
					type="button"
					data-testid="project-coverage-tab"
					aria-current={activePosture === 'deliberation' && viewMode === 'coverage' ? 'page' : undefined}
					onclick={() => {
						deliberationStore.setPosture('deliberation');
						deliberationStore.setDeliberationViewMode('coverage');
					}}
					class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer {activePosture ===
						'deliberation' && viewMode === 'coverage'
						? 'bg-primary text-primary-foreground font-bold shadow-xs border border-primary'
						: 'bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground font-medium border border-transparent'}"
					title="Matrice visuelle de complétude de la couverture des exigences"
				>
					<Layers class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span>Couverture</span>
				</button>

				<!-- Outil secondaire : Assistant Exigences (poids visuel réduit) -->
				{#if onOpenQuickAsk}
					<button
						type="button"
						data-testid="quick-ask-trigger"
						onclick={onOpenQuickAsk}
						title="Ouvrir l'Assistant Exigences : chatbot sourcé sur les clauses RFP/CCTP du projet (Alt+/ ou Ctrl+K)"
						class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/10 font-medium border border-border/70 transition-all cursor-pointer"
					>
						<Bot class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
						<span>Assistant Exigences</span>
						<kbd
							class="hidden md:inline-block rounded border border-border bg-muted/60 px-1 py-0.2 font-mono text-[10px] text-muted-foreground"
						>
							Alt+/
						</kbd>
					</button>
				{/if}
			</div>

			<!-- PROCHAINE ACTION UNIQUE (CTA principal) -->
			<div class="flex items-center gap-2 shrink-0">
				<button
					type="button"
					data-testid="next-action-cta"
					onclick={() => runNextAction(nav.nextAction)}
					title={`Prochaine action recommandée — ${nav.nextAction.reason}`}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs transition-all cursor-pointer max-w-full"
				>
					<span class="truncate">Prochaine action : {nav.nextAction.label}</span>
					<ArrowRight class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				</button>
			</div>
		</div>

		<!-- NIVEAU 2 : STEPPER SUJET & CONSOLIDATION (Phase 2 -> Phase 3 -> Phase 4 -> Phase 5) -->
		<div
			class="flex items-center justify-between gap-1.5 flex-wrap pt-1.5 border-t border-border/60"
		>
			<div class="flex items-center gap-1.5 flex-wrap">
				<span
					class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider font-mono flex items-center gap-1 shrink-0 {isInSubjectScope
						? 'text-primary'
						: 'text-muted-foreground'}"
					title="Vues d'instruction focalisées sur le sujet actif"
				>
					<Target class="h-3.5 w-3.5" aria-hidden="true" />
					<span>Sujet {activeSubject ? activeSubject.section_ref : ''} :</span>
				</span>

				<!-- Phase 2 : Délibération & Arbitrage du Sujet -->
				<button
					type="button"
					data-testid="phase-tab-deliberation"
					data-phase-status={nav.phases.deliberation.status}
					aria-current={activePosture === 'deliberation' && viewMode === 'conversation'
						? 'step'
						: undefined}
					aria-label={`Phase 2 · Délibération — ${nav.phases.deliberation.statusLabel} : ${nav.phases.deliberation.reason}`}
					title={`${nav.phases.deliberation.statusLabel} — ${nav.phases.deliberation.reason}`}
					onclick={openSubjectDeliberation}
					class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer {stepButtonClass(
						nav.phases.deliberation.status,
						activePosture === 'deliberation' && viewMode === 'conversation'
					)}"
				>
					{@render statusIcon(
						nav.phases.deliberation.status,
						activePosture === 'deliberation' && viewMode === 'conversation'
					)}
					<MessagesSquare class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span>Phase 2 · Délibération</span>
				</button>

				<span class="text-muted-foreground/40 text-xs select-none hidden sm:inline" aria-hidden="true"
					>→</span
				>

				<!-- Phase 3 : Rendu HLD & Scellement du Sujet -->
				<button
					type="button"
					data-testid="phase-tab-rendu"
					data-phase-status={nav.phases.rendu.status}
					aria-current={activePosture === 'rendu' ? 'step' : undefined}
					aria-label={`Phase 3 · Rendu HLD — ${nav.phases.rendu.statusLabel} : ${nav.phases.rendu.reason}`}
					title={`${nav.phases.rendu.statusLabel} — ${nav.phases.rendu.reason}`}
					onclick={openSubjectRendu}
					class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer {stepButtonClass(
						nav.phases.rendu.status,
						activePosture === 'rendu'
					)}"
				>
					{@render statusIcon(nav.phases.rendu.status, activePosture === 'rendu')}
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

				<span class="text-muted-foreground/40 text-xs select-none hidden sm:inline" aria-hidden="true"
					>→</span
				>

				<!-- Phase 4 : Intention & planification (Issues #393, #405) -->
				<button
					type="button"
					data-testid="phase-tab-refinement"
					data-phase-status={nav.phases.refinement.status}
					aria-current={activePosture === 'refinement' ? 'step' : undefined}
					aria-label={`Phase 4 · Intention & planification — ${nav.phases.refinement.statusLabel} : ${nav.phases.refinement.reason}`}
					title={`${nav.phases.refinement.statusLabel} — ${nav.phases.refinement.reason}`}
					onclick={openSubjectRefinement}
					class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer {stepButtonClass(
						nav.phases.refinement.status,
						activePosture === 'refinement'
					)}"
				>
					{@render statusIcon(nav.phases.refinement.status, activePosture === 'refinement')}
					<Cpu class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span>Phase 4 · Intention & planification</span>
				</button>

				<span class="text-muted-foreground/40 text-xs select-none hidden sm:inline" aria-hidden="true"
					>→</span
				>

				<!-- Phase 5 : Consolidation & dérive (Issues #393, #405) -->
				<button
					type="button"
					data-testid="phase-tab-consolidation"
					data-phase-status={nav.phases.consolidation.status}
					aria-current={activePosture === 'consolidation' ? 'step' : undefined}
					aria-label={`Phase 5 · Consolidation & dérive — ${nav.phases.consolidation.statusLabel} : ${nav.phases.consolidation.reason}`}
					title={`${nav.phases.consolidation.statusLabel} — ${nav.phases.consolidation.reason}`}
					onclick={openProjectConsolidation}
					class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer {stepButtonClass(
						nav.phases.consolidation.status,
						activePosture === 'consolidation'
					)}"
				>
					{@render statusIcon(nav.phases.consolidation.status, activePosture === 'consolidation')}
					<Layers class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span>Phase 5 · Consolidation & dérive</span>
				</button>
			</div>

			<!-- Outils secondaires : Architecture Lockée & Pastille Dérive (#379) -->
			<div class="flex items-center gap-1.5 flex-wrap">
				{#if onOpenLiveLock}
					<button
						type="button"
						data-testid="live-lock-quick-open-btn"
						onclick={onOpenLiveLock}
						title="Inspecter à tout instant l'architecture verrouillée en direct (Cartographie, Matrice des emplacements & architecture.lock)"
						class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] text-muted-foreground hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-500/10 font-medium border border-border/70 transition-all cursor-pointer"
					>
						<Lock class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
						<span>Architecture Lockée</span>
					</button>
				{/if}

				<!-- Pastille « Dérive » : distingue strictement « Non vérifié » d'« Aucune dérive » (#379) -->
				<button
					type="button"
					data-testid="header-drift-pill"
					data-posture={effectiveDrift.posture}
					onclick={openDriftView}
					title={driftPillMeta.title}
					class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer {driftPillMeta.cls}"
				>
					{#if effectiveDrift.posture === 'no_drift'}
						<ShieldCheck class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					{:else if effectiveDrift.posture === 'drift_detected'}
						<AlertTriangle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					{:else}
						<HelpCircle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					{/if}
					<span>{driftPillMeta.label}</span>
				</button>
			</div>
		</div>
	</nav>
</div>
