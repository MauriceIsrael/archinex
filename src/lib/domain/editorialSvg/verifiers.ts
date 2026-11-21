/**
 * Vérificateurs déterministes de qualité SVG éditoriale (socle de #424).
 * Transposition en TypeScript des garde-fous de `cathrynlavery/diagram-design` :
 * - Contraste WCAG AA du skin actif (≥ 4.5:1)
 * - Contrat d'accessibilité SVG (`role="img"`, `<title>` premier enfant, `<desc>`, unicité des IDs)
 * - Alignement strict sur la grille 4px (tous les `rect` de nœuds)
 * - Zéro segment diagonal dans les connecteurs orthogonaux
 * - Intégrité structurelle du registre `.registry.json` (IDs uniques, parents résolus, zéro cycle)
 */

import { verifySkinContrast, type EditorialSkin } from './tokens';
import type { BlockRegistrySidecar } from './traceableBlockTree';

export interface SvgVerificationIssue {
	rule: 'a11y' | 'contrast' | 'grid-4px' | 'orthogonal' | 'provenance' | 'registry';
	message: string;
}

export interface SvgVerificationReport {
	ok: boolean;
	issues: SvgVerificationIssue[];
}

/** Vérifie les invariants d'accessibilité, de contraste, de grille 4px et d'orthogonalité d'un SVG éditorial. */
export function verifyEditorialSvg(svg: string): SvgVerificationReport {
	const issues: SvgVerificationIssue[] = [];

	// 1. Accessibilité SVG
	if (!/\brole="img"/.test(svg)) {
		issues.push({ rule: 'a11y', message: 'Attribut role="img" manquant sur <svg>.' });
	}
	if (!/\baria-labelledby="([^"]+)"/.test(svg)) {
		issues.push({ rule: 'a11y', message: 'Attribut aria-labelledby manquant sur <svg>.' });
	}
	if (!/<svg\b[^>]*>\s*<title\b[^>]*id="([^"]+)"/.test(svg)) {
		issues.push({ rule: 'a11y', message: '<title id="..."> doit être le premier enfant de <svg>.' });
	}
	if (!/<desc\b[^>]*id="([^"]+)"/.test(svg)) {
		issues.push({ rule: 'a11y', message: '<desc id="..."> manquant dans <svg>.' });
	}

	// Unicité des IDs XML dans le document SVG (exclut les attributs data-*-id)
	const seenIds = new Set<string>();
	for (const match of svg.matchAll(/(?<=\s)id="([^"]+)"/g)) {
		const id = match[1];
		if (seenIds.has(id)) {
			issues.push({ rule: 'a11y', message: `Collision d'identifiant SVG dupliqué : "${id}".` });
		}
		seenIds.add(id);
	}

	// 2. Contraste du skin déclaré
	const skinMatch = svg.match(/\bdata-skin="(light|dark|full-editorial)"/);
	if (skinMatch) {
		const contrast = verifySkinContrast(skinMatch[1] as EditorialSkin);
		if (!contrast.ok) {
			for (const failed of contrast.checks.filter((c) => !c.pass)) {
				issues.push({
					rule: 'contrast',
					message: `Contraste insuffisant pour ${failed.role} (${failed.ratio}:1 < ${failed.minimum}:1).`
				});
			}
		}
	}

	// 3. Grille stricte 4px sur les rectangles de nœuds (`data-role="bounds"`)
	for (const rectMatch of svg.matchAll(/<rect\b[^>]*data-role="bounds"[^>]*>/g)) {
		const tag = rectMatch[0];
		for (const attr of ['x', 'y', 'width', 'height'] as const) {
			const m = tag.match(new RegExp(`\\b${attr}="([\\d.-]+)"`));
			if (m) {
				const val = Number(m[1]);
				if (!Number.isFinite(val) || val % 4 !== 0) {
					issues.push({
						rule: 'grid-4px',
						message: `Coordonnée ${attr}="${val}" non divisible par 4 sur un nœud.`
					});
				}
			}
		}
	}

	// 4. Zéro segment diagonal dans les connecteurs (<path> avec marker-end)
	for (const pathMatch of svg.matchAll(/<path\b[^>]*marker-end="[^"]+"[^>]*>/g)) {
		const tag = pathMatch[0];
		const dMatch = tag.match(/\bd="([^"]+)"/);
		if (!dMatch) continue;
		const d = dMatch[1];
		// Commande L x y : autorisée uniquement si strictement horizontale ou verticale
		let curX = 0;
		let curY = 0;
		const tokens = d.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g) ?? [];
		let i = 0;
		while (i < tokens.length) {
			const cmd = tokens[i++];
			if (cmd === 'M') {
				curX = Number(tokens[i++]);
				curY = Number(tokens[i++]);
			} else if (cmd === 'H') {
				curX = Number(tokens[i++]);
			} else if (cmd === 'V') {
				curY = Number(tokens[i++]);
			} else if (cmd === 'Q') {
				i += 2; // control point
				curX = Number(tokens[i++]);
				curY = Number(tokens[i++]);
			} else if (cmd === 'L') {
				const nx = Number(tokens[i++]);
				const ny = Number(tokens[i++]);
				if (Math.abs(nx - curX) > 0.5 && Math.abs(ny - curY) > 0.5) {
					issues.push({
						rule: 'orthogonal',
						message: `Segment diagonal détecté (${curX},${curY} -> ${nx},${ny}) dans un connecteur.`
					});
				}
				curX = nx;
				curY = ny;
			}
		}
	}

	return { ok: issues.length === 0, issues };
}

/** Vérifie l'intégrité structurelle d'un registre `.registry.json` : IDs uniques, parents résolus, zéro cycle. */
export function verifyBlockRegistry(sidecar: BlockRegistrySidecar): SvgVerificationReport {
	const issues: SvgVerificationIssue[] = [];
	const byId = new Map<string, string | undefined>();

	for (const block of sidecar.blocks) {
		if (!block.id || !block.name) {
			issues.push({ rule: 'registry', message: 'Bloc sans id ou name obligatoire.' });
			continue;
		}
		if (byId.has(block.id)) {
			issues.push({ rule: 'registry', message: `Identifiant de bloc dupliqué : "${block.id}".` });
		}
		byId.set(block.id, block.parent);
	}

	for (const block of sidecar.blocks) {
		if (block.parent && !byId.has(block.parent)) {
			issues.push({
				rule: 'registry',
				message: `Le bloc "${block.id}" référence un parent inconnu "${block.parent}".`
			});
		}
		// Détection de cycle
		const visited = new Set<string>([block.id]);
		let curr = block.parent;
		while (curr) {
			if (visited.has(curr)) {
				issues.push({ rule: 'registry', message: `Cycle détecté sur le bloc "${block.id}".` });
				break;
			}
			visited.add(curr);
			curr = byId.get(curr);
		}
	}

	return { ok: issues.length === 0, issues };
}
