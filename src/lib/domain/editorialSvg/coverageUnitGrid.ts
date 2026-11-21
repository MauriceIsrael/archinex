/**
 * Vue Éditoriale : Grille d'Unités de Couverture (`type-unit-grid` de diagram-design).
 * Chaque exigence est représentée par une tuile discrète cliquable alignée sur la grille 4px,
 * permettant une lecture exécutive immédiate de la complétude sur des dossiers de 10 à 120 exigences
 * sans masquer les trous derrière un pourcentage global.
 */

import {
	DEFAULT_EDITORIAL_DIALS,
	SIZE_PRESETS,
	type EditorialDials,
	type EditorialDiagramResult
} from './dials';
import type { TraceabilityRowInput } from './requirementTraceability';
import { buildAccessibleSvg, ceil4, escapeXml, snap4, toSlug } from './primitives';
import { EDITORIAL_SKINS, fitLabelToWidth, getEditorialFonts } from './tokens';

export interface CoverageUnitGridInput {
	subjectId: string;
	sectionRef?: string;
	subjectName: string;
	rows: TraceabilityRowInput[];
	dials?: Partial<EditorialDials>;
}

type UnitBucket = 'verified' | 'designed_unverified' | 'unlinked';

function classifyRow(row: TraceabilityRowInput): UnitBucket {
	if (row.designElementId && row.verificationId) return 'verified';
	if (row.designElementId) return 'designed_unverified';
	return 'unlinked';
}

export function renderCoverageUnitGrid(input: CoverageUnitGridInput): EditorialDiagramResult {
	const dials: EditorialDials = { ...DEFAULT_EDITORIAL_DIALS, ...input.dials };
	const preset = SIZE_PRESETS[dials.size];
	const t = EDITORIAL_SKINS[dials.skin];
	const f = getEditorialFonts(dials.fontSource);
	const slug = `${toSlug(input.sectionRef || input.subjectId)}-unit-grid-${dials.skin}`;

	const maxUnits = dials.detail === 'simplified' ? 40 : dials.detail === 'balanced' ? 80 : 120;
	const sortedRows = [...input.rows].sort((a, b) => {
		const order: Record<UnitBucket, number> = { verified: 0, designed_unverified: 1, unlinked: 2 };
		return order[classifyRow(a)] - order[classifyRow(b)];
	});
	const visibleRows = sortedRows.slice(0, maxUnits);
	const hiddenRows = Math.max(0, sortedRows.length - visibleRows.length);

	const counts = { verified: 0, designed_unverified: 0, unlinked: 0 };
	for (const r of sortedRows) counts[classifyRow(r)] += 1;

	const canvasW = ceil4(Math.max(preset.width, 840));
	const marginX = 32;
	const tileSize = 24;
	const tileGap = 8;
	const cols = Math.max(8, Math.floor((canvasW - marginX * 2 - 220) / (tileSize + tileGap)));

	const gridStartY = 128;
	const parts: string[] = [];

	// Compteurs explicites à gauche (texte + chiffre, jamais la couleur seule)
	parts.push(`  <g class="editorial-unit-summary">`);
	parts.push(
		`    <text x="${marginX}" y="112" fill="${t.muted}" font-size="8" font-family="${f.eyebrow}" letter-spacing="0.12em">1 TUILE = 1 EXIGENCE (${sortedRows.length} AU TOTAL)</text>`
	);

	const summaryX = snap4(canvasW - 212);
	const summaryW = 180;
	const summaryCards: Array<{ label: string; count: number; sub: string; focal?: boolean; dashed?: boolean }> = [
		{ label: 'VÉRIFIÉES', count: counts.verified, sub: 'Conception + Preuve' },
		{ label: 'NON VÉRIFIÉES', count: counts.designed_unverified, sub: 'Conçues sans preuve', dashed: true },
		{ label: 'SANS CONCEPTION', count: counts.unlinked, sub: 'Trous prioritaires', focal: counts.unlinked > 0, dashed: true }
	];

	summaryCards.forEach((card, idx) => {
		const cy = snap4(gridStartY + idx * 68);
		parts.push(
			`    <rect data-role="bounds" x="${summaryX}" y="${cy}" width="${summaryW}" height="56" rx="6" fill="${card.focal ? t.accentTint : t.nodeBackendFill}" stroke="${card.focal ? t.accent : t.ruleSolid}" stroke-width="1"${card.dashed ? ' stroke-dasharray="4,3"' : ''}/>`
		);
		parts.push(
			`    <text x="${summaryX + 12}" y="${cy + 18}" fill="${card.focal ? t.accent : t.muted}" font-size="8" font-family="${f.eyebrow}">${card.label}</text>`
		);
		parts.push(
			`    <text x="${summaryX + 12}" y="${cy + 40}" fill="${card.focal ? t.accent : t.ink}" font-size="16" font-weight="700" font-family="${f.sublabel}">${card.count}</text>`
		);
		parts.push(
			`    <text x="${summaryX + 52}" y="${cy + 38}" fill="${t.muted}" font-size="9" font-family="${f.nodeName}">${card.sub}</text>`
		);
	});
	parts.push(`  </g>`);

	// Tuiles discrètes sur grille 4px
	parts.push(`  <g class="editorial-unit-tiles">`);
	if (visibleRows.length === 0) {
		parts.push(
			`    <rect x="${marginX}" y="${gridStartY}" width="${snap4(summaryX - marginX - 24)}" height="64" rx="6" fill="${t.nodeOptionalFill}" stroke="${t.nodeOptionalStroke}" stroke-width="1" stroke-dasharray="4,3"/>`
		);
		parts.push(
			`    <text x="${snap4(marginX + (summaryX - marginX - 24) / 2)}" y="${gridStartY + 36}" fill="${t.muted}" font-size="11" font-family="${f.nodeName}" text-anchor="middle">Aucune exigence rattachée</text>`
		);
	}

	visibleRows.forEach((row, idx) => {
		const col = idx % cols;
		const r = Math.floor(idx / cols);
		const tx = snap4(marginX + col * (tileSize + tileGap));
		const ty = snap4(gridStartY + r * (tileSize + tileGap));
		const bucket = classifyRow(row);

		const fill =
			bucket === 'verified' ? t.ink : bucket === 'designed_unverified' ? t.nodeStoreFill : t.accentTint;
		const stroke = bucket === 'unlinked' ? t.accent : t.ink;
		const dash = bucket === 'unlinked' ? ' stroke-dasharray="3,2"' : '';
		const glyph = bucket === 'verified' ? '✓' : bucket === 'designed_unverified' ? '·' : '!';
		const glyphColor = bucket === 'verified' ? t.paper : bucket === 'unlinked' ? t.accent : t.ink;

		parts.push(
			`    <g class="editorial-node editorial-clickable" data-unit-status="${bucket}" data-clause-ref="${escapeXml(row.requirementId)}" data-block-id="${escapeXml(row.requirementId)}" data-block-name="${escapeXml(row.requirementTitle)}">`
		);
		parts.push(
			`      <rect data-role="bounds" x="${tx}" y="${ty}" width="${tileSize}" height="${tileSize}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1"${dash}/>`
		);
		parts.push(
			`      <text x="${snap4(tx + tileSize / 2)}" y="${ty + 16}" fill="${glyphColor}" font-size="10" font-weight="700" font-family="${f.sublabel}" text-anchor="middle">${glyph}</text>`
		);
		parts.push(`    </g>`);
	});
	parts.push(`  </g>`);

	const gridRows = Math.max(3, Math.ceil(visibleRows.length / cols));
	const bottomY = Math.max(gridStartY + gridRows * (tileSize + tileGap) + 24, gridStartY + 216);

	const title = `Grille de couverture discrète · ${input.subjectName}`;
	const description = `Grille d'unités montrant ${sortedRows.length} exigence(s) : ${counts.verified} vérifiée(s), ${counts.designed_unverified} conçue(s) sans preuve, ${counts.unlinked} sans conception.`;

	const envelope = buildAccessibleSvg({
		slug,
		diagramType: 'coverage-unit-grid',
		title,
		description,
		width: canvasW,
		height: Math.max(preset.minHeight, bottomY),
		skin: dials.skin,
		fontSource: dials.fontSource,
		headerEyebrow: `Couverture Discrète · ${input.sectionRef || 'Complétude'} · Unit Grid`,
		headerTitle: fitLabelToWidth(input.subjectName, canvasW - 64, 22, 'serif'),
		headerSubtitle: `${counts.verified}/${sortedRows.length} vérifiée(s) · ${counts.unlinked} trou(s) prioritaire(s) cliquable(s)`,
		bodyContent: parts.join('\n'),
		legendItems: [
			{ label: '✓ Vérifiée (Conception + Preuve)', variant: 'backend' },
			{ label: '· Conçue sans preuve', variant: 'optional' },
			{ label: '! Sans conception (Trou)', variant: 'missing' }
		]
	});

	return {
		diagramType: 'coverage-unit-grid',
		slug,
		title,
		description,
		svg: envelope.svg,
		width: envelope.width,
		height: envelope.height,
		dials,
		ledger: {
			detail: dials.detail,
			sourceNodeCount: sortedRows.length,
			drawnNodeCount: visibleRows.length,
			entries: [
				...(hiddenRows > 0
					? [{ action: 'truncated' as const, count: hiddenRows, summary: `${hiddenRows} tuile(s) au-delà du budget ${maxUnits}` }]
					: []),
				{
					action: 'kept',
					count: visibleRows.length,
					summary: `${counts.verified} vérifiée(s), ${counts.designed_unverified} non vérifiée(s), ${counts.unlinked} sans conception`
				}
			]
		}
	};
}
