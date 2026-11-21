/**
 * Export déterministe SVG et CSV de la matrice de couverture des exigences (Issue #402).
 *
 * Fonctions PURES, sans DOM et sans horloge : mêmes données → mêmes octets.
 * Accessibilité : chaque cellule porte une icône symbolique ET un texte explicite (jamais la couleur seule).
 */

import type { CoverageReport, RequirementCoverageItem } from './coverageModel';

const STEP_COLUMNS: Array<{
	key: keyof RequirementCoverageItem['steps'];
	label: string;
}> = [
	{ key: 'qualified', label: 'Qualifiée' },
	{ key: 'attached', label: 'Rattachée' },
	{ key: 'decided', label: 'Décidée' },
	{ key: 'planned', label: 'Planifiée' },
	{ key: 'realized_proven', label: 'Réalisée prouvée' }
];

const CELL_TEXT: Record<'reached' | 'evacuated' | 'blocked' | 'missing', { icon: string; text: string; fill: string; stroke: string; textColor: string }> = {
	reached: { icon: '✓', text: 'OK', fill: '#ecfdf5', stroke: '#10b981', textColor: '#065f46' },
	evacuated: { icon: '⊘', text: 'Évac.', fill: '#f1f5f9', stroke: '#64748b', textColor: '#334155' },
	blocked: { icon: '✕', text: 'Bloq.', fill: '#fef2f2', stroke: '#ef4444', textColor: '#991b1b' },
	missing: { icon: '○', text: 'Att.', fill: '#f8fafc', stroke: '#cbd5e1', textColor: '#475569' }
};

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function escapeCsvCell(value: string): string {
	if (/[",\r\n;]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

/**
 * Exporte la matrice de couverture au format CSV (UTF-8, séparateur virgule).
 */
export function renderCoverageMatrixCsv(report: CoverageReport): string {
	const header = [
		'id',
		'clause_ref',
		'titre',
		'criticite',
		'domaine',
		'section',
		'responsable',
		'etape_courante',
		'qualifiee',
		'rattachee',
		'decidee',
		'planifiee',
		'realisee_prouvee',
		'sujets',
		'decisions',
		'trou_bloquant',
		'trou_message'
	];

	const lines = [header.join(',')];
	for (const item of report.items) {
		const row = [
			item.id,
			item.clauseRef,
			item.title,
			item.criticality,
			item.domain,
			item.section,
			item.owner,
			item.stageLabel,
			item.steps.qualified,
			item.steps.attached,
			item.steps.decided,
			item.steps.planned,
			item.steps.realized_proven,
			item.subjectTitles.join(' | '),
			item.decisionIds.join(' | '),
			item.gap?.blocking ? 'oui' : 'non',
			item.gap?.message ?? ''
		].map((v) => escapeCsvCell(String(v ?? '')));
		lines.push(row.join(','));
	}

	return lines.join('\n') + '\n';
}

/**
 * Exporte la matrice de couverture au format SVG autonome pour le dossier HLD et les revues.
 * Limite par défaut à 120 lignes dans le SVG pour rester imprimable ; indique le décompte total.
 */
export function renderCoverageMatrixSvg(
	report: CoverageReport,
	options?: { title?: string; maxRows?: number }
): string {
	const title = options?.title ?? 'Matrice de couverture des exigences';
	const maxRows = options?.maxRows ?? 120;
	const rows = report.items.slice(0, maxRows);

	const width = 980;
	const headerHeight = 96;
	const colHeaderHeight = 32;
	const rowHeight = 28;
	const footerHeight = 42;
	const height = headerHeight + colHeaderHeight + Math.max(1, rows.length) * rowHeight + footerHeight;

	const reqColW = 360;
	const critColW = 90;
	const stepColW = 100;

	const parts: string[] = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(title)}">`
	);
	parts.push(
		`<style>text{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;fill:#0f172a;}.muted{fill:#475569;font-size:11px;}.head{font-size:15px;font-weight:700;}.sub{font-size:12px;fill:#334155;}.th{font-size:11px;font-weight:700;fill:#1e293b;}.cell{font-size:11px;font-weight:600;}</style>`
	);
	parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" rx="8"/>`);

	// En-tête
	parts.push(`<text x="20" y="30" class="head">${escapeXml(title)}</text>`);
	parts.push(
		`<text x="20" y="52" class="sub">${escapeXml(report.indicators.headline)} · ${escapeXml(report.indicators.overallDecided.label)} · ${report.blockingGaps.length} trou(s) bloquant(s)</text>`
	);
	parts.push(
		`<text x="20" y="72" class="muted">Légende : ✓ OK (étape atteinte) · ⊘ Évac. (évacuée motivée) · ✕ Bloq. (bloquant/invalide) · ○ Att. (en attente)</text>`
	);

	// En-têtes de colonnes
	const tableTop = headerHeight;
	parts.push(`<rect x="16" y="${tableTop}" width="${width - 32}" height="${colHeaderHeight}" fill="#f1f5f9" stroke="#cbd5e1"/>`);
	parts.push(`<text x="24" y="${tableTop + 20}" class="th">Exigence</text>`);
	parts.push(`<text x="${16 + reqColW + 8}" y="${tableTop + 20}" class="th">Criticité</text>`);
	STEP_COLUMNS.forEach((col, idx) => {
		const x = 16 + reqColW + critColW + idx * stepColW + 8;
		parts.push(`<text x="${x}" y="${tableTop + 20}" class="th">${escapeXml(col.label)}</text>`);
	});

	// Lignes
	if (rows.length === 0) {
		const y = tableTop + colHeaderHeight;
		parts.push(`<rect x="16" y="${y}" width="${width - 32}" height="${rowHeight}" fill="#ffffff" stroke="#e2e8f0"/>`);
		parts.push(`<text x="24" y="${y + 18}" class="muted">Aucune exigence dans le périmètre sélectionné.</text>`);
	} else {
		rows.forEach((item, rIdx) => {
			const y = tableTop + colHeaderHeight + rIdx * rowHeight;
			const bg = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
			parts.push(`<rect x="16" y="${y}" width="${width - 32}" height="${rowHeight}" fill="${bg}" stroke="#e2e8f0"/>`);
			const label = `${item.clauseRef} — ${item.title}`.slice(0, 52);
			parts.push(`<text x="24" y="${y + 18}" style="font-size:11px;">${escapeXml(label)}</text>`);
			parts.push(`<text x="${16 + reqColW + 8}" y="${y + 18}" style="font-size:11px;font-weight:600;">${escapeXml(item.criticality)}</text>`);

			STEP_COLUMNS.forEach((col, cIdx) => {
				const st = item.steps[col.key];
				const style = CELL_TEXT[st];
				const x = 16 + reqColW + critColW + cIdx * stepColW + 4;
				parts.push(
					`<rect x="${x}" y="${y + 4}" width="${stepColW - 8}" height="${rowHeight - 8}" rx="4" fill="${style.fill}" stroke="${style.stroke}"/>`
				);
				parts.push(
					`<text x="${x + 8}" y="${y + 18}" class="cell" style="fill:${style.textColor};">${style.icon} ${style.text}</text>`
				);
			});
		});
	}

	const footerY = height - 16;
	const truncatedNote =
		report.items.length > rows.length
			? ` (${rows.length} / ${report.items.length} exigences affichées — export CSV complet disponible)`
			: ` (${report.items.length} exigence(s) au total)`;
	parts.push(
		`<text x="20" y="${footerY}" class="muted">Généré de façon déterministe depuis coverageModel.ts${escapeXml(truncatedNote)}</text>`
	);
	parts.push('</svg>');

	return parts.join('\n');
}
