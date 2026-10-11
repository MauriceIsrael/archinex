<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import SubjectConversationList from './SubjectConversationList.svelte';
	import SubjectThreadView from './SubjectThreadView.svelte';
	import SubjectDossierView from './SubjectDossierView.svelte';
	import { MessagesSquare, ListFilter, ArrowLeft, FolderOpen } from 'lucide-svelte';
	import type { Argument } from '$lib/domain/debate';

	let {
		sessionRole = 'lead_architect',
		onBackToBoard = () => {}
	}: {
		sessionRole?: string;
		onBackToBoard?: () => void;
	} = $props();

	type MobileWorkbenchTab = 'list' | 'thread' | 'dossier';
	let mobileTab = $state<MobileWorkbenchTab>('thread');
	// Dossier du sujet : options, critères, évaluations et décision (ouvert par défaut sur grand écran)
	let isDossierOpen = $state(true);
	const toggleDossier = () => (isDossierOpen = !isDossierOpen);

	// Décision formelle demandée (raccourci de l'interface) : ouvrir le dossier du sujet sur la matrice.
	$effect(() => {
		if (deliberationStore.pendingDecisionSubjectId) {
			isDossierOpen = true;
			mobileTab = 'dossier';
			deliberationStore.pendingDecisionSubjectId = null;
		}
	});

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

			<button
				type="button"
				onclick={() => (mobileTab = 'dossier')}
				class="inline-flex items-center gap-1 py-1.5 px-2.5 rounded-md font-semibold transition-all cursor-pointer {mobileTab ===
				'dossier'
					? 'bg-background text-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				<FolderOpen class="h-3.5 w-3.5" />
				<span>Dossier</span>
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
		{:else if mobileTab === 'dossier'}
			<SubjectDossierView subjectId={activeSubjectId} {projectId} isOpen={true} onClose={() => (mobileTab = 'thread')} />
		{:else}
			<SubjectThreadView
				subjectId={activeSubjectId}
				{projectId}
				userRole={sessionRole || deliberationStore.currentRole}
				isHumanUser={deliberationStore.isHuman}
				isDossierOpen={false}
				onToggleDossier={() => (mobileTab = 'dossier')}
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

		<!-- Colonne 2 : fil de délibération ; colonne 3 (optionnelle) : dossier du sujet -->
		<div class="{isDossierOpen ? 'col-span-4 xl:col-span-5' : 'col-span-8 xl:col-span-9'} h-full overflow-hidden transition-all duration-200 flex flex-col gap-2">
			<div class="flex justify-end">
				<button
					type="button"
					data-testid="btn-toggle-dossier"
					onclick={toggleDossier}
					class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer"
				>
					<FolderOpen class="h-3.5 w-3.5" />
					<span>{isDossierOpen ? 'Masquer le dossier' : 'Dossier : options, critères, décision'}</span>
				</button>
			</div>
			<div class="flex-1 min-h-0 overflow-hidden">
				<SubjectThreadView
					subjectId={activeSubjectId}
					{projectId}
					userRole={sessionRole || deliberationStore.currentRole}
					isHumanUser={deliberationStore.isHuman}
					{isDossierOpen}
					onToggleDossier={toggleDossier}
					{onBackToBoard}
				/>
			</div>
		</div>
		{#if isDossierOpen}
			<div class="col-span-4 xl:col-span-4 h-full overflow-hidden">
				<SubjectDossierView subjectId={activeSubjectId} {projectId} isOpen={true} onClose={() => (isDossierOpen = false)} />
			</div>
		{/if}
	</div>
</div>
