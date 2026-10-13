<script lang="ts">
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import Check from 'lucide-svelte/icons/check';
  import Edit from 'lucide-svelte/icons/edit';
  import X from 'lucide-svelte/icons/x';
  import FlaskConical from 'lucide-svelte/icons/flask-conical';
  import { invalidateAll } from '$app/navigation';
  import type { CheckClauseRow, CheckClausesList, CheckClauseDecision, AssetClauseTrialVerdict } from '$lib/types/llmops';

  interface Props {
    data: {
      framework: string | null;
      clauses: CheckClausesList | null;
      error: string | null;
      expert: { handle: string | null; canPublish: boolean };
    };
  }

  let { data }: Props = $props();

  type Tab = 'draft' | 'validated' | 'rejected' | 'missing';
  let rows = $state<CheckClauseRow[]>([]);
  let pending = $state(0);
  $effect(() => {
    rows = data.clauses?.clauses ?? [];
    pending = data.clauses?.pending_publication ?? 0;
  });
  let tab = $state<Tab>('draft');
  let frameworkFilter = $state('');
  let search = $state('');

  const frameworks = $derived([...new Set(rows.map((r) => r.framework).filter((f): f is string => Boolean(f)))].sort());
  const counts = $derived({
    draft: rows.filter((r) => r.status === 'draft').length,
    validated: rows.filter((r) => r.status === 'validated').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    missing: data.clauses?.mandatory_without_clause.length ?? 0
  });

  function matches(text: string): boolean {
    const q = search.trim().toLowerCase();
    return !q || text.toLowerCase().includes(q);
  }

  // Clauses de l'onglet, regroupées par actif ; contrôles obligatoires d'abord
  const groups = $derived.by(() => {
    const visible = rows.filter(
      (r) =>
        tab !== 'missing' &&
        (r.status === tab || feedback[key(r)]?.ok) && // une clause qui vient d'être décidée reste visible
        (!frameworkFilter || r.framework === frameworkFilter) &&
        matches(`${r.asset_id} ${r.asset_title} ${r.asset_title_fr ?? ''} ${r.message ?? ''} ${r.check_id}`)
    );
    const byAsset = new Map<string, CheckClauseRow[]>();
    for (const r of visible) byAsset.set(r.asset_id, [...(byAsset.get(r.asset_id) ?? []), r]);
    const rank = (r: CheckClauseRow) => (r.asset_type === 'control' ? (r.severity === 'mandatory' ? 0 : 1) : r.asset_type === 'principle' ? 2 : 3);
    return [...byAsset.values()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].asset_id.localeCompare(b[0].asset_id));
  });

  const missing = $derived(
    (data.clauses?.mandatory_without_clause ?? []).filter(
      (m) => (!frameworkFilter || m.framework === frameworkFilter) && matches(`${m.asset_id} ${m.asset_title} ${m.asset_title_fr ?? ''}`)
    )
  );

  const key = (r: CheckClauseRow) => `${r.asset_id}/${r.check_id}`;

  // --- Décision ---------------------------------------------------------------------------------
  let busy = $state<string | null>(null);
  let feedback = $state<Record<string, { ok: boolean; text: string }>>({});
  let editing = $state<string | null>(null);
  let rejecting = $state<string | null>(null);
  let comment = $state('');
  let draftWhen = $state('');
  let draftExpect = $state('');
  let draftMessage = $state('');

  const lines = (text: string) => text.split(/\r?\n|,/).map((t) => t.trim()).filter(Boolean);

  function startAmend(r: CheckClauseRow) {
    editing = key(r);
    rejecting = null;
    comment = '';
    draftWhen = (r.when.terms_any ?? []).join('\n');
    draftExpect = (r.expect?.terms_any ?? []).join('\n');
    draftMessage = r.message ?? '';
  }

  function startReject(r: CheckClauseRow) {
    rejecting = key(r);
    editing = null;
    comment = '';
  }

  function amendedClause(r: CheckClauseRow) {
    return {
      kind: r.kind,
      when: { ...r.when, terms_any: lines(draftWhen) },
      ...(r.kind === 'requires' ? { expect: { ...(r.expect ?? {}), terms_any: lines(draftExpect) } } : {}),
      message: draftMessage.trim()
    };
  }

  async function decide(r: CheckClauseRow, decision: CheckClauseDecision) {
    const k = key(r);
    busy = k;
    try {
      const res = await fetch(`/api/kb/clauses/${encodeURIComponent(r.asset_id)}/${encodeURIComponent(r.check_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          ...(decision !== 'validate' ? { comment } : {}),
          ...(decision === 'amend' ? { clause: amendedClause(r) } : {})
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        feedback = { ...feedback, [k]: { ok: false, text: body.error || `Erreur HTTP ${res.status}` } };
        return;
      }
      const updated = body.data as CheckClauseRow;
      rows = rows.map((row) => (key(row) === k ? { ...row, ...updated, may_decide: row.may_decide } : row));
      pending += 1;
      editing = null;
      rejecting = null;
      const verb = decision === 'reject' ? 'rejetée' : decision === 'amend' ? 'amendée et validée' : 'validée';
      feedback = { ...feedback, [k]: { ok: true, text: `Clause ${verb}. Elle s'appliquera aux arbitrages après publication.` } };
    } finally {
      busy = null;
    }
  }

  // --- Essai sur une option ---------------------------------------------------------------------
  let trying = $state<string | null>(null);
  let trialTitle = $state('');
  let trialDescription = $state('');
  let trial = $state<Record<string, { verdicts: AssetClauseTrialVerdict[]; error?: string }>>({});

  function assetChecks(r: CheckClauseRow) {
    // Toutes les clauses de l'actif, la clause essayée dans sa version en cours d'amendement le cas échéant
    return rows
      .filter((x) => x.asset_id === r.asset_id && x.status !== 'rejected')
      .map((x) => {
        const c = editing === key(x) ? amendedClause(x) : { kind: x.kind, when: x.when, expect: x.expect ?? undefined, message: x.message ?? '' };
        return { id: x.check_id, ...c, ...(c.kind === 'forbids' ? { expect: undefined } : {}) };
      })
      .map((c) => JSON.parse(JSON.stringify(c)));
  }

  async function runTrial(r: CheckClauseRow) {
    const k = key(r);
    busy = `try:${k}`;
    try {
      const res = await fetch(`/api/kb/clauses/${encodeURIComponent(r.asset_id)}/try`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checks: assetChecks(r), option: { title: trialTitle, description: trialDescription } })
      });
      const body = await res.json().catch(() => ({}));
      trial = { ...trial, [k]: res.ok ? { verdicts: body.data ?? [] } : { verdicts: [], error: body.error || `Erreur HTTP ${res.status}` } };
    } finally {
      busy = null;
    }
  }

  function trialVerdict(r: CheckClauseRow) {
    const t = trial[key(r)];
    return t ? { error: t.error, verdict: t.verdicts.find((v) => v.check_id === r.check_id) } : null;
  }

  // --- Publication --------------------------------------------------------------------------------
  let publishing = $state(false);
  let publishMessage = $state<{ ok: boolean; text: string } | null>(null);

  async function publish() {
    publishing = true;
    publishMessage = null;
    try {
      const res = await fetch('/api/knowledge/publications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        publishMessage = { ok: false, text: body.error || `Erreur HTTP ${res.status}` };
        return;
      }
      publishMessage = { ok: true, text: `Publié dans l'instantané ${body.data?.snapshot_id ?? ''} : les clauses validées s'appliquent désormais aux arbitrages.` };
      await invalidateAll();
    } finally {
      publishing = false;
    }
  }

  const kindLabel = (k: string) => (k === 'forbids' ? 'Interdit' : 'Exige');
  const statusLabel: Record<string, string> = { draft: 'Brouillon : avertit seulement', validated: 'Validée : bloque', rejected: 'Rejetée : non évaluée' };
  const decisionLabel: Record<string, string> = { validate: 'validée', amend: 'amendée', reject: 'rejetée' };
</script>

<div class="space-y-5 max-w-6xl mx-auto px-4 py-6" data-testid="kb-clauses-page">
  <div class="border-b border-border pb-4">
    <h1 class="text-2xl font-bold text-foreground flex items-center gap-2">
      <ShieldCheck class="w-6 h-6 text-primary" /> Clauses vérifiables
    </h1>
    <p class="text-sm text-muted-foreground mt-1">
      Une clause « exige / interdit » ne bloque un arbitrage que lorsqu'elle est <strong>validée</strong>. Relisez chaque clause,
      essayez-la sur une option, puis validez, amendez ou rejetez-la. Les décisions s'appliquent après publication.
    </p>
    {#if data.expert.handle}
      <p class="text-xs text-muted-foreground mt-1">Vous décidez en tant que <span class="font-mono font-semibold">{data.expert.handle}</span>.</p>
    {:else}
      <p class="text-xs text-amber-600 mt-1">Votre compte n'est pas un responsable déclaré dans LLMOps : lecture seule.</p>
    {/if}
  </div>

  {#if data.error}
    <div class="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" data-testid="clauses-error">
      <AlertTriangle class="inline w-4 h-4 mr-1" />{data.error}
    </div>
  {:else}
    {#if pending > 0 || publishMessage}
      <div class="rounded-lg border border-primary/40 bg-primary/5 p-3 flex flex-wrap items-center justify-between gap-3 text-sm" data-testid="pending-publication">
        {#if publishMessage}
          <span class={publishMessage.ok ? 'text-emerald-600' : 'text-destructive'}>{publishMessage.text}</span>
        {:else}
          <span>
            <strong>{pending}</strong> décision(s) en attente de publication : elles ne s'appliquent aux arbitrages qu'une fois publiées.
          </span>
        {/if}
        {#if pending > 0}
          {#if data.expert.canPublish}
            <button
              onclick={publish}
              disabled={publishing}
              data-testid="btn-publish-clauses"
              class="px-4 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {#if publishing}<RefreshCw class="w-4 h-4 animate-spin" />{/if} Publier
            </button>
          {:else}
            <span class="text-xs text-muted-foreground">La publication est faite par un mainteneur (rôle kb:maintain).</span>
          {/if}
        {/if}
      </div>
    {/if}

    <div class="flex flex-wrap items-center gap-2">
      {#each [['draft', 'À relire'], ['validated', 'Validées'], ['rejected', 'Rejetées'], ['missing', 'Contrôles sans clause']] as [value, label] (value)}
        <button
          onclick={() => (tab = value as Tab)}
          data-testid="tab-{value}"
          class="px-3 py-1.5 rounded-md text-sm font-medium border {tab === value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}"
        >
          {label} ({counts[value as Tab]})
        </button>
      {/each}
      <select bind:value={frameworkFilter} class="ml-auto rounded-md border border-border bg-background px-2 py-1.5 text-sm" aria-label="Référentiel">
        <option value="">Tous les référentiels et la doctrine</option>
        {#each frameworks as fw (fw)}<option value={fw}>{fw}</option>{/each}
      </select>
      <input bind:value={search} placeholder="Rechercher…" class="rounded-md border border-border bg-background px-2 py-1.5 text-sm w-48" />
    </div>

    {#if tab === 'missing'}
      <p class="text-sm text-muted-foreground">
        Ces contrôles obligatoires ne portent aucune clause : rien ne peut bloquer une option qui les enfreint. La rédaction assistée
        d'une clause viendra dans un second temps ; d'ici là, une clause peut être proposée par un amendement dans l'atelier de doctrine.
      </p>
      {#each missing as m (m.asset_id)}
        <div class="rounded-lg border border-border bg-card p-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-xs text-muted-foreground">{m.asset_id}</span>
            <span class="font-semibold">{m.asset_title_fr || m.asset_title}</span>
            {#if m.framework}<span class="text-xs px-1.5 py-0.5 rounded bg-muted">{m.framework}</span>{/if}
          </div>
          {#if m.source_ref}<p class="text-xs text-muted-foreground mt-1">{m.source_ref}</p>{/if}
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">Aucun contrôle obligatoire sans clause.</p>
      {/each}
    {:else}
      {#each groups as group (group[0].asset_id)}
        {@const a = group[0]}
        <section class="rounded-lg border border-border bg-card" data-testid="asset-{a.asset_id}">
          <header class="p-3 border-b border-border">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-xs text-muted-foreground">{a.asset_id}</span>
              <span class="font-semibold">{a.asset_title_fr || a.asset_title}</span>
              {#if a.framework}<span class="text-xs px-1.5 py-0.5 rounded bg-muted">{a.framework}</span>{/if}
              <span class="text-xs px-1.5 py-0.5 rounded bg-muted">{a.asset_type}{a.severity ? ` · ${a.severity}` : ''}</span>
              {#if a.domain.length}<span class="text-xs text-muted-foreground">{a.domain.join(', ')}</span>{/if}
            </div>
            {#if a.source_ref}<p class="text-xs text-muted-foreground mt-1">{a.source_ref}</p>{/if}
            <details class="mt-2">
              <summary class="text-xs text-primary cursor-pointer">Texte de l'élément</summary>
              <p class="text-xs whitespace-pre-line mt-1 text-muted-foreground">{a.asset_excerpt}</p>
            </details>
          </header>

          {#each group as r (r.check_id)}
            {@const k = key(r)}
            {@const tv = trialVerdict(r)}
            <div class="p-3 border-b border-border last:border-b-0 space-y-2" data-testid="clause-{r.check_id}">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs font-bold px-2 py-0.5 rounded {r.kind === 'forbids' ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary'}">{kindLabel(r.kind)}</span>
                <span class="font-mono text-xs text-muted-foreground">{r.check_id}</span>
                <span class="text-xs px-1.5 py-0.5 rounded {r.status === 'validated' ? 'bg-emerald-500/15 text-emerald-600' : r.status === 'rejected' ? 'bg-muted text-muted-foreground line-through' : 'bg-amber-500/15 text-amber-600'}">
                  {statusLabel[r.status]}
                </span>
                {#if r.review}
                  <span class="text-xs text-muted-foreground">
                    {decisionLabel[r.review.decision]} par {r.review.by} le {new Date(r.review.at).toLocaleDateString()}{r.review.comment ? ` — ${r.review.comment}` : ''}
                  </span>
                {/if}
              </div>

              {#if editing === k}
                <div class="grid md:grid-cols-2 gap-2 text-sm">
                  <label class="space-y-1">
                    <span class="text-xs font-semibold">Se déclenche si l'option mentionne (un terme par ligne)</span>
                    <textarea bind:value={draftWhen} rows="5" class="w-full rounded-md border border-border bg-background p-2 text-xs font-mono"></textarea>
                  </label>
                  {#if r.kind === 'requires'}
                    <label class="space-y-1">
                      <span class="text-xs font-semibold">…et doit alors mentionner l'un de (un terme par ligne)</span>
                      <textarea bind:value={draftExpect} rows="5" class="w-full rounded-md border border-border bg-background p-2 text-xs font-mono"></textarea>
                    </label>
                  {/if}
                  <label class="space-y-1 md:col-span-2">
                    <span class="text-xs font-semibold">Message montré à l'architecte</span>
                    <input bind:value={draftMessage} class="w-full rounded-md border border-border bg-background p-2 text-sm" />
                  </label>
                </div>
              {:else}
                <div class="text-sm space-y-1">
                  <p>
                    <span class="text-xs text-muted-foreground">Se déclenche si l'option mentionne {r.when.terms_all?.length ? 'tous ces termes' : "l'un de ces termes"} :</span>
                    {#each [...(r.when.terms_any ?? []), ...(r.when.terms_all ?? [])] as term}<span class="inline-block text-xs font-mono px-1.5 py-0.5 m-0.5 rounded bg-muted">{term}</span>{/each}
                  </p>
                  {#if r.kind === 'requires' && r.expect}
                    <p>
                      <span class="text-xs text-muted-foreground">…et doit alors mentionner l'un de :</span>
                      {#each [...(r.expect.terms_any ?? []), ...(r.expect.terms_all ?? [])] as term}<span class="inline-block text-xs font-mono px-1.5 py-0.5 m-0.5 rounded bg-primary/10">{term}</span>{/each}
                    </p>
                  {/if}
                  {#if r.message}<p class="text-sm italic">« {r.message} »</p>{/if}
                </div>
              {/if}

              {#if trying === k}
                <div class="rounded-md border border-border p-2 space-y-2 bg-muted/30">
                  <input bind:value={trialTitle} placeholder="Titre de l'option (ex. : Site unique sans sauvegarde)" class="w-full rounded-md border border-border bg-background p-1.5 text-sm" />
                  <textarea bind:value={trialDescription} rows="2" placeholder="Description de l'option" class="w-full rounded-md border border-border bg-background p-1.5 text-sm"></textarea>
                  <button
                    onclick={() => runTrial(r)}
                    disabled={!trialTitle.trim() || busy === `try:${k}`}
                    data-testid="btn-run-trial"
                    class="px-3 py-1.5 rounded-md border border-border text-sm disabled:opacity-50"
                  >Essayer</button>
                  {#if tv}
                    {#if tv.error}
                      <p class="text-xs text-destructive">{tv.error}</p>
                    {:else if tv.verdict}
                      <p class="text-sm {tv.verdict.verdict === 'violates' ? 'text-destructive' : 'text-emerald-600'}" data-testid="trial-verdict">
                        {tv.verdict.verdict === 'violates' ? 'Viole la clause' : 'Respecte la clause'}
                        {#if tv.verdict.matched_terms.length}(termes reconnus : {tv.verdict.matched_terms.join(', ')}){/if}
                      </p>
                    {:else}
                      <p class="text-sm text-muted-foreground" data-testid="trial-verdict">La clause ne s'applique pas à cette option.</p>
                    {/if}
                  {/if}
                </div>
              {/if}

              {#if rejecting === k || editing === k}
                <input
                  bind:value={comment}
                  placeholder={rejecting === k ? 'Motif du rejet (obligatoire)' : "Motif de l'amendement (obligatoire)"}
                  class="w-full rounded-md border border-border bg-background p-2 text-sm"
                />
              {/if}

              <div class="flex flex-wrap items-center gap-2">
                <button onclick={() => (trying = trying === k ? null : k)} class="px-2.5 py-1 rounded-md border border-border text-xs flex items-center gap-1">
                  <FlaskConical class="w-3.5 h-3.5" /> Essayer sur une option
                </button>
                {#if r.may_decide}
                  {#if editing === k}
                    <button onclick={() => decide(r, 'amend')} disabled={busy === k || !comment.trim()} data-testid="btn-confirm-amend"
                      class="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50">Valider la clause amendée</button>
                    <button onclick={() => (editing = null)} class="px-2.5 py-1 rounded-md border border-border text-xs">Annuler</button>
                  {:else if rejecting === k}
                    <button onclick={() => decide(r, 'reject')} disabled={busy === k || !comment.trim()} data-testid="btn-confirm-reject"
                      class="px-2.5 py-1 rounded-md bg-destructive text-destructive-foreground text-xs disabled:opacity-50">Confirmer le rejet</button>
                    <button onclick={() => (rejecting = null)} class="px-2.5 py-1 rounded-md border border-border text-xs">Annuler</button>
                  {:else}
                    {#if r.status !== 'validated'}
                      <button onclick={() => decide(r, 'validate')} disabled={busy === k} data-testid="btn-validate"
                        class="px-2.5 py-1 rounded-md bg-emerald-600 text-white text-xs flex items-center gap-1 disabled:opacity-50">
                        <Check class="w-3.5 h-3.5" /> Valider
                      </button>
                    {/if}
                    <button onclick={() => startAmend(r)} data-testid="btn-amend" class="px-2.5 py-1 rounded-md border border-border text-xs flex items-center gap-1">
                      <Edit class="w-3.5 h-3.5" /> Amender
                    </button>
                    {#if r.status !== 'rejected'}
                      <button onclick={() => startReject(r)} data-testid="btn-reject" class="px-2.5 py-1 rounded-md border border-destructive/50 text-destructive text-xs flex items-center gap-1">
                        <X class="w-3.5 h-3.5" /> Rejeter
                      </button>
                    {/if}
                  {/if}
                {:else}
                  <span class="text-xs text-muted-foreground">Décision réservée au responsable du domaine ou à un mainteneur.</span>
                {/if}
                {#if feedback[k]}
                  <span class="text-xs {feedback[k].ok ? 'text-emerald-600' : 'text-destructive'}" data-testid="clause-feedback">{feedback[k].text}</span>
                {/if}
              </div>
            </div>
          {/each}
        </section>
      {:else}
        <p class="text-sm text-muted-foreground">Aucune clause dans cet onglet.</p>
      {/each}
    {/if}
  {/if}
</div>
