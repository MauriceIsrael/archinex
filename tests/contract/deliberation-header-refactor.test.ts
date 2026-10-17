import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import ProjectEngagementHeader from '$lib/components/deliberation/ProjectEngagementHeader.svelte';
import LLMOpsStatusBadge from '$lib/components/LLMOpsStatusBadge.svelte';
import HelpMenu from '$lib/components/HelpMenu.svelte';
import '$lib/i18n';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { createTestDefaultEngagements } from '../fixtures/sample-data';

describe('Refonte de l’en-tête Délibération et statut global LLMOps', () => {
	beforeEach(() => {
		deliberationStore.initFromDb(createTestDefaultEngagements(), []);
	});

	it('1. ProjectEngagementHeader n’affiche plus les boutons obsolètes/parasites', () => {
		const { html } = render(ProjectEngagementHeader);

		// Les anciens boutons parasites ne doivent plus être présents
		expect(html).not.toContain('Comment décider ?');
		expect(html).not.toContain('Inviter un Expert');
		expect(html).not.toContain('Opérateur Humain');
		expect(html).not.toContain('Agent IA');
		expect(html).not.toContain('header-role-select');
		expect(html).not.toContain('Vous êtes :');
		expect(html).not.toContain('Sceller</span>');

		// Les éléments légitimes du projet restent présents
		expect(html).toContain('Projet &amp; Engagement Actif :');
		expect(html).toContain('100% Local &amp; Souverain');
		expect(html).toContain('Phase 1');
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
});

