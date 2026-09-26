<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { MaturitySubject } from '$lib/domain/maturityBoard';
	import {
		AlertCircle,
		ArrowUpRight,
		CheckCircle2,
		Hourglass,
		Layers,
		Send,
		Zap,
		Filter
	} from 'lucide-svelte';

	type FilterType = 'all' | 'blocking' | 'todo' | 'decided';

	let activeFilter = $state<FilterType>('all');

	const subjects = $derived(deliberationStore.sortedSubjects);
	const activeSubjectId = $derived(deliberationStore.activeSubjectId);

	const filteredSubjects = $derived.by(() => {
		switch (activeFilter) {
			case 'blocking':
				return subjects.filter((s) => s.blocking_count > 0);
			case 'todo':
				return subjects.filter(
					(s) => s.level === 'L0_named' || s.level === 'L1_framed' || s.level === 'L2_decomposed'
				);
			case 'decided':
				return subjects.filter(
					(s) => s.level === 'L3_decided' || s.level === 'L4_specified' || s.level === 'L5_archived'
				);
			default:
				return subjects;
		}
	});

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

<div class="rounded-xl border bg-card shadow-xs overflow-hidden flex flex-col h-full">
	<!-- Barre supérieure : Titre et filtres rapides -->
	<div class="p-3.5 border-b bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<div class="p-1 rounded-md bg-primary/10 text-primary">
				<Layers class="h-4 w-4" />
			</div>
			<h3 class="font-bold text-sm tracking-tight text-foreground">
				Matrice d'Allocation d'Effort
			</h3>
			<span class="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[11px] font-mono font-bold">
				{filteredSubjects.length}
			</span>
		</div>

		<!-- Filtres rapides -->
		<div class="flex items-center gap-1 overflow-x-auto text-[11px]">
			<button
				type="button"
				onclick={() => (activeFilter = 'all')}
				class="px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap {activeFilter === 'all'
					? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				Tous ({subjects.length})
			</button>
			<button
				type="button"
				onclick={() => (activeFilter = 'blocking')}
				class="px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap {activeFilter === 'blocking'
					? 'bg-destructive text-destructive-foreground font-semibold shadow-2xs'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				Bloquants ({subjects.filter((s) => s.blocking_count > 0).length})
			</button>
			<button
				type="button"
				onclick={() => (activeFilter = 'todo')}
				class="px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap {activeFilter === 'todo'
					? 'bg-amber-600 text-white font-semibold shadow-2xs'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				À arbitrer ({subjects.filter((s) => s.level < 'L3').length})
			</button>
			<button
				type="button"
				onclick={() => (activeFilter = 'decided')}
				class="px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap {activeFilter === 'decided'
					? 'bg-emerald-600 text-white font-semibold shadow-2xs'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				Actés L3+ ({subjects.filter((s) => s.level >= 'L3').length})
			</button>
		</div>
	</div>

	<!-- 1. Vue Mobile : Liste de Cartes Ergonomiques (< md) -->
	<div class="block md:hidden divide-y divide-border/60 overflow-y-auto max-h-[500px]">
		{#each filteredSubjects as sub}
			{@const isSelected = sub.id === activeSubjectId}
			<div
				class="p-3.5 transition-colors cursor-pointer space-y-2.5 {isSelected ? 'bg-primary/10 border-l-4 border-primary' : 'hover:bg-muted/40'}"
				onclick={() => deliberationStore.selectSubject(sub.id)}
				role="button"
				tabindex="0"
				onkeydown={(e) => { if (e.key === 'Enter') deliberationStore.selectSubject(sub.id); }}
			>
				<div class="flex items-start justify-between gap-2">
					<div>
						<div class="flex items-center gap-1.5 mb-1">
							<span class="font-mono text-xs font-bold text-muted-foreground">{sub.section_ref}</span>
							<span class="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold border {getLevelBadgeClass(sub.level)}">
								{sub.level}
							</span>
						</div>
						<h4 class="text-xs font-bold text-foreground leading-snug">{sub.name}</h4>
					</div>

					{#if sub.unlocks_count > 0}
						<span class="inline-flex items-center gap-0.5 font-mono font-bold text-primary bg-primary/15 rounded-full px-2 py-0.5 text-xs shrink-0">
							<ArrowUpRight class="h-3 w-3" />
							+{sub.unlocks_count}
						</span>
					{/if}
				</div>

				<div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
					<div class="flex items-center gap-2">
						<span>Attente : <strong class="text-foreground">{sub.waiting_for_role}</strong></span>
						<span>· Effort : <strong class="text-foreground font-mono">{sub.relative_effort}</strong></span>
					</div>

					<div class="flex items-center gap-1.5">
						{#if sub.level !== 'L3_decided' && sub.level !== 'L4_specified' && sub.level !== 'L5_archived'}
							<button
								type="button"
								class="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 shadow-2xs"
								onclick={(e) => {
									e.stopPropagation();
									deliberationStore.arbitrateSubject(sub.id);
								}}
							>
								<CheckCircle2 class="h-3 w-3" />
								Trancher
							</button>
						{/if}
						{#if sub.blocking_count > 0}
							<button
								type="button"
								class="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
								onclick={(e) => {
									e.stopPropagation();
									deliberationStore.sendRelance(sub.id, 'Q-BLOCK');
								}}
							>
								<Send class="h-3 w-3" />
								Relancer
							</button>
						{/if}
					</div>
				</div>

				{#if sub.is_stalled}
					<div class="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
						<Hourglass class="h-2.5 w-2.5" />
						Stagnation ({sub.stall_days}j sans transition)
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- 2. Vue Desktop : Tableau de Bord Complet (>= md) -->
	<div class="hidden md:block overflow-x-auto flex-1">
		<table class="w-full text-left text-xs border-collapse">
			<thead>
				<tr class="border-b bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
					<th class="py-2.5 px-4">Section & Sujet</th>
					<th class="py-2.5 px-3">Maturité</th>
					<th class="py-2.5 px-3 text-center">Bloquants</th>
					<th class="py-2.5 px-3 text-center bg-primary/5 text-primary font-bold">
						<div class="inline-flex items-center gap-1">
							<Zap class="h-3 w-3" />
							Débloque
						</div>
					</th>
					<th class="py-2.5 px-3">Attente</th>
					<th class="py-2.5 px-2 text-center">Effort</th>
					<th class="py-2.5 px-3 text-right">Actions</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-border/60">
				{#each filteredSubjects as sub}
					{@const isSelected = sub.id === activeSubjectId}
					<tr
						class="transition-colors hover:bg-muted/50 cursor-pointer {isSelected
							? 'bg-primary/10 font-medium'
							: ''}"
						onclick={() => deliberationStore.selectSubject(sub.id)}
					>
						<!-- 1. Sujet & Stagnation -->
						<td class="py-2.5 px-4">
							<div class="flex items-center gap-2">
								<span class="font-mono font-bold text-muted-foreground">{sub.section_ref}</span>
								<span class="font-semibold text-foreground text-xs">{sub.name}</span>
							</div>
							{#if sub.is_stalled}
								<div class="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
									<Hourglass class="h-2.5 w-2.5" />
									Stagnation ({sub.stall_days}j)
								</div>
							{/if}
						</td>

						<!-- 2. Niveau -->
						<td class="py-2.5 px-3">
							<span class="inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] font-semibold border {getLevelBadgeClass(sub.level)}">
								{sub.level}
							</span>
						</td>

						<!-- 3. Bloquants -->
						<td class="py-2.5 px-3 text-center">
							{#if sub.blocking_count > 0}
								<span class="inline-flex items-center justify-center font-mono font-bold text-destructive bg-destructive/10 rounded-full h-5 min-w-5 px-1.5 text-[11px]">
									{sub.blocking_count}
								</span>
							{:else}
								<span class="text-muted-foreground/50">—</span>
							{/if}
						</td>

						<!-- 4. Débloque (Colonne Prioritaire) -->
						<td class="py-2.5 px-3 text-center bg-primary/5">
							{#if sub.unlocks_count > 0}
								<span class="inline-flex items-center gap-0.5 font-mono font-bold text-primary bg-primary/20 rounded-full h-5 min-w-5 px-1.5 text-[11px]">
									<ArrowUpRight class="h-2.5 w-2.5" />
									+{sub.unlocks_count}
								</span>
							{:else}
								<span class="text-muted-foreground/50">0</span>
							{/if}
						</td>

						<!-- 5. En attente de -->
						<td class="py-2.5 px-3">
							<span class="font-medium text-foreground text-[11px]">
								{sub.waiting_for_role}
							</span>
						</td>

						<!-- 6. Effort -->
						<td class="py-2.5 px-2 text-center">
							<span class="font-mono text-muted-foreground font-semibold">{sub.relative_effort}</span>
						</td>

						<!-- Actions -->
						<td class="py-2.5 px-3 text-right">
							<div class="inline-flex items-center gap-1.5">
								{#if sub.level !== 'L3_decided' && sub.level !== 'L4_specified' && sub.level !== 'L5_archived'}
									<button
										type="button"
										class="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs"
										title="Trancher et acter à L3"
										onclick={(e) => {
											e.stopPropagation();
											deliberationStore.arbitrateSubject(sub.id);
										}}
									>
										<CheckCircle2 class="h-3 w-3" />
										Trancher
									</button>
								{/if}
								{#if sub.blocking_count > 0}
									<button
										type="button"
										class="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
										title="Relancer le rôle responsable"
										onclick={(e) => {
											e.stopPropagation();
											deliberationStore.sendRelance(sub.id, 'Q-BLOCK');
										}}
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
</div>
