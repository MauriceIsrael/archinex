<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import type { KbRole } from '$lib/types/llmops';
  import type { ArchitectRole } from '$lib/types/epistemic';
  import type {
    CentralizedAccountRecord,
    WorkspaceSummary,
    UnlinkedOwnerItem
  } from '$lib/server/accountsAdmin';
  import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';

  let {
    open = $bindable(false),
    account = null,
    workspaces = [],
    unlinkedOwners = [],
    onUpdated
  } = $props<{
    open: boolean;
    account: CentralizedAccountRecord | null;
    workspaces: WorkspaceSummary[];
    unlinkedOwners: UnlinkedOwnerItem[];
    onUpdated: () => void;
  }>();

  let name = $state('');
  let email = $state('');
  let role = $state<'user' | 'admin'>('user');
  let isActive = $state(true);
  let newPassword = $state('');

  // Rôles par espace
  let workspaceRoles = $state<Record<string, ArchitectRole | 'none'>>({});

  // Identité KB & LLMOps
  let enableKbReview = $state(false);
  let kbHandle = $state('');
  let selectedKbRoles = $state<KbRole[]>(['kb:review']);
  let domainsInput = $state('');

  let savingLocal = $state(false);
  let syncingLlmops = $state(false);
  let regeneratingLink = $state(false);
  let errorMsg = $state('');
  let successMsg = $state('');
  let generatedLink = $state<string | null>(null);
  let copiedLink = $state(false);

  const availableKbRoles: { id: KbRole; label: string; desc: string }[] = [
    { id: 'kb:review', label: 'kb:review', desc: 'Revue et décision sur les candidats' },
    { id: 'kb:evaluate', label: 'kb:evaluate', desc: 'Exécution et annotation des évaluations' },
    { id: 'kb:maintain', label: 'kb:maintain', desc: 'Création et maintien de la doctrine' },
    { id: 'kb:admin', label: 'kb:admin', desc: 'Gestion du registre des responsables' }
  ];

  const architectRoleOptions: { value: ArchitectRole | 'none'; label: string }[] = [
    { value: 'none', label: 'Aucun rôle dans cet espace' },
    { value: 'lead_architect', label: 'Lead Architect (Arbitre)' },
    { value: 'infra_expert_architect', label: 'Architecte Infra / Réseau' },
    { value: 'security_architect', label: 'Architecte Sécurité NIS2' },
    { value: 'domain_architect', label: 'Architecte Métier & Domaine' },
    { value: 'data_architect', label: 'Architecte Données & IA' }
  ];

  $effect(() => {
    if (account && open) {
      name = account.name;
      email = account.email;
      role = account.role;
      isActive = account.isActive;
      newPassword = '';
      errorMsg = '';
      successMsg = '';
      generatedLink = account.invitationUrl
        ? window.location.origin + account.invitationUrl
        : null;

      const wsMap: Record<string, ArchitectRole | 'none'> = {};
      for (const ws of workspaces) {
        const found = account.workspaceRoles.find(
          (wr: any) => wr.engagementId === ws.id
        );
        wsMap[ws.id] = found ? found.role : 'none';
      }
      workspaceRoles = wsMap;

      const hasKb = Boolean(
        account.kbProfile ||
          account.llmopsIdentity.knownByEmail ||
          account.llmopsIdentity.matchedByHandle
      );
      enableKbReview = hasKb;
      kbHandle =
        account.llmopsIdentity.handle ||
        account.kbProfile?.kbHandle ||
        `@${account.email.split('@')[0]}`;

      const initRoles =
        account.llmopsIdentity.roles.length > 0
          ? account.llmopsIdentity.roles
          : account.kbProfile?.kbRoles.length
            ? account.kbProfile.kbRoles
            : (['kb:review'] as KbRole[]);
      selectedKbRoles = [...initRoles];

      const initDomains =
        account.llmopsIdentity.domains.length > 0
          ? account.llmopsIdentity.domains
          : account.kbProfile?.ownedDomains || [];
      domainsInput = initDomains.join(', ');
    }
  });

  function toggleKbRole(r: KbRole) {
    if (selectedKbRoles.includes(r)) {
      if (selectedKbRoles.length > 1) {
        selectedKbRoles = selectedKbRoles.filter((item) => item !== r);
      }
    } else {
      selectedKbRoles = [...selectedKbRoles, r];
    }
  }

  function applyUnlinkedOwner(uo: UnlinkedOwnerItem) {
    enableKbReview = true;
    kbHandle = uo.handle;
    selectedKbRoles = uo.roles.length > 0 ? [...uo.roles] : ['kb:review'];
    domainsInput = uo.domains.join(', ');
  }

  async function handleSaveAccount(e: Event) {
    e.preventDefault();
    if (!account) return;
    errorMsg = '';
    successMsg = '';
    savingLocal = true;

    try {
      const domains = domainsInput
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);

      const res = await fetch('/api/admin/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: account.id,
          name: name.trim(),
          email: email.trim(),
          role,
          isActive,
          newPassword: newPassword.trim() ? newPassword.trim() : undefined,
          workspaceRoles,
          enableKbReview,
          kbHandle: enableKbReview ? kbHandle.trim() : undefined,
          kbRoles: enableKbReview ? selectedKbRoles : [],
          ownedDomains: enableKbReview ? domains : []
        })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.message || 'Échec de la mise à jour du compte');
      }

      newPassword = '';
      if (body.data?.invitationUrl) {
        generatedLink = window.location.origin + body.data.invitationUrl;
      } else if (newPassword) {
        generatedLink = null;
      }
      successMsg = 'Modifications du compte et des rôles par espace enregistrées.';
      onUpdated();
    } catch (err: any) {
      errorMsg = err.message || 'Erreur lors de la sauvegarde';
    } finally {
      savingLocal = false;
    }
  }

  async function handleRegenerateActivationLink() {
    if (!account) return;
    errorMsg = '';
    successMsg = '';
    regeneratingLink = true;

    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: account.id,
          regenerateActivationLink: true
        })
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.message || 'Impossible de générer le lien');
      }
      if (body.data?.invitationUrl) {
        generatedLink = window.location.origin + body.data.invitationUrl;
        successMsg = 'Nouveau lien d’activation (valable 7 jours) généré.';
      }
      onUpdated();
    } catch (err: any) {
      errorMsg = err.message;
    } finally {
      regeneratingLink = false;
    }
  }

  async function handleSyncLlmops() {
    if (!account) return;
    errorMsg = '';
    successMsg = '';
    syncingLlmops = true;

    try {
      const domains = domainsInput
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);

      const res = await fetch('/api/admin/llmops-owners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: account.id,
          handle: kbHandle.trim(),
          email: email.trim(),
          roles: selectedKbRoles,
          domains
        })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.message || 'Échec de la mise à jour dans LLMOps');
      }

      successMsg = `Identité ${body.data.handle} enregistrée et journalisée dans le registre des responsables LLMOps.`;
      onUpdated();
    } catch (err: any) {
      errorMsg = err.message || 'Erreur lors de la synchronisation LLMOps';
    } finally {
      syncingLlmops = false;
    }
  }

  async function copyLink() {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    copiedLink = true;
    setTimeout(() => {
      copiedLink = false;
    }, 2000);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title>Fiche personne — {account?.name}</Dialog.Title>
      <Dialog.Description>
        Gérez au même endroit le compte, le rôle applicatif, les rôles dans chaque espace de délibération et l'identité dans le registre LLMOps.
      </Dialog.Description>
    </Dialog.Header>

    {#if account}
      <form onsubmit={handleSaveAccount} class="space-y-5 py-2">
        {#if errorMsg}
          <div class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {errorMsg}
          </div>
        {/if}

        {#if successMsg}
          <div class="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 class="h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        {/if}

        <!-- 1. COMPTE & MOT DE PASSE / ACTIVATION -->
        <div class="space-y-3 rounded-lg border p-3.5 bg-muted/10">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              1. Compte & Authentification
            </h4>
            <label class="inline-flex items-center gap-2 cursor-pointer text-xs font-medium">
              <input
                type="checkbox"
                bind:checked={isActive}
                class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span>Compte actif</span>
            </label>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label for="sheet-name">Nom complet</Label>
              <Input id="sheet-name" bind:value={name} required />
            </div>

            <div class="space-y-1.5">
              <Label for="sheet-email">Adresse e-mail</Label>
              <Input id="sheet-email" type="email" bind:value={email} required />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div class="space-y-1.5">
              <Label for="sheet-new-password">Nouveau mot de passe (facultatif)</Label>
              <Input
                id="sheet-new-password"
                type="password"
                autocomplete="new-password"
                bind:value={newPassword}
                placeholder="Laisser vide pour conserver l'actuel"
              />
            </div>

            <div class="space-y-1.5 flex flex-col justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={regeneratingLink}
                onclick={handleRegenerateActivationLink}
                class="gap-1.5 w-full"
              >
                <RefreshCw class="h-3.5 w-3.5" />
                <span>{regeneratingLink ? 'Génération...' : 'Générer un lien d’activation (7 jours)'}</span>
              </Button>
            </div>
          </div>

          {#if generatedLink}
            <div class="rounded border bg-background p-2.5 space-y-1.5">
              <div class="text-[11px] text-muted-foreground">
                Lien d'activation à usage unique (Archinex n'envoie pas d'e-mail, copiez-le pour le transmettre) :
              </div>
              <div class="flex items-center gap-2">
                <Input readonly value={generatedLink} class="font-mono text-xs h-8" />
                <Button type="button" size="sm" variant="secondary" onclick={copyLink} class="h-8 gap-1">
                  {#if copiedLink}
                    <Check class="h-3.5 w-3.5 text-emerald-600" />
                    <span>Copié</span>
                  {:else}
                    <Copy class="h-3.5 w-3.5" />
                    <span>Copier</span>
                  {/if}
                </Button>
              </div>
            </div>
          {/if}
        </div>

        <!-- 2. RÔLE APPLICATIF ARCHINEX -->
        <div class="space-y-2 rounded-lg border p-3.5 bg-muted/10">
          <h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            2. Rôle dans l'application Archinex
          </h4>
          <select
            bind:value={role}
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="user">Utilisateur standard (espaces de travail et revues)</option>
            <option value="admin">Administrateur (gestion des comptes et gouvernance)</option>
          </select>
        </div>

        <!-- 3. RÔLES PAR ESPACE (ENGAGEMENTS) -->
        <div class="space-y-3 rounded-lg border p-3.5 bg-muted/10">
          <div>
            <h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              3. Rôles dans chaque espace de travail
            </h4>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              Rôle d'architecture de cette personne dans chacun des espaces d'engagement.
            </p>
          </div>

          {#if workspaces.length === 0}
            <p class="text-xs text-muted-foreground italic">Aucun espace d'engagement créé.</p>
          {:else}
            <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
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
          {/if}
        </div>

        <!-- 4. IDENTITÉ DANS LLMOPS (REGISTRE DES RESPONSABLES) -->
        <div class="space-y-3 rounded-lg border p-3.5 bg-muted/10">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                4. Identité dans LLMOps (Base de connaissances)
              </h4>
              <p class="text-[11px] text-muted-foreground mt-0.5">
                Le registre des responsables de LLMOps fait autorité pour l'accès à la boîte de revue.
              </p>
            </div>
            <label class="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold">
              <input
                type="checkbox"
                bind:checked={enableKbReview}
                class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span>Habilité KB</span>
            </label>
          </div>

          <!-- État courant lu depuis LLMOps -->
          {#if account.llmopsIdentity.status === 'synced'}
            <div class="rounded border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 class="h-4 w-4 shrink-0" />
              <span>
                Synchronisé avec le registre LLMOps : <code>{account.llmopsIdentity.handle}</code>
                ({account.llmopsIdentity.roles.join(', ')}) — Domaines :
                {account.llmopsIdentity.domains.length > 0 ? account.llmopsIdentity.domains.join(', ') : 'aucun domaine exclusif'}.
              </span>
            </div>
          {:else if account.llmopsIdentity.status === 'email_unknown' || account.llmopsIdentity.status === 'handle_without_email'}
            <div class="rounded border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle class="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                L'adresse <strong>{account.email}</strong> n'est pas associée à ce compte dans le registre LLMOps. Utilisez le bouton explicite ci-dessous pour l'inscrire dans LLMOps sans écraser les autres responsables.
              </span>
            </div>
          {:else if account.llmopsIdentity.status === 'drift'}
            <div class="rounded border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle class="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Écart détecté entre le profil local et le registre LLMOps (<code>{account.llmopsIdentity.handle}</code>).
              </span>
            </div>
          {/if}

          {#if enableKbReview}
            {#if unlinkedOwners.length > 0}
              <div class="space-y-1">
                <Label class="text-[11px] text-muted-foreground">
                  Associer un responsable existant du registre LLMOps sans compte :
                </Label>
                <div class="flex flex-wrap gap-1.5">
                  {#each unlinkedOwners as uo}
                    <button
                      type="button"
                      onclick={() => applyUnlinkedOwner(uo)}
                      class="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-mono cursor-pointer {kbHandle === uo.handle ? 'border-primary bg-primary/10 text-primary font-semibold' : 'bg-background hover:bg-muted'}"
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
                <Label for="sheet-kb-handle">Handle dans LLMOps (@...)</Label>
                <Input id="sheet-kb-handle" bind:value={kbHandle} placeholder="@sec-lead" />
              </div>

              <div class="space-y-1.5">
                <Label for="sheet-kb-domains">Domaines rattachés dans LLMOps</Label>
                <Input
                  id="sheet-kb-domains"
                  bind:value={domainsInput}
                  placeholder="security, data-protection, cloud"
                />
              </div>
            </div>

            <div class="space-y-1.5">
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

            <div class="flex items-center justify-between gap-3 rounded border border-primary/25 bg-primary/5 p-3">
              <div class="text-xs">
                <div class="font-semibold text-foreground">Action explicite sur le registre LLMOps</div>
                <div class="text-[11px] text-muted-foreground">
                  Met à jour uniquement ce responsable et ses domaines dans LLMOps (<code>PUT /api/knowledge/owners</code>) avec journalisation.
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={syncingLlmops}
                onclick={handleSyncLlmops}
                class="shrink-0"
              >
                {syncingLlmops ? 'Envoi à LLMOps...' : 'Enregistrer dans le registre LLMOps'}
              </Button>
            </div>
          {/if}
        </div>

        <Dialog.Footer class="pt-2">
          <Button type="button" variant="outline" onclick={() => { open = false; }}>Fermer</Button>
          <Button type="submit" disabled={savingLocal}>
            {savingLocal ? 'Enregistrement...' : 'Enregistrer le compte et les rôles'}
          </Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>

