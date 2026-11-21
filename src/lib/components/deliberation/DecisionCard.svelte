<script lang="ts">
	import {
		CheckCircle2,
		XCircle,
		HelpCircle,
		AlertTriangle,
		FileText,
		Download,
		Printer,
		Scale,
		ShieldAlert,
		Layers,
		Bot,
		User
	} from 'lucide-svelte';
	import {
		KB_VERDICT_LABEL,
		renderDecisionCardMarkdown,
		renderDecisionCardSvg,
		type DecisionCardModel,
		type KbConstraintVerdict,
		type SourceReference
	} from '$lib/domain/decisionCard';

	let {
		card,
		onInspectSource = (_ref: SourceReference) => {}
	}: {
		card: DecisionCardModel;
		onInspectSource?: (ref: SourceReference) => void;
	} = $props();

	function verdictClasses(v: KbConstraintVerdict): string {
		if (v === 'conforme') return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/40';
		if (v === 'viole') return 'bg-rose-500/15 text-rose-800 dark:text-rose-200 border-rose-500/50';
		if (v === 'inconnu') return 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/50';
		return 'bg-orange-500/15 text-orange-900 dark:text-orange-200 border-orange-500/50';
	}

	function heatCellClasses(score: number): string {
		if (score >= 4) return 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 border-emerald-500/30';
		if (score >= 3) return 'bg-sky-500/15 text-sky-900 dark:text-sky-200 border-sky-500/30';
		if (score >= 1) return 'bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-500/30';
		return 'bg-muted/40 text-muted-foreground border-border';
	}

	function argStatusLabel(status: 'open' | 'answered' | 'risk_accepted'): string {
		if (status === 'answered') return 'Répondu';
		if (status === 'risk_accepted') return 'Risque accepté';
		return 'Ouvert';
	}

	function downloadText(content: string, filename: string, mime: string) {
		if (typeof document === 'undefined') return;
		const blob = new Blob([content], { type: mime });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function handleExportMarkdown() {
		downloadText(
			renderDecisionCardMarkdown(card),
			`carte-decision-${card.subjectId}.md`,
			'text/markdown;charset=utf-8'
		);
	}

	function handleExportSvg() {
		downloadText(
			renderDecisionCardSvg(card),
			`carte-decision-${card.subjectId}.svg`,
			'image/svg+xml;charset=utf-8'
		);
	}

	function handlePrint() {
		if (typeof window !== 'undefined') window.print();
	}
</script>

<article
	class="rounded-xl border bg-card p-4 space-y-4 shadow-xs"
	aria-labelledby="decision-card-title"
	data-testid="decision-card"
>
	<!-- En-tête de la carte de décision -->
	<header class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between border-b pb-3">
		<div>
			<div class="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
				Carte de décision · {card.sectionRef}
			</div>
			<h3 id="decision-card-title" class="text-base font-bold text-foreground flex items-center gap-2">
				<Scale class="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
				<span>{card.subjectTitle}</span>
			</h3>
			<p class="text-xs text-muted-foreground mt-0.5">
				Vue déterministe de ce que l'arbitre signe — chaque élément renvoie à sa source.
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-1.5 print:hidden">
			<button
				type="button"
				onclick={handleExportSvg}
				class="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-xs font-semibold hover:bg-muted cursor-pointer"
				data-testid="decision-card-export-svg"
			>
				<Download class="h-3.5 w-3.5" aria-hidden="true" />
				<span>SVG</span>
			</button>
			<button
				type="button"
				onclick={handleExportMarkdown}
				class="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-xs font-semibold hover:bg-muted cursor-pointer"
				data-testid="decision-card-export-md"
			>
				<FileText class="h-3.5 w-3.5" aria-hidden="true" />
				<span>Markdown</span>
			</button>
			<button
				type="button"
				onclick={handlePrint}
				class="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-xs font-semibold hover:bg-muted cursor-pointer"
				data-testid="decision-card-print"
			>
				<Printer class="h-3.5 w-3.5" aria-hidden="true" />
				<span>Imprimer</span>
			</button>
		</div>
	</header>

	<!-- 1. Sources (exigences couvertes) & 2. Contraintes KB -->
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
		<!-- Sources -->
		<section class="rounded-lg border bg-muted/20 p-3 space-y-2" aria-label="Sources et exigences couvertes" data-testid="decision-card-sources">
			<h4 class="text-xs font-bold uppercase tracking-wide text-muted-foreground">
				1. Sources — Exigences couvertes ({card.sources.length})
			</h4>
			{#if card.sources.length === 0}
				<p class="text-xs text-muted-foreground">Aucune exigence directement rattachée à ce sujet.</p>
			{:else}
				<ul class="space-y-1.5">
					{#each card.sources as req (req.id)}
						<li class="flex items-start justify-between gap-2 rounded border bg-background px-2.5 py-1.5 text-xs">
							<button
								type="button"
								onclick={() => onInspectSource(req.sourceRef)}
								class="text-left hover:underline cursor-pointer min-w-0"
							>
								<span class="font-mono font-semibold text-foreground">{req.clauseRef}</span>
								<span class="text-muted-foreground ml-1">{req.title}</span>
							</button>
							<span class="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold">
								{req.criticality}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Contraintes KB -->
		<section class="rounded-lg border bg-muted/20 p-3 space-y-2" aria-label="Contraintes KB applicables" data-testid="decision-card-kb">
			<h4 class="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
				<ShieldAlert class="h-3.5 w-3.5" aria-hidden="true" />
				<span>2. Contraintes KB & verdicts ({card.kbConstraints.length})</span>
			</h4>
			{#if card.kbConstraints.length === 0}
				<p class="text-xs text-muted-foreground">Aucune contrainte KB applicable recensée.</p>
			{:else}
				<ul class="space-y-1.5">
					{#each card.kbConstraints as c (c.id)}
						{@const badge = KB_VERDICT_LABEL[c.verdict]}
						<li class="rounded border bg-background px-2.5 py-2 text-xs space-y-1">
							<div class="flex flex-wrap items-center justify-between gap-1.5">
								<button
									type="button"
									onclick={() => onInspectSource(c.sourceRef)}
									class="font-semibold text-foreground hover:underline cursor-pointer text-left"
								>
									{c.title}
								</button>
								<div class="flex items-center gap-1.5 shrink-0">
									<span class="rounded border px-1.5 py-0.5 text-[10px] font-semibold {c.ruleStatus === 'draft' ? 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-400/40' : 'bg-primary/10 text-primary border-primary/30'}">
										{c.ruleStatus === 'draft' ? 'Brouillon' : 'Validée'}
									</span>
									<span
										class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold {verdictClasses(c.verdict)}"
										data-verdict={c.verdict}
									>
										{#if c.verdict === 'conforme'}
											<CheckCircle2 class="h-3 w-3" aria-hidden="true" />
										{:else if c.verdict === 'viole'}
											<XCircle class="h-3 w-3" aria-hidden="true" />
										{:else if c.verdict === 'inconnu'}
											<HelpCircle class="h-3 w-3" aria-hidden="true" />
										{:else}
											<AlertTriangle class="h-3 w-3" aria-hidden="true" />
										{/if}
										<span>{badge.text}</span>
									</span>
								</div>
							</div>
							{#if c.reason}
								<p class="text-[11px] text-muted-foreground">{c.reason}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	<!-- 3. Matrice thermique Options × Critères pondérés -->
	<section class="rounded-lg border bg-muted/20 p-3 space-y-2" aria-label="Matrice options et critères pondérés" data-testid="decision-card-matrix">
		<h4 class="text-xs font-bold uppercase tracking-wide text-muted-foreground">
			3. Options × Critères pondérés (score & décomposition)
		</h4>
		{#if card.optionsMatrix.length === 0}
			<p class="text-xs text-muted-foreground">Aucune option évaluée.</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-left text-xs border-collapse">
					<thead class="border-b bg-muted/50 text-[11px] text-muted-foreground">
						<tr>
							<th scope="col" class="px-2.5 py-1.5 font-semibold">Option</th>
							{#each card.criteria as crit (crit.id)}
								<th scope="col" class="px-2 py-1.5 font-semibold text-center">
									{crit.name} <span class="font-mono">(×{crit.weight})</span>
								</th>
							{/each}
							<th scope="col" class="px-2.5 py-1.5 font-semibold text-right">Score total</th>
						</tr>
					</thead>
					<tbody>
						{#each card.optionsMatrix as row (row.optionId)}
							<tr class="border-b last:border-b-0 {row.isRetained ? 'bg-primary/5' : ''}">
								<th scope="row" class="px-2.5 py-2 font-semibold text-foreground">
									<button
										type="button"
										onclick={() => onInspectSource(row.sourceRef)}
										class="hover:underline cursor-pointer text-left"
									>
										{row.isRetained ? '★ ' : ''}{row.title}
									</button>
									<span class="ml-1.5 text-[10px] font-normal text-muted-foreground">
										{row.isRetained ? '(Retenue)' : '(Écartée)'}
									</span>
								</th>
								{#each row.breakdown as cell (cell.criterionId)}
									<td class="px-2 py-1.5 text-center">
										<span
											class="inline-block rounded border px-2 py-0.5 font-mono text-[11px] font-semibold {heatCellClasses(cell.score)}"
											title={cell.justification || `${cell.score}/5`}
										>
											{cell.score}/5 ({cell.weightedScore})
										</span>
									</td>
								{/each}
								<td class="px-2.5 py-2 text-right font-mono font-bold text-foreground">
									{row.totalScore}/{row.maxPossibleScore} ({row.normalizedPct}%)
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<!-- 4. Arguments par option -->
	<section class="rounded-lg border bg-muted/20 p-3 space-y-2" aria-label="Arguments et objections par option" data-testid="decision-card-arguments">
		<h4 class="text-xs font-bold uppercase tracking-wide text-muted-foreground">
			4. Arguments pour / contre / objections (statut & origine)
		</h4>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
			{#each card.optionsMatrix as row (row.optionId)}
				{@const args = card.argumentsByOption[row.optionId] ?? []}
				<div class="rounded border bg-background p-2.5 space-y-1.5">
					<div class="text-xs font-bold text-foreground">{row.title} ({args.length})</div>
					{#if args.length === 0}
						<p class="text-[11px] text-muted-foreground">Aucun argument enregistré.</p>
					{:else}
						<ul class="space-y-1.5">
							{#each args as arg (arg.id)}
								<li class="rounded border bg-muted/20 px-2 py-1.5 text-[11px] space-y-1">
									<div class="flex flex-wrap items-center gap-1.5">
										<span class="rounded border px-1.5 py-0.5 font-semibold uppercase text-[10px]">
											{arg.type === 'pro' ? '+ Pour' : arg.type === 'con' ? '− Contre' : '⚠ Objection'}
										</span>
										<span class="rounded border px-1.5 py-0.5 text-[10px] font-medium">
											{argStatusLabel(arg.status)}
										</span>
										<span class="inline-flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
											{#if arg.origin === 'agent'}
												<Bot class="h-3 w-3" aria-hidden="true" />
												<span>Agent</span>
											{:else}
												<User class="h-3 w-3" aria-hidden="true" />
												<span>Humain</span>
											{/if}
											· {arg.author}
										</span>
									</div>
									<p class="text-foreground">{arg.content}</p>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</div>
	</section>

	<!-- 5. Décision & 6. Conséquences (dry-run Nautobot) -->
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
		<section class="rounded-lg border bg-muted/20 p-3 space-y-2" aria-label="Décision et écarts acceptés" data-testid="decision-card-verdict">
			<h4 class="text-xs font-bold uppercase tracking-wide text-muted-foreground">
				5. Décision, réversibilité & écarts acceptés
			</h4>
			<dl class="space-y-1.5 text-xs">
				<div>
					<dt class="text-[10px] uppercase text-muted-foreground">Option retenue</dt>
					<dd class="font-bold text-foreground">{card.decision.retainedOptionTitle ?? 'Non sélectionnée'}</dd>
				</div>
				<div>
					<dt class="text-[10px] uppercase text-muted-foreground">Réversibilité</dt>
					<dd class="font-medium text-foreground">{card.decision.reversibility ?? 'Non précisée'}</dd>
				</div>
				<div>
					<dt class="text-[10px] uppercase text-muted-foreground">Motivation</dt>
					<dd class="text-foreground whitespace-pre-line">{card.decision.rationale || 'En cours de rédaction.'}</dd>
				</div>
			</dl>
			{#if card.decision.acceptedDeviations.length > 0}
				<div class="pt-1 border-t space-y-1">
					<div class="text-[11px] font-bold text-amber-800 dark:text-amber-200">
						Écarts acceptés ({card.decision.acceptedDeviations.length})
					</div>
					<ul class="space-y-1">
						{#each card.decision.acceptedDeviations as dev (dev.id)}
							<li class="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px]">
								<strong>{dev.label}</strong> : {dev.justification}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>

		<section class="rounded-lg border bg-muted/20 p-3 space-y-2" aria-label="Conséquences planifiées dans Nautobot" data-testid="decision-card-consequences">
			<h4 class="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
				<Layers class="h-3.5 w-3.5" aria-hidden="true" />
				<span>6. Conséquences planifiées (dry-run Nautobot : {card.consequences.plannedObjects.length})</span>
			</h4>
			{#if card.consequences.plannedObjects.length === 0}
				<p class="text-xs text-muted-foreground">Aucun objet Nautobot planifié en dry-run pour cette décision.</p>
			{:else}
				<ul class="space-y-1.5">
					{#each card.consequences.plannedObjects as obj (obj.id)}
						<li class="rounded border bg-background px-2.5 py-1.5 text-xs flex items-center justify-between gap-2">
							<span class="font-mono text-foreground">[{obj.action}] {obj.kind} · {obj.label}</span>
							{#if obj.intentHash}
								<span class="font-mono text-[10px] text-muted-foreground">{obj.intentHash.slice(0, 10)}</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if card.consequences.impactedDependencies.length > 0}
				<div class="pt-1 border-t space-y-1">
					<div class="text-[11px] font-semibold text-muted-foreground">Dépendances impactées</div>
					<div class="flex flex-wrap gap-1.5">
						{#each card.consequences.impactedDependencies as dep (dep.id)}
							<span class="rounded border bg-background px-2 py-0.5 text-[11px]">{dep.label}</span>
						{/each}
					</div>
				</div>
			{/if}
		</section>
	</div>
</article>
