<script lang="ts">
  import type { KbOwnersRegistry } from '$lib/types/llmops';
  import Check from 'lucide-svelte/icons/check';
  import X from 'lucide-svelte/icons/x';
  import Search from 'lucide-svelte/icons/search';
  import Plus from 'lucide-svelte/icons/plus';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import Shield from 'lucide-svelte/icons/shield';
  import Radio from 'lucide-svelte/icons/radio';

  const DEFAULT_SUITE_DOMAINS = [
    // 3GPP & Télécom
    'conformance',
    'interoperability',
    'telecom-core',
    'mobile-core',
    'network-exposure',
    '5g-security',
    'mission-critical-services',
    'mission-critical-security',
    'sba',
    'boundary-protection',
    'key-management',
    'roaming',
    'isolated-operation',
    'sim-identity',
    'iot',
    'ran',
    'spectrum',
    'tactical-comms',
    'tactical-device',
    // Sécurité & Conformité
    'security',
    'security-architecture',
    'security-cryptography',
    'security-governance',
    'security-monitoring',
    'compliance',
    'compliance-evaluation',
    'audit',
    'audit-logging',
    'cryptography',
    'cyber-hygiene',
    'iam',
    'identity',
    'identity-access-management',
    'hardening',
    'vulnerability-management',
    'endpoint-security',
    'container-security',
    'infrastructure-security',
    'network-security',
    'data-protection',
    'privacy',
    'third-party-risk',
    'supply-chain',
    'sovereignty',
    'incident-handling',
    // Architecture & Cloud
    'architecture',
    'cloud-platform',
    'infrastructure',
    'it-infrastructure',
    'network-automation',
    'automation-devops',
    'devsecops',
    'resilience',
    'disaster-recovery',
    'business-continuity',
    'observability',
    'api',
    'api-security'
  ];

  const PACK_3GPP = [
    'conformance',
    'interoperability',
    'telecom-core',
    'mobile-core',
    '5g-security',
    'network-exposure',
    'sba',
    'mission-critical-security'
  ];

  const PACK_SECURITY = [
    'security',
    'security-architecture',
    'hardening',
    'cryptography',
    'vulnerability-management',
    'iam',
    'compliance'
  ];

  let {
    selectedDomains = $bindable<string[]>([]),
    ownersRegistry,
    disabled = false
  } = $props<{
    selectedDomains: string[];
    ownersRegistry?: KbOwnersRegistry;
    disabled?: boolean;
  }>();

  let searchQuery = $state('');
  let activeCategory = $state<'all' | '3gpp' | 'security' | 'architecture'>('all');

  // Tous les domaines disponibles (registre LLMOps + catalogue par défaut)
  const allAvailableDomains = $derived.by(() => {
    const fromRegistry = ownersRegistry?.domains ? Object.keys(ownersRegistry.domains) : [];
    const combined = new Set([...fromRegistry, ...DEFAULT_SUITE_DOMAINS, ...selectedDomains]);
    return Array.from(combined).sort();
  });

  function isDomainInPack(dom: string, pack: '3gpp' | 'security' | 'architecture'): boolean {
    const d = dom.toLowerCase();
    if (pack === '3gpp') {
      return (
        d.includes('3gpp') ||
        d.includes('telecom') ||
        d.includes('conformance') ||
        d.includes('interoperability') ||
        d.includes('core') ||
        d.includes('5g') ||
        d.includes('sba') ||
        d.includes('mission-critical') ||
        d.includes('critical') ||
        d.includes('roaming') ||
        d.includes('ran') ||
        d.includes('spectrum') ||
        d.includes('radio') ||
        d.includes('tactical') ||
        d.includes('sim') ||
        d.includes('iot')
      );
    }
    if (pack === 'security') {
      return (
        d.includes('security') ||
        d.includes('compliance') ||
        d.includes('audit') ||
        d.includes('crypto') ||
        d.includes('hygiene') ||
        d.includes('iam') ||
        d.includes('identity') ||
        d.includes('hardening') ||
        d.includes('vulnerability') ||
        d.includes('privacy') ||
        d.includes('protection') ||
        d.includes('risk') ||
        d.includes('sovereignty')
      );
    }
    if (pack === 'architecture') {
      return (
        d.includes('architecture') ||
        d.includes('cloud') ||
        d.includes('infra') ||
        d.includes('automation') ||
        d.includes('devops') ||
        d.includes('resilience') ||
        d.includes('observability') ||
        d.includes('api')
      );
    }
    return true;
  }

  const filteredDomains = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    return allAvailableDomains.filter((dom) => {
      const matchesSearch = !q || dom.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (activeCategory === 'all') return true;
      return isDomainInPack(dom, activeCategory);
    });
  });

  function toggleDomain(dom: string) {
    if (disabled) return;
    const clean = dom.trim().toLowerCase();
    if (!clean) return;
    if (selectedDomains.includes(clean)) {
      selectedDomains = selectedDomains.filter((d: string) => d !== clean);
    } else {
      selectedDomains = [...selectedDomains, clean];
    }
  }

  function addCustomDomain() {
    if (disabled) return;
    const clean = searchQuery.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (clean && !selectedDomains.includes(clean)) {
      selectedDomains = [...selectedDomains, clean];
      searchQuery = '';
    }
  }

  function applyPack(pack: string[]) {
    if (disabled) return;
    const set = new Set([...selectedDomains, ...pack]);
    selectedDomains = Array.from(set);
  }

  function clearAll() {
    if (disabled) return;
    selectedDomains = [];
  }
</script>

<div class="space-y-3">
  <!-- En-tête avec compteur et actions rapides -->
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
      <span>Domaines sélectionnés ({selectedDomains.length})</span>
      {#if selectedDomains.length > 0}
        <button
          type="button"
          onclick={clearAll}
          {disabled}
          class="text-[11px] text-muted-foreground hover:text-rose-600 transition-colors ml-2 underline"
        >
          Tout désélectionner
        </button>
      {/if}
    </div>

    <!-- Raccourcis thématiques 1-clic -->
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onclick={() => applyPack(PACK_3GPP)}
        {disabled}
        class="inline-flex items-center gap-1 rounded-md bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 px-2 py-1 text-[11px] font-semibold transition-colors"
      >
        <Radio class="h-3 w-3" />
        <span>+ Pack 3GPP</span>
      </button>

      <button
        type="button"
        onclick={() => applyPack(PACK_SECURITY)}
        {disabled}
        class="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-2 py-1 text-[11px] font-semibold transition-colors"
      >
        <Shield class="h-3 w-3" />
        <span>+ Pack Sécurité</span>
      </button>
    </div>
  </div>

  <!-- Badges des domaines sélectionnés -->
  {#if selectedDomains.length > 0}
    <div class="flex flex-wrap gap-1.5 p-2 rounded-md bg-primary/5 border border-primary/20 max-h-24 overflow-y-auto">
      {#each selectedDomains as dom (dom)}
        <span class="inline-flex items-center gap-1 rounded bg-primary text-primary-foreground px-2 py-0.5 text-xs font-mono font-medium shadow-2xs">
          <span>{dom}</span>
          {#if !disabled}
            <button
              type="button"
              onclick={() => toggleDomain(dom)}
              class="hover:opacity-80 rounded-full p-0.5"
              aria-label={`Supprimer ${dom}`}
            >
              <X class="h-3 w-3" />
            </button>
          {/if}
        </span>
      {/each}
    </div>
  {:else}
    <div class="rounded border border-dashed p-2 text-center text-xs text-muted-foreground">
      Aucun domaine sélectionné. Choisissez parmi les compétences ci-dessous ou appliquez un pack.
    </div>
  {/if}

  <!-- Barre de recherche et filtres de catégorie -->
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <div class="relative flex-1">
        <Search class="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Rechercher une compétence (ex: 3gpp, conformance, core, security)..."
          {disabled}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustomDomain();
            }
          }}
          class="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {#if searchQuery.trim() && !allAvailableDomains.includes(searchQuery.trim().toLowerCase())}
        <button
          type="button"
          onclick={addCustomDomain}
          {disabled}
          class="inline-flex items-center gap-1 rounded bg-secondary px-2.5 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
        >
          <Plus class="h-3.5 w-3.5" />
          <span>Ajouter « {searchQuery.trim()} »</span>
        </button>
      {/if}
    </div>

    <!-- Onglets de filtres -->
    <div class="flex flex-wrap gap-1 text-[11px]">
      <button
        type="button"
        onclick={() => (activeCategory = 'all')}
        class="px-2 py-0.5 rounded border transition-colors {activeCategory === 'all' ? 'bg-primary text-primary-foreground font-semibold border-primary' : 'bg-background hover:bg-muted text-muted-foreground'}"
      >
        Tous ({allAvailableDomains.length})
      </button>
      <button
        type="button"
        onclick={() => (activeCategory = '3gpp')}
        class="px-2 py-0.5 rounded border transition-colors {activeCategory === '3gpp' ? 'bg-purple-600 text-white font-semibold border-purple-600' : 'bg-background hover:bg-muted text-muted-foreground'}"
      >
        3GPP & Télécom
      </button>
      <button
        type="button"
        onclick={() => (activeCategory = 'security')}
        class="px-2 py-0.5 rounded border transition-colors {activeCategory === 'security' ? 'bg-emerald-600 text-white font-semibold border-emerald-600' : 'bg-background hover:bg-muted text-muted-foreground'}"
      >
        Sécurité & Conformité
      </button>
      <button
        type="button"
        onclick={() => (activeCategory = 'architecture')}
        class="px-2 py-0.5 rounded border transition-colors {activeCategory === 'architecture' ? 'bg-sky-600 text-white font-semibold border-sky-600' : 'bg-background hover:bg-muted text-muted-foreground'}"
      >
        Architecture & Cloud
      </button>
    </div>
  </div>

  <!-- Grille des badges sélectionnables -->
  <div class="max-h-48 overflow-y-auto rounded border bg-muted/20 p-2.5">
    {#if filteredDomains.length === 0}
      <p class="text-xs text-muted-foreground italic text-center py-2">
        Aucun domaine ne correspond à « {searchQuery} ».
      </p>
    {:else}
      <div class="flex flex-wrap gap-1.5">
        {#each filteredDomains as dom (dom)}
          {@const isSelected = selectedDomains.includes(dom)}
          <button
            type="button"
            onclick={() => toggleDomain(dom)}
            {disabled}
            class="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-mono transition-all cursor-pointer {isSelected ? 'bg-primary text-primary-foreground border-primary font-semibold shadow-2xs' : 'bg-background hover:bg-muted text-foreground border-input'}"
          >
            {#if isSelected}
              <Check class="h-3 w-3" />
            {/if}
            <span>{dom}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
