<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { MaturitySubject } from '$lib/domain/maturityBoard';
	import { formatMaturityLevel, getMaturityBadgeClass } from '$lib/domain/debate';
	import { partitionSubjectsByParts, type SubjectPart } from '$lib/domain/subjectPartitioning';
	import {
		AlertCircle,
		ArrowUpRight,
		CheckCircle2,
		Hourglass,
		Layers,
		Send,
		Zap,
		Filter,
		FolderKanban,
		BookmarkCheck,
		Plus
	} from 'lucide-svelte';
	import CreateSubjectDialog from './CreateSubjectDialog.svelte';

	type FilterType = 'all' | 'blocking' | 'todo' | 'decided';

	let {
		onOpenSubject
	}: {
		onOpenSubject?: (subjectId: string) => void;
	} = $props();

	let activeFilter = $state<FilterType>('all');
	let selectedPartId = $state<string>('all');
	let isCreateDialogOpen = $state(false);

	const allSubjects = $derived(deliberationStore.sortedSubjects);
	const activeSubjectId = $derived(deliberationStore.activeSubjectId);

	// Découpage automatique des sujets en Parties / Lots d'architecture
	const parts = $derived(partitionSubjectsByParts(allSubjects));

	const selectedPart = $derived.by(() => {
		if (selectedPartId === 'all') return null;
		return parts.find((p) => p.id === selectedPartId) || null;
	});

	const partSubjects = $derived.by(() => {
		if (selectedPartId === 'all') return allSubjects;
		return selectedPart ? selectedPart.subjects : allSubjects;
	});

	const filteredSubjects = $derived.by(() => {
		switch (activeFilter) {
			case 'blocking':
				return partSubjects.filter((s) => s.blocking_count > 0);
			case 'todo':
				return partSubjects.filter(
					(s) => s.level === 'L0_named' || s.level === 'L1_framed' || s.level === 'L2_decomposed'
				);
			case 'decided':
				return partSubjects.filter(
					(s) => s.level === 'L3_decided' || s.level === 'L4_specified' || s.level === 'L5_archived'
				);
			default:
				return partSubjects;
		}
	});

	function handleSelectSubject(id: string) {
		deliberationStore.selectSubject(id);
		onOpenSubject?.(id);
	}
</script>

<div class="rounded-xl border bg-card shadow-xs overflow-hidden flex flex-col h-full">
	<!-- ─── 1. Barre de Découpage par Parties / Lots d'Architecture ────────── -->
	{#if parts.length > 1}
		<div class="px-3.5 py-2 bg-muted/40 border-b flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
			<span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
				<FolderKanban class="h-3.5 w-3.5 text-primary" />
				Lots / Parties :
			</span>
			<button
				type="button"
				onclick={() => (selectedPartId = 'all')}
				class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer {selectedPartId === 'all'
					? 'bg-primary text-primary-foreground shadow-xs'
					: 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground border'}"
			>
				<span>Toutes ({allSubjects.length})</span>
			</button>

			{#each parts as part}
				{@const isSelected = selectedPartId === part.id}
				<button
					type="button"
					onclick={() => (selectedPartId = part.id)}
					class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer {isSelected
						? 'bg-primary text-primary-foreground shadow-xs ring-1 ring-primary'
						: 'bg-background hover:bg-muted text-foreground border'}"
					title="{part.name} ({part.sectionRange})"
				>
					<span class="font-mono text-[10px] opacity-80">{part.code}</span>
					<span>{part.name.length > 24 ? part.name.slice(0, 24) + '...' : part.name}</span>
					
					<!-- Badge de complétion L3 du lot -->
					<span class="px-1.5 py-0.2 rounded text-[10px] font-mono {part.metrics.maturityRate === 100
						? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 font-bold'
						: part.metrics.blockingCount > 0
							? 'bg-destructive/20 text-destructive font-bold'
							: 'bg-muted text-muted-foreground'}">
						{part.metrics.maturityRate}%
					</span>

					{#if part.metrics.blockingCount > 0}
						<span class="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" title="{part.metrics.blockingCount} bloquant(s)"></span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Fiche d'information sur la Partie sélectionnée -->
		{#if selectedPart}
			<div class="px-3.5 py-2 bg-primary/5 border-b flex flex-wrap items-center justify-between gap-2 text-xs">
				<div class="flex items-center gap-2">
					<span class="font-bold text-foreground">{selectedPart.name}</span>
					<span class="text-[11px] text-muted-foreground font-mono bg-background px-1.5 py-0.5 rounded border">
						{selectedPart.sectionRange}
					</span>
					<span class="text-[11px] text-muted-foreground hidden sm:inline">· {selectedPart.description}</span>
				</div>
				<div class="flex items-center gap-3 text-[11px]">
					<span>Référent : <strong class="text-foreground">{selectedPart.leadRole}</strong></span>
					<span>Avancement : <strong class="text-primary font-mono">{selectedPart.metrics.decidedCount}/{selectedPart.metrics.totalCount} scellés ({selectedPart.metrics.maturityRate}%)</strong></span>
				</div>
			</div>
		{/if}
	{/if}

	<!-- ─── 2. Barre de Titre et Filtres rapides ───────────────────────────── -->
	<div class="p-3.5 border-b bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
		<div class="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
			<div class="flex items-center gap-2">
				<div class="p-1 rounded-md bg-primary/10 text-primary">
					<Layers class="h-4 w-4" />
				</div>
				<h3 class="font-bold text-sm tracking-tight text-foreground">
					Matrice d'Effort {selectedPart ? `· ${selectedPart.code}` : ''}
				</h3>
				<span class="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[11px] font-mono font-bold">
					{filteredSubjects.length}
				</span>
			</div>

			<button
				type="button"
				onclick={() => (isCreateDialogOpen = true)}
				class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold cursor-pointer shadow-2xs transition-colors shrink-0"
				title="Créer un nouveau sujet d'architecture"
			>
				<Plus class="h-3.5 w-3.5" />
				<span>Nouveau sujet</span>
			</button>
		</div>

		<!-- Filtres rapides -->
		<div class="flex items-center gap-1 overflow-x-auto text-[11px]">
			<button
				type="button"
				onclick={() => (activeFilter = 'all')}
				class="px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer {activeFilter === 'all'
					? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				Tous ({partSubjects.length})
			</button>
			<button
				type="button"
				onclick={() => (activeFilter = 'blocking')}
				class="px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer {activeFilter === 'blocking'
					? 'bg-destructive text-destructive-foreground font-semibold shadow-2xs'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				Bloquants ({partSubjects.filter((s) => s.blocking_count > 0).length})
			</button>
			<button
				type="button"
				onclick={() => (activeFilter = 'todo')}
				class="px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer {activeFilter === 'todo'
					? 'bg-amber-600 text-white font-semibold shadow-2xs'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				À arbitrer ({partSubjects.filter((s) => s.level < 'L3').length})
			</button>
			<button
				type="button"
				onclick={() => (activeFilter = 'decided')}
				class="px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer {activeFilter === 'decided'
					? 'bg-emerald-600 text-white font-semibold shadow-2xs'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				Actés L3+ ({partSubjects.filter((s) => s.level >= 'L3').length})
			</button>
		</div>
	</div>

	<!-- 1. Vue Mobile : Liste de Cartes Ergonomiques (< md) -->
	<div class="block md:hidden divide-y divide-border/60 overflow-y-auto max-h-[500px]">
		{#each filteredSubjects as sub}
			{@const isSelected = sub.id === activeSubjectId}
			<div
				class="p-3.5 transition-colors cursor-pointer space-y-2.5 {isSelected ? 'bg-primary/10 border-l-4 border-primary' : 'hover:bg-muted/40'}"
				onclick={() => handleSelectSubject(sub.id)}
				role="button"
				tabindex="0"
				onkeydown={(e) => { if (e.key === 'Enter') handleSelectSubject(sub.id); }}
			>
				<div class="flex items-start justify-between gap-2">
					<div>
						<div class="flex items-center gap-1.5 mb-1">
							<span class="font-mono text-xs font-bold text-muted-foreground">{sub.section_ref}</span>
							<span class="inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold border {getMaturityBadgeClass(sub.level)}">
								{formatMaturityLevel(sub.level)}
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
						onclick={() => handleSelectSubject(sub.id)}
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
							<span class="inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-bold border {getMaturityBadgeClass(sub.level)}">
								{formatMaturityLevel(sub.level)}
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

<CreateSubjectDialog
	isOpen={isCreateDialogOpen}
	onClose={() => (isCreateDialogOpen = false)}
	onSubjectCreated={(newSub) => handleSelectSubject(newSub.id)}
/>
