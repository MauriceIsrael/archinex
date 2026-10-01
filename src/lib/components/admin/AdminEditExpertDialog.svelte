<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import type { KbExpertRecord } from '$lib/server/kbProfilesDb';
  import type { KbRole } from '$lib/types/llmops';

  let { open = $bindable(false), expert, onUpdated } = $props<{
    open: boolean;
    expert: KbExpertRecord | null;
    onUpdated: () => void;
  }>();

  let name = $state('');
  let kbHandle = $state('');
  let selectedRoles = $state<KbRole[]>([]);
  let domainsInput = $state('');
  let isActive = $state(true);
  let loading = $state(false);
  let errorMsg = $state('');

  $effect(() => {
    if (expert) {
      name = expert.name;
      kbHandle = expert.kbHandle;
      selectedRoles = [...expert.kbRoles];
      domainsInput = expert.ownedDomains.join(', ');
      isActive = expert.isActive;
      errorMsg = '';
    }
  });

  const availableRoles: { id: KbRole; label: string; desc: string }[] = [
    { id: 'kb:review', label: 'kb:review', desc: 'Revue et vote sur les candidats/règles' },
    { id: 'kb:evaluate', label: 'kb:evaluate', desc: 'Lancement et annotation d’évaluations' },
    { id: 'kb:maintain', label: 'kb:maintain', desc: 'Création et mise à jour de clauses de doctrine' },
    { id: 'kb:admin', label: 'kb:admin', desc: 'Gestion des propriétaires et gouvernance globale' }
  ];

  function toggleRole(role: KbRole) {
    if (selectedRoles.includes(role)) {
      if (selectedRoles.length > 1) {
        selectedRoles = selectedRoles.filter((r) => r !== role);
      }
    } else {
      selectedRoles = [...selectedRoles, role];
    }
  }

  async function handleSave() {
    if (!expert) return;
    errorMsg = '';
    loading = true;

    try {
      const domains = domainsInput
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);

      const res = await fetch(`/api/admin/experts/${expert.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          kbHandle: kbHandle.startsWith('@') ? kbHandle : `@${kbHandle}`,
          kbRoles: selectedRoles,
          ownedDomains: domains,
          isActive
        })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.message || 'Mise à jour impossible');
      }

      open = false;
      onUpdated();
    } catch (err: any) {
      errorMsg = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[540px]">
    <Dialog.Header>
      <Dialog.Title>Modifier l'Expert KB</Dialog.Title>
      <Dialog.Description>
        Ajustez les habilitations, le handle et les domaines de responsabilité.
      </Dialog.Description>
    </Dialog.Header>

    <form onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-4 py-2">
      {#if errorMsg}
        <div class="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          {errorMsg}
        </div>
      {/if}

      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <Label for="edit-name">Nom complet</Label>
          <Input id="edit-name" bind:value={name} required />
        </div>

        <div class="space-y-1.5">
          <Label for="edit-email">Email (immuable)</Label>
          <Input id="edit-email" value={expert?.email ?? ''} disabled class="bg-muted text-muted-foreground" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <Label for="edit-handle">Handle KB (@...)</Label>
          <Input id="edit-handle" bind:value={kbHandle} required />
        </div>

        <div class="space-y-1.5">
          <Label for="edit-domains">Domaines de compétence</Label>
          <Input id="edit-domains" bind:value={domainsInput} />
        </div>
      </div>

      <div class="space-y-2 pt-1">
        <Label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rôles KB attribués</Label>
        <div class="grid grid-cols-1 gap-2">
          {#each availableRoles as role}
            <label class="flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer hover:bg-muted/40 transition-colors {selectedRoles.includes(role.id) ? 'border-primary/40 bg-primary/5' : 'border-border'}">
              <input
                type="checkbox"
                class="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                checked={selectedRoles.includes(role.id)}
                onchange={() => toggleRole(role.id)}
              />
              <div class="flex-1">
                <div class="text-xs font-semibold font-mono text-foreground">{role.label}</div>
                <div class="text-[11px] text-muted-foreground">{role.desc}</div>
              </div>
            </label>
          {/each}
        </div>
      </div>

      <div class="flex items-center gap-2 pt-2">
        <input
          id="is-active"
          type="checkbox"
          bind:checked={isActive}
          class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <Label for="is-active" class="cursor-pointer text-xs font-medium">Compte expert actif</Label>
      </div>

      <Dialog.Footer class="pt-2">
        <Button type="button" variant="outline" onclick={() => { open = false; }}>Annuler</Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
