<script lang="ts">
	import type { MaturityLevel } from '$lib/types/epistemic';
	import {
		getMilestoneContextualActions,
		type MaturityCriterion,
		type MaturityTransitionsReport,
		type MilestoneContextualAction,
		type TransitionCheck
	} from '$lib/domain/maturityCriteria';
	import { formatMaturityLevel } from '$lib/domain/debate';
	import { explainActionRefusal } from '$lib/domain/spaceActor';
	import {
		Check,
		Lock,
		AlertCircle,
		ChevronDown,
		ChevronUp,
		ShieldAlert,
		Sparkles,
		ArrowRight,
		Database,
		ClockAlert,
		Split,
		Target
	} from 'lucide-svelte';

	let {
		report = null,
		userRole = 'lead_architect',
		isHumanUser = true,
		onAction = () => {},
		onContextualAction = () => {},
		onTransition = () => {}
	}: {
		report: MaturityTransitionsReport | null;
		userRole?: string;
		isHumanUser?: boolean;
		onAction?: (criterion: MaturityCriterion) => void;
		onContextualAction?: (action: MilestoneContextualAction) => void;
		onTransition?: (targetLevel: MaturityLevel) => void;
	} = $props();

	const STEPS: Array<{ level: MaturityLevel; label: string; short: string; locked: boolean; lockRole?: string }> = [
		{ level: 'L0_named', label: 'Nommé', short: 'L0', locked: false },
		{ level: 'L1_framed', label: 'Cadré', short: 'L1', locked: false },
		{ level: 'L2_decomposed', label: 'Décomposé', short: 'L2', locked: false },
		{ level: 'L3_decided', label: 'Décidé', short: 'L3', locked: true, lockRole: 'Décideur distinct (K16)' },
		{ level: 'L4_specified', label: 'Spécifié', short: 'L4', locked: true, lockRole: 'Lead Architect' },
		{ level: 'L5_archived', label: 'Archivé', short: 'L5', locked: true, lockRole: 'Lead Architect' }
	];

	// Toujours ouvert par défaut sur le prochain jalon à franchir
	let isDetailsExpanded = $state(true);
	let inspectedLevel = $state<MaturityLevel | null>(null);

	const activeLevel = $derived(report?.displayedLevel || 'L0_named');
	const activeIndex = $derived(STEPS.findIndex((s) => s.level === activeLevel));

	// Réinitialiser l'inspection manuelle quand le niveau actif change pour pointer sur le prochain jalon
	let previousActiveLevel = $state<MaturityLevel | null>(null);
	$effect(() => {
		if (activeLevel !== previousActiveLevel) {
			previousActiveLevel = activeLevel;
			inspectedLevel = null;
		}
	});

	// Niveau inspecté : par défaut la prochaine transition à franchir
	const targetStep = $derived.by(() => {
		if (inspectedLevel) {
			return STEPS.find((s) => s.level === inspectedLevel) || null;
		}
		const next = report?.nextTransition;
		if (next) {
			return STEPS.find((s) => s.level === next.targetLevel) || null;
		}
		return STEPS[Math.min(activeIndex + 1, STEPS.length - 1)];
	});

	const targetTransition = $derived.by<TransitionCheck | null>(() => {
		if (!report || !targetStep) return null;
		return report.transitions[targetStep.level] || null;
	});

	const contextualActions = $derived.by<MilestoneContextualAction[]>(() => {
		if (!targetStep) return [];
		return getMilestoneContextualActions(targetStep.level);
	});

	const satisfiedCriteriaCount = $derived(
		targetTransition ? targetTransition.criteria.filter((c) => c.satisfied).length : 0
	);
	const totalCriteriaCount = $derived(targetTransition ? targetTransition.criteria.length : 0);

	const isLeadRole = $derived(
		userRole === 'lead_architect' || userRole === 'Lead Architect' || userRole === 'admin'
	);
	const requiresLead = $derived(
		targetStep?.level === 'L4_specified' || targetStep?.level === 'L5_archived'
	);

	function handleStepClick(level: MaturityLevel) {
		inspectedLevel = level;
		isDetailsExpanded = true;
	}

	function triggerContextualAction(act: MilestoneContextualAction) {
		onContextualAction(act);
	}
</script>

<div class="border-b bg-card/60 px-3.5 py-2.5 space-y-2.5" data-testid="maturity-stepper">
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- 1. TIMELINE HORIZONTALE : L0 -> L1 -> L2 -> L3🔒 -> L4🔒 -> L5🔒        -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="flex items-center justify-between gap-2 flex-wrap">
		<nav class="flex items-center gap-1 overflow-x-auto py-0.5 text-xs" aria-label="Jalons de maturité">
			{#each STEPS as step, idx}
				{@const isPast = idx < activeIndex}
				{@const isCurrent = idx === activeIndex}
				{@const isNextTarget = idx === activeIndex + 1}
				{@const isInspected = targetStep?.level === step.level}

				<button
					type="button"
					data-testid={`milestone-step-${step.short}`}
					onclick={() => handleStepClick(step.level)}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all cursor-pointer whitespace-nowrap {isCurrent
						? isInspected
							? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/50 border border-blue-600'
							: 'bg-blue-600/90 text-white border border-blue-600'
						: isPast
							? isInspected
								? 'bg-emerald-600 text-white ring-2 ring-emerald-500/40 border border-emerald-600'
								: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20'
							: isInspected
								? 'bg-amber-500/20 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/40 border border-amber-500/50 shadow-2xs'
								: isNextTarget
									? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20'
									: 'bg-muted/40 text-muted-foreground border border-border/40 hover:bg-muted/70'}"
					title={step.locked ? `Jalon ${step.short} (${step.label}) · Verrouillé : ${step.lockRole}` : `Inspecter les critères et actions du jalon ${step.short} (${step.label})`}
				>
					<!-- Pastille / Statut -->
					{#if isPast}
						<Check class="h-3.5 w-3.5 stroke-[3] {isInspected ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}" />
					{:else if isCurrent}
						<span class="inline-block h-2 w-2 rounded-full bg-white animate-pulse"></span>
					{:else if isNextTarget}
						<Target class="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
					{:else if step.locked}
						<Lock class="h-3 w-3 text-muted-foreground" />
					{/if}

					<span>{step.short} · {step.label}</span>

					{#if step.locked && !isPast}
						<span class="text-[9px] opacity-75 font-mono">🔒</span>
					{/if}
				</button>

				{#if idx < STEPS.length - 1}
					<span class="text-muted-foreground/40 text-xs px-0.5 select-none">→</span>
				{/if}
			{/each}
		</nav>

		<!-- ═════════════════════════════════════════════════════════════════════ -->
		<!-- 2. SOURCE OF TRUTH (HUB vs LOCAL) & JAUGE DE CONVERGENCE            -->
		<!-- ═════════════════════════════════════════════════════════════════════ -->
		<div class="flex items-center gap-2 text-xs">
			{#if report?.sourceOfRecord === 'hub'}
				<span
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-[10px] font-bold"
					title="Maturité opposable issue du Knowledge Hub (SoR)"
					data-testid="sor-hub-badge"
				>
					<Database class="h-3 w-3" />
					<span>Hub · {formatMaturityLevel(report.displayedLevel)}</span>
				</span>
			{:else}
				<span
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-muted-foreground border text-[10px] font-semibold"
					title="Maturité de travail locale"
				>
					<span>Local · {formatMaturityLevel(activeLevel)}</span>
				</span>
			{/if}

			{#if report?.convergence}
				{@const conv = report.convergence}
				<div
					class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-card border text-[10px] font-mono font-bold"
					title={`${conv.supportsCount} soutiens, ${conv.resolvedObjectionsCount} objections résolues, ${conv.openObjectionsCount} objection(s) ouverte(s)`}
					data-testid="convergence-gauge"
				>
					<span class="text-muted-foreground">Convergence :</span>
					<div class="w-12 h-1.5 rounded-full bg-muted overflow-hidden flex">
						<div
							class="h-full {conv.ratioPercent >= 80 ? 'bg-emerald-500' : conv.ratioPercent >= 50 ? 'bg-amber-500' : 'bg-rose-500'} transition-all"
							style={`width: ${conv.ratioPercent}%`}
						></div>
					</div>
					<span class="{conv.ratioPercent >= 80 ? 'text-emerald-600' : conv.ratioPercent >= 50 ? 'text-amber-600' : 'text-rose-600'}">
						{conv.ratioPercent}%
					</span>
				</div>
			{/if}

			<button
				type="button"
				onclick={() => (isDetailsExpanded = !isDetailsExpanded)}
				class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
				title="Afficher ou replier les critères et actions du jalon"
			>
				<span>{isDetailsExpanded ? 'Masquer' : 'Critères & Actions'}</span>
				{#if isDetailsExpanded}
					<ChevronUp class="h-3 w-3" />
				{:else}
					<ChevronDown class="h-3 w-3" />
				{/if}
			</button>
		</div>
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- 3. BANNIÈRE DE STAGNATION (is_stalled) & PROPOSITION DE DÉCOUPAGE       -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{#if report?.suggestDecomposition}
		<div
			class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 flex items-center justify-between gap-2 text-xs shadow-2xs"
			data-testid="stagnation-banner"
		>
			<div class="flex items-center gap-2">
				<ClockAlert class="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
				<div>
					<strong class="text-amber-900 dark:text-amber-200">
						Stagnation détectée ({report.stallDays} jours sans convergence) :
					</strong>
					<span class="text-amber-800 dark:text-amber-300 ml-1">
						{report.relanceMessage}
					</span>
				</div>
			</div>

			<button
				type="button"
				onclick={() =>
					onAction({
						id: 'split_stalled_subject',
						label: 'Découper le sujet',
						description: 'Diviser ce sujet en 2 sous-sujets',
						satisfied: false,
						actionLabel: 'Découper en 2 sous-sujets',
						actionType: 'derive_subjects'
					})}
				class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition-colors shrink-0 cursor-pointer"
			>
				<Split class="h-3.5 w-3.5" />
				<span>Découper le sujet</span>
			</button>
		</div>
	{/if}

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- 4. BANDEAU CONTEXTUEL DU JALON : CRITÈRES EN HAUT & ACTIONS D'ASSISTANCE  -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{#if isDetailsExpanded && targetStep && targetTransition}
		<div
			class="p-2.5 rounded-xl border bg-muted/20 space-y-2.5 text-xs"
			data-testid="maturity-criteria-panel"
		>
			<!-- Ligne supérieure : Jalon inspecté + compteur + bouton de franchissement -->
			<div class="flex items-center justify-between gap-2 flex-wrap">
				<div class="flex items-center gap-2 flex-wrap">
					<span class="font-bold text-foreground">
						{#if targetStep.level === 'L0_named'}
							Jalon initial {targetStep.short} ({targetStep.label}) · Identification du sujet
						{:else}
							Critères de passage vers {targetStep.short} ({targetStep.label})
						{/if}
					</span>

					{#if totalCriteriaCount > 0}
						<span
							class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border {satisfiedCriteriaCount === totalCriteriaCount
								? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
								: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30'}"
						>
							{satisfiedCriteriaCount}/{totalCriteriaCount} critères remplis
						</span>
					{/if}

					{#if targetStep.locked}
						<span class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
							🔒 {targetStep.lockRole}
						</span>
					{/if}
				</div>

				{#if targetStep.level !== 'L0_named'}
					{#if targetTransition.allowed}
						<button
							type="button"
							onclick={() => targetStep && onTransition(targetStep.level)}
							class="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
						>
							<span>Franchir le jalon {targetStep.short}</span>
							<ArrowRight class="h-3 w-3" />
						</button>
					{:else}
						<div class="flex items-center gap-2 flex-wrap">
							<span class="text-[11px] text-destructive font-semibold">
								{targetTransition.missingReasons.length} critère(s) non satisfait(s)
							</span>
							{#if isHumanUser}
								{#if requiresLead && !isLeadRole}
									<div
										class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-destructive/10 text-destructive text-[11px] font-medium border border-destructive/25"
										title={explainActionRefusal('homologate', userRole, { targetLevel: targetStep.short })}
									>
										<ShieldAlert class="h-3.5 w-3.5 shrink-0" />
										<span>Homologation réservée au Lead Architect</span>
									</div>
								{:else}
									<button
										type="button"
										onclick={() => targetStep && onTransition(targetStep.level)}
										class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
										title="L'architecte humain valide le passage au jalon supérieur par autorité d'arbitrage souverain"
									>
										<span>Franchir le jalon {targetStep.short} (Arbitrage humain)</span>
										<ArrowRight class="h-3 w-3" />
									</button>
								{/if}
							{/if}
						</div>
					{/if}
				{/if}
			</div>

			<!-- Grille horizontale compacte des critères du jalon -->
			{#if targetTransition.criteria.length > 0}
				<div class="grid grid-cols-1 md:grid-cols-3 gap-2">
					{#each targetTransition.criteria as crit}
						<div
							class="flex flex-col justify-between gap-1.5 p-2 rounded-lg border {crit.satisfied
								? 'bg-emerald-500/5 border-emerald-500/25 text-emerald-900 dark:text-emerald-200'
								: 'bg-destructive/5 border-destructive/25 text-foreground'}"
						>
							<div class="flex items-start gap-2 min-w-0">
								{#if crit.satisfied}
									<Check class="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
								{:else}
									<AlertCircle class="h-4 w-4 text-destructive shrink-0 mt-0.5" />
								{/if}

								<div class="min-w-0 flex-1">
									<div class="font-semibold text-xs leading-tight">
										{crit.label}
									</div>
									<p class="text-[11px] text-muted-foreground line-clamp-1 mt-0.5" title={crit.description}>
										{crit.description}
									</p>
								</div>
							</div>

							{#if !crit.satisfied}
								<div class="flex items-center justify-between gap-1.5 pt-1 border-t border-border/40">
									{#if crit.unblockRole}
										<span class="text-[10px] text-muted-foreground truncate">
											{crit.unblockRole}
										</span>
									{:else}
										<span></span>
									{/if}
									<button
										type="button"
										onclick={() => onAction(crit)}
										class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold transition-colors cursor-pointer shrink-0"
										title={`Action : ${crit.actionLabel}`}
									>
										<span>{crit.actionLabel}</span>
										<ArrowRight class="h-3 w-3" />
									</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<!-- Barre d'actions d'assistance contextualisées au jalon inspecté -->
			{#if contextualActions.length > 0}
				<div
					class="flex items-center justify-between gap-2 pt-2 border-t border-border/50 flex-wrap"
					data-testid="milestone-contextual-actions"
				>
					<div class="flex items-center gap-1.5 flex-wrap">
						<span class="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 mr-1">
							<Sparkles class="h-3 w-3 text-primary" />
							<span>Actions pour {targetStep.short} :</span>
						</span>

						{#each contextualActions as act (act.id)}
							<button
								type="button"
								data-testid={`contextual-action-${act.id}`}
								onclick={() => triggerContextualAction(act)}
								class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs {act.kind === 'agent'
									? 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-800 dark:text-purple-300 border border-purple-500/30'
									: act.kind === 'workspace'
										? 'bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25'
										: 'bg-background hover:bg-muted text-foreground border border-border'}"
								title={act.description}
							>
								<span>{act.label}</span>
							</button>
						{/each}
					</div>

					{#if !targetTransition.allowed && targetTransition.unblockHint}
						<span class="text-[10px] text-muted-foreground font-mono">
							ℹ️ {targetTransition.unblockHint}
						</span>
					{/if}
				</div>
			{/if}

			{#if requiresLead && !isLeadRole}
				<div class="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
					<ShieldAlert class="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
					<div class="space-y-0.5">
						<strong>Homologation bloquée :</strong>
						<p class="text-[11px] text-amber-800 dark:text-amber-300">
							{explainActionRefusal('homologate', userRole, { targetLevel: targetStep.short })}
						</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
