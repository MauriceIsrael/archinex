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

export const INITIAL_CANDIDATE_RULES: CandidateRule[] = [
	{
		id: 'RULE-CAND-001',
		title: 'Exigence Holdover ≥ 30j sur Tranche MCX Critique',
		description: 'Si un site est classé MCX Priorité 1, alors imposer une autonomie temporelle locale (Holdover) ≥ 30 jours avec double oscillateur Rubidium secouru.',
		triggerContext: 'Induit suite à la résolution concordante des sections §4.2 (Synchronisation Réseau) et §3.1 (Résilience Datacenter).',
		sparqlQuery: `PREFIX arch: <http://archinex.internal/ontology#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

CONSTRUCT {
  ?site arch:requiresHoldover "P30D"^^xsd:duration ;
        arch:requiresClockType "RubidiumAtomicClock" .
}
WHERE {
  ?site a arch:NetworkSite ;
        arch:hasMissionCriticalSlice arch:MCX_Priority1 .
}`,
		antecedents: ['S-0031', 'S-0042', 'KH:ADR-0014'],
		confidenceScore: 0.94,
		status: 'pending',
		suggestedBy: 'SmartMemory Rule Induction Engine (Tour 8)',
		suggestedAt: '2026-09-25T14:30:00Z'
	}
];
