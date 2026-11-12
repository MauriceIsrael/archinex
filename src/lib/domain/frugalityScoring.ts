export type FrugalityVerdict = 'no-brainer' | 'negligible-compromise' | 'acceptable-tradeoff';

export interface FrugalityOptionSummary {
	id: string;
	title: string;
	summary: string;
	costScore: number;
	techScore: number;
	overallScore: number;
}

export interface FrugalityOpportunity {
	subjectId: string;
	subjectName: string;
	sectionRef: string;
	projectId?: string;
	projectTitle?: string;
	projectBadge?: string;
	frugalOption: FrugalityOptionSummary;
	referenceOption: FrugalityOptionSummary;
	costDelta: number;
	techDelta: number;
	sweetSpotRatio: number;
	verdict: FrugalityVerdict;
	decisionStatus: 'open' | 'retained_frugal' | 'retained_reference' | 'retained_other';
	keyAdvantage: string;
	keyCompromise: string | null;
}

export interface SubjectMatrixInput {
	id: string;
	name: string;
	sectionRef: string;
	projectId?: string;
	projectTitle?: string;
	projectBadge?: string;
	options: Array<{
		id: string;
		title: string;
		summary: string;
		evaluations: Array<{
			criterionId: string;
			score: number;
			justification?: string;
		}>;
	}>;
	criteria: Array<{
		id: string;
		name: string;
		kind: string;
		weight: number;
		description?: string;
	}>;
	decision?: {
		retainedOptionId: string;
	} | null;
}

function computeWeightedScore(
	evals: Array<{ criterionId: string; score: number }>,
	crits: Array<{ id: string; weight: number }>
): number {
	let totalWeighted = 0;
	let totalWeight = 0;
	for (const c of crits) {
		const ev = evals.find((e) => e.criterionId === c.id);
		if (ev !== undefined && Number.isFinite(ev.score)) {
			const w = Math.max(1, Math.min(5, c.weight));
			totalWeighted += ev.score * w;
			totalWeight += w;
		}
	}
	return totalWeight > 0 ? Math.round((totalWeighted / totalWeight) * 100) / 100 : 0;
}

/**
 * Analyse un sujet et extrait l'opportunité de frugalité la plus marquante (si elle existe).
 * Un sujet offre une opportunité lorsque :
 *  - Une option est nettement moins coûteuse (gain de coût >= 0.5)
 *  - Le compromis technique consenti n'est pas dramatique (delta tech <= 1.0)
 */
export function extractSubjectFrugalityOpportunity(subject: SubjectMatrixInput): FrugalityOpportunity | null {
	const costCriteria = subject.criteria.filter((c) => c.kind === 'cost');
	const techCriteria = subject.criteria.filter((c) => c.kind !== 'cost');

	if (costCriteria.length === 0 || subject.options.length < 2) {
		return null;
	}

	const summaries: FrugalityOptionSummary[] = subject.options.map((opt) => ({
		id: opt.id,
		title: opt.title,
		summary: opt.summary,
		costScore: computeWeightedScore(opt.evaluations, costCriteria),
		techScore: techCriteria.length > 0 ? computeWeightedScore(opt.evaluations, techCriteria) : 0,
		overallScore: computeWeightedScore(opt.evaluations, subject.criteria)
	}));

	let bestOpportunity: FrugalityOpportunity | null = null;

	for (let i = 0; i < summaries.length; i++) {
		for (let j = 0; j < summaries.length; j++) {
			if (i === j) continue;
			const optFrugal = summaries[i];
			const optRef = summaries[j];

			const costDelta = Math.round((optFrugal.costScore - optRef.costScore) * 100) / 100;
			if (costDelta < 0.5) continue; // Pas d'avantage financier significatif

			const techDelta = Math.round((optRef.techScore - optFrugal.techScore) * 100) / 100;
			if (techDelta > 1.0) continue; // Compromis technique trop dramatique

			let verdict: FrugalityVerdict;
			let sweetSpotRatio: number;

			if (techDelta <= 0) {
				verdict = 'no-brainer';
				sweetSpotRatio = Math.round((costDelta * 2 + Math.abs(techDelta)) * 100) / 100;
			} else if (techDelta <= 0.4) {
				verdict = 'negligible-compromise';
				sweetSpotRatio = Math.round((costDelta / (techDelta + 0.2)) * 100) / 100;
			} else {
				verdict = 'acceptable-tradeoff';
				sweetSpotRatio = Math.round((costDelta / (techDelta + 0.2)) * 100) / 100;
			}

			// Justifications
			const rawFrugalOpt = subject.options.find((o) => o.id === optFrugal.id);
			const rawRefOpt = subject.options.find((o) => o.id === optRef.id);

			// Clé de gain : première justification sur un critère coût
			const costEv = rawFrugalOpt?.evaluations.find((e) =>
				costCriteria.some((c) => c.id === e.criterionId && e.score > 0)
			);
			const keyAdvantage = costEv?.justification?.trim() || optFrugal.summary || 'Option économique à coût maîtrisé.';

			// Clé de compromis : première justification sur un critère technique où ref > frugal
			let keyCompromise: string | null = null;
			if (techDelta > 0 && rawRefOpt && rawFrugalOpt) {
				const techCompromiseEv = rawFrugalOpt.evaluations.find((fe) => {
					const re = rawRefOpt.evaluations.find((e) => e.criterionId === fe.criterionId);
					return re && re.score > fe.score;
				});
				if (techCompromiseEv?.justification) {
					keyCompromise = techCompromiseEv.justification.trim();
				}
			}

			let decisionStatus: FrugalityOpportunity['decisionStatus'] = 'open';
			if (subject.decision?.retainedOptionId) {
				if (subject.decision.retainedOptionId === optFrugal.id) {
					decisionStatus = 'retained_frugal';
				} else if (subject.decision.retainedOptionId === optRef.id) {
					decisionStatus = 'retained_reference';
				} else {
					decisionStatus = 'retained_other';
				}
			}

			const candidate: FrugalityOpportunity = {
				subjectId: subject.id,
				subjectName: subject.name,
				sectionRef: subject.sectionRef,
				projectId: subject.projectId,
				projectTitle: subject.projectTitle,
				projectBadge: subject.projectBadge,
				frugalOption: optFrugal,
				referenceOption: optRef,
				costDelta,
				techDelta,
				sweetSpotRatio,
				verdict,
				decisionStatus,
				keyAdvantage,
				keyCompromise
			};

			if (!bestOpportunity || candidate.sweetSpotRatio > bestOpportunity.sweetSpotRatio) {
				bestOpportunity = candidate;
			}
		}
	}

	return bestOpportunity;
}

/**
 * Calcule le Top N des opportunités de frugalité parmi l'ensemble des sujets du projet.
 */
export function computeTopFrugalityOpportunities(
	subjects: SubjectMatrixInput[],
	limit: number = 5
): FrugalityOpportunity[] {
	const opportunities: FrugalityOpportunity[] = [];

	for (const subject of subjects) {
		const opp = extractSubjectFrugalityOpportunity(subject);
		if (opp) {
			opportunities.push(opp);
		}
	}

	opportunities.sort((a, b) => b.sweetSpotRatio - a.sweetSpotRatio);
	return opportunities.slice(0, limit);
}
