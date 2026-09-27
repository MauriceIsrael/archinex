<script lang="ts">
  import { onMount } from 'svelte';
  import * as Table from '$lib/components/ui/table';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { t } from 'svelte-i18n';
  import { dashboardStore } from '$lib/dashboard/widgetStore.svelte';
  import StatWidget from '$lib/dashboard/widgets/StatWidget.svelte';
  import InviteExpertDialog from '$lib/components/deliberation/InviteExpertDialog.svelte';
  import type { InvitationRecord } from '$lib/types/invitation';
  import {
    Users,
    UserPlus,
    Mail,
    Copy,
    Check,
    Trash2,
    Clock,
    ShieldCheck,
    CheckCircle2,
    AlertCircle
  } from 'lucide-svelte';

  // Real users data for the /users page
  const users = [
    { id: '1', name: 'Alice Johnson', email: 'alice@example.com', role: 'Admin', status: 'Active' },
    { id: '2', name: 'Bob Smith', email: 'bob@example.com', role: 'User', status: 'Active' },
    { id: '3', name: 'Charlie Brown', email: 'charlie@example.com', role: 'User', status: 'Inactive' },
    { id: '4', name: 'Diana Prince', email: 'diana@example.com', role: 'Admin', status: 'Active' },
    { id: '5', name: 'Edward Norton', email: 'edward@example.com', role: 'User', status: 'Pending' },
  ];

  let isInviteOpen = $state(false);
  let invitations = $state<InvitationRecord[]>([]);
  let isLoadingInvitations = $state(false);
  let copiedToken = $state<string | null>(null);

  const roleLabels: Record<string, string> = {
    lead_architect: 'Lead Architect',
    infra_expert_architect: 'Architecte Infra / Réseau',
    security_architect: 'Architecte Sécurité NIS2',
    domain_architect: 'Architecte Métier',
    data_architect: 'Architecte Données'
  };

  async function loadInvitations() {
    isLoadingInvitations = true;
    try {
      const res = await fetch('/api/invite');
      if (res.ok) {
        const data = await res.json();
        invitations = data.invitations || [];
      }
    } catch (err) {
      console.error('Failed to load invitations:', err);
    } finally {
      isLoadingInvitations = false;
    }
  }

  async function revokeInvitation(id: string) {
    if (!confirm('Voulez-vous vraiment révoquer cette invitation ?')) return;
    try {
      const res = await fetch(`/api/invite?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        invitations = invitations.filter((inv) => inv.id !== id);
      }
    } catch (err) {
      console.error('Failed to revoke invitation:', err);
    }
  }

  async function copyInviteLink(token: string) {
    const url = `${window.location.origin}/invite?token=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      copiedToken = token;
      setTimeout(() => {
        if (copiedToken === token) copiedToken = null;
      }, 2500);
    } catch {
      // fallback
    }
  }

  onMount(() => {
    loadInvitations();
  });

  function addDashboardWidget() {
    dashboardStore.addWidget({
      id: 'stat-total-users',
      type: 'stat',
      title: 'Total Users',
      defaultSize: 'sm',
      component: StatWidget,
      props: { value: (users.length + invitations.filter((i) => i.status === 'accepted').length).toString(), trend: 'neutral', icon: Users }
    });
    alert('Widget Added to Dashboard!');
  }
</script>

<div class="flex-1 space-y-6 p-4 md:p-8 pt-6">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <div class="flex items-center gap-2.5">
        <h2 class="text-3xl font-bold tracking-tight">{$t('users.title')}</h2>
        <span class="inline-flex items-center gap-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 px-2.5 py-0.5 text-xs font-semibold">
          <ShieldCheck class="h-3.5 w-3.5" />
          Accès Souverain
        </span>
      </div>
      <p class="text-sm text-muted-foreground mt-1">
        Gestion des comptes membres et invitation d'experts aux espaces de délibération architecturale
      </p>
    </div>
    <div class="flex items-center gap-2">
      <Button variant="outline" onclick={addDashboardWidget}>
        Add to Dashboard
      </Button>
      <Button
        onclick={() => (isInviteOpen = true)}
        class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 cursor-pointer shadow-sm"
      >
        <UserPlus class="h-4 w-4" />
        <span>Inviter un Expert</span>
      </Button>
    </div>
  </div>

  <!-- Section 1 : Invitations en attente & experts invités -->
  <Card.Root class="border-emerald-500/20 bg-linear-to-b from-card to-emerald-500/5 shadow-xs">
    <Card.Header class="pb-3">
      <div class="flex items-center justify-between">
        <div class="space-y-1">
          <Card.Title class="text-base flex items-center gap-2 text-foreground font-bold">
            <Mail class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Invitations d'Experts par Email & Accès Directs
          </Card.Title>
          <Card.Description class="text-xs">
            Les experts reçoivent un lien sécurisé permettant d'activer leur compte immédiatement s'ils n'en possèdent pas encore.
          </Card.Description>
        </div>
        <Button
          variant="outline"
          size="sm"
          onclick={loadInvitations}
          class="text-xs h-8"
        >
          Rafraîchir
        </Button>
      </div>
    </Card.Header>
    <Card.Content>
      {#if isLoadingInvitations}
        <div class="p-6 text-center text-xs text-muted-foreground">
          Chargement des invitations...
        </div>
      {:else if invitations.length === 0}
        <div class="p-8 text-center border rounded-xl bg-background/50 space-y-2">
          <Mail class="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
          <p class="text-xs text-muted-foreground">Aucune invitation envoyée pour le moment.</p>
          <Button
            size="sm"
            onclick={() => (isInviteOpen = true)}
            class="mt-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <UserPlus class="h-3.5 w-3.5 mr-1" />
            Envoyer une première invitation
          </Button>
        </div>
      {:else}
        <div class="rounded-xl border bg-background overflow-hidden">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Expert Destinataire</Table.Head>
                <Table.Head>Rôle d'Architecture</Table.Head>
                <Table.Head>Projet Associé</Table.Head>
                <Table.Head>Statut</Table.Head>
                <Table.Head>Date d'envoi</Table.Head>
                <Table.Head class="text-right">Actions</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each invitations as inv (inv.id)}
                <Table.Row>
                  <Table.Cell>
                    <div class="font-medium text-xs text-foreground">{inv.name || 'Expert Invité'}</div>
                    <div class="text-[11px] text-muted-foreground font-mono">{inv.email}</div>
                  </Table.Cell>
                  <Table.Cell>
                    <span class="rounded bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[11px] font-semibold">
                      {roleLabels[inv.expertRole] || inv.expertRole}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <div class="text-xs font-semibold text-foreground">{inv.projectName || inv.projectId || 'Espace Global'}</div>
                    <div class="text-[10px] text-muted-foreground">Par {inv.invitedBy}</div>
                  </Table.Cell>
                  <Table.Cell>
                    {#if inv.status === 'accepted'}
                      <span class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold">
                        <CheckCircle2 class="h-3 w-3" />
                        Compte activé
                      </span>
                    {:else if inv.status === 'pending'}
                      <span class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold">
                        <Clock class="h-3 w-3" />
                        En attente
                      </span>
                    {:else}
                      <span class="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-medium">
                        {inv.status}
                      </span>
                    {/if}
                  </Table.Cell>
                  <Table.Cell class="text-xs text-muted-foreground">
                    {new Date(inv.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Table.Cell>
                  <Table.Cell class="text-right">
                    <div class="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onclick={() => copyInviteLink(inv.token)}
                        class="h-7 text-[11px] gap-1 px-2"
                        title="Copier le lien d'activation"
                      >
                        {#if copiedToken === inv.token}
                          <Check class="h-3 w-3 text-emerald-600" />
                          <span class="text-emerald-600 font-bold">Copié</span>
                        {:else}
                          <Copy class="h-3 w-3" />
                          <span>Lien</span>
                        {/if}
                      </Button>
                      <button
                        type="button"
                        onclick={() => revokeInvitation(inv.id)}
                        class="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-muted transition-colors cursor-pointer"
                        title="Révoquer l'invitation"
                      >
                        <Trash2 class="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
      {/if}
    </Card.Content>
  </Card.Root>

  <!-- Section 2 : Utilisateurs déjà enregistrés -->
  <Card.Root>
    <Card.Header>
      <Card.Title>{$t('users.title')}</Card.Title>
      <Card.Description>{$t('admin.users.desc', { values: { count: users.length } })}</Card.Description>
    </Card.Header>
    <Card.Content>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head class="w-[100px]">ID</Table.Head>
            <Table.Head>{$t('settings.profile.username')}</Table.Head>
            <Table.Head>{$t('settings.profile.email')}</Table.Head>
            <Table.Head>Role</Table.Head>
            <Table.Head class="text-right">Status</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each users as user (user.id)}
            <Table.Row>
              <Table.Cell class="font-medium">{user.id}</Table.Cell>
              <Table.Cell>{user.name}</Table.Cell>
              <Table.Cell>{user.email}</Table.Cell>
              <Table.Cell>{user.role}</Table.Cell>
              <Table.Cell class="text-right">
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                  {user.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}">
                  {user.status}
                </span>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </Card.Content>
  </Card.Root>
</div>

<InviteExpertDialog
  bind:open={isInviteOpen}
  onclose={() => (isInviteOpen = false)}
  onInvited={() => {
    loadInvitations();
  }}
/>
