<script lang="ts">
	import { onMount } from 'svelte';
	import ProjectEngagementHeader from '$lib/components/deliberation/ProjectEngagementHeader.svelte';
	import DeliberationDashboardKpis from '$lib/components/deliberation/DeliberationDashboardKpis.svelte';
	import MaturityBoardTable from '$lib/components/deliberation/MaturityBoardTable.svelte';
	import DeliberationWorkbench from '$lib/components/deliberation/DeliberationWorkbench.svelte';
	import CorpusAppropriationHub from '$lib/components/deliberation/CorpusAppropriationHub.svelte';
	import RegulatoryFrameworksPanel from '$lib/components/deliberation/RegulatoryFrameworksPanel.svelte';
	import ArtifactRegenerationHub from '$lib/components/deliberation/ArtifactRegenerationHub.svelte';
	import HldFragmentView from '$lib/components/deliberation/HldFragmentView.svelte';
	import Phase3SubjectSelector from '$lib/components/deliberation/Phase3SubjectSelector.svelte';
	import Phase4RefinementHub from '$lib/components/deliberation/Phase4RefinementHub.svelte';
	import WhyInspector from '$lib/components/deliberation/WhyInspector.svelte';
	import FreezeSectionDialog from '$lib/components/deliberation/FreezeSectionDialog.svelte';
	import ImpactGraphExplorer from '$lib/components/deliberation/ImpactGraphExplorer.svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { page } from '$app/stores';
	import { Layers, MessagesSquare, CheckCircle2, Cpu } from 'lucide-svelte';

	let { data } = $props();

	onMount(() => {
		// 1. Prise en compte prioritaire des paramètres d'URL explicites si renseignés
		const searchParams = $page.url.searchParams;
		const querySubject = searchParams.get('subject');
		const queryMode = searchParams.get('mode');
		const queryPosture = searchParams.get('posture');

		if (querySubject && deliberationStore.subjects.some((s) => s.id === querySubject)) {
			deliberationStore.selectSubject(querySubject);
		} else if (queryMode === 'board' || queryMode === 'conversation' || queryMode === 'graph') {
			deliberationStore.setDeliberationViewMode(queryMode);
		}

		if (
			queryPosture === 'appropriation' ||
			queryPosture === 'deliberation' ||
			queryPosture === 'rendu' ||
			queryPosture === 'refinement'
		) {
			deliberationStore.setPosture(queryPosture);
		}

		// 2. Synchronisation silencieuse en arrière-plan (Stale-While-Revalidate)
		deliberationStore.syncWithLLMOps(undefined, undefined, { silent: true }).catch((err) => {
			console.warn('[Deliberation] Synchro LLMOps différée en tâche de fond :', err);
		});
	});
</script>

<svelte:head>
	<title>Archinex · Workbench de Délibération ({deliberationStore.activeEngagement.shortName})</title>
</svelte:head>

<div class="space-y-4">
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- EN-TÊTE SUPÉRIEUR 2 NIVEAUX : PROJET (Cadrage & Tableau) vs SUJET (Focus) -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<ProjectEngagementHeader isExperimentalEnabled={data?.isExperimentalEnabled} />

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- PHASE 1 : APPROPRIATION DOCUMENTAIRE                                       -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{#if deliberationStore.activePosture === 'appropriation'}
		<div class="space-y-4 animate-in fade-in duration-150">
			<RegulatoryFrameworksPanel />
			<CorpusAppropriationHub />
		</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- PHASE 2 : DÉLIBÉRATION ARCHITECTURALE                                      -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{:else if deliberationStore.activePosture === 'deliberation'}
		<div class="space-y-3 animate-in fade-in duration-150">
			<!-- 1. Vue Tableau de maturité (Périmètre Projet) -->
			{#if deliberationStore.deliberationViewMode === 'board'}
				<DeliberationDashboardKpis />
				<div class="space-y-4">
					<MaturityBoardTable
						onOpenSubject={() => deliberationStore.setDeliberationViewMode('conversation')}
					/>
				</div>
			<!-- 2. Vue Graphe Causal & Analyse d'Impact (Périmètre Projet) -->
			{:else if deliberationStore.deliberationViewMode === 'graph'}
				<div class="space-y-4">
					<ImpactGraphExplorer />
				</div>
			<!-- 3. Vue Délibération par sujet (Périmètre Sujet) -->
			{:else}
				<div class="space-y-4">
					<DeliberationWorkbench
						sessionRole={data?.sessionRole}
						sessionUser={data?.sessionUser}
						isExperimentalEnabled={data?.isExperimentalEnabled}
						onBackToBoard={() => deliberationStore.setDeliberationViewMode('board')}
					/>
				</div>
			{/if}
		</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- PHASE 3 : RENDU & HOMOLOGATION HLD                                         -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{:else if deliberationStore.activePosture === 'rendu'}
		<div class="space-y-4 animate-in fade-in duration-150">
			<Phase3SubjectSelector />
			<HldFragmentView />
			<ArtifactRegenerationHub />
		</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- PHASE 4 : REFINEMENT & HYDRATATION EXÉCUTABLE (KAOS, NAUTOBOT, OPA)       -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{:else if deliberationStore.activePosture === 'refinement'}
		<div class="space-y-4 animate-in fade-in duration-150">
			<Phase4RefinementHub
				sessionRole={data?.sessionRole}
				sessionUser={data?.sessionUser}
			/>
		</div>
	{/if}

	<!-- Modales d'Inspection & Scellement -->
	<WhyInspector />
	<FreezeSectionDialog />
</div>
