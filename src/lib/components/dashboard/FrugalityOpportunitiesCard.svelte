<script lang="ts">
	import { goto } from '$app/navigation';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { FrugalityOpportunity } from '$lib/domain/frugalityScoring';
	import {
		Coins,
		ChevronDown,
		ChevronUp,
		ArrowUpRight,
		AlertCircle,
		Info,
		Sparkles,
		Filter
	} from 'lucide-svelte';

	let {
		opportunities: initialOpportunities = []
	}: {
		opportunities?: FrugalityOpportunity[];
	} = $props();

	let opportunities = $state<FrugalityOpportunity[]>(initialOpportunities);
	let isCollapsed = $state(false);
	let selectedProjectFilter = $state<string>('all');

	// Synchronise avec les props serveur
	$effect(() => {
		opportunities = initialOpportunities;
	});

	// Liste des projets uniques présents dans les opportunités
	const projectFilters = $derived.by(() => {
		const map = new Map<string, { id: string; title: string; badge: string; count: number }>();
		for (const opp of opportunities) {
			const pId = opp.projectId || 'unknown';
			const existing = map.get(pId);
			if (existing) {
				existing.count++;
			} else {
				map.set(pId, {
					id: pId,
					title: opp.projectTitle || pId,
					badge: opp.projectBadge || 'PRJ',
					count: 1
				});
			}
		}
		return Array.from(map.values());
	});

	// Filtrage des opportunités affichées
	const displayedOpportunities = $derived.by(() => {
		if (selectedProjectFilter === 'all') return opportunities;
		return opportunities.filter((o) => o.projectId === selectedProjectFilter);
	});

	function handleNavigateToSubject(opp: FrugalityOpportunity) {
		if (opp.projectId) {
			deliberationStore.switchEngagement(opp.projectId);
		}
		deliberationStore.selectSubject(opp.subjectId);
		deliberationStore.setDeliberationViewMode('conversation');
		goto('/deliberation');
	}

	function getVerdictBadge(verdict: FrugalityOpportunity['verdict']) {
		switch (verdict) {
			case 'no-brainer':
				return {
					label: 'Gain pur (0 compromis)',
					class: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
				};
			case 'negligible-compromise':
				return {
					label: 'Compromis minime',
					class: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30'
				};
			case 'acceptable-tradeoff':
				return {
					label: 'Compromis acceptable',
					class: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
				};
		}
	}

	function getDecisionBadge(status: FrugalityOpportunity['decisionStatus']) {
		switch (status) {
			case 'retained_frugal':
				return {
					label: 'Frugalité actée',
					class: 'bg-emerald-600 text-white font-semibold'
				};
			case 'retained_reference':
				return {
					label: 'Surcoût premium assumé',
					class: 'bg-zinc-700 text-zinc-100 font-medium'
				};
			case 'retained_other':
				return {
					label: 'Autre option retenue',
					class: 'bg-muted text-muted-foreground'
				};
			case 'open':
				return {
					label: 'À arbitrer',
					class: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-semibold'
				};
		}
	}
</script>

<div class="rounded-2xl border bg-card shadow-xs overflow-hidden transition-all">
	<!-- En-tête de la carte -->
	<div class="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b bg-muted/20">
		<div class="flex items-center gap-3">
			<div class="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
				<Coins class="h-5 w-5" />
			</div>
			<div>
				<div class="flex items-center gap-2">
					<h2 class="text-base font-bold text-foreground">Top 5 Opportunités de Frugalité</h2>
					{#if opportunities.length > 0}
						<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
							{opportunities.length} identifiée{opportunities.length > 1 ? 's' : ''}
						</span>
					{/if}
				</div>
				<p class="text-xs text-muted-foreground mt-0.5">
					Sujets d'architecture du portefeuille où une alternative allège nettement les coûts sans compromis technique dramatique
				</p>
			</div>
		</div>

		<div class="flex items-center gap-2 self-end sm:self-center">
			{#if projectFilters.length > 1}
				<!-- Filtre par projet si plusieurs projets sont concernés -->
				<div class="flex items-center gap-1.5 text-xs">
					<Filter class="h-3.5 w-3.5 text-muted-foreground" />
					<select
						bind:value={selectedProjectFilter}
						class="text-xs py-1 px-2 rounded-lg border bg-background text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
					>
						<option value="all">Tous les projets ({opportunities.length})</option>
						{#each projectFilters as pf}
							<option value={pf.id}>[{pf.badge}] {pf.title} ({pf.count})</option>
						{/each}
					</select>
				</div>
			{/if}

			<button
				type="button"
				class="h-8 w-8 rounded-lg border bg-background/50 hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors cursor-pointer"
				onclick={() => (isCollapsed = !isCollapsed)}
				aria-label={isCollapsed ? 'Déplier le rapport' : 'Replier le rapport'}
			>
				{#if isCollapsed}
					<ChevronDown class="h-4 w-4" />
				{:else}
					<ChevronUp class="h-4 w-4" />
				{/if}
			</button>
		</div>
	</div>

	<!-- Corps de la carte -->
	{#if !isCollapsed}
		<div class="p-5 space-y-3">
			{#if displayedOpportunities.length === 0}
				<div class="p-6 rounded-xl border border-dashed text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2 py-8">
					<Info class="h-6 w-6 text-muted-foreground/70" />
					<p class="font-semibold text-foreground text-sm">Aucune opportunité de frugalité détectée</p>
					<p class="max-w-md text-xs">
						L'algorithme compare automatiquement les options notées sur les critères financiers (<code class="px-1 py-0.5 rounded bg-muted">kind: 'cost'</code>) et les critères techniques dans les matrices de décision. Dès qu'un projet comporte des options contrastées avec évaluation des coûts, les leviers émergent ici.
					</p>
				</div>
			{:else}
				<div class="space-y-3">
					{#each displayedOpportunities as opp, index}
						{@const verdict = getVerdictBadge(opp.verdict)}
						{@const decision = getDecisionBadge(opp.decisionStatus)}

						<div class="p-4 rounded-xl border bg-background/70 hover:bg-muted/30 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 group">
							<!-- Détails de l'opportunité -->
							<div class="space-y-2 flex-1 min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<span class="text-xs font-mono font-bold text-muted-foreground">#{index + 1}</span>

									{#if opp.projectBadge}
										<span class="text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
											{opp.projectBadge}
										</span>
									{/if}

									<span class="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
										{opp.sectionRef}
									</span>

									<button
										type="button"
										class="text-sm font-bold text-foreground hover:text-primary transition-colors text-left truncate cursor-pointer"
										onclick={() => handleNavigateToSubject(opp)}
									>
										{opp.subjectName}
									</button>

									<!-- Badges Verdict & Décision -->
									<span class="text-[10px] px-2 py-0.5 rounded-full border {verdict.class}">
										{verdict.label}
									</span>
									<span class="text-[10px] px-2 py-0.5 rounded-full border {decision.class}">
										{decision.label}
									</span>
								</div>

								<!-- Confrontation des options -->
								<div class="text-xs flex flex-wrap items-center gap-x-3 gap-y-1.5 text-muted-foreground">
									<div class="flex items-center gap-1.5">
										<span class="font-semibold text-emerald-600 dark:text-emerald-400">💡 Frugal :</span>
										<span class="font-medium text-foreground">{opp.frugalOption.title}</span>
										<span class="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
											(note coût {opp.frugalOption.costScore >= 0 ? `+${opp.frugalOption.costScore}` : opp.frugalOption.costScore})
										</span>
									</div>

									<span class="text-muted-foreground/40 font-mono">vs</span>

									<div class="flex items-center gap-1.5">
										<span class="font-semibold text-zinc-600 dark:text-zinc-400">Référence :</span>
										<span class="font-medium text-foreground">{opp.referenceOption.title}</span>
										<span class="text-[11px] font-mono text-amber-600 dark:text-amber-400">
											(note coût {opp.referenceOption.costScore >= 0 ? `+${opp.referenceOption.costScore}` : opp.referenceOption.costScore})
										</span>
									</div>
								</div>

								<!-- Justification / Pourquoi le compromis est acceptable -->
								{#if opp.keyAdvantage || opp.keyCompromise}
									<p class="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded-lg border border-border/40">
										« {opp.keyAdvantage} »
										{#if opp.keyCompromise}
											<span class="not-italic text-zinc-600 dark:text-zinc-300 font-medium">
												— Compromis mesuré : {opp.keyCompromise}
											</span>
										{/if}
									</p>
								{/if}
							</div>

							<!-- Chiffres clés & Action -->
							<div class="flex items-center gap-4 shrink-0 self-end lg:self-center border-t lg:border-t-0 pt-2 lg:pt-0 w-full lg:w-auto justify-between lg:justify-end">
								<div class="text-left lg:text-right">
									<div class="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
										+{opp.costDelta} sur coût
									</div>
									<div class="text-xs font-mono text-muted-foreground">
										{opp.techDelta <= 0 ? '0 compromis tech' : `-${opp.techDelta} impact tech`}
									</div>
								</div>

								<button
									type="button"
									class="px-3 py-2 rounded-xl border bg-background hover:bg-primary hover:text-primary-foreground text-xs font-semibold text-foreground flex items-center gap-1.5 transition-colors cursor-pointer group-hover:border-primary/50 shadow-2xs"
									onclick={() => handleNavigateToSubject(opp)}
								>
									<span>Ouvrir en délibération</span>
									<ArrowUpRight class="h-4 w-4" />
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
