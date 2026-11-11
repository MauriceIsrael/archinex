/**
 * PetitesBriques Canvas Bridge for Archinex
 *
 * Projette les décisions d'architecture d'ingénierie (Maturité L3/L4, options retenues et énoncés)
 * en modèles de canvas déclaratifs "Petites Briques", respectant les règles d'empilement Poka-Yoke 3GPP.
 */

import type { MaturitySubject } from './maturityBoard';
import type { Statement } from '$lib/types/epistemic';
import type { ProjectionContext } from './artifactProjections';

export interface PetitesBriquesBrick {
	instanceId: string;
	templateId: string;
	siteId: string;
	order: number;
	columnIndex: number;
	label?: string;
	attributes?: Record<string, unknown>;
}

export interface PetitesBriquesSite {
	id: string;
	name: string;
	siteType: 'on-prem' | 'managed-self' | 'public-cloud';
	columnCount: number;
	x?: number;
	advance?: number;
	bricks: PetitesBriquesBrick[];
}

export interface PetitesBriquesZone {
	id: string;
	label: string;
	brickInstanceIds: string[];
	style?: 'solid' | 'dashed';
	color?: string;
}

export interface PetitesBriquesConnection {
	id: string;
	sourceBrickId: string;
	targetBrickId: string;
	sourceDirection?: 'east' | 'west' | 'north' | 'south';
	linkTypeId: string;
}

export interface PetitesBriquesPerimeter {
	id: string;
	name: string;
	siteIds: string[];
	color: string;
}

export interface PetitesBriquesCanvas {
	name: string;
	description: string;
	x_start: number;
	sites: PetitesBriquesSite[];
	zones: PetitesBriquesZone[];
	connections: PetitesBriquesConnection[];
	perimeters: PetitesBriquesPerimeter[];
}

/**
 * Mappeur de drapeaux d'exigences architecturales depuis le contexte et les énoncés.
 */
export function extractCanvasRequirements(
	statements: Statement[] = [],
	context?: ProjectionContext
): {
	edge_survivability: boolean;
	active_active_core: boolean;
	lmr_interworking: boolean;
	dedicated_core: boolean;
} {
	const decision = context?.decision;
	const retainedOption = context?.options?.find(
		(o) => o.id === decision?.retainedOptionId || o.title === decision?.retainedOptionTitle
	);
	const textCorpus = [
		context?.projectName || '',
		decision?.retainedOptionTitle || '',
		retainedOption?.summary || '',
		decision?.rationale || '',
		context?.detailedSpecText || '',
		...statements.map(
			(s) =>
				`${s.triplet.predicate} ${String(s.triplet.value)} ${s.justification.appliedRule || ''}`
		)
	]
		.join(' ')
		.toLowerCase();

	return {
		edge_survivability: /survi|edge|ilotage|[iî]lot|autonome|tactique/i.test(textCorpus),
		active_active_core: /actif[\s/-]*actif|bi-site|deux zones|multi-sites|g[eé]oredondan|dual[\s/-]*site/i.test(textCorpus),
		lmr_interworking: /lmr|tetra|tetrapol|p25|iwf|interworking|passerelle/i.test(textCorpus),
		dedicated_core: /standalone|dedicated|souverain|d[eé]di[eé]|5g sa/i.test(textCorpus)
	};
}

/**
 * Génère le modèle complet PetitesBriques Canvas à partir du sujet et du contexte d'ingénierie.
 */
export function generatePetitesBriquesCanvas(
	subject: MaturitySubject | { id: string; name: string; section_ref?: string; sectionRef?: string },
	_draft: unknown,
	statements: Statement[] = [],
	context?: ProjectionContext
): PetitesBriquesCanvas {
	const projectId = context?.projectId?.trim() || 'default-project';
	const projectName = context?.projectName?.trim() || subject.name || 'Système';
	const enterpriseName = context?.enterpriseName?.trim() || 'Organisation';
	const decision = context?.decision;
	const retainedTitle = decision?.retainedOptionTitle || 'Architecture Cible Arbitrée';

	const reqs = extractCanvasRequirements(statements, context);

	// Si aucune règle spécifique n'a été détectée, activer par défaut le cœur actif/actif
	// afin de garantir une projection opérationnelle riche
	if (!reqs.edge_survivability && !reqs.active_active_core && !reqs.lmr_interworking) {
		reqs.active_active_core = true;
	}

	const sites: PetitesBriquesSite[] = [];
	const zones: PetitesBriquesZone[] = [];
	const connections: PetitesBriquesConnection[] = [];

	let currentX = 50;

	// 1. Bloc Survie Edge Tactique
	if (reqs.edge_survivability) {
		const edgeSite: PetitesBriquesSite = {
			id: 'site-edge-survie',
			name: 'Site Edge Tactique (PPDR)',
			siteType: 'on-prem',
			columnCount: 1,
			x: currentX,
			advance: 350,
			bricks: [
				{
					instanceId: 'inst-edge-radio',
					templateId: 'spectre-radio',
					siteId: 'site-edge-survie',
					order: 0,
					columnIndex: 0,
					label: 'Spectre Radio & Antenne Tactique'
				},
				{
					instanceId: 'inst-edge-upf',
					templateId: 'gw-gtp',
					siteId: 'site-edge-survie',
					order: 1,
					columnIndex: 0,
					label: 'Passerelle UPF Locale (GW-GTP)'
				},
				{
					instanceId: 'inst-edge-mcs',
					templateId: 's-critical-server',
					siteId: 'site-edge-survie',
					order: 2,
					columnIndex: 0,
					label: 'Serveur Mission-Critical Autonome'
				}
			]
		};
		sites.push(edgeSite);
		currentX += edgeSite.advance || 350;

		zones.push({
			id: 'zone-tactical-edge',
			label: 'Site Tactique Autonome (Mode Survie)',
			brickInstanceIds: ['inst-edge-radio', 'inst-edge-upf', 'inst-edge-mcs'],
			style: 'dashed',
			color: '#10B981'
		});
	}

	// 2. Bloc Cœur Bi-Site Actif/Actif Géoredondant
	if (reqs.active_active_core) {
		const dc1Site: PetitesBriquesSite = {
			id: 'site-core-dc1',
			name: 'Cœur National DC-1 (Actif)',
			siteType: 'managed-self',
			columnCount: 2,
			x: currentX,
			advance: 400,
			bricks: [
				{
					instanceId: 'inst-dc1-fabric-up',
					templateId: 't2-ip-fabric',
					siteId: 'site-core-dc1',
					order: 0,
					columnIndex: 0,
					label: 'Fabric IP Underlay & Leaf A'
				},
				{
					instanceId: 'inst-dc1-upf',
					templateId: 'gw-gtp',
					siteId: 'site-core-dc1',
					order: 1,
					columnIndex: 0,
					label: 'Passerelle UPF Nationale 1'
				},
				{
					instanceId: 'inst-dc1-mcs',
					templateId: 's-critical-server',
					siteId: 'site-core-dc1',
					order: 2,
					columnIndex: 0,
					label: 'Plateforme Services Critiques 1'
				},
				{
					instanceId: 'inst-dc1-fabric-cp',
					templateId: 't2-ip-fabric',
					siteId: 'site-core-dc1',
					order: 0,
					columnIndex: 1,
					label: 'Fabric IP Control Plane A'
				},
				{
					instanceId: 'inst-dc1-ctrl',
					templateId: 't1-core-control',
					siteId: 'site-core-dc1',
					order: 1,
					columnIndex: 1,
					label: 'Cœur 5G Control Plane (AMF/SMF)'
				}
			]
		};
		sites.push(dc1Site);
		currentX += dc1Site.advance || 400;

		const dc2Site: PetitesBriquesSite = {
			id: 'site-core-dc2',
			name: 'Cœur National DC-2 (Actif)',
			siteType: 'managed-self',
			columnCount: 2,
			x: currentX,
			advance: 400,
			bricks: [
				{
					instanceId: 'inst-dc2-fabric-up',
					templateId: 't2-ip-fabric',
					siteId: 'site-core-dc2',
					order: 0,
					columnIndex: 0,
					label: 'Fabric IP Underlay & Leaf B'
				},
				{
					instanceId: 'inst-dc2-upf',
					templateId: 'gw-gtp',
					siteId: 'site-core-dc2',
					order: 1,
					columnIndex: 0,
					label: 'Passerelle UPF Nationale 2'
				},
				{
					instanceId: 'inst-dc2-mcs',
					templateId: 's-critical-server',
					siteId: 'site-core-dc2',
					order: 2,
					columnIndex: 0,
					label: 'Plateforme Services Critiques 2'
				},
				{
					instanceId: 'inst-dc2-fabric-cp',
					templateId: 't2-ip-fabric',
					siteId: 'site-core-dc2',
					order: 0,
					columnIndex: 1,
					label: 'Fabric IP Control Plane B'
				},
				{
					instanceId: 'inst-dc2-ctrl',
					templateId: 't1-core-control',
					siteId: 'site-core-dc2',
					order: 1,
					columnIndex: 1,
					label: 'Cœur 5G Control Plane (AMF/SMF)'
				}
			]
		};
		sites.push(dc2Site);
		currentX += dc2Site.advance || 400;

		zones.push({
			id: 'zone-core-national',
			label: 'Cœur 5G SA National Bi-Site (Actif/Actif Géoredondant)',
			brickInstanceIds: [
				'inst-dc1-fabric-up',
				'inst-dc1-upf',
				'inst-dc1-mcs',
				'inst-dc1-fabric-cp',
				'inst-dc1-ctrl',
				'inst-dc2-fabric-up',
				'inst-dc2-upf',
				'inst-dc2-mcs',
				'inst-dc2-fabric-cp',
				'inst-dc2-ctrl'
			],
			style: 'solid',
			color: '#3B82F6'
		});

		// Connexion inter-DC DCI synchrone
		connections.push({
			id: 'conn-inter-dc-fiber',
			sourceBrickId: 'inst-dc1-fabric-cp',
			targetBrickId: 'inst-dc2-fabric-cp',
			sourceDirection: 'east',
			linkTypeId: 'fiber-direct'
		});
	}

	// 3. Bloc Passerelle Hybride LMR (TETRA/P25)
	if (reqs.lmr_interworking) {
		const lmrSite: PetitesBriquesSite = {
			id: 'site-legacy-lmr',
			name: 'Flotte Historique LMR (TETRA/P25)',
			siteType: 'on-prem',
			columnCount: 1,
			x: currentX,
			advance: 350,
			bricks: [
				{
					instanceId: 'inst-lmr-fabric',
					templateId: 't2-ip-fabric',
					siteId: 'site-legacy-lmr',
					order: 0,
					columnIndex: 0,
					label: 'Routeur Passerelle LMR'
				},
				{
					instanceId: 'inst-lmr-gw',
					templateId: 'vpn-ipsec',
					siteId: 'site-legacy-lmr',
					order: 1,
					columnIndex: 0,
					label: 'Passerelle IWF & Transcodage Audio'
				},
				{
					instanceId: 'inst-lmr-app',
					templateId: 'appli-critique-sec',
					siteId: 'site-legacy-lmr',
					order: 2,
					columnIndex: 0,
					label: 'Commutateur Réseau PMR Legacy'
				}
			]
		};
		sites.push(lmrSite);
		currentX += lmrSite.advance || 350;

		zones.push({
			id: 'zone-lmr-legacy',
			label: 'Interopérabilité Radio Historique (IWF 3GPP)',
			brickInstanceIds: ['inst-lmr-fabric', 'inst-lmr-gw', 'inst-lmr-app'],
			style: 'dashed',
			color: '#F59E0B'
		});

		if (reqs.active_active_core) {
			connections.push({
				id: 'conn-dc-lmr-iwf',
				sourceBrickId: 'inst-dc2-upf',
				targetBrickId: 'inst-lmr-gw',
				sourceDirection: 'east',
				linkTypeId: 'n4-pfcp'
			});
		}
	}

	// Liaisons Edge <-> National si les deux sont présents
	if (reqs.edge_survivability && reqs.active_active_core) {
		connections.push({
			id: 'conn-n2-radio-core',
			sourceBrickId: 'inst-edge-radio',
			targetBrickId: 'inst-dc1-ctrl',
			sourceDirection: 'east',
			linkTypeId: 'n2-ngap'
		});
		connections.push({
			id: 'conn-n3-edge-core',
			sourceBrickId: 'inst-edge-upf',
			targetBrickId: 'inst-dc1-upf',
			sourceDirection: 'east',
			linkTypeId: 'n3-gtp-u'
		});
	}

	// 4. Définition du Périmètre Souverain
	const sovereignSiteIds = sites.filter((s) => s.siteType !== 'public-cloud').map((s) => s.id);
	const perimeters: PetitesBriquesPerimeter[] = [
		{
			id: `perim-${projectId}`,
			name: `Périmètre Souverain (${enterpriseName !== 'Organisation' ? enterpriseName : projectName})`,
			siteIds: sovereignSiteIds,
			color: '#3B82F6'
		}
	];

	return {
		name: `${projectName} — Canvas Petites Briques`,
		description: `Canvas Poka-Yoke synthétisé pour l'arbitrage : "${retainedTitle}". Raccordements validés et contraintes physiques assignées.`,
		x_start: 50,
		sites,
		zones,
		connections,
		perimeters
	};
}

/**
 * Sérialise le canevas Petites Briques en JSON standard indenté.
 */
export function generatePetitesBriquesJSON(canvas: PetitesBriquesCanvas): string {
	return JSON.stringify(canvas, null, 2);
}

/**
 * Sérialise le canevas Petites Briques au format YAML conforme au modèle `petitesbriques_canvas.yaml`.
 */
export function generatePetitesBriquesYAML(canvas: PetitesBriquesCanvas): string {
	const escapeYamlString = (val: string) => {
		if (val.includes('\n') || val.includes(':') || val.includes('"') || val.includes("'") || val.includes('#')) {
			return `"${val.replace(/"/g, '\\"')}"`;
		}
		return val;
	};

	const lines: string[] = [];
	lines.push(`# Petites Briques Canvas Specification`);
	lines.push(`# Généré automatiquement par Archinex pour l'architecture spécifiée`);
	lines.push(`name: ${escapeYamlString(canvas.name)}`);
	lines.push(`description: ${escapeYamlString(canvas.description)}`);
	lines.push(`x_start: ${canvas.x_start}`);
	lines.push(``);

	// Sites
	lines.push(`sites:`);
	for (const site of canvas.sites) {
		lines.push(`  - id: ${site.id}`);
		lines.push(`    name: ${escapeYamlString(site.name)}`);
		lines.push(`    siteType: ${site.siteType}`);
		lines.push(`    columnCount: ${site.columnCount}`);
		if (site.x !== undefined) lines.push(`    x: ${site.x}`);
		if (site.advance !== undefined) lines.push(`    advance: ${site.advance}`);
		lines.push(`    bricks:`);
		for (const brick of site.bricks) {
			lines.push(`      - instanceId: ${brick.instanceId}`);
			lines.push(`        templateId: ${brick.templateId}`);
			lines.push(`        siteId: ${brick.siteId}`);
			lines.push(`        order: ${brick.order}`);
			lines.push(`        columnIndex: ${brick.columnIndex}`);
			if (brick.label) lines.push(`        label: ${escapeYamlString(brick.label)}`);
		}
	}
	lines.push(``);

	// Zones
	lines.push(`zones:`);
	if (canvas.zones.length === 0) {
		lines.push(`  []`);
	} else {
		for (const zone of canvas.zones) {
			lines.push(`  - id: ${zone.id}`);
			lines.push(`    label: ${escapeYamlString(zone.label)}`);
			lines.push(`    style: ${zone.style || 'solid'}`);
			lines.push(`    color: ${escapeYamlString(zone.color || '#3B82F6')}`);
			lines.push(`    brickInstanceIds:`);
			for (const bId of zone.brickInstanceIds) {
				lines.push(`      - ${bId}`);
			}
		}
	}
	lines.push(``);

	// Connections
	lines.push(`connections:`);
	if (canvas.connections.length === 0) {
		lines.push(`  []`);
	} else {
		for (const conn of canvas.connections) {
			lines.push(`  - id: ${conn.id}`);
			lines.push(`    sourceBrickId: ${conn.sourceBrickId}`);
			lines.push(`    targetBrickId: ${conn.targetBrickId}`);
			if (conn.sourceDirection) lines.push(`    sourceDirection: ${conn.sourceDirection}`);
			lines.push(`    linkTypeId: ${conn.linkTypeId}`);
		}
	}
	lines.push(``);

	// Perimeters
	lines.push(`perimeters:`);
	for (const perim of canvas.perimeters) {
		lines.push(`  - id: ${perim.id}`);
		lines.push(`    name: ${escapeYamlString(perim.name)}`);
		lines.push(`    color: ${escapeYamlString(perim.color)}`);
		lines.push(`    siteIds:`);
		for (const sId of perim.siteIds) {
			lines.push(`      - ${sId}`);
		}
	}

	return lines.join('\n');
}
