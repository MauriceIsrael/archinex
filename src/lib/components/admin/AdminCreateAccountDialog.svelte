<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import type { KbRole, KbOwnersRegistry } from '$lib/types/llmops';
  import type { ArchitectRole } from '$lib/types/epistemic';
  import type { WorkspaceSummary, UnlinkedOwnerItem } from '$lib/server/accountsAdmin';
  import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';

  let {
    open = $bindable(false),
    workspaces = [],
    ownersRegistry,
    unlinkedOwners = [],
    presetOwner = null,
    onCreated
  } = $props<{
    open: boolean;
    workspaces: WorkspaceSummary[];
    ownersRegistry: KbOwnersRegistry;
    unlinkedOwners: UnlinkedOwnerItem[];
    presetOwner?: UnlinkedOwnerItem | null;
    onCreated: () => void;
  }>();

  let name = $state('');
  let email = $state('');
  let role = $state<'user' | 'admin'>('user');
  let activationMode = $state<'password' | 'link'>('password');
  let initialPassword = $state('');

  // Question guidée : « Cette personne doit-elle relire la base de connaissances ? »
  let enableKbReview = $state(false);
  let kbHandle = $state('');
  let selectedKbRoles = $state<KbRole[]>(['kb:review']);
  let domainsInput = $state('');
  let registerInLlmops = $state(true);

  // Rôles par espace : engagementId -> ArchitectRole | 'none'
  let workspaceRoles = $state<Record<string, ArchitectRole | 'none'>>({});

  let loading = $state(false);
  let errorMsg = $state('');
  let copied = $state(false);

  let createdResult = $state<{
    email: string;
    invitationUrl: string | null;
    llmopsSync?: { attempted: boolean; success: boolean; handle?: string; error?: string };
  } | null>(null);

  const availableKbRoles: { id: KbRole; label: string; desc: string }[] = [
    { id: 'kb:review', label: 'kb:review', desc: 'Revue et décision sur les candidats de la base de connaissances' },
    { id: 'kb:evaluate', label: 'kb:evaluate', desc: 'Exécution et annotation des bancs d’évaluation' },
    { id: 'kb:maintain', label: 'kb:maintain', desc: 'Création et maintien des clauses de doctrine' },
    { id: 'kb:admin', label: 'kb:admin', desc: 'Administration du registre des responsables et gouvernance' }
  ];

  const architectRoleOptions: { value: ArchitectRole | 'none'; label: string }[] = [
    { value: 'none', label: 'Aucun rôle dans cet espace' },
    { value: 'lead_architect', label: 'Lead Architect (Arbitre)' },
    { value: 'infra_expert_architect', label: 'Architecte Infra / Réseau' },
    { value: 'security_architect', label: 'Architecte Sécurité NIS2' },
    { value: 'domain_architect', label: 'Architecte Métier & Domaine' },
    { value: 'data_architect', label: 'Architecte Données & IA' }
  ];

  // Pré-remplissage quand on ouvre depuis un responsable sans adresse (ex: @data-protection-officer)
  $effect(() => {
    if (open && presetOwner) {
      enableKbReview = true;
      kbHandle = presetOwner.handle;
      selectedKbRoles = presetOwner.roles.length > 0 ? [...presetOwner.roles] : ['kb:review'];
      domainsInput = presetOwner.domains.join(', ');
      if (presetOwner.email && !email) {
        email = presetOwner.email;
      }
      if (!name) {
        name = presetOwner.handle.replace(/^@/, '').replace(/[-_]/g, ' ');
      }
      registerInLlmops = true;
    }
  });

  // Détection en temps réel de l'adresse e-mail dans le registre LLMOps
  let matchedOwnerInRegistry = $derived.by(() => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !ownersRegistry?.owners) return null;
    return (
      ownersRegistry.owners.find(
        (o: any) => o.email && o.email.trim().toLowerCase() === cleanEmail
      ) || null
    );
  });

  let matchedDomainsForOwner = $derived.by(() => {
    if (!matchedOwnerInRegistry || !ownersRegistry?.domains) return [];
    const h = matchedOwnerInRegistry.handle.trim().toLowerCase();
    return Object.entries(ownersRegistry.domains)
      .filter(([, ownerH]) => String(ownerH).trim().toLowerCase() === h)
      .map(([dom]) => dom);
  });

  function applyRegistryMatch() {
    if (!matchedOwnerInRegistry) return;
    enableKbReview = true;
    kbHandle = matchedOwnerInRegistry.handle;
    selectedKbRoles =
      matchedOwnerInRegistry.roles && matchedOwnerInRegistry.roles.length > 0
        ? [...matchedOwnerInRegistry.roles]
        : ['kb:review'];
    domainsInput = matchedDomainsForOwner.join(', ');
    registerInLlmops = false; // Déjà connu dans LLMOps
  }

  function applyUnlinkedOwner(owner: UnlinkedOwnerItem) {
    enableKbReview = true;
    kbHandle = owner.handle;
    selectedKbRoles = owner.roles.length > 0 ? [...owner.roles] : ['kb:review'];
    domainsInput = owner.domains.join(', ');
    if (owner.email && !email) {
      email = owner.email;
    }
    registerInLlmops = true;
  }

  function toggleKbRole(r: KbRole) {
    if (selectedKbRoles.includes(r)) {
      if (selectedKbRoles.length > 1) {
        selectedKbRoles = selectedKbRoles.filter((item) => item !== r);
      }
    } else {
      selectedKbRoles = [...selectedKbRoles, r];
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    errorMsg = '';

    if (name.trim().length < 2) {
      errorMsg = 'Le nom doit comporter au moins 2 caractères.';
      return;
    }
    if (!email.includes('@')) {
      errorMsg = 'Veuillez saisir une adresse e-mail valide.';
      return;
    }
    if (activationMode === 'password' && initialPassword.trim().length < 6) {
      errorMsg = 'Le mot de passe initial doit comporter au moins 6 caractères.';
      return;
    }

    loading = true;
    try {
      const domains = domainsInput
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);

      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          role,
          initialPassword: activationMode === 'password' ? initialPassword.trim() : undefined,
          generateActivationLink: activationMode === 'link',
          workspaceRoles,
          enableKbReview,
          kbHandle: enableKbReview
            ? kbHandle.trim() || `@${email.trim().split('@')[0]}`
            : undefined,
          kbRoles: enableKbReview ? selectedKbRoles : undefined,
          ownedDomains: enableKbReview ? domains : undefined,
          registerInLlmops: enableKbReview ? registerInLlmops : false
        })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.message || 'Échec de la création du compte');
      }

      createdResult = {
        email: body.data.email,
        invitationUrl: body.data.invitationUrl
          ? window.location.origin + body.data.invitationUrl
          : null,
        llmopsSync: body.data.llmopsSync
      };
      onCreated();
    } catch (err: any) {
      errorMsg = err.message || 'Erreur inattendue';
    } finally {
      loading = false;
    }
  }

  function resetAndClose() {
    open = false;
    createdResult = null;
    name = '';
    email = '';
    role = 'user';
    activationMode = 'password';
    initialPassword = '';
    enableKbReview = false;
    kbHandle = '';
    selectedKbRoles = ['kb:review'];
    domainsInput = '';
    registerInLlmops = true;
    workspaceRoles = {};
    errorMsg = '';
    copied = false;
  }

  async function copyActivationLink() {
    if (!createdResult?.invitationUrl) return;
    await navigator.clipboard.writeText(createdResult.invitationUrl);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) resetAndClose(); }}>
  <Dialog.Content class="sm:max-w-[660px] max-h-[90vh] overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title>Nouveau compte — Parcours guidé</Dialog.Title>
      <Dialog.Description>
        Créez un compte et définissez au même endroit son rôle applicatif, ses rôles dans les espaces de travail et, si nécessaire, son habilitation sur la base de connaissances LLMOps.
      </Dialog.Description>
    </Dialog.Header>

    {#if createdResult}
      <div class="space-y-4 py-3">
        <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
          <div class="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold text-sm">
            <CheckCircle2 class="h-4 w-4" />
            <span>Compte créé pour {createdResult.email}</span>
          </div>
          {#if createdResult.invitationUrl}
            <p class="text-xs text-muted-foreground">
              Archinex n'envoie aucun e-mail automatique. Copiez et transmettez ce lien d'activation à usage unique (valable 7 jours) :
            </p>
            <div class="flex items-center gap-2 pt-1">
              <Input readonly value={createdResult.invitationUrl} class="font-mono text-xs" />
              <Button size="sm" variant="secondary" onclick={copyActivationLink} class="gap-1.5 shrink-0">
                {#if copied}
                  <Check class="h-3.5 w-3.5 text-emerald-600" />
                  <span>Copié</span>
                {:else}
                  <Copy class="h-3.5 w-3.5" />
                  <span>Copier</span>
                {/if}
              </Button>
            </div>
          {:else}
            <p class="text-xs text-muted-foreground">
              Le compte est immédiatement actif avec le mot de passe initial que vous avez fixé.
            </p>
          {/if}
        </div>

        {#if createdResult.llmopsSync?.attempted}
          {#if createdResult.llmopsSync.success}
            <div class="rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs">
              Identité <strong>{createdResult.llmopsSync.handle}</strong> enregistrée et journalisée dans le registre des responsables LLMOps.
            </div>
          {:else}
            <div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
              Le compte local a été créé, mais la mise à jour du registre LLMOps n'a pas abouti : {createdResult.llmopsSync.error}. Vous pourrez la relancer depuis la fiche du compte.
            </div>
          {/if}
        {/if}

        <div class="flex justify-end pt-2">
          <Button onclick={resetAndClose}>Fermer</Button>
        </div>
      </div>
    {:else}
      <form onsubmit={handleSubmit} class="space-y-5 py-2">
        {#if errorMsg}
          <div class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {errorMsg}
          </div>
        {/if}

        <!-- 1. COMPTE & RÔLE APPLICATIF -->
        <div class="space-y-3 rounded-lg border p-3.5 bg-muted/10">
          <h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            1. Compte & Rôle applicatif
          </h4>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label for="create-name">Nom complet</Label>
              <Input id="create-name" bind:value={name} placeholder="ex: Claire Beauchamp" required />
            </div>

            <div class="space-y-1.5">
              <Label for="create-email">Adresse e-mail</Label>
              <Input id="create-email" type="email" bind:value={email} placeholder="claire@archinex.local" required />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div class="space-y-1.5">
              <Label for="create-app-role">Rôle dans l'application Archinex</Label>
              <select
                id="create-app-role"
                bind:value={role}
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="user">Utilisateur (Accès aux espaces et revues)</option>
                <option value="admin">Administrateur (Gestion des comptes et configuration)</option>
              </select>
            </div>

            <div class="space-y-1.5">
              <Label for="create-activation-mode">Activation du compte (sans envoi d'e-mail)</Label>
              <select
                id="create-activation-mode"
                bind:value={activationMode}
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="password">Fixer un mot de passe initial (actif tout de suite)</option>
                <option value="link">Générer un lien d'activation à usage unique (7 jours)</option>
              </select>
            </div>
          </div>

          {#if activationMode === 'password'}
            <div class="space-y-1.5 pt-1">
              <Label for="create-password">Mot de passe initial (6 caractères minimum)</Label>
              <Input
                id="create-password"
                type="password"
                autocomplete="new-password"
                bind:value={initialPassword}
                placeholder="Mot de passe à communiquer à la personne"
                required
              />
            </div>
          {:else}
            <p class="text-[11px] text-muted-foreground">
              Un lien <code>/invite?token=...</code> valable 7 jours sera affiché après la création pour que vous puissiez le transmettre.
            </p>
          {/if}
        </div>

        <!-- 2. RÔLES DANS LES ESPACES (ENGAGEMENTS) -->
        {#if workspaces.length > 0}
          <div class="space-y-3 rounded-lg border p-3.5 bg-muted/10">
            <div>
              <h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                2. Rôles par espace de délibération
              </h4>
              <p class="text-[11px] text-muted-foreground mt-0.5">
                Définissez dans quels espaces cette personne intervient et avec quel rôle d'architecte.
              </p>
            </div>

            <div class="space-y-2 max-h-40 overflow-y-auto pr-1">
              {#each workspaces as ws (ws.id)}
                <div class="flex items-center justify-between gap-3 rounded border bg-background px-3 py-2 text-xs">
                  <div class="min-w-0">
                    <div class="font-medium truncate">{ws.title}</div>
                    <div class="text-[10px] text-muted-foreground font-mono">{ws.shortName} ({ws.id})</div>
                  </div>
                  <select
                    value={workspaceRoles[ws.id] || 'none'}
                    onchange={(e) => {
                      const val = (e.currentTarget as HTMLSelectElement).value as ArchitectRole | 'none';
                      workspaceRoles = { ...workspaceRoles, [ws.id]: val };
                    }}
                    class="rounded border border-input bg-background px-2 py-1 text-xs shrink-0"
                  >
                    {#each architectRoleOptions as opt}
                      <option value={opt.value}>{opt.label}</option>
                    {/each}
                  </select>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- 3. QUESTION GUIDÉE : BASE DE CONNAISSANCES & IDENTITÉ LLMOPS -->
        <div class="space-y-3 rounded-lg border p-3.5 bg-muted/10">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                3. Base de connaissances & Identité LLMOps
              </h4>
              <p class="text-xs font-medium text-foreground mt-1">
                Cette personne doit-elle relire ou maintenir la base de connaissances ?
              </p>
            </div>
            <label class="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold">
              <input
                type="checkbox"
                bind:checked={enableKbReview}
                class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span>Oui, activer</span>
            </label>
          </div>

          {#if matchedOwnerInRegistry && !enableKbReview}
            <div class="rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs flex items-center justify-between gap-2">
              <span>
                L'adresse <strong>{email}</strong> figure déjà dans le registre LLMOps sous <code>{matchedOwnerInRegistry.handle}</code>.
              </span>
              <Button type="button" size="sm" variant="secondary" onclick={applyRegistryMatch}>
                Reprendre ses droits
              </Button>
            </div>
          {/if}

          {#if enableKbReview}
            {#if unlinkedOwners.length > 0}
              <div class="space-y-1.5 pt-1">
                <Label class="text-xs text-muted-foreground">
                  Associer à un responsable existant du registre LLMOps sans compte (facultatif) :
                </Label>
                <div class="flex flex-wrap gap-1.5">
                  {#each unlinkedOwners as uo}
                    <button
                      type="button"
                      onclick={() => applyUnlinkedOwner(uo)}
                      class="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-mono transition-colors cursor-pointer {kbHandle === uo.handle ? 'border-primary bg-primary/10 text-primary font-semibold' : 'bg-background hover:bg-muted'}"
                    >
                      <span>{uo.handle}</span>
                      {#if uo.domains.length > 0}
                        <span class="text-[10px] text-muted-foreground">({uo.domains.join(', ')})</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div class="space-y-1.5">
                <Label for="create-kb-handle">Handle KB (@...)</Label>
                <Input
                  id="create-kb-handle"
                  bind:value={kbHandle}
                  placeholder="@sec-lead"
                  required={enableKbReview}
                />
              </div>

              <div class="space-y-1.5">
                <Label for="create-kb-domains">Domaines de responsabilité</Label>
                <Input
                  id="create-kb-domains"
                  bind:value={domainsInput}
                  placeholder="security, data-protection, cloud"
                />
              </div>
            </div>

            <div class="space-y-1.5 pt-1">
              <Label class="text-xs">Rôles KB</Label>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {#each availableKbRoles as r}
                  <label class="flex items-start gap-2 rounded border p-2 cursor-pointer text-xs {selectedKbRoles.includes(r.id) ? 'border-primary/40 bg-primary/5' : 'bg-background'}">
                    <input
                      type="checkbox"
                      checked={selectedKbRoles.includes(r.id)}
                      onchange={() => toggleKbRole(r.id)}
                      class="mt-0.5 h-3.5 w-3.5"
                    />
                    <div>
                      <div class="font-mono font-semibold">{r.label}</div>
                      <div class="text-[10px] text-muted-foreground">{r.desc}</div>
                    </div>
                  </label>
                {/each}
              </div>
            </div>

            <!-- État dans LLMOps & case explicite d'inscription -->
            {#if matchedOwnerInRegistry}
              <div class="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                Cette adresse e-mail est déjà connue du registre LLMOps sous <code>{matchedOwnerInRegistry.handle}</code>.
              </div>
            {:else}
              <div class="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-2 text-xs">
                <div class="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                  <AlertTriangle class="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    L'adresse <strong>{email || 'saisie'}</strong> n'est pas encore associée à <code>{kbHandle || 'ce handle'}</code> dans le registre LLMOps. Sans inscription dans LLMOps, la boîte de revue refusera l'accès (403).
                  </span>
                </div>
                <label class="flex items-center gap-2 cursor-pointer font-medium text-foreground pt-1">
                  <input
                    type="checkbox"
                    bind:checked={registerInLlmops}
                    class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span>
                    Inscrire explicitement ce responsable et son adresse e-mail dans le registre LLMOps (action journalisée)
                  </span>
                </label>
              </div>
            {/if}
          {/if}
        </div>

        <Dialog.Footer class="pt-2">
          <Button type="button" variant="outline" onclick={resetAndClose}>Annuler</Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Création en cours...' : 'Créer le compte'}
          </Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>

