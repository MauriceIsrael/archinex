<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import type { KbRole } from '$lib/types/llmops';

  let { open = $bindable(false), onCreated } = $props<{
    open: boolean;
    onCreated: () => void;
  }>();

  let name = $state('');
  let email = $state('');
  let kbHandle = $state('');
  let selectedRoles = $state<KbRole[]>(['kb:review']);
  let domainsInput = $state('security, cloud');
  let loading = $state(false);
  let errorMsg = $state('');
  let createdInvitation = $state<{ token: string | null; url: string | null; handle: string; email: string } | null>(null);
  // Mot de passe initial fixé par l'admin : compte actif tout de suite (aucun e-mail n'est envoyé par Archinex).
  let initialPassword = $state('');

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

  async function handleInvite() {
    errorMsg = '';
    loading = true;

    try {
      const domains = domainsInput
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);

      const res = await fetch('/api/admin/experts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          kbHandle: kbHandle.startsWith('@') ? kbHandle : `@${kbHandle}`,
          kbRoles: selectedRoles,
          ownedDomains: domains,
          ...(initialPassword ? { initialPassword } : {})
        })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.message || 'Échec de l’invitation');
      }

      createdInvitation = {
        token: body.data.invitationToken,
        url: body.data.invitationUrl ? window.location.origin + body.data.invitationUrl : null,
        handle: body.data.expert.kbHandle,
        email: body.data.expert.email
      };

      onCreated();
    } catch (err: any) {
      errorMsg = err.message;
    } finally {
      loading = false;
    }
  }

  function handleClose() {
    open = false;
    createdInvitation = null;
    name = '';
    email = '';
    kbHandle = '';
    selectedRoles = ['kb:review'];
    domainsInput = 'security, cloud';
    initialPassword = '';
    errorMsg = '';
  }

  function copyLink() {
    if (createdInvitation?.url) {
      navigator.clipboard.writeText(createdInvitation.url);
    }
  }
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) handleClose(); }}>
  <Dialog.Content class="sm:max-w-[540px]">
    <Dialog.Header>
      <Dialog.Title>Inviter un Expert KB</Dialog.Title>
      <Dialog.Description>
        Créez un compte d'expertise. Fixez un mot de passe initial pour un compte actif tout de suite, ou laissez vide
        pour générer un lien d'activation à usage unique (valable 7 jours) à transmettre vous-même : Archinex n'envoie pas d'e-mail.
      </Dialog.Description>
    </Dialog.Header>

    {#if createdInvitation && !createdInvitation.url}
      <div class="space-y-4 py-3">
        <div class="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
          <p class="font-semibold text-sm">Compte actif : {createdInvitation.handle}</p>
          <p class="text-xs text-muted-foreground mt-1">
            Connexion possible dès maintenant avec <strong>{createdInvitation.email}</strong> et le mot de passe initial.
            Ses droits sur la base de connaissances viennent du registre des responsables de LLMOps (même adresse).
          </p>
        </div>
        <div class="flex justify-end pt-2">
          <Button onclick={handleClose}>Fermer</Button>
        </div>
      </div>
    {:else if createdInvitation}
      <div class="space-y-4 py-3">
        <div class="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
          <p class="font-semibold text-sm">Expert invité avec succès !</p>
          <p class="text-xs text-muted-foreground mt-1">
            Transmettez ce lien d'activation sécurisé à l'expert. Le lien expire dans 7 jours.
          </p>
        </div>

        <div class="space-y-2">
          <Label class="text-xs">Lien d'activation (usage unique)</Label>
          <div class="flex items-center gap-2">
            <Input readonly value={createdInvitation.url} class="font-mono text-xs" />
            <Button size="sm" variant="secondary" onclick={copyLink}>Copier</Button>
          </div>
        </div>

        <div class="flex justify-end pt-2">
          <Button onclick={handleClose}>Fermer</Button>
        </div>
      </div>
    {:else}
      <form onsubmit={(e) => { e.preventDefault(); handleInvite(); }} class="space-y-4 py-2">
        {#if errorMsg}
          <div class="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            {errorMsg}
          </div>
        {/if}

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <Label for="expert-name">Nom complet</Label>
            <Input id="expert-name" bind:value={name} placeholder="ex: Alice Delcourt" required />
          </div>

          <div class="space-y-1.5">
            <Label for="expert-email">Email professionnel</Label>
            <Input id="expert-email" type="email" bind:value={email} placeholder="alice@archinex.local" required />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <Label for="expert-handle">Handle KB (@...)</Label>
            <Input id="expert-handle" bind:value={kbHandle} placeholder="@sec-lead" required />
          </div>

          <div class="space-y-1.5">
            <Label for="expert-domains">Domaines de compétence</Label>
            <Input id="expert-domains" bind:value={domainsInput} placeholder="security, cloud, resilience" />
          </div>
        </div>

        <div class="space-y-1.5">
          <Label for="expert-initial-password">Mot de passe initial (facultatif, 6 caractères minimum)</Label>
          <Input id="expert-initial-password" type="password" autocomplete="new-password" bind:value={initialPassword} placeholder="Vide : lien d'activation à transmettre" />
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

        <Dialog.Footer class="pt-2">
          <Button type="button" variant="outline" onclick={handleClose}>Annuler</Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Génération...' : 'Créer l’invitation'}
          </Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>
