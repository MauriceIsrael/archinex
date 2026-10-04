<script lang="ts">
	import type { Argument, ArgumentResolution } from '$lib/domain/debate';
	import { canCloseObjection, formatAgentRole } from '$lib/domain/debate';
	import { ShieldAlert, AlertTriangle, Check, ShieldCheck, Undo2, Bot, UserCheck } from 'lucide-svelte';

	let {
		objections = [],
		userRole = 'lead_architect',
		isHumanUser = true,
		onResolve = (arg: Argument, resolution: ArgumentResolution) => {}
	}: {
		objections: Argument[];
		userRole?: string;
		isHumanUser?: boolean;
		onResolve?: (arg: Argument, resolution: ArgumentResolution) => void;
	} = $props();

	const userCanClose = $derived(canCloseObjection(userRole, isHumanUser));
</script>

{#if objections.length > 0}
	<div class="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3.5 space-y-3 mb-4 shadow-xs">
		<div class="flex items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<div class="p-1.5 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400">
					<ShieldAlert class="h-4 w-4" />
				</div>
				<div>
					<h4 class="text-xs font-bold text-foreground flex items-center gap-1.5">
						<span>Objections ouvertes épinglées</span>
						<span class="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold">
							{objections.length}
						</span>
					</h4>
					<p class="text-[11px] text-muted-foreground">
						Ces objections doivent être résolues ou acceptées avant de pouvoir arbitrer le sujet à L3.
					</p>
				</div>
			</div>

			{#if !userCanClose}
				<span class="text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
					Arbitrage réservé : Lead Architect / Expert
				</span>
			{/if}
		</div>

		<div class="space-y-2.5">
			{#each objections as obj (obj.id)}
				{@const isAgent = obj.authorKind.startsWith('agent:')}
				<div class="rounded-lg border bg-card/90 p-3 space-y-2 text-xs shadow-2xs">
					<div class="flex items-center justify-between gap-2 flex-wrap text-[11px]">
						<div class="flex items-center gap-1.5">
							{#if isAgent}
								<span class="p-0.5 rounded bg-purple-500/15 text-purple-600"><Bot class="h-3 w-3" /></span>
							{:else}
								<span class="p-0.5 rounded bg-emerald-500/15 text-emerald-600"><UserCheck class="h-3 w-3" /></span>
							{/if}
							<strong class="text-foreground">{obj.author}</strong>
							<span class="font-mono text-[10px] text-muted-foreground">
								({isAgent ? formatAgentRole(obj.authorKind) : obj.authorKind})
							</span>
						</div>

						<span class="font-mono text-[10px] text-muted-foreground">Tour {obj.round}</span>
					</div>

					<!-- Affirmation -->
					<div class="font-bold text-foreground">
						{obj.claim}
					</div>

					<!-- Fondement -->
					<div class="text-[11px] text-muted-foreground pl-2.5 border-l-2 border-rose-500/40">
						<strong>Fondement :</strong> {obj.grounds}
					</div>

					<!-- Actions de clôture -->
					<div class="pt-2 border-t flex items-center justify-between gap-2 flex-wrap">
						<div class="text-[10px] text-muted-foreground font-mono">
							ID: {obj.id}
						</div>

						<div class="flex items-center gap-1.5">
							<button
								type="button"
								disabled={!userCanClose}
								onclick={() => onResolve(obj, 'answered')}
								class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[11px] font-semibold shadow-2xs transition-colors cursor-pointer"
								title="Répondre et lever formellement l'objection"
							>
								<Check class="h-3 w-3" />
								<span>Répondre</span>
							</button>

							<button
								type="button"
								disabled={!userCanClose}
								onclick={() => onResolve(obj, 'accepted_risk')}
								class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-amber-800 dark:text-amber-300 text-[11px] font-semibold transition-colors cursor-pointer"
								title="Accepter souverainement le risque opérationnel documenté"
							>
								<ShieldCheck class="h-3 w-3" />
								<span>Accepter le risque</span>
							</button>

							<button
								type="button"
								disabled={!userCanClose}
								onclick={() => onResolve(obj, 'withdrawn')}
								class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors cursor-pointer"
								title="Retirer l'objection si elle est devenue caduque"
							>
								<Undo2 class="h-3 w-3" />
								<span>Retirer</span>
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}
