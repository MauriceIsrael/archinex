/**
 * Vue Pilote #2 : Traçabilité des Exigences (`type-requirement-traceability` de diagram-design).
 * 4 colonnes fixes : Source -> Requirement -> Satisfied by -> Verified by.
 * Contrat strict : tout maillon absent est nommé explicitement (`Aucun élément rattaché` / `Aucune vérification`)
 * avec `data-trace-missing="true"` et jamais masqué par une couleur seule.
 */

import {
	DEFAULT_EDITORIAL_DIALS,
	SIZE_PRESETS,
	type EditorialDials,
	type EditorialDiagramResult,
	type FidelityLedgerEntry
} from './dials';
import {
	buildAccessibleSvg,
	ceil4,
	escapeXml,
	snap4,
	toSlug
} from './primitives';
import { EDITORIAL_SKINS, fitLabelToWidth, getEditorialFonts } from './tokens';

export interface TraceabilityRowInput {
	requirementId: string;
	sourceRef: string;
	sourceLabel: string;
	requirementTitle: string;
	designElementId?: string | null;
	designElementLabel?: string | null;
	verificationId?: string | null;
	verificationLabel?: string | null;
}

export interface RequirementTraceabilityInput {
	subjectId: string;
	sectionRef?: string;
	subjectName: string;
	rows: TraceabilityRowInput[];
	focalRequirementId?: string;
	dials?: Partial<EditorialDials>;
}

const MAX_ROWS_BY_DETAIL = {
	simplified: 5,
	balanced: 6,
	faithful: 10
} as const;

export function renderRequirementTraceability(input: RequirementTraceabilityInput): EditorialDiagramResult {
	const dials: EditorialDials = { ...DEFAULT_EDITORIAL_DIALS, ...input.dials };
	const preset = SIZE_PRESETS[dials.size];
	const t = EDITORIAL_SKINS[dials.skin];
	const f = getEditorialFonts(dials.fontSource);
	const slug = `${toSlug(input.sectionRef || input.subjectId)}-traceability-${dials.skin}`;

	const maxRows = MAX_ROWS_BY_DETAIL[dials.detail];
	const visibleRows = input.rows.slice(0, maxRows);
	const hiddenRows = Math.max(0, input.rows.length - visibleRows.length);

	// Une seule ligne focale au maximum : priorité au premier trou de couverture, sinon focalRequirementId
	const focalId =
		input.focalRequirementId ??
		visibleRows.find((r) => !r.designElementId || !r.verificationId)?.requirementId ??
		null;

	const canvasW = ceil4(Math.max(preset.width, 920));
	const marginX = 28;
	const colGap = 24;
	const colW = snap4((canvasW - marginX * 2 - colGap * 3) / 4);
	const colXs = [
		marginX,
		snap4(marginX + colW + colGap),
		snap4(marginX + (colW + colGap) * 2),
		snap4(marginX + (colW + colGap) * 3)
	];

	const colHeaders = ['SOURCE', 'EXIGENCE', 'SATISFAIT PAR', 'VÉRIFIÉ PAR'];
	const headerY = 104;
	const firstRowY = 124;
	const rowH = 60;
	const rowGap = 12;

	const parts: string[] = [];

	// En-têtes de colonnes
	parts.push(`  <g class="editorial-trace-headers">`);
	colHeaders.forEach((heading, cIdx) => {
		parts.push(
			`    <text x="${colXs[cIdx]}" y="${headerY}" fill="${t.muted}" font-size="8" font-family="${f.eyebrow}" letter-spacing="0.12em">${escapeXml(heading)}</text>`
		);
	});
	parts.push(
		`    <line x1="${marginX}" y1="${headerY + 8}" x2="${snap4(canvasW - marginX)}" y2="${headerY + 8}" stroke="${t.ruleSolid}" stroke-width="1"/>`
	);
	parts.push(`  </g>`);

	if (visibleRows.length === 0) {
		parts.push(`  <g class="editorial-trace-empty">`);
		parts.push(
			`    <rect x="${marginX}" y="${firstRowY}" width="${snap4(canvasW - marginX * 2)}" height="56" rx="6" fill="${t.nodeOptionalFill}" stroke="${t.nodeOptionalStroke}" stroke-width="1" stroke-dasharray="4,3"/>`
		);
		parts.push(
			`    <text x="${snap4(canvasW / 2)}" y="${firstRowY + 32}" fill="${t.muted}" font-size="11" font-family="${f.nodeName}" text-anchor="middle">Aucune exigence rattachée à ce sujet</text>`
		);
		parts.push(`  </g>`);
	}

	let missingLinksCount = 0;

	visibleRows.forEach((row, rIdx) => {
		const ry = snap4(firstRowY + rIdx * (rowH + rowGap));
		const isFocal = row.requirementId === focalId;
		const srcId = `SRC-${rIdx + 1}`;
		const reqId = row.requirementId;
		const desId = row.designElementId || undefined;
		const verId = row.verificationId || undefined;

		if (!desId) missingLinksCount += 1;
		if (!verId) missingLinksCount += 1;

		parts.push(
			`  <g data-trace-row="${escapeXml(reqId)}" data-trace-source="${escapeXml(row.sourceRef)}" class="editorial-trace-row">`
		);

		// Séparateur horizontal entre lignes
		if (rIdx > 0) {
			parts.push(
				`    <line x1="${marginX}" y1="${ry - 6}" x2="${snap4(canvasW - marginX)}" y2="${ry - 6}" stroke="${t.rule}" stroke-width="1"/>`
			);
		}

		// Connecteurs horizontaux (strictement horizontaux, jamais en diagonale)
		const midY = snap4(ry + rowH / 2);
		// Source -> Requirement (derives)
		parts.push(
			`    <path data-trace-rel="derives" data-trace-from="${escapeXml(srcId)}" data-trace-to="${escapeXml(reqId)}" d="M ${colXs[0] + colW} ${midY} H ${colXs[1]}" fill="none" stroke="${t.muted}" stroke-width="1" marker-end="url(#${slug}-arrow)"/>`
		);

		// Requirement <-> Satisfied by
		if (desId) {
			parts.push(
				`    <path data-trace-rel="satisfies" data-trace-from="${escapeXml(desId)}" data-trace-to="${escapeXml(reqId)}" d="M ${colXs[1] + colW} ${midY} H ${colXs[2]}" fill="none" stroke="${isFocal ? t.accent : t.muted}" stroke-width="1" marker-end="url(#${slug}-${isFocal ? 'arrow-accent' : 'arrow'})"/>`
			);
		} else {
			parts.push(
				`    <path data-trace-rel="satisfies" data-trace-missing="true" data-trace-to="${escapeXml(reqId)}" d="M ${colXs[1] + colW} ${midY} H ${colXs[2]}" fill="none" stroke="${t.accent}" stroke-width="1" stroke-dasharray="4,3"/>`
			);
		}

		// Satisfied by <-> Verified by
		if (verId) {
			parts.push(
				`    <path data-trace-rel="verifies" data-trace-from="${escapeXml(verId)}" data-trace-to="${escapeXml(reqId)}" d="M ${colXs[2] + colW} ${midY} H ${colXs[3]}" fill="none" stroke="${t.muted}" stroke-width="1" marker-end="url(#${slug}-arrow)"/>`
			);
		} else {
			parts.push(
				`    <path data-trace-rel="verifies" data-trace-missing="true" data-trace-to="${escapeXml(reqId)}" d="M ${colXs[2] + colW} ${midY} H ${colXs[3]}" fill="none" stroke="${t.accent}" stroke-width="1" stroke-dasharray="4,3"/>`
			);
		}

		// Helper de rendu de cellule sur grille 4px
		const renderCell = (
			colIndex: number,
			kind: 'source' | 'requirement' | 'design' | 'verification',
			id: string | undefined,
			topTag: string,
			label: string,
			missing: boolean
		) => {
			const cx = colXs[colIndex];
			const fill = missing
				? t.nodeWarningTint
				: isFocal && kind === 'requirement'
					? t.accentTint
					: kind === 'source'
						? t.nodeStoreFill
						: t.nodeBackendFill;
			const stroke = missing
				? t.nodeWarningStroke
				: isFocal && kind === 'requirement'
					? t.accent
					: t.ink;
			const dash = missing ? ' stroke-dasharray="4,3"' : '';
			const idAttr = id ? ` data-trace-id="${escapeXml(id)}"` : ` data-trace-missing="true"`;

			return [
				`    <g class="editorial-node editorial-clickable" data-trace-kind="${kind}"${idAttr} data-clause-ref="${escapeXml(reqId)}">`,
				`      <rect x="${cx}" y="${ry}" width="${colW}" height="${rowH}" rx="6" fill="${t.paper}"/>`,
				`      <rect data-role="bounds" x="${cx}" y="${ry}" width="${colW}" height="${rowH}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1"${dash}/>`,
				`      <text x="${cx + 12}" y="${ry + 20}" fill="${missing || (isFocal && kind === 'requirement') ? t.accent : t.muted}" font-size="8" font-family="${f.eyebrow}" letter-spacing="0.06em">${escapeXml(fitLabelToWidth(topTag, colW - 24, 8, 'mono'))}</text>`,
				`      <text x="${cx + 12}" y="${ry + 40}" fill="${missing ? t.accent : t.ink}" font-size="11" font-weight="${missing ? '500' : '600'}" font-family="${f.nodeName}">${escapeXml(fitLabelToWidth(label, colW - 24, 11, 'sans'))}</text>`,
				`    </g>`
			].join('\n');
		};

		parts.push(renderCell(0, 'source', srcId, row.sourceRef, row.sourceLabel, false));
		parts.push(renderCell(1, 'requirement', reqId, reqId, row.requirementTitle, false));
		parts.push(
			renderCell(
				2,
				'design',
				desId,
				desId ? `SATISFAIT · ${desId}` : 'MANQUANT',
				desId && row.designElementLabel ? row.designElementLabel : 'Aucun élément rattaché',
				!desId
			)
		);
		parts.push(
			renderCell(
				3,
				'verification',
				verId,
				verId ? `VÉRIFIÉ · ${verId}` : 'NON VÉRIFIÉ',
				verId && row.verificationLabel ? row.verificationLabel : 'Aucune vérification',
				!verId
			)
		);

		parts.push(`  </g>`);
	});

	const bodyBottomY =
		visibleRows.length > 0 ? firstRowY + visibleRows.length * (rowH + rowGap) + 16 : firstRowY + 84;

	const ledgerEntries: FidelityLedgerEntry[] = [];
	if (hiddenRows > 0) {
		ledgerEntries.push({
			action: 'truncated',
			count: hiddenRows,
			summary: `${hiddenRows} exigence(s) supplémentaire(s) hors planche (budget ${maxRows} lignes en mode ${dials.detail})`
		});
	}
	ledgerEntries.push({
		action: 'kept',
		count: visibleRows.length,
		summary: `${visibleRows.length} chaîne(s) tracée(s), dont ${missingLinksCount} maillon(s) manquant(s) signalé(s)`
	});

	const title = `Traçabilité des exigences · ${input.subjectName}`;
	const description = `Matrice de traçabilité Source vers Exigence, Conception et Vérification pour ${input.subjectName} (${visibleRows.length} exigence(s) affichée(s), ${missingLinksCount} lien(s) manquant(s)).`;

	const envelope = buildAccessibleSvg({
		slug,
		diagramType: 'requirement-traceability',
		title,
		description,
		width: canvasW,
		height: Math.max(preset.minHeight, bodyBottomY),
		skin: dials.skin,
		fontSource: dials.fontSource,
		headerEyebrow: `Traçabilité Exigences · ${input.sectionRef || 'Couverture'} · ${dials.detail}`,
		headerTitle: fitLabelToWidth(input.subjectName, canvasW - 64, 22, 'serif'),
		headerSubtitle: `${input.rows.length} exigence(s) · ${missingLinksCount} maillon(s) manquant(s) explicitement nommé(s)`,
		bodyContent: parts.join('\n'),
		legendItems: [
			{ label: 'Ligne focale / Trou prioritaire', variant: 'focal' },
			{ label: 'Lien établi', variant: 'backend' },
			{ label: 'Lien manquant / Non vérifié', variant: 'missing' }
		]
	});

	return {
		diagramType: 'requirement-traceability',
		slug,
		title,
		description,
		svg: envelope.svg,
		width: envelope.width,
		height: envelope.height,
		dials,
		ledger: {
			detail: dials.detail,
			sourceNodeCount: input.rows.length,
			drawnNodeCount: visibleRows.length,
			entries: ledgerEntries
		}
	};
}
