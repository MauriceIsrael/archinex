<script lang="ts">
	import type { EngagementSizeMetric } from '$lib/domain/dashboardOverview';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { goto } from '$app/navigation';
	import {
		FolderKanban,
		ExternalLink,
		Layers,
		FileText,
		CheckCircle2,
		AlertTriangle,
		Coins,
		Calendar,
		Users,
		ShieldCheck
	} from 'lucide-svelte';

	let {
		engagements,
		selectedType = 'all'
	}: {
		engagements: EngagementSizeMetric[];
		selectedType?: string;
	} = $props();

	const filteredEngagements = $derived.by(() => {
		if (selectedType === 'all') return engagements;
		return engagements.filter((e) => e.type === selectedType);
	});

	function openEngagementWorkbench(id: string) {
		deliberationStore.switchEngagement(id);
		goto('/deliberation');
	}
</script>

<div class="rounded-2xl border bg-card shadow-xs overflow-hidden flex flex-col">
	<div class="p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
		<div class="flex items-center gap-2.5">
			<div class="p-2 rounded-lg bg-primary/10 text-primary">
				<FolderKanban class="h-5 w-5" />
			</div>
			<div>
				<h3 class="font-bold text-base tracking-tight text-foreground">
					Taille & Avancement des Engagements
				</h3>
				<p class="text-xs text-muted-foreground">
					Volume des sections (§), score d'effort, énoncés formels et maturité décisionnelle
				</p>
			</div>
		</div>

		<div class="flex items-center gap-2">
			<span class="text-xs font-mono font-semibold px-2.5 py-1 rounded-md bg-background border text-muted-foreground">
				{filteredEngagements.length} engagement{filteredEngagements.length > 1 ? 's' : ''}
			</span>
		</div>
	</div>

	<!-- Tableau responsive -->
	<div class="overflow-x-auto">
		<table class="w-full text-left text-xs">
			<thead class="bg-muted/40 border-b font-semibold text-muted-foreground">
				<tr>
					<th class="py-3 px-4">Engagement & Type</th>
					<th class="py-3 px-3 text-center">Taille (§ / Effort)</th>
					<th class="py-3 px-3 text-center">Énoncés & Clauses</th>
					<th class="py-3 px-3 text-center">Maturité Décisionnelle</th>
					<th class="py-3 px-3">Budget & Cible</th>
					<th class="py-3 px-3">Équipe Mobilisée</th>
					<th class="py-3 px-4 text-right">Action</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-border">
				{#each filteredEngagements as eng (eng.id)}
					<tr class="hover:bg-muted/30 transition-colors group">
						<!-- Engagement Title & Type -->
						<td class="py-3.5 px-4">
							<div class="space-y-1">
								<div class="flex items-center gap-2">
									<span class="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
										{eng.title}
									</span>
									{#if eng.stalledCount > 0}
										<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30" title="{eng.stalledCount} section(s) en stagnation > 14j">
											<AlertTriangle class="h-3 w-3" />
											{eng.stalledCount} stagné
										</span>
									{/if}
									{#if eng.openConflictsCount > 0}
										<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-destructive/15 text-destructive border border-destructive/30" title="{eng.openConflictsCount} conflit(s) ouvert(s)">
											{eng.openConflictsCount} conflit{eng.openConflictsCount > 1 ? 's' : ''}
										</span>
									{/if}
								</div>
								<div class="flex items-center gap-2 text-muted-foreground text-[11px]">
									<span class="font-semibold text-primary">{eng.badge}</span>
									<span>·</span>
									<span>{eng.typeLabel}</span>
								</div>
							</div>
						</td>

						<!-- Taille : Sujets (§) et Effort Score -->
						<td class="py-3.5 px-3 text-center">
							<div class="inline-flex flex-col items-center">
								<span class="font-bold text-sm text-foreground">
									{eng.subjectsCount} <span class="text-xs font-normal text-muted-foreground">sections</span>
								</span>
								<span class="text-[11px] font-mono text-muted-foreground">
									Effort : <strong class="text-foreground">{eng.effortScore} pts</strong>
								</span>
							</div>
						</td>

						<!-- Énoncés formels & Clauses amonts -->
						<td class="py-3.5 px-3 text-center">
							<div class="inline-flex flex-col items-center">
								<span class="font-bold text-foreground">
									{eng.statementsCount} <span class="text-[10px] text-muted-foreground font-normal">SPO scellés</span>
								</span>
								<span class="text-[11px] font-mono text-muted-foreground">
									{eng.clausesCount} clauses amonts
								</span>
							</div>
						</td>

						<!-- Progression & Maturité -->
						<td class="py-3.5 px-3">
							<div class="w-36 mx-auto space-y-1.5">
								<div class="flex items-center justify-between text-[11px]">
									<span class="font-semibold {eng.completionPct >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}">
										{eng.completionPct}% décidé
									</span>
									<span class="text-muted-foreground text-[10px]">
										{eng.maturityCounts.L3_decided + eng.maturityCounts.L4_specified} / {eng.subjectsCount}
									</span>
								</div>
								<!-- Jauge segmentée -->
								<div class="h-2 w-full bg-muted rounded-full overflow-hidden flex">
									{#if eng.maturityCounts.L4_specified > 0}
										<div
											class="bg-emerald-600 dark:bg-emerald-500 h-full"
											style="width: {(eng.maturityCounts.L4_specified / eng.subjectsCount) * 100}%"
											title="L4 Spécifié : {eng.maturityCounts.L4_specified}"
										></div>
									{/if}
									{#if eng.maturityCounts.L3_decided > 0}
										<div
											class="bg-emerald-400 dark:bg-emerald-400 h-full"
											style="width: {(eng.maturityCounts.L3_decided / eng.subjectsCount) * 100}%"
											title="L3 Décidé : {eng.maturityCounts.L3_decided}"
										></div>
									{/if}
									{#if eng.maturityCounts.L2_decomposed > 0}
										<div
											class="bg-blue-400 h-full"
											style="width: {(eng.maturityCounts.L2_decomposed / eng.subjectsCount) * 100}%"
											title="L2 Décomposé : {eng.maturityCounts.L2_decomposed}"
										></div>
									{/if}
									{#if eng.maturityCounts.L1_framed > 0}
										<div
											class="bg-amber-400 h-full"
											style="width: {(eng.maturityCounts.L1_framed / eng.subjectsCount) * 100}%"
											title="L1 Cadré : {eng.maturityCounts.L1_framed}"
										></div>
									{/if}
									{#if eng.maturityCounts.L0_named > 0}
										<div
											class="bg-muted-foreground/30 h-full"
											style="width: {(eng.maturityCounts.L0_named / eng.subjectsCount) * 100}%"
											title="L0 Nommé : {eng.maturityCounts.L0_named}"
										></div>
									{/if}
								</div>
							</div>
						</td>

						<!-- Budget & Date cible -->
						<td class="py-3.5 px-3">
							<div class="space-y-0.5">
								<div class="flex items-center gap-1 font-bold text-foreground">
									<Coins class="h-3.5 w-3.5 text-muted-foreground" />
									<span>{eng.budget || 'Non spécifié'}</span>
								</div>
								{#if eng.targetDate}
									<div class="flex items-center gap-1 text-[10px] text-muted-foreground">
										<Calendar class="h-3 w-3" />
										<span>{eng.targetDate}</span>
									</div>
								{/if}
								{#if eng.financialImpactTotal > 0}
									<div class="text-[10px] font-semibold text-destructive">
										+{eng.financialImpactTotal} k€ surcoût détecté
									</div>
								{/if}
							</div>
						</td>

						<!-- Équipe Mobilisée -->
						<td class="py-3.5 px-3">
							<div class="space-y-1">
								<div class="flex items-center gap-1">
									<Users class="h-3.5 w-3.5 text-muted-foreground" />
									<span class="font-semibold text-foreground">
										{eng.participantsCount > 0 ? `${eng.participantsCount} experts` : 'Équipe par défaut'}
									</span>
								</div>
								{#if eng.participants && eng.participants.length > 0}
									<p class="text-[10px] text-muted-foreground line-clamp-1 max-w-[140px]">
										{eng.participants.map((p) => p.name).join(', ')}
									</p>
								{/if}
							</div>
						</td>

						<!-- Action -->
						<td class="py-3.5 px-4 text-right">
							<button
								type="button"
								onclick={() => openEngagementWorkbench(eng.id)}
								class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground font-semibold text-xs transition-all shadow-2xs"
							>
								<span>Workbench</span>
								<ExternalLink class="h-3.5 w-3.5" />
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
