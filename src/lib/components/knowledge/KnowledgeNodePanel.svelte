<script lang="ts">
  import type { KnowledgeTreeNode, KnowledgeSnapshot } from '$lib/domain/knowledgeGraph';
  import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
  import { toast } from '$lib/toast/index.svelte';
  import { goto } from '$app/navigation';
  import {
    Sparkles,
    Shield,
    FileCode,
    CheckCircle2,
    Layers,
    ArrowRight,
    Copy,
    ExternalLink,
    Tag,
    Clock,
    User,
    FileText,
    MousePointerClick,
    X,
    FolderKanban
  } from 'lucide-svelte';

  let {
    node = $bindable<KnowledgeTreeNode | null>(null),
    snapshot,
    onSelectNode
  }: {
    node: KnowledgeTreeNode | null;
    snapshot?: KnowledgeSnapshot;
    onSelectNode?: (node: KnowledgeTreeNode) => void;
  } = $props();

  const activeProject = $derived(deliberationStore.activeEngagement);

  function copyMarkdownRef() {
    if (!node) return;
    const ref = `[${node.id || node.name} - ${node.typeLabel || 'Concept'}]`;
    navigator.clipboard.writeText(ref);
    toast(`Référence copiée : ${ref}`, { variant: 'default' });
  }

  function navigateToSubject(subjectName: string) {
    if (!activeProject) return;
    const subj = activeProject.subjects.find((s) => s.name === subjectName || s.id === subjectName);
    if (subj) {
      deliberationStore.activeSubjectId = subj.id;
    }
    goto('/deliberation');
  }

  function deselect() {
    node = null;
  }

  const rawData: any = $derived(node?.raw || null);
  const match = $derived(node?.match || null);
  const isMatched = $derived(match?.isMatched ?? false);

  let isHighlighted = $state(false);

  $effect(() => {
    if (node) {
      isHighlighted = true;
      const timer = setTimeout(() => {
        isHighlighted = false;
      }, 700);
      return () => clearTimeout(timer);
    }
  });
</script>

<div
  class="rounded-2xl border {isHighlighted ? 'border-primary ring-2 ring-primary/40 shadow-lg' : isMatched ? 'border-emerald-500/40' : 'border-border'} bg-card shadow-sm flex flex-col overflow-hidden transition-all duration-200 h-full max-h-[calc(100vh-5rem)]"
>
  <!-- En-tête du volet -->
  <div class="p-4 sm:p-5 border-b border-border bg-muted/20 flex items-start justify-between gap-3">
    <div class="space-y-1 min-w-0 flex-1">
      {#if node}
        <div class="flex flex-wrap items-center gap-2">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            {#if node.category === 'control'}
              <Shield class="h-3.5 w-3.5" />
            {:else}
              <FileCode class="h-3.5 w-3.5" />
            {/if}
            {node.typeLabel || node.category}
          </span>

          {#if node.id}
            <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">
              {node.id}
            </span>
          {/if}

          {#if rawData?.status}
            <span class="text-[11px] font-medium px-2 py-0.5 rounded-full {rawData.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-muted text-muted-foreground'}">
              {rawData.status}
            </span>
          {/if}
        </div>

        <h3 class="text-base font-bold text-foreground leading-snug pt-1">
          {rawData?.title || node.name}
        </h3>
      {:else}
        <div class="flex items-center gap-2 text-foreground font-bold text-sm">
          <MousePointerClick class="h-4 w-4 text-primary" />
          <span>Formulaire Fiche d'Architecture</span>
        </div>
        <p class="text-xs text-muted-foreground">
          Visualisation contextuelle non-modale en direct de l'arbre
        </p>
      {/if}
    </div>

    {#if node}
      <button
        onclick={deselect}
        class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
        title="Désélectionner"
        aria-label="Fermer la fiche"
      >
        <X class="h-4 w-4" />
      </button>
    {/if}
  </div>

  <!-- Contenu défilant -->
  <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
    {#if node}
      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <!-- BANNIÈRE D'ALIGNEMENT PROJET (ÉCLAIRAGE)                            -->
      <!-- ═══════════════════════════════════════════════════════════════════ -->
      {#if isMatched && activeProject && match}
        {@const m = match}
        <div class="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-emerald-500 font-bold text-xs">
              <Sparkles class="h-4 w-4" />
              <span>Concept Éclairé pour le Projet</span>
            </div>
            <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[11px] font-bold">
              Score: {m.score}%
            </span>
          </div>

          <p class="text-[11px] text-muted-foreground leading-relaxed">
            Ce concept résonne directement avec l'espace de travail <strong class="text-foreground">{activeProject.title}</strong>.
          </p>

          {#if m.reasons && m.reasons.length > 0}
            <div class="space-y-1.5 pt-1">
              <div class="text-[10px] font-semibold text-foreground uppercase tracking-wider">
                Justifications d'alignement :
              </div>
              <ul class="text-[11px] space-y-1 text-muted-foreground">
                {#each m.reasons as reason}
                  <li class="flex items-start gap-1.5">
                    <CheckCircle2 class="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{reason}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if m.matchedSubjects && m.matchedSubjects.length > 0}
            <div class="pt-2 border-t border-emerald-500/20 flex flex-wrap items-center gap-1.5">
              <span class="text-[10px] text-muted-foreground font-medium">Sujets liés :</span>
              {#each m.matchedSubjects as subjName}
                <button
                  onclick={() => navigateToSubject(subjName)}
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-medium transition-colors"
                >
                  {subjName}
                  <ArrowRight class="h-3 w-3" />
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else if activeProject}
        <div class="rounded-xl border border-border bg-muted/20 p-3.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Non mobilisé par le projet actif ({activeProject.shortName}).</span>
          <span class="px-2 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">Inactif</span>
        </div>
      {/if}

      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <!-- FICHE D'IDENTITÉ TECHNIQUE                                          -->
      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <div class="space-y-2.5">
        <h4 class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Tag class="h-3.5 w-3.5" />
          Fiche d'Identité Technique
        </h4>

        <div class="grid grid-cols-2 gap-2.5">
          {#if rawData?.domain}
            <div class="p-2.5 rounded-lg border border-border bg-card">
              <span class="text-muted-foreground text-[10px] block">Domaine</span>
              <span class="font-medium text-foreground">{rawData.domain}</span>
            </div>
          {/if}

          {#if rawData?.framework}
            <div class="p-2.5 rounded-lg border border-border bg-card">
              <span class="text-muted-foreground text-[10px] block">Référentiel</span>
              <span class="font-medium text-foreground">{rawData.framework} {rawData.version || ''}</span>
            </div>
          {/if}

          {#if rawData?.severity}
            <div class="p-2.5 rounded-lg border border-border bg-card">
              <span class="text-muted-foreground text-[10px] block">Sévérité</span>
              <span class="font-medium {rawData.severity === 'mandatory' ? 'text-rose-400' : 'text-foreground'} capitalize">{rawData.severity}</span>
            </div>
          {/if}

          {#if rawData?.confidence}
            <div class="p-2.5 rounded-lg border border-border bg-card">
              <span class="text-muted-foreground text-[10px] block">Confiance</span>
              <span class="font-medium text-foreground capitalize">{rawData.confidence}</span>
            </div>
          {/if}

          {#if rawData?.phase}
            <div class="p-2.5 rounded-lg border border-border bg-card">
              <span class="text-muted-foreground text-[10px] block">Phase EA</span>
              <span class="font-medium text-foreground">{rawData.phase}</span>
            </div>
          {/if}

          {#if rawData?.owner}
            <div class="p-2.5 rounded-lg border border-border bg-card">
              <span class="text-muted-foreground text-[10px] block">Propriétaire</span>
              <span class="font-medium text-foreground flex items-center gap-1 truncate">
                <User class="h-3 w-3 text-muted-foreground shrink-0" />
                {rawData.owner}
              </span>
            </div>
          {/if}

          {#if rawData?.last_reviewed}
            <div class="p-2.5 rounded-lg border border-border bg-card">
              <span class="text-muted-foreground text-[10px] block">Dernière Revue</span>
              <span class="font-medium text-foreground flex items-center gap-1">
                <Clock class="h-3 w-3 text-muted-foreground shrink-0" />
                {rawData.last_reviewed}
              </span>
            </div>
          {/if}
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <!-- TRAÇABILITÉ PROVENANCE                                               -->
      <!-- ═══════════════════════════════════════════════════════════════════ -->
      {#if rawData?.provenance}
        <div class="space-y-2">
          <h4 class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <FileText class="h-3.5 w-3.5" />
            Traçabilité & Source
          </h4>
          <div class="p-2.5 rounded-lg border border-border bg-muted/20 space-y-1 text-[11px]">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Fichier :</span>
              <span class="font-mono font-medium">{rawData.provenance.document}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Section :</span>
              <span>v{rawData.provenance.version} · {rawData.provenance.section}</span>
            </div>
            {#if rawData.provenance.text_sha256}
              <div class="flex items-center justify-between font-mono text-[10px] text-muted-foreground pt-1">
                <span>SHA-256 :</span>
                <span class="truncate max-w-[180px]">{rawData.provenance.text_sha256}</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <!-- RELATIONS D'IMPLÉMENTATION & SUPERSEDING                            -->
      <!-- ═══════════════════════════════════════════════════════════════════ -->
      {#if rawData?.implemented_by && rawData.implemented_by.length > 0}
        <div class="space-y-2">
          <h4 class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Layers class="h-3.5 w-3.5" />
            Actifs Réalisant ce Contrôle ({rawData.implemented_by.length})
          </h4>
          <div class="flex flex-wrap gap-1.5">
            {#each rawData.implemented_by as assetId}
              <span class="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary font-mono text-[11px]">
                {assetId}
              </span>
            {/each}
          </div>
        </div>
      {/if}

      {#if rawData?.supersedes && rawData.supersedes.length > 0}
        <div class="space-y-1.5">
          <h4 class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Remplace :
          </h4>
          <div class="flex flex-wrap gap-1.5">
            {#each rawData.supersedes as supId}
              <span class="px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[11px]">
                {supId}
              </span>
            {/each}
          </div>
        </div>
      {/if}
    {:else}
      <!-- État Vide : Guide d'invitation non-modal -->
      <div class="p-6 text-center space-y-3 my-auto">
        <div class="mx-auto w-12 h-12 rounded-2xl bg-muted/60 border border-border flex items-center justify-center text-primary shadow-xs">
          <MousePointerClick class="h-6 w-6 text-primary" />
        </div>
        <div class="space-y-1">
          <p class="font-bold text-foreground text-sm">
            Sélectionnez un concept dans l'arbre
          </p>
          <p class="text-[11px] text-muted-foreground leading-relaxed">
            Cliquez sur n'importe quelle feuille (ADR, Contrôle réglementaire, Principe) dans les arborescences à gauche.
            La fiche d'architecture et ses justifications s'afficheront ici en direct, sans jamais masquer l'arbre.
          </p>
        </div>

        {#if activeProject}
          <div class="pt-3 border-t border-border space-y-2">
            <span class="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
              Projet actif : {activeProject.shortName}
            </span>
            <div class="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-left space-y-1">
              <div class="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
                <Sparkles class="h-3 w-3" />
                <span>Les concepts illuminés en vert</span>
              </div>
              <p class="text-[10px] text-muted-foreground">
                Ces concepts matchent les exigences de votre projet actuel. Cliquez sur l'un d'eux dans l'arbre pour voir ses justifications.
              </p>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Pied d'action -->
  {#if node}
    <div class="p-3.5 border-t border-border bg-muted/20 flex items-center justify-between gap-2">
      <button
        onclick={copyMarkdownRef}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-[11px] font-medium text-foreground transition-colors"
      >
        <Copy class="h-3.5 w-3.5" />
        Copier référence
      </button>

      {#if activeProject}
        <a
          href="/deliberation"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[11px] font-bold transition-colors shadow-2xs"
        >
          Workbench
          <ExternalLink class="h-3.5 w-3.5" />
        </a>
      {/if}
    </div>
  {/if}
</div>
