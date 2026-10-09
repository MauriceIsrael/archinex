<script lang="ts">
	import type { MaturityLevel } from '$lib/types/epistemic';
	import type {
		MaturityCriterion,
		MaturityTransitionsReport,
		TransitionCheck
	} from '$lib/domain/maturityCriteria';
	import { formatMaturityLevel } from '$lib/domain/debate';
	import {
		Check,
		Lock,
		Unlock,
		AlertCircle,
		ChevronDown,
		ChevronUp,
		ShieldAlert,
		Sparkles,
		Layers,
		ArrowRight,
		Database,
		ClockAlert,
		Split
	} from 'lucide-svelte';

	let {
		report = null,
		userRole = 'lead_architect',
		isHumanUser = true,
		onAction = () => {},
		onTransition = () => {}
	}: {
		report: MaturityTransitionsReport | null;
		userRole?: string;
		isHumanUser?: boolean;
		onAction?: (criterion: MaturityCriterion) => void;
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

	let isDetailsExpanded = $state(true);
	let inspectedLevel = $state<MaturityLevel | null>(null);

	const activeLevel = $derived(report?.displayedLevel || 'L0_named');
	const activeIndex = $derived(STEPS.findIndex((s) => s.level === activeLevel));

	// Niveau inspecté : par défaut la prochaine transition
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

	function handleStepClick(level: MaturityLevel) {
		inspectedLevel = level;
		isDetailsExpanded = true;
	}
</script>

<div class="border-b bg-card/60 px-3 py-2 space-y-2" data-testid="maturity-stepper">
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- 1. BARRE STEPPER : L0 -> L1 -> L2 -> L3🔒 -> L4🔒 -> L5                 -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="flex items-center justify-between gap-2 flex-wrap">
		<nav class="flex items-center gap-1 overflow-x-auto py-0.5 text-xs" aria-label="Jalons de maturité">
			{#each STEPS as step, idx}
				{@const isPast = idx < activeIndex}
				{@const isCurrent = idx === activeIndex}
				{@const isFuture = idx > activeIndex}
				{@const isInspected = targetStep?.level === step.level}
				{@const transition = report?.transitions[step.level]}
				{@const isAllowed = transition ? transition.allowed : false}

				<button
					type="button"
					onclick={() => handleStepClick(step.level)}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all cursor-pointer whitespace-nowrap {isCurrent
						? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/40 border border-blue-600'
						: isPast
							? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20'
							: isInspected
								? 'bg-muted text-foreground border border-primary/50'
								: 'bg-muted/40 text-muted-foreground border border-border/40 hover:bg-muted/70'}"
					title={step.locked ? `Verrouillé : ${step.lockRole}` : `Étape ${step.label}`}
				>
					<!-- Pastille / Statut -->
					{#if isPast}
						<Check class="h-3.5 w-3.5 stroke-[3] text-emerald-600 dark:text-emerald-400" />
					{:else if isCurrent}
						<span class="inline-block h-2 w-2 rounded-full bg-white animate-pulse"></span>
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
			<!-- Indicateur Source of Truth -->
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

			<!-- Jauge de convergence -->
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

			<!-- Bouton déplier détails des critères -->
			<button
				type="button"
				onclick={() => (isDetailsExpanded = !isDetailsExpanded)}
				class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
				title="Afficher le détail des critères et blocages"
			>
				<span>{isDetailsExpanded ? 'Masquer' : 'Critères'}</span>
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
	<!-- 4. VOLET DÉTAILLÉ : « Pourquoi je ne peux pas avancer » & CRITÈRES        -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	{#if isDetailsExpanded && targetTransition}
		<div
			class="p-3 rounded-lg border bg-muted/20 space-y-3 text-xs"
			data-testid="maturity-criteria-panel"
		>
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<span class="font-bold text-foreground">
						Critères de passage vers {targetStep?.short} ({targetStep?.label})
					</span>
					{#if targetStep?.locked}
						<span class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
							🔒 {targetStep.lockRole}
						</span>
					{/if}
				</div>

				{#if targetTransition.allowed}
					<button
						type="button"
						onclick={() => targetStep && onTransition(targetStep.level)}
						class="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
					>
						<span>Franchir le jalon {targetStep?.short}</span>
						<ArrowRight class="h-3 w-3" />
					</button>
				{:else}
					<div class="flex items-center gap-2 flex-wrap">
						<span class="text-[11px] text-destructive font-semibold">
							{targetTransition.missingReasons.length} critère(s) non satisfait(s)
						</span>
						{#if isHumanUser}
							<button
								type="button"
								onclick={() => targetStep && onTransition(targetStep.level)}
								class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
								title="L'architecte humain valide le passage au jalon supérieur par autorité d'arbitrage souverain"
							>
								<span>Franchir le jalon {targetStep?.short} (Arbitrage humain)</span>
								<ArrowRight class="h-3 w-3" />
							</button>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Liste des critères cochés / manquants -->
			<div class="space-y-1.5">
				{#each targetTransition.criteria as crit}
					<div
						class="flex items-center justify-between gap-2 p-2 rounded-md border {crit.satisfied
							? 'bg-emerald-500/5 border-emerald-500/25 text-emerald-900 dark:text-emerald-200'
							: 'bg-destructive/5 border-destructive/25 text-foreground'}"
					>
						<div class="flex items-center gap-2 min-w-0">
							{#if crit.satisfied}
								<Check class="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
							{:else}
								<AlertCircle class="h-4 w-4 text-destructive shrink-0" />
							{/if}

							<div class="truncate">
								<div class="font-semibold text-xs leading-tight flex items-center gap-2">
									<span>{crit.label}</span>
									{#if !crit.satisfied && crit.unblockRole}
										<span class="text-[10px] text-muted-foreground font-normal">
											(Déblocage : {crit.unblockRole})
										</span>
									{/if}
								</div>
								<p class="text-[11px] text-muted-foreground line-clamp-1">
									{crit.description}
								</p>
							</div>
						</div>

						{#if !crit.satisfied}
							<div class="flex items-center gap-1.5 shrink-0">
								{#if isHumanUser}
									<button
										type="button"
										onclick={() => (crit.satisfied = true)}
										class="inline-flex items-center gap-1 px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold transition-colors cursor-pointer"
										title="Considérer ce critère comme déjà satisfait par décision d'architecte"
									>
										<Check class="h-3 w-3" />
										<span>Valider</span>
									</button>
								{/if}
								<button
									type="button"
									onclick={() => onAction(crit)}
									class="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold transition-colors cursor-pointer"
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

			<!-- Explication en clair du refus de transition -->
			{#if !targetTransition.allowed && targetTransition.unblockHint}
				<div class="p-2 rounded bg-muted/60 text-[11px] text-muted-foreground flex items-center justify-between">
					<span>ℹ️ {targetTransition.unblockHint}</span>
					<span class="font-mono text-[10px]">canTransitionMaturity refusé</span>
				</div>
			{/if}
		</div>
	{/if}
</div>
