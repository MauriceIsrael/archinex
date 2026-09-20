<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { MaturitySubject } from '$lib/domain/maturityBoard';
	import {
		AlertCircle,
		ArrowUpRight,
		CheckCircle2,
		Flame,
		Hourglass,
		Layers,
		Send,
		ShieldAlert,
		Zap
	} from 'lucide-svelte';

	const subjects = $derived(deliberationStore.sortedSubjects);
	const activeSubjectId = $derived(deliberationStore.activeSubjectId);

	function getLevelBadgeClass(level: string) {
		switch (level) {
			case 'L0_named':
				return 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20';
			case 'L1_framed':
				return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
			case 'L2_decomposed':
				return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
			case 'L3_decided':
				return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
			case 'L4_specified':
				return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20';
			case 'L5_archived':
				return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
			default:
				return 'bg-muted text-muted-foreground';
		}
	}
</script>

<div class="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col h-full">
	<!-- Barre de statut supérieure -->
	<div class="p-4 border-b bg-muted/20 flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<div class="p-1.5 rounded-md bg-primary/10 text-primary">
				<Layers class="h-4 w-4" />
			</div>
			<h3 class="font-bold text-sm tracking-tight">Board d'Allocation d'Effort (Trié par Déblocages)</h3>
		</div>

		<div class="flex items-center gap-4 text-xs">
			<div class="flex items-center gap-1.5 font-medium">
				<Zap class="h-3.5 w-3.5 text-amber-500" />
				<span>Total Déblocages :</span>
				<span class="font-mono font-bold text-primary">{deliberationStore.totalUnlocks}</span>
			</div>
			<span class="text-border">|</span>
			<div class="flex items-center gap-1.5 font-medium">
				<AlertCircle class="h-3.5 w-3.5 text-destructive" />
				<span>Bloquants Ouverts :</span>
				<span class="font-mono font-bold text-destructive">{deliberationStore.totalBlocking}</span>
			</div>
			{#if deliberationStore.stalledSubjects.length > 0}
				<span class="text-border">|</span>
				<div class="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/20">
					<Hourglass class="h-3 w-3" />
					<span>{deliberationStore.stalledSubjects.length} sujet(s) en stagnation (> 14 j)</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Table des 6 colonnes -->
	<div class="overflow-x-auto flex-1">
		<table class="w-full text-left text-xs border-collapse">
			<thead>
				<tr class="border-b bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
					<th class="py-3 px-4">§ Sujet d'Architecture</th>
					<th class="py-3 px-3">Niveau</th>
					<th class="py-3 px-3 text-center">Bloquants</th>
					<th class="py-3 px-3 text-center bg-primary/5 text-primary font-bold">
						<div class="inline-flex items-center gap-1">
							<Zap class="h-3 w-3" />
							Débloque
						</div>
					</th>
					<th class="py-3 px-3">En attente de</th>
					<th class="py-3 px-2 text-center">Effort</th>
					<th class="py-3 px-3 text-right">Actions</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-border/60">
				{#each subjects as sub}
					{@const isSelected = sub.id === activeSubjectId}
					<tr
						class="transition-colors hover:bg-muted/50 cursor-pointer {isSelected
							? 'bg-primary/10 font-medium'
							: ''}"
						onclick={() => deliberationStore.selectSubject(sub.id)}
					>
						<!-- 1. Sujet & Stagnation -->
						<td class="py-3 px-4">
							<div class="flex items-center gap-2">
								<span class="font-mono font-bold text-muted-foreground">{sub.section_ref}</span>
								<span class="font-semibold text-foreground text-sm">{sub.name}</span>
							</div>
							{#if sub.is_stalled}
								<div class="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
									<Hourglass class="h-3 w-3" />
									Stagnation ({sub.stall_days} jours sans promotion)
								</div>
							{/if}
						</td>

						<!-- 2. Niveau -->
						<td class="py-3 px-3">
							<span class="inline-flex items-center rounded px-2 py-0.5 font-mono text-[11px] font-semibold border {getLevelBadgeClass(sub.level)}">
								{sub.level}
							</span>
						</td>

						<!-- 3. Bloquants -->
						<td class="py-3 px-3 text-center">
							{#if sub.blocking_count > 0}
								<span class="inline-flex items-center justify-center font-mono font-bold text-destructive bg-destructive/10 rounded-full h-5 min-w-5 px-1.5">
									{sub.blocking_count}
								</span>
							{:else}
								<span class="text-muted-foreground/60">—</span>
							{/if}
						</td>

						<!-- 4. Débloque (Colonne Prioritaire) -->
						<td class="py-3 px-3 text-center bg-primary/5">
							{#if sub.unlocks_count > 0}
								<span class="inline-flex items-center gap-1 font-mono font-bold text-primary bg-primary/20 rounded-full h-6 min-w-6 px-2 text-xs">
									<ArrowUpRight class="h-3 w-3" />
									+{sub.unlocks_count}
								</span>
							{:else}
								<span class="text-muted-foreground/60">0</span>
							{/if}
						</td>

						<!-- 5. En attente de -->
						<td class="py-3 px-3">
							<span class="font-medium text-foreground rounded bg-muted px-2 py-0.5 text-[11px] border">
								{sub.waiting_for_role}
							</span>
						</td>

						<!-- 6. Effort -->
						<td class="py-3 px-2 text-center">
							<span class="font-mono text-muted-foreground font-semibold">{sub.relative_effort}</span>
						</td>

						<!-- Actions -->
						<td class="py-3 px-3 text-right">
							<div class="inline-flex items-center gap-1.5" onclick={(e) => e.stopPropagation()}>
								{#if sub.level !== 'L3_decided' && sub.level !== 'L4_specified'}
									<button
										type="button"
										class="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
										title="Trancher et acter à L3 (débloque les sujets dépendants)"
										onclick={() => deliberationStore.arbitrateSubject(sub.id)}
									>
										<CheckCircle2 class="h-3 w-3" />
										Trancher
									</button>
								{/if}
								{#if sub.blocking_count > 0}
									<button
										type="button"
										class="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
										title="Relancer le rôle responsable en 1 clic"
										onclick={() => deliberationStore.sendRelance(sub.id, 'Q-BLOCK')}
									>
										<Send class="h-3 w-3" />
										Relancer
									</button>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Journal des événements d'élicitation -->
	{#if deliberationStore.notifications.length > 0}
		<div class="border-t p-3 bg-muted/10 text-xs font-sans">
			<div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
				Derniers Arbitrages & Déblocages
			</div>
			<div class="space-y-1 max-h-24 overflow-y-auto pr-1">
				{#each deliberationStore.notifications.slice(0, 3) as notif}
					<div class="flex items-center gap-2 text-foreground font-medium">
						<span class="font-mono text-muted-foreground text-[10px]">{notif.timestamp}</span>
						<span>{notif.message}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
