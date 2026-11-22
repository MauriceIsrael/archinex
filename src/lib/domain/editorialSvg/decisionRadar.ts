/**
 * Vue Éditoriale : Radar Multi-Critères (`type-radar` de diagram-design).
 * Compare visuellement la forme des compromis de 2 à 4 options sur 3 à 6 critères pondérés :
 * - Palette éditoriale désaturée pour les options concurrentes,
 * - Unique série focale `accent` pour l'option retenue,
 * - Graduation explicite (1..5) et résumé chiffré en légende latérale.
 */

import {
	DEFAULT_EDITORIAL_DIALS,
	SIZE_PRESETS,
	type EditorialDials,
	type EditorialDiagramResult
} from './dials';
import type { DecisionHeatmapCriterion, DecisionHeatmapOption } from './decisionCardCharts';
import { buildAccessibleSvg, ceil4, escapeXml, snap4, toSlug } from './primitives';
import { EDITORIAL_SKINS, fitLabelToWidth, getEditorialFonts } from './tokens';

export interface DecisionRadarInput {
	subjectId: string;
	sectionRef?: string;
	subjectName: string;
	criteria: DecisionHeatmapCriterion[];
	options: DecisionHeatmapOption[];
	dials?: Partial<EditorialDials>;
}

const SERIES_STROKES = {
	light: ['#2e5aa8', '#4f5d75', '#6b7280'],
	dark: ['#739fdf', '#bfc0c0', '#949eb2'],
	'full-editorial': ['#285299', '#4a5568', '#6b7280']
};

export function renderDecisionRadar(input: DecisionRadarInput): EditorialDiagramResult {
	const dials: EditorialDials = { ...DEFAULT_EDITORIAL_DIALS, ...input.dials };
	const preset = SIZE_PRESETS[dials.size];
	const t = EDITORIAL_SKINS[dials.skin];
	const f = getEditorialFonts(dials.fontSource);
	const slug = `${toSlug(input.sectionRef || input.subjectId)}-radar-${dials.skin}`;

	const visibleCriteria = input.criteria.slice(0, 6);
	const visibleOptions = input.options.slice(0, 4);

	const canvasW = ceil4(Math.max(preset.width, 840));
	const canvasH = 440;
	const cx = snap4(canvasW * 0.38);
	const cy = 256;
	const radius = 128;

	const parts: string[] = [];

	if (visibleCriteria.length < 3 || visibleOptions.length === 0) {
		parts.push(
			`  <rect x="32" y="120" width="${snap4(canvasW - 64)}" height="64" rx="6" fill="${t.nodeOptionalFill}" stroke="${t.nodeOptionalStroke}" stroke-width="1" stroke-dasharray="4,3"/>`
		);
		parts.push(
			`  <text x="${snap4(canvasW / 2)}" y="156" fill="${t.muted}" font-size="11" font-family="${f.nodeName}" text-anchor="middle">Au moins 3 critères pondérés et 1 option sont requis pour tracer le radar multi-axes</text>`
		);
	} else {
		const n = visibleCriteria.length;
		const angleOf = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

		// Grille concentrique (niveaux 1..5)
		parts.push(`  <g class="editorial-radar-grid">`);
		for (let ring = 1; ring <= 5; ring++) {
			const r = (radius * ring) / 5;
			const pts = visibleCriteria
				.map((_, i) => {
					const a = angleOf(i);
					return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
				})
				.join(' ');
			parts.push(
				`    <polygon points="${pts}" fill="none" stroke="${ring === 5 ? t.ruleSolid : t.rule}" stroke-width="1"/>`
			);
			parts.push(
				`    <text x="${cx + 6}" y="${(cy - r + 4).toFixed(1)}" fill="${t.soft}" font-size="8" font-family="${f.sublabel}">${ring}</text>`
			);
		}

		// Axes + étiquettes de critères
		visibleCriteria.forEach((crit, i) => {
			const a = angleOf(i);
			const ax = cx + radius * Math.cos(a);
			const ay = cy + radius * Math.sin(a);
			const lx = cx + (radius + 22) * Math.cos(a);
			const ly = cy + (radius + 22) * Math.sin(a);
			const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';

			parts.push(`    <line x1="${cx}" y1="${cy}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="${t.rule}" stroke-width="1"/>`);
			parts.push(
				`    <text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" fill="${t.ink}" font-size="10" font-weight="600" font-family="${f.nodeName}" text-anchor="${anchor}">${escapeXml(fitLabelToWidth(crit.name, 120, 10, 'sans'))}</text>`
			);
			parts.push(
				`    <text x="${lx.toFixed(1)}" y="${(ly + 14).toFixed(1)}" fill="${t.muted}" font-size="8" font-family="${f.sublabel}" text-anchor="${anchor}">×${crit.weight}</text>`
			);
		});
		parts.push(`  </g>`);

		// Polygones d'options (non-retenues d'abord, option retenue en dernier au premier plan)
		const orderedOptions = [...visibleOptions].sort((a, b) => Number(Boolean(a.retained)) - Number(Boolean(b.retained)));
		const secondaryPalette = SERIES_STROKES[dials.skin];
		let secIdx = 0;

		const panelX = snap4(canvasW * 0.68);
		const panelW = snap4(canvasW - panelX - 28);

		parts.push(`  <g class="editorial-radar-series">`);
		orderedOptions.forEach((opt) => {
			const isFocal = Boolean(opt.retained);
			const stroke = isFocal ? t.accent : secondaryPalette[secIdx++ % secondaryPalette.length];
			const fill = isFocal ? t.accentTint : 'none';
			const dash = isFocal ? '' : ' stroke-dasharray="4,3"';

			const pts = visibleCriteria
				.map((crit, i) => {
					const raw = opt.scores[crit.id];
					const val = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(5, raw)) : 0;
					const r = (radius * val) / 5;
					const a = angleOf(i);
					return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
				})
				.join(' ');

			parts.push(
				`    <polygon data-option-id="${escapeXml(opt.id)}" points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${isFocal ? '1.8' : '1.2'}"${dash}/>`
			);
		});
		parts.push(`  </g>`);

		// Panneau latéral des scores moyens pondérés
		parts.push(`  <g class="editorial-radar-summary">`);
		parts.push(
			`    <text x="${panelX}" y="128" fill="${t.muted}" font-size="8" font-family="${f.eyebrow}" letter-spacing="0.12em">OPTIONS COMPARÉES</text>`
		);
		let sIdx = 0;
		visibleOptions.forEach((opt, idx) => {
			const py = snap4(144 + idx * 64);
			const isFocal = Boolean(opt.retained);
			const stroke = isFocal ? t.accent : secondaryPalette[sIdx++ % secondaryPalette.length];
			let wSum = 0;
			let wTotal = 0;
			for (const c of visibleCriteria) {
				const raw = opt.scores[c.id];
				if (typeof raw === 'number' && Number.isFinite(raw)) {
					wSum += raw * c.weight;
					wTotal += c.weight;
				}
			}
			const avg = wTotal > 0 ? (wSum / wTotal).toFixed(2) : '—';
			parts.push(
				`    <g class="editorial-node editorial-clickable" data-block-id="${escapeXml(opt.id)}" data-block-name="${escapeXml(opt.title)}">`
			);
			parts.push(
				`      <rect data-role="bounds" x="${panelX}" y="${py}" width="${panelW}" height="52" rx="6" fill="${isFocal ? t.accentTint : t.nodeBackendFill}" stroke="${stroke}" stroke-width="1"${isFocal ? '' : ' stroke-dasharray="4,3"'}/>`
			);
			parts.push(
				`      <text x="${panelX + 12}" y="${py + 18}" fill="${isFocal ? t.accent : t.muted}" font-size="8" font-family="${f.eyebrow}">${isFocal ? '★ RETENUE' : 'CANDIDATE'} · SCORE ${avg}/5</text>`
			);
			parts.push(
				`      <text x="${panelX + 12}" y="${py + 36}" fill="${t.ink}" font-size="11" font-weight="600" font-family="${f.nodeName}">${escapeXml(fitLabelToWidth(opt.title, panelW - 24, 11, 'sans'))}</text>`
			);
			parts.push(`    </g>`);
		});
		parts.push(`  </g>`);
	}

	const title = `Radar multi-critères · ${input.subjectName}`;
	const description = `Comparaison radar de ${visibleOptions.length} option(s) sur ${visibleCriteria.length} critère(s) pondéré(s) pour ${input.subjectName}.`;

	const envelope = buildAccessibleSvg({
		slug,
		diagramType: 'decision-radar',
		title,
		description,
		width: canvasW,
		height: Math.max(preset.minHeight, canvasH),
		skin: dials.skin,
		fontSource: dials.fontSource,
		headerEyebrow: `Comparaison Multi-Axes · ${input.sectionRef || 'Arbitrage'} · Radar`,
		headerTitle: fitLabelToWidth(input.subjectName, canvasW - 64, 22, 'serif'),
		headerSubtitle: `${visibleOptions.length} option(s) sur ${visibleCriteria.length} axe(s) · Option retenue en unique série focale`,
		bodyContent: parts.join('\n'),
		legendItems: [
			{ label: 'Option retenue (trait plein focal)', variant: 'focal' },
			{ label: 'Options alternatives (pointillé)', variant: 'optional' }
		]
	});

	return {
		diagramType: 'decision-radar',
		slug,
		title,
		description,
		svg: envelope.svg,
		width: envelope.width,
		height: envelope.height,
		dials,
		ledger: {
			detail: dials.detail,
			sourceNodeCount: input.options.length,
			drawnNodeCount: visibleOptions.length,
			entries: [
				{
					action: 'kept',
					count: visibleOptions.length,
					summary: `${visibleOptions.length} option(s) tracée(s) sur ${visibleCriteria.length} critère(s)`
				}
			]
		}
	};
}
