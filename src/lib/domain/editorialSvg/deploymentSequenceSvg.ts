/**
 * Vue Éditoriale : Séquence de Déploiement & Homologation (`type-sequence` de diagram-design).
 * Alternative éditoriale au diagramme de séquence Mermaid (`deploymentSequence.ts`) :
 * - Lignes de vie verticales alignées sur grille 4px,
 * - Messages strictement horizontaux avec étiquettes masquées à 6-10px au-dessus de la flèche,
 * - Fragment combiné `ALT` ([Conforme] vs [Écart / Dérogation]) pour la boucle de réconciliation Nautobot.
 */

import {
	DEFAULT_EDITORIAL_DIALS,
	SIZE_PRESETS,
	type EditorialDials,
	type EditorialDiagramResult
} from './dials';
import { buildAccessibleSvg, ceil4, escapeXml, snap4, toSlug } from './primitives';
import { EDITORIAL_SKINS, fitLabelToWidth, getEditorialFonts } from './tokens';

export interface SequenceStepSpec {
	id: string;
	fromActorIndex: number;
	toActorIndex: number;
	label: string;
	isReturn?: boolean;
	isFocal?: boolean;
}

export interface DeploymentSequenceSvgInput {
	subjectId: string;
	sectionRef?: string;
	subjectName: string;
	actors: string[];
	steps: SequenceStepSpec[];
	altBranchPrimary?: string;
	altBranchFallback?: string;
	dials?: Partial<EditorialDials>;
}

export function renderDeploymentSequenceSvg(input: DeploymentSequenceSvgInput): EditorialDiagramResult {
	const dials: EditorialDials = { ...DEFAULT_EDITORIAL_DIALS, ...input.dials };
	const preset = SIZE_PRESETS[dials.size];
	const t = EDITORIAL_SKINS[dials.skin];
	const f = getEditorialFonts(dials.fontSource);
	const slug = `${toSlug(input.sectionRef || input.subjectId)}-sequence-${dials.skin}`;

	const actors = input.actors.length >= 2 ? input.actors.slice(0, 5) : ['Arbitre', 'Archinex', 'KB / OPA', 'Nautobot'];
	const steps = input.steps.slice(0, dials.detail === 'simplified' ? 5 : 8);

	const canvasW = ceil4(Math.max(preset.width, 920));
	const marginX = 36;
	const actorW = 148;
	const actorH = 44;
	const actorY = 104;
	const colSpan = actors.length > 1 ? snap4((canvasW - marginX * 2 - actorW) / (actors.length - 1)) : 0;
	const actorCenterXs = actors.map((_, i) => snap4(marginX + i * colSpan + actorW / 2));

	const firstStepY = 188;
	const stepGap = 44;
	const altBoxY = snap4(firstStepY + steps.length * stepGap + 8);
	const hasAlt = Boolean(input.altBranchPrimary || input.altBranchFallback);
	const altBoxH = hasAlt ? 96 : 0;
	const lifelineBottomY = snap4(altBoxY + altBoxH + 24);

	const parts: string[] = [];

	// 1. Lignes de vie (peintes en premier)
	parts.push(`  <g class="editorial-lifelines">`);
	actorCenterXs.forEach((cx) => {
		parts.push(
			`    <line x1="${cx}" y1="${actorY + actorH}" x2="${cx}" y2="${lifelineBottomY}" stroke="${t.ruleSolid}" stroke-width="1" stroke-dasharray="4,4"/>`
		);
	});
	parts.push(`  </g>`);

	// 2. Fragment combiné ALT (si présent)
	if (hasAlt) {
		const altX = snap4(marginX + 8);
		const altW = snap4(canvasW - marginX * 2 - 16);
		const midAltY = snap4(altBoxY + altBoxH / 2);
		parts.push(`  <g class="editorial-alt-fragment">`);
		parts.push(
			`    <rect x="${altX}" y="${altBoxY}" width="${altW}" height="${altBoxH}" rx="4" fill="${t.nodeOptionalFill}" stroke="${t.ruleSolid}" stroke-width="1"/>`
		);
		parts.push(
			`    <rect x="${altX}" y="${altBoxY}" width="36" height="16" rx="2" fill="${t.paper2}" stroke="${t.ruleSolid}" stroke-width="0.8"/>`
		);
		parts.push(
			`    <text x="${altX + 18}" y="${altBoxY + 11}" fill="${t.ink}" font-size="8" font-weight="700" font-family="${f.eyebrow}" text-anchor="middle">ALT</text>`
		);
		parts.push(
			`    <text x="${altX + 48}" y="${altBoxY + 18}" fill="${t.ink}" font-size="9" font-family="${f.sublabel}">[Conforme] ${escapeXml(fitLabelToWidth(input.altBranchPrimary || 'Planification Nautobot & preuve d’exécution', altW - 140, 9, 'mono'))}</text>`
		);
		parts.push(
			`    <line x1="${altX}" y1="${midAltY}" x2="${altX + altW}" y2="${midAltY}" stroke="${t.ruleSolid}" stroke-width="1" stroke-dasharray="4,3"/>`
		);
		parts.push(
			`    <text x="${altX + 48}" y="${midAltY + 20}" fill="${t.accent}" font-size="9" font-family="${f.sublabel}">[Écart / Dérive] ${escapeXml(fitLabelToWidth(input.altBranchFallback || 'Remédier · Amender · Déroger', altW - 160, 9, 'mono'))}</text>`
		);
		parts.push(`  </g>`);
	}

	// 3. Messages strictement horizontaux + masques d'étiquettes à 8px au-dessus de la flèche
	parts.push(`  <g class="editorial-messages">`);
	steps.forEach((step, idx) => {
		const y = snap4(firstStepY + idx * stepGap);
		const fromIdx = Math.max(0, Math.min(actors.length - 1, step.fromActorIndex));
		const toIdx = Math.max(0, Math.min(actors.length - 1, step.toActorIndex));
		const x1 = actorCenterXs[fromIdx];
		const x2 = actorCenterXs[toIdx];
		if (x1 === x2) return;

		const stroke = step.isFocal ? t.accent : step.isReturn ? t.link : t.muted;
		const marker = step.isFocal ? `${slug}-arrow-accent` : step.isReturn ? `${slug}-arrow-link` : `${slug}-arrow`;
		const dash = step.isReturn ? ' stroke-dasharray="5,4"' : '';

		parts.push(
			`    <path data-step-id="${escapeXml(step.id)}" d="M ${x1} ${y} H ${x2}" fill="none" stroke="${stroke}" stroke-width="${step.isFocal ? '1.2' : '1'}"${dash} marker-end="url(#${marker})"/>`
		);

		const midX = snap4((x1 + x2) / 2);
		const labelText = fitLabelToWidth(step.label, Math.max(100, Math.abs(x2 - x1) - 16), 8, 'mono');
		const maskW = ceil4(Math.min(Math.abs(x2 - x1) - 12, Math.max(56, labelText.length * 5.4 + 12)));
		const maskX = snap4(midX - maskW / 2);
		const maskY = snap4(y - 20); // 8px au-dessus de la flèche

		parts.push(`    <rect x="${maskX}" y="${maskY}" width="${maskW}" height="12" rx="2" fill="${t.paper}"/>`);
		parts.push(
			`    <text x="${midX}" y="${maskY + 9}" fill="${step.isFocal ? t.accent : t.soft}" font-size="8" font-family="${f.arrowLabel}" text-anchor="middle">${escapeXml(labelText)}</text>`
		);
	});
	parts.push(`  </g>`);

	// 4. Boîtes d'acteurs en haut des lignes de vie
	parts.push(`  <g class="editorial-nodes">`);
	actors.forEach((actor, i) => {
		const ax = snap4(actorCenterXs[i] - actorW / 2);
		parts.push(
			`    <g class="editorial-node editorial-clickable" data-block-id="ACT-${i + 1}" data-block-name="${escapeXml(actor)}">`
		);
		parts.push(`      <rect x="${ax}" y="${actorY}" width="${actorW}" height="${actorH}" rx="6" fill="${t.paper}"/>`);
		parts.push(
			`      <rect data-role="bounds" x="${ax}" y="${actorY}" width="${actorW}" height="${actorH}" rx="6" fill="${i === 1 ? t.accentTint : t.nodeBackendFill}" stroke="${i === 1 ? t.accent : t.ink}" stroke-width="1"/>`
		);
		parts.push(
			`      <text x="${actorCenterXs[i]}" y="${actorY + 26}" fill="${t.ink}" font-size="11" font-weight="600" font-family="${f.nodeName}" text-anchor="middle">${escapeXml(fitLabelToWidth(actor, actorW - 16, 11, 'sans'))}</text>`
		);
		parts.push(`    </g>`);
	});
	parts.push(`  </g>`);

	const title = `Séquence d'homologation & déploiement · ${input.subjectName}`;
	const description = `Diagramme de séquence éditorial entre ${actors.join(', ')} sur ${steps.length} étape(s) pour ${input.subjectName}.`;

	const envelope = buildAccessibleSvg({
		slug,
		diagramType: 'deployment-sequence',
		title,
		description,
		width: canvasW,
		height: Math.max(preset.minHeight, lifelineBottomY + 24),
		skin: dials.skin,
		fontSource: dials.fontSource,
		headerEyebrow: `Séquence Opérationnelle · ${input.sectionRef || 'Déploiement'} · Type Sequence`,
		headerTitle: fitLabelToWidth(input.subjectName, canvasW - 64, 22, 'serif'),
		headerSubtitle: `${actors.length} acteur(s) · ${steps.length} échange(s) · Boucle de réconciliation ALT`,
		bodyContent: parts.join('\n'),
		legendItems: [
			{ label: 'Échange focal / Porte de décision', variant: 'focal' },
			{ label: 'Requête nominale', variant: 'backend' },
			{ label: 'Retour / Réconciliation', variant: 'optional' }
		]
	});

	return {
		diagramType: 'deployment-sequence',
		slug,
		title,
		description,
		svg: envelope.svg,
		width: envelope.width,
		height: envelope.height,
		dials,
		ledger: {
			detail: dials.detail,
			sourceNodeCount: input.steps.length,
			drawnNodeCount: steps.length,
			entries: [
				{
					action: 'kept',
					count: steps.length,
					summary: `${steps.length} échange(s) tracé(s) entre ${actors.length} acteur(s)`
				}
			]
		}
	};
}
