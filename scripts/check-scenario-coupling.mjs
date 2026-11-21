import fs from 'node:fs';
import path from 'node:path';
import { parsePatterns, parseExceptions, evaluate } from './lib/scenario-coupling.mjs';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const EXTS = new Set(['.ts', '.js', '.svelte', '.json', '.html', '.css']);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'generated' ? [] : walk(p);
    return EXTS.has(path.extname(p)) ? [p] : [];
  });
}

const patterns = parsePatterns(fs.readFileSync(path.join(ROOT, '.scenario-coupling-denylist'), 'utf-8'));
const exceptions = parseExceptions(fs.readFileSync(path.join(ROOT, '.scenario-coupling-exceptions'), 'utf-8'));
const files = walk(SRC).map((p) => ({
  path: path.relative(ROOT, p).replace(/\\/g, '/'),
  content: fs.readFileSync(p, 'utf-8')
}));

const { violations, usedExceptions, staleExceptions } = evaluate(files, patterns, exceptions);

for (const v of violations) {
  console.error(`❌ Couplage à un scénario dans ${v.path}:${v.line} (motif « ${v.pattern} ») :\n   ${v.text}`);
}
for (const e of staleExceptions) {
  console.error(`❌ Dérogation obsolète (plus aucune occurrence) : ${e.path} — ${e.reason}. Retirez-la de .scenario-coupling-exceptions.`);
}
if (violations.length > 0 || staleExceptions.length > 0) {
  console.error(
    `\n${violations.length} occurrence(s) de couplage, ${staleExceptions.length} dérogation(s) obsolète(s). ` +
      `Rappel AGENTS.md §1 : l'exemple n'est jamais la règle ; toute dérogation doit être déclarée (§2).`
  );
  process.exit(1);
}
console.log(
  `✅ Couplage scénario : 0 occurrence dans ${files.length} fichiers de src/ (${usedExceptions.length} dérogation(s) temporaire(s) déclarée(s)).`
);
