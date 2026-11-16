<script module lang="ts">
	export interface SubjectRequirementItem {
		id: string;
		clauseRef: string;
		title: string;
		criticality: string;
		text?: string;
		sourceTitle?: string;
	}
</script>

<script lang="ts">
	import { FileText, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-svelte';

	let {
		requirements = [],
		unresolvedRefs = [],
		dossierPresent = true,
		isLoading = false,
		defaultOpen = false
	}: {
		requirements?: SubjectRequirementItem[];
		unresolvedRefs?: string[];
		dossierPresent?: boolean;
		isLoading?: boolean;
		defaultOpen?: boolean;
	} = $props();

	let isOpen = $state(defaultOpen);
	let expandedMap = $state<Record<string, boolean>>({});

	const totalCount = $derived(requirements.length + unresolvedRefs.length);

	const criticalityCounts = $derived.by(() => {
		let bloquant = 0;
		let majeur = 0;
		let info = 0;
		for (const r of requirements) {
			const crit = (r.criticality || '').toLowerCase();
			if (crit === 'bloquant') bloquant++;
			else if (crit === 'majeur') majeur++;
			else info++;
		}
		return { bloquant, majeur, info };
	});

	const hasExpandableText = $derived(requirements.some((r) => Boolean(r.text && r.text.trim())));
	const allExpanded = $derived(
		hasExpandableText &&
			requirements.filter((r) => Boolean(r.text && r.text.trim())).every((r) => Boolean(expandedMap[r.id]))
	);

	function toggleItem(id: string) {
		expandedMap = { ...expandedMap, [id]: !expandedMap[id] };
	}

	function toggleAll() {
		const nextState = !allExpanded;
		const next: Record<string, boolean> = {};
		for (const r of requirements) {
			if (r.text && r.text.trim()) {
				next[r.id] = nextState;
			}
		}
		expandedMap = next;
	}

	function criticalityBadgeClass(criticality: string): string {
		const crit = (criticality || '').toLowerCase();
		if (crit === 'bloquant') {
			return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
		}
		if (crit === 'majeur') {
			return 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30';
		}
		return 'bg-muted text-muted-foreground border-border';
	}
</script>

<div
	class="rounded-xl border border-sky-500/25 bg-card/70 overflow-hidden shadow-2xs text-xs"
	data-testid="subject-requirements-drawer"
>
	<button
		type="button"
		data-testid="toggle-subject-requirements-btn"
		onclick={() => (isOpen = !isOpen)}
		class="w-full flex items-center justify-between gap-2 px-3 py-2 bg-sky-500/5 hover:bg-sky-500/10 transition-colors text-left cursor-pointer"
		aria-expanded={isOpen}
	>
		<div class="flex items-center gap-2 min-w-0 flex-wrap">
			<FileText class="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
			<span class="font-bold text-foreground">Exigences RFP rattachées</span>
			<span
				class="px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25"
				data-testid="subject-requirements-count"
			>
				{#if isLoading && totalCount === 0}
					…
				{:else}
					{totalCount}
				{/if}
			</span>
			{#if criticalityCounts.bloquant > 0}
				<span class="px-1.5 py-0.2 rounded text-[10px] font-semibold border bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25">
					{criticalityCounts.bloquant} bloquant
				</span>
			{/if}
			{#if criticalityCounts.majeur > 0}
				<span class="px-1.5 py-0.2 rounded text-[10px] font-semibold border bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/25">
					{criticalityCounts.majeur} majeur
				</span>
			{/if}
			{#if criticalityCounts.info > 0}
				<span class="px-1.5 py-0.2 rounded text-[10px] font-semibold border bg-muted text-muted-foreground border-border">
					{criticalityCounts.info} info
				</span>
			{/if}
		</div>

		<div class="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
			<span class="hidden sm:inline">{isOpen ? 'Masquer' : 'Déplier'}</span>
			{#if isOpen}
				<ChevronUp class="h-3.5 w-3.5" />
			{:else}
				<ChevronDown class="h-3.5 w-3.5" />
			{/if}
		</div>
	</button>

	{#if isOpen}
		<div
			class="p-3 border-t border-sky-500/20 space-y-2 bg-background/60"
			data-testid="subject-requirements-list"
		>
			{#if !dossierPresent && unresolvedRefs.length > 0}
				<div class="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-900 dark:text-amber-200">
					<AlertTriangle class="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
					<div>
						<span class="font-semibold">Dossier d'exigences RFP non enregistré :</span>
						{unresolvedRefs.length} référence(s) sans texte complet ({unresolvedRefs.join(', ')}).
					</div>
				</div>
			{:else if unresolvedRefs.length > 0}
				<div class="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-900 dark:text-amber-200">
					<AlertTriangle class="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
					<span>{unresolvedRefs.length} référence(s) non résolue(s) : {unresolvedRefs.join(', ')}</span>
				</div>
			{/if}

			{#if requirements.length > 0}
				{#if hasExpandableText && requirements.length > 1}
					<div class="flex justify-end">
						<button
							type="button"
							onclick={toggleAll}
							data-testid="toggle-all-requirements-text-btn"
							class="text-[11px] font-semibold text-sky-700 dark:text-sky-300 hover:underline cursor-pointer"
						>
							{allExpanded ? 'Tout replier' : 'Tout déplier'}
						</button>
					</div>
				{/if}

				<ul class="space-y-1.5">
					{#each requirements as req (req.id)}
						{@const isItemExpanded = Boolean(expandedMap[req.id])}
						{@const hasText = Boolean(req.text && req.text.trim())}
						<li
							class="rounded-lg border bg-card/80 p-2 space-y-1.5"
							data-testid="subject-requirement-item"
						>
							<div class="flex items-start justify-between gap-2">
								<div class="flex items-center gap-1.5 flex-wrap min-w-0">
									<span class="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded bg-muted text-foreground">
										{req.clauseRef}
									</span>
									<span class="font-semibold text-foreground leading-snug">{req.title}</span>
									<span
										class="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase border {criticalityBadgeClass(req.criticality)}"
									>
										{req.criticality}
									</span>
								</div>

								{#if hasText}
									<button
										type="button"
										onclick={() => toggleItem(req.id)}
										data-testid={`toggle-requirement-text-${req.clauseRef}`}
										class="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded border bg-muted/40 hover:bg-muted text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
										aria-expanded={isItemExpanded}
									>
										<span>{isItemExpanded ? 'Masquer texte' : 'Texte complet'}</span>
										{#if isItemExpanded}
											<ChevronUp class="h-3 w-3" />
										{:else}
											<ChevronDown class="h-3 w-3" />
										{/if}
									</button>
								{/if}
							</div>

							{#if isItemExpanded && hasText}
								<div
									class="rounded-md bg-muted/30 border border-border/60 p-2 text-[11px] text-muted-foreground whitespace-pre-line leading-relaxed"
									data-testid={`requirement-full-text-${req.clauseRef}`}
								>
									{req.text}
									{#if req.sourceTitle}
										<div class="mt-1.5 pt-1 border-t border-border/50 text-[10px] text-muted-foreground/80">
											Source : {req.sourceTitle}
										</div>
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{:else if unresolvedRefs.length === 0}
				<p class="text-[11px] text-muted-foreground italic">
					{isLoading ? 'Chargement des exigences rattachées…' : 'Aucune exigence RFP rattachée à ce sujet.'}
				</p>
			{/if}
		</div>
	{/if}
</div>
