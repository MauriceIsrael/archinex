<script lang="ts">
	import { onMount } from 'svelte';
	import ProjectEngagementHeader from '$lib/components/deliberation/ProjectEngagementHeader.svelte';
	import DeliberationDashboardKpis from '$lib/components/deliberation/DeliberationDashboardKpis.svelte';
	import MaturityBoardTable from '$lib/components/deliberation/MaturityBoardTable.svelte';
	import DeliberationWorkbench from '$lib/components/deliberation/DeliberationWorkbench.svelte';
	import RuleApprovalBanner from '$lib/components/deliberation/RuleApprovalBanner.svelte';
	import CorpusAppropriationHub from '$lib/components/deliberation/CorpusAppropriationHub.svelte';
	import ArtifactRegenerationHub from '$lib/components/deliberation/ArtifactRegenerationHub.svelte';
	import WhyInspector from '$lib/components/deliberation/WhyInspector.svelte';
	import FreezeSectionDialog from '$lib/components/deliberation/FreezeSectionDialog.svelte';
	import DecisionGuideModal from '$lib/components/deliberation/DecisionGuideModal.svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { Layers, MessagesSquare } from 'lucide-svelte';

	let isDecisionGuideOpen = $state<boolean>(false);

	onMount(() => {
		// Synchronisation non-bloquante en arrière-plan (Stale-While-Revalidate) :
		// Les sujets et la matrice s'affichent immédiatement sans attendre le réseau externe
		deliberationStore.syncWithLLMOps().catch((err) => {
			console.warn('[Deliberation] Synchro LLMOps différée en tâche de fond :', err);
		});
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

			<!-- Sélecteur de mode Délibération : Vue d'ensemble (Tableau) vs Délibération par sujet (Workbench 3 cols) -->
			<div class="flex items-center justify-between gap-3 bg-muted/30 p-1.5 rounded-xl border">
				<div class="flex items-center gap-1.5">
					<button
						type="button"
						onclick={() => deliberationStore.setDeliberationViewMode('board')}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer {deliberationStore.deliberationViewMode ===
						'board'
							? 'bg-background text-foreground shadow-xs border'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						<Layers class="h-3.5 w-3.5 text-primary" />
						<span>Tableau de maturité (Vue d'ensemble)</span>
					</button>

					<button
						type="button"
						onclick={() => deliberationStore.setDeliberationViewMode('conversation')}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer {deliberationStore.deliberationViewMode ===
						'conversation'
							? 'bg-background text-foreground shadow-xs border'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						<MessagesSquare class="h-3.5 w-3.5 text-primary" />
						<span>
							Fil de délibération
							{#if deliberationStore.activeSubject}
								· <span class="font-normal font-mono">{deliberationStore.activeSubject.section_ref}</span>
							{/if}
						</span>
					</button>
				</div>
			</div>

			<!-- 1. Vue Tableau de maturité -->
			{#if deliberationStore.deliberationViewMode === 'board'}
				<div class="space-y-4">
					<MaturityBoardTable
						onOpenSubject={() => deliberationStore.setDeliberationViewMode('conversation')}
					/>
				</div>
			<!-- 2. Vue Délibération par sujet : Disposition sur 3 colonnes -->
			{:else}
				<div class="space-y-4">
					<DeliberationWorkbench
						onBackToBoard={() => deliberationStore.setDeliberationViewMode('board')}
					/>
				</div>
			{/if}
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
