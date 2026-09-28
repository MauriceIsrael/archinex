<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { EngagementProfile } from '$lib/domain/engagements';
	import { goto } from '$app/navigation';
	import CreateWorkspaceDialog from '$lib/components/deliberation/CreateWorkspaceDialog.svelte';
	import WorkspaceManagerDialog from '$lib/components/deliberation/WorkspaceManagerDialog.svelte';
	import {
		FolderPlus,
		FolderKanban,
		Building2,
		FileText,
		ShieldCheck,
		ArrowRight,
		BookOpen,
		Layers,
		CheckCircle2,
		Users,
		Sparkles,
		Clock,
		Target,
		Compass,
		Archive,
		RotateCcw,
		Trash2,
		Download
	} from 'lucide-svelte';

	let isCreateModalOpen = $state(false);
	let isWorkspaceManagerOpen = $state(false);

	type FilterTab = 'all' | 'active' | 'archived';
	let currentFilter = $state<FilterTab>('all');

	const displayedEngagements = $derived.by(() => {
		if (currentFilter === 'active') return deliberationStore.activeEngagements;
		if (currentFilter === 'archived') return deliberationStore.archivedEngagements;
		return deliberationStore.engagements;
	});

	function openInWorkbench(id: string) {
		deliberationStore.switchEngagement(id);
		goto('/deliberation');
	}

	function handleArchive(eng: EngagementProfile) {
		deliberationStore.archiveEngagement(eng.id);
	}

	function handleUnarchive(eng: EngagementProfile) {
		deliberationStore.unarchiveEngagement(eng.id);
	}

	function handleDelete(eng: EngagementProfile) {
		if (deliberationStore.engagements.length <= 1) {
			alert('Impossible de supprimer le dernier espace de travail disponible.');
			return;
		}

		const confirmMsg = `Êtes-vous certain de vouloir supprimer définitivement le projet "${eng.title}" ?\n\nToutes ses controverses locales et matrices de maturité spécifiques seront effacées.\n(Les documents versés dans la base commune restent préservés).`;
		if (!confirm(confirmMsg)) return;

		deliberationStore.deleteEngagement(eng.id);
	}

	function handleExport(eng: EngagementProfile) {
		const jsonStr = deliberationStore.exportWorkspaceJSON(eng.id);
		const blob = new Blob([jsonStr], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `archinex-workspace-${eng.id}-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>Archinex · Espaces de Travail & Contextes de Réflexion</title>
</svelte:head>

<div class="space-y-6 max-w-7xl mx-auto">
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- EN-TÊTE PRINCIPAL : HUBS DES PROJETS & ACTIONS DE GESTION                 -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
		<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
			<div class="space-y-1">
				<div class="flex items-center gap-2.5">
					<div class="p-2.5 rounded-xl bg-primary text-primary-foreground shadow-xs">
						<Compass class="h-6 w-6" />
					</div>
					<div>
						<h1 class="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
							Espaces de Travail & Contextes de Réflexion
						</h1>
						<p class="text-xs sm:text-sm text-muted-foreground mt-0.5">
							Gestion des projets d'architecture, cadrage stratégique et délibération dialectique
						</p>
					</div>
				</div>
			</div>

			<!-- Barre d'actions : Gérer les projets, Nouveau projet, Création rapide -->
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onclick={() => (isWorkspaceManagerOpen = true)}
					class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs shadow-xs transition-colors cursor-pointer"
					title="Gérer les projets (archiver, désarchiver, supprimer, exporter)"
				>
					<FolderKanban class="h-4 w-4" />
					<span>Gérer les Projets</span>
				</button>

				<a
					href="/workspaces/new"
					class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs shadow-xs transition-colors"
				>
					<FolderPlus class="h-4 w-4" />
					<span>Nouvel Espace Projet</span>
				</a>

				<button
					type="button"
					onclick={() => (isCreateModalOpen = true)}
					class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-muted/40 hover:bg-muted font-semibold text-xs transition-colors cursor-pointer"
				>
					<span>Création Rapide</span>
				</button>
			</div>
		</div>

		<!-- Invariant Fondamental : Base de Connaissance Partagée -->
		<div class="p-4 rounded-xl border bg-emerald-500/10 border-emerald-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
			<div class="flex items-start gap-3">
				<ShieldCheck class="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
				<div class="space-y-0.5">
					<h3 class="text-xs font-bold text-emerald-900 dark:text-emerald-200">
						Invariant Épistémique · Patrimoine de Connaissances Commun & Invariant
					</h3>
					<p class="text-xs text-muted-foreground leading-relaxed">
						Chaque espace de travail isole ses sujets et arbitrages, mais <strong>la base de connaissances reste commune et valide de facto</strong>. Tout standard ou document amont apporté enrichit l'ensemble des projets.
					</p>
				</div>
			</div>

			<div class="flex items-center gap-3 shrink-0 font-mono text-xs text-emerald-900 dark:text-emerald-200">
				<div class="bg-background/80 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-center">
					<strong class="text-sm font-bold block">{deliberationStore.commonKnowledgeBase.length}</strong>
					<span class="text-[10px] text-muted-foreground">Documents au socle</span>
				</div>
				<div class="bg-background/80 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-center">
					<strong class="text-sm font-bold block">{deliberationStore.engagements.length}</strong>
					<span class="text-[10px] text-muted-foreground">Espaces totaux</span>
				</div>
			</div>
		</div>
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- LISTE DES ESPACES DE TRAVAIL (GRILLE DES PROJETS)                         -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="space-y-3">
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
			<div class="flex items-center gap-2">
				<h2 class="text-sm font-bold uppercase tracking-wider text-muted-foreground font-mono">
					Projets & Engagements
				</h2>
				<span class="text-xs px-2 py-0.5 rounded-full bg-muted font-mono font-semibold text-muted-foreground">
					{displayedEngagements.length}
				</span>
			</div>

			<!-- Onglets de filtrage : Tous, Actifs, Archivés -->
			<div class="inline-flex items-center p-1 rounded-xl bg-muted/60 border border-border text-xs">
				<button
					type="button"
					onclick={() => (currentFilter = 'all')}
					class="px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer {currentFilter === 'all'
						? 'bg-background text-foreground shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Tous ({deliberationStore.engagements.length})
				</button>
				<button
					type="button"
					onclick={() => (currentFilter = 'active')}
					class="px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer {currentFilter === 'active'
						? 'bg-background text-foreground shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Actifs ({deliberationStore.activeEngagements.length})
				</button>
				<button
					type="button"
					onclick={() => (currentFilter = 'archived')}
					class="px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer {currentFilter === 'archived'
						? 'bg-background text-foreground shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Archivés ({deliberationStore.archivedEngagements.length})
				</button>
			</div>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each displayedEngagements as eng}
				{@const isActive = deliberationStore.activeEngagementId === eng.id}
				{@const isArchived = eng.status === 'archived'}
				<div class="rounded-xl border bg-card p-5 flex flex-col justify-between space-y-4 shadow-2xs hover:shadow-sm transition-all {isActive ? 'border-primary ring-2 ring-primary/20' : isArchived ? 'opacity-75 border-dashed border-border hover:opacity-100' : 'border-border'}">
					<div class="space-y-3">
						<!-- En-tête de carte -->
						<div class="flex items-start justify-between gap-2">
							<div class="flex items-center gap-1.5 flex-wrap">
								<span class="text-[10px] font-bold font-mono px-2 py-0.5 rounded uppercase tracking-wider {eng.type === 'project_rfp' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30' : 'bg-primary/10 text-primary border border-primary/25'}">
									{eng.type === 'project_rfp' ? 'Appel d\'Offres (RFP)' : eng.type === 'generic_blueprint' ? 'Socle Blueprint' : 'Espace Projet'}
								</span>
								{#if isArchived}
									<span class="text-[10px] font-bold font-mono px-2 py-0.5 rounded uppercase tracking-wider bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
										Archivé
									</span>
								{/if}
							</div>

							{#if isActive}
								<span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full shrink-0">
									<CheckCircle2 class="h-3 w-3" />
									Actif en séance
								</span>
							{/if}
						</div>

						<!-- Titre & Description -->
						<div>
							<h3 class="text-sm font-bold text-foreground line-clamp-1">
								{eng.title}
							</h3>
							<p class="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
								{eng.description}
							</p>
						</div>

						<!-- Objectifs Stratégiques si présents -->
						{#if eng.strategy?.objectives && eng.strategy.objectives.length > 0}
							<div class="space-y-1 pt-2 border-t text-[11px]">
								<span class="font-semibold text-muted-foreground block text-[10px] uppercase font-mono">
									Stratégie Clé :
								</span>
								<ul class="space-y-0.5 text-muted-foreground">
									{#each eng.strategy.objectives.slice(0, 2) as obj}
										<li class="line-clamp-1 flex items-center gap-1.5">
											<span class="text-primary font-bold">•</span>
											<span>{obj}</span>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>

					<!-- Métriques & Bouton d'accès + Actions de gestion rapide -->
					<div class="pt-3 border-t space-y-3">
						<div class="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
							<span><strong>{eng.subjects.length}</strong> sections</span>
							<span>•</span>
							<span><strong>{eng.corpusDocuments.length}</strong> docs</span>
							<span>•</span>
							<span><strong>{eng.statements.length}</strong> énoncés</span>
						</div>

						<div class="flex items-center gap-2">
							<button
								type="button"
								onclick={() => openInWorkbench(eng.id)}
								class="flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-bold text-xs transition-colors cursor-pointer {isActive ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted hover:bg-muted/80 text-foreground'}"
							>
								<span>{isActive ? 'Reprendre la Délibération' : 'Ouvrir cet Espace'}</span>
								<ArrowRight class="h-3.5 w-3.5" />
							</button>

							<!-- Boutons d'actions rapides sur chaque carte projet -->
							<button
								type="button"
								onclick={() => handleExport(eng)}
								class="p-2 rounded-lg border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
								title="Exporter le projet en JSON"
							>
								<Download class="h-3.5 w-3.5" />
							</button>

							{#if isArchived}
								<button
									type="button"
									onclick={() => handleUnarchive(eng)}
									class="p-2 rounded-lg border bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30 transition-colors cursor-pointer"
									title="Désarchiver et réactiver ce projet"
								>
									<RotateCcw class="h-3.5 w-3.5" />
								</button>
							{:else}
								<button
									type="button"
									onclick={() => handleArchive(eng)}
									class="p-2 rounded-lg border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
									title="Archiver ce projet"
								>
									<Archive class="h-3.5 w-3.5" />
								</button>
							{/if}

							<button
								type="button"
								onclick={() => handleDelete(eng)}
								class="p-2 rounded-lg border bg-background hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
								title="Supprimer définitivement ce projet"
							>
								<Trash2 class="h-3.5 w-3.5" />
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>

<CreateWorkspaceDialog bind:open={isCreateModalOpen} onclose={() => (isCreateModalOpen = false)} />

<WorkspaceManagerDialog
	bind:open={isWorkspaceManagerOpen}
	onclose={() => (isWorkspaceManagerOpen = false)}
	onOpenCreateWorkspace={() => (isCreateModalOpen = true)}
/>
