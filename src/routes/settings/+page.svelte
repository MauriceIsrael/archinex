<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Card from '$lib/components/ui/card';
  import { t } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import ProjectRulesPanel from '$lib/components/deliberation/ProjectRulesPanel.svelte';
  import { Sliders } from 'lucide-svelte';

  let projects = $state<Array<{ id: string; title: string; shortName: string }>>([]);
  let selectedProjectId = $state<string>('');

  onMount(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        projects = data.projects || [];
        if (projects.length > 0) {
          selectedProjectId = projects[0].id;
        }
      }
    } catch (err) {
      console.warn('Erreur chargement projets dans settings:', err);
    }
  });
</script>

<div class="flex-1 space-y-4 p-4 md:p-8 pt-6">
  <div class="flex items-center justify-between space-y-2">
    <h2 class="text-3xl font-bold tracking-tight">{$t('settings.title')}</h2>
  </div>

  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    <Card.Root class="col-span-2">
      <Card.Header>
        <Card.Title>{$t('settings.profile.title')}</Card.Title>
        <Card.Description>
          {$t('settings.profile.desc')}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <form class="space-y-8">
          <div class="space-y-2">
            <Label for="username">{$t('settings.profile.username')}</Label>
            <Input id="username" placeholder="shadcn" />
            <p class="text-[0.8rem] text-muted-foreground">
              {$t('settings.profile.usernameDesc')}
            </p>
          </div>
          
          <div class="space-y-2">
            <Label for="email">{$t('settings.profile.email')}</Label>
            <Input id="email" type="email" placeholder="m@example.com" />
            <p class="text-[0.8rem] text-muted-foreground">
              {$t('settings.profile.emailDesc')}
            </p>
          </div>
          
          <Button type="button">{$t('settings.profile.update')}</Button>
        </form>
      </Card.Content>
    </Card.Root>

    <!-- Section Règles du Projet (Lot A30) -->
    <Card.Root class="col-span-2 lg:col-span-3">
      <Card.Header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Sliders class="h-5 w-5 text-primary" />
            <Card.Title>Règles du Projet (Lot A30)</Card.Title>
          </div>
          {#if projects.length > 0}
            <div class="flex items-center gap-2">
              <Label for="project-select" class="text-xs text-muted-foreground">Projet actif :</Label>
              <select
                id="project-select"
                bind:value={selectedProjectId}
                class="px-2 py-1 text-xs rounded-md border bg-background font-medium"
              >
                {#each projects as prj}
                  <option value={prj.id}>{prj.title} ({prj.shortName || prj.id})</option>
                {/each}
              </select>
            </div>
          {/if}
        </div>
        <Card.Description>
          Gouvernance des règles de référence et locales, désactivation justifiée et capitalisation (K21/LLMOps#70).
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {#if selectedProjectId}
          <div class="rounded-xl border bg-card">
            <ProjectRulesPanel projectId={selectedProjectId} />
          </div>
        {:else}
          <p class="text-xs text-muted-foreground">Aucun projet disponible.</p>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>
</div>
