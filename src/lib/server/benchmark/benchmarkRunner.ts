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
	type ReuseLogEntry,
	type KbReference,
	type OpenQuestion
} from '$lib/domain/engagementBundle';
import { sealEngagementBundle, verifyEngagementBundle } from '$lib/domain/bundleVerifier';
import {
	runRequirementsAudit,
	type ArcKitAuditReport,
	type LlmPort
} from '$lib/server/ingest/arckitRequirementsPipeline';
import { elicitSubjectDetails } from '$lib/server/llm/subjectElicitor';
import type { FactorizedArchitecturalSubject } from '$lib/domain/factorization';
import type { KbItemSummary } from '$lib/server/llm/rfpFactorizer';

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
	/** Référence de la décision ou règle réutilisée (ex: "ADR-SUB-1", "ADR-06") */
	matched_ref?: string;
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
	/** Pipeline de cadrage : déterministe synchrone (défaut) ou ArcKit (audit d'exigences + factorisation). */
	pipeline?: 'deterministic' | 'arckit';
	/** Patrimoine de doctrine réglementaire ou standards KB optionnels pour ancrer l'audit et l'élicitation. */
	kbStandards?: KbItemSummary[];
	/** Client LLM injecté (permet de simuler les réponses du modèle dans les tests sans dépendance réseau). */
	llm?: LlmPort;
	/** Si true, force l'élicitation multi-critères approfondie via elicitSubjectDetails sur les sujets. */
	elicit?: boolean;
	iteration?: number;
	manifestId?: string;
	expertFixtures?: ExpertActionFixture[];
	pins?: BundlePins;
	clientLabel?: string;
	/** Identifiant du modèle producteur (ex: "qwen2.5-coder:14b") ; devient le handle @model-<id>. */
	modelId?: string;
	/** Date de référence ISO déterministe (jamais l'horloge) pour garantir un checksum reproductible. */
	referenceDate?: string;
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
	/** Rapport d'audit des exigences ArcKit (disponible si pipeline === 'arckit'). */
	arckitReport?: ArcKitAuditReport;
	/** Sujets d'architecture factorisés et instruits par ArcKit (disponible si pipeline === 'arckit'). */
	factorizedSubjects?: FactorizedArchitecturalSubject[];
}

/** Date de référence par défaut : constante, pour que deux exécutions identiques scellent le même checksum. */
export const DEFAULT_REFERENCE_DATE = '2026-01-01T00:00:00.000Z';

// ─── Moteur d'Exécution par Lot ──────────────────────────────────────────────

export async function runBenchmarkCase(
	input: RFPCaseInput,
	options: BenchmarkRunOptions
): Promise<BenchmarkRunResult> {
	const startTime = performance.now();
	const mode = options.mode;
	const pipeline = options.pipeline ?? 'deterministic';
	const iteration = options.iteration ?? 1;
	const fixtures = options.expertFixtures ?? [];
	const modelHandle = `@model-${(options.modelId ?? 'unspecified').trim().replace(/\s+/g, '-')}`;
	const referenceDate = options.referenceDate ?? DEFAULT_REFERENCE_DATE;

	// 1. Découpage du RFP en clauses élémentaires
	const clauses = shredRfpTextToClauses(input.rfp_text);

	let requirements: BundleRequirement[] = [];
	let subjects: BundleSubject[] = [];
	let statements: BundleStatement[] = [];
	const conflicts: BundleConflict[] = [];
	const gaps: BundleGap[] = [];

	let arckitReport: ArcKitAuditReport | undefined;
	let factorizedSubjects: FactorizedArchitecturalSubject[] | undefined;

	if (pipeline === 'arckit') {
		// ─── Pipeline ArcKit (runRequirementsAudit + elicitSubjectDetails) ─────────
		const auditResult = await runRequirementsAudit(clauses, {
			llm: options.llm,
			model: options.modelId,
			kbStandards: options.kbStandards,
			largeContext: true
		});
		arckitReport = auditResult.report;
		factorizedSubjects = auditResult.subjects;

		// 1. Modélisation des exigences auditées
		requirements = arckitReport.requirements.map((r, idx) => ({
			id: `REQ-${idx + 1}`,
			source_document_id: 'DOC-RFP',
			clause_ref: r.clauseRef,
			title: r.title,
			text: r.text,
			language: input.language ?? 'fr',
			criticality: r.criticality,
			category: r.category,
			disposition: r.disposition,
			disposition_reason:
				r.disposition === 'evacuated'
					? r.evacuationReason
					: r.disposition === 'deliberated'
						? r.deliberationReason
						: r.disposition === 'to_qualify'
							? r.qualifyReason
							: undefined,
			clarification_question: r.clarificationQuestion,
			assertion_level: 'proposed'
		}));

		// 2. Modélisation des sujets factorisés (BundleSubject)
		subjects = factorizedSubjects.map((s, idx) => {
			const subjId = `SUB-${idx + 1}`;
			const coveredReqs = requirements.filter(
				(r) => r.disposition === 'deliberated' && s.coveredClauseRefs.includes(r.clause_ref)
			);
			const open_questions: OpenQuestion[] = [];
			if (s.seed?.initialQuestion) {
				open_questions.push({ id: `Q-${subjId}-1`, text: s.seed.initialQuestion, status: 'open' });
			}
			(s.seed?.expertQuestions ?? []).forEach((qText) => {
				open_questions.push({ id: `Q-${subjId}-${open_questions.length + 1}`, text: qText, status: 'open' });
			});

			return {
				id: subjId,
				title: s.name,
				domains: ['architecture', 'compliance'],
				maturity: 'L1_framed',
				status: 'open' as const,
				requirement_ids: coveredReqs.map((r) => r.id),
				decision_ids: [],
				open_questions
			};
		});

		// Si aucun sujet généré, fallback
		if (subjects.length === 0) {
			const deliberatedOnly = requirements.filter((r) => r.disposition === 'deliberated');
			subjects.push({
				id: 'SUB-1',
				title: input.title || 'Instruction générale du RFP',
				domains: ['architecture'],
				maturity: 'L1_framed',
				status: 'open',
				requirement_ids: deliberatedOnly.map((r) => r.id),
				decision_ids: [],
				open_questions: [{ id: 'Q-SUB-1-1', text: 'Quelles sont les cibles d\'architecture à retenir ?', status: 'open' }]
			});
		}

		// 3. Élicitation multi-critères optionnelle approfondie via elicitSubjectDetails
		if (options.elicit) {
			for (let i = 0; i < factorizedSubjects.length; i++) {
				const fs = factorizedSubjects[i];
				const bundleSubj = subjects[i];
				if (!bundleSubj) continue;
				try {
					const elicited = await elicitSubjectDetails(
						{
							subjectId: bundleSubj.id,
							subjectName: fs.name,
							sectionRef: fs.sectionRef,
							model: options.modelId
						},
						options.kbStandards ?? [],
						options.llm
					);

					if (elicited.elicitedDraft?.manque?.length) {
						elicited.elicitedDraft.manque.forEach((m, mIdx) => {
							bundleSubj.open_questions = bundleSubj.open_questions ?? [];
							bundleSubj.open_questions.push({
								id: `Q-${bundleSubj.id}-E${mIdx + 1}`,
								text: `[${m.assigned_role}] ${m.question}`,
								status: 'open'
							});
						});
					}

					if (!fs.proposal && elicited.options.length > 0) {
						fs.proposal = {
							options: elicited.options.map((o) => ({ title: o.title, summary: o.summary })),
							criteria: elicited.criteria.map((c) => ({
								name: c.name,
								kind: c.kind,
								weight: c.weight,
								description: c.description
							})),
							evaluations: []
						};
					}
				} catch (err) {
					console.warn(`[BenchmarkRunner] Échec de l'élicitation pour ${fs.name}:`, err);
				}
			}
		}

		// 4. Modélisation des énoncés auditables (BundleStatement)
		let stmtCounter = 1;
		for (const subj of subjects) {
			const subjReqs = requirements.filter((r) => subj.requirement_ids.includes(r.id));
			for (const req of subjReqs) {
				statements.push({
					id: `STMT-${stmtCounter++}`,
					subject_id: subj.id,
					epistemic_status: 'ai_proposed',
					assertion_level: 'proposed',
					text: req.text,
					predicate: req.title || `Exigence ${req.clause_ref}`,
					value: req.clause_ref,
					provenance: {
						basis: 'ai_proposal',
						by: [modelHandle],
						at: referenceDate
					}
				});
			}
		}
		if (statements.length === 0 && requirements.length > 0) {
			statements.push({
				id: 'STMT-1',
				subject_id: subjects[0].id,
				epistemic_status: 'ai_proposed',
				assertion_level: 'proposed',
				text: requirements[0].text,
				predicate: requirements[0].title || `Exigence ${requirements[0].clause_ref}`,
				value: requirements[0].clause_ref,
				provenance: {
					basis: 'ai_proposal',
					by: [modelHandle],
					at: referenceDate
				}
			});
		}

		// 5. Conflits identifiés (seed.initialConflict ou alignement conflictuel)
		factorizedSubjects.forEach((s, idx) => {
			const bundleSubj = subjects[idx] ?? subjects[0];
			const subjStmts = statements.filter((st) => st.subject_id === bundleSubj.id);
			const stmtIds = subjStmts.length > 0 ? [subjStmts[0].id] : (statements.length > 0 ? [statements[0].id] : []);

			if (s.seed?.initialConflict || s.knowledgeAlignment === 'conflict_detected') {
				conflicts.push({
					id: `CONF-${bundleSubj.id}`,
					kind: 'contradiction',
					status: 'open',
					statement_ids: stmtIds,
					description: s.seed?.initialConflict || s.alignmentRationale || `Contradiction sur le sujet "${s.name}"`
				});
			}
		});

		// 6. Gaps : clarifications demandées et exigences à qualifier
		requirements
			.filter((r) => r.disposition === 'clarification_needed')
			.forEach((r, idx) => {
				gaps.push({
					id: `GAP-CLARIF-${idx + 1}`,
					kind: 'requirement_clarification',
					requirement_id: r.id,
					description: `[${r.clause_ref}] ${r.clarification_question || r.title || 'Clarification requise'}`,
					blocking: r.criticality === 'bloquant'
				});
			});

		requirements
			.filter((r) => r.disposition === 'to_qualify')
			.forEach((r, idx) => {
				gaps.push({
					id: `GAP-QUALIF-${idx + 1}`,
					kind: 'requirement_unqualified',
					requirement_id: r.id,
					description: `[${r.clause_ref}] Exigence à qualifier : ${r.disposition_reason || r.title || r.text.slice(0, 80)}`,
					blocking: r.criticality === 'bloquant'
				});
			});

	} else {
		// ─── Pipeline Déterministe classique (confrontClausesWithKnowledgeBase) ──
		const confrontationResult = confrontClausesWithKnowledgeBase(clauses, []);
		const confrontations = confrontationResult.confrontations;

		// Modélisation des exigences (BundleRequirement)
		requirements = confrontations.map((c, idx) => ({
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

		// Initialisation des sujets d'architecture
		subjects = confrontationResult.suggestedInitialSubjects.map((s, idx) => {
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

		statements = requirements.map((r, idx) => {
			const parentSubj = subjects.find((s) => s.requirement_ids.includes(r.id)) ?? subjects[0];
			return {
				id: `STMT-${idx + 1}`,
				subject_id: parentSubj.id,
				epistemic_status: 'ai_proposed',
				assertion_level: 'proposed',
				text: r.text,
				predicate: r.title || `Exigence ${r.clause_ref}`,
				value: r.clause_ref,
				provenance: {
					basis: 'ai_proposal',
					by: [modelHandle],
					at: referenceDate
				}
			};
		});

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
					kind: 'uncovered_requirement',
					description: `[${c.clauseRef}] ${c.rationale || `Écart non couvert par la doctrine : "${c.title}"`}`,
					blocking: c.criticality === 'bloquant'
				});
			}
		});
	}

	const decisions: BundleDecision[] = [];
	const reuseLog: ReuseLogEntry[] = [];
	const kbReferences: KbReference[] = [];

	let expertInteractions = 0;
	let expertUnanswered = 0;

	// 6. Traitement selon le mode S2 (Autonome) ou S3 (Assisté)
	if (mode === 's2') {
		// ── S2 Autonome : aucune intervention humaine ──
		// Les conflits restent 'open', les sujets restent 'L1_framed' ou 'L2_decomposed',
		// et les éventuelles assertions restent 'proposed'.
		subjects.forEach((subj, idx) => {
			const decId = `DEC-${subj.id}`;
			const fs = factorizedSubjects ? factorizedSubjects[idx] : undefined;
			const proposedDecisionText = fs?.proposal?.options?.[0]?.title
				? `Option proposée : ${fs.proposal.options[0].title}`
				: `Proposition préliminaire d'architecture pour ${subj.title}`;
			decisions.push({
				id: decId,
				subject_id: subj.id,
				status: 'proposed',
				epistemic_status: 'ai_proposed',
				assertion_level: 'proposed',
				decision: proposedDecisionText,
				title: subj.title,
				rationale: fs?.alignmentRationale || 'Généré de façon autonome en attente d\'arbitrage contradictoire.',
				provenance: {
					basis: 'ai_proposal',
					by: [modelHandle],
					at: referenceDate
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
					title: decisionText.slice(0, 120),
					rationale: fixture.rationale || 'Décision opposable prise par l\'expert désigné.',
					provenance: {
						basis: 'human_validation',
						by: [fixture.actor],
						at: referenceDate
					}
				});
				subj.decision_ids.push(decId);

				// Traitement des hypothèses de réutilisation D8
				if (fixture.action === 'confirm_reuse') {
					const refId = fixture.matched_ref || `ADR-${subj.id}`;
					if (fixture.assumptions) {
						reuseLog.push({
							id: `REUSE-${subj.id}`,
							matched_ref: refId,
							outcome: fixture.assumptions.every((a) => a.status === 'holds') ? 'reused' : 'reused_with_exception',
							by: fixture.actor,
							at: referenceDate,
							comment: fixture.rationale ?? null,
							assumptions: fixture.assumptions
						});
					}

					if (!kbReferences.some((r) => r.ref === refId || r.id === refId)) {
						kbReferences.push({
							ref: refId,
							id: refId,
							kind: 'prior_decision',
							version: '1.0.0',
							citable: true,
							confidence: 'verified',
							title: `Prior validated ADR for ${subj.title}`
						});
					}
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
							at: referenceDate
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
		createdAt: referenceDate,
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
		reuseLog,
		kbReferences
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
		...decisions.map((d) => `- [${d.assertion_level.toUpperCase()}] ${d.decision} (Justification: ${d.rationale})`),
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
		questions: [
			...subjects.flatMap((s) => (s.open_questions ?? []).map((q) => q.text)),
			...(arckitReport?.clarifications ?? []).map((c) => `[${c.clauseRef}] ${c.question}`)
		],
		conflicts: conflicts.map((c) => c.description || c.id),
		gaps: gaps.map((g) => g.description || g.kind),
		expert_interactions: expertInteractions,
		expert_unanswered: expertUnanswered,
		wall_seconds: Number(wallSeconds.toFixed(3)),
		raw_text: rawTextLines.join('\n'),
		bundle,
		arckitReport,
		factorizedSubjects
	};
}
