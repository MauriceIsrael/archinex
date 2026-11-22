<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type {
		Criterion,
		Option,
		OptionEvaluation,
		TradeOff,
		Decision
	} from '$lib/domain/options';
	import type { MaturityTransitionsReport } from '$lib/domain/maturityCriteria';
	import OptionsMatrix from '../OptionsMatrix.svelte';
	import DecisionSurveyCard from '../DecisionSurveyCard.svelte';
	import type { SubjectSessionUser } from './types';

	let {
		projectId,
		subjectId,
		userRole = 'lead_architect',
		sessionUser = null,
		isLoadingMatrix = false,
		criteria = $bindable<Criterion[]>([]),
		options = $bindable<Option[]>([]),
		evaluations = $bindable<OptionEvaluation[]>([]),
		tradeOffs = $bindable<TradeOff[]>([]),
		decision = $bindable<Decision | null>(null),
		singleOptionRationale = undefined,
		effectiveReport = null,
		invokingAgentRole = null,
		onSyncCache = () => {},
		onReloadContext = async () => {},
		onInvokeProposer = () => {}
	}: {
		projectId: string;
		subjectId: string;
		userRole?: string;
		sessionUser?: SubjectSessionUser | null;
		isLoadingMatrix?: boolean;
		criteria: Criterion[];
		options: Option[];
		evaluations: OptionEvaluation[];
		tradeOffs: TradeOff[];
		decision: Decision | null;
		singleOptionRationale?: string | null;
		effectiveReport?: MaturityTransitionsReport | null;
		invokingAgentRole?: string | null;
		onSyncCache?: () => void;
		onReloadContext?: () => Promise<void> | void;
		onInvokeProposer?: () => void;
	} = $props();
</script>

<div class="h-full overflow-y-auto p-4 space-y-5" data-testid="unified-matrix-pane">
	<!-- 1. Matrice Multicritères, Propositions d'Options & Arbitrage Formel L3 -->
	<div class="space-y-3">
		{#if isLoadingMatrix}
			<div class="text-xs font-mono text-muted-foreground animate-pulse">
				Synchronisation de la matrice...
			</div>
		{/if}
		<OptionsMatrix
			{projectId}
			{subjectId}
			bind:criteria
			bind:options
			bind:evaluations
			bind:tradeOffs
			bind:decision
			userRole={deliberationStore.currentRole}
			initialSingleOptionRationale={singleOptionRationale}
			onCriteriaChanged={(newCrit) => {
				criteria = [...newCrit];
				onSyncCache();
			}}
			onOptionsChanged={(newOpts) => {
				options = [...newOpts];
				onSyncCache();
			}}
			onEvaluationsChanged={(newEvals) => {
				evaluations = [...newEvals];
				onSyncCache();
			}}
			onDecisionMade={() => {
				void onReloadContext();
				deliberationStore.refreshSubjectFromServer(subjectId, projectId);
			}}
			{onInvokeProposer}
			isProposing={invokingAgentRole === 'proposer'}
			onError={(msg) => deliberationStore.logNotification(msg, 'warning')}
		/>
	</div>

	<!-- 2. Affirmation Collégiale (K16) & Extraction des Faits Machine-Lisibles (K18) -->
	<div class="pt-4 border-t border-border/60">
		<DecisionSurveyCard
			{projectId}
			{subjectId}
			{decision}
			{options}
			sessionUser={sessionUser
				? { id: sessionUser.id, email: sessionUser.email, role: sessionUser.role || userRole }
				: { id: 'anonymous', email: '', role: userRole }}
			isHubCutover={effectiveReport?.sourceOfRecord === 'hub'}
			onAffirmed={async () => {
				await onReloadContext();
				deliberationStore.logNotification(
					'Décision d’architecture et faits machine-lisibles affirmés !',
					'success'
				);
			}}
		/>
	</div>
</div>
