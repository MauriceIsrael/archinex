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
    CoverageDeclarationResult,
    CheckClauseRow,
    CheckClauseDecision
  } from '$lib/types/llmops';

  interface Props {
    data: {
      user: { id: string; name: string; email: string; role: string };
      expert: { kbHandle: string; kbRoles: string[]; ownedDomains: string[]; registered?: boolean };
      ingestion: FrameworkIngestion;
      clauses?: CheckClauseRow[];
    };
  }

  let { data }: Props = $props();

  let ingestion = $state<FrameworkIngestion>(data.ingestion);
  let statusFilter = $state<'all' | FrameworkRequirementStatus>('all');
  let searchQuery = $state('');

  // Suggestions IA en cours
  let loadingSuggestionsFor = $state<string | null>(null);
  let activeSuggestions = $state<Record<string, FrameworkLinkSuggestion[]>>({});

  // --- Décisions sur les clauses vérifiables (#93) ---
  let clauseFeedback = $state<Record<string, { ok: boolean; text: string }>>({});
  let clauseBusy = $state<string | null>(null);
  let editingClause = $state<{ reqId: string; clause: CheckClauseRow } | null>(null);
  let rejectingClause = $state<{ reqId: string; clause: CheckClauseRow } | null>(null);
  let clauseComment = $state('');
  let draftWhen = $state('');
  let draftExpect = $state('');
  let draftMessage = $state('');

  const splitLines = (text: string) => text.split(/\r?\n|,/).map((t) => t.trim()).filter(Boolean);

  function startAmendClause(req: FrameworkRequirement, clause: CheckClauseRow) {
    editingClause = { reqId: req.id, clause };
    rejectingClause = null;
    clauseComment = '';
    draftWhen = (clause.when.terms_any ?? []).join('\n');
    draftExpect = (clause.expect?.terms_any ?? []).join('\n');
    draftMessage = clause.message ?? '';
  }

  function startRejectClause(req: FrameworkRequirement, clause: CheckClauseRow) {
    rejectingClause = { reqId: req.id, clause };
    editingClause = null;
    clauseComment = '';
  }

  function getAmendedClausePayload(clause: CheckClauseRow) {
    return {
      kind: clause.kind,
      when: { ...clause.when, terms_any: splitLines(draftWhen) },
      ...(clause.kind === 'requires' ? { expect: { ...(clause.expect ?? {}), terms_any: splitLines(draftExpect) } } : {}),
      message: draftMessage.trim()
    };
  }

  async function decideClause(
    req: FrameworkRequirement,
    clause: CheckClauseRow,
    decision: CheckClauseDecision
  ) {
    const assetId = clause.asset_id || req.id;
    const checkId = clause.check_id;
    const clauseKey = `${assetId}/${checkId}`;
    clauseBusy = clauseKey;

    try {
      const res = await fetch(`/api/kb/clauses/${encodeURIComponent(assetId)}/${encodeURIComponent(checkId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Actor-Email': data.user.email
        },
        body: JSON.stringify({
          decision,
          ...(decision !== 'validate' ? { comment: clauseComment } : {}),
          ...(decision === 'amend' ? { clause: getAmendedClausePayload(clause) } : {})
        })
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        clauseFeedback = {
          ...clauseFeedback,
          [clauseKey]: { ok: false, text: body.error || `Erreur HTTP ${res.status}` }
        };
        return;
      }

      const updated = body.data as CheckClauseRow;
      if (req.checks) {
        req.checks = req.checks.map((c) => (c.check_id === checkId ? { ...c, ...updated } : c));
      }

      editingClause = null;
      rejectingClause = null;
      clauseComment = '';

      const verb = decision === 'reject' ? 'rejetée' : decision === 'amend' ? 'amendée et validée' : 'validée';
      clauseFeedback = {
        ...clauseFeedback,
        [clauseKey]: { ok: true, text: `Clause ${verb} avec succès.` }
      };
    } catch (err: any) {
      clauseFeedback = {
        ...clauseFeedback,
        [clauseKey]: { ok: false, text: err.message || 'Erreur réseau' }
      };
    } finally {
      clauseBusy = null;
    }
  }

  // Modale d'amendement
  let amendingReq = $state<FrameworkRequirement | null>(null);
  let amendmentNotes = $state('');
  let amendmentMappedAssets = $state('');
  let amendmentCriteria = $state('');
  let amendmentTitleFr = $state('');

  /**
   * Présentation du texte légal : LLMOps place l'introduction du paragraphe après le point (« > Context: … »)
   * et garde les énumérations (a), (b)… sur une ligne. On affiche l'introduction d'abord, et un sous-point par ligne.
   */
  function legalParts(text: string): { context: string; body: string[] } {
    const [main, context = ''] = (text || '').split(/\s*>\s*Context:\s*/);
    // Un sous-point commence après « : » ou « ; » (et non sur « point (a) and … » au milieu d'une phrase)
    const body = main.split(/(?<=[:;])\s+(?=\((?:[a-z]|[ivx]+)\)\s)/).map((s) => s.trim()).filter(Boolean);
    return { context: context.trim(), body };
  }

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

  // Même règle que LLMOps : un mainteneur relit tous les domaines ; sinon il faut posséder le domaine (ou un parent).
  const canReviewAll = $derived(data.expert.kbRoles.includes('kb:maintain'));
  function userOwnsDomain(domain: string): boolean {
    if (canReviewAll) return true;
    const d = domain.toLowerCase();
    return data.expert.ownedDomains.some((o) => {
      const owned = o.toLowerCase();
      return d === owned || d.startsWith(`${owned}/`) || d.startsWith(`${owned}-`);
    });
  }

  async function updateRequirementReview(
    reqId: string,
    payload: {
      status: FrameworkRequirementStatus;
      mapped_assets?: string[];
      amendment_notes?: string;
      rejection_reason?: string;
      acceptance_criteria?: string[];
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
        ingestion.requirements[idx] = { ...resData.data, framework_id: ingestion.requirements[idx].framework_id };
        ingestion.reviewed_requirements = ingestion.requirements.filter((r) => r.status !== 'pending').length;
      }
    } catch (err: any) {
      alert(err.message || 'Erreur réseau');
    }
  }

  async function handleAccept(req: FrameworkRequirement) {
    await updateRequirementReview(req.id, {
      // Acceptation telle que proposée : LLMOps reprend les liens et critères proposés de la ligne
      status: 'accepted'
    });
  }

  function openAmendModal(req: FrameworkRequirement) {
    amendingReq = req;
    amendmentNotes = req.amendment_notes || '';
    amendmentTitleFr = req.title_fr || req.proposed_title_fr || '';
    amendmentMappedAssets = req.mapped_assets.join(', ');
    // Point de départ : critères déjà retenus, sinon ceux proposés (une ligne par critère)
    amendmentCriteria = (req.acceptance_criteria?.length ? req.acceptance_criteria : req.proposed_acceptance_criteria ?? []).join('\n');
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
      amendment_notes: amendmentNotes,
      acceptance_criteria: amendmentCriteria.split('\n').map((c) => c.trim()).filter(Boolean),
      ...(amendmentTitleFr.trim() ? { title_fr: amendmentTitleFr.trim() } : {})
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

  // Propositions préparées hors ligne (fichier JSON du dépôt LLMOps, data/proposals/frameworks/) : chargées sur les lignes,
  // elles restent à accepter, amender ou rejeter une par une.
  let isLoadingProposals = $state(false);
  async function loadProposals(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    isLoadingProposals = true;
    coverageError = null;
    try {
      const res = await fetch(`/api/frameworks/ingestions/${ingestion.id}/link-proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: await file.text()
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || `Erreur HTTP ${res.status}`);
      location.reload();
    } catch (err: any) {
      coverageError = `Propositions non chargées : ${err.message}`;
    } finally {
      isLoadingProposals = false;
      input.value = '';
    }
  }

  // Publication : les exigences acceptées ou amendées deviennent des contrôles actifs de la base LLMOps.
  let isApplying = $state(false);
  async function applyIngestion() {
    isApplying = true;
    coverageError = null;
    try {
      const res = await fetch(`/api/frameworks/ingestions/${ingestion.id}/apply`, { method: 'POST' });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || `Erreur HTTP ${res.status}`);
      if (resData.publication?.status !== 'ok') {
        // Contrôles promus mais base servie non rafraîchie : le juge ne les voit pas encore.
        coverageError = `Exigences appliquées, mais la publication de la base a échoué (${resData.publication?.error || resData.publication?.status}) : relancez « Publier ».`;
      } else {
        alert('Exigences validées publiées : elles accompagnent désormais les sujets et le juge de conformité.');
      }
    } catch (err: any) {
      coverageError = `Publication impossible : ${err.message}`;
    } finally {
      isApplying = false;
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
  {#if !data.expert.registered}
    <div class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" data-testid="not-registered-banner">
      <strong>Lecture seule.</strong> Le compte <span class="font-mono">{data.user.email}</span> n'est pas un responsable déclaré dans LLMOps :
      ses décisions seraient refusées. Connectez-vous avec le compte dont l'adresse figure dans le registre des responsables
      (par exemple celui des mainteneurs pour relire tous les domaines).
    </div>
  {:else}
    <p class="text-xs text-muted-foreground">
      Vous relisez en tant que <span class="font-mono font-semibold">{data.expert.kbHandle}</span>
      {#if canReviewAll}(mainteneur : tous les domaines){:else}(domaines : {data.expert.ownedDomains.join(', ') || 'aucun'}){/if}.
    </p>
  {/if}
  <!-- Fil d'Ariane & Titre -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
    <div>
      <div class="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground">
        <a href="/kb/frameworks" class="hover:text-primary flex items-center gap-1 transition-colors">
          <ArrowLeft class="w-3.5 h-3.5" />
          <span>Tous les Référentiels</span>
        </a>
        <span>/</span>
        <span class="text-muted-foreground">{ingestion.framework_id}</span>
      </div>
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold text-foreground">{ingestion.framework_name}</h1>
        <span class="text-xs px-2.5 py-1 rounded bg-primary/15 text-primary font-mono font-bold">
          v{ingestion.version}
        </span>
        <span class="text-xs px-2.5 py-1 rounded bg-muted text-muted-foreground font-mono uppercase">
          {ingestion.file_format}
        </span>
      </div>
      <p class="text-xs text-muted-foreground mt-1">
        Fichier source : <span class="font-mono">{ingestion.file_name}</span> ({(ingestion.file_size_bytes / 1024).toFixed(1)} Ko)
      </p>
    </div>

    <!-- Bouton Déclaration de Couverture -->
    <div class="flex items-center gap-3">
      <label
        class="px-4 py-2.5 border border-purple-400 text-purple-700 hover:bg-purple-50 font-semibold text-sm rounded-lg cursor-pointer"
        title="Fichier JSON de propositions (critères d'acceptation, liens) préparé dans le dépôt LLMOps : data/proposals/frameworks/"
      >
        {isLoadingProposals ? 'Chargement…' : 'Charger des propositions (JSON)'}
        <input type="file" accept="application/json,.json" class="hidden" onchange={loadProposals} data-testid="input-proposals" />
      </label>
      <button
        onclick={applyIngestion}
        disabled={isApplying || acceptedCount + amendedCount === 0}
        data-testid="btn-apply-ingestion"
        title="Publie dans la base LLMOps les exigences acceptées ou amendées (rôle kb:maintain)"
        class="px-4 py-2.5 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 font-semibold text-sm rounded-lg flex items-center gap-2 transition-colors"
      >
        {#if isApplying}<RefreshCw class="w-4 h-4 animate-spin" />{/if}
        <span>Publier les exigences validées ({acceptedCount + amendedCount})</span>
      </button>
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
    <div class="bg-muted/50 border border-border rounded-lg p-3 text-center">
      <div class="text-xs text-muted-foreground font-medium">Total Exigences</div>
      <div class="text-xl font-bold text-foreground mt-1">{totalCount}</div>
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
  <div class="bg-white border border-border rounded-lg p-4">
    <div class="flex items-center justify-between text-xs font-semibold mb-1.5">
      <span class="text-muted-foreground">Taux d'Instruction Ligne par Ligne</span>
      <span class="text-primary font-bold">{reviewedPercent}% instruit</span>
    </div>
    <div class="w-full bg-muted rounded-full h-3 overflow-hidden border border-border flex">
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
        class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors {statusFilter === 'all' ? 'bg-foreground text-white' : 'bg-muted text-muted-foreground hover:bg-muted'}"
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
        class="w-full px-3 py-1.5 text-xs border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  </div>

  <!-- Liste des Exigences -->
  <div class="space-y-4">
    {#each filteredRequirements as req (req.id)}
      {@const isOwned = userOwnsDomain(req.domain)}
      {@const parts = legalParts(req.text)}
      <div data-testid="framework-requirement-row" class="bg-white border border-border rounded-xl p-5 shadow-sm space-y-4">
        <!-- Ligne supérieure : Section, Titre, Statut, Domaine -->
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="px-2 py-0.5 text-xs font-bold font-mono bg-muted text-foreground rounded">
                {req.section}
              </span>
              <span class="text-xs px-2 py-0.5 rounded font-mono {isOwned ? 'bg-primary/10 text-primary border border-primary/30' : 'bg-muted text-muted-foreground'}">
                Domaine : {req.domain}
              </span>
              {#if !isOwned}
                <span class="text-xs text-muted-foreground italic">(Lecture seule - domaine non possédé)</span>
              {/if}
            </div>
            <h3 class="text-base font-bold text-foreground">{req.title}</h3>
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

        {#if req.title_fr || req.source_ref}
          <p class="text-xs text-muted-foreground">
            {#if req.title_fr}<span class="font-semibold text-foreground">{req.title_fr}</span>{/if}
            {#if req.source_ref}<span class="ml-2 font-mono">{req.source_ref}</span>{/if}
            {#if req.in_kb}<span class="ml-2 px-1.5 py-0.5 rounded bg-muted border text-[10px] font-semibold">déjà dans la base</span>{/if}
          </p>
        {/if}

        <!-- Texte de l'exigence (texte légal, mot pour mot) -->
        <p class="text-sm text-muted-foreground bg-muted/50 p-3.5 rounded-lg border border-border leading-relaxed font-serif">
          {#if parts.context}
            <span class="block mb-2 text-xs italic text-muted-foreground">{parts.context}</span>
          {/if}
          {#each parts.body as line, i (i)}
            <span class="block {i > 0 ? 'mt-1.5 pl-4' : ''}">{line}</span>
          {/each}
        </p>

        <!-- Critères d'acceptation : retenus par l'expert, sinon proposés -->
        {#if req.acceptance_criteria?.length}
          <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1">
            <span class="font-bold text-emerald-900">Critères d'acceptation retenus</span>
            <ul class="list-disc pl-5 text-emerald-900">{#each req.acceptance_criteria as c (c)}<li>{c}</li>{/each}</ul>
          </div>
        {:else if req.proposed_acceptance_criteria?.length}
          <div class="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs space-y-1" data-testid="proposed-criteria">
            <span class="font-bold text-purple-900">
              Critères d'acceptation proposés {req.links_production_mode === 'llm-derived' ? 'par le modèle' : ''} — à accepter, amender ou rejeter
            </span>
            <ul class="list-disc pl-5 text-purple-900">{#each req.proposed_acceptance_criteria as c (c)}<li>{c}</li>{/each}</ul>
          </div>
        {/if}

        <!-- Clauses Vérifiables du Contrôle (checks:) (#93) -->
        <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3" data-testid="requirement-clauses-block">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck class="w-4 h-4 text-primary" />
              <span>Clauses vérifiables (checks) — {req.checks?.length ?? 0}</span>
            </span>
            <span class="text-[10px] text-muted-foreground font-mono">
              Règles bloquantes (« exige / interdit »)
            </span>
          </div>

          {#if !req.checks || req.checks.length === 0}
            <p class="text-xs text-muted-foreground italic" data-testid="no-clauses-msg">
              Aucune clause vérifiable associée à cette exigence.
            </p>
          {:else}
            <div class="space-y-3">
              {#each req.checks as clause (clause.check_id)}
                {@const k = `${clause.asset_id || req.id}/${clause.check_id}`}
                <div class="p-3 bg-white border border-slate-200 rounded-lg space-y-2 shadow-2xs" data-testid="clause-row-{clause.check_id}">
                  <!-- En-tête de clause : Type (exige/interdit), Identifiant, Statut, Relecteur -->
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-bold px-2 py-0.5 rounded {clause.kind === 'forbids' ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary'}">
                        {clause.kind === 'forbids' ? 'Interdit' : 'Exige'}
                      </span>
                      <span class="font-mono text-xs font-semibold text-foreground">{clause.check_id}</span>
                      <span class="text-xs px-2 py-0.5 rounded font-semibold {clause.status === 'validated' ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : clause.status === 'rejected' ? 'bg-rose-100 text-rose-700 border border-rose-300 line-through' : 'bg-amber-100 text-amber-700 border border-amber-300'}">
                        {clause.status === 'validated' ? 'Validée' : clause.status === 'rejected' ? 'Rejetée' : 'Brouillon'}
                      </span>
                    </div>

                    {#if clause.review}
                      <span class="text-[11px] text-muted-foreground">
                        {clause.review.decision === 'reject' ? 'Rejetée' : clause.review.decision === 'amend' ? 'Amendée' : 'Validée'} par {clause.review.by} {clause.review.comment ? `(« ${clause.review.comment} »)` : ''}
                      </span>
                    {/if}
                  </div>

                  {#if editingClause && editingClause.clause.check_id === clause.check_id}
                    <!-- Formulaire d'amendement de la clause -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
                      <label class="space-y-1">
                        <span class="font-semibold text-slate-700">Déclencheur (when) : si l'option cite (un terme par ligne)</span>
                        <textarea bind:value={draftWhen} rows="3" class="w-full rounded border border-border bg-white p-2 font-mono text-xs"></textarea>
                      </label>
                      {#if clause.kind === 'requires'}
                        <label class="space-y-1">
                          <span class="font-semibold text-slate-700">Termes attendus (expect) : doit alors citer l'un de (un terme par ligne)</span>
                          <textarea bind:value={draftExpect} rows="3" class="w-full rounded border border-border bg-white p-2 font-mono text-xs"></textarea>
                        </label>
                      {/if}
                      <label class="space-y-1 md:col-span-2">
                        <span class="font-semibold text-slate-700">Message affiché à l'architecte</span>
                        <input bind:value={draftMessage} class="w-full rounded border border-border bg-white p-1.5 text-xs" />
                      </label>
                      <label class="space-y-1 md:col-span-2">
                        <span class="font-semibold text-slate-700">Motif de l'amendement (obligatoire)</span>
                        <input bind:value={clauseComment} placeholder="Ex: Précision des termes techniques exigés..." class="w-full rounded border border-border bg-white p-1.5 text-xs" />
                      </label>
                    </div>
                  {:else}
                    <!-- Détails de la clause : Déclencheurs, Termes attendus, Message -->
                    <div class="text-xs space-y-1.5 text-slate-700">
                      <p>
                        <span class="text-muted-foreground font-semibold">Déclencheur :</span>
                        <span>Se déclenche si l'option mentionne {clause.when.terms_all?.length ? 'tous ces termes' : "l'un de ces termes"} :</span>
                        {#each [...(clause.when.terms_any ?? []), ...(clause.when.terms_all ?? [])] as term}
                          <span class="inline-block text-[11px] font-mono px-1.5 py-0.5 m-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800">{term}</span>
                        {/each}
                      </p>
                      {#if clause.kind === 'requires' && clause.expect}
                        <p>
                          <span class="text-muted-foreground font-semibold">Termes attendus :</span>
                          <span>Doit obligatoirement mentionner l'un de :</span>
                          {#each [...(clause.expect.terms_any ?? []), ...(clause.expect.terms_all ?? [])] as term}
                            <span class="inline-block text-[11px] font-mono px-1.5 py-0.5 m-0.5 rounded bg-primary/10 border border-primary/20 text-primary">{term}</span>
                          {/each}
                        </p>
                      {/if}
                      {#if clause.message}
                        <p class="italic text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                          « {clause.message} »
                        </p>
                      {/if}
                    </div>
                  {/if}

                  {#if rejectingClause && rejectingClause.clause.check_id === clause.check_id}
                    <div class="pt-2 border-t border-slate-100 space-y-1.5">
                      <label for="clauseRejectInput-{clause.check_id}" class="text-xs font-semibold text-rose-800 block">
                        Motif du rejet de la clause (obligatoire) :
                      </label>
                      <input
                        id="clauseRejectInput-{clause.check_id}"
                        bind:value={clauseComment}
                        placeholder="Ex: Règle inadaptée au contexte réglementaire..."
                        class="w-full rounded border border-rose-300 bg-rose-50/50 p-1.5 text-xs text-rose-900"
                      />
                    </div>
                  {/if}

                  <!-- Actions sur la clause (décision explicite) -->
                  <div class="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                      {#if isOwned}
                        {#if editingClause && editingClause.clause.check_id === clause.check_id}
                          <button
                            onclick={() => decideClause(req, clause, 'amend')}
                            disabled={clauseBusy === k || !clauseComment.trim()}
                            data-testid="btn-confirm-amend-clause"
                            class="px-2.5 py-1 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-700 text-white transition-colors disabled:opacity-50"
                          >
                            Valider la clause amendée
                          </button>
                          <button
                            onclick={() => (editingClause = null)}
                            class="px-2.5 py-1 text-xs font-semibold rounded border border-border text-foreground hover:bg-muted transition-colors"
                          >
                            Annuler
                          </button>
                        {:else if rejectingClause && rejectingClause.clause.check_id === clause.check_id}
                          <button
                            onclick={() => decideClause(req, clause, 'reject')}
                            disabled={clauseBusy === k || !clauseComment.trim()}
                            data-testid="btn-confirm-reject-clause"
                            class="px-2.5 py-1 text-xs font-semibold rounded bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-50"
                          >
                            Confirmer le rejet
                          </button>
                          <button
                            onclick={() => (rejectingClause = null)}
                            class="px-2.5 py-1 text-xs font-semibold rounded border border-border text-foreground hover:bg-muted transition-colors"
                          >
                            Annuler
                          </button>
                        {:else}
                          {#if clause.status !== 'validated'}
                            <button
                              onclick={() => decideClause(req, clause, 'validate')}
                              disabled={clauseBusy === k}
                              data-testid="btn-validate-clause"
                              class="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 shadow-2xs transition-colors disabled:opacity-50"
                            >
                              <Check class="w-3 h-3" />
                              <span>Valider la clause</span>
                            </button>
                          {/if}
                          <button
                            onclick={() => startAmendClause(req, clause)}
                            data-testid="btn-amend-clause"
                            class="px-2.5 py-1 text-xs font-semibold rounded border border-border text-foreground hover:bg-muted flex items-center gap-1 transition-colors"
                          >
                            <Edit class="w-3 h-3" />
                            <span>Amender la clause</span>
                          </button>
                          {#if clause.status !== 'rejected'}
                            <button
                              onclick={() => startRejectClause(req, clause)}
                              data-testid="btn-reject-clause"
                              class="px-2.5 py-1 text-xs font-semibold rounded border border-rose-300 text-rose-700 hover:bg-rose-50 flex items-center gap-1 transition-colors"
                            >
                              <X class="w-3 h-3" />
                              <span>Rejeter la clause</span>
                            </button>
                          {/if}
                        {/if}
                      {:else}
                        <span class="text-[11px] text-muted-foreground italic">
                          Décision sur les clauses réservée au propriétaire du domaine
                        </span>
                      {/if}
                    </div>

                    {#if clauseFeedback[k]}
                      <span class="text-xs {clauseFeedback[k].ok ? 'text-emerald-600' : 'text-rose-600'}" data-testid="clause-feedback">
                        {clauseFeedback[k].text}
                      </span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Liaisons doctrinales -->
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-semibold text-muted-foreground">Actifs Doctrinals Associés :</span>
          {#if req.mapped_assets.length === 0}
            <span class="text-xs text-amber-700 italic">Aucun actif associé (requis pour conformité)</span>
          {:else}
            {#each req.mapped_assets as assetId}
              <span class="px-2.5 py-1 text-xs font-mono font-semibold rounded bg-primary/10 border border-primary/30 text-primary">
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
                    <div class="font-mono font-bold text-foreground">{sugg.asset_id}</div>
                    <div class="text-muted-foreground text-[11px]">{sugg.title}</div>
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
        <div class="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button
              onclick={() => fetchLinkSuggestions(req)}
              disabled={loadingSuggestionsFor === req.id}
              class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-muted hover:bg-muted text-foreground flex items-center gap-1.5 transition-colors disabled:opacity-50"
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
              <span class="text-xs text-muted-foreground italic">
                Décision réservée au propriétaire du domaine '{req.domain}'
              </span>
            {/if}
          </div>
        </div>

        {#if req.reviewed_by}
          <div class="text-[11px] text-muted-foreground text-right">
            Dernière revue par {req.reviewed_by} le {new Date(req.reviewed_at || '').toLocaleString()}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Modale d'Amendement -->
  {#if amendingReq}
    <div class="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-xl shadow-xl border border-border max-w-lg w-full p-6 space-y-4">
        <h3 class="text-lg font-bold text-foreground">
          Amender l'exigence : {amendingReq.section}
        </h3>
        <p class="text-xs text-muted-foreground font-serif bg-muted/50 p-3 rounded border border-border">
          {amendingReq.text}
        </p>

        <div>
          <label for="amendAssetsInput" class="block text-xs font-semibold text-muted-foreground mb-1">
            Actifs Doctrinals Associés (séparés par virgule)
          </label>
          <input
            id="amendAssetsInput"
            type="text"
            bind:value={amendmentMappedAssets}
            placeholder="Ex: CTRL-SEC-01, PRIN-RES-01, PAT-OUTBOX-02"
            class="w-full px-3 py-2 text-xs border border-border rounded-lg focus:ring-2 focus:ring-sky-500 font-mono"
          />
        </div>

        <div>
          <label for="amendTitleFrInput" class="block text-xs font-semibold text-muted-foreground mb-1">Titre français</label>
          <input
            id="amendTitleFrInput"
            type="text"
            bind:value={amendmentTitleFr}
            placeholder="Titre court en français (ex. Authentification multifacteur et communications sécurisées)"
            class="w-full mb-3 px-3 py-2 text-xs border border-border rounded-lg focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div>
          <label for="amendCriteriaInput" class="block text-xs font-semibold text-muted-foreground mb-1">
            Critères d'acceptation (un par ligne)
          </label>
          <textarea
            id="amendCriteriaInput"
            bind:value={amendmentCriteria}
            rows="5"
            placeholder="Ce qu'une architecture doit démontrer pour satisfaire l'exigence…"
            class="w-full px-3 py-2 text-xs border border-border rounded-lg focus:ring-2 focus:ring-sky-500"
          ></textarea>
        </div>

        <div>
          <label for="amendNotesInput" class="block text-xs font-semibold text-muted-foreground mb-1">
            Notes d'Amendement & Adaptation Opérationnelle
          </label>
          <textarea
            id="amendNotesInput"
            bind:value={amendmentNotes}
            rows="3"
            placeholder="Précisez la portée ou les adaptations doctrinales requises..."
            class="w-full px-3 py-2 text-xs border border-border rounded-lg focus:ring-2 focus:ring-sky-500"
          ></textarea>
        </div>

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <button
            onclick={() => (amendingReq = null)}
            class="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-lg"
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
    <div class="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-xl shadow-xl border border-border max-w-lg w-full p-6 space-y-4">
        <div class="flex items-center gap-2 text-rose-700">
          <AlertTriangle class="w-5 h-5" />
          <h3 class="text-lg font-bold text-foreground">
            Rejeter l'exigence : {rejectingReq.section}
          </h3>
        </div>
        <p class="text-xs text-muted-foreground">
          Règle constitutionnelle IV : Tout rejet d'exigence réglementaire exige une justification circonstanciée obligatoire.
        </p>

        <div>
          <label for="rejectionReasonInput" class="block text-xs font-semibold text-muted-foreground mb-1">
            Motif Circonstancié du Rejet *
          </label>
          <textarea
            id="rejectionReasonInput"
            bind:value={rejectionReason}
            rows="4"
            placeholder="Justifiez pour quelle raison cette exigence ne s'applique pas ou fait l'objet d'un refus..."
            class="w-full px-3 py-2 text-xs border border-border rounded-lg focus:ring-2 focus:ring-rose-500"
          ></textarea>
        </div>

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <button
            onclick={() => (rejectingReq = null)}
            class="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-lg"
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
