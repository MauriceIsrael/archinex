<script lang="ts">
  import type { KnowledgeTreeNode } from '$lib/domain/knowledgeGraph';
  import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
  import { toast } from '$lib/toast/index.svelte';
  import { goto } from '$app/navigation';
  import {
    X,
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
    FileText
  } from 'lucide-svelte';

  let {
    node = $bindable<KnowledgeTreeNode | null>(null),
    open = $bindable(false)
  }: {
    node: KnowledgeTreeNode | null;
    open: boolean;
  } = $props();

  const activeProject = $derived(deliberationStore.activeEngagement);

  function close() {
    open = false;
  }

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
    open = false;
    goto('/deliberation');
  }

  const rawData: any = $derived(node?.raw || null);
  const match = $derived(node?.match || null);
  const isMatched = $derived(match?.isMatched ?? false);
</script>

{#if open && node}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs transition-opacity"
    onclick={close}
    onkeydown={(e) => e.key === 'Escape' && close()}
    tabindex="0"
    role="button"
    aria-label="Fermer le volet d'inspection"
  ></div>

  <!-- Slide-over Drawer -->
  <aside
    class="fixed inset-y-0 right-0 z-50 w-full sm:max-w-xl bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
  >
    <!-- Drawer Header -->
    <header class="p-5 border-b border-border bg-muted/20 flex items-start justify-between gap-4">
      <div class="space-y-1.5 flex-1 min-w-0">
        <div class="flex items-center gap-2">
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

        <h2 class="text-lg font-bold text-foreground leading-snug">
          {rawData?.title || node.name}
        </h2>
      </div>

      <button
        onclick={close}
        class="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Fermer"
      >
        <X class="h-5 w-5" />
      </button>
    </header>

    <!-- Drawer Content Scrollable Area -->
    <div class="flex-1 overflow-y-auto p-5 space-y-5">
      <!-- ═════════════════════════════════════════════════════════════════════ -->
      <!-- BANNIÈRE D'ALIGNEMENT PROJET (ÉCLAIRAGE)                              -->
      <!-- ═════════════════════════════════════════════════════════════════════ -->
      {#if isMatched && activeProject && match}
        {@const m = match}
        <div class="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-emerald-500 font-bold text-sm">
              <Sparkles class="h-4 w-4" />
              <span>Concept Éclairé & Mobilisé dans ce Projet</span>
            </div>
            <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold">
              Score: {m.score}%
            </span>
          </div>

          <p class="text-xs text-muted-foreground">
            Ce concept résonne avec les exigences, délibérations ou contraintes de l'espace de travail actif <strong class="text-foreground">{activeProject.title}</strong>.
          </p>

          {#if m.reasons && m.reasons.length > 0}
            <div class="space-y-1.5 pt-1">
              <div class="text-[11px] font-semibold text-foreground uppercase tracking-wider">
                Justifications d'alignement :
              </div>
              <ul class="text-xs space-y-1 text-muted-foreground">
                {#each m.reasons as reason}
                  <li class="flex items-start gap-2">
                    <CheckCircle2 class="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{reason}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if m.matchedSubjects && m.matchedSubjects.length > 0}
            <div class="pt-2 border-t border-emerald-500/20 flex flex-wrap items-center gap-2">
              <span class="text-[11px] text-muted-foreground font-medium">Sujets associés :</span>
              {#each m.matchedSubjects as subjName}
                <button
                  onclick={() => navigateToSubject(subjName)}
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium transition-colors"
                >
                  {subjName}
                  <ArrowRight class="h-3 w-3" />
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else if activeProject}
        <div class="rounded-xl border border-border bg-muted/20 p-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Non mobilisé directement dans le projet actif ({activeProject.shortName}).</span>
          <span class="px-2 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">Inactif</span>
        </div>
      {/if}

      <!-- ═════════════════════════════════════════════════════════════════════ -->
      <!-- FICHE D'IDENTITÉ TECHNIQUE & MÉTA-DONNÉES                              -->
      <!-- ═════════════════════════════════════════════════════════════════════ -->
      <div class="space-y-3">
        <h3 class="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Tag class="h-3.5 w-3.5" />
          Fiche d'Identité Technique
        </h3>

        <div class="grid grid-cols-2 gap-3 text-xs">
          {#if rawData?.domain}
            <div class="p-3 rounded-lg border border-border bg-card">
              <span class="text-muted-foreground text-[11px] block">Domaine(s)</span>
              <span class="font-medium text-foreground">{rawData.domain}</span>
            </div>
          {/if}

          {#if rawData?.framework}
            <div class="p-3 rounded-lg border border-border bg-card">
              <span class="text-muted-foreground text-[11px] block">Référentiel</span>
              <span class="font-medium text-foreground">{rawData.framework} {rawData.version || ''}</span>
            </div>
          {/if}

          {#if rawData?.confidence}
            <div class="p-3 rounded-lg border border-border bg-card">
              <span class="text-muted-foreground text-[11px] block">Niveau de Confiance</span>
              <span class="font-medium text-foreground capitalize">{rawData.confidence}</span>
            </div>
          {/if}

          {#if rawData?.phase}
            <div class="p-3 rounded-lg border border-border bg-card">
              <span class="text-muted-foreground text-[11px] block">Phase d'Architecture</span>
              <span class="font-medium text-foreground">{rawData.phase}</span>
            </div>
          {/if}

          {#if rawData?.owner}
            <div class="p-3 rounded-lg border border-border bg-card">
              <span class="text-muted-foreground text-[11px] block">Propriétaire / Autorité</span>
              <span class="font-medium text-foreground flex items-center gap-1">
                <User class="h-3 w-3 text-muted-foreground" />
                {rawData.owner}
              </span>
            </div>
          {/if}

          {#if rawData?.last_reviewed}
            <div class="p-3 rounded-lg border border-border bg-card">
              <span class="text-muted-foreground text-[11px] block">Dernière Revue</span>
              <span class="font-medium text-foreground flex items-center gap-1">
                <Clock class="h-3 w-3 text-muted-foreground" />
                {rawData.last_reviewed}
              </span>
            </div>
          {/if}
        </div>
      </div>

      <!-- ═════════════════════════════════════════════════════════════════════ -->
      <!-- TRAÇABILITÉ PROVENANCE & ACTEURS                                      -->
      <!-- ═════════════════════════════════════════════════════════════════════ -->
      {#if rawData?.provenance}
        <div class="space-y-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <FileText class="h-3.5 w-3.5" />
            Source Documentaire & Traçabilité
          </h3>
          <div class="p-3 rounded-lg border border-border bg-muted/20 space-y-1.5 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Document :</span>
              <span class="font-mono font-medium">{rawData.provenance.document}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Version & Section :</span>
              <span>v{rawData.provenance.version} · {rawData.provenance.section}</span>
            </div>
            {#if rawData.provenance.text_sha256}
              <div class="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span>SHA-256 :</span>
                <span class="truncate max-w-[200px]">{rawData.provenance.text_sha256}</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- ═════════════════════════════════════════════════════════════════════ -->
      <!-- RELATIONS D'IMPLÉMENTATION & SUPERSEDING                              -->
      <!-- ═════════════════════════════════════════════════════════════════════ -->
      {#if rawData?.implemented_by && rawData.implemented_by.length > 0}
        <div class="space-y-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Layers class="h-3.5 w-3.5" />
            Actifs d'Ingénierie Réalisant ce Contrôle ({rawData.implemented_by.length})
          </h3>
          <div class="flex flex-wrap gap-2">
            {#each rawData.implemented_by as assetId}
              <span class="px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-medium">
                {assetId}
              </span>
            {/each}
          </div>
        </div>
      {/if}

      {#if rawData?.supersedes && rawData.supersedes.length > 0}
        <div class="space-y-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Remplace les décisions antérieures :
          </h3>
          <div class="flex flex-wrap gap-2">
            {#each rawData.supersedes as supId}
              <span class="px-2 py-0.5 rounded bg-muted text-muted-foreground text-xs font-mono">
                {supId}
              </span>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- Drawer Footer Actions -->
    <footer class="p-4 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
      <button
        onclick={copyMarkdownRef}
        class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted text-xs font-medium text-foreground transition-colors"
      >
        <Copy class="h-3.5 w-3.5" />
        Copier référence
      </button>

      {#if activeProject}
        <a
          href="/deliberation"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold transition-colors shadow-xs"
        >
          Ouvrir le Workbench Projet
          <ExternalLink class="h-3.5 w-3.5" />
        </a>
      {/if}
    </footer>
  </aside>
{/if}
