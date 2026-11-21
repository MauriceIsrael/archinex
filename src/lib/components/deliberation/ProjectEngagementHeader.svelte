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
		Bot,
		Lock,
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
		<div class="flex items-center gap-1.5 flex-wrap xl:flex-1">
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
		</div>

		<!-- CENTRE : CHATBOT ASSISTANT EXIGENCES (PÉRIMÈTRE CLAUSES RFP / CCTP) -->
		{#if onOpenQuickAsk}
			<div class="flex items-center justify-center shrink-0 xl:px-2 xl:border-x xl:border-border">
				<button
					type="button"
					data-testid="quick-ask-trigger"
					onclick={onOpenQuickAsk}
					title="Ouvrir l'Assistant Exigences : chatbot sourcé sur les clauses RFP/CCTP du projet (Alt+/ ou Ctrl+K)"
					class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-primary/10 hover:bg-primary/20 text-primary font-semibold border border-primary/30 shadow-2xs transition-all cursor-pointer"
				>
					<Bot class="h-3.5 w-3.5 shrink-0" />
					<span>Assistant Exigences</span>
					<kbd class="hidden sm:inline-block rounded border border-primary/25 bg-background/80 px-1 py-0.2 font-mono text-[10px] text-primary/80">
						Alt+/
					</kbd>
				</button>
			</div>
		{:else}
			<div class="hidden xl:block h-6 w-px bg-border"></div>
		{/if}

		<!-- NIVEAU 2 : ÉCHELLE SUJET (INGÉNIERIE D'UNE SECTION : DÉLIBÉRATION -> RENDU -> RAFFINEMENT) -->
		<div class="flex items-center justify-between xl:justify-end gap-1.5 flex-wrap xl:flex-1">
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

					<span class="text-muted-foreground/40 text-xs select-none hidden sm:inline">→</span>

					<!-- Phase 5 : Consolidation Projet (transversale multi-sujets) -->
					<button
						type="button"
						data-testid="phase-tab-consolidation"
						onclick={openProjectConsolidation}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer {activePosture ===
						'consolidation'
							? 'bg-indigo-600 text-white font-bold shadow-xs'
							: 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-medium border border-indigo-500/20'}"
					>
						<Layers class="h-3.5 w-3.5 shrink-0" />
						<span>Phase 5 · Consolidation</span>
					</button>

					{#if onOpenLiveLock}
						<button
							type="button"
							data-testid="live-lock-quick-open-btn"
							onclick={onOpenLiveLock}
							title="Inspecter à tout instant l'architecture verrouillée en direct (Cartographie, Matrice des emplacements & architecture.lock)"
							class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 font-semibold border border-emerald-500/30 transition-all cursor-pointer"
						>
							<Lock class="h-3.5 w-3.5 shrink-0" />
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
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer {driftPillMeta.cls}"
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
	</div>
</div>
