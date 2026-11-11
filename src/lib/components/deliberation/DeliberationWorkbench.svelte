<script lang="ts">
	import { onMount } from 'svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import SubjectConversationList from './SubjectConversationList.svelte';
	import SubjectThreadView from './SubjectThreadView.svelte';
	import { MessagesSquare, ListFilter, ArrowLeft } from 'lucide-svelte';

	let {
		sessionRole = 'lead_architect',
		sessionUser = null,
		onBackToBoard = () => {}
	}: {
		sessionRole?: string;
		sessionUser?: { id: string; email: string; role: string } | null;
		onBackToBoard?: () => void;
	} = $props();

	type MobileWorkbenchTab = 'list' | 'workspace';
	let mobileTab = $state<MobileWorkbenchTab>('workspace');
	let isSidebarCollapsed = $state(false);
	// Ne monter qu'une seule instance de SubjectThreadView (desktop >= 1024px ou mobile)
	let isDesktop = $state(true);

	onMount(() => {
		const mql = window.matchMedia('(min-width: 1024px)');
		isDesktop = mql.matches;
		const onChange = (e: MediaQueryListEvent) => {
			isDesktop = e.matches;
		};
		mql.addEventListener('change', onChange);
		return () => mql.removeEventListener('change', onChange);
	});

	const activeSubjectId = $derived(deliberationStore.activeSubjectId);
	const projectId = $derived(deliberationStore.activeEngagement?.id || '');

	function handleSelectSubject(id: string) {
		deliberationStore.selectSubject(id);
		mobileTab = 'workspace';
	}

	function toggleSidebar() {
		isSidebarCollapsed = !isSidebarCollapsed;
	}
</script>

<div class="space-y-3">
	{#if !isDesktop}
		<!-- Barre de navigation mobile (< lg) : 2 onglets (Sujets, Espace Sujet Unifié) + Retour tableau -->
		<div class="flex items-center justify-between gap-1.5 bg-muted/60 p-1.5 rounded-lg text-xs">
			<button
				type="button"
				onclick={onBackToBoard}
				class="inline-flex items-center gap-1 py-1.5 px-2 rounded-md font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
			>
				<ArrowLeft class="h-3.5 w-3.5" />
				<span>Tableau</span>
			</button>

			<div class="flex items-center gap-1">
				<button
					type="button"
					onclick={() => (mobileTab = 'list')}
					class="inline-flex items-center gap-1 py-1.5 px-2.5 rounded-md font-semibold transition-all cursor-pointer {mobileTab ===
					'list'
						? 'bg-background text-foreground shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<ListFilter class="h-3.5 w-3.5" />
					<span>Sujets</span>
				</button>

				<button
					type="button"
					onclick={() => (mobileTab = 'workspace')}
					class="inline-flex items-center gap-1 py-1.5 px-2.5 rounded-md font-semibold transition-all cursor-pointer {mobileTab ===
					'workspace'
						? 'bg-background text-foreground shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<MessagesSquare class="h-3.5 w-3.5" />
					<span>Espace Sujet</span>
				</button>
			</div>
		</div>

		<!-- 1. VUE MOBILE (< lg) : Affichage d'un onglet à la fois -->
		<div class="h-[calc(100vh-210px)] min-h-[600px]">
			{#if mobileTab === 'list'}
				<SubjectConversationList
					selectedSubjectId={activeSubjectId}
					{sessionRole}
					onSelectSubject={handleSelectSubject}
					{onBackToBoard}
				/>
			{:else}
				<SubjectThreadView
					subjectId={activeSubjectId}
					{projectId}
					userRole={sessionRole || deliberationStore.currentRole}
					{sessionUser}
					isHumanUser={deliberationStore.isHuman}
					{onBackToBoard}
				/>
			{/if}
		</div>
	{:else}
		<!-- 2. VUE DESKTOP (>= lg) : 2 COLONNES (ARBRE DES SUJETS + ESPACE UNIFIÉ) -->
		<div class="grid grid-cols-12 gap-4 h-[calc(100vh-120px)] min-h-[700px] items-stretch">
			<!-- Colonne 1 (Gauche) : Arbre / Liste des sujets (3-4 cols ou repliée) -->
			{#if !isSidebarCollapsed}
				<div class="col-span-4 xl:col-span-3 h-full overflow-hidden transition-all duration-200">
					<SubjectConversationList
						selectedSubjectId={activeSubjectId}
						{sessionRole}
						isCollapsible={true}
						onToggleCollapse={toggleSidebar}
						onSelectSubject={handleSelectSubject}
						{onBackToBoard}
					/>
				</div>
			{/if}

			<!-- Colonne 2 (Droite unifiée) : Timeline de maturation + Volets unifiés sans doublon (pleine largeur quand replié) -->
			<div class="{isSidebarCollapsed ? 'col-span-12' : 'col-span-8 xl:col-span-9'} h-full min-h-0 overflow-hidden transition-all duration-200">
				<SubjectThreadView
					subjectId={activeSubjectId}
					{projectId}
					userRole={sessionRole || deliberationStore.currentRole}
					{sessionUser}
					isHumanUser={deliberationStore.isHuman}
					{isSidebarCollapsed}
					onToggleSidebar={toggleSidebar}
					{onBackToBoard}
				/>
			</div>
		</div>
	{/if}
</div>
