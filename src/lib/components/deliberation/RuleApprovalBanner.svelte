<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { Sparkles, Check, X, Code2, ShieldAlert, BrainCircuit, ExternalLink } from 'lucide-svelte';

	let showSparql = $state<Record<string, boolean>>({});

	const pendingRules = $derived(
		deliberationStore.candidateRules.filter((r) => r.status === 'pending')
	);

	const isAuthorized = $derived(
		deliberationStore.currentRole === 'lead_architect' ||
		deliberationStore.currentRole === 'Lead Architect'
	);

	function toggleSparql(ruleId: string) {
		showSparql[ruleId] = !showSparql[ruleId];
	}

	function handleApprove(ruleId: string) {
		deliberationStore.approveCandidateRule(ruleId);
	}

	function handleReject(ruleId: string) {
		deliberationStore.rejectCandidateRule(ruleId);
	}
</script>

{#if pendingRules.length > 0}
	<div class="space-y-3 mb-6">
		{#each pendingRules as rule (rule.id)}
			<div class="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 shadow-xs transition-all">
				<div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
					<div class="space-y-2 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="inline-flex items-center gap-1 rounded bg-indigo-600 text-white px-2 py-0.5 text-[11px] font-bold tracking-wide">
								<BrainCircuit class="h-3 w-3" />
								TOUR 8 · SMARTMEMORY
							</span>
							<span class="font-mono text-xs font-semibold text-indigo-700 dark:text-indigo-400">
								{rule.id}
							</span>
							<span class="rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 px-2 py-0.5 text-[11px] font-medium">
								{Math.round(rule.confidenceScore * 100)}% confiance neuro-symbolique
							</span>
							{#if !isAuthorized}
								<span class="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">
									<ShieldAlert class="h-3 w-3 text-amber-600" />
									Approbation réservée au Lead Architect
								</span>
							{/if}
						</div>

						<h3 class="text-sm font-bold text-foreground">
							{rule.title}
						</h3>

						<p class="text-xs text-muted-foreground leading-relaxed">
							{rule.description}
						</p>

						<div class="text-[11px] text-muted-foreground/80 italic flex items-center gap-1.5">
							<span>🔍 Contexte d'induction : {rule.triggerContext}</span>
						</div>
					</div>

					<!-- Actions d'arbitrage -->
					<div class="flex flex-wrap items-center gap-2 self-start md:self-center">
						<button
							type="button"
							onclick={() => toggleSparql(rule.id)}
							class="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
							title="Afficher la requête formelle SPARQL"
						>
							<Code2 class="h-3.5 w-3.5 text-indigo-600" />
							<span>{showSparql[rule.id] ? 'Masquer SPARQL' : 'Voir SPARQL'}</span>
						</button>

						<button
							type="button"
							disabled={!isAuthorized}
							onclick={() => handleApprove(rule.id)}
							class="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 text-xs font-bold shadow-xs transition-colors"
						>
							<Check class="h-3.5 w-3.5" />
							<span>Approuver Doctrine</span>
						</button>

						<button
							type="button"
							disabled={!isAuthorized}
							onclick={() => handleReject(rule.id)}
							class="inline-flex items-center gap-1 rounded-md border border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 text-xs font-semibold transition-colors"
						>
							<X class="h-3.5 w-3.5" />
							<span>Rejeter</span>
						</button>
					</div>
				</div>

				<!-- Vue technique SPARQL dépliable -->
				{#if showSparql[rule.id]}
					<div class="mt-3 pt-3 border-t border-indigo-500/20">
						<div class="flex items-center justify-between mb-1.5">
							<span class="text-[11px] font-mono font-semibold text-muted-foreground uppercase">
								Formulation Neuro-Symbolique SPARQL 1.1
							</span>
							<span class="text-[10px] text-muted-foreground">
								Antécédents : {rule.antecedents.join(', ')}
							</span>
						</div>
						<pre class="rounded-md bg-muted/90 p-3 text-[11px] font-mono text-foreground overflow-x-auto leading-normal border shadow-inner">{rule.sparqlQuery}</pre>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
