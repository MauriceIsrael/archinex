<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import Play from 'lucide-svelte/icons/play';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import Shield from 'lucide-svelte/icons/shield';
  import CheckCircle from 'lucide-svelte/icons/check-circle';
  import XCircle from 'lucide-svelte/icons/x-circle';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import Send from 'lucide-svelte/icons/send';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import FileCode from 'lucide-svelte/icons/file-code';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import Lock from 'lucide-svelte/icons/lock';
  import type {
    KbAssetType,
    KbAssetTemplate,
    CandidateValidationResult,
    ClauseSimulationResult
  } from '$lib/types/llmops';

  let { data } = $props();

  const assetTypes: Array<{ type: KbAssetType; label: string; desc: string }> = [
    { type: 'principle', label: 'Principe Fondamental', desc: 'Orientation stratégique pérenne' },
    { type: 'pattern', label: 'Patron d’Architecture', desc: 'Solution éprouvée à problème récurrent' },
    { type: 'decision', label: 'Décision (ADR)', desc: 'Arbitrage technologique formel' },
    { type: 'control', label: 'Règle de Contrôle', desc: 'Clause de conformité vérifiable' },
    { type: 'glossary', label: 'Terme du Glossaire', desc: 'Définition canonique sans ambiguïté' },
    { type: 'rule', label: 'Règle Standard', desc: 'Exigence normative générale' },
    { type: 'amendment', label: 'Amendement', desc: 'Évolution d’une règle existante' }
  ];

  let selectedAssetType = $state<KbAssetType>('principle');
  let currentTemplate = $state<KbAssetTemplate | null>(data.initialTemplate || null);

  // Form Fields
  let title = $state<string>(data.initialTemplate?.title || 'Principe d’Immuabilité des Traces d’Audit');
  let domain = $state<string>(data.expert.ownedDomains[0] || 'security');
  let summary = $state<string>(data.initialTemplate?.skeleton || '');
  let rationale = $state<string>('Garantir l’opposabilité légale et la traçabilité des opérations sensibles.');

  // Prédicats testables
  let whenPredicate = $state<string>(data.initialTemplate?.default_predicates.when || '');
  let expectPredicate = $state<string>(data.initialTemplate?.default_predicates.expect || '');
  let requiresInput = $state<string>((data.initialTemplate?.default_predicates.requires || []).join(', '));
  let forbidsInput = $state<string>((data.initialTemplate?.default_predicates.forbids || []).join(', '));

  // Résultats simulation & validation
  let isValidating = $state<boolean>(false);
  let isSimulating = $state<boolean>(false);
  let isSubmitting = $state<boolean>(false);

  let validationResult = $state<CandidateValidationResult | null>(null);
  let simulationResult = $state<ClauseSimulationResult | null>(null);

  let errorMessage = $state<string | null>(null);
  let successCandidateId = $state<string | null>(null);

  async function handleSelectType(type: KbAssetType) {
    selectedAssetType = type;
    errorMessage = null;
    successCandidateId = null;

    try {
      const res = await fetch(`/api/knowledge/templates/${type}`);
      const body = await res.json();
      if (res.ok && body.data) {
        currentTemplate = body.data;
        title = body.data.title;
        summary = body.data.skeleton;
        whenPredicate = body.data.default_predicates.when;
        expectPredicate = body.data.default_predicates.expect;
        requiresInput = (body.data.default_predicates.requires || []).join(', ');
        forbidsInput = (body.data.default_predicates.forbids || []).join(', ');
      }
    } catch {
      // Ignorer erreur réseau
    }
  }

  async function runDryRunValidation() {
    isValidating = true;
    errorMessage = null;

    try {
      const payload = {
        kind: selectedAssetType,
        title,
        domain,
        summary,
        rationale,
        predicates: {
          when: whenPredicate,
          expect: expectPredicate,
          requires: requiresInput.split(',').map((s) => s.trim()).filter(Boolean),
          forbids: forbidsInput.split(',').map((s) => s.trim()).filter(Boolean)
        }
      };

      const res = await fetch('/api/knowledge/candidates/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const body = await res.json();
      if (res.ok && body.data) {
        validationResult = body.data;
      } else {
        errorMessage = body.error || 'Erreur lors de la validation';
      }
    } finally {
      isValidating = false;
    }
  }

  async function runSimulation() {
    isSimulating = true;
    errorMessage = null;

    try {
      const payload = {
        asset_type: selectedAssetType,
        title,
        domain,
        predicates: {
          when: whenPredicate,
          expect: expectPredicate,
          requires: requiresInput.split(',').map((s) => s.trim()).filter(Boolean),
          forbids: forbidsInput.split(',').map((s) => s.trim()).filter(Boolean)
        }
      };

      const res = await fetch('/api/knowledge/checks/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const body = await res.json();
      if (res.ok && body.data) {
        simulationResult = body.data;
      } else {
        errorMessage = body.error || 'Erreur lors de la simulation';
      }
    } finally {
      isSimulating = false;
    }
  }

  async function handleSubmitToReview() {
    isSubmitting = true;
    errorMessage = null;
    successCandidateId = null;

    try {
      const payload = {
        kind: selectedAssetType,
        title,
        summary,
        rationale,
        domain,
        predicates: {
          when: whenPredicate,
          expect: expectPredicate,
          requires: requiresInput.split(',').map((s) => s.trim()).filter(Boolean),
          forbids: forbidsInput.split(',').map((s) => s.trim()).filter(Boolean)
        },
        source: {
          system: 'archinex',
          engagement: 'kb-workshop'
        },
        author: data.user.email,
        production_mode: 'human-authored'
      };

      const res = await fetch('/api/knowledge/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const body = await res.json();
      if (res.ok && body.data) {
        successCandidateId = body.data.id || 'candidat-enregistre';
      } else {
        errorMessage = body.error || 'Erreur lors de la soumission';
      }
    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:head>
  <title>Atelier de Doctrine & Clauses Testables — Archinex</title>
</svelte:head>

<div class="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-7xl mx-auto">
  <!-- En-tête -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
    <div class="flex items-center gap-3">
      <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Sparkles class="h-6 w-6" />
      </div>
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Atelier de Doctrine & Simulation de Clauses</h1>
        <p class="text-xs text-muted-foreground font-mono">
          Rédaction formelle, prédicats testables et calcul de régression en temps réel
        </p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <Button variant="outline" size="sm" href="/kb/reviews">
        Boîte de Revue
      </Button>
      <Button variant="secondary" size="sm" href="/kb/me">
        Mon Profil KB
      </Button>
    </div>
  </div>

  <!-- Messages feedback -->
  {#if errorMessage}
    <div class="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive flex items-start gap-3">
      <AlertTriangle class="h-5 w-5 shrink-0 mt-0.5" />
      <div>
        <h4 class="font-bold text-sm">Erreur</h4>
        <p class="mt-0.5">{errorMessage}</p>
      </div>
    </div>
  {/if}

  {#if successCandidateId}
    <div class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <CheckCircle class="h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <h4 class="font-bold text-sm">Candidat Enregistré avec Succès !</h4>
          <p class="mt-0.5">La clause a été versée à la boîte de réception des revues pour examen collégial.</p>
        </div>
      </div>
      <Button size="sm" href="/kb/reviews" class="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
        <span>Voir dans la boîte de revue</span>
        <ArrowRight class="h-3.5 w-3.5" />
      </Button>
    </div>
  {/if}

  <!-- Sélecteur de type d'actif (Gabarits) -->
  <div class="flex flex-wrap items-center gap-2 border-b pb-3">
    <span class="text-xs font-bold text-muted-foreground mr-2">Modèle d'Actif :</span>
    {#each assetTypes as at}
      <button
        class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all {selectedAssetType === at.type ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'}"
        onclick={() => handleSelectType(at.type)}
      >
        {at.label}
      </button>
    {/each}
  </div>

  <!-- Grille Studio 2 Colonnes -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
    <!-- COLONNE GAUCHE (7/12) : Édition structurée & Prédicats -->
    <div class="lg:col-span-7 space-y-6">
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base flex items-center gap-2">
            <FileCode class="h-4 w-4 text-primary" /> Rdaction de la Clause
          </Card.Title>
          <Card.Description>
            {currentTemplate?.description || 'Formulation de la clause de doctrine'}
          </Card.Description>
        </Card.Header>

        <Card.Content class="space-y-4 text-xs">
          <!-- Titre & Domaine -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="sm:col-span-2 space-y-1">
              <label for="clause-title" class="font-bold text-foreground">Intitulé de l'actif * :</label>
              <input
                id="clause-title"
                type="text"
                bind:value={title}
                placeholder="Ex: Chiffrement Homomorphe des Données au Repos"
                class="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:ring-1 focus:ring-primary"
              />
            </div>

            <div class="space-y-1">
              <label for="clause-domain" class="font-bold text-foreground">Domaine * :</label>
              <select
                id="clause-domain"
                bind:value={domain}
                class="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:ring-1 focus:ring-primary"
              >
                {#each data.expert.ownedDomains as d}
                  <option value={d}>{d}</option>
                {/each}
                <option value="security">security</option>
                <option value="cloud">cloud</option>
                <option value="architecture">architecture</option>
                <option value="data">data</option>
                <option value="devops">devops</option>
              </select>
            </div>
          </div>

          <!-- Énoncé / Synthèse -->
          <div class="space-y-1">
            <label for="clause-summary" class="font-bold text-foreground">Énoncé Assertif (Markdown) * :</label>
            <textarea
              id="clause-summary"
              bind:value={summary}
              rows="6"
              placeholder="Rédigez l'énoncé sans ambiguïté..."
              class="w-full rounded-md border border-input bg-background p-2.5 font-mono text-xs focus:ring-1 focus:ring-primary leading-relaxed"
            ></textarea>
          </div>

          <!-- Rationale -->
          <div class="space-y-1">
            <label for="clause-rationale" class="font-bold text-foreground">Motivation & Justification :</label>
            <textarea
              id="clause-rationale"
              bind:value={rationale}
              rows="2"
              placeholder="Contexte réglementaire, REX d'incident, exigence souveraine..."
              class="w-full rounded-md border border-input bg-background p-2 text-xs focus:ring-1 focus:ring-primary"
            ></textarea>
          </div>

          <!-- Section Prédicats Testables (when, expect, requires, forbids) -->
          <div class="pt-3 border-t space-y-3">
            <div class="flex items-center justify-between">
              <span class="font-bold text-sm text-foreground flex items-center gap-1.5">
                <BookOpen class="h-4 w-4 text-primary" /> Prédicats Testables (Machine-Readable)
              </span>
              <span class="text-[11px] text-muted-foreground">Standard Archinex Assertions</span>
            </div>

            <div class="grid grid-cols-1 gap-3 p-3 rounded-xl border bg-muted/20">
              <div class="space-y-1">
                <label for="pred-when" class="font-mono text-[11px] font-bold text-primary">WHEN (Contexte d'activation) :</label>
                <input
                  id="pred-when"
                  type="text"
                  bind:value={whenPredicate}
                  placeholder="Ex: Dans tout composant manipulant des clés cryptographiques"
                  class="w-full h-8 rounded-md border border-input bg-background px-2.5 font-mono text-xs focus:ring-1 focus:ring-primary"
                />
              </div>

              <div class="space-y-1">
                <label for="pred-expect" class="font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400">EXPECT (Assertion vérifiée) :</label>
                <input
                  id="pred-expect"
                  type="text"
                  bind:value={expectPredicate}
                  placeholder="Ex: L'utilisation d'un module HSM souverain certifié est requise"
                  class="w-full h-8 rounded-md border border-input bg-background px-2.5 font-mono text-xs focus:ring-1 focus:ring-primary"
                />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="space-y-1">
                  <label for="pred-requires" class="font-mono text-[11px] font-bold text-foreground">REQUIRES (Prérequis séparés par virgule) :</label>
                  <input
                    id="pred-requires"
                    type="text"
                    bind:value={requiresInput}
                    placeholder="PKI interne, Audit log..."
                    class="w-full h-8 rounded-md border border-input bg-background px-2.5 font-mono text-xs focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div class="space-y-1">
                  <label for="pred-forbids" class="font-mono text-[11px] font-bold text-destructive">FORBIDS (Anti-patrons proscrits) :</label>
                  <input
                    id="pred-forbids"
                    type="text"
                    bind:value={forbidsInput}
                    placeholder="Clé en clair, TLS < 1.3..."
                    class="w-full h-8 rounded-md border border-input bg-background px-2.5 font-mono text-xs focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Actions Formulaire -->
          <div class="flex items-center justify-between pt-3 border-t">
            <Button
              variant="outline"
              size="sm"
              disabled={isValidating}
              onclick={runDryRunValidation}
              class="gap-1.5"
            >
              <RefreshCw class="h-3.5 w-3.5 {isValidating ? 'animate-spin' : ''}" />
              <span>Valider à blanc</span>
            </Button>

            <Button
              size="sm"
              disabled={isSubmitting || !title.trim() || !summary.trim()}
              onclick={handleSubmitToReview}
              class="gap-1.5"
            >
              <Send class="h-3.5 w-3.5" />
              <span>Soumettre à la revue</span>
            </Button>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Panneau Validation à Blanc si disponible -->
      {#if validationResult}
        <Card.Root>
          <Card.Header>
            <Card.Title class="text-sm flex items-center justify-between">
              <span class="flex items-center gap-2">
                {#if validationResult.valid}
                  <CheckCircle class="h-4 w-4 text-emerald-600" />
                {:else}
                  <XCircle class="h-4 w-4 text-destructive" />
                {/if}
                Rapport de Validation Préalable
              </span>
              <span class="text-xs font-mono font-bold {validationResult.all_checks_passed ? 'text-emerald-600' : 'text-amber-600'}">
                {validationResult.checks.filter(c => c.passed).length} / {validationResult.checks.length} contrôles au vert
              </span>
            </Card.Title>
          </Card.Header>
          <Card.Content class="space-y-2 text-xs">
            {#if validationResult.errors.length > 0}
              <div class="p-2.5 rounded-lg bg-destructive/10 text-destructive space-y-1">
                <strong class="block">Erreurs bloquantes :</strong>
                {#each validationResult.errors as err}
                  <div>• {err}</div>
                {/each}
              </div>
            {/if}

            {#if validationResult.warnings.length > 0}
              <div class="p-2.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 space-y-1">
                <strong class="block">Recommandations :</strong>
                {#each validationResult.warnings as warn}
                  <div>• {warn}</div>
                {/each}
              </div>
            {/if}

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              {#each validationResult.checks as c}
                <div class="p-2 rounded border flex items-center justify-between {c.passed ? 'border-emerald-500/30' : 'border-destructive/30'}">
                  <span class="font-medium text-[11px] truncate">{c.label}</span>
                  <span class="text-[10px] font-bold uppercase {c.passed ? 'text-emerald-600' : 'text-destructive'}">
                    {c.passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
              {/each}
            </div>
          </Card.Content>
        </Card.Root>
      {/if}
    </div>

    <!-- COLONNE DROITE (5/12) : Simulation d'Impact & Métriques de Régression -->
    <div class="lg:col-span-5 space-y-6">
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base flex items-center justify-between">
            <span class="flex items-center gap-2">
              <Play class="h-4 w-4 text-primary" /> Simulateur d'Impact
            </span>
            <Button
              size="sm"
              variant="default"
              disabled={isSimulating || !title.trim()}
              onclick={runSimulation}
              class="gap-1.5"
            >
              <Play class="h-3.5 w-3.5 {isSimulating ? 'animate-spin' : ''}" />
              <span>Tester la clause</span>
            </Button>
          </Card.Title>
          <Card.Description>
            Évaluation instantanée contre le banc de test d'options de référence
          </Card.Description>
        </Card.Header>

        <Card.Content class="space-y-4 text-xs">
          {#if !simulationResult}
            <div class="py-12 text-center text-muted-foreground space-y-2">
              <Play class="h-8 w-8 mx-auto opacity-30" />
              <p class="font-medium">Aucune simulation exécutée</p>
              <p class="text-[11px] max-w-xs mx-auto">
                Cliquez sur « Tester la clause » pour exécuter le banc d'évaluation, mesurer la précision et détecter d'éventuelles régressions de rappel.
              </p>
            </div>
          {:else}
            <!-- Alerte de Régression (Porte G6) -->
            {#if simulationResult.regression_detected}
              <div class="rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-xs text-destructive space-y-1 animate-pulse">
                <div class="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle class="h-4 w-4 shrink-0" />
                  Régression de Rappel Détectée
                </div>
                <p class="text-[11px] leading-relaxed">
                  {simulationResult.regression_details || 'Cette formulation introduit des faux négatifs sur la suite de référence historique.'}
                </p>
              </div>
            {/if}

            <!-- Métriques Précision / Rappel -->
            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-xl border p-3 bg-card space-y-1">
                <span class="text-muted-foreground text-[11px] block">Précision Estimée</span>
                <span class="text-2xl font-bold font-mono text-foreground">
                  {simulationResult.precision}%
                </span>
                <span class="text-[10px] text-muted-foreground block">Taux de vrais positifs</span>
              </div>

              <div class="rounded-xl border p-3 bg-card space-y-1">
                <span class="text-muted-foreground text-[11px] block">Rappel de Doctrine</span>
                <span class="text-2xl font-bold font-mono {simulationResult.regression_detected ? 'text-destructive' : 'text-emerald-600'}">
                  {simulationResult.recall}%
                </span>
                <span class="text-[10px] text-muted-foreground block">
                  {simulationResult.passed_cases} / {simulationResult.total_cases} cas conformes
                </span>
              </div>
            </div>

            <!-- Liste des cas de test simulés -->
            <div class="space-y-2">
              <span class="font-bold text-foreground block">Résultats par Cas de Test ({simulationResult.verdicts.length}) :</span>
              <div class="space-y-2 max-h-80 overflow-y-auto pr-1">
                {#each simulationResult.verdicts as v}
                  <div class="p-2.5 rounded-lg border text-xs space-y-1 {v.matched ? 'bg-card' : 'border-destructive/40 bg-destructive/5'}">
                    <div class="flex items-center justify-between text-[11px]">
                      <span class="font-bold text-foreground truncate max-w-[200px]">{v.case_label}</span>
                      <span class="font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 rounded {v.status === 'supports' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-destructive/10 text-destructive'}">
                        {v.status}
                      </span>
                    </div>
                    <p class="text-[11px] text-muted-foreground leading-snug">{v.rationale}</p>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    </div>
  </div>
</div>
