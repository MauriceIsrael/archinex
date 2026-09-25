<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { HelpCircle, AlertTriangle, ArrowRight, X, Shield, GitCommit, FileText, UserCheck } from 'lucide-svelte';

	const statement = $derived(deliberationStore.selectedStatementForWhy);
	const isOpen = $derived(deliberationStore.isWhyInspectorOpen && statement !== null);

	const dependents = $derived(
		statement ? deliberationStore.getTransitiveDependents(statement.id) : []
	);

	function handleClose() {
		deliberationStore.closeWhyInspector();
	}

	function handleRetract() {
		if (!statement) return;
		deliberationStore.retractStatement(statement.id);
		deliberationStore.closeWhyInspector();
	}
</script>

{#if isOpen && statement}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
		role="dialog"
		aria-modal="true"
		aria-labelledby="why-title"
	>
		<div class="relative w-full max-w-2xl rounded-xl border bg-card p-6 shadow-xl transition-all">
			<!-- Header -->
			<div class="flex items-start justify-between border-b pb-4">
				<div class="flex items-center gap-2">
					<div class="rounded-lg bg-indigo-500/10 p-2 text-indigo-600 dark:text-indigo-400">
						<HelpCircle class="h-5 w-5" />
					</div>
					<div>
						<h3 id="why-title" class="text-base font-bold text-foreground">
							Inspecteur Épistémique · Justification « Pourquoi ? »
						</h3>
						<p class="text-xs text-muted-foreground">
							Traçabilité neuro-symbolique et simulation d'impact en cascade
						</p>
					</div>
				</div>
				<button
					type="button"
					onclick={handleClose}
					class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
					aria-label="Fermer l'inspecteur"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<div class="mt-4 space-y-4 max-h-[75vh] overflow-y-auto pr-1">
				<!-- Énoncé Triplet -->
				<div class="rounded-lg bg-muted/50 p-3.5 border">
					<div class="flex items-center justify-between mb-2">
						<span class="font-mono text-xs font-bold text-primary">{statement.id}</span>
						<span class="text-[11px] font-mono text-muted-foreground">{statement.section}</span>
					</div>
					<div class="space-y-1 font-mono text-xs">
						<div><span class="text-muted-foreground">Sujet :</span> <strong class="text-foreground">{statement.triplet.subject}</strong></div>
						<div><span class="text-muted-foreground">Prédicat :</span> <strong class="text-foreground">{statement.triplet.predicate}</strong></div>
						<div><span class="text-muted-foreground">Valeur :</span> <span class="rounded bg-background px-1.5 py-0.5 border text-foreground font-semibold">{statement.triplet.value}</span></div>
					</div>
				</div>

				<!-- Les 5 Facettes Épistémiques -->
				<div class="grid grid-cols-2 gap-3 text-xs">
					<div class="rounded-lg border p-3 bg-card space-y-1">
						<div class="flex items-center gap-1.5 text-muted-foreground font-semibold">
							<Shield class="h-3.5 w-3.5 text-emerald-600" />
							<span>Statut de Confiance</span>
						</div>
						<div class="flex items-center gap-1.5 pt-1">
							<span class="rounded bg-primary/10 text-primary font-bold px-2 py-0.5 text-[11px]">
								{statement.maturity.confidence}
							</span>
							<span class="text-[11px] text-muted-foreground">
								(Niveau : {statement.maturity.subjectLevel})
							</span>
						</div>
					</div>

					<div class="rounded-lg border p-3 bg-card space-y-1">
						<div class="flex items-center gap-1.5 text-muted-foreground font-semibold">
							<UserCheck class="h-3.5 w-3.5 text-indigo-600" />
							<span>Autorité & Mode</span>
						</div>
						<div class="text-[11px] font-medium pt-1">
							{statement.authority.author} · <span class="italic text-muted-foreground">{statement.authority.productionMode}</span>
						</div>
					</div>
				</div>

				<!-- Antécédents Caucaux (basedOn) -->
				<div class="rounded-lg border p-3.5 bg-card">
					<span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
						Antécédents Causaux Directs (`basedOn`)
					</span>
					<div class="mt-2 flex flex-wrap gap-2">
						{#if statement.justification.basedOn.length === 0}
							<span class="text-xs text-muted-foreground italic">Aucun antécédent explicite (axiome initial).</span>
						{:else}
							{#each statement.justification.basedOn as ant}
								<span class="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs font-mono text-foreground border">
									<GitCommit class="h-3 w-3 text-primary" />
									{ant}
								</span>
							{/each}
						{/if}
					</div>
				</div>

				<!-- Simulateur de Blast Radius (Impact) -->
				<div class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
					<div class="flex items-start gap-2">
						<AlertTriangle class="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
						<div class="space-y-1 flex-1">
							<h4 class="text-xs font-bold text-amber-800 dark:text-amber-300">
								Simulateur d'Impact (Blast Radius) : {dependents.length} énoncé(s) dépendant(s)
							</h4>
							<p class="text-[11px] text-muted-foreground leading-relaxed">
								{#if dependents.length === 0}
									Cet énoncé est une feuille du graphe causal : le contester n'entraînera aucune invalidation en cascade.
								{:else}
									Si cet énoncé est contesté, <strong>{dependents.length} énoncé(s) en aval</strong> ({dependents.join(', ')})
									retomberont automatiquement au statut <code>assumed</code>, forçant la rétrogradation de maturité des sections associées.
								{/if}
							</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Footer avec action de contestation/rétractation -->
			<div class="mt-6 flex items-center justify-between border-t pt-4">
				<button
					type="button"
					onclick={handleClose}
					class="rounded-md border border-input bg-background px-4 py-2 text-xs font-semibold hover:bg-muted transition-colors"
				>
					Fermer
				</button>

				<button
					type="button"
					onclick={handleRetract}
					class="inline-flex items-center gap-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-xs font-bold shadow-xs transition-colors"
				>
					<AlertTriangle class="h-3.5 w-3.5" />
					<span>Contester et Rétracter l'Énoncé</span>
				</button>
			</div>
		</div>
	</div>
{/if}
