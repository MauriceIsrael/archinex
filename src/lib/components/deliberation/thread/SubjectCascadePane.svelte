<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { CascadeResult, DiscoveryTreeData } from '$lib/domain/cascade';
	import CascadeQuestionsCard from '../CascadeQuestionsCard.svelte';
	import DiscoveryTreeView from '../DiscoveryTreeView.svelte';
	import ProjectRulesPanel from '../ProjectRulesPanel.svelte';
	import { GitFork } from 'lucide-svelte';

	let {
		projectId,
		subjectId,
		cascadeResult = null,
		discoveryTree = null,
		treeSeries = [],
		isLoadingTree = false,
		isProposingAnglesMorts = false,
		onReloadContext = async () => {},
		onOpenMatrix = () => {},
		onProposeAnglesMorts = async () => {},
		onRefreshTree = () => {}
	}: {
		projectId: string;
		subjectId: string;
		cascadeResult?: CascadeResult | null;
		discoveryTree?: DiscoveryTreeData | null;
		treeSeries?: any[];
		isLoadingTree?: boolean;
		isProposingAnglesMorts?: boolean;
		onReloadContext?: () => Promise<void> | void;
		onOpenMatrix?: () => void;
		onProposeAnglesMorts?: () => Promise<void> | void;
		onRefreshTree?: () => void;
	} = $props();
</script>

<div class="h-full overflow-y-auto p-4 space-y-5 text-xs" data-testid="unified-cascade-pane">
	<!-- 1. Questions en cascade générées post-décision (A28) -->
	{#if cascadeResult && cascadeResult.questions && cascadeResult.questions.length > 0}
		<CascadeQuestionsCard
			{projectId}
			{subjectId}
			cascade={cascadeResult}
			onNavigateToChild={(childId) => {
				deliberationStore.selectSubject(childId);
			}}
			onQuestionUpdated={async () => {
				await onReloadContext();
			}}
		/>
	{/if}

	<!-- 2. Arbre de découverte (Généalogie cascade) & Règles du projet -->
	<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
		<div class="space-y-3 rounded-xl border bg-card/50 p-3.5" data-testid="dossier-discovery-tree">
			<div class="flex items-center justify-between pb-2 border-b text-foreground font-bold">
				<span class="flex items-center gap-1.5">
					<GitFork class="h-4 w-4 text-primary" />
					<span>Arbre de découverte (Parents → Décision → Enfants)</span>
				</span>
			</div>
			<DiscoveryTreeView
				{discoveryTree}
				{treeSeries}
				isLoading={isLoadingTree}
				{isProposingAnglesMorts}
				onSelectSubject={(targetSubjectId) => {
					deliberationStore.selectSubject(targetSubjectId);
				}}
				{onOpenMatrix}
				onProposeAnglesMorts={onProposeAnglesMorts}
			/>
		</div>

		<div class="space-y-3 rounded-xl border bg-card/50 p-3.5" data-testid="dossier-project-rules">
			<ProjectRulesPanel
				{projectId}
				{subjectId}
				onRuleChanged={onRefreshTree}
			/>
		</div>
	</div>
</div>
