<script lang="ts">
	import { deliberationStore, type DeliberationPosture } from '$lib/stores/deliberationStore.svelte';
	import { BookOpen, MessagesSquare, CheckCircle2, Bot, UserCheck } from 'lucide-svelte';
	import type { ArchitectRole } from '$lib/types/epistemic';

	const postures: Array<{
		id: DeliberationPosture;
		label: string;
		icon: typeof BookOpen;
	}> = [
		{
			id: 'appropriation',
			label: 'Corpus & Appropriation',
			icon: BookOpen
		},
		{
			id: 'deliberation',
			label: 'Délibération & Arbitrage',
			icon: MessagesSquare
		},
		{
			id: 'rendu',
			label: 'Homologation & Projections',
			icon: CheckCircle2
		}
	];

	const roles: Array<{ id: ArchitectRole; label: string }> = [
		{ id: 'lead_architect', label: 'Lead Architect' },
		{ id: 'infra_expert_architect', label: 'Architecte Infra / Réseau' },
		{ id: 'domain_architect', label: 'Architecte Métier' },
		{ id: 'security_architect', label: 'Architecte Sécurité NIS2' }
	];
</script>

<div class="rounded-xl border bg-card p-2.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
	<!-- 3 Postures : Onglets segmentés compacts et intuitifs -->
	<div class="flex items-center gap-1 bg-muted/60 p-1 rounded-lg overflow-x-auto">
		{#each postures as p}
			{@const active = deliberationStore.activePosture === p.id}
			{@const Icon = p.icon}
			<button
				type="button"
				class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap {active
					? 'bg-background text-foreground shadow-xs'
					: 'text-muted-foreground hover:text-foreground hover:bg-background/50'}"
				onclick={() => deliberationStore.setPosture(p.id)}
			>
				<Icon class="h-3.5 w-3.5 {active ? 'text-primary' : 'text-muted-foreground'}" />
				<span>{p.label}</span>
			</button>
		{/each}
	</div>

	<!-- Commutateur Acteur (Humain / IA) & Rôle -->
	<div class="flex items-center gap-2 self-end md:self-auto text-xs">
		<button
			type="button"
			onclick={() => deliberationStore.setIsHuman(!deliberationStore.isHuman)}
			class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors {deliberationStore.isHuman
				? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
				: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'}"
			title="Basculer entre opérateur humain et agent IA"
		>
			{#if deliberationStore.isHuman}
				<UserCheck class="h-3.5 w-3.5 text-emerald-600" />
				<span class="font-medium">Humain</span>
			{:else}
				<Bot class="h-3.5 w-3.5 text-amber-600" />
				<span class="font-medium">Agent IA</span>
			{/if}
		</button>

		<div class="flex items-center gap-1.5">
			<label for="role-select" class="sr-only">Rôle actif</label>
			<select
				id="role-select"
				class="bg-background border rounded-lg px-2.5 py-1.5 text-xs font-medium focus:ring-1 focus:ring-primary shadow-xs"
				value={deliberationStore.currentRole}
				onchange={(e) => deliberationStore.setRole(e.currentTarget.value as ArchitectRole)}
			>
				{#each roles as r}
					<option value={r.id}>{r.label}</option>
				{/each}
			</select>
		</div>
	</div>
</div>
