<script lang="ts">
	import { onMount } from 'svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { formatMaturityLevel, getMaturityBadgeClass } from '$lib/domain/debate';
	import { partitionSubjectsByParts } from '$lib/domain/subjectPartitioning';
	import {
		FolderKanban,
		Search,
		Check,
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		ArrowLeft,
		Target
	} from 'lucide-svelte';

	type MaturityFilter = 'l4_only' | 'l3_plus' | 'all';

	const allSubjects = $derived(deliberationStore.sortedSubjects);
	const activeSubject = $derived(deliberationStore.activeSubject);
	const activeSubjectId = $derived(deliberationStore.activeSubjectId);

	// Découpage automatique des sujets en Parties / Lots d'architecture
	const parts = $derived(partitionSubjectsByParts(allSubjects));
	const selectedPartId = $derived(deliberationStore.selectedPartId);

	// Filtres locaux & état du tiroir déroulant
	let maturityFilter = $state<MaturityFilter>('l4_only');
	let searchQuery = $state('');
	let isPickerOpen = $state(false);

	// Compteurs globaux
	const l4Count = $derived(
		allSubjects.filter((s) => s.level === 'L4_specified' || s.level === 'L5_archived').length
	);
	const l3PlusCount = $derived(
		allSubjects.filter(
			(s) => s.level === 'L3_decided' || s.level === 'L4_specified' || s.level === 'L5_archived'
		).length
	);

	// Initialisation intelligente : si aucun sujet L4 n'existe encore dans le projet, basculer sur L3+ ou Tous
	onMount(() => {
		if (l4Count === 0) {
			if (l3PlusCount > 0) {
				maturityFilter = 'l3_plus';
			} else {
				maturityFilter = 'all';
			}
		}

		ensureValidActiveSubject();
	});

	const selectedPart = $derived.by(() => {
		if (selectedPartId === 'all') return null;
		return parts.find((p) => p.id === selectedPartId) || null;
	});

	const partSubjects = $derived.by(() => {
		if (selectedPartId === 'all') return allSubjects;
		return selectedPart ? selectedPart.subjects : allSubjects;
	});

	// Sujets filtrés selon la maturité, le lot et la recherche
	const filteredSubjects = $derived.by(() => {
		let list = partSubjects;

		if (maturityFilter === 'l4_only') {
			list = list.filter((s) => s.level === 'L4_specified' || s.level === 'L5_archived');
		} else if (maturityFilter === 'l3_plus') {
			list = list.filter(
				(s) => s.level === 'L3_decided' || s.level === 'L4_specified' || s.level === 'L5_archived'
			);
		}

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase().trim();
			list = list.filter(
				(s) => s.name.toLowerCase().includes(q) || s.section_ref.toLowerCase().includes(q)
			);
		}

		return list;
	});

	const activeIndexInFiltered = $derived(
		filteredSubjects.findIndex((s) => s.id === activeSubjectId)
	);

	function ensureValidActiveSubject() {
		if (filteredSubjects.length === 0) return;
		const isCurrentInList = filteredSubjects.some((s) => s.id === activeSubjectId);
		if (!isCurrentInList) {
			deliberationStore.selectSubject(filteredSubjects[0].id, false);
		}
	}

	function handleSelectSubject(id: string) {
		deliberationStore.selectSubject(id, false);
		isPickerOpen = false;
	}

	function goPrevSubject() {
		if (filteredSubjects.length === 0) return;
		const idx = activeIndexInFiltered > 0 ? activeIndexInFiltered - 1 : filteredSubjects.length - 1;
		deliberationStore.selectSubject(filteredSubjects[idx].id, false);
	}

	function goNextSubject() {
		if (filteredSubjects.length === 0) return;
		const idx =
			activeIndexInFiltered >= 0 && activeIndexInFiltered < filteredSubjects.length - 1
				? activeIndexInFiltered + 1
				: 0;
		deliberationStore.selectSubject(filteredSubjects[idx].id, false);
	}

	function backToBoard() {
		deliberationStore.setPosture('deliberation');
		deliberationStore.setDeliberationViewMode('board');
	}
</script>

<div class="rounded-xl border bg-card shadow-2xs overflow-hidden transition-all" data-testid="subject-context-bar">
	<!-- ─── Barre Compacte Unifiée du Sujet Actif (1 ligne) ────────────────── -->
	<div class="px-3 py-2 bg-muted/20 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
		<!-- Gauche : Retour Tableau + Navigation Précédent/Suivant + Sujet Actif Cliquable -->
		<div class="flex items-center gap-1.5 min-w-0 flex-1">
			<button
				type="button"
				onclick={backToBoard}
				class="inline-flex items-center gap-1 px-2 py-1 rounded-lg border bg-background hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
				title="Revenir au Tableau des Sujets (vue d'ensemble du projet)"
			>
				<ArrowLeft class="h-3.5 w-3.5" />
				<span class="hidden sm:inline">Tableau</span>
			</button>

			<!-- Boutons Sujet Précédent / Suivant -->
			<div class="inline-flex items-center rounded-lg border bg-background shrink-0">
				<button
					type="button"
					data-testid="prev-subject-btn"
					onclick={goPrevSubject}
					disabled={filteredSubjects.length <= 1}
					class="p-1 text-muted-foreground hover:text-foreground disabled:opacity-40 cursor-pointer"
					title="Sujet précédent"
					aria-label="Sujet précédent"
				>
					<ChevronLeft class="h-3.5 w-3.5" />
				</button>
				<span class="text-[10px] font-mono text-muted-foreground px-1 border-x">
					{activeIndexInFiltered >= 0 ? activeIndexInFiltered + 1 : 1}/{Math.max(1, filteredSubjects.length)}
				</span>
				<button
					type="button"
					data-testid="next-subject-btn"
					onclick={goNextSubject}
					disabled={filteredSubjects.length <= 1}
					class="p-1 text-muted-foreground hover:text-foreground disabled:opacity-40 cursor-pointer"
					title="Sujet suivant"
					aria-label="Sujet suivant"
				>
					<ChevronRight class="h-3.5 w-3.5" />
				</button>
			</div>

			<!-- Sélecteur déroulant du sujet actif -->
			<button
				type="button"
				data-testid="toggle-subject-drawer-btn"
				onclick={() => (isPickerOpen = !isPickerOpen)}
				class="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg border bg-background hover:bg-muted/50 text-left transition-colors min-w-0 flex-1 cursor-pointer"
				title="Cliquer pour changer de sujet ou filtrer par lot"
			>
				<div class="flex items-center gap-2 min-w-0 truncate">
					<Target class="h-3.5 w-3.5 text-primary shrink-0" />
					{#if activeSubject}
						<span class="font-mono font-bold text-xs text-primary shrink-0">
							{activeSubject.section_ref}
						</span>
						<span class="text-xs font-bold text-foreground truncate">
							{activeSubject.name}
						</span>
						<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold shrink-0 {getMaturityBadgeClass(activeSubject.level)}">
							{formatMaturityLevel(activeSubject.level)}
						</span>
					{:else}
						<span class="text-xs text-muted-foreground italic">Sélectionner un sujet...</span>
					{/if}
				</div>
				<ChevronDown class="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform {isPickerOpen ? 'rotate-180' : ''}" />
			</button>
		</div>

		<!-- Droite : Filtres rapides de maturité -->
		<div class="flex items-center justify-between sm:justify-end gap-1.5 shrink-0 text-xs">
			<div class="flex items-center gap-1 bg-background border p-0.5 rounded-lg">
				<button
					type="button"
					onclick={() => {
						maturityFilter = 'l4_only';
						ensureValidActiveSubject();
					}}
					class="px-2 py-0.5 rounded-md font-semibold text-[11px] transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 {maturityFilter === 'l4_only'
						? 'bg-emerald-600 text-white shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
					title="Afficher uniquement les sujets spécifiés (L4)"
				>
					<span>Spécifiés L4</span>
					<span class="px-1 rounded-full text-[10px] {maturityFilter === 'l4_only' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}">
						{l4Count}
					</span>
				</button>

				<button
					type="button"
					onclick={() => {
						maturityFilter = 'l3_plus';
						ensureValidActiveSubject();
					}}
					class="px-2 py-0.5 rounded-md font-semibold text-[11px] transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 {maturityFilter === 'l3_plus'
						? 'bg-primary text-primary-foreground shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
					title="Afficher les sujets arbitrés ou spécifiés (L3+)"
				>
					<span>Arbitrés L3+</span>
					<span class="px-1 rounded-full text-[10px] {maturityFilter === 'l3_plus' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}">
						{l3PlusCount}
					</span>
				</button>

				<button
					type="button"
					onclick={() => {
						maturityFilter = 'all';
						ensureValidActiveSubject();
					}}
					class="px-2 py-0.5 rounded-md font-semibold text-[11px] transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 {maturityFilter === 'all'
						? 'bg-secondary text-secondary-foreground shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
					title="Afficher tous les sujets du projet"
				>
					<span>Tous</span>
					<span class="px-1 rounded-full text-[10px] {maturityFilter === 'all' ? 'bg-foreground/10 text-foreground' : 'bg-muted text-muted-foreground'}">
						{allSubjects.length}
					</span>
				</button>
			</div>
		</div>
	</div>

	<!-- ─── Tiroir Dépliable : Recherche, Lots & Grille des Sujets ─────────── -->
	{#if isPickerOpen}
		<div class="border-t bg-card p-3 space-y-2.5 animate-in fade-in duration-150">
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
				{#if parts.length > 1}
					<div class="flex items-center gap-1 overflow-x-auto no-scrollbar">
						<span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
							<FolderKanban class="h-3.5 w-3.5 text-primary" />
							Lots :
						</span>
						<button
							type="button"
							onclick={() => {
								deliberationStore.setSelectedPartId('all');
								ensureValidActiveSubject();
							}}
							class="px-2 py-0.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap cursor-pointer {selectedPartId === 'all'
								? 'bg-primary text-primary-foreground'
								: 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground'}"
						>
							Tous ({allSubjects.length})
						</button>

						{#each parts as part}
							{@const isSelected = selectedPartId === part.id}
							<button
								type="button"
								onclick={() => {
									deliberationStore.setSelectedPartId(part.id);
									ensureValidActiveSubject();
								}}
								class="px-2 py-0.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer {isSelected
									? 'bg-primary text-primary-foreground'
									: 'bg-muted/50 hover:bg-muted text-foreground'}"
								title="{part.name} ({part.sectionRange})"
							>
								<span class="font-mono text-[10px] opacity-80">{part.code}</span>
								<span class="truncate max-w-[110px]">{part.name}</span>
								<span class="text-[10px] px-1 rounded-full {isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background text-muted-foreground'}">
									{part.subjects.length}
								</span>
							</button>
						{/each}
					</div>
				{/if}

				<div class="relative w-full sm:w-64 shrink-0">
					<Search class="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Rechercher un sujet (§11, WAPT...)..."
						class="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
					/>
				</div>
			</div>

			<div class="max-h-48 overflow-y-auto">
				{#if filteredSubjects.length === 0}
					<div class="p-4 text-center text-xs text-muted-foreground space-y-1.5">
						<p class="font-medium">Aucun sujet ne correspond à ce filtre.</p>
						{#if maturityFilter !== 'all'}
							<button
								type="button"
								onclick={() => {
									maturityFilter = 'all';
									ensureValidActiveSubject();
								}}
								class="px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 cursor-pointer"
							>
								Afficher tous les sujets ({allSubjects.length})
							</button>
						{/if}
					</div>
				{:else}
					<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
						{#each filteredSubjects as sub (sub.id)}
							{@const isSelected = sub.id === activeSubjectId}
							<button
								type="button"
								onclick={() => handleSelectSubject(sub.id)}
								class="flex items-start justify-between gap-2 p-2 rounded-lg border text-left transition-all cursor-pointer {isSelected
									? 'bg-primary/10 border-primary shadow-2xs ring-1 ring-primary/30'
									: 'bg-muted/20 hover:bg-muted/50 border-border/70'}"
							>
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-1.5">
										<span class="font-mono text-[11px] font-bold {isSelected ? 'text-primary' : 'text-muted-foreground'} shrink-0">
											{sub.section_ref}
										</span>
										<strong class="text-xs font-semibold text-foreground truncate">
											{sub.name}
										</strong>
									</div>
								</div>

								<div class="flex items-center gap-1 shrink-0">
									<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold {getMaturityBadgeClass(sub.level)}">
										{formatMaturityLevel(sub.level)}
									</span>
									{#if isSelected}
										<Check class="h-3.5 w-3.5 text-primary shrink-0" />
									{/if}
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
