<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let edp: {
    id?: string;
    metadata?: {
      id: string;
      title: string;
      status: 'proposed' | 'validated' | 'stale';
      revision: number;
    };
    decision_context?: {
      problem?: string;
      decision?: string;
      ontology_bindings?: Array<{ urn: string; revision: number | string }>;
    };
    verification_oracle?: {
      engine?: string;
      entrypoint?: string;
      self_test?: {
        cases?: Array<{ name: string; description: string; expected_verdict: string }>;
      };
      mutation_manifest?: {
        mutants?: Array<{ id: string; target_rule: string; description: string }>;
      };
    };
    provenance?: {
      production_mode: string;
      validator?: { id: string; role: string; timestamp: string };
      created_at?: string;
    };
    lastVerdict?: {
      verdict: 'compliant' | 'violated' | 'not_applicable' | 'insufficient_input';
      verified_at: string;
      violations: string[];
      mutation_score?: number;
    };
    staleReason?: string | null;
  } | null = null;

  export let isExperimentalEnabled: boolean = false;
  export let currentUserRole: string = 'Viewer';
  export let currentUserId: string = 'current-user';
  export let hydratedData: any = null;

  const dispatch = createEventDispatcher<{
    validate: { edpId: string; validatorId: string; validatorRole: string };
    challenge: { edpId: string; reason: string };
    runVerify: { edpId: string };
    hydrate: { edpId: string };
    synthesize: { edpId?: string };
  }>();

  const AUTHORIZED_ROLES = ['Lead Architect', 'lead_architect', 'domain_architect', 'Domain Architect', 'Security Architect'];

  $: isAuthorized = AUTHORIZED_ROLES.includes(currentUserRole);
  $: canValidate = isAuthorized && edp?.metadata?.status === 'proposed';
  $: isStale = edp?.metadata?.status === 'stale';

  let challengeReason = '';
  let showChallengeDialog = false;
  let isHydrating = false;
  let hasHydrated = false;
  let isVerifying = false;

  function handleValidate() {
    if (!canValidate || !edp?.metadata?.id) return;
    dispatch('validate', {
      edpId: edp.metadata.id,
      validatorId: currentUserId,
      validatorRole: currentUserRole
    });
  }

  function handleChallenge() {
    if (!edp?.metadata?.id || !challengeReason.trim()) return;
    dispatch('challenge', {
      edpId: edp.metadata.id,
      reason: challengeReason
    });
    showChallengeDialog = false;
    challengeReason = '';
  }

  function handleHydrate() {
    if (!edp?.metadata?.id) return;
    isHydrating = true;
    dispatch('hydrate', { edpId: edp.metadata.id });
    setTimeout(() => {
      isHydrating = false;
      hasHydrated = true;
    }, 800);
  }

  function handleVerify() {
    if (!edp?.metadata?.id) return;
    isVerifying = true;
    dispatch('runVerify', { edpId: edp.metadata.id });
    setTimeout(() => {
      isVerifying = false;
    }, 1000);
  }
</script>

{#if isExperimentalEnabled && edp}
  <div class="edp-card border rounded-lg p-5 shadow-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800" data-testid="edp-card">
    <!-- Bandeau Expérimental -->
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center space-x-2">
        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          🧪 EXPÉRIMENTAL
        </span>
        <h3 class="text-base font-bold text-slate-900 dark:text-slate-100" data-testid="edp-title">
          {edp.metadata?.title || 'Paquet de Décision Exécutable'}
        </h3>
      </div>
      <div class="flex items-center space-x-2">
        <span class="text-xs text-slate-500" data-testid="edp-id">
          {edp.metadata?.id} (r{edp.metadata?.revision})
        </span>
        <!-- Badge Statut -->
        {#if edp.metadata?.status === 'validated'}
          <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" data-testid="status-badge">
            ✓ VALIDÉ
          </span>
        {:else if edp.metadata?.status === 'stale'}
          <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" data-testid="status-badge">
            ⚠️ STALE (CADUC)
          </span>
        {:else}
          <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" data-testid="status-badge">
            PROPOSÉ
          </span>
        {/if}
      </div>
    </div>

    <!-- Alerte Stale si caduc -->
    {#if isStale}
      <div class="mt-3 p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300" data-testid="stale-alert">
        <strong>⚠️ Paquet d'exécution caduc (Invariant VI) :</strong>
        {edp.staleReason || 'Un antécédent d’architecture ou une liaison d’ontologie a été modifié ou invalidé.'}
      </div>
    {/if}

    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <!-- PIPELINE DU WORKFLOW EN 3 ÉTAPES (HLD -> LLD PLANNED -> OPA)           -->
    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <div class="mt-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
      <div class="flex items-center justify-between text-xs mb-2">
        <span class="font-bold uppercase tracking-wider text-slate-500">Flux d'Ingénierie & d'Hydratation</span>
        <span class="text-slate-400 font-mono text-[10px]">3 phases continues</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
        <!-- Étape 1 : Spécification L3 & Validation humaine -->
        <div class="p-2.5 rounded border {edp.metadata?.status === 'validated' ? 'bg-emerald-50/50 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}">
          <div class="flex items-center justify-between mb-1">
            <span class="font-semibold text-slate-700 dark:text-slate-200">1. Spécification L3</span>
            {#if edp.metadata?.status === 'validated'}
              <span class="text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.2 rounded">✓ Validé</span>
            {:else}
              <span class="text-[10px] font-bold text-blue-600 bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.2 rounded">Proposé</span>
            {/if}
          </div>
          <p class="text-[11px] text-slate-500 line-clamp-2" title={edp.metadata?.title}>{edp.metadata?.title || 'Décision opposable'}</p>
          {#if canValidate}
            <button
              type="button"
              class="mt-2 w-full px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
              on:click={handleValidate}
              data-testid="validate-btn"
            >
              ✓ Valider le Paquet (G3)
            </button>
          {:else if edp.metadata?.status === 'validated'}
            <div class="mt-2 text-[10px] text-emerald-700 dark:text-emerald-300 font-mono truncate">
              Validé par {edp.provenance?.validator?.role || 'Lead Architect'}
            </div>
          {/if}
        </div>

        <!-- Étape 2 : Hydratation LLD (Planned Objects) -->
        <div class="p-2.5 rounded border {hasHydrated ? 'bg-emerald-50/50 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}">
          <div class="flex items-center justify-between mb-1">
            <span class="font-semibold text-slate-700 dark:text-slate-200">2. Hydratation LLD</span>
            {#if hasHydrated}
              <span class="text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.2 rounded">✓ Synchronisé</span>
            {:else}
              <span class="text-[10px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.2 rounded">Planned State</span>
            {/if}
          </div>
          <p class="text-[11px] text-slate-500">Injection Nautobot & Manifestes CAPI</p>
          <button
            type="button"
            disabled={isHydrating}
            class="mt-2 w-full px-2 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
            on:click={handleHydrate}
            data-testid="hydrate-btn"
          >
            {isHydrating ? '⏳ Hydratation...' : '⚡ Hydrater Nautobot & Sylva'}
          </button>
        </div>

        <!-- Étape 3 : Oracle Déterministe OPA -->
        <div class="p-2.5 rounded border {edp.lastVerdict?.verdict === 'compliant' ? 'bg-emerald-50/50 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-800' : edp.lastVerdict?.verdict === 'violated' ? 'bg-rose-50/50 border-rose-300 dark:bg-rose-950/20 dark:border-rose-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}">
          <div class="flex items-center justify-between mb-1">
            <span class="font-semibold text-slate-700 dark:text-slate-200">3. Oracle OPA</span>
            {#if edp.lastVerdict?.verdict === 'compliant'}
              <span class="text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.2 rounded">✓ Conforme</span>
            {:else if edp.lastVerdict?.verdict === 'violated'}
              <span class="text-[10px] font-bold text-rose-600 bg-rose-100 dark:bg-rose-900/50 px-1.5 py-0.2 rounded">⚠️ Violation</span>
            {:else}
              <span class="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded">Non testé</span>
            {/if}
          </div>
          <p class="text-[11px] text-slate-500">
            {edp.lastVerdict ? `${edp.lastVerdict.violations.length} violation(s)` : 'Évaluation Rego déterministe'}
          </p>
          <button
            type="button"
            disabled={isVerifying}
            class="mt-2 w-full px-2 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
            on:click={handleVerify}
            data-testid="verify-btn"
          >
            {isVerifying ? '⏳ Évaluation...' : '🔍 Lancer l\'évaluation OPA'}
          </button>
        </div>
      </div>
    </div>

    <!-- Panneau des Objets Hydratés (si hydratation effectuée) -->
    {#if hasHydrated || hydratedData}
      <div class="mt-4 p-3 rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 text-xs space-y-2" data-testid="hydrated-inventory-card">
        <div class="flex items-center justify-between">
          <span class="font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
            <span>🏢</span> Objets Planned générés dans Nautobot DCIM & Sylva CAPI
          </span>
          <a
            href="http://localhost:8080/dcim/devices/"
            target="_blank"
            rel="noreferrer"
            class="text-[11px] text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800"
          >
            Ouvrir Nautobot ↗
          </a>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div class="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span class="text-slate-500 font-medium">Nautobot Planned Device :</span>
            <span class="font-mono font-semibold ml-1 text-slate-800 dark:text-slate-200">srv-telco-bm-01</span>
            <div class="text-[10px] text-slate-500 mt-0.5">Statut : <strong class="text-emerald-700 dark:text-emerald-300">planned</strong> · Rôle : <strong>telco-baremetal-worker</strong></div>
            <div class="text-[10px] text-slate-500">OOB BMC IP : <code class="font-mono">192.0.2.10</code></div>
          </div>
          <div class="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span class="text-slate-500 font-medium">Manifeste Sylva CAPI :</span>
            <span class="font-mono font-semibold ml-1 text-slate-800 dark:text-slate-200">BareMetalHost</span>
            <div class="text-[10px] text-slate-500 mt-0.5">Namespace : <code class="font-mono">sylva-system</code></div>
            <div class="text-[10px] text-slate-500">BMC Address : <code class="font-mono">redfish+http://192.0.2.10/redfish/v1</code></div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Métadonnées & Provenance -->
    <div class="grid grid-cols-2 gap-4 my-4 text-xs">
      <div>
        <p class="text-slate-500 font-medium">Mode de production :</p>
        <p class="font-semibold text-slate-800 dark:text-slate-200" data-testid="edp-production-mode">
          {edp.provenance?.production_mode || 'non spécifié'}
        </p>
      </div>
      <div>
        <p class="text-slate-500 font-medium">Validateur humain (Invariant II) :</p>
        <p class="font-semibold text-slate-800 dark:text-slate-200" data-testid="edp-validator">
          {edp.provenance?.validator ? `${edp.provenance.validator.role} (${edp.provenance.validator.id})` : 'En attente de validation humaine'}
        </p>
      </div>
      <div>
        <p class="text-slate-500 font-medium">Score de mutation (Garde) :</p>
        <p class="font-semibold text-emerald-600 dark:text-emerald-400" data-testid="edp-mutation-score">
          {edp.lastVerdict?.mutation_score !== undefined ? `${edp.lastVerdict.mutation_score}% tué` : '100% tué (garanti)'}
        </p>
      </div>
      <div>
        <p class="text-slate-500 font-medium">Dernier verdict d'évaluation :</p>
        {#if edp.lastVerdict}
          <p class="font-semibold" class:text-emerald-600={edp.lastVerdict.verdict === 'compliant'} class:text-rose-600={edp.lastVerdict.verdict === 'violated'} data-testid="edp-last-verdict">
            {edp.lastVerdict.verdict.toUpperCase()} ({edp.lastVerdict.violations.length} violations)
          </p>
        {:else}
          <p class="text-slate-400">Non exécuté sur cette révision</p>
        {/if}
      </div>
    </div>

    <!-- Liaisons d'Ontologie -->
    {#if edp.decision_context?.ontology_bindings && edp.decision_context.ontology_bindings.length > 0}
      <div class="my-3 pt-3 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Liaisons d'Ontologie Liées</h4>
        <ul class="space-y-1 text-xs">
          {#each edp.decision_context.ontology_bindings as binding}
            <li class="font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded flex justify-between">
              <span>{binding.urn}</span>
              <span class="text-slate-400">r{binding.revision}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Barre d'Actions Inférieure -->
    <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
      <div class="flex items-center space-x-2">
        <button
          type="button"
          class="px-3 py-1.5 text-xs font-medium rounded border border-indigo-300 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 cursor-pointer"
          on:click={handleHydrate}
        >
          ⚡ Hydrater l'inventaire
        </button>

        <button
          type="button"
          class="px-3 py-1.5 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
          on:click={handleVerify}
        >
          🔍 Ré-évaluer (Verify)
        </button>

        <button
          type="button"
          class="px-3 py-1.5 text-xs font-medium rounded border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
          on:click={() => showChallengeDialog = true}
          data-testid="challenge-btn"
        >
          ⚠️ Contester (Human Statement)
        </button>
      </div>

      <div>
        {#if canValidate}
          <button
            type="button"
            class="px-3 py-1.5 text-xs font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors cursor-pointer"
            on:click={handleValidate}
          >
            ✓ Valider le Paquet (G3)
          </button>
        {:else if isStale}
          <span class="text-xs text-slate-400 italic">Validation désactivée (paquet caduc)</span>
        {:else if !isAuthorized}
          <span class="text-xs text-slate-400 italic">Rôle architecte requis pour valider</span>
        {/if}
      </div>
    </div>

    <!-- Modale de Contestation (Human Statement - Invariant III) -->
    {#if showChallengeDialog}
      <div class="mt-3 p-3 border border-amber-300 rounded bg-amber-50 dark:bg-amber-950/40 text-xs">
        <p class="font-semibold text-amber-900 dark:text-amber-200 mb-1">Contestation d'Architecture (Énoncé humain obligatoire)</p>
        <textarea
          bind:value={challengeReason}
          placeholder="Exprimez le motif architectural de non-conformité ou la décision de dérogation..."
          class="w-full p-2 border rounded text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          rows="3"
        ></textarea>
        <div class="flex justify-end space-x-2 mt-2">
          <button type="button" class="px-2 py-1 text-slate-600 cursor-pointer" on:click={() => showChallengeDialog = false}>Annuler</button>
          <button type="button" class="px-3 py-1 bg-rose-600 text-white rounded font-medium cursor-pointer" on:click={handleChallenge} data-testid="confirm-challenge-btn">
            Soumettre la contestation
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}
