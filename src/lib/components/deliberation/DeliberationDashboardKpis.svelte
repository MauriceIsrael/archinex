<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import {
		CheckCircle2,
		Zap,
		AlertTriangle,
		Hourglass,
		Coins,
		ShieldCheck,
		Layers
	} from 'lucide-svelte';

	const totalSubjects = $derived(deliberationStore.subjects.length);
	const decidedSubjects = $derived(
		deliberationStore.subjects.filter(
			(s) => s.level === 'L3_decided' || s.level === 'L4_specified' || s.level === 'L5_archived'
		).length
	);
	const maturityPercent = $derived(
		totalSubjects > 0 ? Math.round((decidedSubjects / totalSubjects) * 100) : 0
	);

	const totalUnlocks = $derived(deliberationStore.totalUnlocks);
	const totalBlocking = $derived(deliberationStore.totalBlocking);
	const stalledCount = $derived(deliberationStore.stalledSubjects.length);
	const sealedCount = $derived(Object.keys(deliberationStore.frozenSnapshots).length);

	// Calcul cumulé des surcoûts matériels des hypothèses
	const totalCostKeur = $derived.by(() => {
		let sum = 0;
		for (const draft of Object.values(deliberationStore.drafts)) {
			for (const hyp of draft.suppose) {
				if (hyp.cost_hint) {
					const match = hyp.cost_hint.match(/(\d+)/);
					if (match) sum += parseInt(match[1], 10);
				}
			}
		}
		return sum;
	});
</script>

<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
	<!-- 1. Maturité & Décisions -->
	<div class="rounded-xl border bg-card p-3.5 shadow-xs flex flex-col justify-between">
		<div class="flex items-center justify-between text-muted-foreground text-xs mb-1">
			<span class="font-medium">Maturité Dossier</span>
			<CheckCircle2 class="h-4 w-4 text-emerald-600" />
		</div>
		<div>
			<div class="flex items-baseline gap-1.5">
				<span class="text-xl font-bold font-mono text-foreground">{decidedSubjects}/{totalSubjects}</span>
				<span class="text-xs text-muted-foreground">actés (L3+)</span>
			</div>
			<!-- Mini barre de progression -->
			<div class="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
				<div
					class="h-full bg-emerald-500 rounded-full transition-all duration-300"
					style="width: {maturityPercent}%"
				></div>
			</div>
		</div>
	</div>

	<!-- 2. Effet Multiplicateur (Déblocages) -->
	<div class="rounded-xl border bg-card p-3.5 shadow-xs flex flex-col justify-between">
		<div class="flex items-center justify-between text-muted-foreground text-xs mb-1">
			<span class="font-medium">Effet Multiplicateur</span>
			<Zap class="h-4 w-4 text-amber-500" />
		</div>
		<div>
			<div class="flex items-baseline gap-1.5">
				<span class="text-xl font-bold font-mono text-primary">+{totalUnlocks}</span>
				<span class="text-xs text-muted-foreground">déblocages en aval</span>
			</div>
			<p class="text-[11px] text-muted-foreground mt-1">Sujet clé : §4.2 (+3)</p>
		</div>
	</div>

	<!-- 3. Points Bloquants / Conflits -->
	<div class="rounded-xl border bg-card p-3.5 shadow-xs flex flex-col justify-between">
		<div class="flex items-center justify-between text-muted-foreground text-xs mb-1">
			<span class="font-medium">Conflits Ouverts</span>
			<AlertTriangle class="h-4 w-4 {totalBlocking > 0 ? 'text-destructive' : 'text-muted-foreground'}" />
		</div>
		<div>
			<div class="flex items-baseline gap-1.5">
				<span class="text-xl font-bold font-mono {totalBlocking > 0 ? 'text-destructive' : 'text-foreground'}">
					{totalBlocking}
				</span>
				<span class="text-xs text-muted-foreground">arbitrages requis</span>
			</div>
			<p class="text-[11px] text-muted-foreground mt-1">
				{totalBlocking === 0 ? 'Aucun blocage actif' : 'Requiert le Lead Architect'}
			</p>
		</div>
	</div>

	<!-- 4. Chiffrage Matériel Identifié -->
	<div class="rounded-xl border bg-card p-3.5 shadow-xs flex flex-col justify-between">
		<div class="flex items-center justify-between text-muted-foreground text-xs mb-1">
			<span class="font-medium">Impact CAPEX Projeté</span>
			<Coins class="h-4 w-4 text-indigo-500" />
		</div>
		<div>
			<div class="flex items-baseline gap-1.5">
				<span class="text-xl font-bold font-mono text-foreground">+{totalCostKeur} k€</span>
				<span class="text-xs text-muted-foreground">surcoût matériel</span>
			</div>
			<p class="text-[11px] text-muted-foreground mt-1">Sur 2 hypothèses actives</p>
		</div>
	</div>

	<!-- 5. Stagnation & Homologation -->
	<div class="col-span-2 sm:col-span-1 rounded-xl border bg-card p-3.5 shadow-xs flex flex-col justify-between">
		<div class="flex items-center justify-between text-muted-foreground text-xs mb-1">
			<span class="font-medium">Alertes & Sceaux</span>
			{#if stalledCount > 0}
				<Hourglass class="h-4 w-4 text-amber-500" />
			{:else}
				<ShieldCheck class="h-4 w-4 text-emerald-600" />
			{/if}
		</div>
		<div>
			<div class="flex items-baseline gap-1.5">
				{#if stalledCount > 0}
					<span class="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">{stalledCount}</span>
					<span class="text-xs text-muted-foreground">en stagnation (&gt; 14j)</span>
				{:else}
					<span class="text-xl font-bold font-mono text-emerald-600">{sealedCount}</span>
					<span class="text-xs text-muted-foreground">scellé (SHA-256)</span>
				{/if}
			</div>
			<p class="text-[11px] text-muted-foreground mt-1">
				{sealedCount > 0 ? `${sealedCount} section(s) homologuée(s)` : '0 section scellée'}
			</p>
		</div>
	</div>
</div>
