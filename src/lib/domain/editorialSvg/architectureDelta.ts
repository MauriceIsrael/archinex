/**
 * Vue Éditoriale #421 : Architecture Delta (`type-architecture-delta` de diagram-design).
 * Compare deux topologies synchronisées via le triptyque **Before · Changes · After** sur une grille 4px partagée :
 * - Stabilité de la carte mentale : tout composant `unchanged`, `changed` ou `removed` conserve ses coordonnées locales `(x, y)`.
 * - Encodage redondant sans couleur seule : `+` (ADDED), `−` pointillé (REMOVED), `Δ` (CHANGED), `→` (MOVED), `⇄` (REWIRED).
 * - Bijection exacte entre statuts non-`unchanged` et entrées `data-change` du registre central.
 */

import type { ImpactSimulationResult } from '$lib/domain/impactGraph';
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
	orthogonalTreeConnector,
	snap4,
	toSlug
} from './primitives';
import { EDITORIAL_SKINS, fitLabelToWidth, getEditorialFonts } from './tokens';

export type DeltaComponentStatus = 'unchanged' | 'added' | 'removed' | 'changed' | 'moved';
export type DeltaEdgeStatus = 'unchanged' | 'added' | 'removed' | 'rewired';

export interface DeltaComponentSpec {
	id: string;
	name: string;
	beforeSignature?: string;
	afterSignature?: string;
	status: DeltaComponentStatus;
	changeSummary?: string;
}

export interface DeltaRelationSpec {
	id: string;
	fromBefore?: string;
	toBefore?: string;
	fromAfter?: string;
	toAfter?: string;
	status: DeltaEdgeStatus;
	label?: string;
	changeSummary?: string;
}

export interface ArchitectureDeltaInput {
	subjectId: string;
	sectionRef?: string;
	title: string;
	beforeLabel: string;
	afterLabel: string;
	components: DeltaComponentSpec[];
	relations: DeltaRelationSpec[];
	dials?: Partial<EditorialDials>;
}

const STATUS_BADGE: Record<DeltaComponentStatus, { symbol: string; word: string }> = {
	unchanged: { symbol: '', word: '' },
	added: { symbol: '+', word: 'ADDED' },
	removed: { symbol: '−', word: 'REMOVED' },
	changed: { symbol: 'Δ', word: 'CHANGED' },
	moved: { symbol: '→', word: 'MOVED' }
};

export function renderArchitectureDelta(input: ArchitectureDeltaInput): EditorialDiagramResult {
	const dials: EditorialDials = { ...DEFAULT_EDITORIAL_DIALS, ...input.dials };
	const preset = SIZE_PRESETS[dials.size];
	const t = EDITORIAL_SKINS[dials.skin];
	const f = getEditorialFonts(dials.fontSource);
	const slug = `${toSlug(input.sectionRef || input.subjectId)}-delta-${dials.skin}`;

	// Budget diagram-design : <= 8 composants uniques, <= 10 relations uniques
	const maxComponents = dials.detail === 'simplified' ? 6 : 8;
	const visibleComponents = input.components.slice(0, maxComponents);
	const hiddenComponents = Math.max(0, input.components.length - visibleComponents.length);
	const visibleIds = new Set(visibleComponents.map((c) => c.id));
	const visibleRelations = input.relations
		.filter((r) => {
			const bOk = !r.fromBefore || (visibleIds.has(r.fromBefore) && r.toBefore && visibleIds.has(r.toBefore));
			const aOk = !r.fromAfter || (visibleIds.has(r.fromAfter) && r.toAfter && visibleIds.has(r.toAfter));
			return bOk && aOk;
		})
		.slice(0, 10);

	// Géométrie synchronisée sur grille 4px : Before (320) | Changes (280) | After (320)
	const marginX = 28;
	const panelW = 320;
	const ledgerW = 280;
	const gap = 24;
	const canvasW = ceil4(Math.max(preset.width, marginX * 2 + panelW * 2 + ledgerW + gap * 2));
	const beforeX = marginX;
	const ledgerX = snap4(beforeX + panelW + gap);
	const afterX = snap4(ledgerX + ledgerW + gap);
	const panelY = 112;

	// Placement déterministe en grille 2 colonnes dans le panneau local (320px)
	const boxW = 136;
	const boxH = 56;
	const colXs = [16, 168];
	const rowStep = 76;

	const baseCoords = new Map<string, { x: number; y: number }>();
	visibleComponents.forEach((comp, idx) => {
		const col = idx % 2;
		const row = Math.floor(idx / 2);
		baseCoords.set(comp.id, {
			x: colXs[col],
			y: snap4(20 + row * rowStep)
		});
	});

	const rowsCount = Math.max(2, Math.ceil(visibleComponents.length / 2));
	const panelH = ceil4(Math.max(220, rowsCount * rowStep + 36));

	// Registre central des changements (bijection exacte avec les statuts non-unchanged)
	const ledgerItems: Array<{ change: 'ADDED' | 'REMOVED' | 'CHANGED' | 'MOVED' | 'REWIRED'; target: string; detail: string }> = [];
	for (const comp of visibleComponents) {
		if (comp.status === 'unchanged') continue;
		const word = STATUS_BADGE[comp.status].word as 'ADDED' | 'REMOVED' | 'CHANGED' | 'MOVED';
		const defaultDetail =
			comp.status === 'changed'
				? `${comp.beforeSignature || 'avant'} → ${comp.afterSignature || 'après'}`
				: comp.name;
		ledgerItems.push({
			change: word,
			target: comp.id,
			detail: comp.changeSummary || defaultDetail
		});
	}
	for (const rel of visibleRelations) {
		if (rel.status === 'unchanged') continue;
		const word = rel.status.toUpperCase() as 'ADDED' | 'REMOVED' | 'REWIRED';
		const defaultDetail =
			rel.status === 'rewired'
				? `${rel.fromBefore}→${rel.toBefore} devient ${rel.fromAfter}→${rel.toAfter}`
				: `${rel.fromAfter || rel.fromBefore} → ${rel.toAfter || rel.toBefore}`;
		ledgerItems.push({
			change: word,
			target: rel.id,
			detail: rel.changeSummary || defaultDetail
		});
	}

	const renderPanel = (snapshot: 'before' | 'after', originX: number, label: string): string => {
		const isBefore = snapshot === 'before';
		const edgesSvg: string[] = [];
		const compsSvg: string[] = [];

		// Relations dessinées avant les composants
		for (const rel of visibleRelations) {
			const fromId = isBefore ? rel.fromBefore : rel.fromAfter;
			const toId = isBefore ? rel.toBefore : rel.toAfter;
			if (!fromId || !toId) continue;
			if (isBefore && rel.status === 'added') continue;
			if (!isBefore && rel.status === 'removed') continue;

			const pFrom = baseCoords.get(fromId);
			const pTo = baseCoords.get(toId);
			if (!pFrom || !pTo) continue;

			const fromShift = !isBefore && visibleComponents.find((c) => c.id === fromId)?.status === 'moved' ? 8 : 0;
			const toShift = !isBefore && visibleComponents.find((c) => c.id === toId)?.status === 'moved' ? 8 : 0;

			const sx = snap4(pFrom.x + boxW / 2);
			const sy = snap4(pFrom.y + fromShift + boxH);
			const ex = snap4(pTo.x + boxW / 2);
			const ey = snap4(pTo.y + toShift);

			const d = orthogonalTreeConnector(sx, sy, ex, ey);
			const isHighlight = rel.status !== 'unchanged';
			const dash = rel.status === 'removed' || rel.status === 'rewired' ? ' stroke-dasharray="4,3"' : '';
			const stroke = isHighlight ? t.accent : t.muted;
			const marker = isHighlight ? `${slug}-arrow-accent` : `${slug}-arrow`;

			edgesSvg.push(
				`      <path data-kind="relationship" data-object-id="${escapeXml(rel.id)}" data-status="${rel.status}" data-from="${escapeXml(fromId)}" data-to="${escapeXml(toId)}" d="${d}" fill="none" stroke="${stroke}" stroke-width="${isHighlight ? '1.2' : '1'}"${dash} marker-end="url(#${marker})"/>`
			);
		}

		// Composants
		for (const comp of visibleComponents) {
			if (isBefore && comp.status === 'added') continue;
			if (!isBefore && comp.status === 'removed') continue;

			const coord = baseCoords.get(comp.id)!;
			// Les composants inchangés / modifiés / supprimés conservent STRICTEMENT le même (x, y)
			const localX = coord.x;
			const localY = !isBefore && comp.status === 'moved' ? snap4(coord.y + 8) : coord.y;
			const sig = isBefore ? comp.beforeSignature || comp.id : comp.afterSignature || comp.id;

			const isChanged = comp.status !== 'unchanged';
			const fill =
				comp.status === 'added' || comp.status === 'changed'
					? t.accentTint
					: comp.status === 'removed'
						? t.nodeOptionalFill
						: t.nodeBackendFill;
			const stroke = isChanged ? t.accent : t.ink;
			const dash = comp.status === 'removed' ? ' stroke-dasharray="4,3"' : '';
			const badge = STATUS_BADGE[comp.status].symbol;

			compsSvg.push(
				[
					`      <g class="editorial-node editorial-clickable" data-kind="component" data-object-id="${escapeXml(comp.id)}" data-status="${comp.status}" data-signature="${escapeXml(sig)}" data-block-id="${escapeXml(comp.id)}" data-block-name="${escapeXml(comp.name)}">`,
					`        <rect x="${localX}" y="${localY}" width="${boxW}" height="${boxH}" rx="6" fill="${t.paper}"/>`,
					`        <rect data-role="bounds" x="${localX}" y="${localY}" width="${boxW}" height="${boxH}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1"${dash}/>`,
					`        <text x="${localX + 8}" y="${localY + 16}" fill="${isChanged ? t.accent : t.muted}" font-size="8" font-family="${f.eyebrow}">${escapeXml(badge ? `${badge} ${comp.id}` : comp.id)}</text>`,
					`        <text x="${localX + 8}" y="${localY + 32}" fill="${t.ink}" font-size="11" font-weight="600" font-family="${f.nodeName}">${escapeXml(fitLabelToWidth(comp.name, boxW - 16, 11, 'sans'))}</text>`,
					`        <text x="${localX + 8}" y="${localY + 46}" fill="${t.muted}" font-size="8" font-family="${f.sublabel}">${escapeXml(fitLabelToWidth(sig, boxW - 16, 8, 'mono'))}</text>`,
					`      </g>`
				].join('\n')
			);
		}

		return [
			`  <g data-snapshot="${snapshot}" data-grid="${panelW} ${panelH} 4" transform="translate(${originX} ${panelY})">`,
			`    <text x="0" y="-10" fill="${t.muted}" font-size="9" font-family="${f.eyebrow}" letter-spacing="0.1em">${escapeXml(label.toUpperCase())}</text>`,
			`    <rect x="0" y="0" width="${panelW}" height="${panelH}" rx="8" fill="${t.paper2}" stroke="${t.ruleSolid}" stroke-width="1"/>`,
			...edgesSvg,
			...compsSvg,
			`  </g>`
		].join('\n');
	};

	// Panneau central : Registre des changements
	const ledgerLines: string[] = [];
	ledgerLines.push(`  <g class="editorial-delta-ledger">`);
	ledgerLines.push(
		`    <text x="${ledgerX}" y="${panelY - 10}" fill="${t.accent}" font-size="9" font-family="${f.eyebrow}" letter-spacing="0.1em">CHANGES (${ledgerItems.length})</text>`
	);
	ledgerLines.push(
		`    <rect x="${ledgerX}" y="${panelY}" width="${ledgerW}" height="${panelH}" rx="8" fill="${t.paper}" stroke="${t.ruleSolid}" stroke-width="1"/>`
	);

	if (ledgerItems.length === 0) {
		ledgerLines.push(
			`    <text x="${snap4(ledgerX + ledgerW / 2)}" y="${snap4(panelY + 48)}" fill="${t.muted}" font-size="10" font-family="${f.sublabel}" text-anchor="middle">Aucun écart topologique</text>`
		);
	} else {
		const maxEntries = Math.min(8, ledgerItems.length);
		ledgerItems.slice(0, maxEntries).forEach((entry, idx) => {
			const ey = snap4(panelY + 24 + idx * 36);
			ledgerLines.push(
				[
					`    <text data-change="${entry.change}" data-target="${escapeXml(entry.target)}" x="${ledgerX + 12}" y="${ey}" fill="${t.ink}" font-size="9" font-family="${f.sublabel}">`,
					`      <tspan fill="${t.accent}" font-weight="700">${entry.change} ${escapeXml(entry.target)}</tspan>`,
					`      <tspan x="${ledgerX + 12}" dy="14" fill="${t.muted}">${escapeXml(fitLabelToWidth(entry.detail, ledgerW - 24, 9, 'sans'))}</tspan>`,
					`    </text>`
				].join('\n')
			);
		});
	}
	ledgerLines.push(`  </g>`);

	const bodyContent = [
		renderPanel('before', beforeX, input.beforeLabel),
		ledgerLines.join('\n'),
		renderPanel('after', afterX, input.afterLabel)
	].join('\n');

	const ledgerEntries: FidelityLedgerEntry[] = [];
	if (hiddenComponents > 0) {
		ledgerEntries.push({
			action: 'truncated',
			count: hiddenComponents,
			summary: `${hiddenComponents} composant(s) au-delà du budget de ${maxComponents} objets uniques`
		});
	}
	ledgerEntries.push({
		action: 'kept',
		count: visibleComponents.length,
		summary: `${visibleComponents.length} composant(s) comparé(s), ${ledgerItems.length} changement(s) dans le registre`
	});

	const title = `Architecture Delta · ${input.title}`;
	const description = `Comparaison synchronisée ${input.beforeLabel} vers ${input.afterLabel} pour ${input.title} : ${ledgerItems.length} changement(s) identifié(s).`;

	const envelope = buildAccessibleSvg({
		slug,
		diagramType: 'architecture-delta',
		title,
		description,
		width: canvasW,
		height: Math.max(preset.minHeight, panelY + panelH + 28),
		skin: dials.skin,
		fontSource: dials.fontSource,
		headerEyebrow: `Architecture Delta · ${input.sectionRef || 'Comparaison'} · Before / Changes / After`,
		headerTitle: fitLabelToWidth(input.title, canvasW - 64, 22, 'serif'),
		headerSubtitle: `${input.beforeLabel} → ${input.afterLabel} · ${ledgerItems.length} écart(s) tracé(s) sur grille 4px synchronisée`,
		bodyContent,
		legendItems: [
			{ label: '+ ADDED / Δ CHANGED', variant: 'focal' },
			{ label: 'Inchangé (position stable)', variant: 'backend' },
			{ label: '− REMOVED / ⇄ REWIRED', variant: 'missing' }
		]
	});

	return {
		diagramType: 'architecture-delta',
		slug,
		title,
		description,
		svg: envelope.svg,
		width: envelope.width,
		height: envelope.height,
		dials,
		ledger: {
			detail: dials.detail,
			sourceNodeCount: input.components.length,
			drawnNodeCount: visibleComponents.length,
			entries: ledgerEntries
		}
	};
}

/**
 * Adapte un résultat de simulation d'impact (`ImpactGraphExplorer.svelte`) en entrée `ArchitectureDeltaInput`
 * comparant la cible nominale (V2) et l'architecture optimisée coûts (V1).
 */
export function buildImpactSimulationDeltaInput(
	simulation: ImpactSimulationResult,
	subjectName: string,
	sectionRef?: string
): ArchitectureDeltaInput {
	const components: DeltaComponentSpec[] = simulation.nodes.slice(0, 8).map((n) => {
		let status: DeltaComponentStatus = 'unchanged';
		if (n.scenarioRole === 'cost_v1') status = 'added';
		else if (n.status === 'violated') status = 'removed';
		else if (n.status === 'degraded') status = 'changed';

		return {
			id: n.id,
			name: n.label,
			beforeSignature: n.metadata?.nominalValue || n.type,
			afterSignature: n.metadata?.degradedValue || n.status,
			status,
			changeSummary:
				status === 'changed'
					? `${n.metadata?.nominalValue || 'nominal'} → ${n.metadata?.degradedValue || 'dégradé'}`
					: n.metadata?.cause || n.description
		};
	});

	const relations: DeltaRelationSpec[] = simulation.edges.slice(0, 10).map((e, i) => {
		let status: DeltaEdgeStatus = 'unchanged';
		if (e.scenarioScope === 'cost_optimized_v1') status = 'added';
		else if (!e.active && e.scenarioScope === 'nominal_v2') status = 'removed';
		else if (e.type === 'tradeoff_degrades' || e.type === 'violates') status = 'rewired';

		return {
			id: `REL-${i + 1}`,
			fromBefore: e.from,
			toBefore: e.to,
			fromAfter: e.from,
			toAfter: e.to,
			status,
			label: e.label,
			changeSummary: e.cause || e.label
		};
	});

	return {
		subjectId: simulation.meta?.subjectId || 'impact',
		sectionRef: sectionRef || simulation.meta?.sectionRef,
		title: subjectName,
		beforeLabel: 'Before · Cible Nominale (V2)',
		afterLabel: 'After · Compromis Optimisé (V1)',
		components,
		relations
	};
}
