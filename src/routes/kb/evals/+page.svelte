<script lang="ts">
  import CheckCircle from 'lucide-svelte/icons/check-circle';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import Play from 'lucide-svelte/icons/play';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Edit from 'lucide-svelte/icons/edit';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import MessagesSquare from 'lucide-svelte/icons/messages-square';
  import type {
    EvalDataset,
    EvalTestCase,
    EvalBenchmarkRunResult,
    VerdictFeedbackItem
  } from '$lib/types/llmops';

  interface Props {
    data: {
      user: { id: string; name: string; email: string; role: string };
      expert: { kbHandle: string; kbRoles: string[]; ownedDomains: string[]; canEvaluate: boolean };
      dataset?: EvalDataset;
      feedbacks: VerdictFeedbackItem[];
      offline: boolean;
      error?: string;
    };
  }

  let { data }: Props = $props();

  let dataset = $state<EvalDataset | undefined>(data.dataset);
  let feedbacks = $state<VerdictFeedbackItem[]>(data.feedbacks || []);

  // Benchmark state
  let isRunningBenchmark = $state(false);
  let benchmarkResult = $state<EvalBenchmarkRunResult | null>(null);
  let benchmarkError = $state<string | null>(null);

  // Modale d'annotation
  let annotatingCase = $state<EvalTestCase | null>(null);
  let editExpectedStatus = $state<'supports' | 'violates'>('supports');
  let editNotes = $state('');
  let isSavingAnnotation = $state(false);

  async function handleRunBenchmark() {
    const datasetId = dataset?.id || (dataset as any)?.dataset_id || 'check_option_v1';
    isRunningBenchmark = true;
    benchmarkError = null;

    try {
      const res = await fetch(`/api/knowledge/evals/${datasetId}/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Actor-Email': data.user.email
        }
      });

      const resData = await res.json();
      if (!res.ok) {
        benchmarkError = resData.error || `Erreur HTTP ${res.status}`;
      } else {
        benchmarkResult = resData.data;
      }
    } catch (err: any) {
      benchmarkError = err.message || 'Erreur réseau lors du benchmark';
    } finally {
      isRunningBenchmark = false;
    }
  }

  function openAnnotateModal(c: EvalTestCase) {
    annotatingCase = c;
    editExpectedStatus = (c.expected || c.expected_status || 'supports') as 'supports' | 'violates';
    editNotes = c.notes || '';
  }

  async function submitAnnotation() {
    if (!annotatingCase || !dataset) return;
    isSavingAnnotation = true;

    try {
      const res = await fetch(`/api/knowledge/evals/${dataset.id}/cases/${annotatingCase.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Actor-Email': data.user.email
        },
        body: JSON.stringify({
          expected_status: editExpectedStatus,
          notes: editNotes
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        alert(resData.error || `Erreur HTTP ${res.status}`);
      } else {
        const idx = dataset.cases.findIndex((c) => c.id === annotatingCase!.id);
        if (idx !== -1) {
          dataset.cases[idx] = resData.data;
          dataset.human_annotated_count = dataset.cases.filter((c) => c.human_annotated).length;
        }
        annotatingCase = null;
      }
    } catch (err: any) {
      alert(err.message || 'Erreur réseau');
    } finally {
      isSavingAnnotation = false;
    }
  }
</script>

<div class="space-y-8 max-w-7xl mx-auto px-4 py-6">
  <!-- En-tête -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-200 pb-5">
    <div>
      <div class="flex items-center gap-3">
        <div class="p-2 bg-primary-100 rounded-lg text-primary-700">
          <ShieldCheck class="w-6 h-6" />
        </div>
        <div>
          <h1 class="text-2xl font-bold text-surface-900">Banc d'Évaluation & Rappel Doctrinal</h1>
          <p class="text-sm text-surface-500">
            Jeu de test <span class="font-mono font-semibold">check_option_v1</span>, annotation humaine experte et calcul du rappel réel (Porte G6 ≥ 80%).
          </p>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <span class="text-xs px-3 py-1.5 rounded-full bg-surface-100 border border-surface-300 font-mono text-surface-700">
        Acteur : <span class="font-semibold">{data.expert.kbHandle}</span>
      </span>
      {#if data.expert.canEvaluate}
        <span class="text-xs px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 font-semibold">
          ✓ Rôle kb:evaluate actif
        </span>
      {:else}
        <span class="text-xs px-3 py-1.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800">
          Lecture seule (rôle kb:evaluate requis pour annoter)
        </span>
      {/if}
    </div>
  </div>

  {#if data.offline}
    <div class="p-4 bg-amber-50 border border-amber-300 rounded-lg flex items-center gap-3 text-amber-800 text-sm">
      <AlertTriangle class="w-5 h-5 flex-shrink-0" />
      <div>
        <strong>Mode Hors-Ligne Actif</strong> : Le serveur distant de gouvernance LLMOps est indisponible. Les métriques d'évaluation fonctionnent en mode dégradé local.
      </div>
    </div>
  {/if}

  <!-- Bloc de Déclenchement du Benchmark -->
  <div class="bg-surface-50 border border-surface-200 rounded-xl p-6 shadow-sm">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-surface-900 flex items-center gap-2">
          <Sparkles class="w-5 h-5 text-primary-600" />
          <span>Exécution du Benchmark (Porte G6)</span>
        </h2>
        <p class="text-xs text-surface-600 mt-1 max-w-xl">
          Évalue les moteurs de vérification d'options contre les cas de test. Le taux de rappel officiel est calculé strictement sur les annotations humaines pour garantir l'opposabilité.
        </p>
      </div>

      <button
        onclick={handleRunBenchmark}
        disabled={isRunningBenchmark || !dataset}
        data-testid="btn-run-benchmark"
        class="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold text-sm rounded-lg shadow-sm flex items-center gap-2 transition-colors flex-shrink-0"
      >
        {#if isRunningBenchmark}
          <RefreshCw class="w-4 h-4 animate-spin" />
          <span>Exécution du benchmark...</span>
        {:else}
          <Play class="w-4 h-4" />
          <span>Lancer le Benchmark de Rappel</span>
        {/if}
      </button>
    </div>

    {#if benchmarkError}
      <div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
        <AlertTriangle class="w-4 h-4 flex-shrink-0" />
        <span>{benchmarkError}</span>
      </div>
    {/if}

    <!-- Résultats du Benchmark -->
    {#if benchmarkResult}
      <div class="mt-6 pt-6 border-t border-surface-200">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-bold text-surface-800">Résultats du Run ({benchmarkResult.run_id})</h3>
          <span class="text-xs text-surface-500 font-mono">
            {new Date(benchmarkResult.executed_at).toLocaleTimeString()}
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Carte Rappel Réel (Objectif G6) -->
          <div class="p-4 rounded-xl border {benchmarkResult.meets_target ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}">
            <div class="text-xs font-semibold uppercase tracking-wider">Rappel Réel (Humain)</div>
            <div data-testid="benchmark-recall-metric" class="text-3xl font-black mt-1">{benchmarkResult.actual_recall}%</div>
            <div class="text-xs mt-1 font-semibold flex items-center gap-1">
              {#if benchmarkResult.meets_target}
                <CheckCircle class="w-3.5 h-3.5 text-emerald-600" />
                <span>Objectif Porte G6 Validé (≥ 80%)</span>
              {:else}
                <AlertTriangle class="w-3.5 h-3.5 text-rose-600" />
                <span>Non conforme Porte G6 (&lt; 80%)</span>
              {/if}
            </div>
          </div>

          <!-- Précision -->
          <div class="p-4 rounded-xl border border-surface-200 bg-white">
            <div class="text-xs font-semibold uppercase tracking-wider text-surface-500">Précision Estimée</div>
            <div class="text-3xl font-black text-surface-900 mt-1">{benchmarkResult.precision}%</div>
            <div class="text-xs text-surface-500 mt-1">Conformité des prédictions émises</div>
          </div>

          <!-- Cas Humains Vérifiés -->
          <div class="p-4 rounded-xl border border-surface-200 bg-white">
            <div class="text-xs font-semibold uppercase tracking-wider text-surface-500">Cas Humains Validés</div>
            <div class="text-3xl font-black text-surface-900 mt-1">{benchmarkResult.human_verified_cases}</div>
            <div class="text-xs text-surface-500 mt-1">Sur {benchmarkResult.total_cases} cas totaux du jeu de test</div>
          </div>

          <!-- Cas Conformes -->
          <div class="p-4 rounded-xl border border-surface-200 bg-white">
            <div class="text-xs font-semibold uppercase tracking-wider text-surface-500">Cas Réussis</div>
            <div class="text-3xl font-black text-surface-900 mt-1">{benchmarkResult.passed_cases} / {benchmarkResult.total_cases}</div>
            <div class="text-xs text-surface-500 mt-1">Correspondances statut attendu</div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Section 1 : Jeu de Test check_option_v1 -->
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-bold text-surface-900">
          Cas de Test du Banc d'Évaluation (<span class="font-mono text-primary-700">{dataset?.id || 'check_option_v1'}</span>)
        </h2>
        <p class="text-xs text-surface-500 mt-0.5">
          {dataset?.human_annotated_count || 0} cas annotés par un humain sur {dataset?.total_cases || 0} cas disponibles.
        </p>
      </div>
    </div>

    {#if !dataset || dataset.cases.length === 0}
      <div class="text-center py-8 bg-surface-50 border border-surface-200 rounded-xl text-surface-500 text-sm">
        Aucun cas de test présent dans le jeu de données.
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-4">
        {#each dataset.cases as c (c.id)}
          <div class="bg-white border border-surface-200 rounded-xl p-5 shadow-sm space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <span class="px-2 py-0.5 text-xs font-mono font-bold bg-surface-100 text-surface-800 rounded">
                    {c.id}
                  </span>
                  <span class="px-2 py-0.5 text-xs font-mono font-semibold bg-primary-50 text-primary-800 rounded border border-primary-200">
                    Règle : {c.rule_id}
                  </span>
                  <span class="text-xs text-surface-500">
                    Domaine : <strong class="text-surface-700">{c.domain}</strong>
                  </span>
                </div>
                <h3 class="text-base font-bold text-surface-900">{c.option_title}</h3>
              </div>

              <div class="flex items-center gap-2">
                <!-- Statut attendu -->
                <span class="px-2.5 py-1 text-xs font-bold rounded-full {c.expected_status === 'supports' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-rose-100 text-rose-800 border border-rose-300'}">
                  Attendu : {c.expected_status === 'supports' ? 'Conforme (supports)' : 'Non-conforme (violates)'}
                </span>

                <!-- Annotation humaine -->
                {#if c.human_annotated}
                  <span class="px-2.5 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1">
                    <CheckCircle class="w-3.5 h-3.5 text-blue-600" />
                    <span>Annoté Humain</span>
                  </span>
                {:else}
                  <span class="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    Non annoté
                  </span>
                {/if}
              </div>
            </div>

            <p class="text-xs text-surface-600 bg-surface-50 p-3 rounded-lg border border-surface-200">
              {c.option_summary}
            </p>

            {#if c.notes}
              <div class="text-xs text-surface-700 italic bg-surface-100/60 p-2.5 rounded border border-surface-200">
                <strong>Note d'évaluation :</strong> {c.notes}
              </div>
            {/if}

            <div class="pt-2 border-t border-surface-100 flex items-center justify-between text-xs text-surface-400">
              <div>
                {#if c.annotated_by}
                  <span>Annoté par {c.annotated_by} le {new Date(c.annotated_at || '').toLocaleDateString()}</span>
                {:else}
                  <span>En attente de revue par un expert kb:evaluate</span>
                {/if}
              </div>

              {#if data.expert.canEvaluate}
                <button
                  onclick={() => openAnnotateModal(c)}
                  class="px-3 py-1.5 text-xs font-semibold bg-surface-100 hover:bg-surface-200 text-surface-800 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit class="w-3.5 h-3.5 text-primary-600" />
                  <span>Annoter le cas</span>
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Section 2 : Boucle de Retours Terrain depuis les Débats -->
  <div class="space-y-4 pt-6 border-t border-surface-200">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-bold text-surface-900 flex items-center gap-2">
          <MessagesSquare class="w-5 h-5 text-indigo-600" />
          <span>File de Retours Terrain sur les Verdicts</span>
        </h2>
        <p class="text-xs text-surface-500 mt-0.5">
          Contestations et désaccords signalés par les architectes depuis les débats de projets, convertibles en nouveaux cas de test ou amendements.
        </p>
      </div>
      <span class="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
        {feedbacks.length} retours
      </span>
    </div>

    {#if feedbacks.length === 0}
      <div class="text-center py-8 bg-surface-50 border border-surface-200 rounded-xl text-surface-500 text-xs">
        Aucun retour de débat enregistré. Pour contester un verdict, utilisez le bouton "Signaler un désaccord" dans l'espace Délibération.
      </div>
    {:else}
      <div class="space-y-3">
        {#each feedbacks as fb (fb.id)}
          <div class="bg-white border border-surface-200 rounded-xl p-4 shadow-sm space-y-2">
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-2 font-mono">
                <span class="font-bold text-surface-800">{fb.id}</span>
                <span>•</span>
                <span class="text-surface-500">Option : {fb.option_id}</span>
                {#if fb.rule_id}
                  <span>•</span>
                  <span class="text-primary-700 font-semibold">{fb.rule_id}</span>
                {/if}
              </div>

              <span class="px-2 py-0.5 rounded text-[11px] font-semibold {fb.status === 'converted_to_test_case' ? 'bg-emerald-100 text-emerald-800' : fb.status === 'converted_to_amendment' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}">
                {fb.status === 'converted_to_test_case' ? '✓ Converti en cas de test' : fb.status === 'converted_to_amendment' ? '✓ Converti en amendement' : 'En attente'}
              </span>
            </div>

            <p class="text-xs text-surface-700 bg-surface-50 p-2.5 rounded border border-surface-200">
              <strong>Motif du désaccord :</strong> {fb.disagree_rationale}
            </p>

            <div class="flex items-center justify-between text-[11px] text-surface-400">
              <span>Auteur : {fb.author_email || fb.reporter || 'Anonyme'} • {fb.created_at ? new Date(fb.created_at).toLocaleString() : ''}</span>
              {#if fb.converted_ref}
                <span class="font-mono text-primary-700 font-semibold">Réf : {fb.converted_ref}</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Modale d'Annotation d'un Cas -->
  {#if annotatingCase}
    <div class="fixed inset-0 bg-surface-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-xl shadow-xl border border-surface-200 max-w-lg w-full p-6 space-y-4">
        <h3 class="text-lg font-bold text-surface-900">
          Annoter le cas : {annotatingCase.id}
        </h3>
        <p class="text-xs text-surface-600 bg-surface-50 p-3 rounded border border-surface-200 font-mono">
          {annotatingCase.option_title}
        </p>

        <div>
          <label for="evalStatusSelect" class="block text-xs font-semibold text-surface-700 mb-1">
            Statut Attendu (Vérité Terrain) *
          </label>
          <select
            id="evalStatusSelect"
            bind:value={editExpectedStatus}
            class="w-full px-3 py-2 text-xs border border-surface-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500"
          >
            <option value="supports">Conforme / Valide (supports)</option>
            <option value="violates">Non-conforme / Enfreint la règle (violates)</option>
          </select>
        </div>

        <div>
          <label for="evalNotesText" class="block text-xs font-semibold text-surface-700 mb-1">
            Notes d'Évaluation Experte & Justification
          </label>
          <textarea
            id="evalNotesText"
            bind:value={editNotes}
            rows="3"
            placeholder="Justifiez la décision d'annotation pour la traçabilité de l'évaluation..."
            class="w-full px-3 py-2 text-xs border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          ></textarea>
        </div>

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-surface-100">
          <button
            onclick={() => (annotatingCase = null)}
            class="px-4 py-2 text-xs font-semibold text-surface-600 hover:bg-surface-100 rounded-lg"
          >
            Annuler
          </button>
          <button
            onclick={submitAnnotation}
            disabled={isSavingAnnotation}
            class="px-4 py-2 text-xs font-semibold bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg shadow-sm"
          >
            Enregistrer l'Annotation
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
