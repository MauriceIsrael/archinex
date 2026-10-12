<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import Shield from 'lucide-svelte/icons/shield';
</script>

<div class="flex min-h-[60vh] items-center justify-center p-6">
  <div class="max-w-md text-center space-y-4">
    <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <Shield class="h-6 w-6" />
    </div>
    <h1 class="text-xl font-bold">Gestion centralisée des comptes</h1>
    <p class="text-sm text-muted-foreground">
      La gestion des comptes, des rôles par espace et des identités LLMOps est désormais regroupée dans l'administration.
    </p>
    <Button href="/admin">Ouvrir la gestion des comptes</Button>
  </div>
</div>
