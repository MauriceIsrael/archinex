<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import SubjectConversationList from './SubjectConversationList.svelte';
	import SubjectThreadView from './SubjectThreadView.svelte';
	import { MessagesSquare, ListFilter, ArrowLeft } from 'lucide-svelte';
	import type { Argument } from '$lib/domain/debate';

	let {
		sessionRole = 'lead_architect',
		onBackToBoard = () => {}
	}: {
		sessionRole?: string;
		onBackToBoard?: () => void;
	} = $props();

	type MobileWorkbenchTab = 'list' | 'thread';
	let mobileTab = $state<MobileWorkbenchTab>('thread');

	const activeSubject = $derived(deliberationStore.activeSubject);
	const activeSubjectId = $derived(deliberationStore.activeSubjectId);
	const projectId = $derived(deliberationStore.activeEngagement?.id || '');

	function handleSelectSubject(id: string) {
		deliberationStore.selectSubject(id);
		mobileTab = 'thread';
	}
</script>

<div class="space-y-3">
	<!-- Barre de navigation mobile (< lg) : 3 onglets (Sujets, Fil, Dossier) + Retour tableau -->
	<div class="lg:hidden flex items-center justify-between gap-1.5 bg-muted/60 p-1.5 rounded-lg text-xs">
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
				onclick={() => (mobileTab = 'thread')}
				class="inline-flex items-center gap-1 py-1.5 px-2.5 rounded-md font-semibold transition-all cursor-pointer {mobileTab ===
				'thread'
					? 'bg-background text-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				<MessagesSquare class="h-3.5 w-3.5" />
				<span>Fil</span>
			</button>
		</div>
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- 1. VUE MOBILE (< lg) : Affichage d'un onglet à la fois                    -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="block lg:hidden h-[calc(100vh-210px)] min-h-[600px]">
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
				isHumanUser={deliberationStore.isHuman}
				{onBackToBoard}
			/>
		{/if}
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- 2. VUE DESKTOP (>= lg) : DISPOSITION EN 2 COLONNES (SUJETS + FIL PUR)       -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="hidden lg:grid grid-cols-12 gap-4 h-[calc(100vh-120px)] min-h-[700px] items-stretch">
		<!-- Colonne 1 (Gauche) : Liste des conversations de sujets (3.5 cols) -->
		<div class="col-span-4 xl:col-span-3 h-full overflow-hidden">
			<SubjectConversationList
				selectedSubjectId={activeSubjectId}
				{sessionRole}
				onSelectSubject={handleSelectSubject}
				{onBackToBoard}
			/>
		</div>

		<!-- Colonne 2 (Centre & Droite) : Fil de délibération intégral (8.5 cols) -->
		<div class="col-span-8 xl:col-span-9 h-full overflow-hidden transition-all duration-200">
			<SubjectThreadView
				subjectId={activeSubjectId}
				{projectId}
				userRole={sessionRole || deliberationStore.currentRole}
				isHumanUser={deliberationStore.isHuman}
				{onBackToBoard}
			/>
		</div>
	</div>
</div>
