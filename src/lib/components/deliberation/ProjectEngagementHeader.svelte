<script lang="ts">
	import { deliberationStore, type DeliberationPosture } from '$lib/stores/deliberationStore.svelte';
	import CreateWorkspaceDialog from './CreateWorkspaceDialog.svelte';
	import {
		Building2,
		FileText,
		ShieldCheck,
		BookOpen,
		MessagesSquare,
		CheckCircle2,
		Check,
		FolderPlus,
		FolderKanban,
		Archive,
		RotateCcw
	} from 'lucide-svelte';
	import { page } from '$app/stores';

	let isCreateWorkspaceOpen = $state(false);

	$effect(() => {
		if ($page.data?.session?.user) {
			deliberationStore.setCurrentUser($page.data.session.user);
		}
	});

	const activeEngagement = $derived(deliberationStore.activeEngagement);

	const phases: Array<{
		id: DeliberationPosture;
		number: string;
		label: string;
		subtitle: string;
		icon: typeof BookOpen;
	}> = [
		{
			id: 'appropriation',
			number: 'Phase 1',
			label: 'Appropriation Documentaire',
			subtitle: 'Corpus, Idées clés, Règles induites & Base de connaissances',
			icon: BookOpen
		},
		{
			id: 'deliberation',
			number: 'Phase 2',
			label: 'Délibération Architecturale',
			subtitle: 'Matrice de maturité, Brouillon télégraphique & Arbitrages L3',
			icon: MessagesSquare
		},
		{
			id: 'rendu',
			number: 'Phase 3',
			label: 'Rendu & Homologation',
			subtitle: 'Projections d\'architecture, Modèles systèmes & Sceau SHA-256',
			icon: CheckCircle2
		}
	];
</script>

<div class="space-y-4">
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- 1. BANDEAU SUPÉRIEUR : SÉLECTEUR DE PROJET & SOUVERAINETÉ (TRÈS VISIBLE)  -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="rounded-xl border bg-card p-4 shadow-sm space-y-3">
		<div class="space-y-2">
			<!-- En-tête : Titre & badge souveraineté -->
			<div class="flex items-center gap-2">
				<span class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
					Projet & Engagement Actif :
				</span>
				<span
					class="inline-flex items-center gap-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-semibold"
					title="Garantie de souveraineté : 100% du traitement et des données restent en local sur votre machine"
				>
					<ShieldCheck class="h-3 w-3" />
					100% Local & Souverain
				</span>
			</div>

			<!-- Sélecteur d'engagements avec bouton de création rapide -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
				{#each deliberationStore.engagements as eng}
					{@const isSelected = deliberationStore.activeEngagementId === eng.id}
					{@const isArchived = eng.status === 'archived'}
					<button
						type="button"
						onclick={() => deliberationStore.switchEngagement(eng.id)}
						class="flex items-start gap-2.5 p-2 rounded-lg border text-left transition-all relative {isSelected
							? 'bg-primary/10 border-primary shadow-xs ring-1 ring-primary/30'
							: isArchived
								? 'bg-muted/20 hover:bg-muted/40 border-dashed border-border opacity-60 hover:opacity-100'
								: 'bg-muted/40 hover:bg-muted/70 border-border opacity-75 hover:opacity-100'}"
					>
						<div class="p-1.5 rounded-md {isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'} shrink-0 mt-0.5">
							{#if eng.type === 'generic_blueprint'}
								<Building2 class="h-3.5 w-3.5" />
							{:else}
								<FileText class="h-3.5 w-3.5" />
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-1">
								<strong class="text-xs font-bold truncate text-foreground">
									{eng.title}
								</strong>
								{#if isSelected}
									<Check class="h-3 w-3 text-primary shrink-0" />
								{/if}
							</div>
							<div class="flex items-center gap-1.5 text-[10px] text-muted-foreground line-clamp-1">
								<span>{eng.type === 'generic_blueprint' ? 'Socle Blueprint' : eng.type === 'project_rfp' ? 'Appel d\'Offres RFP' : 'Espace Projet'}</span>
								{#if isArchived}
									<span class="rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 px-1 font-semibold">Archivé</span>
								{/if}
							</div>
						</div>
					</button>
				{/each}

				<!-- Bouton Nouvel Espace Projet -->
				<button
					type="button"
					onclick={() => (isCreateWorkspaceOpen = true)}
					class="flex items-center gap-2 p-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary transition-all text-left cursor-pointer group"
					title="Créer un nouvel espace de travail pour un projet"
				>
					<div class="p-1.5 rounded-md bg-primary/10 group-hover:bg-primary/20 text-primary shrink-0">
						<FolderPlus class="h-3.5 w-3.5" />
					</div>
					<div class="min-w-0 flex-1">
						<strong class="text-xs font-bold block text-primary truncate">
							+ Nouvel Espace
						</strong>
						<span class="text-[10px] text-muted-foreground line-clamp-1 block">
							Cadrer un projet
						</span>
					</div>
				</button>

				<!-- Lien vers la mini-app Espaces & Projets -->
				<a
					href="/workspaces"
					class="flex items-center gap-2 p-2 rounded-lg border bg-muted/40 hover:bg-muted/70 text-foreground transition-all text-left group"
					title="Accéder à la mini-app Espaces & Projets pour gérer, archiver et exporter tous vos projets"
				>
					<div class="p-1.5 rounded-md bg-muted group-hover:bg-background text-muted-foreground group-hover:text-foreground shrink-0">
						<FolderKanban class="h-3.5 w-3.5" />
					</div>
					<div class="min-w-0 flex-1">
						<strong class="text-xs font-bold block truncate">
							Espaces & Projets
						</strong>
						<span class="text-[10px] text-muted-foreground line-clamp-1 block">
							Gérer dans la mini-app →
						</span>
					</div>
				</a>
			</div>
		</div>

		<!-- Alerte si l'espace actif est archivé -->
		{#if activeEngagement.status === 'archived'}
			<div
				class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200 animate-in fade-in duration-150"
			>
				<div class="flex items-center gap-2">
					<Archive class="h-4 w-4 text-amber-600 shrink-0" />
					<span>
						<strong>Espace Archivé</strong> : Le projet « {activeEngagement.title} » est actuellement archivé (lecture & consultation).
						{#if activeEngagement.archivedAt}
							<span class="opacity-80 font-mono text-[11px]"
								>(archivé le {new Date(activeEngagement.archivedAt).toLocaleDateString('fr-FR')})</span
							>
						{/if}
					</span>
				</div>
				<div class="flex items-center gap-2 shrink-0">
					<button
						type="button"
						onclick={() => deliberationStore.unarchiveEngagement(activeEngagement.id)}
						class="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
					>
						<RotateCcw class="h-3.5 w-3.5" />
						<span>Désarchiver le projet</span>
					</button>
					<a
						href="/workspaces"
						class="px-2.5 py-1 rounded-lg border border-amber-500/30 bg-background/60 hover:bg-background text-xs font-semibold transition-colors inline-block"
					>
						Changer d'espace
					</a>
				</div>
			</div>
		{/if}

		<!-- Synthèse concise du projet sélectionné -->
		<div class="pt-2 border-t flex flex-wrap items-center justify-between text-xs text-muted-foreground gap-2">
			<p class="leading-relaxed">
				<strong class="text-foreground">{activeEngagement.badge}</strong> : {activeEngagement.description}
			</p>
			<div class="flex items-center gap-3 shrink-0 font-mono text-[11px]">
				<span><strong>{deliberationStore.corpusDocuments.length}</strong> docs au corpus</span>
				<span>•</span>
				<span><strong>{deliberationStore.subjects.length}</strong> sections</span>
				<span>•</span>
				<span><strong>{deliberationStore.statements.length}</strong> énoncés</span>
			</div>
		</div>
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- 2. LES 3 GRANDS ONGLETS DU PROJET (SÉPARATION HERMÉTIQUE DES 3 PHASES)     -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="grid grid-cols-1 md:grid-cols-3 gap-2 p-1.5 rounded-xl border bg-muted/30">
		{#each phases as phase}
			{@const isActive = deliberationStore.activePosture === phase.id}
			{@const Icon = phase.icon}
			<button
				type="button"
				onclick={() => deliberationStore.setPosture(phase.id)}
				class="flex items-start gap-3 p-3 rounded-lg text-left transition-all relative {isActive
					? 'bg-card text-foreground shadow-sm border border-primary/40 ring-1 ring-primary/20'
					: 'hover:bg-card/60 text-muted-foreground hover:text-foreground border border-transparent'}"
			>
				<div class="p-2 rounded-lg {isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'} shrink-0 mt-0.5">
					<Icon class="h-4 w-4" />
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-center justify-between gap-1">
						<span class="text-[10px] font-bold uppercase tracking-wider font-mono {isActive ? 'text-primary' : 'text-muted-foreground'}">
							{phase.number}
						</span>
						{#if phase.id === 'appropriation'}
							<span class="font-mono text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
								{deliberationStore.corpusDocuments.length} docs
							</span>
						{:else if phase.id === 'deliberation'}
							<span class="font-mono text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
								{deliberationStore.subjects.length} sections
							</span>
						{:else}
							<span class="font-mono text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
								{Object.keys(deliberationStore.frozenSnapshots).length} scellés
							</span>
						{/if}
					</div>
					<h3 class="text-xs font-bold text-foreground truncate mt-0.5">
						{phase.label}
					</h3>
					<p class="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
						{phase.subtitle}
					</p>
				</div>
			</button>
		{/each}
	</div>

	<!-- Modale Interactive de Création d'un Nouvel Espace de Travail -->
	<CreateWorkspaceDialog
		bind:open={isCreateWorkspaceOpen}
		onclose={() => (isCreateWorkspaceOpen = false)}
	/>
</div>
