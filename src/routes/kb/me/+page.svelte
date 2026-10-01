<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import Shield from 'lucide-svelte/icons/shield';
  import CheckCircle from 'lucide-svelte/icons/check-circle';
  import Inbox from 'lucide-svelte/icons/inbox';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import Lock from 'lucide-svelte/icons/lock';
  import Globe from 'lucide-svelte/icons/globe';

  let { data } = $props();

  const roleDescriptions: Record<string, { label: string; desc: string; color: string }> = {
    'kb:review': {
      label: 'Revue Doctrinale (kb:review)',
      desc: 'Pouvoir de voter, d’approuver ou de rejeter les candidats de règles et amendements de doctrine.',
      color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
    },
    'kb:evaluate': {
      label: 'Évaluations (kb:evaluate)',
      desc: 'Capacité à exécuter des suites de tests, annoter les verdicts et piloter les benchmarks.',
      color: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20'
    },
    'kb:maintain': {
      label: 'Maintenance de Doctrine (kb:maintain)',
      desc: 'Édition directe, refactorisation et dépréciation de clauses doctrinales et de prompts.',
      color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
    },
    'kb:admin': {
      label: 'Administration KB (kb:admin)',
      desc: 'Gouvernance globale des propriétaires de domaines, publication de releases et arbitrages ultimes.',
      color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20'
    }
  };
</script>

<svelte:head>
  <title>Profil Expert Knowledge Hub — Archinex</title>
</svelte:head>

<div class="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-5xl mx-auto">
  <!-- Header -->
  <div class="flex items-center justify-between border-b pb-4">
    <div class="flex items-center gap-3">
      <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Shield class="h-6 w-6" />
      </div>
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Profil d'Expertise Knowledge Hub</h1>
        <p class="text-xs text-muted-foreground font-mono">
          Identité souveraine propagée : <span class="text-foreground">{data.user.email}</span>
        </p>
      </div>
    </div>

    <!-- Status badge -->
    <div>
      {#if data.llmops.offline}
        <span class="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
          <Lock class="h-3.5 w-3.5" /> Mode Hors-Ligne (Repli Local)
        </span>
      {:else}
        <span class="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <Globe class="h-3.5 w-3.5" /> Knowledge Hub Connecté
        </span>
      {/if}
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <!-- Colonne gauche : Carte d'identité expert -->
    <Card.Root class="md:col-span-1">
      <Card.Header>
        <Card.Title class="text-base">Identité d'Expert</Card.Title>
        <Card.Description>Attributs et opposabilité</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4 text-xs">
        <div>
          <span class="text-muted-foreground block mb-0.5">Nom complet</span>
          <span class="font-medium text-sm text-foreground">{data.user.name}</span>
        </div>

        <div>
          <span class="text-muted-foreground block mb-0.5">Handle KB unique</span>
          <code class="text-sm font-bold text-primary font-mono">{data.expert.kbHandle}</code>
        </div>

        <div>
          <span class="text-muted-foreground block mb-0.5">Rôle système</span>
          <span class="capitalize text-muted-foreground font-mono">{data.user.role}</span>
        </div>

        <div>
          <span class="text-muted-foreground block mb-0.5">Délégation LLMOps</span>
          {#if data.expert.delegated}
            <span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle class="h-3.5 w-3.5" /> Actif et opposable
            </span>
          {:else}
            <span class="text-muted-foreground italic">Non délégué</span>
          {/if}
        </div>

        <div class="pt-2 border-t">
          <span class="text-muted-foreground block mb-1.5">Domaines de responsabilité</span>
          <div class="flex flex-wrap gap-1.5">
            {#if data.expert.ownedDomains.length === 0}
              <span class="text-muted-foreground italic">Aucun domaine exclusif (générique)</span>
            {:else}
              {#each data.expert.ownedDomains as domain}
                <span class="inline-flex items-center px-2 py-0.5 rounded bg-muted text-[11px] font-mono text-foreground border">
                  {domain}
                </span>
              {/each}
            {/if}
          </div>
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Colonne droite : Rôles et Actions d'expertise -->
    <div class="md:col-span-2 space-y-6">
      <!-- Boîte de révision en attente (Teaser Lot A7) -->
      <Card.Root class="border-primary/20 bg-primary/5">
        <Card.Content class="p-5 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Inbox class="h-5 w-5" />
            </div>
            <div>
              <h4 class="font-semibold text-sm text-foreground">File de Revue Doctrinale</h4>
              <p class="text-xs text-muted-foreground">
                {data.expert.pendingReviews === 0
                  ? 'Aucun candidat de règle en attente de votre arbitrage.'
                  : `${data.expert.pendingReviews} candidat(s) de règle en attente de votre vote.`}
              </p>
            </div>
          </div>
          <div class="text-right">
            <div class="text-2xl font-bold font-mono text-primary">{data.expert.pendingReviews}</div>
            <span class="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">En attente</span>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Détail des habilitations KB -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">Habilitations & Privilèges Doctrinaux</Card.Title>
          <Card.Description>Privilèges accordés dans le cadre de la gouvernance Casbin & Knowledge Hub</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-3">
          {#if data.expert.kbRoles.length === 0}
            <div class="p-4 rounded-lg bg-muted text-center text-xs text-muted-foreground">
              Vous ne disposez actuellement d'aucun rôle expert KB actif. Contactez un administrateur.
            </div>
          {:else}
            {#each data.expert.kbRoles as role}
              {@const info = roleDescriptions[role] || { label: role, desc: 'Rôle d’expertise', color: 'bg-muted' }}
              <div class="rounded-lg border p-3.5 space-y-1 {info.color}">
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-xs">{info.label}</span>
                  <span class="inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] bg-background/50 font-semibold">{role}</span>
                </div>
                <p class="text-xs opacity-90">{info.desc}</p>
              </div>
            {/each}
          {/if}
        </Card.Content>
      </Card.Root>
    </div>
  </div>
</div>
