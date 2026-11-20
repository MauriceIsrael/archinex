/**
 * Rendu d'un modèle C4 au format C4X (.c4x / blocs Markdown ```c4x) — zéro dépendance externe (MIT).
 *
 * Réutilise les types et garanties structurelles de `structurizrDsl.ts` :
 *  - identifiants et noms uniques dans leur portée ;
 *  - aucune relation vers un élément non déclaré ;
 *  - aucune relation parent-enfant ni en double.
 *
 * Fonction pure : mêmes entrées, mêmes octets.
 */

import { uniqueName, type C4WorkspaceInput } from '$lib/domain/structurizrDsl';

export interface C4xRenderOptions {
	/** Inclut les métadonnées disponibles (étiquettes épistémiques, domaine…) en annotations `%% @meta`. Défaut : `true`. */
	includeMetadata?: boolean;
	/** Ajoute des coordonnées de grille déterministes (`$x`, `$y`) pour les éditeurs visuels C4X. Défaut : `false`. */
	includeLayoutHints?: boolean;
}

/** Chaîne C4X : guillemets et antislash échappés, retours à la ligne aplatis. */
export function c4xString(value: string): string {
	return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s*[\r\n]+\s*/g, ' ').trim()}"`;
}

const safeIdentifier = (value: string) => value.replace(/[^a-zA-Z0-9_]/g, '_') || 'item';

function uniqueIdentifier(prefix: string, raw: string, taken: Set<string>): string {
	const base = `${prefix}_${safeIdentifier(raw)}`;
	let id = base;
	for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
	taken.add(id);
	return id;
}

/**
 * Formate un bloc C4X complet prêt à être collé dans un document Markdown (HLD, ADR, README).
 */
export function wrapC4xMarkdown(c4xCode: string, title?: string): string {
	const header = title ? `### ${title.replace(/[\r\n]+/g, ' ').trim()}\n\n` : '';
	return `${header}\`\`\`c4x\n${c4xCode.trim()}\n\`\`\``;
}

/**
 * Projette un `C4WorkspaceInput` vers un diagramme C4X valide et déterministe.
 */
export function renderC4xDiagram(input: C4WorkspaceInput, options?: C4xRenderOptions): string {
	const includeMetadata = options?.includeMetadata ?? true;
	const includeLayoutHints = options?.includeLayoutHints ?? false;

	const identifiers = new Set<string>();
	const idOf = new Map<string, string>();
	const parentOf = new Map<string, string>();
	const declared = new Set<string>();
	const personNames = new Set<string>();
	const systemNames = new Set<string>();
	const indent = (n: number) => '    '.repeat(n);
	const wrapped = Boolean(input.group);
	const base = wrapped ? 1 : 0;

	const lines: string[] = [
		`%% C4X Model: ${input.name.replace(/[\r\n]+/g, ' ').trim()}`,
		`%% ${input.description.replace(/[\r\n]+/g, ' ').trim()}`
	];
	for (const note of input.notes ?? []) {
		const clean = note.replace(/[\r\n]+/g, ' ').trim();
		if (clean) lines.push(`%% Note: ${clean}`);
	}
	lines.push('');

	// 1. Personnes / Acteurs
	(input.persons ?? []).forEach((person, i) => {
		const id = uniqueIdentifier('person', String(i + 1), identifiers);
		const name = uniqueName(person.name, personNames);
		const pos = includeLayoutHints ? `, $x=${i * 260}, $y=0` : '';
		lines.push(`Person(${id}, ${c4xString(name)}, ${c4xString(person.description ?? '')}${pos})`);
		idOf.set(`person:${i}`, id);
	});
	if ((input.persons ?? []).length > 0) lines.push('');

	// 2. Frontière d'organisation (optionnelle) et Systèmes / Containers
	if (wrapped) {
		const grpId = uniqueIdentifier('grp', input.group!, identifiers);
		lines.push(`Boundary(${grpId}, ${c4xString(input.group!)}) {`);
	}

	const systemIds: string[] = [];
	input.systems.forEach((system, sysIdx) => {
		const systemId = uniqueIdentifier('sys', system.id, identifiers);
		idOf.set(system.id, systemId);
		systemIds.push(systemId);
		declared.add(system.id);

		const sysName = uniqueName(system.name, systemNames);
		lines.push(`${indent(base)}System_Boundary(${systemId}, ${c4xString(sysName)}) {`);

		const containerNames = new Set<string>();
		system.containers.forEach((container, cIdx) => {
			const containerId = uniqueIdentifier('c', container.id, identifiers);
			idOf.set(container.id, containerId);
			parentOf.set(container.id, system.id);
			declared.add(container.id);

			if (includeMetadata) {
				const metaEntries: string[] = [];
				if (container.tags?.length) metaEntries.push(`tags=${container.tags.join(',')}`);
				if (container.metadata) {
					for (const [k, v] of Object.entries(container.metadata)) {
						if (v !== undefined && v !== '') {
							metaEntries.push(`${k}=${String(v).replace(/[\r\n]+/g, ' ').trim()}`);
						}
					}
				}
				if (metaEntries.length > 0) {
					lines.push(`${indent(base + 1)}%% @meta ${metaEntries.join(' | ')}`);
				}
			}

			const cName = uniqueName(container.name, containerNames);
			const pos = includeLayoutHints
				? `, $x=${(cIdx % 3) * 280}, $y=${200 + sysIdx * 260 + Math.floor(cIdx / 3) * 160}`
				: '';
			lines.push(
				`${indent(base + 1)}Container(${containerId}, ${c4xString(cName)}, ${c4xString(container.technology ?? '')}, ${c4xString(container.description ?? '')}${pos})`
			);
		});

		lines.push(`${indent(base)}}`);
	});

	if (wrapped) {
		lines.push('}');
	}

	// 3. Relations (filtrées : pas de boucle, pas de parent-enfant, pas d'élément non déclaré, pas de doublon)
	const relationLines: string[] = [];
	const seen = new Set<string>();
	const isParentChild = (a: string, b: string) => parentOf.get(a) === b || parentOf.get(b) === a;

	for (const rel of input.relations ?? []) {
		if (rel.from === rel.to || !declared.has(rel.from) || !declared.has(rel.to) || isParentChild(rel.from, rel.to)) {
			continue;
		}
		const key = `${rel.from}\u0000${rel.to}\u0000${rel.label}`;
		if (seen.has(key)) continue;
		seen.add(key);
		relationLines.push(`Rel(${idOf.get(rel.from)}, ${idOf.get(rel.to)}, ${c4xString(rel.label)})`);
	}

	if (systemIds.length > 0) {
		for (let i = 0; i < (input.persons ?? []).length; i++) {
			relationLines.push(`Rel(${idOf.get(`person:${i}`)}, ${systemIds[0]}, ${c4xString('Utilise')})`);
		}
	}

	if (relationLines.length > 0) {
		lines.push('', ...relationLines);
	}

	return lines.join('\n');
}
