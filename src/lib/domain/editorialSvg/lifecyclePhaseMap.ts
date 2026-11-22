/**
 * Vue Éditoriale : Carte de Cycle de Vie de Maturité (Patron §9 `Lifecycle phase map` sur `type-state`).
 * Représente la progression d'un sujet à travers ses niveaux de maturité (L0 -> L5) avec :
 * - Un rail principal gauche-droite des phases ordonnées,
 * - Une bande séparée d'interruption / reprise (Conflit épistémique, Rétractation en cascade),
 * - Une bande terminale explicite (Scellé L5, Dérogation acceptée),
 * - Aucun recours à la couleur seule (position de bande, contours et libellés explicites).
 */

import {
	DEFAULT_EDITORIAL_DIALS,
	SIZE_PRESETS,
	type EditorialDials,
	type EditorialDiagramResult
} from './dials';
import { buildAccessibleSvg, ceil4, escapeXml, renderNodeBox, snap4, toSlug } from './primitives';
import { EDITORIAL_SKINS, fitLabelToWidth, getEditorialFonts } from './tokens';

export interface LifecyclePhaseMapInput {
	subjectId: string;
	sectionRef?: string;
	subjectName: string;
	currentLevel: number; // 0..5
	unsettledCount: number;
	hasRetainedDecision: boolean;
	isFrozen: boolean;
	hasAcceptedViolations?: boolean;
	dials?: Partial<EditorialDials>;
}

const PRIMARY_PHASES = [
	{ level: 0, id: 'L0', title: 'Élicitation', sub: 'Exigences brutes' },
	{ level: 1, id: 'L1', title: 'Cadrage', sub: 'Problème & critères' },
	{ level: 2, id: 'L2', title: 'Délibération', sub: 'Options & débats' },
	{ level: 3, id: 'L3', title: 'Arbitrage', sub: 'Décision & KB' },
	{ level: 4, id: 'L4', title: 'Intention', sub: 'Plan Nautobot' }
];

export function renderLifecyclePhaseMap(input: LifecyclePhaseMapInput): EditorialDiagramResult {
	const dials: EditorialDials = { ...DEFAULT_EDITORIAL_DIALS, ...input.dials };
	const preset = SIZE_PRESETS[dials.size];
	const t = EDITORIAL_SKINS[dials.skin];
	const f = getEditorialFonts(dials.fontSource);
	const slug = `${toSlug(input.sectionRef || input.subjectId)}-lifecycle-${dials.skin}`;

	const canvasW = ceil4(Math.max(preset.width, 960));
	const marginX = 32;
	const phaseCount = PRIMARY_PHASES.length;
	const gap = 24;
	const boxW = snap4((canvasW - marginX * 2 - gap * (phaseCount - 1)) / phaseCount);
	const boxH = 64;

	const railY = 120;
	const recoveryY = 244;
	const terminalY = 356;

	const arrowsSvg: string[] = [];
	const nodesSvg: string[] = [];

	// Étiquettes de bandes (distinguent progression, interruption et terminaison sans couleur seule)
	const bandLabels = [
		`  <g class="editorial-bands">`,
		`    <text x="${marginX}" y="${railY - 12}" fill="${t.muted}" font-size="8" font-family="${f.eyebrow}" letter-spacing="0.12em">RAIL PRINCIPAL · PROGRESSION DE MATURITÉ</text>`,
		`    <line x1="${marginX}" y1="${recoveryY - 24}" x2="${snap4(canvasW - marginX)}" y2="${recoveryY - 24}" stroke="${t.rule}" stroke-width="1"/>`,
		`    <text x="${marginX}" y="${recoveryY - 8}" fill="${t.muted}" font-size="8" font-family="${f.eyebrow}" letter-spacing="0.12em">BANDE D'INTERRUPTION &amp; REPRISE</text>`,
		`    <line x1="${marginX}" y1="${terminalY - 24}" x2="${snap4(canvasW - marginX)}" y2="${terminalY - 24}" stroke="${t.rule}" stroke-width="1"/>`,
		`    <text x="${marginX}" y="${terminalY - 8}" fill="${t.muted}" font-size="8" font-family="${f.eyebrow}" letter-spacing="0.12em">ISSUES TERMINALES</text>`,
		`  </g>`
	].join('\n');

	const clampedLevel = Math.max(0, Math.min(5, Math.round(input.currentLevel)));

	PRIMARY_PHASES.forEach((p, idx) => {
		const px = snap4(marginX + idx * (boxW + gap));
		const isCurrent = !input.isFrozen && clampedLevel === p.level;
		const isCompleted = input.isFrozen || clampedLevel > p.level;

		if (idx < phaseCount - 1) {
			const nextX = snap4(marginX + (idx + 1) * (boxW + gap));
			const midY = snap4(railY + boxH / 2);
			arrowsSvg.push(
				`  <path d="M ${px + boxW} ${midY} H ${nextX}" fill="none" stroke="${isCompleted ? t.ink : t.muted}" stroke-width="${isCompleted ? '1.2' : '1'}" marker-end="url(#${slug}-arrow)"/>`
			);
		}

		nodesSvg.push(
			renderNodeBox({
				x: px,
				y: railY,
				width: boxW,
				height: boxH,
				tag: isCurrent ? `${p.id} · ACTIF` : isCompleted ? `${p.id} · OK` : p.id,
				title: p.title,
				sublabel: p.sub,
				variant: isCurrent ? 'focal' : isCompleted ? 'backend' : 'optional',
				skin: dials.skin,
				fontSource: dials.fontSource,
				clickable: true,
				dataAttributes: {
					'data-block-id': p.id,
					'data-block-name': `${p.id} · ${p.title}`
				}
			})
		);
	});

	// Bande d'interruption / reprise (Conflit épistémique + Rétractation)
	const conflictX = snap4(marginX + 2 * (boxW + gap));
	const retractX = snap4(marginX + 3 * (boxW + gap));
	const l2MidX = snap4(conflictX + boxW / 2);
	const l3MidX = snap4(retractX + boxW / 2);

	arrowsSvg.push(
		`  <path d="M ${l2MidX} ${railY + boxH} V ${recoveryY}" fill="none" stroke="${input.unsettledCount > 0 ? t.accent : t.muted}" stroke-width="1" stroke-dasharray="4,3" marker-end="url(#${slug}-${input.unsettledCount > 0 ? 'arrow-accent' : 'arrow'})"/>`
	);
	arrowsSvg.push(
		`  <path d="M ${l3MidX} ${railY + boxH} V ${recoveryY}" fill="none" stroke="${t.muted}" stroke-width="1" stroke-dasharray="4,3" marker-end="url(#${slug}-arrow)"/>`
	);

	nodesSvg.push(
		renderNodeBox({
			x: conflictX,
			y: recoveryY,
			width: boxW,
			height: 60,
			tag: input.unsettledCount > 0 ? `ATTENTE (${input.unsettledCount})` : 'REPRISE',
			title: 'Conflit / Objection',
			sublabel: input.unsettledCount > 0 ? `${input.unsettledCount} point(s) ouvert(s)` : 'Aucun blocage',
			variant: input.unsettledCount > 0 ? 'warning' : 'optional',
			skin: dials.skin,
			fontSource: dials.fontSource,
			clickable: true,
			dataAttributes: {
				'data-block-id': 'STATE-CONFLICT',
				'data-block-name': 'Conflit épistémique ou objection ouverte'
			}
		})
	);

	nodesSvg.push(
		renderNodeBox({
			x: retractX,
			y: recoveryY,
			width: boxW,
			height: 60,
			tag: 'CASCADE',
			title: 'Rétractation',
			sublabel: 'Retour L2 si invalidé',
			variant: 'optional',
			skin: dials.skin,
			fontSource: dials.fontSource,
			clickable: true,
			dataAttributes: {
				'data-block-id': 'STATE-RETRACT',
				'data-block-name': 'Rétractation en cascade'
			}
		})
	);

	// Bande terminale (Scellé L5 + Dérogation acceptée)
	const sealX = snap4(marginX + 4 * (boxW + gap));
	const derogX = snap4(marginX + 3 * (boxW + gap));
	const l4MidX = snap4(sealX + boxW / 2);

	arrowsSvg.push(
		`  <path d="M ${l4MidX} ${railY + boxH} V ${terminalY}" fill="none" stroke="${input.isFrozen ? t.accent : t.muted}" stroke-width="1.2" marker-end="url(#${slug}-${input.isFrozen ? 'arrow-accent' : 'arrow'})"/>`
	);

	nodesSvg.push(
		renderNodeBox({
			x: sealX,
			y: terminalY,
			width: boxW,
			height: 60,
			tag: input.isFrozen ? 'L5 · SCELLÉ' : 'L5 · CIBLE',
			title: 'Section Scellée',
			sublabel: input.isFrozen ? 'Empreinte figée' : 'En attente de gel',
			variant: input.isFrozen ? 'focal' : 'store',
			skin: dials.skin,
			fontSource: dials.fontSource,
			clickable: true,
			dataAttributes: {
				'data-block-id': 'L5-SEALED',
				'data-block-name': 'Section scellée (L5)'
			}
		})
	);

	nodesSvg.push(
		renderNodeBox({
			x: derogX,
			y: terminalY,
			width: boxW,
			height: 60,
			tag: input.hasAcceptedViolations ? 'SIGNÉ' : 'EXCEPTION',
			title: 'Dérogation Actée',
			sublabel: input.hasAcceptedViolations ? 'Écart justifié' : 'Aucune dérogation',
			variant: input.hasAcceptedViolations ? 'warning' : 'optional',
			skin: dials.skin,
			fontSource: dials.fontSource,
			clickable: true,
			dataAttributes: {
				'data-block-id': 'TERM-WAIVER',
				'data-block-name': 'Dérogation signée par l’arbitre'
			}
		})
	);

	const bodyContent = [
		bandLabels,
		`  <g class="editorial-arrows">\n${arrowsSvg.join('\n')}\n  </g>`,
		`  <g class="editorial-nodes">\n${nodesSvg.join('\n')}\n  </g>`
	].join('\n');

	const title = `Cycle de vie & maturité · ${input.subjectName}`;
	const description = `Carte de cycle de vie L0 à L5 pour ${input.subjectName} (niveau actuel L${clampedLevel}, ${input.unsettledCount} point(s) en attente).`;

	const envelope = buildAccessibleSvg({
		slug,
		diagramType: 'lifecycle-phase-map',
		title,
		description,
		width: canvasW,
		height: Math.max(preset.minHeight, terminalY + 84),
		skin: dials.skin,
		fontSource: dials.fontSource,
		headerEyebrow: `Cycle de Vie · ${input.sectionRef || 'Maturité'} · Patron §9`,
		headerTitle: fitLabelToWidth(input.subjectName, canvasW - 64, 22, 'serif'),
		headerSubtitle: `Niveau actuel : L${clampedLevel}${input.isFrozen ? ' (Scellé)' : ''} · ${input.unsettledCount} objection(s)/hypothèse(s) ouverte(s)`,
		bodyContent,
		legendItems: [
			{ label: 'Phase active / Scellé', variant: 'focal' },
			{ label: 'Phase franchie', variant: 'backend' },
			{ label: 'Interruption / À venir', variant: 'optional' }
		]
	});

	return {
		diagramType: 'lifecycle-phase-map',
		slug,
		title,
		description,
		svg: envelope.svg,
		width: envelope.width,
		height: envelope.height,
		dials,
		ledger: {
			detail: dials.detail,
			sourceNodeCount: 9,
			drawnNodeCount: 9,
			entries: [
				{
					action: 'kept',
					count: 9,
					summary: `5 phases principales, 2 états d'interruption/reprise et 2 issues terminales`
				}
			]
		}
	};
}
