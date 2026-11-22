<script lang="ts">
	import { ExternalLink, Layers, CheckCircle2, Clock } from 'lucide-svelte';

	let {
		hydrated = null,
		displayedResolvedComponents = [],
		allResolvedComponents = [],
		subjectBoundComponentNames = new Set<string>(),
		showAllResolvedComponents = $bindable(false),
		nautobotBaseUrl = 'http://localhost:8080',
		edpStatus = 'proposed'
	}: {
		hydrated?: any;
		displayedResolvedComponents?: any[];
		allResolvedComponents?: any[];
		subjectBoundComponentNames?: Set<string>;
		showAllResolvedComponents?: boolean;
		nautobotBaseUrl?: string;
		edpStatus?: string;
	} = $props();

	let showRawPlanJson = $state(false);
	let planningGranularity = $state<'capacity_sizing' | 'lld_allocated'>('capacity_sizing');
	$effect(() => {
		if (hydrated?.planning_granularity === 'capacity_sizing' || hydrated?.planning_granularity === 'lld_allocated') {
			planningGranularity = hydrated.planning_granularity;
		}
	});
	const plannedDevices = $derived<any[]>(hydrated?.nautobot_planned_devices || []);
	const isCapacitySizing = $derived(planningGranularity === 'capacity_sizing');
</script>

<div class="rounded-xl border bg-card p-5 shadow-xs space-y-3.5" data-testid="phase4-nautobot-plan-preview">
	<div class="flex items-center justify-between gap-2 flex-wrap border-b pb-2.5">
		<div>
			<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-500/15 text-sky-700 dark:text-sky-300">
				Intention & Planification (Dry-Run Nautobot)
			</span>
			<h3 class="text-sm font-bold text-foreground mt-1 flex items-center gap-1.5">
				<Layers class="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
				<span>Plan d'objets Nautobot & état de ratification</span>
			</h3>
		</div>

		<!-- Lien unique vers Nautobot (point d'hydratation unique, #405) -->
		<a
			href={nautobotBaseUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-muted/40 hover:bg-muted text-xs font-semibold text-foreground transition-colors"
			title="Consulter l'état planifié dans Nautobot (SSoT unique)"
			data-testid="phase4-nautobot-link"
		>
			<span>Ouvrir dans Nautobot</span>
			<ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
		</a>
	</div>

	<div class="flex items-center justify-between gap-2 text-xs rounded-lg border bg-muted/20 px-3 py-2 flex-wrap">
		<span class="text-muted-foreground">
			L'hydratation et l'exécution vivent derrière <strong class="text-foreground">Nautobot</strong>. Archinex présente ici l'intention en mode <code class="font-mono">dry-run</code>.
		</span>
		<div class="flex items-center gap-1.5 flex-wrap">
			<div class="inline-flex items-center rounded-md border bg-background p-0.5 text-[10px]" data-testid="phase4-planning-granularity-toggle">
				<button
					type="button"
					onclick={() => (planningGranularity = 'capacity_sizing')}
					class="px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors {isCapacitySizing ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'}"
					data-testid="phase4-granularity-capacity-btn"
					title="Dimensionnement Avant-Vente RFP : verrouille topologie, quantitatifs et capacités sans figer d'IP/MAC fictives"
				>
					Planned-Capacity (RFP)
				</button>
				<button
					type="button"
					onclick={() => (planningGranularity = 'lld_allocated')}
					class="px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors {!isCapacitySizing ? 'bg-sky-600 text-white' : 'text-muted-foreground hover:text-foreground'}"
					data-testid="phase4-granularity-lld-btn"
					title="Paramétrage LLD : alloue et synchronise les adresses IP, préfixes et attributs physiques nominaux"
				>
					Planned-Allocated (LLD)
				</button>
			</div>
			<span class="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold shrink-0 bg-background">
				{#if edpStatus === 'validated'}
					<CheckCircle2 class="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
					<span>Ratifié</span>
				{:else}
					<Clock class="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
					<span>{edpStatus}</span>
				{/if}
			</span>
		</div>
	</div>

	{#if hydrated}
		{#if plannedDevices.length > 0}
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
				{#each plannedDevices as dev (dev.name)}
					<div class="p-2.5 rounded-lg border bg-muted/20 space-y-1">
						<div class="flex items-center justify-between gap-1">
							<span class="text-[10px] font-bold uppercase text-muted-foreground">Objet planifié Nautobot</span>
							<span class="font-mono text-[10px] px-1.5 py-0.2 rounded {isCapacitySizing ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'}" data-testid="phase4-planned-device-stage">
								{isCapacitySizing ? 'Planned-Capacity' : dev.status || 'Planned-Allocated'}
							</span>
						</div>
						<div class="font-mono font-bold text-foreground">{dev.name}</div>
						{#if dev.device_type}
							<div class="text-[11px] text-muted-foreground">
								Type : <strong class="text-foreground">{dev.device_type}</strong>
							</div>
						{/if}
						{#if dev.cluster_pool}
							<div class="text-[10px] font-mono text-muted-foreground">
								Pool : {dev.cluster_pool}
							</div>
						{/if}
						<div class="text-[10px] font-mono text-muted-foreground" data-testid="phase4-planned-device-ip-mode">
							{#if isCapacitySizing}
								Allocations IP/MAC : <span class="text-indigo-600 dark:text-indigo-400 font-semibold">Différées au LLD</span>
							{:else if dev.oob_ip}
								OOB nominal : <span class="text-foreground">{dev.oob_ip}</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-xs text-muted-foreground">
				Aucun objet Nautobot planifié en dry-run pour ce sujet. Ratifiez les axes d'intention à gauche pour prévisualiser le plan.
			</p>
		{/if}

		<!-- Composants logiques résolus -->
		{#if allResolvedComponents.length > 0}
			<div class="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2 text-xs" data-testid="phase4-resolved-components">
				<div class="flex items-center justify-between gap-2 flex-wrap">
					<span class="font-bold text-foreground">
						Composants logiques rattachés ({displayedResolvedComponents.length})
					</span>
					{#if subjectBoundComponentNames.size > 0 && allResolvedComponents.length > subjectBoundComponentNames.size}
						<button
							type="button"
							onclick={() => (showAllResolvedComponents = !showAllResolvedComponents)}
							class="px-2 py-0.5 rounded border text-[10px] font-semibold cursor-pointer bg-background hover:bg-muted text-foreground"
							data-testid="phase4-toggle-all-components-btn"
						>
							{showAllResolvedComponents
								? 'Ciblés par ce sujet uniquement'
								: `Voir tout le catalogue (${allResolvedComponents.length})`}
						</button>
					{/if}
				</div>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
					{#each displayedResolvedComponents as comp (comp.name)}
						{@const isSubjectTarget = subjectBoundComponentNames.has(comp.name)}
						<div class="p-2.5 rounded-lg border bg-background/90 space-y-1" data-testid="phase4-resolved-component-card">
							<div class="flex items-center justify-between gap-1.5">
								<span class="font-mono font-bold text-foreground">{comp.name}</span>
								<span class="text-[10px] font-mono px-1.5 py-0.5 rounded {isSubjectTarget
									? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold'
									: 'bg-muted text-muted-foreground'}">
									{isSubjectTarget ? 'Ciblé par ce sujet' : comp.functionalDomain}
								</span>
							</div>
							<div class="text-[11px] text-muted-foreground">
								Domaine : <strong class="text-foreground">{comp.functionalDomain}</strong> · Tenant : <code class="font-mono text-foreground">{comp.tenant}</code>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<div class="flex items-center justify-end pt-1">
			<button
				type="button"
				onclick={() => (showRawPlanJson = !showRawPlanJson)}
				class="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
			>
				{showRawPlanJson ? 'Masquer le plan JSON dry-run' : 'Inspecter le plan JSON dry-run'}
			</button>
		</div>

		{#if showRawPlanJson}
			<pre class="p-3 rounded-lg bg-slate-950 text-slate-100 font-mono text-[10px] overflow-x-auto max-h-60">{JSON.stringify(hydrated, null, 2)}</pre>
		{/if}
	{:else}
		<p class="text-xs text-muted-foreground">Chargement du plan d'intention dry-run…</p>
	{/if}
</div>
