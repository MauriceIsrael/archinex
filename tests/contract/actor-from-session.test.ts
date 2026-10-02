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
});
