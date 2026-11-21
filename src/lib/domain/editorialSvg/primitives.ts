/**
 * Primitives SVG éditoriales sur grille stricte 4px.
 * - Zéro ombre, bordures hairline 1px, border-radius max 8px.
 * - Connecteurs orthogonaux à coudes arrondis (r=8 ou r=6), zéro segment diagonal.
 * - Ordre de peinture strict : background -> zones -> arrows -> label masks -> nodes -> annotations -> legend.
 * - Contrat d'accessibilité SVG : role="img", aria-labelledby, <title> en premier enfant, <desc> en second.
 */

import { EDITORIAL_SKINS, getEditorialFonts, type EditorialSkin, type FontSource } from './tokens';

/** Quantifie toute coordonnée / dimension au multiple de 4px le plus proche. */
export function snap4(value: number): number {
	return Math.round(value / 4) * 4;
}

/** Quantifie par excès au multiple de 4px (utile pour largeur/hauteur minimales). */
export function ceil4(value: number): number {
	return Math.ceil(value / 4) * 4;
}

export function escapeXml(raw: string): string {
	return String(raw)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function toSlug(raw: string): string {
	return (
		raw
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'diagram'
	);
}

export function renderArrowMarkers(skin: EditorialSkin, slug: string): string {
	const t = EDITORIAL_SKINS[skin];
	return [
		`<marker id="${slug}-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">`,
		`  <polygon points="0 0, 8 3, 0 6" fill="${t.muted}"/>`,
		`</marker>`,
		`<marker id="${slug}-arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">`,
		`  <polygon points="0 0, 8 3, 0 6" fill="${t.accent}"/>`,
		`</marker>`,
		`<marker id="${slug}-arrow-link" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">`,
		`  <polygon points="0 0, 8 3, 0 6" fill="${t.link}"/>`,
		`</marker>`
	].join('\n');
}

/**
 * Construit un chemin SVG orthogonal (strictement horizontal + vertical) avec coudes arrondis `r=8` (ou `r=6`).
 * Ne génère jamais de segment diagonal.
 */
export function orthogonalTreeConnector(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	midY?: number
): string {
	const sx = snap4(x1);
	const sy = snap4(y1);
	const ex = snap4(x2);
	const ey = snap4(y2);

	if (sx === ex) {
		return `M ${sx} ${sy} V ${ey}`;
	}
	if (sy === ey) {
		return `M ${sx} ${sy} H ${ex}`;
	}

	const elbowY = snap4(midY ?? (sy + ey) / 2);
	const dx = ex - sx;
	const dy1 = elbowY - sy;
	const dy2 = ey - elbowY;
	const dirX = dx > 0 ? 1 : -1;
	const dirY1 = dy1 >= 0 ? 1 : -1;
	const dirY2 = dy2 >= 0 ? 1 : -1;

	const maxR = Math.min(8, Math.abs(dx) / 2, Math.abs(dy1), Math.abs(dy2));
	const r = maxR >= 6 ? (maxR >= 8 ? 8 : 6) : 0;

	if (r === 0) {
		return `M ${sx} ${sy} V ${elbowY} H ${ex} V ${ey}`;
	}

	const yBeforeTurn1 = elbowY - dirY1 * r;
	const xAfterTurn1 = sx + dirX * r;
	const xBeforeTurn2 = ex - dirX * r;
	const yAfterTurn2 = elbowY + dirY2 * r;

	return [
		`M ${sx} ${sy}`,
		`V ${yBeforeTurn1}`,
		`Q ${sx} ${elbowY} ${xAfterTurn1} ${elbowY}`,
		`H ${xBeforeTurn2}`,
		`Q ${ex} ${elbowY} ${ex} ${yAfterTurn2}`,
		`V ${ey}`
	].join(' ');
}

export interface NodeBoxOptions {
	x: number;
	y: number;
	width: number;
	height: number;
	title: string;
	sublabel?: string;
	tag?: string;
	variant?: 'backend' | 'focal' | 'store' | 'optional' | 'warning';
	skin: EditorialSkin;
	fontSource?: FontSource;
	titleFontSize?: number;
	sublabelFontSize?: number;
	dataAttributes?: Record<string, string | undefined>;
	clickable?: boolean;
}

/**
 * Boîte de nœud éditoriale normalisée :
 * 1. Masque opaque `paper` (empêche les flèches de traverser les fonds translucides)
 * 2. Contour hairline 1px sans ombre (rx=6)
 * 3. Badge de type rectangulaire (rx=2, jamais pill)
 * 4. Libellé principal (sans) + sous-libellé technique (mono)
 */
export function renderNodeBox(opts: NodeBoxOptions): string {
	const t = EDITORIAL_SKINS[opts.skin];
	const f = getEditorialFonts(opts.fontSource);
	const x = snap4(opts.x);
	const y = snap4(opts.y);
	const w = snap4(opts.width);
	const h = snap4(opts.height);
	const cx = snap4(x + w / 2);

	const variant = opts.variant ?? 'backend';
	let fill = t.nodeBackendFill;
	let stroke = t.ink;
	let dashAttr = '';
	let tagStroke = t.muted;
	let tagColor = t.muted;

	if (variant === 'focal') {
		fill = t.accentTint;
		stroke = t.accent;
		tagStroke = t.accent;
		tagColor = t.accent;
	} else if (variant === 'store') {
		fill = t.nodeStoreFill;
		stroke = t.muted;
	} else if (variant === 'optional') {
		fill = t.nodeOptionalFill;
		stroke = t.nodeOptionalStroke;
		dashAttr = ' stroke-dasharray="4,3"';
	} else if (variant === 'warning') {
		fill = t.nodeWarningTint;
		stroke = t.nodeWarningStroke;
		dashAttr = ' stroke-dasharray="4,4"';
		tagStroke = t.accent;
		tagColor = t.accent;
	}

	const dataAttrs = Object.entries(opts.dataAttributes ?? {})
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => ` ${k}="${escapeXml(v!)}"`)
		.join('');

	const cursorClass = opts.clickable ? ' class="editorial-node editorial-clickable"' : ' class="editorial-node"';
	const titleSize = opts.titleFontSize ?? 12;
	const subSize = opts.sublabelFontSize ?? 9;

	const parts: string[] = [];
	parts.push(`<g${cursorClass}${dataAttrs}>`);
	// 1. Opaque paper mask
	parts.push(`  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${t.paper}"/>`);
	// 2. Styled hairline box
	parts.push(
		`  <rect data-role="bounds" x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1"${dashAttr}/>`
	);

	// 3. Rectangular type tag (rx=2)
	if (opts.tag) {
		const tagW = ceil4(Math.max(32, opts.tag.length * 5.2 + 12));
		const tagX = snap4(x + 8);
		const tagY = snap4(y + 8);
		parts.push(
			`  <rect x="${tagX}" y="${tagY}" width="${tagW}" height="12" rx="2" fill="none" stroke="${tagStroke}" stroke-opacity="0.55" stroke-width="0.8"/>`
		);
		parts.push(
			`  <text x="${snap4(tagX + tagW / 2)}" y="${tagY + 9}" fill="${tagColor}" font-size="7" font-family="${f.eyebrow}" text-anchor="middle" letter-spacing="0.06em">${escapeXml(opts.tag)}</text>`
		);
	}

	// 4. Node title
	const titleY = opts.sublabel ? snap4(y + h / 2 + (opts.tag ? 4 : -2)) : snap4(y + h / 2 + 4);
	parts.push(
		`  <text x="${cx}" y="${titleY}" fill="${t.ink}" font-size="${titleSize}" font-weight="600" font-family="${f.nodeName}" text-anchor="middle">${escapeXml(opts.title)}</text>`
	);

	// 5. Technical sublabel
	if (opts.sublabel) {
		parts.push(
			`  <text x="${cx}" y="${titleY + 16}" fill="${t.muted}" font-size="${subSize}" font-family="${f.sublabel}" text-anchor="middle">${escapeXml(opts.sublabel)}</text>`
		);
	}

	parts.push(`</g>`);
	return parts.join('\n');
}

export interface AnnotationCalloutOptions {
	targetX: number;
	targetY: number;
	textX: number;
	textY: number;
	text: string;
	skin: EditorialSkin;
	fontSource?: FontSource;
}

/**
 * Primitive Annotation Callout (`primitive-annotation.md`) :
 * aparté éditorial en italique serif dans la marge relié par une courbe de Bézier pointillée.
 */
export function renderAnnotationCallout(opts: AnnotationCalloutOptions): string {
	const t = EDITORIAL_SKINS[opts.skin];
	const f = getEditorialFonts(opts.fontSource);
	const sx = snap4(opts.textX);
	const sy = snap4(opts.textY);
	const tx = snap4(opts.targetX);
	const ty = snap4(opts.targetY);
	const cx1 = snap4((sx + tx) / 2);
	const cy1 = sy;
	const cx2 = snap4((sx + tx) / 2);
	const cy2 = ty;

	return [
		`<g class="editorial-callout">`,
		`  <path d="M ${sx} ${sy + 4} C ${cx1} ${cy1 + 4}, ${cx2} ${cy2}, ${tx} ${ty}" fill="none" stroke="${t.accent}" stroke-width="1" stroke-dasharray="3,3"/>`,
		`  <circle cx="${tx}" cy="${ty}" r="2.5" fill="${t.accent}"/>`,
		`  <text x="${sx}" y="${sy}" fill="${t.accent}" font-size="11" font-style="italic" font-family="${f.callout}">${escapeXml(opts.text)}</text>`,
		`</g>`
	].join('\n');
}

export interface LegendItem {
	label: string;
	variant: 'focal' | 'backend' | 'optional' | 'missing';
}

/** Bande de légende horizontale en pied de figure, séparée par un filet hairline. */
export function renderLegendStrip(
	width: number,
	legendY: number,
	items: LegendItem[],
	skin: EditorialSkin,
	fontSource?: FontSource
): string {
	const t = EDITORIAL_SKINS[skin];
	const f = getEditorialFonts(fontSource);
	const y = snap4(legendY);
	const lines: string[] = [];

	lines.push(`<g class="editorial-legend">`);
	lines.push(`  <line x1="28" y1="${y}" x2="${snap4(width - 28)}" y2="${y}" stroke="${t.rule}" stroke-width="1"/>`);
	lines.push(
		`  <text x="28" y="${y + 20}" fill="${t.muted}" font-size="8" font-family="${f.eyebrow}" letter-spacing="0.14em">LÉGENDE</text>`
	);

	let cursorX = 112;
	for (const item of items) {
		const x = snap4(cursorX);
		let swatchFill = t.nodeBackendFill;
		let swatchStroke = t.ink;
		let dash = '';
		if (item.variant === 'focal') {
			swatchFill = t.accentTint;
			swatchStroke = t.accent;
		} else if (item.variant === 'optional') {
			swatchFill = t.nodeOptionalFill;
			swatchStroke = t.nodeOptionalStroke;
			dash = ' stroke-dasharray="3,2"';
		} else if (item.variant === 'missing') {
			swatchFill = t.nodeWarningTint;
			swatchStroke = t.nodeWarningStroke;
			dash = ' stroke-dasharray="3,2"';
		}
		lines.push(
			`  <rect x="${x}" y="${y + 12}" width="12" height="12" rx="2" fill="${swatchFill}" stroke="${swatchStroke}" stroke-width="1"${dash}/>`
		);
		lines.push(
			`  <text x="${x + 20}" y="${y + 21}" fill="${t.muted}" font-size="9" font-family="${f.sublabel}">${escapeXml(item.label)}</text>`
		);
		cursorX += ceil4(item.label.length * 6 + 48);
	}

	lines.push(`</g>`);
	return lines.join('\n');
}

export interface SvgEnvelopeOptions {
	slug: string;
	diagramType: string;
	title: string;
	description: string;
	width: number;
	height: number;
	skin: EditorialSkin;
	fontSource?: FontSource;
	headerEyebrow: string;
	headerTitle: string;
	headerSubtitle?: string;
	bodyContent: string;
	legendItems?: LegendItem[];
}

/**
 * Enveloppe SVG accessible conforme au contrat `diagram-design` :
 * - `role="img"` + `aria-labelledby="<slug>-title <slug>-desc"`
 * - `<title>` en premier enfant, `<desc>` en second enfant, avant `<defs>`
 * - fond `paper` propre sans ombre ni conteneur secondaire
 */
export function buildAccessibleSvg(opts: SvgEnvelopeOptions): { svg: string; width: number; height: number } {
	const t = EDITORIAL_SKINS[opts.skin];
	const f = getEditorialFonts(opts.fontSource);
	const w = snap4(opts.width);
	const legendHeight = opts.legendItems && opts.legendItems.length > 0 ? 44 : 0;
	const h = snap4(opts.height + legendHeight);
	const titleId = `${opts.slug}-title`;
	const descId = `${opts.slug}-desc`;

	const legendBlock =
		opts.legendItems && opts.legendItems.length > 0
			? renderLegendStrip(w, h - 40, opts.legendItems, opts.skin, opts.fontSource)
			: '';

	const svg = [
		`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${titleId} ${descId}" data-diagram="${escapeXml(opts.diagramType)}" data-skin="${opts.skin}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
		`  <title id="${titleId}">${escapeXml(opts.title)}</title>`,
		`  <desc id="${descId}">${escapeXml(opts.description)}</desc>`,
		`  <defs>`,
		renderArrowMarkers(opts.skin, opts.slug),
		`    <style>`,
		`      .editorial-clickable { cursor: pointer; }`,
		`      .editorial-clickable:hover rect[data-role="bounds"] { stroke-width: 1.6; }`,
		`    </style>`,
		`  </defs>`,
		`  <rect width="100%" height="100%" fill="${t.paper}"/>`,
		`  <g class="editorial-header">`,
		`    <text x="28" y="28" fill="${t.muted}" font-size="8" font-family="${f.eyebrow}" letter-spacing="0.14em">${escapeXml(opts.headerEyebrow.toUpperCase())}</text>`,
		`    <text x="28" y="52" fill="${t.ink}" font-size="22" font-family="${f.title}">${escapeXml(opts.headerTitle)}</text>`,
		opts.headerSubtitle
			? `    <text x="28" y="68" fill="${t.soft}" font-size="10" font-family="${f.sublabel}">${escapeXml(opts.headerSubtitle)}</text>`
			: '',
		`    <line x1="28" y1="80" x2="${snap4(w - 28)}" y2="80" stroke="${t.rule}" stroke-width="1"/>`,
		`  </g>`,
		opts.bodyContent,
		legendBlock,
		`</svg>`
	]
		.filter(Boolean)
		.join('\n');

	return { svg, width: w, height: h };
}

/**
 * Emballe un SVG éditorial dans un fichier HTML autonome ouvrable hors-ligne par double-clic.
 * Zéro script arbitraire, zéro requête réseau en mode `system` fonts.
 */
export function wrapStandaloneHtml(title: string, svg: string, skin: EditorialSkin): string {
	const t = EDITORIAL_SKINS[skin];
	return [
		`<!DOCTYPE html>`,
		`<html lang="fr">`,
		`<head>`,
		`  <meta charset="UTF-8" />`,
		`  <meta name="viewport" content="width=device-width, initial-scale=1.0" />`,
		`  <title>${escapeXml(title)}</title>`,
		`  <style>`,
		`    * { box-sizing: border-box; }`,
		`    body { margin: 0; padding: 24px; background: ${t.paper}; color: ${t.ink}; font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; }`,
		`    main { width: 100%; max-width: 1200px; }`,
		`    svg { width: 100%; height: auto; display: block; }`,
		`  </style>`,
		`</head>`,
		`<body>`,
		`  <main>`,
		svg,
		`  </main>`,
		`</body>`,
		`</html>`
	].join('\n');
}
