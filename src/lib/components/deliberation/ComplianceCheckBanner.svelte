<script lang="ts">
	import { ShieldCheck, ShieldAlert, WifiOff, AlertTriangle, RefreshCw } from 'lucide-svelte';
	import type { ComplianceCheckStatus } from '$lib/domain/options';

	export interface UiComplianceViolation {
		optionId: string;
		typedId: string;
		message: string;
		validated: boolean;
		matchedTerms?: string[];
	}

	export interface UiCompliancePayload {
		frameworks: string[];
		offline: boolean;
		violations: UiComplianceViolation[];
		unassessedCount: number;
		unassessedRuleIds?: string[];
		hubRevision?: string | null;
		checkedAt?: string;
		checkStatus?: ComplianceCheckStatus;
		coverageWarnings?: string[];
	}

	let {
		compliance = null as UiCompliancePayload | null,
		loading = false,
		selectedOptionId = '',
		violationJustifications = $bindable<Record<string, string>>({}),
		derogationAcknowledged = $bindable(false),
		derogationReason = $bindable('')
	} = $props<{
		compliance?: UiCompliancePayload | null;
		loading?: boolean;
		selectedOptionId?: string;
		violationJustifications?: Record<string, string>;
		derogationAcknowledged?: boolean;
		derogationReason?: string;
	}>();

	const effectiveStatus = $derived<ComplianceCheckStatus | 'loading'>(
		loading
			? 'loading'
			: !compliance || compliance.offline || compliance.checkStatus === 'not_checked'
				? 'not_checked'
				: compliance.checkStatus === 'partial' ||
					  (compliance.unassessedRuleIds?.length ?? 0) > 0 ||
					  compliance.unassessedCount > 0
					? 'partial'
					: 'checked'
	);

	const optionViolations = $derived(
		(compliance?.violations ?? []).filter((v: UiComplianceViolation) => !selectedOptionId || v.optionId === selectedOptionId)
	);
	const unassessedRuleIds = $derived(compliance?.unassessedRuleIds ?? []);
</script>

<div class="space-y-2.5 text-xs" data-testid="compliance-check-banner" data-check-status={effectiveStatus}>
	{#if effectiveStatus === 'loading'}
		<div class="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5 text-muted-foreground">
			<RefreshCw class="h-3.5 w-3.5 animate-spin shrink-0" />
			<span>Vérification réglementaire auprès du Hub KB en cours…</span>
		</div>
	{:else if effectiveStatus === 'not_checked'}
		<div class="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 space-y-2.5" data-testid="kb-status-offline">
			<div class="flex items-start gap-2 text-rose-700 dark:text-rose-300">
				<WifiOff class="h-4 w-4 shrink-0 mt-0.5" />
				<div class="space-y-0.5">
					<p class="font-bold">Hub KB non connecté — vérification réglementaire non effectuée</p>
					<p class="text-[11px] text-rose-700/90 dark:text-rose-200/90">
						L'absence d'alerte ne signifie pas que l'option est conforme : le contrôle réglementaire n'a pas pu être exécuté.
						L'arbitrage est bloqué par défaut sauf dérogation explicite motivée (tracée comme <strong>Provisional</strong> dans la matrice de conformité et le dossier).
					</p>
				</div>
			</div>

			<div class="space-y-1.5 pt-1 border-t border-rose-500/20">
				<label class="flex items-start gap-2 cursor-pointer text-foreground font-medium">
					<input
						type="checkbox"
						bind:checked={derogationAcknowledged}
						class="mt-0.5 rounded border-rose-500 text-rose-600 focus:ring-rose-500"
						data-testid="kb-derogation-checkbox"
					/>
					<span>Dérogation explicite : décider sans vérification KB complète</span>
				</label>
				{#if derogationAcknowledged}
					<textarea
						bind:value={derogationReason}
						rows={2}
						placeholder="Motif obligatoire de la dérogation (ex. urgence calendaire, vérification manuelle effectuée sur le référentiel — min. 5 caractères)…"
						class="w-full rounded-md border border-rose-500/40 bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-rose-500"
						data-testid="kb-derogation-reason"
					></textarea>
				{/if}
			</div>
		</div>
	{:else if effectiveStatus === 'partial'}
		<div class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2.5" data-testid="kb-status-partial">
			<div class="flex items-start gap-2 text-amber-800 dark:text-amber-200">
				<AlertTriangle class="h-4 w-4 shrink-0 mt-0.5" />
				<div class="space-y-0.5">
					<p class="font-bold">
						Vérification KB incomplète ({unassessedRuleIds.length || compliance?.unassessedCount || 0} règle(s) non évaluée(s))
					</p>
					<p class="text-[11px] text-amber-800/90 dark:text-amber-200/90">
						Certaines règles applicables n'ont pas pu être évaluées automatiquement par le Hub KB.
						{#if unassessedRuleIds.length > 0}
							Règles concernées : <span class="font-mono font-semibold">{unassessedRuleIds.join(', ')}</span>.
						{/if}
						Une dérogation explicite motivée est requise pour trancher (statut <strong>Provisional</strong> dans la matrice de conformité).
					</p>
				</div>
			</div>

			<div class="space-y-1.5 pt-1 border-t border-amber-500/20">
				<label class="flex items-start gap-2 cursor-pointer text-foreground font-medium">
					<input
						type="checkbox"
						bind:checked={derogationAcknowledged}
						class="mt-0.5 rounded border-amber-500 text-amber-600 focus:ring-amber-500"
						data-testid="kb-derogation-checkbox"
					/>
					<span>Dérogation explicite : décider sans vérification KB complète</span>
				</label>
				{#if derogationAcknowledged}
					<textarea
						bind:value={derogationReason}
						rows={2}
						placeholder="Motif obligatoire de la dérogation / justification de revue manuelle des règles non évaluées (min. 5 caractères)…"
						class="w-full rounded-md border border-amber-500/40 bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
						data-testid="kb-derogation-reason"
					></textarea>
				{/if}
			</div>
		</div>
	{:else if optionViolations.length === 0}
		<div class="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-700 dark:text-emerald-300" data-testid="kb-status-checked">
			<div class="flex items-center gap-2">
				<ShieldCheck class="h-4 w-4 shrink-0" />
				<span class="font-semibold">Hub KB connecté — aucune violation détectée sur l'option sélectionnée</span>
			</div>
			{#if compliance?.frameworks?.length || compliance?.hubRevision}
				<span class="text-[10px] font-mono text-emerald-700/80 dark:text-emerald-300/80">
					{#if compliance?.frameworks?.length}{compliance.frameworks.join(', ')}{/if}
					{#if compliance?.hubRevision} · rev {compliance.hubRevision}{/if}
				</span>
			{/if}
		</div>
	{/if}

	{#each compliance?.coverageWarnings ?? [] as warning (warning)}
		<p class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-200" data-testid="coverage-warning">
			{warning}
		</p>
	{/each}

	{#if optionViolations.length > 0}
		<div class="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5" data-testid="decision-violations">
			<p class="font-bold text-foreground flex items-center gap-1.5">
				<ShieldAlert class="h-3.5 w-3.5 text-destructive" />
				<span>Non-conformités détectées sur l'option sélectionnée</span>
			</p>
			{#each optionViolations as v (v.typedId)}
				<div class="space-y-1">
					<div class="space-y-0.5">
						<p><span class="font-mono font-bold">{v.typedId}</span> — {v.message}</p>
						{#if v.matchedTerms && v.matchedTerms.length > 0}
							<p class="text-[11px] text-destructive/90 font-medium">
								• Termes détectés : <span class="font-mono bg-destructive/10 px-1 py-0.5 rounded">{v.matchedTerms.join(', ')}</span>
							</p>
						{/if}
					</div>
					{#if v.validated}
						<textarea
							bind:value={violationJustifications[v.typedId]}
							rows={2}
							placeholder="Écart accepté : justifiez pourquoi l'option reste retenue malgré cette non-conformité (obligatoire pour trancher)…"
							class="w-full rounded-md border bg-background px-2 py-1 text-xs"
						></textarea>
					{:else}
						<p class="text-[11px] text-amber-700 dark:text-amber-300">Règle encore en brouillon : alerte à vérifier, elle n'empêche pas de trancher.</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
