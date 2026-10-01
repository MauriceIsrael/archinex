<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import Shield from 'lucide-svelte/icons/shield';
  import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';

  let { data } = $props();

  let password = $state('');
  let confirmPassword = $state('');
  let loading = $state(false);
  let errorMsg = $state('');
  let activated = $state(false);

  async function handleActivate() {
    errorMsg = '';
    if (password.length < 6) {
      errorMsg = 'Le mot de passe doit comporter au moins 6 caractères.';
      return;
    }
    if (password !== confirmPassword) {
      errorMsg = 'Les mots de passe saisis ne correspondent pas.';
      return;
    }

    loading = true;
    try {
      const res = await fetch('/api/invite/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: data.token,
          password
        })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.message || 'Échec de l’activation');
      }

      activated = true;
    } catch (err: any) {
      errorMsg = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Activation Compte Expert KB — Archinex</title>
</svelte:head>

<div class="flex min-h-[80vh] items-center justify-center p-4">
  <div class="w-full max-w-md">
    <Card.Root>
      <Card.Header class="space-y-2 text-center">
        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Shield class="h-6 w-6" />
        </div>
        <Card.Title class="text-xl font-bold tracking-tight">Activation Expert Knowledge Hub</Card.Title>
        <Card.Description>
          Plateforme de co-conception souveraine Archinex
        </Card.Description>
      </Card.Header>

      <Card.Content class="space-y-4 pt-2">
        {#if activated}
          <div class="space-y-4 text-center py-2">
            <div class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 class="h-6 w-6" />
            </div>
            <div>
              <h4 class="font-semibold text-base text-foreground">Compte expert activé avec succès</h4>
              <p class="text-xs text-muted-foreground mt-1">
                Vos habilitations KB sont synchronisées et opposables. Vous pouvez désormais vous connecter.
              </p>
            </div>
            <div class="pt-2">
              <Button href="/login" class="w-full">Accéder à la connexion</Button>
            </div>
          </div>

        {:else if !data.valid}
          <div class="space-y-4 text-center py-2">
            <div class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle class="h-6 w-6" />
            </div>
            <div>
              {#if data.alreadyActive}
                <h4 class="font-semibold text-base text-foreground">Compte déjà activé</h4>
                <p class="text-xs text-muted-foreground mt-1">
                  L'expert <strong>{data.expert?.name}</strong> ({data.expert?.kbHandle}) est déjà actif.
                </p>
                <div class="pt-4">
                  <Button href="/login" class="w-full">Se connecter</Button>
                </div>
              {:else}
                <h4 class="font-semibold text-base text-destructive">Lien d'invitation invalide</h4>
                <p class="text-xs text-muted-foreground mt-1">{data.error}</p>
                <div class="pt-4">
                  <Button href="/login" variant="outline" class="w-full">Retour à l'accueil</Button>
                </div>
              {/if}
            </div>
          </div>

        {:else if data.expert}
          <div class="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
            <div class="flex justify-between">
              <span class="text-muted-foreground">Expert invité :</span>
              <span class="font-medium text-foreground">{data.expert.name}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Email :</span>
              <span class="font-mono text-muted-foreground">{data.expert.email}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Handle KB :</span>
              <span class="font-mono text-primary">{data.expert.kbHandle}</span>
            </div>
            <div class="flex justify-between pt-1">
              <span class="text-muted-foreground">Habilitations :</span>
              <span class="font-mono text-[10px] text-foreground">{data.expert.kbRoles ? data.expert.kbRoles.join(', ') : ''}</span>
            </div>
          </div>

          <form onsubmit={(e) => { e.preventDefault(); handleActivate(); }} class="space-y-4 pt-2">
            {#if errorMsg}
              <div class="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                {errorMsg}
              </div>
            {/if}

            <div class="space-y-1.5">
              <Label for="new-pass" class="text-xs">Définir votre mot de passe</Label>
              <Input
                id="new-pass"
                type="password"
                bind:value={password}
                placeholder="Au moins 6 caractères"
                required
              />
            </div>

            <div class="space-y-1.5">
              <Label for="confirm-pass" class="text-xs">Confirmer le mot de passe</Label>
              <Input
                id="confirm-pass"
                type="password"
                bind:value={confirmPassword}
                placeholder="Répétez le mot de passe"
                required
              />
            </div>

            <Button type="submit" disabled={loading} class="w-full">
              {loading ? 'Activation en cours...' : 'Activer mon compte expert'}
            </Button>
          </form>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>
</div>
