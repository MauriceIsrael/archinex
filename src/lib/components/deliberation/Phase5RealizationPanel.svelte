<script lang="ts">
	import {
		CheckCircle2,
		Clock,
		AlertTriangle,
		ExternalLink,
		Wrench,
		FileEdit,
		ShieldAlert
	} from 'lucide-svelte';

	export interface RealizationDriftItem {
		id: string;
		label: string;
		state: 'planned' | 'realized_proven' | 'unverified';
		staleDecision?: boolean;
		detail?: string;
	}

	export type DriftResolutionAction = 'remediate' | 'amend' | 'derogate';

	let {
		nautobotUrl = 'http://localhost:8080',
		lastReconciliationAt = null,
		items = [],
		onResolveAction = (_itemId: string, _action: DriftResolutionAction, _note: string) => {}
	}: {
		nautobotUrl?: string;
		lastReconciliationAt?: string | null;
		items?: RealizationDriftItem[];
		onResolveAction?: (itemId: string, action: DriftResolutionAction, note: string) => void;
	} = $props();

	let actionFeedback = $state<string | null>(null);
	let resolutionLog = $state<Array<{ itemId: string; action: DriftResolutionAction; at: string }>>([]);

	const plannedCount = $derived(items.filter((i) => i.state === 'planned').length);
	const provenCount = $derived(items.filter((i) => i.state === 'realized_proven').length);
	const unverifiedCount = $derived(items.filter((i) => i.state === 'unverified').length);
	const staleCount = $derived(items.filter((i) => i.staleDecision).length);

	function triggerResolution(itemId: string, action: DriftResolutionAction) {
		const labels: Record<DriftResolutionAction, string> = {
			remediate: 'Remédier (aligner l’exécution sur l’intention)',
			amend: 'Amender (réviser la décision d’architecture)',
			derogate: 'Déroger (accepter l’écart avec justification tracée)'
		};
		resolutionLog = [
			{ itemId, action, at: new Date().toISOString() },
			...resolutionLog.slice(0, 9)
		];
		actionFeedback = `Action enregistrée sur ${itemId} : ${labels[action]}.`;
		onResolveAction(itemId, action, labels[action]);
	}
</script>

<section
	class="rounded-xl border bg-card p-5 shadow-xs space-y-4"
	aria-labelledby="phase5-realization-heading"
	data-testid="phase5-realization-panel"
>
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
		<div>
			<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
				Phase 5 · Lecture seule Nautobot & Résolution de dérive
			</span>
			<h2 id="phase5-realization-heading" class="text-base font-bold text-foreground mt-1">
				Réalisation prouvée, écarts ouverts & décisions caduques
			</h2>
			<p class="text-xs text-muted-foreground">
				Archinex lit l'état de réalisation depuis Nautobot (aucun appel direct aux outils d'implémentation). Actions autorisées : remédier, amender ou déroger.
			</p>
		</div>

		<a
			href={nautobotUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-muted/40 hover:bg-muted text-xs font-semibold text-foreground shrink-0"
			data-testid="phase5-nautobot-link"
		>
			<span>Ouvrir Nautobot</span>
			<ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
		</a>
	</div>

	<!-- Indicateurs de lecture seule -->
	<div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
		<div class="rounded-lg border bg-muted/20 p-2.5">
			<div class="text-[10px] uppercase text-muted-foreground font-semibold">Planifié</div>
			<div class="text-lg font-bold font-mono text-foreground">{plannedCount}</div>
		</div>
		<div class="rounded-lg border bg-emerald-500/10 border-emerald-500/30 p-2.5">
			<div class="text-[10px] uppercase text-emerald-800 dark:text-emerald-200 font-semibold">Réalisé prouvé</div>
			<div class="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-300">{provenCount}</div>
		</div>
		<div class="rounded-lg border bg-amber-500/10 border-amber-500/30 p-2.5">
			<div class="text-[10px] uppercase text-amber-800 dark:text-amber-200 font-semibold">Non vérifié</div>
			<div class="text-lg font-bold font-mono text-amber-700 dark:text-amber-300">{unverifiedCount}</div>
		</div>
		<div class="rounded-lg border bg-rose-500/10 border-rose-500/30 p-2.5">
			<div class="text-[10px] uppercase text-rose-800 dark:text-rose-200 font-semibold">Décisions caduques</div>
			<div class="text-lg font-bold font-mono text-rose-700 dark:text-rose-300">{staleCount}</div>
		</div>
	</div>

	<div class="text-[11px] text-muted-foreground">
		Dernière réconciliation Nautobot :
		<strong class="text-foreground">
			{lastReconciliationAt ? lastReconciliationAt.slice(0, 16).replace('T', ' ') : 'Non vérifiée (état non prouvé)'}
		</strong>
	</div>

	{#if actionFeedback}
		<div class="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200" role="status">
			{actionFeedback}
		</div>
	{/if}

	<!-- Actions gouvernées (remédier / amender / déroger) -->
	<div class="space-y-2">
		{#if items.length === 0}
			<div class="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
				<span>Aucun écart ouvert remonté depuis Nautobot. Les actions de résolution restent disponibles dès qu'un écart est détecté.</span>
				<div class="flex flex-wrap items-center gap-1.5 shrink-0">
					<button
						type="button"
						onclick={() => triggerResolution('dossier', 'remediate')}
						class="inline-flex items-center gap-1 rounded border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-muted cursor-pointer"
						data-testid="phase5-action-remediate"
					>
						<Wrench class="h-3.5 w-3.5" aria-hidden="true" />
						<span>Remédier</span>
					</button>
					<button
						type="button"
						onclick={() => triggerResolution('dossier', 'amend')}
						class="inline-flex items-center gap-1 rounded border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-muted cursor-pointer"
						data-testid="phase5-action-amend"
					>
						<FileEdit class="h-3.5 w-3.5" aria-hidden="true" />
						<span>Amender</span>
					</button>
					<button
						type="button"
						onclick={() => triggerResolution('dossier', 'derogate')}
						class="inline-flex items-center gap-1 rounded border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-muted cursor-pointer"
						data-testid="phase5-action-derogate"
					>
						<ShieldAlert class="h-3.5 w-3.5" aria-hidden="true" />
						<span>Déroger</span>
					</button>
				</div>
			</div>
		{:else}
			<ul class="space-y-2">
				{#each items as item (item.id)}
					<li class="rounded-lg border bg-background p-3 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
						<div class="space-y-0.5 min-w-0">
							<div class="flex flex-wrap items-center gap-1.5">
								<span class="font-mono font-bold text-foreground">{item.label}</span>
								<span class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold">
									{#if item.state === 'realized_proven'}
										<CheckCircle2 class="h-3 w-3 text-emerald-600" aria-hidden="true" />
										<span>Réalisé prouvé</span>
									{:else if item.state === 'planned'}
										<Clock class="h-3 w-3 text-sky-600" aria-hidden="true" />
										<span>Planifié</span>
									{:else}
										<AlertTriangle class="h-3 w-3 text-amber-600" aria-hidden="true" />
										<span>Non vérifié</span>
									{/if}
								</span>
								{#if item.staleDecision}
									<span class="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
										Décision caduque
									</span>
								{/if}
							</div>
							{#if item.detail}
								<p class="text-[11px] text-muted-foreground">{item.detail}</p>
							{/if}
						</div>

						<div class="flex flex-wrap items-center gap-1.5 shrink-0">
							<button
								type="button"
								onclick={() => triggerResolution(item.id, 'remediate')}
								class="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-[11px] font-semibold hover:bg-muted cursor-pointer"
								data-testid="phase5-action-remediate"
							>
								<Wrench class="h-3 w-3" aria-hidden="true" />
								<span>Remédier</span>
							</button>
							<button
								type="button"
								onclick={() => triggerResolution(item.id, 'amend')}
								class="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-[11px] font-semibold hover:bg-muted cursor-pointer"
								data-testid="phase5-action-amend"
							>
								<FileEdit class="h-3 w-3" aria-hidden="true" />
								<span>Amender</span>
							</button>
							<button
								type="button"
								onclick={() => triggerResolution(item.id, 'derogate')}
								class="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-[11px] font-semibold hover:bg-muted cursor-pointer"
								data-testid="phase5-action-derogate"
							>
								<ShieldAlert class="h-3 w-3" aria-hidden="true" />
								<span>Déroger</span>
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>
