<script lang="ts">
	import type { KbClausesHealthSummary } from '$lib/domain/kbClausesHealth';
	import { AlertTriangle, CheckCircle2, ShieldAlert, ArrowRight, WifiOff } from 'lucide-svelte';

	interface Props {
		health: KbClausesHealthSummary | null | undefined;
		compact?: boolean;
	}

	let { health, compact = false }: Props = $props();

	const frameworksEntries = $derived(
		health
			? (health.scopedFrameworks.length > 0
					? health.scopedFrameworks
					: Object.keys(health.byFramework)
				)
					.map((fw) => health.byFramework[fw])
					.filter(Boolean)
			: []
	);
</script>

{#if health}
	{#if health.offline}
		<div
			class="rounded-xl border border-muted bg-muted/30 px-3.5 py-2.5 text-xs flex items-center justify-between gap-3"
			data-testid="kb-clauses-health-indicator"
			data-health-status="offline"
		>
			<div class="flex items-center gap-2 text-muted-foreground">
				<WifiOff class="h-4 w-4 shrink-0" />
				<span>
					Indicateur de couverture des clauses <code class="font-mono">checks:</code> indisponible (LLMOps hors-ligne).
				</span>
			</div>
		</div>
	{:else}
		<div
			class="rounded-xl border {health.hasAlert
				? 'border-amber-500/40 bg-amber-500/10'
				: 'border-emerald-500/30 bg-emerald-500/5'} {compact ? 'p-3' : 'p-4'} space-y-2.5 text-xs"
			data-testid="kb-clauses-health-indicator"
			data-health-status={health.status}
		>
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
				<div class="flex items-start gap-2.5">
					{#if health.hasAlert}
						<div class="p-1.5 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5">
							<AlertTriangle class="h-4 w-4" />
						</div>
					{:else}
						<div class="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 shrink-0 mt-0.5">
							<CheckCircle2 class="h-4 w-4" />
						</div>
					{/if}
					<div class="space-y-0.5">
						<div class="flex items-center gap-2 flex-wrap">
							<span class="font-bold text-foreground">
								Santé des clauses KB vérifiables (<code class="font-mono">checks:</code>)
							</span>
							<span
								class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold {health.hasAlert
									? 'bg-amber-600 text-white'
									: 'bg-emerald-600 text-white'}"
								data-testid="kb-clauses-health-badge"
							>
								{#if health.hasAlert}
									<ShieldAlert class="h-3 w-3" />
									Clauses non validées ({health.unvalidatedControlsCount} contrôle{health.unvalidatedControlsCount > 1 ? 's' : ''})
								{:else}
									Couverture validée
								{/if}
							</span>
						</div>
						<p class="text-muted-foreground" data-testid="kb-clauses-health-counts">
							<strong>{health.activeControlsCount}</strong> contrôle{health.activeControlsCount > 1 ? 's' : ''} actif{health.activeControlsCount > 1 ? 's' : ''}
							· <strong>{health.validatedControlsCount}</strong> contrôle{health.validatedControlsCount > 1 ? 's' : ''} couvert{health.validatedControlsCount > 1 ? 's' : ''}
							· <strong>{health.validatedClausesCount}</strong> clause{health.validatedClausesCount > 1 ? 's' : ''} <code class="font-mono">checks:</code> validée{health.validatedClausesCount > 1 ? 's' : ''}
							{#if health.draftClausesCount > 0}
								· <span class="text-amber-700 dark:text-amber-300 font-semibold">{health.draftClausesCount} en brouillon (draft)</span>
							{/if}
							{#if health.withoutClauseControlsCount > 0}
								· <span class="text-amber-700 dark:text-amber-300 font-semibold">{health.withoutClauseControlsCount} sans clause (none)</span>
							{/if}
						</p>
					</div>
				</div>

				<div class="flex items-center gap-2 shrink-0">
					<a
						href="/kb/clauses"
						class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border bg-background hover:bg-muted font-semibold text-xs transition-colors"
					>
						<span>Valider & publier les clauses</span>
						<ArrowRight class="h-3.5 w-3.5" />
					</a>
				</div>
			</div>

			{#if health.hasAlert && health.alertMessage}
				<div
					class="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-amber-900 dark:text-amber-100 font-medium flex items-start gap-2"
					role="alert"
					data-testid="kb-clauses-health-alert"
				>
					<AlertTriangle class="h-4 w-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
					<span>{health.alertMessage}</span>
				</div>
			{/if}

			{#if !compact && frameworksEntries.length > 0}
				<div class="flex flex-wrap gap-1.5 pt-1" data-testid="kb-clauses-health-frameworks">
					{#each frameworksEntries as fw (fw.framework)}
						<span
							class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] {fw.isFullyValidated
								? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
								: 'border-amber-500/40 bg-amber-500/15 text-amber-900 dark:text-amber-100'}"
							data-testid="kb-clauses-framework-{fw.framework}"
						>
							<span class="font-bold">{fw.framework}</span>
							<span>
								{fw.validatedControlsCount}/{fw.activeControlsCount} ctrl · {fw.validatedClausesCount} checks:
							</span>
							{#if fw.unvalidatedControlsCount > 0}
								<span class="font-semibold">({fw.unvalidatedControlsCount} draft/none)</span>
							{/if}
						</span>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
{/if}

