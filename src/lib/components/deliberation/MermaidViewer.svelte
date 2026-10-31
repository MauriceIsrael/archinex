<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { Code, Eye, AlertCircle, RefreshCw, ZoomIn, ZoomOut, Maximize2, X, Sparkles } from 'lucide-svelte';

	let {
		code = '',
		title = 'Diagramme d\'Architecture',
		defaultView = 'visual'
	} = $props<{
		code: string;
		title?: string;
		defaultView?: 'visual' | 'code';
	}>();

	let currentView = $state<'visual' | 'code'>('visual');
	let svgHtml = $state<string>('');
	let renderError = $state<string | null>(null);
	let isRendering = $state<boolean>(false);
	let zoomLevel = $state<number>(1);

	// Plein écran réactif (maintien du clic ou toggle)
	let isHoldingFullScreen = $state(false);
	let isPersistentFullScreen = $state(false);
	const isFullScreen = $derived(isHoldingFullScreen || isPersistentFullScreen);

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

	function handlePointerDown(e: PointerEvent) {
		if (e.button !== 0) return; // Seul le clic gauche déclenche le plein écran temporaire
		isHoldingFullScreen = true;
	}

	function handlePointerUp() {
		if (isHoldingFullScreen) {
			isHoldingFullScreen = false;
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			isHoldingFullScreen = false;
			isPersistentFullScreen = false;
		}
	}

	function togglePersistentFullScreen() {
		isPersistentFullScreen = !isPersistentFullScreen;
	}
</script>

<svelte:window
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
	onkeydown={handleKeyDown}
	onblur={handlePointerUp}
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
						onclick={togglePersistentFullScreen}
						class="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
						title={isPersistentFullScreen ? "Quitter le plein écran" : "Plein écran fixe (ou maintenez le clic sur le graphe)"}
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
	<div class="relative min-h-[300px] flex-1 overflow-auto p-4 bg-background">
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
					class="w-full flex items-center justify-center transition-transform duration-100 overflow-auto"
					style="transform: scale({zoomLevel}); transform-origin: top center;"
				>
					<!-- Conteneur SVG avec détection de maintien du clic pour plein écran -->
					<div
						role="button"
						tabindex="0"
						onpointerdown={handlePointerDown}
						class="mermaid-svg-container max-w-full [&>svg]:max-w-full [&>svg]:h-auto shadow-xs rounded-lg p-3 bg-card border cursor-zoom-in select-none relative group transition-all hover:shadow-md hover:border-primary/50"
						title="Cliquez et maintenez le bouton de la souris enfoncé pour afficher en plein écran"
					>
						{@html svgHtml}
						<!-- Badge discret d'instruction ergonomique au survol -->
						<div class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/95 backdrop-blur-xs border px-2 py-0.5 rounded text-[10px] font-medium text-muted-foreground flex items-center gap-1 pointer-events-none shadow-xs">
							<Maximize2 class="h-2.5 w-2.5 text-primary" />
							<span>Maintenir le clic pour plein écran</span>
						</div>
					</div>
				</div>
			{:else}
				<div class="h-64 flex items-center justify-center text-xs text-muted-foreground">
					<span>Génération du diagramme vectoriel en cours...</span>
				</div>
			{/if}
		{:else}
			<pre class="rounded-lg bg-muted/80 p-4 font-mono text-xs text-foreground overflow-x-auto leading-relaxed border shadow-inner max-h-[500px]">{code}</pre>
		{/if}
	</div>
</div>

<!-- ═════════════════════════════════════════════════════════════════════════ -->
<!-- SURCOUCHE PLEIN ÉCRAN (MAINTIEN DU CLIC OU PLEIN ÉCRAN VERROUILLÉ)         -->
<!-- ═════════════════════════════════════════════════════════════════════════ -->
{#if isFullScreen && svgHtml}
	<div
		class="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 select-none animate-in fade-in duration-150 cursor-zoom-out"
		onpointerup={handlePointerUp}
		role="dialog"
		aria-modal="true"
		aria-label="Aperçu plein écran du diagramme d'architecture"
	>
		<!-- Bandeau d'information supérieur -->
		<div class="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 rounded-full bg-card/95 border border-primary/40 text-foreground shadow-2xl text-xs font-semibold backdrop-blur-xs pointer-events-none">
			<Maximize2 class="h-3.5 w-3.5 text-primary animate-pulse" />
			<span>
				{isHoldingFullScreen ? '🔍 Plein écran actif (Maintien du clic) · Relâchez pour revenir' : '🔍 Plein écran activé · Cliquez pour fermer ou touche Échap'}
			</span>
		</div>

		<!-- Bouton de fermeture -->
		<button
			type="button"
			onclick={() => { isHoldingFullScreen = false; isPersistentFullScreen = false; }}
			class="absolute top-4 right-4 p-2 rounded-full bg-card/90 hover:bg-card border text-muted-foreground hover:text-foreground text-xs shadow-xl cursor-pointer transition-colors"
			title="Fermer le plein écran (Échap)"
		>
			<X class="h-4 w-4" />
		</button>

		<!-- Diagramme agrandi en plein écran -->
		<div
			class="w-full h-full max-w-[96vw] max-h-[90vh] flex items-center justify-center overflow-auto rounded-xl bg-card border p-4 sm:p-8 shadow-2xl [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto [&>svg]:object-contain"
		>
			{@html svgHtml}
		</div>
	</div>
{/if}
