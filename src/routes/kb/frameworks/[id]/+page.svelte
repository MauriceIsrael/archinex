<script lang="ts">
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import Check from 'lucide-svelte/icons/check';
  import Edit from 'lucide-svelte/icons/edit';
  import X from 'lucide-svelte/icons/x';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import type {
    FrameworkIngestion,
    FrameworkRequirement,
    FrameworkRequirementStatus,
    FrameworkLinkSuggestion,
    CoverageDeclarationResult
  } from '$lib/types/llmops';

  interface Props {
    data: {
      user: { id: string; name: string; email: string; role: string };
      expert: { kbHandle: string; kbRoles: string[]; ownedDomains: string[] };
      ingestion: FrameworkIngestion;
    };
  }

  let { data }: Props = $props();

  let ingestion = $state<FrameworkIngestion>(data.ingestion);
  let statusFilter = $state<'all' | FrameworkRequirementStatus>('all');
  let searchQuery = $state('');

  // Suggestions IA en cours
  let loadingSuggestionsFor = $state<string | null>(null);
  let activeSuggestions = $state<Record<string, FrameworkLinkSuggestion[]>>({});

  // Modale d'amendement
  let amendingReq = $state<FrameworkRequirement | null>(null);
  let amendmentNotes = $state('');
  let amendmentMappedAssets = $state('');

  // Modale de rejet (motif obligatoire)
  let rejectingReq = $state<FrameworkRequirement | null>(null);
  let rejectionReason = $state('');

  // Déclaration de couverture
  let isDeclaringCoverage = $state(false);
  let coverageError = $state<string | null>(null);
  let missingReqs = $state<string[]>([]);
  let coverageDeclaration = $state<CoverageDeclarationResult | null>(null);

  // Filtrage des exigences
  let filteredRequirements = $derived(
    ingestion.requirements.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          r.section.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.text.toLowerCase().includes(q) ||
          r.mapped_assets.some((a) => a.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    })
  );

  // Statistiques
  let totalCount = $derived(ingestion.requirements.length);
  let acceptedCount = $derived(ingestion.requirements.filter((r) => r.status === 'accepted').length);
  let amendedCount = $derived(ingestion.requirements.filter((r) => r.status === 'amended').length);
  let rejectedCount = $derived(ingestion.requirements.filter((r) => r.status === 'rejected').length);
  let pendingCount = $derived(ingestion.requirements.filter((r) => r.status === 'pending').length);
  let reviewedPercent = $derived(totalCount > 0 ? Math.round(((totalCount - pendingCount) / totalCount) * 100) : 0);

  function userOwnsDomain(domain: string): boolean {
    return data.expert.ownedDomains.some((d) => d.toLowerCase() === domain.toLowerCase());
  }

  async function updateRequirementReview(
    reqId: string,
    payload: {
      status: FrameworkRequirementStatus;
      mapped_assets?: string[];
      amendment_notes?: string;
      rejection_reason?: string;
    }
  ) {
    try {
      const res = await fetch(`/api/frameworks/ingestions/${ingestion.id}/requirements/${reqId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Actor-Email': data.user.email
        },
        body: JSON.stringify(payload)
      });

      const resData = await res.json();
      if (!res.ok) {
        alert(resData.error || `Erreur HTTP ${res.status}`);
        return;
      }

      // Mise à jour locale
      const idx = ingestion.requirements.findIndex((r) => r.id === reqId);
      if (idx !== -1) {
        ingestion.requirements[idx] = resData.data;
        ingestion.reviewed_requirements = ingestion.requirements.filter((r) => r.status !== 'pending').length;
      }
    } catch (err: any) {
      alert(err.message || 'Erreur réseau');
    }
  }

  async function handleAccept(req: FrameworkRequirement) {
    await updateRequirementReview(req.id, {
      status: 'accepted',
      mapped_assets: req.mapped_assets.length > 0 ? req.mapped_assets : ['CTRL-SEC-01']
    });
  }

  function openAmendModal(req: FrameworkRequirement) {
    amendingReq = req;
    amendmentNotes = req.amendment_notes || '';
    amendmentMappedAssets = req.mapped_assets.join(', ');
  }

  async function submitAmend() {
    if (!amendingReq) return;
    const mapped = amendmentMappedAssets
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    await updateRequirementReview(amendingReq.id, {
      status: 'amended',
      mapped_assets: mapped,
      amendment_notes: amendmentNotes
    });

    amendingReq = null;
  }

  function openRejectModal(req: FrameworkRequirement) {
    rejectingReq = req;
    rejectionReason = req.rejection_reason || '';
  }

  async function submitReject() {
    if (!rejectingReq) return;
    if (!rejectionReason.trim()) {
      alert('Le motif de rejet est obligatoire.');
      return;
    }

    await updateRequirementReview(rejectingReq.id, {
      status: 'rejected',
      rejection_reason: rejectionReason
    });

    rejectingReq = null;
  }

  async function fetchLinkSuggestions(req: FrameworkRequirement) {
    loadingSuggestionsFor = req.id;
    try {
      const res = await fetch(
        `/api/frameworks/ingestions/${ingestion.id}/requirements/${req.id}/suggest-links`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Actor-Email': data.user.email
          }
        }
      );

      const resData = await res.json();
      if (res.ok && resData.data?.suggested_assets) {
        activeSuggestions[req.id] = resData.data.suggested_assets;
      } else {
        alert(resData.error || 'Impossible de charger les suggestions');
      }
    } catch (err: any) {
      alert(err.message || 'Erreur réseau');
    } finally {
      loadingSuggestionsFor = null;
    }
  }

  function attachSuggestedAsset(req: FrameworkRequirement, assetId: string) {
    if (!req.mapped_assets.includes(assetId)) {
      req.mapped_assets = [...req.mapped_assets, assetId];
      updateRequirementReview(req.id, {
        status: req.status === 'pending' ? 'accepted' : req.status,
        mapped_assets: req.mapped_assets
      });
    }
  }

  async function triggerCoverageDeclaration() {
    isDeclaringCoverage = true;
    coverageError = null;
    missingReqs = [];
    coverageDeclaration = null;

    try {
      const res = await fetch(`/api/frameworks/${ingestion.framework_id}/coverage-declaration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Actor-Email': data.user.email
        }
      });

      const resData = await res.json();

      if (res.status === 409) {
        coverageError = resData.error || 'Des exigences non résolues subsistent.';
        missingReqs = resData.missing_requirements || [];
      } else if (!res.ok) {
        coverageError = resData.error || `Erreur HTTP ${res.status}`;
      } else {
        coverageDeclaration = resData.data;
      }
    } catch (err: any) {
      coverageError = err.message || 'Erreur réseau lors de la déclaration de couverture.';
    } finally {
      isDeclaringCoverage = false;
    }
  }
</script>

<div class="space-y-6 max-w-7xl mx-auto px-4 py-6">
  <!-- Fil d'Ariane & Titre -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-200 pb-5">
    <div>
      <div class="flex items-center gap-2 mb-2 text-xs font-semibold text-surface-500">
        <a href="/kb/frameworks" class="hover:text-primary-600 flex items-center gap-1 transition-colors">
          <ArrowLeft class="w-3.5 h-3.5" />
          <span>Tous les Référentiels</span>
        </a>
        <span>/</span>
        <span class="text-surface-700">{ingestion.framework_id}</span>
      </div>
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold text-surface-900">{ingestion.framework_name}</h1>
        <span class="text-xs px-2.5 py-1 rounded bg-primary-100 text-primary-800 font-mono font-bold">
          v{ingestion.version}
        </span>
        <span class="text-xs px-2.5 py-1 rounded bg-surface-100 text-surface-700 font-mono uppercase">
          {ingestion.file_format}
        </span>
      </div>
      <p class="text-xs text-surface-500 mt-1">
        Fichier source : <span class="font-mono">{ingestion.file_name}</span> ({(ingestion.file_size_bytes / 1024).toFixed(1)} Ko)
      </p>
    </div>

    <!-- Bouton Déclaration de Couverture -->
    <div class="flex items-center gap-3">
      <button
        onclick={triggerCoverageDeclaration}
        disabled={isDeclaringCoverage}
        data-testid="btn-declare-coverage"
        class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm rounded-lg shadow-sm flex items-center gap-2 transition-colors"
      >
        {#if isDeclaringCoverage}
          <RefreshCw class="w-4 h-4 animate-spin" />
          <span>Vérification d'exhaustivité...</span>
        {:else}
          <ShieldCheck class="w-4 h-4" />
          <span>Déclarer la Couverture Opposable</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- Alerte Attestation de Couverture ou Conflit 409 -->
  {#if coverageDeclaration}
    <div class="p-5 bg-emerald-50 border-2 border-emerald-400 rounded-xl shadow-sm text-emerald-900">
      <div class="flex items-start gap-3">
        <ShieldCheck class="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 class="text-base font-bold">Attestation Formelle de Couverture Émise (Porte G6)</h3>
          <p class="text-sm mt-1">
            Le référentiel <strong>{coverageDeclaration.framework_id}</strong> a été intégralement instruit et couvert. Toutes les {coverageDeclaration.total_requirements} exigences sont alignées sur la doctrine.
          </p>
          <div class="mt-3 flex flex-wrap gap-4 text-xs font-mono text-emerald-800">
            <span>Déclaré par : <strong>{coverageDeclaration.declared_by}</strong></span>
            <span>Date : {new Date(coverageDeclaration.declared_at).toLocaleString()}</span>
            <span>Exigences couvertes : {coverageDeclaration.covered_requirements} / {coverageDeclaration.total_requirements}</span>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if coverageError}
    <div class="p-5 bg-rose-50 border-2 border-rose-300 rounded-xl shadow-sm text-rose-900">
      <div class="flex items-start gap-3">
        <AlertTriangle class="w-6 h-6 text-rose-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 class="text-base font-bold text-rose-800">Déclaration Bloquée (Conflit 409)</h3>
          <p class="text-sm mt-1">{coverageError}</p>
          {#if missingReqs.length > 0}
            <div class="mt-2">
              <span class="text-xs font-semibold text-rose-700">Exigences en attente de revue :</span>
              <div class="flex flex-wrap gap-1.5 mt-1">
                {#each missingReqs as reqId}
                  <span class="text-xs px-2 py-0.5 bg-rose-200 text-rose-800 rounded font-mono font-semibold">
                    {reqId}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Statistiques & Jauge de Revue -->
  <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
    <div class="bg-surface-50 border border-surface-200 rounded-lg p-3 text-center">
      <div class="text-xs text-surface-500 font-medium">Total Exigences</div>
      <div class="text-xl font-bold text-surface-900 mt-1">{totalCount}</div>
    </div>
    <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
      <div class="text-xs text-amber-700 font-medium">En Attente</div>
      <div class="text-xl font-bold text-amber-800 mt-1">{pendingCount}</div>
    </div>
    <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
      <div class="text-xs text-emerald-700 font-medium">Acceptées</div>
      <div class="text-xl font-bold text-emerald-800 mt-1">{acceptedCount}</div>
    </div>
    <div class="bg-sky-50 border border-sky-200 rounded-lg p-3 text-center">
      <div class="text-xs text-sky-700 font-medium">Amendées</div>
      <div class="text-xl font-bold text-sky-800 mt-1">{amendedCount}</div>
    </div>
    <div class="bg-rose-50 border border-rose-200 rounded-lg p-3 text-center">
      <div class="text-xs text-rose-700 font-medium">Rejetées</div>
      <div class="text-xl font-bold text-rose-800 mt-1">{rejectedCount}</div>
    </div>
  </div>

  <!-- Barre de progression globale -->
  <div class="bg-white border border-surface-200 rounded-lg p-4">
    <div class="flex items-center justify-between text-xs font-semibold mb-1.5">
      <span class="text-surface-700">Taux d'Instruction Ligne par Ligne</span>
      <span class="text-primary-700 font-bold">{reviewedPercent}% instruit</span>
    </div>
    <div class="w-full bg-surface-100 rounded-full h-3 overflow-hidden border border-surface-200 flex">
      <div style="width: {totalCount > 0 ? (acceptedCount / totalCount) * 100 : 0}%" class="bg-emerald-500 h-full" title="Acceptées"></div>
      <div style="width: {totalCount > 0 ? (amendedCount / totalCount) * 100 : 0}%" class="bg-sky-500 h-full" title="Amendées"></div>
      <div style="width: {totalCount > 0 ? (rejectedCount / totalCount) * 100 : 0}%" class="bg-rose-500 h-full" title="Rejetées"></div>
    </div>
  </div>

  <!-- Barre de Recherche et Filtres -->
  <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
    <div class="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
      <button
        onclick={() => (statusFilter = 'all')}
        class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors {statusFilter === 'all' ? 'bg-surface-900 text-white' : 'bg-surface-100 text-surface-700 hover:bg-surface-200'}"
      >
        Toutes ({totalCount})
      </button>
      <button
        onclick={() => (statusFilter = 'pending')}
        class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors {statusFilter === 'pending' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'}"
      >
        En attente ({pendingCount})
      </button>
      <button
        onclick={() => (statusFilter = 'accepted')}
        class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors {statusFilter === 'accepted' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}"
      >
        Acceptées ({acceptedCount})
      </button>
      <button
        onclick={() => (statusFilter = 'amended')}
        class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors {statusFilter === 'amended' ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-800 hover:bg-sky-100'}"
      >
        Amendées ({amendedCount})
      </button>
      <button
        onclick={() => (statusFilter = 'rejected')}
        class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors {statusFilter === 'rejected' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-800 hover:bg-rose-100'}"
      >
        Rejetées ({rejectedCount})
      </button>
    </div>

    <div class="w-full sm:w-64">
      <input
        type="search"
        bind:value={searchQuery}
        placeholder="Rechercher par article, texte, tag..."
        class="w-full px-3 py-1.5 text-xs border border-surface-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </div>
  </div>

  <!-- Liste des Exigences -->
  <div class="space-y-4">
    {#each filteredRequirements as req (req.id)}
      {@const isOwned = userOwnsDomain(req.domain)}
      <div data-testid="framework-requirement-row" class="bg-white border border-surface-200 rounded-xl p-5 shadow-sm space-y-4">
        <!-- Ligne supérieure : Section, Titre, Statut, Domaine -->
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="px-2 py-0.5 text-xs font-bold font-mono bg-surface-100 text-surface-800 rounded">
                {req.section}
              </span>
              <span class="text-xs px-2 py-0.5 rounded font-mono {isOwned ? 'bg-primary-50 text-primary-700 border border-primary-200' : 'bg-surface-100 text-surface-500'}">
                Domaine : {req.domain}
              </span>
              {#if !isOwned}
                <span class="text-xs text-surface-400 italic">(Lecture seule - domaine non possédé)</span>
              {/if}
            </div>
            <h3 class="text-base font-bold text-surface-900">{req.title}</h3>
          </div>

          <div>
            {#if req.status === 'pending'}
              <span class="px-3 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span>En attente</span>
              </span>
            {:else if req.status === 'accepted'}
              <span class="px-3 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5">
                <Check class="w-3.5 h-3.5 text-emerald-600" />
                <span>Acceptée</span>
              </span>
            {:else if req.status === 'amended'}
              <span class="px-3 py-1 text-xs font-bold rounded-full bg-sky-100 text-sky-800 border border-sky-300 flex items-center gap-1.5">
                <Edit class="w-3.5 h-3.5 text-sky-600" />
                <span>Amendée</span>
              </span>
            {:else if req.status === 'rejected'}
              <span class="px-3 py-1 text-xs font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1.5">
                <X class="w-3.5 h-3.5 text-rose-600" />
                <span>Rejetée</span>
              </span>
            {/if}
          </div>
        </div>

        <!-- Texte de l'exigence -->
        <p class="text-sm text-surface-700 bg-surface-50 p-3.5 rounded-lg border border-surface-200 leading-relaxed font-serif">
          {req.text}
        </p>

        <!-- Liaisons doctrinales -->
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-semibold text-surface-500">Actifs Doctrinals Associés :</span>
          {#if req.mapped_assets.length === 0}
            <span class="text-xs text-amber-700 italic">Aucun actif associé (requis pour conformité)</span>
          {:else}
            {#each req.mapped_assets as assetId}
              <span class="px-2.5 py-1 text-xs font-mono font-semibold rounded bg-primary-50 border border-primary-200 text-primary-800">
                {assetId}
              </span>
            {/each}
          {/if}
        </div>

        <!-- Détails de revue si amendé ou rejeté -->
        {#if req.amendment_notes}
          <div class="p-3 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-900">
            <span class="font-bold">Note d'amendement :</span> {req.amendment_notes}
          </div>
        {/if}

        {#if req.rejection_reason}
          <div class="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900">
            <span class="font-bold">Motif de rejet obligatoire :</span> {req.rejection_reason}
          </div>
        {/if}

        <!-- Suggestions de l'IA (LLM-Derived) -->
        {#if activeSuggestions[req.id]}
          <div class="p-3.5 bg-purple-50 border border-purple-200 rounded-lg space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                <Sparkles class="w-4 h-4 text-purple-600" />
                <span>Correspondances Suggérées par l'IA</span>
              </span>
              <span class="text-[10px] font-mono px-2 py-0.5 bg-purple-200 text-purple-800 rounded font-semibold">
                llm-derived (validation humaine requise)
              </span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              {#each activeSuggestions[req.id] as sugg}
                <div class="p-2.5 bg-white border border-purple-100 rounded text-xs flex items-center justify-between gap-2 shadow-2xs">
                  <div>
                    <div class="font-mono font-bold text-surface-900">{sugg.asset_id}</div>
                    <div class="text-surface-600 text-[11px]">{sugg.title}</div>
                    <div class="text-purple-700 text-[10px] mt-0.5 italic">{sugg.rationale} ({Math.round(sugg.confidence * 100)}% conf.)</div>
                  </div>
                  {#if isOwned}
                    <button
                      onclick={() => attachSuggestedAsset(req, sugg.asset_id)}
                      class="px-2 py-1 text-[11px] font-semibold bg-purple-100 hover:bg-purple-200 text-purple-800 rounded transition-colors flex-shrink-0"
                    >
                      + Associer
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Actions de Revue -->
        <div class="pt-3 border-t border-surface-100 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button
              onclick={() => fetchLinkSuggestions(req)}
              disabled={loadingSuggestionsFor === req.id}
              class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-800 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {#if loadingSuggestionsFor === req.id}
                <RefreshCw class="w-3.5 h-3.5 animate-spin" />
                <span>Analyse sémantique...</span>
              {:else}
                <Sparkles class="w-3.5 h-3.5 text-purple-600" />
                <span>Suggérer correspondances IA</span>
              {/if}
            </button>
          </div>

          <div class="flex items-center gap-2">
            {#if isOwned}
              <button
                onclick={() => handleAccept(req)}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-2xs transition-colors"
              >
                <Check class="w-3.5 h-3.5" />
                <span>Accepter</span>
              </button>
              <button
                onclick={() => openAmendModal(req)}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white flex items-center gap-1.5 shadow-2xs transition-colors"
              >
                <Edit class="w-3.5 h-3.5" />
                <span>Amender</span>
              </button>
              <button
                onclick={() => openRejectModal(req)}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 shadow-2xs transition-colors"
              >
                <X class="w-3.5 h-3.5" />
                <span>Rejeter</span>
              </button>
            {:else}
              <span class="text-xs text-surface-400 italic">
                Décision réservée au propriétaire du domaine '{req.domain}'
              </span>
            {/if}
          </div>
        </div>

        {#if req.reviewed_by}
          <div class="text-[11px] text-surface-400 text-right">
            Dernière revue par {req.reviewed_by} le {new Date(req.reviewed_at || '').toLocaleString()}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Modale d'Amendement -->
  {#if amendingReq}
    <div class="fixed inset-0 bg-surface-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-xl shadow-xl border border-surface-200 max-w-lg w-full p-6 space-y-4">
        <h3 class="text-lg font-bold text-surface-900">
          Amender l'exigence : {amendingReq.section}
        </h3>
        <p class="text-xs text-surface-600 font-serif bg-surface-50 p-3 rounded border border-surface-200">
          {amendingReq.text}
        </p>

        <div>
          <label for="amendAssetsInput" class="block text-xs font-semibold text-surface-700 mb-1">
            Actifs Doctrinals Associés (séparés par virgule)
          </label>
          <input
            id="amendAssetsInput"
            type="text"
            bind:value={amendmentMappedAssets}
            placeholder="Ex: CTRL-SEC-01, PRIN-RES-01, PAT-OUTBOX-02"
            class="w-full px-3 py-2 text-xs border border-surface-300 rounded-lg focus:ring-2 focus:ring-sky-500 font-mono"
          />
        </div>

        <div>
          <label for="amendNotesInput" class="block text-xs font-semibold text-surface-700 mb-1">
            Notes d'Amendement & Adaptation Opérationnelle
          </label>
          <textarea
            id="amendNotesInput"
            bind:value={amendmentNotes}
            rows="3"
            placeholder="Précisez la portée ou les adaptations doctrinales requises..."
            class="w-full px-3 py-2 text-xs border border-surface-300 rounded-lg focus:ring-2 focus:ring-sky-500"
          ></textarea>
        </div>

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-surface-100">
          <button
            onclick={() => (amendingReq = null)}
            class="px-4 py-2 text-xs font-semibold text-surface-600 hover:bg-surface-100 rounded-lg"
          >
            Annuler
          </button>
          <button
            onclick={submitAmend}
            class="px-4 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm"
          >
            Enregistrer l'Amendement
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Modale de Rejet (Motif Obligatoire) -->
  {#if rejectingReq}
    <div class="fixed inset-0 bg-surface-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-xl shadow-xl border border-surface-200 max-w-lg w-full p-6 space-y-4">
        <div class="flex items-center gap-2 text-rose-700">
          <AlertTriangle class="w-5 h-5" />
          <h3 class="text-lg font-bold text-surface-900">
            Rejeter l'exigence : {rejectingReq.section}
          </h3>
        </div>
        <p class="text-xs text-surface-600">
          Règle constitutionnelle IV : Tout rejet d'exigence réglementaire exige une justification circonstanciée obligatoire.
        </p>

        <div>
          <label for="rejectionReasonInput" class="block text-xs font-semibold text-surface-700 mb-1">
            Motif Circonstancié du Rejet *
          </label>
          <textarea
            id="rejectionReasonInput"
            bind:value={rejectionReason}
            rows="4"
            placeholder="Justifiez pour quelle raison cette exigence ne s'applique pas ou fait l'objet d'un refus..."
            class="w-full px-3 py-2 text-xs border border-surface-300 rounded-lg focus:ring-2 focus:ring-rose-500"
          ></textarea>
        </div>

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-surface-100">
          <button
            onclick={() => (rejectingReq = null)}
            class="px-4 py-2 text-xs font-semibold text-surface-600 hover:bg-surface-100 rounded-lg"
          >
            Annuler
          </button>
          <button
            onclick={submitReject}
            disabled={!rejectionReason.trim()}
            class="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg shadow-sm"
          >
            Confirmer le Rejet Motivé
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
