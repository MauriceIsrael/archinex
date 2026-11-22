/**
 * Vue Éditoriale #423 (3/3) : Matrice Thermique de la Carte de Décision (`type-heatmap` + `primitive-annotation`).
 * Affiche Options × Critères pondérés avec score numérique explicite dans chaque cellule (jamais la couleur seule),
 * total pondéré, option retenue mise en exergue en `accent` et callout éditorial optionnel.
 */

import {
	DEFAULT_EDITORIAL_DIALS,
	SIZE_PRESETS,
	type EditorialDials,
	type EditorialDiagramResult
} from './dials';
import { buildAccessibleSvg, ceil4, escapeXml, renderAnnotationCallout, snap4, toSlug } from './primitives';
import { EDITORIAL_SKINS, fitLabelToWidth, getEditorialFonts } from './tokens';

export interface DecisionHeatmapCriterion {
	id: string;
	name: string;
	weight: number;
}

export interface DecisionHeatmapOption {
	id: string;
	title: string;
	retained?: boolean;
	scores: Record<string, number | null>;
}

export interface DecisionHeatmapInput {
	subjectId: string;
	sectionRef?: string;
	subjectName: string;
	criteria: DecisionHeatmapCriterion[];
	options: DecisionHeatmapOption[];
	calloutText?: string;
	dials?: Partial<EditorialDials>;
}

export function renderDecisionHeatmap(input: DecisionHeatmapInput): EditorialDiagramResult {
	const dials: EditorialDials = { ...DEFAULT_EDITORIAL_DIALS, ...input.dials };
	const preset = SIZE_PRESETS[dials.size];
	const t = EDITORIAL_SKINS[dials.skin];
	const f = getEditorialFonts(dials.fontSource);
	const slug = `${toSlug(input.sectionRef || input.subjectId)}-heatmap-${dials.skin}`;

	const visibleCriteria = input.criteria.slice(0, dials.detail === 'simplified' ? 4 : 6);
	const visibleOptions = input.options.slice(0, 5);

	const marginX = 28;
	const optLabelW = 220;
	const totalColW = 92;
	const cellW = 104;
	const cellGap = 8;
	const rowH = 48;
	const rowGap = 8;

	const gridW = visibleCriteria.length * (cellW + cellGap);
	const canvasW = ceil4(Math.max(preset.width, marginX * 2 + optLabelW + gridW + totalColW + 24));
	const headerY = 108;
	const firstRowY = 128;

	const parts: string[] = [];

	// En-têtes critères
	parts.push(`  <g class="editorial-heatmap-headers">`);
	parts.push(
		`    <text x="${marginX}" y="${headerY}" fill="${t.muted}" font-size="8" font-family="${f.eyebrow}" letter-spacing="0.12em">OPTION CANDIDATE</text>`
	);
	visibleCriteria.forEach((crit, cIdx) => {
		const cx = snap4(marginX + optLabelW + cIdx * (cellW + cellGap) + cellW / 2);
		parts.push(
			`    <text x="${cx}" y="${headerY - 4}" fill="${t.ink}" font-size="9" font-weight="600" font-family="${f.nodeName}" text-anchor="middle">${escapeXml(fitLabelToWidth(crit.name, cellW - 8, 9, 'sans'))}</text>`
		);
		parts.push(
			`    <text x="${cx}" y="${headerY + 8}" fill="${t.muted}" font-size="8" font-family="${f.sublabel}" text-anchor="middle">poids ×${crit.weight}</text>`
		);
	});
	const totalX = snap4(marginX + optLabelW + visibleCriteria.length * (cellW + cellGap) + 8);
	parts.push(
		`    <text x="${snap4(totalX + totalColW / 2)}" y="${headerY}" fill="${t.accent}" font-size="8" font-family="${f.eyebrow}" text-anchor="middle" letter-spacing="0.1em">SCORE</text>`
	);
	parts.push(`  </g>`);

	if (visibleOptions.length === 0 || visibleCriteria.length === 0) {
		parts.push(
			`  <rect x="${marginX}" y="${firstRowY}" width="${snap4(canvasW - marginX * 2)}" height="52" rx="6" fill="${t.nodeOptionalFill}" stroke="${t.nodeOptionalStroke}" stroke-width="1" stroke-dasharray="4,3"/>`
		);
		parts.push(
			`  <text x="${snap4(canvasW / 2)}" y="${firstRowY + 30}" fill="${t.muted}" font-size="11" font-family="${f.nodeName}" text-anchor="middle">Ajoutez des options et critères pondérés pour afficher la matrice thermique</text>`
		);
	}

	let retainedRowY: number | null = null;

	visibleOptions.forEach((opt, rIdx) => {
		const ry = snap4(firstRowY + rIdx * (rowH + rowGap));
		if (opt.retained) retainedRowY = ry;

		parts.push(`  <g data-option-id="${escapeXml(opt.id)}"${opt.retained ? ' data-retained="true"' : ''}>`);
		// Étiquette option
		parts.push(
			`    <rect data-role="bounds" x="${marginX}" y="${ry}" width="${optLabelW - 12}" height="${rowH}" rx="6" fill="${opt.retained ? t.accentTint : t.nodeBackendFill}" stroke="${opt.retained ? t.accent : t.ruleSolid}" stroke-width="1"/>`
		);
		parts.push(
			`    <text x="${marginX + 12}" y="${ry + 20}" fill="${opt.retained ? t.accent : t.muted}" font-size="8" font-family="${f.eyebrow}">${opt.retained ? '★ RETENUE' : 'CANDIDATE'}</text>`
		);
		parts.push(
			`    <text x="${marginX + 12}" y="${ry + 36}" fill="${t.ink}" font-size="11" font-weight="600" font-family="${f.nodeName}">${escapeXml(fitLabelToWidth(opt.title, optLabelW - 32, 11, 'sans'))}</text>`
		);

		let weightedSum = 0;
		let weightSum = 0;

		visibleCriteria.forEach((crit, cIdx) => {
			const cx = snap4(marginX + optLabelW + cIdx * (cellW + cellGap));
			const raw = opt.scores[crit.id];
			const hasVal = typeof raw === 'number' && Number.isFinite(raw);
			if (hasVal) {
				weightedSum += raw * crit.weight;
				weightSum += crit.weight;
			}
			const isHigh = hasVal && raw >= 4;
			const isLow = hasVal && raw <= 2;
			const fill = !hasVal
				? t.nodeOptionalFill
				: opt.retained && isHigh
					? t.accentTint
					: isHigh
						? t.nodeStoreFill
						: t.nodeBackendFill;
			const stroke = !hasVal ? t.nodeOptionalStroke : isLow ? t.accent : t.ruleSolid;
			const dash = !hasVal ? ' stroke-dasharray="4,3"' : '';
			const labelText = hasVal ? `${raw}/5` : 'N/A';

			parts.push(
				`    <g class="editorial-node editorial-clickable" data-block-id="${escapeXml(`${opt.id}:${crit.id}`)}" data-block-name="${escapeXml(`${opt.title} · ${crit.name} = ${labelText}`)}">`
			);
			parts.push(
				`      <rect data-role="bounds" x="${cx}" y="${ry}" width="${cellW}" height="${rowH}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1"${dash}/>`
			);
			parts.push(
				`      <text x="${snap4(cx + cellW / 2)}" y="${ry + 28}" fill="${isLow ? t.accent : t.ink}" font-size="12" font-weight="600" font-family="${f.sublabel}" text-anchor="middle">${labelText}</text>`
			);
			parts.push(`    </g>`);
		});

		const finalScore = weightSum > 0 ? (weightedSum / weightSum).toFixed(2) : '—';
		parts.push(
			`    <rect data-role="bounds" x="${totalX}" y="${ry}" width="${totalColW}" height="${rowH}" rx="6" fill="${opt.retained ? t.accentTint : t.paper2}" stroke="${opt.retained ? t.accent : t.ruleSolid}" stroke-width="1"/>`
		);
		parts.push(
			`    <text x="${snap4(totalX + totalColW / 2)}" y="${ry + 28}" fill="${opt.retained ? t.accent : t.ink}" font-size="12" font-weight="700" font-family="${f.sublabel}" text-anchor="middle">${finalScore}</text>`
		);
		parts.push(`  </g>`);
	});

	if (input.calloutText && retainedRowY !== null && totalX + totalColW + 140 <= canvasW) {
		parts.push(
			renderAnnotationCallout({
				targetX: totalX + totalColW,
				targetY: retainedRowY + 24,
				textX: totalX + totalColW + 20,
				textY: retainedRowY + 16,
				text: fitLabelToWidth(input.calloutText, 120, 10, 'serif'),
				skin: dials.skin,
				fontSource: dials.fontSource
			})
		);
	}

	const bottomY = visibleOptions.length > 0 ? firstRowY + visibleOptions.length * (rowH + rowGap) + 20 : firstRowY + 80;

	const title = `Matrice de décision pondérée · ${input.subjectName}`;
	const description = `Matrice thermique Options × Critères pondérés pour ${input.subjectName} (${visibleOptions.length} option(s), ${visibleCriteria.length} critère(s)).`;

	const envelope = buildAccessibleSvg({
		slug,
		diagramType: 'decision-heatmap',
		title,
		description,
		width: canvasW,
		height: Math.max(preset.minHeight, bottomY),
		skin: dials.skin,
		fontSource: dials.fontSource,
		headerEyebrow: `Carte de Décision · ${input.sectionRef || 'Arbitrage'} · Matrice Pondérée`,
		headerTitle: fitLabelToWidth(input.subjectName, canvasW - 64, 22, 'serif'),
		headerSubtitle: `${visibleOptions.length} option(s) × ${visibleCriteria.length} critère(s) pondéré(s) · Valeurs explicites dans chaque cellule`,
		bodyContent: parts.join('\n'),
		legendItems: [
			{ label: 'Option retenue / Score faible (≤2)', variant: 'focal' },
			{ label: 'Évaluation complète', variant: 'backend' },
			{ label: 'Non évalué (N/A)', variant: 'optional' }
		]
	});

	return {
		diagramType: 'decision-heatmap',
		slug,
		title,
		description,
		svg: envelope.svg,
		width: envelope.width,
		height: envelope.height,
		dials,
		ledger: {
			detail: dials.detail,
			sourceNodeCount: input.options.length * input.criteria.length,
			drawnNodeCount: visibleOptions.length * visibleCriteria.length,
			entries: [
				{
					action: 'kept',
					count: visibleOptions.length,
					summary: `${visibleOptions.length} option(s) évaluée(s) sur ${visibleCriteria.length} critère(s)`
				}
			]
		}
	};
}
