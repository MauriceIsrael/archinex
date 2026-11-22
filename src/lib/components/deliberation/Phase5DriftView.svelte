<script lang="ts">
	import {
		AlertTriangle,
		CheckCircle2,
		Clock,
		ExternalLink,
		HelpCircle,
		RefreshCw,
		Settings2,
		ShieldAlert,
		ShieldCheck,
		FileWarning,
		CircleDashed
	} from 'lucide-svelte';
	import type { ProjectDriftOverview } from '$lib/server/edp/driftOverviewService';
	import { formatDurationFr, formatRelativeAgeFr } from '$lib/domain/edp/driftMetrics';
	import type { RealizationState } from '$lib/domain/edp/realizationStatus';

	interface Props {
		projectId: string;
		initialOverview?: ProjectDriftOverview | null;
	}

	let { projectId, initialOverview = null }: Props = $props();

	let overview = $state<ProjectDriftOverview | null>(null);
	let loading = $state(false);
	let reconciling = $state(false);
	let loadError = $state<string | null>(null);
	let actionNotice = $state<string | null>(null);

	let includeResolved = $state(false);
	let severityFilter = $state<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
	let outOfDecisionOnly = $state(false);
	let realizationFilter = $state<'all' | RealizationState>('all');

	let showConfig = $state(false);
	let configEnabled = $state(true);
	let configIntervalMinutes = $state(5);
	let configStaleMinutes = $state(15);
	let savingConfig = $state(false);

	const effectiveOverview = $derived(overview ?? initialOverview);

	function syncConfigFromOverview(data: ProjectDriftOverview | null) {
		if (!data) return;
		configEnabled = data.reconciliation.enabled;
		configIntervalMinutes = Math.max(1, Math.round(data.reconciliation.intervalSeconds / 60));
		configStaleMinutes = Math.max(1, Math.round(data.reconciliation.staleThresholdSeconds / 60));
	}

	async function loadOverview() {
		if (!projectId) return;
		loading = true;
		loadError = null;
		try {
			const res = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/drift?includeResolved=${includeResolved}`
			);
			const data = await res.json();
			if (!res.ok || data.status === 'error') {
				loadError = data.error || 'Impossible de charger la vue Dérive.';
			} else {
				overview = data;
				syncConfigFromOverview(data);
			}
		} catch (err: any) {
			loadError = err?.message || 'Erreur réseau lors du chargement de la dérive.';
		} finally {
			loading = false;
		}
	}

	async function handleReconcileNow() {
		if (!projectId || reconciling) return;
		reconciling = true;
		actionNotice = null;
		loadError = null;
		try {
			const res = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/drift/reconcile`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				}
			);
			const data = await res.json();
			if (!res.ok || data.status === 'error') {
				loadError = data.error || 'Échec de la réconciliation.';
			} else {
				if (data.overview) {
					overview = data.overview;
					syncConfigFromOverview(data.overview);
				}
				if (data.run?.skipped && data.run?.reason === 'locked') {
					actionNotice = 'Une réconciliation est déjà en cours pour ce projet.';
				} else if (data.run?.status === 'unverified') {
					actionNotice =
						'Nautobot injoignable : état maintenu à « Non vérifié » (dernière réconciliation réussie conservée).';
				} else {
					actionNotice = `Réconciliation terminée : ${data.run?.openFindingsCount ?? 0} écart(s) ouvert(s), ${data.run?.resolvedFindingsCount ?? 0} résolu(s).`;
				}
			}
		} catch (err: any) {
			loadError = err?.message || 'Erreur réseau pendant la réconciliation.';
		} finally {
			reconciling = false;
		}
	}

	async function handleSaveConfig(e: SubmitEvent) {
		e.preventDefault();
		if (!projectId || savingConfig) return;
		savingConfig = true;
		actionNotice = null;
		loadError = null;
		try {
			const res = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/drift/reconcile`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'configure',
						enabled: configEnabled,
						intervalSeconds: Math.max(30, Math.round(configIntervalMinutes * 60)),
						staleThresholdSeconds: Math.max(60, Math.round(configStaleMinutes * 60))
					})
				}
			);
			const data = await res.json();
			if (!res.ok || data.status === 'error') {
				loadError = data.error || 'Impossible d’enregistrer la configuration.';
			} else {
				if (data.overview) {
					overview = data.overview;
					syncConfigFromOverview(data.overview);
				}
				actionNotice = 'Paramètres de réconciliation périodique enregistrés.';
				showConfig = false;
			}
		} catch (err: any) {
			loadError = err?.message || 'Erreur réseau lors de l’enregistrement.';
		} finally {
			savingConfig = false;
		}
	}

	$effect(() => {
		const _inc = includeResolved;
		if (projectId && typeof window !== 'undefined') {
			void _inc;
			void loadOverview();
		}
	});

	const postureMeta = $derived.by(() => {
		const p = effectiveOverview?.posture ?? 'unverified';
		if (p === 'no_drift') {
			return {
				label: 'Aucune dérive',
				badgeCls:
					'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700',
				bannerCls:
					'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30',
				icon: 'ok' as const
			};
		}
		if (p === 'drift_detected') {
			return {
				label: 'Dérive détectée',
				badgeCls:
					'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-700',
				bannerCls: 'border-rose-300 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/30',
				icon: 'drift' as const
			};
		}
		return {
			label: 'Non vérifié',
			badgeCls:
				'bg-amber-100 text-amber-950 border-amber-400 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700',
			bannerCls:
				'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30',
			icon: 'unverified' as const
		};
	});

	const filteredFindings = $derived.by(() => {
		const list = effectiveOverview?.findings ?? [];
		return list.filter((f) => {
			if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
			if (outOfDecisionOnly && !f.outOfDecision) return false;
			return true;
		});
	});

	const filteredRealization = $derived.by(() => {
		const list = effectiveOverview?.realization.items ?? [];
		if (realizationFilter === 'all') return list;
		return list.filter((item) => item.state === realizationFilter);
	});

	function kindLabel(kind: string): string {
		switch (kind) {
			case 'missing':
				return 'Objet manquant';
			case 'unexpected':
				return 'Objet inattendu';
			case 'attribute_mismatch':
				return 'Attribut divergent';
			case 'status_regression':
				return 'Régression de statut';
			default:
				return kind;
		}
	}

	function severityMeta(sev: string): { label: string; cls: string } {
		switch (sev) {
			case 'critical':
				return {
					label: 'Critique',
					cls: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-700'
				};
			case 'high':
				return {
					label: 'Haute',
					cls: 'bg-orange-100 text-orange-950 border-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-700'
				};
			case 'medium':
				return {
					label: 'Moyenne',
					cls: 'bg-amber-100 text-amber-950 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700'
				};
			default:
				return {
					label: 'Basse',
					cls: 'bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600'
				};
		}
	}

	function realizationMeta(state: RealizationState): { label: string; cls: string } {
		switch (state) {
			case 'realized_proven':
				return {
					label: 'Réalisé prouvé',
					cls: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700'
				};
			case 'declared_unproven':
				return {
					label: 'Déclaré non prouvé',
					cls: 'bg-orange-100 text-orange-950 border-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-700'
				};
			case 'planned':
				return {
					label: 'Planifié',
					cls: 'bg-sky-100 text-sky-950 border-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-700'
				};
			default:
				return {
					label: 'Non vérifié',
					cls: 'bg-amber-100 text-amber-950 border-amber-400 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700'
				};
		}
	}

	function formatValueBrief(val: unknown): string {
		if (val === null || val === undefined) return '—';
		if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
			return String(val);
		}
		try {
			const s = JSON.stringify(val);
			return s.length > 72 ? `${s.slice(0, 69)}…` : s;
		} catch {
			return '—';
		}
	}

	function formatTimestampFr(iso: string | null | undefined): string {
		if (!iso) return 'Jamais';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return String(iso);
		return d.toLocaleString('fr-FR', {
			dateStyle: 'short',
			timeStyle: 'short'
		});
	}

	function isHttpUrl(val: string | null | undefined): boolean {
		return Boolean(val && /^https?:\/\//i.test(val.trim()));
	}
</script>

<section
	id="phase5-drift-view"
	aria-labelledby="phase5-drift-heading"
	data-testid="phase5-drift-view"
	class="rounded-xl border bg-card p-4 shadow-xs space-y-4"
>
	<!-- En-tête de la vue Dérive -->
	<div class="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
		<div class="space-y-1">
			<div class="flex items-center gap-2 flex-wrap">
				<h3 id="phase5-drift-heading" class="text-sm font-bold text-foreground">
					Vue Dérive &amp; État de Réalisation (Nautobot)
				</h3>
				<span
					data-testid="drift-posture-badge"
					data-posture={effectiveOverview?.posture ?? 'unverified'}
					class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-bold {postureMeta.badgeCls}"
				>
					{#if postureMeta.icon === 'ok'}
						<ShieldCheck class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					{:else if postureMeta.icon === 'drift'}
						<AlertTriangle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					{:else}
						<HelpCircle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					{/if}
					<span>{postureMeta.label}</span>
				</span>
			</div>
			<p class="text-xs text-muted-foreground">
				Réconciliation périodique contre l’intention figée des EDP et lecture des preuves de réalisation (#399).
				Un état « Non vérifié » ne peut jamais être interprété comme « Aucune dérive ».
			</p>
		</div>

		<div class="flex items-center gap-2 flex-wrap shrink-0">
			<button
				type="button"
				data-testid="drift-reconcile-now-btn"
				onclick={handleReconcileNow}
				disabled={reconciling}
				aria-busy={reconciling}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 text-xs font-semibold transition-colors cursor-pointer"
			>
				<RefreshCw class="h-3.5 w-3.5 {reconciling ? 'animate-spin' : ''}" aria-hidden="true" />
				<span>{reconciling ? 'Réconciliation…' : 'Réconcilier maintenant'}</span>
			</button>

			<button
				type="button"
				data-testid="drift-config-toggle-btn"
				onclick={() => (showConfig = !showConfig)}
				aria-expanded={showConfig}
				class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-background hover:bg-muted text-foreground text-xs font-semibold transition-colors cursor-pointer"
			>
				<Settings2 class="h-3.5 w-3.5" aria-hidden="true" />
				<span>Planification</span>
			</button>
		</div>
	</div>

	<!-- Bandeau de posture & ancienneté de la dernière réconciliation -->
	<div
		data-testid="drift-posture-banner"
		class="rounded-lg border p-3 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs {postureMeta.bannerCls}"
	>
		<div class="space-y-0.5 text-foreground">
			<p class="font-semibold">
				{effectiveOverview?.postureReason ??
					'Aucune réconciliation Nautobot n’a encore réussi sur ce projet.'}
			</p>
			{#if effectiveOverview?.reconciliation.lastError}
				<p class="text-[11px] font-mono text-foreground/80">
					Dernière erreur : {effectiveOverview.reconciliation.lastError}
				</p>
			{/if}
		</div>

		<div
			data-testid="drift-last-reconciliation"
			class="flex items-center gap-2 flex-wrap font-mono text-[11px] text-foreground shrink-0"
		>
			<Clock class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
			<span>
				Dernière réconciliation réussie :
				<strong>
					{#if effectiveOverview?.reconciliation.lastSuccessAt}
						{formatRelativeAgeFr(effectiveOverview.reconciliation.lastSuccessAgeMs)}
						({formatTimestampFr(effectiveOverview.reconciliation.lastSuccessAt)})
					{:else}
						Jamais
					{/if}
				</strong>
			</span>
			{#if effectiveOverview}
				<span class="px-1.5 py-0.5 rounded border bg-background/80 text-foreground">
					Intervalle : {formatDurationFr(effectiveOverview.reconciliation.intervalSeconds * 1000)}
					({effectiveOverview.reconciliation.enabled ? 'actif' : 'en pause'})
				</span>
			{/if}
		</div>
	</div>

	<!-- Retour d'action accessible -->
	{#if actionNotice}
		<div
			role="status"
			aria-live="polite"
			class="rounded-lg border border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200 px-3 py-2 text-xs font-medium"
		>
			{actionNotice}
		</div>
	{/if}

	{#if loadError}
		<div
			role="alert"
			class="rounded-lg border border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200 px-3 py-2 text-xs font-medium"
		>
			{loadError}
		</div>
	{/if}

	<!-- Panneau de configuration de la réconciliation périodique -->
	{#if showConfig}
		<form
			onsubmit={handleSaveConfig}
			data-testid="drift-config-form"
			class="rounded-lg border bg-muted/30 p-3 flex flex-wrap items-end gap-3 text-xs"
		>
			<label class="inline-flex items-center gap-2 font-medium text-foreground cursor-pointer">
				<input
					type="checkbox"
					bind:checked={configEnabled}
					class="rounded border-border"
				/>
				<span>Job périodique actif</span>
			</label>

			<div class="flex flex-col gap-1">
				<label for="drift-interval-min" class="font-medium text-foreground">
					Intervalle (minutes)
				</label>
				<input
					id="drift-interval-min"
					type="number"
					min="1"
					max="1440"
					bind:value={configIntervalMinutes}
					class="w-28 rounded border bg-background px-2 py-1 text-xs text-foreground"
				/>
			</div>

			<div class="flex flex-col gap-1">
				<label for="drift-stale-min" class="font-medium text-foreground">
					Seuil péremption (minutes)
				</label>
				<input
					id="drift-stale-min"
					type="number"
					min="1"
					max="10080"
					bind:value={configStaleMinutes}
					class="w-32 rounded border bg-background px-2 py-1 text-xs text-foreground"
				/>
			</div>

			<button
				type="submit"
				disabled={savingConfig}
				class="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold cursor-pointer"
			>
				{savingConfig ? 'Enregistrement…' : 'Enregistrer'}
			</button>
		</form>
	{/if}

	<!-- Grille d'indicateurs de pilotage -->
	<div
		data-testid="drift-indicators-grid"
		class="grid grid-cols-2 md:grid-cols-5 gap-2.5"
	>
		<!-- 1. Écarts ouverts par sévérité -->
		<div class="rounded-lg border bg-background p-3 space-y-1">
			<div class="text-[11px] font-semibold text-muted-foreground">Écarts ouverts</div>
			<div class="text-lg font-bold font-mono text-foreground" data-testid="drift-open-total">
				{effectiveOverview?.indicators.openBySeverity.total ?? 0}
			</div>
			<div class="text-[11px] font-mono text-muted-foreground flex flex-wrap gap-x-2">
				<span>Crit: {effectiveOverview?.indicators.openBySeverity.critical ?? 0}</span>
				<span>Haute: {effectiveOverview?.indicators.openBySeverity.high ?? 0}</span>
				<span>Moy: {effectiveOverview?.indicators.openBySeverity.medium ?? 0}</span>
				<span>Basse: {effectiveOverview?.indicators.openBySeverity.low ?? 0}</span>
			</div>
		</div>

		<!-- 2. Décisions stale -->
		<div class="rounded-lg border bg-background p-3 space-y-1">
			<div class="text-[11px] font-semibold text-muted-foreground">Décisions caduques (stale)</div>
			<div class="text-lg font-bold font-mono text-foreground" data-testid="drift-stale-count">
				{effectiveOverview?.indicators.staleDecisionsCount ?? 0}
			</div>
			<div class="text-[11px] text-muted-foreground">
				Âge max écart : {formatDurationFr(effectiveOverview?.indicators.oldestOpenFindingAgeMs)}
			</div>
		</div>

		<!-- 3. Délai moyen de détection -->
		<div class="rounded-lg border bg-background p-3 space-y-1">
			<div class="text-[11px] font-semibold text-muted-foreground">Délai moyen de détection</div>
			<div class="text-lg font-bold font-mono text-foreground" data-testid="drift-detection-delay">
				{formatDurationFr(effectiveOverview?.indicators.averageDetectionDelayMs)}
			</div>
			<div class="text-[11px] text-muted-foreground">Entre modif. Nautobot &amp; alerte</div>
		</div>

		<!-- 4. Délai moyen de résolution -->
		<div class="rounded-lg border bg-background p-3 space-y-1">
			<div class="text-[11px] font-semibold text-muted-foreground">Délai moyen de résolution</div>
			<div class="text-lg font-bold font-mono text-foreground" data-testid="drift-resolution-delay">
				{formatDurationFr(effectiveOverview?.indicators.averageResolutionDelayMs)}
			</div>
			<div class="text-[11px] text-muted-foreground">Sur les écarts clôturés</div>
		</div>

		<!-- 5. Ratio hors décision -->
		<div class="rounded-lg border bg-background p-3 space-y-1">
			<div class="text-[11px] font-semibold text-muted-foreground">Ratio « hors décision »</div>
			<div class="text-lg font-bold font-mono text-foreground" data-testid="drift-out-of-decision-ratio">
				{#if effectiveOverview?.indicators.outOfDecisionRatio !== null && effectiveOverview?.indicators.outOfDecisionRatio !== undefined}
					{Math.round(effectiveOverview.indicators.outOfDecisionRatio * 100)} %
				{:else}
					—
				{/if}
			</div>
			<div class="text-[11px] text-muted-foreground">
				{effectiveOverview?.indicators.outOfDecisionCount ?? 0} objet(s) non marqué(s)
			</div>
		</div>
	</div>

	<!-- État de réalisation (#399) -->
	<div
		data-testid="drift-realization-section"
		class="rounded-lg border bg-background p-3 space-y-3"
	>
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
			<div>
				<h4 class="text-xs font-bold text-foreground">
					État de réalisation des objets planifiés (contrat write-back #399)
				</h4>
				<p class="text-[11px] text-muted-foreground">
					Un statut actif sans preuve (<code class="font-mono">evidence_ref</code>) ni révision concordante reste « Déclaré non prouvé ».
				</p>
			</div>

			<div class="flex items-center gap-1.5 flex-wrap text-[11px]">
				<button
					type="button"
					onclick={() => (realizationFilter = 'all')}
					class="px-2 py-0.5 rounded border font-semibold cursor-pointer {realizationFilter === 'all'
						? 'bg-primary text-primary-foreground border-primary'
						: 'bg-muted/40 text-foreground border-border'}"
				>
					Tous ({effectiveOverview?.realization.summary.total ?? 0})
				</button>
				<button
					type="button"
					onclick={() => (realizationFilter = 'realized_proven')}
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded border font-semibold cursor-pointer {realizationFilter === 'realized_proven'
						? 'ring-2 ring-primary'
						: ''} {realizationMeta('realized_proven').cls}"
				>
					<CheckCircle2 class="h-3 w-3" aria-hidden="true" />
					<span>Réalisé prouvé ({effectiveOverview?.realization.summary.realized_proven ?? 0})</span>
				</button>
				<button
					type="button"
					onclick={() => (realizationFilter = 'declared_unproven')}
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded border font-semibold cursor-pointer {realizationFilter === 'declared_unproven'
						? 'ring-2 ring-primary'
						: ''} {realizationMeta('declared_unproven').cls}"
				>
					<FileWarning class="h-3 w-3" aria-hidden="true" />
					<span>Déclaré non prouvé ({effectiveOverview?.realization.summary.declared_unproven ?? 0})</span>
				</button>
				<button
					type="button"
					onclick={() => (realizationFilter = 'planned')}
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded border font-semibold cursor-pointer {realizationFilter === 'planned'
						? 'ring-2 ring-primary'
						: ''} {realizationMeta('planned').cls}"
				>
					<CircleDashed class="h-3 w-3" aria-hidden="true" />
					<span>Planifié ({effectiveOverview?.realization.summary.planned ?? 0})</span>
				</button>
				<button
					type="button"
					onclick={() => (realizationFilter = 'unverified')}
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded border font-semibold cursor-pointer {realizationFilter === 'unverified'
						? 'ring-2 ring-primary'
						: ''} {realizationMeta('unverified').cls}"
				>
					<HelpCircle class="h-3 w-3" aria-hidden="true" />
					<span>Non vérifié ({effectiveOverview?.realization.summary.unverified ?? 0})</span>
				</button>
			</div>
		</div>

		{#if filteredRealization.length === 0}
			<p class="text-xs text-muted-foreground italic">
				Aucun objet planifié recensé pour ce filtre (lancez une réconciliation pour inspecter Nautobot).
			</p>
		{:else}
			<div class="overflow-x-auto">
				<table
					aria-label="État de réalisation des objets Nautobot"
					class="w-full text-left border-collapse text-xs"
				>
					<thead>
						<tr class="border-b text-[11px] text-muted-foreground">
							<th scope="col" class="py-1.5 pr-3 font-semibold">Objet</th>
							<th scope="col" class="py-1.5 pr-3 font-semibold">Décision / Rév.</th>
							<th scope="col" class="py-1.5 pr-3 font-semibold">État de réalisation</th>
							<th scope="col" class="py-1.5 font-semibold">Preuve &amp; Détail</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each filteredRealization as item}
							{@const rMeta = realizationMeta(item.state)}
							<tr>
								<td class="py-2 pr-3 font-mono">
									{#if item.nautobotUrl}
										<a
											href={item.nautobotUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:opacity-80"
										>
											<span>{item.objectName}</span>
											<ExternalLink class="h-3 w-3 shrink-0" aria-hidden="true" />
											<span class="sr-only">(ouvrir dans Nautobot)</span>
										</a>
									{:else}
										<span>{item.objectName}</span>
									{/if}
									<div class="text-[10px] text-muted-foreground">{item.objectType}</div>
								</td>
								<td class="py-2 pr-3 font-mono text-[11px]">
									<div>{item.decisionId ?? '—'}</div>
									{#if item.decisionRevision}
										<div class="text-[10px] text-muted-foreground">
											Attendu : rév. {item.decisionRevision}
										</div>
									{/if}
								</td>
								<td class="py-2 pr-3">
									<span
										class="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold {rMeta.cls}"
									>
										{#if item.state === 'realized_proven'}
											<CheckCircle2 class="h-3 w-3 shrink-0" aria-hidden="true" />
										{:else if item.state === 'declared_unproven'}
											<FileWarning class="h-3 w-3 shrink-0" aria-hidden="true" />
										{:else if item.state === 'planned'}
											<CircleDashed class="h-3 w-3 shrink-0" aria-hidden="true" />
										{:else}
											<HelpCircle class="h-3 w-3 shrink-0" aria-hidden="true" />
										{/if}
										<span>{rMeta.label}</span>
									</span>
								</td>
								<td class="py-2 text-[11px] text-foreground/90">
									<div>{item.reason}</div>
									{#if item.evidence.evidenceRef}
										<div class="mt-0.5 font-mono text-[10px]">
											Preuve :
											{#if isHttpUrl(item.evidence.evidenceRef)}
												<a
													href={item.evidence.evidenceRef}
													target="_blank"
													rel="noopener noreferrer"
													class="text-primary underline underline-offset-2"
												>
													{item.evidence.evidenceRef}
												</a>
											{:else}
												<span>{item.evidence.evidenceRef}</span>
											{/if}
										</div>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- Table des DriftFindings -->
	<div
		data-testid="drift-findings-section"
		class="rounded-lg border bg-background p-3 space-y-3"
	>
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
			<h4 class="text-xs font-bold text-foreground">
				Écarts détectés ({filteredFindings.length})
			</h4>

			<div class="flex items-center gap-3 flex-wrap text-xs">
				<div class="flex items-center gap-1.5">
					<label for="drift-severity-filter" class="text-[11px] font-medium text-muted-foreground">
						Sévérité :
					</label>
					<select
						id="drift-severity-filter"
						bind:value={severityFilter}
						class="rounded border bg-background px-2 py-0.5 text-xs text-foreground"
					>
						<option value="all">Toutes</option>
						<option value="critical">Critique</option>
						<option value="high">Haute</option>
						<option value="medium">Moyenne</option>
						<option value="low">Basse</option>
					</select>
				</div>

				<label class="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground cursor-pointer">
					<input type="checkbox" bind:checked={outOfDecisionOnly} class="rounded border-border" />
					<span>Hors décision uniquement</span>
				</label>

				<label class="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground cursor-pointer">
					<input type="checkbox" bind:checked={includeResolved} class="rounded border-border" />
					<span>Inclure résolus</span>
				</label>
			</div>
		</div>

		{#if loading && !effectiveOverview}
			<p class="text-xs text-muted-foreground">Chargement des écarts…</p>
		{:else if filteredFindings.length === 0}
			<p class="text-xs text-muted-foreground italic">
				{#if effectiveOverview?.posture === 'unverified'}
					Aucun écart affiché, mais l’état est <strong>Non vérifié</strong> : relancez une réconciliation pour confirmer la conformité.
				{:else}
					Aucun écart correspondant aux filtres actifs.
				{/if}
			</p>
		{:else}
			<div class="overflow-x-auto">
				<table
					aria-label="Liste des écarts de dérive Nautobot"
					class="w-full text-left border-collapse text-xs"
				>
					<thead>
						<tr class="border-b text-[11px] text-muted-foreground">
							<th scope="col" class="py-1.5 pr-3 font-semibold">Sévérité</th>
							<th scope="col" class="py-1.5 pr-3 font-semibold">Nature</th>
							<th scope="col" class="py-1.5 pr-3 font-semibold">Objet Nautobot</th>
							<th scope="col" class="py-1.5 pr-3 font-semibold">Rattachement</th>
							<th scope="col" class="py-1.5 pr-3 font-semibold">Âge</th>
							<th scope="col" class="py-1.5 font-semibold">Attendu → Observé</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each filteredFindings as f}
							{@const sMeta = severityMeta(f.severity)}
							<tr>
								<td class="py-2 pr-3">
									<span
										class="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold {sMeta.cls}"
									>
										<ShieldAlert class="h-3 w-3 shrink-0" aria-hidden="true" />
										<span>{sMeta.label}</span>
									</span>
								</td>
								<td class="py-2 pr-3 font-medium text-foreground">
									<div>{kindLabel(f.kind)}</div>
									{#if f.attributeKey}
										<div class="font-mono text-[10px] text-muted-foreground">
											{f.attributeKey}
										</div>
									{/if}
								</td>
								<td class="py-2 pr-3 font-mono">
									{#if f.nautobotUrl}
										<a
											href={f.nautobotUrl}
											target="_blank"
											rel="noopener noreferrer"
											data-testid="drift-nautobot-link"
											class="inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:opacity-80"
										>
											<span>{f.objectRef.name || f.objectRef.id}</span>
											<ExternalLink class="h-3 w-3 shrink-0" aria-hidden="true" />
											<span class="sr-only">(ouvrir dans Nautobot)</span>
										</a>
									{:else}
										<span>{f.objectRef.name || f.objectRef.id}</span>
									{/if}
									<div class="text-[10px] text-muted-foreground">{f.objectRef.type}</div>
								</td>
								<td class="py-2 pr-3 text-[11px]">
									{#if f.outOfDecision}
										<span
											class="inline-flex items-center gap-1 px-2 py-0.5 rounded border bg-amber-100 text-amber-950 border-amber-400 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700 font-semibold"
										>
											<AlertTriangle class="h-3 w-3 shrink-0" aria-hidden="true" />
											<span>Hors décision</span>
										</span>
									{:else}
										<div class="font-medium text-foreground">
											{f.subjectSectionRef ? `${f.subjectSectionRef} · ` : ''}{f.subjectTitle || f.subjectId || '—'}
										</div>
										<div class="font-mono text-[10px] text-muted-foreground">
											{f.decisionId || '—'}
											{#if f.clauseRefs.length > 0}
												· {f.clauseRefs.join(', ')}
											{/if}
										</div>
									{/if}
								</td>
								<td class="py-2 pr-3 font-mono text-[11px] whitespace-nowrap text-foreground">
									{formatRelativeAgeFr(f.ageMs)}
									{#if f.state !== 'open'}
										<div class="text-[10px] text-muted-foreground">({f.state})</div>
									{/if}
								</td>
								<td class="py-2 font-mono text-[11px] text-foreground/90">
									<span class="text-muted-foreground">{formatValueBrief(f.expected)}</span>
									<span aria-hidden="true"> → </span>
									<span class="font-semibold">{formatValueBrief(f.observed)}</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- Décisions caduques (stale) -->
	{#if (effectiveOverview?.staleDecisions.length ?? 0) > 0}
		<div
			data-testid="drift-stale-decisions-section"
			class="rounded-lg border border-rose-300 bg-rose-50/40 dark:border-rose-800 dark:bg-rose-950/20 p-3 space-y-2"
		>
			<h4 class="text-xs font-bold text-foreground">
				Décisions caduques (stale) — {effectiveOverview?.staleDecisions.length}
			</h4>
			<ul class="space-y-1.5 text-xs">
				{#each effectiveOverview?.staleDecisions ?? [] as sd}
					<li class="rounded border bg-background px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
						<div>
							<span class="font-semibold text-foreground">
								{sd.subjectSectionRef ? `${sd.subjectSectionRef} · ` : ''}{sd.subjectTitle || sd.subjectId}
							</span>
							<span class="font-mono text-[11px] text-muted-foreground ml-1.5">
								({sd.decisionId} · rév. {sd.revision})
							</span>
							{#if sd.staleReason}
								<p class="text-[11px] text-foreground/85 mt-0.5">{sd.staleReason}</p>
							{/if}
						</div>
						<span class="font-mono text-[11px] text-muted-foreground shrink-0">
							{formatTimestampFr(sd.updatedAt)}
						</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>
