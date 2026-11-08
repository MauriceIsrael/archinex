<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import DomainsPicker from '$lib/components/admin/DomainsPicker.svelte';
  import type { KbRole, KbOwnersRegistry } from '$lib/types/llmops';
  import type { ArchitectRole } from '$lib/types/epistemic';
  import type { WorkspaceSummary, UnlinkedOwnerItem } from '$lib/server/accountsAdmin';
  import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';

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

  // Dimension 1 : Domaines de responsabilité (Compétences LLMOps)
  let selectedDomains = $state<string[]>([]);

  // Dimension 2 : Rôles LLMOps & Rôles par espace
  let selectedKbRoles = $state<KbRole[]>(['kb:review']);
  let workspaceRoles = $state<Record<string, ArchitectRole | 'none'>>({});

  // Handle LLMOps : auto-généré par défaut, personnalisation facultative
  let showCustomHandle = $state(false);
  let customHandle = $state('');

  let loading = $state(false);
  let errorMsg = $state('');
  let copied = $state(false);

  let createdResult = $state<{
    email: string;
    invitationUrl: string | null;
    llmopsSync?: { attempted: boolean; success: boolean; handle?: string; error?: string };
  } | null>(null);

  const availableKbRoles: { id: KbRole; label: string; desc: string }[] = [
    { id: 'kb:review', label: 'kb:review (Revue & Décision)', desc: 'Valide, amende ou rejette les exigences et candidats sur ses domaines' },
    { id: 'kb:maintain', label: 'kb:maintain (Maintien des Clauses)', desc: 'Rédige et met à jour les règles formelles checks: de la doctrine' },
    { id: 'kb:evaluate', label: 'kb:evaluate (Évaluation)', desc: 'Exécute et annote les bancs d’essai et métriques' },
    { id: 'kb:admin', label: 'kb:admin (Gouvernance)', desc: 'Gouvernance globale du registre des propriétaires' }
  ];

  const architectRoleOptions: { value: ArchitectRole | 'none'; label: string }[] = [
    { value: 'none', label: 'Aucun rôle dans cet espace' },
    { value: 'lead_architect', label: 'Lead Architect (Arbitre)' },
    { value: 'domain_architect', label: 'Architecte Métier & Domaine' },
    { value: 'security_architect', label: 'Architecte Sécurité NIS2' },
    { value: 'infra_expert_architect', label: 'Architecte Infra / Réseau' },
    { value: 'data_architect', label: 'Architecte Données & IA' }
  ];

  // Dérivation automatique du handle LLMOps à partir de l'email ou du nom
  const derivedAutoHandle = $derived.by(() => {
    if (matchedOwnerInRegistry) return matchedOwnerInRegistry.handle;
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail && cleanEmail.includes('@')) {
      const prefix = cleanEmail.split('@')[0].replace(/[^a-z0-9_-]/gi, '-');
      return `@${prefix}`;
    }
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_-]/gi, '-');
    if (cleanName) return `@${cleanName}`;
    return '@expert';
  });

  const effectiveHandle = $derived(
    showCustomHandle && customHandle.trim()
      ? (customHandle.trim().startsWith('@') ? customHandle.trim().toLowerCase() : `@${customHandle.trim().toLowerCase()}`)
      : derivedAutoHandle
  );

  // Pré-remplissage quand on ouvre depuis un responsable sans compte
  $effect(() => {
    if (open && presetOwner) {
      customHandle = presetOwner.handle;
      showCustomHandle = true;
      selectedKbRoles = presetOwner.roles.length > 0 ? [...presetOwner.roles] : ['kb:review'];
      selectedDomains = [...presetOwner.domains];
      if (presetOwner.email && !email) {
        email = presetOwner.email;
      }
      if (!name) {
        name = presetOwner.handle.replace(/^@/, '').replace(/[-_]/g, ' ');
      }
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
    customHandle = matchedOwnerInRegistry.handle;
    showCustomHandle = false;
    selectedKbRoles =
      matchedOwnerInRegistry.roles && matchedOwnerInRegistry.roles.length > 0
        ? [...matchedOwnerInRegistry.roles]
        : ['kb:review'];
    selectedDomains = Array.from(new Set([...selectedDomains, ...matchedDomainsForOwner]));
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
      const hasKbProfile = selectedDomains.length > 0 || selectedKbRoles.length > 0;

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
          enableKbReview: hasKbProfile,
          kbHandle: hasKbProfile ? effectiveHandle : undefined,
          kbRoles: hasKbProfile ? selectedKbRoles : undefined,
          ownedDomains: hasKbProfile ? selectedDomains : undefined,
          registerInLlmops: hasKbProfile
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
    selectedDomains = [];
    selectedKbRoles = ['kb:review'];
    workspaceRoles = {};
    showCustomHandle = false;
    customHandle = '';
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
  <Dialog.Content class="sm:max-w-[700px] max-h-[92vh] overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title class="text-base font-bold flex items-center gap-2">
        <ShieldCheck class="h-5 w-5 text-primary" />
        <span>Nouveau compte — Déclaration & Habilitations</span>
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        Créez un utilisateur, sélectionnez ses compétences parmi les domaines remontés par LLMOps, et définissez ses rôles d'action.
      </Dialog.Description>
    </Dialog.Header>

    {#if createdResult}
      <div class="space-y-4 py-3">
        <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
          <div class="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold text-sm">
            <CheckCircle2 class="h-4 w-4" />
            <span>Compte créé avec succès pour {createdResult.email}</span>
          </div>
          {#if createdResult.invitationUrl}
            <p class="text-xs text-muted-foreground">
              Transmettez ce lien d'activation sécurisé à la personne. Il est valable 7 jours et lui permettra de définir son mot de passe :
            </p>
            <div class="flex items-center gap-2">
              <Input readonly value={createdResult.invitationUrl} class="font-mono text-xs" />
              <Button type="button" size="sm" variant="secondary" onclick={copyActivationLink}>
                {#if copied}
                  <Check class="h-4 w-4 text-emerald-600" />
                {:else}
                  <Copy class="h-4 w-4" />
                {/if}
              </Button>
            </div>
          {:else}
            <p class="text-xs text-muted-foreground">
              Le compte est immédiatement actif avec le mot de passe initial renseigné.
            </p>
          {/if}
        </div>

        {#if createdResult.llmopsSync}
          <div class="rounded-lg border p-3 text-xs space-y-1 {createdResult.llmopsSync.success ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300'}">
            <div class="font-semibold flex items-center gap-1.5">
              <span>Synchronisation registre LLMOps :</span>
              <span>{createdResult.llmopsSync.success ? 'Validée' : 'Partielle'}</span>
            </div>
            {#if createdResult.llmopsSync.handle}
              <p>Identité enregistrée sous le handle : <code>{createdResult.llmopsSync.handle}</code></p>
            {/if}
            {#if createdResult.llmopsSync.error}
              <p class="text-[11px] text-amber-700">{createdResult.llmopsSync.error}</p>
            {/if}
          </div>
        {/if}

        <Dialog.Footer class="pt-2">
          <Button type="button" onclick={resetAndClose}>Fermer</Button>
        </Dialog.Footer>
      </div>
    {:else}
      <form onsubmit={handleSubmit} class="space-y-4 py-2">
        {#if errorMsg}
          <div class="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertTriangle class="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        {/if}

        <!-- 1. IDENTITÉ DU COMPTE & ACCÈS -->
        <div class="space-y-3 rounded-lg border p-3.5 bg-muted/10">
          <h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            1. Informations utilisateur
          </h4>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label for="create-name" class="text-xs font-semibold">Nom complet</Label>
              <Input id="create-name" bind:value={name} placeholder="Ex: Jean Dupont, Expert 3GPP" required />
            </div>

            <div class="space-y-1.5">
              <Label for="create-email" class="text-xs font-semibold">Adresse e-mail</Label>
              <Input id="create-email" type="email" bind:value={email} placeholder="jean.dupont@entreprise.com" required />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div class="space-y-1.5">
              <Label class="text-xs font-semibold">Rôle applicatif Archinex</Label>
              <select
                bind:value={role}
                class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary"
              >
                <option value="user">Utilisateur standard</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>

            <div class="space-y-1.5">
              <Label class="text-xs font-semibold">Mode d'activation</Label>
              <select
                bind:value={activationMode}
                class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary"
              >
                <option value="password">Définir un mot de passe initial</option>
                <option value="link">Générer un lien d'activation (7 jours)</option>
              </select>
            </div>
          </div>

          {#if activationMode === 'password'}
            <div class="space-y-1.5 pt-1">
              <Label for="create-password" class="text-xs font-semibold">Mot de passe initial</Label>
              <Input
                id="create-password"
                type="password"
                bind:value={initialPassword}
                placeholder="6 caractères minimum"
                required={activationMode === 'password'}
              />
            </div>
          {/if}

          <!-- Handle LLMOps calculé automatiquement -->
          <div class="rounded-md border bg-muted/20 px-3 py-2 flex items-center justify-between text-xs">
            <div class="flex items-center gap-1.5">
              <span class="text-muted-foreground">Handle LLMOps attribué :</span>
              <span class="font-mono font-bold text-foreground">{effectiveHandle}</span>
            </div>
            <button
              type="button"
              onclick={() => (showCustomHandle = !showCustomHandle)}
              class="text-[11px] text-primary hover:underline"
            >
              {showCustomHandle ? 'Utiliser automatique' : 'Personnaliser'}
            </button>
          </div>

          {#if showCustomHandle}
            <div class="space-y-1 pt-1">
              <Input
                bind:value={customHandle}
                placeholder={derivedAutoHandle}
                class="font-mono text-xs"
              />
            </div>
          {/if}

          {#if matchedOwnerInRegistry}
            <div class="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs flex items-center justify-between gap-2">
              <span>L'adresse est déjà connue dans LLMOps sous <code>{matchedOwnerInRegistry.handle}</code>.</span>
              <Button type="button" size="sm" variant="secondary" onclick={applyRegistryMatch}>
                Reprendre ses domaines ({matchedDomainsForOwner.length})
              </Button>
            </div>
          {/if}
        </div>

        <!-- 2. DIMENSION 1 : DOMAINES DE RESPONSABILITÉ (COMPÉTENCES LLMOPS) -->
        <div class="space-y-3 rounded-lg border p-3.5 bg-muted/10">
          <div>
            <h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles class="h-3.5 w-3.5 text-primary" />
              <span>2. Domaines de responsabilité (Compétences LLMOps)</span>
            </h4>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              Sélectionnez les domaines techniques ou réglementaires dont cet expert est garant (remontés en temps réel par LLMOps).
            </p>
          </div>

          <DomainsPicker
            bind:selectedDomains
            {ownersRegistry}
            disabled={loading}
          />
        </div>

        <!-- 3. DIMENSION 2 : RÔLES D'INTERVENTION (ARCHINEX & LLMOPS) -->
        <div class="space-y-3 rounded-lg border p-3.5 bg-muted/10">
          <div>
            <h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              3. Rôles & Habilitations (Pouvoirs d'action)
            </h4>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              Définissez les droits d'action de l'utilisateur sur la doctrine LLMOps et dans vos espaces de délibération.
            </p>
          </div>

          <!-- Rôles LLMOps -->
          <div class="space-y-1.5">
            <Label class="text-xs font-semibold">Rôles sur la Doctrine LLMOps</Label>
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

          <!-- Rôles dans les espaces (engagements) -->
          {#if workspaces.length > 0}
            <div class="space-y-2 pt-2 border-t border-border">
              <Label class="text-xs font-semibold">Rôle par espace de délibération (Projets Archinex)</Label>
              <div class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {#each workspaces as ws (ws.id)}
                  <div class="flex items-center justify-between gap-3 rounded border bg-background px-3 py-1.5 text-xs">
                    <div class="min-w-0">
                      <div class="font-medium truncate">{ws.title}</div>
                      <div class="text-[10px] text-muted-foreground font-mono">{ws.shortName}</div>
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
        </div>

        <Dialog.Footer class="pt-2">
          <Button type="button" variant="outline" onclick={resetAndClose}>Annuler</Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Création & Inscription en cours...' : 'Créer le compte & Inscrire dans LLMOps'}
          </Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>
