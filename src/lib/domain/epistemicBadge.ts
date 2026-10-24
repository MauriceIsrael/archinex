/**
 * Ce qu'un diagramme doit dire de la solidité d'un énoncé, au même endroit pour tous les artefacts (Mermaid, C4, SysML, JSON).
 *
 * Avant ce module, tous les énoncés d'une section étaient dessinés de la même façon : un énoncé supposé, contesté ou remplacé
 * avait l'allure d'un fait, et le C4 écrivait « Verified Architecture » sur chaque élément. Un schéma de tableau blanc sert d'abord à
 * voir ce qui est acquis et ce qui ne l'est pas.
 *
 * Règles :
 *  - un énoncé **remplacé** ou **retiré** n'est pas dessiné (il n'engage plus personne) ; le nombre de ceux qu'on a écartés est dit ;
 *  - le statut l'emporte sur la confiance : contesté, puis en conflit, puis en revue, puis la confiance elle-même ;
 *  - deux énoncés actifs de même prédicat mais de valeurs différentes sont **en conflit** : on ne choisit pas pour l'architecte ;
 *  - la solidité ne se lit pas seulement à la couleur : chaque badge a un libellé ;
 *  - ce que le brouillon de la section tient encore pour ouvert (hypothèses, conflits, questions) est dessiné à côté des énoncés,
 *    et une section provisoire porte un bandeau : un schéma qui ne le dit pas se lit comme une décision.
 */
import type { Statement } from '$lib/types/epistemic';
import type { C4StyleDef } from '$lib/domain/structurizrDsl';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';

export type BadgeTag =
	| 'Verified'
	| 'Designed'
	| 'Assumed'
	| 'Declared'
	| 'InReview'
	| 'Contested'
	| 'Conflict'
	| 'Unqualified'
	/** Question ouverte du brouillon : pas un énoncé, un manque. */
	| 'Open'
	/** Éléments du dossier scellé, qui ne portent que « validé par un humain » ou « proposé ». */
	| 'Validated'
	| 'Proposed';

export interface EpistemicBadge {
	tag: BadgeTag;
	label: string;
	/** Vrai seulement d'un énoncé vérifié, ni contesté, ni en conflit, ni en revue. */
	settled: boolean;
}

const BY_CONFIDENCE: Record<string, EpistemicBadge> = {
	verified: { tag: 'Verified', label: 'vérifié', settled: true },
	designed: { tag: 'Designed', label: 'conçu, non vérifié', settled: false },
	assumed: { tag: 'Assumed', label: 'hypothèse', settled: false },
	'vendor-stated': { tag: 'Declared', label: 'déclaré constructeur, non vérifié', settled: false },
	'stated-by-client': { tag: 'Declared', label: 'déclaré client, non vérifié', settled: false }
};

/** `retracted` existe en base (Prisma) sans figurer dans le type TypeScript. */
const WITHDRAWN = new Set(['superseded', 'retracted']);

export const isWithdrawn = (s: Pick<Statement, 'status'>): boolean => WITHDRAWN.has(String(s.status));

export interface Partition {
	/** Énoncés à dessiner, dans l'ordre reçu. */
	shown: Statement[];
	/** Énoncés remplacés ou retirés, écartés du dessin. */
	withdrawn: number;
	/** Énoncés actifs dont un autre énoncé actif de même prédicat porte une valeur différente. */
	conflictIds: Set<string>;
}

export function partitionStatements(statements: Statement[]): Partition {
	const shown = statements.filter((s) => !isWithdrawn(s));
	const values = new Map<string, Set<string>>();
	for (const s of shown) {
		const set = values.get(s.triplet.predicate) ?? new Set<string>();
		set.add(String(s.triplet.value));
		values.set(s.triplet.predicate, set);
	}
	const conflictIds = new Set(shown.filter((s) => (values.get(s.triplet.predicate)?.size ?? 0) > 1).map((s) => s.id));
	return { shown, withdrawn: statements.length - shown.length, conflictIds };
}

export function badgeOf(s: Statement, inConflict = false): EpistemicBadge {
	if (s.status === 'contested') return { tag: 'Contested', label: 'contesté', settled: false };
	if (inConflict) return { tag: 'Conflict', label: 'en conflit : valeurs différentes', settled: false };
	if (s.status === 'under_review') return { tag: 'InReview', label: 'en revue', settled: false };
	return confidenceBadge(s.maturity.confidence);
}

/** Badge d'une confiance seule. Une confiance absente n'est jamais prise pour « vérifié » : elle est dite non renseignée. */
export function confidenceBadge(confidence?: string | null): EpistemicBadge {
	const value = String(confidence ?? '').trim();
	if (!value) return { tag: 'Unqualified', label: 'confiance non renseignée', settled: false };
	return BY_CONFIDENCE[value] ?? { tag: 'Unqualified', label: `confiance « ${value} »`, settled: false };
}

/** Badge d'un énoncé tel que stocké (confiance + statut), sans l'objet `Statement` : sert à décrire un élément du dossier scellé. */
export function storedBadge(confidence?: string | null, status?: string | null): EpistemicBadge {
	if (status === 'contested') return { tag: 'Contested', label: 'contesté', settled: false };
	return confidenceBadge(confidence);
}

/**
 * Badge d'un élément du dossier scellé : validé par un humain, ou proposé et pas encore relu.
 * `validé` n'est pas `vérifié` : c'est une relecture humaine, pas une preuve.
 */
export function elementBadge(element: { assertion_level?: string | null }): EpistemicBadge {
	return element.assertion_level === 'asserted'
		? { tag: 'Validated', label: 'validé par un humain', settled: true }
		: { tag: 'Proposed', label: 'proposé, non relu', settled: false };
}

/** « 1 énoncé remplacé ou retiré n'est pas affiché » : ce qu'on n'affiche pas se dit. */
export function withdrawnNote(count: number): string | null {
	if (count <= 0) return null;
	return count === 1 ? '1 énoncé remplacé ou retiré n\'est pas affiché' : `${count} énoncés remplacés ou retirés ne sont pas affichés`;
}

/** Décompte par libellé, dans l'ordre des badges : sert au JSON et aux avertissements. */
export function epistemicCounts(statements: Statement[], conflictIds: Set<string>): Record<string, number> {
	const out: Record<string, number> = {};
	for (const s of statements) {
		const { label } = badgeOf(s, conflictIds.has(s.id));
		out[label] = (out[label] ?? 0) + 1;
	}
	return out;
}

const STYLES: Record<BadgeTag | 'Retained' | 'Provisional', { fill: string; stroke: string; dashed: boolean; width?: number }> = {
	Verified: { fill: '#e8f5e9', stroke: '#2b8a3e', dashed: false },
	Designed: { fill: '#e3f2fd', stroke: '#1565c0', dashed: false },
	Assumed: { fill: '#fff8e1', stroke: '#f9a825', dashed: true },
	Declared: { fill: '#f3e5f5', stroke: '#8e24aa', dashed: true },
	InReview: { fill: '#fff3e0', stroke: '#ef6c00', dashed: false },
	Contested: { fill: '#ffebee', stroke: '#c62828', dashed: true, width: 3 },
	Conflict: { fill: '#ffebee', stroke: '#c62828', dashed: true, width: 3 },
	Unqualified: { fill: '#f5f5f5', stroke: '#757575', dashed: true },
	Open: { fill: '#e8eaf6', stroke: '#3949ab', dashed: true },
	Provisional: { fill: '#fffde7', stroke: '#f57f17', dashed: true, width: 2 },
	Validated: { fill: '#e8f5e9', stroke: '#2b8a3e', dashed: false },
	Proposed: { fill: '#fff8e1', stroke: '#f9a825', dashed: true },
	Retained: { fill: '#2b8a3e', stroke: '#1b5e20', dashed: false, width: 2 }
};

/** Lignes `classDef` Mermaid : une classe par badge, du même nom que l'étiquette Structurizr. */
export function mermaidClassDefs(indent = '    '): string[] {
	const lines = Object.entries(STYLES).map(([tag, s]) => {
		const text = tag === 'Retained' ? ',color:#fff,font-weight:bold' : '';
		return `${indent}classDef ${tag} fill:${s.fill},stroke:${s.stroke},stroke-width:${s.width ?? 1}px${s.dashed ? ',stroke-dasharray:5 5' : ''}${text}`;
	});
	lines.push(`${indent}classDef Withdrawn fill:#fafafa,stroke:#bdbdbd,color:#757575,stroke-dasharray:2 2`);
	return lines;
}

/** Styles d'éléments Structurizr, un par badge. */
export function c4Styles(): C4StyleDef[] {
	return Object.entries(STYLES).map(([tag, s]) => ({
		tag,
		background: s.fill,
		color: tag === 'Retained' ? '#ffffff' : '#000000',
		border: s.dashed ? ('dashed' as const) : ('solid' as const)
	}));
}

export interface OpenPoint {
	kind: 'suppose' | 'conflit' | 'manque';
	tag: 'Assumed' | 'Conflict' | 'Open';
	/** Ce qui est ouvert, en une ligne. */
	title: string;
	/** Ce que ça entraîne, ou qui doit le trancher. */
	detail: string;
	/** Libellé de solidité, comme celui d'un énoncé. */
	label: string;
}

export interface DraftOverlay {
	/** Bandeau d'une section provisoire ; `null` quand elle ne l'est pas. */
	banner: string | null;
	points: OpenPoint[];
}

const levelLabel = (level: string) => String(level).replace(/^L(\d)_/, 'L$1 · ').replace(/_/g, ' ');

/**
 * Ce que le brouillon télégraphique tient pour ouvert : hypothèses (« supposé »), conflits et questions (« manque »).
 * Avant, le paramètre `draft` des générateurs n'était lu par aucun : un schéma de section provisoire ressemblait à une décision.
 */
export function draftOverlay(draft?: Partial<TelegraphicDraft> | null): DraftOverlay {
	if (!draft) return { banner: null, points: [] };
	const points: OpenPoint[] = [];
	for (const h of draft.suppose ?? []) {
		points.push({ kind: 'suppose', tag: 'Assumed', title: `supposé : ${h.text}`, detail: [`⇒ ${h.consequence}`, h.cost_hint].filter(Boolean).join(' · '), label: 'hypothèse' });
	}
	for (const c of draft.conflit ?? []) {
		points.push({
			kind: 'conflit', tag: 'Conflict', title: `conflit : ${c.text} vs ${c.opposing_reference}`,
			detail: c.requires_arbitration ? 'arbitrage requis' : 'conflit ouvert', label: 'en conflit'
		});
	}
	for (const m of draft.manque ?? []) {
		points.push({ kind: 'manque', tag: 'Open', title: `question ouverte : ${m.question}`, detail: `→ ${m.assigned_role}`, label: 'à instruire' });
	}
	const banner = draft.is_provisional
		? `PROVISOIRE · maturité ${levelLabel(draft.maturity ?? '')} · ne se lit pas comme une décision`
		: null;
	return { banner, points };
}

/** Texte sûr dans une étiquette Mermaid entre guillemets : on code ce qui casse la syntaxe au lieu de le supprimer. */
export function mmdText(value: string): string {
	return String(value).replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;').replace(/\s*[\r\n]+\s*/g, ' ').trim();
}
