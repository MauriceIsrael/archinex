import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import fs from 'node:fs';
import path from 'node:path';
import ProjectEngagementHeader from '$lib/components/deliberation/ProjectEngagementHeader.svelte';
import Phase3SubjectSelector from '$lib/components/deliberation/Phase3SubjectSelector.svelte';
import LLMOpsStatusBadge from '$lib/components/LLMOpsStatusBadge.svelte';
import HelpMenu from '$lib/components/HelpMenu.svelte';
import '$lib/i18n';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { createTestDefaultEngagements } from '../fixtures/sample-data';

describe('Refonte de l’en-tête Délibération et statut global LLMOps', () => {
	beforeEach(() => {
		deliberationStore.initFromDb(createTestDefaultEngagements(), []);
	});

	it('1. ProjectEngagementHeader n’affiche plus les boutons obsolètes/parasites et implémente la barre à 2 niveaux (Pattern A)', () => {
		const { html } = render(ProjectEngagementHeader);

		// Les anciens boutons parasites ne doivent plus être présents
		expect(html).not.toContain('Comment décider ?');
		expect(html).not.toContain('Inviter un Expert');
		expect(html).not.toContain('Opérateur Humain');
		expect(html).not.toContain('Agent IA');
		expect(html).not.toContain('header-role-select');
		expect(html).not.toContain('Vous êtes :');
		expect(html).not.toContain('Sceller</span>');

		// Les anciens boutons parasites et le panneau redondant "Projet & Engagement Actif :" ne doivent plus être présents
		expect(html).not.toContain('Projet &amp; Engagement Actif :');
		expect(html).not.toContain('+ Nouvel Espace');

		// La navigation 2 niveaux (Projet vs Sujet) est présente et explicite
		expect(html).toContain('project-engagement-header');
		expect(html).toContain('Projet :');
		expect(html).toContain('Phase 1');
		expect(html).toContain('Tableau des Sujets');
		expect(html).toContain('Phase 2');
		expect(html).toContain('Phase 3');
	});

	it('2. LLMOpsStatusBadge reflète l’état de synchronisation avec le Hub', () => {
		deliberationStore.llmopsStatus = 'connected';
		const connectedRender = render(LLMOpsStatusBadge);
		expect(connectedRender.html).toContain('LLMOps');
		expect(connectedRender.html).toContain('Connecté');

		deliberationStore.llmopsStatus = 'offline';
		const offlineRender = render(LLMOpsStatusBadge);
		expect(offlineRender.html).toContain('LLMOps');
		expect(offlineRender.html).toContain('Local');
	});

	it('3. HelpMenu expose l’accès à la modale méthodologique d’aide', () => {
		const { html } = render(HelpMenu);
		// Le menu d'aide rend le bouton et intègre le guide décisionnel
		expect(html).toBeDefined();
		expect(html).toContain('svg');
	});

	it('4. Phase3SubjectSelector affiche une barre de contexte sujet compacte 1 ligne avec navigation rapide', () => {
		const { html } = render(Phase3SubjectSelector);
		expect(html).toContain('data-testid="subject-context-bar"');
		expect(html).toContain('data-testid="prev-subject-btn"');
		expect(html).toContain('data-testid="next-subject-btn"');
		expect(html).toContain('data-testid="toggle-subject-drawer-btn"');
		expect(html).toContain('Tableau');
	});

	it('5. Le header global (+layout.svelte) affiche la pastille d’engagement actif renvoyant vers /workspaces', () => {
		const layoutContent = fs.readFileSync(path.resolve('src/routes/+layout.svelte'), 'utf8');
		expect(layoutContent).toContain('data-testid="active-engagement-pill"');
		expect(layoutContent).toContain('href="/workspaces"');
	});
});

