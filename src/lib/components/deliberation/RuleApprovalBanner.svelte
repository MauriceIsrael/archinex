<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { CandidateRule } from '$lib/domain/smartMemoryRules';
	import { Check, X, Code2, Sparkles, Edit3, Save, RotateCcw, Send, Database } from 'lucide-svelte';

	let showSparql = $state<Record<string, boolean>>({});

	// État d'édition en direct d'une règle candidate
	let editingRuleId = $state<string | null>(null);
	let editTitle = $state<string>('');
	let editDescription = $state<string>('');
	let editTriggerContext = $state<string>('');
	let editSparqlQuery = $state<string>('');

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

	function startEditing(rule: CandidateRule) {
		editingRuleId = rule.id;
		editTitle = rule.title;
		editDescription = rule.description;
		editTriggerContext = rule.triggerContext;
		editSparqlQuery = rule.sparqlQuery;
	}

	function cancelEditing() {
		editingRuleId = null;
	}

	function handleSaveEdits(ruleId: string) {
		deliberationStore.updateCandidateRule(ruleId, {
			title: editTitle,
			description: editDescription,
			triggerContext: editTriggerContext,
			sparqlQuery: editSparqlQuery
		});
		editingRuleId = null;
	}

	function handleSaveAndApprove(ruleId: string) {
		deliberationStore.approveCandidateRule(ruleId, {
			title: editTitle,
			description: editDescription,
			triggerContext: editTriggerContext,
			sparqlQuery: editSparqlQuery
		});
		editingRuleId = null;
	}

	function handleApproveDirect(ruleId: string) {
		deliberationStore.approveCandidateRule(ruleId);
	}

	function handleReject(ruleId: string) {
		deliberationStore.rejectCandidateRule(ruleId);
	}
</script>

{#if pendingRules.length > 0}
	<div class="space-y-3 mb-4">
		{#each pendingRules as rule (rule.id)}
			<div class="rounded-xl border border-indigo-500/30 bg-indigo-500/[0.04] p-4 shadow-xs transition-all space-y-3">
				<!-- En-tête de la règle -->
				<div class="flex items-center justify-between gap-2 flex-wrap border-b border-indigo-500/20 pb-2.5">
					<div class="flex items-center gap-2">
						<span class="inline-flex items-center gap-1 rounded bg-indigo-600 text-white px-2 py-0.5 text-[10px] font-bold font-mono">
							<Sparkles class="h-3 w-3" />
							Règle Doctrinale Candidate
						</span>
						<span class="font-mono text-xs font-semibold text-indigo-700 dark:text-indigo-400">
							{rule.id}
						</span>
						<span class="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
							Confiance IA: {Math.round((rule.confidenceScore || 0.9) * 100)}%
						</span>
					</div>

					<div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
						<Database class="h-3.5 w-3.5 text-indigo-500" />
						<span>Destination : <strong>LLMOps Knowledge Hub (KB)</strong></span>
					</div>
				</div>

				{#if editingRuleId === rule.id}
					<!-- FORMULAIRE D'ÉDITION PRÉALABLE -->
					<div class="bg-background rounded-lg border border-indigo-500/30 p-3.5 space-y-3 shadow-2xs">
						<div class="flex items-center justify-between text-xs font-bold text-indigo-800 dark:text-indigo-300">
							<span class="flex items-center gap-1.5">
								<Edit3 class="h-3.5 w-3.5 text-indigo-600" />
								<span>Modifier la règle doctrinale avant transmission</span>
							</span>
							<span class="text-[11px] text-muted-foreground font-normal">
								Ajustez le titre, la prescription ou la formalisation SPARQL
							</span>
						</div>

						<div class="space-y-2">
							<div>
								<label for="edit-rule-title-{rule.id}" class="text-[11px] font-bold text-foreground block mb-0.5">
									Titre de la règle doctrinale :
								</label>
								<input
									id="edit-rule-title-{rule.id}"
									type="text"
									bind:value={editTitle}
									class="w-full text-xs px-2.5 py-1.5 rounded border border-border bg-background font-semibold"
								/>
							</div>

							<div>
								<label for="edit-rule-desc-{rule.id}" class="text-[11px] font-bold text-foreground block mb-0.5">
									Énoncé normatif & Prescription architecturale :
								</label>
								<textarea
									id="edit-rule-desc-{rule.id}"
									bind:value={editDescription}
									rows={3}
									class="w-full text-xs px-2.5 py-1.5 rounded border border-border bg-background leading-relaxed"
								></textarea>
							</div>

							<div>
								<label for="edit-rule-context-{rule.id}" class="text-[11px] font-bold text-foreground block mb-0.5">
									Contexte d'induction / Justification :
								</label>
								<input
									id="edit-rule-context-{rule.id}"
									type="text"
									bind:value={editTriggerContext}
									class="w-full text-xs px-2.5 py-1.5 rounded border border-border bg-background text-muted-foreground"
								/>
							</div>

							<div>
								<label for="edit-rule-sparql-{rule.id}" class="text-[11px] font-bold text-foreground block mb-0.5">
									Requête technique formelle SPARQL (Ontologie Knowledge Hub) :
								</label>
								<textarea
									id="edit-rule-sparql-{rule.id}"
									bind:value={editSparqlQuery}
									rows={4}
									class="w-full text-[11px] font-mono px-2.5 py-1.5 rounded border border-border bg-muted/80 text-foreground leading-normal"
								></textarea>
							</div>
						</div>

						<!-- Actions du formulaire d'édition -->
						<div class="flex items-center justify-between gap-2 pt-2 border-t flex-wrap">
							<button
								type="button"
								onclick={cancelEditing}
								class="inline-flex items-center gap-1 px-2.5 py-1 text-xs border rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
							>
								<RotateCcw class="h-3 w-3" />
								<span>Annuler</span>
							</button>

							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={() => handleSaveEdits(rule.id)}
									class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-500/20 shadow-2xs transition-colors cursor-pointer"
								>
									<Save class="h-3.5 w-3.5" />
									<span>Enregistrer les modifications</span>
								</button>

								<button
									type="button"
									disabled={!isAuthorized}
									onclick={() => handleSaveAndApprove(rule.id)}
									class="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-2xs transition-colors cursor-pointer"
									title={isAuthorized ? 'Sauvegarder, approuver et envoyer immédiatement dans la KB LLMOps' : 'Action réservée au Lead Architect'}
								>
									<Send class="h-3.5 w-3.5" />
									<span>Valider & Envoyer à LLMOps</span>
								</button>
							</div>
						</div>
					</div>
				{:else}
					<!-- VUE NORMALE DE LA RÈGLE -->
					<div class="flex flex-col md:flex-row md:items-start justify-between gap-3">
						<div class="space-y-1.5 flex-1 min-w-0">
							<h3 class="text-xs font-bold text-foreground">
								{rule.title}
							</h3>

							<p class="text-xs text-muted-foreground leading-relaxed">
								{rule.description}
							</p>

							{#if rule.triggerContext}
								<div class="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 italic pt-1">
									📌 {rule.triggerContext}
								</div>
							{/if}
						</div>

						<!-- Actions principales -->
						<div class="flex items-center gap-1.5 shrink-0 self-start flex-wrap">
							<button
								type="button"
								onclick={() => startEditing(rule)}
								class="inline-flex items-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
								title="Modifier la formulation de cette règle avant validation"
							>
								<Edit3 class="h-3.5 w-3.5" />
								<span>Modifier</span>
							</button>

							<button
								type="button"
								onclick={() => toggleSparql(rule.id)}
								class="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer"
							>
								<Code2 class="h-3.5 w-3.5 text-indigo-600" />
								<span>{showSparql[rule.id] ? 'Masquer SPARQL' : 'SPARQL'}</span>
							</button>

							<button
								type="button"
								disabled={!isAuthorized}
								onclick={() => handleApproveDirect(rule.id)}
								class="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
								title={isAuthorized ? 'Approuver cette règle et la stocker dans le Knowledge Hub LLMOps' : 'Action réservée au Lead Architect'}
							>
								<Send class="h-3.5 w-3.5" />
								<span>Approuver & Stocker en KB</span>
							</button>

							<button
								type="button"
								disabled={!isAuthorized}
								onclick={() => handleReject(rule.id)}
								class="inline-flex items-center gap-1 rounded-md border border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer"
								title={isAuthorized ? 'Rejeter cette proposition' : 'Action réservée au Lead Architect'}
							>
								<X class="h-3.5 w-3.5" />
								<span>Rejeter</span>
							</button>
						</div>
					</div>

					<!-- Vue technique SPARQL dépliable -->
					{#if showSparql[rule.id]}
						<div class="pt-2 border-t border-indigo-500/20">
							<pre class="rounded-md bg-muted/90 p-2.5 text-[10px] font-mono text-foreground overflow-x-auto leading-normal border shadow-inner">{rule.sparqlQuery}</pre>
						</div>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
{/if}
