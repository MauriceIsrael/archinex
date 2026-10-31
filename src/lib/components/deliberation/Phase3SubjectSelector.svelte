<script lang="ts">
	import { onMount } from 'svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { MaturitySubject } from '$lib/domain/maturityBoard';
	import { formatMaturityLevel, getMaturityBadgeClass } from '$lib/domain/debate';
	import { partitionSubjectsByParts, type SubjectPart } from '$lib/domain/subjectPartitioning';
	import {
		FolderKanban,
		Search,
		CheckCircle2,
		Layers,
		Check,
		FileText,
		Sparkles,
		Filter
	} from 'lucide-svelte';

	type MaturityFilter = 'l4_only' | 'l3_plus' | 'all';

	const allSubjects = $derived(deliberationStore.sortedSubjects);
	const activeSubject = $derived(deliberationStore.activeSubject);
	const activeSubjectId = $derived(deliberationStore.activeSubjectId);

	// Découpage automatique des sujets en Parties / Lots d'architecture
	const parts = $derived(partitionSubjectsByParts(allSubjects));
	const selectedPartId = $derived(deliberationStore.selectedPartId);

	// Filtres locaux
	let maturityFilter = $state<MaturityFilter>('l4_only');
	let searchQuery = $state('');

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

		// Pré-sélectionner le premier sujet mature si le sujet actif actuel n'est pas mature
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

		// 1. Filtre par maturité (L4 par défaut pour la phase de rendu et homologation)
		if (maturityFilter === 'l4_only') {
			list = list.filter((s) => s.level === 'L4_specified' || s.level === 'L5_archived');
		} else if (maturityFilter === 'l3_plus') {
			list = list.filter(
				(s) => s.level === 'L3_decided' || s.level === 'L4_specified' || s.level === 'L5_archived'
			);
		}

		// 2. Recherche textuelle
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase().trim();
			list = list.filter(
				(s) => s.name.toLowerCase().includes(q) || s.section_ref.toLowerCase().includes(q)
			);
		}

		return list;
	});

	function ensureValidActiveSubject() {
		if (filteredSubjects.length === 0) return;
		const isCurrentInList = filteredSubjects.some((s) => s.id === activeSubjectId);
		if (!isCurrentInList) {
			// Sélectionne automatiquement le premier sujet de la liste filtrée sans basculer la vue
			deliberationStore.selectSubject(filteredSubjects[0].id, false);
		}
	}

	function handleSelectSubject(id: string) {
		deliberationStore.selectSubject(id, false);
	}
</script>

<div class="rounded-xl border bg-card shadow-xs overflow-hidden transition-all">
	<!-- ─── 1. En-tête : Sujet Actif & Onglets de Maturité ────────────────── -->
	<div class="p-3.5 bg-muted/30 border-b flex flex-col md:flex-row md:items-center justify-between gap-3">
		<div class="flex items-center gap-2.5 min-w-0">
			<div class="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
				<Sparkles class="h-4 w-4" />
			</div>
			<div class="min-w-0">
				<div class="flex items-center gap-2 flex-wrap">
					<span class="text-xs font-bold text-foreground tracking-tight">
						Sujet ciblé pour le Rendu & l'Homologation
					</span>
					{#if activeSubject}
						<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold {getMaturityBadgeClass(activeSubject.level)}">
							{formatMaturityLevel(activeSubject.level)}
						</span>
					{/if}
				</div>
				{#if activeSubject}
					<p class="text-xs text-muted-foreground truncate font-medium mt-0.5" title="{activeSubject.section_ref} · {activeSubject.name}">
						<span class="font-mono font-bold text-foreground mr-1">{activeSubject.section_ref}</span>
						· {activeSubject.name}
					</p>
				{:else}
					<p class="text-xs text-muted-foreground italic mt-0.5">
						Aucun sujet sélectionné. Choisissez un sujet ci-dessous.
					</p>
				{/if}
			</div>
		</div>

		<!-- Filtre de maturité (L4 pré-filtré par défaut) -->
		<div class="flex items-center gap-1 bg-background border p-1 rounded-lg shrink-0 self-start md:self-auto text-xs">
			<button
				type="button"
				onclick={() => {
					maturityFilter = 'l4_only';
					ensureValidActiveSubject();
				}}
				class="px-2.5 py-1 rounded-md font-semibold text-xs transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 {maturityFilter === 'l4_only'
					? 'bg-emerald-600 text-white shadow-2xs'
					: 'text-muted-foreground hover:text-foreground'}"
				title="Afficher uniquement les sujets L4 spécifiés prêts pour l'homologation"
			>
				<span>🎯 Spécifiés L4</span>
				<span class="px-1.5 py-0.2 rounded-full text-[10px] {maturityFilter === 'l4_only' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}">
					{l4Count}
				</span>
			</button>

			<button
				type="button"
				onclick={() => {
					maturityFilter = 'l3_plus';
					ensureValidActiveSubject();
				}}
				class="px-2.5 py-1 rounded-md font-semibold text-xs transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 {maturityFilter === 'l3_plus'
					? 'bg-primary text-primary-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground'}"
				title="Afficher les sujets tranchés ou spécifiés (L3 et plus)"
			>
				<span>⚖️ Arbitrés L3+</span>
				<span class="px-1.5 py-0.2 rounded-full text-[10px] {maturityFilter === 'l3_plus' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}">
					{l3PlusCount}
				</span>
			</button>

			<button
				type="button"
				onclick={() => {
					maturityFilter = 'all';
					ensureValidActiveSubject();
				}}
				class="px-2.5 py-1 rounded-md font-semibold text-xs transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 {maturityFilter === 'all'
					? 'bg-secondary text-secondary-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground'}"
				title="Afficher tous les sujets d'architecture"
			>
				<span>Tous</span>
				<span class="px-1.5 py-0.2 rounded-full text-[10px] {maturityFilter === 'all' ? 'bg-foreground/10 text-foreground' : 'bg-muted text-muted-foreground'}">
					{allSubjects.length}
				</span>
			</button>
		</div>
	</div>

	<!-- ─── 2. Barre de Sélection par Lots / Parties & Recherche ─────────── -->
	<div class="px-3.5 py-2 bg-muted/15 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
		{#if parts.length > 1}
			<div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
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
					class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer {selectedPartId === 'all'
						? 'bg-primary text-primary-foreground shadow-2xs'
						: 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground border'}"
				>
					<span>Toutes ({allSubjects.length})</span>
				</button>

				{#each parts as part}
					{@const isSelected = selectedPartId === part.id}
					<button
						type="button"
						onclick={() => {
							deliberationStore.setSelectedPartId(part.id);
							ensureValidActiveSubject();
						}}
						class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer {isSelected
							? 'bg-primary text-primary-foreground shadow-2xs ring-1 ring-primary'
							: 'bg-background hover:bg-muted text-foreground border'}"
						title="{part.name} ({part.sectionRange})"
					>
						<span class="font-mono text-[10px] opacity-80">{part.code}</span>
						<span class="truncate max-w-[110px]">{part.name}</span>
						<span class="text-[10px] px-1.5 py-0.2 rounded-full {isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'}">
							{part.subjects.length}
						</span>
					</button>
				{/each}
			</div>
		{/if}

		<!-- Recherche textuelle -->
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

	<!-- ─── 3. Liste / Grille Interactive des Sujets Candidats ─────────────── -->
	<div class="p-3 max-h-56 overflow-y-auto">
		{#if filteredSubjects.length === 0}
			<div class="p-6 text-center text-xs text-muted-foreground space-y-1.5">
				<p class="font-medium">Aucun sujet ne correspond aux critères de filtre actuels.</p>
				{#if maturityFilter === 'l4_only' && l4Count === 0}
					<p class="text-[11px] text-amber-700 dark:text-amber-300">
						💡 Aucun sujet n'a encore atteint le niveau <strong>L4 (Spécifié)</strong>.
						<button
							type="button"
							onclick={() => (maturityFilter = 'l3_plus')}
							class="underline hover:text-foreground font-semibold ml-1 cursor-pointer"
						>
							Afficher les sujets arbitrés L3+
						</button>
					</p>
				{/if}
			</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
				{#each filteredSubjects as sub}
					{@const isActive = sub.id === activeSubjectId}
					<button
						type="button"
						onclick={() => handleSelectSubject(sub.id)}
						class="text-left p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between gap-1.5 {isActive
							? 'bg-primary/10 border-primary ring-2 ring-primary/30 shadow-xs'
							: 'bg-card hover:bg-muted/40 border-border'}"
					>
						<div class="flex items-start justify-between gap-1.5">
							<span class="font-mono text-xs font-bold text-foreground shrink-0 {isActive ? 'text-primary' : ''}">
								{sub.section_ref}
							</span>
							<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold shrink-0 {getMaturityBadgeClass(sub.level)}">
								{formatMaturityLevel(sub.level)}
							</span>
						</div>

						<p class="text-xs font-medium text-foreground line-clamp-2 leading-snug" title="{sub.name}">
							{sub.name}
						</p>

						{#if isActive}
							<div class="flex items-center gap-1 text-[10px] text-primary font-bold mt-0.5">
								<Check class="h-3 w-3" />
								<span>Sélectionné pour le rendu</span>
							</div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
