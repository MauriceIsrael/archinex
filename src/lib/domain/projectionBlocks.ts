import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { Statement } from '$lib/types/epistemic';
import { badgeOf, type EpistemicBadge } from '$lib/domain/epistemicBadge';
import {
	matchReferenceBuildingBlock,
	resolveTogafDomain,
	TOGAF_DOMAINS,
	TOGAF_DOMAIN_ORDER,
	type TogafDomainId
} from '$lib/domain/edp/togafTaxonomy';

export interface ProjectionBlockItem {
	statement: Statement;
	index: number;
	badge: EpistemicBadge;
	componentName: string;
}

export interface ProjectionBlock {
	axisId: string;
	safeId: string;
	label: string;
	togafRef?: string;
	components: string[];
	items: ProjectionBlockItem[];
	requirementRefs: string[];
	settledCount: number;
	unsettledCount: number;
}

export interface ProjectionRequirementTrace {
	clauseRef: string;
	safeId: string;
	title: string;
	targetAxisId: string | null;
}

export interface ProjectionBlockGraph {
	blocks: ProjectionBlock[];
	requirements: ProjectionRequirementTrace[];
	statementAxis: Map<string, string>;
}

const GENERAL_AXIS_ID = 'general';
const GENERAL_AXIS_LABEL = 'Socle & Paramètres Transverse';
const GENERAL_COMPONENT_NAME = 'Composants Transverses';

const toSafeId = (raw: string): string =>
	raw.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'block';

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length >= 4);
}

/**
 * Résout dynamiquement l'axe fonctionnel TOGAF et le composant logique d'un énoncé
 * à partir de la taxonomie unifiée (zéro couplage à un projet ou sujet particulier).
 */
export function resolveStatementAxis(stmt: Statement): {
	axisId: string;
	label: string;
	togafRef?: string;
	componentName: string;
} {
	const searchText = [
		stmt.triplet.predicate,
		String(stmt.triplet.value),
		stmt.justification.appliedRule ?? ''
	]
		.join(' ')
		.trim();

	const matchedBlock = matchReferenceBuildingBlock(searchText);
	if (matchedBlock) {
		const domain = TOGAF_DOMAINS[matchedBlock.togafDomain];
		return {
			axisId: matchedBlock.togafDomain,
			label: domain.shortLabel,
			togafRef: domain.togafReference,
			componentName: matchedBlock.logicalComponentName || matchedBlock.title
		};
	}

	const hint = stmt.justification.appliedRule || '';
	if (hint) {
		const domainId = resolveTogafDomain(hint);
		if (domainId !== 'operations-observability' || /ops|observ|supervis|monit|siem|pra|pca/i.test(hint)) {
			const domain = TOGAF_DOMAINS[domainId];
			return {
				axisId: domainId,
				label: domain.shortLabel,
				togafRef: domain.togafReference,
				componentName: domain.label
			};
		}
	}

	return {
		axisId: GENERAL_AXIS_ID,
		label: GENERAL_AXIS_LABEL,
		componentName: GENERAL_COMPONENT_NAME
	};
}

/**
 * Regroupe les énoncés actifs d'une section en blocs fonctionnels / axes TOGAF
 * et associe les exigences couvertes au bloc le plus pertinent.
 */
export function buildProjectionBlockGraph(
	_subject: Pick<MaturitySubject, 'id' | 'name' | 'section_ref'>,
	shown: Statement[],
	conflictIds: Set<string>,
	requirements?: Array<{ clauseRef: string; title: string }>
): ProjectionBlockGraph {
	const byAxis = new Map<string, ProjectionBlock>();
	const statementAxis = new Map<string, string>();

	shown.forEach((stmt, index) => {
		const resolved = resolveStatementAxis(stmt);
		const badge = badgeOf(stmt, conflictIds.has(stmt.id));
		statementAxis.set(stmt.id, resolved.axisId);

		let block = byAxis.get(resolved.axisId);
		if (!block) {
			block = {
				axisId: resolved.axisId,
				safeId: toSafeId(resolved.axisId),
				label: resolved.label,
				togafRef: resolved.togafRef,
				components: [],
				items: [],
				requirementRefs: [],
				settledCount: 0,
				unsettledCount: 0
			};
			byAxis.set(resolved.axisId, block);
		}

		if (!block.components.includes(resolved.componentName)) {
			block.components.push(resolved.componentName);
		}
		block.items.push({ statement: stmt, index, badge, componentName: resolved.componentName });
		if (badge.settled) block.settledCount += 1;
		else block.unsettledCount += 1;
	});

	const orderedAxisIds: string[] = [
		...TOGAF_DOMAIN_ORDER.filter((id: TogafDomainId) => byAxis.has(id)),
		...(byAxis.has(GENERAL_AXIS_ID) ? [GENERAL_AXIS_ID] : [])
	];
	const blocks = orderedAxisIds.map((id) => byAxis.get(id)!);

	const reqTraces: ProjectionRequirementTrace[] = [];
	const seenReqIds = new Set<string>();

	for (const req of requirements ?? []) {
		let baseSafe = toSafeId(req.clauseRef);
		let reqSafeId = baseSafe;
		for (let n = 2; seenReqIds.has(reqSafeId); n++) reqSafeId = `${baseSafe}_${n}`;
		seenReqIds.add(reqSafeId);

		let targetAxisId: string | null = null;
		const matchedBlock = matchReferenceBuildingBlock(`${req.clauseRef} ${req.title}`);
		if (matchedBlock && byAxis.has(matchedBlock.togafDomain)) {
			targetAxisId = matchedBlock.togafDomain;
		} else if (blocks.length > 0) {
			const reqTokens = new Set(tokenize(req.title));
			let bestScore = 0;
			for (const b of blocks) {
				let score = 0;
				for (const item of b.items) {
					const itemTokens = tokenize(`${item.statement.triplet.predicate} ${String(item.statement.triplet.value)}`);
					for (const t of itemTokens) {
						if (reqTokens.has(t)) score += 1;
					}
				}
				if (score > bestScore) {
					bestScore = score;
					targetAxisId = b.axisId;
				}
			}
		}

		if (targetAxisId) {
			byAxis.get(targetAxisId)?.requirementRefs.push(req.clauseRef);
		}

		reqTraces.push({
			clauseRef: req.clauseRef,
			safeId: reqSafeId,
			title: req.title,
			targetAxisId
		});
	}

	return { blocks, requirements: reqTraces, statementAxis };
}
