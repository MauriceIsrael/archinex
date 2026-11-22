import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import {
  GET as getEdpHandler,
  POST as postEdpHandler
} from '../../src/routes/api/projects/[projectId]/subjects/[subjectId]/edp/+server';
import { load as deliberationPageLoad } from '../../src/routes/deliberation/+page.server';
import ProjectEngagementHeader from '$lib/components/deliberation/ProjectEngagementHeader.svelte';
import Phase4RefinementHub from '$lib/components/deliberation/Phase4RefinementHub.svelte';
import SubjectThreadView from '$lib/components/deliberation/SubjectThreadView.svelte';
import '$lib/i18n';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { createTestDefaultEngagements } from '../fixtures/sample-data';

describe('EDP UI & API Integration Contract', () => {
  beforeEach(() => {
    deliberationStore.initFromDb(createTestDefaultEngagements(), []);
  });

  it('fournit la route API GET/POST pour les EDP par sujet et projet sans drapeau expérimental bloquant', async () => {
    expect(typeof getEdpHandler).toBe('function');
    expect(typeof postEdpHandler).toBe('function');

    // Vérifie que la page /deliberation n'expose plus de drapeau expérimental EDP
    const data = (await deliberationPageLoad({
      locals: {
        session: {
          user: {
            id: 'usr-test-edp',
            email: 'edp@test.local',
            role: 'user',
            attributes: { projectRole: 'lead_architect' }
          }
        }
      },
      url: new URL('http://localhost/deliberation')
    } as any)) as Record<string, unknown>;

    expect(data).not.toHaveProperty('isExperimentalEnabled');
    expect(data).not.toHaveProperty('isEdpFeatureEnabled');
  });

  it('retire l’onglet et les sections Oracle EDP de SubjectThreadView (délibération)', () => {
    const { html } = render(SubjectThreadView, { props: {} as any });

    expect(html).not.toContain('tab-unified-edp');
    expect(html).not.toContain('unified-edp-pane');
    expect(html).not.toContain('edp-section-matrix');
    expect(html).not.toContain('edp-section-doctrines');
    expect(html).not.toContain('Oracle EDP');
  });

  it('concentre l’atelier Oracle EDP & Raffinement exclusivement en Phase 4', () => {
    const header = render(ProjectEngagementHeader);
    expect(header.html).toContain('phase-tab-refinement');

    const phase4 = render(Phase4RefinementHub);
    expect(phase4.html).toContain('phase4-refinement-hub');
    expect(phase4.html).toContain("Exécuter l'Oracle OPA");
  });
});
