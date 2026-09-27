<script lang="ts">
	import { onMount } from 'svelte';
	import ContextualPostureSelector from '$lib/components/deliberation/ContextualPostureSelector.svelte';
	import DeliberationDashboardKpis from '$lib/components/deliberation/DeliberationDashboardKpis.svelte';
	import MaturityBoardTable from '$lib/components/deliberation/MaturityBoardTable.svelte';
	import TelegraphicDraftView from '$lib/components/deliberation/TelegraphicDraftView.svelte';
	import DialecticChatPanel from '$lib/components/deliberation/DialecticChatPanel.svelte';
	import RuleApprovalBanner from '$lib/components/deliberation/RuleApprovalBanner.svelte';
	import CorpusAppropriationHub from '$lib/components/deliberation/CorpusAppropriationHub.svelte';
	import ArtifactRegenerationHub from '$lib/components/deliberation/ArtifactRegenerationHub.svelte';
	import WhyInspector from '$lib/components/deliberation/WhyInspector.svelte';
	import FreezeSectionDialog from '$lib/components/deliberation/FreezeSectionDialog.svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import DecisionGuideModal from '$lib/components/deliberation/DecisionGuideModal.svelte';
	import {
		GitBranch,
		ShieldCheck,
		FileText,
		MessagesSquare,
		Layers,
		Lock,
		Building2,
		Globe,
		RefreshCw,
		HelpCircle,
		ChevronDown
	} from 'lucide-svelte';

	type MobileTab = 'board' | 'draft' | 'chat' | 'projections';
	let mobileTab = $state<MobileTab>('board');
	let isDecisionGuideOpen = $state<boolean>(false);

	const activeSubject = $derived(deliberationStore.activeSubject);
	const activeDoc = $derived(deliberationStore.activeDocument);

	onMount(async () => {
		await deliberationStore.syncWithLLMOps();
	});
</script>

<svelte:head>
	<title>Archinex · Deliberation Workbench</title>
</svelte:head>

<div class="space-y-4">
	<!-- En-tête Compact & Professionnel -->
	<div class="rounded-xl border bg-card p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
		<div>
			<div class="flex items-center gap-2 mb-1.5 flex-wrap">
				<!-- Sélecteur d'Instance d'Engagement -->
				<div class="relative inline-flex items-center">
					<select
						class="bg-background text-foreground text-xs font-bold rounded-lg border border-border px-2.5 py-1 pr-7 appearance-none cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-primary shadow-2xs hover:bg-muted/50 transition-colors"
						value={deliberationStore.activeEngagementId}
						onchange={(e) => deliberationStore.switchEngagement(e.currentTarget.value)}
						aria-label="Sélectionner l'instance d'engagement"
					>
						{#each deliberationStore.engagements as eng}
							<option value={eng.id}>
								{eng.type === 'generic_blueprint' ? '🏢' : '📋'} {eng.title}
							</option>
						{/each}
					</select>
					<ChevronDown class="h-3.5 w-3.5 pointer-events-none absolute right-2 text-muted-foreground" />
				</div>

				<span class="inline-flex items-center gap-1 rounded bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-bold font-mono">
					<GitBranch class="h-3 w-3" />
					{deliberationStore.activeEngagement.badge}
				</span>

				<span
					class="inline-flex items-center gap-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-semibold"
					title="Garantie de Souveraineté : 100% du traitement et des données restent en local sur votre machine"
				>
					<ShieldCheck class="h-3 w-3" />
					100% Local
				</span>
			</div>

			<div class="flex items-center gap-3">
				<h1 class="text-xl font-bold tracking-tight text-foreground">
					Workbench de Délibération
				</h1>
				<button
					type="button"
					onclick={() => (isDecisionGuideOpen = true)}
					class="inline-flex items-center gap-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 px-2.5 py-0.5 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
					title="Ouvrir le guide : Où et comment prendre les décisions dans Archinex ?"
				>
					<HelpCircle class="h-3.5 w-3.5" />
					<span>Comment décider ?</span>
				</button>
			</div>
		</div>

		<!-- Statut Sujet Actif, Document Actif & Action Rapide -->
		<div class="flex flex-wrap items-center gap-2 self-start sm:self-center text-xs">
			<!-- Badge de Statut LLMOps (FastMCP / Snapshot Dual-Mode) -->
			{#if deliberationStore.llmopsStatus === 'connected'}
				<button
					type="button"
					onclick={() => deliberationStore.syncWithLLMOps()}
					disabled={deliberationStore.isSyncingLLMOps}
					class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
					title="LLMOps Connecté ({deliberationStore.activeEngagementId}) · Cliquez pour resynchroniser"
				>
					<span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
					<span class="opacity-80">LLMOps :</span>
					<strong class="font-mono">Connecté</strong>
					{#if deliberationStore.llmopsHealth?.engine_commit}
						<span class="text-[10px] opacity-75 font-mono">({deliberationStore.llmopsHealth.engine_commit})</span>
					{/if}
					{#if deliberationStore.isSyncingLLMOps}
						<RefreshCw class="h-3 w-3 animate-spin ml-0.5" />
					{/if}
				</button>
			{:else if deliberationStore.llmopsStatus === 'offline'}
				<button
					type="button"
					onclick={() => deliberationStore.syncWithLLMOps()}
					disabled={deliberationStore.isSyncingLLMOps}
					class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20 transition-colors"
					title="LLMOps Mode Hors-Ligne (Snapshot Scellé Local) · Cliquez pour reconnecter"
				>
					<span class="inline-block h-2 w-2 rounded-full bg-amber-500"></span>
					<span class="opacity-80">LLMOps :</span>
					<strong class="font-mono">Hors-Ligne</strong>
					<span class="text-[10px] opacity-75">(Snapshot)</span>
					{#if deliberationStore.isSyncingLLMOps}
						<RefreshCw class="h-3 w-3 animate-spin ml-0.5" />
					{/if}
				</button>
			{:else if deliberationStore.llmopsStatus === 'syncing'}
				<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium bg-muted text-muted-foreground">
					<RefreshCw class="h-3 w-3 animate-spin text-primary" />
					<span>Sync LLMOps...</span>
				</div>
			{:else}
				<button
					type="button"
					onclick={() => deliberationStore.syncWithLLMOps()}
					disabled={deliberationStore.isSyncingLLMOps}
					class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium bg-muted/60 text-muted-foreground hover:bg-muted transition-colors"
					title="Cliquer pour connecter LLMOps"
				>
					<RefreshCw class="h-3 w-3" />
					<span>Connecter LLMOps</span>
				</button>
			{/if}

			<!-- Indicateur du Document Actif de Travail -->
			{#if activeDoc}
				<button
					type="button"
					onclick={() => deliberationStore.setPosture('appropriation')}
					class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors {activeDoc.origin === 'client'
						? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 hover:bg-blue-500/20'
						: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'}"
					title="Cliquer pour afficher ce document dans le corpus d'appropriation"
				>
					{#if activeDoc.origin === 'client'}
						<Building2 class="h-3.5 w-3.5 shrink-0" />
					{:else}
						<Globe class="h-3.5 w-3.5 shrink-0" />
					{/if}
					<span class="opacity-80">Doc :</span>
					<strong class="font-mono">{activeDoc.id}</strong>
				</button>
			{/if}

			{#if activeSubject}
				<div class="hidden sm:flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-lg border text-muted-foreground">
					<span>Sujet :</span>
					<strong class="font-mono text-foreground">{activeSubject.section_ref}</strong>
					<span class="rounded bg-primary/10 text-primary px-1.5 py-0.2 font-mono text-[10px] font-bold">
						{activeSubject.level}
					</span>
				</div>
			{/if}

			<button
				type="button"
				onclick={() => deliberationStore.openFreezeDialog()}
				class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors shrink-0"
			>
				<Lock class="h-3.5 w-3.5" />
				<span>Sceller Section</span>
			</button>
		</div>
	</div>

	<!-- Tableau de Bord & KPIs Opérationnels -->
	<DeliberationDashboardKpis />

	<!-- Sélecteur de Posture & Rôle Actif -->
	<ContextualPostureSelector />

	<!-- Règle doctrinale candidate (si détectée) -->
	<RuleApprovalBanner />

	<!-- Posture 1 Dédiée : Corpus Documentaire d'Entrée & Appropriation -->
	{#if deliberationStore.activePosture === 'appropriation'}
		<div class="space-y-4">
			<CorpusAppropriationHub />
		</div>
	{/if}

	<!-- Posture 3 Dédiée : Homologation & Projections -->
	{#if deliberationStore.activePosture === 'rendu'}
		<div class="space-y-4">
			<ArtifactRegenerationHub />
		</div>
	{/if}

	<!-- Sélecteur d'Onglets Mobile (< lg) pour Consultation Fluide -->
	<div class="lg:hidden flex items-center gap-1 bg-muted/60 p-1 rounded-lg overflow-x-auto text-xs">
		<button
			type="button"
			onclick={() => (mobileTab = 'board')}
			class="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-semibold transition-all whitespace-nowrap {mobileTab === 'board'
				? 'bg-background text-foreground shadow-2xs'
				: 'text-muted-foreground hover:text-foreground'}"
		>
			<Layers class="h-3.5 w-3.5" />
			<span>Matrice</span>
		</button>

		<button
			type="button"
			onclick={() => (mobileTab = 'draft')}
			class="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-semibold transition-all whitespace-nowrap {mobileTab === 'draft'
				? 'bg-background text-foreground shadow-2xs'
				: 'text-muted-foreground hover:text-foreground'}"
		>
			<FileText class="h-3.5 w-3.5" />
			<span>Brouillon</span>
		</button>

		<button
			type="button"
			onclick={() => (mobileTab = 'chat')}
			class="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-semibold transition-all whitespace-nowrap {mobileTab === 'chat'
				? 'bg-background text-foreground shadow-2xs'
				: 'text-muted-foreground hover:text-foreground'}"
		>
			<MessagesSquare class="h-3.5 w-3.5" />
			<span>Fil & Doctrines</span>
		</button>

		<button
			type="button"
			onclick={() => (mobileTab = 'projections')}
			class="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-semibold transition-all whitespace-nowrap {mobileTab === 'projections'
				? 'bg-background text-foreground shadow-2xs'
				: 'text-muted-foreground hover:text-foreground'}"
		>
			<ShieldCheck class="h-3.5 w-3.5" />
			<span>Modèles</span>
		</button>
	</div>

	<!-- 1. Affichage Mobile (< lg) : Uniquement l'onglet sélectionné -->
	<div class="block lg:hidden">
		{#if mobileTab === 'board'}
			<MaturityBoardTable />
		{:else if mobileTab === 'draft'}
			<TelegraphicDraftView />
		{:else if mobileTab === 'chat'}
			<DialecticChatPanel />
		{:else if mobileTab === 'projections'}
			<ArtifactRegenerationHub />
		{/if}
	</div>

	<!-- 2. Affichage Desktop (>= lg) : Command Center Dual-Panel & Vues Intégrées -->
	<div class="hidden lg:block space-y-4">
		<!-- Grille Supérieure : Board 7 cols + Brouillon 5 cols -->
		<div class="grid grid-cols-12 gap-4 items-start">
			<div class="col-span-7 h-full">
				<MaturityBoardTable />
			</div>
			<div class="col-span-5 h-full">
				<TelegraphicDraftView />
			</div>
		</div>

		<!-- Projections en bas si non en posture rendu -->
		{#if deliberationStore.activePosture !== 'rendu'}
			<ArtifactRegenerationHub />
		{/if}

		<!-- Fil de Délibération & Canaux -->
		<DialecticChatPanel />
	</div>

	<!-- Modales d'Inspection, Scellement & Guide Décisionnel -->
	<WhyInspector />
	<FreezeSectionDialog />
	<DecisionGuideModal bind:isOpen={isDecisionGuideOpen} />
</div>
