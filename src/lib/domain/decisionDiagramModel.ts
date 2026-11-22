/**
 * Modèle de décision intermédiaire unique pour la génération déterministe de schémas (Issue #404 / Épique #400).
 *
 * Toutes les vues (Mermaid, C4X, Structurizr DSL, Graphe d'impact) dérivent de CE modèle unique :
 * 1. Provenance obligatoire sur chaque entité et chaque relation (`sourceKind`, `sourceId`, `sourceLabel`).
 *    Tout élément sans source est refusé par `validateDiagramProvenance` (ou doit être explicitement marqué `hypothesis`).
 * 2. Empreinte cryptographique déterministe (`fingerprint` et `sourceFingerprint`) : toute modification
 *    d'une décision ou d'une exigence modifie l'empreinte et les schémas dérivés (dérive documentaire = 0).
 * 3. Validation syntaxique automatique des sorties (Mermaid, Structurizr DSL, C4X) utilisable en CI.
 */

import { canonicalJson } from './canonicalJson';
import { universalSha256 } from '$lib/validation/epistemicEnvelope';
import type { ImpactGraphData, GraphNode, GraphEdge } from './impactGraph';

export type ProvenanceSourceKind =
	| 'requirement'
	| 'statement'
	| 'clause'
	| 'decision'
	| 'option'
	| 'hypothesis';

export interface ElementProvenance {
	sourceKind: ProvenanceSourceKind;
	sourceId: string;
	sourceLabel: string;
	/** Explicite : true uniquement si l'élément n'a pas encore de source ratifiée et est assumé comme hypothèse. */
	isHypothesis: boolean;
}

export type DiagramEntityKind =
	| 'requirement'
	| 'decision'
	| 'option'
	| 'component'
	| 'kb_constraint'
	| 'nautobot_object';

export interface DiagramEntity {
	id: string;
	kind: DiagramEntityKind;
	label: string;
	description?: string;
	group?: string;
	status?: 'retained' | 'rejected' | 'compliant' | 'violated' | 'unverified' | 'planned' | 'active';
	provenance: ElementProvenance;
}

export type DiagramRelationKind =
	| 'satisfies'
	| 'decides'
	| 'rejects'
	| 'constrains'
	| 'deploys_to'
	| 'impacts'
	| 'flows_to';

export interface DiagramRelation {
	id: string;
	from: string;
	to: string;
	kind: DiagramRelationKind;
	label: string;
	provenance: ElementProvenance;
}

export interface DiagramJustification {
	id: string;
	targetId: string;
	text: string;
	provenance: ElementProvenance;
}

export interface DecisionDiagramModel {
	schemaVersion: '1.0';
	subjectId: string;
	subjectTitle: string;
	sectionRef: string;
	entities: DiagramEntity[];
	relations: DiagramRelation[];
	justifications: DiagramJustification[];
	/** Empreinte canonique des données sources ayant produit le modèle. */
	sourceFingerprint: string;
	/** Empreinte canonique du modèle complet (entités + relations + justifications). */
	modelFingerprint: string;
}

export interface DecisionDiagramInput {
	subjectId: string;
	subjectTitle: string;
	sectionRef?: string;
	requirements?: Array<{
		id: string;
		clauseRef?: string;
		title: string;
		criticality?: string;
	}>;
	options?: Array<{
		id: string;
		title: string;
		description?: string;
	}>;
	decision?: {
		id: string;
		retainedOptionId: string;
		rationale: string;
		rejected?: Array<{ optionId: string; reason: string }>;
	} | null;
	kbConstraints?: Array<{
		id: string;
		title: string;
		verdict: 'conforme' | 'viole' | 'inconnu' | 'non_verifie';
		clauseRef?: string;
	}>;
	components?: Array<{
		id: string;
		name: string;
		role?: string;
		zone?: string;
		sourceId?: string;
		sourceKind?: ProvenanceSourceKind;
	}>;
	flows?: Array<{
		fromComponentId: string;
		toComponentId: string;
		label: string;
		sourceId?: string;
		sourceKind?: ProvenanceSourceKind;
	}>;
	plannedObjects?: Array<{
		id: string;
		kind: string;
		label: string;
	}>;
}

function safeId(raw: string): string {
	const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '');
	return cleaned ? (/^[0-9]/.test(cleaned) ? `n_${cleaned}` : cleaned) : 'node';
}

function escapeMermaidLabel(s: string): string {
	return s.replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim();
}

function escapeDsl(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Construit le modèle de décision intermédiaire unique à partir des données structurées.
 * Déterministe : mêmes entrées → même modèle et mêmes empreintes SHA-256.
 */
export function buildDecisionDiagramModel(input: DecisionDiagramInput): DecisionDiagramModel {
	const entities: DiagramEntity[] = [];
	const relations: DiagramRelation[] = [];
	const justifications: DiagramJustification[] = [];

	const sourceFingerprint = `sha256:${universalSha256(canonicalJson(input))}`;

	// 1. Exigences sources
	for (const req of input.requirements ?? []) {
		const entId = safeId(`req_${req.id}`);
		entities.push({
			id: entId,
			kind: 'requirement',
			label: `${req.clauseRef || req.id}: ${req.title}`,
			group: 'Exigences',
			status: 'active',
			provenance: {
				sourceKind: 'requirement',
				sourceId: req.id,
				sourceLabel: req.clauseRef || req.id,
				isHypothesis: false
			}
		});
	}

	// 2. Options & Décision
	const retainedOptionId = input.decision?.retainedOptionId ?? null;
	const decisionEntityId = input.decision ? safeId(`dec_${input.decision.id}`) : null;

	if (input.decision && decisionEntityId) {
		const decProv: ElementProvenance = {
			sourceKind: 'decision',
			sourceId: input.decision.id,
			sourceLabel: `Décision ${input.decision.id}`,
			isHypothesis: false
		};
		entities.push({
			id: decisionEntityId,
			kind: 'decision',
			label: `Arbitrage : ${input.subjectTitle}`,
			description: input.decision.rationale,
			group: 'Décision',
			status: 'retained',
			provenance: decProv
		});
		justifications.push({
			id: safeId(`just_${input.decision.id}`),
			targetId: decisionEntityId,
			text: input.decision.rationale,
			provenance: decProv
		});
	}

	for (const opt of input.options ?? []) {
		const optId = safeId(`opt_${opt.id}`);
		const isRetained = opt.id === retainedOptionId;
		const optProv: ElementProvenance = {
			sourceKind: 'option',
			sourceId: opt.id,
			sourceLabel: opt.title,
			isHypothesis: false
		};
		entities.push({
			id: optId,
			kind: 'option',
			label: opt.title,
			description: opt.description,
			group: 'Options',
			status: isRetained ? 'retained' : retainedOptionId ? 'rejected' : 'active',
			provenance: optProv
		});

		if (decisionEntityId && input.decision) {
			const rejReason = input.decision.rejected?.find((r) => r.optionId === opt.id)?.reason;
			relations.push({
				id: safeId(`rel_${decisionEntityId}_${optId}`),
				from: decisionEntityId,
				to: optId,
				kind: isRetained ? 'decides' : 'rejects',
				label: isRetained ? 'Retient' : rejReason ? `Écarte (${rejReason.slice(0, 40)})` : 'Écarte',
				provenance: {
					sourceKind: 'decision',
					sourceId: input.decision.id,
					sourceLabel: `Décision ${input.decision.id}`,
					isHypothesis: false
				}
			});
		}

		// Lier exigences -> option retenue (ou décision)
		if (isRetained) {
			for (const req of input.requirements ?? []) {
				const reqEntId = safeId(`req_${req.id}`);
				relations.push({
					id: safeId(`rel_${optId}_sat_${reqEntId}`),
					from: optId,
					to: reqEntId,
					kind: 'satisfies',
					label: 'Couvre',
					provenance: {
						sourceKind: 'requirement',
						sourceId: req.id,
						sourceLabel: req.clauseRef || req.id,
						isHypothesis: false
					}
				});
			}
		}
	}

	// 3. Contraintes KB
	for (const kb of input.kbConstraints ?? []) {
		const kbId = safeId(`kb_${kb.id}`);
		const status =
			kb.verdict === 'conforme'
				? 'compliant'
				: kb.verdict === 'viole'
					? 'violated'
					: 'unverified';
		const kbProv: ElementProvenance = {
			sourceKind: 'clause',
			sourceId: kb.clauseRef || kb.id,
			sourceLabel: kb.title,
			isHypothesis: false
		};
		entities.push({
			id: kbId,
			kind: 'kb_constraint',
			label: `${kb.title} [${kb.verdict}]`,
			group: 'Contraintes KB',
			status,
			provenance: kbProv
		});

		const targetId = decisionEntityId || (retainedOptionId ? safeId(`opt_${retainedOptionId}`) : null);
		if (targetId) {
			relations.push({
				id: safeId(`rel_${kbId}_${targetId}`),
				from: kbId,
				to: targetId,
				kind: 'constrains',
				label: kb.verdict === 'viole' ? 'Viole' : kb.verdict === 'conforme' ? 'Valide' : kb.verdict,
				provenance: kbProv
			});
		}
	}

	// 4. Composants logiques dérivés de la décision (sans aucun scénario codé en dur)
	const componentIds = new Map<string, string>();
	for (const comp of input.components ?? []) {
		const cid = safeId(`cmp_${comp.id}`);
		componentIds.set(comp.id, cid);
		const hasExplicitSource = Boolean(comp.sourceId && comp.sourceKind && comp.sourceKind !== 'hypothesis');
		const fallbackDecisionId = input.decision?.id;
		const prov: ElementProvenance = hasExplicitSource
			? {
					sourceKind: comp.sourceKind!,
					sourceId: comp.sourceId!,
					sourceLabel: comp.name,
					isHypothesis: false
				}
			: fallbackDecisionId
				? {
						sourceKind: 'decision',
						sourceId: fallbackDecisionId,
						sourceLabel: `Décision ${fallbackDecisionId}`,
						isHypothesis: false
					}
				: {
						sourceKind: 'hypothesis',
						sourceId: `hyp_${comp.id}`,
						sourceLabel: `Hypothèse : ${comp.name}`,
						isHypothesis: true
					};

		entities.push({
			id: cid,
			kind: 'component',
			label: comp.role ? `${comp.name} (${comp.role})` : comp.name,
			group: comp.zone || 'Architecture',
			status: 'active',
			provenance: prov
		});

		if (retainedOptionId) {
			relations.push({
				id: safeId(`rel_opt_${retainedOptionId}_${cid}`),
				from: safeId(`opt_${retainedOptionId}`),
				to: cid,
				kind: 'impacts',
				label: 'Instancie',
				provenance: prov
			});
		}
	}

	for (const flow of input.flows ?? []) {
		const fromId = componentIds.get(flow.fromComponentId);
		const toId = componentIds.get(flow.toComponentId);
		if (!fromId || !toId) continue;
		const hasExplicitSource = Boolean(flow.sourceId && flow.sourceKind && flow.sourceKind !== 'hypothesis');
		const prov: ElementProvenance = hasExplicitSource
			? {
					sourceKind: flow.sourceKind!,
					sourceId: flow.sourceId!,
					sourceLabel: flow.label,
					isHypothesis: false
				}
			: input.decision?.id
				? {
						sourceKind: 'decision',
						sourceId: input.decision.id,
						sourceLabel: `Décision ${input.decision.id}`,
						isHypothesis: false
					}
				: {
						sourceKind: 'hypothesis',
						sourceId: `hyp_flow_${fromId}_${toId}`,
						sourceLabel: `Hypothèse : ${flow.label}`,
						isHypothesis: true
					};

		relations.push({
			id: safeId(`flow_${fromId}_${toId}_${flow.label.slice(0, 12)}`),
			from: fromId,
			to: toId,
			kind: 'flows_to',
			label: flow.label,
			provenance: prov
		});
	}

	// 5. Objets planifiés Nautobot
	for (const nb of input.plannedObjects ?? []) {
		const nbId = safeId(`nb_${nb.id}`);
		const nbProv: ElementProvenance = input.decision?.id
			? {
					sourceKind: 'decision',
					sourceId: input.decision.id,
					sourceLabel: `Plan Nautobot (${nb.kind}:${nb.label})`,
					isHypothesis: false
				}
			: {
					sourceKind: 'hypothesis',
					sourceId: `hyp_nb_${nb.id}`,
					sourceLabel: `Hypothèse Nautobot : ${nb.label}`,
					isHypothesis: true
				};
		entities.push({
			id: nbId,
			kind: 'nautobot_object',
			label: `${nb.kind}: ${nb.label}`,
			group: 'Plan Nautobot',
			status: 'planned',
			provenance: nbProv
		});
		if (decisionEntityId) {
			relations.push({
				id: safeId(`rel_${decisionEntityId}_${nbId}`),
				from: decisionEntityId,
				to: nbId,
				kind: 'deploys_to',
				label: 'Planifie',
				provenance: nbProv
			});
		}
	}

	const corePayload = {
		schemaVersion: '1.0' as const,
		subjectId: input.subjectId,
		subjectTitle: input.subjectTitle,
		sectionRef: input.sectionRef || input.subjectId,
		entities,
		relations,
		justifications,
		sourceFingerprint
	};
	const modelFingerprint = `sha256:${universalSha256(canonicalJson(corePayload))}`;

	return {
		...corePayload,
		modelFingerprint
	};
}

/**
 * Valide que chaque entité et relation du modèle possède une provenance non vide.
 */
export function validateDiagramProvenance(model: DecisionDiagramModel): {
	valid: boolean;
	errors: string[];
	hypothesesCount: number;
} {
	const errors: string[] = [];
	let hypothesesCount = 0;

	for (const ent of model.entities) {
		if (!ent.provenance || !ent.provenance.sourceId?.trim() || !ent.provenance.sourceKind) {
			errors.push(`Entité sans provenance : ${ent.id}`);
		} else if (ent.provenance.isHypothesis || ent.provenance.sourceKind === 'hypothesis') {
			hypothesesCount += 1;
		}
	}
	for (const rel of model.relations) {
		if (!rel.provenance || !rel.provenance.sourceId?.trim() || !rel.provenance.sourceKind) {
			errors.push(`Relation sans provenance : ${rel.id} (${rel.from} -> ${rel.to})`);
		} else if (rel.provenance.isHypothesis || rel.provenance.sourceKind === 'hypothesis') {
			hypothesesCount += 1;
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		hypothesesCount
	};
}

/**
 * Vérifie qu'un modèle de schéma correspond toujours aux données sources (dérive documentaire = 0).
 */
export function verifyDiagramFreshness(
	model: DecisionDiagramModel,
	currentInput: DecisionDiagramInput
): { fresh: boolean; expectedFingerprint: string; actualFingerprint: string } {
	const recomputed = buildDecisionDiagramModel(currentInput);
	return {
		fresh: model.modelFingerprint === recomputed.modelFingerprint,
		expectedFingerprint: recomputed.modelFingerprint,
		actualFingerprint: model.modelFingerprint
	};
}

/**
 * Projection Mermaid dérivée du modèle unique, avec liens cliquables vers chaque source et empreinte.
 */
export function projectDecisionModelToMermaid(model: DecisionDiagramModel): string {
	const lines: string[] = [
		'flowchart TB',
		`    %% modelFingerprint:${model.modelFingerprint}`,
		`    %% sourceFingerprint:${model.sourceFingerprint}`,
		'    classDef req fill:#f8fafc,stroke:#64748b,color:#0f172a',
		'    classDef dec fill:#ecfdf5,stroke:#059669,color:#065f46,stroke-width:2px',
		'    classDef opt fill:#eff6ff,stroke:#3b82f6,color:#1e3a8a',
		'    classDef kb fill:#fffbeb,stroke:#d97706,color:#92400e',
		'    classDef cmp fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95',
		'    classDef nb fill:#f0fdfa,stroke:#0d9488,color:#115e59',
		'    classDef hyp fill:#fef2f2,stroke:#ef4444,stroke-dasharray: 4 2,color:#991b1b',
		''
	];

	const classFor = (ent: DiagramEntity): string => {
		if (ent.provenance.isHypothesis) return 'hyp';
		if (ent.kind === 'requirement') return 'req';
		if (ent.kind === 'decision') return 'dec';
		if (ent.kind === 'option') return 'opt';
		if (ent.kind === 'kb_constraint') return 'kb';
		if (ent.kind === 'nautobot_object') return 'nb';
		return 'cmp';
	};

	// Regrouper par groupe logique
	const byGroup = new Map<string, DiagramEntity[]>();
	for (const ent of model.entities) {
		const g = ent.group || 'Architecture';
		const list = byGroup.get(g) ?? [];
		list.push(ent);
		byGroup.set(g, list);
	}

	let sgIndex = 0;
	for (const [groupName, ents] of byGroup.entries()) {
		sgIndex += 1;
		const sgId = `SG_${sgIndex}_${safeId(groupName)}`;
		lines.push(`    subgraph ${sgId}["${escapeMermaidLabel(groupName)}"]`);
		lines.push('        direction TB');
		for (const ent of ents) {
			const hypSuffix = ent.provenance.isHypothesis ? ' [HYPOTHÈSE]' : '';
			const label = escapeMermaidLabel(`${ent.label}${hypSuffix}`);
			lines.push(`        ${ent.id}["${label}"]:::${classFor(ent)}`);
		}
		lines.push('    end');
		lines.push('');
	}

	for (const rel of model.relations) {
		const arrow = rel.kind === 'rejects' ? '-.->' : rel.kind === 'decides' ? '==>' : '-->';
		lines.push(`    ${rel.from} ${arrow}|"${escapeMermaidLabel(rel.label)}"| ${rel.to}`);
	}

	lines.push('');
	lines.push('    %% Provenance cliquable par élément');
	for (const ent of model.entities) {
		const targetHref = `#source/${encodeURIComponent(ent.provenance.sourceKind)}/${encodeURIComponent(ent.provenance.sourceId)}`;
		const tooltip = escapeMermaidLabel(`Source (${ent.provenance.sourceKind}): ${ent.provenance.sourceLabel}`);
		lines.push(`    click ${ent.id} "${targetHref}" "${tooltip}"`);
	}

	return lines.join('\n');
}

/**
 * Projection Structurizr DSL dérivée du modèle unique.
 */
export function projectDecisionModelToStructurizr(model: DecisionDiagramModel): string {
	const lines: string[] = [
		`workspace "${escapeDsl(model.subjectTitle)}" "Empreinte ${model.modelFingerprint}" {`,
		'    model {'
	];

	for (const ent of model.entities) {
		const desc = escapeDsl(
			`${ent.description || ent.kind} [source:${ent.provenance.sourceKind}:${ent.provenance.sourceId}]`
		);
		lines.push(`        ${ent.id} = softwareSystem "${escapeDsl(ent.label)}" "${desc}"`);
	}

	lines.push('');
	for (const rel of model.relations) {
		lines.push(
			`        ${rel.from} -> ${rel.to} "${escapeDsl(rel.label)} [source:${rel.provenance.sourceId}]"`
		);
	}

	lines.push('    }');
	lines.push('    views {');
	lines.push('        systemLandscape "SystemLandscape" {');
	lines.push('            include *');
	lines.push('            autoLayout');
	lines.push('        }');
	lines.push('    }');
	lines.push('}');

	return lines.join('\n');
}

/**
 * Projection C4X DSL dérivée du modèle unique.
 */
export function projectDecisionModelToC4x(model: DecisionDiagramModel): string {
	const lines: string[] = [
		'%% c4x',
		`%% modelFingerprint:${model.modelFingerprint}`,
		`title "${escapeDsl(model.subjectTitle)}"`,
		''
	];

	for (const ent of model.entities) {
		lines.push(
			`element ${ent.id} "${escapeDsl(ent.label)}" kind="${ent.kind}" source="${ent.provenance.sourceKind}:${escapeDsl(ent.provenance.sourceId)}"`
		);
	}
	lines.push('');
	for (const rel of model.relations) {
		lines.push(
			`rel ${rel.from} -> ${rel.to} "${escapeDsl(rel.label)}" source="${rel.provenance.sourceKind}:${escapeDsl(rel.provenance.sourceId)}"`
		);
	}
	return lines.join('\n');
}

/**
 * Projection Graphe d'impact dérivée du modèle unique.
 */
export function projectDecisionModelToImpactGraph(model: DecisionDiagramModel): ImpactGraphData {
	const nodes: GraphNode[] = model.entities.map((ent) => {
		const type: GraphNode['type'] =
			ent.kind === 'requirement'
				? 'requirement'
				: ent.kind === 'kb_constraint'
					? 'compliance'
					: ent.kind === 'decision'
						? 'decision'
						: 'option';
		const status: GraphNode['status'] =
			ent.status === 'violated'
				? 'violated'
				: ent.status === 'retained'
					? 'retained'
					: ent.status === 'compliant'
						? 'compliant'
						: ent.status === 'unverified'
							? 'degraded'
							: 'active';
		return {
			id: ent.id,
			type,
			label: ent.label,
			description: ent.description || ent.provenance.sourceLabel,
			status,
			metadata: {
				cause: `${ent.provenance.sourceKind}:${ent.provenance.sourceId}`
			}
		};
	});

	const edges: GraphEdge[] = model.relations.map((rel) => ({
		from: rel.from,
		to: rel.to,
		type:
			rel.kind === 'satisfies'
				? 'satisfies'
				: rel.kind === 'constrains'
					? 'enforces'
					: rel.kind === 'rejects'
						? 'tradeoff_degrades'
						: 'based_on',
		label: rel.label,
		active: true,
		cause: `${rel.provenance.sourceKind}:${rel.provenance.sourceId}`
	}));

	return {
		nodes,
		edges,
		meta: {
			subjectId: model.subjectId,
			subjectName: model.subjectTitle,
			sectionRef: model.sectionRef,
			source: 'deterministic'
		}
	};
}

/**
 * Validateur syntaxique Mermaid (utilisable en CI sans navigateur).
 */
export function validateMermaidSyntax(source: string): { valid: boolean; errors: string[] } {
	const errors: string[] = [];
	const trimmed = source.trim();
	if (!trimmed) {
		return { valid: false, errors: ['Diagramme Mermaid vide.'] };
	}

	const firstLine = trimmed.split(/\r?\n/)[0].trim();
	if (!/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|C4Context|C4Container)\b/.test(firstLine)) {
		errors.push(`En-tête Mermaid invalide : "${firstLine}".`);
	}

	let subgraphDepth = 0;
	const lines = trimmed.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line || line.startsWith('%%')) continue;
		if (/^subgraph\b/.test(line)) subgraphDepth += 1;
		else if (line === 'end') subgraphDepth -= 1;
		if (subgraphDepth < 0) {
			errors.push(`"end" inattendu à la ligne ${i + 1}.`);
			break;
		}
		const quoteCount = (line.match(/"/g) ?? []).length;
		if (quoteCount % 2 !== 0) {
			errors.push(`Guillemets non équilibrés à la ligne ${i + 1}.`);
		}
	}
	if (subgraphDepth > 0) {
		errors.push(`${subgraphDepth} bloc(s) subgraph non fermé(s).`);
	}

	return { valid: errors.length === 0, errors };
}

/**
 * Validateur syntaxique Structurizr DSL (utilisable en CI).
 */
export function validateStructurizrDslSyntax(source: string): { valid: boolean; errors: string[] } {
	const errors: string[] = [];
	const trimmed = source.trim();
	if (!trimmed.startsWith('workspace ')) {
		errors.push('Le DSL Structurizr doit commencer par "workspace".');
	}
	if (!/\bmodel\s*\{/.test(trimmed)) {
		errors.push('Bloc "model { ... }" manquant dans le DSL Structurizr.');
	}
	if (!/\bviews\s*\{/.test(trimmed)) {
		errors.push('Bloc "views { ... }" manquant dans le DSL Structurizr.');
	}
	let depth = 0;
	for (const ch of trimmed) {
		if (ch === '{') depth += 1;
		else if (ch === '}') depth -= 1;
		if (depth < 0) {
			errors.push('Accolade fermante "}" inattendue.');
			break;
		}
	}
	if (depth !== 0) {
		errors.push(`Accolades non équilibrées (profondeur finale : ${depth}).`);
	}
	return { valid: errors.length === 0, errors };
}

/**
 * Validateur syntaxique C4X DSL (utilisable en CI).
 */
export function validateC4xDslSyntax(source: string): { valid: boolean; errors: string[] } {
	const errors: string[] = [];
	const trimmed = source.trim();
	if (!trimmed.includes('%% c4x')) {
		errors.push('En-tête "%% c4x" manquant.');
	}
	if (!/\belement\s+\w+/.test(trimmed)) {
		errors.push('Au moins une déclaration "element" est attendue dans le DSL C4X.');
	}
	return { valid: errors.length === 0, errors };
}
