import type { Statement, ArchitectRole, StatementTriplet } from '$lib/types/epistemic';
import { computeTripletSha256 } from '$lib/validation/epistemicEnvelope';

export interface DiffSensorResult {
	hasDiff: boolean;
	previousValue?: string;
	newValue?: string;
	statement?: Statement;
}

/**
 * Capture le diff entre l'ancienne hypothèse affichée et la correction saisie en place.
 * RÈGLE ABSOLUE DU SILENCE : Si aucun diff textuel actif, aucun énoncé n'est produit.
 */
export function captureTextDiffAsStatement(params: {
	subjectId: string;
	sectionRef: string;
	originalText: string;
	editedText: string;
	authorName: string;
	role: ArchitectRole;
	antecedentId?: string;
	propertyPredicate?: string;
}): DiffSensorResult {
	const trimmedOriginal = params.originalText.trim();
	const trimmedEdited = params.editedText.trim();

	// RÈGLE ABSOLUE DU SILENCE : Le silence ou l'absence de modification n'est pas une approbation
	if (!trimmedEdited || trimmedEdited === trimmedOriginal) {
		return { hasDiff: false };
	}

	const triplet: StatementTriplet = {
		subject: params.subjectId,
		predicate: params.propertyPredicate || 'amended_hypothesis',
		value: trimmedEdited
	};

	const sha = computeTripletSha256(triplet);
	const statementId = `STMT-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

	const statement: Statement = {
		id: statementId,
		section: params.sectionRef,
		triplet,
		justification: {
			basedOn: params.antecedentId ? [params.antecedentId] : [],
			appliedRule: 'human_diff_rectification'
		},
		authority: {
			author: params.authorName,
			role: params.role,
			productionMode: 'human-authored'
		},
		maturity: {
			subjectLevel: 'L2_decomposed',
			confidence: 'designed'
		},
		revisability: {
			antecedents: params.antecedentId ? [params.antecedentId] : [],
			consequencesIfInvalidated: `Rectification humaine de '${trimmedOriginal}' vers '${trimmedEdited}'`
		},
		status: 'active',
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	};

	return {
		hasDiff: true,
		previousValue: trimmedOriginal,
		newValue: trimmedEdited,
		statement
	};
}

/**
 * Consigne une décision formelle de contestation ou de rejet d'une variante divergente.
 */
export function createVariantExclusionStatement(params: {
	subjectId: string;
	sectionRef: string;
	variantTitle: string;
	rejectionReason: string;
	authorName: string;
	role: ArchitectRole;
}): Statement {
	const triplet: StatementTriplet = {
		subject: params.subjectId,
		predicate: 'excludes_variant',
		value: `${params.variantTitle} :: ${params.rejectionReason.trim()}`
	};

	const statementId = `EXCL-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

	return {
		id: statementId,
		section: params.sectionRef,
		triplet,
		justification: {
			basedOn: [],
			appliedRule: 'variant_rejection_arbitration'
		},
		authority: {
			author: params.authorName,
			role: params.role,
			productionMode: 'human-authored'
		},
		maturity: {
			subjectLevel: 'L2_decomposed',
			confidence: 'designed'
		},
		revisability: {
			antecedents: [],
			consequencesIfInvalidated: `Rejet explicite de variante : ${params.variantTitle}`
		},
		status: 'active',
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	};
}

/**
 * Consigne une proposition d'alternative libre / variante innovante par un expert.
 */
export function createCustomVariantProposalStatement(params: {
	subjectId: string;
	sectionRef: string;
	variantTitle: string;
	costDelta: string;
	tradeOff: string;
	authorName: string;
	role: ArchitectRole;
}): Statement {
	const triplet: StatementTriplet = {
		subject: params.subjectId,
		predicate: 'proposes_innovative_variant',
		value: `${params.variantTitle.trim()} (${params.costDelta.trim()}) :: ${params.tradeOff.trim()}`
	};

	const statementId = `VAR-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

	return {
		id: statementId,
		section: params.sectionRef,
		triplet,
		justification: {
			basedOn: [],
			appliedRule: 'expert_free_alternative_proposal'
		},
		authority: {
			author: params.authorName,
			role: params.role,
			productionMode: 'human-authored'
		},
		maturity: {
			subjectLevel: 'L2_decomposed',
			confidence: 'designed'
		},
		revisability: {
			antecedents: [],
			consequencesIfInvalidated: `Proposition libre d'alternative technique ${params.variantTitle}`
		},
		status: 'active',
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	};
}

