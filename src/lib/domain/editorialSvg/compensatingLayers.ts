/**
 * Vue Éditoriale #423 (2/3) : Couches Compensatoires & Catalogue de Contrôles (Patrons §6 & §7 sur `type-layers`).
 * Montre comment les surfaces d'application (Conception, CI/GitOps, Nautobot, Exécution) réduisent le risque
 * et rend visible le **risque résiduel** lorsqu'une dérogation est acceptée par l'arbitre.
 */

import {
	DEFAULT_EDITORIAL_DIALS,
	SIZE_PRESETS,
	type EditorialDials,
	type EditorialDiagramResult
} from './dials';
import { buildAccessibleSvg, ceil4, escapeXml, snap4, toSlug } from './primitives';
import { EDITORIAL_SKINS, fitLabelToWidth, getEditorialFonts } from './tokens';

export interface CompensatingLayerItem {
	id: string;
	surface: string;
	controlName: string;
	actor: 'code' | 'platform' | 'human';
	timing: 'write' | 'merge' | 'deploy' | 'run';
	coverageNote: string;
	isGap?: boolean;
}

export interface CompensatingLayersInput {
	subjectId: string;
	sectionRef?: string;
	subjectName: string;
	layers: CompensatingLayerItem[];
	residualRiskSummary: string;
	dials?: Partial<EditorialDials>;
}

export function renderCompensatingLayers(input: CompensatingLayersInput): EditorialDiagramResult {
	const dials: EditorialDials = { ...DEFAULT_EDITORIAL_DIALS, ...input.dials };
	const preset = SIZE_PRESETS[dials.size];
	const t = EDITORIAL_SKINS[dials.skin];
	const f = getEditorialFonts(dials.fontSource);
	const slug = `${toSlug(input.sectionRef || input.subjectId)}-layers-${dials.skin}`;

	const visibleLayers = input.layers.slice(0, dials.detail === 'simplified' ? 4 : 6);
	const canvasW = ceil4(Math.max(preset.width, 840));
	const marginX = 32;
	const layerW = snap4(canvasW - marginX * 2);
	const layerH = 56;
	const layerGap = 12;
	const startY = 104;

	const parts: string[] = [];

	visibleLayers.forEach((layer, idx) => {
		const y = snap4(startY + idx * (layerH + layerGap));
		const fill = layer.isGap ? t.accentTint : idx % 2 === 0 ? t.nodeBackendFill : t.nodeStoreFill;
		const stroke = layer.isGap ? t.accent : t.ink;
		const dash = layer.isGap ? ' stroke-dasharray="4,3"' : '';

		parts.push(
			[
				`  <g class="editorial-node editorial-clickable" data-layer-id="${escapeXml(layer.id)}" data-block-id="${escapeXml(layer.id)}" data-block-name="${escapeXml(layer.controlName)}">`,
				`    <rect x="${marginX}" y="${y}" width="${layerW}" height="${layerH}" rx="6" fill="${t.paper}"/>`,
				`    <rect data-role="bounds" x="${marginX}" y="${y}" width="${layerW}" height="${layerH}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1"${dash}/>`,
				`    <text x="${marginX + 16}" y="${y + 20}" fill="${layer.isGap ? t.accent : t.muted}" font-size="8" font-family="${f.eyebrow}" letter-spacing="0.1em">${escapeXml(`${layer.surface.toUpperCase()} · ACTOR:${layer.actor.toUpperCase()} · ${layer.timing.toUpperCase()}`)}</text>`,
				`    <text x="${marginX + 16}" y="${y + 40}" fill="${t.ink}" font-size="12" font-weight="600" font-family="${f.nodeName}">${escapeXml(fitLabelToWidth(layer.controlName, layerW * 0.52, 12, 'sans'))}</text>`,
				`    <text x="${snap4(marginX + layerW - 16)}" y="${y + 36}" fill="${layer.isGap ? t.accent : t.muted}" font-size="9" font-family="${f.sublabel}" text-anchor="end">${escapeXml(fitLabelToWidth(layer.coverageNote, layerW * 0.4, 9, 'mono'))}</text>`,
				`  </g>`
			].join('\n')
		);
	});

	// Bandeau explicite de risque résiduel en bas de pile
	const residualY = snap4(startY + visibleLayers.length * (layerH + layerGap) + 8);
	parts.push(
		[
			`  <g data-role="residual-risk">`,
			`    <rect x="${marginX}" y="${residualY}" width="${layerW}" height="48" rx="6" fill="${t.accentTint}" stroke="${t.accent}" stroke-width="1" stroke-dasharray="4,4"/>`,
			`    <text x="${marginX + 16}" y="${residualY + 18}" fill="${t.accent}" font-size="8" font-family="${f.eyebrow}" letter-spacing="0.1em">RISQUE RÉSIDUEL EXPLICITE</text>`,
			`    <text x="${marginX + 16}" y="${residualY + 36}" fill="${t.ink}" font-size="11" font-family="${f.nodeName}">${escapeXml(fitLabelToWidth(input.residualRiskSummary, layerW - 32, 11, 'sans'))}</text>`,
			`  </g>`
		].join('\n')
	);

	const title = `Couches de gouvernance & sécurité · ${input.subjectName}`;
	const description = `Empilement de ${visibleLayers.length} couche(s) de contrôle et risque résiduel pour ${input.subjectName}.`;

	const envelope = buildAccessibleSvg({
		slug,
		diagramType: 'compensating-security-layers',
		title,
		description,
		width: canvasW,
		height: Math.max(preset.minHeight, residualY + 68),
		skin: dials.skin,
		fontSource: dials.fontSource,
		headerEyebrow: `Gouvernance & Défense en Profondeur · ${input.sectionRef || 'Contrôles'} · Patrons §6/§7`,
		headerTitle: fitLabelToWidth(input.subjectName, canvasW - 64, 22, 'serif'),
		headerSubtitle: `${visibleLayers.length} surface(s) d'application · Risque résiduel nommé explicitement`,
		bodyContent: parts.join('\n'),
		legendItems: [
			{ label: 'Couche de contrôle active', variant: 'backend' },
			{ label: 'Écart / Risque résiduel', variant: 'missing' }
		]
	});

	return {
		diagramType: 'compensating-layers',
		slug,
		title,
		description,
		svg: envelope.svg,
		width: envelope.width,
		height: envelope.height,
		dials,
		ledger: {
			detail: dials.detail,
			sourceNodeCount: input.layers.length,
			drawnNodeCount: visibleLayers.length,
			entries: [
				{
					action: 'kept',
					count: visibleLayers.length,
					summary: `${visibleLayers.length} couche(s) rendue(s) avec risque résiduel explicite`
				}
			]
		}
	};
}
