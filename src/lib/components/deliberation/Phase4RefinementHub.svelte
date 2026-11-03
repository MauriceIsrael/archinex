<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import Phase3SubjectSelector from './Phase3SubjectSelector.svelte';
	import {
		Cpu,
		ShieldCheck,
		Sparkles,
		Play,
		CheckCircle2,
		AlertTriangle,
		Network,
		Database,
		FileCode,
		RefreshCw,
		ExternalLink,
		Zap
	} from 'lucide-svelte';

	let {
		sessionRole = 'Lead Architect',
		sessionUser = null
	}: {
		sessionRole?: string;
		sessionUser?: { id?: string; name?: string; email?: string; role?: string } | null;
	} = $props();

	const activeSubject = $derived(deliberationStore.activeSubject);
	const projectId = $derived(
		deliberationStore.activeEngagement?.id || deliberationStore.activeEngagementId || 'default'
	);
	const subjectId = $derived(activeSubject?.id || 'sub_default');

	let currentEdp = $state<any>(null);
	let isLoading = $state(false);
	let isActionRunning = $state(false);
	let showRawJson = $state(false);
	let activeDriftScenario = $state<string>('reset_clean');
	let selectedConceptUrn = $state<string>('AUTO');

	const coverage = $derived(currentEdp?.refinementCoverage || null);
	const hydrated = $derived(currentEdp?.hydratedInventory || null);
	const lastVerdict = $derived(currentEdp?.lastVerdict || null);

	async function loadEdpData(subjId: string, projId: string, conceptFilter = selectedConceptUrn) {
		if (!subjId || !projId) return;
		isLoading = true;
		try {
			const res = await fetch(
				`/api/projects/${encodeURIComponent(projId)}/subjects/${encodeURIComponent(subjId)}/edp?edp=1&concept=${encodeURIComponent(conceptFilter)}`
			);
			if (res.ok) {
				const data = await res.json();
				currentEdp = data.edp;
			}
		} catch (err) {
			console.warn('[Phase 4 Refinement] Erreur chargement EDP:', err);
		} finally {
			isLoading = false;
		}
	}

	async function handleSelectConcept(conceptUrn: string) {
		selectedConceptUrn = conceptUrn;
		await loadEdpData(subjectId, projectId, conceptUrn);
	}

	$effect(() => {
		if (subjectId && projectId) {
			selectedConceptUrn = 'AUTO';
			void loadEdpData(subjectId, projectId, 'AUTO');
		}
	});

	async function triggerEdpAction(payload: Record<string, unknown>, successToast?: string) {
		if (!subjectId || !projectId) return;
		isActionRunning = true;
		try {
			const res = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/subjects/${encodeURIComponent(subjectId)}/edp?edp=1`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						edpId: currentEdp?.metadata?.id || `EDP-${subjectId}`,
						validatorId: sessionUser?.id || 'lead-architect',
						validatorRole: sessionRole || 'Lead Architect',
						selectedConceptUrn,
						...payload
					})
				}
			);
			const data = await res.json();
			if (res.ok) {
				if (data.edp) {
					currentEdp = data.edp;
				} else {
					await loadEdpData(subjectId, projectId);
				}
				deliberationStore.logNotification(
					data.message || successToast || 'Opération exécutée avec succès.',
					data.verdict === 'violated' ? 'warning' : 'success'
				);
			} else {
				deliberationStore.logNotification(data.error || 'Erreur lors de l’opération.', 'warning');
			}
		} catch (err: any) {
			deliberationStore.logNotification(err.message || 'Erreur réseau', 'warning');
		} finally {
			isActionRunning = false;
		}
	}

	async function handleBindLeaf(
		leafUrn: string,
		axisUrn?: string,
		bindMode: 'add' | 'replace' | 'remove' = 'add'
	) {
		await triggerEdpAction({ action: 'bind_aspect', leafUrn, axisUrn, bindMode });
	}

	async function handleBindAllMissingAxes() {
		if (!coverage?.axes) return;
		for (const axis of coverage.axes) {
			if (axis.status === 'missing_refinement' && axis.candidateLeaves.length > 0) {
				await triggerEdpAction({
					action: 'bind_aspect',
					leafUrn: axis.candidateLeaves[0].urn
				});
			}
		}
		await triggerEdpAction({ action: 'verify' }, 'Tous les axes obligatoires ont été raffinés et vérifiés par OPA !');
	}

	async function handleSimulateDrift(scenario: string) {
		activeDriftScenario = scenario;
		await triggerEdpAction(
			{ action: 'simulate_drift', driftScenario: scenario },
			scenario === 'reset_clean'
				? 'Inventaire LLD restauré à son état nominal conforme.'
				: `Simulation de dérive (${scenario}) évaluée par l'Oracle OPA.`
		);
	}
</script>

<div class="space-y-4" data-testid="phase4-refinement-hub">
	<!-- 1. Sélecteur de sujet (partagé avec la Phase 3 pour naviguer rapidement entre les sections) -->
	<Phase3SubjectSelector />

	<!-- 2. Bandeau de KPIs de la Phase 4 (Complétude KAOS, Objets Hydratés, Verdict OPA, Empreinte Ontologie) -->
	{#if coverage}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
			<!-- KPI 1 : Complétude KAOS Multi-Axes -->
			<div class="rounded-xl border bg-card p-3.5 shadow-2xs space-y-1.5">
				<div class="flex items-center justify-between text-xs">
					<span class="font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
						1. Complétude KAOS (AND-Refinement)
					</span>
					<Cpu class="h-4 w-4 text-indigo-500" />
				</div>
				<div class="flex items-baseline justify-between">
					<span class="text-xl font-extrabold text-foreground" data-testid="phase4-kpi-coverage">
						{coverage.metrics.axisCoveragePercent}%
					</span>
					<span class="text-xs font-mono text-muted-foreground">
						{coverage.metrics.coveredExecutableAxes}/{coverage.metrics.totalMandatoryAxes} axes exécutables
					</span>
				</div>
				<div class="w-full bg-muted h-1.5 rounded-full overflow-hidden">
					<div
						class="h-full transition-all duration-300 {coverage.metrics.isComplete ? 'bg-emerald-500' : 'bg-indigo-600'}"
						style="width: {coverage.metrics.axisCoveragePercent}%"
					></div>
				</div>
			</div>

			<!-- KPI 2 : Clauses d'Intention Couvertes -->
			<div class="rounded-xl border bg-card p-3.5 shadow-2xs space-y-1.5">
				<div class="flex items-center justify-between text-xs">
					<span class="font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
						2. Traçabilité des Clauses HLD
					</span>
					<Network class="h-4 w-4 text-violet-500" />
				</div>
				<div class="flex items-baseline justify-between">
					<span class="text-xl font-extrabold text-foreground">
						{coverage.metrics.coveredClauses}/{coverage.metrics.totalClauses}
					</span>
					<span class="text-xs font-mono text-muted-foreground">
						{coverage. composedBindings.length} feuille(s) liée(s)
					</span>
				</div>
				<p class="text-[11px] text-muted-foreground truncate">
					Concept : <strong>{coverage.matchedConcepts?.[0]?.title || 'Plateforme Cloud'}</strong>
				</p>
			</div>

			<!-- KPI 3 : Objets LLD Planned Hydratés -->
			<div class="rounded-xl border bg-card p-3.5 shadow-2xs space-y-1.5">
				<div class="flex items-center justify-between text-xs">
					<span class="font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
						3. Objets LLD Planned (Nautobot/Sylva)
					</span>
					<Database class="h-4 w-4 text-sky-500" />
				</div>
				<div class="flex items-baseline justify-between">
					<span class="text-xl font-extrabold text-foreground">
						{(hydrated?.nautobot_planned_devices?.length || 0) +
							(hydrated?.k8s_manifests?.length || 0) +
							(hydrated?.security_zones?.length || 0) +
							(hydrated?.environments?.length || 0)}
					</span>
					<span class="text-xs font-mono text-emerald-600 dark:text-emerald-400">
						{(hydrated?.coveredDomains || []).join(' · ')}
					</span>
				</div>
				<p class="text-[11px] text-muted-foreground">
					DCIM + CAPI + Zones + {hydrated?.environments?.length || 0} env + {hydrated?.power_feeds?.length || 0} PDU
				</p>
			</div>

			<!-- KPI 4 : Verdict de l'Oracle OPA Multi-Axes -->
			<div
				class="rounded-xl border p-3.5 shadow-2xs space-y-1.5 {lastVerdict?.verdict === 'violated'
					? 'bg-rose-500/10 border-rose-500/40'
					: 'bg-emerald-500/10 border-emerald-500/40'}"
				data-testid="phase4-kpi-verdict"
			>
				<div class="flex items-center justify-between text-xs">
					<span class="font-bold uppercase tracking-wider text-[10px] {lastVerdict?.verdict === 'violated' ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}">
						4. Verdict Oracle OPA & Drift
					</span>
					{#if lastVerdict?.verdict === 'violated'}
						<AlertTriangle class="h-4 w-4 text-rose-600" />
					{:else}
						<CheckCircle2 class="h-4 w-4 text-emerald-600" />
					{/if}
				</div>
				<div class="flex items-baseline justify-between">
					<span class="text-xl font-extrabold {lastVerdict?.verdict === 'violated' ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}">
						{lastVerdict?.verdict === 'violated' ? 'VIOLATION / DRIFT' : 'CONFORME'}
					</span>
					<span class="text-xs font-mono">
						{lastVerdict?.violations?.length || 0} violation(s)
					</span>
				</div>
				<p class="text-[10px] font-mono text-muted-foreground truncate" title={lastVerdict?.ontologyFingerprint}>
					SHA-256 : {(lastVerdict?.ontologyFingerprint || 'calculé à la volée').slice(0, 20)}…
				</p>
			</div>
		</div>
	{/if}

	<!-- 3. Corps Principal en 2 Colonnes : Gauche = Raffinement KAOS Multi-Axes | Droite = Hydratation LLD & Oracle OPA / Drift -->
	<div class="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
		<!-- ═════════════════════════════════════════════════════════════════════ -->
		<!-- COLONNE GAUCHE (7 cols) : MATRICE DE COUVERTURE DU RAFFINEMENT (KAOS) -->
		<!-- ═════════════════════════════════════════════════════════════════════ -->
		<div class="xl:col-span-7 space-y-4">
			<div class="rounded-xl border bg-card p-5 shadow-xs space-y-4">
				<div class="flex items-start justify-between gap-3 flex-wrap border-b pb-3">
					<div>
						<div class="flex items-center gap-2">
							<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
								Étape 1 · Raffinement Multi-Axes (KAOS AND/OR)
							</span>
							{#if coverage?.metrics?.isComplete}
								<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
									✓ 100% des axes obligatoires couverts
								</span>
							{:else if coverage}
								<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
									⚠️ {coverage.metrics.missingAxes} axe(s) obligatoire(s) non raffiné(s)
								</span>
							{/if}
						</div>
						<h3 class="text-sm font-bold text-foreground mt-1">
							Décomposition de l'Intention HLD sur les Sous-Axes de l'Ontologie
						</h3>
						<p class="text-xs text-muted-foreground mt-0.5">
							Les triplets <code class="font-mono text-indigo-600 dark:text-indigo-400">requires_aspect</code> de l'ontologie fixent les dimensions obligatoires que la spécification doit couvrir.
						</p>
					</div>

					<div class="flex items-center gap-2 flex-wrap">
						{#if coverage && coverage.metrics.missingAxes > 0}
							<button
								type="button"
								disabled={isActionRunning}
								onclick={handleBindAllMissingAxes}
								class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
								data-testid="bind-all-missing-axes-btn"
							>
								<Sparkles class="h-3.5 w-3.5" />
								<span>Compléter tous les axes manquants ({coverage.metrics.missingAxes})</span>
							</button>
						{/if}
						<a
							href="/knowledge?view=ontology"
							class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border bg-muted/40 hover:bg-muted text-xs font-semibold text-foreground transition-colors"
						>
							<Network class="h-3.5 w-3.5 text-indigo-500" />
							<span>Éditer les Triplets {'{S, V, O}'} ↗</span>
						</a>
					</div>
				</div>

				{#if coverage?.allConcepts && coverage.allConcepts.length > 0}
					<div class="p-3 rounded-lg border bg-muted/20 space-y-2" data-testid="phase4-hld-concepts-bar">
						<div class="flex items-center justify-between gap-2 flex-wrap">
							<span class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
								Socle Ontologique · {coverage.allConcepts.length} Grands Concepts HLD (SI / Telco)
							</span>
							<div class="flex items-center gap-1.5">
								<button
									type="button"
									onclick={() => handleSelectConcept('AUTO')}
									class="px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer {selectedConceptUrn === 'AUTO'
										? 'bg-indigo-600 text-white shadow-2xs'
										: 'bg-background border text-muted-foreground hover:text-foreground'}"
								>
									Auto-détection ({coverage.matchedConcepts?.length || 1} retenu)
								</button>
								<button
									type="button"
									onclick={() => handleSelectConcept('ALL')}
									class="px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer {selectedConceptUrn === 'ALL'
										? 'bg-indigo-600 text-white shadow-2xs'
										: 'bg-background border text-muted-foreground hover:text-foreground'}"
								>
									Tous les 6 concepts (18 sous-axes)
								</button>
							</div>
						</div>
						<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
							{#each coverage.allConcepts as concept}
								{@const isMatched = coverage.matchedConcepts?.some((m: any) => m.urn === concept.urn)}
								<button
									type="button"
									onclick={() => handleSelectConcept(concept.urn)}
									class="text-left p-2 rounded-lg border text-[11px] transition-all cursor-pointer flex items-center justify-between gap-2 {selectedConceptUrn === concept.urn
										? 'bg-indigo-600/15 border-indigo-500 text-indigo-900 dark:text-indigo-200 ring-1 ring-indigo-500/40'
										: isMatched
											? 'bg-emerald-500/10 border-emerald-500/40 text-foreground'
											: 'bg-background/80 hover:bg-muted border-border/70 text-muted-foreground'}"
									data-testid="hld-concept-pill-{concept.urn.split(':').pop()}"
								>
									<span class="font-semibold truncate" title={concept.title}>
										{concept.title.replace(/^Concept HLD\s*:\s*/i, '')}
									</span>
									<span class="shrink-0 px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">
										{concept.axesCount} axes
									</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				{#if isLoading}
					<div class="p-8 text-center text-xs text-muted-foreground animate-pulse">
						Interrogation du graphe d'ontologie et calcul de la matrice KAOS...
					</div>
				{:else if coverage}
					<!-- Liste des axes obligatoires -->
					<div class="space-y-2.5">
						{#each coverage.axes as axis, idx}
							<div
								class="p-3 rounded-lg border text-xs transition-all {axis.status === 'covered_executable'
									? 'bg-emerald-500/5 border-emerald-500/30'
									: axis.status === 'covered_no_oracle'
										? 'bg-amber-500/5 border-amber-500/30'
										: 'bg-rose-500/5 border-rose-500/30'}"
								data-testid="phase4-axis-card"
							>
								<div class="flex items-start justify-between gap-2 flex-wrap">
									<div class="space-y-0.5">
										<div class="flex items-center gap-2 flex-wrap">
											<span class="font-mono text-[10px] font-bold text-muted-foreground">
												AXE {idx + 1}
											</span>
											{#if axis.status === 'covered_executable'}
												<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
													🟢 Couvert & Exécutable
												</span>
											{:else if axis.status === 'covered_no_oracle'}
												<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300">
													🟡 Lié sans Oracle Rego
												</span>
											{:else}
												<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-800 dark:text-rose-300">
													🔴 Lacune de Raffinement (Axe Oublié)
												</span>
											{/if}
											<strong class="text-xs font-bold text-foreground">{axis.axisTitle}</strong>
										</div>
										<p class="text-[11px] text-muted-foreground">{axis.rationale}</p>
									</div>

									<!-- Boutons de sélection de feuille (OR-Refinement : cumul inclusif + remplacement exclusif) -->
									<div class="flex items-center gap-1.5 flex-wrap">
										{#each axis.candidateLeaves as cand}
											{@const isBound = axis.boundLeaves.some((b: any) => b.urn === cand.urn)}
											{@const isExecutableVariant = (cand.oracleRules?.length || 0) > 0}
											{#if !isBound && (axis.status === 'missing_refinement' || isExecutableVariant)}
												{#if axis.status === 'missing_refinement'}
													<button
														type="button"
														disabled={isActionRunning}
														onclick={() => handleBindLeaf(cand.urn, axis.axisUrn, 'add')}
														class="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors cursor-pointer"
														data-testid="phase4-bind-leaf-btn"
													>
														+ Raffiner via « {cand.title} »
													</button>
												{:else}
													<button
														type="button"
														disabled={isActionRunning}
														onclick={() => handleBindLeaf(cand.urn, axis.axisUrn, 'add')}
														class="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 transition-colors cursor-pointer"
														title="Cumuler cette seconde variante sur le même axe (ex: Cluster Sylva SR-IOV/DPDK CNF + Cluster Sylva Standard NIS2)"
														data-testid="phase4-bind-leaf-btn"
													>
														+ Cumuler « {cand.title} »
													</button>
													<button
														type="button"
														disabled={isActionRunning}
														onclick={() => handleBindLeaf(cand.urn, axis.axisUrn, 'replace')}
														class="px-2 py-1 rounded-md text-[10px] font-semibold border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-800 dark:text-indigo-200 transition-colors cursor-pointer"
														title="Remplacer la variante actuelle de cet axe par celle-ci"
													>
														⇄ Remplacer
													</button>
												{/if}
											{/if}
										{/each}
									</div>
								</div>

								<!-- Détail de la ou des feuille(s) liée(s), de leurs projections data.ontology et de leurs règles Rego -->
								{#if axis.boundLeaves.length > 0}
									<div class="mt-2.5 pt-2 border-t border-border/60 space-y-1.5">
										{#each axis.boundLeaves as leaf}
											<div class="flex items-center justify-between flex-wrap gap-2 text-[11px]">
												<div class="flex items-center gap-1.5 flex-wrap">
													<span class="text-muted-foreground">Feuille (<code class="font-mono text-[10px]">implemented_by</code>) :</span>
													<span class="font-mono font-semibold px-1.5 py-0.5 rounded bg-background border text-foreground">
														{leaf.title}
													</span>
													<span class="font-mono text-[10px] text-muted-foreground">({leaf.urn} · r{leaf.revision})</span>
													{#if axis.boundLeaves.length > 1}
														<button
															type="button"
															disabled={isActionRunning}
															onclick={() => handleBindLeaf(leaf.urn, axis.axisUrn, 'remove')}
															class="px-1.5 py-0.5 rounded text-[10px] font-semibold text-rose-600 hover:bg-rose-500/15 transition-colors cursor-pointer"
															title="Retirer cette variante cumulée de l'axe"
														>
															✕ Retirer
														</button>
													{/if}
												</div>
												{#if leaf.oracleRules?.length > 0}
													<span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
														⚖️ {leaf.oracleRules.length} règle(s) Rego actives
													</span>
												{:else}
													<span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300">
														⚠️ 0 règle Rego sur cette feuille
													</span>
												{/if}
											</div>
											{#if leaf.projections && Object.keys(leaf.projections).length > 0}
												<div class="text-[10px] font-mono text-muted-foreground bg-background/80 px-2 py-1 rounded border border-border/50">
													Projections <strong class="text-foreground">data.ontology</strong> :
													{JSON.stringify(leaf.projections)}
												</div>
											{/if}
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>

					<!-- Clauses d'intention extraites de la décision / spécification -->
					{#if coverage.clauses && coverage.clauses.length > 0}
						<div class="pt-3 border-t space-y-2">
							<h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
								Clauses d'intention extraites de la spécification ({coverage.metrics.coveredClauses}/{coverage.metrics.totalClauses} ancrées)
							</h4>
							<div class="space-y-1">
								{#each coverage.clauses as cl}
									<div class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border bg-muted/20 text-[11px]">
										<span class="truncate text-foreground" title={cl.text}>
											<strong class="font-mono text-[10px] text-muted-foreground mr-1">{cl.clauseId}</strong>
											{cl.text}
										</span>
										{#if cl.status === 'covered'}
											<span class="shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
												✓ {cl.matchedLeafTitle}
											</span>
										{:else}
											<span class="shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
												Non liée
											</span>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</div>

		<!-- ═════════════════════════════════════════════════════════════════════ -->
		<!-- COLONNE DROITE (5 cols) : HYDRATATION LLD, ORACLE OPA & SIMULATEUR DRIFT -->
		<!-- ═════════════════════════════════════════════════════════════════════ -->
		<div class="xl:col-span-5 space-y-4">
			<!-- BLOC A : Hydratation Multi-Axes (Nautobot DCIM + Sylva CAPI + Zones + Env + PDU) -->
			<div class="rounded-xl border bg-card p-5 shadow-xs space-y-3.5">
				<div class="flex items-center justify-between gap-2 flex-wrap border-b pb-2.5">
					<div>
						<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-500/15 text-sky-700 dark:text-sky-300">
							Étape 2 · Hydratation LLD (Planned State)
						</span>
						<h3 class="text-sm font-bold text-foreground mt-1">
							Objets Générés Multi-Axes (Nautobot & Sylva CAPI)
						</h3>
					</div>
					<div class="flex items-center gap-2">
						<button
							type="button"
							disabled={isActionRunning}
							onclick={() => triggerEdpAction({ action: 'hydrate' })}
							class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
							data-testid="phase4-hydrate-btn"
						>
							<Zap class="h-3.5 w-3.5" />
							<span>Hydrater Nautobot & Sylva</span>
						</button>
						<a
							href="http://localhost:8080/dcim/devices/"
							target="_blank"
							rel="noreferrer"
							class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border bg-muted/40 hover:bg-muted text-xs font-semibold text-foreground"
							title="Ouvrir l'interface Nautobot DCIM (admin / adminpassword)"
						>
							<span>Nautobot</span>
							<ExternalLink class="h-3 w-3" />
						</a>
					</div>
				</div>

				{#if hydrated}
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
						{#each hydrated.nautobot_planned_devices || [] as dev}
							<div class="p-2.5 rounded-lg border bg-muted/20 space-y-1">
								<div class="flex items-center justify-between">
									<span class="text-[10px] font-bold uppercase text-muted-foreground">Nautobot Device</span>
									<span class="font-mono text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
										{dev.status}
									</span>
								</div>
								<div class="font-mono font-bold text-foreground">{dev.name}</div>
								{#if dev.cluster_pool}
									<div class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 inline-block">
										Pool : {dev.cluster_pool}
									</div>
								{/if}
								<div class="text-[11px] text-muted-foreground">
									Modèle : <strong class="text-foreground">{dev.device_type}</strong>
								</div>
								<div class="text-[11px] text-muted-foreground">
									OOB IP : <code class="font-mono text-foreground">{dev.oob_ip || 'aucune'}</code> · {dev.interfaces?.length || 0} interfaces
								</div>
								<div class="text-[11px] text-muted-foreground">
									Énergie : <strong class="text-foreground">{(dev.power_feeds || []).join(' + ') || 'Aucune'}</strong>
								</div>
							</div>
						{/each}

						{#if hydrated.k8s_manifests?.[0]}
							{@const bmh = hydrated.k8s_manifests[0]}
							<div class="p-2.5 rounded-lg border bg-muted/20 space-y-1">
								<div class="flex items-center justify-between">
									<span class="text-[10px] font-bold uppercase text-muted-foreground">Sylva CAPI Manifest ({hydrated.k8s_manifests.length})</span>
									<span class="font-mono text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
										{bmh.kind}
									</span>
								</div>
								<div class="font-mono font-bold text-foreground">{bmh.metadata?.name}</div>
								<div class="text-[11px] text-muted-foreground">
									Rôle : <strong class="text-foreground">{bmh.spec?.role}</strong>
								</div>
								<div class="text-[11px] text-muted-foreground truncate" title={bmh.spec?.bmc?.address}>
									BMC : <code class="font-mono text-foreground">{bmh.spec?.bmc?.address}</code>
								</div>
								<div class="text-[11px] text-muted-foreground">
									Zones : <strong class="text-foreground">{(hydrated.security_zones || []).map((z: any) => z.zone_id).join(', ') || 'Aucune'}</strong>
								</div>
							</div>
						{/if}
					</div>

					<!-- Graphe d'Objets Exhaustif & Réconciliation Multi-Domaine (3GPP NRM / TM Forum SID / Nautobot SSoT) -->
					{#if hydrated.reconciliation_graph}
						{@const rg = hydrated.reconciliation_graph}
						<div class="p-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 space-y-2.5 text-[11px]" data-testid="phase4-reconciliation-graph">
							<div class="flex items-center justify-between gap-2 flex-wrap">
								<div>
									<div class="font-bold text-foreground flex items-center gap-1.5">
										<span>🔗 Graphe d'Objets & Réconciliation Multi-Domaine</span>
									</div>
									<p class="text-[10px] text-muted-foreground">
										Clé pivot de réconciliation inter-domaines : <code class="font-mono font-bold text-indigo-700 dark:text-indigo-300">tenant_ref = "{rg.pivot_tenant_id}"</code> (3GPP NRM · TM Forum GB922 · Nautobot SSoT)
									</p>
								</div>
								<span class="font-mono text-[10px] px-2 py-0.5 rounded-full font-semibold {rg.partner_organizations?.length > 0 && rg.sla_and_monitoring_contracts?.length > 0 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'}">
									{rg.partner_organizations?.length > 0 && rg.sla_and_monitoring_contracts?.length > 0 ? '✓ 7/7 Classes Réconciliées' : '❌ Rupture de Réconciliation'}
								</span>
							</div>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10px]">
								<div class="p-2 rounded border bg-background/80">
									<div class="font-bold text-muted-foreground uppercase">1. Organisations Tiers (Tenancy)</div>
									<div class="font-mono text-foreground mt-0.5">
										{rg.partner_organizations?.map((o: any) => o.id).join(', ') || '⚠️ Aucune (Orphelin)'}
									</div>
								</div>
								<div class="p-2 rounded border bg-background/80">
									<div class="font-bold text-muted-foreground uppercase">2. Objets Externes 3GPP (Shadow)</div>
									<div class="font-mono text-foreground mt-0.5">
										{rg.external_shadow_nodes?.map((n: any) => `${n.id} (${n.nrm_3gpp_class})`).join(', ')}
									</div>
								</div>
								<div class="p-2 rounded border bg-background/80">
									<div class="font-bold text-muted-foreground uppercase">3. Lien IP & Tunnel IPsec ESP</div>
									<div class="font-mono text-foreground mt-0.5">
										{rg.ip_underlay_links?.[0]?.id} → {rg.ipsec_tunnels?.[0]?.id} ({rg.ipsec_tunnels?.[0]?.cipher_suite})
									</div>
								</div>
								<div class="p-2 rounded border bg-background/80">
									<div class="font-bold text-muted-foreground uppercase">4. Chaîne Médiation S6a (Lot 3 ↔ Lot 1)</div>
									<div class="font-mono text-foreground mt-0.5">
										{rg.service_mediation_flows?.[0]?.source_shadow_ref} → {(rg.service_mediation_flows?.[0]?.mandatory_mediation_hops || []).join(' → ')} → {rg.service_mediation_flows?.[0]?.destination_core_ref}
									</div>
								</div>
								<div class="p-2 rounded border bg-background/80 sm:col-span-2">
									<div class="font-bold text-muted-foreground uppercase">5. Contrats SLA & Sondes NOC Réconciliés sur <code class="font-mono">{rg.pivot_tenant_id}</code></div>
									<div class="font-mono text-foreground mt-0.5">
										{rg.sla_and_monitoring_contracts?.map((c: any) => `${c.id} [${c.requirement_ref}]`).join(' · ') || '⚠️ Aucun contrat SLA ni sonde NOC lié au partenaire'}
									</div>
								</div>
							</div>
						</div>
					{/if}

					<div class="flex items-center justify-between pt-1">
						<span class="text-[11px] text-muted-foreground">
							Environnements générés :
							{#each hydrated.environments || [] as env}
								<span class="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-background ml-1">
									{env.env} ({env.isoprod ? 'iso-prod' : 'dev'})
								</span>
							{/each}
						</span>
						<button
							type="button"
							onclick={() => (showRawJson = !showRawJson)}
							class="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
						>
							{showRawJson ? 'Masquer le JSON LLD' : 'Voir le JSON LLD complet'}
						</button>
					</div>

					{#if showRawJson}
						<pre class="p-3 rounded-lg bg-slate-950 text-slate-100 font-mono text-[10px] overflow-x-auto max-h-60">{JSON.stringify(hydrated, null, 2)}</pre>
					{/if}
				{/if}
			</div>

			<!-- BLOC B : Oracle Déterministe OPA Multi-Axes & Simulateur de Drift CMDB -->
			<div class="rounded-xl border bg-card p-5 shadow-xs space-y-4">
				<div class="flex items-center justify-between gap-2 flex-wrap border-b pb-2.5">
					<div>
						<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/15 text-amber-700 dark:text-amber-300">
							Étape 3 · Oracle OPA Multi-Axes & Détection de Drift
						</span>
						<h3 class="text-sm font-bold text-foreground mt-1">
							Vérification Rego face à <code class="font-mono text-xs">data.ontology</code>
						</h3>
					</div>
					<button
						type="button"
						disabled={isActionRunning}
						onclick={() => triggerEdpAction({ action: 'verify' }, 'Évaluation OPA multi-axes terminée !')}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
						data-testid="phase4-verify-btn"
					>
						<Play class="h-3.5 w-3.5" />
						<span>Exécuter l'Oracle OPA</span>
					</button>
				</div>

				<!-- Résultat courant de l'évaluation OPA -->
				{#if lastVerdict}
					<div
						class="p-3.5 rounded-lg border text-xs space-y-2 {lastVerdict.verdict === 'violated'
							? 'bg-rose-500/10 border-rose-500/40 text-rose-900 dark:text-rose-200'
							: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-900 dark:text-emerald-200'}"
						data-testid="phase4-oracle-result"
					>
						<div class="flex items-center justify-between font-bold">
							<span>
								{lastVerdict.verdict === 'violated'
									? `❌ VIOLATION / DRIFT DÉTECTÉ (${lastVerdict.violations?.length || 0} règle(s) en échec)`
									: '✓ CONFORME SUR TOUS LES AXES LIÉS (0 violation Rego)'}
							</span>
							<span class="font-mono text-[10px] opacity-75">
								multi_axis_refinement.rego
							</span>
						</div>

						{#if lastVerdict.violations && lastVerdict.violations.length > 0}
							<ul class="space-y-1.5 pt-1 border-t border-rose-500/30">
								{#each lastVerdict.violations as vMsg}
									<li class="font-mono text-[11px] flex items-start gap-1.5">
										<span class="text-rose-600 font-bold">•</span>
										<span>{vMsg}</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}

				<!-- Simulateur de Dérive (Drift CMDB) sur les 5 axes -->
				<div class="space-y-2 pt-2 border-t">
					<div class="flex items-center justify-between">
						<span class="text-xs font-bold text-foreground">
							🧪 Simulateur de Dérive CMDB (Tester la détection OPA par axe)
						</span>
						{#if activeDriftScenario !== 'reset_clean'}
							<button
								type="button"
								onclick={() => handleSimulateDrift('reset_clean')}
								class="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer"
								data-testid="drift-reset-btn"
							>
								🔄 Restaurer l'état conforme
							</button>
						{/if}
					</div>
					<p class="text-[11px] text-muted-foreground">
						Simulez une modification sauvage dans Nautobot ou dans les manifestes K8s pour vérifier que l'Oracle Rego détecte immédiatement la violation :
					</p>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
						<button
							type="button"
							disabled={isActionRunning}
							onclick={() => handleSimulateDrift('unapproved_hardware')}
							class="px-2.5 py-1.5 rounded border text-left font-medium transition-colors cursor-pointer {activeDriftScenario === 'unapproved_hardware'
								? 'bg-rose-600 text-white border-rose-700'
								: 'bg-muted/30 hover:bg-rose-500/10 border-border text-foreground'}"
							data-testid="drift-btn-hardware"
						>
							💥 Axe 1 : Serveur Whitebox non homologué
						</button>
						<button
							type="button"
							disabled={isActionRunning}
							onclick={() => handleSimulateDrift('bmc_oob_mismatch')}
							class="px-2.5 py-1.5 rounded border text-left font-medium transition-colors cursor-pointer {activeDriftScenario === 'bmc_oob_mismatch'
								? 'bg-rose-600 text-white border-rose-700'
								: 'bg-muted/30 hover:bg-rose-500/10 border-border text-foreground'}"
							data-testid="drift-btn-oob"
						>
							💥 Axe 2 : Dérive IP BMC vs OOB Nautobot
						</button>
						<button
							type="button"
							disabled={isActionRunning}
							onclick={() => handleSimulateDrift('unproxied_oam')}
							class="px-2.5 py-1.5 rounded border text-left font-medium transition-colors cursor-pointer {activeDriftScenario === 'unproxied_oam'
								? 'bg-rose-600 text-white border-rose-700'
								: 'bg-muted/30 hover:bg-rose-500/10 border-border text-foreground'}"
							data-testid="drift-btn-oam"
						>
							💥 Axe 3 : Désactivation du Proxy Zone OAM
						</button>
						<button
							type="button"
							disabled={isActionRunning}
							onclick={() => handleSimulateDrift('non_isoprod_staging')}
							class="px-2.5 py-1.5 rounded border text-left font-medium transition-colors cursor-pointer {activeDriftScenario === 'non_isoprod_staging'
								? 'bg-rose-600 text-white border-rose-700'
								: 'bg-muted/30 hover:bg-rose-500/10 border-border text-foreground'}"
							data-testid="drift-btn-env"
						>
							💥 Axe 4 : Recette dégradée (non Iso-Prod)
						</button>
						<button
							type="button"
							disabled={isActionRunning}
							onclick={() => handleSimulateDrift('single_power_feed')}
							class="px-2.5 py-1.5 rounded border text-left font-medium transition-colors cursor-pointer sm:col-span-2 {activeDriftScenario === 'single_power_feed'
								? 'bg-rose-600 text-white border-rose-700'
								: 'bg-muted/30 hover:bg-rose-500/10 border-border text-foreground'}"
							data-testid="drift-btn-power"
						>
							💥 Axe 5 : Perte d'une adduction électrique (1 seule PDU au lieu de 2N)
						</button>
						<button
							type="button"
							disabled={isActionRunning}
							onclick={() => handleSimulateDrift('s6a_direct_bypass_dea')}
							class="px-2.5 py-1.5 rounded border text-left font-medium transition-colors cursor-pointer {activeDriftScenario === 's6a_direct_bypass_dea'
								? 'bg-rose-600 text-white border-rose-700'
								: 'bg-muted/30 hover:bg-rose-500/10 border-border text-foreground'}"
							data-testid="drift-btn-s6a-bypass"
						>
							💥 §14 : Flux S6a direct MME-Lot3 → HSS-Lot1 (Bypass DEA)
						</button>
						<button
							type="button"
							disabled={isActionRunning}
							onclick={() => handleSimulateDrift('orphan_partner_tenant')}
							class="px-2.5 py-1.5 rounded border text-left font-medium transition-colors cursor-pointer {activeDriftScenario === 'orphan_partner_tenant'
								? 'bg-rose-600 text-white border-rose-700'
								: 'bg-muted/30 hover:bg-rose-500/10 border-border text-foreground'}"
							data-testid="drift-btn-orphan-tenant"
						>
							💥 Réconciliation : Rupture pivot SLA / NOC Partenaire Lot 3
						</button>
					</div>
				</div>

				<!-- Validation formelle G3 du paquet -->
				<div class="pt-3 border-t flex items-center justify-between gap-2 flex-wrap">
					<div class="text-[11px] text-muted-foreground">
						Statut du paquet :
						<strong class="uppercase text-foreground">{currentEdp?.metadata?.status || 'proposed'}</strong>
					</div>
					<button
						type="button"
						disabled={isActionRunning || lastVerdict?.verdict === 'violated'}
						onclick={() => triggerEdpAction({ action: 'validate' }, 'Paquet Exécutable Multi-Axes homologué (Porte G3) !')}
						class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
						data-testid="phase4-validate-btn"
					>
						✓ Homologuer le Raffinement & l'EDP (G3)
					</button>
				</div>
			</div>
		</div>
	</div>
</div>

