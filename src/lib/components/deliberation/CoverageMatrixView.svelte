<script lang="ts">
	import {
		CheckCircle2,
		Circle,
		XCircle,
		Ban,
		Download,
		Filter,
		AlertTriangle,
		RefreshCw,
		Layers,
		Clock
	} from 'lucide-svelte';
	import {
		COVERAGE_STAGE_LABEL,
		COVERAGE_STAGES,
		type CoverageReport,
		type CoverageStage,
		type RequirementCoverageItem
	} from '$lib/domain/coverageModel';
	import { renderCoverageMatrixCsv, renderCoverageMatrixSvg } from '$lib/domain/coverageExport';

	let {
		projectId = '',
		report: initialReport = null,
		onNavigateSubject = (_subjectId: string) => {},
		onNavigateDecision = (_subjectId: string, _decisionId: string) => {},
		onNavigateClause = (_clauseRef: string) => {},
		onNavigateNautobot = (_url: string) => {}
	}: {
		projectId?: string;
		report?: CoverageReport | null;
		onNavigateSubject?: (subjectId: string) => void;
		onNavigateDecision?: (subjectId: string, decisionId: string) => void;
		onNavigateClause?: (clauseRef: string) => void;
		onNavigateNautobot?: (url: string) => void;
	} = $props();

	let loadedReport = $state<CoverageReport | null>(null);
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);

	// Filtres et regroupement
	let filterCriticality = $state<string>('all');
	let filterDomain = $state<string>('all');
	let filterStage = $state<string>('all');
	let filterOwner = $state<string>('all');
	let searchQuery = $state('');
	let groupBy = $state<'none' | 'section' | 'domain' | 'criticality'>('none');

	// Virtualisation / fenêtrage pour 1 000+ exigences sans blocage
	const WINDOW_SIZE = 60;
	let visiblePage = $state(0);

	const activeReport = $derived<CoverageReport | null>(initialReport ?? loadedReport);

	async function fetchCoverage(pid: string) {
		if (!pid || initialReport) return;
		isLoading = true;
		loadError = null;
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(pid)}/coverage`);
			if (!res.ok) {
				loadError = `Impossible de charger la couverture (HTTP ${res.status}).`;
				return;
			}
			const data = await res.json();
			if (data?.status === 'ok' && data.report) {
				loadedReport = data.report;
			}
		} catch (err: any) {
			loadError = err?.message || 'Erreur réseau lors du chargement de la couverture.';
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		if (projectId && !initialReport) {
			void fetchCoverage(projectId);
		}
	});

	const availableDomains = $derived(
		Array.from(new Set((activeReport?.items ?? []).map((i) => i.domain))).sort()
	);
	const availableOwners = $derived(
		Array.from(new Set((activeReport?.items ?? []).map((i) => i.owner))).sort()
	);

	const filteredItems = $derived.by(() => {
		const items = activeReport?.items ?? [];
		const q = searchQuery.trim().toLowerCase();
		return items.filter((item) => {
			if (filterCriticality !== 'all' && item.criticality !== filterCriticality) return false;
			if (filterDomain !== 'all' && item.domain !== filterDomain) return false;
			if (filterStage !== 'all' && item.stage !== filterStage) return false;
			if (filterOwner !== 'all' && item.owner !== filterOwner) return false;
			if (
				q &&
				!item.clauseRef.toLowerCase().includes(q) &&
				!item.title.toLowerCase().includes(q) &&
				!item.domain.toLowerCase().includes(q)
			) {
				return false;
			}
			return true;
		});
	});

	const totalPages = $derived(Math.max(1, Math.ceil(filteredItems.length / WINDOW_SIZE)));
	const clampedPage = $derived(Math.min(visiblePage, totalPages - 1));
	const pagedItems = $derived(
		filteredItems.slice(clampedPage * WINDOW_SIZE, (clampedPage + 1) * WINDOW_SIZE)
	);

	const groupedVisibleItems = $derived.by(() => {
		if (groupBy === 'none') {
			return [{ key: 'all', label: `Exigences (${filteredItems.length})`, items: pagedItems }];
		}
		const map = new Map<string, RequirementCoverageItem[]>();
		for (const item of pagedItems) {
			const k =
				groupBy === 'section'
					? item.section
					: groupBy === 'domain'
						? item.domain
						: item.criticality;
			const list = map.get(k) ?? [];
			list.push(item);
			map.set(k, list);
		}
		return Array.from(map.entries()).map(([key, items]) => ({
			key,
			label: `${key} (${items.length})`,
			items
		}));
	});

	const STEP_COLS: Array<{
		key: keyof RequirementCoverageItem['steps'];
		label: string;
	}> = [
		{ key: 'qualified', label: 'Qualifiée' },
		{ key: 'attached', label: 'Rattachée' },
		{ key: 'decided', label: 'Décidée' },
		{ key: 'planned', label: 'Planifiée' },
		{ key: 'realized_proven', label: 'Réalisée prouvée' }
	];

	function stepText(state: 'reached' | 'evacuated' | 'blocked' | 'missing'): string {
		if (state === 'reached') return 'Atteinte';
		if (state === 'evacuated') return 'Évacuée';
		if (state === 'blocked') return 'Bloquée';
		return 'En attente';
	}

	function stepClasses(state: 'reached' | 'evacuated' | 'blocked' | 'missing'): string {
		if (state === 'reached')
			return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/40';
		if (state === 'evacuated')
			return 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-400/40';
		if (state === 'blocked')
			return 'bg-rose-500/15 text-rose-800 dark:text-rose-200 border-rose-500/50';
		return 'bg-muted/50 text-muted-foreground border-border';
	}

	function handleCellClick(item: RequirementCoverageItem, step: keyof RequirementCoverageItem['steps']) {
		if (step === 'attached' && item.subjectIds[0]) {
			onNavigateSubject(item.subjectIds[0]);
		} else if (step === 'decided' && item.subjectIds[0] && item.decisionIds[0]) {
			onNavigateDecision(item.subjectIds[0], item.decisionIds[0]);
		} else if ((step === 'planned' || step === 'realized_proven') && item.plannedObjects[0]?.url) {
			onNavigateNautobot(item.plannedObjects[0].url);
		} else if (item.kbClauseRefs[0]) {
			onNavigateClause(item.kbClauseRefs[0]);
		} else if (item.subjectIds[0]) {
			onNavigateSubject(item.subjectIds[0]);
		}
	}

	function downloadBlob(content: string | Blob, filename: string, mimeType: string) {
		if (typeof document === 'undefined') return;
		const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function exportCsv() {
		if (!activeReport) return;
		const csv = renderCoverageMatrixCsv(activeReport);
		downloadBlob(csv, `couverture-exigences-${projectId || 'dossier'}.csv`, 'text/csv;charset=utf-8');
	}

	function exportSvg() {
		if (!activeReport) return;
		const svg = renderCoverageMatrixSvg(activeReport);
		downloadBlob(svg, `couverture-exigences-${projectId || 'dossier'}.svg`, 'image/svg+xml;charset=utf-8');
	}

	function exportPng() {
		if (!activeReport || typeof document === 'undefined') return;
		const svgStr = renderCoverageMatrixSvg(activeReport);
		const img = new Image();
		const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
		const url = URL.createObjectURL(svgBlob);
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = img.width || 980;
			canvas.height = img.height || 400;
			const ctx = canvas.getContext('2d');
			if (ctx) {
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(img, 0, 0);
				canvas.toBlob((pngBlob) => {
					if (pngBlob) {
						downloadBlob(pngBlob, `couverture-exigences-${projectId || 'dossier'}.png`, 'image/png');
					}
				}, 'image/png');
			}
			URL.revokeObjectURL(url);
		};
		img.src = url;
	}
</script>

<section
	class="space-y-4 rounded-xl border bg-card p-4 shadow-xs"
	aria-labelledby="coverage-view-heading"
	data-testid="coverage-matrix-view"
>
	<!-- En-tête & Exports -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
		<div>
			<h2 id="coverage-view-heading" class="text-base font-bold text-foreground flex items-center gap-2">
				<Layers class="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
				<span>Couverture des exigences (de l'exigence à la réalisation prouvée)</span>
			</h2>
			{#if activeReport}
				<p class="text-xs text-muted-foreground mt-0.5" data-testid="coverage-headline">
					<strong class="text-foreground">{activeReport.indicators.headline}</strong>
					· {activeReport.indicators.overallDecided.label}
					· {activeReport.indicators.overallPlanned.label}
					· {activeReport.indicators.overallRealizedProven.label}
				</p>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<span
				class="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
				data-testid="coverage-reconciliation-age"
			>
				<Clock class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				{#if activeReport?.lastReconciliationAt}
					Réconciliation Nautobot : {activeReport.lastReconciliationAt.slice(0, 16).replace('T', ' ')}
				{:else}
					Réconciliation Nautobot : Non vérifiée
				{/if}
			</span>

			<button
				type="button"
				onclick={exportSvg}
				disabled={!activeReport}
				class="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-muted cursor-pointer disabled:opacity-50"
				data-testid="coverage-export-svg-btn"
			>
				<Download class="h-3.5 w-3.5" aria-hidden="true" />
				<span>SVG</span>
			</button>
			<button
				type="button"
				onclick={exportPng}
				disabled={!activeReport}
				class="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-muted cursor-pointer disabled:opacity-50"
				data-testid="coverage-export-png-btn"
			>
				<Download class="h-3.5 w-3.5" aria-hidden="true" />
				<span>PNG</span>
			</button>
			<button
				type="button"
				onclick={exportCsv}
				disabled={!activeReport}
				class="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-muted cursor-pointer disabled:opacity-50"
				data-testid="coverage-export-csv-btn"
			>
				<Download class="h-3.5 w-3.5" aria-hidden="true" />
				<span>CSV</span>
			</button>
			{#if !initialReport && projectId}
				<button
					type="button"
					onclick={() => fetchCoverage(projectId)}
					disabled={isLoading}
					class="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-muted cursor-pointer"
					aria-label="Actualiser la couverture"
				>
					<RefreshCw class="h-3.5 w-3.5 {isLoading ? 'animate-spin' : ''}" aria-hidden="true" />
					<span>Actualiser</span>
				</button>
			{/if}
		</div>
	</div>

	{#if loadError}
		<div class="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-800 dark:text-rose-200" role="alert">
			{loadError}
		</div>
	{:else if isLoading && !activeReport}
		<div class="py-8 text-center text-xs text-muted-foreground">Calcul de la couverture en cours…</div>
	{:else if activeReport}
		<!-- 1. Synthèse : Barres de progression par criticité + Trous prioritaires -->
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
			<div class="lg:col-span-7 space-y-2.5 rounded-lg border bg-muted/20 p-3" data-testid="coverage-criticality-bars">
				<h3 class="text-xs font-bold uppercase tracking-wide text-muted-foreground">
					Progression par criticité (dénominateur explicite)
				</h3>
				{#each activeReport.indicators.byCriticality as row (row.key)}
					{@const pct = row.activeTotal > 0 ? Math.round((row.decided / row.activeTotal) * 100) : 100}
					<div class="space-y-1">
						<div class="flex items-center justify-between text-xs">
							<span class="font-semibold text-foreground">{row.label}</span>
							<span class="font-mono text-muted-foreground">
								{row.decided} / {row.activeTotal} décidées
								{#if row.evacuated > 0}
									· {row.evacuated} évacuée(s)
								{/if}
								{#if row.gapsCount > 0}
									· <strong class="text-rose-700 dark:text-rose-300">{row.gapsCount} trou(s)</strong>
								{/if}
							</span>
						</div>
						<div
							class="h-2.5 w-full rounded-full bg-muted overflow-hidden border"
							role="progressbar"
							aria-label={`Progression ${row.label}`}
							aria-valuenow={row.decided}
							aria-valuemin={0}
							aria-valuemax={row.activeTotal}
						>
							<div
								class="h-full transition-all {row.key === 'bloquant' && row.gapsCount > 0 ? 'bg-amber-600' : 'bg-emerald-600'}"
								style="width: {pct}%"
							></div>
						</div>
					</div>
				{/each}
			</div>

			<div class="lg:col-span-5 space-y-2 rounded-lg border bg-muted/20 p-3" data-testid="coverage-priority-gaps">
				<h3 class="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
					<AlertTriangle class="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
					<span>Trous prioritaires ({activeReport.gaps.length} dont {activeReport.blockingGaps.length} bloquant(s))</span>
				</h3>
				{#if activeReport.gaps.length === 0}
					<p class="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
						<CheckCircle2 class="h-4 w-4 shrink-0" aria-hidden="true" />
						<span>Aucun trou sous le seuil « {COVERAGE_STAGE_LABEL[activeReport.threshold]} ».</span>
					</p>
				{:else}
					<ul class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
						{#each activeReport.gaps.slice(0, 8) as gap (gap.requirementId)}
							<li class="rounded-md border bg-background px-2.5 py-1.5 text-xs flex items-start justify-between gap-2">
								<div class="min-w-0">
									<span class="font-mono font-semibold text-foreground">{gap.clauseRef}</span>
									<span class="ml-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border {gap.blocking ? 'bg-rose-500/15 text-rose-800 dark:text-rose-200 border-rose-500/40' : 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/40'}">
										{gap.blocking ? '✕ Bloquant' : '○ À couvrir'}
									</span>
									<p class="text-[11px] text-muted-foreground truncate mt-0.5">{gap.message}</p>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		<!-- 2. Barre de filtres et regroupement -->
		<div class="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-3 text-xs" role="region" aria-label="Filtres de la matrice">
			<div class="flex items-center gap-1 text-muted-foreground font-semibold mr-1">
				<Filter class="h-3.5 w-3.5" aria-hidden="true" />
				<span>Filtres :</span>
			</div>

			<label class="flex flex-col gap-1">
				<span class="text-[10px] uppercase text-muted-foreground">Recherche</span>
				<input
					type="search"
					bind:value={searchQuery}
					oninput={() => (visiblePage = 0)}
					placeholder="Clause ou titre…"
					class="rounded border bg-background px-2 py-1 text-xs w-40"
				/>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-[10px] uppercase text-muted-foreground">Criticité</span>
				<select bind:value={filterCriticality} onchange={() => (visiblePage = 0)} class="rounded border bg-background px-2 py-1 text-xs">
					<option value="all">Toutes</option>
					<option value="bloquant">Bloquante</option>
					<option value="majeur">Majeure</option>
					<option value="info">Information</option>
				</select>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-[10px] uppercase text-muted-foreground">Domaine</span>
				<select bind:value={filterDomain} onchange={() => (visiblePage = 0)} class="rounded border bg-background px-2 py-1 text-xs">
					<option value="all">Tous</option>
					{#each availableDomains as dom}
						<option value={dom}>{dom}</option>
					{/each}
				</select>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-[10px] uppercase text-muted-foreground">État</span>
				<select bind:value={filterStage} onchange={() => (visiblePage = 0)} class="rounded border bg-background px-2 py-1 text-xs">
					<option value="all">Tous</option>
					{#each COVERAGE_STAGES as st}
						<option value={st}>{COVERAGE_STAGE_LABEL[st]}</option>
					{/each}
				</select>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-[10px] uppercase text-muted-foreground">Responsable</span>
				<select bind:value={filterOwner} onchange={() => (visiblePage = 0)} class="rounded border bg-background px-2 py-1 text-xs">
					<option value="all">Tous</option>
					{#each availableOwners as own}
						<option value={own}>{own}</option>
					{/each}
				</select>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-[10px] uppercase text-muted-foreground">Regrouper par</span>
				<select bind:value={groupBy} class="rounded border bg-background px-2 py-1 text-xs">
					<option value="none">Aucun</option>
					<option value="section">Section</option>
					<option value="domain">Domaine</option>
					<option value="criticality">Criticité</option>
				</select>
			</label>
		</div>

		<!-- 3A. Vue Desktop (>= md) : Matrice Exigences × Étapes -->
		<div class="hidden md:block overflow-x-auto rounded-lg border" data-testid="coverage-desktop-matrix">
			<table class="w-full text-left text-xs border-collapse">
				<thead class="bg-muted/60 text-[11px] uppercase text-muted-foreground border-b">
					<tr>
						<th scope="col" class="px-3 py-2 font-semibold">Exigence</th>
						<th scope="col" class="px-2 py-2 font-semibold">Criticité</th>
						{#each STEP_COLS as col (col.key)}
							<th scope="col" class="px-2 py-2 font-semibold text-center">{col.label}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each groupedVisibleItems as group (group.key)}
						{#if groupBy !== 'none'}
							<tr class="bg-muted/30 border-b">
								<th colspan={7} scope="colgroup" class="px-3 py-1.5 text-[11px] font-bold text-foreground">
									{group.label}
								</th>
							</tr>
						{/if}
						{#each group.items as item (item.id)}
							<tr class="border-b last:border-b-0 hover:bg-muted/20">
								<th scope="row" class="px-3 py-2 font-normal max-w-xs">
									<div class="font-mono font-semibold text-foreground">{item.clauseRef}</div>
									<div class="text-[11px] text-muted-foreground truncate" title={item.title}>{item.title}</div>
								</th>
								<td class="px-2 py-2">
									<span class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold">
										{item.criticality}
									</span>
								</td>
								{#each STEP_COLS as col (col.key)}
									{@const st = item.steps[col.key]}
									<td class="px-2 py-2 text-center">
										<button
											type="button"
											onclick={() => handleCellClick(item, col.key)}
											class="inline-flex items-center justify-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary {stepClasses(st)}"
											aria-label={`${item.clauseRef} — ${col.label} : ${stepText(st)}`}
										>
											{#if st === 'reached'}
												<CheckCircle2 class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
											{:else if st === 'evacuated'}
												<Ban class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
											{:else if st === 'blocked'}
												<XCircle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
											{:else}
												<Circle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
											{/if}
											<span>{stepText(st)}</span>
										</button>
									</td>
								{/each}
							</tr>
						{/each}
					{/each}
				</tbody>
			</table>
		</div>

		<!-- 3B. Vue Mobile (390 px, < md) : Liste de cartes empilées sans débordement horizontal -->
		<div class="md:hidden space-y-2.5" data-testid="coverage-mobile-list">
			{#each pagedItems as item (item.id)}
				<article class="rounded-lg border bg-background p-3 space-y-2">
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<div class="font-mono text-xs font-bold text-foreground">{item.clauseRef}</div>
							<div class="text-xs text-muted-foreground">{item.title}</div>
						</div>
						<span class="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold">
							{item.criticality}
						</span>
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each STEP_COLS as col (col.key)}
							{@const st = item.steps[col.key]}
							<button
								type="button"
								onclick={() => handleCellClick(item, col.key)}
								class="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold cursor-pointer {stepClasses(st)}"
								aria-label={`${item.clauseRef} — ${col.label} : ${stepText(st)}`}
							>
								<span>{col.label} : {stepText(st)}</span>
							</button>
						{/each}
					</div>
				</article>
			{/each}
		</div>

		<!-- 4. Pagination / Fenêtrage (1 000+ exigences sans blocage) -->
		{#if totalPages > 1}
			<div class="flex items-center justify-between pt-2 text-xs text-muted-foreground" data-testid="coverage-pagination">
				<span>
					Affichage {clampedPage * WINDOW_SIZE + 1}–{Math.min((clampedPage + 1) * WINDOW_SIZE, filteredItems.length)} sur {filteredItems.length} exigences
				</span>
				<div class="flex items-center gap-2">
					<button
						type="button"
						disabled={clampedPage === 0}
						onclick={() => (visiblePage = Math.max(0, clampedPage - 1))}
						class="rounded border px-2.5 py-1 font-semibold hover:bg-muted disabled:opacity-40 cursor-pointer"
					>
						Précédent
					</button>
					<span class="font-mono">{clampedPage + 1} / {totalPages}</span>
					<button
						type="button"
						disabled={clampedPage >= totalPages - 1}
						onclick={() => (visiblePage = Math.min(totalPages - 1, clampedPage + 1))}
						class="rounded border px-2.5 py-1 font-semibold hover:bg-muted disabled:opacity-40 cursor-pointer"
					>
						Suivant
					</button>
				</div>
			</div>
		{/if}
	{/if}
</section>
