<script lang="ts">
	import { onMount } from 'svelte';
	import ProjectEngagementHeader from '$lib/components/deliberation/ProjectEngagementHeader.svelte';
	import DeliberationDashboardKpis from '$lib/components/deliberation/DeliberationDashboardKpis.svelte';
	import MaturityBoardTable from '$lib/components/deliberation/MaturityBoardTable.svelte';
	import TelegraphicDraftView from '$lib/components/deliberation/TelegraphicDraftView.svelte';
	import DialecticChatPanel from '$lib/components/deliberation/DialecticChatPanel.svelte';
	import RuleApprovalBanner from '$lib/components/deliberation/RuleApprovalBanner.svelte';
	import CorpusAppropriationHub from '$lib/components/deliberation/CorpusAppropriationHub.svelte';
	import ArtifactRegenerationHub from '$lib/components/deliberation/ArtifactRegenerationHub.svelte';
	import WhyInspector from '$lib/components/deliberation/WhyInspector.svelte';
	import FreezeSectionDialog from '$lib/components/deliberation/FreezeSectionDialog.svelte';
	import DecisionGuideModal from '$lib/components/deliberation/DecisionGuideModal.svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { Layers, FileText, MessagesSquare } from 'lucide-svelte';

	type MobileTab = 'board' | 'draft' | 'chat';
	let mobileTab = $state<MobileTab>('board');
	let isDecisionGuideOpen = $state<boolean>(false);

	onMount(async () => {
		await deliberationStore.syncWithLLMOps();
	});
</script>

<svelte:head>
	<title>Archinex · Workbench de Délibération ({deliberationStore.activeEngagement.shortName})</title>
</svelte:head>

<div class="space-y-4">
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- EN-TÊTE SUPÉRIEUR : SÉLECTEUR DE PROJET & 3 GRANDS ONGLETS DE PHASE       -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<ProjectEngagementHeader onOpenGuide={() => (isDecisionGuideOpen = true)} />

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- PHASE 1 : APPROPRIATION DOCUMENTAIRE                                       -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{#if deliberationStore.activePosture === 'appropriation'}
		<div class="space-y-4 animate-in fade-in duration-150">
			<CorpusAppropriationHub />
		</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- PHASE 2 : DÉLIBÉRATION ARCHITECTURALE                                      -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{:else if deliberationStore.activePosture === 'deliberation'}
		<div class="space-y-4 animate-in fade-in duration-150">
			<!-- Tableau de bord opérationnel & KPIs de Délibération -->
			<DeliberationDashboardKpis />

			<!-- Règle doctrinale candidate (si détectée lors des échanges) -->
			<RuleApprovalBanner />

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
			</div>

			<!-- 1. Affichage Mobile (< lg) : Uniquement le sous-onglet actif -->
			<div class="block lg:hidden">
				{#if mobileTab === 'board'}
					<MaturityBoardTable />
				{:else if mobileTab === 'draft'}
					<TelegraphicDraftView />
				{:else if mobileTab === 'chat'}
					<DialecticChatPanel />
				{/if}
			</div>

			<!-- 2. Affichage Desktop (>= lg) : Matrice 7 cols + Brouillon 5 cols + Chat -->
			<div class="hidden lg:block space-y-4">
				<div class="grid grid-cols-12 gap-4 items-start">
					<div class="col-span-7 h-full">
						<MaturityBoardTable />
					</div>
					<div class="col-span-5 h-full">
						<TelegraphicDraftView />
					</div>
				</div>

				<!-- Fil de Délibération & Canaux d'Échange -->
				<DialecticChatPanel />
			</div>
		</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- PHASE 3 : RENDU & HOMOLOGATION                                             -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{:else if deliberationStore.activePosture === 'rendu'}
		<div class="space-y-4 animate-in fade-in duration-150">
			<ArtifactRegenerationHub />
		</div>
	{/if}

	<!-- Modales d'Inspection, Scellement & Guide Décisionnel -->
	<WhyInspector />
	<FreezeSectionDialog />
	<DecisionGuideModal bind:isOpen={isDecisionGuideOpen} />
</div>
