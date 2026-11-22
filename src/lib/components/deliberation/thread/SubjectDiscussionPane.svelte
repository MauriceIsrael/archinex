<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { Argument, ArgumentResolution, Stance, ResumeSummary } from '$lib/domain/debate';
	import { formatMaturityMilestoneSeparator } from '$lib/domain/debate';
	import type { Decision, Option } from '$lib/domain/options';
	import SubjectMessageBubble from '../SubjectMessageBubble.svelte';
	import PinnedObjections from '../PinnedObjections.svelte';
	import StructuredComposer from '../StructuredComposer.svelte';
	import SubjectProblemCard from '../SubjectProblemCard.svelte';
	import SubjectRequirementsDrawer, {
		type SubjectRequirementItem
	} from '../SubjectRequirementsDrawer.svelte';
	import type { SubjectSessionUser } from './types';
	import {
		AlertTriangle,
		ArrowDown,
		Bot,
		Clock,
		Database,
		Gavel,
		Sparkles,
		X
	} from 'lucide-svelte';

	let {
		projectId,
		subjectId,
		activeSubject = null,
		activeDraft = null,
		userRole = 'lead_architect',
		isHumanUser = true,
		sessionUser = null,
		argumentsList = [],
		displayedArguments = [],
		openObjections = [],
		totalObjectionsCount = 0,
		subjectOptions = [],
		subjectDecision = null,
		subjectRequirements = [],
		requirementsUnresolvedRefs = [],
		requirementsDossierPresent = true,
		allowedKbRefs = [],
		resumeSummary = null,
		foundationContested = false,
		contestationReason = undefined,
		isLoadingArguments = false,
		invokingAgentRole = null,
		isForceEditingQuestion = false,
		postureFilter = $bindable<Stance | 'all'>('all'),
		selectedComposerOptionId = $bindable<string>(''),
		replyingTo = $bindable<Argument | null>(null),
		onDismissResumeBanner = () => {},
		onScrollToNextObjection = () => {},
		onInvokeAgent = (_role: 'challenger' | 'proposer' | 'verifier' | 'synthesizer') => {},
		onOpenSplitDialog = () => {},
		onUpdateDraftQuestion = (_q: string) => {},
		onUpdateDraftHypothesis = (_h: string) => {},
		onAdoptHypothesis = () => {},
		onSelectOptionForDiscussion = (_opt: any) => {},
		onArbitrateOption = (_opt?: any) => {},
		onResolveArgument = async (_arg: Argument, _res: ArgumentResolution) => {},
		onChallengeArgument = (_arg: Argument) => {},
		onArgumentCreated = (_created: Argument, _triggered?: Argument[]) => {},
		onOpenMatrix = (_scrollToCapitalization?: boolean) => {}
	}: {
		projectId: string;
		subjectId: string;
		activeSubject?: any;
		activeDraft?: any;
		userRole?: string;
		isHumanUser?: boolean;
		sessionUser?: SubjectSessionUser | null;
		argumentsList?: Argument[];
		displayedArguments?: Argument[];
		openObjections?: Argument[];
		totalObjectionsCount?: number;
		subjectOptions?: Option[];
		subjectDecision?: Decision | null;
		subjectRequirements?: SubjectRequirementItem[];
		requirementsUnresolvedRefs?: string[];
		requirementsDossierPresent?: boolean;
		allowedKbRefs?: string[];
		resumeSummary?: ResumeSummary | null;
		foundationContested?: boolean;
		contestationReason?: string;
		isLoadingArguments?: boolean;
		invokingAgentRole?: string | null;
		isForceEditingQuestion?: boolean;
		postureFilter: Stance | 'all';
		selectedComposerOptionId: string;
		replyingTo: Argument | null;
		onDismissResumeBanner?: () => void;
		onScrollToNextObjection?: () => void;
		onInvokeAgent?: (role: 'challenger' | 'proposer' | 'verifier' | 'synthesizer') => void;
		onOpenSplitDialog?: () => void;
		onUpdateDraftQuestion?: (q: string) => void;
		onUpdateDraftHypothesis?: (h: string) => void;
		onAdoptHypothesis?: () => void;
		onSelectOptionForDiscussion?: (opt: any) => void;
		onArbitrateOption?: (opt?: any) => void;
		onResolveArgument?: (arg: Argument, resolution: ArgumentResolution) => Promise<void> | void;
		onChallengeArgument?: (arg: Argument) => void;
		onArgumentCreated?: (created: Argument, triggered?: Argument[]) => void;
		onOpenMatrix?: (scrollToCapitalization?: boolean) => void;
	} = $props();
</script>

<div class="flex flex-col h-full min-h-0">
	<!-- Barre de filtre rapide du fil -->
	<div class="px-4 py-2 border-b bg-muted/10 flex items-center justify-between gap-2 flex-wrap text-xs shrink-0">
		<div class="flex items-center gap-1 text-[11px]">
			<span class="text-muted-foreground font-medium mr-1">Filtrer le fil :</span>
			<button
				type="button"
				onclick={() => (postureFilter = 'all')}
				class="px-2 py-0.5 rounded font-medium cursor-pointer {postureFilter === 'all'
					? 'bg-primary text-primary-foreground font-semibold'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				Tous ({argumentsList.length})
			</button>
			<button
				type="button"
				onclick={() => (postureFilter = 'objection')}
				class="px-2 py-0.5 rounded font-medium cursor-pointer {postureFilter === 'objection'
					? 'bg-rose-600 text-white font-semibold'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				Objections ({totalObjectionsCount})
			</button>
			<button
				type="button"
				onclick={() => (postureFilter = 'synthesis')}
				class="px-2 py-0.5 rounded font-medium cursor-pointer {postureFilter === 'synthesis'
					? 'bg-indigo-600 text-white font-semibold'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				Synthèses ({argumentsList.filter((a) => a.stance === 'synthesis').length})
			</button>
		</div>

		{#if openObjections.length > 0}
			<button
				type="button"
				onclick={onScrollToNextObjection}
				class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25 hover:bg-rose-500/20 text-[10px] font-bold transition-colors cursor-pointer"
				title="Scroller vers la prochaine objection non résolue"
			>
				<ArrowDown class="h-3 w-3" />
				<span>Prochaine objection ↓</span>
			</button>
		{/if}
	</div>

	<!-- Corps scrollable du fil -->
	<div class="flex-1 overflow-y-auto p-4 space-y-3.5">
		{#if activeSubject && (activeSubject.nature || activeSubject.depends_on_subject_ids?.length)}
			<div class="flex flex-wrap items-center gap-2 text-[11px]">
				{#if activeSubject.nature && activeSubject.nature !== 'architecture'}
					<span class="px-2 py-0.5 rounded-full font-bold border bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20">
						{activeSubject.nature === 'contractuel' ? 'Sujet contractuel' : 'Sujet organisationnel'}
					</span>
				{/if}
				{#if activeSubject.depends_on_subject_ids?.length}
					<span class="text-muted-foreground"><strong>À trancher après :</strong></span>
					{#each activeSubject.depends_on_subject_ids as depId (depId)}
						{@const dep = deliberationStore.activeEngagement?.subjects.find((s) => s.id === depId)}
						<button
							type="button"
							onclick={() => deliberationStore.selectSubject(depId)}
							class="px-2 py-0.5 rounded-md border hover:bg-muted/40 cursor-pointer {dep && ['L3_decided', 'L4_specified', 'L5_archived'].includes(dep.level) ? 'text-emerald-700 dark:text-emerald-300 border-emerald-500/30' : 'text-amber-700 dark:text-amber-300 border-amber-500/30'}"
						>
							{dep?.name ?? depId}
						</button>
					{/each}
				{/if}
			</div>
		{/if}

		<!-- Bandeau Cadrage compact -->
		{#if activeSubject}
			<SubjectProblemCard
				subject={activeSubject}
				draft={activeDraft}
				options={subjectOptions}
				isInvokingAgent={invokingAgentRole !== null}
				onInvokeProposer={() => onInvokeAgent('proposer')}
				onSplit={onOpenSplitDialog}
				onUpdateQuestion={onUpdateDraftQuestion}
				onUpdateHypothesis={onUpdateDraftHypothesis}
				onAdoptHypothesis={onAdoptHypothesis}
				onSelectOption={onSelectOptionForDiscussion}
				onArbitrateOption={onArbitrateOption}
				{isForceEditingQuestion}
			/>
			<SubjectRequirementsDrawer
				requirements={subjectRequirements}
				unresolvedRefs={requirementsUnresolvedRefs}
				dossierPresent={requirementsDossierPresent}
				isLoading={isLoadingArguments}
			/>
		{/if}

		{#if resumeSummary}
			<div class="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 flex items-center justify-between gap-3 text-xs shadow-2xs">
				<div class="flex items-center gap-2">
					<Clock class="h-4 w-4 text-blue-600 shrink-0" />
					<div>
						<strong class="text-blue-900 dark:text-blue-200">Résumé de reprise :</strong>
						<span class="text-blue-800 dark:text-blue-300 ml-1">{resumeSummary.summaryText}</span>
					</div>
				</div>
				<button
					type="button"
					onclick={onDismissResumeBanner}
					class="p-1 text-blue-700 hover:text-blue-950 dark:hover:text-blue-100 transition-colors cursor-pointer"
					title="Masquer le résumé"
				>
					<X class="h-3.5 w-3.5" />
				</button>
			</div>
		{/if}

		{#if foundationContested}
			<div
				class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start gap-3 text-xs shadow-2xs"
				data-testid="foundation-contested-banner"
			>
				<AlertTriangle class="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
				<div class="space-y-1">
					<h4 class="font-bold text-rose-900 dark:text-rose-200">
						⚠️ Fondement du sujet remis en cause
					</h4>
					<p class="text-rose-800 dark:text-rose-300 leading-relaxed">
						{contestationReason ||
							'La décision parente ayant engendré ce sujet a été modifiée ou remplacée. Le périmètre de cette délibération doit être réévalué.'}
					</p>
				</div>
			</div>
		{/if}

		{#if openObjections.length > 0}
			<PinnedObjections
				objections={openObjections}
				{userRole}
				{isHumanUser}
				currentUserId={sessionUser?.id}
				currentUserName={sessionUser?.name || sessionUser?.email}
				onResolve={onResolveArgument}
			/>
		{/if}

		{#if activeSubject}
			<div class="flex items-center justify-center my-2">
				<span class="px-3 py-1 rounded-full bg-muted/80 text-[11px] font-mono font-medium text-muted-foreground border border-border/60">
					{formatMaturityMilestoneSeparator(activeSubject.level)}
				</span>
			</div>
		{/if}

		<!-- Bannière synthétique de décision actée -->
		{#if subjectDecision}
			{@const retainedOpt = subjectOptions.find((o) => o.id === subjectDecision?.retainedOptionId)}
			<div class="rounded-xl border-2 border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-card p-3 flex items-center justify-between gap-3 shadow-2xs">
				<div class="flex items-center gap-2.5">
					<div class="p-2 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
						<Gavel class="h-4 w-4" />
					</div>
					<div>
						<div class="flex items-center gap-2">
							<span class="text-xs font-bold text-foreground">Décision d'architecture actée</span>
							<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
								L3 · Décidé
							</span>
						</div>
						<p class="text-xs text-muted-foreground mt-0.5">
							Option retenue : <strong class="text-foreground">{retainedOpt?.title || subjectDecision.retainedOptionId}</strong>
							{#if (subjectDecision as any).validatedBy} · Affirmée par <strong>{(subjectDecision as any).validatedBy}</strong>{/if}
						</p>
					</div>
				</div>

				<div class="flex items-center gap-2 shrink-0">
					<button
						type="button"
						data-testid="thread-banner-kb-candidates-btn"
						onclick={() => onOpenMatrix(true)}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
						title="Préparer et transmettre les candidats de capitalisation au Knowledge Hub"
					>
						<Database class="h-3.5 w-3.5" />
						<span>Capitaliser</span>
					</button>

					<button
						type="button"
						onclick={() => onOpenMatrix(false)}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/35 bg-background text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
					>
						<span>Matrice & Faits →</span>
					</button>
				</div>
			</div>
		{/if}

		<!-- Liste des messages -->
		{#if isLoadingArguments}
			<div class="p-8 text-center text-xs text-muted-foreground animate-pulse">
				Chargement de la conversation...
			</div>
		{:else if argumentsList.length === 0}
			<div class="p-6 text-center border-2 border-dashed rounded-xl space-y-3 bg-muted/5 max-w-lg mx-auto my-4">
				<div class="p-2.5 rounded-full bg-primary/10 text-primary w-fit mx-auto">
					<Sparkles class="h-5 w-5" />
				</div>
				<div class="space-y-1">
					<h4 class="text-sm font-bold text-foreground">Délibération ouverte</h4>
					<p class="text-xs text-muted-foreground leading-relaxed">
						Initiez le débat ci-dessous ou utilisez les actions contextualisées du jalon en haut de l'écran.
					</p>
				</div>
			</div>
		{:else if displayedArguments.length === 0}
			<div class="p-8 text-center border-2 border-dashed rounded-xl space-y-2 bg-muted/10">
				<Bot class="h-8 w-8 text-muted-foreground/60 mx-auto" />
				<h4 class="text-xs font-bold text-foreground">Aucun argument affiché pour ce filtre</h4>
				<p class="text-xs text-muted-foreground max-w-sm mx-auto">
					Basculez sur « Tous » pour afficher l'ensemble des échanges ({argumentsList.length} arguments).
				</p>
			</div>
		{:else}
			{#each displayedArguments as arg (arg.id)}
				{@const targetArg = arg.targetArgumentId
					? argumentsList.find((a) => a.id === arg.targetArgumentId) || null
					: null}

				<SubjectMessageBubble
					argument={arg}
					targetArgument={targetArg}
					{userRole}
					{isHumanUser}
					{sessionUser}
					onResolve={onResolveArgument}
					onChallenge={onChallengeArgument}
					onArbitrateOption={onArbitrateOption}
					onSplit={onOpenSplitDialog}
					onReply={(target) => {
						replyingTo = target;
						const composerElem = document.getElementById('compose-claim');
						composerElem?.focus();
					}}
				/>
			{/each}

			{#if !subjectDecision && argumentsList.length > 0}
				<div class="rounded-xl border border-dashed border-primary/30 bg-muted/10 p-3 flex items-center justify-between gap-3 text-xs mt-2 flex-wrap">
					<div class="flex items-center gap-2 text-muted-foreground">
						<Sparkles class="h-4 w-4 text-primary shrink-0" />
						<span>Prêt à évaluer les alternatives ou trancher la décision ?</span>
					</div>
					<div class="flex items-center gap-2">
						<button
							type="button"
							onclick={() => onInvokeAgent('synthesizer')}
							disabled={invokingAgentRole !== null}
							class="px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/25 hover:bg-purple-500/20 text-[11px] font-semibold transition-colors cursor-pointer"
						>
							⚖️ @synthesizer
						</button>
						<button
							type="button"
							onclick={() => onOpenMatrix(false)}
							class="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 transition-colors cursor-pointer shadow-2xs"
						>
							Ouvrir Matrice & Arbitrer →
						</button>
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Composeur structuré épinglé en bas du fil -->
	<div class="p-3 border-t bg-muted/20 shrink-0">
		<StructuredComposer
			{subjectId}
			{projectId}
			options={subjectOptions}
			bind:selectedOptionId={selectedComposerOptionId}
			{allowedKbRefs}
			{replyingTo}
			{sessionUser}
			onCancelReply={() => (replyingTo = null)}
			onArgumentCreated={onArgumentCreated}
			onError={(msg) => deliberationStore.logNotification(msg, 'warning')}
		/>
	</div>
</div>
