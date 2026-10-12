import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { requiresSession } from '../../src/hooks.server';

/**
 * L'identité envoyée à LLMOps (X-Actor-Email) vient de la session, jamais d'un en-tête du navigateur :
 * avec le jeton délégant d'Archinex, un en-tête choisi par l'appelant permettrait d'agir au nom de n'importe quel
 * expert. Garde statique + garde de session.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('Identité de l’acteur : session uniquement', () => {
  const routes = walk('src/routes').filter((p) => p.endsWith('.ts'));

  it('aucune route ne lit l’en-tête x-actor-email du navigateur', () => {
    const offenders = routes.filter((p) => /headers\.get\(\s*['"]x-actor-email['"]\s*\)/i.test(readFileSync(p, 'utf-8')));
    expect(offenders).toEqual([]);
  });

  it('aucune route ne se rabat sur une identité fictive', () => {
    const offenders = routes.filter((p) => /architect@archinex\.local|eva@example\.org/.test(readFileSync(p, 'utf-8')));
    expect(offenders).toEqual([]);
  });

  it('les routes qui parlent à LLMOps exigent une session', () => {
    for (const path of ['/api/knowledge/candidates/CAND-1', '/api/knowledge/reuse-confirmations', '/api/frameworks/ingestions']) {
      expect(requiresSession(path), path).toBe(true);
    }
    expect(requiresSession('/login')).toBe(false);
  });

  it('toutes les routes d’écriture sous /api/projects/[projectId] vérifient authorizeProjectAccess (#81)', () => {
    const projectRoutes = walk('src/routes/api/projects/[projectId]').filter((p) => p.endsWith('+server.ts'));
    const writeRoutes = projectRoutes.filter((p) => {
      const content = readFileSync(p, 'utf-8');
      return /export\s+const\s+(POST|PATCH|PUT|DELETE)\b/.test(content);
    });
    expect(writeRoutes.length).toBeGreaterThan(30);
    const missingAuth = writeRoutes.filter((p) => {
      const content = readFileSync(p, 'utf-8');
      return !content.includes('authorizeProjectAccess') || !content.includes('auth.error');
    });
    expect(missingAuth).toEqual([]);
  });

  it('toutes les routes sous /api/admin vérifient requireRole (#81)', () => {
    const adminRoutes = walk('src/routes/api/admin').filter((p) => p.endsWith('+server.ts'));
    expect(adminRoutes.length).toBeGreaterThan(0);
    const missingRole = adminRoutes.filter((p) => !readFileSync(p, 'utf-8').includes('requireRole'));
    expect(missingRole).toEqual([]);
  });

  it('aucun garde mort (requirePermission, requireKbRole, requireKbPermission) ne subsiste dans src/ (#81)', () => {
    const srcFiles = walk('src').filter((p) => p.endsWith('.ts') || p.endsWith('.svelte'));
    const offenders = srcFiles.filter((p) =>
      /\b(requirePermission|requireKbRole|requireKbPermission)\b/.test(readFileSync(p, 'utf-8'))
    );
    expect(offenders).toEqual([]);
  });
});
