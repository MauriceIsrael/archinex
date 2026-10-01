<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import UserPlus from 'lucide-svelte/icons/user-plus';
  import Shield from 'lucide-svelte/icons/shield';
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';
  import Settings from 'lucide-svelte/icons/settings';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Key from 'lucide-svelte/icons/key';
  import AdminInviteExpertDialog from './AdminInviteExpertDialog.svelte';
  import AdminEditExpertDialog from './AdminEditExpertDialog.svelte';
  import type { KbExpertRecord } from '$lib/server/kbProfilesDb';
  import { invalidateAll } from '$app/navigation';

  let { experts = [] } = $props<{
    experts: KbExpertRecord[];
  }>();

  let inviteDialogOpen = $state(false);
  let editDialogOpen = $state(false);
  let selectedExpert = $state<KbExpertRecord | null>(null);
  let copiedToken = $state<string | null>(null);

  function openEdit(expert: KbExpertRecord) {
    selectedExpert = expert;
    editDialogOpen = true;
  }

  async function copyInviteLink(token: string) {
    const url = `${window.location.origin}/invite?token=${token}`;
    await navigator.clipboard.writeText(url);
    copiedToken = token;
    setTimeout(() => {
      if (copiedToken === token) copiedToken = null;
    }, 2000);
  }

  async function handleDelete(expert: KbExpertRecord) {
    if (!confirm(`Supprimer l'expert ${expert.name} (${expert.kbHandle}) ?`)) return;

    try {
      const res = await fetch(`/api/admin/experts/${expert.id}`, { method: 'DELETE' });
      if (res.ok) {
        await invalidateAll();
      }
    } catch (err) {
      console.error('Erreur suppression :', err);
    }
  }

  const roleBadgeStyles: Record<string, string> = {
    'kb:review': 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 font-mono text-[10px]',
    'kb:evaluate': 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20 font-mono text-[10px]',
    'kb:maintain': 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 font-mono text-[10px]',
    'kb:admin': 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20 font-mono text-[10px]'
  };

  const statusBadgeStyles = {
    active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    pending_invitation: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    expired_invitation: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
    disabled: 'bg-muted text-muted-foreground border-border'
  };

  const statusLabels = {
    active: 'Actif',
    pending_invitation: 'En attente (7j)',
    expired_invitation: 'Expiré',
    disabled: 'Désactivé'
  };
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-base font-semibold">Gouvernance des Experts Knowledge Hub</h3>
      <p class="text-xs text-muted-foreground">
        Comptes habilités aux rôles doctrinaux (kb:review, kb:evaluate, kb:maintain, kb:admin) avec propagation d'identité souveraine.
      </p>
    </div>
    <Button onclick={() => { inviteDialogOpen = true; }} size="sm" class="gap-1.5">
      <UserPlus class="h-4 w-4" /> Inviter un expert
    </Button>
  </div>

  <Card.Root>
    <Card.Content class="p-0">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b bg-muted/40 text-left text-muted-foreground">
              <th class="py-3 px-4 font-medium">Expert / Handle</th>
              <th class="py-3 px-4 font-medium">Email</th>
              <th class="py-3 px-4 font-medium">Rôles KB</th>
              <th class="py-3 px-4 font-medium">Domaines</th>
              <th class="py-3 px-4 font-medium">Statut</th>
              <th class="py-3 px-4 font-medium">LLMOps</th>
              <th class="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            {#if experts.length === 0}
              <tr>
                <td colspan="7" class="py-8 text-center text-xs text-muted-foreground">
                  Aucun expert KB configuré. Cliquez sur « Inviter un expert » pour amorcer la gouvernance.
                </td>
              </tr>
            {:else}
              {#each experts as expert}
                <tr class="hover:bg-muted/20 transition-colors">
                  <td class="py-3 px-4">
                    <div class="font-medium text-foreground">{expert.name}</div>
                    <code class="text-xs text-primary font-mono">{expert.kbHandle}</code>
                  </td>
                  <td class="py-3 px-4 text-xs text-muted-foreground">
                    {expert.email}
                  </td>
                  <td class="py-3 px-4">
                    <div class="flex flex-wrap gap-1">
                      {#each expert.kbRoles as role}
                        <span class="inline-flex items-center px-1.5 py-0.5 rounded border {roleBadgeStyles[role] || 'bg-muted'}">
                          {role}
                        </span>
                      {/each}
                    </div>
                  </td>
                  <td class="py-3 px-4">
                    <div class="flex flex-wrap gap-1">
                      {#if expert.ownedDomains.length === 0}
                        <span class="text-xs text-muted-foreground italic">tous</span>
                      {:else}
                        {#each expert.ownedDomains as domain}
                          <span class="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground font-mono">
                            {domain}
                          </span>
                        {/each}
                      {/if}
                    </div>
                  </td>
                  <td class="py-3 px-4">
                    <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium {statusBadgeStyles[expert.invitationStatus as keyof typeof statusBadgeStyles] || statusBadgeStyles.disabled}">
                      {statusLabels[expert.invitationStatus as keyof typeof statusLabels] || expert.invitationStatus}
                    </span>
                  </td>
                  <td class="py-3 px-4">
                    {#if expert.delegated}
                      <span class="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        <Check class="h-3 w-3" /> Délégation active
                      </span>
                    {:else}
                      <span class="text-[11px] text-muted-foreground italic">En attente</span>
                    {/if}
                  </td>
                  <td class="py-3 px-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                      {#if expert.invitationToken && expert.invitationStatus === 'pending_invitation'}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Copier le lien d'invitation"
                          onclick={() => copyInviteLink(expert.invitationToken!)}
                        >
                          {#if copiedToken === expert.invitationToken}
                            <Check class="h-3.5 w-3.5 text-emerald-600" />
                          {:else}
                            <Copy class="h-3.5 w-3.5 text-muted-foreground" />
                          {/if}
                        </Button>
                      {/if}

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Modifier l'expert"
                        onclick={() => openEdit(expert)}
                      >
                        <Settings class="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Supprimer"
                        class="hover:text-destructive"
                        onclick={() => handleDelete(expert)}
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
</div>

<AdminInviteExpertDialog
  bind:open={inviteDialogOpen}
  onCreated={() => invalidateAll()}
/>

<AdminEditExpertDialog
  bind:open={editDialogOpen}
  expert={selectedExpert}
  onUpdated={() => invalidateAll()}
/>
