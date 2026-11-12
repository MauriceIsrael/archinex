<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import MermaidViewer from './MermaidViewer.svelte';
	import ComponentCatalogEditor from '$lib/components/edp/ComponentCatalogEditor.svelte';
	import { Layers } from 'lucide-svelte';

	const projectId = $derived(
		deliberationStore.activeEngagement?.id || deliberationStore.activeEngagementId || 'default'
	);
	const engagementTitle = $derived(deliberationStore.activeEngagement?.title || 'Projet');

	let logicalViewsTab = $state<'logical' | 'deployment' | 'physical'>('logical');
	let whatIfDcCount = $state<2 | 3>(2);
	let selectedViewEnv = $state<'prod' | 'preprod' | 'lab'>('prod');
	let showCatalogEditor = $state(false);
	let projectCatalogState = $state<any>(null);

	async function loadProjectCatalogViews() {
		if (!projectId) return;
		try {
			const res = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/catalog?env=${encodeURIComponent(selectedViewEnv)}`
			);
			if (res.ok) {
				projectCatalogState = await res.json();
			}
		} catch {
			// non bloquant
		}
	}

	$effect(() => {
		if (projectId && selectedViewEnv) {
			void loadProjectCatalogViews();
		}
	});

	const activeWhatIfScenario = $derived(
		projectCatalogState?.whatIfScenarios?.find((s: any) => s.dcCount === whatIfDcCount) || null
	);

	const activeLogicalMermaid = $derived(
		logicalViewsTab === 'logical'
			? projectCatalogState?.topology?.mermaid?.logicalView || ''
			: logicalViewsTab === 'deployment'
				? activeWhatIfScenario?.deploymentMermaid ||
					projectCatalogState?.topology?.mermaid?.deploymentView ||
					''
				: projectCatalogState?.topology?.mermaid?.physicalCmdbView || ''
	);
</script>

<div class="space-y-4" data-testid="phase5-consolidation-hub">
	<!-- En-tête Phase 5 : Consolidation transversale au niveau Projet -->
	<div class="rounded-xl border bg-gradient-to-r from-indigo-500/10 via-violet-500/5 to-background p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
		<div class="space-y-1">
			<div class="flex items-center gap-2 flex-wrap">
				<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-600 text-white">
					<Layers class="h-3.5 w-3.5" />
					Phase 5 · Consolidation Projet
				</span>
				<span class="text-xs font-mono text-muted-foreground">
					Base × Overlay × Datacenter · Multi-sujets
				</span>
			</div>
			<h2 class="text-base font-bold text-foreground">
				Consolidation transversale des choix d'architecture — {engagementTitle}
			</h2>
			<p class="text-xs text-muted-foreground">
				Agrège les composants logiques du catalogue projet, résout les références inter-composants
				(<code class="font-mono">ref()</code>) et projette les vues synchronisées (Logique, Déploiement What-If 2 vs 3 DCs, Physique CMDB).
			</p>
		</div>
	</div>

	<!-- Vues synchronisées, What-If (2 vs 3 DCs) & Catalogue Composants -->
	<div class="rounded-xl border bg-card p-5 shadow-xs space-y-4" data-testid="phase5-logical-views-hub">
		<div class="flex items-center justify-between gap-2 flex-wrap border-b pb-3">
			<div>
				<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
					Consolidation Projet · Base × Overlay × Datacenter
				</span>
				<h3 class="text-sm font-bold text-foreground mt-1">
					Vues Synchronisées (Logique · Déploiement · Physique CMDB) & Simulation What-If
				</h3>
			</div>
			<div class="flex items-center gap-2 flex-wrap text-xs">
				<select
					bind:value={selectedViewEnv}
					class="rounded border bg-background px-2 py-1 font-mono text-xs"
					data-testid="logical-views-env-select"
				>
					<option value="prod">env: prod</option>
					<option value="preprod">env: preprod</option>
					<option value="lab">env: lab</option>
				</select>
				<div class="inline-flex rounded-lg border overflow-hidden">
					<button
						type="button"
						onclick={() => (whatIfDcCount = 2)}
						class="px-2.5 py-1 text-xs font-semibold cursor-pointer {whatIfDcCount === 2
							? 'bg-indigo-600 text-white'
							: 'bg-background text-foreground hover:bg-muted'}"
						data-testid="whatif-2dc-btn"
					>
						What-If : 2 DCs
					</button>
					<button
						type="button"
						onclick={() => (whatIfDcCount = 3)}
						class="px-2.5 py-1 text-xs font-semibold cursor-pointer {whatIfDcCount === 3
							? 'bg-indigo-600 text-white'
							: 'bg-background text-foreground hover:bg-muted'}"
						data-testid="whatif-3dc-btn"
					>
						What-If : 3 DCs
					</button>
				</div>
				<button
					type="button"
					onclick={() => (showCatalogEditor = !showCatalogEditor)}
					class="px-2.5 py-1 rounded border bg-violet-500/10 text-violet-700 dark:text-violet-300 font-semibold text-xs hover:bg-violet-500/20 cursor-pointer"
					data-testid="toggle-catalog-editor-btn"
				>
					{showCatalogEditor ? 'Masquer Catalogue' : 'Éditer Catalogue & Overlays'}
				</button>
			</div>
		</div>

		{#if activeWhatIfScenario}
			<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs" data-testid="whatif-metrics-bar">
				<div class="p-2 rounded border bg-muted/20">
					<div class="text-[10px] text-muted-foreground uppercase">Datacenters actifs</div>
					<div class="font-mono font-bold text-foreground">{activeWhatIfScenario.datacenters.join(', ')}</div>
				</div>
				<div class="p-2 rounded border bg-muted/20">
					<div class="text-[10px] text-muted-foreground uppercase">Instances Modules</div>
					<div class="font-mono font-bold text-foreground">{activeWhatIfScenario.totalInstances}</div>
				</div>
				<div class="p-2 rounded border bg-muted/20">
					<div class="text-[10px] text-muted-foreground uppercase">NICs Résolues</div>
					<div class="font-mono font-bold text-foreground">{activeWhatIfScenario.totalNics}</div>
				</div>
				<div class="p-2 rounded border bg-muted/20">
					<div class="text-[10px] text-muted-foreground uppercase">Hôtes Bare-Metal est.</div>
					<div class="font-mono font-bold text-foreground">{activeWhatIfScenario.estimatedBareMetalHosts}</div>
				</div>
			</div>
		{/if}

		{#if showCatalogEditor}
			<ComponentCatalogEditor {projectId} onUpdated={loadProjectCatalogViews} />
		{/if}

		<div class="flex items-center gap-1.5 border-b pb-2">
			<button
				type="button"
				onclick={() => (logicalViewsTab = 'logical')}
				class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer {logicalViewsTab === 'logical'
					? 'bg-indigo-600 text-white'
					: 'bg-muted/40 text-foreground hover:bg-muted'}"
				data-testid="tab-view-logical"
			>
				1. Vue Logique (Composants & Flux)
			</button>
			<button
				type="button"
				onclick={() => (logicalViewsTab = 'deployment')}
				class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer {logicalViewsTab === 'deployment'
					? 'bg-indigo-600 text-white'
					: 'bg-muted/40 text-foreground hover:bg-muted'}"
				data-testid="tab-view-deployment"
			>
				2. Vue Déploiement (DC → Pool → Tenant)
			</button>
			<button
				type="button"
				onclick={() => (logicalViewsTab = 'physical')}
				class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer {logicalViewsTab === 'physical'
					? 'bg-indigo-600 text-white'
					: 'bg-muted/40 text-foreground hover:bg-muted'}"
				data-testid="tab-view-physical"
			>
				3. Vue Physique / CMDB (NICs & VRFs)
			</button>
		</div>

		{#if activeLogicalMermaid}
			<MermaidViewer code={activeLogicalMermaid} />
		{:else}
			<p class="text-xs text-muted-foreground">Aucune topologie logique disponible pour ce projet.</p>
		{/if}
	</div>
</div>
