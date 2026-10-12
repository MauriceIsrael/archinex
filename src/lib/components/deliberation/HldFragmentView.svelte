<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { HldFragment } from '$lib/domain/hldFragment';
	import { FileText, Download, Copy, Check, RefreshCw, AlertTriangle, Bot } from 'lucide-svelte';

	const activeSubject = $derived(deliberationStore.activeSubject);
	const projectId = $derived(deliberationStore.activeEngagement?.id);

	let fragment = $state<HldFragment | null>(null);
	let markdown = $state('');
	let isLoading = $state(false);
	let loadError = $state('');
	let copied = $state(false);
	let isRepairing = $state(false);

	async function load(pId: string, sId: string) {
		isLoading = true;
		loadError = '';
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(pId)}/subjects/${encodeURIComponent(sId)}/hld-fragment`);
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
			fragment = data.fragment;
			markdown = data.markdown;
		} catch (err) {
			fragment = null;
			markdown = '';
			loadError = err instanceof Error ? err.message : String(err);
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		if (projectId && activeSubject?.id) void load(projectId, activeSubject.id);
	});

	async function repairRequirements() {
		if (!projectId || !activeSubject) return;
		isRepairing = true;
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/requirements/from-run`, { method: 'POST' });
			const data = await res.json();
			if (!res.ok) throw new Error(data.reason || data.error || `HTTP ${res.status}`);
			const total = (data.saved ?? []).reduce((acc: number, s: { clauses: number }) => acc + s.clauses, 0);
			deliberationStore.logNotification(`Dossier d'exigences enregistré : ${total} clauses, depuis l'analyse du RFP.`, 'success');
			await load(projectId, activeSubject.id);
		} catch (err) {
			deliberationStore.logNotification(`Dossier d'exigences non enregistré : ${err instanceof Error ? err.message : err}`, 'warning');
		} finally {
			isRepairing = false;
		}
	}

	function download() {
		if (!fragment) return;
		const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `hld-${fragment.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase()}.md`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	async function copy() {
		await navigator.clipboard.writeText(markdown);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const scoreClass = (s: number) =>
		s > 0 ? 'text-emerald-700 dark:text-emerald-300' : s < 0 ? 'text-destructive' : 'text-muted-foreground';
	const statusClass = {
		decided: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
		awaiting_review: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40',
		undecided: 'bg-muted text-muted-foreground border-border'
	};
</script>

<section class="rounded-2xl border bg-card p-4 sm:p-5 shadow-sm space-y-4 text-xs" data-testid="hld-fragment">
	<div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
		<div class="flex items-start gap-2.5">
			<div class="p-2 rounded-lg bg-primary/10 text-primary"><FileText class="h-5 w-5" /></div>
			<div>
				<h2 class="text-sm font-bold text-foreground">Fragment du dossier de conception (HLD)</h2>
				<p class="text-muted-foreground">
					Construit à partir de la délibération enregistrée, sans rédaction par le modèle. Structure : modèle ADR d'ArcKit.
				</p>
			</div>
		</div>
		<div class="flex items-center gap-1.5 shrink-0">
			<button type="button" onclick={() => projectId && activeSubject && load(projectId, activeSubject.id)} class="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-semibold hover:bg-muted cursor-pointer" title="Recharger depuis la délibération">
				<RefreshCw class="h-3.5 w-3.5 {isLoading ? 'animate-spin' : ''}" />
			</button>
			<button type="button" onclick={copy} disabled={!fragment} class="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-semibold hover:bg-muted disabled:opacity-50 cursor-pointer">
				{#if copied}<Check class="h-3.5 w-3.5" />{:else}<Copy class="h-3.5 w-3.5" />{/if}
				<span>Copier (Markdown)</span>
			</button>
			<button type="button" onclick={download} disabled={!fragment} class="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-2.5 py-1.5 font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer">
				<Download class="h-3.5 w-3.5" />
				<span>.md</span>
			</button>
		</div>
	</div>

	{#if !activeSubject}
		<p class="text-muted-foreground">Sélectionnez un sujet.</p>
	{:else if loadError}
		<p class="text-destructive">Fragment indisponible : {loadError}</p>
	{:else if fragment}
		<div class="flex flex-wrap items-center gap-2">
			<h3 class="text-sm font-bold text-foreground">{fragment.title}</h3>
			<span class="rounded-md border px-1.5 py-0.5 text-[10px] font-bold {statusClass[fragment.status]}">{fragment.statusLabel}</span>
		</div>
		{#if fragment.status === 'undecided'}
			<p class="rounded-lg bg-muted/60 p-2 text-muted-foreground">Sujet non tranché : le fragment montre l'état de la délibération, sans décision.</p>
		{:else if fragment.status === 'awaiting_review'}
			<p class="rounded-lg bg-amber-500/10 p-2 text-amber-800 dark:text-amber-200">Décision en revue : elle doit être affirmée par un décideur distinct de son auteur avant d'entrer dans le dossier.</p>
		{/if}

		<dl class="grid grid-cols-2 sm:grid-cols-4 gap-2">
			{#each fragment.control as c (c.label)}
				<div class="rounded-lg border p-2"><dt class="text-[10px] uppercase text-muted-foreground font-semibold">{c.label}</dt><dd class="font-semibold text-foreground break-words">{c.value}</dd></div>
			{/each}
		</dl>

		<div class="space-y-1">
			<h4 class="font-bold text-foreground">Contexte et problème</h4>
			<p class="leading-relaxed">{fragment.context.problem}</p>
			{#if fragment.context.nature}<p class="text-muted-foreground">Nature : {fragment.context.nature}</p>{/if}
			{#if fragment.context.dependsOn.length}<p class="text-muted-foreground">À trancher avant : {fragment.context.dependsOn.join(' ; ')}</p>{/if}
		</div>

		<div class="space-y-1.5">
			<h4 class="font-bold text-foreground">Exigences couvertes ({fragment.requirements.items.length})</h4>
			{#if !fragment.requirements.dossierPresent && fragment.requirements.unresolvedRefs.length}
				<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
					<span class="flex items-center gap-1.5"><AlertTriangle class="h-3.5 w-3.5 text-amber-600 shrink-0" />Le dossier d'exigences du RFP n'est pas enregistré pour ce projet : {fragment.requirements.unresolvedRefs.length} référence(s) sans texte.</span>
					<button type="button" onclick={repairRequirements} disabled={isRepairing} class="shrink-0 rounded-lg bg-amber-600 text-white px-2.5 py-1 font-semibold hover:bg-amber-700 disabled:opacity-60 cursor-pointer">
						{isRepairing ? 'Enregistrement…' : "Enregistrer depuis l'analyse du RFP"}
					</button>
				</div>
			{/if}
			{#if fragment.requirements.items.length}
				<ul class="space-y-1">
					{#each fragment.requirements.items as r (r.id)}
						<li class="rounded border p-1.5"><span class="font-mono font-bold">{r.clauseRef}</span> · {r.title} <span class="text-[10px] text-muted-foreground">({r.criticality})</span></li>
					{/each}
				</ul>
			{:else if fragment.requirements.dossierPresent}
				<p class="text-muted-foreground">Aucune exigence rattachée.</p>
			{/if}
		</div>

		<div class="space-y-1.5">
			<h4 class="font-bold text-foreground">Critères de décision</h4>
			{#if fragment.drivers.length}
				<div class="flex flex-wrap gap-1.5">
					{#each fragment.drivers as d (d.name)}
						<span class="rounded-md border px-2 py-0.5" title={d.description}>{d.name} <span class="text-muted-foreground">· {d.kind} · poids {d.weight}</span></span>
					{/each}
				</div>
			{:else}<p class="text-muted-foreground">Aucun critère posé.</p>{/if}
		</div>

		<div class="space-y-2">
			<h4 class="font-bold text-foreground">Options étudiées</h4>
			{#each fragment.options as o (o.id)}
				<div class="rounded-lg border p-2.5 space-y-1.5 {o.status === 'retained' ? 'border-emerald-500/50 bg-emerald-500/5' : ''}">
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-bold text-foreground">{o.title}</span>
						{#if o.status === 'retained'}<span class="rounded bg-emerald-600 text-white px-1.5 py-0.5 text-[10px] font-bold">Retenue</span>{/if}
						{#if o.status === 'rejected'}<span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold">Écartée</span>{/if}
						{#if o.proposedByModel}<span class="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Bot class="h-3 w-3" />proposée par le modèle</span>{/if}
						{#if o.weightedScore !== null}<span class="ml-auto font-mono text-[10px] {scoreClass(o.weightedScore)}">score pondéré {o.weightedScore}</span>{/if}
					</div>
					<p class="text-muted-foreground">{o.summary}</p>
					{#if o.scores.length}
						<table class="w-full text-[11px]">
							<tbody>
								{#each o.scores as s (s.criterion)}
									<tr class="border-t"><td class="py-1 pr-2 font-semibold">{s.criterion}</td><td class="py-1 pr-2 font-mono {scoreClass(s.score)}">{s.score > 0 ? `+${s.score}` : s.score}</td><td class="py-1 text-muted-foreground">{s.justification}</td></tr>
								{/each}
							</tbody>
						</table>
					{/if}
					{#if o.rejectionReason}<p><span class="font-semibold">Écartée :</span> {o.rejectionReason}</p>{/if}
				</div>
			{/each}
			{#if fragment.singleOptionRationale}<p><span class="font-semibold">Option unique :</span> {fragment.singleOptionRationale}</p>{/if}
		</div>

		<div class="space-y-1">
			<h4 class="font-bold text-foreground">Décision</h4>
			{#if fragment.decision}
				<p class="rounded-lg bg-primary/5 border border-primary/20 p-2 leading-relaxed">{fragment.decision.yStatement}</p>
				<p class="text-muted-foreground">Réversibilité : {fragment.decision.reversibility}</p>
			{:else}<p class="text-muted-foreground">Sujet non tranché.</p>{/if}
		</div>

		{#if fragment.consequences.acceptedViolations.length || fragment.consequences.acceptedRisks.length}
			<div class="space-y-1">
				<h4 class="font-bold text-foreground">Conséquences et risques acceptés</h4>
				<ul class="list-disc pl-5">
					{#each fragment.consequences.acceptedViolations as v (v)}<li>Écart accepté : {v}</li>{/each}
					{#each fragment.consequences.acceptedRisks as r (r)}<li>Risque accepté : {r}</li>{/each}
				</ul>
			</div>
		{/if}

		{#if fragment.consequences.coverageWarnings?.length}
			<div class="space-y-1">
				<h4 class="font-bold text-foreground">Vérification réglementaire</h4>
				{#each fragment.consequences.coverageWarnings as warning (warning)}
					<p class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">{warning}</p>
				{/each}
			</div>
		{/if}

		{#if fragment.openPoints.length}
			<div class="space-y-1">
				<h4 class="font-bold text-foreground">Points ouverts</h4>
				<ul class="list-disc pl-5">{#each fragment.openPoints as p (p)}<li>{p}</li>{/each}</ul>
			</div>
		{/if}

		<p class="text-[10px] text-muted-foreground border-t pt-2">
			Provenance : {fragment.provenance.modelProposedOptions} option(s) et {fragment.provenance.modelEvaluations} évaluation(s) proposées par le modèle ;
			{fragment.provenance.humanOptions} option(s) et {fragment.provenance.humanEvaluations} évaluation(s) d'origine humaine.
		</p>
	{:else if isLoading}
		<p class="text-muted-foreground">Chargement…</p>
	{/if}
</section>
