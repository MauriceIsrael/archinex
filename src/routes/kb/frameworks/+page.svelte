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
  import type { FrameworkIngestion } from '$lib/types/llmops';

  interface Props {
    data: {
      user: { id: string; name: string; email: string; role: string };
      expert: { kbHandle: string; kbRoles: string[]; ownedDomains: string[] };
      frameworks: FrameworkIngestion[];
      offline: boolean;
      error?: string;
    };
  }

  let { data }: Props = $props();

  let frameworksList = $state<FrameworkIngestion[]>(data.frameworks || []);
  let isUploading = $state(false);
  let uploadError = $state<string | null>(null);
  let uploadSuccess = $state<string | null>(null);

  let selectedFile = $state<File | null>(null);
  let frameworkId = $state('');
  let frameworkName = $state('');
  let version = $state('1.0');
  let selectedDomain = $state('security');

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
          <h1 class="text-2xl font-bold text-foreground">Référentiels Réglementaires & Ingestion</h1>
          <p class="text-sm text-muted-foreground">
            Téléversement multi-format (.pdf, .html, .txt, .md, .docx), découpage en exigences et revue de conformité opposable.
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

  <!-- Section de Téléversement Multi-Format -->
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

  <!-- Référentiels Ingérés -->
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-bold text-foreground flex items-center gap-2">
        <span>Référentiels Ingérés</span>
        <span class="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-normal">
          {frameworksList.length}
        </span>
      </h2>
    </div>

    {#if frameworksList.length === 0}
      <div class="text-center py-12 bg-muted/50 border border-border rounded-xl p-8">
        <ShieldAlert class="w-12 h-12 mx-auto text-muted-foreground mb-3" />
        <h3 class="text-base font-semibold text-muted-foreground">Aucun référentiel ingéré pour l'instant</h3>
        <p class="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          Téléversez vos directives réglementaires ou normes de conformité ci-dessus pour démarrer la revue ligne par ligne et l'alignement doctrinal.
        </p>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each frameworksList as fw (fw.id)}
          {@const percentReviewed = fw.total_requirements > 0 ? Math.round((fw.reviewed_requirements / fw.total_requirements) * 100) : 0}
          <div data-testid="framework-card" class="bg-white border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            <div>
              <div class="flex items-start justify-between gap-2 mb-2">
                <span class="px-2.5 py-1 text-xs font-bold rounded bg-primary/10 border border-primary/30 text-primary uppercase font-mono">
                  {fw.framework_id}
                </span>
                <span class="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                  v{fw.version}
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
            </div>

            <div class="pt-4 border-t border-border flex items-center justify-between mt-auto">
              <span class="text-xs {percentReviewed === 100 ? 'text-emerald-700 font-semibold' : 'text-amber-700'}">
                {percentReviewed === 100 ? '✓ Prêt pour déclaration' : `${fw.total_requirements - fw.reviewed_requirements} en attente`}
              </span>
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
        {/each}
      </div>
    {/if}
  </div>
</div>
