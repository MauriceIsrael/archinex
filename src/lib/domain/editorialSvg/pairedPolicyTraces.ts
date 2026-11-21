/**
 * Vue Éditoriale #423 (1/3) : Traces appariées d'évaluation de règles KB (`Paired Policy-Evaluation Traces`, patron §4).
 * Compare exactement 2 options face à la même séquence ordonnée de règles KB / clauses réglementaires :
 * - Statuts explicites texte + symbole : `PASS` (✓), `FAIL` (✕), `SKIPPED` (⊘), `NOT REACHED` (—), `UNVERIFIED` (? — jamais affiché comme conforme, #384).
 * - Marqueur de première divergence (*First-divergence bracket*) pointant la 1re règle où les deux options se séparent.
 */

import {
	DEFAULT_EDITORIAL_DIALS,
	SIZE_PRESETS,
	type EditorialDials,
	type EditorialDiagramResult,
	type FidelityLedgerEntry
} from './dials';
import { buildAccessibleSvg, ceil4, escapeXml, snap4, toSlug } from './primitives';
import { EDITORIAL_SKINS, fitLabelToWidth, getEditorialFonts } from './tokens';

export type PolicyRuleOutcome = 'PASS' | 'FAIL' | 'SKIPPED' | 'NOT_REACHED' | 'UNVERIFIED';

export interface PairedPolicyRuleRow {
	ruleId: string;
	ruleTitle: string;
	framework?: string;
	optionAStatus: PolicyRuleOutcome;
	optionBStatus: PolicyRuleOutcome;
	note?: string;
}

export interface PairedPolicyTracesInput {
	subjectId: string;
	sectionRef?: string;
	subjectName: string;
	optionALabel: string;
	optionBLabel: string;
	rules: PairedPolicyRuleRow[];
	dials?: Partial<EditorialDials>;
}

const OUTCOME_GLYPH: Record<PolicyRuleOutcome, { symbol: string; label: string; highlight: boolean; dashed: boolean }> = {
	PASS: { symbol: '✓', label: 'PASS', highlight: false, dashed: false },
	FAIL: { symbol: '✕', label: 'FAIL', highlight: true, dashed: false },
	SKIPPED: { symbol: '⊘', label: 'SKIPPED', highlight: false, dashed: true },
	NOT_REACHED: { symbol: '—', label: 'NOT REACHED', highlight: false, dashed: true },
	UNVERIFIED: { symbol: '?', label: 'UNVERIFIED', highlight: true, dashed: true }
};

export function renderPairedPolicyTraces(input: PairedPolicyTracesInput): EditorialDiagramResult {
	const dials: EditorialDials = { ...DEFAULT_EDITORIAL_DIALS, ...input.dials };
	const preset = SIZE_PRESETS[dials.size];
	const t = EDITORIAL_SKINS[dials.skin];
	const f = getEditorialFonts(dials.fontSource);
	const slug = `${toSlug(input.sectionRef || input.subjectId)}-policy-traces-${dials.skin}`;

	const maxRules = dials.detail === 'simplified' ? 4 : 6;
	const visibleRules = input.rules.slice(0, maxRules);
	const hiddenRules = Math.max(0, input.rules.length - visibleRules.length);

	const firstDivergenceIndex = visibleRules.findIndex((r) => r.optionAStatus !== r.optionBStatus);

	const canvasW = ceil4(Math.max(preset.width, 920));
	const marginX = 28;
	const ruleColW = 340;
	const statusColW = 180;
	const colGap = 24;
	const ruleX = marginX;
	const optAX = snap4(ruleX + ruleColW + colGap);
	const optBX = snap4(optAX + statusColW + colGap);
	const markerX = snap4(optBX + statusColW + 20);

	const headerY = 104;
	const firstRowY = 124;
	const rowH = 48;
	const rowGap = 12;

	const parts: string[] = [];

	// En-têtes
	parts.push(`  <g class="editorial-policy-headers">`);
	parts.push(
		`    <text x="${ruleX}" y="${headerY}" fill="${t.muted}" font-size="8" font-family="${f.eyebrow}" letter-spacing="0.12em">RÈGLE KB / CLAUSE ORDONNÉE</text>`
	);
	parts.push(
		`    <text x="${optAX}" y="${headerY}" fill="${t.ink}" font-size="9" font-weight="600" font-family="${f.nodeName}">${escapeXml(fitLabelToWidth(input.optionALabel, statusColW, 9, 'sans'))}</text>`
	);
	parts.push(
		`    <text x="${optBX}" y="${headerY}" fill="${t.ink}" font-size="9" font-weight="600" font-family="${f.nodeName}">${escapeXml(fitLabelToWidth(input.optionBLabel, statusColW, 9, 'sans'))}</text>`
	);
	parts.push(
		`    <line x1="${marginX}" y1="${headerY + 8}" x2="${snap4(canvasW - marginX)}" y2="${headerY + 8}" stroke="${t.ruleSolid}" stroke-width="1"/>`
	);
	parts.push(`  </g>`);

	if (visibleRules.length === 0) {
		parts.push(
			`  <rect x="${marginX}" y="${firstRowY}" width="${snap4(canvasW - marginX * 2)}" height="52" rx="6" fill="${t.nodeOptionalFill}" stroke="${t.nodeOptionalStroke}" stroke-width="1" stroke-dasharray="4,3"/>`
		);
		parts.push(
			`  <text x="${snap4(canvasW / 2)}" y="${firstRowY + 30}" fill="${t.muted}" font-size="11" font-family="${f.nodeName}" text-anchor="middle">Aucune règle KB évaluée pour comparer deux options</text>`
		);
	}

	const renderStatusCell = (x: number, y: number, status: PolicyRuleOutcome, ruleId: string, traceSlot: 'A' | 'B') => {
		const meta = OUTCOME_GLYPH[status];
		const fill = meta.highlight ? t.accentTint : status === 'PASS' ? t.nodeBackendFill : t.nodeOptionalFill;
		const stroke = meta.highlight ? t.accent : status === 'PASS' ? t.ink : t.nodeOptionalStroke;
		const dash = meta.dashed ? ' stroke-dasharray="4,3"' : '';

		return [
			`    <g class="editorial-node editorial-clickable" data-policy-rule="${escapeXml(ruleId)}" data-policy-trace="${traceSlot}" data-policy-status="${status}" data-clause-ref="${escapeXml(ruleId)}">`,
			`      <rect x="${x}" y="${y}" width="${statusColW}" height="${rowH}" rx="6" fill="${t.paper}"/>`,
			`      <rect data-role="bounds" x="${x}" y="${y}" width="${statusColW}" height="${rowH}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1"${dash}/>`,
			`      <text x="${snap4(x + statusColW / 2)}" y="${y + 28}" fill="${meta.highlight ? t.accent : t.ink}" font-size="11" font-weight="600" font-family="${f.sublabel}" text-anchor="middle">${meta.symbol} ${meta.label}</text>`,
			`    </g>`
		].join('\n');
	};

	visibleRules.forEach((rule, idx) => {
		const ry = snap4(firstRowY + idx * (rowH + rowGap));
		const isFirstDiv = idx === firstDivergenceIndex;

		parts.push(`  <g data-policy-row="${escapeXml(rule.ruleId)}"${isFirstDiv ? ' data-first-divergence="true"' : ''}>`);
		// Boîte règle
		parts.push(`    <rect x="${ruleX}" y="${ry}" width="${ruleColW}" height="${rowH}" rx="6" fill="${t.paper}"/>`);
		parts.push(
			`    <rect data-role="bounds" x="${ruleX}" y="${ry}" width="${ruleColW}" height="${rowH}" rx="6" fill="${t.nodeStoreFill}" stroke="${isFirstDiv ? t.accent : t.ruleSolid}" stroke-width="1"/>`
		);
		parts.push(
			`    <text x="${ruleX + 12}" y="${ry + 18}" fill="${isFirstDiv ? t.accent : t.muted}" font-size="8" font-family="${f.eyebrow}">${escapeXml(rule.framework ? `${rule.ruleId} · ${rule.framework}` : rule.ruleId)}</text>`
		);
		parts.push(
			`    <text x="${ruleX + 12}" y="${ry + 36}" fill="${t.ink}" font-size="11" font-weight="600" font-family="${f.nodeName}">${escapeXml(fitLabelToWidth(rule.ruleTitle, ruleColW - 24, 11, 'sans'))}</text>`
		);

		parts.push(renderStatusCell(optAX, ry, rule.optionAStatus, rule.ruleId, 'A'));
		parts.push(renderStatusCell(optBX, ry, rule.optionBStatus, rule.ruleId, 'B'));

		if (isFirstDiv && markerX + 120 <= canvasW) {
			const cy = snap4(ry + rowH / 2);
			parts.push(
				`    <path d="M ${markerX} ${ry + 8} H ${markerX + 8} V ${ry + rowH - 8} H ${markerX}" fill="none" stroke="${t.accent}" stroke-width="1.2"/>`
			);
			parts.push(
				`    <text x="${markerX + 16}" y="${cy + 4}" fill="${t.accent}" font-size="10" font-style="italic" font-family="${f.callout}">1re divergence</text>`
			);
		}
		parts.push(`  </g>`);
	});

	const bottomY = visibleRules.length > 0 ? firstRowY + visibleRules.length * (rowH + rowGap) + 20 : firstRowY + 80;

	const ledgerEntries: FidelityLedgerEntry[] = [];
	if (hiddenRules > 0) {
		ledgerEntries.push({
			action: 'truncated',
			count: hiddenRules,
			summary: `${hiddenRules} règle(s) KB supplémentaire(s) hors vue (budget ${maxRules} règles)`
		});
	}
	ledgerEntries.push({
		action: 'kept',
		count: visibleRules.length,
		summary:
			firstDivergenceIndex >= 0
				? `1re divergence identifiée sur la règle ${visibleRules[firstDivergenceIndex].ruleId}`
				: `Aucune divergence entre les deux options sur les ${visibleRules.length} règle(s) affichée(s)`
	});

	const title = `Traces d'évaluation KB appariées · ${input.subjectName}`;
	const description = `Comparaison règle par règle entre ${input.optionALabel} et ${input.optionBLabel} sur ${visibleRules.length} règle(s) KB.`;

	const envelope = buildAccessibleSvg({
		slug,
		diagramType: 'paired-policy-traces',
		title,
		description,
		width: canvasW,
		height: Math.max(preset.minHeight, bottomY),
		skin: dials.skin,
		fontSource: dials.fontSource,
		headerEyebrow: `Conformité KB Appariée · ${input.sectionRef || 'Arbitrage'} · Patron §4`,
		headerTitle: fitLabelToWidth(input.subjectName, canvasW - 64, 22, 'serif'),
		headerSubtitle: `${input.optionALabel} vs ${input.optionBLabel} · UNVERIFIED n'est jamais affiché comme PASS`,
		bodyContent: parts.join('\n'),
		legendItems: [
			{ label: '✓ PASS (Conforme)', variant: 'backend' },
			{ label: '✕ FAIL / 1re divergence', variant: 'focal' },
			{ label: '? UNVERIFIED / ⊘ SKIPPED', variant: 'missing' }
		]
	});

	return {
		diagramType: 'paired-policy-traces',
		slug,
		title,
		description,
		svg: envelope.svg,
		width: envelope.width,
		height: envelope.height,
		dials,
		ledger: {
			detail: dials.detail,
			sourceNodeCount: input.rules.length,
			drawnNodeCount: visibleRules.length,
			entries: ledgerEntries
		}
	};
}
