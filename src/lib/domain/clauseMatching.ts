/**
 * Helpers partagés de rapprochement clauses ↔ sujets et de filtrage de packs de domaines.
 * Évite la duplication entre composants Svelte et remplace les `.includes()` non bornés.
 */

const CLAUSE_STOP_WORDS = new Set([
  'pour', 'avec', 'dans', 'plus', 'tous', 'cette', 'sans', 'sous', 'entre', 'vers', 'sont'
]);

export interface MatchableClause {
  clauseRef: string;
  title: string;
  text: string;
}

export interface MatchableSubject {
  name: string;
  section_ref: string;
  coveredClauseRefs?: string[];
  semanticClauseRefs?: string[];
}

/**
 * Associe les clauses client pertinentes à un sujet :
 * 1. Liens formels (`coveredClauseRefs` / `semanticClauseRefs` / correspondance exacte de `section_ref`),
 * 2. Repli lexical borné sur les termes discriminants du nom du sujet.
 */
export function matchClausesToSubject<T extends MatchableClause>(
  subject: MatchableSubject,
  allClauses: ReadonlyArray<T>,
  limit = 4
): T[] {
  if (allClauses.length === 0) return [];

  const formalRefs = new Set([
    ...(subject.coveredClauseRefs || []).map((r) => r.toLowerCase()),
    ...(subject.semanticClauseRefs || []).map((r) => r.toLowerCase())
  ]);
  const secRefLower = subject.section_ref.toLowerCase();

  const byFormalOrSection = allClauses.filter((c) => {
    const cRef = c.clauseRef.toLowerCase();
    if (formalRefs.has(cRef)) return true;
    return Boolean(secRefLower) && (cRef === secRefLower || cRef.startsWith(`${secRefLower}.`));
  });
  if (byFormalOrSection.length > 0) {
    return byFormalOrSection.slice(0, limit);
  }

  const keywords = subject.name
    .toLowerCase()
    .split(/[^a-z0-9à-ÿ_-]+/)
    .filter((w) => w.length > 4 && !CLAUSE_STOP_WORDS.has(w));

  if (keywords.length === 0) return [];

  const byKeyword = allClauses.filter((c) => {
    const padded = ` ${`${c.title} ${c.text}`.toLowerCase().replace(/[^a-z0-9à-ÿ_-]+/g, ' ')} `;
    return keywords.some((k) => padded.includes(` ${k} `));
  });
  return byKeyword.slice(0, Math.min(limit, 3));
}

const PACK_PATTERNS: Record<'3gpp' | 'security' | 'architecture', RegExp> = {
  '3gpp': /\b(3gpp|telecom|conformance|interoperability|core|5g|sba|mission-critical|critical|roaming|ran|spectrum|radio|tactical|sim|iot)\b/i,
  security: /\b(security|compliance|audit|crypto|hygiene|iam|identity|hardening|vulnerability|privacy|protection|risk|sovereignty)\b/i,
  architecture: /\b(architecture|cloud|infra|automation|devops|resilience|observability|api)\b/i
};

/**
 * Vérifie si un domaine appartient à un pack thématique via motifs bornés (`\b...\b`).
 */
export function isDomainInPack(
  dom: string,
  pack: '3gpp' | 'security' | 'architecture'
): boolean {
  const rx = PACK_PATTERNS[pack];
  return rx ? rx.test(dom) : true;
}
