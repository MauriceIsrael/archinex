<script lang="ts">
	import type { GlobalOverviewSummary } from '$lib/domain/dashboardOverview';
	import {
		FolderKanban,
		Layers,
		Users,
		BookOpen,
		AlertTriangle,
		TrendingUp,
		ShieldCheck,
		Coins,
		Clock,
		Sparkles
	} from 'lucide-svelte';

	let { summary }: { summary: GlobalOverviewSummary } = $props();
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
	<!-- CARTE 1 : PORTEFEUILLE ENGAGEMENTS & BUDGET -->
	<div class="rounded-2xl border bg-card p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
		<div class="flex items-center justify-between">
			<span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
				Portefeuille Engagements
			</span>
			<div class="p-2.5 rounded-xl bg-primary/10 text-primary">
				<FolderKanban class="h-5 w-5" />
			</div>
		</div>

		<div class="mt-3">
			<div class="flex items-baseline gap-2">
				<span class="text-3xl font-black tracking-tight text-foreground">
					{summary.totalEngagements}
				</span>
				<span class="text-xs font-medium text-muted-foreground">
					espaces actifs
				</span>
			</div>

			<div class="mt-2 flex flex-wrap gap-1.5">
				{#if summary.engagementsByType.project_rfp > 0}
					<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20">
						{summary.engagementsByType.project_rfp} RFP Client
					</span>
				{/if}
				{#if summary.engagementsByType.generic_blueprint > 0}
					<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/20">
						{summary.engagementsByType.generic_blueprint} Blueprint
					</span>
				{/if}
				{#if summary.engagementsByType.audit_resilience > 0}
					<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
						{summary.engagementsByType.audit_resilience} Audit
					</span>
				{/if}
			</div>
		</div>

		<div class="mt-4 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
			<span class="flex items-center gap-1">
				<Coins class="h-3.5 w-3.5 text-muted-foreground" />
				Enveloppe globale :
			</span>
			<strong class="font-mono font-bold text-foreground">
				{summary.totalBudgetString}
			</strong>
		</div>
	</div>

	<!-- CARTE 2 : COMPLEXITÉ & VOLUME DES SUJETS -->
	<div class="rounded-2xl border bg-card p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
		<div class="flex items-center justify-between">
			<span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
				Taille & Complexité
			</span>
			<div class="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
				<Layers class="h-5 w-5" />
			</div>
		</div>

		<div class="mt-3">
			<div class="flex items-baseline gap-2">
				<span class="text-3xl font-black tracking-tight text-foreground">
					{summary.totalSubjects}
				</span>
				<span class="text-xs font-medium text-muted-foreground">
					sections (§) instruites
				</span>
			</div>

			<div class="mt-2 flex items-center gap-3 text-xs">
				<span class="font-mono text-muted-foreground">
					Score effort : <strong class="text-foreground">{summary.totalEffortScore} pts</strong>
				</span>
				<span class="text-muted-foreground">·</span>
				<span class="font-mono text-muted-foreground">
					Énoncés : <strong class="text-foreground">{summary.totalStatements} SPO</strong>
				</span>
			</div>
		</div>

		<div class="mt-4 pt-3 border-t flex items-center justify-between text-xs">
			<span class="text-muted-foreground">Maturité moyenne :</span>
			<div class="flex items-center gap-1.5 font-bold">
				<span class="{summary.averageCompletionPct >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">
					{summary.averageCompletionPct}% décidé
				</span>
			</div>
		</div>
	</div>

	<!-- CARTE 3 : ÉQUIPES & MONOPOLISATION -->
	<div class="rounded-2xl border bg-card p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
		<div class="flex items-center justify-between">
			<span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
				Équipes & Rôles Mobilisés
			</span>
			<div class="p-2.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
				<Users class="h-5 w-5" />
			</div>
		</div>

		<div class="mt-3">
			<div class="flex items-baseline gap-2">
				<span class="text-3xl font-black tracking-tight text-foreground">
					{summary.activeArchitectsCount}
				</span>
				<span class="text-xs font-medium text-muted-foreground">
					experts affectés
				</span>
			</div>

			<p class="mt-2 text-xs text-muted-foreground line-clamp-1">
				{#each summary.teams.filter((t) => t.assignedSubjectsCount > 0).slice(0, 2) as team, i}
					<span>{team.shortRole} ({team.assignedSubjectsCount}§)</span>{#if i === 0} · {/if}
				{/each}
			</p>
		</div>

		<div class="mt-4 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
			<span>Charge dominante :</span>
			{#if summary.teams.length > 0}
				{@const dominantTeam = [...summary.teams].sort((a, b) => b.effortPoints - a.effortPoints)[0]}
				<span class="font-bold text-foreground inline-flex items-center gap-1">
					<span class="h-2 w-2 rounded-full" style="background-color: {dominantTeam?.color}"></span>
					{dominantTeam?.shortRole} ({dominantTeam?.workloadSharePct}%)
				</span>
			{/if}
		</div>
	</div>

	<!-- CARTE 4 : BASE DE CONNAISSANCES & INVARIANT -->
	<div class="rounded-2xl border bg-card p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
		<div class="flex items-center justify-between">
			<span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
				Patrimoine de Connaissances
			</span>
			<div class="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
				<BookOpen class="h-5 w-5" />
			</div>
		</div>

		<div class="mt-3">
			<div class="flex items-baseline gap-2">
				<span class="text-3xl font-black tracking-tight text-foreground">
					{summary.totalKnowledgeDocuments}
				</span>
				<span class="text-xs font-medium text-muted-foreground">
					documents au socle
				</span>
			</div>

			<div class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
				<span class="font-mono">
					<strong class="text-emerald-600 dark:text-emerald-400 font-bold">{summary.totalClauses}</strong> clauses indexées
				</span>
			</div>
		</div>

		<div class="mt-4 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
			<span class="flex items-center gap-1">
				<ShieldCheck class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
				Réutilisation transverse :
			</span>
			<strong class="font-mono font-bold text-emerald-600 dark:text-emerald-400">
				{summary.crossProjectReusePct}% mutualisé
			</strong>
		</div>
	</div>
</div>
