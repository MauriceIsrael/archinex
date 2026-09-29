<script lang="ts">
	import { Scale, Plus, ArrowRight, ArrowDownRight, Sparkles } from 'lucide-svelte';
	import type { TradeOff, Option } from '$lib/domain/options';

	let {
		tradeOffs = [],
		options = [],
		onAddTradeOff = () => {}
	}: {
		tradeOffs: TradeOff[];
		options: Option[];
		onAddTradeOff: (to: { optionId: string; gains: string; sacrifices: string; criterionIds?: string[] }) => void;
	} = $props();

	let isAdding = $state(false);
	let selectedOptionId = $state(options[0]?.id || '');
	let gains = $state('');
	let sacrifices = $state('');
	let formError = $state<string | null>(null);

	$effect(() => {
		if (!selectedOptionId && options.length > 0) {
			selectedOptionId = options[0].id;
		}
	});

	function handleSubmit() {
		if (!selectedOptionId) {
			formError = 'Veuillez sélectionner une option.';
			return;
		}
		if (!gains.trim() || !sacrifices.trim()) {
			formError = 'Les gains et les sacrifices doivent être explicités.';
			return;
		}

		formError = null;
		onAddTradeOff({
			optionId: selectedOptionId,
			gains: gains.trim(),
			sacrifices: sacrifices.trim()
		});

		gains = '';
		sacrifices = '';
		isAdding = false;
	}
</script>

<div class="rounded-xl border bg-card p-3.5 space-y-3">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Scale class="h-4 w-4 text-amber-600" />
			<h4 class="text-xs font-bold text-foreground">Compromis d'Architecture & Arbitrages (Trade-offs)</h4>
		</div>
		{#if !isAdding && options.length > 0}
			<button
				type="button"
				onclick={() => (isAdding = true)}
				class="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
			>
				<Plus class="h-3 w-3" />
				<span>Documenter un compromis</span>
			</button>
		{/if}
	</div>

	{#if isAdding}
		<div class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2.5 text-xs">
			<div class="font-bold text-amber-800 dark:text-amber-400">Nouveau compromis d'architecture</div>
			{#if formError}
				<div class="text-destructive font-medium">{formError}</div>
			{/if}
			<div>
				<label for="tradeoff-opt" class="font-bold block mb-1">Option concernée</label>
				<select
					id="tradeoff-opt"
					bind:value={selectedOptionId}
					class="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
				>
					{#each options as opt}
						<option value={opt.id}>{opt.title}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="tradeoff-gains" class="font-bold block mb-1">Gains apportés (valeur, simplicité, débit...)</label>
				<input
					id="tradeoff-gains"
					type="text"
					bind:value={gains}
					placeholder="ex: Réduction du TCO de 40% et déploiement simplifié"
					class="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
				/>
			</div>
			<div>
				<label for="tradeoff-sacrifices" class="font-bold block mb-1">Sacrifices consentis (dépendance, latence, dette...)</label>
				<input
					id="tradeoff-sacrifices"
					type="text"
					bind:value={sacrifices}
					placeholder="ex: Verrouillage technologique auprès du fournisseur cloud"
					class="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
				/>
			</div>
			<div class="flex justify-end gap-2 pt-1">
				<button
					type="button"
					onclick={() => (isAdding = false)}
					class="px-2.5 py-1 rounded border hover:bg-muted"
				>
					Annuler
				</button>
				<button
					type="button"
					onclick={handleSubmit}
					class="px-3 py-1 rounded bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
				>
					Enregistrer
				</button>
			</div>
		</div>
	{/if}

	{#if tradeOffs.length === 0}
		<p class="text-xs italic text-muted-foreground">
			Aucun compromis formalisé pour l'instant. Documentez les gains et sacrifices inhérents à chaque choix.
		</p>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
			{#each tradeOffs as to}
				{@const opt = options.find((o) => o.id === to.optionId)}
				<div class="rounded-lg border bg-muted/20 p-2.5 space-y-1.5 text-xs">
					<div class="flex items-center justify-between font-bold text-foreground">
						<span class="truncate">{opt ? opt.title : to.optionId}</span>
					</div>
					<div class="space-y-1">
						<div class="flex items-start gap-1.5 text-emerald-700 dark:text-emerald-400">
							<span class="font-bold text-[10px] uppercase bg-emerald-500/10 px-1 py-0.2 rounded shrink-0">Gain</span>
							<span class="leading-snug">{to.gains}</span>
						</div>
						<div class="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
							<span class="font-bold text-[10px] uppercase bg-amber-500/10 px-1 py-0.2 rounded shrink-0">Sacrifice</span>
							<span class="leading-snug">{to.sacrifices}</span>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
