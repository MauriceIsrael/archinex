<script lang="ts">
  import type { PageData } from './$types';
  import { toast } from '$lib/toast/index.svelte';
  import {
    Shield,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Database,
    Lock,
    Sparkles,
    Layers,
    FileText,
    Clock,
    Target,
    Send,
    RefreshCw,
    Hash,
    Plus,
    Check,
    Copy,
    Info
  } from 'lucide-svelte';

  let { data }: { data: PageData } = $props();

  let health = $state(data.health);
  let publications = $state([...data.publications]);
  let campaigns = $state([...data.campaigns]);

  // Publication Modal State
  let showPublishModal = $state(false);
  let publishChangelog = $state('');
  let isPublishing = $state(false);

  // Campaign Modal State
  let showCampaignModal = $state(false);
  let isCreatingCampaign = $state(false);
  let newCampaign = $state({
    title: '',
    domain: 'architecture',
    target_asset_type: 'pattern',
    target_count: 5,
    due_at: '',
    description: ''
  });

  const isDemoStorage = $derived(
    health?.storage?.mode === 'demo' || (health?.storage && !health.storage.persistent)
  );

  let isSyncingEmbeddings = $state(false);
  const embeddingsInfo = $derived(
    health?.embeddings?.[0] || { model_id: 'toy-bow', vectors: 0, missing: 0, stale: 0, active_assets: 0 }
  );

  async function handleSyncEmbeddings() {
    isSyncingEmbeddings = true;
    try {
      const res = await fetch('/api/knowledge/embeddings/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'toy-bow' })
      });
      const body = await res.json();
      if (res.ok) {
        toast(`Synchronisation terminée : ${body.count ?? 0} actif(s) vectorisé(s) avec succès !`, { variant: 'success' });
        await refreshHealth();
      } else {
        toast(body.error || 'Erreur lors de la synchronisation des vecteurs', { variant: 'error' });
      }
    } catch (e: any) {
      toast(e.message || 'Erreur réseau', { variant: 'error' });
    } finally {
      isSyncingEmbeddings = false;
    }
  }

  async function refreshHealth() {
    try {
      const res = await fetch('/api/knowledge/health');
      if (res.ok) {
        const body = await res.json();
        health = body.data;
      }
    } catch {
      // ignore
    }
  }

  async function handlePublish() {
    if (!publishChangelog.trim()) {
      toast('Veuillez décrire le changelog de cette publication', { variant: 'error' });
      return;
    }

    isPublishing = true;
    try {
      const res = await fetch('/api/knowledge/publications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changelog: publishChangelog.trim() })
      });

      const body = await res.json();

      if (res.status === 403) {
        toast("Habilitation insuffisante : rôle kb:admin ou kb:maintain requis", { variant: 'error' });
        return;
      }

      if (res.status === 409) {
        const blockersStr = body.blockers?.join(' ; ') || body.error;
        toast(`Publication bloquée (Porte G7) : ${blockersStr}`, { variant: 'error' });
        return;
      }

      if (res.ok && body.data) {
        publications = [body.data, ...publications];
        toast(`Doctrine ${body.data.version} publiée et scellée avec succès ! Snapshot : ${body.data.snapshot_id}`);
        showPublishModal = false;
        publishChangelog = '';
        await refreshHealth();
      } else {
        toast(body.error || 'Erreur lors de la publication', { variant: 'error' });
      }
    } catch (e: any) {
      toast(`Erreur réseau : ${e.message}`, { variant: 'error' });
    } finally {
      isPublishing = false;
    }
  }

  async function handleCreateCampaign() {
    if (!newCampaign.title.trim()) {
      toast('Le titre de la campagne est obligatoire', { variant: 'error' });
      return;
    }

    isCreatingCampaign = true;
    try {
      const res = await fetch('/api/knowledge/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCampaign)
      });

      const body = await res.json();
      if (res.ok && body.data) {
        campaigns = [body.data, ...campaigns];
        toast(`Campagne « ${body.data.title} » lancée avec succès`);
        showCampaignModal = false;
        newCampaign = {
          title: '',
          domain: 'architecture',
          target_asset_type: 'pattern',
          target_count: 5,
          due_at: '',
          description: ''
        };
      } else {
        toast(body.error || 'Erreur lors de la création de la campagne', { variant: 'error' });
      }
    } catch (e: any) {
      toast(`Erreur réseau : ${e.message}`, { variant: 'error' });
    } finally {
      isCreatingCampaign = false;
    }
  }

  async function incrementCampaign(campaignId: string) {
    try {
      const res = await fetch(`/api/knowledge/campaigns/${encodeURIComponent(campaignId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress_increment: 1 })
      });
      const body = await res.json();
      if (res.ok && body.data) {
        campaigns = campaigns.map((c) => (c.id === campaignId ? body.data : c));
        toast(`Progression mise à jour (+1 clause enregistrée)`);
      }
    } catch (e: any) {
      toast(`Erreur : ${e.message}`, { variant: 'error' });
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast('Empreinte SHA-256 copiée dans le presse-papier');
  }
</script>

<div class="container mx-auto p-4 md:p-6 max-w-7xl space-y-6">
  <!-- En-tête -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
    <div>
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-lg bg-primary/10 text-primary">
          <Database class="h-6 w-6" />
        </div>
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Tableau de Bord de Gouvernance KB</h1>
          <p class="text-sm text-muted-foreground">
            Pilotage de la doctrine d'entreprise, publication scellée (Porte G7) et campagnes d'enrichissement.
          </p>
        </div>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <button
        onclick={refreshHealth}
        class="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted transition-colors"
      >
        <RefreshCw class="h-3.5 w-3.5" />
        Actualiser
      </button>
    </div>
  </div>

  <!-- Alerte Service Indisponible (Mode Hors-Ligne) -->
  {#if data.offline}
    <div class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-900 dark:text-rose-200" data-testid="llmops-offline-banner">
      <div class="flex items-start gap-3">
        <AlertTriangle class="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
        <div class="space-y-1">
          <h3 class="font-semibold text-sm">Service de gouvernance indisponible (Mode Hors-Ligne)</h3>
          <p class="text-xs text-muted-foreground dark:text-rose-300/80">
            Le Knowledge Hub distant LLMOps n'est pas joignable. Les métriques et fonctionnalités de gouvernance fonctionnent en mode dégradé local.
          </p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Alerte Stockage Éphémère (Mode Démo) -->
  {#if isDemoStorage}
    <div class="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
      <div class="flex items-start gap-3">
        <AlertTriangle class="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div class="space-y-1">
          <h3 class="font-semibold text-sm">Mode Stockage Éphémère (Démo) Détecté</h3>
          <p class="text-xs text-muted-foreground dark:text-amber-300/80">
            Le service de gouvernance LLMOps fonctionne sur une enclave mémoire non persistante ({health?.storage?.provider || 'In-Memory RAM'}). Les révisions doctrinales et publications scellées seront réinitialisées au redémarrage du service.
          </p>
        </div>
      </div>
    </div>
  {/if}

  <!-- KPIs de Santé & Gouvernance -->
  {#if health}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Total Assets -->
      <div class="rounded-xl border bg-card p-5 space-y-2">
        <div class="flex items-center justify-between text-muted-foreground">
          <span class="text-xs font-semibold uppercase tracking-wider">Doctrine Active</span>
          <Layers class="h-4 w-4 text-primary" />
        </div>
        <div class="flex items-baseline gap-2">
          <span class="text-3xl font-extrabold">{health.doctrine_health?.total_assets ?? 0}</span>
          <span class="text-xs text-muted-foreground">actifs indexés</span>
        </div>
        <div class="text-xs text-muted-foreground pt-1 border-t flex flex-wrap gap-2">
          <span>{health.doctrine_health?.principles_count ?? 0} principes</span> •
          <span>{health.doctrine_health?.patterns_count ?? 0} patrons</span> •
          <span>{health.doctrine_health?.controls_count ?? 0} contrôles</span>
        </div>
      </div>

      <!-- Revues & Délais (Porte G5) -->
      <div class="rounded-xl border bg-card p-5 space-y-2">
        <div class="flex items-center justify-between text-muted-foreground">
          <span class="text-xs font-semibold uppercase tracking-wider">Boîte de Revue (G5)</span>
          <Clock class="h-4 w-4 text-amber-500" />
        </div>
        <div class="flex items-baseline gap-2">
          <span class="text-3xl font-extrabold">{health.reviews_summary?.pending_count ?? 0}</span>
          <span class="text-xs text-muted-foreground">en attente</span>
        </div>
        <div class="pt-1 border-t flex items-center justify-between text-xs">
          {#if (health.reviews_summary?.overdue_count ?? 0) === 0}
            <span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 class="h-3.5 w-3.5" /> 0 en retard (G5 OK)
            </span>
          {:else}
            <span class="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
              <XCircle class="h-3.5 w-3.5" /> {health.reviews_summary?.overdue_count ?? 0} en retard
            </span>
          {/if}
          <span class="text-muted-foreground">Moy. {health.reviews_summary?.avg_review_duration_days ?? 0}j</span>
        </div>
      </div>

      <!-- Couverture Référentiels -->
      <div class="rounded-xl border bg-card p-5 space-y-2">
        <div class="flex items-center justify-between text-muted-foreground">
          <span class="text-xs font-semibold uppercase tracking-wider">Couverture Référentiels</span>
          <FileText class="h-4 w-4 text-indigo-500" />
        </div>
        <div class="flex items-baseline gap-2">
          <span class="text-3xl font-extrabold">{health.regulatory_coverage?.coverage_percentage ?? 0}%</span>
          <span class="text-xs text-muted-foreground">des exigences</span>
        </div>
        <div class="pt-1 border-t text-xs text-muted-foreground">
          {health.regulatory_coverage?.covered_requirements ?? 0} / {health.regulatory_coverage?.total_requirements ?? 0} clauses couvertes ({health.regulatory_coverage?.total_frameworks ?? 0} cadre{(health.regulatory_coverage?.total_frameworks ?? 0) > 1 ? 's' : ''})
        </div>
      </div>

      <!-- Rappel Benchmark (Porte G6) -->
      <div class="rounded-xl border bg-card p-5 space-y-2">
        <div class="flex items-center justify-between text-muted-foreground">
          <span class="text-xs font-semibold uppercase tracking-wider">Rappel Benchmark (G6)</span>
          <Target class="h-4 w-4 text-emerald-500" />
        </div>
        <div class="flex items-baseline gap-2">
          <span class="text-3xl font-extrabold">{Math.round((health.evals_summary?.latest_recall ?? 0) * 100)}%</span>
          <span class="text-xs text-muted-foreground">sur cas vérifiés</span>
        </div>
        <div class="pt-1 border-t text-xs">
          {#if health.evals_summary?.gate_g6_passed}
            <span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 class="h-3.5 w-3.5" /> Porte G6 Validée (≥ 80%)
            </span>
          {:else}
            <span class="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
              <XCircle class="h-3.5 w-3.5" /> Insuffisant (&lt; 80%)
            </span>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Section Vecteurs Sémantiques & Indexation Locale (Contrat 1.9 / Issue #14) -->
  <div class="rounded-xl border bg-card p-6 space-y-4 shadow-sm">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold">Indexation Vectorielle & Similarité Sémantique</h2>
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            Contrat 1.9 (A12)
          </span>
        </div>
        <p class="text-xs text-muted-foreground mt-1">
          Les vecteurs sémantiques sont calculés localement par Archinex (aucun envoi de texte brut au moteur distant) et déposés dans LLMOps pour le calcul déterministe de distance cosinus.
        </p>
      </div>

      <button
        onclick={handleSyncEmbeddings}
        disabled={isSyncingEmbeddings}
        class="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
      >
        <RefreshCw class="h-3.5 w-3.5 {isSyncingEmbeddings ? 'animate-spin' : ''}" />
        {#if isSyncingEmbeddings}
          Calcul & Dépôt en cours...
        {:else}
          Synchroniser les Vecteurs
        {/if}
      </button>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
      <div class="p-3.5 rounded-lg bg-muted/20 border border-border">
        <span class="text-muted-foreground font-medium">Modèle d'Encodage</span>
        <div class="text-base font-bold text-foreground mt-1">{embeddingsInfo.model_id}</div>
        <div class="text-[11px] text-muted-foreground mt-0.5">Encodage déterministe (128d)</div>
      </div>
      <div class="p-3.5 rounded-lg bg-muted/20 border border-border">
        <span class="text-muted-foreground font-medium">Actifs Vectorisés</span>
        <div class="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1">{embeddingsInfo.vectors}</div>
        <div class="text-[11px] text-muted-foreground mt-0.5">Disponibles pour recherche</div>
      </div>
      <div class="p-3.5 rounded-lg bg-muted/20 border border-border">
        <span class="text-muted-foreground font-medium">En Attente de Dépôt</span>
        <div class="text-base font-bold {embeddingsInfo.missing > 0 ? 'text-amber-500' : 'text-foreground'} mt-1">{embeddingsInfo.missing}</div>
        <div class="text-[11px] text-muted-foreground mt-0.5">Manquants dans l'index</div>
      </div>
      <div class="p-3.5 rounded-lg bg-muted/20 border border-border">
        <span class="text-muted-foreground font-medium">Vecteurs Obsolètes (Stale)</span>
        <div class="text-base font-bold {embeddingsInfo.stale > 0 ? 'text-rose-500' : 'text-foreground'} mt-1">{embeddingsInfo.stale}</div>
        <div class="text-[11px] text-muted-foreground mt-0.5">Texte modifié depuis dépôt</div>
      </div>
    </div>
  </div>

  <!-- Section 1 : Porte G7 — Publication Scellée & Changelog -->
  <div class="rounded-xl border bg-card p-6 space-y-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold">Publication Scellée de la Doctrine (Porte G7)</h2>
          {#if health?.gate_g7_eligible}
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 class="h-3 w-3" /> Porte G7 Franchie
            </span>
          {:else}
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              <XCircle class="h-3 w-3" /> Porte G7 Bloquée
            </span>
          {/if}
        </div>
        <p class="text-xs text-muted-foreground mt-1">
          La publication officielle scelle l'ensemble des règles et contrôles validés dans un instantané cryptographiquement signé (SHA-256).
        </p>
      </div>

      <div>
        <button
          onclick={() => (showPublishModal = true)}
          disabled={!data.expert.canPublish || !health?.gate_g7_eligible}
          data-testid="btn-open-publish-modal"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow transition-colors"
        >
          <Lock class="h-4 w-4" />
          Publier & Sceller la Doctrine
        </button>
      </div>
    </div>

    <!-- Bloquants Porte G7 si non éligible -->
    {#if health && !health.gate_g7_eligible && health.gate_g7_blockers.length > 0}
      <div class="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 space-y-2">
        <div class="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold text-xs uppercase tracking-wider">
          <AlertTriangle class="h-4 w-4" /> Conditions Préalables non Remplies
        </div>
        <ul class="list-disc list-inside text-xs text-rose-700 dark:text-rose-300 space-y-1">
          {#each health.gate_g7_blockers as blocker}
            <li>{blocker}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Historique des publications scellées -->
    <div class="space-y-3">
      <h3 class="text-sm font-semibold">Historique des Versions & Instantanés Scellés</h3>
      {#if publications.length === 0}
        <p class="text-xs text-muted-foreground italic">Aucune publication scellée pour le moment.</p>
      {:else}
        <div class="space-y-3">
          {#each publications as pub}
            <div data-testid="publication-item" class="rounded-lg border p-4 bg-muted/20 space-y-2">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded text-xs font-bold bg-primary/10 text-primary">
                    {pub.version}
                  </span>
                  <span class="font-mono text-xs font-semibold">{pub.snapshot_id}</span>
                </div>
                <div class="text-xs text-muted-foreground">
                  Publié le {new Date(pub.published_at).toLocaleDateString()} par <span class="font-medium text-foreground">{pub.published_by}</span>
                </div>
              </div>

              <p class="text-xs text-muted-foreground">{pub.changelog}</p>

              <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-[11px] text-muted-foreground">
                <div class="flex items-center gap-1 font-mono">
                  <Hash class="h-3 w-3 text-muted-foreground" />
                  <span class="truncate max-w-[280px] sm:max-w-md">{pub.sha256_checksum}</span>
                  <button
                    onclick={() => copyToClipboard(pub.sha256_checksum)}
                    class="p-1 hover:text-foreground transition-colors"
                    title="Copier le SHA-256"
                  >
                    <Copy class="h-3 w-3" />
                  </button>
                </div>
                <div class="flex items-center gap-3">
                  <span>{pub.assets_count} actifs scellés</span>
                  <span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Check class="h-3 w-3" /> Scellement Vérifié
                  </span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Section 2 : Campagnes d'Enrichissement Ciblées -->
  <div class="rounded-xl border bg-card p-6 space-y-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
      <div>
        <h2 class="text-lg font-bold">Campagnes d'Enrichissement Ciblées</h2>
        <p class="text-xs text-muted-foreground mt-1">
          Mobilisation des experts par domaine pour combler proactivement les lacunes de la doctrine.
        </p>
      </div>
      <div>
        <button
          onclick={() => (showCampaignModal = true)}
          class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-card hover:bg-muted transition-colors"
        >
          <Plus class="h-3.5 w-3.5" />
          Lancer une Campagne
        </button>
      </div>
    </div>

    {#if campaigns.length === 0}
      <p class="text-xs text-muted-foreground italic">Aucune campagne en cours.</p>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each campaigns as camp}
          <div class="rounded-lg border p-4 bg-muted/20 space-y-3">
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-2">
                  <h4 class="font-semibold text-sm">{camp.title}</h4>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider
                    {camp.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-primary/10 text-primary'}">
                    {camp.status}
                  </span>
                </div>
                <p class="text-xs text-muted-foreground mt-1">{camp.description}</p>
              </div>
            </div>

            <!-- Barre de progression -->
            <div class="space-y-1">
              <div class="flex justify-between text-xs text-muted-foreground">
                <span>Progression : {camp.progress.current} / {camp.progress.target} clauses</span>
                <span>{Math.round((camp.progress.current / camp.progress.target) * 100)}%</span>
              </div>
              <div class="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  class="h-full bg-primary transition-all duration-300"
                  style="width: {Math.min(100, Math.round((camp.progress.current / camp.progress.target) * 100))}%"
                ></div>
              </div>
            </div>

            <div class="flex items-center justify-between text-xs pt-2 border-t text-muted-foreground">
              <span>Domaine : <strong class="text-foreground">{camp.domain}</strong></span>
              {#if camp.status === 'active'}
                <button
                  onclick={() => incrementCampaign(camp.id)}
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border bg-card hover:bg-muted text-[11px] font-medium transition-colors"
                >
                  <Plus class="h-3 w-3" /> +1 clause
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Modal Publication Scellée -->
{#if showPublishModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div class="bg-card border rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-lg bg-primary/10 text-primary">
          <Lock class="h-5 w-5" />
        </div>
        <div>
          <h3 class="font-bold text-base">Sceller la Publication Officielle (Porte G7)</h3>
          <p class="text-xs text-muted-foreground">Émission d'un instantané cryptographique pérenne.</p>
        </div>
      </div>

      <div class="space-y-2">
        <label for="changelog" class="block text-xs font-semibold text-muted-foreground">
          Journal d'évolution (Changelog officiel) *
        </label>
        <textarea
          id="changelog"
          bind:value={publishChangelog}
          rows="4"
          data-testid="publish-changelog-input"
          placeholder="Ex: Intégration des règles de chiffrement inter-services et conformité NIS2..."
          class="w-full p-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        ></textarea>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t">
        <button
          onclick={() => (showPublishModal = false)}
          disabled={isPublishing}
          class="px-4 py-2 rounded-lg text-xs font-semibold border hover:bg-muted transition-colors"
        >
          Annuler
        </button>
        <button
          onclick={handlePublish}
          disabled={isPublishing}
          data-testid="btn-submit-publish"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {#if isPublishing}
            <RefreshCw class="h-3.5 w-3.5 animate-spin" />
            Scellement...
          {:else}
            <Check class="h-3.5 w-3.5" />
            Confirmer le Scellement
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Modal Nouvelle Campagne -->
{#if showCampaignModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div class="bg-card border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-lg bg-primary/10 text-primary">
          <Target class="h-5 w-5" />
        </div>
        <div>
          <h3 class="font-bold text-base">Lancer une Campagne d'Enrichissement</h3>
          <p class="text-xs text-muted-foreground">Solliciter les experts pour combler un vide doctrinal.</p>
        </div>
      </div>

      <div class="space-y-3">
        <div>
          <label for="title" class="block text-xs font-semibold text-muted-foreground mb-1">Titre de la campagne *</label>
          <input
            id="title"
            type="text"
            bind:value={newCampaign.title}
            placeholder="Ex: Durcissement Zéro-Trust"
            class="w-full p-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label for="domain" class="block text-xs font-semibold text-muted-foreground mb-1">Domaine</label>
            <select
              id="domain"
              bind:value={newCampaign.domain}
              class="w-full p-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="architecture">Architecture</option>
              <option value="security">Sécurité</option>
              <option value="cloud">Cloud & Infra</option>
              <option value="data">Données</option>
              <option value="network">Réseau</option>
            </select>
          </div>

          <div>
            <label for="target_count" class="block text-xs font-semibold text-muted-foreground mb-1">Objectif de clauses</label>
            <input
              id="target_count"
              type="number"
              min="1"
              bind:value={newCampaign.target_count}
              class="w-full p-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label for="desc" class="block text-xs font-semibold text-muted-foreground mb-1">Description / Enjeux</label>
          <textarea
            id="desc"
            bind:value={newCampaign.description}
            rows="3"
            placeholder="Objectifs attendus et contexte..."
            class="w-full p-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          ></textarea>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t">
        <button
          onclick={() => (showCampaignModal = false)}
          disabled={isCreatingCampaign}
          class="px-4 py-2 rounded-lg text-xs font-semibold border hover:bg-muted transition-colors"
        >
          Annuler
        </button>
        <button
          onclick={handleCreateCampaign}
          disabled={isCreatingCampaign}
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {#if isCreatingCampaign}
            <RefreshCw class="h-3.5 w-3.5 animate-spin" />
            Création...
          {:else}
            <Check class="h-3.5 w-3.5" />
            Lancer
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
