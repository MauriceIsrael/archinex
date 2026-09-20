<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { renderTelegraphicDraft, validateTelegraphicTone } from '$lib/domain/telegraphic';
	import {
		AlertTriangle,
		CheckCircle2,
		Flame,
		HelpCircle,
		Sparkles,
		Split,
		Send,
		FileText,
		ShieldAlert
	} from 'lucide-svelte';

	const draft = $derived(deliberationStore.activeDraft);
	const renderedText = $derived(draft ? renderTelegraphicDraft(draft) : '');
	const toneCheck = $derived(renderedText ? validateTelegraphicTone(renderedText) : { valid: true, errors: [] });
</script>

<div class="rounded-xl border bg-card p-5 shadow-sm h-full flex flex-col">
	<!-- En-tête de la section HLD -->
	<div class="flex items-start justify-between gap-4 pb-4 border-b">
		<div>
			<div class="flex items-center gap-2 mb-1">
				<span class="text-xs font-mono font-bold bg-muted px-2 py-0.5 rounded text-foreground">
					{draft?.section_id || '§0.0'}
				</span>
				{#if draft?.is_provisional}
					<span class="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400 border border-amber-500/30">
						<AlertTriangle class="h-3 w-3" />
						PROVISOIRE
					</span>
				{:else}
					<span class="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
						<CheckCircle2 class="h-3 w-3" />
						ACTÉ (L3+)
					</span>
				{/if}
				<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{draft?.maturity}
				</span>
			</div>
			<h3 class="text-lg font-bold tracking-tight">
				{draft?.subject || 'Aucun sujet sélectionné'}
			</h3>
		</div>

		<!-- Tone Health Badge -->
		<div class="flex items-center gap-2">
			{#if toneCheck.valid}
				<div class="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-md border border-emerald-500/20">
					<Sparkles class="h-3.5 w-3.5" />
					Anti-Blabla : Conforme (Télégraphique)
				</div>
			{:else}
				<div class="flex items-center gap-1.5 text-xs font-medium text-destructive bg-destructive/10 px-2.5 py-1 rounded-md border border-destructive/30">
					<ShieldAlert class="h-3.5 w-3.5" />
					Régression de Ton ({toneCheck.errors.length} anomalie)
				</div>
			{/if}
		</div>
	</div>

	{#if !draft}
		<div class="flex-1 flex items-center justify-center p-8 text-center text-muted-foreground text-sm">
			Sélectionnez une ligne dans le Board de maturité pour afficher son brouillon-appât télégraphique.
		</div>
	{:else}
		<div class="flex-1 overflow-y-auto space-y-4 py-4 pr-1 text-sm font-sans">
			<!-- 1. RETENU -->
			<div class="rounded-lg bg-muted/40 p-3.5 border border-border/50">
				<div class="flex items-center gap-2 mb-2">
					<span class="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
						Retenu (Doctrines & ADR)
					</span>
				</div>
				{#if draft.retenu.length === 0}
					<p class="text-xs italic text-muted-foreground">Aucune décision actée à ce stade.</p>
				{:else}
					<div class="flex flex-wrap gap-2">
						{#each draft.retenu as ret}
							<span class="inline-flex items-center rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 text-xs font-mono font-medium border border-emerald-500/20">
								{ret}
							</span>
						{/each}
					</div>
				{/if}
			</div>

			<!-- 2. SUPPOSÉ & COÛTS (L'APPÂT) -->
			<div class="rounded-lg bg-amber-500/5 p-3.5 border border-amber-500/20">
				<div class="flex items-center justify-between gap-2 mb-2">
					<span class="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
						<Flame class="h-3.5 w-3.5" />
						Supposé & Chaînage des Conséquences (Appât)
					</span>
					<span class="text-[11px] text-muted-foreground italic">Impact matériel projeté</span>
				</div>
				<div class="space-y-2">
					{#each draft.suppose as hyp}
						<div class="bg-background/80 rounded p-2.5 border border-amber-500/20 text-xs">
							<div class="font-medium text-foreground">
								<span class="font-mono text-amber-700 dark:text-amber-400">supposé :</span> {hyp.text}
								<span class="text-muted-foreground font-mono">⇒</span> {hyp.consequence}
							</div>
							{#if hyp.cost_hint}
								<div class="mt-2 inline-flex items-center gap-1 font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded border border-destructive/20 font-mono">
									<span>Chiffrage :</span> {hyp.cost_hint}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<!-- 3. CONFLITS & ARBITRAGES -->
			{#if draft.conflit.length > 0}
				<div class="rounded-lg bg-destructive/5 p-3.5 border border-destructive/20">
					<div class="flex items-center justify-between mb-2">
						<span class="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
							<AlertTriangle class="h-3.5 w-3.5" />
							Conflits d'Architecture Ouverts
						</span>
						<span class="text-[11px] text-destructive font-medium">Arbitrage Lead Archi Requis</span>
					</div>
					<div class="space-y-2">
						{#each draft.conflit as c}
							<div class="bg-background/80 rounded p-2.5 border border-destructive/20 text-xs flex items-center justify-between gap-3">
								<div>
									<span class="font-semibold text-foreground">{c.text}</span>
									<span class="text-muted-foreground"> en contradiction avec </span>
									<span class="font-mono font-semibold text-destructive">{c.opposing_reference}</span>
								</div>
								<button
									type="button"
									class="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold px-2.5 py-1 rounded shadow-sm transition-colors"
									onclick={() => deliberationStore.arbitrateSubject(deliberationStore.activeSubjectId)}
								>
									Trancher (L3)
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- 4. MANQUES & QUESTIONS AUX EXPERTS -->
			<div class="rounded-lg bg-blue-500/5 p-3.5 border border-blue-500/20">
				<div class="flex items-center justify-between mb-2">
					<span class="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
						<HelpCircle class="h-3.5 w-3.5" />
						Manques (Questions Ouvertes Ciblées)
					</span>
				</div>
				<div class="space-y-2">
					{#each draft.manque as m}
						<div class="bg-background/80 rounded p-2.5 border border-blue-500/20 text-xs flex items-center justify-between gap-3">
							<div>
								<span class="font-mono font-bold text-blue-600 dark:text-blue-400">[{m.id}]</span>
								<span class="font-medium text-foreground ml-1">{m.question}</span>
								<span class="text-muted-foreground block mt-0.5">
									Affecté à : <span class="font-semibold text-foreground">{m.assigned_role}</span>
								</span>
							</div>
							<button
								type="button"
								class="shrink-0 inline-flex items-center gap-1 border border-border bg-muted/60 hover:bg-muted text-foreground text-xs font-medium px-2 py-1 rounded transition-colors"
								onclick={() => deliberationStore.sendRelance(deliberationStore.activeSubjectId, m.id)}
							>
								<Send class="h-3 w-3" />
								Relancer
							</button>
						</div>
					{/each}
				</div>
			</div>

			<!-- 5. VARIANTE B (DIVERGENCE) -->
			{#if draft.variante_b}
				<div class="rounded-lg bg-purple-500/5 p-3.5 border border-purple-500/20">
					<div class="flex items-center gap-1.5 mb-2">
						<Split class="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
						<span class="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
							Variante Divergente Proposée
						</span>
					</div>
					<div class="bg-background/80 rounded p-2.5 border border-purple-500/20 text-xs">
						<div class="font-bold text-foreground mb-1">{draft.variante_b.title}</div>
						<div class="flex items-center gap-3 text-muted-foreground">
							<span class="font-mono text-emerald-600 font-semibold">{draft.variante_b.cost_delta}</span>
							<span>·</span>
							<span class="text-amber-700 dark:text-amber-400">{draft.variante_b.trade_off}</span>
						</div>
					</div>
				</div>
			{/if}

			<!-- Rendu Télégraphique Brut (Copier / Exporter) -->
			<div class="pt-2">
				<details class="text-xs group">
					<summary class="cursor-pointer font-medium text-muted-foreground hover:text-foreground flex items-center gap-1">
						<FileText class="h-3.5 w-3.5" />
						Voir le flux brut d'exportation télégraphique
					</summary>
					<pre class="mt-2 p-3 bg-muted rounded-md font-mono text-[11px] overflow-x-auto whitespace-pre-wrap border leading-relaxed">{renderedText}</pre>
				</details>
			</div>
		</div>
	{/if}
</div>
