<script lang="ts">
	import {
		DEFAULT_EDITORIAL_DIALS,
		SIZE_PRESETS,
		verifyArchitectureDeltaSvg,
		verifyEditorialSvg,
		verifyRequirementTraceabilitySvg,
		wrapStandaloneHtml,
		type DiagramAudienceDial,
		type DiagramDetailDial,
		type DiagramSizeDial,
		type EditorialDiagramResult,
		type EditorialDiagramTypeId,
		type EditorialDials,
		type EditorialSkin,
		type EditorialViewRecommendation
	} from '$lib/domain/editorialSvg';
	import {
		CheckCircle2,
		AlertTriangle,
		Download,
		FileCode,
		FileJson,
		Globe,
		Info,
		Loader2,
		Maximize2,
		Sparkles,
		X,
		ZoomIn,
		ZoomOut
	} from 'lucide-svelte';

	export interface ProvenanceSelection {
		blockId?: string;
		blockName?: string;
		statementId?: string;
		clauseRef?: string;
		axisId?: string;
		constraint?: string;
		assumption?: string;
		impl?: string;
	}

	let {
		diagram,
		recommendations = [],
		dials = $bindable<EditorialDials>({ ...DEFAULT_EDITORIAL_DIALS }),
		onSelectView,
		onSelectProvenance,
		onAskLlmAdvice,
		isAskingLlm = false
	} = $props<{
		diagram: EditorialDiagramResult;
		recommendations?: EditorialViewRecommendation[];
		dials?: EditorialDials;
		onSelectView?: (viewId: EditorialDiagramTypeId) => void;
		onSelectProvenance?: (selection: ProvenanceSelection) => void;
		onAskLlmAdvice?: () => void;
		isAskingLlm?: boolean;
	}>();

	let zoom = $state(1);
	let isFullScreen = $state(false);
	let showLedger = $state(false);
	let selectedProvenance = $state<ProvenanceSelection | null>(null);

	const verification = $derived.by(() => {
		if (diagram.diagramType === 'architecture-delta') return verifyArchitectureDeltaSvg(diagram.svg);
		if (diagram.diagramType === 'requirement-traceability') return verifyRequirementTraceabilitySvg(diagram.svg);
		return verifyEditorialSvg(diagram.svg);
	});

	function handleSvgClick(event: MouseEvent) {
		const target = event.target as HTMLElement | null;
		const nodeEl = target?.closest?.('.editorial-clickable') as SVGElement | null;
		if (!nodeEl) return;

		const selection: ProvenanceSelection = {
			blockId: nodeEl.getAttribute('data-block-id') ?? undefined,
			blockName: nodeEl.getAttribute('data-block-name') ?? undefined,
			statementId: nodeEl.getAttribute('data-statement-id') ?? undefined,
			clauseRef: nodeEl.getAttribute('data-clause-ref') ?? undefined,
			axisId: nodeEl.getAttribute('data-axis-id') ?? undefined,
			constraint: nodeEl.getAttribute('data-block-constraint') ?? undefined,
			assumption: nodeEl.getAttribute('data-block-assumption') ?? undefined,
			impl: nodeEl.getAttribute('data-block-impl') ?? undefined
		};
		selectedProvenance = selection;
		onSelectProvenance?.(selection);
	}

	function triggerDownload(content: string, filename: string, mimeType: string) {
		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function exportSvg() {
		triggerDownload(diagram.svg, `${diagram.slug}.svg`, 'image/svg+xml;charset=utf-8');
	}

	function exportHtml() {
		const html = wrapStandaloneHtml(diagram.title, diagram.svg, dials.skin);
		triggerDownload(html, `${diagram.slug}.html`, 'text/html;charset=utf-8');
	}

	function exportRegistry() {
		if (!diagram.registryJson) return;
		triggerDownload(diagram.registryJson, `${diagram.slug}.registry.json`, 'application/json;charset=utf-8');
	}

	function setSkin(skin: EditorialSkin) {
		dials = { ...dials, skin };
	}
	function setSize(size: DiagramSizeDial) {
		dials = { ...dials, size };
	}
	function setDetail(detail: DiagramDetailDial) {
		dials = { ...dials, detail };
	}
	function setAudience(audience: DiagramAudienceDial) {
		dials = { ...dials, audience };
	}
</script>

<div class="rounded-xl border bg-card shadow-xs overflow-hidden flex flex-col" data-testid="editorial-diagram-viewer">
	<!-- Barre des Recommandations du Directeur Éditorial -->
	{#if recommendations.length > 0}
		<div class="px-3 py-2 border-b bg-muted/20 flex flex-wrap items-center justify-between gap-2 text-xs">
			<div class="flex items-center gap-1.5 text-muted-foreground">
				<Sparkles class="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
				<span class="font-semibold text-foreground">Directeur éditorial :</span>
				<span class="truncate max-w-xl">{recommendations[0].rationale}</span>
			</div>
			<div class="flex items-center gap-1 flex-wrap">
				{#each recommendations.filter((r: EditorialViewRecommendation) => r.implementedInPilot).slice(0, 4) as rec}
					<button
						type="button"
						onclick={() => onSelectView?.(rec.viewId)}
						class="px-2 py-0.5 rounded border text-[11px] font-medium transition-colors cursor-pointer {diagram.diagramType === rec.viewId
							? 'bg-primary text-primary-foreground border-primary'
							: 'bg-background text-muted-foreground hover:text-foreground'}"
						title={rec.rationale}
					>
						{rec.label} ({rec.score}%)
					</button>
				{/each}
				{#if onAskLlmAdvice}
					<button
						type="button"
						onclick={onAskLlmAdvice}
						disabled={isAskingLlm}
						class="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-[11px] font-medium hover:bg-amber-500/20 disabled:opacity-50 cursor-pointer"
						data-testid="editorial-ask-llm-btn"
					>
						{#if isAskingLlm}
							<Loader2 class="h-3 w-3 animate-spin" />
							<span>Analyse…</span>
						{:else}
							<Sparkles class="h-3 w-3" />
							<span>Affiner par IA</span>
						{/if}
					</button>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Barre des 4 Cadrans (Dials) & Actions d'export -->
	<div class="px-3 py-2 border-b bg-muted/30 flex flex-wrap items-center justify-between gap-2 text-xs">
		<div class="flex flex-wrap items-center gap-2">
			<label class="inline-flex items-center gap-1 text-muted-foreground">
				<span>Thème</span>
				<select
					value={dials.skin}
					onchange={(e) => setSkin((e.currentTarget as HTMLSelectElement).value as EditorialSkin)}
					class="rounded border bg-background px-1.5 py-0.5 text-xs text-foreground"
					data-testid="editorial-dial-skin"
				>
					<option value="light">Clair</option>
					<option value="dark">Sombre</option>
					<option value="full-editorial">Éditorial</option>
				</select>
			</label>

			<label class="inline-flex items-center gap-1 text-muted-foreground">
				<span>Détail</span>
				<select
					value={dials.detail}
					onchange={(e) => setDetail((e.currentTarget as HTMLSelectElement).value as DiagramDetailDial)}
					class="rounded border bg-background px-1.5 py-0.5 text-xs text-foreground"
					data-testid="editorial-dial-detail"
				>
					<option value="simplified">Simplifié (≤7)</option>
					<option value="balanced">Équilibré (≤12)</option>
					<option value="faithful">Fidèle (≤24)</option>
				</select>
			</label>

			<label class="inline-flex items-center gap-1 text-muted-foreground">
				<span>Audience</span>
				<select
					value={dials.audience}
					onchange={(e) => setAudience((e.currentTarget as HTMLSelectElement).value as DiagramAudienceDial)}
					class="rounded border bg-background px-1.5 py-0.5 text-xs text-foreground"
					data-testid="editorial-dial-audience"
				>
					<option value="engineer">Ingénieur</option>
					<option value="mixed">Mixte</option>
					<option value="executive">Décideur</option>
				</select>
			</label>

			<label class="inline-flex items-center gap-1 text-muted-foreground">
				<span>Format</span>
				<select
					value={dials.size}
					onchange={(e) => setSize((e.currentTarget as HTMLSelectElement).value as DiagramSizeDial)}
					class="rounded border bg-background px-1.5 py-0.5 text-xs text-foreground"
					data-testid="editorial-dial-size"
				>
					{#each Object.values(SIZE_PRESETS) as preset}
						<option value={preset.id}>{preset.label}</option>
					{/each}
				</select>
			</label>

			{#if verification.ok}
				<span
					class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold"
					title="Grille 4px, contraste WCAG AA, accessibilité SVG et connecteurs orthogonaux vérifiés"
				>
					<CheckCircle2 class="h-3 w-3" />
					<span>4px · AA · OK</span>
				</span>
			{:else}
				<span
					class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold"
					title={verification.issues.map((i) => i.message).join(' | ')}
				>
					<AlertTriangle class="h-3 w-3" />
					<span>{verification.issues.length} alerte(s)</span>
				</span>
			{/if}
		</div>

		<div class="flex items-center gap-1.5 flex-wrap">
			<div class="flex items-center gap-0.5 border rounded bg-background px-1 py-0.5">
				<button
					type="button"
					onclick={() => (zoom = Math.max(0.6, Number((zoom - 0.15).toFixed(2))))}
					class="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
					title="Dézoomer"
				>
					<ZoomOut class="h-3 w-3" />
				</button>
				<button
					type="button"
					onclick={() => (zoom = 1)}
					class="px-1 text-[10px] font-mono text-muted-foreground hover:text-foreground cursor-pointer"
				>
					{Math.round(zoom * 100)}%
				</button>
				<button
					type="button"
					onclick={() => (zoom = Math.min(2.2, Number((zoom + 0.15).toFixed(2))))}
					class="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
					title="Zoomer"
				>
					<ZoomIn class="h-3 w-3" />
				</button>
				<button
					type="button"
					onclick={() => (isFullScreen = true)}
					class="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
					title="Plein écran"
				>
					<Maximize2 class="h-3 w-3" />
				</button>
			</div>

			<button
				type="button"
				onclick={() => (showLedger = !showLedger)}
				class="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted cursor-pointer"
				data-testid="editorial-toggle-ledger"
			>
				<Info class="h-3 w-3" />
				<span>Registre ({diagram.ledger.drawnNodeCount}/{diagram.ledger.sourceNodeCount})</span>
			</button>

			<button
				type="button"
				onclick={exportSvg}
				class="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted cursor-pointer"
				data-testid="editorial-export-svg"
			>
				<FileCode class="h-3 w-3" />
				<span>.svg</span>
			</button>

			<button
				type="button"
				onclick={exportHtml}
				class="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted cursor-pointer"
				data-testid="editorial-export-html"
			>
				<Globe class="h-3 w-3" />
				<span>.html</span>
			</button>

			{#if diagram.registryJson}
				<button
					type="button"
					onclick={exportRegistry}
					class="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted cursor-pointer"
					data-testid="editorial-export-registry"
				>
					<FileJson class="h-3 w-3" />
					<span>.registry.json</span>
				</button>
			{/if}
		</div>
	</div>

	<!-- Fidelity Ledger dépliable -->
	{#if showLedger}
		<div class="px-3 py-2 border-b bg-muted/15 text-[11px] space-y-1" data-testid="editorial-fidelity-ledger">
			<div class="font-semibold text-foreground">
				Fidelity Ledger — mode <span class="font-mono">{diagram.ledger.detail}</span>
			</div>
			<ul class="list-disc pl-4 text-muted-foreground space-y-0.5">
				{#each diagram.ledger.entries as entry}
					<li><span class="font-mono uppercase text-[10px]">{entry.action}</span> : {entry.summary}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Zone de rendu SVG éditorial (cliquable pour provenance) -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="overflow-auto p-3 bg-background min-h-[320px] flex justify-center"
		onclick={handleSvgClick}
	>
		<div
			class="transition-transform origin-top"
			style="transform: scale({zoom}); width: 100%; max-width: {diagram.width}px;"
		>
			{@html diagram.svg}
		</div>
	</div>

	<!-- Bandeau de provenance au clic sur un élément SVG -->
	{#if selectedProvenance}
		<div class="px-3 py-2 border-t bg-muted/25 flex flex-wrap items-center justify-between gap-2 text-xs" data-testid="editorial-provenance-bar">
			<div class="flex flex-wrap items-center gap-2">
				<span class="font-semibold text-foreground">Provenance :</span>
				{#if selectedProvenance.blockId}
					<span class="rounded bg-primary/10 text-primary px-1.5 py-0.5 font-mono text-[11px]">{selectedProvenance.blockId}</span>
				{/if}
				{#if selectedProvenance.blockName}
					<span class="font-medium text-foreground">{selectedProvenance.blockName}</span>
				{/if}
				{#if selectedProvenance.clauseRef}
					<span class="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Clause {selectedProvenance.clauseRef}</span>
				{/if}
				{#if selectedProvenance.statementId}
					<span class="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Énoncé {selectedProvenance.statementId}</span>
				{/if}
				{#if selectedProvenance.constraint}
					<span class="text-muted-foreground">· {selectedProvenance.constraint}</span>
				{/if}
				{#if selectedProvenance.assumption}
					<span class="text-amber-700 dark:text-amber-300">· {selectedProvenance.assumption}</span>
				{/if}
			</div>
			<button
				type="button"
				onclick={() => (selectedProvenance = null)}
				class="p-1 rounded hover:bg-muted text-muted-foreground cursor-pointer"
				aria-label="Fermer la provenance"
			>
				<X class="h-3.5 w-3.5" />
			</button>
		</div>
	{/if}
</div>

{#if isFullScreen}
	<div class="fixed inset-0 z-50 bg-background/95 backdrop-blur-xs flex flex-col p-4">
		<div class="flex items-center justify-between pb-3 border-b">
			<span class="text-sm font-bold text-foreground">{diagram.title}</span>
			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={exportSvg}
					class="inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium hover:bg-muted cursor-pointer"
				>
					<Download class="h-3.5 w-3.5" />
					<span>Exporter SVG</span>
				</button>
				<button
					type="button"
					onclick={() => (isFullScreen = false)}
					class="inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium hover:bg-muted cursor-pointer"
				>
					<X class="h-3.5 w-3.5" />
					<span>Fermer</span>
				</button>
			</div>
		</div>
		<div class="flex-1 overflow-auto p-4 flex justify-center items-start">
			<div style="width: 100%; max-width: 1400px;">
				{@html diagram.svg}
			</div>
		</div>
	</div>
{/if}
