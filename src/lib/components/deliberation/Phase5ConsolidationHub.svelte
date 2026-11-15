<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import MermaidViewer from './MermaidViewer.svelte';
	import LiveArchitectureLockView from './LiveArchitectureLockView.svelte';
	import ComponentCatalogEditor from '$lib/components/edp/ComponentCatalogEditor.svelte';
	import { Layers } from 'lucide-svelte';

	const projectId = $derived(
		deliberationStore.activeEngagement?.id || deliberationStore.activeEngagementId || 'default'
	);
	const engagementTitle = $derived(deliberationStore.activeEngagement?.title || 'Projet');

	let logicalViewsTab = $state<'logical' | 'deployment' | 'physical'>('logical');
	let whatIfDcCount = $state<2 | 3>(3);
	let selectedTwinProfileId = $state<'3dc-active' | '2dc-witness' | '2dc-split'>('3dc-active');
	let twinArbitrationMode = $state<'proposal' | 'client-mandated'>('proposal');
	let showSushyEmulatorPreview = $state(false);
	let selectedViewEnv = $state<'prod' | 'preprod' | 'lab'>('prod');
	let showCatalogEditor = $state(false);
	let projectCatalogState = $state<any>(null);
	let decisionSlotsState = $state<any>(null);
	let isSlotActionRunning = $state(false);
	let slotActionMessage = $state<string | null>(null);
	let slotActionError = $state<string | null>(null);
	let emergentComponentInput = $state('iot-gateway');

	async function loadProjectCatalogViews() {
		if (!projectId) return;
		try {
			const [catRes, slotsRes] = await Promise.all([
				fetch(
					`/api/projects/${encodeURIComponent(projectId)}/catalog?env=${encodeURIComponent(selectedViewEnv)}&mode=${encodeURIComponent(twinArbitrationMode)}&mandatedProfile=${encodeURIComponent(selectedTwinProfileId)}`
				),
				fetch(`/api/projects/${encodeURIComponent(projectId)}/decision-slots`)
			]);
			if (catRes.ok) {
				projectCatalogState = await catRes.json();
			}
			if (slotsRes.ok) {
				decisionSlotsState = await slotsRes.json();
			}
		} catch {
			// non bloquant
		}
	}

	async function handleRatifyType2Batch() {
		if (!projectId || isSlotActionRunning) return;
		isSlotActionRunning = true;
		slotActionMessage = null;
		slotActionError = null;
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/decision-slots`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'ratify_batch',
					actorRole: 'lead_architect',
					rationale:
						'Ratification explicite des emplacements de commodité Type 2 en Consolidation Phase 5.'
				})
			});
			const data = await res.json();
			if (!res.ok || data.status === 'error') {
				slotActionError = data.error || 'Échec de la ratification en lot.';
			} else {
				slotActionMessage = `${data.receipt?.ratifiedSlotIds?.length || 0} emplacement(s) Type 2 ratifiés et composants transverses instanciés (${(data.instantiatedComponents || []).join(', ')}).`;
				await loadProjectCatalogViews();
			}
		} catch (e: any) {
			slotActionError = e.message || 'Erreur réseau.';
		} finally {
			isSlotActionRunning = false;
		}
	}

	async function handleSealArchitectureLock() {
		if (!projectId || isSlotActionRunning) return;
		isSlotActionRunning = true;
		slotActionMessage = null;
		slotActionError = null;
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/decision-slots`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'seal_architecture_lock',
					actorRole: 'lead_architect'
				})
			});
			const data = await res.json();
			if (!res.ok || data.status === 'error') {
				slotActionError = data.error || 'Verrouillage architecture.lock refusé (emplacements non ratifiés ou violation OPA).';
			} else {
				slotActionMessage = `Manifeste architecture.lock scellé avec succès (SHA-256 : ${data.architectureLock?.integritySha256?.slice(0, 16)}…).`;
				await loadProjectCatalogViews();
			}
		} catch (e: any) {
			slotActionError = e.message || 'Erreur réseau.';
		} finally {
			isSlotActionRunning = false;
		}
	}

	async function handleInstantiateEmergentComponent() {
		const targetName = emergentComponentInput.trim();
		if (!projectId || !targetName || isSlotActionRunning) return;
		isSlotActionRunning = true;
		slotActionMessage = null;
		slotActionError = null;
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/catalog`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'instantiate_emergent_component',
					name: targetName
				})
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				slotActionError = data.error || 'Échec de l’instanciation du composant émergent.';
			} else {
				slotActionMessage = `Composant logique émergent « ${data.component?.metadata?.name || targetName} » instancié dans le catalogue et projeté dans le Jumeau Sylva.`;
				await loadProjectCatalogViews();
			}
		} catch (e: any) {
			slotActionError = e.message || 'Erreur réseau.';
		} finally {
			isSlotActionRunning = false;
		}
	}

	$effect(() => {
		if (projectId && selectedViewEnv && twinArbitrationMode && selectedTwinProfileId) {
			void loadProjectCatalogViews();
		}
	});

	const activeTwinProfile = $derived(
		projectCatalogState?.sylvaTwinProfiles?.find(
			(p: any) => p.profileId === selectedTwinProfileId
		) || null
	);

	const activeWhatIfScenario = $derived(
		activeTwinProfile ||
			projectCatalogState?.whatIfScenarios?.find((s: any) => s.dcCount === whatIfDcCount) ||
			null
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
					Phase 5 · Consolidation Projet & Jumeau Sylva
				</span>
				<span class="text-xs font-mono text-muted-foreground">
					Base × Overlay × Datacenter · Multi-sujets · Cible Sylva LATEST
				</span>
			</div>
			<h2 class="text-base font-bold text-foreground">
				Consolidation transversale des choix d'architecture — {engagementTitle}
			</h2>
			<p class="text-xs text-muted-foreground">
				Agrège les composants logiques du catalogue projet, résout les références inter-composants
				(<code class="font-mono">ref()</code>), simule la survie aux pannes du Jumeau Numérique de Sylva (3 DCs par défaut vs 2 DCs + Témoin vs 2 DCs secs) et génère le bouchon Redfish <code class="font-mono">sushy-emulator</code>.
			</p>
		</div>
	</div>

	<!-- Cockpit Interactif : Vue de l'Architecture Lockée en Direct (Instant t), Allocation des Composants & Scellement architecture.lock -->
	<LiveArchitectureLockView
		{projectId}
		{decisionSlotsState}
		{projectCatalogState}
		onUpdated={loadProjectCatalogViews}
	/>

	<!-- Vues synchronisées, Jumeau Numérique de Sylva (3 DCs / 2 DCs + Témoin / 2 DCs) & Catalogue Composants -->
	<div class="rounded-xl border bg-card p-5 shadow-xs space-y-4" data-testid="phase5-logical-views-hub">
		<div class="flex items-center justify-between gap-2 flex-wrap border-b pb-3">
			<div>
				<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
					Jumeau Numérique de Sylva (LATEST) · Baseline 3 DCs · Base × Overlay × Domaine de Défaillance
				</span>
				<h3 class="text-sm font-bold text-foreground mt-1">
					Vues Synchronisées, Arbitrage Topologique (3 DCs / 2 DCs + Témoin / 2 DCs) & Bouchon Redfish sushy
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
				<select
					bind:value={twinArbitrationMode}
					class="rounded border bg-background px-2 py-1 font-semibold text-xs"
					data-testid="twin-arbitration-mode-select"
				>
					<option value="proposal">Mode : Proposition Équipe</option>
					<option value="client-mandated">Mode : Fixé par le Client</option>
				</select>
				<div class="inline-flex rounded-lg border overflow-hidden">
					<button
						type="button"
						onclick={() => {
							whatIfDcCount = 3;
							selectedTwinProfileId = '3dc-active';
						}}
						class="px-2.5 py-1 text-xs font-semibold cursor-pointer {selectedTwinProfileId === '3dc-active'
							? 'bg-emerald-600 text-white'
							: 'bg-background text-foreground hover:bg-muted'}"
						data-testid="whatif-3dc-btn"
					>
						3 DCs (Défaut Gold)
					</button>
					<button
						type="button"
						onclick={() => {
							whatIfDcCount = 2;
							selectedTwinProfileId = '2dc-witness';
						}}
						class="px-2.5 py-1 text-xs font-semibold cursor-pointer {selectedTwinProfileId === '2dc-witness'
							? 'bg-indigo-600 text-white'
							: 'bg-background text-foreground hover:bg-muted'}"
						data-testid="whatif-2dc-witness-btn"
					>
						2 DCs + Témoin (Silver)
					</button>
					<button
						type="button"
						onclick={() => {
							whatIfDcCount = 2;
							selectedTwinProfileId = '2dc-split';
						}}
						class="px-2.5 py-1 text-xs font-semibold cursor-pointer {selectedTwinProfileId === '2dc-split'
							? 'bg-amber-600 text-white'
							: 'bg-background text-foreground hover:bg-muted'}"
						data-testid="whatif-2dc-btn"
					>
						2 DCs Secs (Bronze)
					</button>
				</div>
				<button
					type="button"
					onclick={() => (showSushyEmulatorPreview = !showSushyEmulatorPreview)}
					class="px-2.5 py-1 rounded border bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-semibold text-xs hover:bg-cyan-500/20 cursor-pointer"
					data-testid="toggle-sushy-emulator-btn"
				>
					{showSushyEmulatorPreview ? 'Masquer sushy Redfish' : 'Bouchon Redfish sushy'}
				</button>
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

		{#if projectCatalogState?.sylvaTwinReport}
			<div
				class="p-3 rounded-lg border text-xs flex flex-col gap-1.5 {projectCatalogState.sylvaTwinReport.verdict ===
				'compliant'
					? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
					: 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'}"
				data-testid="sylva-twin-arbitration-banner"
			>
				<div class="flex items-center justify-between gap-2 flex-wrap font-bold">
					<span>
						Jumeau Sylva ({projectCatalogState.sylvaTwinReport.sylvaRelease}) · Mode
						{projectCatalogState.sylvaTwinReport.mode === 'proposal'
							? 'Proposition Architecte'
							: 'Exigence Fixée Client'}
					</span>
					<span class="font-mono uppercase px-2 py-0.5 rounded bg-background/60 border">
						Recommandé : {projectCatalogState.sylvaTwinReport.recommendedProfileId} · Verdict :
						{projectCatalogState.sylvaTwinReport.verdict}
					</span>
				</div>
				<p class="leading-relaxed opacity-90">
					{projectCatalogState.sylvaTwinReport.recommendationRationale}
				</p>
			</div>
		{/if}

		{#if activeWhatIfScenario}
			<div class="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs" data-testid="whatif-metrics-bar">
				<div class="p-2 rounded border bg-muted/20">
					<div class="text-[10px] text-muted-foreground uppercase">Domaines / DCs</div>
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
					<div class="text-[10px] text-muted-foreground uppercase">Hôtes capm3 (sushy)</div>
					<div class="font-mono font-bold text-foreground">{activeWhatIfScenario.estimatedBareMetalHosts}</div>
				</div>
				<div class="p-2 rounded border bg-muted/20">
					<div class="text-[10px] text-muted-foreground uppercase">Survie Perte DC1</div>
					<div
						class="font-mono font-bold {activeWhatIfScenario.primaryDcLossSurvives
							? 'text-emerald-600 dark:text-emerald-400'
							: 'text-rose-600 dark:text-rose-400'}"
					>
						{activeWhatIfScenario.primaryDcLossSurvives ? 'QUORUM & CAPACITÉ OK' : 'PERTE QUORUM ETCD'}
					</div>
				</div>
				<div class="p-2 rounded border bg-muted/20">
					<div class="text-[10px] text-muted-foreground uppercase">RTO Pire Cas</div>
					<div class="font-mono font-bold text-foreground">
						{activeWhatIfScenario.worstCaseRtoSeconds ?? 0}s
					</div>
				</div>
			</div>

			{#if activeWhatIfScenario.faultResults?.length}
				<div class="rounded-lg border bg-muted/10 p-3 space-y-2 text-xs" data-testid="twin-fault-matrix">
					<div class="font-semibold text-foreground flex items-center justify-between">
						<span>Simulation d'Injections de Pannes — {activeWhatIfScenario.profileLabel || selectedTwinProfileId}</span>
						<span class="text-[11px] font-mono text-muted-foreground">Moteur T1 Analytique + Bouchon Redfish sushy</span>
					</div>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
						{#each activeWhatIfScenario.faultResults as fault (fault.faultId)}
							<div class="p-2 rounded border bg-background flex flex-col gap-1">
								<div class="flex items-center justify-between gap-2 font-semibold">
									<span>{fault.faultLabel}</span>
									<span
										class="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase {fault.survivesZeroTouch
											? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
											: 'bg-rose-500/15 text-rose-700 dark:text-rose-300'}"
									>
										{fault.survivesZeroTouch ? `RTO 0s · Survit` : `RTO ${fault.estimatedRtoSeconds}s · Dégradé`}
									</span>
								</div>
								<div class="text-[11px] text-muted-foreground font-mono">
									{fault.explanation}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if showSushyEmulatorPreview && activeWhatIfScenario.sushyEmulator}
				<div class="rounded-lg border bg-slate-950 text-slate-100 p-3 space-y-2 text-xs" data-testid="sushy-emulator-preview">
					<div class="flex items-center justify-between">
						<span class="font-mono font-bold text-cyan-300">
							sushy-emulator.conf ({activeWhatIfScenario.sushyEmulator.image} · {activeWhatIfScenario.sushyEmulator.systems.length} BMC Redfish capm3)
						</span>
						<span class="text-[10px] font-mono text-slate-400">Driver: {activeWhatIfScenario.sushyEmulator.driver}</span>
					</div>
					<pre class="overflow-x-auto text-[11px] font-mono leading-relaxed max-h-56">{activeWhatIfScenario.sushyEmulator.configText}</pre>
				</div>
			{/if}
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
