<script lang="ts">
	import type { PageData } from './$types';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { computeGlobalOverview, type EngagementSizeMetric } from '$lib/domain/dashboardOverview';
	import GlobalKpiCards from '$lib/components/dashboard/GlobalKpiCards.svelte';
	import EngagementsSizeTable from '$lib/components/dashboard/EngagementsSizeTable.svelte';
	import TeamMonopolizationCard from '$lib/components/dashboard/TeamMonopolizationCard.svelte';
	import KnowledgeGrowthChart from '$lib/components/dashboard/KnowledgeGrowthChart.svelte';
	import EpistemicAlertsCard from '$lib/components/dashboard/EpistemicAlertsCard.svelte';
	import {
		Compass,
		FolderPlus,
		GitBranch,
		Network,
		Search,
		Filter,
		Sparkles,
		Layers,
		CheckCircle2,
		ShieldCheck,
		ArrowRight
	} from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	// Synchronise deliberationStore avec les données réelles persistées dans Prisma
	$effect(() => {
		if (data?.engagements && data.engagements.length > 0) {
			deliberationStore.initFromDb(data.engagements, data.corpusDocuments || []);
		}
	});

	// Filtres interactifs
	let selectedTypeFilter = $state<string>('all');
	let searchQuery = $state<string>('');

	// Calcul réactif des métriques globales consolidées
	const overviewSummary = $derived.by(() => {
		return computeGlobalOverview(
			deliberationStore.engagements,
			deliberationStore.commonKnowledgeBase
		);
	});

	// Filtrage des engagements pour le tableau
	const displayedEngagements = $derived.by(() => {
		let list = overviewSummary.engagements;
		if (selectedTypeFilter !== 'all') {
			list = list.filter((e) => e.type === selectedTypeFilter);
		}
		if (searchQuery.trim().length > 0) {
			const q = searchQuery.toLowerCase().trim();
			list = list.filter(
				(e) =>
					e.title.toLowerCase().includes(q) ||
					e.badge.toLowerCase().includes(q) ||
					e.shortName.toLowerCase().includes(q)
			);
		}
		return list;
	});
</script>

<svelte:head>
	<title>Archinex · Overview Global & Gouvernance d'Architecture</title>
</svelte:head>

<div class="space-y-6 max-w-7xl mx-auto pb-12">
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- EN-TÊTE PRINCIPAL : OVERVIEW GLOBAL DU PORTEFEUILLE D'ARCHITECTURE         -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="rounded-2xl border bg-card p-6 shadow-xs space-y-4">
		<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
			<div class="space-y-1">
				<div class="flex items-center gap-2.5">
					<div class="p-2.5 rounded-xl bg-primary text-primary-foreground shadow-xs">
						<Compass class="h-6 w-6" />
					</div>
					<div>
						<div class="flex items-center gap-2">
							<h1 class="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
								Overview Global du Portefeuille d'Architecture
							</h1>
							<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
								Executive Cockpit
							</span>
						</div>
						<p class="text-xs sm:text-sm text-muted-foreground mt-0.5">
							Pilotage transverse des engagements, charge des disciplines d'experts et grossissement du patrimoine commun
						</p>
					</div>
				</div>
			</div>

			<!-- Actions d'accès direct -->
			<div class="flex items-center gap-2 flex-wrap">
				<a
					href="/workspaces/new"
					class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs shadow-xs transition-colors"
				>
					<FolderPlus class="h-4 w-4" />
					<span>Nouvel Engagement</span>
				</a>

				<a
					href="/deliberation"
					class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-background hover:bg-muted font-semibold text-xs transition-colors shadow-2xs"
				>
					<GitBranch class="h-4 w-4 text-primary" />
					<span>Atelier Workbench</span>
				</a>

				<a
					href="/knowledge"
					class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-background hover:bg-muted font-semibold text-xs transition-colors shadow-2xs"
				>
					<Network class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
					<span>Base de Connaissance</span>
				</a>
			</div>
		</div>

		<!-- Barre de filtre interactif & Recherche -->
		<div class="pt-2 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3">
			<div class="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
				<span class="text-xs font-semibold text-muted-foreground flex items-center gap-1 shrink-0">
					<Filter class="h-3.5 w-3.5" />
					Type :
				</span>

				<button
					type="button"
					onclick={() => (selectedTypeFilter = 'all')}
					class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0 {selectedTypeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-muted-foreground'}"
				>
					Tous ({overviewSummary.totalEngagements})
				</button>

				<button
					type="button"
					onclick={() => (selectedTypeFilter = 'project_rfp')}
					class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0 {selectedTypeFilter === 'project_rfp' ? 'bg-amber-600 text-white' : 'bg-muted/50 hover:bg-muted text-muted-foreground'}"
				>
					RFP Client ({overviewSummary.engagementsByType.project_rfp})
				</button>

				<button
					type="button"
					onclick={() => (selectedTypeFilter = 'generic_blueprint')}
					class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0 {selectedTypeFilter === 'generic_blueprint' ? 'bg-blue-600 text-white' : 'bg-muted/50 hover:bg-muted text-muted-foreground'}"
				>
					Blueprints ({overviewSummary.engagementsByType.generic_blueprint})
				</button>

				{#if overviewSummary.engagementsByType.audit_resilience > 0}
					<button
						type="button"
						onclick={() => (selectedTypeFilter = 'audit_resilience')}
						class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0 {selectedTypeFilter === 'audit_resilience' ? 'bg-emerald-600 text-white' : 'bg-muted/50 hover:bg-muted text-muted-foreground'}"
					>
						Audits ({overviewSummary.engagementsByType.audit_resilience})
					</button>
				{/if}
			</div>

			<!-- Champ de recherche rapide -->
			<div class="relative sm:w-64">
				<Search class="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Filtrer un projet..."
					class="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border bg-background placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
				/>
			</div>
		</div>
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- 1. BANDEAU DE SYNTHÈSE EXÉCUTIVE (KPIS CLÉS)                               -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<GlobalKpiCards summary={overviewSummary} />

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- 2. TAILLE ET AVANCEMENT DÉTAILLÉ DES ENGAGEMENTS (TABLEAU COMPARATIF)      -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<EngagementsSizeTable
		engagements={displayedEngagements}
		selectedType={selectedTypeFilter}
	/>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- 3. DEUX VOLETS CÔTE À CÔTE : CHARGE ÉQUIPES & VIGILANCE ÉPISTÉMIQUE       -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
		<!-- GAUCHE : Monopolisation des Équipes & Radar (7 cols) -->
		<div class="lg:col-span-7">
			<TeamMonopolizationCard teams={overviewSummary.teams} />
		</div>

		<!-- DROITE : Alertes & Points d'Attention Épistémiques (5 cols) -->
		<div class="lg:col-span-5">
			<EpistemicAlertsCard
				alerts={overviewSummary.epistemicAlerts}
				totalOverrunsKiloEuros={overviewSummary.totalFinancialOverrunsKiloEuros}
			/>
		</div>
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- 4. DYNAMIQUE & GROSSISSEMENT DE LA BASE DE CONNAISSANCE COMMUNE           -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<KnowledgeGrowthChart
		growthPoints={overviewSummary.knowledgeGrowth}
		categories={overviewSummary.knowledgeCategories}
		crossProjectReusePct={overviewSummary.crossProjectReusePct}
		totalDocuments={overviewSummary.totalKnowledgeDocuments}
		totalClauses={overviewSummary.totalClauses}
	/>
</div>
