export interface CandidateRule {
	id: string;
	title: string;
	description: string;
	triggerContext: string;
	sparqlQuery: string;
	antecedents: string[];
	confidenceScore: number;
	status: 'pending' | 'approved' | 'rejected';
	suggestedBy: string;
	suggestedAt: string;
}

export const INITIAL_CANDIDATE_RULES: CandidateRule[] = [];
