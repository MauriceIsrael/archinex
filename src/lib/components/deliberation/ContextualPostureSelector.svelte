<script lang="ts">
	import { deliberationStore, type DeliberationPosture } from '$lib/stores/deliberationStore.svelte';
	import { BookOpen, MessagesSquare, CheckCircle2, ShieldCheck, Bot, UserCheck } from 'lucide-svelte';
	import type { ArchitectRole } from '$lib/types/epistemic';

	const postures: Array<{
		id: DeliberationPosture;
		title: string;
		subtitle: string;
		icon: typeof BookOpen;
		color: string;
		badge: string;
	}> = [
		{
			id: 'appropriation',
			title: '1. Appropriation & Pédagogie',
			subtitle: 'Rappel de normes, exigences CCTP & acculturation',
			icon: BookOpen,
			color: 'emerald',
			badge: 'Phase Non-Bloquante'
		},
		{
			id: 'deliberation',
			title: '2. Délibération & Cristallisation',
			subtitle: 'Confrontation d\'idées, appât télégraphique & arbitrage',
			icon: MessagesSquare,
			color: 'amber',
			badge: 'Cœur Dialectique'
		},
		{
			id: 'rendu',
			title: '3. Rendu & Homologation',
			subtitle: 'Scellement L3/L4, export C4 DSL & configuration',
			icon: CheckCircle2,
			color: 'indigo',
			badge: 'Sortie Outillage'
		}
	];

	const roles: Array<{ id: ArchitectRole; label: string }> = [
		{ id: 'lead_architect', label: 'Lead Architect (Modérateur & Scellement)' },
		{ id: 'infra_expert_architect', label: 'Architecte Expert Infra / Réseau' },
		{ id: 'domain_architect', label: 'Architecte Domaine Métier' },
		{ id: 'security_architect', label: 'Architecte Sécurité & Conformité NIS2' }
	];
</script>

<div class="rounded-xl border bg-card p-4 shadow-sm mb-6">
	<div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
		<div>
			<div class="flex items-center gap-2">
				<span class="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
					Temporalité Non-Linéaire
				</span>
				<span class="text-xs text-muted-foreground">Chaque architecte évolue à son rythme par sujet</span>
			</div>
			<h2 class="text-lg font-bold tracking-tight mt-1">Cadre de Posture Contextuelle</h2>
		</div>

		<!-- Switch Acteur (Humain vs Agent IA & Rôle) -->
		<div class="flex items-center gap-3 bg-muted/50 p-2 rounded-lg text-xs">
			<div class="flex items-center gap-1.5">
				{#if deliberationStore.isHuman}
					<UserCheck class="h-4 w-4 text-emerald-600" />
					<span class="font-medium">Opérateur Humain</span>
				{:else}
					<Bot class="h-4 w-4 text-amber-600" />
					<span class="font-medium text-amber-700 dark:text-amber-400">Agent IA (Restreint Gates L3+)</span>
				{/if}
				<button
					type="button"
					class="ml-1 underline text-muted-foreground hover:text-foreground"
					onclick={() => deliberationStore.setIsHuman(!deliberationStore.isHuman)}
				>
					(Basculer)
				</button>
			</div>

			<span class="text-border">|</span>

			<div class="flex items-center gap-1">
				<label for="role-select" class="text-muted-foreground">Rôle :</label>
				<select
					id="role-select"
					class="bg-background border rounded px-2 py-1 text-xs font-medium focus:ring-1 focus:ring-primary"
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

	<!-- 3 Postures -->
	<div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4">
		{#each postures as p}
			{@const active = deliberationStore.activePosture === p.id}
			{@const Icon = p.icon}
			<button
				type="button"
				class="text-left rounded-lg p-3.5 border transition-all flex flex-col justify-between {active
					? 'border-primary ring-2 ring-primary/20 bg-primary/5 shadow-sm'
					: 'border-border/60 hover:border-border hover:bg-muted/40'}"
				onclick={() => deliberationStore.setPosture(p.id)}
			>
				<div>
					<div class="flex items-center justify-between mb-2">
						<div class="flex items-center gap-2">
							<div class="p-1.5 rounded-md {active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">
								<Icon class="h-4 w-4" />
							</div>
							<span class="font-semibold text-sm">{p.title}</span>
						</div>
					</div>
					<p class="text-xs text-muted-foreground leading-relaxed">
						{p.subtitle}
					</p>
				</div>
				<div class="mt-3 flex items-center justify-between text-[11px]">
					<span class="rounded px-1.5 py-0.5 bg-muted font-medium text-muted-foreground">{p.badge}</span>
					{#if active}
						<span class="font-semibold text-primary flex items-center gap-1">
							● Actif
						</span>
					{/if}
				</div>
			</button>
		{/each}
	</div>
</div>
