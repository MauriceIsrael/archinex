/**
 * Rendu d'un workspace Structurizr DSL **valide** — un seul endroit pour les deux générateurs (par sujet et global).
 *
 * Ce qu'une version précédente produisait et que Structurizr (CLI 2025.11) refuse :
 *  - le mot-clé `enterprise`, retiré du langage (remplacé par `group`) ;
 *  - deux containers de même nom dans un même système (deux énoncés de même prédicat) ;
 *  - une relation entre un parent et son enfant (système → option qu'il contient) ;
 *  - des relations vers des éléments jamais déclarés.
 * Et ce qu'il acceptait mais ne montrait pas : une vue `systemContext` n'affiche pas les containers.
 * Ce module écrit donc une vue `container` à côté de la vue de contexte.
 *
 * Fonction pure : mêmes entrées, mêmes octets.
 */

export interface C4Person {
	name: string;
	description?: string;
}

export interface C4Container {
	/** Identifiant de l'appelant (énoncé, élément…) : sert à désigner l'élément dans les relations. */
	id: string;
	name: string;
	description?: string;
	technology?: string;
	/** Étiquettes Structurizr (styles par statut). */
	tags?: string[];
}

export interface C4System {
	id: string;
	name: string;
	description?: string;
	containers: C4Container[];
}

export interface C4Relation {
	from: string;
	to: string;
	label: string;
}

export interface C4StyleDef {
	tag: string;
	background?: string;
	color?: string;
	border?: 'solid' | 'dashed' | 'dotted';
	opacity?: number;
}

export interface C4WorkspaceInput {
	name: string;
	description: string;
	/** Groupe autour des systèmes (ex. l'organisation). Facultatif. */
	group?: string;
	persons?: C4Person[];
	systems: C4System[];
	relations?: C4Relation[];
	/** Suffixe des clés de vue (alphanumérique et `_`). */
	viewKey: string;
	styles?: C4StyleDef[];
	/** Lignes de commentaire écrites en tête du modèle (hypothèses, avertissements). */
	notes?: string[];
}

/** Chaîne DSL : guillemets et antislash échappés, retours à la ligne aplatis. */
export function dslString(value: string): string {
	return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s*[\r\n]+\s*/g, ' ').trim()}"`;
}

const safeIdentifier = (value: string) => value.replace(/[^a-zA-Z0-9_]/g, '_');

function uniqueIdentifier(prefix: string, raw: string, taken: Set<string>): string {
	const base = `${prefix}_${safeIdentifier(raw)}`;
	let id = base;
	for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
	taken.add(id);
	return id;
}

/** Nom unique dans sa portée : « nom », puis « nom (2) », « nom (3) »… Structurizr refuse deux homonymes. */
export function uniqueName(name: string, taken: Set<string>): string {
	const base = name.trim() || 'Sans nom';
	let candidate = base;
	for (let n = 2; taken.has(candidate); n++) candidate = `${base} (${n})`;
	taken.add(candidate);
	return candidate;
}

export function renderStructurizrWorkspace(input: C4WorkspaceInput): string {
	const identifiers = new Set<string>();
	const idOf = new Map<string, string>(); // identifiant de l'appelant → identifiant DSL
	const parentOf = new Map<string, string>(); // container → système
	const declared = new Set<string>();
	const personNames = new Set<string>();
	const systemNames = new Set<string>();
	const indent = (n: number) => '    '.repeat(n);
	const wrapped = Boolean(input.group);
	const base = wrapped ? 3 : 2;

	const personLines: string[] = [];
	(input.persons ?? []).forEach((person, i) => {
		const id = uniqueIdentifier('person', String(i + 1), identifiers);
		personLines.push(`${indent(2)}${id} = person ${dslString(uniqueName(person.name, personNames))} ${dslString(person.description ?? '')}`);
		idOf.set(`person:${i}`, id);
	});

	const systemLines: string[] = [];
	const systemIds: string[] = [];
	for (const system of input.systems) {
		const systemId = uniqueIdentifier('sys', system.id, identifiers);
		idOf.set(system.id, systemId);
		systemIds.push(systemId);
		declared.add(system.id);
		systemLines.push(`${indent(base)}${systemId} = softwareSystem ${dslString(uniqueName(system.name, systemNames))} ${dslString(system.description ?? '')} {`);
		const containerNames = new Set<string>();
		for (const container of system.containers) {
			const containerId = uniqueIdentifier('c', container.id, identifiers);
			idOf.set(container.id, containerId);
			parentOf.set(container.id, system.id);
			declared.add(container.id);
			const tags = container.tags?.length ? ` {\n${indent(base + 2)}tags ${container.tags.map(dslString).join(' ')}\n${indent(base + 1)}}` : '';
			systemLines.push(
				`${indent(base + 1)}${containerId} = container ${dslString(uniqueName(container.name, containerNames))} ` +
					`${dslString(container.description ?? '')} ${dslString(container.technology ?? '')}${tags}`
			);
		}
		systemLines.push(`${indent(base)}}`);
	}

	// Relations : jamais vers un élément non déclaré, jamais entre un parent et son enfant, jamais en double.
	const relationLines: string[] = [];
	const seen = new Set<string>();
	const isParentChild = (a: string, b: string) => parentOf.get(a) === b || parentOf.get(b) === a;
	for (const rel of input.relations ?? []) {
		if (rel.from === rel.to || !declared.has(rel.from) || !declared.has(rel.to) || isParentChild(rel.from, rel.to)) continue;
		const key = `${rel.from}\u0000${rel.to}\u0000${rel.label}`;
		if (seen.has(key)) continue;
		seen.add(key);
		relationLines.push(`${indent(2)}${idOf.get(rel.from)} -> ${idOf.get(rel.to)} ${dslString(rel.label)}`);
	}
	if (systemIds.length > 0) {
		for (let i = 0; i < (input.persons ?? []).length; i++) {
			relationLines.push(`${indent(2)}${idOf.get(`person:${i}`)} -> ${systemIds[0]} ${dslString('Utilise')}`);
		}
	}

	const lines: string[] = [`workspace ${dslString(input.name)} ${dslString(input.description)} {`];
	for (const note of input.notes ?? []) lines.push(`    // ${note.replace(/[\r\n]+/g, ' ')}`);
	lines.push('    model {', ...personLines);
	if (wrapped) lines.push(`${indent(2)}group ${dslString(input.group!)} {`);
	lines.push(...systemLines);
	if (wrapped) lines.push(`${indent(2)}}`);
	lines.push(...relationLines, '    }', '    views {');
	if (systemIds.length > 0) {
		const key = safeIdentifier(input.viewKey);
		const view = (kind: string, target: string, name: string) =>
			lines.push(`        ${kind} ${target} ${dslString(name)} {`, '            include *', '            autoLayout lr', '        }');
		if (input.systems.length > 1) lines.push(`        systemLandscape ${dslString(`Landscape_${key}`)} {`, '            include *', '            autoLayout lr', '        }');
		input.systems.forEach((system, i) => {
			// Une seule vue gardée sans suffixe quand il n'y a qu'un système : la clé reste celle d'avant.
			const suffix = input.systems.length > 1 ? `_${safeIdentifier(system.id)}` : '';
			view('systemContext', systemIds[i], `Context_${key}${suffix}`);
			// Une vue de containers sur un système sans container est refusée : on ne l'écrit pas.
			if (system.containers.length > 0) view('container', systemIds[i], `Containers_${key}${suffix}`);
		});
	}
	if (input.styles?.length) {
		lines.push('        styles {');
		for (const style of input.styles) {
			lines.push(`            element ${dslString(style.tag)} {`);
			if (style.background) lines.push(`                background ${style.background}`);
			if (style.color) lines.push(`                color ${style.color}`);
			if (style.border) lines.push(`                border ${style.border}`);
			if (style.opacity !== undefined) lines.push(`                opacity ${style.opacity}`);
			lines.push('            }');
		}
		lines.push('        }');
	}
	lines.push('    }', '}');
	return lines.join('\n');
}
