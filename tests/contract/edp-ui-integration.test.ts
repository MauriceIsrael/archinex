import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('EDP UI & API Integration Contract', () => {
  const rootDir = process.cwd();

  it('fournit la route API pour les EDP par sujet et projet', () => {
    const apiRoute = resolve(rootDir, 'src/routes/api/projects/[projectId]/subjects/[subjectId]/edp/+server.ts');
    const verifyRoute = resolve(rootDir, 'src/routes/api/projects/[projectId]/subjects/[subjectId]/edp/verify/+server.ts');
    expect(existsSync(apiRoute)).toBe(true);
    expect(existsSync(verifyRoute)).toBe(true);

    const content = readFileSync(apiRoute, 'utf-8');
    expect(content).toContain('export const GET: RequestHandler');
    expect(content).toContain('export const POST: RequestHandler');
    expect(content).not.toContain('isEdpFeatureEnabled');
    expect(content).not.toContain('isExperimentalEnabled');
    expect(content).toContain('dispatchEdpAction');

    const verifyContent = readFileSync(verifyRoute, 'utf-8');
    expect(verifyContent).toContain('handleVerifyEdp');
  });

  it('n\'a plus aucun drapeau expérimental : ni dans la page, ni dans l\'en-tête, ni dans la carte EDP', () => {
    for (const f of [
      'src/routes/deliberation/+page.server.ts',
      'src/routes/deliberation/+page.svelte',
      'src/lib/components/deliberation/ProjectEngagementHeader.svelte',
      'src/lib/components/edp/EdpCard.svelte',
      'src/lib/server/edp/edpRepository.ts'
    ]) {
      const content = readFileSync(resolve(rootDir, f), 'utf-8');
      expect(content, f).not.toMatch(/isExperimentalEnabled|ARCHINEX_EXPERIMENTAL_EDP|isEdpFeatureEnabled/);
    }
  });

  it('retire l’onglet et les sections Oracle EDP de SubjectThreadView (délibération)', () => {
    const viewFile = resolve(rootDir, 'src/lib/components/deliberation/SubjectThreadView.svelte');
    const content = readFileSync(viewFile, 'utf-8');

    expect(content).not.toContain('tab-unified-edp');
    expect(content).not.toContain('unified-edp-pane');
    expect(content).not.toContain('edp-section-matrix');
    expect(content).not.toContain('edp-section-doctrines');
    expect(content).not.toContain('Oracle EDP');
    expect(content).not.toContain('EdpCard');
  });

  it('concentre l’atelier Oracle EDP & Raffinement exclusivement en Phase 4', () => {
    const headerFile = resolve(rootDir, 'src/lib/components/deliberation/ProjectEngagementHeader.svelte');
    const headerContent = readFileSync(headerFile, 'utf-8');
    expect(headerContent).toContain('phase-tab-refinement');
    expect(headerContent).not.toContain('isExperimentalEnabled');

    const pageFile = resolve(rootDir, 'src/routes/deliberation/+page.svelte');
    const pageContent = readFileSync(pageFile, 'utf-8');
    expect(pageContent).toContain('Phase4RefinementHub');
    expect(pageContent).toContain("activePosture === 'refinement'");

    const phase4File = resolve(rootDir, 'src/lib/components/deliberation/Phase4RefinementHub.svelte');
    expect(existsSync(phase4File)).toBe(true);
    const phase4Content = readFileSync(phase4File, 'utf-8');
    expect(phase4Content).toContain('phase4-refinement-hub');
    expect(phase4Content).toContain("Exécuter l'Oracle OPA");
  });
});
