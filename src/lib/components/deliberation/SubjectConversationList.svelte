<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { MaturitySubject } from '$lib/domain/maturityBoard';
	import {
		MessagesSquare,
		Search,
		AlertCircle,
		ArrowLeft,
		Filter,
		CheckCircle2,
		Layers
	} from 'lucide-svelte';

	let {
		selectedSubjectId = '',
		onSelectSubject = (id: string) => {},
		onBackToBoard = () => {}
	}: {
		selectedSubjectId?: string;
		onSelectSubject?: (id: string) => void;
		onBackToBoard?: () => void;
	} = $props();

	type FilterType = 'all' | 'blocking' | 'todo' | 'decided';
	let searchQuery = $state('');
	let activeFilter = $state<FilterType>('all');

	const allSubjects = $derived(deliberationStore.sortedSubjects);

	const filteredSubjects = $derived.by(() => {
		let list = allSubjects;
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase().trim();
			list = list.filter(
				(s) => s.name.toLowerCase().includes(q) || s.section_ref.toLowerCase().includes(q)
			);
		}
		switch (activeFilter) {
			case 'blocking':
				return list.filter((s) => s.blocking_count > 0);
			case 'todo':
				return list.filter((s) => s.level < 'L3');
			case 'decided':
				return list.filter((s) => s.level >= 'L3');
			default:
				return list;
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

	function formatMaturityShort(level: string) {
		switch (level) {
			case 'L0_named': return 'L0';
			case 'L1_framed': return 'L1';
			case 'L2_decomposed': return 'L2';
			case 'L3_decided': return 'L3';
			case 'L4_specified': return 'L4';
			case 'L5_archived': return 'L5';
			default: return level;
		}
	}
</script>

<div class="flex flex-col h-full bg-card rounded-xl border shadow-xs overflow-hidden">
	<!-- En-tête : retour au tableau & titre -->
	<div class="p-3 border-b bg-muted/20 space-y-2.5 shrink-0">
		<div class="flex items-center justify-between gap-2">
			<button
				type="button"
				onclick={onBackToBoard}
				class="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
				title="Revenir à la vue d'ensemble (Tableau de maturité)"
			>
				<ArrowLeft class="h-3.5 w-3.5" />
				<span>Tableau</span>
			</button>

			<div class="flex items-center gap-1.5 font-bold text-xs text-foreground">
				<MessagesSquare class="h-3.5 w-3.5 text-primary" />
				<span>Conversations</span>
				<span class="rounded bg-primary/10 text-primary px-1.5 py-0.2 text-[10px] font-mono font-bold">
					{allSubjects.length}
				</span>
			</div>
		</div>

		<!-- Champ de recherche rapide -->
		<div class="relative">
			<Search class="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Filtrer un sujet..."
				class="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
			/>
		</div>

		<!-- Filtres rapides -->
		<div class="flex items-center gap-1 overflow-x-auto text-[10px] pb-0.5">
			<button
				type="button"
				onclick={() => (activeFilter = 'all')}
				class="px-2 py-0.5 rounded font-medium transition-colors whitespace-nowrap cursor-pointer {activeFilter === 'all'
					? 'bg-primary text-primary-foreground font-semibold'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				Tous ({allSubjects.length})
			</button>
			<button
				type="button"
				onclick={() => (activeFilter = 'blocking')}
				class="px-2 py-0.5 rounded font-medium transition-colors whitespace-nowrap cursor-pointer {activeFilter === 'blocking'
					? 'bg-destructive text-destructive-foreground font-semibold'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				Bloqués ({allSubjects.filter((s) => s.blocking_count > 0).length})
			</button>
			<button
				type="button"
				onclick={() => (activeFilter = 'todo')}
				class="px-2 py-0.5 rounded font-medium transition-colors whitespace-nowrap cursor-pointer {activeFilter === 'todo'
					? 'bg-amber-600 text-white font-semibold'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				À faire ({allSubjects.filter((s) => s.level < 'L3').length})
			</button>
			<button
				type="button"
				onclick={() => (activeFilter = 'decided')}
				class="px-2 py-0.5 rounded font-medium transition-colors whitespace-nowrap cursor-pointer {activeFilter === 'decided'
					? 'bg-emerald-600 text-white font-semibold'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				Actés ({allSubjects.filter((s) => s.level >= 'L3').length})
			</button>
		</div>
	</div>

	<!-- Liste déroulante des conversations de sujets -->
	<div class="divide-y divide-border/60 overflow-y-auto flex-1">
		{#if filteredSubjects.length === 0}
			<div class="p-4 text-center text-xs text-muted-foreground">
				Aucun sujet correspondant au filtre.
			</div>
		{:else}
			{#each filteredSubjects as sub (sub.id)}
				{@const isSelected = sub.id === selectedSubjectId}
				<button
					type="button"
					onclick={() => onSelectSubject(sub.id)}
					class="w-full text-left p-3 transition-colors cursor-pointer space-y-1.5 block {isSelected
						? 'bg-primary/10 border-l-3 border-primary'
						: 'hover:bg-muted/40'}"
				>
					<div class="flex items-center justify-between gap-1.5">
						<span class="font-mono text-[11px] font-bold text-muted-foreground">
							{sub.section_ref}
						</span>
						<div class="flex items-center gap-1">
							<span
								class="inline-flex items-center rounded px-1.5 py-0.2 font-mono text-[10px] font-semibold border {getLevelBadgeClass(
									sub.level
								)}"
							>
								{formatMaturityShort(sub.level)}
							</span>
							{#if sub.blocking_count > 0}
								<span
									class="inline-flex items-center justify-center font-mono font-bold text-[10px] text-destructive bg-destructive/15 rounded-full px-1.5 py-0.2"
									title={`${sub.blocking_count} objection(s) bloquante(s)`}
								>
									{sub.blocking_count} obj.
								</span>
							{/if}
						</div>
					</div>

					<h4 class="text-xs font-semibold text-foreground line-clamp-2 leading-snug">
						{sub.name}
					</h4>

					<div class="flex items-center justify-between text-[10px] text-muted-foreground">
						<span>Attente : <strong class="text-foreground">{sub.waiting_for_role}</strong></span>
						<span class="font-mono">Effort {sub.relative_effort}</span>
					</div>
				</button>
			{/each}
		{/if}
	</div>
</div>
