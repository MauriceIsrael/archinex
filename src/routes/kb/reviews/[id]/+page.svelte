<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import Shield from 'lucide-svelte/icons/shield';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import CheckCircle from 'lucide-svelte/icons/check-circle';
  import XCircle from 'lucide-svelte/icons/x-circle';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import Clock from 'lucide-svelte/icons/clock';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import UserPlus from 'lucide-svelte/icons/user-plus';
  import Send from 'lucide-svelte/icons/send';
  import Edit3 from 'lucide-svelte/icons/edit-3';
  import Check from 'lucide-svelte/icons/check';
  import Lock from 'lucide-svelte/icons/lock';
  import FileText from 'lucide-svelte/icons/file-text';
  import { invalidateAll } from '$app/navigation';

  let { data } = $props();

  let activeTab = $state<'checks' | 'content' | 'history'>('checks');
  let isSubmitting = $state<boolean>(false);
  let errorMessage = $state<string | null>(null);
  let successMessage = $state<string | null>(null);

  // Form states
  let showAcceptModal = $state<boolean>(false);
  let acceptReason = $state<string>('');

  let showAmendModal = $state<boolean>(false);
  let amendedContent = $state<string>(data.candidate.amended_content || data.candidate.suggested_change || data.candidate.summary);
  let amendReason = $state<string>('');

  let showRejectModal = $state<boolean>(false);
  let rejectReason = $state<string>('');

  let showAssignModal = $state<boolean>(false);
  let assignHandle = $state<string>('');
  let assignReason = $state<string>('');

  let showRequestReviewModal = $state<boolean>(false);
  let requestKind = $state<'second_review' | 'advice'>('second_review');
  let requestRecipient = $state<string>('');
  let requestMessage = $state<string>('');

  let commentInput = $state<string>('');

  async function handleReviewAction(action: 'accept' | 'amend' | 'reject') {
    isSubmitting = true;
    errorMessage = null;
    successMessage = null;

    try {
      const payload: any = { action };
      if (action === 'accept') {
        payload.reason = acceptReason || undefined;
      } else if (action === 'amend') {
        payload.amended_content = amendedContent;
        payload.reason = amendReason;
      } else if (action === 'reject') {
        if (!rejectReason.trim()) {
          errorMessage = 'Un motif explicite est obligatoire pour rejeter un candidat.';
          isSubmitting = false;
          return;
        }
        payload.reason = rejectReason;
      }

      const res = await fetch(`/api/knowledge/candidates/${data.candidate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 403) {
          errorMessage = body.error || 'Action refusée (403) : vous ne possédez pas les droits sur ce domaine.';
        } else if (res.status === 409) {
          errorMessage = body.error || 'Conflit d’état (409) : ce candidat est déjà finalisé.';
        } else {
          errorMessage = body.error || `Erreur ${res.status} lors de l’examen`;
        }
        return;
      }

      successMessage = `Décision « ${action} » enregistrée avec succès.`;
      showAcceptModal = false;
      showAmendModal = false;
      showRejectModal = false;
      await invalidateAll();
    } catch (err: any) {
      errorMessage = err.message || 'Erreur réseau';
    } finally {
      isSubmitting = false;
    }
  }

  async function handleAssign() {
    if (!assignHandle.trim()) return;
    isSubmitting = true;
    errorMessage = null;

    try {
      const res = await fetch(`/api/knowledge/candidates/${data.candidate.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee: assignHandle, reason: assignReason })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorMessage = body.error || 'Erreur lors de l’assignation';
        return;
      }
      showAssignModal = false;
      await invalidateAll();
    } finally {
      isSubmitting = false;
    }
  }

  async function handleRequestReview() {
    if (!requestRecipient.trim() || !requestMessage.trim()) return;
    isSubmitting = true;
    errorMessage = null;

    try {
      const res = await fetch(`/api/knowledge/candidates/${data.candidate.id}/request-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: requestKind,
          recipient: requestRecipient,
          message: requestMessage
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorMessage = body.error || 'Erreur lors de la sollicitation';
        return;
      }
      showRequestReviewModal = false;
      await invalidateAll();
    } finally {
      isSubmitting = false;
    }
  }

  async function handlePostComment() {
    if (!commentInput.trim()) return;
    isSubmitting = true;

    try {
      const res = await fetch(`/api/knowledge/candidates/${data.candidate.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commentInput })
      });
      if (res.ok) {
        commentInput = '';
        await invalidateAll();
      }
    } finally {
      isSubmitting = false;
    }
  }

  const isTerminal = $derived(
    data.candidate.status === 'accepted' || data.candidate.status === 'rejected'
  );
</script>

<svelte:head>
  <title>Examen Candidat — {data.candidate.title} — Archinex</title>
</svelte:head>

<div class="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-6xl mx-auto">
  <!-- Navigation retour & En-tête -->
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <Button variant="ghost" size="sm" href="/kb/reviews" class="gap-1.5 text-xs text-muted-foreground">
        <ArrowLeft class="h-4 w-4" /> Retour à la boîte de revue
      </Button>

      <!-- Badge Statut -->
      <div>
        {#if data.candidate.status === 'accepted'}
          <span class="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
            <CheckCircle class="h-3.5 w-3.5" /> Accepté & Intégré
          </span>
        {:else if data.candidate.status === 'rejected'}
          <span class="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs font-bold text-destructive">
            <XCircle class="h-3.5 w-3.5" /> Rejeté
          </span>
        {:else}
          <span class="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
            <Clock class="h-3.5 w-3.5" /> En cours d’examen
          </span>
        {/if}
      </div>
    </div>

    <!-- Titre et métadonnées -->
    <div class="border-b pb-4 space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
          {data.candidate.id}
        </span>
        <span class="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-mono font-bold text-primary">
          <Shield class="h-3 w-3" /> {data.candidate.domain}
        </span>
        {#if data.candidate.kind === 'principle'}
          <span class="rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:text-purple-300">
            Principe Fondamental (Double-Avis Obligatoire)
          </span>
        {/if}
      </div>

      <h1 class="text-2xl font-bold tracking-tight text-foreground">
        {data.candidate.title}
      </h1>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground font-mono">
        <span>Auteur : <strong class="text-foreground">{data.candidate.author}</strong></span>
        <span>•</span>
        <span>Mode : {data.candidate.production_mode}</span>
        <span>•</span>
        <span>Projet source : {data.candidate.source?.engagement || 'Archinex'}</span>
      </div>
    </div>
  </div>

  <!-- Messages Feedback (Erreur / Succès) -->
  {#if errorMessage}
    <div class="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive flex items-start gap-3">
      <AlertTriangle class="h-5 w-5 shrink-0 mt-0.5" />
      <div>
        <h4 class="font-bold text-sm">Refus d'Action</h4>
        <p class="mt-0.5">{errorMessage}</p>
      </div>
    </div>
  {/if}

  {#if successMessage}
    <div class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-3">
      <CheckCircle class="h-5 w-5 shrink-0 mt-0.5 text-emerald-600" />
      <div>
        <h4 class="font-bold text-sm">Action Validée</h4>
        <p class="mt-0.5">{successMessage}</p>
      </div>
    </div>
  {/if}

  <!-- Alerte d'habilitation domaine (Porte G5 / Issue #2) -->
  {#if !data.isAuthorizedForDomain}
    <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-3">
      <Lock class="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
      <div>
        <h4 class="font-bold text-sm">Domaine Non Attribué ({data.candidate.domain})</h4>
        <p class="mt-0.5">
          Votre compte expert ({data.user.email}) ne possède pas le domaine « <strong>{data.candidate.domain}</strong> ». Vous pouvez consulter ce candidat, poser des questions et donner un avis consultatif, mais toute tentative d'approbation ou de rejet définitif sera rejetée (403 Forbidden).
        </p>
      </div>
    </div>
  {/if}

  <!-- Grille principale 2 colonnes -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Colonne Gauche (2/3) : Détails, 7 Checks, Historique -->
    <div class="lg:col-span-2 space-y-6">
      <!-- Onglets -->
      <div class="flex items-center gap-2 border-b">
        <button
          class="pb-2.5 text-xs font-semibold px-2 transition-colors border-b-2 {activeTab === 'checks' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
          onclick={() => (activeTab = 'checks')}
        >
          7 Vérifications Automatiques ({data.candidate.checks?.length || 0})
        </button>
        <button
          class="pb-2.5 text-xs font-semibold px-2 transition-colors border-b-2 {activeTab === 'content' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
          onclick={() => (activeTab = 'content')}
        >
          Contenu & Énoncé
        </button>
        <button
          class="pb-2.5 text-xs font-semibold px-2 transition-colors border-b-2 {activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
          onclick={() => (activeTab = 'history')}
        >
          Traçabilité & Historique ({data.candidate.history?.length || 0})
        </button>
      </div>

      <!-- Onglet 1 : Les 7 Vérifications Automatiques LLMOps (Gate G5) -->
      {#if activeTab === 'checks'}
        <div class="space-y-4">
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <span>Contrôles préalables d'éligibilité exécutés par LLMOps</span>
            {#if data.candidate.all_checks_passed}
              <span class="inline-flex items-center gap-1 text-emerald-600 font-bold">
                <CheckCircle class="h-3.5 w-3.5" /> Tous les contrôles sont au vert
              </span>
            {:else}
              <span class="inline-flex items-center gap-1 text-amber-600 font-bold">
                <AlertTriangle class="h-3.5 w-3.5" /> Réserves ou points d'attention
              </span>
            {/if}
          </div>

          <div class="space-y-3">
            {#each data.candidate.checks as check}
              <div class="rounded-xl border p-4 space-y-2 bg-card text-xs {check.passed ? 'border-emerald-500/20' : 'border-destructive/30 bg-destructive/5'}">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    {#if check.passed}
                      <CheckCircle class="h-4 w-4 text-emerald-600 shrink-0" />
                    {:else}
                      <XCircle class="h-4 w-4 text-destructive shrink-0" />
                    {/if}
                    <span class="font-bold text-foreground text-sm">{check.label}</span>
                    <code class="text-[10px] text-muted-foreground font-mono">[{check.name}]</code>
                  </div>

                  <div class="flex items-center gap-2">
                    {#if check.score !== undefined}
                      <span class="px-2 py-0.5 rounded font-mono font-bold {check.score >= 80 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700'}">
                        {check.score} / 100
                      </span>
                    {/if}
                    <span class="uppercase text-[10px] font-bold px-1.5 py-0.5 rounded {check.severity === 'error' ? 'bg-destructive/10 text-destructive' : check.severity === 'warning' ? 'bg-amber-500/10 text-amber-700' : 'bg-muted text-muted-foreground'}">
                      {check.severity}
                    </span>
                  </div>
                </div>

                <p class="text-muted-foreground text-xs leading-relaxed">
                  {check.details}
                </p>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Onglet 2 : Contenu & Énoncé -->
      {#if activeTab === 'content'}
        <div class="space-y-4 text-xs">
          <!-- Résumé / Clause -->
          <Card.Root>
            <Card.Header>
              <Card.Title class="text-sm">Énoncé de la Clause Proposée</Card.Title>
            </Card.Header>
            <Card.Content class="space-y-3">
              <div class="p-3 rounded-lg bg-muted/40 border font-mono text-xs whitespace-pre-wrap leading-relaxed">
                {data.candidate.summary}
              </div>

              {#if data.candidate.suggested_change}
                <div>
                  <span class="font-bold text-foreground block mb-1">Modification suggérée :</span>
                  <div class="p-3 rounded-lg bg-primary/5 border border-primary/20 font-mono text-xs whitespace-pre-wrap">
                    {data.candidate.suggested_change}
                  </div>
                </div>
              {/if}

              {#if data.candidate.amended_content}
                <div>
                  <span class="font-bold text-amber-600 dark:text-amber-400 block mb-1">Version amendée par l'expert :</span>
                  <div class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 font-mono text-xs whitespace-pre-wrap">
                    {data.candidate.amended_content}
                  </div>
                </div>
              {/if}
            </Card.Content>
          </Card.Root>

          <!-- Rationale -->
          <Card.Root>
            <Card.Header>
              <Card.Title class="text-sm">Motivation & Rationale</Card.Title>
            </Card.Header>
            <Card.Content>
              <p class="text-muted-foreground leading-relaxed">
                {data.candidate.rationale}
              </p>
            </Card.Content>
          </Card.Root>
        </div>
      {/if}

      <!-- Onglet 3 : Traçabilité & Historique -->
      {#if activeTab === 'history'}
        <div class="space-y-4">
          <div class="relative border-l border-muted pl-4 ml-2 space-y-4 text-xs">
            {#each data.candidate.history as entry}
              <div class="relative">
                <div class="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background"></div>
                <div class="flex items-center justify-between text-muted-foreground text-[11px]">
                  <span class="font-bold text-foreground">{entry.actor_name || entry.actor}</span>
                  <span>{new Date(entry.timestamp).toLocaleString('fr-FR')}</span>
                </div>
                <span class="inline-block mt-0.5 uppercase tracking-wider text-[10px] font-bold text-primary font-mono">
                  {entry.action}
                </span>
                {#if entry.details}
                  <p class="mt-1 text-muted-foreground bg-muted/30 p-2 rounded border">
                    {entry.details}
                  </p>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- Colonne Droite (1/3) : Actions d'Examen & Collaboration -->
    <div class="space-y-6">
      <!-- Carte Actions d'Arbitrage -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-sm flex items-center gap-2">
            <Check class="h-4 w-4 text-primary" /> Verdict d'Examen
          </Card.Title>
          <Card.Description>Décision opposable de gouvernance</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-3">
          {#if isTerminal}
            <div class="p-3 rounded-lg bg-muted text-center text-xs text-muted-foreground italic">
              Ce candidat a déjà fait l'objet d'une décision terminale. Aucune action supplémentaire n'est requise.
            </div>
          {:else}
            <!-- Bouton Accepter -->
            <Button
              class="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              size="sm"
              disabled={isSubmitting || !data.isAuthorizedForDomain}
              onclick={() => (showAcceptModal = true)}
            >
              <CheckCircle class="h-4 w-4" /> Accepter le candidat
            </Button>

            <!-- Bouton Amender -->
            <Button
              variant="outline"
              class="w-full gap-2 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
              size="sm"
              disabled={isSubmitting || !data.isAuthorizedForDomain}
              onclick={() => (showAmendModal = true)}
            >
              <Edit3 class="h-4 w-4" /> Amender la formulation
            </Button>

            <!-- Bouton Rejeter -->
            <Button
              variant="destructive"
              class="w-full gap-2"
              size="sm"
              disabled={isSubmitting || !data.isAuthorizedForDomain}
              onclick={() => (showRejectModal = true)}
            >
              <XCircle class="h-4 w-4" /> Rejeter avec motif
            </Button>
          {/if}
        </Card.Content>
      </Card.Root>

      <!-- Inter-sollicitation & Délégation -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-sm flex items-center gap-2">
            <UserPlus class="h-4 w-4 text-primary" /> Collégialité & Délégation
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-2 text-xs">
          <Button
            variant="outline"
            size="sm"
            class="w-full justify-start gap-2"
            disabled={isTerminal || isSubmitting}
            onclick={() => (showAssignModal = true)}
          >
            <UserPlus class="h-3.5 w-3.5" /> Assigner à un autre expert
          </Button>

          <Button
            variant="outline"
            size="sm"
            class="w-full justify-start gap-2"
            disabled={isTerminal || isSubmitting}
            onclick={() => (showRequestReviewModal = true)}
          >
            <Clock class="h-3.5 w-3.5" /> Solliciter un 2nd avis / conseil
          </Button>
        </Card.Content>
      </Card.Root>

      <!-- Fil de Commentaires -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-sm flex items-center gap-2">
            <MessageSquare class="h-4 w-4 text-primary" /> Fil de Discussion ({data.comments.length})
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-3">
          <div class="space-y-2 max-h-60 overflow-y-auto pr-1 text-xs">
            {#if data.comments.length === 0}
              <p class="text-muted-foreground italic text-center py-2">Aucun commentaire</p>
            {:else}
              {#each data.comments as comm}
                <div class="p-2.5 rounded-lg border bg-muted/20 space-y-1">
                  <div class="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span class="font-bold text-foreground">{comm.author_name}</span>
                    <code class="text-primary font-mono">{comm.author_handle}</code>
                  </div>
                  <p class="text-xs leading-relaxed text-foreground">{comm.message}</p>
                  <span class="text-[10px] text-muted-foreground block">
                    {new Date(comm.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              {/each}
            {/if}
          </div>

          <!-- Saisie commentaire -->
          <div class="flex items-center gap-2 pt-2 border-t">
            <input
              type="text"
              bind:value={commentInput}
              placeholder="Poser une question ou commenter..."
              class="flex-1 h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:ring-1 focus:ring-primary"
              onkeydown={(e) => e.key === 'Enter' && handlePostComment()}
            />
            <Button
              size="sm"
              disabled={isSubmitting || !commentInput.trim()}
              onclick={handlePostComment}
              class="h-8 px-2.5"
            >
              <Send class="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card.Content>
      </Card.Root>
    </div>
  </div>
</div>

<!-- MODAL ACCEPTER -->
{#if showAcceptModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl space-y-4 text-xs">
      <div class="flex items-center gap-2 text-emerald-600 font-bold text-sm">
        <CheckCircle class="h-5 w-5" /> Confirmer l'Approbation
      </div>

      {#if data.candidate.kind === 'principle'}
        <div class="p-3 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-800 dark:text-purple-200">
          <strong class="font-bold block mb-1">Règle des Principes Fondamentaux :</strong>
          L'approbation d'un principe ne le valide pas immédiatement : elle déclenche automatiquement la notification d'un second avis collégial requis pour finaliser l'opposabilité.
        </div>
      {/if}

      <div class="space-y-1.5">
        <label for="accept-reason" class="font-bold text-foreground">Remarques ou réserve éventuelle (optionnel) :</label>
        <textarea
          id="accept-reason"
          bind:value={acceptReason}
          placeholder="Ex: Conforme aux exigences du référentiel..."
          rows="3"
          class="w-full rounded-md border border-input bg-background p-2 text-xs focus:ring-1 focus:ring-primary"
        ></textarea>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onclick={() => (showAcceptModal = false)}>Annuler</Button>
        <Button
          class="bg-emerald-600 hover:bg-emerald-700 text-white"
          size="sm"
          disabled={isSubmitting}
          onclick={() => handleReviewAction('accept')}
        >
          Valider l'Approbation
        </Button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL AMENDER -->
{#if showAmendModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="w-full max-w-lg rounded-xl border bg-card p-6 shadow-xl space-y-4 text-xs">
      <div class="flex items-center gap-2 text-amber-600 font-bold text-sm">
        <Edit3 class="h-5 w-5" /> Amender la Clause Proposée
      </div>

      <div class="space-y-1.5">
        <label for="amend-content" class="font-bold text-foreground">Texte de la clause amendée :</label>
        <textarea
          id="amend-content"
          bind:value={amendedContent}
          rows="4"
          class="w-full rounded-md border border-input bg-background p-2 font-mono text-xs focus:ring-1 focus:ring-primary"
        ></textarea>
      </div>

      <div class="space-y-1.5">
        <label for="amend-reason" class="font-bold text-foreground">Motif de l'amendement :</label>
        <input
          id="amend-reason"
          type="text"
          bind:value={amendReason}
          placeholder="Précision technique, seuil corrigé..."
          class="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:ring-1 focus:ring-primary"
        />
      </div>

      <div class="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onclick={() => (showAmendModal = false)}>Annuler</Button>
        <Button
          class="bg-amber-600 hover:bg-amber-700 text-white"
          size="sm"
          disabled={isSubmitting || !amendedContent.trim()}
          onclick={() => handleReviewAction('amend')}
        >
          Enregistrer l'Amendement
        </Button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL REJETER -->
{#if showRejectModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl space-y-4 text-xs">
      <div class="flex items-center gap-2 text-destructive font-bold text-sm">
        <XCircle class="h-5 w-5" /> Rejeter le Candidat
      </div>

      <p class="text-muted-foreground">
        Conformément à la constitution d'Archinex, un rejet sans justification explicite est rigoureusement interdit.
      </p>

      <div class="space-y-1.5">
        <label for="reject-reason" class="font-bold text-foreground">Motif obligatoire de rejet :</label>
        <textarea
          id="reject-reason"
          bind:value={rejectReason}
          placeholder="Incompatibilité avec la doctrine, doublon non résolu, clauses non souveraines..."
          rows="3"
          class="w-full rounded-md border border-input bg-background p-2 text-xs focus:ring-1 focus:ring-primary"
        ></textarea>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onclick={() => (showRejectModal = false)}>Annuler</Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={isSubmitting || !rejectReason.trim()}
          onclick={() => handleReviewAction('reject')}
        >
          Confirmer le Rejet
        </Button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL ASSIGNER -->
{#if showAssignModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl space-y-4 text-xs">
      <div class="flex items-center gap-2 text-primary font-bold text-sm">
        <UserPlus class="h-5 w-5" /> Assigner l'Examen à un Pair
      </div>

      <div class="space-y-1.5">
        <label for="assign-handle" class="font-bold text-foreground">Handle de l'expert destinataire :</label>
        <input
          id="assign-handle"
          type="text"
          bind:value={assignHandle}
          placeholder="@sec-lead, @cloud-architect..."
          class="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:ring-1 focus:ring-primary font-mono"
        />
      </div>

      <div class="space-y-1.5">
        <label for="assign-reason" class="font-bold text-foreground">Motif de transfert :</label>
        <input
          id="assign-reason"
          type="text"
          bind:value={assignReason}
          placeholder="Expertise spécifique sur le composant..."
          class="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:ring-1 focus:ring-primary"
        />
      </div>

      <div class="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onclick={() => (showAssignModal = false)}>Annuler</Button>
        <Button
          size="sm"
          disabled={isSubmitting || !assignHandle.trim()}
          onclick={handleAssign}
        >
          Assigner
        </Button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL SOLLICITER AVIS -->
{#if showRequestReviewModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl space-y-4 text-xs">
      <div class="flex items-center gap-2 text-primary font-bold text-sm">
        <Clock class="h-5 w-5" /> Solliciter une Revue Complémentaire
      </div>

      <div class="space-y-1.5">
        <span class="font-bold text-foreground block">Type de sollicitation :</span>
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" value="second_review" bind:group={requestKind} />
            <span>2nd Avis Collégial</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" value="advice" bind:group={requestKind} />
            <span>Avis Consultatif</span>
          </label>
        </div>
      </div>

      <div class="space-y-1.5">
        <label for="request-recipient" class="font-bold text-foreground">Destinataire (Handle) :</label>
        <input
          id="request-recipient"
          type="text"
          bind:value={requestRecipient}
          placeholder="@peer-reviewer"
          class="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:ring-1 focus:ring-primary font-mono"
        />
      </div>

      <div class="space-y-1.5">
        <label for="request-message" class="font-bold text-foreground">Message d'accompagnement :</label>
        <textarea
          id="request-message"
          bind:value={requestMessage}
          placeholder="Merci de vérifier l'adéquation avec le guide d'hygiène ANSSI..."
          rows="3"
          class="w-full rounded-md border border-input bg-background p-2 text-xs focus:ring-1 focus:ring-primary"
        ></textarea>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onclick={() => (showRequestReviewModal = false)}>Annuler</Button>
        <Button
          size="sm"
          disabled={isSubmitting || !requestRecipient.trim() || !requestMessage.trim()}
          onclick={handleRequestReview}
        >
          Envoyer la Sollicitation
        </Button>
      </div>
    </div>
  </div>
{/if}
