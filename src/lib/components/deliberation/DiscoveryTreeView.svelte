<script lang="ts">
	import type { DiscoveryTreeData, DiscoveryTreeNode } from '$lib/domain/cascade';
	import { formatSourceType } from '$lib/domain/cascade';
	import KnowledgeTreeChart from '$lib/components/knowledge/KnowledgeTreeChart.svelte';
	import {
		GitFork,
		ArrowRight,
		ArrowUpRight,
		CheckCircle2,
		AlertTriangle,
		Sparkles,
		Scale,
		ListTree,
		Network,
		XCircle,
		CornerDownRight
	} from 'lucide-svelte';

	interface Props {
		discoveryTree?: DiscoveryTreeData | null;
		treeSeries?: any[];
		isLoading?: boolean;
		onSelectSubject?: (subjectId: string) => void;
		onOpenMatrix?: () => void;
		onProposeAnglesMorts?: () => Promise<void> | void;
		isProposingAnglesMorts?: boolean;
	}

	let {
		discoveryTree = null,
		treeSeries = [],
		isLoading = false,
		onSelectSubject = () => {},
		onOpenMatrix,
		onProposeAnglesMorts,
		isProposingAnglesMorts = false
	}: Props = $props();

	let viewMode = $state<'tree' | 'chart'>('tree');

	function formatLevelShort(level?: string): string {
		if (!level) return 'L0';
		return level.split('_')[0] || level;
	}

	function levelBadgeClass(level?: string): string {
		const short = formatLevelShort(level);
		switch (short) {
			case 'L3':
			case 'L4':
			case 'L5':
				return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
			case 'L2':
				return 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';
			case 'L1':
				return 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30';
			default:
				return 'bg-muted text-muted-foreground border-border';
		}
	}

	function statusBadge(node: DiscoveryTreeNode): { label: string; cls: string } {
		if (node.foundationContested) {
			return {
				label: 'Contesté ⚠️',
				cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
			};
		}
		if (node.questionStatus === 'merged') {
			return {
				label: 'Fusionné',
				cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
			};
		}
		if (node.questionStatus === 'closed') {
			return {
				label: 'Clos',
				cls: 'bg-muted text-muted-foreground border-border'
			};
		}
		if (node.questionStatus === 'assigned') {
			return {
				label: 'Assigné',
				cls: 'bg-primary/10 text-primary border-primary/25'
			};
		}
		return {
			label: 'Ouvert',
			cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
		};
	}
</script>

<div class="space-y-3" data-testid="discovery-tree-view">
	<!-- Barre de bascule Vue Arbre / Graphe ECharts -->
	<div class="flex items-center justify-between gap-2 flex-wrap">
		<span class="text-[11px] text-muted-foreground">
			{#if discoveryTree}
				{discoveryTree.children.length} branche(s) enfant(s) · {discoveryTree.affirmedFacts.length} fait(s) affirmé(s)
			{:else}
				Généalogie du sujet
			{/if}
		</span>

		<div class="inline-flex items-center rounded-lg border bg-muted/40 p-0.5 text-[11px]">
			<button
				type="button"
				data-testid="btn-tree-mode-list"
				onclick={() => (viewMode = 'tree')}
				class="inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-colors cursor-pointer {viewMode ===
				'tree'
					? 'bg-background text-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				<ListTree class="h-3 w-3" />
				<span>Arbre lisible</span>
			</button>
			<button
				type="button"
				data-testid="btn-tree-mode-chart"
				onclick={() => (viewMode = 'chart')}
				class="inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-colors cursor-pointer {viewMode ===
				'chart'
					? 'bg-background text-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				<Network class="h-3 w-3" />
				<span>Graphe</span>
			</button>
		</div>
	</div>

	{#if isLoading}
		<div class="p-8 text-center text-muted-foreground animate-pulse">
			Génération de l'arbre de découverte...
		</div>
	{:else if viewMode === 'chart'}
		{#if treeSeries && treeSeries.length > 0}
			<div class="rounded-xl border bg-card p-2 min-h-[380px]">
				<KnowledgeTreeChart series={treeSeries} height="380px" />
			</div>
		{:else}
			<div class="p-8 text-center text-muted-foreground border-2 border-dashed rounded-xl">
				Aucune donnée graphique disponible pour ce sujet.
			</div>
		{/if}
	{:else if discoveryTree}
		<div class="space-y-3" data-testid="interactive-discovery-tree">
			<!-- 1. Fil d'ascendance (Parents) -->
			{#if discoveryTree.ancestors.length > 0}
				<div class="flex items-center gap-1.5 flex-wrap text-[11px] bg-muted/40 border rounded-lg px-2.5 py-1.5">
					<span class="text-muted-foreground font-medium">Ascendance :</span>
					{#each discoveryTree.ancestors as anc, i (anc.id)}
						{#if i > 0}
							<span class="text-muted-foreground">→</span>
						{/if}
						<button
							type="button"
							onclick={() => onSelectSubject(anc.id)}
							class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-background border hover:border-primary/50 hover:text-primary font-medium transition-colors cursor-pointer"
							title="Revenir au sujet parent"
						>
							<span class="font-mono text-[10px] text-primary">{anc.sectionRef || '§'}</span>
							<span>{anc.name}</span>
							<ArrowUpRight class="h-3 w-3 opacity-70" />
						</button>
					{/each}
				</div>
			{/if}

			<!-- 2. Nœud Racine : Sujet courant + Décision + Faits -->
			<div class="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 space-y-2.5">
				<div class="flex items-start justify-between gap-2 flex-wrap">
					<div class="flex items-center gap-2 flex-wrap">
						<span class="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
							{discoveryTree.currentSubject.sectionRef || '§'}
						</span>
						<span class="text-xs font-bold text-foreground">
							{discoveryTree.currentSubject.name}
						</span>
						<span class="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border {levelBadgeClass(discoveryTree.currentSubject.maturityLevel)}">
							{formatLevelShort(discoveryTree.currentSubject.maturityLevel)}
						</span>
					</div>
					<span class="text-[10px] uppercase tracking-wider font-semibold text-sky-700 dark:text-sky-300">
						Sujet actif
					</span>
				</div>

				<!-- Décision rattachée -->
				<div class="rounded-lg border bg-background/80 p-2.5 space-y-1.5">
					{#if discoveryTree.decision}
						<div class="flex items-center justify-between gap-2 flex-wrap">
							<div class="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
								<Scale class="h-3.5 w-3.5 shrink-0" />
								<span>Option retenue : {discoveryTree.decision.retainedOptionTitle}</span>
							</div>
							{#if discoveryTree.decision.isAsserted}
								<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
									<CheckCircle2 class="h-3 w-3" />
									<span>Affirmée</span>
								</span>
							{:else}
								<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
									Arbitrée (à affirmer)
								</span>
							{/if}
						</div>
						{#if discoveryTree.decision.rationale}
							<p class="text-[11px] text-muted-foreground line-clamp-2">
								{discoveryTree.decision.rationale}
							</p>
						{/if}
					{:else}
						<div class="flex items-center justify-between gap-2 flex-wrap">
							<span class="text-[11px] text-muted-foreground">
								Aucune décision arbitrée pour l'instant sur ce sujet.
							</span>
							{#if onOpenMatrix}
								<button
									type="button"
									onclick={onOpenMatrix}
									class="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
								>
									<span>Arbitrer dans Matrice</span>
									<ArrowRight class="h-3 w-3" />
								</button>
							{/if}
						</div>
					{/if}

					<!-- Faits affirmés sur ce sujet -->
					<div class="pt-1.5 border-t border-border/50">
						{#if discoveryTree.affirmedFacts.length > 0}
							<div class="flex items-center gap-1.5 flex-wrap">
								<span class="text-[10px] font-semibold text-muted-foreground">Faits affirmés :</span>
								{#each discoveryTree.affirmedFacts as fact (`${fact.key}:${fact.value}`)}
									<span class="px-1.5 py-0.5 rounded bg-muted text-foreground border font-mono text-[10px]">
										{fact.key} = {fact.value}
									</span>
								{/each}
							</div>
						{:else}
							<p class="text-[10px] text-muted-foreground italic">
								Aucun fait structuré affirmé sur ce sujet — extrayez et affirmez des faits en phase Matrice pour activer les règles déterministes.
							</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- 3. Branches Enfants (et Petits-Enfants) -->
			<div class="border-l-2 border-indigo-500/30 pl-3 ml-2 space-y-2.5">
				{#if discoveryTree.children.length > 0}
					{#each discoveryTree.children as child (child.questionId)}
						{@const sourceInfo = formatSourceType(child.sourceType)}
						{@const st = statusBadge(child)}
						<div
							class="rounded-xl border bg-card p-2.5 space-y-2 transition-colors {child.foundationContested
								? 'border-rose-500/40 bg-rose-500/5'
								: child.questionStatus === 'closed' || child.questionStatus === 'merged'
									? 'opacity-75'
									: 'hover:border-primary/40'}"
							data-testid="discovery-tree-child"
						>
							<div class="flex items-start justify-between gap-2 flex-wrap">
								<div class="space-y-1 min-w-0 flex-1">
									<div class="flex items-center gap-1.5 flex-wrap">
										<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border {sourceInfo.badgeClass}">
											<span>{sourceInfo.icon}</span>
											<span>{sourceInfo.label}</span>
										</span>
										{#if child.sectionRef}
											<span class="font-mono text-[10px] font-bold text-primary">
												{child.sectionRef}
											</span>
										{/if}
										<span class="text-xs font-bold text-foreground">
											{child.name}
										</span>
										<span class="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border {levelBadgeClass(child.maturityLevel)}">
											{formatLevelShort(child.maturityLevel)}
										</span>
										<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold border {st.cls}">
											{st.label}
										</span>
										{#if child.mandatory}
											<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25">
												Obligatoire
											</span>
										{/if}
									</div>

									<p class="text-[11px] text-muted-foreground leading-snug">
										{child.questionText}
									</p>

									{#if child.foundationContested && child.contestationReason}
										<div class="flex items-start gap-1.5 text-[11px] text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-md p-1.5">
											<AlertTriangle class="h-3.5 w-3.5 shrink-0 mt-0.5" />
											<span>{child.contestationReason}</span>
										</div>
									{/if}

									{#if child.triggeringFacts.length > 0 || child.ruleRef}
										<div class="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground">
											{#if child.ruleRef}
												<span class="font-mono font-semibold text-foreground">Règle {child.ruleRef}</span>
											{/if}
											{#each child.triggeringFacts as tf (`${tf.key}:${tf.value}`)}
												<span class="px-1 py-0.2 rounded bg-muted font-mono border">
													{tf.key}={tf.value}
												</span>
											{/each}
										</div>
									{/if}
								</div>

								<button
									type="button"
									onclick={() => onSelectSubject(child.mergedWithSubjectId || child.subjectId)}
									class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary text-[11px] font-semibold transition-colors cursor-pointer shrink-0"
									title={child.mergedWithSubjectId ? 'Ouvrir le sujet cible de la fusion' : 'Ouvrir ce sous-sujet'}
								>
									<span>Ouvrir</span>
									<ArrowRight class="h-3 w-3" />
								</button>
							</div>

							<!-- Sous-sous-sujets (petits-enfants) si ce sous-sujet a déjà lui-même cascadé -->
							{#if child.children && child.children.length > 0}
								<div class="border-l border-dashed border-muted-foreground/35 pl-3 ml-2 pt-1 space-y-1.5">
									<div class="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
										<CornerDownRight class="h-3 w-3" />
										<span>Sous-sous-sujets ouverts ({child.children.length})</span>
									</div>
									{#each child.children as grandChild (grandChild.subjectId)}
										{@const gcSource = formatSourceType(grandChild.sourceType)}
										<div class="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-2 py-1.5 text-[11px]">
											<div class="flex items-center gap-1.5 flex-wrap min-w-0">
												<span>{gcSource.icon}</span>
												{#if grandChild.sectionRef}
													<span class="font-mono text-[10px] text-primary font-bold">{grandChild.sectionRef}</span>
												{/if}
												<span class="font-semibold text-foreground truncate">{grandChild.name}</span>
												<span class="px-1 py-0.2 rounded font-mono text-[9px] font-bold border {levelBadgeClass(grandChild.maturityLevel)}">
													{formatLevelShort(grandChild.maturityLevel)}
												</span>
											</div>
											<button
												type="button"
												onclick={() => onSelectSubject(grandChild.mergedWithSubjectId || grandChild.subjectId)}
												class="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary hover:underline cursor-pointer shrink-0"
											>
												<span>Ouvrir</span>
												<ArrowRight class="h-2.5 w-2.5" />
											</button>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				{:else}
					<div class="rounded-xl border border-dashed bg-muted/20 p-4 text-center space-y-2">
						<p class="text-[11px] text-muted-foreground">
							Aucun sous-sujet enfant généré pour ce sujet.
						</p>
						{#if discoveryTree.decision && onProposeAnglesMorts}
							<button
								type="button"
								onclick={onProposeAnglesMorts}
								disabled={isProposingAnglesMorts}
								class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-semibold text-[11px] transition-colors cursor-pointer disabled:opacity-50"
							>
								<Sparkles class="h-3.5 w-3.5 {isProposingAnglesMorts ? 'animate-spin' : ''}" />
								<span>{isProposingAnglesMorts ? 'Analyse des angles morts...' : 'Rechercher des angles morts 🤖'}</span>
							</button>
						{/if}
					</div>
				{/if}
			</div>

			<!-- 4. Règles de référence désactivées sur le projet -->
			{#if discoveryTree.disabledRules.length > 0}
				<div class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-1.5">
					<div class="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
						<XCircle class="h-3.5 w-3.5" />
						<span>Règles neutralisées sur le projet ({discoveryTree.disabledRules.length})</span>
					</div>
					<div class="space-y-1">
						{#each discoveryTree.disabledRules as dr (dr.ruleId)}
							<div class="text-[11px] text-muted-foreground flex items-start gap-1.5">
								<span class="font-mono font-bold text-foreground shrink-0">🚫 {dr.ruleId}</span>
								<span>— {dr.justification}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<div class="p-8 text-center text-muted-foreground border-2 border-dashed rounded-xl">
			Aucune cascade de décision générée pour ce sujet.
		</div>
	{/if}
</div>
