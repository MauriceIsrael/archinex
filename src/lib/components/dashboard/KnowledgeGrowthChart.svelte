<script lang="ts">
	import type {
		KnowledgeGrowthPoint,
		KnowledgeCategoryDistribution
	} from '$lib/domain/dashboardOverview';
	import ChartWidget from '$lib/dashboard/widgets/ChartWidget.svelte';
	import {
		BookOpen,
		TrendingUp,
		ShieldCheck,
		FileCode,
		Sparkles,
		Layers
	} from 'lucide-svelte';

	let {
		growthPoints = [],
		categories = [],
		crossProjectReusePct = 0,
		totalDocuments = 0,
		totalClauses = 0
	}: {
		growthPoints?: KnowledgeGrowthPoint[];
		categories?: KnowledgeCategoryDistribution[];
		crossProjectReusePct?: number;
		totalDocuments?: number;
		totalClauses?: number;
	} = $props();

	const safeGrowthPoints = $derived(Array.isArray(growthPoints) ? growthPoints : []);
	const safeCategories = $derived(Array.isArray(categories) ? categories : []);

	// Graphique 1 : Courbe d'évolution temporelle (Documents & Clauses cumulées)
	const growthChartOptions = $derived.by((): any => {
		const dates = safeGrowthPoints.map((p) => p.formattedDate);
		const docsData = safeGrowthPoints.map((p) => p.totalDocuments);
		const clausesData = safeGrowthPoints.map((p) => p.totalClauses);

		return {
			tooltip: {
				trigger: 'axis',
				axisPointer: { type: 'cross' }
			},
			legend: {
				top: 0,
				data: ['Clauses Indexées (volume)', 'Documents au Socle (total)'],
				textStyle: { fontSize: 11 }
			},
			grid: {
				left: '4%',
				right: '5%',
				bottom: '8%',
				top: '16%',
				containLabel: true
			},
			xAxis: {
				type: 'category',
				boundaryGap: false,
				data: dates,
				axisLabel: { fontSize: 10 }
			},
			yAxis: [
				{
					type: 'value',
					name: 'Clauses',
					position: 'left',
					splitLine: { lineStyle: { type: 'dashed', opacity: 0.25 } }
				},
				{
					type: 'value',
					name: 'Documents',
					position: 'right',
					splitLine: { show: false }
				}
			],
			series: [
				{
					name: 'Clauses Indexées (volume)',
					type: 'line',
					smooth: true,
					yAxisIndex: 0,
					data: clausesData,
					itemStyle: { color: '#10b981' },
					areaStyle: {
						color: {
							type: 'linear',
							x: 0,
							y: 0,
							x2: 0,
							y2: 1,
							colorStops: [
								{ offset: 0, color: 'rgba(16, 185, 129, 0.35)' },
								{ offset: 1, color: 'rgba(16, 185, 129, 0.02)' }
							]
						}
					}
				},
				{
					name: 'Documents au Socle (total)',
					type: 'line',
					smooth: true,
					yAxisIndex: 1,
					data: docsData,
					itemStyle: { color: '#8b5cf6' },
					lineStyle: { width: 3 }
				}
			]
		};
	});

	// Graphique 2 : Répartition par Catégorie (Camembert / Donut)
	const categoryPieOptions = $derived.by((): any => {
		const data = safeCategories.map((c) => ({
			value: c.count || 0,
			name: c.label || c.category,
			itemStyle: { color: c.color || '#94a3b8' }
		}));

		return {
			tooltip: {
				trigger: 'item',
				formatter: '{b} : {c} doc(s) ({d}%)'
			},
			legend: {
				bottom: 0,
				left: 'center',
				textStyle: { fontSize: 10 }
			},
			series: [
				{
					name: 'Typologie du Corpus',
					type: 'pie',
					radius: ['45%', '70%'],
					center: ['50%', '45%'],
					avoidLabelOverlap: false,
					itemStyle: {
						borderRadius: 6,
						borderColor: 'var(--color-card, #fff)',
						borderWidth: 2
					},
					label: { show: false },
					emphasis: {
						label: {
							show: true,
							fontSize: 12,
							fontWeight: 'bold'
						}
					},
					data
				}
			]
		};
	});
</script>

<div class="rounded-2xl border bg-card shadow-xs overflow-hidden flex flex-col h-full">
	<!-- En-tête -->
	<div class="p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
		<div class="flex items-center gap-2.5">
			<div class="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
				<BookOpen class="h-5 w-5" />
			</div>
			<div>
				<h3 class="font-bold text-base tracking-tight text-foreground">
					Grossissement du Patrimoine de Connaissances
				</h3>
				<p class="text-xs text-muted-foreground">
					Enrichissement continu par versement des documents amonts, clauses contractuelles et standards
				</p>
			</div>
		</div>

		<div class="flex items-center gap-2">
			<a
				href="/knowledge"
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-background hover:bg-muted font-semibold text-xs transition-colors shadow-2xs"
			>
				<Layers class="h-3.5 w-3.5" />
				<span>Explorer le Graphe</span>
			</a>
		</div>
	</div>

	<!-- Invariant Callout -->
	<div class="mx-5 mt-4 p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/20 flex items-start gap-2.5">
		<ShieldCheck class="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
		<div class="text-xs text-muted-foreground leading-relaxed">
			<strong class="text-foreground">Invariant d'enrichissement continu :</strong> Tout document amont injecté lors d'un appel d'offres ou d'un cadrage rejoint automatiquement la base de connaissances commune. <strong>{crossProjectReusePct}% du patrimoine</strong> est actuellement réexploité transversalement par plusieurs projets sans duplication documentaire.
		</div>
	</div>

	<!-- Grille des Graphes -->
	<div class="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-center">
		<!-- Graphe 1 : Évolution temporelle (Line & Area) -->
		<div class="lg:col-span-8 flex flex-col">
			<div class="flex items-center justify-between mb-2">
				<span class="text-xs font-bold text-foreground">Dynamique Cumulée d'Acquisition</span>
				<div class="flex items-center gap-3 text-xs text-muted-foreground font-mono">
					<span>Docs : <strong class="text-foreground">{totalDocuments}</strong></span>
					<span>Clauses : <strong class="text-emerald-600 dark:text-emerald-400 font-bold">{totalClauses}</strong></span>
				</div>
			</div>
			<div class="h-[280px] w-full">
				{#if safeGrowthPoints.length > 0}
					<ChartWidget options={growthChartOptions} />
				{:else}
					<div class="h-full flex items-center justify-center text-xs text-muted-foreground italic border rounded-xl bg-muted/20">
						Aucun historique d'acquisition pour le moment
					</div>
				{/if}
			</div>
		</div>

		<!-- Graphe 2 : Répartition par Catégorie (Pie / Donut) -->
		<div class="lg:col-span-4 flex flex-col border-t lg:border-t-0 lg:border-l pt-4 lg:pt-0 lg:pl-6">
			<span class="text-xs font-bold text-foreground mb-2">Répartition par Typologie</span>
			<div class="h-[280px] w-full flex items-center justify-center">
				{#if safeCategories.length > 0}
					<ChartWidget options={categoryPieOptions} />
				{:else}
					<div class="h-full w-full flex items-center justify-center text-xs text-muted-foreground italic border rounded-xl bg-muted/20">
						Aucune typologie disponible
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
