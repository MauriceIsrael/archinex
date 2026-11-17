<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import MermaidViewer from './MermaidViewer.svelte';
	import LiveArchitectureLockView from './LiveArchitectureLockView.svelte';
	import ComponentCatalogEditor from '$lib/components/edp/ComponentCatalogEditor.svelte';
	import { Layers, ShieldCheck, Lock, GitBranch, Network, FileCode2, Table2 } from 'lucide-svelte';

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
	let includeReferenceCatalog = $state(false);
	let showCatalogEditor = $state(false);
	let projectCatalogState = $state<any>(null);
	let decisionSlotsState = $state<any>(null);
	let isSlotActionRunning = $state(false);
	let slotActionMessage = $state<string | null>(null);
	let slotActionError = $state<string | null>(null);
	let emergentComponentInput = $state('');
	let lockViewNonce = $state(0);
	let requestedLockView = $state<{
		tab?: 'cartography' | 'slots' | 'manifest' | 'mermaid';
		pillarFilter?: 'security' | 'observability' | 'configuration' | null;
		nonce: number;
	} | null>(null);

	function focusLockCockpit(
		tab: 'cartography' | 'slots' | 'manifest' | 'mermaid',
		pillarFilter: 'security' | 'observability' | 'configuration' | null = null
	) {
		lockViewNonce += 1;
		requestedLockView = { tab, pillarFilter, nonce: lockViewNonce };
		if (typeof document !== 'undefined') {
			document
				.getElementById('phase5-lock-cockpit')
				?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	function focusLogicalViews(
		tab: 'logical' | 'deployment' | 'physical',
		options?: { openCatalog?: boolean; openSushy?: boolean }
	) {
		logicalViewsTab = tab;
		if (options?.openCatalog) showCatalogEditor = true;
		if (options?.openSushy) showSushyEmulatorPreview = true;
		if (typeof document !== 'undefined') {
			document
				.getElementById('phase5-logical-views')
				?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	async function loadProjectCatalogViews() {
		if (!projectId) return;
		try {
			const [catRes, slotsRes] = await Promise.all([
				fetch(
					`/api/projects/${encodeURIComponent(projectId)}/catalog?env=${encodeURIComponent(selectedViewEnv)}&mode=${encodeURIComponent(twinArbitrationMode)}&mandatedProfile=${encodeURIComponent(selectedTwinProfileId)}&includeReferenceCatalog=${includeReferenceCatalog}`
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
		const _scope = includeReferenceCatalog;
		if (projectId && selectedViewEnv && twinArbitrationMode && selectedTwinProfileId) {
			void _scope;
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

	const liveSnapshot = $derived(decisionSlotsState?.liveLockSnapshot || null);
	const lockSummary = $derived(liveSnapshot?.summary || null);
	const transversePillars = $derived<any[]>(liveSnapshot?.transversePillars || []);
	const runtimePlanes = $derived<any>(liveSnapshot?.sylvaRuntimePlanes || null);
	const securityPillar = $derived(
		transversePillars.find((p: any) => p.id === 'security') || null
	);
	const observabilityPillar = $derived(
		transversePillars.find((p: any) => p.id === 'observability') || null
	);
	const configPillar = $derived(
		transversePillars.find((p: any) => p.id === 'configuration') || null
	);

	const socleStatus = $derived.by(() => {
		const total = lockSummary?.totalComponentsCount ?? 0;
		const locked = lockSummary?.lockedComponentsCount ?? 0;
		if (total > 0 && locked === total) {
			return { label: 'Verrouillé', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' };
		}
		if (locked > 0) {
			return { label: `${locked}/${total} lockés`, cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' };
		}
		return { label: 'À arbitrer', cls: 'bg-muted text-muted-foreground border-border' };
	});

	const securityStatus = $derived.by(() => {
		const total = securityPillar?.totalSlotsCount ?? 0;
		const locked = securityPillar?.lockedSlotsCount ?? 0;
		if (total > 0 && locked === total) {
			return { label: 'Verrouillé', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' };
		}
		if (locked > 0) {
			return { label: `${locked}/${total} axes`, cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' };
		}
		return { label: 'À ratifier', cls: 'bg-muted text-muted-foreground border-border' };
	});

	const governanceStatus = $derived.by(() => {
		const state = liveSnapshot?.lockState;
		if (state === 'sealed') {
			return { label: 'Scellé', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' };
		}
		if (state === 'ready_to_seal') {
			return { label: 'Prêt à sceller', cls: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30' };
		}
		return {
			label: `${lockSummary?.completionPercent ?? 0}% ratifié`,
			cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
		};
	});

	const gitopsStatus = $derived.by(() => {
		const total = configPillar?.totalSlotsCount ?? 0;
		const locked = configPillar?.lockedSlotsCount ?? 0;
		if (total > 0 && locked === total) {
			return { label: 'Verrouillé', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' };
		}
		if (projectCatalogState?.sylvaTwinReport?.verdict === 'compliant') {
			return { label: `Conforme (${selectedViewEnv})`, cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' };
		}
		return { label: 'À consolider', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' };
	});
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

	<!-- Plan structuré par 4 Piliers Transverses (Socle, Sécurité, Gestion, GitOps) -->
	<section
		class="rounded-xl border bg-card p-4 shadow-xs space-y-3"
		data-testid="phase5-transverse-pillars"
	>
		<div class="flex items-center justify-between gap-2 flex-wrap">
			<div>
				<h3 class="text-sm font-bold text-foreground">
					Plan de Consolidation par Piliers Transverses
				</h3>
				<p class="text-xs text-muted-foreground">
					Accès direct aux artefacts consolidés et aux statuts de verrouillage sur les 4 axes transverses du projet.
				</p>
			</div>
			{#if liveSnapshot}
				<span class="font-mono text-[11px] px-2 py-0.5 rounded border bg-muted/40 text-muted-foreground">
					Complétude globale : {lockSummary?.lockedSlotsCount ?? 0}/{lockSummary?.totalSlots ?? 0} emplacements ({lockSummary?.completionPercent ?? 0}%)
				</span>
			{/if}
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
			<!-- Pilier 1 : Socle / Architecture transverse -->
			<div
				class="rounded-lg border bg-background p-3.5 flex flex-col justify-between gap-3"
				data-testid="phase5-pillar-socle"
			>
				<div class="space-y-2">
					<div class="flex items-start justify-between gap-2">
						<div class="flex items-center gap-1.5">
							<Network class="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
							<span class="text-xs font-bold text-foreground">Socle / Architecture transverse</span>
						</div>
						<span class="px-1.5 py-0.5 rounded border font-mono text-[10px] font-bold shrink-0 {socleStatus.cls}">
							{socleStatus.label}
						</span>
					</div>
					<p class="text-[11px] text-muted-foreground leading-snug">
						Topologie logique, plans CaaS, pools de calcul, stockage et domaines de défaillance.
					</p>
					<div class="text-[11px] font-mono text-foreground/85 space-y-1 border-t pt-2">
						<div>
							Composants : <span class="font-bold">{lockSummary?.lockedComponentsCount ?? 0}/{lockSummary?.totalComponentsCount ?? 0}</span> verrouillés
						</div>
						<div>
							Pools / DCs : <span class="font-semibold">{runtimePlanes?.pools?.join(', ') || '—'}</span> · {(runtimePlanes?.datacenters || ['dc1', 'dc2', 'dc3']).join(', ')}
						</div>
					</div>
				</div>
				<div class="flex items-center gap-1.5 flex-wrap pt-1 border-t">
					<button
						type="button"
						onclick={() => focusLogicalViews('logical')}
						class="inline-flex items-center gap-1 px-2 py-1 rounded border bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold cursor-pointer"
						data-testid="pillar-socle-topology-btn"
					>
						<Network class="h-3 w-3" />
						<span>Vue Logique</span>
					</button>
					<button
						type="button"
						onclick={() => focusLockCockpit('cartography', null)}
						class="inline-flex items-center gap-1 px-2 py-1 rounded border bg-muted/40 hover:bg-muted text-foreground text-[11px] font-semibold cursor-pointer"
						data-testid="pillar-socle-cartography-btn"
					>
						<Layers class="h-3 w-3" />
						<span>Cartographie</span>
					</button>
				</div>
			</div>

			<!-- Pilier 2 : Sécurité -->
			<div
				class="rounded-lg border bg-background p-3.5 flex flex-col justify-between gap-3"
				data-testid="phase5-pillar-security"
			>
				<div class="space-y-2">
					<div class="flex items-start justify-between gap-2">
						<div class="flex items-center gap-1.5">
							<ShieldCheck class="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
							<span class="text-xs font-bold text-foreground">Sécurité</span>
						</div>
						<span class="px-1.5 py-0.5 rounded border font-mono text-[10px] font-bold shrink-0 {securityStatus.cls}">
							{securityStatus.label}
						</span>
					</div>
					<p class="text-[11px] text-muted-foreground leading-snug">
						{securityPillar?.subtitle || 'mTLS (PKI/HSM), gestion des secrets, IAM/PAM, pare-feu & politiques OPA.'}
					</p>
					<div class="text-[11px] font-mono text-foreground/85 space-y-1 border-t pt-2">
						<div>
							Axes lockés : <span class="font-bold">{securityPillar?.lockedSlotsCount ?? 0}/{securityPillar?.totalSlotsCount ?? 0}</span> · Workloads : <span class="font-bold">{securityPillar?.coveredWorkloadsCount ?? 0}/{securityPillar?.totalWorkloadsCount ?? 0}</span>
						</div>
						<div class="truncate" title={securityPillar?.dedicatedComponents?.join(', ') || ''}>
							Composants : <span class="font-semibold">{securityPillar?.dedicatedComponents?.join(', ') || 'Aucun instancié'}</span>
						</div>
					</div>
				</div>
				<div class="flex items-center gap-1.5 flex-wrap pt-1 border-t">
					<button
						type="button"
						onclick={() => focusLockCockpit('cartography', 'security')}
						class="inline-flex items-center gap-1 px-2 py-1 rounded border bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 text-[11px] font-semibold cursor-pointer"
						data-testid="pillar-security-filter-btn"
					>
						<ShieldCheck class="h-3 w-3" />
						<span>Bindings Sécurité</span>
					</button>
					<button
						type="button"
						onclick={() => focusLockCockpit('slots', 'security')}
						class="inline-flex items-center gap-1 px-2 py-1 rounded border bg-muted/40 hover:bg-muted text-foreground text-[11px] font-semibold cursor-pointer"
						data-testid="pillar-security-slots-btn"
					>
						<Table2 class="h-3 w-3" />
						<span>Emplacements</span>
					</button>
				</div>
			</div>

			<!-- Pilier 3 : Gestion / Gouvernance -->
			<div
				class="rounded-lg border bg-background p-3.5 flex flex-col justify-between gap-3"
				data-testid="phase5-pillar-governance"
			>
				<div class="space-y-2">
					<div class="flex items-start justify-between gap-2">
						<div class="flex items-center gap-1.5">
							<Lock class="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
							<span class="text-xs font-bold text-foreground">Gestion / Gouvernance</span>
						</div>
						<span class="px-1.5 py-0.5 rounded border font-mono text-[10px] font-bold shrink-0 {governanceStatus.cls}">
							{governanceStatus.label}
						</span>
					</div>
					<p class="text-[11px] text-muted-foreground leading-snug">
						Ratification Type 1/Type 2, scellement <code class="font-mono">architecture.lock</code>, observabilité & SLA.
					</p>
					<div class="text-[11px] font-mono text-foreground/85 space-y-1 border-t pt-2">
						<div>
							Blocages lock : <span class="font-bold">{liveSnapshot?.lockBlockers?.length ?? 0}</span> · Observabilité : <span class="font-bold">{observabilityPillar?.lockedSlotsCount ?? 0}/{observabilityPillar?.totalSlotsCount ?? 0}</span>
						</div>
						<div>
							Emplacements : <span class="font-semibold">{lockSummary?.lockedSlotsCount ?? 0}/{lockSummary?.totalSlots ?? 0}</span> ratifiés
						</div>
					</div>
				</div>
				<div class="flex items-center gap-1.5 flex-wrap pt-1 border-t">
					<button
						type="button"
						onclick={() => focusLockCockpit('manifest', null)}
						class="inline-flex items-center gap-1 px-2 py-1 rounded border bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-200 text-[11px] font-semibold cursor-pointer"
						data-testid="pillar-governance-manifest-btn"
					>
						<FileCode2 class="h-3 w-3" />
						<span>architecture.lock</span>
					</button>
					<button
						type="button"
						onclick={() => focusLockCockpit('slots', null)}
						class="inline-flex items-center gap-1 px-2 py-1 rounded border bg-muted/40 hover:bg-muted text-foreground text-[11px] font-semibold cursor-pointer"
						data-testid="pillar-governance-slots-btn"
					>
						<Table2 class="h-3 w-3" />
						<span>Matrice Décisions</span>
					</button>
				</div>
			</div>

			<!-- Pilier 4 : GitOps / Exploitation -->
			<div
				class="rounded-lg border bg-background p-3.5 flex flex-col justify-between gap-3"
				data-testid="phase5-pillar-gitops"
			>
				<div class="space-y-2">
					<div class="flex items-start justify-between gap-2">
						<div class="flex items-center gap-1.5">
							<GitBranch class="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
							<span class="text-xs font-bold text-foreground">GitOps / Exploitation</span>
						</div>
						<span class="px-1.5 py-0.5 rounded border font-mono text-[10px] font-bold shrink-0 {gitopsStatus.cls}">
							{gitopsStatus.label}
						</span>
					</div>
					<p class="text-[11px] text-muted-foreground leading-snug">
						{configPillar?.subtitle || 'Overlays prod/preprod/lab, charts Helm OCI / FluxCD, ref(param.*) & Redfish sushy.'}
					</p>
					<div class="text-[11px] font-mono text-foreground/85 space-y-1 border-t pt-2">
						<div>
							Axes Config : <span class="font-bold">{configPillar?.lockedSlotsCount ?? 0}/{configPillar?.totalSlotsCount ?? 0}</span> · env : <span class="font-bold">{selectedViewEnv}</span>
						</div>
						<div>
							Survie DC1 : <span class="font-semibold">{activeWhatIfScenario ? (activeWhatIfScenario.primaryDcLossSurvives ? 'Quorum OK' : 'Dégradé') : '—'}</span> · {activeWhatIfScenario?.sushyEmulator?.systems?.length ?? 0} BMC
						</div>
					</div>
				</div>
				<div class="flex items-center gap-1.5 flex-wrap pt-1 border-t">
					<button
						type="button"
						onclick={() => focusLogicalViews('deployment', { openCatalog: true })}
						class="inline-flex items-center gap-1 px-2 py-1 rounded border bg-violet-500/10 hover:bg-violet-500/20 text-violet-700 dark:text-violet-300 text-[11px] font-semibold cursor-pointer"
						data-testid="pillar-gitops-catalog-btn"
					>
						<GitBranch class="h-3 w-3" />
						<span>Catalogue & Overlays</span>
					</button>
					<button
						type="button"
						onclick={() => focusLogicalViews('deployment', { openSushy: true })}
						class="inline-flex items-center gap-1 px-2 py-1 rounded border bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 text-[11px] font-semibold cursor-pointer"
						data-testid="pillar-gitops-sushy-btn"
					>
						<FileCode2 class="h-3 w-3" />
						<span>Redfish sushy</span>
					</button>
				</div>
			</div>
		</div>
	</section>

	<!-- Cockpit Interactif : Vue de l'Architecture Lockée en Direct (Instant t), Allocation des Composants & Scellement architecture.lock -->
	<div id="phase5-lock-cockpit">
		<LiveArchitectureLockView
			{projectId}
			{decisionSlotsState}
			{projectCatalogState}
			requestedView={requestedLockView}
			onUpdated={loadProjectCatalogViews}
		/>
	</div>

	<!-- Vues synchronisées, Jumeau Numérique de Sylva (3 DCs / 2 DCs + Témoin / 2 DCs) & Catalogue Composants -->
	<div id="phase5-logical-views" class="rounded-xl border bg-card p-5 shadow-xs space-y-4" data-testid="phase5-logical-views-hub">
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
					onclick={() => (includeReferenceCatalog = !includeReferenceCatalog)}
					class="px-2.5 py-1 rounded border font-semibold text-xs cursor-pointer {includeReferenceCatalog
						? 'bg-slate-700 text-white border-slate-700'
						: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'}"
					data-testid="toggle-reference-catalog-btn"
				>
					{includeReferenceCatalog ? 'Catalogue complet (Réf.)' : 'Périmètre hydraté seul'}
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
