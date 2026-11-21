// Détection du couplage à un scénario d'exemple dans la logique de production (AGENTS.md §1).
// Module pur (sans E/S) pour rester testable ; l'orchestration fichier est dans check-scenario-coupling.mjs.

/**
 * @typedef {{ name: string, regex: RegExp }} CouplingPattern
 * @typedef {{ path: string, reason: string }} CouplingException
 * @typedef {{ line: number, pattern: string, text: string }} CouplingHit
 * @typedef {{ path: string, content: string }} SourceFile
 */

/**
 * Compile les lignes d'un fichier de motifs (commentaires # et lignes vides ignorés).
 * @param {string} text
 * @returns {CouplingPattern[]}
 */
export function parsePatterns(text) {
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((src) => ({ name: src, regex: new RegExp(src, 'i') }));
}

/**
 * Parse les dérogations : `chemin # raison (#issue)`. Une raison est obligatoire.
 * @param {string} text
 * @returns {CouplingException[]}
 */
export function parseExceptions(text) {
  /** @type {CouplingException[]} */
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(' # ');
    if (idx === -1) throw new Error(`Dérogation sans raison (attendu « chemin # raison (#issue) ») : ${line}`);
    const path = line.slice(0, idx).trim();
    const reason = line.slice(idx + 3).trim();
    if (!reason) throw new Error(`Dérogation sans raison : ${line}`);
    out.push({ path, reason });
  }
  return out;
}

/**
 * Retire les commentaires d'une ligne (//, bloc ouvert/continué, HTML mono-ligne) : on ne contrôle que le code.
 * @param {string} line
 * @returns {string}
 */
export function stripComments(line) {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--')) return '';
  return line.replace(/<!--.*?-->/g, '').replace(/(^|\s)\/\/.*$/, '$1');
}

/**
 * Renvoie les occurrences {line, pattern, text} d'un contenu.
 * @param {string} content
 * @param {CouplingPattern[]} patterns
 * @returns {CouplingHit[]}
 */
export function scanContent(content, patterns) {
  /** @type {CouplingHit[]} */
  const hits = [];
  String(content)
    .split('\n')
    .forEach((raw, i) => {
      const code = stripComments(raw);
      if (!code.trim()) return;
      for (const { name, regex } of patterns) {
        if (regex.test(code)) hits.push({ line: i + 1, pattern: name, text: raw.trim() });
      }
    });
  return hits;
}

/**
 * Évalue un ensemble de fichiers.
 * @param {SourceFile[]} files
 * @param {CouplingPattern[]} patterns
 * @param {CouplingException[]} exceptions
 * @returns {{ violations: Array<CouplingHit & { path: string }>, usedExceptions: CouplingException[], staleExceptions: CouplingException[] }}
 */
export function evaluate(files, patterns, exceptions) {
  const excepted = new Map(exceptions.map((e) => [e.path, e]));
  /** @type {Set<string>} */
  const used = new Set();
  /** @type {Array<CouplingHit & { path: string }>} */
  const violations = [];
  for (const f of files) {
    const hits = scanContent(f.content, patterns);
    if (hits.length === 0) continue;
    if (excepted.has(f.path)) {
      used.add(f.path);
      continue;
    }
    for (const h of hits) violations.push({ path: f.path, ...h });
  }
  const staleExceptions = exceptions.filter((e) => !used.has(e.path));
  return { violations, usedExceptions: exceptions.filter((e) => used.has(e.path)), staleExceptions };
}
