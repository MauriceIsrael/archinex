<script lang="ts">
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import FileText from 'lucide-svelte/icons/file-text';
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import CheckCircle from 'lucide-svelte/icons/check-circle';
  import Upload from 'lucide-svelte/icons/upload';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Check from 'lucide-svelte/icons/check';
  import ShieldAlert from 'lucide-svelte/icons/shield-alert';
  import FileCode from 'lucide-svelte/icons/file-code';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import Ban from 'lucide-svelte/icons/ban';
  import Filter from 'lucide-svelte/icons/filter';
  import type { ComplianceFrameworkOverview, FrameworkIngestion } from '$lib/types/llmops';

  interface Props {
    data: {
      user: { id: string; name: string; email: string; role: string };
      expert: { kbHandle: string; kbRoles: string[]; ownedDomains: string[] };
      frameworks: FrameworkIngestion[];
      complianceFrameworks?: ComplianceFrameworkOverview[];
      statusFilter?: string;
      offline: boolean;
      error?: string;
    };
  }

  let { data }: Props = $props();

  let frameworksList = $state<FrameworkIngestion[]>(data.frameworks || []);
  let complianceFrameworks = $state<ComplianceFrameworkOverview[]>(data.complianceFrameworks || []);
  let statusFilter = $state<string>(data.statusFilter || 'all');
  let isFiltering = $state(false);
  let historyOpen = $state(false);

  let isUploading = $state(false);
  let uploadError = $state<string | null>(null);
  let uploadSuccess = $state<string | null>(null);

  let selectedFile = $state<File | null>(null);
  let frameworkId = $state('');
  let frameworkName = $state('');
  let version = $state('1.0');
  let selectedDomain = $state('security');

  // État d'abandon d'une ingestion
  let abandoningId = $state<string | null>(null);
  let abandonReason = $state('');
  let isAbandoning = $state(false);
  let abandonError = $state<string | null>(null);

  const filteredIngestions = $derived.by(() => {
    if (statusFilter === 'all') return frameworksList;
    return frameworksList.filter((fw) => fw.status === statusFilter);
  });

  function coverageStatusBadge(status: ComplianceFrameworkOverview['status']) {
    if (status === 'covered') {
      return {
        label: 'Couvert',
        classes: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
      };
    }
    if (status === 'partial') {
      return {
        label: 'Partiel',
        classes: 'bg-amber-500/15 text-amber-700 border-amber-500/30'
      };
    }
    if (status === 'missing') {
      return {
        label: 'Absent',
        classes: 'bg-rose-500/15 text-rose-700 border-rose-500/30'
      };
    }
    return {
      label: 'Non évalué',
      classes: 'bg-muted text-muted-foreground border-border'
    };
  }

  function ingestionStatusBadge(status: string) {
    switch (status) {
      case 'applied':
        return { label: 'Appliquée', classes: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' };
      case 'partially_applied':
        return { label: 'Partiellement appliquée', classes: 'bg-blue-500/15 text-blue-700 border-blue-500/30' };
      case 'abandoned':
        return { label: 'Abandonnée', classes: 'bg-rose-500/15 text-rose-700 border-rose-500/30' };
      case 'reviewing':
      default:
        return { label: 'En revue', classes: 'bg-amber-500/15 text-amber-700 border-amber-500/30' };
    }
  }

  async function handleStatusFilterChange(newStatus: string) {
    statusFilter = newStatus;
    isFiltering = true;
    try {
      const qs = newStatus !== 'all' ? `?status=${encodeURIComponent(newStatus)}` : '';
      const res = await fetch(`/api/frameworks/ingestions${qs}`, {
        headers: { 'X-Actor-Email': data.user.email }
      });
      if (res.ok) {
        const body = await res.json();
        if (Array.isArray(body.data)) {
          frameworksList = body.data;
        }
      }
    } catch {
      // Garde le filtrage local en cas d'erreur réseau
    } finally {
      isFiltering = false;
    }
  }

  function openAbandonForm(id: string) {
    abandoningId = id;
    abandonReason = '';
    abandonError = null;
  }

  function cancelAbandon() {
    abandoningId = null;
    abandonReason = '';
    abandonError = null;
  }

  async function confirmAbandon(id: string) {
    if (!abandonReason.trim()) {
      abandonError = 'Veuillez saisir un motif d’abandon.';
      return;
    }
    isAbandoning = true;
    abandonError = null;
    try {
      const res = await fetch(`/api/frameworks/ingestions/${encodeURIComponent(id)}/abandon`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Actor-Email': data.user.email
        },
        body: JSON.stringify({ reason: abandonReason.trim() })
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        abandonError = resData.error || `Erreur HTTP ${res.status}`;
      } else if (resData.data) {
        frameworksList = frameworksList.map((fw) => (fw.id === id ? resData.data : fw));
        abandoningId = null;
        abandonReason = '';
      }
    } catch (err: any) {
      abandonError = err.message || 'Erreur réseau lors de l’abandon.';
    } finally {
      isAbandoning = false;
    }
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      selectedFile = input.files[0];
      uploadError = null;

      // Déduction automatique
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      if (!frameworkId) {
        frameworkId = nameWithoutExt.toUpperCase().replace(/[^A-Z0-9_-]/g, '-').slice(0, 15);
      }
      if (!frameworkName) {
        frameworkName = nameWithoutExt;
      }
    }
  }

  async function uploadFramework() {
    if (!selectedFile) {
      uploadError = 'Veuillez sélectionner un fichier à téléverser.';
      return;
    }

    if (selectedFile.size > 20 * 1024 * 1024) {
      uploadError = 'Fichier trop volumineux (taille maximale autorisée : 20 Mo).';
      return;
    }

    const validExtensions = ['pdf', 'html', 'htm', 'txt', 'md', 'docx'];
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!ext || !validExtensions.includes(ext)) {
      uploadError = 'Format non supporté. Formats acceptés : .pdf, .html, .txt, .md, .docx';
      return;
    }

    isUploading = true;
    uploadError = null;
    uploadSuccess = null;

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('framework_id', frameworkId || selectedFile.name.slice(0, 10).toUpperCase());
      formData.append('framework_name', frameworkName || frameworkId);
      formData.append('version', version);
      formData.append('domain', selectedDomain);

      const res = await fetch('/api/frameworks/ingestions', {
        method: 'POST',
        headers: {
          'X-Actor-Email': data.user.email
        },
        body: formData
      });

      const resData = await res.json();

      if (!res.ok) {
        uploadError = resData.error || `Erreur HTTP ${res.status}`;
      } else {
        const item = resData.data;
        uploadSuccess = `Référentiel '${item.framework_name || item.framework}' ingéré avec succès (${item.total_requirements || item.requirements?.length || 0} exigences extraites).`;
        const existing = Array.isArray(frameworksList) ? frameworksList : [];
        frameworksList = [item, ...existing];
        historyOpen = true;
        selectedFile = null;
        frameworkId = '';
        frameworkName = '';
      }
    } catch (err: any) {
      uploadError = err.message || 'Erreur réseau lors du téléversement.';
    } finally {
      isUploading = false;
    }
  }
</script>

<div class="space-y-8 max-w-7xl mx-auto px-4 py-6">
  <!-- En-tête -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
    <div>
      <div class="flex items-center gap-3">
        <div class="p-2 bg-primary/15 rounded-lg text-primary">
          <ShieldCheck class="w-6 h-6" />
        </div>
        <div>
          <h1 class="text-2xl font-bold text-foreground">Référentiels Réglementaires & Couverture Opposable</h1>
          <p class="text-sm text-muted-foreground">
            Vue d'ensemble de la couverture réglementaire par référentiel, déclaration d'opposabilité et gestion des ingestions.
          </p>
        </div>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-xs px-3 py-1.5 rounded-full bg-muted border border-border font-mono text-muted-foreground">
        Acteur : <span class="font-semibold">{data.expert.kbHandle}</span>
      </span>
      <span class="text-xs px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary">
        Domaines : {data.expert.ownedDomains.join(', ') || 'aucun'}
      </span>
    </div>
  </div>

  {#if data.offline}
    <div class="p-4 bg-amber-50 border border-amber-300 rounded-lg flex items-center gap-3 text-amber-800 text-sm">
      <AlertTriangle class="w-5 h-5 flex-shrink-0" />
      <div>
        <strong>Mode Hors-Ligne Actif</strong> : Le serveur distant de gouvernance LLMOps est indisponible. Les fonctionnalités de téléversement et de revue fonctionnent sur le cache local.
      </div>
    </div>
  {/if}

  <!-- 1. Vue d'ensemble par référentiel opposable -->
  <section class="space-y-4" data-testid="compliance-frameworks-overview">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h2 class="text-lg font-bold text-foreground flex items-center gap-2">
          <span>Vue d'ensemble des Référentiels Opposables</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-normal">
            {complianceFrameworks.length}
          </span>
        </h2>
        <p class="text-xs text-muted-foreground">
          État de couverture réglementaire consolidé dans la base de connaissances (exigences validées par les experts vs contrôles provisoires).
        </p>
      </div>
      <a
        href="/knowledge#widget-controls"
        class="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        <span>Explorer l'arbre des contrôles sur /knowledge</span>
        <ExternalLink class="w-3.5 h-3.5" />
      </a>
    </div>

    {#if complianceFrameworks.length === 0}
      <div class="p-6 bg-muted/40 border border-border rounded-xl text-center text-xs text-muted-foreground">
        Aucun référentiel de conformité recensé dans le snapshot actif.
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each complianceFrameworks as cf (cf.framework)}
          {@const badge = coverageStatusBadge(cf.status)}
          <div
            id="framework-{cf.framework}"
            data-testid="compliance-framework-row"
            class="bg-card border border-border rounded-xl p-5 shadow-xs flex flex-col justify-between gap-4 scroll-mt-20"
          >
            <div class="space-y-2.5">
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="px-2.5 py-1 text-xs font-bold rounded bg-primary/10 border border-primary/30 text-primary font-mono">
                    {cf.framework}
                  </span>
                  <span class="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                    {cf.version}
                  </span>
                </div>
                <span class="px-2.5 py-0.5 text-xs font-semibold rounded-full border {badge.classes}">
                  {badge.label}
                </span>
              </div>

              <h3 class="text-sm font-bold text-foreground leading-snug">
                {cf.title}
              </h3>

              <!-- Métriques exigences validées / attendues -->
              <div class="p-3 rounded-lg bg-muted/40 border border-border space-y-1.5 text-xs">
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">Exigences validées / attendues :</span>
                  <span class="font-mono font-bold text-foreground">
                    {cf.validated} / {cf.expected ?? '—'}
                  </span>
                </div>
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-muted-foreground">Contrôles actifs en base :</span>
                  <span class="font-mono text-foreground">
                    {cf.present} actif{cf.present > 1 ? 's' : ''}
                    {#if cf.provisional > 0}
                      <span class="text-amber-600">({cf.provisional} provisoire{cf.provisional > 1 ? 's' : ''})</span>
                    {/if}
                  </span>
                </div>
              </div>

              <!-- Déclaration de couverture -->
              <div class="text-[11px] text-muted-foreground">
                {#if cf.declared_by}
                  <div class="flex items-center gap-1.5 text-emerald-700 font-medium">
                    <CheckCircle class="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Couverture déclarée par <strong class="font-mono">{cf.declared_by}</strong>
                      {#if cf.declared_at}
                        le {new Date(cf.declared_at).toLocaleDateString('fr-FR')}
                      {/if}
                    </span>
                  </div>
                {:else}
                  <span>Aucune déclaration de couverture formelle enregistrée.</span>
                {/if}
              </div>
            </div>

            <!-- Liens croisés vers /knowledge et vers l'ingestion appliquée -->
            <div class="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2 text-xs">
              <a
                href="/knowledge?framework={encodeURIComponent(cf.framework)}#widget-controls"
                data-testid="framework-knowledge-link"
                class="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                <span>Contrôles actifs ({cf.present})</span>
                <ExternalLink class="w-3 h-3" />
              </a>

              {#if cf.applied_ingestion_id}
                <a
                  href="/kb/frameworks/{cf.applied_ingestion_id}"
                  data-testid="framework-applied-ingestion-link"
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 font-semibold transition-colors"
                >
                  <span>Ingestion #{cf.applied_ingestion_id}</span>
                  <ChevronRight class="w-3 h-3" />
                </a>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- 2. Section de Téléversement Multi-Format -->
  <div class="bg-muted/50 border border-border rounded-xl p-6 shadow-sm">
    <div class="flex items-center gap-2 mb-4">
      <FileText class="w-5 h-5 text-primary" />
      <h2 class="text-lg font-semibold text-foreground">Téléverser un Nouveau Référentiel</h2>
      <span class="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">Max 20 Mo</span>
    </div>

    {#if uploadError}
      <div class="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
        <AlertCircle class="w-4 h-4 flex-shrink-0" />
        <span>{uploadError}</span>
      </div>
    {/if}

    {#if uploadSuccess}
      <div class="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm flex items-center gap-2">
        <CheckCircle class="w-4 h-4 flex-shrink-0" />
        <span>{uploadSuccess}</span>
      </div>
    {/if}

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <div>
        <label for="frameworkIdInput" class="block text-xs font-semibold text-muted-foreground mb-1">Identifiant Référentiel *</label>
        <input
          id="frameworkIdInput"
          type="text"
          bind:value={frameworkId}
          placeholder="Ex: NIS2, ISO-27001, DORA"
          class="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div>
        <label for="frameworkNameInput" class="block text-xs font-semibold text-muted-foreground mb-1">Nom Complet</label>
        <input
          id="frameworkNameInput"
          type="text"
          bind:value={frameworkName}
          placeholder="Ex: Directive NIS2 (UE 2022/2555)"
          class="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div>
        <label for="versionInput" class="block text-xs font-semibold text-muted-foreground mb-1">Version / Révision</label>
        <input
          id="versionInput"
          type="text"
          bind:value={version}
          placeholder="Ex: 2022/2555 ou 2022"
          class="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div>
        <label for="domainSelect" class="block text-xs font-semibold text-muted-foreground mb-1">Domaine Responsable</label>
        <select
          id="domainSelect"
          bind:value={selectedDomain}
          class="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="security">Sécurité & Résilience</option>
          <option value="architecture">Architecture & Urbanisation</option>
          <option value="cloud">Cloud & Infrastructure</option>
          <option value="data">Données & Souveraineté</option>
          <option value="procurement">Achats & Marchés</option>
        </select>
      </div>
    </div>

    <div class="flex flex-col sm:flex-row items-center gap-4 border-2 border-dashed border-border rounded-lg p-4 bg-white hover:border-primary/60 transition-colors">
      <div class="flex-1 text-center sm:text-left">
        <label class="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted text-foreground text-sm font-medium rounded-lg border border-border transition-colors">
          <Upload class="w-4 h-4" />
          <span>Sélectionner un fichier</span>
          <input
            type="file"
            accept=".pdf,.html,.htm,.txt,.md,.docx"
            onchange={handleFileSelect}
            class="hidden"
            data-testid="framework-file-input"
          />
        </label>
        <span class="ml-3 text-xs text-muted-foreground">
          Formats acceptés : PDF, HTML, TXT, Markdown, Word DOCX (max 20 Mo)
        </span>
      </div>

      {#if selectedFile}
        <div class="flex items-center gap-2 text-sm font-mono text-muted-foreground bg-muted px-3 py-1.5 rounded-lg border border-border">
          <FileText class="w-4 h-4 text-primary" />
          <span>{selectedFile.name}</span>
          <span class="text-xs text-muted-foreground">({(selectedFile.size / 1024).toFixed(1)} Ko)</span>
        </div>
      {/if}

      <button
        onclick={uploadFramework}
        disabled={isUploading || !selectedFile}
        data-testid="framework-upload-button"
        class="px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg shadow-sm flex items-center gap-2 transition-colors"
      >
        {#if isUploading}
          <RefreshCw class="w-4 h-4 animate-spin" />
          <span>Ingestion en cours...</span>
        {:else}
          <Check class="w-4 h-4" />
          <span>Ingérer le Référentiel</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- 3. Historique des ingestions (replié par défaut, filtrable par statut, action Abandonner) -->
  <details
    bind:open={historyOpen}
    data-testid="ingestions-history-section"
    class="group bg-card border border-border rounded-xl shadow-xs overflow-hidden"
  >
    <summary
      data-testid="ingestions-history-summary"
      class="cursor-pointer list-none p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 hover:bg-muted/50 transition-colors"
    >
      <div class="flex items-center gap-2.5">
        <ChevronDown class="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
        <h2 class="text-base font-bold text-foreground">
          Historique des Ingestions
        </h2>
        <span class="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
          {filteredIngestions.length} / {frameworksList.length}
        </span>
      </div>
      <span class="text-xs text-muted-foreground">
        Cliquez pour déplier les lots d'ingestion, filtrer par statut ou abandonner une ingestion obsolète
      </span>
    </summary>

    <div class="p-5 space-y-5 border-t border-border">
      <!-- Barre de filtre par statut -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par statut d'ingestion">
          <span class="text-xs font-semibold text-muted-foreground flex items-center gap-1 mr-1">
            <Filter class="w-3.5 h-3.5" />
            Statut :
          </span>
          {#each [
            { id: 'all', label: 'Toutes' },
            { id: 'reviewing', label: 'En revue' },
            { id: 'partially_applied', label: 'Partiellement appliquées' },
            { id: 'applied', label: 'Appliquées' },
            { id: 'abandoned', label: 'Abandonnées' }
          ] as tab}
            <button
              type="button"
              data-testid="ingestion-filter-{tab.id}"
              onclick={() => handleStatusFilterChange(tab.id)}
              disabled={isFiltering}
              class="px-3 py-1 rounded-lg text-xs font-semibold border transition-colors {statusFilter === tab.id ? 'bg-primary text-white border-primary' : 'bg-muted/50 text-muted-foreground border-border hover:text-foreground'}"
            >
              {tab.label}
            </button>
          {/each}
        </div>
      </div>

      {#if filteredIngestions.length === 0}
        <div class="text-center py-10 bg-muted/30 border border-border rounded-xl p-6">
          <ShieldAlert class="w-10 h-10 mx-auto text-muted-foreground mb-2" />
          <h3 class="text-sm font-semibold text-muted-foreground">Aucune ingestion pour ce filtre</h3>
          <p class="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Téléversez une directive réglementaire ci-dessus ou changez le filtre de statut.
          </p>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {#each filteredIngestions as fw (fw.id)}
            {@const percentReviewed = fw.total_requirements > 0 ? Math.round((fw.reviewed_requirements / fw.total_requirements) * 100) : 0}
            {@const stBadge = ingestionStatusBadge(fw.status)}
            <div data-testid="framework-card" class="bg-white border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div class="flex items-start justify-between gap-2 mb-2">
                  <div class="flex items-center gap-1.5">
                    <span class="px-2.5 py-1 text-xs font-bold rounded bg-primary/10 border border-primary/30 text-primary uppercase font-mono">
                      {fw.framework_id}
                    </span>
                    <span class="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                      v{fw.version}
                    </span>
                  </div>
                  <span class="px-2 py-0.5 text-[11px] font-semibold rounded-full border {stBadge.classes}">
                    {stBadge.label}
                  </span>
                </div>
                <h3 class="text-base font-semibold text-foreground mb-1 leading-snug">
                  {fw.framework_name}
                </h3>
                <div class="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                  <FileCode class="w-3.5 h-3.5" />
                  <span class="truncate">{fw.file_name}</span>
                  <span>•</span>
                  <span class="uppercase font-mono">{fw.file_format}</span>
                </div>

                <!-- Jauge de progression -->
                <div class="space-y-1.5 mb-4">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-muted-foreground font-medium">Revue des exigences</span>
                    <span class="font-bold text-foreground">{fw.reviewed_requirements} / {fw.total_requirements} ({percentReviewed}%)</span>
                  </div>
                  <div class="w-full bg-muted rounded-full h-2 overflow-hidden border border-border">
                    <div
                      class="h-full rounded-full transition-all duration-300 {percentReviewed === 100 ? 'bg-emerald-500' : 'bg-primary'}"
                      style="width: {percentReviewed}%"
                    ></div>
                  </div>
                </div>

                {#if fw.status === 'abandoned' && fw.abandon_reason}
                  <div class="mb-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-0.5">
                    <div class="font-semibold">Motif d'abandon : {fw.abandon_reason}</div>
                    {#if fw.abandoned_by}
                      <div class="text-[11px] text-rose-600">Par {fw.abandoned_by}</div>
                    {/if}
                  </div>
                {/if}

                {#if abandoningId === fw.id}
                  <div class="mb-3 p-3 rounded-lg bg-rose-50/70 border border-rose-200 space-y-2" data-testid="abandon-ingestion-form">
                    <label for="abandon-reason-{fw.id}" class="block text-xs font-semibold text-rose-900">
                      Motif d'abandon obligatoire *
                    </label>
                    <input
                      id="abandon-reason-{fw.id}"
                      data-testid="abandon-reason-input"
                      type="text"
                      bind:value={abandonReason}
                      placeholder="Ex: Doublon, mauvaise version du PDF..."
                      class="w-full px-2.5 py-1.5 text-xs border border-rose-300 rounded bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    {#if abandonError}
                      <p class="text-[11px] text-rose-700 font-medium">{abandonError}</p>
                    {/if}
                    <div class="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onclick={cancelAbandon}
                        class="px-2.5 py-1 text-xs font-medium rounded border border-border bg-white text-muted-foreground hover:text-foreground"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        data-testid="confirm-abandon-button"
                        disabled={isAbandoning}
                        onclick={() => confirmAbandon(fw.id)}
                        class="px-2.5 py-1 text-xs font-semibold rounded bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
                      >
                        {isAbandoning ? 'Abandon...' : 'Confirmer l’abandon'}
                      </button>
                    </div>
                  </div>
                {/if}
              </div>

              <div class="pt-4 border-t border-border flex items-center justify-between gap-2 mt-auto">
                <span class="text-xs {percentReviewed === 100 ? 'text-emerald-700 font-semibold' : 'text-amber-700'}">
                  {percentReviewed === 100 ? '✓ Prêt pour déclaration' : `${fw.total_requirements - fw.reviewed_requirements} en attente`}
                </span>
                <div class="flex items-center gap-2">
                  {#if fw.status === 'reviewing' || fw.status === 'ready'}
                    <button
                      type="button"
                      data-testid="framework-abandon-button"
                      onclick={() => openAbandonForm(fw.id)}
                      class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 transition-colors"
                      title="Abandonner cette ingestion obsolète"
                    >
                      <Ban class="w-3.5 h-3.5" />
                      <span>Abandonner</span>
                    </button>
                  {/if}
                  <a
                    href="/kb/frameworks/{fw.id}"
                    data-testid="framework-examine-link"
                    class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-foreground hover:bg-foreground/90 text-white transition-colors"
                  >
                    <span>Examiner</span>
                    <ChevronRight class="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </details>
</div>
