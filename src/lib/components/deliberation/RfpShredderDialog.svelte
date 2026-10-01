<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { LLMOpsCandidate } from '$lib/types/llmops';
	import {
		Scissors,
		Sparkles,
		X,
		CheckCircle2,
		AlertCircle,
		RefreshCw,
		FileText,
		ArrowRight,
		ShieldCheck
	} from 'lucide-svelte';

	let { open = $bindable(false) } = $props<{ open?: boolean }>();

	let rfpText = $state<string>('');
	let documentId = $state<string>('CCTP-ANNEXE-04');
	let documentTitle = $state<string>('CCTP Annexe 4 · Exigences Débit & Chiffrement');
	let documentVersion = $state<string>('v1.0');
	let isLoading = $state<boolean>(false);
	let errorMessage = $state<string | null>(null);
	let candidates = $state<LLMOpsCandidate[]>([]);
	let shredSource = $state<'live' | 'local' | null>(null);

	const SAMPLE_TEXT = `Le système complet doit être hébergé sur SecNumCloud 3.2 avec une immunité stricte aux lois extraterritoriales.
Les flux voix prioritaires (MCPTT) doivent être arbitrés en moins de 100 ms sur chaque site isolé.
Le raccordement au réseau opérateur exige une redondance de synchronisation IEEE 1588v2 avec un maintien supérieur à 30 jours sans signal GNSS.`;

	function loadSample() {
		rfpText = SAMPLE_TEXT;
		documentId = 'CCTP-LOT2-ANNEXE-OIV';
		documentTitle = 'CCTP Lot 2 · Exigences Souveraineté & Latence';
	}

	async function handleShred() {
		if (!rfpText.trim()) {
			errorMessage = 'Veuillez saisir ou coller un extrait de CCTP.';
			return;
		}

		isLoading = true;
		errorMessage = null;

		try {
			const res = await fetch('/api/llmops?action=shred', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					rfpText,
					documentId,
					documentVersion,
					engagement: deliberationStore.activeEngagementId
				})
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || `Erreur serveur ${res.status}`);
			}

			const data = await res.json();
			candidates = data.candidates || [];
			shredSource = deliberationStore.llmopsStatus === 'connected' ? 'live' : 'local';
		} catch (err: unknown) {
			errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
		} finally {
			isLoading = false;
		}
	}

	function injectIntoCorpus() {
		if (candidates.length === 0) return;

		const newDocId = documentId || `DOC-SHRED-${Date.now().toString().slice(-4)}`;

		deliberationStore.addContributorDocument({
			id: newDocId,
			title: documentTitle || 'Document CCTP Dépouillé par LLMOps',
			origin: 'client',
			category: 'cctp',
			categoryLabel: 'CCTP Dépouillé',
			sourceOrAuthor: 'RFP Shredder (LLMOps)',
			version: documentVersion || 'v1.0',
			summary: `Dépouillement automatique de ${candidates.length} clauses contractuelles issues de l'appel d'offres.`,
			relatedSubjectIds: [deliberationStore.activeSubjectId],
			keyClauses: candidates.map((c, idx) => ({
				id: c.id,
				clauseRef: `§${idx + 1}.0`,
				title: c.candidateKind === 'governance-obligation' ? 'Obligation Contractuelle' : 'Spécification Technique',
				text: c.normalizedText || c.originalText,
				criticality: c.candidateKind === 'governance-obligation' ? 'bloquant' : 'majeur',
				impactSummary: `Destination : ${c.suggestedDestination} (confiance ${(c.routingConfidence * 100).toFixed(0)}%)`
			}))
		});

		open = false;
		candidates = [];
		rfpText = '';
	}

	function close() {
		open = false;
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-0">
		<div class="bg-card w-full max-w-3xl rounded-xl border shadow-lg overflow-hidden flex flex-col max-h-[90vh]">
			<!-- Header Modal -->
			<div class="p-4 border-b bg-muted/40 flex items-center justify-between gap-3">
				<div class="flex items-center gap-2.5">
					<div class="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
						<Scissors class="h-5 w-5" />
					</div>
					<div>
						<div class="flex items-center gap-2">
							<h3 class="text-base font-bold text-foreground">
								Dépouillement CCTP · RFP Shredder
							</h3>
							<span class="rounded bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-mono font-bold">
								LLMOps Engine
							</span>
						</div>
						<p class="text-xs text-muted-foreground">
							Déstructure automatiquement un texte d'appel d'offres en clauses contractuelles typées
						</p>
					</div>
				</div>
				<button
					type="button"
					onclick={close}
					class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Body Modal -->
			<div class="p-4 overflow-y-auto space-y-4 flex-1">
				<!-- Métadonnées Document -->
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
					<div>
						<label for="rfp-doc-id" class="block text-xs font-semibold text-muted-foreground mb-1">
							Identifiant du Document
						</label>
						<input
							id="rfp-doc-id"
							type="text"
							bind:value={documentId}
							class="w-full text-xs font-mono rounded-lg border bg-background px-3 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
						/>
					</div>
					<div class="sm:col-span-2">
						<label for="rfp-doc-title" class="block text-xs font-semibold text-muted-foreground mb-1">
							Titre du Document CCTP
						</label>
						<input
							id="rfp-doc-title"
							type="text"
							bind:value={documentTitle}
							class="w-full text-xs rounded-lg border bg-background px-3 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>

				<!-- Zone de Saisie du Texte -->
				<div>
					<div class="flex items-center justify-between mb-1.5">
						<label for="rfp-doc-text" class="text-xs font-semibold text-foreground flex items-center gap-1.5">
							<FileText class="h-3.5 w-3.5 text-muted-foreground" />
							<span>Texte brut du CCTP ou de la clause</span>
						</label>
						<button
							type="button"
							onclick={loadSample}
							class="text-xs text-primary hover:underline font-medium"
						>
							Charger extrait d'exemple
						</button>
					</div>
					<textarea
						id="rfp-doc-text"
						bind:value={rfpText}
						rows="4"
						placeholder="Collez ici les exigences contractuelles, les spécifications techniques ou un extrait de l'appel d'offres..."
						class="w-full text-xs rounded-lg border bg-background p-3 focus:outline-hidden focus:ring-2 focus:ring-primary/20 font-sans leading-relaxed"
					></textarea>
				</div>

				<!-- Erreur -->
				{#if errorMessage}
					<div class="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20">
						<AlertCircle class="h-4 w-4 shrink-0" />
						<span>{errorMessage}</span>
					</div>
				{/if}

				<!-- Bouton d'action Dépouiller -->
				<div class="flex items-center justify-between pt-1">
					<div class="text-[11px] text-muted-foreground">
						Engagement actif : <strong class="font-mono text-foreground">{deliberationStore.activeEngagementId}</strong>
					</div>
					<button
						type="button"
						onclick={handleShred}
						disabled={isLoading || !rfpText.trim()}
						class="inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
					>
						{#if isLoading}
							<RefreshCw class="h-3.5 w-3.5 animate-spin" />
							<span>Découpage en cours...</span>
						{:else}
							<Scissors class="h-3.5 w-3.5" />
							<span>Dépouiller avec LLMOps</span>
						{/if}
					</button>
				</div>

				<!-- Résultats Dépouillés -->
				{#if candidates.length > 0}
					<div class="pt-3 border-t space-y-3">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<CheckCircle2 class="h-4 w-4 text-emerald-500" />
								<h4 class="text-xs font-bold text-foreground">
									{candidates.length} {candidates.length > 1 ? 'clauses candidates extraites' : 'clause candidate extraite'}
								</h4>
								<span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
									Mode {shredSource === 'live' ? 'Cloud Run' : 'Offline'}
								</span>
							</div>
						</div>

						<div data-testid="shredded-clauses-list" class="space-y-2 max-h-56 overflow-y-auto pr-1">
							{#each candidates as cand, idx (cand.id)}
								<div class="p-3 rounded-lg border bg-muted/30 text-xs space-y-1.5">
									<div class="flex items-center justify-between gap-2">
										<div class="flex items-center gap-1.5">
											<span class="font-mono font-bold text-foreground">{cand.id}</span>
											<span class="rounded px-1.5 py-0.5 text-[10px] font-semibold {cand.candidateKind === 'governance-obligation' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-blue-500/10 text-blue-700 dark:text-blue-300'}">
												{cand.candidateKind}
											</span>
										</div>
										<span class="text-[10px] text-muted-foreground">
											Confiance {(cand.routingConfidence * 100).toFixed(0)}%
										</span>
									</div>
									<p class="text-muted-foreground italic leading-relaxed">
										"{cand.normalizedText || cand.originalText}"
									</p>
									{#if cand.matched_controls && cand.matched_controls.length > 0}
										<div class="flex flex-wrap items-center gap-1 pt-1">
											{#each cand.matched_controls as ctrl}
												<span class="rounded bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold">
													{ctrl}
												</span>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer Modal -->
			<div class="p-4 border-t bg-muted/30 flex items-center justify-between gap-3">
				<button
					type="button"
					onclick={close}
					class="px-3 py-1.5 text-xs font-semibold rounded-lg border bg-background hover:bg-muted text-foreground transition-colors"
				>
					Annuler
				</button>

				{#if candidates.length > 0}
					<button
						type="button"
						onclick={injectIntoCorpus}
						class="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
					>
						<CheckCircle2 class="h-3.5 w-3.5" />
						<span>Injecter dans le Corpus ({candidates.length} clauses)</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
