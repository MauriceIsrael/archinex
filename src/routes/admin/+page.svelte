<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Button } from '$lib/components/ui/button';
  import { invalidateAll } from '$app/navigation';

  import Shield from 'lucide-svelte/icons/shield';
  import UserPlus from 'lucide-svelte/icons/user-plus';
  import Settings from 'lucide-svelte/icons/settings';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';
  import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';

  import AdminCreateAccountDialog from '$lib/components/admin/AdminCreateAccountDialog.svelte';
  import AdminAccountSheetDialog from '$lib/components/admin/AdminAccountSheetDialog.svelte';
  import type {
    CentralizedAccountRecord,
    UnlinkedOwnerItem
  } from '$lib/server/accountsAdmin';

  let { data } = $props();

  let createDialogOpen = $state(false);
  let presetUnlinkedOwner = $state<UnlinkedOwnerItem | null>(null);

  let sheetDialogOpen = $state(false);
  let selectedAccount = $state<CentralizedAccountRecord | null>(null);

  let copiedToken = $state<string | null>(null);

  function openCreateAccount(preset: UnlinkedOwnerItem | null = null) {
    presetUnlinkedOwner = preset;
    createDialogOpen = true;
  }

  function openAccountSheet(acc: CentralizedAccountRecord) {
    selectedAccount = acc;
    sheetDialogOpen = true;
  }

  async function copyInviteLink(token: string) {
    const url = `${window.location.origin}/invite?token=${token}`;
    await navigator.clipboard.writeText(url);
    copiedToken = token;
    setTimeout(() => {
      if (copiedToken === token) copiedToken = null;
    }, 2000);
  }

  async function handleDeleteAccount(acc: CentralizedAccountRecord) {
    if (!confirm(`Supprimer le compte de ${acc.name} (${acc.email}) ?`)) return;
    try {
      const res = await fetch(`/api/admin/accounts?id=${encodeURIComponent(acc.id)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await invalidateAll();
      }
    } catch (err) {
      console.error('Erreur lors de la suppression du compte :', err);
    }
  }

  const appRoleStyles: Record<string, string> = {
    admin: 'bg-primary/10 text-primary border-primary/25 font-semibold',
    user: 'bg-muted text-muted-foreground border-border'
  };

  const architectRoleShortLabels: Record<string, string> = {
    lead_architect: 'Lead Architect',
    infra_expert_architect: 'Infra / Réseau',
    security_architect: 'Sécurité NIS2',
    domain_architect: 'Métier',
    data_architect: 'Données & IA'
  };

  const statusBadgeStyles: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    pending_invitation: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    expired_invitation: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
    disabled: 'bg-muted text-muted-foreground border-border'
  };

  const statusLabels: Record<string, string> = {
    active: 'Actif',
    pending_invitation: 'Activation 7j en attente',
    expired_invitation: 'Lien expiré',
    disabled: 'Désactivé'
  };

  const kbRoleBadgeStyles: Record<string, string> = {
    'kb:review': 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
    'kb:evaluate': 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
    'kb:maintain': 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
    'kb:admin': 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20'
  };
</script>

<svelte:head>
  <title>Gestion des comptes & Gouvernance — Archinex</title>
</svelte:head>

<div class="flex-1 space-y-6 p-4 md:p-8 pt-6">
  <!-- En-tête de la page centralisée -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Shield class="h-5 w-5" />
      </div>
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Gestion centralisée des comptes</h1>
        <p class="text-sm text-muted-foreground">
          Comptes utilisateurs, rôles applicatifs, rôles par espace de délibération et identités dans le registre LLMOps.
        </p>
      </div>
    </div>

    <Button onclick={() => openCreateAccount(null)} class="gap-1.5">
      <UserPlus class="h-4 w-4" />
      <span>Nouveau compte</span>
    </Button>
  </div>

  <!-- Bandeau d'alerte si des responsables du registre LLMOps n'ont pas d'adresse e-mail ou de compte -->
  {#if (data.unlinkedOwners ?? []).length > 0}
    <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
      <div class="flex items-start gap-2.5">
        <AlertTriangle class="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div class="space-y-1">
          <h3 class="text-sm font-semibold text-foreground">
            Responsables du registre LLMOps sans compte ou sans adresse e-mail ({data.unlinkedOwners.length})
          </h3>
          <p class="text-xs text-muted-foreground">
            Ces handles figurent dans le registre des responsables de LLMOps mais n'ont pas d'adresse e-mail associée ou pas de compte Archinex actif. Cliquez sur un responsable pour créer ou associer le compte correspondant :
          </p>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 pl-7">
        {#each data.unlinkedOwners as uo (uo.handle)}
          <div class="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-background px-3 py-1.5 text-xs">
            <code class="font-mono font-semibold text-primary">{uo.handle}</code>
            {#if uo.domains.length > 0}
              <span class="text-muted-foreground">({uo.domains.join(', ')})</span>
            {/if}
            <span class="text-[10px] rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5">
              {uo.reason === 'missing_email_in_llmops' ? 'Sans e-mail dans LLMOps' : `Sans compte (${uo.email})`}
            </span>
            <Button
              size="sm"
              variant="secondary"
              class="h-6 px-2 text-[11px]"
              onclick={() => openCreateAccount(uo)}
            >
              Associer / Créer
            </Button>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <Tabs.Root value="accounts" class="space-y-6">
    <Tabs.List>
      <Tabs.Trigger value="accounts">
        Comptes & Rôles ({data.accounts?.length ?? 0})
      </Tabs.Trigger>
      <Tabs.Trigger value="domains">
        Couverture par domaine & Registre LLMOps ({data.domainsOverview?.length ?? 0})
      </Tabs.Trigger>
    </Tabs.List>

    <!-- ONGLET 1 : TABLEAU CENTRALISÉ DES COMPTES (4 VOLETS PAR PERSONNE) -->
    <Tabs.Content value="accounts" class="space-y-4">
      <Card.Root>
        <Card.Header class="pb-3">
          <Card.Title class="text-base">Comptes et habilitations par personne</Card.Title>
          <Card.Description class="text-xs">
            Chaque ligne regroupe les quatre volets d'une personne : son compte, son rôle applicatif, ses rôles dans les espaces de travail et son identité dans LLMOps.
          </Card.Description>
        </Card.Header>
        <Card.Content class="p-0">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b bg-muted/40 text-left text-muted-foreground text-xs">
                  <th class="py-3 px-4 font-medium">1. Compte & Statut</th>
                  <th class="py-3 px-4 font-medium">2. Rôle applicatif</th>
                  <th class="py-3 px-4 font-medium">3. Rôles par espace</th>
                  <th class="py-3 px-4 font-medium">4. Identité LLMOps (KB)</th>
                  <th class="py-3 px-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                {#if (data.accounts ?? []).length === 0}
                  <tr>
                    <td colspan="5" class="py-8 text-center text-xs text-muted-foreground">
                      Aucun compte enregistré. Cliquez sur « Nouveau compte » pour commencer.
                    </td>
                  </tr>
                {:else}
                  {#each data.accounts as acc (acc.id)}
                    <tr class="hover:bg-muted/20 transition-colors align-top">
                      <!-- 1. Compte -->
                      <td class="py-3 px-4">
                        <div class="font-medium text-foreground">{acc.name}</div>
                        <div class="text-xs text-muted-foreground font-mono">{acc.email}</div>
                        <div class="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium {statusBadgeStyles[acc.invitationStatus] || statusBadgeStyles.disabled}">
                            {statusLabels[acc.invitationStatus] || acc.invitationStatus}
                          </span>
                          {#if acc.invitationToken && acc.invitationStatus === 'pending_invitation'}
                            <button
                              type="button"
                              onclick={() => copyInviteLink(acc.invitationToken!)}
                              class="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-[10px] hover:bg-muted cursor-pointer"
                              title="Copier le lien d'activation à usage unique"
                            >
                              {#if copiedToken === acc.invitationToken}
                                <Check class="h-3 w-3 text-emerald-600" />
                                <span class="text-emerald-600 font-semibold">Copié</span>
                              {:else}
                                <Copy class="h-3 w-3 text-muted-foreground" />
                                <span>Copier lien 7j</span>
                              {/if}
                            </button>
                          {/if}
                        </div>
                      </td>

                      <!-- 2. Rôle applicatif -->
                      <td class="py-3 px-4">
                        <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs {appRoleStyles[acc.role] || appRoleStyles.user}">
                          {acc.role === 'admin' ? 'Admin' : 'Utilisateur'}
                        </span>
                      </td>

                      <!-- 3. Rôles par espace -->
                      <td class="py-3 px-4">
                        {#if acc.workspaceRoles.length === 0}
                          <span class="text-xs text-muted-foreground italic">Aucun espace attribué</span>
                        {:else}
                          <div class="flex flex-wrap gap-1">
                            {#each acc.workspaceRoles as wr (wr.engagementId)}
                              <span
                                class="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-[11px]"
                                title={wr.engagementTitle}
                              >
                                <strong class="font-mono text-primary">{wr.engagementShortName}</strong>
                                <span class="text-muted-foreground">:</span>
                                <span>{architectRoleShortLabels[wr.role] || wr.role}</span>
                              </span>
                            {/each}
                          </div>
                        {/if}
                      </td>

                      <!-- 4. Identité LLMOps -->
                      <td class="py-3 px-4">
                        {#if acc.llmopsIdentity.status === 'none'}
                          <span class="text-xs text-muted-foreground italic">Non habilité KB</span>
                        {:else}
                          <div class="space-y-1">
                            <div class="flex items-center gap-1.5 flex-wrap">
                              {#if acc.llmopsIdentity.handle}
                                <code class="text-xs font-mono font-semibold text-primary">
                                  {acc.llmopsIdentity.handle}
                                </code>
                              {/if}
                              {#if acc.llmopsIdentity.status === 'synced'}
                                <span class="inline-flex items-center gap-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 text-[10px] font-medium">
                                  <CheckCircle2 class="h-3 w-3" /> Synchronisé LLMOps
                                </span>
                              {:else if acc.llmopsIdentity.status === 'email_unknown'}
                                <span class="inline-flex items-center gap-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-medium">
                                  <AlertTriangle class="h-3 w-3" /> Adresse inconnue de LLMOps
                                </span>
                              {:else if acc.llmopsIdentity.status === 'handle_without_email'}
                                <span class="inline-flex items-center gap-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-medium">
                                  <AlertTriangle class="h-3 w-3" /> Handle sans e-mail dans LLMOps
                                </span>
                              {:else if acc.llmopsIdentity.status === 'drift'}
                                <span class="inline-flex items-center gap-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-medium">
                                  <AlertTriangle class="h-3 w-3" /> Écart avec LLMOps
                                </span>
                              {:else if acc.llmopsIdentity.status === 'offline'}
                                <span class="inline-flex items-center gap-1 rounded bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px]">
                                  LLMOps hors-ligne
                                </span>
                              {/if}
                            </div>

                            <div class="flex flex-wrap gap-1">
                              {#each acc.llmopsIdentity.roles as r}
                                <span class="inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] {kbRoleBadgeStyles[r] || 'bg-muted'}">
                                  {r}
                                </span>
                              {/each}
                            </div>

                            {#if acc.llmopsIdentity.domains.length > 0}
                              <div class="flex flex-wrap gap-1 pt-0.5">
                                {#each acc.llmopsIdentity.domains as dom}
                                  <span class="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                    {dom}
                                  </span>
                                {/each}
                              </div>
                            {/if}
                          </div>
                        {/if}
                      </td>

                      <!-- Actions -->
                      <td class="py-3 px-4 text-right">
                        <div class="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            class="h-8 gap-1.5 text-xs"
                            onclick={() => openAccountSheet(acc)}
                          >
                            <Settings class="h-3.5 w-3.5" />
                            <span>Fiche</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Supprimer ce compte"
                            class="hover:text-destructive"
                            onclick={() => handleDeleteAccount(acc)}
                          >
                            <Trash2 class="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>
        </Card.Content>
      </Card.Root>
    </Tabs.Content>

    <!-- ONGLET 2 : VUE D'ENSEMBLE PAR DOMAINE & REGISTRE LLMOPS -->
    <Tabs.Content value="domains" class="space-y-4">
      <Card.Root>
        <Card.Header class="pb-3">
          <Card.Title class="text-base">Qui peut relire chaque domaine de la base de connaissances ?</Card.Title>
          <Card.Description class="text-xs">
            Vue d'ensemble issue du registre des responsables LLMOps (<code>GET /api/knowledge/owners</code>) croisée avec les comptes Archinex.
          </Card.Description>
        </Card.Header>
        <Card.Content class="p-0">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b bg-muted/40 text-left text-muted-foreground text-xs">
                  <th class="py-3 px-4 font-medium">Domaine KB</th>
                  <th class="py-3 px-4 font-medium">Handle responsable</th>
                  <th class="py-3 px-4 font-medium">Rôles KB</th>
                  <th class="py-3 px-4 font-medium">Adresse e-mail dans LLMOps</th>
                  <th class="py-3 px-4 font-medium">Compte Archinex associé</th>
                  <th class="py-3 px-4 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                {#if (data.domainsOverview ?? []).length === 0}
                  <tr>
                    <td colspan="6" class="py-8 text-center text-xs text-muted-foreground">
                      {data.ownersRegistry?.offline
                        ? 'Serveur LLMOps hors-ligne : registre des domaines indisponible.'
                        : 'Aucun domaine configuré dans le registre LLMOps.'}
                    </td>
                  </tr>
                {:else}
                  {#each data.domainsOverview as item (item.domain)}
                    <tr class="hover:bg-muted/20 transition-colors">
                      <td class="py-3 px-4 font-mono text-xs font-semibold">{item.domain}</td>
                      <td class="py-3 px-4">
                        <code class="text-xs font-mono text-primary font-semibold">{item.ownerHandle}</code>
                      </td>
                      <td class="py-3 px-4">
                        <div class="flex flex-wrap gap-1">
                          {#each item.ownerRoles as r}
                            <span class="inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] {kbRoleBadgeStyles[r] || 'bg-muted'}">
                              {r}
                            </span>
                          {/each}
                        </div>
                      </td>
                      <td class="py-3 px-4 text-xs">
                        {#if item.ownerEmail}
                          <span class="font-mono text-foreground">{item.ownerEmail}</span>
                        {:else}
                          <span class="inline-flex items-center gap-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">
                            <AlertTriangle class="h-3 w-3" /> Aucune adresse e-mail
                          </span>
                        {/if}
                      </td>
                      <td class="py-3 px-4 text-xs">
                        {#if item.hasAccount}
                          <span class="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-medium">
                            <CheckCircle2 class="h-3.5 w-3.5" /> {item.linkedUserName}
                          </span>
                        {:else}
                          <span class="text-muted-foreground italic">Aucun compte lié</span>
                        {/if}
                      </td>
                      <td class="py-3 px-4 text-right">
                        {#if !item.hasAccount || !item.hasEmailInLlmops}
                          <Button
                            size="sm"
                            variant="outline"
                            class="h-7 text-xs"
                            onclick={() =>
                              openCreateAccount({
                                handle: item.ownerHandle,
                                email: item.ownerEmail,
                                roles: item.ownerRoles,
                                domains: [item.domain],
                                delegated: false,
                                reason: item.ownerEmail ? 'no_archinex_account' : 'missing_email_in_llmops'
                              })}
                          >
                            Associer un compte
                          </Button>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>
        </Card.Content>
      </Card.Root>
    </Tabs.Content>
  </Tabs.Root>
</div>

<AdminCreateAccountDialog
  bind:open={createDialogOpen}
  workspaces={data.workspaces ?? []}
  ownersRegistry={data.ownersRegistry ?? { owners: [], total: 0 }}
  unlinkedOwners={data.unlinkedOwners ?? []}
  presetOwner={presetUnlinkedOwner}
  onCreated={() => invalidateAll()}
/>

<AdminAccountSheetDialog
  bind:open={sheetDialogOpen}
  account={selectedAccount}
  workspaces={data.workspaces ?? []}
  unlinkedOwners={data.unlinkedOwners ?? []}
  onUpdated={() => invalidateAll()}
/>

