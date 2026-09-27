<script lang="ts">
	import type { TeamMonopolizationMetric } from '$lib/domain/dashboardOverview';
	import ChartWidget from '$lib/dashboard/widgets/ChartWidget.svelte';
	import {
		Users,
		AlertCircle,
		ShieldAlert,
		Clock,
		Flame,
		CheckCircle2,
		Award
	} from 'lucide-svelte';

	let {
		teams
	}: {
		teams: TeamMonopolizationMetric[];
	} = $props();

	// Trie par effort pour mettre en évidence l'équipe la plus sollicitée
	const sortedTeams = $derived([...teams].sort((a, b) => b.effortPoints - a.effortPoints));

	// Options ECharts Radar pour le profil multi-disciplinaire
	const radarOptions = $derived.by((): any => {
		const indicator = teams.map((t) => ({
			name: t.shortRole,
			max: Math.max(...teams.map((x) => x.effortPoints), 10) * 1.2
		}));

		const effortValues = teams.map((t) => t.effortPoints);
		const subjectsValues = teams.map((t) => t.assignedSubjectsCount);

		return {
			tooltip: { trigger: 'item' },
			legend: {
				bottom: 0,
				data: ['Effort Cumulé (pts)', 'Sections Attribuées (§)'],
				textStyle: { fontSize: 11 }
			},
			radar: {
				indicator,
				radius: '65%',
				splitNumber: 4,
				axisName: {
					color: 'var(--color-muted-foreground, #64748b)',
					fontSize: 10,
					fontWeight: 'bold'
				},
				splitLine: {
					lineStyle: {
						color: 'rgba(128, 128, 128, 0.2)'
					}
				},
				splitArea: {
					show: true,
					areaStyle: {
						color: ['rgba(250, 250, 250, 0.02)', 'rgba(200, 200, 200, 0.05)']
					}
				}
			},
			series: [
				{
					name: 'Monopolisation des Équipes',
					type: 'radar',
					data: [
						{
							value: effortValues,
							name: 'Effort Cumulé (pts)',
							symbolSize: 4,
							itemStyle: { color: '#0ea5e9' },
							areaStyle: { color: 'rgba(14, 165, 233, 0.25)' }
						},
						{
							value: subjectsValues,
							name: 'Sections Attribuées (§)',
							symbolSize: 4,
							itemStyle: { color: '#8b5cf6' },
							areaStyle: { color: 'rgba(139, 92, 246, 0.2)' }
						}
					]
				}
			]
		};
	});
</script>

<div class="rounded-2xl border bg-card shadow-xs overflow-hidden flex flex-col h-full">
	<div class="p-5 border-b flex items-center justify-between bg-muted/20">
		<div class="flex items-center gap-2.5">
			<div class="p-2 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
				<Users class="h-5 w-5" />
			</div>
			<div>
				<h3 class="font-bold text-base tracking-tight text-foreground">
					Monopolisation des Équipes & Rôles
				</h3>
				<p class="text-xs text-muted-foreground">
					Répartition de la charge, goulots d'étranglement et backlog décisionnel par discipline
				</p>
			</div>
		</div>

		<span class="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-background border text-muted-foreground">
			5 Rôles Formels
		</span>
	</div>

	<div class="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-center">
		<!-- Graphe Radar (Visualisation multi-axiale) -->
		<div class="lg:col-span-6 h-[280px] w-full flex items-center justify-center">
			<ChartWidget options={radarOptions} />
		</div>

		<!-- Liste détaillée par discipline -->
		<div class="lg:col-span-6 space-y-3">
			{#each sortedTeams as team, idx}
				<div class="p-3 rounded-xl border bg-background/60 hover:bg-muted/30 transition-colors space-y-2">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<span
								class="h-3 w-3 rounded-full shrink-0"
								style="background-color: {team.color}"
							></span>
							<span class="font-bold text-xs text-foreground">
								{team.shortRole}
							</span>
							{#if idx === 0 && team.workloadSharePct > 30}
								<span class="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
									<Flame class="h-2.5 w-2.5" />
									Charge Dominante
								</span>
							{/if}
						</div>

						<div class="flex items-center gap-2 font-mono text-xs">
							<strong class="text-foreground">{team.effortPoints} pts</strong>
							<span class="text-muted-foreground">({team.workloadSharePct}%)</span>
						</div>
					</div>

					<!-- Barre de progression relative -->
					<div class="h-1.5 w-full bg-muted rounded-full overflow-hidden">
						<div
							class="h-full rounded-full transition-all"
							style="width: {team.workloadSharePct}%; background-color: {team.color}"
						></div>
					</div>

					<!-- Indicateurs clés & Participants -->
					<div class="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
						<div class="flex items-center gap-2.5">
							<span><strong>{team.assignedSubjectsCount}</strong> sections (§)</span>
							{#if team.blockingSubjectsCount > 0}
								<span class="text-destructive font-semibold flex items-center gap-0.5" title="Nombre de sections descendantes débloquées par ce rôle">
									<ShieldAlert class="h-3 w-3" />
									{team.blockingSubjectsCount} bloquants
								</span>
							{/if}
							{#if team.stalledSubjectsCount > 0}
								<span class="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-0.5">
									<Clock class="h-3 w-3" />
									{team.stalledSubjectsCount} stagné{team.stalledSubjectsCount > 1 ? 's' : ''}
								</span>
							{/if}
						</div>

						<div class="text-[10px] text-muted-foreground truncate max-w-[150px]">
							{team.activeParticipants.length > 0 ? team.activeParticipants.join(', ') : 'Non assigné'}
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
