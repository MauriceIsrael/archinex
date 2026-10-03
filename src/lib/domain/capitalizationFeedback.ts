import type { EngagementBundle, BundleDecision } from './engagementBundle';

export interface BundleKbCandidate {
	id: string;
	title: string;
	description: string;
	domain: string;
	type: 'pattern' | 'adr' | 'rule' | 'standard';
	status: 'in_review'; // Toujours in_review, jamais promu automatiquement
	triggerContext: string;
	provenance: {
		source_bundle_id: string;
		bundle_checksum: string;
		decision_id: string;
		subject_id: string;
		by: string[];
		at: string;
	};
	hypotheses: Array<{
		text: string;
		status: 'holds' | 'assumed';
	}>;
}

/**
 * Extrait les décisions affirmées ('asserted') d'un dossier d'engagement qui ne proviennent
 * pas déjà d'un actif de la base de connaissances (derived_from absent ou vide).
 * Ces décisions sont converties en candidats pour la boîte de revue de capitalisation (Lot A19).
 */
export function extractBundleKbCandidates(bundle: EngagementBundle): BundleKbCandidate[] {
	const data = bundle.data;
	const subjectsMap = new Map((data.subjects || []).map((s) => [s.id, s]));
	const statementsMap = new Map(
		(data.statements || []).map((st) => [st.id, st])
	);

	const candidates: BundleKbCandidate[] = [];

	(data.decisions || []).forEach((decision) => {
		// Règle 1 : La décision DOIT être affirmée (validée par un humain)
		if (decision.assertion_level !== 'asserted') {
			return;
		}

		// Règle 2 : Ne doit PAS être une réutilisation d'un actif existant de la base
		if (decision.derived_from?.kb_ref) {
			return;
		}

		const subject = subjectsMap.get(decision.subject_id);
		const domain = subject?.domains?.[0] || 'architecture';

		// Collecte des hypothèses et énoncés liés
		const relatedStatements = (data.statements || []).filter(
			(st) => st.subject_id === decision.subject_id
		);

		const hypotheses = relatedStatements.map((st) => ({
			text: st.text,
			status: (st.assertion_level === 'asserted' ? 'holds' : 'assumed') as 'holds' | 'assumed'
		}));

		candidates.push({
			id: `CAND-${decision.id}`,
			title: decision.decision,
			description: decision.justification || `Décision adoptée pour le sujet ${subject?.title || decision.subject_id}`,
			domain,
			type: 'pattern',
			status: 'in_review', // Arrive obligatoirement dans la boîte de revue en statut 'in_review'
			triggerContext: `Contexte : ${subject?.title || decision.subject_id} (${bundle.data.engagement.title})`,
			provenance: {
				source_bundle_id: bundle.snapshotId,
				bundle_checksum: bundle.checksum,
				decision_id: decision.id,
				subject_id: decision.subject_id,
				by: decision.provenance.by,
				at: decision.provenance.at
			},
			hypotheses
		});
	});

	return candidates;
}
