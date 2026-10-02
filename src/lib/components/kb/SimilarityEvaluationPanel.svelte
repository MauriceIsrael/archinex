<script lang="ts">
  import {
    Activity,
    CheckCircle2,
    AlertTriangle,
    Shield,
    Languages,
    Sliders,
    Play,
    Check,
    XCircle,
    Info,
    RefreshCw
  } from 'lucide-svelte';
  import type {
    SimilarityCase,
    SimilarityRun,
    SimilarityFamily
  } from '$lib/types/llmops';
  import { toast } from '$lib/toast/index.svelte';

  let {
    datasetId = 'similarity_v1'
  }: {
    datasetId?: string;
  } = $props();

  let cases = $state<SimilarityCase[]>([]);
  let validatedCount = $state(0);
  let latestRun = $state<SimilarityRun | null>(null);
  let isLoading = $state(false);
  let isRunning = $state(false);
  let selectedFamily = $state<string>('all');
  let selectedLang = $state<string>('all');

  async function loadDataset() {
    isLoading = true;
    try {
      const res = await fetch(`/api/knowledge/similarity-evals/${datasetId}`, {
        headers: {}
      });
      const body = await res.json();
      if (res.ok && body.data) {
        cases = body.data.cases;
        validatedCount = body.data.validated;
      }
    } catch {
      // ignore
    } finally {
      isLoading = false;
    }
  }

  async function validateCase(caseId: string) {
    try {
      const res = await fetch(`/api/knowledge/similarity-evals/${datasetId}/cases/${caseId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ annotation_status: 'validated' })
      });
      const body = await res.json();
      if (res.ok && body.data) {
        const idx = cases.findIndex((c) => c.id === caseId);
        if (idx !== -1) {
          cases[idx] = body.data;
          validatedCount = cases.filter((c) => c.annotation_status === 'validated').length;
        }
        toast(`Cas ${caseId} validé par l'évaluateur`, { variant: 'success' });
      } else {
        toast(body.error || 'Erreur lors de la validation', { variant: 'error' });
      }
    } catch (e: any) {
      toast(e.message || 'Erreur réseau', { variant: 'error' });
    }
  }

  async function runEvaluation() {
    isRunning = true;
    try {
      const res = await fetch(`/api/knowledge/similarity-evals/${datasetId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: 'toy-bow' })
      });
      const body = await res.json();
      if (res.ok && body.data) {
        latestRun = body.data;
        toast('Benchmark de similarité terminé avec succès !', { variant: 'success' });
      } else {
        toast(body.error || 'Erreur lors du benchmark', { variant: 'error' });
      }
    } catch (e: any) {
      toast(e.message || 'Erreur réseau', { variant: 'error' });
    } finally {
      isRunning = false;
    }
  }

  $effect(() => {
    loadDataset();
  });

  const filteredCases = $derived(
    cases.filter((c) => {
      if (selectedFamily !== 'all' && c.family !== selectedFamily) return false;
      if (selectedLang !== 'all' && c.language !== selectedLang) return false;
      return true;
    })
  );
</script>

<div class="space-y-6">
  <!-- Header Card -->
  <div class="p-6 rounded-xl border border-border bg-card shadow-sm">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-primary/10 text-primary border border-primary/20">
            Contrat 1.11
          </span>
          <span class="text-xs text-muted-foreground">Jeu bilingue FR/EN calibré</span>
        </div>
        <h2 class="text-lg font-bold text-foreground">Évaluation de Similarité Sémantique & Calibration des Seuils</h2>
        <p class="text-xs text-muted-foreground mt-1">
          Mesure déterministe avec encodage local côté Archinex. Prévention absolue des faux positifs forts (false_strong).
        </p>
      </div>

      <div class="flex items-center gap-3">
        <button
          onclick={loadDataset}
          disabled={isLoading}
          class="px-3.5 py-2 text-xs font-medium rounded-lg border border-border bg-background hover:bg-muted transition-colors flex items-center gap-1.5"
        >
          <RefreshCw class="w-3.5 h-3.5 {isLoading ? 'animate-spin' : ''}" />
          Actualiser
        </button>
        <button
          onclick={runEvaluation}
          disabled={isRunning}
          class="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm"
        >
          {#if isRunning}
            <RefreshCw class="w-3.5 h-3.5 animate-spin" />
            Mesure en cours...
          {:else}
            <Play class="w-3.5 h-3.5 fill-current" />
            Lancer la Mesure
          {/if}
        </button>
      </div>
    </div>

    <!-- Summary Metrics -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
      <div class="p-3.5 rounded-lg bg-muted/30 border border-border">
        <div class="text-xs text-muted-foreground font-medium">Cas de Test FR/EN</div>
        <div class="text-xl font-bold text-foreground mt-1">{cases.length}</div>
        <div class="text-[11px] text-muted-foreground mt-0.5">4 familles couvertes</div>
      </div>
      <div class="p-3.5 rounded-lg bg-muted/30 border border-border">
        <div class="text-xs text-muted-foreground font-medium">Annotations Validées</div>
        <div class="text-xl font-bold text-primary mt-1">{validatedCount} / {cases.length}</div>
        <div class="text-[11px] text-muted-foreground mt-0.5">Par profil évaluateur</div>
      </div>
      <div class="p-3.5 rounded-lg bg-muted/30 border border-border">
        <div class="text-xs text-muted-foreground font-medium">Faux Positifs Forts</div>
        <div class="text-xl font-bold {latestRun?.false_strong === 0 ? 'text-emerald-500' : latestRun ? 'text-rose-500' : 'text-muted-foreground'} mt-1">
          {latestRun ? latestRun.false_strong : '—'}
        </div>
        <div class="text-[11px] text-muted-foreground mt-0.5">Métrique d'arrêt critique</div>
      </div>
      <div class="p-3.5 rounded-lg bg-muted/30 border border-border">
        <div class="text-xs text-muted-foreground font-medium">Seuil Fort Recommandé</div>
        <div class="text-xl font-bold text-foreground mt-1">
          {latestRun?.recommended_strong_threshold ? latestRun.recommended_strong_threshold : latestRun ? 'Bloqué' : '—'}
        </div>
        <div class="text-[11px] text-muted-foreground mt-0.5">{latestRun?.recommendation_note || 'En attente de run'}</div>
      </div>
    </div>
  </div>

  <!-- Run Detail Banner if Available -->
  {#if latestRun}
    <div class="p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Activity class="w-4 h-4 text-primary" />
          Dernier Benchmark Exécuté (#{latestRun.id}) par {latestRun.run_by}
        </h3>
        <span class="text-xs text-muted-foreground">{new Date(latestRun.at).toLocaleTimeString()}</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div class="p-3 rounded-lg border border-border bg-muted/10 space-y-1">
          <span class="font-semibold text-foreground">Rappel au Top 3 (Recall@3)</span>
          <p class="text-muted-foreground">{latestRun.recall_at_3 ? `${Math.round(latestRun.recall_at_3 * 100)}%` : 'N/A'}</p>
        </div>
        <div class="p-3 rounded-lg border border-border bg-muted/10 space-y-1">
          <span class="font-semibold text-foreground">Pièges d'Hypothèses (Reuse Trap)</span>
          <p class="text-muted-foreground">{latestRun.reuse_trap_strong} cas (séparés des faux forts)</p>
        </div>
        <div class="p-3 rounded-lg border border-border bg-muted/10 space-y-1">
          <span class="font-semibold text-foreground">Balayage de Calibration (Sweep)</span>
          <p class="text-muted-foreground">{latestRun.sweep.length} paliers explorés (0.70 à 0.98)</p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Dataset Exploration and Filters -->
  <div class="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <h3 class="text-sm font-bold text-foreground">Cas de Test du Dataset ({filteredCases.length})</h3>

      <div class="flex flex-wrap items-center gap-2">
        <select
          bind:value={selectedFamily}
          class="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary"
        >
          <option value="all">Toutes les familles</option>
          <option value="cross_lingual">Cross-lingual (FR/EN)</option>
          <option value="same_words_different_subject">Mêmes mots, sujet différent</option>
          <option value="same_topic_different_assumptions">Même sujet, hypothèses différentes</option>
          <option value="out_of_base">Hors base (Out of base)</option>
        </select>

        <select
          bind:value={selectedLang}
          class="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary"
        >
          <option value="all">Toutes les langues</option>
          <option value="fr">Français (FR)</option>
          <option value="en">Anglais (EN)</option>
        </select>
      </div>
    </div>

    <!-- Case Table / List -->
    <div class="space-y-2.5 pt-2">
      {#each filteredCases as c}
        <div class="p-4 rounded-lg border border-border bg-muted/20 flex flex-col md:flex-row md:items-start justify-between gap-3 text-xs">
          <div class="space-y-1.5 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-mono font-bold text-primary">{c.id}</span>
              <span class="px-2 py-0.5 rounded text-[11px] bg-muted font-medium text-foreground">
                {c.family}
              </span>
              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/10 text-primary">
                {c.language}
              </span>
              {#if c.annotation_status === 'validated'}
                <span class="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 class="w-3.5 h-3.5" />
                  Validé ({c.annotated_by})
                </span>
              {:else}
                <span class="text-muted-foreground italic">Proposé ({c.annotated_by})</span>
              {/if}
            </div>
            <p class="text-foreground font-medium text-xs">« {c.query_text} »</p>
            {#if c.expected.length > 0}
              <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span class="text-muted-foreground text-[11px]">Attendu :</span>
                {#each c.expected as exp}
                  <span class="px-2 py-0.5 rounded bg-background border border-border text-[11px] font-mono">
                    {exp.ref} ({exp.relation})
                  </span>
                {/each}
              </div>
            {:else}
              <span class="text-muted-foreground text-[11px] italic">Aucun actif attendu (hors base)</span>
            {/if}
          </div>

          {#if c.annotation_status !== 'validated'}
            <button
              onclick={() => validateCase(c.id)}
              class="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium flex items-center gap-1 self-start shrink-0 transition-colors"
            >
              <Check class="w-3.5 h-3.5 text-primary" />
              Valider l'annotation
            </button>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>
