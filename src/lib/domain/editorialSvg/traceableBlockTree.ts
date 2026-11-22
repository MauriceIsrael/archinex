/**
 * Vue Pilote #1 : Décomposition en blocs traçables (`Traceable Block Decomposition`, patron §8 de diagram-design).
 * Projette de façon 100 % déterministe `ProjectionBlockGraph` (axes TOGAF & composants logiques)
 * en un arbre SVG éditorial sur grille 4px avec contrat `data-block-*` et sidecar `.registry.json`.
 */

import type { ProjectionBlock, ProjectionBlockGraph } from '$lib/domain/projectionBlocks';
import {
	DEFAULT_EDITORIAL_DIALS,
	DETAIL_NODE_BUDGET,
	SIZE_PRESETS,
	type EditorialDials,
	type EditorialDiagramResult,
	type FidelityLedgerEntry
} from './dials';
import {
	buildAccessibleSvg,
	ceil4,
	orthogonalTreeConnector,
	renderAnnotationCallout,
	renderNodeBox,
	snap4,
	toSlug
} from './primitives';
import { EDITORIAL_SKINS, fitLabelToWidth } from './tokens';

export interface BlockRegistryEntry {
	id: string;
	parent?: string;
	name: string;
	input?: string;
	output?: string;
	constraint?: string;
	assumption?: string;
	impl?: string;
}

export interface BlockRegistrySidecar {
	source: string;
	blocks: BlockRegistryEntry[];
}

export interface TraceableBlockTreeInput {
	subjectId: string;
	sectionRef?: string;
	subjectName: string;
	retainedOptionTitle?: string;
	graph: ProjectionBlockGraph;
	focalBlockId?: string;
	dials?: Partial<EditorialDials>;
}

function makeBlockId(prefix: string, index: number): string {
	return `${prefix}-${String(index + 1).padStart(2, '0')}`;
}

function pickFocalAxisId(blocks: ProjectionBlock[], explicitFocalId?: string): string | null {
	if (explicitFocalId) return explicitFocalId;
	if (blocks.length === 0) return null;
	// Priorité au bloc avec le plus d'énoncés non consolidés, puis au plus dense en exigences.
	const ranked = [...blocks].sort((a, b) => {
		if (b.unsettledCount !== a.unsettledCount) return b.unsettledCount - a.unsettledCount;
		if (b.requirementRefs.length !== a.requirementRefs.length) {
			return b.requirementRefs.length - a.requirementRefs.length;
		}
		return b.items.length - a.items.length;
	});
	return ranked[0]?.axisId ?? null;
}

/**
 * Construit le diagramme SVG éditorial `Traceable Block Decomposition` et son registre JSON sidecar.
 */
export function renderTraceableBlockTree(input: TraceableBlockTreeInput): EditorialDiagramResult {
	const dials: EditorialDials = { ...DEFAULT_EDITORIAL_DIALS, ...input.dials };
	const preset = SIZE_PRESETS[dials.size];
	const t = EDITORIAL_SKINS[dials.skin];
	const budget = DETAIL_NODE_BUDGET[dials.detail];
	const slug = `${toSlug(input.sectionRef || input.subjectId)}-blocks-${dials.skin}`;
	const rootBlockId = (input.sectionRef || 'SYS').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase() || 'SYS';

	const allBlocks = input.graph.blocks;
	const sourceNodeCount = 1 + allBlocks.reduce((acc, b) => acc + 1 + b.items.length, 0);
	const ledgerEntries: FidelityLedgerEntry[] = [];

	// Budgetisation déterministe : 1 racine + N blocs de niveau 1 + feuilles selon `detail`
	const maxTier1 = dials.detail === 'simplified' ? Math.min(4, allBlocks.length) : Math.min(6, allBlocks.length);
	const visibleBlocks = allBlocks.slice(0, maxTier1);
	const hiddenBlocksCount = Math.max(0, allBlocks.length - visibleBlocks.length);

	if (hiddenBlocksCount > 0) {
		ledgerEntries.push({
			action: 'aggregated',
			count: hiddenBlocksCount,
			summary: `${hiddenBlocksCount} axe(s) TOGAF secondaire(s) regroupé(s) hors vue (mode ${dials.detail})`
		});
	}

	const showTier2 = dials.detail !== 'simplified';
	const remainingBudgetForLeaves = Math.max(0, budget - 1 - visibleBlocks.length);
	const maxLeavesPerBlock =
		showTier2 && visibleBlocks.length > 0
			? Math.max(1, Math.min(dials.detail === 'faithful' ? 4 : 2, Math.floor(remainingBudgetForLeaves / visibleBlocks.length)))
			: 0;

	const focalAxisId = pickFocalAxisId(visibleBlocks, input.focalBlockId);

	// Calcul de la géométrie sur grille stricte 4px
	const colCount = Math.max(1, visibleBlocks.length);
	const marginX = 32;
	const colGap = 20;
	const usableW = Math.max(preset.width - marginX * 2, colCount * 168 + (colCount - 1) * colGap);
	const canvasW = ceil4(usableW + marginX * 2);
	const colW = snap4((usableW - (colCount - 1) * colGap) / colCount);
	const tier1W = snap4(Math.max(152, Math.min(220, colW)));
	const tier1H = 68;
	const tier2W = snap4(Math.max(144, tier1W - 8));
	const tier2H = 56;

	const rootW = snap4(Math.min(340, Math.max(240, canvasW * 0.34)));
	const rootH = 68;
	const rootX = snap4((canvasW - rootW) / 2);
	const rootY = 100;
	const tier1Y = 208;
	const tier2StartY = 312;
	const tier2StepY = 68;

	const arrowsSvg: string[] = [];
	const nodesSvg: string[] = [];
	const annotationsSvg: string[] = [];
	const registryBlocks: BlockRegistryEntry[] = [];

	// Racine
	const rootSublabel =
		dials.audience === 'executive'
			? `${allBlocks.length} domaine(s) · ${input.graph.requirements.length} exigence(s)`
			: input.retainedOptionTitle
				? `Option : ${fitLabelToWidth(input.retainedOptionTitle, rootW - 24, preset.sublabelFontSize, 'mono')}`
				: `${allBlocks.length} axe(s) TOGAF · ${input.graph.requirements.length} req`;

	registryBlocks.push({
		id: rootBlockId,
		name: input.subjectName,
		output: `${allBlocks.length} axe(s) fonctionnel(s)`,
		...(input.retainedOptionTitle ? { impl: input.retainedOptionTitle } : {})
	});

	nodesSvg.push(
		renderNodeBox({
			x: rootX,
			y: rootY,
			width: rootW,
			height: rootH,
			tag: rootBlockId,
			title: fitLabelToWidth(input.subjectName, rootW - 24, preset.nodeFontSize, 'sans'),
			sublabel: rootSublabel,
			variant: 'backend',
			skin: dials.skin,
			fontSource: dials.fontSource,
			titleFontSize: preset.nodeFontSize,
			sublabelFontSize: preset.sublabelFontSize,
			clickable: true,
			dataAttributes: {
				'data-block-id': rootBlockId,
				'data-block-name': input.subjectName,
				'data-subject-id': input.subjectId
			}
		})
	);

	let drawnNodeCount = 1;
	let maxBottomY = tier1Y + tier1H + 36;
	let collapsedLeafTotal = 0;

	// Centrage horizontal des colonnes Tier 1
	const totalRowW = colCount * tier1W + (colCount - 1) * colGap;
	const startX = snap4((canvasW - totalRowW) / 2);

	visibleBlocks.forEach((block, idx) => {
		const blockId = makeBlockId(rootBlockId, idx);
		const bx = snap4(startX + idx * (tier1W + colGap));
		const by = tier1Y;
		const isFocal = block.axisId === focalAxisId;

		const rootPortX = snap4(rootX + rootW / 2);
		const rootPortY = snap4(rootY + rootH);
		const childPortX = snap4(bx + tier1W / 2);
		const childPortY = by;

		// Connecteur orthogonal racine -> bloc Tier 1 (dessiné avant les nœuds)
		const connectorD = orthogonalTreeConnector(rootPortX, rootPortY, childPortX, childPortY, snap4(rootPortY + 20));
		arrowsSvg.push(
			`  <path d="${connectorD}" fill="none" stroke="${isFocal ? t.accent : t.muted}" stroke-width="${isFocal ? '1.2' : '1'}" marker-end="url(#${slug}-${isFocal ? 'arrow-accent' : 'arrow'})"/>`
		);

		const blockConstraint =
			block.requirementRefs.length > 0 ? `Exigences : ${block.requirementRefs.slice(0, 4).join(', ')}` : undefined;
		const blockAssumption =
			block.unsettledCount > 0 ? `${block.unsettledCount} énoncé(s) à consolider ou contesté(s)` : undefined;
		const blockImpl = block.components.length > 0 ? block.components.slice(0, 3).join(', ') : undefined;

		registryBlocks.push({
			id: blockId,
			parent: rootBlockId,
			name: block.label,
			...(blockConstraint ? { constraint: blockConstraint } : {}),
			...(blockAssumption ? { assumption: blockAssumption } : {}),
			...(blockImpl ? { impl: blockImpl } : {})
		});

		const tier1Sub =
			dials.audience === 'executive'
				? `${block.settledCount}/${block.items.length} consolidé(s)`
				: `${block.items.length} énoncé(s) · ${block.requirementRefs.length} req`;

		nodesSvg.push(
			renderNodeBox({
				x: bx,
				y: by,
				width: tier1W,
				height: tier1H,
				tag: blockId,
				title: fitLabelToWidth(block.label, tier1W - 20, preset.nodeFontSize, 'sans'),
				sublabel: fitLabelToWidth(tier1Sub, tier1W - 16, preset.sublabelFontSize, 'mono'),
				variant: isFocal ? 'focal' : block.unsettledCount > 0 ? 'warning' : 'backend',
				skin: dials.skin,
				fontSource: dials.fontSource,
				titleFontSize: preset.nodeFontSize,
				sublabelFontSize: preset.sublabelFontSize,
				clickable: true,
				dataAttributes: {
					'data-block-id': blockId,
					'data-block-parent': rootBlockId,
					'data-block-name': block.label,
					'data-block-constraint': blockConstraint,
					'data-block-assumption': blockAssumption,
					'data-block-impl': blockImpl,
					'data-axis-id': block.axisId
				}
			})
		);
		drawnNodeCount += 1;

		// Annotation éditoriale en marge sur le bloc focal s'il contient des points non consolidés
		if (isFocal && block.unsettledCount > 0 && idx === visibleBlocks.length - 1 && bx + tier1W + 180 <= canvasW) {
			annotationsSvg.push(
				renderAnnotationCallout({
					targetX: bx + tier1W,
					targetY: by + 24,
					textX: bx + tier1W + 24,
					textY: by + 16,
					text: `${block.unsettledCount} point(s) à arbitrer`,
					skin: dials.skin,
					fontSource: dials.fontSource
				})
			);
		}

		// Tier 2 : composants / énoncés rattachés
		if (showTier2 && maxLeavesPerBlock > 0 && block.items.length > 0) {
			const visibleLeaves = block.items.slice(0, maxLeavesPerBlock);
			const hiddenLeaves = Math.max(0, block.items.length - visibleLeaves.length);
			collapsedLeafTotal += hiddenLeaves;

			const leafX = snap4(bx + (tier1W - tier2W) / 2);
			const trunkX = snap4(bx + tier1W / 2);

			visibleLeaves.forEach((item, lIdx) => {
				const leafId = `${blockId}-${String(lIdx + 1).padStart(2, '0')}`;
				const ly = snap4(tier2StartY + lIdx * tier2StepY);

				if (lIdx === 0) {
					const d = orthogonalTreeConnector(trunkX, by + tier1H, trunkX, ly);
					arrowsSvg.push(
						`  <path d="${d}" fill="none" stroke="${t.muted}" stroke-width="1" marker-end="url(#${slug}-arrow)"/>`
					);
				} else {
					const prevBottom = snap4(tier2StartY + (lIdx - 1) * tier2StepY + tier2H);
					const d = orthogonalTreeConnector(trunkX, prevBottom, trunkX, ly);
					arrowsSvg.push(
						`  <path d="${d}" fill="none" stroke="${t.ruleSolid}" stroke-width="1"/>`
					);
				}

				const isUnsettled = item.badge.tag !== 'Verified' && item.badge.tag !== 'Designed';
				const leafTitle =
					dials.audience === 'executive' ? item.componentName : item.statement.triplet.predicate;
				const leafSub =
					dials.audience === 'engineer'
						? `${String(item.statement.triplet.value)} · ${item.badge.label}`
						: item.badge.label;

				registryBlocks.push({
					id: leafId,
					parent: blockId,
					name: leafTitle,
					...(isUnsettled ? { assumption: `${item.badge.label} (${item.statement.id})` } : {}),
					impl: item.componentName
				});

				nodesSvg.push(
					renderNodeBox({
						x: leafX,
						y: ly,
						width: tier2W,
						height: tier2H,
						tag: leafId,
						title: fitLabelToWidth(leafTitle, tier2W - 20, preset.nodeFontSize - 1, 'sans'),
						sublabel: fitLabelToWidth(leafSub, tier2W - 16, preset.sublabelFontSize, 'mono'),
						variant: isUnsettled ? 'optional' : 'store',
						skin: dials.skin,
						fontSource: dials.fontSource,
						titleFontSize: preset.nodeFontSize - 1,
						sublabelFontSize: preset.sublabelFontSize,
						clickable: true,
						dataAttributes: {
							'data-block-id': leafId,
							'data-block-parent': blockId,
							'data-block-name': leafTitle,
							'data-block-impl': item.componentName,
							'data-statement-id': item.statement.id,
							'data-axis-id': block.axisId
						}
					})
				);
				drawnNodeCount += 1;
				maxBottomY = Math.max(maxBottomY, ly + tier2H + 28);
			});

			if (hiddenLeaves > 0) {
				const cohortY = snap4(tier2StartY + visibleLeaves.length * tier2StepY);
				nodesSvg.push(
					renderNodeBox({
						x: leafX,
						y: cohortY,
						width: tier2W,
						height: 40,
						title: `+ ${hiddenLeaves} énoncé(s) agrégé(s)`,
						variant: 'optional',
						skin: dials.skin,
						fontSource: dials.fontSource,
						titleFontSize: 10,
						clickable: true,
						dataAttributes: {
							'data-axis-id': block.axisId
						}
					})
				);
				maxBottomY = Math.max(maxBottomY, cohortY + 40 + 28);
			}
		}
	});

	if (collapsedLeafTotal > 0) {
		ledgerEntries.push({
			action: 'collapsed',
			count: collapsedLeafTotal,
			summary: `${collapsedLeafTotal} énoncé(s) de niveau 2 agrégé(s) dans des cohortes (budget ${dials.detail})`
		});
	}

	if (visibleBlocks.length === 0) {
		nodesSvg.push(
			renderNodeBox({
				x: snap4((canvasW - 280) / 2),
				y: tier1Y,
				width: 280,
				height: 60,
				title: 'Aucun bloc fonctionnel projeté',
				sublabel: 'Ajoutez des énoncés pour peupler les axes TOGAF',
				variant: 'optional',
				skin: dials.skin,
				fontSource: dials.fontSource
			})
		);
	}

	ledgerEntries.push({
		action: 'kept',
		count: drawnNodeCount,
		summary: `${drawnNodeCount} bloc(s) traçable(s) dessiné(s) sur grille 4px (${registryBlocks.length} entrée(s) dans .registry.json)`
	});

	// Ordre de peinture strict : arrows -> nodes -> annotations
	const bodyContent = [
		`  <g class="editorial-arrows">`,
		...arrowsSvg,
		`  </g>`,
		`  <g class="editorial-nodes">`,
		...nodesSvg,
		`  </g>`,
		annotationsSvg.length > 0 ? `  <g class="editorial-annotations">\n${annotationsSvg.join('\n')}\n  </g>` : ''
	]
		.filter(Boolean)
		.join('\n');

	const title = `Décomposition en blocs traçables · ${input.subjectName}`;
	const description = `Arbre de décomposition TOGAF du sujet ${input.subjectName} présentant ${visibleBlocks.length} axe(s) fonctionnel(s) et ${input.graph.requirements.length} exigence(s) rattachée(s).`;

	const envelope = buildAccessibleSvg({
		slug,
		diagramType: 'traceable-block-decomposition',
		title,
		description,
		width: canvasW,
		height: Math.max(preset.minHeight, maxBottomY),
		skin: dials.skin,
		fontSource: dials.fontSource,
		headerEyebrow: `Décomposition en blocs · ${input.sectionRef || 'Architecture'} · ${dials.detail}`,
		headerTitle: fitLabelToWidth(input.subjectName, canvasW - 64, 22, 'serif'),
		headerSubtitle: `${allBlocks.length} axe(s) TOGAF · ${input.graph.requirements.length} exigence(s) · Grille 4px déterministe`,
		bodyContent,
		legendItems: [
			{ label: 'Bloc focal prioritaire', variant: 'focal' },
			{ label: 'Bloc consolidé', variant: 'backend' },
			{ label: 'À arbitrer / Hypothèse', variant: 'optional' }
		]
	});

	const sidecar: BlockRegistrySidecar = {
		source: `${slug}.html`,
		blocks: registryBlocks
	};

	return {
		diagramType: 'traceable-blocks',
		slug,
		title,
		description,
		svg: envelope.svg,
		width: envelope.width,
		height: envelope.height,
		dials,
		ledger: {
			detail: dials.detail,
			sourceNodeCount,
			drawnNodeCount,
			entries: ledgerEntries
		},
		registryJson: JSON.stringify(sidecar, null, 2)
	};
}
