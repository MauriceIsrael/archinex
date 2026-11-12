<script lang="ts">
	import { onMount } from 'svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { FrugalityOpportunity } from '$lib/domain/frugalityScoring';
	import {
		Scale,
		Sparkles,
		CheckCircle2,
		AlertCircle,
		ArrowUpRight,
		Coins,
		ChevronDown,
		ChevronUp,
		Info
	} from 'lucide-svelte';

	let opportunities = $state<FrugalityOpportunity[]>([]);
	let isLoading = $state(false);
	let isCollapsed = $state(false);
	let error = $state<string | null>(null);

	const activeProjectId = $derived(deliberationStore.activeEngagement?.id);

	async function loadOpportunities() {
		if (!activeProjectId) return;
		isLoading = true;
		error = null;
		try {
			const res = await fetch(`/api/projects/${activeProjectId}/frugality-opportunities`);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				error = data.error || 'Erreur lors du chargement des opportunités';
				return;
			}
			const data = await res.json();
			opportunities = data.opportunities || [];
		} catch (err: any) {
			error = err?.message || 'Erreur réseau';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		void loadOpportunities();
	});

	$effect(() => {
		if (activeProjectId) {
			void loadOpportunities();
		}
	});

	function handleNavigateToSubject(subjectId: string) {
		deliberationStore.selectSubject(subjectId);
		deliberationStore.setDeliberationViewMode('conversation');
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

<div class="rounded-xl border bg-card shadow-xs overflow-hidden transition-all">
	<!-- En-tête de la carte -->
	<div class="p-3.5 sm:p-4 flex items-center justify-between border-b bg-muted/20">
		<div class="flex items-center gap-2.5">
			<div class="h-8 w-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
				<Coins class="h-4 w-4" />
			</div>
			<div>
				<div class="flex items-center gap-2">
					<h3 class="text-sm font-semibold text-foreground">Top 5 Opportunités de Frugalité</h3>
					{#if opportunities.length > 0}
						<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
							{opportunities.length} opportunité{opportunities.length > 1 ? 's' : ''}
						</span>
					{/if}
				</div>
				<p class="text-xs text-muted-foreground mt-0.5">
					Sujets d'architecture où une alternative allège nettement les coûts sans compromis technique dramatique
				</p>
			</div>
		</div>

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

	<!-- Corps de la carte -->
	{#if !isCollapsed}
		<div class="p-3.5 sm:p-4 space-y-3">
			{#if isLoading}
				<div class="space-y-2.5 py-4">
					<div class="h-16 rounded-lg bg-muted/40 animate-pulse"></div>
					<div class="h-16 rounded-lg bg-muted/40 animate-pulse"></div>
				</div>
			{:else if error}
				<div class="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
					<AlertCircle class="h-4 w-4 shrink-0" />
					<span>{error}</span>
				</div>
			{:else if opportunities.length === 0}
				<div class="p-4 rounded-lg border border-dashed text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-1.5 py-6">
					<Info class="h-5 w-5 text-muted-foreground/70" />
					<p class="font-medium text-foreground">Aucune opportunité de frugalité détectée pour le moment</p>
					<p class="max-w-md text-[11px]">
						Cette analyse compare les scores des critères de type « cost » et techniques dans les matrices de décision. Ajoutez ou qualifiez les coûts dans vos sujets pour faire émerger les leviers.
					</p>
				</div>
			{:else}
				<div class="space-y-2.5">
					{#each opportunities as opp, index}
						{@const verdict = getVerdictBadge(opp.verdict)}
						{@const decision = getDecisionBadge(opp.decisionStatus)}

						<div class="p-3 rounded-lg border bg-background/60 hover:bg-muted/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
							<!-- Détails de l'opportunité -->
							<div class="space-y-1.5 flex-1 min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<span class="text-xs font-mono font-bold text-muted-foreground">#{index + 1}</span>
									<span class="text-xs font-mono font-semibold px-1.5 py-0.5 rounded bg-muted text-foreground">
										{opp.sectionRef}
									</span>
									<button
										type="button"
										class="text-xs font-bold text-foreground hover:text-primary transition-colors text-left truncate cursor-pointer"
										onclick={() => handleNavigateToSubject(opp.subjectId)}
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
								<div class="text-xs flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
									<div class="flex items-center gap-1">
										<span class="font-semibold text-emerald-600 dark:text-emerald-400">💡 Frugal :</span>
										<span class="font-medium text-foreground">{opp.frugalOption.title}</span>
										<span class="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
											(coût {opp.frugalOption.costScore >= 0 ? `+${opp.frugalOption.costScore}` : opp.frugalOption.costScore})
										</span>
									</div>

									<span class="text-muted-foreground/40 font-mono">vs</span>

									<div class="flex items-center gap-1">
										<span class="font-semibold text-zinc-600 dark:text-zinc-400">Référence :</span>
										<span class="font-medium text-foreground">{opp.referenceOption.title}</span>
										<span class="text-[10px] font-mono text-amber-600 dark:text-amber-400">
											(coût {opp.referenceOption.costScore >= 0 ? `+${opp.referenceOption.costScore}` : opp.referenceOption.costScore})
										</span>
									</div>
								</div>

								<!-- Justification / Pourquoi le compromis est acceptable -->
								{#if opp.keyAdvantage || opp.keyCompromise}
									<p class="text-[11px] text-muted-foreground line-clamp-1 italic">
										« {opp.keyAdvantage} »
										{#if opp.keyCompromise}
											<span class="not-italic text-zinc-500 dark:text-zinc-400">
												· Concession : {opp.keyCompromise}
											</span>
										{/if}
									</p>
								{/if}
							</div>

							<!-- Chiffres clés & Action -->
							<div class="flex items-center gap-3 shrink-0 self-end sm:self-center">
								<div class="text-right">
									<div class="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
										+{opp.costDelta} sur coût
									</div>
									<div class="text-[10px] font-mono text-muted-foreground">
										{opp.techDelta <= 0 ? '0 compromis tech' : `-${opp.techDelta} impact tech`}
									</div>
								</div>

								<button
									type="button"
									class="px-2.5 py-1.5 rounded-lg border bg-background hover:bg-muted text-xs font-medium text-foreground flex items-center gap-1 transition-colors cursor-pointer group-hover:border-primary/50"
									onclick={() => handleNavigateToSubject(opp.subjectId)}
								>
									<span>Matrice</span>
									<ArrowUpRight class="h-3.5 w-3.5" />
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
