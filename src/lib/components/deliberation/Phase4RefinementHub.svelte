<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import Phase3SubjectSelector from './Phase3SubjectSelector.svelte';
	import Phase4NautobotPlanPreview from './Phase4NautobotPlanPreview.svelte';
	import Phase4DriftDemoDrawer from './Phase4DriftDemoDrawer.svelte';
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
	let showSylvaValuesYaml = $state(false);
	let showOutOfScopeAxes = $state(false);
	let activeDriftScenario = $state<string>('reset_clean');
	let selectedConceptUrn = $state<string>('AUTO');

	const coverage = $derived(currentEdp?.refinementCoverage || null);
	const hydrated = $derived(currentEdp?.hydratedInventory || null);
	const lastVerdict = $derived(currentEdp?.lastVerdict || null);
	const sylvaGitopsExport = $derived(currentEdp?.sylvaGitopsExport || null);
	const isSubjectDecided = $derived(
		['L3_decided', 'L4_specified', 'L5_archived'].includes(activeSubject?.level || '')
	);
	const verdictSource = $derived<'defaults' | 'catalogue' | 'inventaire_reel'>(
		lastVerdict?.source || 'defaults'
	);
	const isSimulationOnly = $derived(!isSubjectDecided || verdictSource === 'defaults');
	let showAllResolvedComponents = $state(false);

	const subjectBoundComponentNames = $derived(
		new Set<string>(
			(coverage?.axes || []).flatMap((a: any) =>
				Array.isArray(a.instantiatedComponents) ? a.instantiatedComponents : []
			)
		)
	);
	const allResolvedComponents = $derived<any[]>(hydrated?.resolved_components || []);
	const displayedResolvedComponents = $derived(
		showAllResolvedComponents || subjectBoundComponentNames.size === 0
			? allResolvedComponents
			: allResolvedComponents.filter((c: any) => subjectBoundComponentNames.has(c.name))
	);

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

	async function handleUnratifyAxis(axisUrn: string, axisTitle: string, leafUrn?: string) {
		if (!confirm(`Révoquer la ratification sur l'axe « ${axisTitle} » ? Cette action sera journalisée.`)) {
			return;
		}
		await triggerEdpAction(
			{
				action: 'unratify',
				axisUrn,
				leafUrn,
				reason: `Révocation manuelle en Phase 4 sur l'axe ${axisTitle}.`
			},
			`Ratification révoquée sur l'axe « ${axisTitle} ».`
		);
	}

	async function handleDismissAxis(axisUrn: string, axisTitle: string) {
		await triggerEdpAction(
			{ action: 'dismiss_axis', axisUrn, selectedConceptUrn },
			`Axe « ${axisTitle} » écarté (hors-périmètre).`
		);
	}

	async function handleRestoreAxis(axisUrn: string, axisTitle: string) {
		await triggerEdpAction(
			{ action: 'restore_axis', axisUrn, selectedConceptUrn },
			`Axe « ${axisTitle} » réintégré dans le périmètre.`
		);
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

	{#if !isSubjectDecided}
		<div
			class="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5"
			data-testid="phase4-simulation-banner"
		>
			<AlertTriangle class="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
			<div class="space-y-0.5">
				<p class="font-bold">
					Mode Exploration / Simulation — Non opposable (maturité actuelle : {activeSubject?.level || 'L0_named'})
				</p>
				<p class="text-[11px] opacity-90">
					Ce sujet n'a pas encore atteint le jalon <strong>L3_decided</strong>. Les objets hydratés et évaluations OPA sont présentés à titre exploratoire uniquement ; la ratification et l'hydratation opposables sont déverrouillées après arbitrage formel en Phase 2.
				</p>
			</div>
		</div>
	{/if}

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
					Concept : <strong>{coverage.matchedConcepts?.[0]?.title || coverage.emergentCapability?.title || 'Périmètre spécifique (hors-infra)'}</strong>
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
					: isSimulationOnly
						? 'bg-amber-500/10 border-amber-500/40'
						: 'bg-emerald-500/10 border-emerald-500/40'}"
				data-testid="phase4-kpi-verdict"
			>
				<div class="flex items-center justify-between text-xs">
					<span class="font-bold uppercase tracking-wider text-[10px] {lastVerdict?.verdict === 'violated' ? 'text-rose-700 dark:text-rose-300' : isSimulationOnly ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}">
						4. Verdict Oracle OPA & Drift
					</span>
					{#if lastVerdict?.verdict === 'violated'}
						<AlertTriangle class="h-4 w-4 text-rose-600" />
					{:else if isSimulationOnly}
						<AlertTriangle class="h-4 w-4 text-amber-600" />
					{:else}
						<CheckCircle2 class="h-4 w-4 text-emerald-600" />
					{/if}
				</div>
				<div class="flex items-baseline justify-between gap-2">
					<span class="text-base font-extrabold {lastVerdict?.verdict === 'violated' ? 'text-rose-700 dark:text-rose-300' : isSimulationOnly ? 'text-amber-800 dark:text-amber-200' : 'text-emerald-700 dark:text-emerald-300'}">
						{#if lastVerdict?.verdict === 'violated'}
							VIOLATION / DRIFT
						{:else if isSimulationOnly}
							SIMULATION, NON OPPOSABLE
						{:else}
							CONFORME
						{/if}
					</span>
					<span class="text-xs font-mono shrink-0">
						{lastVerdict?.violations?.length || 0} violation(s)
					</span>
				</div>
				<p class="text-[10px] font-mono text-muted-foreground truncate" title={lastVerdict?.ontologyFingerprint}>
					Source : <strong>{verdictSource}</strong> · Rev : {(lastVerdict?.ontologyRevision || lastVerdict?.ontologyFingerprint || 'n/a').slice(0, 12)}
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
					{#if coverage.conscientiousMetrics}
						<div
							class="p-2.5 rounded-lg border flex items-center justify-between gap-2 flex-wrap text-xs {coverage.conscientiousMetrics.defaultProposedSlots > 0
								? 'bg-amber-500/10 border-amber-500/40 text-amber-900 dark:text-amber-200'
								: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-900 dark:text-emerald-200'}"
							data-testid="phase4-conscientious-banner"
						>
							<div class="flex items-center gap-2 flex-wrap">
								<span class="font-bold">
									{coverage.conscientiousMetrics.defaultProposedSlots > 0
										? `🟠 ${coverage.conscientiousMetrics.defaultProposedSlots} emplacement(s) en « Défaut proposé » (Zéro Défaut Silencieux : choix explicite requis)`
										: '🟢 100 % des axes et composants du sujet sont explicitement ratifiés'}
								</span>
								<span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-background/80 border">
									Ratification humaine : {Math.round((coverage.conscientiousMetrics.humanRatifiedRatio || 0) * 100)}%
								</span>
							</div>
							{#if coverage.conscientiousMetrics.defaultProposedSlots > 0}
								<button
									type="button"
									disabled={isActionRunning || !isSubjectDecided}
									onclick={() =>
										triggerEdpAction(
											{ action: 'bind_aspect', ratifyAllDefaults: true, selectedConceptUrn },
											'Tous les choix proposés du sujet ont été ratifiés et les composants synchronisés !'
										)}
									title={isSubjectDecided ? 'Ratifier explicitement les choix proposés' : 'Action opposable disponible uniquement à partir de L3_decided'}
									class="px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-2xs transition-colors cursor-pointer"
									data-testid="phase4-ratify-all-subject-btn"
								>
									✓ Ratifier les choix proposés du sujet
								</button>
							{/if}
						</div>
					{/if}

					<!-- Liste des axes obligatoires -->
					<div class="space-y-2.5">
						{#each coverage.axes as axis, idx}
							<div
								class="p-3 rounded-lg border text-xs transition-all {axis.requiresRatification
									? 'bg-amber-500/5 border-amber-500/40'
									: axis.status === 'covered_executable'
										? 'bg-emerald-500/5 border-emerald-500/30'
										: axis.status === 'covered_no_oracle'
											? 'bg-amber-500/5 border-amber-500/30'
											: 'bg-rose-500/5 border-rose-500/30'}"
								data-testid="phase4-axis-card"
							>
								<div class="flex items-start justify-between gap-2 flex-wrap">
									<div class="space-y-1">
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
											{#if axis.requiresRatification}
												<span
													class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/25 text-amber-900 dark:text-amber-200 border border-amber-500/40"
													data-testid="phase4-axis-default-proposed-badge"
												>
													🟠 Défaut proposé — À ratifier
												</span>
											{:else if axis.bindingOrigin === 'explicit' || axis.bindingOrigin === 'strong_link'}
												<span
													class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-800 dark:text-indigo-200 border border-indigo-500/30"
													data-testid="phase4-axis-ratified-badge"
												>
													✓ Décidé / Ratifié
												</span>
											{/if}
											{#if axis.instantiatedComponents && axis.instantiatedComponents.length > 0}
												<span
													class="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-violet-500/15 text-violet-800 dark:text-violet-200 border border-violet-500/30"
													data-testid="phase4-axis-components"
												>
													🧩 Composant(s) cible(s) : {axis.instantiatedComponents.join(', ')}
												</span>
											{:else}
												<span
													class="px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/25"
													data-testid="phase4-axis-components"
												>
													🧩 Composant cible : Infrastructure / Transverse ({axis.togafDomain || axis.domain})
												</span>
											{/if}
											{#if axis.relevanceLevel && axis.relevanceLevel !== 'out_of_scope'}
												<span
													class="px-1.5 py-0.5 rounded text-[10px] font-semibold border {axis.relevanceLevel === 'high'
														? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
														: axis.relevanceLevel === 'medium'
															? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30'
															: 'bg-muted text-muted-foreground border-border'}"
													data-testid="phase4-axis-relevance-badge"
												>
													Pertinence : {axis.relevanceLevel === 'high' ? 'Haute' : axis.relevanceLevel === 'medium' ? 'Moyenne' : 'Faible'}
												</span>
											{/if}
											<strong class="text-xs font-bold text-foreground">{axis.axisTitle}</strong>
										</div>
										<p class="text-[11px] text-muted-foreground">{axis.rationale}</p>
										{#if axis.activationReason}
											<div
												class="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground"
												data-testid="phase4-axis-activation-reason"
											>
												<span class="px-1.5 py-0.5 rounded bg-background/80 border border-border/60 text-foreground/90">
													🎯 Motif : {axis.activationReason.summary}
												</span>
												{#each axis.activationReason.matchedRequirementIds || [] as reqId}
													<span class="px-1.5 py-0.5 rounded font-mono bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30">
														{reqId}
													</span>
												{/each}
											</div>
										{/if}
									</div>

									<!-- Boutons de sélection de feuille (OR-Refinement : ratification directe, remplacement exclusif ou cumul inclusif) -->
									<div class="flex items-center gap-1.5 flex-wrap">
										<button
											type="button"
											disabled={isActionRunning}
											onclick={() => handleDismissAxis(axis.axisUrn, axis.axisTitle)}
											class="px-2 py-1 rounded-md text-[10px] font-semibold border border-border/70 bg-background/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
											title="Écarter cet axe s'il est hors-périmètre pour ce sujet"
											data-testid="phase4-dismiss-axis-btn"
										>
											✕ Hors-périmètre
										</button>
										{#if axis.requiresRatification && axis.boundLeaves?.[0]}
											<button
												type="button"
												disabled={isActionRunning || !isSubjectDecided}
												onclick={() => handleBindLeaf(axis.boundLeaves[0].urn, axis.axisUrn, 'replace')}
												class="px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-2xs transition-colors cursor-pointer"
												title={isSubjectDecided ? 'Ratifier explicitement la variante proposée et instancier le composant associé' : 'Action opposable disponible uniquement à partir de L3_decided'}
												data-testid="phase4-ratify-axis-btn"
											>
												✓ Ratifier « {axis.boundLeaves[0].title} »
											</button>
										{:else if axis.boundLeaves?.length > 0 && (axis.bindingOrigin === 'explicit' || axis.bindingOrigin === 'strong_link')}
											<button
												type="button"
												disabled={isActionRunning}
												onclick={() =>
													handleUnratifyAxis(axis.axisUrn, axis.axisTitle, axis.boundLeaves[0]?.urn)}
												class="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-800 dark:text-rose-200 transition-colors cursor-pointer"
												title="Révoquer la ratification de cet axe et revenir sur le choix acté"
												data-testid="phase4-unratify-axis-btn"
											>
												↺ Révoquer
											</button>
										{/if}
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
														onclick={() => handleBindLeaf(cand.urn, axis.axisUrn, 'replace')}
														class="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-800 dark:text-indigo-200 transition-colors cursor-pointer"
														title="Choisir cette variante d'architecture pour cet axe (remplace la variante actuelle)"
														data-testid="phase4-replace-leaf-btn"
													>
														⇄ Choisir « {cand.title} »
													</button>
													<button
														type="button"
														disabled={isActionRunning}
														onclick={() => handleBindLeaf(cand.urn, axis.axisUrn, 'add')}
														class="px-2 py-1 rounded-md text-[10px] font-semibold border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 transition-colors cursor-pointer"
														title="Cumuler cette seconde variante sur le même axe"
														data-testid="phase4-bind-leaf-btn"
													>
														+ Cumuler
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
											{@const leafComponents = leaf.targetComponents?.length
												? leaf.targetComponents
												: axis.instantiatedComponents?.length
													? axis.instantiatedComponents
													: []}
											<div class="flex items-center justify-between flex-wrap gap-2 text-[11px]">
												<div class="flex items-center gap-1.5 flex-wrap">
													<span class="text-muted-foreground">Feuille (<code class="font-mono text-[10px]">implemented_by</code>) :</span>
													<span class="font-mono font-semibold px-1.5 py-0.5 rounded bg-background border text-foreground">
														{leaf.title}
													</span>
													<span class="font-mono text-[10px] text-muted-foreground">({leaf.urn} · r{leaf.revision})</span>
													<span
														class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-800 dark:text-violet-200 border border-violet-500/30"
														data-testid="phase4-leaf-components"
													>
														🧩 {leafComponents.length > 0 ? leafComponents.join(', ') : `Infrastructure / Transverse (${leaf.domain})`}
													</span>
													<button
														type="button"
														disabled={isActionRunning}
														onclick={() => handleBindLeaf(leaf.urn, axis.axisUrn, 'remove')}
														class="px-1.5 py-0.5 rounded text-[10px] font-semibold text-rose-600 hover:bg-rose-500/15 transition-colors cursor-pointer"
														title="Retirer cette feuille ontologique de l'axe"
														data-testid="phase4-remove-leaf-btn"
													>
														✕ Retirer
													</button>
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
											{#if leaf.oracleRules?.length > 0}
												<div
													class="flex items-center gap-1.5 flex-wrap text-[10px] font-mono text-muted-foreground"
													data-testid="phase4-leaf-rego-rules"
												>
													{#each leaf.oracleRules as rule}
														<span class="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25">
															⚖️ {rule.split('.').pop()} → 🧩 {leafComponents.length > 0 ? leafComponents.join(', ') : leaf.domain}
														</span>
													{/each}
												</div>
											{/if}
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

						{#if coverage.axes.length === 0}
							<div
								class="p-4 rounded-lg border border-dashed text-center text-xs text-muted-foreground"
								data-testid="phase4-no-relevant-axes"
							>
								Aucun axe d'architecture infrastructure/socle pertinent n'a été retenu pour le périmètre de ce sujet.
							</div>
						{/if}

						{#if coverage.outOfScopeAxes && coverage.outOfScopeAxes.length > 0}
							<div class="rounded-lg border border-border/70 bg-muted/20 p-2.5 space-y-2" data-testid="phase4-out-of-scope-panel">
								<div class="flex items-center justify-between gap-2 flex-wrap text-[11px]">
									<span class="font-semibold text-muted-foreground">
										🔍 {coverage.outOfScopeAxes.length} axe(s) hors-périmètre masqué(s) automatiquement ou écarté(s)
									</span>
									<button
										type="button"
										onclick={() => (showOutOfScopeAxes = !showOutOfScopeAxes)}
										class="px-2 py-0.5 rounded border bg-background hover:bg-muted text-[10px] font-semibold text-foreground cursor-pointer"
										data-testid="phase4-toggle-out-of-scope-btn"
									>
										{showOutOfScopeAxes ? 'Masquer' : 'Afficher les axes hors-périmètre'}
									</button>
								</div>
								{#if showOutOfScopeAxes}
									<div class="space-y-1.5 pt-1 border-t border-border/50">
										{#each coverage.outOfScopeAxes as oosAxis}
											<div class="flex items-center justify-between gap-2 flex-wrap p-2 rounded border bg-background/70 text-[11px]" data-testid="phase4-out-of-scope-item">
												<div class="space-y-0.5">
													<div class="font-semibold text-foreground">{oosAxis.axisTitle}</div>
													{#if oosAxis.activationReason}
														<div class="text-[10px] text-muted-foreground">{oosAxis.activationReason.summary}</div>
													{/if}
												</div>
												<button
													type="button"
													disabled={isActionRunning}
													onclick={() => handleRestoreAxis(oosAxis.axisUrn, oosAxis.axisTitle)}
													class="px-2 py-1 rounded text-[10px] font-semibold bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-800 dark:text-indigo-200 border border-indigo-500/30 cursor-pointer"
													data-testid="phase4-restore-axis-btn"
												>
													↩ Réintégrer
												</button>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
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
		<!-- COLONNE DROITE (5 cols) : INTENTION, PLAN DRY-RUN NAUTOBOT & ORACLE   -->
		<!-- ═════════════════════════════════════════════════════════════════════ -->
		<div class="xl:col-span-5 space-y-4">
			<!-- BLOC A : Plan Dry-Run Nautobot & Lien unique Nautobot (Issue #405) -->
			<Phase4NautobotPlanPreview
				{hydrated}
				{displayedResolvedComponents}
				{allResolvedComponents}
				{subjectBoundComponentNames}
				bind:showAllResolvedComponents
				edpStatus={currentEdp?.metadata?.status || 'proposed'}
			/>

			<!-- BLOC B : Vérification d'intention OPA & Ratification -->
			<div class="rounded-xl border bg-card p-5 shadow-xs space-y-4">
				<div class="flex items-center justify-between gap-2 flex-wrap border-b pb-2.5">
					<div>
						<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/15 text-amber-700 dark:text-amber-300">
							Étape 2 · Vérification d'intention (Oracle OPA)
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
						<div class="flex items-center justify-between font-bold gap-2 flex-wrap">
							<span>
								{lastVerdict.verdict === 'violated'
									? `❌ VIOLATION / DRIFT DÉTECTÉ (${lastVerdict.violations?.length || 0} règle(s) en échec)`
									: '✓ CONFORME SUR TOUS LES AXES LIÉS (0 violation Rego)'}
							</span>
							{#if lastVerdict.source}
								<span
									class="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-background/70"
									data-testid="phase4-oracle-source-badge"
								>
									{lastVerdict.source === 'nautobot_live'
										? 'Source : Nautobot (lecture)'
										: lastVerdict.source === 'nautobot_webhook'
											? 'Source : Webhook Nautobot'
											: lastVerdict.source === 'local_simulated'
												? 'Source : Mode démonstration'
												: 'Source : Plan d’intention local'}
								</span>
							{/if}
						</div>

						{#if (lastVerdict.detailedViolations && lastVerdict.detailedViolations.length > 0) || (lastVerdict.violations && lastVerdict.violations.length > 0)}
							{@const list = lastVerdict.detailedViolations && lastVerdict.detailedViolations.length > 0 ? lastVerdict.detailedViolations : lastVerdict.violations}
							<ul class="space-y-2 pt-1 border-t border-rose-500/30">
								{#each list as v}
									<li class="font-mono text-[11px] flex items-start gap-1.5" data-testid="phase4-oracle-violation-item">
										<span class="text-rose-600 font-bold">•</span>
										<div class="flex flex-col gap-0.5">
											<span>{typeof v === 'string' ? v : v.message}</span>
											{#if typeof v === 'object' && v}
												<div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
													{#if v.violated_clause_urn}
														<a
															href="/kb/clauses?query={encodeURIComponent(v.violated_clause_urn)}"
															target="_blank"
															rel="noreferrer"
															class="inline-flex items-center text-[10px] text-blue-600 hover:underline bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800"
															data-testid="violated-clause-link"
														>
															{v.violated_clause_urn}
														</a>
													{/if}
													{#if v.violated_requirement_id}
														<span
															class="inline-flex items-center text-[10px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800"
															data-testid="violated-req-badge"
														>
															{v.violated_requirement_id}
														</span>
													{/if}
												</div>
											{/if}
										</div>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}

				<!-- Validation formelle de l'intention -->
				<div class="pt-3 border-t flex items-center justify-between gap-2 flex-wrap">
					<div class="text-[11px] text-muted-foreground">
						Statut de ratification :
						<strong class="uppercase text-foreground">{currentEdp?.metadata?.status || 'proposed'}</strong>
					</div>
					<button
						type="button"
						disabled={isActionRunning || lastVerdict?.verdict === 'violated'}
						onclick={() => triggerEdpAction({ action: 'validate' }, 'Intention de planification ratifiée !')}
						class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
						data-testid="phase4-validate-btn"
					>
						✓ Ratifier l'intention
					</button>
				</div>

				<!-- Outil de démonstration hors parcours principal (Issue #405) -->
				<Phase4DriftDemoDrawer
					{activeDriftScenario}
					{isActionRunning}
					onSimulateDrift={handleSimulateDrift}
				/>
			</div>
		</div>
	</div>
</div>

