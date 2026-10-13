<script lang="ts">
  import type { PageData } from './$types';
  import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
  import { preferences } from '$lib/stores/preferences.svelte';
  import {
    buildTreeLegendSeries,
    buildStackedTreeWidgets,
    computeProjectMatching,
    type KnowledgeTreeNode,
    type KnowledgeSnapshot
  } from '$lib/domain/knowledgeGraph';
  import KnowledgeTreeChart from '$lib/components/knowledge/KnowledgeTreeChart.svelte';
  import KnowledgeNodePanel from '$lib/components/knowledge/KnowledgeNodePanel.svelte';
  import {
    Network,
    Sparkles,
    Shield,
    FileCode,
    Layers,
    Search,
    FolderKanban,
    ListFilter,
    Columns3,
    Rows3,
    X,
    PanelRightOpen,
    PanelRightClose,
    Check,
    ShieldCheck,
    History,
    Database,
    AlertTriangle,
    XCircle,
    Info,
    ExternalLink,
    Calendar,
    UserCheck
  } from 'lucide-svelte';
  import type { CheckClauseRow, KbPublication } from '$lib/types/llmops';

  let { data }: { data: PageData } = $props();

  const snapshot: KnowledgeSnapshot = $derived(data.snapshot);
  const source = $derived(data.source);
  const checkClauses: CheckClauseRow[] = $derived((data as any).checkClauses || []);
  const publications: KbPublication[] = $derived((data as any).publications || []);

  const isBaseEmpty = $derived.by(() => {
    return (!snapshot.assets || snapshot.assets.length === 0) && (!snapshot.controls || snapshot.controls.length === 0);
  });

  // Engagement sélectionné pour l'éclairage (par défaut, l'engagement actif dans deliberationStore)
  let selectedEngagementId = $state<string>(deliberationStore.activeEngagementId);
  let filterOnlyMatched = $state(false);
  let searchQuery = $state<string>((data as any).initialFramework || '');
  
  // Mode d'affichage : 'opposable' | 'journal' | 'stacked' | 'combined' | 'table'
  let viewMode = $state<'opposable' | 'journal' | 'stacked' | 'combined' | 'table'>(
    (data as any).initialTab === 'journal' ? 'journal' :
    (data as any).initialTab === 'table' ? 'table' :
    (data as any).initialTab === 'stacked' ? 'stacked' :
    'opposable'
  );

  // Filtres pour la vue Opposable
  let opposableDomain = $state<string>('');
  let opposableType = $state<string>('');
  let opposableFramework = $state<string>((data as any).initialFramework || '');
  let opposableStatus = $state<string>('');
  let opposableSearch = $state<string>('');

  // Filtres pour le Journal
  let journalEntryPath = $state<string>('');
  let journalSearch = $state<string>('');

  const clausesByAssetId = $derived.by(() => {
    const map = new Map<string, CheckClauseRow[]>();
    for (const cl of checkClauses) {
      const list = map.get(cl.asset_id) || [];
      list.push(cl);
      map.set(cl.asset_id, list);
    }
    return map;
  });

  const uniqueDomains = $derived.by(() => {
    const set = new Set<string>();
    for (const a of snapshot.assets || []) {
      if (a.domain) set.add(a.domain);
    }
    for (const c of snapshot.controls || []) {
      if (c.domain) set.add(c.domain);
    }
    return Array.from(set).sort();
  });

  const uniqueFrameworks = $derived.by(() => {
    const set = new Set<string>();
    for (const c of snapshot.controls || []) {
      if (c.framework) set.add(c.framework);
    }
    for (const a of snapshot.assets || []) {
      if ((a as any).framework) set.add((a as any).framework);
    }
    return Array.from(set).sort();
  });

  interface OpposableAssetItem {
    id: string;
    title: string;
    type: string;
    domain: string;
    framework?: string;
    clauses: CheckClauseRow[];
    badge: 'bloque' | 'avertit' | 'rejetée' | 'informe';
    summary?: string;
  }

  const allOpposableItems = $derived.by(() => {
    const items: OpposableAssetItem[] = [];

    for (const a of snapshot.assets || []) {
      const assetClauses = clausesByAssetId.get(a.id) || [];
      let badge: 'bloque' | 'avertit' | 'rejetée' | 'informe' = 'informe';
      if (assetClauses.length > 0) {
        if (assetClauses.some((c) => c.status === 'validated')) {
          badge = 'bloque';
        } else if (assetClauses.some((c) => c.status === 'draft')) {
          badge = 'avertit';
        } else if (assetClauses.every((c) => c.status === 'rejected')) {
          badge = 'rejetée';
        }
      }
      items.push({
        id: a.id,
        title: a.title,
        type: a.type,
        domain: a.domain || 'général',
        framework: (a as any).framework,
        clauses: assetClauses,
        badge,
        summary: a.summary
      });
    }

    for (const c of snapshot.controls || []) {
      const ctrlClauses = clausesByAssetId.get(c.id) || [];
      let badge: 'bloque' | 'avertit' | 'rejetée' | 'informe' = 'informe';
      if (ctrlClauses.length > 0) {
        if (ctrlClauses.some((cl) => cl.status === 'validated')) {
          badge = 'bloque';
        } else if (ctrlClauses.some((cl) => cl.status === 'draft')) {
          badge = 'avertit';
        } else if (ctrlClauses.every((cl) => cl.status === 'rejected')) {
          badge = 'rejetée';
        }
      }
      items.push({
        id: c.id,
        title: c.title,
        type: 'control',
        domain: c.domain || 'conformité',
        framework: c.framework,
        clauses: ctrlClauses,
        badge,
        summary: c.text
      });
    }

    return items;
  });

  const filteredOpposableItems = $derived.by(() => {
    return allOpposableItems.filter((item) => {
      if (opposableDomain && item.domain !== opposableDomain) return false;
      if (opposableType && item.type !== opposableType) return false;
      if (opposableFramework) {
        if (opposableFramework === '__transverse__') {
          if (item.framework) return false;
        } else if (item.framework !== opposableFramework) {
          return false;
        }
      }
      if (opposableStatus) {
        if (opposableStatus === 'bloque' && item.badge !== 'bloque') return false;
        if (opposableStatus === 'avertit' && item.badge !== 'avertit') return false;
        if (opposableStatus === 'rejetee' && item.badge !== 'rejetée') return false;
        if (opposableStatus === 'informe' && item.badge !== 'informe') return false;
      }
      if (opposableSearch.trim()) {
        const q = opposableSearch.toLowerCase();
        const matchesId = item.id.toLowerCase().includes(q);
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesClause = item.clauses.some((c) => (c.message || '').toLowerCase().includes(q));
        if (!matchesId && !matchesTitle && !matchesClause) return false;
      }
      return true;
    });
  });

  const groupedOpposable = $derived.by(() => {
    const map = new Map<string, OpposableAssetItem[]>();
    for (const item of filteredOpposableItems) {
      const fwKey = item.framework || 'Transverse / Socle Commun';
      const list = map.get(fwKey) || [];
      list.push(item);
      map.set(fwKey, list);
    }
    return Array.from(map.entries());
  });

  const filteredPublications = $derived.by(() => {
    return publications.filter((pub) => {
      if (journalEntryPath && pub.entry_path?.type !== journalEntryPath) return false;
      if (journalSearch.trim()) {
        const q = journalSearch.toLowerCase();
        const matchesId = pub.snapshot_id.toLowerCase().includes(q);
        const matchesChangelog = (pub.changelog || '').toLowerCase().includes(q);
        const matchesAuthor = (pub.published_by || '').toLowerCase().includes(q);
        const matchesReviewers = (pub.reviewers || []).some((r) => r.toLowerCase().includes(q));
        if (!matchesId && !matchesChangelog && !matchesAuthor && !matchesReviewers) return false;
      }
      return true;
    });
  });

  function getBadgeConfig(badge: 'bloque' | 'avertit' | 'rejetée' | 'informe') {
    switch (badge) {
      case 'bloque':
        return {
          label: 'bloque',
          class: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
          dot: 'bg-rose-500'
        };
      case 'avertit':
        return {
          label: 'avertit',
          class: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
          dot: 'bg-amber-500'
        };
      case 'rejetée':
        return {
          label: 'rejetée',
          class: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30',
          dot: 'bg-zinc-500'
        };
      case 'informe':
      default:
        return {
          label: 'informe',
          class: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
          dot: 'bg-sky-500'
        };
    }
  }

  function formatDate(d?: string | null) {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return d;
    }
  }

  const uniqueControlFrameworks = $derived.by(() => {
    const fws = new Set<string>();
    for (const c of snapshot.controls || []) {
      if (c.framework) fws.add(c.framework);
    }
    return Array.from(fws);
  });

  // Nœud sélectionné pour le formulaire non-modal
  let selectedNode = $state<KnowledgeTreeNode | null>(null);

  // Contrôle d'affichage du volet d'inspection latéral persistant
  let isSidePanelOpen = $state(true);
  let isMobileSheetOpen = $state(false);

  // Thème sombre
  const isDark = $derived.by(() => {
    if (typeof window === 'undefined') return true;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return (
      preferences.themeOverride === 'dark' ||
      (preferences.themeOverride === 'system' && systemDark)
    );
  });

  // Profil d'engagement actuel pour le matching
  const currentEngagement = $derived.by(() => {
    if (selectedEngagementId === '__none__') return null;
    return deliberationStore.engagements.find((e) => e.id === selectedEngagementId) || null;
  });

  // Calcul du matching et métriques
  const matchResult = $derived.by(() => {
    return computeProjectMatching(snapshot, currentEngagement);
  });

  // Construction des 3 widgets autonomes empilés pleine largeur
  const stackedWidgets = $derived.by(() => {
    return buildStackedTreeWidgets(snapshot, currentEngagement, isDark, filterOnlyMatched);
  });

  // Construction des séries ECharts Tree-Legend combinées (vue alternative)
  const combinedChartData = $derived.by(() => {
    return buildTreeLegendSeries(snapshot, currentEngagement, isDark, filterOnlyMatched);
  });

  function handleNodeClick(nodeData: any) {
    selectedNode = nodeData;
    // Ouvre automatiquement le volet d'inspection à l'écran dès qu'on clique sur une feuille
    isSidePanelOpen = true;
    isMobileSheetOpen = false; // Bar flottante prête à être ouverte
  }

  function handleEngagementChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedEngagementId = target.value;
    if (selectedEngagementId !== '__none__') {
      deliberationStore.switchEngagement(selectedEngagementId);
    }
  }

  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Filtrage pour la vue tabulaire
  const filteredAssets = $derived.by(() => {
    let list = snapshot.assets || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.id.toLowerCase().includes(q) ||
          a.title.toLowerCase().includes(q) ||
          (a.domain || '').toLowerCase().includes(q)
      );
    }
    if (filterOnlyMatched && currentEngagement) {
      list = list.filter((a) => matchResult.assetMatches.get(a.id)?.isMatched);
    }
    return list;
  });

  const filteredControls = $derived.by(() => {
    let list = snapshot.controls || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.id.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.framework.toLowerCase().includes(q) ||
          (c.domain || '').toLowerCase().includes(q)
      );
    }
    if (filterOnlyMatched && currentEngagement) {
      list = list.filter((c) => matchResult.controlMatches.get(c.id)?.isMatched);
    }
    return list;
  });
</script>

<svelte:head>
  <title>Archinex · Base de Connaissance Commune & Alignement Projets</title>
</svelte:head>

<div class="space-y-6 w-full max-w-[1920px] mx-auto p-4 sm:p-6 pb-28 transition-all duration-300 {isSidePanelOpen && (viewMode === 'stacked' || viewMode === 'combined') ? 'lg:pr-[430px] xl:pr-[490px] 2xl:pr-[530px]' : ''}">
  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  <!-- BANNIÈRE PRINCIPALE : BASE DE CONNAISSANCES & ÉCLAIRAGE DE PROJET         -->
  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  <div class="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div class="space-y-1.5">
        <div class="flex items-center gap-3">
          <div class="p-2.5 rounded-xl bg-primary text-primary-foreground shadow-xs">
            <Network class="h-6 w-6" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Base de Connaissance Commune & Alignement Projets
              </h1>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary border border-primary/20">
                ECharts Tree-Legend
              </span>
            </div>
            <p class="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Patrimoine d'actifs d'architecture (ADRs, principes, patterns) et référentiels réglementaires (NIS2, 3GPP, SecNumCloud), déployés en arborescences dédiées pleine largeur avec formulaire d'inspection non-modal permanent.
            </p>
          </div>
        </div>
      </div>

      <!-- Sélecteur de Projet Actif (Projection) -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div class="flex items-center gap-2 bg-muted/40 p-2 rounded-xl border border-border">
          <FolderKanban class="h-4 w-4 text-primary shrink-0 ml-1" />
          <label for="engagement-select" class="text-xs font-semibold text-foreground whitespace-nowrap">
            Éclairer le projet :
          </label>
          <select
            id="engagement-select"
            value={selectedEngagementId}
            onchange={handleEngagementChange}
            class="text-xs font-medium bg-card border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
          >
            <option value="__none__">🌐 Vue Globale (Tous les concepts neutres)</option>
            {#each deliberationStore.engagements as eng}
              <option value={eng.id}>
                {eng.shortName} · {eng.title.slice(0, 36)}...
              </option>
            {/each}
          </select>
        </div>

        <!-- Badge Source Snapshot -->
        <div class="px-3 py-1.5 rounded-xl border border-border bg-muted/20 text-muted-foreground text-xs font-mono flex items-center justify-between sm:justify-start gap-2">
          <span class="h-2 w-2 rounded-full {source === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}"></span>
          <span>{snapshot.snapshot_id ? snapshot.snapshot_id.slice(0, 20) : 'Snapshot Scellé'}</span>
        </div>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════════════════════ -->
    <!-- BARRE D'INDICATEURS D'ALIGNEMENT (KPIS)                                   -->
    <!-- ═════════════════════════════════════════════════════════════════════════ -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
      <!-- Total Concepts -->
      <div class="p-3.5 rounded-xl border border-border bg-muted/10 space-y-1">
        <div class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Layers class="h-3.5 w-3.5 text-blue-500" />
          Patrimoine Total
        </div>
        <div class="text-xl font-bold text-foreground">
          {matchResult.summary.totalConcepts} <span class="text-xs font-normal text-muted-foreground">concepts</span>
        </div>
        <div class="text-[11px] text-muted-foreground">
          {snapshot.assets.length} actifs · {(snapshot.controls || []).length} contrôles
        </div>
      </div>

      <!-- Concepts Éclairés -->
      <div class="p-3.5 rounded-xl border {currentEngagement ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-muted/10'} space-y-1">
        <div class="text-[11px] font-medium {currentEngagement ? 'text-emerald-500' : 'text-muted-foreground'} uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles class="h-3.5 w-3.5" />
          Concepts Éclairés
        </div>
        <div class="text-xl font-bold {currentEngagement ? 'text-emerald-500' : 'text-foreground'}">
          {matchResult.summary.matchedConcepts} <span class="text-xs font-normal text-muted-foreground">({matchResult.summary.matchPercentage}%)</span>
        </div>
        <div class="text-[11px] text-muted-foreground">
          {currentEngagement ? `Mobilisés par ${currentEngagement.shortName}` : 'Sélectionnez un projet'}
        </div>
      </div>

      <!-- Décisions / ADRs Mobilisées -->
      <div class="p-3.5 rounded-xl border border-border bg-muted/10 space-y-1">
        <div class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <FileCode class="h-3.5 w-3.5 text-primary" />
          ADRs Mobilisées
        </div>
        <div class="text-xl font-bold text-foreground">
          {matchResult.summary.matchedDecisions} <span class="text-xs font-normal text-muted-foreground">/ {matchResult.summary.totalDecisions}</span>
        </div>
        <div class="text-[11px] text-muted-foreground">
          Décisions clés d'ingénierie
        </div>
      </div>

      <!-- Contrôles Réglementaires Couverts -->
      <div class="p-3.5 rounded-xl border border-border bg-muted/10 space-y-1">
        <div class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Shield class="h-3.5 w-3.5 text-violet-500" />
          Contrôles Couverts
        </div>
        <div class="text-xl font-bold text-foreground">
          {matchResult.summary.matchedControls} <span class="text-xs font-normal text-muted-foreground">/ {matchResult.summary.totalControls}</span>
        </div>
        <div class="text-[11px] text-muted-foreground">
          Exigences réglementaires
        </div>
      </div>
    </div>
  </div>

  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  <!-- BARRE D'OUTILS & SÉLECTEUR DE MODE DE DISPOSITION                         -->
  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card border border-border p-3.5 rounded-xl shadow-2xs">
    <!-- Onglets de vue (Opposable vs Journal vs Empilé vs Combiné vs Catalogue) -->
    <div class="flex flex-wrap items-center gap-1 bg-muted p-1 rounded-lg">
      <button
        onclick={() => (viewMode = 'opposable')}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all {viewMode === 'opposable' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}"
      >
        <ShieldCheck class="h-3.5 w-3.5 text-rose-500" />
        Doctrine Opposable
      </button>
      <button
        onclick={() => (viewMode = 'journal')}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all {viewMode === 'journal' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}"
      >
        <History class="h-3.5 w-3.5 text-emerald-500" />
        Journal ({publications.length})
      </button>
      <button
        onclick={() => (viewMode = 'stacked')}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all {viewMode === 'stacked' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}"
      >
        <Rows3 class="h-3.5 w-3.5 text-primary" />
        3 Graphes
      </button>
      <button
        onclick={() => (viewMode = 'combined')}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all {viewMode === 'combined' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}"
      >
        <Columns3 class="h-3.5 w-3.5 text-violet-500" />
        Vue Combinée
      </button>
      <button
        onclick={() => (viewMode = 'table')}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all {viewMode === 'table' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}"
      >
        <ListFilter class="h-3.5 w-3.5" />
        Catalogue ({snapshot.assets.length + (snapshot.controls?.length || 0)})
      </button>
    </div>

    <!-- Filtres & Options -->
    <div class="flex flex-wrap items-center gap-3">
      <!-- Recherche rapide -->
      <div class="relative flex-1 sm:w-64">
        <Search class="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Filtrer un concept, ADR, contrôle..."
          class="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-border bg-card text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
        />
      </div>

      <!-- Filtre uniquement éclairés -->
      {#if currentEngagement}
        <label class="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground bg-muted/30 px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 transition-colors">
          <input
            type="checkbox"
            bind:checked={filterOnlyMatched}
            class="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
          />
          <span class="flex items-center gap-1">
            <Sparkles class="h-3.5 w-3.5 text-emerald-500" />
            Uniquement éclairés
          </span>
        </label>
      {/if}

      <!-- Bascule volet d'inspection persistant -->
      <button
        onclick={() => (isSidePanelOpen = !isSidePanelOpen)}
        class="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground transition-all shadow-2xs"
        title={isSidePanelOpen ? 'Masquer la fiche latérale pour agrandir les arbres' : 'Afficher la fiche latérale'}
      >
        {#if isSidePanelOpen}
          <PanelRightClose class="h-3.5 w-3.5 text-primary" />
          <span>Volet Fiche</span>
        {:else}
          <PanelRightOpen class="h-3.5 w-3.5 text-primary" />
          <span>Afficher Fiche {selectedNode ? `(${selectedNode.id || 'Active'})` : ''}</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  <!-- ÉTAT SOCLE VIDE EXPLICITE (Archinex #95)                                   -->
  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  {#if isBaseEmpty}
    <div data-testid="empty-base-state" class="rounded-2xl border border-dashed border-border bg-card p-10 sm:p-14 text-center space-y-4 max-w-2xl mx-auto my-8">
      <div class="p-4 rounded-2xl bg-muted/60 text-muted-foreground w-16 h-16 mx-auto flex items-center justify-center">
        <Database class="h-8 w-8 text-primary" />
      </div>
      <div class="space-y-2">
        <h2 class="text-xl font-bold text-foreground">Socle de doctrine vide</h2>
        <p class="text-sm text-muted-foreground leading-relaxed">
          Aucun actif d'architecture (principes, patrons, ADRs) ni contrôle réglementaire n'a encore été publié dans cette base de connaissances.
        </p>
      </div>
      <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
        <a
          href="/kb/workshop"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-xs"
        >
          <Sparkles class="h-4 w-4" />
          <span>Ouvrir l'Atelier de Doctrine</span>
        </a>
        <a
          href="/frameworks"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-muted/30 hover:bg-muted text-xs font-semibold text-foreground transition-colors"
        >
          <Shield class="h-4 w-4" />
          <span>Ingérer un Référentiel</span>
        </a>
      </div>
    </div>

  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  <!-- VUE « OPPOSABLE » : DOCTRINE OPPOSABLE & CLAUSES (Archinex #95)            -->
  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  {:else if viewMode === 'opposable'}
    <div class="space-y-6">
      <!-- Barre de filtres de la doctrine opposable -->
      <div class="rounded-2xl border border-border bg-card p-4 shadow-2xs space-y-3">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <!-- Recherche textuelle -->
          <div class="relative flex-1 sm:max-w-md">
            <Search class="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              bind:value={opposableSearch}
              placeholder="Rechercher par identifiant, titre ou clause..."
              class="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <!-- Filtre Référentiel -->
            <select
              bind:value={opposableFramework}
              class="text-xs bg-background border border-border rounded-xl px-3 py-2 text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <option value="">Tous les référentiels</option>
              <option value="__transverse__">Transverse (Sans référentiel)</option>
              {#each uniqueFrameworks as fw}
                <option value={fw}>{fw}</option>
              {/each}
            </select>

            <!-- Filtre Type d'actif -->
            <select
              bind:value={opposableType}
              class="text-xs bg-background border border-border rounded-xl px-3 py-2 text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <option value="">Tous les types</option>
              <option value="control">Contrôle réglementaire</option>
              <option value="principle">Principe d'architecture</option>
              <option value="pattern">Patron (Pattern)</option>
              <option value="decision">Décision (ADR)</option>
            </select>

            <!-- Filtre Domaine -->
            <select
              bind:value={opposableDomain}
              class="text-xs bg-background border border-border rounded-xl px-3 py-2 text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <option value="">Tous les domaines</option>
              {#each uniqueDomains as dom}
                <option value={dom}>{dom}</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- Filtres rapides par statut de clause (Badges bloque / avertit / rejetée / informe) -->
        <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
          <span class="text-xs font-semibold text-muted-foreground mr-1">Opposabilité :</span>
          
          <button
            onclick={() => (opposableStatus = '')}
            class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all {opposableStatus === '' ? 'bg-primary text-primary-foreground shadow-2xs' : 'bg-muted/40 hover:bg-muted text-muted-foreground'}"
          >
            Tous ({allOpposableItems.length})
          </button>

          <button
            onclick={() => (opposableStatus = 'bloque')}
            class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all {opposableStatus === 'bloque' ? 'bg-rose-500 text-white border-rose-600' : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border-rose-500/30'}"
          >
            <span class="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1"></span>
            bloque ({allOpposableItems.filter((i) => i.badge === 'bloque').length})
          </button>

          <button
            onclick={() => (opposableStatus = 'avertit')}
            class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all {opposableStatus === 'avertit' ? 'bg-amber-500 text-white border-amber-600' : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border-amber-500/30'}"
          >
            <span class="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1"></span>
            avertit ({allOpposableItems.filter((i) => i.badge === 'avertit').length})
          </button>

          <button
            onclick={() => (opposableStatus = 'rejetee')}
            class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all {opposableStatus === 'rejetee' ? 'bg-zinc-600 text-white border-zinc-700' : 'bg-zinc-500/10 hover:bg-zinc-500/20 text-zinc-400 border-zinc-500/30'}"
          >
            <span class="inline-block w-2 h-2 rounded-full bg-zinc-500 mr-1"></span>
            rejetée ({allOpposableItems.filter((i) => i.badge === 'rejetée').length})
          </button>

          <button
            onclick={() => (opposableStatus = 'informe')}
            class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all {opposableStatus === 'informe' ? 'bg-sky-500 text-white border-sky-600' : 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 border-sky-500/30'}"
          >
            <span class="inline-block w-2 h-2 rounded-full bg-sky-500 mr-1"></span>
            informe ({allOpposableItems.filter((i) => i.badge === 'informe').length})
          </button>
        </div>
      </div>

      <!-- Groupement par Référentiel -->
      {#if groupedOpposable.length === 0}
        <div class="rounded-2xl border border-dashed border-border bg-card p-10 text-center space-y-2">
          <p class="text-sm font-semibold text-foreground">Aucun actif ne correspond aux filtres sélectionnés</p>
          <p class="text-xs text-muted-foreground">Modifiez ou réinitialisez les critères de recherche.</p>
        </div>
      {:else}
        <div class="space-y-8">
          {#each groupedOpposable as [fwName, items]}
            <section class="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-4">
              <!-- Entête du groupe de référentiel -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-xl bg-primary/10 text-primary">
                    <Shield class="h-5 w-5" />
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <h2 class="text-base sm:text-lg font-bold text-foreground">
                        {fwName}
                      </h2>
                      <span class="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-muted text-muted-foreground border border-border">
                        {items.length} actif{items.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <p class="text-xs text-muted-foreground">
                      Clauses opposables vérifiées dans le moteur de conformité
                    </p>
                  </div>
                </div>

                <!-- Lien couverture réglementaire (#90) -->
                {#if fwName !== 'Transverse / Socle Commun'}
                  <a
                    href="/frameworks?framework={fwName}"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted text-xs font-medium text-foreground transition-colors self-start sm:self-center"
                  >
                    <ExternalLink class="h-3.5 w-3.5 text-violet-500" />
                    <span>Couverture {fwName} (#90)</span>
                  </a>
                {/if}
              </div>

              <!-- Grille des actifs -->
              <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {#each items as item}
                  {@const badgeCfg = getBadgeConfig(item.badge)}
                  <div class="rounded-xl border border-border bg-muted/15 p-4 space-y-3 hover:border-primary/40 transition-colors flex flex-col justify-between">
                    <div class="space-y-2.5">
                      <!-- Entête carte actif -->
                      <div class="flex items-start justify-between gap-2">
                        <div class="space-y-1 min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <a
                              href="/knowledge/{item.id}"
                              class="font-mono text-xs font-bold text-primary hover:underline flex items-center gap-1"
                            >
                              <span>{item.id}</span>
                              <ExternalLink class="h-3 w-3 opacity-60" />
                            </a>
                            <span class="px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold bg-muted text-muted-foreground">
                              {item.type}
                            </span>
                            <span class="px-1.5 py-0.5 rounded text-[10px] bg-muted/60 text-muted-foreground">
                              {item.domain}
                            </span>
                          </div>
                          <h3 class="text-sm font-bold text-foreground line-clamp-2" title={item.title}>
                            {item.title}
                          </h3>
                        </div>

                        <!-- Badge Opposable -->
                        <span class="px-2.5 py-1 rounded-full border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0 {badgeCfg.class}">
                          <span class="w-1.5 h-1.5 rounded-full {badgeCfg.dot}"></span>
                          <span>{badgeCfg.label}</span>
                        </span>
                      </div>

                      <!-- Clauses associées -->
                      {#if item.clauses.length > 0}
                        <div class="space-y-2 pt-2 border-t border-border/50">
                          {#each item.clauses as cl}
                            {@const clBadge = getBadgeConfig(cl.status === 'validated' ? 'bloque' : cl.status === 'draft' ? 'avertit' : 'rejetée')}
                            <div class="text-xs p-2.5 rounded-lg bg-background border border-border/60 space-y-1.5">
                              <div class="flex items-center justify-between gap-2">
                                <span class="font-mono font-semibold text-foreground text-[11px]">
                                  {cl.check_id} ({cl.kind})
                                </span>
                                <span class="px-2 py-0.2 rounded-full border text-[10px] font-bold uppercase {clBadge.class}">
                                  {clBadge.label}
                                </span>
                              </div>
                              {#if cl.message}
                                <p class="text-muted-foreground text-[11px]">
                                  « {cl.message} »
                                </p>
                              {/if}
                              <div class="text-[10px] font-mono text-muted-foreground flex items-center gap-2 flex-wrap">
                                <span>when: {cl.when?.terms_any?.join(' | ') || JSON.stringify(cl.when)}</span>
                                {#if cl.expect}
                                  <span class="text-emerald-500">expect: {cl.expect?.terms_any?.join(' | ') || JSON.stringify(cl.expect)}</span>
                                {/if}
                              </div>
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <p class="text-[11px] text-muted-foreground italic pt-2 border-t border-border/50">
                          Aucune clause de contrôle (actif purement informatif).
                        </p>
                      {/if}
                    </div>

                    <!-- Lien bas de carte vers la fiche d'actif -->
                    <div class="pt-2 border-t border-border/40 flex items-center justify-between text-xs">
                      <span class="text-muted-foreground text-[11px]">
                        {item.clauses.length} clause{item.clauses.length > 1 ? 's' : ''}
                      </span>
                      <a
                        href="/knowledge/{item.id}"
                        class="text-primary hover:underline font-semibold flex items-center gap-1"
                      >
                        <span>Fiche d'actif & historique →</span>
                      </a>
                    </div>
                  </div>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      {/if}
    </div>

  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  <!-- VUE « JOURNAL » : HISTORIQUE DES PUBLICATIONS (Archinex #95)              -->
  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  {:else if viewMode === 'journal'}
    <div class="space-y-6">
      <!-- Filtres du journal -->
      <div class="rounded-2xl border border-border bg-card p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="relative flex-1 sm:max-w-md">
          <Search class="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            bind:value={journalSearch}
            placeholder="Rechercher un instantané, un changelog, un relecteur..."
            class="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
          />
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-muted-foreground whitespace-nowrap">Vecteur d'entrée :</span>
          <select
            bind:value={journalEntryPath}
            class="text-xs bg-background border border-border rounded-xl px-3 py-2 text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
          >
            <option value="">Tous les vecteurs</option>
            <option value="framework_ingestion">Ingestion Réglementaire</option>
            <option value="doctrine_workshop">Atelier de Doctrine</option>
            <option value="amendment">Amendement d'Expert</option>
            <option value="initial_baseline">Socle Initial (Baseline)</option>
          </select>
        </div>
      </div>

      <!-- Frise chronologique des publications -->
      {#if filteredPublications.length === 0}
        <div class="rounded-2xl border border-dashed border-border bg-card p-10 text-center space-y-2">
          <p class="text-sm font-semibold text-foreground">Aucune publication trouvée</p>
          <p class="text-xs text-muted-foreground">Aucun instantané scellé ne correspond aux filtres.</p>
        </div>
      {:else}
        <div class="relative pl-6 space-y-8 before:absolute before:left-2 before:top-3 before:bottom-3 before:w-0.5 before:bg-border">
          {#each filteredPublications as pub}
            <div class="relative space-y-3 group">
              <!-- Point sur la timeline -->
              <div class="absolute -left-6 top-1.5 h-4 w-4 rounded-full border-2 border-background bg-primary ring-4 ring-primary/20"></div>

              <div class="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-3">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-mono text-xs font-bold text-primary px-2.5 py-0.5 rounded-lg bg-primary/10 border border-primary/20">
                      {pub.snapshot_id}
                    </span>
                    <span class="text-xs font-bold px-2 py-0.5 rounded-lg bg-muted text-foreground border border-border">
                      {pub.version}
                    </span>
                    {#if pub.entry_path}
                      <span class="text-xs font-semibold px-2 py-0.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
                        {pub.entry_path.type === 'framework_ingestion' ? `Ingestion ${pub.entry_path.framework || ''}` : pub.entry_path.type === 'initial_baseline' ? 'Socle Initial' : pub.entry_path.type}
                      </span>
                    {/if}
                  </div>

                  <div class="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
                    <Calendar class="h-3.5 w-3.5" />
                    <span>{formatDate(pub.published_at || pub.date)}</span>
                  </div>
                </div>

                <!-- Changelog -->
                <p class="text-sm font-medium text-foreground leading-relaxed">
                  {pub.changelog || 'Publication officielle de la doctrine.'}
                </p>

                <!-- Métriques de publication -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                  <div class="p-2 rounded-lg bg-muted/30 border border-border/50">
                    <span class="text-muted-foreground block text-[10px]">Actifs au total</span>
                    <span class="font-bold text-foreground text-sm">{pub.assets_count}</span>
                  </div>
                  <div class="p-2 rounded-lg bg-muted/30 border border-border/50">
                    <span class="text-muted-foreground block text-[10px]">Ajoutés</span>
                    <span class="font-bold text-emerald-500 text-sm">+{pub.assets_added?.length || 0}</span>
                  </div>
                  <div class="p-2 rounded-lg bg-muted/30 border border-border/50">
                    <span class="text-muted-foreground block text-[10px]">Révisés</span>
                    <span class="font-bold text-amber-500 text-sm">~{pub.assets_revised?.length || 0}</span>
                  </div>
                  <div class="p-2 rounded-lg bg-muted/30 border border-border/50">
                    <span class="text-muted-foreground block text-[10px]">Retirés</span>
                    <span class="font-bold text-zinc-500 text-sm">-{pub.assets_removed?.length || 0}</span>
                  </div>
                </div>

                <!-- Relecteurs & Empreinte -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                  <div class="flex items-center gap-2">
                    <UserCheck class="h-3.5 w-3.5 text-emerald-500" />
                    <span>Relecteurs / Valideurs : {pub.reviewers?.join(', ') || pub.published_by}</span>
                  </div>
                  {#if pub.entry_path?.source_sha256}
                    <div class="font-mono text-[10px] text-muted-foreground/80 truncate max-w-xs" title={pub.entry_path.source_sha256}>
                      SHA-256 : {pub.entry_path.source_sha256.slice(0, 16)}...
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  <!-- BARRE DE NAVIGATION RAPIDE PAR ANCRES (EN MODE EMPILÉ)                    -->
  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  {:else if viewMode === 'stacked'}
    <div class="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-muted/20 border border-border text-xs">
      <span class="text-muted-foreground text-[11px] font-medium px-2">Accès rapide aux arbres :</span>
      <button
        onclick={() => scrollToSection('widget-decisions')}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card hover:bg-muted border border-border font-medium text-foreground transition-colors shadow-2xs"
      >
        <FileCode class="h-3.5 w-3.5 text-blue-500" />
        <span>1. Décisions & Architecture</span>
        <span class="px-1.5 py-0.2 rounded-full bg-blue-500/10 text-blue-400 font-mono text-[10px]">
          {matchResult.summary.matchedDecisions}/{matchResult.summary.totalDecisions}
        </span>
      </button>

      <button
        onclick={() => scrollToSection('widget-controls')}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card hover:bg-muted border border-border font-medium text-foreground transition-colors shadow-2xs"
      >
        <Shield class="h-3.5 w-3.5 text-violet-500" />
        <span>2. Référentiels & Conformité</span>
        <span class="px-1.5 py-0.2 rounded-full bg-violet-500/10 text-violet-400 font-mono text-[10px]">
          {matchResult.summary.matchedControls}/{matchResult.summary.totalControls}
        </span>
      </button>

      <button
        onclick={() => scrollToSection('widget-doctrine')}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card hover:bg-muted border border-border font-medium text-foreground transition-colors shadow-2xs"
      >
        <Layers class="h-3.5 w-3.5 text-amber-500" />
        <span>3. Doctrine & Patterns</span>
        <span class="px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-400 font-mono text-[10px]">
          {matchResult.summary.matchedPrinciples}/{matchResult.summary.totalPrinciples}
        </span>
      </button>
    </div>

    <!-- 1. VUE EMPILÉE : GRAPHE PLEINE LARGEUR + FORMULAIRE NON-MODAL FIXE -->
    <div class="space-y-8 min-w-0">
      {#each stackedWidgets as widget}
        <section
          id="widget-{widget.id}"
          class="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-4 transition-all"
        >
          <!-- En-tête du Widget -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
            <div class="space-y-1">
              <div class="flex items-center gap-2.5">
                <div class="p-2 rounded-lg bg-muted text-foreground">
                  {#if widget.id === 'decisions'}
                    <FileCode class="h-5 w-5 text-blue-500" />
                  {:else if widget.id === 'controls'}
                    <Shield class="h-5 w-5 text-violet-500" />
                  {:else}
                    <Layers class="h-5 w-5 text-amber-500" />
                  {/if}
                </div>
                <div>
                  <h2 class="text-base sm:text-lg font-bold text-foreground tracking-tight">
                    {widget.title}
                  </h2>
                  <p class="text-xs text-muted-foreground">
                    {widget.description}
                  </p>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 self-start sm:self-center">
              <!-- Indicateur de concept activement affiché dans la fiche -->
              {#if selectedNode && ((widget.id === 'decisions' && selectedNode.category === 'decision') || (widget.id === 'controls' && selectedNode.category === 'control') || (widget.id === 'doctrine' && (selectedNode.category === 'principle' || selectedNode.category === 'pattern' || selectedNode.category === 'template')))}
                <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold animate-pulse">
                  <Check class="h-3.5 w-3.5" />
                  <span class="max-w-[200px] sm:max-w-[280px] truncate">
                    Fiche active : {selectedNode.id || selectedNode.name}
                  </span>
                </div>
              {/if}

              <!-- Badge d'Éclairage pour ce Widget -->
              {#if currentEngagement}
                <div class="px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 {widget.matchedCount > 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-muted border-border text-muted-foreground'}">
                  <Sparkles class="h-3.5 w-3.5" />
                  <span>{widget.badge}</span>
                </div>
              {:else}
                <span class="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                  {widget.totalCount} éléments
                </span>
              {/if}
            </div>
          </div>

          {#if widget.id === 'controls' && uniqueControlFrameworks.length > 0}
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="text-muted-foreground font-medium">Référentiels (couverture sur /kb/frameworks) :</span>
              {#each uniqueControlFrameworks as fw (fw)}
                <a
                  href="/kb/frameworks#framework-{fw}"
                  data-testid="knowledge-framework-pill"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 font-mono text-[11px] font-semibold transition-colors"
                >
                  <span>{fw}</span>
                </a>
              {/each}
            </div>
          {/if}

          <!-- Zone du Graphique ECharts Pleine Largeur partant de la gauche -->
          <div class="relative rounded-xl border border-border/60 bg-muted/10 p-2 overflow-hidden">
            <KnowledgeTreeChart
              series={widget.series}
              height={widget.id === 'controls' ? '640px' : widget.id === 'decisions' ? '580px' : '520px'}
              isDark={isDark}
              onNodeClick={handleNodeClick}
            />
          </div>
        </section>
      {/each}
    </div>

  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  <!-- 2. VUE COMBINÉE : 3 COLONNES D'ARBORESCENCE AVEC FORMULAIRE NON-MODAL     -->
  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  {:else if viewMode === 'combined'}
    <div class="space-y-4 min-w-0">
      <div class="rounded-2xl border border-border bg-card p-4 shadow-sm relative overflow-hidden">
        <KnowledgeTreeChart
          legendData={combinedChartData.legendData}
          series={combinedChartData.series}
          height="720px"
          isDark={isDark}
          onNodeClick={handleNodeClick}
        />
      </div>
    </div>

  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  <!-- 3. VUE CATALOGUE DÉTAILLÉ (TABLEAUX)                                      -->
  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  {:else}
    <div class="space-y-6">
      <!-- Actifs d'Architecture (ADRs, Principes, Patterns) -->
      <div class="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        <div class="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
          <div class="flex items-center gap-2 font-bold text-sm text-foreground">
            <FileCode class="h-4 w-4 text-primary" />
            <span>Actifs d'Architecture ({filteredAssets.length})</span>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-xs text-left">
            <thead class="bg-muted/40 text-muted-foreground border-b border-border">
              <tr>
                <th class="p-3">ID</th>
                <th class="p-3">Titre de l'Actif</th>
                <th class="p-3">Type</th>
                <th class="p-3">Domaine</th>
                <th class="p-3">Statut</th>
                <th class="p-3">Alignement Projet</th>
                <th class="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              {#each filteredAssets as asset}
                {@const match = matchResult.assetMatches.get(asset.id)}
                {@const isMatched = match?.isMatched}
                <tr class="hover:bg-muted/20 transition-colors {isMatched ? 'bg-emerald-500/5' : ''}">
                  <td class="p-3 font-mono font-bold text-foreground">{asset.id}</td>
                  <td class="p-3 font-medium text-foreground max-w-md truncate" title={asset.title}>
                    {asset.title}
                  </td>
                  <td class="p-3">
                    <span class="px-2 py-0.5 rounded bg-muted text-muted-foreground capitalize font-medium">
                      {asset.type}
                    </span>
                  </td>
                  <td class="p-3 text-muted-foreground">{asset.domain}</td>
                  <td class="p-3">
                    <span class="px-2 py-0.5 rounded-full {asset.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'} text-[11px]">
                      {asset.status}
                    </span>
                  </td>
                  <td class="p-3">
                    {#if isMatched}
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold text-[11px]">
                        <Sparkles class="h-3 w-3" />
                        Éclairé ({match?.score}%)
                      </span>
                    {:else}
                      <span class="text-muted-foreground text-[11px]">Neutre</span>
                    {/if}
                  </td>
                  <td class="p-3 text-right">
                    <button
                      onclick={() => (selectedNode = { name: asset.title, id: asset.id, category: 'decision', raw: asset, match })}
                      class="px-2.5 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-xs transition-colors"
                    >
                      Examiner
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Contrôles Réglementaires (NIS2, 3GPP, SecNumCloud...) -->
      <div class="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        <div class="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
          <div class="flex items-center gap-2 font-bold text-sm text-foreground">
            <Shield class="h-4 w-4 text-violet-500" />
            <span>Contrôles et Référentiels Réglementaires ({filteredControls.length})</span>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-xs text-left">
            <thead class="bg-muted/40 text-muted-foreground border-b border-border">
              <tr>
                <th class="p-3">ID Contrôle</th>
                <th class="p-3">Référentiel</th>
                <th class="p-3">Titre de l'Exigence</th>
                <th class="p-3">Validation</th>
                <th class="p-3">Sévérité</th>
                <th class="p-3">Alignement Projet</th>
                <th class="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              {#each filteredControls as ctrl}
                {@const match = matchResult.controlMatches.get(ctrl.id)}
                {@const isMatched = match?.isMatched}
                {@const validators = Array.isArray(ctrl.validated_by) ? ctrl.validated_by : []}
                <tr class="hover:bg-muted/20 transition-colors {isMatched ? 'bg-violet-500/5' : ''}">
                  <td class="p-3 font-mono font-bold text-foreground">{ctrl.id}</td>
                  <td class="p-3 font-semibold">
                    <a
                      href="/kb/frameworks#framework-{ctrl.framework}"
                      data-testid="control-framework-link"
                      class="text-violet-400 hover:underline font-mono"
                    >
                      {ctrl.framework} {ctrl.version || ''}
                    </a>
                  </td>
                  <td class="p-3 font-medium text-foreground max-w-md truncate" title={ctrl.title}>
                    {ctrl.title}
                  </td>
                  <td class="p-3">
                    {#if validators.length > 0}
                      <span
                        data-testid="control-validation-badge"
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-semibold text-[11px]"
                      >
                        Validé par {validators.join(', ')}
                      </span>
                    {:else}
                      <span
                        data-testid="control-validation-badge"
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 font-semibold text-[11px]"
                      >
                        Provisoire
                      </span>
                    {/if}
                  </td>
                  <td class="p-3">
                    <span class="px-2 py-0.5 rounded text-[11px] font-medium {ctrl.severity === 'mandatory' ? 'bg-rose-500/10 text-rose-500' : 'bg-muted text-muted-foreground'}">
                      {ctrl.severity || 'recommandé'}
                    </span>
                  </td>
                  <td class="p-3">
                    {#if isMatched}
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-semibold text-[11px]">
                        <Sparkles class="h-3 w-3" />
                        Requis ({match?.score}%)
                      </span>
                    {:else}
                      <span class="text-muted-foreground text-[11px]">Neutre</span>
                    {/if}
                  </td>
                  <td class="p-3 text-right">
                    <button
                      onclick={() => (selectedNode = { name: ctrl.title, id: ctrl.id, category: 'control', raw: ctrl, match })}
                      class="px-2.5 py-1 rounded bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 font-semibold text-xs transition-colors"
                    >
                      Examiner
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  {/if}

  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  <!-- VOLET LATÉRAL D'INSPECTION PERSISTANT DANS LE VIEWPORT (DESKTOP lg+)       -->
  <!-- Formulaire non-modal toujours visible, quel que soit le niveau de scroll  -->
  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  {#if isSidePanelOpen && (viewMode === 'stacked' || viewMode === 'combined')}
    <aside
      class="hidden lg:flex fixed top-16 right-0 bottom-0 w-[420px] xl:w-[480px] 2xl:w-[520px] z-30 bg-card border-l border-border shadow-2xl flex-col animate-in slide-in-from-right duration-200"
    >
      <!-- Barre d'en-tête du volet viewport -->
      <div class="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between text-xs shrink-0">
        <div class="flex items-center gap-2 font-bold text-foreground">
          <FileCode class="h-4 w-4 text-primary" />
          <span>Fiche d'Architecture Interactive</span>
          {#if selectedNode}
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-primary/10 text-primary border border-primary/20">
              {selectedNode.id || 'Actif'}
            </span>
          {/if}
        </div>

        <div class="flex items-center gap-1.5">
          {#if selectedNode}
            <button
              onclick={() => (selectedNode = null)}
              class="px-2 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted text-[11px] transition-colors"
              title="Désélectionner le concept actuel"
            >
              Effacer
            </button>
          {/if}
          <button
            onclick={() => (isSidePanelOpen = false)}
            class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Réduire le volet pour voir l'arbre en pleine largeur"
            aria-label="Réduire le volet"
          >
            <PanelRightClose class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- Corps du formulaire non-modal -->
      <div class="flex-1 overflow-y-auto p-3">
        <KnowledgeNodePanel
          bind:node={selectedNode}
          snapshot={snapshot}
          onSelectNode={(n) => (selectedNode = n)}
        />
      </div>
    </aside>
  {/if}

  <!-- Bouton flottant quand le volet desktop est réduit -->
  {#if !isSidePanelOpen && (viewMode === 'stacked' || viewMode === 'combined')}
    <button
      onclick={() => (isSidePanelOpen = true)}
      class="hidden lg:flex fixed bottom-6 right-6 z-30 items-center gap-2.5 px-4 py-2.5 rounded-full bg-primary text-primary-foreground shadow-2xl hover:bg-primary/90 font-semibold text-xs transition-all hover:scale-105 active:scale-95"
      title="Ouvrir le formulaire d'inspection d'architecture"
    >
      <PanelRightOpen class="h-4 w-4" />
      <span>Fiche d'Architecture</span>
      {#if selectedNode}
        <span class="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-mono">
          {selectedNode.id || selectedNode.name.slice(0, 14)}
        </span>
      {/if}
    </button>
  {/if}

  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  <!-- BARRE / TIROIR FLOTTANT SUR TABLETTE & MOBILE (< lg)                       -->
  <!-- Reste toujours accessible en bas sans perdre de vue l'arbre cliqué        -->
  <!-- ═════════════════════════════════════════════════════════════════════════ -->
  {#if selectedNode && (viewMode === 'stacked' || viewMode === 'combined')}
    <div class="lg:hidden fixed bottom-3 left-3 right-3 z-40">
      {#if !isMobileSheetOpen}
        <!-- Barre compacte flottante -->
        <div class="bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-xl p-3 flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-200">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
              {#if selectedNode.category === 'control'}
                <Shield class="h-4 w-4 text-violet-500" />
              {:else}
                <FileCode class="h-4 w-4 text-blue-500" />
              {/if}
            </span>
            <div class="min-w-0">
              <div class="text-xs font-bold text-foreground truncate">
                {(selectedNode.raw as any)?.title || selectedNode.name}
              </div>
              <div class="text-[10px] text-muted-foreground flex items-center gap-2">
                <span class="font-mono">{selectedNode.id || selectedNode.typeLabel}</span>
                {#if selectedNode.match?.isMatched}
                  <span class="text-emerald-500 font-bold flex items-center gap-0.5">
                    <Sparkles class="h-3 w-3" />
                    Éclairé ({selectedNode.match.score}%)
                  </span>
                {/if}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <button
              onclick={() => (isMobileSheetOpen = true)}
              class="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow-xs"
            >
              Fiche ↑
            </button>
            <button
              onclick={() => (selectedNode = null)}
              class="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"
              aria-label="Fermer"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>
      {:else}
        <!-- Feuille déroulante élargie -->
        <div class="bg-card border border-border shadow-2xl rounded-2xl max-h-[75vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
          <div class="p-3 bg-muted/40 border-b border-border flex items-center justify-between">
            <div class="flex items-center gap-2 text-xs font-bold text-foreground">
              <FileCode class="h-4 w-4 text-primary" />
              <span>Fiche d'Architecture</span>
            </div>
            <button
              onclick={() => (isMobileSheetOpen = false)}
              class="px-2.5 py-1 rounded-md bg-muted text-foreground text-xs font-semibold"
            >
              Réduire ↓
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-2">
            <KnowledgeNodePanel
              bind:node={selectedNode}
              snapshot={snapshot}
              onSelectNode={(n) => (selectedNode = n)}
            />
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
