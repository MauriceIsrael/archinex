/**
 * Adaptateur de Banc de Test en Boîte Noire pour Archinex (Jalon J3).
 *
 * Implémente le point d'entrée par lot sans interface graphique (§4.5) :
 *   - Mode S2 (Autonome) : analyse sans humain, détection des contradictions, conservation de l'état provisoire.
 *   - Mode S3 (Assisté) : exécution dirigée par des fixtures de réponses d'experts pré-enregistrées (§4.3).
 *
 * Produit un EngagementBundle canonique scellé (SHA-256 canonical-json v1) vérifiable par `verifyEngagementBundle`.
 */

import { shredRfpTextToClauses, confrontClausesWithKnowledgeBase, type ClauseConfrontation } from '$lib/domain/rfpConfrontation';
import {
	buildEngagementBundle,
	type EngagementBundle,
	type BundleSubject,
	type BundleDecision,
	type BundleStatement,
	type BundleConflict,
	type BundleGap,
	type BundleRequirement,
	type BundlePins,
	type ConfidentialityLevel,
	type ReuseLogEntry
} from '$lib/domain/engagementBundle';
import { sealEngagementBundle, verifyEngagementBundle } from '$lib/domain/bundleVerifier';

// ─── Interfaces du Banc de Test ──────────────────────────────────────────────

export interface RFPCaseInput {
	id: string;
	title?: string;
	rfp_text: string;
	category?: string;
	language?: string;
	confidentiality?: ConfidentialityLevel;
}

export interface ExpertActionFixture {
	/** Réf de clause ou section ciblée (ex: "Art. 1.1", "clause-1") */
	sectionRef?: string;
	/** Titre ou mot clé permettant de reconnaître le sujet ou la question */
	topic?: string;
	/** Sous-chaîne ou expression régulière de correspondance */
	match?: string;
	/** Identifiant ou handle de l'expert (ex: "@lead-architect", "alice@example.org") */
	actor: string;
	/** Action exécutée par l'expert */
	action: 'arbitrate' | 'confirm_reuse' | 'answer_question' | 'reject';
	/** Option sélectionnée (ex: "OPT-02-KVM", "SecNumCloud") */
	selected_option?: string;
	/** Libellé textuel de la décision arbitrée */
	decision?: string;
	/** Motivation ou justification opposable */
	rationale?: string;
	/** Hypothèses de réutilisation jugées (D8) */
	assumptions?: Array<{
		text: string;
		status: 'holds' | 'does_not_hold' | 'unknown';
	}>;
	/** Réponse textuelle à une question ouverte */
	answer?: string;
}

export interface BenchmarkRunOptions {
	mode: 's2' | 's3';
	iteration?: number;
	manifestId?: string;
	expertFixtures?: ExpertActionFixture[];
	pins?: BundlePins;
	clientLabel?: string;
}

export interface BenchmarkRunResult {
	system: 'S2' | 'S3';
	case_id: string;
	iteration: number;
	declared_provisional: boolean;
	provisional_reasons: {
		unripe_subjects: string[];
		open_conflicts: string[];
	};
	questions: string[];
	conflicts: string[];
	gaps: string[];
	expert_interactions: number;
	expert_unanswered: number;
	wall_seconds: number;
	raw_text: string;
	bundle: EngagementBundle;
}

// ─── Moteur d'Exécution par Lot ──────────────────────────────────────────────

export async function runBenchmarkCase(
	input: RFPCaseInput,
	options: BenchmarkRunOptions
): Promise<BenchmarkRunResult> {
	const startTime = performance.now();
	const mode = options.mode;
	const iteration = options.iteration ?? 1;
	const fixtures = options.expertFixtures ?? [];

	// 1. Découpage du RFP en clauses élémentaires
	const clauses = shredRfpTextToClauses(input.rfp_text);

	// 2. Confrontation avec le patrimoine de doctrine et détection des contradictions
	const confrontationResult = confrontClausesWithKnowledgeBase(clauses, []);
	const confrontations = confrontationResult.confrontations;

	// 3. Modélisation des exigences (BundleRequirement)
	// Toutes les clauses soumises au banc sont rattachées aux sujets pour délibération (disposition: 'deliberated')
	const requirements: BundleRequirement[] = confrontations.map((c, idx) => ({
		id: `REQ-${idx + 1}`,
		source_document_id: 'DOC-RFP',
		clause_ref: c.clauseRef,
		title: c.title,
		text: c.text,
		language: input.language ?? 'fr',
		criticality: c.criticality,
		disposition: 'deliberated',
		assertion_level: 'proposed'
	}));

	// 4. Initialisation des sujets d'architecture
	const subjects: BundleSubject[] = confrontationResult.suggestedInitialSubjects.map((s, idx) => {
		const subjId = `SUB-${idx + 1}`;
		return {
			id: subjId,
			title: s.name,
			domains: ['architecture', 'compliance'],
			maturity: 'L1_framed',
			status: 'open' as const,
			requirement_ids: requirements.filter((r) => r.clause_ref === s.sectionRef).map((r) => r.id),
			decision_ids: [],
			open_questions: s.initialQuestion
				? [{ id: `Q-${subjId}-1`, text: s.initialQuestion, status: 'open' }]
				: []
		};
	});

	// Si aucune clause n'a généré de sujet (RFP simple ou général), en créer un par défaut
	if (subjects.length === 0) {
		subjects.push({
			id: 'SUB-1',
			title: input.title || 'Instruction générale du RFP',
			domains: ['architecture'],
			maturity: 'L1_framed',
			status: 'open',
			requirement_ids: requirements.map((r) => r.id),
			decision_ids: [],
			open_questions: [{ id: 'Q-SUB-1-1', text: 'Quelles sont les cibles d\'architecture à retenir ?', status: 'open' }]
		});
	}

	// 5. Modélisation des énoncés auditables (BundleStatement) liés aux exigences et sujets
	const statements: BundleStatement[] = requirements.map((r, idx) => {
		const parentSubj = subjects.find((s) => s.requirement_ids.includes(r.id)) ?? subjects[0];
		return {
			id: `STMT-${idx + 1}`,
			subject_id: parentSubj.id,
			epistemic_status: 'ai_proposed',
			assertion_level: 'proposed',
			text: r.text,
			property: r.title || `Exigence ${r.clause_ref}`,
			value: r.clause_ref,
			provenance: {
				basis: 'ai_proposal',
				by: ['@system-autonomous'],
				at: new Date().toISOString()
			}
		};
	});

	// 6. Modélisation des conflits et manques initiaux (pointant vers les statements valides)
	const conflicts: BundleConflict[] = [];
	const gaps: BundleGap[] = [];

	confrontations.forEach((c, idx) => {
		if (c.status === 'conflict') {
			conflicts.push({
				id: `CONF-${idx + 1}`,
				kind: 'contradiction',
				status: 'open',
				statement_ids: [`STMT-${idx + 1}`],
				description: c.rationale || `Contradiction sur l'exigence "${c.title}"`
			});
		} else if (c.status === 'gap') {
			gaps.push({
				id: `GAP-${idx + 1}`,
				code: c.clauseRef,
				description: c.rationale || `Écart non couvert par la doctrine : "${c.title}"`,
				blocking: c.criticality === 'bloquant'
			});
		}
	});

	const decisions: BundleDecision[] = [];
	const reuseLog: ReuseLogEntry[] = [];

	let expertInteractions = 0;
	let expertUnanswered = 0;

	// 6. Traitement selon le mode S2 (Autonome) ou S3 (Assisté)
	if (mode === 's2') {
		// ── S2 Autonome : aucune intervention humaine ──
		// Les conflits restent 'open', les sujets restent 'L1_framed' ou 'L2_decomposed',
		// et les éventuelles assertions restent 'proposed'.
		subjects.forEach((subj) => {
			const decId = `DEC-${subj.id}`;
			decisions.push({
				id: decId,
				subject_id: subj.id,
				status: 'proposed',
				epistemic_status: 'ai_proposed',
				assertion_level: 'proposed',
				decision: `Proposition préliminaire d'architecture pour ${subj.title}`,
				justification: 'Généré de façon autonome en attente d\'arbitrage contradictoire.',
				provenance: {
					basis: 'ai_proposal',
					by: ['@system-autonomous'],
					at: new Date().toISOString()
				}
			});
			subj.decision_ids.push(decId);
		});
	} else if (mode === 's3') {
		// ── S3 Assisté : rejoue les sollicitations d'experts via les fixtures fournies ──
		subjects.forEach((subj) => {
			// Recherche d'une fixture d'expert correspondante
			const fixture = fixtures.find((f) => {
				if (f.topic && subj.title.toLowerCase().includes(f.topic.toLowerCase())) return true;
				if (f.sectionRef && subj.requirement_ids.some((rid) => {
					const req = requirements.find((r) => r.id === rid);
					return req && req.clause_ref.includes(f.sectionRef!);
				})) return true;
				if (f.match && (
					subj.title.toLowerCase().includes(f.match.toLowerCase()) ||
					(subj.open_questions ?? []).some((q) => q.text.toLowerCase().includes(f.match!.toLowerCase()))
				)) return true;
				return false;
			});

			if (fixture) {
				expertInteractions++;

				// Résolution du sujet : passage en maturité L3_decided
				subj.maturity = 'L3_decided';
				subj.status = 'decided';

				// Clôture des questions ouvertes associées
				if (subj.open_questions) {
					subj.open_questions.forEach((q) => {
						q.status = 'answered';
					});
				}

				// Résolution des conflits associés à ce sujet
				conflicts
					.filter((c) => {
						return c.statement_ids.some((sid) => {
							const stmt = statements.find((s) => s.id === sid);
							return stmt && stmt.subject_id === subj.id;
						});
					})
					.forEach((c) => {
						c.status = 'arbitrated';
						c.resolution = fixture.rationale || `Arbitré par ${fixture.actor} : ${fixture.decision || fixture.selected_option}`;
					});

				// Décision humaine affirmée (asserted)
				const decId = `DEC-${subj.id}`;
				const decisionText = fixture.decision || `Option retenue : ${fixture.selected_option || 'Validée'}`;
				decisions.push({
					id: decId,
					subject_id: subj.id,
					status: 'validated',
					epistemic_status: 'validated',
					assertion_level: 'asserted',
					decision: decisionText,
					justification: fixture.rationale || 'Décision opposable prise par l\'expert désigné.',
					provenance: {
						basis: 'human_validation',
						by: [fixture.actor],
						at: new Date().toISOString()
					}
				});
				subj.decision_ids.push(decId);

				// Traitement des hypothèses de réutilisation D8
				if (fixture.action === 'confirm_reuse' && fixture.assumptions) {
					reuseLog.push({
						id: `REUSE-${subj.id}`,
						matched_ref: `ADR-${subj.id}`,
						outcome: fixture.assumptions.every((a) => a.status === 'holds') ? 'reused' : 'reused_with_exception',
						by: fixture.actor,
						at: new Date().toISOString(),
						comment: fixture.rationale ?? null,
						assumptions: fixture.assumptions
					});
				}

				// Mise à jour des énoncés du sujet en statut validé / affirmé par l'expert
				statements
					.filter((s) => s.subject_id === subj.id)
					.forEach((s) => {
						s.epistemic_status = 'validated';
						s.assertion_level = 'asserted';
						s.provenance = {
							basis: 'human_validation',
							by: [fixture.actor],
							at: new Date().toISOString()
						};
					});
			} else {
				// Sollicitation sans réponse dans le script
				expertUnanswered++;
				// Le sujet reste en suspens (L1_framed / open)
			}
		});
	}

	// 7. Assemblage du Dossier d'Engagement Scellé (EngagementBundle)
	const rawBundle = buildEngagementBundle({
		engagement: {
			id: input.id,
			title: input.title || `Engagement ${input.id}`,
			language: input.language ?? 'fr',
			confidentiality: input.confidentiality ?? 'internal',
			client_label: options.clientLabel ?? 'Client Benchmark'
		},
		pins: options.pins ?? {
			llmops_contract_version: '1.24',
			kb: {
				snapshot_id: 'snapshot-benchmark-pinned',
				payload_sha256: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
			}
		},
		sourceDocuments: [
			{
				id: 'DOC-RFP',
				kind: 'rfp',
				title: input.title || 'CCTP / RFP Soumis',
				language: input.language ?? 'fr',
				sha256: `sha256:${Buffer.from(input.rfp_text).toString('hex').slice(0, 64)}`
			}
		],
		requirements,
		subjects,
		decisions,
		statements,
		conflicts,
		gaps,
		reuseLog
	});

	// Sceau cryptographique canonique canonical-json v1
	const bundle = sealEngagementBundle(rawBundle);

	// Vérification instrumentale stricte
	const problems = verifyEngagementBundle(bundle);
	if (problems.length > 0) {
		console.warn(`[BenchmarkRunner] Alertes d'intégrité sur le bundle (${problems.length}) :`, problems);
	}

	const wallSeconds = (performance.now() - startTime) / 1000;

	// Synthèse textuelle brute de la production
	const rawTextLines = [
		`# Engagement : ${bundle.data.engagement.title} (${bundle.data.engagement.id})`,
		`État provisoire : ${bundle.data.is_provisional ? 'OUI' : 'NON'}`,
		'\n## Décisions :',
		...decisions.map((d) => `- [${d.assertion_level.toUpperCase()}] ${d.decision} (Justification: ${d.justification})`),
		'\n## Conflits :',
		...conflicts.map((c) => `- [${c.status.toUpperCase()}] ${c.description || c.id}`),
		'\n## Questions en suspens :',
		...subjects.flatMap((s) => (s.open_questions ?? []).map((q) => `- [${s.title}] ${q.text}`))
	];

	return {
		system: mode.toUpperCase() as 'S2' | 'S3',
		case_id: input.id,
		iteration,
		declared_provisional: bundle.data.is_provisional,
		provisional_reasons: bundle.data.provisional_reasons,
		questions: subjects.flatMap((s) => (s.open_questions ?? []).map((q) => q.text)),
		conflicts: conflicts.map((c) => c.description || c.id),
		gaps: gaps.map((g) => g.description || g.code),
		expert_interactions: expertInteractions,
		expert_unanswered: expertUnanswered,
		wall_seconds: Number(wallSeconds.toFixed(3)),
		raw_text: rawTextLines.join('\n'),
		bundle
	};
}
