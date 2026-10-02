<script lang="ts">
  import {
    Shield,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Info,
    History,
    Check,
    X,
    FileText,
    HelpCircle
  } from 'lucide-svelte';
  import type {
    SimilarKnowledgeItem,
    AssumptionStatus,
    ReuseOutcome,
    ReuseConfirmation
  } from '$lib/types/llmops';
  import { toast } from '$lib/toast/index.svelte';

  let {
    isOpen = false,
    subjectLabel = '',
    subjectFingerprint = '',
    asset,
    actorEmail = 'architect@archinex.local',
    onConfirm,
    onClose
  }: {
    isOpen: boolean;
    subjectLabel: string;
    subjectFingerprint: string;
    asset: SimilarKnowledgeItem | null;
    actorEmail?: string;
    onConfirm?: (confirmation: ReuseConfirmation) => void;
    onClose: () => void;
  } = $props();

  let assumptionsJudgements = $state<Array<{ text: string; status: AssumptionStatus; note: string }>>([]);
  let outcome = $state<ReuseOutcome>('reused');
  let comment = $state('');
  let isSubmitting = $state(false);

  $effect(() => {
    if (asset) {
      assumptionsJudgements = (asset.assumptions || []).map((text) => ({
        text,
        status: 'holds' as AssumptionStatus,
        note: ''
      }));
      outcome = 'reused';
      comment = '';
    }
  });

  const allHold = $derived(
    assumptionsJudgements.length === 0 || assumptionsJudgements.every((a) => a.status === 'holds')
  );
  const anyFails = $derived(assumptionsJudgements.some((a) => a.status === 'does_not_hold'));
  const anyUnknownOrFails = $derived(assumptionsJudgements.some((a) => a.status !== 'holds'));

  const isFormValid = $derived.by(() => {
    if (!asset) return false;
    if (outcome === 'reused') {
      return allHold;
    }
    if (outcome === 'reused_with_exception') {
      return anyUnknownOrFails && comment.trim().length > 0;
    }
    if (outcome === 'rejected_assumption_fails') {
      return anyFails;
    }
    if (outcome === 'rejected_not_same') {
      return comment.trim().length > 0;
    }
    if (outcome === 'deferred') {
      return true;
    }
    return false;
  });

  async function submitConfirmation() {
    if (!asset || !isFormValid) return;

    isSubmitting = true;
    try {
      const payload = {
        subject_fingerprint: subjectFingerprint,
        subject_label: subjectLabel,
        matched_ref: asset.ref,
        outcome,
        assumptions: assumptionsJudgements.map((a) => ({
          text: a.text,
          status: a.status,
          note: a.note ? a.note.trim() : null
        })),
        comment: comment.trim() || undefined,
        scores: asset.scores
      };

      const res = await fetch('/api/knowledge/reuse-confirmations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Actor-Email': actorEmail
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.data) {
        toast(`Arbitrage enregistré pour ${asset.ref} (${outcome})`, { variant: 'success' });
        if (onConfirm) {
          onConfirm(data.data);
        }
        onClose();
      } else {
        toast(data.error || 'Erreur lors de la validation', { variant: 'error' });
      }
    } catch (e: any) {
      toast(e.message || 'Erreur réseau', { variant: 'error' });
    } finally {
      isSubmitting = false;
    }
  }
</script>

{#if isOpen && asset}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
    <div
      class="bg-card border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-card-foreground"
      role="dialog"
      aria-modal="true"
    >
      <!-- Header -->
      <div class="p-6 border-b border-border flex items-start justify-between bg-muted/20">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-primary/10 text-primary border border-primary/20">
              {asset.type.toUpperCase()} : {asset.ref}
            </span>
            {#if asset.zone === 'strong'}
              <span class="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Zone Forte ({Math.round(asset.score * 100)}%)
              </span>
            {:else if asset.zone === 'possible'}
              <span class="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Zone Possible ({Math.round(asset.score * 100)}%)
              </span>
            {:else if asset.zone === 'superseded'}
              <span class="px-2 py-0.5 text-xs font-medium rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                Obsolète
              </span>
            {/if}
          </div>
          <h2 class="text-lg font-bold leading-tight">{asset.title}</h2>
          <p class="text-xs text-muted-foreground mt-1">
            Sujet soumis : <strong class="text-foreground">{subjectLabel}</strong>
          </p>
        </div>
        <button
          onclick={onClose}
          class="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
          aria-label="Fermer"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Warning D8 Banner -->
      <div class="px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
        <AlertTriangle class="w-4 h-4 shrink-0 text-amber-500" />
        <span>
          <strong>Garantie Zéro Faux Positif Silencieux (D8) :</strong> Aucune décision n’est réutilisée sans vérification explicite des hypothèses par l’architecte.
        </span>
      </div>

      <!-- Body Content -->
      <div class="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
        <!-- Hypotheses Review -->
        <div>
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <Shield class="w-4 h-4 text-primary" />
            1. Examen des Hypothèses Documentées ({assumptionsJudgements.length})
          </h3>

          {#if assumptionsJudgements.length === 0}
            <div class="p-4 rounded-lg bg-muted/40 border border-border text-muted-foreground text-xs italic">
              Cet actif ne comporte pas d’hypothèses documentées dans son en-tête. La réutilisation porte sur la portée générale.
            </div>
          {:else}
            <div class="space-y-3">
              {#each assumptionsJudgements as item, i}
                <div class="p-3.5 rounded-lg border border-border bg-muted/20 space-y-2">
                  <div class="font-medium text-xs text-foreground">
                    « {item.text} »
                  </div>
                  <div class="flex flex-wrap items-center gap-2 text-xs pt-1">
                    <label class="flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded border border-border hover:bg-muted {item.status === 'holds' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-medium' : ''}">
                      <input
                        type="radio"
                        name={`hyp-${i}`}
                        value="holds"
                        bind:group={item.status}
                        class="accent-emerald-600"
                      />
                      <span>Valide (holds)</span>
                    </label>

                    <label class="flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded border border-border hover:bg-muted {item.status === 'does_not_hold' ? 'bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300 font-medium' : ''}">
                      <input
                        type="radio"
                        name={`hyp-${i}`}
                        value="does_not_hold"
                        bind:group={item.status}
                        class="accent-rose-600"
                      />
                      <span>Invalide (does not hold)</span>
                    </label>

                    <label class="flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded border border-border hover:bg-muted {item.status === 'unknown' ? 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300 font-medium' : ''}">
                      <input
                        type="radio"
                        name={`hyp-${i}`}
                        value="unknown"
                        bind:group={item.status}
                        class="accent-amber-600"
                      />
                      <span>Inconnu / À clarifier</span>
                    </label>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Outcome Selection -->
        <div>
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <CheckCircle2 class="w-4 h-4 text-primary" />
            2. Décision d'Arbitrage (Outcome)
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <!-- Reused -->
            <label class="p-3 rounded-lg border text-left cursor-pointer transition-all flex flex-col justify-between {outcome === 'reused' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/40'} {!allHold ? 'opacity-50 cursor-not-allowed' : ''}">
              <div class="flex items-center justify-between mb-1">
                <span class="font-semibold text-xs text-foreground">Réutiliser tel quel</span>
                <input
                  type="radio"
                  name="outcome"
                  value="reused"
                  bind:group={outcome}
                  disabled={!allHold}
                  class="accent-primary"
                />
              </div>
              <p class="text-[11px] text-muted-foreground">Toutes les hypothèses tiennent dans ce nouveau contexte.</p>
            </label>

            <!-- Reused with exception -->
            <label class="p-3 rounded-lg border text-left cursor-pointer transition-all flex flex-col justify-between {outcome === 'reused_with_exception' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/40'}">
              <div class="flex items-center justify-between mb-1">
                <span class="font-semibold text-xs text-foreground">Réutiliser avec exception</span>
                <input
                  type="radio"
                  name="outcome"
                  value="reused_with_exception"
                  bind:group={outcome}
                  class="accent-primary"
                />
              </div>
              <p class="text-[11px] text-muted-foreground">Une hypothèse diverge mais une mesure compensatoire est prévue.</p>
            </label>

            <!-- Rejected assumption fails -->
            <label class="p-3 rounded-lg border text-left cursor-pointer transition-all flex flex-col justify-between {outcome === 'rejected_assumption_fails' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/40'} {!anyFails ? 'opacity-50 cursor-not-allowed' : ''}">
              <div class="flex items-center justify-between mb-1">
                <span class="font-semibold text-xs text-foreground">Rejeter (hypothèse rompue)</span>
                <input
                  type="radio"
                  name="outcome"
                  value="rejected_assumption_fails"
                  bind:group={outcome}
                  disabled={!anyFails}
                  class="accent-primary"
                />
              </div>
              <p class="text-[11px] text-muted-foreground">L'actif ne s'applique pas car une hypothèse essentielle est fausse.</p>
            </label>

            <!-- Rejected not same -->
            <label class="p-3 rounded-lg border text-left cursor-pointer transition-all flex flex-col justify-between {outcome === 'rejected_not_same' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/40'}">
              <div class="flex items-center justify-between mb-1">
                <span class="font-semibold text-xs text-foreground">Rejeter (pas le même sujet)</span>
                <input
                  type="radio"
                  name="outcome"
                  value="rejected_not_same"
                  bind:group={outcome}
                  class="accent-primary"
                />
              </div>
              <p class="text-[11px] text-muted-foreground">Faux positif lexical : le sujet traité est différent.</p>
            </label>
          </div>
        </div>

        <!-- Comment Field -->
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5" for="arbitration-comment">
            3. Commentaire & Justification {outcome === 'reused_with_exception' || outcome === 'rejected_not_same' ? '(Obligatoire)' : '(Optionnel)'}
          </label>
          <textarea
            id="arbitration-comment"
            bind:value={comment}
            placeholder={outcome === 'reused_with_exception'
              ? 'Précisez l’exception et la compensation (ex: procédure manuelle de repli)...'
              : outcome === 'rejected_not_same'
              ? 'Précisez pourquoi le sujet est différent (ex: concerne le génie civil physique)...'
              : 'Observations contextuelles pour l’historique d’audit...'}
            rows="3"
            class="w-full text-xs p-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          ></textarea>
        </div>

        <!-- Past Judgements History -->
        {#if asset.judgements && asset.judgements.length > 0}
          <div>
            <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <History class="w-3.5 h-3.5 text-primary" />
              Historique des arbitrages passés pour ce sujet ({asset.judgements.length})
            </h3>
            <div class="space-y-2">
              {#each asset.judgements as j}
                <div class="p-2.5 rounded border border-border bg-muted/30 text-xs flex items-start justify-between">
                  <div>
                    <span class="font-semibold text-foreground">{j.actor}</span>
                    <span class="text-muted-foreground"> ({new Date(j.at).toLocaleDateString()}) : </span>
                    <span class="font-mono text-primary font-medium">{j.outcome}</span>
                    {#if j.comment}
                      <p class="text-muted-foreground mt-0.5 italic">« {j.comment} »</p>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer Actions -->
      <div class="p-4 border-t border-border flex items-center justify-between bg-muted/20">
        <div class="text-xs text-muted-foreground">
          Attribué à : <span class="font-medium text-foreground">{actorEmail}</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            onclick={onClose}
            class="px-4 py-2 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Annuler
          </button>
          <button
            data-testid="btn-submit-reuse-confirmation"
            onclick={submitConfirmation}
            disabled={!isFormValid || isSubmitting}
            class="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
          >
            {#if isSubmitting}
              Enregistrement...
            {:else}
              <Check class="w-4 h-4" />
              Confirmer l'Arbitrage
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
