<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import Inbox from 'lucide-svelte/icons/inbox';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import Clock from 'lucide-svelte/icons/clock';
  import Shield from 'lucide-svelte/icons/shield';
  import CheckCircle from 'lucide-svelte/icons/check-circle';
  import Bell from 'lucide-svelte/icons/bell';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import Filter from 'lucide-svelte/icons/filter';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Lock from 'lucide-svelte/icons/lock';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import { invalidateAll } from '$app/navigation';

  let { data } = $props();

  let selectedDomain = $state<string>('all');
  let selectedKind = $state<string>('all');
  let showOverdueOnly = $state<boolean>(false);
  let isPolling = $state<boolean>(false);
  let showNotifications = $state<boolean>(false);

  // Filtrage réactif
  let filteredItems = $derived(
    data.inbox.items.filter((item: any) => {
      if (selectedDomain !== 'all' && item.domain.toLowerCase() !== selectedDomain.toLowerCase()) {
        return false;
      }
      if (selectedKind !== 'all' && item.kind.toLowerCase() !== selectedKind.toLowerCase()) {
        return false;
      }
      if (showOverdueOnly && !item.is_overdue) {
        return false;
      }
      return true;
    })
  );

  let overdueCount = $derived(data.inbox.items.filter((i: any) => i.is_overdue).length);
  let unreadNotificationsCount = $derived(data.notifications.filter((n: any) => !n.read).length);

  async function triggerPoll() {
    isPolling = true;
    try {
      await fetch('/api/knowledge/notifications/poll', { method: 'POST' });
      await invalidateAll();
    } finally {
      isPolling = false;
    }
  }

  async function markNotificationRead(id: string) {
    await fetch('/api/knowledge/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    await invalidateAll();
  }

  async function markAllNotificationsRead() {
    await fetch('/api/knowledge/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true })
    });
    await invalidateAll();
  }

  function getKindLabel(kind: string): { label: string; class: string } {
    switch (kind) {
      case 'principle':
        return {
          label: 'Principe Fondamental (Double-Avis)',
          class: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 font-semibold'
        };
      case 'new_asset':
        return {
          label: 'Nouvelle Clause Doctrinale',
          class: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
        };
      case 'amendment':
        return {
          label: 'Amendement de Règle',
          class: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
        };
      case 'rex':
        return {
          label: 'Retour d’Expérience (REX)',
          class: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30'
        };
      default:
        return {
          label: kind,
          class: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30'
        };
    }
  }

  function getReasonBadge(reason: string): { label: string; class: string } {
    switch (reason) {
      case 'second_review':
        return {
          label: '2nd Avis Collégial Exigé',
          class: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 font-medium'
        };
      case 'advice':
        return {
          label: 'Sollicitation d’Avis',
          class: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30'
        };
      default:
        return {
          label: 'Examen Initial',
          class: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30'
        };
    }
  }
</script>

<svelte:head>
  <title>Boîte de Revue Experte — Archinex</title>
</svelte:head>

<div class="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-6xl mx-auto">
  <!-- Header principal -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
    <div class="flex items-center gap-3">
      <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Inbox class="h-6 w-6" />
      </div>
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Boîte de Réception des Revues KB</h1>
        <p class="text-xs text-muted-foreground font-mono flex items-center gap-2">
          <span>Expert : <strong class="text-foreground">{data.user.email}</strong></span>
          <span>•</span>
          <span>Handle : <code class="text-primary font-bold">{data.expert.kbHandle}</code></span>
        </p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <!-- Bouton Notifications -->
      <div class="relative">
        <Button
          variant="outline"
          size="sm"
          class="relative gap-2"
          onclick={() => (showNotifications = !showNotifications)}
        >
          <Bell class="h-4 w-4" />
          <span class="hidden sm:inline">Notifications</span>
          {#if unreadNotificationsCount > 0}
            <span class="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-destructive rounded-full">
              {unreadNotificationsCount}
            </span>
          {/if}
        </Button>

        <!-- Dropdown Notifications -->
        {#if showNotifications}
          <div class="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border bg-card p-4 shadow-xl z-50 text-xs">
            <div class="flex items-center justify-between pb-2 border-b mb-3">
              <span class="font-bold text-sm">Notifications de Gouvernance</span>
              {#if unreadNotificationsCount > 0}
                <button
                  class="text-primary hover:underline text-[11px]"
                  onclick={markAllNotificationsRead}
                >
                  Tout marquer comme lu
                </button>
              {/if}
            </div>

            <div class="space-y-2 max-h-80 overflow-y-auto pr-1">
              {#if data.notifications.length === 0}
                <p class="text-center py-4 text-muted-foreground italic">Aucune notification</p>
              {:else}
                {#each data.notifications as notif}
                  <div
                    class="p-2.5 rounded-lg border transition-colors {notif.read ? 'bg-muted/30 text-muted-foreground' : 'bg-primary/5 border-primary/20 text-foreground font-medium'}"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <span class="font-semibold text-xs">{notif.title}</span>
                      {#if !notif.read}
                        <button
                          class="text-primary hover:text-primary/80"
                          title="Marquer lu"
                          onclick={() => markNotificationRead(notif.id)}
                        >
                          <CheckCircle class="h-3.5 w-3.5" />
                        </button>
                      {/if}
                    </div>
                    <p class="text-[11px] mt-1 leading-snug">{notif.message}</p>
                    <span class="text-[10px] text-muted-foreground block mt-1">
                      {new Date(notif.createdAt).toLocaleString('fr-FR')}
                    </span>
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Bouton Synchronisation / Polling -->
      <Button
        variant="outline"
        size="sm"
        disabled={isPolling}
        onclick={triggerPoll}
        class="gap-1.5"
      >
        <RefreshCw class="h-3.5 w-3.5 {isPolling ? 'animate-spin' : ''}" />
        <span>Actualiser</span>
      </Button>

      <Button variant="secondary" size="sm" href="/kb/me">
        Mon Profil KB
      </Button>
    </div>
  </div>

  <!-- Alerte dégradation souveraine si hors-ligne -->
  {#if data.inbox.offline}
    <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-3">
      <Lock class="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
      <div>
        <h4 class="font-bold text-sm">Mode Hors-Ligne ou Service LLMOps Indisponible (503)</h4>
        <p class="mt-0.5">
          Le Knowledge Hub distant n'est pas joignable. Les revues en attente s'affichent en mode lecture dégradé. Les arbitrages en ligne seront synchronisés dès reconnexion de l'enclave souveraine.
        </p>
      </div>
    </div>
  {/if}

  <!-- Alertes retards (Porte G5) -->
  {#if overdueCount > 0}
    <div class="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive flex items-center justify-between">
      <div class="flex items-center gap-3">
        <AlertTriangle class="h-5 w-5 shrink-0" />
        <div>
          <strong class="font-bold text-sm">{overdueCount} revue(s) en retard (&ge; 5 jours ouvrés)</strong>
          <p class="text-xs text-muted-foreground mt-0.5">
            Ces candidats attendent un verdict prioritaire pour débloquer les projets d'architecture dépendants.
          </p>
        </div>
      </div>
      <Button
        variant={showOverdueOnly ? 'default' : 'outline'}
        size="sm"
        onclick={() => (showOverdueOnly = !showOverdueOnly)}
      >
        {showOverdueOnly ? 'Afficher tout' : 'Voir les retards'}
      </Button>
    </div>
  {/if}

  <!-- Barre de Filtres -->
  <Card.Root>
    <Card.Content class="p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-1.5 font-medium text-muted-foreground">
          <Filter class="h-3.5 w-3.5" /> Filtrer :
        </div>

        <!-- Filtre Domaine -->
        <select
          bind:value={selectedDomain}
          class="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs focus:ring-1 focus:ring-primary"
        >
          <option value="all">Tous les domaines</option>
          {#each data.expert.ownedDomains as dom}
            <option value={dom}>{dom} (attribué)</option>
          {/each}
          <option value="security">security</option>
          <option value="cloud">cloud</option>
          <option value="architecture">architecture</option>
          <option value="data">data</option>
        </select>

        <!-- Filtre Type d'actif -->
        <select
          bind:value={selectedKind}
          class="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs focus:ring-1 focus:ring-primary"
        >
          <option value="all">Tous les types d'actifs</option>
          <option value="principle">Principes Fondamentaux</option>
          <option value="new_asset">Nouvelles Clauses</option>
          <option value="amendment">Amendements</option>
          <option value="rex">Retours d'Expérience</option>
        </select>

        <label class="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            bind:checked={showOverdueOnly}
            class="h-3.5 w-3.5 rounded border-input"
          />
          <span class="text-xs {showOverdueOnly ? 'font-bold text-destructive' : 'text-muted-foreground'}">
            Retards uniquement
          </span>
        </label>
      </div>

      <div class="text-xs text-muted-foreground">
        <span>{filteredItems.length} candidat(s) affiché(s)</span>
      </div>
    </Card.Content>
  </Card.Root>

  <!-- Liste des Candidats en Attente -->
  <div class="space-y-3">
    {#if filteredItems.length === 0}
      <Card.Root>
        <Card.Content class="py-12 text-center space-y-3">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted mx-auto text-muted-foreground">
            <CheckCircle class="h-6 w-6" />
          </div>
          <h3 class="font-bold text-base">Boîte de revue à jour</h3>
          <p class="text-xs text-muted-foreground max-w-md mx-auto">
            Aucun candidat en attente d'examen ne correspond à vos filtres actuels. Dès qu'un projet ou un architecte soumet une clause dans vos domaines, elle apparaîtra ici.
          </p>
        </Card.Content>
      </Card.Root>
    {:else}
      {#each filteredItems as item}
        {@const kindInfo = getKindLabel(item.kind)}
        {@const reasonInfo = getReasonBadge(item.reason)}
        <div
          class="rounded-xl border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm space-y-3 {item.is_overdue ? 'border-destructive/40 bg-destructive/5' : ''}"
        >
          <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div class="space-y-1.5 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <!-- Badge Type -->
                <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] {kindInfo.class}">
                  {kindInfo.label}
                </span>

                <!-- Badge Domaine -->
                <span class="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-mono text-primary font-bold">
                  <Shield class="h-3 w-3" /> {item.domain}
                </span>

                <!-- Badge Raison -->
                <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] {reasonInfo.class}">
                  {reasonInfo.label}
                </span>

                <!-- Badge Overdue -->
                {#if item.is_overdue}
                  <span class="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/20 px-2.5 py-0.5 text-[11px] font-bold text-destructive animate-pulse">
                    <Clock class="h-3 w-3" /> En Retard (Échéance dépassée)
                  </span>
                {/if}
              </div>

              <!-- Titre -->
              <h3 class="text-base font-bold text-foreground">
                {item.title}
              </h3>

              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Auteur : <strong class="text-foreground">{item.author}</strong></span>
                <span>•</span>
                <span>En attente depuis : {new Date(item.waiting_since).toLocaleDateString('fr-FR')}</span>
                <span>•</span>
                <span class="{item.is_overdue ? 'font-bold text-destructive' : ''}">
                  Échéance : {new Date(item.due_at).toLocaleDateString('fr-FR')}
                </span>
              </div>
            </div>

            <!-- Action bouton examen -->
            <div class="sm:self-center">
              <Button
                variant={item.is_overdue ? 'destructive' : 'default'}
                size="sm"
                href="/kb/reviews/{item.candidate_id}"
                class="gap-1.5 w-full sm:w-auto"
              >
                <span>Examiner</span>
                <ArrowRight class="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
