<script lang="ts">
	import {
		buildDefaultImpactGraph,
		simulateCostOptimization,
		generateMermaidImpactDiagram,
		type ImpactSimulationScenario,
		type ImpactGraphData
	} from '$lib/domain/impactGraph';
	import MermaidViewer from './MermaidViewer.svelte';
	import { toast } from '$lib/toast/index.svelte';
	import {
		Network,
		AlertTriangle,
		ShieldAlert,
		DollarSign,
		CheckCircle2,
		Clock,
		ArrowRight,
		FileText,
		Sparkles,
		Layers,
		Eye,
		RefreshCw,
		Sliders,
		ExternalLink
	} from 'lucide-svelte';

	// État réactif
	let scenario = $state<ImpactSimulationScenario>('cost_optimized_v1');
	let activeTab = $state<'graph' | 'table' | 'debt'>('graph');

	const baseGraph = $state<ImpactGraphData>(buildDefaultImpactGraph());

	const simulation = $derived(simulateCostOptimization(baseGraph, scenario));

	const mermaidCode = $derived(generateMermaidImpactDiagram(simulation, scenario));

	function handleConsignTransitoryADR(decisionId: string, title: string) {
		toast(
			`ADR de dérogation consigné pour ${decisionId} : « ${title} ». Clause d'extinction V2 scellée dans le registre d'arbitrage.`,
			{ variant: 'success' }
		);
	}
</script>

<div class="space-y-4" data-testid="impact-graph-explorer">
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- EN-TÊTE : SÉLECTEUR DE SCÉNARIO & CONTRÔLES WHAT-IF                      -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="rounded-xl border bg-card p-4 shadow-xs">
		<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
			<div>
				<div class="flex items-center gap-2">
					<div class="rounded-lg bg-indigo-500/10 p-2 text-indigo-600 dark:text-indigo-400">
						<Network class="h-5 w-5" />
					</div>
					<div>
						<h2 class="text-base font-bold text-foreground flex items-center gap-2">
							<span>Graphe Causal d'Impact : Exigences ↔ Décisions ↔ Coûts & Conformité</span>
							<span class="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
								What-If Simulator
							</span>
						</h2>
						<p class="text-xs text-muted-foreground">
							Visualisez les ondes de choc d'une optimisation budgétaire V1 sur les engagements contractuels et la conformité légale.
						</p>
					</div>
				</div>
			</div>

			<!-- Sélecteur de Scénario (Nominal V2 vs Optimisé Coût V1) -->
			<div class="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border">
				<button
					type="button"
					onclick={() => (scenario = 'nominal_v2')}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer {scenario ===
					'nominal_v2'
						? 'bg-background text-foreground shadow-xs font-bold'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<CheckCircle2 class="h-3.5 w-3.5 text-emerald-500" />
					<span>Scénario Nominal V2 (100% Conforme)</span>
				</button>
				<button
					type="button"
					onclick={() => (scenario = 'cost_optimized_v1')}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer {scenario ===
					'cost_optimized_v1'
						? 'bg-amber-500 text-white shadow-xs font-bold'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<DollarSign class="h-3.5 w-3.5" />
					<span>Scénario Optimisé Coût V1 (Compromis)</span>
				</button>
			</div>
		</div>

		<!-- ═════════════════════════════════════════════════════════════════════════ -->
		<!-- BANDEAU DE SYNTHÈSE / KPIS IMPACT EN TEMPS RÉEL                           -->
		<!-- ═════════════════════════════════════════════════════════════════════════ -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
			<!-- KPI 1 : Économie Budgétaire -->
			<div class="rounded-lg border bg-amber-500/5 border-amber-500/20 p-3">
				<div class="flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 font-medium">
					<span>Économie Budgétaire V1</span>
					<DollarSign class="h-4 w-4" />
				</div>
				<div class="mt-1 font-mono text-xl font-bold text-amber-600 dark:text-amber-400">
					{simulation.estimatedSavingsOpex}
				</div>
				<div class="text-[11px] text-muted-foreground mt-0.5">
					CAPEX : {simulation.estimatedSavingsCapex}
				</div>
			</div>

			<!-- KPI 2 : Non-Conformités Réglementaires -->
			<div class="rounded-lg border bg-rose-500/5 border-rose-500/20 p-3">
				<div class="flex items-center justify-between text-xs text-rose-700 dark:text-rose-300 font-medium">
					<span>Impact Réglementaire</span>
					<ShieldAlert class="h-4 w-4" />
				</div>
				<div class="mt-1 font-mono text-xl font-bold {simulation.compromisedCompliance.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'}">
					{simulation.compromisedCompliance.length} à risque
				</div>
				<div class="text-[11px] text-muted-foreground mt-0.5">
					{simulation.compromisedCompliance.length > 0 ? 'DORA (Critique), NIS2 (Élevé)' : 'Tous articles respectés'}
				</div>
			</div>

			<!-- KPI 3 : Exigences Clients Dégradées -->
			<div class="rounded-lg border bg-amber-500/5 border-amber-500/20 p-3">
				<div class="flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 font-medium">
					<span>Exigences Dégradées</span>
					<AlertTriangle class="h-4 w-4" />
				</div>
				<div class="mt-1 font-mono text-xl font-bold {simulation.degradedRequirements.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'}">
					{simulation.degradedRequirements.length} concessions
				</div>
				<div class="text-[11px] text-muted-foreground mt-0.5">
					{simulation.degradedRequirements.length > 0 ? 'SLA 99.0%, RTO 24h, Latence' : 'Tous SLAs nominaux tenus'}
				</div>
			</div>

			<!-- KPI 4 : Dette Assumée & Sunset Clauses -->
			<div class="rounded-lg border bg-indigo-500/5 border-indigo-500/20 p-3">
				<div class="flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-300 font-medium">
					<span>Dette Architecturale V1</span>
					<Clock class="h-4 w-4" />
				</div>
				<div class="mt-1 font-mono text-xl font-bold text-indigo-600 dark:text-indigo-400">
					{simulation.assumedTechnicalDebt.length} clauses V2
				</div>
				<div class="text-[11px] text-muted-foreground mt-0.5">
					ADR-001 & ADR-002 bornés
				</div>
			</div>
		</div>

		<!-- Message de synthèse contextuel -->
		<div class="mt-3 p-2.5 rounded-lg border text-xs {scenario === 'cost_optimized_v1' ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'}">
			<div class="flex items-start gap-2">
				{#if scenario === 'cost_optimized_v1'}
					<AlertTriangle class="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
				{:else}
					<CheckCircle2 class="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
				{/if}
				<span>{simulation.summaryMessage}</span>
			</div>
		</div>
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- ONGLETS DE NAVIGATION : GRAPHE VISUEL VS MATRICE DES IMPACTS              -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="flex items-center justify-between border-b pb-2">
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={() => (activeTab = 'graph')}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer {activeTab ===
				'graph'
					? 'bg-primary text-primary-foreground font-bold shadow-xs'
					: 'bg-muted/50 text-muted-foreground hover:text-foreground'}"
			>
				<Eye class="h-3.5 w-3.5" />
				<span>Diagramme Graphique Interactif</span>
			</button>
			<button
				type="button"
				onclick={() => (activeTab = 'table')}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer {activeTab ===
				'table'
					? 'bg-primary text-primary-foreground font-bold shadow-xs'
					: 'bg-muted/50 text-muted-foreground hover:text-foreground'}"
			>
				<Layers class="h-3.5 w-3.5" />
				<span>Rayon d'Impact & Concessions ({simulation.degradedRequirements.length + simulation.compromisedCompliance.length})</span>
			</button>
			<button
				type="button"
				onclick={() => (activeTab = 'debt')}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer {activeTab ===
				'debt'
					? 'bg-primary text-primary-foreground font-bold shadow-xs'
					: 'bg-muted/50 text-muted-foreground hover:text-foreground'}"
			>
				<Clock class="h-3.5 w-3.5" />
				<span>Dette Assumée & Sunset Clauses V2 ({simulation.assumedTechnicalDebt.length})</span>
			</button>
		</div>
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- VUE 1 : GRAPHE MERMAID INTERACTIF                                         -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{#if activeTab === 'graph'}
		<div class="space-y-2">
			<div class="flex items-center justify-between text-xs text-muted-foreground px-1">
				<div class="flex items-center gap-3 flex-wrap">
					<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Contrainte Coût</span>
					<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-indigo-400"></span> Décision / Option</span>
					<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> Exigence Satisfaite</span>
					<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Exigence Dégradée</span>
					<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Non-conformité Légale</span>
				</div>
				<span class="font-mono text-[11px]">Rendu vectoriel zoomable</span>
			</div>

			<MermaidViewer
				code={mermaidCode}
				title="Cartographie Causal d'Impact · Arbitrage V1 vs V2"
				defaultView="visual"
			/>
		</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- VUE 2 : TABLEAU DU RAYON D'IMPACT (BLAST RADIUS)                          -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{:else if activeTab === 'table'}
		<div class="space-y-4">
			<!-- Section 1 : Conformité Réglementaire -->
			<div class="rounded-xl border bg-card p-4 space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-bold text-foreground flex items-center gap-2">
						<ShieldAlert class="h-4 w-4 text-rose-500" />
						<span>Impact sur la Conformité Réglementaire & Risques Légaux</span>
					</h3>
					<span class="text-xs font-mono text-muted-foreground">
						{simulation.compromisedCompliance.length} point(s) d'attention
					</span>
				</div>

				{#if simulation.compromisedCompliance.length === 0}
					<div class="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-200">
						Toutes les réglementations (DORA, NIS2, RGPD) sont pleinement honorées dans ce scénario.
					</div>
				{:else}
					<div class="divide-y border rounded-lg overflow-hidden">
						{#each simulation.compromisedCompliance as comp}
							<div class="p-3 bg-muted/20 hover:bg-muted/40 transition-colors space-y-1.5">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2">
										<span class="font-mono text-xs font-bold text-primary">{comp.id}</span>
										<span class="text-xs font-bold text-foreground">{comp.framework} · {comp.article}</span>
									</div>
									<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono {comp.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-600 border border-rose-500/30' : 'bg-amber-500/20 text-amber-600 border border-amber-500/30'}">
										{comp.severity}
									</span>
								</div>
								<p class="text-xs text-rose-600 dark:text-rose-400 font-medium">
									⚠️ {comp.legalRisk}
								</p>
								<div class="text-[11px] text-muted-foreground bg-background/80 p-2 rounded border">
									<strong>Mesure compensatoire requise :</strong> {comp.mitigation}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Section 2 : Exigences Client & Dégradations Contractuelles -->
			<div class="rounded-xl border bg-card p-4 space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-bold text-foreground flex items-center gap-2">
						<AlertTriangle class="h-4 w-4 text-amber-500" />
						<span>Dégradations d'Exigences Client (Contractuelles & NFR)</span>
					</h3>
					<span class="text-xs font-mono text-muted-foreground">
						{simulation.degradedRequirements.length} concession(s)
					</span>
				</div>

				{#if simulation.degradedRequirements.length === 0}
					<div class="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-200">
						Toutes les métriques contractuelles et fonctionnelles nominales sont garanties.
					</div>
				{:else}
					<div class="divide-y border rounded-lg overflow-hidden">
						{#each simulation.degradedRequirements as req}
							<div class="p-3 bg-muted/20 hover:bg-muted/40 transition-colors space-y-1.5">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2">
										<span class="font-mono text-xs font-bold text-primary">{req.id}</span>
										<span class="text-xs font-bold text-foreground">{req.label}</span>
									</div>
									<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono bg-amber-500/20 text-amber-600 border border-amber-500/30">
										{req.severity}
									</span>
								</div>
								<div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs pt-1">
									<div class="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
										<span class="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Cible V2 Nominale :</span>
										<div class="font-mono text-emerald-800 dark:text-emerald-200 mt-0.5">{req.nominal}</div>
									</div>
									<div class="p-2 rounded bg-amber-500/10 border border-amber-500/20">
										<span class="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">Compromis V1 Dégradé :</span>
										<div class="font-mono text-amber-800 dark:text-amber-200 mt-0.5">{req.degraded}</div>
									</div>
								</div>
								<div class="text-[11px] text-muted-foreground">
									<strong>Origine du compromis :</strong> {req.cause}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- VUE 3 : DETTE TECHNIQUE ASSUMÉE & SUNSET CLAUSES                          -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{:else if activeTab === 'debt'}
		<div class="rounded-xl border bg-card p-4 space-y-4">
			<div>
				<h3 class="text-sm font-bold text-foreground flex items-center gap-2">
					<Clock class="h-4 w-4 text-indigo-500" />
					<span>Dette Technique Assumée & Clauses d'Extinction (Sunset Clauses)</span>
				</h3>
				<p class="text-xs text-muted-foreground mt-0.5">
					L'optimisation des coûts en V1 n'est saine que si les concessions sont formalisées dans un ADR assorti d'une date ou d'un seuil de re-bascule.
				</p>
			</div>

			<div class="space-y-3">
				{#each simulation.assumedTechnicalDebt as debt}
					<div class="rounded-lg border p-3.5 bg-muted/20 space-y-2">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
									{debt.decisionId}
								</span>
								<span class="text-sm font-bold text-foreground">{debt.title}</span>
							</div>
							<span class="font-mono text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">
								{debt.savings}
							</span>
						</div>

						<div class="p-2.5 rounded bg-background border text-xs space-y-1">
							<div class="flex items-center gap-1.5 text-primary font-bold text-[11px]">
								<Clock class="h-3.5 w-3.5" />
								<span>Condition d'extinction & re-bascule V2 (Sunset Clause) :</span>
							</div>
							<p class="text-foreground/90 pl-5">
								{debt.sunsetClause}
							</p>
						</div>

						<div class="flex items-center justify-between pt-1">
							<div class="text-[11px] text-muted-foreground">
								<strong>Risque résiduel accepté :</strong> {debt.residualRisk}
							</div>
							<button
								type="button"
								onclick={() => handleConsignTransitoryADR(debt.decisionId, debt.title)}
								class="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
							>
								<FileText class="h-3 w-3" />
								<span>Consigner l'ADR de compromis</span>
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
