<script lang="ts">
  import { browser } from '$app/environment';
  import { apiFetch } from '$lib/api/fetch';
  import { toast } from '$lib/toast/index.svelte';
  import { goto } from '$app/navigation';
  import { sanitizeRedirectTarget } from '$lib/domain/navigation';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import type { PageData } from './$types';

  // Granular icons
  import LogIn from 'lucide-svelte/icons/log-in';
  import Eye from 'lucide-svelte/icons/eye';
  import EyeOff from 'lucide-svelte/icons/eye-off';

  let { data }: { data: PageData } = $props();

  // Redirection si déjà connecté (côté client)
  if (browser && data.session) {
    goto('/');
  }

  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let showPassword = $state(false);

  const demoUsers = !import.meta.env.DEV ? [] : [
    // Comptes créés par `npm run db:reset` (prisma/seed-dev.ts) : affichés en développement seulement
    // (mots de passe publics, jamais proposés sur une instance construite).
    { label: 'Admin', email: 'admin@archinex.local', password: 'admin123', role: 'admin', roleLabel: 'admin' },
    { label: 'Architecte', email: 'architect@archinex.local', password: 'user123', role: 'user', roleLabel: 'utilisateur' },
    { label: 'Expert', email: 'expert@archinex.local', password: 'user123', role: 'user', roleLabel: 'utilisateur' },
  ];

  async function handleLogin(e: Event) {
    e.preventDefault();
    if (loading) return;

    loading = true;
    const { error } = await apiFetch<{ user: unknown; expires: string }>(
      '/api/auth/login',
      { method: 'POST', body: { email, password } }
    );

    if (error) {
      toast(error.message, { variant: 'error' });
      loading = false;
      return;
    }

    toast('Connexion réussie !', { variant: 'success' });
    const urlParams = new URLSearchParams(window.location.search);
    const redirectTo = sanitizeRedirectTarget(urlParams.get('redirectTo'));
    window.location.href = redirectTo;
  }

  function fillDemo(user: typeof demoUsers[0]) {
    email = user.email;
    password = user.password;
  }
</script>

<svelte:head>
  <title>Connexion — Archinex</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-muted/30 p-4">
  <div class="w-full max-w-md space-y-6">

    <!-- En-tête -->
    <div class="text-center">
      <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <LogIn class="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 class="text-2xl font-bold tracking-tight">Connexion</h1>
      <p class="mt-1 text-sm text-muted-foreground">Saisissez vos identifiants pour accéder à l'application</p>
    </div>

    <!-- Comptes de démonstration (développement seulement) -->
    {#if import.meta.env.DEV}
    <Card.Root>
      <Card.Header class="pb-3">
        <Card.Title class="text-sm font-medium text-muted-foreground">Comptes de démonstration</Card.Title>
      </Card.Header>
      <Card.Content class="flex flex-col sm:flex-row gap-2">
        {#each demoUsers as user}
          <button
            type="button"
            onclick={() => fillDemo(user)}
            class="flex-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted cursor-pointer"
          >
            <span class="font-medium">{user.label}</span>
            <span class="ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-xs
              {user.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}">
              {user.roleLabel}
            </span>
            <div class="mt-0.5 text-xs text-muted-foreground truncate">{user.email}</div>
          </button>
        {/each}
      </Card.Content>
    </Card.Root>
    {/if}

    <!-- Formulaire de connexion -->
    <Card.Root>
      <Card.Content class="pt-6">
        <form onsubmit={handleLogin} class="space-y-4">
          <div class="space-y-2">
            <label for="email" class="text-sm font-medium">Adresse e-mail</label>
            <input
              id="email"
              type="email"
              bind:value={email}
              required
              autocomplete="email"
              placeholder="admin@archinex.local"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                     ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div class="space-y-2">
            <label for="password" class="text-sm font-medium">Mot de passe</label>
            <div class="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                bind:value={password}
                required
                autocomplete="current-password"
                placeholder="••••••••"
                class="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm
                       ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                onclick={() => (showPassword = !showPassword)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {#if showPassword}
                  <EyeOff class="h-4 w-4" aria-hidden="true" />
                {:else}
                  <Eye class="h-4 w-4" aria-hidden="true" />
                {/if}
              </button>
            </div>
          </div>

          <Button type="submit" class="w-full" disabled={loading}>
            {#if loading}
              <span class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
              Connexion en cours…
            {:else}
              Se connecter
            {/if}
          </Button>
        </form>
      </Card.Content>
    </Card.Root>

  </div>
</div>
