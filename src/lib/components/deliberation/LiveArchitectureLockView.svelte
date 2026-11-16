<script lang="ts">
	import MermaidViewer from './MermaidViewer.svelte';
	import { Lock, CheckCircle2, AlertTriangle, Sparkles, FileCode2, Layers, Network, Table2 } from 'lucide-svelte';

	interface Props {
		projectId: string;
		decisionSlotsState?: any;
		projectCatalogState?: any;
		onUpdated?: () => void | Promise<void>;
	}

	let {
		projectId,
		decisionSlotsState = null,
		projectCatalogState = null,
		onUpdated
	}: Props = $props();

	let localSlotsState = $state<any>(null);
	let activeViewTab = $state<'cartography' | 'slots' | 'manifest' | 'mermaid'>('cartography');
	let componentFilter = $state<'all' | 'locked' | 'proposed' | 'emergent'>('all');
	let selectedPillarFilter = $state<'security' | 'observability' | 'configuration' | null>(null);
	let selectedComponentName = $state<string | null>(null);
	let mermaidLockedOnlyMode = $state<boolean>(false);
	let emergentComponentInput = $state('');
	let slotLeafOverrides = $state<Record<string, string>>({});
	let isActionRunning = $state(false);
	let actionMessage = $state<string | null>(null);
	let actionError = $state<string | null>(null);

	const effectiveState = $derived(decisionSlotsState || localSlotsState);
	const ledger = $derived(effectiveState?.ledger || null);
	const liveSnapshot = $derived(effectiveState?.liveLockSnapshot || null);
	const sealedLock = $derived(effectiveState?.architectureLock || liveSnapshot?.sealedManifest || null);

	async function refreshLocalState() {
		if (!projectId) return;
		if (onUpdated) {
			await onUpdated();
		}
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/decision-slots`);
			if (res.ok) {
				localSlotsState = await res.json();
			}
		} catch {
			// non bloquant
		}
	}

	$effect(() => {
		if (projectId && !decisionSlotsState) {
			void refreshLocalState();
		}
	});

	const allComponents = $derived<any[]>(liveSnapshot?.components || []);

	const filteredComponents = $derived(
		allComponents.filter((c) => {
			if (componentFilter === 'locked') {
				return c.lockStatus === 'locked' || c.lockStatus === 'emergent_locked';
			}
			if (componentFilter === 'proposed') {
				return c.lockStatus === 'default_proposed';
			}
			if (componentFilter === 'emergent') {
				return Boolean(c.isEmergent);
			}
			return true;
		})
	);

	const selectedComponent = $derived(
		allComponents.find((c) => c.name === selectedComponentName) ||
			filteredComponents[0] ||
			allComponents[0] ||
			null
	);

	const verticalPlaneDefinitions = [
		{
			id: 'workloads-apps',
			title: 'Plan 1a · Workloads Applicatifs & Capacités Émergentes',
			subtitle: 'Applications métier, services de traitement et capacités RFP inédites',
			badgeClass: 'bg-violet-500/15 text-violet-800 dark:text-violet-300 border-violet-500/30'
		},
		{
			id: 'workloads-core',
			title: 'Plan 1b · Fonctions Réseau 4G/5GC & Médiation Inter-Opérateurs',
			subtitle: 'Cœur 5GC, SecGW, DEA, Proxy EIR & interfaces externes 3GPP',
			badgeClass: 'bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/30'
		},
		{
			id: 'caas-infra',
			title: 'Plan 2 · Clusters CaaS Sylva, Pools & Stockage',
			subtitle: 'Pools RKE2 DPDK / NIS2, CNI Cilium/Multus, stockage distribué',
			badgeClass: 'bg-slate-500/15 text-slate-800 dark:text-slate-300 border-slate-500/30'
		}
	] as const;

	const transversePillars = $derived<any[]>(liveSnapshot?.transversePillars || []);
	const sylvaRuntimePlanes = $derived<any>(liveSnapshot?.sylvaRuntimePlanes || null);

	async function handleRatifyType2Batch() {
		if (!projectId || isActionRunning) return;
		isActionRunning = true;
		actionMessage = null;
		actionError = null;
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
				actionError = data.error || 'Échec de la ratification en lot.';
			} else {
				localSlotsState = data;
				actionMessage = `${data.receipt?.ratifiedSlotIds?.length || 0} emplacement(s) Type 2 ratifiés et composants transverses instanciés (${(data.instantiatedComponents || []).join(', ')}).`;
				await refreshLocalState();
			}
		} catch (e: any) {
			actionError = e.message || 'Erreur réseau.';
		} finally {
			isActionRunning = false;
		}
	}

	async function handleRatifySingleSlot(slotId: string, leafUrn?: string) {
		if (!projectId || !slotId || isActionRunning) return;
		isActionRunning = true;
		actionMessage = null;
		actionError = null;
		try {
			const chosenLeaf = leafUrn || slotLeafOverrides[slotId];
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/decision-slots`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'ratify_batch',
					actorRole: 'lead_architect',
					slotIds: [slotId],
					leafOverrides: chosenLeaf ? { [slotId]: chosenLeaf } : undefined,
					rationale: `Ratification unitaire explicite de l'emplacement ${slotId} depuis la Vue Architecture Lockée.`
				})
			});
			const data = await res.json();
			if (!res.ok || data.status === 'error') {
				actionError = data.error || 'Échec de la ratification de cet emplacement.';
			} else {
				localSlotsState = data;
				actionMessage = `Emplacement « ${slotId} » verrouillé avec succès.`;
				await refreshLocalState();
			}
		} catch (e: any) {
			actionError = e.message || 'Erreur réseau.';
		} finally {
			isActionRunning = false;
		}
	}

	async function handleSealArchitectureLock() {
		if (!projectId || isActionRunning) return;
		isActionRunning = true;
		actionMessage = null;
		actionError = null;
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
				actionError =
					data.error ||
					'Verrouillage architecture.lock refusé (emplacements non ratifiés ou violation OPA).';
			} else {
				localSlotsState = data;
				actionMessage = `Manifeste architecture.lock scellé avec succès (SHA-256 : ${data.architectureLock?.integritySha256?.slice(0, 16)}…).`;
				await refreshLocalState();
			}
		} catch (e: any) {
			actionError = e.message || 'Erreur réseau.';
		} finally {
			isActionRunning = false;
		}
	}

	async function handleInstantiateEmergentComponent() {
		const targetName = emergentComponentInput.trim();
		if (!projectId || !targetName || isActionRunning) return;
		isActionRunning = true;
		actionMessage = null;
		actionError = null;
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
				actionError = data.error || 'Échec de l’instanciation du composant émergent.';
			} else {
				actionMessage = `Composant logique émergent « ${data.component?.metadata?.name || targetName} » instancié dans le catalogue et projeté dans le Jumeau Sylva.`;
				await refreshLocalState();
			}
		} catch (e: any) {
			actionError = e.message || 'Erreur réseau.';
		} finally {
			isActionRunning = false;
		}
	}

	function downloadLockJson() {
		const payload = sealedLock || liveSnapshot;
		if (!payload) return;
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${projectId}.architecture.lock.json`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div
	class="rounded-xl border bg-card p-4 shadow-xs space-y-4 text-xs"
	data-testid="phase5-decision-slots-card"
>
	<!-- En-tête & Actions de Verrouillage -->
	<div class="flex items-center justify-between gap-2 flex-wrap border-b pb-3">
		<div class="space-y-1">
			<div class="flex items-center gap-2 flex-wrap">
				<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/15 text-amber-800 dark:text-amber-300">
					Invariant Zéro Défaut Silencieux · TOGAF 7 Domaines · architecture.lock
				</span>
				{#if liveSnapshot}
					<span
						class="px-2 py-0.5 rounded font-mono text-[10px] font-bold border {liveSnapshot.lockState ===
						'sealed'
							? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
							: liveSnapshot.lockState === 'ready_to_seal'
								? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-800 dark:text-indigo-200'
								: 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-200'}"
						data-testid="live-lock-state-badge"
					>
						{#if liveSnapshot.lockState === 'sealed'}
							🔒 ARCHITECTURE SCELLÉE · SHA-256 : {liveSnapshot.liveIntegritySha256.slice(0, 12)}…
						{:else if liveSnapshot.lockState === 'ready_to_seal'}
							🟢 100 % RATIFIÉ (PRÊT À SCELLER) · SHA-256 : {liveSnapshot.liveIntegritySha256.slice(0, 12)}…
						{:else}
							🟡 LOCK EN DIRECT ({liveSnapshot.summary.completionPercent}% verrouillé) · SHA-256 : {liveSnapshot.liveIntegritySha256.slice(0, 12)}…
						{/if}
					</span>
				{/if}
			</div>
			<h3 class="text-sm font-bold text-foreground">
				Vue de l'Architecture Lockée en Direct (Instant t), Allocation des Composants & Scellement
			</h3>
		</div>

		<div class="flex items-center gap-2 flex-wrap">
			<div class="inline-flex items-center gap-1">
				<input
					type="text"
					bind:value={emergentComponentInput}
					placeholder="ex: iot-gateway"
					class="rounded border bg-background px-2 py-1 font-mono text-xs w-36"
					data-testid="phase5-emergent-component-input"
				/>
				<button
					type="button"
					disabled={isActionRunning}
					onclick={handleInstantiateEmergentComponent}
					class="px-2.5 py-1 rounded border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20 text-violet-800 dark:text-violet-200 font-semibold text-xs cursor-pointer"
					title="Instancier un nouveau composant logique pour un besoin fonctionnel inédit (ex: IoT, Vidéo, IA)"
					data-testid="phase5-instantiate-emergent-btn"
				>
					+ Instancier composant émergent
				</button>
			</div>
			<button
				type="button"
				disabled={isActionRunning || (ledger?.type2RatificationQueue?.length ?? 1) === 0}
				onclick={handleRatifyType2Batch}
				class="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer"
				data-testid="phase5-ratify-batch-btn"
			>
				✓ Ratifier commodités Type 2 en lot ({ledger?.type2RatificationQueue?.length ?? 0})
			</button>
			<button
				type="button"
				disabled={isActionRunning}
				onclick={handleSealArchitectureLock}
				class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer"
				data-testid="phase5-seal-lock-btn"
			>
				🔒 Sceller architecture.lock (SHA-256)
			</button>
		</div>
	</div>

	{#if actionMessage}
		<div class="p-2 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 font-medium">
			✓ {actionMessage}
		</div>
	{/if}
	{#if actionError}
		<div class="p-2 rounded border border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-200 font-medium">
			⚠️ {actionError}
		</div>
	{/if}

	<!-- Compteurs Synthétiques -->
	{#if ledger}
		<div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
			<div class="p-2 rounded border bg-muted/20">
				<div class="text-[10px] text-muted-foreground uppercase">Ratification Humaine</div>
				<div class="font-mono font-bold text-foreground">
					{Math.round((ledger.conscientiousMetrics?.humanRatifiedRatio || 0) * 100)}% ({liveSnapshot?.summary?.lockedSlotsCount || 0}/{ledger.conscientiousMetrics?.totalSlots || 0})
				</div>
			</div>
			<div class="p-2 rounded border bg-muted/20">
				<div class="text-[10px] text-muted-foreground uppercase">Défauts Proposés</div>
				<div
					class="font-mono font-bold {ledger.conscientiousMetrics?.defaultProposedSlots > 0
						? 'text-amber-600 dark:text-amber-400'
						: 'text-emerald-600 dark:text-emerald-400'}"
				>
					{ledger.conscientiousMetrics?.defaultProposedSlots || 0} à ratifier
				</div>
			</div>
			<div class="p-2 rounded border bg-muted/20">
				<div class="text-[10px] text-muted-foreground uppercase">File Type 1 / Type 2</div>
				<div class="font-mono font-bold text-foreground">
					{ledger.type1DeliberationQueue?.length || 0} T1 · {ledger.type2RatificationQueue?.length || 0} T2
				</div>
			</div>
			<div class="p-2 rounded border bg-muted/20">
				<div class="text-[10px] text-muted-foreground uppercase">Composants Lockés / Total</div>
				<div class="font-mono font-bold text-foreground">
					{liveSnapshot?.summary?.lockedComponentsCount || 0} lockés / {liveSnapshot?.summary?.totalComponentsCount || projectCatalogState?.bundle?.components?.length || 0}
				</div>
			</div>
			<div class="p-2 rounded border bg-muted/20">
				<div class="text-[10px] text-muted-foreground uppercase">État architecture.lock</div>
				<div
					class="font-mono font-bold {sealedLock
						? 'text-emerald-600 dark:text-emerald-400'
						: ledger.readyForArchitectureLock
							? 'text-indigo-600 dark:text-indigo-400'
							: 'text-amber-600 dark:text-amber-400'}"
				>
					{sealedLock
						? `SCELLÉ (${sealedLock.integritySha256.slice(0, 10)}…)`
						: ledger.readyForArchitectureLock
							? 'PRÊT À SCELLER'
							: 'PARTIEL (Choix requis)'}
				</div>
			</div>
		</div>
	{/if}

	<!-- Pastilles rapides de composants consolidés -->
	{#if allComponents.length}
		<div class="flex items-center gap-1.5 flex-wrap">
			<span class="text-[11px] font-semibold text-muted-foreground">Composants logiques consolidés :</span>
			{#each allComponents as comp (comp.name)}
				<button
					type="button"
					onclick={() => {
						selectedComponentName = comp.name;
						activeViewTab = 'cartography';
					}}
					class="px-2 py-0.5 rounded font-mono text-[10px] border cursor-pointer transition-all {comp.lockStatus ===
					'emergent_locked'
						? 'bg-violet-500/15 border-violet-500/40 text-violet-800 dark:text-violet-200 font-bold'
						: comp.lockStatus === 'locked'
							? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-200 font-bold'
							: comp.lockStatus === 'default_proposed'
								? 'bg-amber-500/10 border-amber-500/40 border-dashed text-amber-800 dark:text-amber-200'
								: 'bg-background text-foreground'}"
					data-testid="phase5-consolidated-component-pill"
				>
					{comp.lockStatus === 'emergent_locked'
						? '🟣 '
						: comp.lockStatus === 'locked'
							? '🔒 '
							: comp.lockStatus === 'default_proposed'
								? '🟠 '
								: ''}{comp.name}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Barre d'onglets du Cockpit d'Architecture Lockée -->
	<div class="flex items-center justify-between gap-2 flex-wrap border-b pt-1 pb-2">
		<div class="flex items-center gap-1.5 flex-wrap">
			<button
				type="button"
				onclick={() => (activeViewTab = 'cartography')}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer {activeViewTab ===
				'cartography'
					? 'bg-indigo-600 text-white'
					: 'bg-muted/40 text-foreground hover:bg-muted'}"
				data-testid="live-lock-tab-cartography"
			>
				<Layers class="h-3.5 w-3.5" />
				<span>1. Cartographie Interactive par Couches & Inspecteur</span>
			</button>
			<button
				type="button"
				onclick={() => (activeViewTab = 'slots')}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer {activeViewTab ===
				'slots'
					? 'bg-indigo-600 text-white'
					: 'bg-muted/40 text-foreground hover:bg-muted'}"
				data-testid="live-lock-tab-slots"
			>
				<Table2 class="h-3.5 w-3.5" />
				<span>2. Matrice des Emplacements ({liveSnapshot?.slots?.length || 0})</span>
			</button>
			<button
				type="button"
				onclick={() => (activeViewTab = 'manifest')}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer {activeViewTab ===
				'manifest'
					? 'bg-indigo-600 text-white'
					: 'bg-muted/40 text-foreground hover:bg-muted'}"
				data-testid="live-lock-tab-manifest"
			>
				<FileCode2 class="h-3.5 w-3.5" />
				<span>3. Manifeste architecture.lock (JSON Live)</span>
			</button>
			<button
				type="button"
				onclick={() => (activeViewTab = 'mermaid')}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer {activeViewTab ===
				'mermaid'
					? 'bg-indigo-600 text-white'
					: 'bg-muted/40 text-foreground hover:bg-muted'}"
				data-testid="live-lock-tab-mermaid"
			>
				<Network class="h-3.5 w-3.5" />
				<span>4. Graphe Mermaid (Export Documentaire Filtré)</span>
			</button>
		</div>
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- ONGLET 1 : CARTOGRAPHIE INTERACTIVE PAR COUCHES & INSPECTEUR MULTI-NIVEAU -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{#if activeViewTab === 'cartography'}
		<div class="space-y-3" data-testid="live-lock-cartography-view">
			<!-- Filtres par statut de verrouillage -->
			<div class="flex items-center justify-between gap-2 flex-wrap bg-muted/20 p-2 rounded-lg border">
				<div class="flex items-center gap-1.5 flex-wrap">
					<span class="text-[11px] font-semibold text-muted-foreground mr-1">Filtrer l'architecture :</span>
					<button
						type="button"
						onclick={() => (componentFilter = 'all')}
						class="px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer {componentFilter === 'all'
							? 'bg-foreground text-background'
							: 'bg-background border text-foreground hover:bg-muted'}"
						data-testid="live-lock-filter-all"
					>
						Tous ({allComponents.length})
					</button>
					<button
						type="button"
						onclick={() => (componentFilter = 'locked')}
						class="px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer {componentFilter === 'locked'
							? 'bg-emerald-600 text-white'
							: 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/20'}"
						data-testid="live-lock-filter-locked"
					>
						🔒 Verrouillés uniquement ({liveSnapshot?.summary?.lockedComponentsCount || 0})
					</button>
					<button
						type="button"
						onclick={() => (componentFilter = 'proposed')}
						class="px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer {componentFilter === 'proposed'
							? 'bg-amber-600 text-white'
							: 'bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 hover:bg-amber-500/20'}"
						data-testid="live-lock-filter-proposed"
					>
						🟠 Défauts proposés ({liveSnapshot?.summary?.proposedComponentsCount || 0})
					</button>
					<button
						type="button"
						onclick={() => (componentFilter = 'emergent')}
						class="px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer {componentFilter === 'emergent'
							? 'bg-violet-600 text-white'
							: 'bg-violet-500/10 border border-violet-500/30 text-violet-800 dark:text-violet-200 hover:bg-violet-500/20'}"
						data-testid="live-lock-filter-emergent"
					>
						🟣 Émergents / Inédits ({liveSnapshot?.summary?.emergentComponentsCount || 0})
					</button>
				</div>
				<span class="text-[11px] text-muted-foreground">
					Cliquez sur un composant pour inspecter ses NICs, VRFs, clauses RFP et décisions sources.
				</span>
			</div>

			<div class="grid grid-cols-1 xl:grid-cols-12 gap-4">
				<!-- COLONNE PRINCIPALE : EMPILEMENT VERTICAL SYLVA (6/12) + 3 PILIERS TRANSVERSES (3/12) -->
				<div class="xl:col-span-5 space-y-3">
					<div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
						Empilement Vertical d'Exécution Sylva (Workloads → CaaS → Bare-Metal)
					</div>
					{#each verticalPlaneDefinitions as planeDef (planeDef.id)}
						{@const planeComps = filteredComponents.filter((c) => c.layer === planeDef.id)}
						{#if planeComps.length > 0 || planeDef.id === 'caas-infra'}
							<div class="rounded-lg border bg-background p-3 space-y-2">
								<div class="flex items-start justify-between gap-2">
									<div>
										<span class="px-2 py-0.5 rounded text-[10px] font-bold border {planeDef.badgeClass}">
											{planeDef.title}
										</span>
										<div class="text-[10px] text-muted-foreground mt-1">
											{planeDef.subtitle}
										</div>
									</div>
									<span class="font-mono text-[10px] text-muted-foreground shrink-0">
										{planeComps.length} comp.
									</span>
								</div>

								{#if planeComps.length > 0}
									<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
										{#each planeComps as comp (comp.name)}
											{@const isSelected = selectedComponent?.name === comp.name}
											{@const highlightedByPillar =
												!selectedPillarFilter || comp.transverseBindings?.[selectedPillarFilter]?.covered}
											<div
												role="button"
												tabindex="0"
												onclick={() => (selectedComponentName = comp.name)}
												onkeydown={(e) => e.key === 'Enter' && (selectedComponentName = comp.name)}
												class="rounded-lg p-2.5 border text-left transition-all cursor-pointer space-y-1.5 {comp.lockStatus ===
												'emergent_locked'
													? 'border-violet-500/60 bg-violet-500/5'
													: comp.lockStatus === 'locked'
														? 'border-emerald-500/60 bg-emerald-500/5'
														: comp.lockStatus === 'default_proposed'
															? 'border-amber-500/60 border-dashed bg-amber-500/5'
															: 'border-border bg-muted/10'} {isSelected ? 'ring-2 ring-indigo-500 shadow-xs' : ''} {!highlightedByPillar ? 'opacity-40' : ''}"
												data-testid="live-lock-component-card-{comp.name}"
											>
												<div class="flex items-center justify-between gap-1.5 flex-wrap">
													<span class="font-mono font-bold text-xs text-foreground">{comp.name}</span>
													<span
														class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase {comp.lockStatus ===
														'emergent_locked'
															? 'bg-violet-600 text-white'
															: comp.lockStatus === 'locked'
																? 'bg-emerald-600 text-white'
																: comp.lockStatus === 'default_proposed'
																	? 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40'
																	: 'bg-slate-500/20 text-slate-700 dark:text-slate-300'}"
													>
														{comp.lockStatus === 'emergent_locked'
															? '🟣 Émergent Locké'
															: comp.lockStatus === 'locked'
																? '🔒 Verrouillé'
																: comp.lockStatus === 'default_proposed'
																	? '🟠 Défaut proposé'
																	: '🛡️ Socle'}
													</span>
												</div>

												<div class="text-[11px] font-medium text-foreground/90 truncate">
													{comp.displayName}
												</div>

												<!-- Couverture des 3 Piliers Transverses sur ce composant -->
												{#if comp.transverseBindings}
													<div class="flex items-center gap-1 flex-wrap text-[9px] font-mono">
														<span
															class="px-1 py-0.2 rounded border {comp.transverseBindings.security.covered
																? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
																: 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'}"
															title="Sécurité, Vault, PKI & Firewall"
														>
															🛡️ Séc
														</span>
														<span
															class="px-1 py-0.2 rounded border {comp.transverseBindings.observability.covered
																? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-700 dark:text-cyan-300'
																: 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'}"
															title="Observabilité, NIC events & SIEM"
														>
															📡 Obs
														</span>
														<span
															class="px-1 py-0.2 rounded border {comp.transverseBindings.configuration.covered
																? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-700 dark:text-indigo-300'
																: 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'}"
															title="Configuration GitOps, Helm OCI & ref(param.*)"
														>
															⚙️ Cfg
														</span>
														{#if comp.coveredRequirementRefs?.length > 0}
															<span class="text-indigo-600 dark:text-indigo-400 font-semibold ml-auto">
																{comp.coveredRequirementRefs.slice(0, 2).join(', ')}
															</span>
														{/if}
													</div>
												{/if}

												{#if comp.lockStatus === 'default_proposed' && comp.sourceSlotIds?.[0]}
													<div class="pt-1">
														<button
															type="button"
															disabled={isActionRunning}
															onclick={(e) => {
																e.stopPropagation();
																void handleRatifySingleSlot(comp.sourceSlotIds[0]);
															}}
															class="w-full px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[10px] cursor-pointer"
															data-testid="live-lock-ratify-card-{comp.name}"
														>
															✓ Ratifier l'allocation de {comp.name}
														</button>
													</div>
												{/if}
											</div>
										{/each}
									</div>
								{/if}

								{#if planeDef.id === 'caas-infra' && sylvaRuntimePlanes}
									<div class="rounded border bg-muted/20 p-2 space-y-1 text-[10px] font-mono">
										<div>
											<span class="text-muted-foreground">Pools Sylva CaaS :</span>
											{sylvaRuntimePlanes.pools.join(', ') || 'sylva-standard-nis2'}
										</div>
										<div>
											<span class="text-muted-foreground">Stockage SVM :</span>
											{sylvaRuntimePlanes.storageBackends.join(', ') || 'longhorn-nvme'}
										</div>
										<div>
											<span class="text-muted-foreground">Substrat Bare-Metal / DCs :</span>
											{sylvaRuntimePlanes.datacenters.join(', ')} · capm3 / sushy · 2N
										</div>
									</div>
								{/if}
							</div>
						{/if}
					{/each}
				</div>

				<!-- COLONNE CENTRALE : LES 3 PILIERS TRANSVERSES SYLVA (4/12) -->
				<div class="xl:col-span-4 space-y-3" data-testid="live-lock-transverse-pillars">
					<div class="flex items-center justify-between px-1">
						<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
							3 Piliers Transverses Sylva (Couvrent tous les plans)
						</span>
						{#if selectedPillarFilter}
							<button
								type="button"
								onclick={() => (selectedPillarFilter = null)}
								class="text-[10px] font-semibold text-indigo-600 hover:underline cursor-pointer"
							>
								Tout afficher
							</button>
						{/if}
					</div>

					{#each transversePillars as pillar (pillar.id)}
						{@const pillarComps = filteredComponents.filter((c) => c.transverseRole === pillar.id)}
						{@const isPillarSelected = selectedPillarFilter === pillar.id}
						<div
							role="button"
							tabindex="0"
							onclick={() =>
								(selectedPillarFilter = isPillarSelected ? null : pillar.id)}
							onkeydown={(e) =>
								e.key === 'Enter' &&
								(selectedPillarFilter = isPillarSelected ? null : pillar.id)}
							class="rounded-lg border p-3 space-y-2 cursor-pointer transition-all {isPillarSelected
								? 'ring-2 ring-indigo-500 bg-indigo-500/5 border-indigo-500/50'
								: 'bg-background hover:bg-muted/10'}"
							data-testid="live-lock-pillar-{pillar.id}"
						>
							<div class="flex items-start justify-between gap-2">
								<div>
									<div class="font-bold text-xs text-foreground">{pillar.title}</div>
									<div class="text-[10px] text-muted-foreground mt-0.5">{pillar.subtitle}</div>
								</div>
								<span class="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-muted border shrink-0">
									{pillar.coveredWorkloadsCount}/{pillar.totalWorkloadsCount} workloads
								</span>
							</div>

							<div class="flex items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground border-t pt-1.5">
								<span>Plan : {pillar.nicPlane}</span>
								<span>
									Axes lockés : {pillar.lockedSlotsCount}/{pillar.totalSlotsCount}
								</span>
							</div>

							{#if pillarComps.length > 0}
								<div class="flex items-center gap-1.5 flex-wrap pt-1">
									{#each pillarComps as pComp (pComp.name)}
										<button
											type="button"
											onclick={(e) => {
												e.stopPropagation();
												selectedComponentName = pComp.name;
											}}
											class="px-2 py-0.5 rounded font-mono text-[10px] border cursor-pointer {selectedComponent?.name ===
											pComp.name
												? 'ring-2 ring-indigo-500'
												: ''} {pComp.lockStatus === 'locked'
												? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-200 font-bold'
												: pComp.lockStatus === 'default_proposed'
													? 'bg-amber-500/10 border-amber-500/40 border-dashed text-amber-800 dark:text-amber-200'
													: 'bg-muted/30 text-foreground'}"
											data-testid="live-lock-component-card-{pComp.name}"
										>
											{pComp.lockStatus === 'locked' ? '🔒 ' : pComp.lockStatus === 'default_proposed' ? '🟠 ' : ''}{pComp.name}
										</button>
									{/each}
								</div>
							{:else if pillar.id === 'configuration'}
								<div class="text-[10px] font-mono text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 rounded px-2 py-1">
									FluxCD · Overlays prod/preprod/lab · ref(param.*)
								</div>
							{/if}
						</div>
					{/each}
				</div>

				<!-- Inspecteur Multi-Niveaux du Composant Sélectionné (3/12 largeur) -->
				<div
					class="xl:col-span-3 rounded-lg border bg-muted/15 p-3.5 space-y-3 self-start sticky top-4"
					data-testid="live-lock-component-inspector"
				>
					{#if selectedComponent}
						<div class="border-b pb-2 space-y-1">
							<div class="flex items-center justify-between gap-2">
								<span class="font-mono font-bold text-sm text-foreground">
									{selectedComponent.name}
								</span>
								<span class="font-mono text-[10px] px-2 py-0.5 rounded border bg-background">
									tenant: {selectedComponent.tenant}
								</span>
							</div>
							<div class="text-xs font-medium text-muted-foreground">
								{selectedComponent.displayName}
							</div>
						</div>

						<!-- 1. Traçabilité Décisionnelle & Statut de Verrouillage -->
						<div class="space-y-1">
							<div class="text-[10px] font-bold uppercase text-muted-foreground">
								1. Statut de Verrouillage & Décisions Sources
							</div>
							{#if selectedComponent.sourceAxisTitles?.length > 0}
								<ul class="space-y-1 text-[11px]">
									{#each selectedComponent.sourceAxisTitles as axisTitle}
										<li class="px-2 py-1 rounded bg-background border font-medium">
											{axisTitle}
										</li>
									{/each}
								</ul>
							{:else}
								<div class="text-[11px] text-muted-foreground italic">
									Composant du socle de référence ou dépendance transitive ({selectedComponent.dependsOn.join(', ') || 'socle'}).
								</div>
							{/if}

							{#if selectedComponent.coveredRequirementRefs?.length > 0}
								<div class="flex items-center gap-1 flex-wrap pt-1">
									<span class="text-[10px] text-muted-foreground">Clauses RFP :</span>
									{#each selectedComponent.coveredRequirementRefs as ref}
										<span class="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 font-mono text-[10px] text-indigo-800 dark:text-indigo-200">
											{ref}
										</span>
									{/each}
								</div>
							{/if}

							{#if selectedComponent.ratifiedBy}
								<div class="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 pt-1">
									✓ Ratifié par {selectedComponent.ratifiedBy}
								</div>
							{/if}
						</div>

						<!-- 2. Topologie Réseau Multi-NIC & VRFs -->
						<div class="space-y-1 border-t pt-2">
							<div class="text-[10px] font-bold uppercase text-muted-foreground">
								2. Empreinte Réseau (Multi-NIC & VRFs)
							</div>
							<div class="text-[11px] font-mono space-y-1">
								<div>
									<span class="text-muted-foreground">NICs ({selectedComponent.nicsCount}) :</span>
									{selectedComponent.nicClasses.join(', ') || 'aucune (externe)'}
								</div>
								<div>
									<span class="text-muted-foreground">VRFs :</span>
									{selectedComponent.vrfNames.join(', ') || 'n/a'}
								</div>
								{#if selectedComponent.storageSvms?.length > 0}
									<div>
										<span class="text-muted-foreground">Stockage SVM :</span>
										{selectedComponent.storageSvms.join(', ')}
									</div>
								{/if}
							</div>
						</div>

						<!-- 3. Rattachement aux 3 Piliers Transverses Sylva -->
						{#if selectedComponent.transverseBindings}
							<div class="space-y-1.5 border-t pt-2">
								<div class="text-[10px] font-bold uppercase text-muted-foreground">
									3. Ancrage Piliers Transverses Sylva
								</div>
								<div class="space-y-1 text-[10px] font-mono">
									<div class="px-2 py-1 rounded bg-background border">
										<span class="font-bold">🛡️ Sécurité :</span>
										{selectedComponent.transverseBindings.security.vaultMount || 'pas de Vault'} ·
										{selectedComponent.transverseBindings.security.autoRenewCerts} cert(s) TLS ·
										{selectedComponent.transverseBindings.security.firewallPolicy || 'n/a'}
									</div>
									<div class="px-2 py-1 rounded bg-background border">
										<span class="font-bold">📡 Observabilité :</span>
										{selectedComponent.transverseBindings.observability.hasEventsNic
											? `NIC events (${selectedComponent.transverseBindings.observability.eventsVrf || 'events'})`
											: 'aucune NIC events'} ·
										{selectedComponent.transverseBindings.observability.siemLinked ? 'SIEM OK' : 'SIEM absent'}
									</div>
									<div class="px-2 py-1 rounded bg-background border">
										<span class="font-bold">⚙️ Configuration :</span>
										{selectedComponent.transverseBindings.configuration.helmCharts.join(', ') || 'externe'} ·
										{selectedComponent.transverseBindings.configuration.paramRefs.length} ref(param.*)
									</div>
								</div>
							</div>
						{/if}

						<!-- 4. Flux Logiques, Contrats & Dépendances -->
						<div class="space-y-1 border-t pt-2">
							<div class="text-[10px] font-bold uppercase text-muted-foreground">
								4. Flux Sortants & Dépendances ({selectedComponent.outboundTargets?.length || 0})
							</div>
							{#if selectedComponent.outboundTargets?.length > 0}
								<div class="space-y-1 max-h-40 overflow-y-auto">
									{#each selectedComponent.outboundTargets as edge}
										<div class="px-2 py-1 rounded bg-background border font-mono text-[10px] flex items-center justify-between gap-2">
											<span class="font-bold text-foreground">→ {edge.target}</span>
											<span class="text-muted-foreground truncate">{edge.label}</span>
										</div>
									{/each}
								</div>
							{:else}
								<div class="text-[11px] text-muted-foreground">Aucun flux sortant déclaré.</div>
							{/if}
						</div>
					{:else}
						<div class="text-muted-foreground text-center py-6">
							Sélectionnez un composant pour inspecter ses propriétés.
						</div>
					{/if}
				</div>
			</div>
		</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- ONGLET 2 : MATRICE DES EMPLACEMENTS DE DÉCISION (AXE -> COMPOSANT -> LOCK)-->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{:else if activeViewTab === 'slots'}
		<div class="space-y-2 overflow-x-auto" data-testid="live-lock-slots-table">
			<table class="w-full text-left border-collapse text-xs">
				<thead>
					<tr class="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
						<th class="p-2">Statut Lock</th>
						<th class="p-2">Axe TOGAF / Emplacement</th>
						<th class="p-2">Variante / Feuille Ontologique</th>
						<th class="p-2">Composant(s) Instancié(s)</th>
						<th class="p-2">Action</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each liveSnapshot?.slots || [] as slot (slot.slotId)}
						<tr class="hover:bg-muted/15" data-testid="live-lock-slot-row-{slot.slotId}">
							<td class="p-2 whitespace-nowrap">
								<span
									class="px-2 py-0.5 rounded text-[10px] font-bold uppercase {slot.lockBadge === 'locked'
										? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
										: slot.lockBadge === 'default_proposed'
											? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
											: 'bg-rose-500/15 text-rose-800 dark:text-rose-300'}"
								>
									{slot.lockBadge === 'locked'
										? '🔒 Verrouillé'
										: slot.lockBadge === 'default_proposed'
											? '🟠 Défaut proposé'
											: '🔴 Ouvert'}
								</span>
							</td>
							<td class="p-2">
								<div class="font-semibold text-foreground">{slot.axisTitle}</div>
								<div class="font-mono text-[10px] text-muted-foreground">{slot.togafDomain}</div>
							</td>
							<td class="p-2">
								{#if slot.candidateLeaves?.length > 1}
									<select
										value={slotLeafOverrides[slot.slotId] || slot.boundLeafUrn || slot.candidateLeaves[0]?.urn}
										onchange={(e) =>
											(slotLeafOverrides[slot.slotId] = (e.currentTarget as HTMLSelectElement).value)}
										class="rounded border bg-background px-2 py-1 font-mono text-[11px] max-w-xs"
									>
										{#each slot.candidateLeaves as leaf}
											<option value={leaf.urn}>{leaf.title}</option>
										{/each}
									</select>
								{:else}
									<span class="font-mono text-[11px]">{slot.boundLeafTitle || 'Aucune'}</span>
								{/if}
							</td>
							<td class="p-2">
								<div class="flex items-center gap-1 flex-wrap">
									{#each slot.instantiatedComponents || [] as compName}
										<span class="px-1.5 py-0.5 rounded border bg-background font-mono text-[10px] font-bold">
											{compName}
										</span>
									{/each}
								</div>
							</td>
							<td class="p-2 whitespace-nowrap">
								{#if slot.lockBadge !== 'locked'}
									<button
										type="button"
										disabled={isActionRunning}
										onclick={() =>
											handleRatifySingleSlot(
												slot.slotId,
												slotLeafOverrides[slot.slotId] || slot.boundLeafUrn || slot.candidateLeaves?.[0]?.urn
											)}
										class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] cursor-pointer"
										data-testid="live-lock-ratify-slot-btn-{slot.slotId}"
									>
										✓ Ratifier cet axe
									</button>
								{:else}
									<span class="text-[11px] font-mono text-emerald-700 dark:text-emerald-300">
										Ratifié {slot.ratifiedBy ? `(${slot.ratifiedBy})` : ''}
									</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- ONGLET 3 : MANIFESTE ARCHITECTURE.LOCK TEMPS RÉEL (JSON & EXPORT)         -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{:else if activeViewTab === 'manifest'}
		<div class="space-y-2" data-testid="live-lock-manifest-view">
			<div class="flex items-center justify-between gap-2 flex-wrap">
				<span class="font-mono text-xs text-muted-foreground">
					{sealedLock
						? `Manifeste scellé officiel (SHA-256 : ${sealedLock.integritySha256})`
						: `Aperçu temps réel de l'état de verrouillage (${liveSnapshot?.summary?.lockedSlotsCount || 0}/${liveSnapshot?.summary?.totalSlots || 0} emplacements verrouillés)`}
				</span>
				<button
					type="button"
					onclick={downloadLockJson}
					class="px-2.5 py-1 rounded border bg-background hover:bg-muted font-semibold text-xs cursor-pointer"
					data-testid="live-lock-download-json-btn"
				>
					⬇ Télécharger {projectId}.architecture.lock.json
				</button>
			</div>
			<pre
				class="rounded-lg border bg-slate-950 text-slate-100 p-3 font-mono text-[11px] overflow-x-auto max-h-96 leading-relaxed"
			>{JSON.stringify(sealedLock || liveSnapshot, null, 2)}</pre>
		</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- ONGLET 4 : DIAGRAMME MERMAID D'EXPORT FILTRÉ (VERROUILLÉS VS COMPLET)      -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{:else if activeViewTab === 'mermaid'}
		<div class="space-y-3" data-testid="live-lock-mermaid-view">
			<div class="flex items-center justify-between gap-2 flex-wrap bg-muted/20 p-2 rounded-lg border">
				<div class="flex items-center gap-2">
					<button
						type="button"
						onclick={() => (mermaidLockedOnlyMode = false)}
						class="px-2.5 py-1 rounded text-xs font-semibold cursor-pointer {!mermaidLockedOnlyMode
							? 'bg-indigo-600 text-white'
							: 'bg-background border text-foreground'}"
						data-testid="live-lock-mermaid-full-btn"
					>
						Vue Complète avec Statuts (🔒 Locké / 🟠 Proposé / 🛡️ Socle)
					</button>
					<button
						type="button"
						onclick={() => (mermaidLockedOnlyMode = true)}
						class="px-2.5 py-1 rounded text-xs font-semibold cursor-pointer {mermaidLockedOnlyMode
							? 'bg-emerald-600 text-white'
							: 'bg-background border text-foreground'}"
						data-testid="live-lock-mermaid-locked-only-btn"
					>
						🔒 Uniquement les composants verrouillés ({liveSnapshot?.summary?.lockedComponentsCount || 0})
					</button>
				</div>
				<span class="text-[11px] text-muted-foreground">
					Rendu vectoriel figé destiné à l'export documentaire HLD / Word.
				</span>
			</div>

			{#if liveSnapshot}
				<MermaidViewer
					code={mermaidLockedOnlyMode
						? liveSnapshot.mermaidLockedOnly
						: liveSnapshot.mermaidFullWithStatus}
				/>
			{/if}
		</div>
	{/if}
</div>
