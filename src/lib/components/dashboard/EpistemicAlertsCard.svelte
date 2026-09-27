<script lang="ts">
	import type { EpistemicAlert } from '$lib/domain/dashboardOverview';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { goto } from '$app/navigation';
	import {
		AlertTriangle,
		Flame,
		Coins,
		Clock,
		ArrowRight,
		ShieldAlert,
		Sparkles,
		CheckCircle2
	} from 'lucide-svelte';

	let {
		alerts,
		totalOverrunsKiloEuros = 0
	}: {
		alerts: EpistemicAlert[];
		totalOverrunsKiloEuros?: number;
	} = $props();

	function jumpToArbitration(engagementId: string) {
		deliberationStore.switchEngagement(engagementId);
		goto('/deliberation');
	}
</script>

<div class="rounded-2xl border bg-card shadow-xs overflow-hidden flex flex-col h-full">
	<div class="p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
		<div class="flex items-center gap-2.5">
			<div class="p-2 rounded-lg bg-destructive/10 text-destructive">
				<ShieldAlert class="h-5 w-5" />
			</div>
			<div>
				<h3 class="font-bold text-base tracking-tight text-foreground">
					Points d'Attention & Vigilance Épistémique
				</h3>
				<p class="text-xs text-muted-foreground">
					Sections en stagnation (> 14j), conflits non arbitrés et surcoûts budgétaires identifiés
				</p>
			</div>
		</div>

		{#if totalOverrunsKiloEuros > 0}
			<div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-xs font-bold font-mono">
				<Coins class="h-3.5 w-3.5" />
				<span>+{totalOverrunsKiloEuros} k€ à arbitrer</span>
			</div>
		{/if}
	</div>

	<div class="p-5 flex-1 flex flex-col justify-between">
		{#if alerts.length === 0}
			<div class="py-12 flex flex-col items-center justify-center text-center text-muted-foreground">
				<CheckCircle2 class="h-10 w-10 text-emerald-500 mb-2" />
				<p class="font-bold text-sm text-foreground">Aucun blocage ou conflit ouvert</p>
				<p class="text-xs mt-1">Tous les sujets progressent dans les temps et les hypothèses sont cadrées.</p>
			</div>
		{:else}
			<div class="space-y-3">
				{#each alerts.slice(0, 5) as alert (alert.id)}
					<div class="p-3.5 rounded-xl border bg-background/80 hover:bg-muted/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
						<div class="flex items-start gap-3">
							<div class="mt-0.5 shrink-0">
								{#if alert.type === 'conflict'}
									<div class="p-1.5 rounded-md bg-destructive/15 text-destructive">
										<Flame class="h-4 w-4" />
									</div>
								{:else if alert.type === 'stalled'}
									<div class="p-1.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
										<Clock class="h-4 w-4" />
									</div>
								{:else}
									<div class="p-1.5 rounded-md bg-primary/15 text-primary">
										<AlertTriangle class="h-4 w-4" />
									</div>
								{/if}
							</div>

							<div class="space-y-0.5">
								<div class="flex items-center gap-2 flex-wrap">
									<span class="font-bold text-xs text-foreground group-hover:text-primary transition-colors">
										{alert.title}
									</span>
									<span class="text-[10px] font-mono font-semibold px-2 py-0.2 rounded bg-muted text-muted-foreground">
										{alert.engagementShortName} · {alert.sectionRef}
									</span>
									{#if alert.extraBadge}
										<span class="text-[10px] font-bold px-1.5 py-0.2 rounded bg-destructive/10 text-destructive border border-destructive/20">
											{alert.extraBadge}
										</span>
									{/if}
								</div>
								<p class="text-xs text-muted-foreground line-clamp-1">
									{alert.description}
								</p>
							</div>
						</div>

						<button
							type="button"
							onclick={() => jumpToArbitration(alert.engagementId)}
							class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-primary text-foreground hover:text-primary-foreground text-xs font-semibold shrink-0 transition-colors shadow-2xs self-end sm:self-auto"
						>
							<span>Arbitrer</span>
							<ArrowRight class="h-3 w-3" />
						</button>
					</div>
				{/each}
			</div>

			{#if alerts.length > 5}
				<div class="mt-4 pt-3 border-t text-center text-xs text-muted-foreground">
					+ {alerts.length - 5} autre(s) point(s) d'arbitrage en cours sur les différents projets
				</div>
			{/if}
		{/if}
	</div>
</div>
