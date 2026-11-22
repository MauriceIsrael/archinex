<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { Code, Eye, AlertCircle, RefreshCw, ZoomIn, ZoomOut, Maximize2, X, Sparkles } from 'lucide-svelte';

	let {
		code = '',
		title = 'Diagramme d\'Architecture',
		defaultView = 'visual',
		compact = false
	} = $props<{
		code: string;
		title?: string;
		defaultView?: 'visual' | 'code';
		compact?: boolean;
	}>();

	let currentView = $state<'visual' | 'code'>('visual');
	let svgHtml = $state<string>('');
	let renderError = $state<string | null>(null);
	let isRendering = $state<boolean>(false);
	let zoomLevel = $state<number>(1);

	// Modale plein écran interactive (clic simple + Zoom/Pan)
	let isFullScreen = $state(false);
	let fsFitMode = $state<'fit' | 'native'>('native');
	let fsZoom = $state<number>(1);
	let fsViewportEl = $state<HTMLDivElement | null>(null);
	let isPanning = $state(false);
	let panStartX = 0;
	let panStartY = 0;
	let panScrollLeft = 0;
	let panScrollTop = 0;

	let mermaidInstance: any = null;

	async function initAndRender() {
		if (!browser) return;
		if (!code || code.trim() === '') {
			svgHtml = '';
			renderError = null;
			return;
		}

		isRendering = true;
		renderError = null;

		try {
			if (!mermaidInstance) {
				const mermaidModule = await import('mermaid');
				mermaidInstance = mermaidModule.default;
				mermaidInstance.initialize({
					startOnLoad: false,
					securityLevel: 'loose',
					theme: 'default',
					fontFamily: 'ui-sans-serif, system-ui, sans-serif'
				});
			}

			const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
			const { svg } = await mermaidInstance.render(uniqueId, code);
			svgHtml = svg;
		} catch (err: unknown) {
			console.warn('Erreur de rendu Mermaid:', err);
			renderError = err instanceof Error ? err.message : 'Erreur d\'interprétation de la syntaxe graphique';
		} finally {
			isRendering = false;
		}
	}

	onMount(() => {
		currentView = defaultView;
		initAndRender();
	});

	$effect(() => {
		if (code) {
			initAndRender();
		}
	});

	function zoomIn() {
		zoomLevel = Math.min(zoomLevel + 0.2, 2.5);
	}

	function zoomOut() {
		zoomLevel = Math.max(zoomLevel - 0.2, 0.6);
	}

	function resetZoom() {
		zoomLevel = 1;
	}

	function openFullScreen() {
		fsFitMode = 'native';
		fsZoom = 1;
		isFullScreen = true;
	}

	function closeFullScreen() {
		isFullScreen = false;
		isPanning = false;
	}

	function fsZoomIn() {
		fsFitMode = 'native';
		fsZoom = Math.min(Number((fsZoom + 0.25).toFixed(2)), 4);
	}

	function fsZoomOut() {
		fsFitMode = 'native';
		fsZoom = Math.max(Number((fsZoom - 0.25).toFixed(2)), 0.25);
	}

	function fsResetZoom() {
		fsFitMode = 'native';
		fsZoom = 1;
	}

	function fsToggleFit() {
		fsFitMode = fsFitMode === 'fit' ? 'native' : 'fit';
		if (fsFitMode === 'native') fsZoom = 1;
	}

	function handleFsWheel(e: WheelEvent) {
		if (!isFullScreen) return;
		e.preventDefault();
		if (e.deltaY < 0) fsZoomIn();
		else fsZoomOut();
	}

	function handlePanStart(e: PointerEvent) {
		if (e.button !== 0 || !fsViewportEl) return;
		isPanning = true;
		panStartX = e.clientX;
		panStartY = e.clientY;
		panScrollLeft = fsViewportEl.scrollLeft;
		panScrollTop = fsViewportEl.scrollTop;
	}

	function handlePanMove(e: PointerEvent) {
		if (!isPanning || !fsViewportEl) return;
		fsViewportEl.scrollLeft = panScrollLeft - (e.clientX - panStartX);
		fsViewportEl.scrollTop = panScrollTop - (e.clientY - panStartY);
	}

	function handlePanEnd() {
		isPanning = false;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isFullScreen) {
			closeFullScreen();
		}
	}
</script>

<svelte:window
	onpointermove={handlePanMove}
	onpointerup={handlePanEnd}
	onpointercancel={handlePanEnd}
	onkeydown={handleKeyDown}
/>

<div class="rounded-xl border bg-card shadow-xs overflow-hidden flex flex-col">
	<!-- Barre de contrôle de la vue -->
	<div class="flex items-center justify-between px-3 py-2 border-b bg-muted/30 text-xs">
		<div class="flex items-center gap-2">
			<span class="font-bold text-foreground">{title}</span>
			{#if isRendering}
				<RefreshCw class="h-3 w-3 animate-spin text-primary" />
			{/if}
		</div>

		<div class="flex items-center gap-1.5">
			<!-- Contrôles de Zoom (si vue visuelle) -->
			{#if currentView === 'visual' && !renderError && svgHtml}
				<div class="flex items-center gap-0.5 mr-2 border rounded bg-background px-1 py-0.5">
					<button
						type="button"
						onclick={zoomOut}
						class="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
						title="Dézoomer"
					>
						<ZoomOut class="h-3 w-3" />
					</button>
					<button
						type="button"
						onclick={resetZoom}
						class="px-1 text-[10px] font-mono text-muted-foreground hover:text-foreground cursor-pointer"
						title="Réinitialiser zoom"
					>
						{Math.round(zoomLevel * 100)}%
					</button>
					<button
						type="button"
						onclick={zoomIn}
						class="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
						title="Zoomer"
					>
						<ZoomIn class="h-3 w-3" />
					</button>

					<div class="h-3.5 w-px bg-border mx-0.5"></div>

					<button
						type="button"
						onclick={openFullScreen}
						class="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
						title="Ouvrir en plein écran interactif (Zoom & Pan)"
					>
						<Maximize2 class="h-3 w-3" />
					</button>
				</div>
			{/if}

			<!-- Commutateur Vue Visuelle / Code Source -->
			<div class="inline-flex rounded-lg border bg-background p-0.5">
				<button
					type="button"
					onclick={() => (currentView = 'visual')}
					class="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer {currentView === 'visual'
						? 'bg-primary text-primary-foreground shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<Eye class="h-3 w-3" />
					<span>Interprétation Graphique</span>
				</button>
				<button
					type="button"
					onclick={() => (currentView = 'code')}
					class="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer {currentView === 'code'
						? 'bg-primary text-primary-foreground shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<Code class="h-3 w-3" />
					<span>Code Source</span>
				</button>
			</div>
		</div>
	</div>

	<!-- Corps d'affichage -->
	<div class="relative {compact ? 'h-[250px]' : 'min-h-[300px]'} flex-1 overflow-auto p-3 bg-background">
		{#if currentView === 'visual'}
			{#if renderError}
				<div class="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-xs space-y-2">
					<div class="flex items-center gap-2 text-destructive font-semibold">
						<AlertCircle class="h-4 w-4" />
						<span>Échec d'interprétation visuelle :</span>
					</div>
					<p class="text-muted-foreground font-mono text-[11px]">{renderError}</p>
					<div class="pt-2">
						<button
							type="button"
							onclick={() => (currentView = 'code')}
							class="text-xs font-semibold text-primary underline cursor-pointer"
						>
							Basculer sur le code source brut
						</button>
					</div>
				</div>
			{:else if svgHtml}
				<div
					class="w-full h-full flex items-center justify-center transition-transform duration-100 overflow-auto"
					style="transform: scale({zoomLevel}); transform-origin: top center;"
				>
					<!-- Conteneur SVG : clic simple pour ouvrir le plein écran interactif -->
					<div
						role="button"
						tabindex="0"
						onclick={openFullScreen}
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFullScreen(); } }}
						class="mermaid-svg-container w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto shadow-xs rounded-lg p-2 bg-card border cursor-zoom-in select-none relative group transition-all hover:shadow-md hover:border-primary/50"
						title="Cliquer pour ouvrir en grand avec Zoom et déplacement"
					>
						{@html svgHtml}
						<!-- Badge discret d'instruction ergonomique -->
						<div class="absolute bottom-2 right-2 opacity-85 group-hover:opacity-100 transition-opacity bg-background/95 backdrop-blur-xs border px-2 py-0.5 rounded text-[10px] font-medium text-muted-foreground flex items-center gap-1 pointer-events-none shadow-xs">
							<Maximize2 class="h-2.5 w-2.5 text-primary" />
							<span>Ouvrir en grand (Zoom / Pan)</span>
						</div>
					</div>
				</div>
			{:else}
				<div class="h-48 flex items-center justify-center text-xs text-muted-foreground">
					<span>Génération du diagramme vectoriel en cours...</span>
				</div>
			{/if}
		{:else}
			<pre class="rounded-lg bg-muted/80 p-4 font-mono text-xs text-foreground overflow-x-auto leading-relaxed border shadow-inner max-h-[500px]">{code}</pre>
		{/if}
	</div>
</div>

<!-- ═════════════════════════════════════════════════════════════════════════ -->
<!-- MODALE PLEIN ÉCRAN INTERACTIVE (ZOOM / PAN / AJUSTER)                    -->
<!-- ═════════════════════════════════════════════════════════════════════════ -->
{#if isFullScreen && svgHtml}
	<div
		class="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col p-3 sm:p-5 select-none animate-in fade-in duration-150"
		role="dialog"
		aria-modal="true"
		aria-label="Aperçu plein écran du diagramme d'architecture"
	>
		<!-- Barre d'outils supérieure -->
		<div class="flex flex-wrap items-center justify-between gap-2 mb-3 px-3 py-2 rounded-xl bg-card/95 border border-border shadow-xl text-xs">
			<div class="flex items-center gap-2 font-semibold text-foreground">
				<Maximize2 class="h-3.5 w-3.5 text-primary" />
				<span>{title}</span>
				<span class="hidden sm:inline text-[11px] font-normal text-muted-foreground">· Cliquer-glisser pour déplacer · Molette pour zoomer</span>
			</div>

			<div class="flex items-center gap-1.5">
				<div class="flex items-center gap-0.5 border rounded-lg bg-background px-1.5 py-0.5">
					<button
						type="button"
						onclick={fsZoomOut}
						class="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
						title="Dézoomer"
					>
						<ZoomOut class="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						onclick={fsResetZoom}
						class="px-2 text-[11px] font-mono text-foreground hover:bg-muted rounded cursor-pointer"
						title="Taille réelle (100%)"
					>
						{fsFitMode === 'fit' ? 'Ajusté' : `${Math.round(fsZoom * 100)}%`}
					</button>
					<button
						type="button"
						onclick={fsZoomIn}
						class="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
						title="Zoomer"
					>
						<ZoomIn class="h-3.5 w-3.5" />
					</button>
				</div>

				<button
					type="button"
					onclick={fsToggleFit}
					class="px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors {fsFitMode === 'fit'
						? 'bg-primary text-primary-foreground border-primary'
						: 'bg-background hover:bg-muted text-foreground'}"
					title="Basculer entre ajusté à l'écran et taille réelle zoomable"
				>
					{fsFitMode === 'fit' ? 'Taille réelle (100%)' : 'Ajuster à l’écran'}
				</button>

				<button
					type="button"
					onclick={closeFullScreen}
					class="p-1.5 rounded-lg bg-background hover:bg-muted border text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
					title="Fermer (Échap)"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</div>

		<!-- Zone de visualisation scrollable & pannable -->
		<div
			bind:this={fsViewportEl}
			onwheel={handleFsWheel}
			onpointerdown={handlePanStart}
			class="flex-1 w-full overflow-auto rounded-xl bg-card border shadow-2xl p-6 {isPanning ? 'cursor-grabbing' : 'cursor-grab'}"
		>
			{#if fsFitMode === 'fit'}
				<div class="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto">
					{@html svgHtml}
				</div>
			{:else}
				<div
					class="inline-block min-w-full [&>svg]:max-w-none"
					style="transform: scale({fsZoom}); transform-origin: top left;"
				>
					{@html svgHtml}
				</div>
			{/if}
		</div>
	</div>
{/if}
