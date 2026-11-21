<script lang="ts">
	let {
		activeDriftScenario = 'reset_clean',
		isActionRunning = false,
		onSimulateDrift = (_scenario: string) => {}
	}: {
		activeDriftScenario?: string;
		isActionRunning?: boolean;
		onSimulateDrift?: (scenario: string) => void;
	} = $props();
</script>

<!-- Outil de démonstration hors parcours principal (Issue #405) -->
<details
	class="rounded-lg border border-dashed bg-muted/20 p-3 text-xs"
	data-testid="phase4-drift-demo-drawer"
>
	<summary class="cursor-pointer font-semibold text-muted-foreground hover:text-foreground select-none">
		Mode démonstration (hors parcours principal) — Simulateur de dérive
	</summary>
	<div class="mt-3 space-y-2 pt-2 border-t">
		<div class="flex items-center justify-between gap-2">
			<p class="text-[11px] text-muted-foreground">
				Outil de démonstration uniquement : simule une dérive locale pour illustrer la détection de règles.
			</p>
			{#if activeDriftScenario !== 'reset_clean'}
				<button
					type="button"
					onclick={() => onSimulateDrift('reset_clean')}
					class="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer shrink-0"
					data-testid="drift-reset-btn"
				>
					Restaurer l'état conforme
				</button>
			{/if}
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
			<button
				type="button"
				disabled={isActionRunning}
				onclick={() => onSimulateDrift('unapproved_hardware')}
				class="px-2.5 py-1.5 rounded border text-left font-medium transition-colors cursor-pointer {activeDriftScenario === 'unapproved_hardware'
					? 'bg-rose-600 text-white border-rose-700'
					: 'bg-background hover:bg-rose-500/10 border-border text-foreground'}"
				data-testid="drift-btn-hardware"
			>
				Équipement non homologué
			</button>
			<button
				type="button"
				disabled={isActionRunning}
				onclick={() => onSimulateDrift('bmc_oob_mismatch')}
				class="px-2.5 py-1.5 rounded border text-left font-medium transition-colors cursor-pointer {activeDriftScenario === 'bmc_oob_mismatch'
					? 'bg-rose-600 text-white border-rose-700'
					: 'bg-background hover:bg-rose-500/10 border-border text-foreground'}"
				data-testid="drift-btn-oob"
			>
				Écart réseau OOB / gestion
			</button>
			<button
				type="button"
				disabled={isActionRunning}
				onclick={() => onSimulateDrift('unproxied_oam')}
				class="px-2.5 py-1.5 rounded border text-left font-medium transition-colors cursor-pointer {activeDriftScenario === 'unproxied_oam'
					? 'bg-rose-600 text-white border-rose-700'
					: 'bg-background hover:bg-rose-500/10 border-border text-foreground'}"
				data-testid="drift-btn-oam"
			>
				Zone OAM sans médiation
			</button>
			<button
				type="button"
				disabled={isActionRunning}
				onclick={() => onSimulateDrift('single_power_feed')}
				class="px-2.5 py-1.5 rounded border text-left font-medium transition-colors cursor-pointer {activeDriftScenario === 'single_power_feed'
					? 'bg-rose-600 text-white border-rose-700'
					: 'bg-background hover:bg-rose-500/10 border-border text-foreground'}"
				data-testid="drift-btn-power"
			>
				Redondance alimentation dégradée
			</button>
		</div>
	</div>
</details>
