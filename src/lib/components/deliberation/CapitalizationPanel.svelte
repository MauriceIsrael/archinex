<script lang="ts">
	import { onMount } from 'svelte';
	import type { Decision, Option } from '$lib/domain/options';
	import type { KbCandidate } from '$lib/types/llmops';
	import {
		Database,
		Sparkles,
		Send,
		CheckCircle2,
		Clock,
		XCircle,
		ShieldCheck,
		Edit3,
		RefreshCw,
		Layers,
		FileSpreadsheet
	} from 'lucide-svelte';

	interface Props {
		projectId: string;
		subjectId: string;
		decision: Decision;
		options?: Option[];
	}

	let { projectId, subjectId, decision, options = [] }: Props = $props();

	let submittedCandidates = $state<KbCandidate[]>([]);
	let preparedCandidates = $state<KbCandidate[]>([]);
	let isLoading = $state(false);
	let isPreparing = $state(false);
	let isSubmitting = $state(false);
	let isPrepared = $state(false);
	let errorMessage = $state<string | null>(null);
	let successMessage = $state<string | null>(null);

	onMount(async () => {
		await loadSubmittedCandidates();
	});

	async function loadSubmittedCandidates() {
		isLoading = true;
		errorMessage = null;
		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/capitalization`);
			if (res.ok) {
				const data = await res.json();
				submittedCandidates = data.candidates || [];
			}
		} catch (err: any) {
			console.error('Erreur chargement candidats soumis:', err);
		} finally {
			isLoading = false;
		}
	}

	async function handlePrepareCandidates() {
		isPreparing = true;
		errorMessage = null;
		successMessage = null;
		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/capitalization?mode=prepare`);
			if (!res.ok) {
				const errData = await res.json();
				throw new Error(errData.error || 'Impossible de préparer les candidats.');
			}
			const data = await res.json();
			preparedCandidates = data.candidates || [];
			isPrepared = true;
		} catch (err: any) {
			errorMessage = err.message || 'Erreur lors de la préparation des candidats.';
		} finally {
			isPreparing = false;
		}
	}

	async function handleSubmitCandidates() {
		if (preparedCandidates.length === 0) return;

		isSubmitting = true;
		errorMessage = null;
		successMessage = null;

		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/capitalization`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					candidates: preparedCandidates
				})
			});

			if (!res.ok) {
				const errData = await res.json();
				throw new Error(errData.error || 'Erreur lors de la soumission à LLMOps.');
			}

			const result = await res.json();
			successMessage = `${result.submitted?.length || preparedCandidates.length} candidat(s) transmis avec succès au Knowledge Hub LLMOps (Porte G4).`;
			preparedCandidates = [];
			isPrepared = false;
			await loadSubmittedCandidates();
		} catch (err: any) {
			errorMessage = err.message || 'Échec de transmission des candidats.';
		} finally {
			isSubmitting = false;
		}
	}

	function getKindBadge(kind: string) {
		switch (kind) {
			case 'new_asset':
				return { label: 'Pattern Émergeant (Asset)', class: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/30' };
			case 'amendment':
				return { label: 'Amendement / Dérogation Doctrinale', class: 'bg-amber-500/10 text-amber-700 border-amber-500/30' };
			case 'rex':
				return { label: 'Retour d’Expérience (REX)', class: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' };
			default:
				return { label: kind, class: 'bg-muted text-muted-foreground border-border' };
		}
	}
</script>

<div class="p-5 rounded-xl border border-indigo-500/30 bg-indigo-500/5 space-y-5">
	<!-- En-tête Capitalisation -->
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-indigo-500/20 pb-4">
		<div class="flex items-center gap-3">
			<div class="p-2 rounded-lg bg-indigo-600 text-white shrink-0">
				<Database class="w-5 h-5" />
			</div>
			<div>
				<h4 class="font-bold text-foreground text-sm flex items-center gap-2">
					Capitalisation vers le Knowledge Hub (Porte G4)
					<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 border border-indigo-500/30">
						<ShieldCheck class="w-3 h-3" /> Anonymisation Souveraine
					</span>
				</h4>
				<p class="text-xs text-muted-foreground mt-0.5">
					Les décisions d'arbitrage enrichissent la doctrine d'entreprise. Vous pouvez modifier chaque candidat avant transmission formelle à LLMOps.
				</p>
			</div>
		</div>

		<div class="flex items-center gap-2">
			{#if !isPrepared}
				<button
					type="button"
					onclick={handlePrepareCandidates}
					disabled={isPreparing}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
				>
					{#if isPreparing}
						<RefreshCw class="w-3.5 h-3.5 animate-spin" />
						<span>Préparation...</span>
					{:else}
						<Sparkles class="w-3.5 h-3.5" />
						<span>Préparer les Candidats KB</span>
					{/if}
				</button>
			{/if}
		</div>
	</div>

	<!-- Messages -->
	{#if errorMessage}
		<div class="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs font-medium">
			{errorMessage}
		</div>
	{/if}

	{#if successMessage}
		<div class="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 text-xs font-medium flex items-center gap-2">
			<CheckCircle2 class="w-4 h-4 text-emerald-600" />
			<span>{successMessage}</span>
		</div>
	{/if}

	<!-- Section d'édition préalable des candidats (Invariant III) -->
	{#if isPrepared && preparedCandidates.length > 0}
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider">
					<Edit3 class="w-3.5 h-3.5 text-indigo-600" />
					Candidats à valider et amender avant envoi ({preparedCandidates.length}) :
				</div>
				<span class="text-[11px] text-muted-foreground italic">
					(IP, volumes et données identifiantes anonymisés)
				</span>
			</div>

			<div class="space-y-3">
				{#each preparedCandidates as candidate, idx}
					{@const badge = getKindBadge(candidate.kind)}
					<div class="p-4 rounded-xl border border-border/80 bg-background space-y-3 shadow-2xs">
						<div class="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
							<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border {badge.class}">
								{badge.label}
							</span>
							{#if candidate.target_asset_ref}
								<span class="text-[11px] font-mono font-medium text-amber-700 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
									Réf: {candidate.target_asset_ref}
								</span>
							{/if}
							<span class="text-[10px] text-muted-foreground font-mono">
								Candidat #{idx + 1}
							</span>
						</div>

						<div class="space-y-2">
							<div>
								<label for="cand-title-{idx}" class="block text-[11px] font-semibold text-foreground mb-1">
									Titre du candidat
								</label>
								<input
									id="cand-title-{idx}"
									type="text"
									bind:value={candidate.title}
									class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-muted/20 focus:bg-background focus:ring-1 focus:ring-primary focus:outline-hidden"
								/>
							</div>

							<div>
								<label for="cand-summary-{idx}" class="block text-[11px] font-semibold text-foreground mb-1">
									Résumé / Description
								</label>
								<textarea
									id="cand-summary-{idx}"
									rows="2"
									bind:value={candidate.summary}
									class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-muted/20 focus:bg-background focus:ring-1 focus:ring-primary focus:outline-hidden resize-none"
								></textarea>
							</div>

							{#if candidate.suggested_change}
								<div>
									<label for="cand-change-{idx}" class="block text-[11px] font-semibold text-foreground mb-1">
										Proposition d'évolution ou clause doctrinale
									</label>
									<textarea
										id="cand-change-{idx}"
										rows="2"
										bind:value={candidate.suggested_change}
										class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-muted/20 focus:bg-background focus:ring-1 focus:ring-primary focus:outline-hidden resize-none"
									></textarea>
								</div>
							{/if}

							<div>
								<label for="cand-rationale-{idx}" class="block text-[11px] font-semibold text-foreground mb-1">
									Motif / Compromis d'arbitrage
								</label>
								<textarea
									id="cand-rationale-{idx}"
									rows="2"
									bind:value={candidate.rationale}
									class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-muted/20 focus:bg-background focus:ring-1 focus:ring-primary focus:outline-hidden resize-none"
								></textarea>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<div class="flex items-center justify-end gap-3 pt-2">
				<button
					type="button"
					onclick={() => { preparedCandidates = []; isPrepared = false; }}
					class="px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs font-medium cursor-pointer"
				>
					Annuler
				</button>
				<button
					type="button"
					onclick={handleSubmitCandidates}
					disabled={isSubmitting}
					class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
				>
					{#if isSubmitting}
						<RefreshCw class="w-3.5 h-3.5 animate-spin" />
						<span>Transmission en cours...</span>
					{:else}
						<Send class="w-3.5 h-3.5" />
						<span>Transmettre à LLMOps (Porte G4)</span>
					{/if}
				</button>
			</div>
		</div>
	{/if}

	<!-- Liste des candidats déjà soumis & suivi des statuts -->
	<div class="space-y-3 pt-2">
		<div class="flex items-center justify-between text-xs">
			<span class="font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
				<Layers class="w-3.5 h-3.5 text-indigo-600" />
				Candidats Soumis au Knowledge Hub ({submittedCandidates.length})
			</span>
			<button
				type="button"
				onclick={loadSubmittedCandidates}
				class="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
			>
				<RefreshCw class="w-3 h-3 {isLoading ? 'animate-spin' : ''}" />
				Actualiser
			</button>
		</div>

		{#if submittedCandidates.length === 0}
			<div class="p-4 rounded-xl border border-dashed border-border/80 text-center text-xs text-muted-foreground bg-background/50">
				Aucun candidat transmis pour le moment. Cliquez sur "Préparer les Candidats KB" pour capitaliser cette décision d'arbitrage.
			</div>
		{:else}
			<div class="space-y-2">
				{#each submittedCandidates as cand}
					{@const badge = getKindBadge(cand.kind)}
					<div class="p-3 rounded-lg border border-border/70 bg-background/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
						<div class="space-y-1">
							<div class="flex items-center gap-2">
								<span class="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded border {badge.class}">
									{badge.label}
								</span>
								<strong class="text-foreground">{cand.title}</strong>
							</div>
							<p class="text-muted-foreground text-[11px] line-clamp-1">
								{cand.summary}
							</p>
						</div>

						<div class="shrink-0 flex items-center gap-2">
							{#if cand.status === 'accepted'}
								<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
									<CheckCircle2 class="w-3 h-3 text-emerald-600" /> Accepté & Intégré
								</span>
							{:else if cand.status === 'rejected'}
								<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-700 border border-rose-500/30" title={cand.rejection_reason || 'Rejeté'}>
									<XCircle class="w-3 h-3 text-rose-600" /> Rejeté
								</span>
							{:else}
								<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 border border-amber-500/30">
									<Clock class="w-3 h-3 text-amber-600" /> En cours d'examen
								</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
