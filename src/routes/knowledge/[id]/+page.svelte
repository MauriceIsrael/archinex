<script lang="ts">
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import XCircle from 'lucide-svelte/icons/x-circle';
  import Info from 'lucide-svelte/icons/info';
  import Calendar from 'lucide-svelte/icons/calendar';
  import UserCheck from 'lucide-svelte/icons/user-check';
  import GitCommit from 'lucide-svelte/icons/git-commit';
  import FileText from 'lucide-svelte/icons/file-text';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import Layers from 'lucide-svelte/icons/layers';
  import Check from 'lucide-svelte/icons/check';
  import type { AssetHistoryResponse, CheckClauseRow } from '$lib/types/llmops';

  interface Props {
    data: {
      assetId: string;
      asset: any;
      history: AssetHistoryResponse | null;
      clauses: CheckClauseRow[];
      frameworks: any[];
    };
  }

  let { data }: Props = $props();

  const asset = $derived(data.asset || {});
  const history = $derived(data.history);
  const clauses = $derived(data.clauses || []);

  const opposabilityStatus = $derived.by(() => {
    if (clauses.some((c) => c.status === 'validated')) return 'bloque';
    if (clauses.some((c) => c.status === 'draft')) return 'avertit';
    if (clauses.some((c) => c.status === 'rejected')) return 'rejetée';
    return 'informe';
  });

  const entryPath = $derived(history?.entry_path);

  function formatEntryPathLabel(type?: string): string {
    switch (type) {
      case 'framework_ingestion':
        return 'Ingestion réglementaire';
      case 'doctrine_workshop':
        return 'Atelier de doctrine';
      case 'amendment':
        return 'Amendement formel';
      case 'initial_baseline':
        return 'Socle initial de référence';
      default:
        return type || 'Non spécifié';
    }
  }
</script>

<svelte:head>
  <title>{asset.title || data.assetId} — Fiche d’actif — Archinex</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
  <!-- Fil d'Ariane & Retour -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a
        href="/knowledge"
        class="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeft class="w-4 h-4" />
        <span>Retour à l’explorateur de doctrine</span>
      </a>
      <span class="text-slate-300 dark:text-slate-700">/</span>
      <span class="text-sm font-semibold text-slate-700 dark:text-slate-200">{data.assetId}</span>
    </div>

    {#if asset.framework}
      <a
        href="/kb/frameworks/{asset.framework.toLowerCase()}"
        class="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors border border-indigo-200 dark:border-indigo-800/50"
      >
        <Layers class="w-3.5 h-3.5" />
        <span>Couverture {asset.framework} (#90)</span>
      </a>
    {/if}
  </div>

  <!-- En-tête Fiche Actif -->
  <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
    <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-mono text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {data.assetId}
          </span>

          {#if asset.type}
            <span class="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 capitalize">
              {asset.type}
            </span>
          {/if}

          {#if asset.domain}
            <span class="text-xs font-medium px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50">
              {asset.domain}
            </span>
          {/if}

          {#if asset.framework}
            <span class="text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">
              {asset.framework}
            </span>
          {/if}

          <!-- Badge d'opposabilité -->
          {#if opposabilityStatus === 'bloque'}
            <span class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" title="Actif opposable : clauses validées bloquantes">
              <ShieldCheck class="w-3.5 h-3.5" />
              <span>bloque</span>
            </span>
          {:else if opposabilityStatus === 'avertit'}
            <span class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800" title="Actif en observation : clauses à l’état draft">
              <AlertTriangle class="w-3.5 h-3.5" />
              <span>avertit</span>
            </span>
          {:else if opposabilityStatus === 'rejetée'}
            <span class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800" title="Clauses rejetées">
              <XCircle class="w-3.5 h-3.5" />
              <span>rejetée</span>
            </span>
          {:else}
            <span class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700" title="Aucune clause technique automatisée : valeur documentaire">
              <Info class="w-3.5 h-3.5" />
              <span>informe</span>
            </span>
          {/if}
        </div>

        <h1 class="text-2xl font-bold text-slate-900 dark:text-white leading-tight">
          {asset.title || data.assetId}
        </h1>
        {#if asset.summary && asset.summary !== asset.title}
          <p class="text-slate-600 dark:text-slate-300 text-sm leading-relaxed max-w-4xl">
            {asset.summary}
          </p>
        {/if}
      </div>

      <!-- Métadonnées rapides -->
      <div class="flex flex-col gap-2 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs min-w-[220px]">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span>Date initiale :</span>
          <span class="font-medium text-slate-700 dark:text-slate-200">{history?.initial_date || 'N/A'}</span>
        </div>
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span>Révisions :</span>
          <span class="font-medium text-slate-700 dark:text-slate-200">{history?.revisions?.length || 1}</span>
        </div>
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span>Clauses actives :</span>
          <span class="font-semibold text-slate-900 dark:text-white">{clauses.length}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Parcours d'entrée & Traçabilité légale -->
  <div class="bg-gradient-to-r from-slate-50 to-indigo-50/30 dark:from-slate-900 dark:to-indigo-950/20 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
    <h2 class="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
      <GitCommit class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
      <span>Parcours d’entrée et traçabilité d'origine</span>
    </h2>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white dark:bg-slate-900/80 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
        <div class="text-xs text-slate-500 dark:text-slate-400 mb-1">Type de parcours</div>
        <div class="font-medium text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
          <span>{formatEntryPathLabel(entryPath?.type)}</span>
        </div>
        {#if entryPath?.description}
          <div class="text-xs text-slate-500 mt-1 italic">{entryPath.description}</div>
        {/if}
      </div>

      <div class="bg-white dark:bg-slate-900/80 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
        <div class="text-xs text-slate-500 dark:text-slate-400 mb-1">Source & Version</div>
        {#if entryPath?.framework || entryPath?.version}
          <div class="font-medium text-sm text-slate-900 dark:text-white">
            {entryPath.framework || ''} {entryPath.version ? `(${entryPath.version})` : ''}
          </div>
        {:else}
          <div class="font-medium text-sm text-slate-900 dark:text-white">Référence interne</div>
        {/if}
        {#if entryPath?.source_sha256}
          <div class="text-[11px] font-mono text-slate-500 mt-1 truncate" title={entryPath.source_sha256}>
            SHA: {entryPath.source_sha256.slice(0, 12)}…
          </div>
        {/if}
      </div>

      <div class="bg-white dark:bg-slate-900/80 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
        <div class="text-xs text-slate-500 dark:text-slate-400 mb-1">Validateurs & Relecteurs</div>
        {#if history?.validators && history.validators.length > 0}
          <div class="flex flex-wrap gap-1 mt-1">
            {#each history.validators as val}
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <UserCheck class="w-3 h-3 text-slate-400" />
                <span>{val}</span>
              </span>
            {/each}
          </div>
        {:else}
          <div class="text-xs text-slate-400 mt-1">Non spécifié</div>
        {/if}
      </div>

      <div class="bg-white dark:bg-slate-900/80 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
        <div class="text-xs text-slate-500 dark:text-slate-400 mb-1">Date d'apparition</div>
        <div class="font-medium text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
          <Calendar class="w-4 h-4 text-slate-400" />
          <span>{history?.initial_date || 'Inconnue'}</span>
        </div>
        {#if history?.revisions?.[0]?.snapshot_id}
          <div class="text-[11px] font-mono text-slate-500 mt-1 truncate" title={history.revisions[0].snapshot_id}>
            {history.revisions[0].snapshot_id}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Texte intégral & Rationale -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <div class="lg:col-span-2 space-y-6">
      <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <h2 class="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
          <FileText class="w-5 h-5 text-slate-500" />
          <span>Contenu intégral & Rationale</span>
        </h2>

        <div class="prose dark:prose-invert max-w-none text-sm space-y-4">
          {#if asset.description}
            <div>
              <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Description</h3>
              <p class="text-slate-700 dark:text-slate-300 mt-1">{asset.description}</p>
            </div>
          {/if}

          {#if asset.rationale}
            <div>
              <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Justification (Rationale)</h3>
              <p class="text-slate-700 dark:text-slate-300 mt-1">{asset.rationale}</p>
            </div>
          {/if}

          {#if asset.implementation}
            <div>
              <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Directives de mise en œuvre</h3>
              <p class="text-slate-700 dark:text-slate-300 mt-1">{asset.implementation}</p>
            </div>
          {/if}

          {#if !asset.description && !asset.rationale && !asset.implementation}
            <div class="text-slate-500 dark:text-slate-400 italic">
              {asset.summary || 'Aucune documentation détaillée enregistrée pour cet actif.'}
            </div>
          {/if}
        </div>
      </div>

      <!-- Clauses opposables associées -->
      <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Clauses opposables associées ({clauses.length})</span>
          </h2>
          <a
            href="/kb/clauses"
            class="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
          >
            <span>Gestion des clauses (#105)</span>
            <ExternalLink class="w-3 h-3" />
          </a>
        </div>

        {#if clauses.length === 0}
          <div class="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg p-5 text-center space-y-2">
            <Info class="w-6 h-6 text-slate-400 mx-auto" />
            <div class="text-sm font-medium text-slate-700 dark:text-slate-300">Aucune clause automatisée pour cet actif</div>
            <p class="text-xs text-slate-500 max-w-md mx-auto">
              Cet actif est en statut <strong>informe</strong> : il est consultatif dans les délibérations d’architecture et n'entraîne pas de blocage technique automatisé.
            </p>
          </div>
        {:else}
          <div class="space-y-3">
            {#each clauses as clause}
              <div class="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50/50 dark:bg-slate-850">
                <div class="flex items-center justify-between gap-2 mb-2">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">{clause.check_id}</span>
                    <span class="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 uppercase">
                      {clause.kind}
                    </span>
                  </div>

                  {#if clause.status === 'validated'}
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                      bloque (validée)
                    </span>
                  {:else if clause.status === 'draft'}
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                      avertit (brouillon)
                    </span>
                  {:else}
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                      rejetée
                    </span>
                  {/if}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono bg-white dark:bg-slate-900 p-2.5 rounded border border-slate-200 dark:border-slate-800">
                  <div>
                    <span class="text-slate-400 uppercase font-semibold">Quand:</span>
                    <pre class="text-slate-700 dark:text-slate-300 whitespace-pre-wrap text-[11px] mt-0.5">{JSON.stringify(clause.when, null, 2)}</pre>
                  </div>
                  <div>
                    <span class="text-slate-400 uppercase font-semibold">Attend:</span>
                    <pre class="text-slate-700 dark:text-slate-300 whitespace-pre-wrap text-[11px] mt-0.5">{JSON.stringify(clause.expect, null, 2)}</pre>
                  </div>
                </div>

                {#if clause.validated_by}
                  <div class="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
                    <UserCheck class="w-3.5 h-3.5 text-slate-400" />
                    <span>Validé par <strong>{clause.validated_by}</strong></span>
                    {#if clause.validated_at}
                      <span>le {clause.validated_at}</span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Historique des révisions & Décisions -->
    <div class="space-y-6">
      <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <h2 class="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
          <Calendar class="w-5 h-5 text-slate-500" />
          <span>Historique des révisions</span>
        </h2>

        {#if !history?.revisions || history.revisions.length === 0}
          <div class="text-xs text-slate-500 italic">Aucune révision enregistrée</div>
        {:else}
          <div class="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
            {#each history.revisions as rev}
              <div class="relative group">
                <div class="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400 border-2 border-white dark:border-slate-900"></div>
                <div class="space-y-1">
                  <div class="flex items-center justify-between text-xs">
                    <span class="font-semibold text-slate-900 dark:text-white">Rév. #{rev.revision}</span>
                    <span class="text-slate-400">{rev.date}</span>
                  </div>
                  <div class="text-xs text-slate-600 dark:text-slate-300">
                    {rev.change_summary || 'Mise à jour'}
                  </div>
                  <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 pt-1">
                    <span>Par {rev.author}</span>
                    {#if rev.snapshot_id}
                      <span>•</span>
                      <span class="font-mono truncate max-w-[140px]" title={rev.snapshot_id}>{rev.snapshot_id}</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Journal des décisions de clauses (#105) -->
      {#if history?.clause_decisions && history.clause_decisions.length > 0}
        <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <h2 class="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <UserCheck class="w-5 h-5 text-slate-500" />
            <span>Décisions de clauses (#105)</span>
          </h2>

          <div class="space-y-3">
            {#each history.clause_decisions as dec}
              <div class="border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 p-3 rounded text-xs space-y-1">
                <div class="flex items-center justify-between">
                  <span class="font-mono font-medium text-slate-700 dark:text-slate-300">{dec.check_id}</span>
                  <span class="text-[11px] px-1.5 py-0.5 rounded uppercase font-semibold {dec.decision === 'validate' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                    {dec.decision}
                  </span>
                </div>
                {#if dec.comment}
                  <div class="text-slate-600 dark:text-slate-400 italic">"{dec.comment}"</div>
                {/if}
                <div class="text-[11px] text-slate-400 pt-1">
                  Par {dec.by} • {new Date(dec.at).toLocaleString()}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

