import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { parsePatterns, parseExceptions, scanContent, evaluate, stripComments } from '../../scripts/lib/scenario-coupling.mjs';

const patterns = parsePatterns(`
# commentaire
\\blot[ _-]?[0-9]+\\b(?!-[a-z])
\\blulu\\b
org-lot
`);

describe('Contrôle de couplage à un scénario d’exemple (#389, AGENTS.md §1)', () => {
  it('signale un identifiant de lot ou de projet dans la logique', () => {
    const hits = scanContent(`const pivot = 'org-lot3-mno';\nconst ref = "REQ-Lot1-1343";\nconst t = 'CCTP Lot 2';`, patterns);
    expect(hits.map((h) => h.line)).toEqual([1, 2, 3]);
  });

  it('ne signale pas les codes de partition génériques du moteur (LOT-01-SOUV…)', () => {
    expect(scanContent(`const code = 'LOT-01-SOUV'; const x = 'LOT-99-DIVERS';`, patterns)).toEqual([]);
  });

  it('ignore les commentaires (ligne, bloc, HTML) mais pas le code qui les précède', () => {
    expect(stripComments('// REQ-Lot1-1')).toBe('');
    expect(stripComments(' * exemple org-lot3')).toBe('');
    expect(stripComments('<!-- lulu -->')).toBe('');
    expect(scanContent(`const a = 'lulu'; // note`, patterns)).toHaveLength(1);
    expect(scanContent(`const a = 1; // lulu`, patterns)).toHaveLength(0);
  });

  it('honore une dérogation déclarée et échoue sur une dérogation obsolète', () => {
    const ex = parseExceptions(`src/a.ts # diagramme en dur (#404)\nsrc/inutile.ts # plus d'occurrence (#1)`);
    const files = [
      { path: 'src/a.ts', content: `const x = 'lulu';` },
      { path: 'src/b.ts', content: `const y = 2;` }
    ];
    const r = evaluate(files, patterns, ex);
    expect(r.violations).toEqual([]);
    expect(r.usedExceptions.map((e) => e.path)).toEqual(['src/a.ts']);
    expect(r.staleExceptions.map((e) => e.path)).toEqual(['src/inutile.ts']);
  });

  it('refuse une dérogation sans raison', () => {
    expect(() => parseExceptions('src/a.ts')).toThrow(/sans raison/);
  });

  it('le dépôt courant respecte le contrôle (0 occurrence hors dérogations déclarées)', () => {
    const out = execFileSync('node', ['scripts/check-scenario-coupling.mjs'], { encoding: 'utf-8' });
    expect(out).toMatch(/0 occurrence/);
  });
});
