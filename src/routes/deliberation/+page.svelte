<script lang="ts">
	import ContextualPostureSelector from '$lib/components/deliberation/ContextualPostureSelector.svelte';
	import DeliberationDashboardKpis from '$lib/components/deliberation/DeliberationDashboardKpis.svelte';
	import MaturityBoardTable from '$lib/components/deliberation/MaturityBoardTable.svelte';
	import TelegraphicDraftView from '$lib/components/deliberation/TelegraphicDraftView.svelte';
	import DialecticChatPanel from '$lib/components/deliberation/DialecticChatPanel.svelte';
	import RuleApprovalBanner from '$lib/components/deliberation/RuleApprovalBanner.svelte';
	import PedagogicalFramingPanel from '$lib/components/deliberation/PedagogicalFramingPanel.svelte';
	import ArtifactRegenerationHub from '$lib/components/deliberation/ArtifactRegenerationHub.svelte';
	import WhyInspector from '$lib/components/deliberation/WhyInspector.svelte';
	import FreezeSectionDialog from '$lib/components/deliberation/FreezeSectionDialog.svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import {
		GitBranch,
		ShieldCheck,
		FileText,
		MessagesSquare,
		Layers,
		Lock
	} from 'lucide-svelte';

	type MobileTab = 'board' | 'draft' | 'chat' | 'projections';
	let mobileTab = $state<MobileTab>('board');

	const activeSubject = $derived(deliberationStore.activeSubject);
</script>

<svelte:head>
	<title>Archinex · Deliberation Workbench</title>
</svelte:head>

<div class="space-y-4">
	<!-- En-tête Compact & Professionnel -->
	<div class="rounded-xl border bg-card p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
		<div>
			<div class="flex items-center gap-2 mb-1">
				<span class="inline-flex items-center gap-1 rounded bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-bold font-mono">
					<GitBranch class="h-3 w-3" />
					CCTP 5G & CŒUR
				</span>
				<span class="text-xs font-semibold text-muted-foreground">
					Réseau Fédérateur & Tranches Hybrides
				</span>
			</div>
			<h1 class="text-xl font-bold tracking-tight text-foreground">
				Workbench de Délibération
			</h1>
		</div>

		<!-- Statut Sujet Actif & Action Rapide -->
		<div class="flex items-center gap-2.5 self-end sm:self-center text-xs">
			{#if activeSubject}
				<div class="hidden sm:flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-lg border text-muted-foreground">
					<span>Actif :</span>
					<strong class="font-mono text-foreground">{activeSubject.section_ref}</strong>
					<span class="rounded bg-primary/10 text-primary px-1.5 py-0.2 font-mono text-[10px] font-bold">
						{activeSubject.level}
					</span>
				</div>
			{/if}

			<button
				type="button"
				onclick={() => deliberationStore.openFreezeDialog()}
				class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors"
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

	<!-- Posture 1 Dédiée : Cadrage Normatif (3GPP, NIS2) -->
	{#if deliberationStore.activePosture === 'appropriation'}
		<div class="space-y-4">
			<PedagogicalFramingPanel />
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

	<!-- Modales d'Inspection & Scellement -->
	<WhyInspector />
	<FreezeSectionDialog />
</div>
