import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';
import { renderStructurizrWorkspace, type C4Container, type C4Relation } from '$lib/domain/structurizrDsl';
import { badgeOf, c4Styles, draftOverlay, epistemicCounts, mermaidClassDefs, mmdText, partitionStatements, withdrawnNote } from '$lib/domain/epistemicBadge';

export interface ProjectionActor {
	name: string;
	role?: string;
	description?: string;
}

export interface ProjectionDecision {
	retainedOptionId?: string;
	retainedOptionTitle?: string;
	rationale?: string;
	reversibility?: string;
	decidedAt?: string;
	arbiterId?: string;
	arbiterRole?: string;
}

export interface ProjectionContext {
	projectName?: string;
	enterpriseName?: string;
	actors?: ProjectionActor[];
	decision?: ProjectionDecision | null;
	options?: Array<{ id: string; title: string; summary?: string; status?: string }>;
	requirements?: Array<{ clauseRef: string; title: string }>;
	sealSha256?: string;
}

/** Les énoncés d'une section, partagés en « à dessiner » et « écartés » : le même tri pour tous les artefacts. */
function scoped(subject: MaturitySubject, statements: Statement[]) {
	return partitionStatements(statements.filter((s) => s.section === subject.section_ref || s.triplet.subject === subject.id));
}

/** Liens causaux entre énoncés dessinés : `basedOn` qui désigne un autre énoncé de la section (une référence externe est ignorée). */
function causalLinks(shown: Statement[]): Array<{ from: Statement; to: Statement }> {
	const byId = new Map(shown.map((s) => [s.id, s]));
	return shown.flatMap((to) => to.justification.basedOn.flatMap((id) => (byId.has(id) ? [{ from: byId.get(id)!, to }] : [])));
}

/**
 * Génère le diagramme d'architecture Mermaid à partir des énoncés de la section.
 *
 * Chaque énoncé porte son badge de solidité (vérifié, conçu, hypothèse, contesté, en conflit…) en couleur **et** en toutes lettres ;
 * un énoncé remplacé ou retiré n'est pas dessiné, et le dit.
 */
export function generateMermaidDiagram(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const index = new Map(shown.map((s, i) => [s.id, i]));
	const hasOption = Boolean(context?.decision?.retainedOptionTitle);
	const overlay = draftOverlay(draft);

	const lines: string[] = ['flowchart TD', ...mermaidClassDefs(), `    subgraph "${mmdText(`${subject.section_ref} · ${subject.name}`)}"`];

	if (overlay.banner) lines.push(`        BANNER["⚠ ${mmdText(overlay.banner)}"]:::Provisional`);
	if (hasOption) lines.push(`        OPT["⭐ Option retenue : ${mmdText(context!.decision!.retainedOptionTitle!)}"]:::Retained`);

	if (shown.length === 0 && !context?.decision && overlay.points.length === 0) {
		lines.push('        A["Architecture en cours de délibération"]');
	} else {
		shown.forEach((stmt, i) => {
			const badge = badgeOf(stmt, conflictIds.has(stmt.id));
			lines.push(`        N_${i}["${mmdText(`${stmt.triplet.predicate} : ${stmt.triplet.value}`)}<br/><i>${mmdText(badge.label)}</i>"]:::${badge.tag}`);
		});
		for (const { from, to } of causalLinks(shown)) lines.push(`        N_${index.get(from.id)} --> N_${index.get(to.id)}`);
		if (hasOption) {
			// L'option retenue précède les énoncés qui ne se fondent sur aucun autre de la section.
			const founded = new Set(causalLinks(shown).map((l) => l.to.id));
			shown.filter((s) => !founded.has(s.id)).forEach((s) => lines.push(`        OPT --> N_${index.get(s.id)}`));
		}
	}

	overlay.points.forEach((p, i) => lines.push(`        P_${i}["${mmdText(p.title)}<br/><i>${mmdText(`${p.label} · ${p.detail}`)}</i>"]:::${p.tag}`));

	const note = withdrawnNote(withdrawn);
	if (note) lines.push(`        W["${mmdText(note)}"]:::Withdrawn`);
	lines.push('    end');
	return lines.join('\n');
}

/**
 * Génère la spécification C4 au format Structurizr DSL (.dsl), **acceptée par Structurizr** (voir `structurizrDsl.ts`).
 *
 * Chaque container porte, comme « technologie » et comme étiquette de style, la solidité de l'énoncé dont il vient. Les personnes
 * sont celles que l'appelant déclare comme acteurs du système : aucune n'est inventée.
 */
export function generateStructurizrDSL(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const enterpriseName = context?.enterpriseName || context?.projectName || 'Organisation';
	const containers: C4Container[] = [];
	const overlay = draftOverlay(draft);

	if (context?.decision?.retainedOptionTitle) {
		containers.push({
			id: 'retained_option',
			name: context.decision.retainedOptionTitle,
			description: context.decision.rationale || 'Option retenue',
			technology: 'Option retenue',
			tags: ['Retained']
		});
	}

	shown.forEach((s) => {
		const badge = badgeOf(s, conflictIds.has(s.id));
		containers.push({ id: s.id, name: s.triplet.predicate, description: String(s.triplet.value), technology: badge.label, tags: [badge.tag] });
	});

	overlay.points.forEach((p, i) =>
		containers.push({ id: `open_${i}`, name: p.title, description: p.detail, technology: p.label, tags: [p.tag] })
	);

	if (containers.length === 0) {
		containers.push({ id: 'default', name: 'Socle Architectural', description: 'En cours de spécification', technology: 'non spécifié', tags: ['Unqualified'] });
	}

	const note = withdrawnNote(withdrawn);
	const systemDescription = [overlay.banner, note].filter(Boolean).join(' — ') || undefined;
	const relations: C4Relation[] = causalLinks(shown).map(({ from, to }) => ({ from: from.id, to: to.id, label: 'fonde' }));

	return renderStructurizrWorkspace({
		name: subject.name,
		description: overlay.banner ? `Projeté depuis Archinex — ${overlay.banner}` : 'Projeté sans dérive depuis Archinex',
		group: enterpriseName,
		persons: (context?.actors ?? []).map((a) => ({ name: a.name, description: a.description })),
		systems: [{ id: subject.id, name: subject.name, description: systemDescription, containers }],
		relations,
		viewKey: subject.id,
		styles: c4Styles(),
		notes: [overlay.banner, note].filter((n): n is string => Boolean(n))
	});
}

/** Texte sûr dans un commentaire `doc` SysML : la fin de commentaire est neutralisée. */
const sysmlDoc = (value: string) => value.replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ');
const sysmlString = (value: string) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');

/**
 * Génère la modélisation système en langage SysML v2 / SysON.
 *
 * Non validé par un outil SysML v2 : les noms sont uniques et échappés, mais aucun analyseur n'a relu ce texte.
 */
export function generateSysMLv2(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const overlay = draftOverlay(draft);
	const taken = new Set<string>();
	const unique = (raw: string) => {
		const base = raw.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'element';
		let name = base;
		for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
		taken.add(name);
		return name;
	};
	const parts: string[] = [];

	if (context?.decision?.retainedOptionTitle) {
		parts.push(`    part def ${unique(`Opt_${context.decision.retainedOptionTitle}`)} {`);
		parts.push(`        doc /* Option retenue : ${sysmlDoc(context.decision.retainedOptionTitle)} */`);
		if (context.decision.reversibility) {
			parts.push(`        attribute reversibility : String = "${sysmlString(context.decision.reversibility)}";`);
		}
		parts.push(`    }`);
	}

	shown.forEach((s) => {
		const badge = badgeOf(s, conflictIds.has(s.id));
		parts.push(`    part def ${unique(s.triplet.predicate)} {`);
		parts.push(`        attribute specification : String = "${sysmlString(String(s.triplet.value))}";`);
		parts.push(`        attribute confidence : String = "${sysmlString(String(s.maturity.confidence))}";`);
		parts.push(`        attribute status : String = "${sysmlString(String(s.status))}";`);
		parts.push(`        attribute epistemic : String = "${sysmlString(badge.label)}";`);
		parts.push(`    }`);
	});

	overlay.points.forEach((p) => {
		parts.push(`    part def ${unique(`Open_${p.kind}`)} {`);
		parts.push(`        doc /* ${sysmlDoc(p.title)} */`);
		parts.push(`        attribute detail : String = "${sysmlString(p.detail)}";`);
		parts.push(`        attribute epistemic : String = "${sysmlString(p.label)}";`);
		parts.push(`    }`);
	});

	if (context?.requirements && context.requirements.length > 0) {
		context.requirements.forEach((r) => {
			const safeClause = r.clauseRef.replace(/[^a-zA-Z0-9_]/g, '_');
			parts.push(`    // Exigence couverte : ${r.clauseRef} - ${r.title.replace(/[\r\n]+/g, ' ')}`);
			parts.push(`    // satisfy requirement req_${safeClause};`);
		});
	}

	const note = withdrawnNote(withdrawn);
	const header = [`    doc /* Projeté sans doc drift depuis Archinex snapshot scellé */`];
	if (overlay.banner) header.push(`    doc /* ${sysmlDoc(overlay.banner)} */`);
	if (note) header.push(`    doc /* ${sysmlDoc(note)} */`);
	return `package '${subject.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' {\n${[...header, ...parts].join('\n')}\n}`;
}

/** Valeur typée d'un paramètre : « true », « 15 » deviennent un booléen, un nombre. */
function typed(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	if (value.toLowerCase() === 'true') return true;
	if (value.toLowerCase() === 'false') return false;
	return /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
}

/**
 * Génère la configuration opérationnelle JSON à partir des énoncés de la section et de la décision.
 *
 * Un prédicat qui porte deux valeurs actives différentes n'est **pas** tranché ici : il sort dans `conflicts`, pas dans `parameters`
 * (avant, la dernière valeur lue l'emportait, au gré de l'ordre des énoncés). Les paramètres qui ne sont pas vérifiés sont listés
 * dans `unsettled` avec leur solidité.
 */
export function generateConfigJSON(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	/** Horodatage de génération : à fournir pour une projection reproductible (le gel y passe l'instant du scellement). */
	generatedAt: string = new Date().toISOString(),
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const overlay = draftOverlay(draft);
	const key = (s: Statement) => s.triplet.predicate.replace(/[^a-zA-Z0-9_]/g, '_');

	const parameters: Record<string, unknown> = {};
	const unsettled: Record<string, string> = {};
	const conflicts: Record<string, unknown[]> = {};
	for (const stmt of shown) {
		const k = key(stmt);
		if (conflictIds.has(stmt.id)) {
			(conflicts[k] ??= []).push(typed(stmt.triplet.value));
			continue;
		}
		parameters[k] = typed(stmt.triplet.value);
		const badge = badgeOf(stmt, false);
		if (!badge.settled) unsettled[k] = badge.label;
	}

	const config = {
		subject: { id: subject.id, sectionRef: subject.section_ref, name: subject.name, maturityLevel: subject.level },
		decision: context?.decision
			? {
					retainedOptionId: context.decision.retainedOptionId,
					retainedOptionTitle: context.decision.retainedOptionTitle,
					rationale: context.decision.rationale,
					reversibility: context.decision.reversibility,
					decidedAt: context.decision.decidedAt,
					arbiterRole: context.decision.arbiterRole
				}
			: null,
		parameters: Object.keys(parameters).length > 0 ? parameters : { status: subject.level, statementsCount: shown.length },
		provisional: overlay.banner,
		unsettled,
		conflicts,
		openPoints: overlay.points.map((p) => ({ kind: p.kind, text: p.title, detail: p.detail })),
		withdrawnStatements: withdrawn,
		epistemic: epistemicCounts(shown, conflictIds),
		coveredRequirements: context?.requirements?.map((r) => r.clauseRef) ?? [],
		provenance: { sealedEngine: 'Archinex Deliberation Workbench', generatedAt, sealSha256: context?.sealSha256 }
	};

	return JSON.stringify(config, null, 2);
}

/**
 * Génère une projection visuelle C4 interprétable par Mermaid pour le modèle Structurizr.
 */
export function generateStructurizrVisualMermaid(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const enterpriseName = context?.enterpriseName || context?.projectName || 'Organisation';
	const actors = context?.actors ?? [];
	const overlay = draftOverlay(draft);

	const lines: string[] = [
		'flowchart TB',
		'    classDef person fill:#08427b,stroke:#073b6e,color:#fff,font-weight:bold',
		...mermaidClassDefs(),
		'',
		...actors.map(
			(a, i) => `    user_${i}["👤 ${mmdText(a.name)}<br/><small>[Personne]</small><br/>${mmdText(a.description || '')}"]:::person`
		),
		'',
		...(overlay.banner ? [`    banner["⚠ ${mmdText(overlay.banner)}"]:::Provisional`, ''] : []),
		`    subgraph Enterprise["🏢 Entreprise : ${mmdText(enterpriseName)}"]`,
		`        subgraph SysBound["Système : ${mmdText(subject.name)}"]`,
		`            direction TB`
	];

	if (context?.decision?.retainedOptionTitle) {
		const safeRat = (context.decision.rationale || '').slice(0, 50);
		lines.push(`            c_opt["⭐ ${mmdText(context.decision.retainedOptionTitle)}<br/><small>[Option retenue · arbitrée]</small><br/>${mmdText(safeRat)}"]:::Retained`);
	}

	if (shown.length === 0 && !context?.decision && overlay.points.length === 0) {
		lines.push(`            c_default["⚙️ Composant Architectural<br/><small>[non spécifié]</small><br/>En cours de délibération"]:::Unqualified`);
	} else {
		shown.forEach((s, idx) => {
			const badge = badgeOf(s, conflictIds.has(s.id));
			lines.push(`            c_${idx}["⚙️ ${mmdText(s.triplet.predicate)}<br/><small>[Container · ${mmdText(badge.label)}]</small><br/>${mmdText(String(s.triplet.value))}"]:::${badge.tag}`);
		});
		const index = new Map(shown.map((s, i) => [s.id, i]));
		for (const { from, to } of causalLinks(shown)) lines.push(`            c_${index.get(from.id)} -->|"fonde"| c_${index.get(to.id)}`);
	}

	overlay.points.forEach((p, i) =>
		lines.push(`            c_open_${i}["❓ ${mmdText(p.title)}<br/><small>[${mmdText(p.label)}]</small><br/>${mmdText(p.detail)}"]:::${p.tag}`)
	);

	const note = withdrawnNote(withdrawn);
	if (note) lines.push(`            c_withdrawn["${mmdText(note)}"]:::Withdrawn`);
	lines.push('        end');
	lines.push('    end');
	lines.push('');
	actors.forEach((_, i) => lines.push(`    user_${i} -->|"Utilise"| SysBound`));

	return lines.join('\n');
}

/**
 * Génère une projection visuelle SysML v2 interprétable sous forme de diagramme de blocs (BDD).
 */
export function generateSysMLVisualMermaid(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const overlay = draftOverlay(draft);
	// Un membre de classe Mermaid : on garde les accents (avant, chacun devenait « _ »), on retire ce qui casse la syntaxe.
	const member = (value: string) => value.replace(/[{}"<>`]/g, '').replace(/[()]/g, ' ').replace(/\s*[\r\n]+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

	const lines: string[] = [
		'classDiagram',
		`    class Block_${subject.id.replace(/[^a-zA-Z0-9_]/g, '_')} {`,
		`        <<system>>`,
		`        +section: ${member(subject.section_ref)}`,
		`        +status: ${member(String(subject.level))}`
	];

	if (context?.decision?.retainedOptionTitle) {
		lines.push(`        +retainedOption: ${member(context.decision.retainedOptionTitle)}`);
	}

	shown.forEach((s) => {
		const badge = badgeOf(s, conflictIds.has(s.id));
		const name = s.triplet.predicate.replace(/[^\p{L}\p{N}_]/gu, '_');
		lines.push(`        +${name}: ${member(String(s.triplet.value))} · ${member(badge.label)}`);
	});

	if (overlay.banner) lines.push(`        +provisoire: ${member(overlay.banner)}`);
	overlay.points.forEach((p) => lines.push(`        +${p.kind}: ${member(p.title.replace(/^[^:]+ : /, ''))} · ${member(p.label)}`));

	const note = withdrawnNote(withdrawn);
	if (note) lines.push(`        +écartés: ${member(note)}`);
	lines.push('    }');

	return lines.join('\n');
}
