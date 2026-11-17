import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';
import { renderStructurizrWorkspace, type C4Container, type C4Relation } from '$lib/domain/structurizrDsl';
import { badgeOf, c4Styles, draftOverlay, epistemicCounts, mermaidClassDefs, mmdText, partitionStatements, withdrawnNote } from '$lib/domain/epistemicBadge';
import { TOGAF_DOMAINS, TOGAF_DOMAIN_ORDER, resolveTogafDomain, type TogafDomainId } from '$lib/domain/edp/togafTaxonomy';
import { buildDynamicDeploymentSequence, extractDeploymentSignals } from '$lib/domain/deploymentSequence';
import {
	buildProjectionBlockGraph,
	type ProjectionBlock,
	type ProjectionBlockGraph,
	type ProjectionBlockItem,
	type ProjectionRequirementTrace
} from '$lib/domain/projectionBlocks';

export type { ProjectionBlock, ProjectionBlockGraph, ProjectionBlockItem, ProjectionRequirementTrace };

export interface ProjectionSlotSummary {
	slotId: string;
	axisTitle: string;
	togafDomain?: string;
	status?: string;
	instantiatedComponents?: string[];
	boundLeafUrns?: string[];
	executableOracleRules?: string[];
}

export interface ProjectionActor {
	name: string;
	role?: string;
	description?: string;
}

export interface ProjectionDecision {
	retainedOptionId?: string;
	retainedOptionTitle?: string;
	rationale?: string;
	reversibility?: string;
	decidedAt?: string;
	arbiterId?: string;
	arbiterRole?: string;
}

export interface ProjectionBoundLeaf {
	urn: string;
	title: string;
	domain?: string;
}

export interface ProjectionDecisionSlot {
	slotId: string;
	axisUrn: string;
	axisTitle: string;
	togafDomain?: TogafDomainId | string;
	status?: string;
	boundLeafUrns?: string[];
	boundLeafTitles?: string[];
	boundLeaves?: ProjectionBoundLeaf[];
	instantiatedComponents?: string[];
	coveredRequirementRefs?: string[];
	isTransitivePrerequisite?: boolean;
	triggeredByAxisUrn?: string;
}

export interface ProjectionOntologyAxis {
	axisUrn: string;
	axisTitle: string;
	domain?: string;
	togafDomain?: TogafDomainId | string;
	status?: string;
	boundLeaves?: ProjectionBoundLeaf[];
	instantiatedComponents?: string[];
}

export interface ProjectionCatalogComponent {
	name: string;
	title?: string;
	domain?: string;
	togafDomain?: TogafDomainId | string;
	kind?: string;
	lockStatus?: string;
	axisUrns?: string[];
	dependsOn?: string[];
	outboundTargets?: Array<{ target: string; label?: string; kind?: string }>;
	coveredRequirementRefs?: string[];
}

export interface ProjectionRequirementItem {
	clauseRef: string;
	title: string;
	axisUrn?: string;
	domain?: string;
	togafDomain?: TogafDomainId | string;
	status?: string;
	matchedLeafTitle?: string;
}

export type ArchitectureProjectionPattern =
	| 'telecom_crypto'
	| 'active_active_geo'
	| 'edge_survivability'
	| 'lmr_interworking'
	| 'mcx_decoupling'
	| 'generic';

export interface ProjectionContext {
	projectId?: string;
	projectName?: string;
	enterpriseName?: string;
	actors?: ProjectionActor[];
	decision?: ProjectionDecision | null;
	options?: Array<{ id: string; title: string; summary?: string; status?: string }>;
	requirements?: ProjectionRequirementItem[];
	decisionSlots?: ProjectionDecisionSlot[];
	ontologyAxes?: ProjectionOntologyAxis[];
	catalogComponents?: ProjectionCatalogComponent[];
	sealSha256?: string;
	detailedSpecText?: string;
	slots?: ProjectionSlotSummary[];
	environments?: string[];
	/** Patron architectural résolu sémantiquement côté serveur (évite les regex ad hoc). */
	resolvedPattern?: ArchitectureProjectionPattern;
}

/** Les énoncés d'une section, partagés en « à dessiner » et « écartés » : le même tri pour tous les artefacts. */
function scoped(subject: MaturitySubject, statements: Statement[]) {
	return partitionStatements(statements.filter((s) => s.section === subject.section_ref || s.triplet.subject === subject.id));
}

/** Liens causaux entre énoncés dessinés : `basedOn` qui désigne un autre énoncé de la section (une référence externe est ignorée). */
function causalLinks(shown: Statement[]): Array<{ from: Statement; to: Statement }> {
	const byId = new Map(shown.map((s) => [s.id, s]));
	return shown.flatMap((to) => to.justification.basedOn.flatMap((id) => (byId.has(id) ? [{ from: byId.get(id)!, to }] : [])));
}

/**
 * Génère le diagramme d'architecture Mermaid à partir des énoncés de la section.
 *
 * Chaque énoncé porte son badge de solidité (vérifié, conçu, hypothèse, contesté, en conflit…) en couleur **et** en toutes lettres ;
 * un énoncé remplacé ou retiré n'est pas dessiné, et le dit.
 */
export function generateMermaidDiagram(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const index = new Map(shown.map((s, i) => [s.id, i]));
	const hasOption = Boolean(context?.decision?.retainedOptionTitle);
	const overlay = draftOverlay(draft);

	const lines: string[] = ['flowchart TD', ...mermaidClassDefs(), `    subgraph "${mmdText(`${subject.section_ref} · ${subject.name}`)}"`];

	if (overlay.banner) lines.push(`        BANNER["⚠ ${mmdText(overlay.banner)}"]:::Provisional`);
	if (hasOption) lines.push(`        OPT["⭐ Option retenue : ${mmdText(context!.decision!.retainedOptionTitle!)}"]:::Retained`);

	if (shown.length === 0 && !context?.decision && overlay.points.length === 0) {
		lines.push('        A["Architecture en cours de délibération"]');
	} else {
		shown.forEach((stmt, i) => {
			const badge = badgeOf(stmt, conflictIds.has(stmt.id));
			lines.push(`        N_${i}["${mmdText(`${stmt.triplet.predicate} : ${stmt.triplet.value}`)}<br/><i>${mmdText(badge.label)}</i>"]:::${badge.tag}`);
		});
		for (const { from, to } of causalLinks(shown)) lines.push(`        N_${index.get(from.id)} --> N_${index.get(to.id)}`);
		if (hasOption) {
			// L'option retenue précède les énoncés qui ne se fondent sur aucun autre de la section.
			const founded = new Set(causalLinks(shown).map((l) => l.to.id));
			shown.filter((s) => !founded.has(s.id)).forEach((s) => lines.push(`        OPT --> N_${index.get(s.id)}`));
		}
	}

	overlay.points.forEach((p, i) => lines.push(`        P_${i}["${mmdText(p.title)}<br/><i>${mmdText(`${p.label} · ${p.detail}`)}</i>"]:::${p.tag}`));

	const note = withdrawnNote(withdrawn);
	if (note) lines.push(`        W["${mmdText(note)}"]:::Withdrawn`);
	lines.push('    end');
	return lines.join('\n');
}

/**
 * Extrait les blocs fonctionnels / axes TOGAF et la traçabilité des exigences
 * pour alimenter les projections C4, SysML v2 et la navigation par bloc de l'UI.
 */
export function extractProjectionBlocks(
	subject: MaturitySubject,
	_draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): ProjectionBlockGraph {
	const { shown, conflictIds } = scoped(subject, statements);
	return buildProjectionBlockGraph(subject, shown, conflictIds, context?.requirements);
}

/**
 * Génère la spécification C4 au format Structurizr DSL (.dsl), **acceptée par Structurizr** (voir `structurizrDsl.ts`).
 *
 * Chaque container porte, comme « technologie » et comme étiquette de style, la solidité de l'énoncé dont il vient. Les personnes
 * sont celles que l'appelant déclare comme acteurs du système : aucune n'est inventée.
 */
export function generateStructurizrDSL(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const enterpriseName = context?.enterpriseName || context?.projectName || 'Organisation';
	const containers: C4Container[] = [];
	const overlay = draftOverlay(draft);

	if (context?.decision?.retainedOptionTitle) {
		containers.push({
			id: 'retained_option',
			name: context.decision.retainedOptionTitle,
			description: context.decision.rationale || 'Option retenue',
			technology: 'Option retenue',
			tags: ['Retained']
		});
	}

	shown.forEach((s) => {
		const badge = badgeOf(s, conflictIds.has(s.id));
		containers.push({ id: s.id, name: s.triplet.predicate, description: String(s.triplet.value), technology: badge.label, tags: [badge.tag] });
	});

	overlay.points.forEach((p, i) =>
		containers.push({ id: `open_${i}`, name: p.title, description: p.detail, technology: p.label, tags: [p.tag] })
	);

	if (containers.length === 0) {
		containers.push({ id: 'default', name: 'Socle Architectural', description: 'En cours de spécification', technology: 'non spécifié', tags: ['Unqualified'] });
	}

	const note = withdrawnNote(withdrawn);
	const systemDescription = [overlay.banner, note].filter(Boolean).join(' — ') || undefined;
	const links = causalLinks(shown);
	const relations: C4Relation[] = links.map(({ from, to }) => ({ from: from.id, to: to.id, label: 'fonde' }));
	if (context?.decision?.retainedOptionTitle) {
		const founded = new Set(links.map((l) => l.to.id));
		shown.filter((s) => !founded.has(s.id)).forEach((s) => {
			relations.push({ from: 'retained_option', to: s.id, label: 'structure' });
		});
	}

	return renderStructurizrWorkspace({
		name: subject.name,
		description: overlay.banner ? `Projeté depuis Archinex — ${overlay.banner}` : 'Projeté sans dérive depuis Archinex',
		group: enterpriseName,
		persons: (context?.actors ?? []).map((a) => ({ name: a.name, description: a.description })),
		systems: [{ id: subject.id, name: subject.name, description: systemDescription, containers }],
		relations,
		viewKey: subject.id,
		styles: c4Styles(),
		notes: [overlay.banner, note].filter((n): n is string => Boolean(n))
	});
}

/** Texte sûr dans un commentaire `doc` SysML : la fin de commentaire est neutralisée. */
const sysmlDoc = (value: string) => value.replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ');
const sysmlString = (value: string) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');

/**
 * Génère la modélisation système structurée en langage SysML v2 (OMG SysML v2 / SysON) :
 * - Blocs fonctionnels / axes TOGAF (`part def Axis_*`) et composition système (`part def System_*`),
 * - Définitions de parties par énoncé avec métadonnées épistémiques,
 * - Dépendances causales typées (`dependency from ... to ...;`),
 * - Exigences réelles (`requirement def` / `requirement`) et traçabilité formelle (`satisfy ... by ...;`).
 */
export function generateSysMLv2(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const overlay = draftOverlay(draft);
	const blockGraph = buildProjectionBlockGraph(subject, shown, conflictIds, context?.requirements);
	const taken = new Set<string>();
	const unique = (raw: string) => {
		const base = raw.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'element';
		let name = base;
		for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
		taken.add(name);
		return name;
	};
	const parts: string[] = [];
	const stmtPartDef = new Map<string, string>();
	const stmtPartPath = new Map<string, string>();

	const sysDefName = unique(`System_${subject.id}`);
	const sysInstanceName = `system_${subject.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
	let optDefName: string | null = null;

	if (context?.decision?.retainedOptionTitle) {
		optDefName = unique(`Opt_${context.decision.retainedOptionTitle}`);
		parts.push(`    part def ${optDefName} {`);
		parts.push(`        doc /* Option retenue : ${sysmlDoc(context.decision.retainedOptionTitle)} */`);
		if (context.decision.reversibility) {
			parts.push(`        attribute reversibility : String = "${sysmlString(context.decision.reversibility)}";`);
		}
		parts.push(`    }`);
	}

	const axisDefNames = new Map<string, { defName: string; usageName: string }>();

	for (const block of blockGraph.blocks) {
		const axisDefName = unique(`Axis_${block.safeId}`);
		const axisUsageName = block.safeId;
		axisDefNames.set(block.axisId, { defName: axisDefName, usageName: axisUsageName });
		const axisUsages: string[] = [];

		for (const item of block.items) {
			const s = item.statement;
			const defName = unique(s.triplet.predicate);
			const usageName = `${defName}_part`;
			stmtPartDef.set(s.id, defName);
			stmtPartPath.set(s.id, `${sysInstanceName}.${axisUsageName}.${usageName}`);
			axisUsages.push(`        part ${usageName} : ${defName};`);

			parts.push(`    part def ${defName} {`);
			parts.push(`        attribute component : String = "${sysmlString(item.componentName)}";`);
			parts.push(`        attribute specification : String = "${sysmlString(String(s.triplet.value))}";`);
			parts.push(`        attribute confidence : String = "${sysmlString(String(s.maturity.confidence))}";`);
			parts.push(`        attribute status : String = "${sysmlString(String(s.status))}";`);
			parts.push(`        attribute epistemic : String = "${sysmlString(item.badge.label)}";`);
			parts.push(`    }`);
		}

		parts.push(`    part def ${axisDefName} {`);
		parts.push(`        doc /* ${sysmlDoc(block.togafRef ? `${block.label} (${block.togafRef})` : block.label)} */`);
		parts.push(...axisUsages);
		parts.push(`    }`);
	}

	overlay.points.forEach((p) => {
		parts.push(`    part def ${unique(`Open_${p.kind}`)} {`);
		parts.push(`        doc /* ${sysmlDoc(p.title)} */`);
		parts.push(`        attribute detail : String = "${sysmlString(p.detail)}";`);
		parts.push(`        attribute epistemic : String = "${sysmlString(p.label)}";`);
		parts.push(`    }`);
	});

	parts.push(`    part def ${sysDefName} {`);
	parts.push(`        doc /* Système : ${sysmlDoc(`${subject.name} (${subject.section_ref})`)} */`);
	if (optDefName) {
		parts.push(`        part option_retenue : ${optDefName};`);
	}
	for (const block of blockGraph.blocks) {
		const info = axisDefNames.get(block.axisId)!;
		parts.push(`        part ${info.usageName} : ${info.defName};`);
	}
	parts.push(`    }`);
	parts.push(`    part ${sysInstanceName} : ${sysDefName};`);

	for (const { from, to } of causalLinks(shown)) {
		const fromPath = stmtPartPath.get(from.id);
		const toPath = stmtPartPath.get(to.id);
		if (fromPath && toPath) {
			parts.push(`    dependency from ${fromPath} to ${toPath};`);
		}
	}

	if (blockGraph.requirements.length > 0) {
		for (const req of blockGraph.requirements) {
			const reqDefName = unique(`Req_${req.safeId}`);
			const reqUsageName = `req_${req.safeId}`;
			const targetAxis = req.targetAxisId ? axisDefNames.get(req.targetAxisId) : undefined;
			const satisfyTarget = targetAxis ? `${sysInstanceName}.${targetAxis.usageName}` : sysInstanceName;

			parts.push(`    requirement def ${reqDefName} {`);
			parts.push(`        doc /* ${sysmlDoc(`${req.clauseRef} : ${req.title}`)} */`);
			parts.push(`        attribute clauseRef : String = "${sysmlString(req.clauseRef)}";`);
			parts.push(`    }`);
			parts.push(`    requirement ${reqUsageName} : ${reqDefName};`);
			parts.push(`    satisfy ${reqUsageName} by ${satisfyTarget};`);
		}
	}

	const note = withdrawnNote(withdrawn);
	const header = [`    doc /* Projeté sans doc drift depuis Archinex snapshot scellé */`];
	if (overlay.banner) header.push(`    doc /* ${sysmlDoc(overlay.banner)} */`);
	if (note) header.push(`    doc /* ${sysmlDoc(note)} */`);
	return `package '${subject.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' {\n${[...header, ...parts].join('\n')}\n}`;
}

/** Valeur typée d'un paramètre : « true », « 15 » deviennent un booléen, un nombre. */
function typed(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	if (value.toLowerCase() === 'true') return true;
	if (value.toLowerCase() === 'false') return false;
	return /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
}

/**
 * Génère la configuration opérationnelle JSON à partir des énoncés de la section et de la décision.
 *
 * Un prédicat qui porte deux valeurs actives différentes n'est **pas** tranché ici : il sort dans `conflicts`, pas dans `parameters`
 * (avant, la dernière valeur lue l'emportait, au gré de l'ordre des énoncés). Les paramètres qui ne sont pas vérifiés sont listés
 * dans `unsettled` avec leur solidité.
 */
export function generateConfigJSON(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	/** Horodatage de génération : à fournir pour une projection reproductible (le gel y passe l'instant du scellement). */
	generatedAt: string = new Date().toISOString(),
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const overlay = draftOverlay(draft);
	const key = (s: Statement) => s.triplet.predicate.replace(/[^a-zA-Z0-9_]/g, '_');

	const parameters: Record<string, unknown> = {};
	const unsettled: Record<string, string> = {};
	const conflicts: Record<string, unknown[]> = {};
	for (const stmt of shown) {
		const k = key(stmt);
		if (conflictIds.has(stmt.id)) {
			(conflicts[k] ??= []).push(typed(stmt.triplet.value));
			continue;
		}
		parameters[k] = typed(stmt.triplet.value);
		const badge = badgeOf(stmt, false);
		if (!badge.settled) unsettled[k] = badge.label;
	}

	const config = {
		subject: { id: subject.id, sectionRef: subject.section_ref, name: subject.name, maturityLevel: subject.level },
		decision: context?.decision
			? {
					retainedOptionId: context.decision.retainedOptionId,
					retainedOptionTitle: context.decision.retainedOptionTitle,
					rationale: context.decision.rationale,
					reversibility: context.decision.reversibility,
					decidedAt: context.decision.decidedAt,
					arbiterRole: context.decision.arbiterRole
				}
			: null,
		parameters: Object.keys(parameters).length > 0 ? parameters : { status: subject.level, statementsCount: shown.length },
		provisional: overlay.banner,
		unsettled,
		conflicts,
		openPoints: overlay.points.map((p) => ({ kind: p.kind, text: p.title, detail: p.detail })),
		withdrawnStatements: withdrawn,
		epistemic: epistemicCounts(shown, conflictIds),
		coveredRequirements: context?.requirements?.map((r) => r.clauseRef) ?? [],
		provenance: { sealedEngine: 'Archinex Deliberation Workbench', generatedAt, sealSha256: context?.sealSha256 }
	};

	return JSON.stringify(config, null, 2);
}

/**
 * Génère une projection visuelle C4 interprétable par Mermaid pour le modèle Structurizr,
 * structurée par blocs fonctionnels / axes TOGAF avec relations typées et traçabilité exigences.
 */
export function generateStructurizrVisualMermaid(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext,
	filterAxisId?: string
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const enterpriseName = context?.enterpriseName || context?.projectName || 'Organisation';
	const actors = context?.actors ?? [];
	const overlay = draftOverlay(draft);
	const blockGraph = buildProjectionBlockGraph(subject, shown, conflictIds, context?.requirements);
	const visibleBlocks = filterAxisId ? blockGraph.blocks.filter((b) => b.axisId === filterAxisId) : blockGraph.blocks;
	const visibleStmtIds = new Set(visibleBlocks.flatMap((b) => b.items.map((item) => item.statement.id)));

	const lines: string[] = [
		'flowchart TB',
		'    classDef person fill:#08427b,stroke:#073b6e,color:#fff,font-weight:bold',
		'    classDef reqNode fill:#eef2ff,stroke:#4f46e5,color:#1e1b4b,stroke-dasharray:4 2',
		...mermaidClassDefs(),
		'',
		...actors.map(
			(a, i) => `    user_${i}["👤 ${mmdText(a.name)}<br/><small>[Personne]</small><br/>${mmdText(a.description || '')}"]:::person`
		),
		'',
		...(overlay.banner ? [`    banner["⚠ ${mmdText(overlay.banner)}"]:::Provisional`, ''] : []),
		`    subgraph Enterprise["🏢 Entreprise : ${mmdText(enterpriseName)}"]`,
		`        subgraph SysBound["Système : ${mmdText(subject.name)}"]`,
		`            direction TB`
	];

	if (context?.decision?.retainedOptionTitle) {
		const safeRat = (context.decision.rationale || '').slice(0, 50);
		lines.push(`            c_opt["⭐ ${mmdText(context.decision.retainedOptionTitle)}<br/><small>[Option retenue · arbitrée]</small><br/>${mmdText(safeRat)}"]:::Retained`);
	}

	if (visibleBlocks.length === 0 && !context?.decision && overlay.points.length === 0) {
		lines.push(`            c_default["⚙️ Composant Architectural<br/><small>[non spécifié]</small><br/>En cours de délibération"]:::Unqualified`);
	} else {
		const index = new Map(shown.map((s, i) => [s.id, i]));
		const links = causalLinks(shown).filter((l) => visibleStmtIds.has(l.from.id) && visibleStmtIds.has(l.to.id));

		for (const block of visibleBlocks) {
			const compSummary = block.components.slice(0, 2).join(', ');
			const blockTitle = compSummary && compSummary !== block.label ? `${block.label} · ${compSummary}` : block.label;
			lines.push(`            subgraph Axis_${block.safeId}["🧩 ${mmdText(blockTitle)}"]`);
			lines.push(`                direction TB`);
			for (const item of block.items) {
				const s = item.statement;
				lines.push(
					`                c_${item.index}["⚙️ ${mmdText(s.triplet.predicate)}<br/><small>[Container · ${mmdText(item.badge.label)}]</small><br/>${mmdText(String(s.triplet.value))}"]:::${item.badge.tag}`
				);
			}
			lines.push('            end');
		}

		for (const { from, to } of links) {
			lines.push(`            c_${index.get(from.id)} -->|"fonde"| c_${index.get(to.id)}`);
		}
		if (context?.decision?.retainedOptionTitle) {
			for (const block of visibleBlocks) {
				lines.push(`            c_opt -->|"structure"| Axis_${block.safeId}`);
			}
		}
	}

	if (!filterAxisId || visibleBlocks.length === 0) {
		overlay.points.forEach((p, i) =>
			lines.push(`            c_open_${i}["❓ ${mmdText(p.title)}<br/><small>[${mmdText(p.label)}]</small><br/>${mmdText(p.detail)}"]:::${p.tag}`)
		);
	}

	const note = withdrawnNote(withdrawn);
	if (note) lines.push(`            c_withdrawn["${mmdText(note)}"]:::Withdrawn`);
	lines.push('        end');

	const visibleReqs = filterAxisId
		? blockGraph.requirements.filter((r) => r.targetAxisId === filterAxisId)
		: blockGraph.requirements;
	if (visibleReqs.length > 0) {
		lines.push(`        subgraph ReqTrace["📋 Traçabilité des Exigences"]`);
		lines.push(`            direction LR`);
		visibleReqs.forEach((req, i) => {
			lines.push(`            req_${i}["📋 ${mmdText(req.clauseRef)}<br/><small>${mmdText(req.title.slice(0, 55))}</small>"]:::reqNode`);
		});
		lines.push('        end');
		visibleReqs.forEach((req, i) => {
			const targetBlock = req.targetAxisId ? visibleBlocks.find((b) => b.axisId === req.targetAxisId) : undefined;
			const sourceNode = targetBlock ? `Axis_${targetBlock.safeId}` : 'SysBound';
			lines.push(`        ${sourceNode} -.->|"satisfait"| req_${i}`);
		});
	}

	lines.push('    end');
	lines.push('');
	actors.forEach((_, i) => lines.push(`    user_${i} -->|"Utilise"| SysBound`));

	return lines.join('\n');
}

/**
 * Génère une projection visuelle SysML v2 interprétable sous forme de diagramme de définition de blocs (BDD) :
 * - Bloc système racine (`<<system>>`),
 * - Blocs fonctionnels par axe TOGAF (`<<block>>`) liés par composition (`*--`),
 * - Blocs d'exigences (`<<requirement>>`) liés par satisfaction (`..>`).
 */
export function generateSysMLVisualMermaid(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext,
	filterAxisId?: string
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const overlay = draftOverlay(draft);
	const blockGraph = buildProjectionBlockGraph(subject, shown, conflictIds, context?.requirements);
	const visibleBlocks = filterAxisId ? blockGraph.blocks.filter((b) => b.axisId === filterAxisId) : blockGraph.blocks;
	const visibleStmtIds = new Set(visibleBlocks.flatMap((b) => b.items.map((item) => item.statement.id)));
	// Un membre de classe Mermaid : on garde les accents (avant, chacun devenait « _ »), on retire ce qui casse la syntaxe.
	const member = (value: string) => value.replace(/[{}"<>`]/g, '').replace(/[()]/g, ' ').replace(/\s*[\r\n]+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
	const sysClass = `Block_${subject.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;

	const lines: string[] = [
		'classDiagram',
		`    class ${sysClass} {`,
		`        <<system>>`,
		`        +section: ${member(subject.section_ref)}`,
		`        +status: ${member(String(subject.level))}`
	];

	if (context?.decision?.retainedOptionTitle) {
		lines.push(`        +retainedOption: ${member(context.decision.retainedOptionTitle)}`);
	}
	if (overlay.banner) lines.push(`        +provisoire: ${member(overlay.banner)}`);
	if (!filterAxisId) {
		overlay.points.forEach((p) => lines.push(`        +${p.kind}: ${member(p.title.replace(/^[^:]+ : /, ''))} · ${member(p.label)}`));
	}
	const note = withdrawnNote(withdrawn);
	if (note) lines.push(`        +écartés: ${member(note)}`);
	lines.push('    }');

	const blockClassByAxis = new Map<string, string>();
	for (const block of visibleBlocks) {
		const blockClass = `Axis_${block.safeId}`;
		blockClassByAxis.set(block.axisId, blockClass);
		lines.push(`    class ${blockClass} {`);
		lines.push(`        <<block>>`);
		lines.push(`        +axe: ${member(block.label)}`);
		for (const item of block.items) {
			const s = item.statement;
			const name = s.triplet.predicate.replace(/[^\p{L}\p{N}_]/gu, '_');
			lines.push(`        +${name}: ${member(String(s.triplet.value))} · ${member(item.badge.label)}`);
		}
		lines.push('    }');
		lines.push(`    ${sysClass} *-- ${blockClass} : compose`);
	}

	const crossAxisSeen = new Set<string>();
	for (const { from, to } of causalLinks(shown)) {
		if (!visibleStmtIds.has(from.id) || !visibleStmtIds.has(to.id)) continue;
		const fromAxis = blockGraph.statementAxis.get(from.id);
		const toAxis = blockGraph.statementAxis.get(to.id);
		if (fromAxis && toAxis && fromAxis !== toAxis) {
			const key = `${fromAxis}->${toAxis}`;
			if (!crossAxisSeen.has(key)) {
				crossAxisSeen.add(key);
				lines.push(`    ${blockClassByAxis.get(fromAxis)} --> ${blockClassByAxis.get(toAxis)} : fonde`);
			}
		}
	}

	const visibleReqs = filterAxisId
		? blockGraph.requirements.filter((r) => r.targetAxisId === filterAxisId)
		: blockGraph.requirements;
	for (const req of visibleReqs) {
		const reqClass = `Req_${req.safeId}`;
		lines.push(`    class ${reqClass} {`);
		lines.push(`        <<requirement>>`);
		lines.push(`        +clause: ${member(req.clauseRef)}`);
		lines.push(`        +titre: ${member(req.title.slice(0, 60))}`);
		lines.push('    }');
		const sourceClass = (req.targetAxisId && blockClassByAxis.get(req.targetAxisId)) || sysClass;
		lines.push(`    ${sourceClass} ..> ${reqClass} : satisfait`);
	}

	return lines.join('\n');
}


/** Styles standards pour les diagrammes d'architecture technique cible (C4 / Flowchart). */
export function targetArchitectureClassDefs(indent = '    '): string[] {
	return [
		`${indent}classDef boundary fill:#f8f9fa,stroke:#495057,stroke-width:2px,stroke-dasharray:4 4`,
		`${indent}classDef core fill:#e3f2fd,stroke:#1565c0,stroke-width:2px,color:#0d47a1`,
		`${indent}classDef agent fill:#bbdefb,stroke:#1976d2,stroke-width:1px,color:#0d47a1`,
		`${indent}classDef ext fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#4a148c`,
		`${indent}classDef human fill:#fff3e0,stroke:#e65100,stroke-width:2px,stroke-dasharray:3 3,color:#bf360c`,
		`${indent}classDef deploy fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#1b5e20`,
		`${indent}classDef person fill:#08427b,stroke:#073b6e,color:#fff,font-weight:bold`,
		`${indent}classDef draft fill:#fff8e1,stroke:#f57f17,stroke-width:2px,stroke-dasharray:5 5,color:#b78103`,
		`${indent}classDef radio fill:#f3e8ff,stroke:#7e22ce,stroke-width:2px,color:#581c87,font-weight:bold`,
		`${indent}classDef routing fill:#e0f2fe,stroke:#0284c7,stroke-width:2px,color:#0369a1,font-weight:bold`,
		`${indent}classDef dcBox fill:#f8fafc,stroke:#334155,stroke-width:2px,stroke-dasharray:6 3,color:#0f172a,font-weight:bold`,
		`${indent}classDef coreApp fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#065f46`,
		`${indent}classDef criticalApp fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#92400e`,
		`${indent}classDef ossApp fill:#f1f5f9,stroke:#64748b,stroke-width:2px,color:#334155`,
		`${indent}classDef dbApp fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#991b1b`,
		`${indent}classDef quorum fill:#fdf4ff,stroke:#c026d3,stroke-width:1.5px,stroke-dasharray:3 3,color:#701a75`
	];
}

function safeMmdId(prefix: string, raw: string, index: number): string {
	const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
	const suffix = cleaned ? cleaned.slice(-24) : String(index);
	return `${prefix}_${index}_${suffix}`;
}

function resolveAxisTogafDomain(
	togafDomain?: string,
	domain?: string,
	fallbackText?: string
): TogafDomainId {
	if (togafDomain && togafDomain in TOGAF_DOMAINS) {
		return togafDomain as TogafDomainId;
	}
	return resolveTogafDomain(domain || fallbackText);
}

function slotStatusMeta(status?: string): { label: string; style: string } {
	switch (status) {
		case 'bound_verified':
		case 'covered_executable':
			return { label: 'Vérifié', style: 'core' };
		case 'bound_unverified':
		case 'covered_no_oracle':
			return { label: 'Lié (à vérifier)', style: 'agent' };
		case 'default_proposed':
			return { label: 'Proposé par défaut', style: 'agent' };
		case 'waived':
			return { label: 'Dérogé', style: 'draft' };
		default:
			return { label: 'Ouvert', style: 'draft' };
	}
}

function componentStyleClass(lockStatus?: string): string {
	if (lockStatus === 'locked' || lockStatus === 'emergent_locked') return 'deploy';
	if (lockStatus === 'default_proposed') return 'agent';
	return 'core';
}

interface NormalizedAxis {
	axisUrn: string;
	slotId?: string;
	axisTitle: string;
	domainId: TogafDomainId;
	status: string;
	boundLeafLabels: string[];
	instantiatedComponents: string[];
	coveredRequirementRefs: string[];
	isTransitivePrerequisite: boolean;
	triggeredByAxisUrn?: string;
}

interface NormalizedComponent {
	name: string;
	title: string;
	domainId: TogafDomainId;
	lockStatus?: string;
	axisUrns: Set<string>;
	outboundTargets: Array<{ target: string; label: string }>;
}

/**
 * Assemble dynamiquement un diagramme Mermaid multi-axes à partir des données structurées
 * du sujet : decisionSlots / axes ontologiques, statements actifs, exigences couvertes
 * et composants instanciés du catalogue projet, groupés par domaine TOGAF canonique.
 */
function buildMultiAxisTargetArchitectureDiagram(
	sectionRef: string,
	projectId: string,
	projectName: string,
	activeStatements: Statement[],
	context: ProjectionContext
): string {
	const axisMap = new Map<string, NormalizedAxis>();

	for (const axis of context.ontologyAxes ?? []) {
		const domainId = resolveAxisTogafDomain(axis.togafDomain, axis.domain, axis.axisTitle);
		const boundLeafLabels = (axis.boundLeaves ?? []).map((l) => l.title || l.urn).filter(Boolean);
		axisMap.set(axis.axisUrn, {
			axisUrn: axis.axisUrn,
			axisTitle: axis.axisTitle,
			domainId,
			status: axis.status || 'open',
			boundLeafLabels: Array.from(new Set(boundLeafLabels)),
			instantiatedComponents: Array.from(new Set(axis.instantiatedComponents ?? [])),
			coveredRequirementRefs: [],
			isTransitivePrerequisite: false
		});
	}

	for (const slot of context.decisionSlots ?? []) {
		const existing = axisMap.get(slot.axisUrn);
		const domainId = resolveAxisTogafDomain(slot.togafDomain, existing?.domainId, slot.axisTitle);
		const leafLabels = [
			...(existing?.boundLeafLabels ?? []),
			...(slot.boundLeaves ?? []).map((l) => l.title || l.urn),
			...(slot.boundLeafTitles ?? []),
			...(slot.boundLeafUrns && !slot.boundLeafTitles?.length && !slot.boundLeaves?.length ? slot.boundLeafUrns : [])
		].filter(Boolean);
		const comps = [
			...(existing?.instantiatedComponents ?? []),
			...(slot.instantiatedComponents ?? [])
		].filter(Boolean);
		const reqs = [
			...(existing?.coveredRequirementRefs ?? []),
			...(slot.coveredRequirementRefs ?? [])
		].filter(Boolean);

		axisMap.set(slot.axisUrn, {
			axisUrn: slot.axisUrn,
			slotId: slot.slotId,
			axisTitle: slot.axisTitle || existing?.axisTitle || slot.axisUrn,
			domainId,
			status: slot.status || existing?.status || 'open',
			boundLeafLabels: Array.from(new Set(leafLabels)),
			instantiatedComponents: Array.from(new Set(comps)),
			coveredRequirementRefs: Array.from(new Set(reqs)),
			isTransitivePrerequisite: Boolean(slot.isTransitivePrerequisite),
			triggeredByAxisUrn: slot.triggeredByAxisUrn
		});
	}

	// Exigences couvertes rattachées aux axes ou aux domaines TOGAF
	const domainRequirements = new Map<TogafDomainId, string[]>();
	for (const req of context.requirements ?? []) {
		const label = req.clauseRef || req.title;
		if (!label) continue;
		if (req.axisUrn && axisMap.has(req.axisUrn)) {
			const axis = axisMap.get(req.axisUrn)!;
			if (!axis.coveredRequirementRefs.includes(label)) {
				axis.coveredRequirementRefs.push(label);
			}
			continue;
		}
		if (req.togafDomain || req.domain || req.status === 'covered') {
			const domainId = resolveAxisTogafDomain(req.togafDomain, req.domain, req.title);
			const list = domainRequirements.get(domainId) ?? [];
			if (!list.includes(label)) list.push(label);
			domainRequirements.set(domainId, list);
		}
	}

	// Filtrer les axes dérogés sans aucune matière active
	const activeAxes = Array.from(axisMap.values()).filter(
		(a) =>
			a.status !== 'waived' ||
			a.boundLeafLabels.length > 0 ||
			a.instantiatedComponents.length > 0 ||
			a.coveredRequirementRefs.length > 0
	);

	// Composants instanciés du catalogue projet + composants référencés par les axes
	const componentMap = new Map<string, NormalizedComponent>();
	for (const comp of context.catalogComponents ?? []) {
		const domainId = resolveAxisTogafDomain(comp.togafDomain, comp.domain || comp.kind, comp.title || comp.name);
		const outbound: Array<{ target: string; label: string }> = [
			...(comp.dependsOn ?? []).map((t) => ({ target: t, label: 'dépend de' })),
			...(comp.outboundTargets ?? []).map((o) => ({ target: o.target, label: o.label || 'interface' }))
		];
		componentMap.set(comp.name, {
			name: comp.name,
			title: comp.title || comp.name,
			domainId,
			lockStatus: comp.lockStatus,
			axisUrns: new Set(comp.axisUrns ?? []),
			outboundTargets: outbound
		});
	}
	for (const axis of activeAxes) {
		for (const compName of axis.instantiatedComponents) {
			const existing = componentMap.get(compName);
			if (existing) {
				existing.axisUrns.add(axis.axisUrn);
			} else {
				componentMap.set(compName, {
					name: compName,
					title: compName,
					domainId: axis.domainId,
					axisUrns: new Set([axis.axisUrn]),
					outboundTargets: []
				});
			}
		}
	}

	// Grouper les statements actifs par axe (si lié) ou par domaine TOGAF
	const statementDomain = new Map<string, TogafDomainId>();
	const statementAxisUrn = new Map<string, string>();
	for (const stmt of activeStatements) {
		const basedOn = stmt.justification.basedOn || [];
		const matchedAxis = activeAxes.find(
			(a) =>
				basedOn.includes(a.axisUrn) ||
				(a.slotId && basedOn.includes(a.slotId)) ||
				stmt.triplet.subject === a.axisUrn ||
				stmt.triplet.subject.toLowerCase() === a.axisTitle.toLowerCase()
		);
		if (matchedAxis) {
			statementDomain.set(stmt.id, matchedAxis.domainId);
			statementAxisUrn.set(stmt.id, matchedAxis.axisUrn);
		} else {
			statementDomain.set(
				stmt.id,
				resolveTogafDomain(`${stmt.triplet.subject} ${stmt.triplet.predicate} ${String(stmt.triplet.value)}`)
			);
		}
	}

	const lines: string[] = ['flowchart TB', ...targetArchitectureClassDefs(), ''];

	// Acteurs déclarés
	(context.actors ?? []).forEach((actor, idx) => {
		const id = safeMmdId('ACTOR', actor.name, idx);
		const roleSuffix = actor.role ? `<br/><small>${mmdText(actor.role)}</small>` : '';
		lines.push(`    ${id}["👤 ${mmdText(actor.name)}${roleSuffix}"]:::person`);
	});

	// Ancre décisionnelle L3 si présente
	const retainedOptionTitle = context.decision?.retainedOptionTitle;
	if (retainedOptionTitle) {
		lines.push(`    DECISION["⭐ Option retenue : ${mmdText(retainedOptionTitle)}"]:::human`);
	}
	if ((context.actors?.length ?? 0) > 0 || retainedOptionTitle) {
		lines.push('');
	}

	const axisNodeIds = new Map<string, string>();
	const compNodeIds = new Map<string, string>();
	const stmtNodeIds = new Map<string, string>();
	const domainPrimaryNodes = new Map<TogafDomainId, string[]>();

	const systemLabel = `Système : ${projectName} (${sectionRef}) [Projet: ${projectId}]`;
	lines.push(`    subgraph SYSTEM["${mmdText(systemLabel)}"]`);
	lines.push('        direction TB');

	let axisCounter = 0;
	let compCounter = 0;
	let stmtCounter = 0;

	for (const domainId of TOGAF_DOMAIN_ORDER) {
		const domAxes = activeAxes.filter((a) => a.domainId === domainId);
		const domComps = Array.from(componentMap.values()).filter((c) => c.domainId === domainId);
		const domStmts = activeStatements.filter((s) => statementDomain.get(s.id) === domainId);
		const domReqs = domainRequirements.get(domainId) ?? [];

		if (domAxes.length === 0 && domComps.length === 0 && domStmts.length === 0 && domReqs.length === 0) {
			continue;
		}

		const safeDom = domainId.replace(/-/g, '_');
		lines.push(`        subgraph DOM_${safeDom}["${mmdText(TOGAF_DOMAINS[domainId].label)}"]`);
		lines.push('            direction TB');

		const primaryIds: string[] = [];

		for (const axis of domAxes) {
			const nodeId = safeMmdId('AXIS', axis.axisUrn, axisCounter++);
			axisNodeIds.set(axis.axisUrn, nodeId);
			if (!axis.isTransitivePrerequisite) primaryIds.push(nodeId);

			const meta = slotStatusMeta(axis.status);
			const subParts: string[] = [meta.label];
			if (axis.boundLeafLabels.length > 0) {
				subParts.push(axis.boundLeafLabels.slice(0, 3).join(', '));
			}
			if (axis.coveredRequirementRefs.length > 0) {
				subParts.push(`Exigences: ${axis.coveredRequirementRefs.slice(0, 3).join(', ')}`);
			}
			lines.push(
				`            ${nodeId}["🧭 ${mmdText(axis.axisTitle)}<br/><small>${mmdText(subParts.join(' · '))}</small>"]:::${meta.style}`
			);
		}

		for (const comp of domComps) {
			const nodeId = safeMmdId('COMP', comp.name, compCounter++);
			compNodeIds.set(comp.name, nodeId);
			if (domAxes.length === 0) primaryIds.push(nodeId);

			const style = componentStyleClass(comp.lockStatus);
			const lockInfo = comp.lockStatus ? `<br/><small>${mmdText(comp.lockStatus)}</small>` : '';
			lines.push(`            ${nodeId}["🧩 ${mmdText(comp.title)}${lockInfo}"]:::${style}`);
		}

		for (const stmt of domStmts) {
			const nodeId = safeMmdId('STMT', stmt.id, stmtCounter++);
			stmtNodeIds.set(stmt.id, nodeId);
			if (domAxes.length === 0 && domComps.length === 0) primaryIds.push(nodeId);

			const badge = badgeOf(stmt, false);
			lines.push(
				`            ${nodeId}["⚙️ ${mmdText(stmt.triplet.predicate)} : ${mmdText(String(stmt.triplet.value))}<br/><small>${mmdText(badge.label)}</small>"]:::core`
			);
		}

		if (domReqs.length > 0) {
			const reqNodeId = `REQ_${safeDom}`;
			lines.push(
				`            ${reqNodeId}["📋 Exigences couvertes : ${mmdText(domReqs.slice(0, 5).join(', '))}"]:::ossApp`
			);
		}

		if (primaryIds.length > 0) {
			domainPrimaryNodes.set(domainId, primaryIds);
		}
		lines.push('        end');
	}

	lines.push('    end');
	lines.push('    class SYSTEM boundary');
	lines.push('');

	// Liaisons décision -> axes primaires par domaine
	if (retainedOptionTitle) {
		for (const ids of domainPrimaryNodes.values()) {
			if (ids[0]) lines.push(`    DECISION -->|"cadre"| ${ids[0]}`);
		}
	}

	// Prérequis transitifs entre axes
	for (const axis of activeAxes) {
		if (axis.triggeredByAxisUrn) {
			const srcId = axisNodeIds.get(axis.triggeredByAxisUrn);
			const dstId = axisNodeIds.get(axis.axisUrn);
			if (srcId && dstId && srcId !== dstId) {
				lines.push(`    ${srcId} -.->|"prérequis"| ${dstId}`);
			}
		}
	}

	// Liaisons axes -> composants instanciés
	for (const comp of componentMap.values()) {
		const compId = compNodeIds.get(comp.name);
		if (!compId) continue;
		for (const axisUrn of comp.axisUrns) {
			const axisId = axisNodeIds.get(axisUrn);
			if (axisId) {
				lines.push(`    ${axisId} -->|"instancie"| ${compId}`);
			}
		}
	}

	// Liaisons axes -> énoncés rattachés
	for (const [stmtId, axisUrn] of statementAxisUrn.entries()) {
		const axisId = axisNodeIds.get(axisUrn);
		const sNodeId = stmtNodeIds.get(stmtId);
		if (axisId && sNodeId) {
			lines.push(`    ${axisId} --> ${sNodeId}`);
		}
	}

	// Liens causaux entre énoncés actifs
	for (const { from, to } of causalLinks(activeStatements)) {
		const fromId = stmtNodeIds.get(from.id);
		const toId = stmtNodeIds.get(to.id);
		if (fromId && toId) {
			lines.push(`    ${fromId} --> ${toId}`);
		}
	}

	// Dépendances entre composants du catalogue
	for (const comp of componentMap.values()) {
		const fromId = compNodeIds.get(comp.name);
		if (!fromId) continue;
		for (const out of comp.outboundTargets) {
			const toId = compNodeIds.get(out.target);
			if (toId && fromId !== toId) {
				lines.push(`    ${fromId} -->|"${mmdText(out.label)}"| ${toId}`);
			}
		}
	}

	return lines.join('\n');
}

/**
 * Génère le schéma d'architecture technique spécifiée (Topologie, Conteneurs, Interfaces et Déploiement)
 * dérivé des axes structurés (decisionSlots, axes ontologiques, énoncés actifs, exigences et composants),
 * ou à défaut de l'option retenue et de la spécification détaillée (C4 Container / Flowchart).
 *
 * Contrairement au diagramme causal/épistémique (qui trace l'arbre de justification et les débats),
 * ce diagramme représente littéralement la solution technique retenue pour le dossier d'homologation et de rendu HLD :
 * - Périmètre Système / Solution (modules internes, agents embarqués, console, stockage)
 * - Périmètre Existant / SI Tiers (outillage client, supervision externe, SIEM, dépôts)
 * - Flux d'interfaces étiquetés avec protocoles (Alarmes SNMP, Métriques API, Logs Syslog TLS)
 * - Chaîne de confiance et déploiement (WAPT, paquets signés, sas de validation humaine)
 */
export function generateTargetArchitectureDiagram(
	subject: MaturitySubject | { id: string; name: string; section_ref?: string; sectionRef?: string; level?: string },
	_draft?: TelegraphicDraft | null,
	statements: Statement[] = [],
	context?: ProjectionContext
): string {
	const sectionRef = (subject as any).section_ref || (subject as any).sectionRef || '§0';
	const subjectName = subject.name || 'Système';
	const projectId = context?.projectId?.trim() || 'default-project';
	const projectName = context?.projectName?.trim() || subjectName;
	const enterpriseName = context?.enterpriseName?.trim() || 'Organisation';
	const decision = context?.decision;
	const retainedOptionTitle = decision?.retainedOptionTitle;
	const retainedOption = context?.options?.find(
		(o) => o.id === decision?.retainedOptionId || o.title === retainedOptionTitle
	);
	const summary = retainedOption?.summary || '';
	const rationale = decision?.rationale || '';
	const detailedSpec = context?.detailedSpecText || '';
	const fullSpec = `${projectName} ${detailedSpec} ${retainedOptionTitle || ''} ${summary} ${rationale} ${(context?.options || []).map((o) => `${o.title} ${o.summary || ''}`).join(' ')}`.trim();

	const activeStatements = (statements || []).filter((s) => s.status === 'active');
	const hasStructuredMultiAxisData = Boolean(
		(context?.decisionSlots && context.decisionSlots.length > 0) ||
		(context?.ontologyAxes && context.ontologyAxes.length > 0) ||
		(context?.catalogComponents && context.catalogComponents.length > 0) ||
		activeStatements.length > 0 ||
		context?.requirements?.some((r) => Boolean(r.axisUrn || r.togafDomain || r.domain || r.matchedLeafTitle))
	);

	// Si aucune décision n'est encore actée, aucun énoncé présent, aucune spécification détaillée et aucune donnée multi-axes
	if (!retainedOptionTitle && (!statements || statements.length === 0) && !detailedSpec && !hasStructuredMultiAxisData) {
		return [
			'flowchart TB',
			...targetArchitectureClassDefs(),
			`    subgraph SYSTEM["Système : ${mmdText(projectName)} (${mmdText(sectionRef)}) [Projet: ${mmdText(projectId)}]"]`,
			'        direction TB',
			`        PENDING["⏳ Architecture Cible en Attente d'Arbitrage L3<br/><small>Veuillez acter une option retenue dans la Matrice pour générer le schéma d'architecture spécifiée</small>"]:::draft`,
			'    end'
		].join('\n');
	}

	// Détermination dynamique multi-axes (Phase 3/4) sans couplage à des mots-clés codés en dur
	if (hasStructuredMultiAxisData) {
		return buildMultiAxisTargetArchitectureDiagram(
			sectionRef,
			projectId,
			projectName,
			activeStatements,
			context ?? {}
		);
	}

	const lower = fullSpec.toLowerCase();
	const hasTelecomCrypto = /s6a|diameter|dea|secgw|hss|mme|lot 3.*lot 1|esp.*chiffrement/.test(lower);
	const hasMultiEnv = /plateformes?|pr[eé]-prod|iso-[eé]tat|test-ran|qualification fournisseurs/.test(lower);
	const hasSupervision = /supervision|m[eé]trologie|alarmes?|m[eé]triques?|centreon|hypervis|zabbix|prometheus/.test(lower);
	const hasLogs = /logs?|audit|siem|syslog|splunk|elk/.test(lower);
	const hasWapt = /wapt/.test(lower);
	const hasDeployment = hasWapt || /d[eé]ploiement|paquets?|mise [aà] jour|ansible|ci\/cd|pipeline/.test(lower);
	const hasHumanGate = /validation humaine|humain|contr[oô]le humain|homologation|recette|approbation/.test(lower);
	const hasSignedPackages = /sign[eé]s?|signature|cl[eé]|pki|certificat/.test(lower);
	const hasAuth = /oidc|oauth|saml|authentification|iam|keycloak|sso|mfa/.test(lower);
	const isHybrid = /hybride|interfac|existant|remont|export|tiers/.test(lower);

	const externalLabel = enterpriseName !== 'Organisation'
		? `SI ${enterpriseName} (Existant)`
		: 'Écosystème Existant (SI Client / Partenaire)';

	// Cas Spécial Télécom / Sécurité : Chiffrement IPsec ESP & Médiation DEA pour S6a (Lot 3 <-> Lot 1)
	if (context?.resolvedPattern === 'telecom_crypto' || (!context?.resolvedPattern && hasTelecomCrypto)) {
		return [
			'flowchart TB',
			...targetArchitectureClassDefs(),
			'',
			'    %% Zone Distante : Lot 3 (Réseau Tiers / Partenaire)',
			'    subgraph LOT3["Réseau Tiers / Partenaire (Lot 3)"]',
			'        direction TB',
			'        MME_Lot3["📡 MME Tiers (Mobility Management Entity)<br/><small>Initie les requêtes d\'authentification S6a</small>"]:::ext',
			'    end',
			'    class LOT3 boundary',
			'',
			'    %% Zone de Sécurité Périmétrique : Lot 1 (Frontière & Médiation)',
			'    subgraph DMZ_LOT1["DMZ de Sécurité & Frontière Réseau (Lot 1)"]',
			'        direction TB',
			'        SecGW_Lot1["🛡️ SecGW-Lot1 (Security Gateway)<br/><small>Terminaison IPsec ESP (IKEv2 / AES-GCM-256)</small>"]:::core',
			'        DEA_Lot1["🔍 DEA-Lot1 (Diameter Edge Agent)<br/><small>Médiation S6a, filtrage AVP & masquage topologique TH</small>"]:::agent',
			'    end',
			'    class DMZ_LOT1 boundary',
			'',
			'    %% Zone Sécurisée Cœur : Lot 1 (Données Critiques)',
			'    subgraph CORE_LOT1["Cœur de Réseau & Données Abonnés (Lot 1)"]',
			'        direction TB',
			'        HSS_Lot1["🔐 HSS-Lot1 (Home Subscriber Server)<br/><small>Bases abonnés, profils & vecteurs d\'authentification AKA</small>"]:::core',
			'    end',
			'    class CORE_LOT1 boundary',
			'',
			'    %% Flux autorisés et chiffrés',
			'    MME_Lot3 ==>|"1. Tunnel IPsec ESP chiffré (IKEv2 / AES-256)"| SecGW_Lot1',
			'    SecGW_Lot1 -->|"2. Flux Diameter S6a décapsulé (interne sécurisé)"| DEA_Lot1',
			'    DEA_Lot1 -->|"3. Requête S6a inspectée & médiée (AIR / ULR)"| HSS_Lot1',
			'    HSS_Lot1 -->|"4. Réponse d\'authentification chiffrée (AIA / ULA)"| DEA_Lot1',
			'    DEA_Lot1 -->|"5. Masquage de topologie (TH) & contrôle AVP"| SecGW_Lot1',
			'    SecGW_Lot1 ==>|"6. Réponse ré-encapsulée IPsec ESP"| MME_Lot3',
			'',
			'    %% Règle d\'interdiction stricte',
			'    MME_Lot3 -.-x|"⛔ INTERDIT : Flux direct non chiffré ou sans DEA"| HSS_Lot1'
		].join('\n');
	}

	// Cas Pattern 1 : Actif / Actif Géoredondant Bi-Site (Dual-DC + GSLB + Arbitrage Split-Brain)
	const hasActiveActiveGeo = /actif[\s/-]*actif|g[eé]oredondan|bi-site|deux zones|multi-sites|dual[\s/-]*site|split[\s/-]*brain|2 zones/i.test(lower);
	if (context?.resolvedPattern === 'active_active_geo' || (!context?.resolvedPattern && hasActiveActiveGeo)) {
		const detectedReqs = Array.from(new Set(fullSpec.match(/\bREQ-[A-Za-z0-9_-]+\b/gi) ?? []));
		const reqTag = detectedReqs.length > 0 ? ` (${detectedReqs.slice(0, 3).join(', ')})` : '';
		return [
			'flowchart TB',
			...targetArchitectureClassDefs(),
			'',
			'    %% Ingress & Couches Radio',
			'    subgraph INGRESS["📡 Accès Radio Multi-Couches & Terminaux Tactiques"]',
			'        direction LR',
			'        RadioA["Site Radio Couche 1<br/><b>(4G / 5G Tactique)</b>"]:::radio',
			'        RadioB["Site Radio Couche 2<br/><b>(PMR / Satcom / Fibre)</b>"]:::radio',
			'        Clients["Opérateurs & Terminaux Tactiques<br/><i>(Double attachement)</i>"]:::radio',
			'    end',
			'',
			`    %% Répartition géoredondante${reqTag}`,
			`    subgraph GSLB_LAYER["🌐 Répartition Géoredondante & Routage Multiple${reqTag}"]`,
			`        GSLB["<b>Anycast BGP & GSLB / Geo-DNS</b><br/>Distribution de charge active/active & Bascule sans interruption${reqTag}"]:::routing`,
			'    end',
			'',
			'    %% Témoin de Quorum',
			'    Quorum["⚖️ Témoin de Quorum / Tie-Breaker<br/><i>(Tiers-Site / Prévention Split-Brain)</i>"]:::quorum',
			'',
			'    %% Datacenter 1',
			`    subgraph DCA["🏢 DATACENTER 1 — Zone Primaire A (Actif 50%) [Projet: ${projectId}]"]`,
			'        direction TB',
			'        subgraph DCA_APPS["Services & Applications A"]',
			'            direction LR',
			'            Core_A["⚙️ <b>Cœur Réseau A</b><br/>Session & Control Plane"]:::coreApp',
			'            MCS_A["🎙️ <b>Services Critiques A</b><br/>Voix/Vidéo Mission-Critical (MCPTT)"]:::criticalApp',
			'            OSS_A["📊 <b>OSS / Supervision A</b><br/>Monitoring & Métriques"]:::ossApp',
			'        end',
			'        DB_A[("💾 <b>Données & État A</b><br/>Base distribuée / KV Store")]:::dbApp',
			'        DCA_APPS --> DB_A',
			'    end',
			'    class DCA dcBox',
			'',
			'    %% Datacenter 2',
			`    subgraph DCB["🏢 DATACENTER 2 — Zone Primaire B (Actif 50%) [Projet: ${projectId}]"]`,
			'        direction TB',
			'        subgraph DCB_APPS["Services & Applications B"]',
			'            direction LR',
			'            Core_B["⚙️ <b>Cœur Réseau B</b><br/>Session & Control Plane"]:::coreApp',
			'            MCS_B["🎙️ <b>Services Critiques B</b><br/>Voix/Vidéo Mission-Critical (MCPTT)"]:::criticalApp',
			'            OSS_B["📊 <b>OSS / Supervision B</b><br/>Monitoring & Métriques"]:::ossApp',
			'        end',
			'        DB_B[("💾 <b>Données & État B</b><br/>Base distribuée / KV Store")]:::dbApp',
			'        DCB_APPS --> DB_B',
			'    end',
			'    class DCB dcBox',
			'',
			'    %% Flux de raccordement et distribution',
			'    Clients --> RadioA & RadioB',
			'    RadioA & RadioB ==>|"Double adduction étanche"| GSLB',
			'    GSLB ==>|"50% Trafic actif"| DCA_APPS',
			'    GSLB ==>|"50% Trafic actif"| DCB_APPS',
			'',
			'    %% Synchronisation Inter-DC',
			'    DB_A <===>|"Interconnect DCI (Fibre Noire / DWDM)<br/><b>Réplication synchrone d\'état</b>"| DB_B',
			'    Core_A <-.->|"Synchronisation des contextes de session"| Core_B',
			'    MCS_A <-.->|"Fédération voix de groupe Mission-Critical"| MCS_B',
			'',
			'    %% Quorum',
			'    DB_A -.->|"Heartbeat & Consensus"| Quorum',
			'    DB_B -.->|"Heartbeat & Consensus"| Quorum'
		].join('\n');
	}

	// Cas Pattern 2 : Survie Edge Tactique (Mode Îlotage / Isolated Island / Bulle Tactique)
	const hasEdgeSurvie = /survie|edge.*tactique|bulle tactique|isolated island|[iî]lotage|autonome.*local|mode d[eé]grad[eé]/i.test(lower);
	if (context?.resolvedPattern === 'edge_survivability' || (!context?.resolvedPattern && hasEdgeSurvie)) {
		return [
			'flowchart TB',
			...targetArchitectureClassDefs(),
			'',
			'    %% Site Central National',
			`    subgraph NATIONAL["🏢 Cœur National Central (Mode Fédéré) [Projet: ${projectId}]"]`,
			'        direction TB',
			'        Core_Nat["⚙️ Cœur 5G SA National<br/><small>(AMF / SMF / UDM)</small>"]:::coreApp',
			'        MCS_Nat["🎙️ Serveur National Critique<br/><small>(Groupes nationaux & passerelle centrale)</small>"]:::criticalApp',
			'        CMS_Nat["📋 CMS / GMS Central<br/><small>(Annuaire global & profils de sécurité)</small>"]:::coreApp',
			'    end',
			'    class NATIONAL boundary',
			'',
			'    %% Lien Backhaul Hybride',
			'    subgraph WAN_BACKHAUL["🌐 Liaison Backhaul (Fibre / Faisceau Hertzien / Satcom)"]',
			'        Backhaul["<b>Liaison Opérateur Résiliente</b><br/><i>(Sujette à coupure / brouillage tactique)</i>"]:::routing',
			'    end',
			'',
			'    %% Site Edge Tactique Projetable',
			'    subgraph TACTICAL_EDGE["🛡️ Bulle Tactique Locale / Site Edge Autonome (Survie Locale)"]',
			'        direction TB',
			'        Radio_Local["📡 Spectre Radio Local<br/><small>(gNodeB / eNodeB tactique)</small>"]:::radio',
			'        UPF_Local["⚡ UPF Locale (User Plane Function)<br/><small>(Routage local trafic voix/données)</small>"]:::coreApp',
			'        MCS_Local["🎙️ Serveur Edge Autonome<br/><small>(Groupes de parole locaux en îlotage)</small>"]:::criticalApp',
			'        Terminaux_Edge["👥 Forces d\'Intervention & Terminaux PPDR"]:::person',
			'        Radio_Local --> UPF_Local',
			'        UPF_Local --> MCS_Local',
			'        Terminaux_Edge --> Radio_Local',
			'    end',
			'    class TACTICAL_EDGE dcBox',
			'',
			'    %% Flux nominaux et mode survie',
			'    MCS_Local <==>|"1. Synchronisation nominale profils"| Backhaul',
			'    Backhaul <==>|"2. Fédération réseau national"| NATIONAL',
			'    Backhaul -.x|"⛔ RUPTURE : Déconnexion Backhaul"| MCS_Local',
			'    Terminaux_Edge ==>|"3. Survie autonome maintenue (Appels de groupe locaux PTT)"| MCS_Local'
		].join('\n');
	}

	// Cas Pattern 3 : Passerelle d'Interconnexion Hybride (LMR / TETRA / P25 <-> IWF 3GPP)
	const hasLmrInterworking = /(?:passerelle|interworking|iwf|interconnexion).*(?:lmr|tetra|pmr|p25)|(?:lmr|tetra|tetrapol|p25).*(?:vers.*(?:m[c]x|mcptt|haut-d[eé]bit)|interconnexion|passerelle.*(?:iwf|audio|radio|voix)|interworking)/i.test(lower);
	if (context?.resolvedPattern === 'lmr_interworking' || (!context?.resolvedPattern && hasLmrInterworking)) {
		return [
			'flowchart TB',
			...targetArchitectureClassDefs(),
			'',
			'    %% Réseau Historique LMR',
			'    subgraph LMR_LEGACY["📻 Réseau Radio Historique (PMR / TETRA / P25)"]',
			'        direction TB',
			'        Terminaux_LMR["Terminaux Radio TETRA"]:::person',
			'        BS_LMR["Station de Base LMR"]:::radio',
			'        Switch_LMR["Commutateur Réseau PMR<br/><small>(SwMI / Vocodeur ACELP)</small>"]:::ext',
			'        Terminaux_LMR --> BS_LMR --> Switch_LMR',
			'    end',
			'    class LMR_LEGACY boundary',
			'',
			'    %% Passerelle d\'Interconnexion IWF',
			`    subgraph IWF_GATEWAY["🌉 Passerelle d'Interconnexion Sécurisée (3GPP TS 29.314) [Projet: ${projectId}]"]`,
			'        direction TB',
			'        IWF_Ctrl["Contrôleur IWF (InterWorking Function)<br/><small>(Médiation signalisation TETRA <-> SIP)</small>"]:::coreApp',
			'        Transcoder["Passerelle Vocodeur & Média<br/><small>(Transcodage ACELP / AMR-WB)</small>"]:::agent',
			'    end',
			'    class IWF_GATEWAY dcBox',
			'',
			'    %% Système Cible Haut-Débit Mission-Critical',
			'    subgraph MCS_TARGET["🚀 Système Haut-Débit Cible (3GPP / MCPTT)"]',
			'        direction TB',
			'        MCS_Server["Serveur Mission-Critical (MCPTT / Voix Critique)"]:::criticalApp',
			'        Core_5G["Cœur Réseau 4G/5G"]:::coreApp',
			'        Terminaux_MCS["Terminaux Mobiles Critiques"]:::person',
			'        Terminaux_MCS --> Core_5G --> MCS_Server',
			'    end',
			'    class MCS_TARGET boundary',
			'',
			'    %% Flux de passerelle',
			'    Switch_LMR <==>|"Flux audio & signalisation propriétaire"| IWF_Ctrl',
			'    IWF_Ctrl <--> Transcoder',
			'    Transcoder <==>|"Flux SIP & SRTP normalisé 3GPP"| MCS_Server'
		].join('\n');
	}

	// Cas Pattern 4 : Découplage Canonique 3GPP (Inspiration openMCX: SIP Core vs App Servers vs Common Services)
	const hasMcxDecoupling = /(?:^|[^\w])(openm[c]x|m[c]x|mcptt|mcvideo|mcdata|kamailio)(?:$|[^\w])/i.test(lower);
	if (context?.resolvedPattern === 'mcx_decoupling' || (!context?.resolvedPattern && hasMcxDecoupling)) {
		return [
			'flowchart TB',
			...targetArchitectureClassDefs(),
			'',
			'    %% Clients Mission-Critical',
			'    subgraph CLIENTS["📱 Terminaux & Consoles Clients (Clients Critiques 3GPP)"]',
			'        direction LR',
			'        MCS_App["Terminaux Durcis PPDR<br/><small>(Clients Mission-Critical Android / Linux)</small>"]:::person',
			'        Dispatcher["Console de Régulation<br/><small>(Pupitre de Commandement)</small>"]:::person',
			'    end',
			'',
			`    %% Pile Serveur Découplée (3GPP Rel-19)`,
			`    subgraph MCS_STACK["🏢 Plateforme de Services Critiques 3GPP [Projet: ${projectId}]"]`,
			'        direction TB',
			'        %% 1. SIP Core',
			'        subgraph SIP_CORE["1. SIP Core Layer (Kamailio / CSCF)"]',
			'            SIP["⚡ Routage & Enregistrement SIP<br/><small>(Signalisation sessions & contrôle d\'appel)</small>"]:::coreApp',
			'        end',
			'        %% 2. Application Servers',
			'        subgraph APP_SERVERS["2. Application Servers Mission-Critical (Plans Média & Métier)"]',
			'            direction LR',
			'            MCPTT["🎙️ <b>MCPTT Server</b><br/><small>Floor Control & Group Calls</small>"]:::criticalApp',
			'            MCData["📄 <b>MCData Server</b><br/><small>SDS & Distribution de fichiers</small>"]:::criticalApp',
			'            MCVideo["🎥 <b>MCVideo Server</b><br/><small>Flux vidéo Push/Pull temps réel</small>"]:::criticalApp',
			'        end',
			'        %% 3. Common Services',
			'        subgraph COMMON_SVC["3. Common Services Core"]',
			'            direction LR',
			'            OIDC["🔑 Gestion d\'Identité (OIDC / OAuth2)"]:::core',
			'            XCAP["👥 Group Management (XCAP / CMS / GMS)"]:::core',
			'            KMS["🔐 Gestion Clés Chiffrement (KMS / LMS)"]:::core',
			'        end',
			'    end',
			'    class MCS_STACK dcBox',
			'',
			'    %% Console Admin',
			'    subgraph ADMIN["Console d\'Exploitation & Administration"]',
			'        AdminUI["Console Admin Titulaire<br/><small>(Provisioning des profils & groupes)</small>"]:::agent',
			'    end',
			'',
			'    %% Flux 3GPP normalisés',
			'    CLIENTS ==>|"1. Signalisation SIP (Enregistrement & Sessions)"| SIP',
			'    SIP -->|"2. Dispatch vers serveurs spécialisés"| MCPTT & MCData & MCVideo',
			'    CLIENTS ==>|"3. Plan Média Temps Réel (SRTP / RTCP Floor Control)"| APP_SERVERS',
			'    CLIENTS -->|"4. Authentification & Profils (OIDC / XCAP)"| COMMON_SVC',
			'    AdminUI -->|"Provisioning & Configuration"| COMMON_SVC'
		].join('\n');
	}

	// Cas Spécial Multi-Plateformes / Environnements & Qualification (ex: Socle 3 plateformes, pré-prod iso-état, test-ran)
	if (hasMultiEnv) {
		const socleScope = enterpriseName !== 'Organisation' ? enterpriseName : (projectName || 'Socle 3 Niveaux');
		const socleTitle = `Socle d'Environnements Multi-Plateformes (${socleScope}) [Projet: ${projectId}]`;

		return [
			'flowchart TB',
			...targetArchitectureClassDefs(),
			'',
			'    %% Acteurs',
			'    user_exploitant["👤 Équipe Exploitation & Ingénierie"]:::person',
			'    user_auditeur["👤 Responsable Audit & Représentativité"]:::person',
			'',
			'    %% Zone Souveraine / Opérationnelle',
			`    subgraph SOCLE["${socleTitle}"]`,
			'        direction TB',
			'        subgraph PROD_ENV["1. Plateforme de Production (PROD)"]',
			'            PROD["🏭 Production Cœur & NOC<br/><small>(État nominal actif & services critiques réels)</small>"]:::core',
			'        end',
			'        subgraph PREPROD_ENV["2. Plateforme de Pré-production (PRE-PROD)"]',
			'            PREPROD["🔄 Pré-production Unique Iso-État<br/><small>(Réplique technique exacte de la PROD, accueil état candidat)</small>"]:::core',
			'        end',
			'        subgraph TEST_ENV["3. Plateforme de Test Réduit (TEST)"]',
			'            TESTRAN["🧪 Test Réduit avec Test-RAN<br/><small>(Banc d\'essais & validation fonctionnelle radio)</small>"]:::core',
			'        end',
			'    end',
			'    class SOCLE boundary',
			'',
			'    %% Zone Fournisseurs / Équipementiers Tiers',
			'    subgraph FOURNISSEURS_ZONE["Périmètre Fournisseurs & Usine (Décentralisé)"]',
			'        direction TB',
			'        FournisseursBanc["🏢 Qualification Fournisseurs<br/><small>(Bancs d\'essais usine chez les constructeurs)</small>"]:::ext',
			'        AuditRepresentativite["🛡️ Contrôle d\'Audit & Représentativité<br/><small>(Contrôle d\'audit strict & certification des bancs)</small>"]:::agent',
			'    end',
			'    class FOURNISSEURS_ZONE boundary',
			'',
			'    %% Flux de qualification, vérification et promotion',
			'    FournisseursBanc -->|"1. Tests d\'usine & métrologie"| AuditRepresentativite',
			'    user_auditeur -->|"Audit & vérification de conformité"| AuditRepresentativite',
			'    AuditRepresentativite -->|"2. Version candidate certifiée représentative"| TESTRAN',
			'    TESTRAN -->|"3. Validation intégration fonctionnelle & radio"| PREPROD',
			'    PREPROD -->|"4. Qualification sur état candidat iso-production"| PROD',
			'    PROD -.->|"Réplication continue d\'état technique"| PREPROD',
			'    user_exploitant -->|"Exploitation & gestion état candidat"| PREPROD',
			'    user_exploitant -->|"MCO & supervision nominale"| PROD'
		].join('\n');
	}

	const systemLabel = `Système : ${projectName} (${sectionRef}) [Projet: ${projectId}]`;

	const lines: string[] = ['flowchart TB', ...targetArchitectureClassDefs(), ''];

	// 1. Acteurs
	const user0Label = `Équipe Exploitation & Ingénierie (${projectName})`;
	const user1Label = enterpriseName !== 'Organisation'
		? `Exploitants & Utilisateurs (${enterpriseName})`
		: 'Exploitants & Utilisateurs Externes';
	lines.push(`    user_0["👤 ${mmdText(user0Label)}"]:::person`);
	lines.push(`    user_1["👤 ${mmdText(user1Label)}"]:::person`);

	if (hasHumanGate || hasDeployment) {
		const humanLabel = enterpriseName !== 'Organisation'
			? `Guichet Homologation / Validation Humaine (${enterpriseName})`
			: 'Guichet Validation Humaine & Homologation';
		lines.push(`    ValideurHumain["🛡️ ${mmdText(humanLabel)}<br/><small>(Contrôle intégrité & recette)</small>"]:::human`);
		const pkgLabel = hasSignedPackages
			? (hasWapt ? 'Paquet WAPT Signé' : 'Paquet Applicatif Signé')
			: 'Paquet Applicatif Validé';
		lines.push(`    PaquetSigne["📦 ${mmdText(pkgLabel)}<br/><small>(Signature cryptographique éditeur)</small>"]:::deploy`);
	}
	lines.push('');

	// 2. Périmètre Système
	lines.push(`    subgraph SYSTEM["${mmdText(systemLabel)}"]`);
	lines.push('        direction TB');
	lines.push('        subgraph APPS["Noeuds Applicatifs & Métier"]');
	lines.push('            direction TB');
	lines.push(`            ServiceMetier["Services Critiques & Cœur Applicatif<br/><small>(Spécification ${mmdText(sectionRef)})</small>"]:::core`);
	if (hasSupervision) {
		lines.push('            AgentLocal["Agents de collecte embarqués<br/><small>(Telegraf / Node-Exporter / Fluentbit)</small>"]:::agent');
	}
	if (hasDeployment) {
		const deployAgentLabel = hasWapt ? 'Agent WAPT Client' : 'Agent Client de Déploiement';
		lines.push(`            AgentDeploy["${deployAgentLabel}<br/><small>(Exécution locale des paquets)</small>"]:::deploy`);
	}
	if (statements && statements.length > 0) {
		const activeStmts = statements.filter((s) => s.status === 'active').slice(0, 3);
		activeStmts.forEach((s, idx) => {
			lines.push(`            Param_${idx}["⚙️ ${mmdText(s.triplet.predicate)}: ${mmdText(String(s.triplet.value))}"]:::core`);
		});
	}
	lines.push('        end');

	if (lower.includes('console') || lower.includes('admin') || !hasSupervision) {
		lines.push(`        ConsoleAdmin["Console d'Exploitation & Admin Titulaire<br/><small>(Gestion locale & exploitation autonome)</small>"]:::core`);
	}
	if (hasSupervision) {
		lines.push('        MetrologieLocale["Moteur Métrologie & Stockage Local<br/><small>(Autonomie locale & TSDB)</small>"]:::core');
	}
	if (isHybrid || hasSupervision || hasLogs) {
		const exportLabel = enterpriseName !== 'Organisation'
			? `Passerelle d'Export & Connecteurs (${enterpriseName})<br/><small>(Interfaçage standardisé vers l'existant)</small>`
			: "Passerelle d'Export & Connecteurs d'Intégration<br/><small>(Interfaçage standardisé vers l'existant)</small>";
		lines.push(`        ModuleExport["${exportLabel}"]:::agent`);
	}
	lines.push('    end');
	lines.push('    class SYSTEM boundary');
	lines.push('');

	// 3. Périmètre Existant
	lines.push(`    subgraph EXTERNAL["${mmdText(externalLabel)}"]`);
	lines.push('        direction TB');
	if (hasSupervision) {
		const supLabel = enterpriseName !== 'Organisation'
			? `Supervision Externe (${enterpriseName})<br/><small>(Hyperviseur global & alerting)</small>`
			: 'Supervision Externe<br/><small>(Hyperviseur & Alerting)</small>';
		lines.push(`        SupervisionExt["${supLabel}"]:::ext`);
	}
	if (hasLogs) {
		const logsLabel = enterpriseName !== 'Organisation'
			? `Plateforme Logs (${enterpriseName})<br/><small>(SIEM / Centralisation Syslog)</small>`
			: 'Plateforme Centralisée de Logs<br/><small>(SIEM / Audit distant)</small>';
		lines.push(`        CentralLogs["${logsLabel}"]:::ext`);
	}
	if (hasDeployment) {
		const deploySrvLabel = hasWapt
			? `Dépôt & Serveur WAPT (${enterpriseName !== 'Organisation' ? enterpriseName : 'Central'})<br/><small>(Distribution paquets validés)</small>`
			: 'Serveur de Déploiement Central<br/><small>(Dépôt paquets & orchestration)</small>';
		lines.push(`        ServeurDeploy["${deploySrvLabel}"]:::ext`);
	}
	if (hasAuth) {
		const idpLabel = enterpriseName !== 'Organisation'
			? `Fournisseur d'Identité (${enterpriseName})<br/><small>(IdP / Fédération OIDC)</small>`
			: 'Fournisseur d\'Identité Externe<br/><small>(IdP / Fédération OIDC)</small>';
		lines.push(`        IdpExt["${idpLabel}"]:::ext`);
	}
	if (!hasSupervision && !hasLogs && !hasDeployment && !hasAuth) {
		lines.push('        EcosystemeExt["Services & Annuaires Existants<br/><small>(Interfaces d\'intégration)</small>"]:::ext');
	}
	lines.push('    end');
	lines.push('    class EXTERNAL boundary');
	lines.push('');

	// 4. Flux et Liaisons
	if (hasSupervision) {
		lines.push('    ServiceMetier -->|"Métriques & logs internes"| AgentLocal');
		lines.push('    AgentLocal -->|"Alimentation locale"| MetrologieLocale');
		if (lower.includes('console') || lower.includes('admin') || !hasSupervision) {
			lines.push('    MetrologieLocale -->|"Affichage temps réel"| ConsoleAdmin');
			lines.push('    user_0 -->|"Administration locale"| ConsoleAdmin');
		}
		if (isHybrid) {
			lines.push('    MetrologieLocale -->|"Consolidation flux"| ModuleExport');
			lines.push('    ModuleExport -->|"Alarmes (SNMP Trap / Webhook)"| SupervisionExt');
			lines.push('    ModuleExport -->|"Métriques de synthèse (API REST)"| SupervisionExt');
			if (hasLogs) {
				lines.push('    ModuleExport -->|"Export logs d\'audit (Syslog TLS)"| CentralLogs');
			}
			const user1Action = enterpriseName !== 'Organisation'
				? `Supervision Globale (${enterpriseName})`
				: 'Supervision & Exploitation Externe';
			lines.push(`    user_1 -->|"${user1Action}"| SupervisionExt`);
		}
	} else if (hasAuth) {
		lines.push('    user_1 -->|"Accès applicatif (HTTPS)"| ServiceMetier');
		lines.push('    ServiceMetier -->|"Fédération OIDC (Auth Code + PKCE)"| IdpExt');
		lines.push('    user_0 -->|"Gestion des accès"| ConsoleAdmin');
	} else {
		lines.push('    user_0 -->|"Administration & Configuration"| ServiceMetier');
		lines.push('    user_1 -->|"Utilisation & Consommation API"| ServiceMetier');
		lines.push('    ServiceMetier -->|"Interfaces standards"| EcosystemeExt');
	}

	if (hasDeployment) {
		lines.push('    user_0 -->|"1. Package & signature cryptographique"| PaquetSigne');
		if (hasHumanGate) {
			lines.push('    PaquetSigne -->|"2. Soumission recette / INT"| ValideurHumain');
			lines.push('    ValideurHumain -->|"3. Approbation formelle"| ServeurDeploy');
			lines.push('    ServeurDeploy -->|"4. Déploiement contrôlé (HTTPS)"| AgentDeploy');
		} else {
			lines.push('    PaquetSigne -->|"2. Dépôt central"| ServeurDeploy');
			lines.push('    ServeurDeploy -->|"3. Déploiement (HTTPS)"| AgentDeploy');
		}
		lines.push('    AgentDeploy -->|"5. Installation locale & vérification signature"| ServiceMetier');
	}

	return lines.join('\n');
}

/**
 * Génère le diagramme de séquence de la chaîne de déploiement sécurisée et d'homologation.
 * Exploite dynamiquement les énoncés, le brouillon télégraphique, les slots Phase 4,
 * les protocoles/contraintes de sécurité et les acteurs du sujet.
 */
export function generateDeploymentSequenceDiagram(
	subject: MaturitySubject | { id: string; name: string; section_ref?: string; sectionRef?: string },
	draft?: TelegraphicDraft | null,
	statements?: Statement[],
	context?: ProjectionContext
): string {
	const subjectName = subject.name || 'Système';
	const projectName = context?.projectName?.trim() || subjectName;
	const enterpriseName = context?.enterpriseName?.trim() || 'Organisation';
	const decision = context?.decision;
	const retainedOpt = context?.options?.find(
		(o) => o.id === decision?.retainedOptionId || o.title === decision?.retainedOptionTitle
	);
	const detailedSpec = context?.detailedSpecText || '';
	const fullSpec = `${projectName} ${detailedSpec} ${decision?.retainedOptionTitle || ''} ${retainedOpt?.summary || ''} ${decision?.rationale || ''}`.toLowerCase();
	const isWapt = fullSpec.includes('wapt');

	const signals = extractDeploymentSignals(subject, draft, statements, context);
	if (signals.hasContextualSignals) {
		return buildDynamicDeploymentSequence(subject, signals, context);
	}

	const tituActor = `Titulaire (${projectName})`;
	const clientActor = enterpriseName !== 'Organisation'
		? `Responsable Exploitation (${enterpriseName})`
		: 'Responsable Exploitation / RSSI';
	const serverParticipant = isWapt ? 'Serveur WAPT (Dépôt officiel)' : 'Serveur de Déploiement (Dépôt)';
	const targetParticipant = `Hôte Cible (${projectName})`;

	return [
		'sequenceDiagram',
		'    autonumber',
		`    actor Dev as ${tituActor}`,
		`    actor Valideur as ${clientActor}`,
		`    participant Srv as ${serverParticipant}`,
		`    participant Host as ${targetParticipant}`,
		'',
		'    Note over Dev,Host: Phase 1 : Construction et Signature Cryptographique',
		'    Dev->>Dev: Construction du paquet applicatif',
		'    Dev->>Dev: Signature cryptographique avec clé privée Titulaire',
		`    Dev->>Valideur: Dépôt du paquet signé en environnement d'Intégration / Recette`,
		'',
		`    Note over Valideur,Srv: Phase 2 : Porte d'Homologation (Validation Humaine)`,
		`    Valideur->>Valideur: Contrôle d'intégrité, signature & tests de non-régression (INT)`,
		'    Valideur->>Srv: Approbation formelle et publication sur le dépôt de production',
		'',
		'    Note over Srv,Host: Phase 3 : Déploiement Sécurisé & Exécution Contrôlée',
		'    Srv->>Host: Notification / Distribution du paquet validé (HTTPS)',
		'    Host->>Host: Contrôle de validité de la signature avant exécution',
		'    Host->>Host: Installation locale et mise à jour des services',
		`    Host-->>Srv: Compte-rendu d'état d'installation (Succès / Échec)`
	].join('\n');
}
