<script lang="ts">
  import { onMount } from 'svelte';

  interface OntologyTriplet {
    id: string;
    subject: string;
    predicate: 'requires_aspect' | 'implemented_by' | 'depends_on' | 'constrains' | 'conflicts_with';
    object: string;
    rationale?: string;
  }

  interface OntologyEntity {
    urn: string;
    revision: number | string;
    kind?: 'concept' | 'axis' | 'leaf';
    title?: string;
    domain?: string;
    keywords?: string[];
    oracle_rules?: string[];
    projections?: Record<string, unknown>;
  }

  let entities = $state<Record<string, OntologyEntity>>({});
  let triplets = $state<OntologyTriplet[]>([]);
  let isLoading = $state(true);
  let statusMessage = $state<{ text: string; type: 'success' | 'error' } | null>(null);

  // Formulaire d'ajout de triplet { Sujet, Verbe, Complément }
  let newSubject = $state('urn:archinex:ontology:concept:telco_cloud_platform');
  let newSubjectTitle = $state('');
  let newPredicate = $state<OntologyTriplet['predicate']>('requires_aspect');
  let newObject = $state('urn:archinex:ontology:axis:observability_telemetry');
  let newObjectTitle = $state('Axe de Raffinement : Observabilité & Télémétrie OpenTelemetry');
  let newRationale = $state('Toute plateforme distribuée requiert la traçabilité des métriques et journaux d’audit.');
  let isSubmitting = $state(false);

  // Filtres de la table des triplets
  let predicateFilter = $state<string>('ALL');
  let searchQuery = $state<string>('');

  const PREDICATE_LABELS: Record<
    OntologyTriplet['predicate'],
    { label: string; badgeClass: string; kaosRole: string }
  > = {
    requires_aspect: {
      label: 'requires_aspect (Requiert le sous-axe)',
      badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300',
      kaosRole: 'AND-Refinement (Obligatoire)'
    },
    implemented_by: {
      label: 'implemented_by (Raffiné / Implémenté par)',
      badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300',
      kaosRole: 'OR-Refinement (Feuille concrète)'
    },
    depends_on: {
      label: 'depends_on (Dépend de)',
      badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300',
      kaosRole: 'Couplage inter-axes'
    },
    constrains: {
      label: 'constrains (Contraint)',
      badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300',
      kaosRole: 'Invariant transversal'
    },
    conflicts_with: {
      label: 'conflicts_with (Incompatible avec)',
      badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300',
      kaosRole: 'Exclusion mutuelle'
    }
  };

  async function loadOntology() {
    isLoading = true;
    try {
      const res = await fetch('/api/knowledge/ontology');
      if (res.ok) {
        const data = await res.json();
        entities = data.entities || {};
        triplets = data.triplets || [];
      }
    } catch (err: any) {
      statusMessage = { text: err.message || 'Erreur chargement ontologie', type: 'error' };
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    void loadOntology();
  });

  async function handleAddTriplet(e: Event) {
    e.preventDefault();
    if (!newSubject.trim() || !newObject.trim()) return;
    isSubmitting = true;
    statusMessage = null;
    try {
      const res = await fetch('/api/knowledge/ontology', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_triplet',
          subject: newSubject.trim(),
          predicate: newPredicate,
          object: newObject.trim(),
          rationale: newRationale.trim(),
          subjectTitle: newSubjectTitle.trim() || undefined,
          objectTitle: newObjectTitle.trim() || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.catalog) {
        entities = data.catalog.entities || {};
        triplets = data.catalog.triplets || [];
        statusMessage = {
          text: data.message || 'Triplet ajouté avec succès dans le graphe d’ontologie.',
          type: 'success'
        };
      } else {
        statusMessage = { text: data.error || 'Erreur lors de l’ajout.', type: 'error' };
      }
    } catch (err: any) {
      statusMessage = { text: err.message, type: 'error' };
    } finally {
      isSubmitting = false;
    }
  }

  async function handleDeleteTriplet(id: string) {
    try {
      const res = await fetch(`/api/knowledge/ontology?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.catalog) {
        entities = data.catalog.entities || {};
        triplets = data.catalog.triplets || [];
        statusMessage = { text: `Triplet ${id} supprimé.`, type: 'success' };
      }
    } catch (err: any) {
      statusMessage = { text: err.message, type: 'error' };
    }
  }

  const allUrns = $derived(Object.keys(entities).sort());
  const concepts = $derived(
    Object.values(entities).filter(
      (e) => e.kind === 'concept' || triplets.some((t) => t.predicate === 'requires_aspect' && t.subject === e.urn)
    )
  );

  const filteredTriplets = $derived(
    triplets.filter((t) => {
      if (predicateFilter !== 'ALL' && t.predicate !== predicateFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const subjTitle = (entities[t.subject]?.title || '').toLowerCase();
        const objTitle = (entities[t.object]?.title || '').toLowerCase();
        return (
          t.subject.toLowerCase().includes(q) ||
          t.object.toLowerCase().includes(q) ||
          t.predicate.toLowerCase().includes(q) ||
          subjTitle.includes(q) ||
          objTitle.includes(q) ||
          (t.rationale || '').toLowerCase().includes(q)
        );
      }
      return true;
    })
  );
</script>

<div class="space-y-6" data-testid="ontology-triplets-editor">
  <!-- En-tête explicatif -->
  <div class="rounded-xl border bg-card p-5 shadow-2xs space-y-2">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <div>
        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
          Ingénierie Dirigée par l'Ontologie (KAOS AND/OR Goal Refinement)
        </span>
        <h2 class="text-lg font-bold text-foreground mt-1">
          🕸️ Graphe d'Ontologie & Éditeur de Triplets {'{ Sujet, Verbe, Complément }'}
        </h2>
      </div>
      <div class="flex items-center gap-3 text-xs text-muted-foreground">
        <span class="px-2.5 py-1 rounded-md bg-muted font-mono">
          <strong>{Object.keys(entities).length}</strong> entités URN
        </span>
        <span class="px-2.5 py-1 rounded-md bg-muted font-mono">
          <strong>{triplets.length}</strong> triplets actifs
        </span>
      </div>
    </div>
    <p class="text-xs text-muted-foreground leading-relaxed">
      Plutôt qu'un aiguillage syntaxique figé dans le code, la complétude du raffinement d'un sujet de haut niveau est calculée en interrogeant ce graphe de triplets :
      les relations <code class="font-mono text-indigo-600 dark:text-indigo-400">requires_aspect</code> définissent les <strong>axes obligatoires (conjonction AND)</strong> qu'une décision doit couvrir, et les relations <code class="font-mono text-emerald-600 dark:text-emerald-400">implemented_by</code> relient chaque axe aux <strong>feuilles d'ontologie exécutables (disjonction OR)</strong> porteuses des projections <code class="font-mono">data.ontology</code> et des règles Rego.
    </p>
  </div>

  {#if statusMessage}
    <div
      class="p-3 rounded-lg border text-xs font-medium flex items-center justify-between {statusMessage.type === 'success'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
        : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200'}"
      data-testid="ontology-status-banner"
    >
      <span>{statusMessage.text}</span>
      <button type="button" class="text-[11px] underline cursor-pointer" onclick={() => (statusMessage = null)}>
        Fermer
      </button>
    </div>
  {/if}

  <!-- 1. Formulaire d'édition de triplet { Sujet, Verbe, Complément } -->
  <form
    onsubmit={handleAddTriplet}
    class="rounded-xl border bg-card p-5 shadow-2xs space-y-4"
    data-testid="add-triplet-form"
  >
    <div class="flex items-center justify-between border-b pb-2">
      <h3 class="text-sm font-bold text-foreground">
        ➕ Ajouter ou enrichir un Triplet Ontologique {'{ Sujet, Verbe, Complément }'}
      </h3>
      <span class="text-[11px] text-muted-foreground">
        Les nouvelles URNs sont automatiquement créées dans le catalogue si elles n'existent pas encore
      </span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
      <!-- SUJET -->
      <div class="space-y-1.5 p-3 rounded-lg border bg-muted/20">
        <label for="triplet-subject" class="font-bold text-foreground flex items-center justify-between">
          <span>1. Sujet (URN Source)</span>
          <span class="text-[10px] font-mono text-muted-foreground">Concept / Axe / Feuille</span>
        </label>
        <input
          id="triplet-subject"
          list="ontology-urns-list"
          bind:value={newSubject}
          placeholder="urn:archinex:ontology:concept:..."
          class="w-full rounded border bg-background px-2.5 py-1.5 font-mono text-xs"
          data-testid="input-triplet-subject"
          required
        />
        <input
          type="text"
          bind:value={newSubjectTitle}
          placeholder="Titre lisible (si nouvelle URN)"
          class="w-full rounded border bg-background px-2.5 py-1 text-[11px]"
        />
        {#if entities[newSubject]}
          <div class="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium truncate">
            ✓ Existant : {entities[newSubject].title} ({entities[newSubject].kind || 'leaf'})
          </div>
        {:else}
          <div class="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
            ✨ Nouvelle entité URN créée à l'enregistrement
          </div>
        {/if}
      </div>

      <!-- VERBE (PRÉDICAT) -->
      <div class="space-y-1.5 p-3 rounded-lg border bg-muted/20">
        <label for="triplet-predicate" class="font-bold text-foreground flex items-center justify-between">
          <span>2. Verbe (Type de relation)</span>
          <span class="text-[10px] font-mono text-indigo-600 dark:text-indigo-400">Prédicat formel</span>
        </label>
        <select
          id="triplet-predicate"
          bind:value={newPredicate}
          class="w-full rounded border bg-background px-2.5 py-1.5 font-mono text-xs"
          data-testid="select-triplet-predicate"
        >
          <option value="requires_aspect">requires_aspect (Concept → Axe obligatoire)</option>
          <option value="implemented_by">implemented_by (Axe → Feuille d'implémentation)</option>
          <option value="depends_on">depends_on (Feuille → Dépendance technique)</option>
          <option value="constrains">constrains (Feuille → Contraint une autre feuille)</option>
          <option value="conflicts_with">conflicts_with (Exclusion mutuelle)</option>
        </select>
        <div class="text-[11px] text-muted-foreground pt-1">
          Sémantique KAOS : <strong>{PREDICATE_LABELS[newPredicate].kaosRole}</strong>
        </div>
      </div>

      <!-- COMPLÉMENT (OBJET) -->
      <div class="space-y-1.5 p-3 rounded-lg border bg-muted/20">
        <label for="triplet-object" class="font-bold text-foreground flex items-center justify-between">
          <span>3. Complément (URN Cible)</span>
          <span class="text-[10px] font-mono text-muted-foreground">Axe / Feuille cible</span>
        </label>
        <input
          id="triplet-object"
          list="ontology-urns-list"
          bind:value={newObject}
          placeholder="urn:archinex:ontology:axis:..."
          class="w-full rounded border bg-background px-2.5 py-1.5 font-mono text-xs"
          data-testid="input-triplet-object"
          required
        />
        <input
          type="text"
          bind:value={newObjectTitle}
          placeholder="Titre lisible (si nouvelle URN)"
          class="w-full rounded border bg-background px-2.5 py-1 text-[11px]"
          data-testid="input-triplet-object-title"
        />
        {#if entities[newObject]}
          <div class="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium truncate">
            ✓ Existant : {entities[newObject].title} ({entities[newObject].kind || 'leaf'})
          </div>
        {:else}
          <div class="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
            ✨ Nouvelle entité URN créée à l'enregistrement
          </div>
        {/if}
      </div>
    </div>

    <datalist id="ontology-urns-list">
      {#each allUrns as urn}
        <option value={urn}>{entities[urn]?.title || urn}</option>
      {/each}
    </datalist>

    <div class="flex items-center gap-3 flex-wrap">
      <input
        type="text"
        bind:value={newRationale}
        placeholder="Justification d'ingénierie / obligation d'architecture..."
        class="flex-1 min-w-[260px] rounded border bg-background px-3 py-1.5 text-xs"
        data-testid="input-triplet-rationale"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer"
        data-testid="submit-triplet-btn"
      >
        {isSubmitting ? '⏳ Enregistrement...' : '➕ Enregistrer le Triplet'}
      </button>
    </div>
  </form>

  <!-- 2. Visualisation Arborescente du Raffinement Multi-Axes (Concept -> Axes -> Feuilles) -->
  <div class="rounded-xl border bg-card p-5 shadow-2xs space-y-4">
    <h3 class="text-sm font-bold text-foreground border-b pb-2">
      🌳 Vue Structurelle de Décomposition Multi-Axes (Concepts HLD → Sous-Axes Requis → Feuilles & Oracles)
    </h3>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {#each concepts as concept}
        {@const reqAxes = triplets.filter((t) => t.subject === concept.urn && t.predicate === 'requires_aspect')}
        <div class="rounded-lg border p-4 bg-muted/10 space-y-3" data-testid="concept-tree-card">
          <div class="flex items-start justify-between gap-2">
            <div>
              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                CONCEPT HAUT NIVEAU
              </span>
              <h4 class="text-sm font-bold text-foreground mt-1">{concept.title || concept.urn}</h4>
              <p class="text-[11px] font-mono text-muted-foreground">{concept.urn}</p>
            </div>
            <span class="text-xs font-semibold px-2 py-0.5 rounded bg-muted">
              {reqAxes.length} sous-axe(s) requis
            </span>
          </div>

          <div class="space-y-2 pl-3 border-l-2 border-indigo-400/50">
            {#each reqAxes as axTriplet}
              {@const axisEntity = entities[axTriplet.object]}
              {@const implLeaves = triplets.filter((t) => t.subject === axTriplet.object && t.predicate === 'implemented_by')}
              <div class="p-2.5 rounded border bg-background space-y-1.5">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5">
                    <span class="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      ──requires_aspect──▶
                    </span>
                    <span class="text-xs font-bold text-foreground">
                      {axisEntity?.title || axTriplet.object}
                    </span>
                  </div>
                  <span class="text-[10px] font-mono text-muted-foreground">{axTriplet.object.split(':').pop()}</span>
                </div>
                {#if axTriplet.rationale}
                  <p class="text-[11px] text-muted-foreground italic">{axTriplet.rationale}</p>
                {/if}

                <!-- Feuilles d'implémentation rattachées à cet axe -->
                <div class="pl-3 pt-1 space-y-1 border-l border-emerald-400/60">
                  {#if implLeaves.length === 0}
                    <div class="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                      ⚠️ Aucune feuille (implemented_by) rattachée à cet axe dans l'ontologie.
                    </div>
                  {:else}
                    {#each implLeaves as lfTriplet}
                      {@const leaf = entities[lfTriplet.object]}
                      <div class="text-[11px] flex items-center justify-between gap-2 bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/20">
                        <div>
                          <span class="font-mono text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold">
                            ↳ implemented_by :
                          </span>
                          <strong class="text-foreground ml-1">{leaf?.title || lfTriplet.object}</strong>
                          <span class="font-mono text-[10px] text-muted-foreground ml-1">({lfTriplet.object})</span>
                        </div>
                        <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 shrink-0">
                          {(leaf?.oracle_rules || []).length} règle(s) Rego
                        </span>
                      </div>
                    {/each}
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- 3. Table Complète et Filtrable des Triplets { Sujet, Verbe, Complément } -->
  <div class="rounded-xl border bg-card p-5 shadow-2xs space-y-4">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <h3 class="text-sm font-bold text-foreground">
        📋 Registre des Triplets Ontologiques ({filteredTriplets.length} / {triplets.length})
      </h3>
      <div class="flex items-center gap-2 flex-wrap text-xs">
        <select bind:value={predicateFilter} class="rounded border bg-background px-2.5 py-1 text-xs">
          <option value="ALL">Tous les verbes ({triplets.length})</option>
          <option value="requires_aspect">requires_aspect</option>
          <option value="implemented_by">implemented_by</option>
          <option value="depends_on">depends_on</option>
          <option value="constrains">constrains</option>
          <option value="conflicts_with">conflicts_with</option>
        </select>
        <input
          type="search"
          bind:value={searchQuery}
          placeholder="Filtrer par sujet, verbe, complément..."
          class="rounded border bg-background px-2.5 py-1 text-xs w-60"
        />
      </div>
    </div>

    {#if isLoading}
      <div class="p-6 text-center text-xs text-muted-foreground">Chargement du graphe d'ontologie...</div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs" data-testid="triplets-table">
          <thead>
            <tr class="border-b bg-muted/40 text-muted-foreground uppercase text-[10px]">
              <th class="py-2 px-3">Sujet (Source)</th>
              <th class="py-2 px-3">Verbe (Relation)</th>
              <th class="py-2 px-3">Complément (Cible)</th>
              <th class="py-2 px-3">Justification / Règle de Raffinement</th>
              <th class="py-2 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            {#each filteredTriplets as t (t.id)}
              <tr class="hover:bg-muted/20" data-testid="triplet-row">
                <td class="py-2.5 px-3 align-top">
                  <div class="font-semibold text-foreground">{entities[t.subject]?.title || t.subject}</div>
                  <div class="font-mono text-[10px] text-muted-foreground">{t.subject}</div>
                </td>
                <td class="py-2.5 px-3 align-top">
                  <span class="inline-block px-2 py-0.5 rounded border text-[10px] font-mono font-bold {PREDICATE_LABELS[t.predicate]?.badgeClass || ''}">
                    {t.predicate}
                  </span>
                  <div class="text-[10px] text-muted-foreground mt-0.5">
                    {PREDICATE_LABELS[t.predicate]?.kaosRole || ''}
                  </div>
                </td>
                <td class="py-2.5 px-3 align-top">
                  <div class="font-semibold text-foreground">{entities[t.object]?.title || t.object}</div>
                  <div class="font-mono text-[10px] text-muted-foreground">{t.object}</div>
                </td>
                <td class="py-2.5 px-3 align-top text-muted-foreground max-w-md">
                  {t.rationale || '—'}
                </td>
                <td class="py-2.5 px-3 align-top text-right">
                  <button
                    type="button"
                    onclick={() => handleDeleteTriplet(t.id)}
                    class="px-2 py-1 rounded text-[10px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    data-testid="delete-triplet-btn"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
