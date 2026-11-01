import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('EDP UI & API Integration Contract', () => {
  const rootDir = process.cwd();

  it('fournit la route API pour les EDP par sujet et projet', () => {
    const apiRoute = resolve(rootDir, 'src/routes/api/projects/[projectId]/subjects/[subjectId]/edp/+server.ts');
    expect(existsSync(apiRoute)).toBe(true);

    const content = readFileSync(apiRoute, 'utf-8');
    expect(content).toContain('export const GET: RequestHandler');
    expect(content).toContain('export const POST: RequestHandler');
    expect(content).toContain('isEdpFeatureEnabled');
    expect(content).toContain('verifyEdp');
  });

  it('expose isExperimentalEnabled dans la page de délibération (+page.server.ts)', () => {
    const pageServer = resolve(rootDir, 'src/routes/deliberation/+page.server.ts');
    const content = readFileSync(pageServer, 'utf-8');

    expect(content).toContain('isExperimentalEnabled');
    expect(content).toContain("event.url.searchParams.get('edp') === '1'");
  });

  it('intègre EdpCard dans SubjectThreadView avec transmission des props', () => {
    const viewFile = resolve(rootDir, 'src/lib/components/deliberation/SubjectThreadView.svelte');
    const content = readFileSync(viewFile, 'utf-8');

    expect(content).toContain("import EdpCard from '$lib/components/edp/EdpCard.svelte';");
    expect(content).toContain('isExperimentalEnabled = false');
    expect(content).toContain('loadEdpForSubject');
    expect(content).toContain('handleValidateEdp');
    expect(content).toContain('handleRunVerifyEdp');
    expect(content).toContain('edp-section-matrix');
  });

  it('transmet isExperimentalEnabled à travers DeliberationWorkbench', () => {
    const workbenchFile = resolve(rootDir, 'src/lib/components/deliberation/DeliberationWorkbench.svelte');
    const content = readFileSync(workbenchFile, 'utf-8');

    expect(content).toContain('isExperimentalEnabled = false');
    expect(content).toContain('{isExperimentalEnabled}');
  });
});
