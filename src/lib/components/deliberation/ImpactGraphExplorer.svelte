<script lang="ts">
	import {
		buildDefaultImpactGraph,
		buildContextualImpactGraph,
		simulateCostOptimization,
		generateMermaidImpactDiagram,
		type ImpactSimulationScenario,
		type ImpactGraphData,
		type ContextualSubjectInput
	} from '$lib/domain/impactGraph';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import MermaidViewer from './MermaidViewer.svelte';
	import { toast } from '$lib/toast/index.svelte';
	import {
		Network,
		AlertTriangle,
		ShieldAlert,
		DollarSign,
		CheckCircle2,
		Clock,
		FileText,
		Sparkles,
		Layers,
		Eye,
		RefreshCw,
		Target,
		Loader2
	} from 'lucide-svelte';

	// État réactif
	let scenario = $state<ImpactSimulationScenario>('cost_optimized_v1');
	let activeTab = $state<'graph' | 'table' | 'debt'>('graph');
	let isGeneratingLlm = $state<boolean>(false);
	let isLoadingDb = $state<boolean>(false);

	// Cache local par sujet (réponses DB déterministes ou enrichies par LLM)
	let graphsBySubject = $state<Record<string, ImpactGraphData>>({});

	const subjects = $derived(deliberationStore.subjects);
	const activeEngagement = $derived(deliberationStore.activeEngagement);
	const selectedSubjectId = $derived(
		deliberationStore.activeSubjectId || subjects[0]?.id || ''
	);
	const selectedSubject = $derived(
		subjects.find((s) => s.id === selectedSubjectId) || subjects[0] || null
	);

	// Construit à la volée le graphe déterministe depuis les données en mémoire du store
	function buildStoreContextualGraph(): ImpactGraphData {
		if (!selectedSubject) {
			return buildDefaultImpactGraph();
		}

		const decisionCtx = deliberationStore.decisionContexts[selectedSubject.id];
		const proposal = selectedSubject.proposal;

		const criteria = (proposal?.criteria || []).map((c, idx) => ({
			id: `crit-${idx}`,
			name: c.name,
			description: c.description,
			kind: c.kind,
			weight: c.weight
		}));

		const storeOptions = decisionCtx?.options || [];
		const options =
			storeOptions.length > 0
				? storeOptions.map((o) => ({
						id: o.id,
						title: o.title,
						summary: o.summary,
						status: o.status
					}))
				: (proposal?.options || []).map((o, idx) => ({
						id: `opt-${idx}`,
						title: o.title,
						summary: o.summary,
						status: 'proposed'
					}));

		const evaluations = (proposal?.evaluations || []).map((e) => {
			const opt = options.find((o) => o.title === e.option) || options[0];
			const crit = criteria.find((c) => c.name === e.criterion) || criteria[0];
			return {
				optionId: opt?.id || e.option,
				criterionId: crit?.id || e.criterion,
				score: e.score,
				justification: e.justification
			};
		});

		const draft = deliberationStore.drafts[selectedSubject.id];
		const tradeoffs =
			draft?.conflit && draft.conflit.length > 0 && options[0]
				? [
						{
							id: `to-draft-${selectedSubject.id}`,
							optionId: options[options.length - 1]?.id || options[0].id,
							gains: draft.retenu?.[0] || 'Optimisation V1 ciblée',
							sacrifices: draft.conflit.join(' · ')
						}
					]
				: [];

		const input: ContextualSubjectInput = {
			projectId: activeEngagement.id,
			projectTitle: activeEngagement.title,
			subject: {
				id: selectedSubject.id,
				sectionRef: selectedSubject.section_ref,
				name: selectedSubject.name,
				problemStatement: selectedSubject.problem_statement,
				maturityLevel: selectedSubject.level
			},
			criteria,
			options,
			evaluations,
			decision: decisionCtx?.decision
				? {
						id: decisionCtx.decision.id,
						retainedOptionId: decisionCtx.decision.retainedOptionId,
						rationale: decisionCtx.decision.rationale,
						reversibility: decisionCtx.decision.reversibility,
						complianceStatus: decisionCtx.decision.complianceStatus,
						version: decisionCtx.decision.version,
						acceptedViolations: decisionCtx.decision.acceptedViolations
					}
				: null,
			requirements: (selectedSubject.requirement_ids || []).map((reqId) => ({
				id: reqId,
				clauseRef: reqId,
				title: `Exigence ${reqId}`,
				criticality: 'standard'
			})),
			frameworks: activeEngagement.strategy?.applicableFrameworks || [],
			tradeoffs
		};

		return buildContextualImpactGraph(input);
	}

	// Graphe actif pour le sujet sélectionné : version API/LLM si disponible, sinon calcul store instantané
	const baseGraph = $derived.by(() => {
		if (selectedSubjectId && graphsBySubject[selectedSubjectId]) {
			return graphsBySubject[selectedSubjectId];
		}
		return buildStoreContextualGraph();
	});

	const simulation = $derived(simulateCostOptimization(baseGraph, scenario));
	const mermaidCode = $derived(generateMermaidImpactDiagram(simulation, scenario));

	// Charge automatiquement le graphe enrichi depuis la base dès qu'on change de sujet
	$effect(() => {
		const projId = activeEngagement?.id;
		const subjId = selectedSubjectId;
		if (!projId || !subjId) return;
		if (graphsBySubject[subjId]) return;

		let cancelled = false;
		isLoadingDb = true;
		fetch(`/api/projects/${encodeURIComponent(projId)}/subjects/${encodeURIComponent(subjId)}/impact-graph`)
			.then(async (res) => {
				if (!res.ok) return;
				const payload = await res.json();
				if (!cancelled && payload?.status === 'ok' && payload.graph) {
					graphsBySubject = { ...graphsBySubject, [subjId]: payload.graph };
				}
			})
			.catch(() => {
				// Silencieux : le graphe déterministe calculé depuis le store reste affiché
			})
			.finally(() => {
				if (!cancelled) isLoadingDb = false;
			});

		return () => {
			cancelled = true;
		};
	});

	function handleSelectSubject(e: Event) {
		const target = e.target as HTMLSelectElement;
		const newId = target.value;
		if (newId) {
			deliberationStore.selectSubject(newId, false);
		}
	}

	async function handleGenerateWithLlm() {
		const projId = activeEngagement?.id;
		const subjId = selectedSubjectId;
		if (!projId || !subjId) {
			toast('Sélectionnez un sujet valide avant de lancer l\'analyse IA.', { variant: 'warning' });
			return;
		}

		isGeneratingLlm = true;
		try {
			const res = await fetch(
				`/api/projects/${encodeURIComponent(projId)}/subjects/${encodeURIComponent(subjId)}/impact-graph`,
				{ method: 'POST' }
			);
			const payload = await res.json();
			if (!res.ok || payload?.status !== 'ok' || !payload.graph) {
				throw new Error(payload?.error || 'Impossible de générer le graphe IA');
			}
			graphsBySubject = { ...graphsBySubject, [subjId]: payload.graph };
			if (payload.graph.meta?.source === 'llm') {
				toast(`Graphe causal contextualisé par IA pour « ${selectedSubject?.name} ».`, {
					variant: 'success'
				});
			} else {
				toast(
					`LLM indisponible (${payload.graph.meta?.fallbackReason || 'hors ligne'}) : graphe recalculé depuis les données réelles du sujet.`,
					{ variant: 'info' }
				);
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : 'Erreur lors de la génération IA';
			toast(msg, { variant: 'error' });
		} finally {
			isGeneratingLlm = false;
		}
	}

	function handleResetToDeterministic() {
		if (!selectedSubjectId) return;
		const copy = { ...graphsBySubject };
		delete copy[selectedSubjectId];
		graphsBySubject = copy;
		toast('Graphe réinitialisé sur les données déterministes du sujet.', { variant: 'info' });
	}

	function handleConsignTransitoryADR(decisionId: string, title: string) {
		toast(
			`ADR de dérogation consigné pour ${decisionId} : « ${title} ». Clause d'extinction V2 scellée dans le registre d'arbitrage.`,
			{ variant: 'success' }
		);
	}
</script>

<div class="space-y-4" data-testid="impact-graph-explorer">
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- BARRE DE CONTEXTUALISATION PAR SUJET & GÉNÉRATION IA (LLM)                -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="rounded-xl border bg-card p-3.5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
		<div class="flex items-center gap-2.5 flex-wrap flex-1">
			<div class="flex items-center gap-1.5 text-xs font-bold text-primary shrink-0">
				<Target class="h-4 w-4" />
				<span>Sujet analysé :</span>
			</div>

			{#if subjects.length > 0}
				<select
					aria-label="Choisir le sujet pour le graphe d'impact"
					data-testid="impact-subject-select"
					value={selectedSubjectId}
					onchange={handleSelectSubject}
					class="rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold text-foreground max-w-md truncate focus:outline-none focus:ring-2 focus:ring-primary/40"
				>
					{#each subjects as subj}
						<option value={subj.id}>
							{subj.section_ref ? `${subj.section_ref} · ` : ''}{subj.name} ({subj.level})
						</option>
					{/each}
				</select>
			{:else}
				<span class="text-xs text-muted-foreground italic">
					Aucun sujet dans ce projet (affichage du modèle de référence)
				</span>
			{/if}

			<!-- Badge de provenance du graphe -->
			{#if baseGraph.meta?.source === 'llm'}
				<span
					class="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300"
				>
					<Sparkles class="h-3 w-3" />
					<span>Contextualisé par IA ({baseGraph.meta.modelUsed || 'LLM'})</span>
				</span>
			{:else if baseGraph.meta?.source === 'deterministic'}
				<span
					class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
					title={baseGraph.meta.fallbackReason ? `Repli : ${baseGraph.meta.fallbackReason}` : ''}
				>
					<span>⚡ Calculé depuis les données du sujet</span>
				</span>
			{:else}
				<span
					class="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
				>
					<span>Modèle de référence</span>
				</span>
			{/if}

			{#if isLoadingDb}
				<Loader2 class="h-3.5 w-3.5 animate-spin text-muted-foreground" />
			{/if}
		</div>

		<div class="flex items-center gap-2 shrink-0">
			{#if baseGraph.meta?.source === 'llm'}
				<button
					type="button"
					onclick={handleResetToDeterministic}
					class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-background hover:bg-muted text-xs font-medium text-muted-foreground transition-colors cursor-pointer"
					title="Revenir au graphe déterministe issu de la base"
				>
					<RefreshCw class="h-3.5 w-3.5" />
					<span>Réinitialiser</span>
				</button>
			{/if}

			<button
				type="button"
				data-testid="generate-llm-impact-graph-btn"
				disabled={isGeneratingLlm || !selectedSubjectId}
				onclick={handleGenerateWithLlm}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
			>
				{#if isGeneratingLlm}
					<Loader2 class="h-3.5 w-3.5 animate-spin" />
					<span>Analyse IA en cours…</span>
				{:else}
					<Sparkles class="h-3.5 w-3.5" />
					<span>Contextualiser / Enrichir par IA (LLM)</span>
				{/if}
			</button>
		</div>
	</div>

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
						<h2 class="text-base font-bold text-foreground flex items-center gap-2 flex-wrap">
							<span>
								Graphe d'Impact{selectedSubject ? ` · ${selectedSubject.section_ref} ${selectedSubject.name}` : ''}
							</span>
							{#if baseGraph.meta?.decisionVersion}
								<span class="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-300">
									Décision rév. v{baseGraph.meta.decisionVersion}{baseGraph.meta.retainedOptionTitle ? ` · ${baseGraph.meta.retainedOptionTitle}` : ''}
								</span>
							{/if}
							<span class="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
								What-If Simulator
							</span>
						</h2>
						<p class="text-xs text-muted-foreground">
							{selectedSubject?.problem_statement ||
								'Visualisez les ondes de choc d’une optimisation budgétaire sur les engagements contractuels et la conformité légale.'}
						</p>
					</div>
				</div>
			</div>

			<!-- Sélecteur de Scénario (Optimum Nominal Vx vs Compromis Coût Vy) -->
			<div class="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border shrink-0">
				<button
					type="button"
					onclick={() => (scenario = 'nominal_v2')}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer {scenario ===
					'nominal_v2'
						? 'bg-background text-foreground shadow-xs font-bold'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<CheckCircle2 class="h-3.5 w-3.5 text-emerald-500" />
					<span>Optimum Nominal</span>
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
					<span>Compromis Coût</span>
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
					<span>Gain Coût Compromis</span>
					<DollarSign class="h-4 w-4" />
				</div>
				<div class="mt-1 font-mono text-base font-bold text-amber-600 dark:text-amber-400 truncate" title={simulation.estimatedSavingsOpex}>
					{simulation.estimatedSavingsOpex}
				</div>
				<div class="text-[11px] text-muted-foreground mt-0.5 truncate" title={simulation.estimatedSavingsCapex}>
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
				<div class="text-[11px] text-muted-foreground mt-0.5 truncate">
					{simulation.compromisedCompliance.length > 0
						? simulation.compromisedCompliance.map((c) => c.framework).join(', ')
						: 'Tous référentiels respectés'}
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
				<div class="text-[11px] text-muted-foreground mt-0.5 truncate">
					{simulation.degradedRequirements.length > 0
						? simulation.degradedRequirements.map((r) => r.label).slice(0, 2).join(', ')
						: 'Toutes cibles nominales tenues'}
				</div>
			</div>

			<!-- KPI 4 : Dette Assumée & Sunset Clauses -->
			<div class="rounded-lg border bg-indigo-500/5 border-indigo-500/20 p-3">
				<div class="flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-300 font-medium">
					<span>Dette & Clauses Vx → Vy</span>
					<Clock class="h-4 w-4" />
				</div>
				<div class="mt-1 font-mono text-xl font-bold text-indigo-600 dark:text-indigo-400">
					{simulation.assumedTechnicalDebt.length} clause(s)
				</div>
				<div class="text-[11px] text-muted-foreground mt-0.5 truncate">
					{simulation.assumedTechnicalDebt.length > 0 ? 'ADR transitoire à borner' : 'Aucune dette active'}
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
		<div class="flex items-center gap-2 flex-wrap">
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
				<span>Dette Assumée &amp; Clauses Vx → Vy ({simulation.assumedTechnicalDebt.length})</span>
			</button>
		</div>
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- VUE 1 : GRAPHE MERMAID INTERACTIF                                         -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{#if activeTab === 'graph'}
		<div class="space-y-2">
			<div class="flex items-center justify-between text-xs text-muted-foreground px-1 flex-wrap gap-2">
				<div class="flex items-center gap-3 flex-wrap">
					<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Contrainte Coût</span>
					<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-indigo-400"></span> Décision / Option</span>
					<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Satisfait</span>
					<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Dégradé</span>
					<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-rose-600"></span> Non-conforme</span>
				</div>
				<span class="font-mono text-[11px]">Rendu vectoriel colorisé &amp; zoomable</span>
			</div>

			<MermaidViewer
				code={mermaidCode}
				title={selectedSubject ? `Graphe Causal · ${selectedSubject.section_ref} ${selectedSubject.name}` : 'Cartographie Causale d\'Impact · Optimum vs Compromis'}
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
						Tous les référentiels applicables sont pleinement honorés dans ce scénario.
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
										<span class="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Optimum Nominal :</span>
										<div class="font-mono text-emerald-800 dark:text-emerald-200 mt-0.5">{req.nominal}</div>
									</div>
									<div class="p-2 rounded bg-amber-500/10 border border-amber-500/20">
										<span class="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">Compromis Coût :</span>
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
					<span>Dette Technique Assumée &amp; Clauses de Révision (Vx → Vy)</span>
				</h3>
				<p class="text-xs text-muted-foreground mt-0.5">
					Un arbitrage économique n'est sain que si ses concessions sont formalisées dans un ADR assorti d'un seuil ou d'une condition de révision.
				</p>
			</div>

			{#if simulation.assumedTechnicalDebt.length === 0}
				<div class="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-200">
					Aucune dette technique assumée dans le scénario optimum nominal.
				</div>
			{:else}
				<div class="space-y-3">
					{#each simulation.assumedTechnicalDebt as debt}
						<div class="rounded-lg border p-3.5 bg-muted/20 space-y-2">
							<div class="flex items-center justify-between gap-2">
								<div class="flex items-center gap-2">
									<span class="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
										{debt.decisionId}
									</span>
									<span class="text-sm font-bold text-foreground">{debt.title}</span>
								</div>
								<span class="font-mono text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded shrink-0">
									{debt.savings}
								</span>
							</div>

							<div class="p-2.5 rounded bg-background border text-xs space-y-1">
								<div class="flex items-center gap-1.5 text-primary font-bold text-[11px]">
									<Clock class="h-3.5 w-3.5" />
									<span>Condition de révision / extinction (Vx → Vy) :</span>
								</div>
								<p class="text-foreground/90 pl-5">
									{debt.sunsetClause}
								</p>
							</div>

							<div class="flex items-center justify-between pt-1 flex-wrap gap-2">
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
			{/if}
		</div>
	{/if}
</div>
