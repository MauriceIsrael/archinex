<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { Check, X, Code2, Sparkles } from 'lucide-svelte';

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
	<div class="space-y-2 mb-4">
		{#each pendingRules as rule (rule.id)}
			<div class="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3.5 shadow-xs transition-all">
				<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
					<div class="space-y-1 flex-1">
						<div class="flex items-center gap-2">
							<span class="inline-flex items-center gap-1 rounded bg-indigo-600 text-white px-2 py-0.5 text-[10px] font-bold font-mono">
								<Sparkles class="h-3 w-3" />
								Règle Doctrinale Candidate
							</span>
							<span class="font-mono text-xs font-semibold text-indigo-700 dark:text-indigo-400">
								{rule.id}
							</span>
						</div>

						<h3 class="text-xs font-bold text-foreground">
							{rule.title}
						</h3>

						<p class="text-xs text-muted-foreground leading-relaxed">
							{rule.description}
						</p>
					</div>

					<!-- Actions -->
					<div class="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
						<button
							type="button"
							onclick={() => toggleSparql(rule.id)}
							class="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors shadow-2xs"
						>
							<Code2 class="h-3.5 w-3.5 text-indigo-600" />
							<span>{showSparql[rule.id] ? 'Masquer SPARQL' : 'SPARQL'}</span>
						</button>

						<button
							type="button"
							disabled={!isAuthorized}
							onclick={() => handleApprove(rule.id)}
							class="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors"
							title={isAuthorized ? 'Approuver cette règle doctrinale' : 'Action réservée au Lead Architect'}
						>
							<Check class="h-3.5 w-3.5" />
							<span>Approuver</span>
						</button>

						<button
							type="button"
							disabled={!isAuthorized}
							onclick={() => handleReject(rule.id)}
							class="inline-flex items-center gap-1 rounded-md border border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1.5 text-xs font-semibold transition-colors"
							title={isAuthorized ? 'Rejeter cette proposition' : 'Action réservée au Lead Architect'}
						>
							<X class="h-3.5 w-3.5" />
							<span>Rejeter</span>
						</button>
					</div>
				</div>

				<!-- Vue technique SPARQL dépliable -->
				{#if showSparql[rule.id]}
					<div class="mt-2.5 pt-2.5 border-t border-indigo-500/20">
						<pre class="rounded-md bg-muted/90 p-2.5 text-[10px] font-mono text-foreground overflow-x-auto leading-normal border shadow-inner">{rule.sparqlQuery}</pre>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
