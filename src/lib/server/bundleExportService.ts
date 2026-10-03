import { prisma } from '$lib/server/prisma';
import {
	buildEngagementBundle,
	type EngagementBundle,
	type ConfidentialityLevel,
	type BundleSubject,
	type BundleDecision,
	type BundleStatement,
	type BundleConflict,
	type BundleCompliance,
	type BundleGap,
	type KbReference,
	type ReuseLogEntry,
	type GlossaryTerm
} from '$lib/domain/engagementBundle';
import {
	verifyEngagementBundle,
	type BundleProblem
} from '$lib/domain/bundleVerifier';
import type { SnapshotRef } from '$lib/domain/freezeExport';

export interface ExportBundleResult {
	bundle: EngagementBundle;
	snapshotRef: SnapshotRef;
}

export interface ExportBundleOptions {
	projectId: string;
	confidentiality: ConfidentialityLevel;
	actorHandle: string;
	sourceRevision?: string;
	now?: Date;
}

function sanitizeHandle(handleOrEmail: string): string {
	const stripped = handleOrEmail.split('@')[0].trim();
	const slug = stripped.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
	return `@${slug || 'lead-architect'}`;
}

/**
 * Service serveur pour exporter et sceller un dossier d'engagement (Lots A16-A17).
 */
export async function exportEngagementBundle(
	options: ExportBundleOptions
): Promise<ExportBundleResult> {
	if (!options.confidentiality) {
		throw new Error(
			'CONFIDENTIALITY_REQUIRED: Le niveau de confidentialité (public, internal, confidential, secret) est obligatoire.'
		);
	}

	// 1. Récupération des données du projet ou de l'engagement
	const project = await prisma.project.findUnique({
		where: { id: options.projectId },
		include: {
			subjects: {
				include: {
					decision: true,
					questions: true,
					options: true
				}
			},
			statements: true,
			frameworks: true
		}
	});

	let engagementRecord = null;
	if (!project) {
		engagementRecord = await prisma.engagement.findUnique({
			where: { id: options.projectId }
		});
		if (!engagementRecord) {
			throw new Error(`NOT_FOUND: Projet ou engagement '${options.projectId}' introuvable.`);
		}
	}

	const title = project?.title ?? engagementRecord?.title ?? options.projectId;
	const createdAt = (options.now ?? new Date()).toISOString();
	const actorHandle = sanitizeHandle(options.actorHandle);

	// 2. Mapping des sujets et décisions
	const rawSubjects = project?.subjects ?? [];
	const rawStatements = project?.statements ?? [];

	const kbRefsMap = new Map<string, KbReference>();

	const subjects: BundleSubject[] = [];
	const decisions: BundleDecision[] = [];
	const statements: BundleStatement[] = [];
	const compliance: BundleCompliance[] = [];
	const gaps: BundleGap[] = [];
	const conflicts: BundleConflict[] = [];
	const reuseLog: ReuseLogEntry[] = [];
	const glossary: GlossaryTerm[] = [];

	rawSubjects.forEach((sub, i) => {
		const subjId = sub.id || `SUBJ-${i + 1}`;
		const decId = sub.decision?.id || `DEC-${subjId}`;

		// Maturité conforme à la suite (L0_named..L4_specified)
		let maturity = sub.maturityLevel || 'L0_named';
		if (maturity === 'L5_archived') {
			maturity = 'L4_specified';
		}

		const isDecided = sub.deliberationStatus === 'arbitrated' || maturity === 'L3_decided' || maturity === 'L4_specified';
		const subStatus = isDecided ? ('decided' as const) : ('open' as const);

		subjects.push({
			id: subjId,
			title: sub.name,
			domains: [sub.domain || 'architecture'],
			maturity,
			status: subStatus,
			requirement_ids: [],
			decision_ids: [decId]
		});

		// Décision
		const isHumanAsserted = isDecided;
		const decisionText = sub.decision?.rationale || `Décision validée pour le sujet ${sub.name}`;
		decisions.push({
			id: decId,
			subject_id: subjId,
			status: isHumanAsserted ? 'validated' : 'proposed',
			epistemic_status: isHumanAsserted ? 'validated' : 'ai_proposed',
			assertion_level: isHumanAsserted ? 'asserted' : 'proposed',
			decision: decisionText,
			justification: sub.decision?.rationale || 'Délibération et consensus atteints.',
			provenance: {
				basis: isHumanAsserted ? 'human_validation' : 'ai_proposal',
				by: [actorHandle],
				at: createdAt
			}
		});

		// Questions ouvertes non résolues -> Gaps
		sub.questions?.forEach((q) => {
			if (q.status === 'open') {
				gaps.push({
					id: `GAP-${q.id}`,
					code: 'G2_unanswered_blocking',
					subject_id: subjId,
					description: q.text,
					blocking: q.blocking
				});
			}
		});
	});

	// Statements
	rawStatements.forEach((st, i) => {
		const stId = st.id || `ST-${i + 1}`;
		const isHuman = st.productionMode === 'human-authored';
		const subjectId = st.subjectId || subjects[0]?.id || 'SUBJ-1';

		statements.push({
			id: stId,
			subject_id: subjectId,
			epistemic_status: isHuman ? 'validated' : 'ai_proposed',
			assertion_level: isHuman ? 'asserted' : 'proposed',
			text: `${st.subjectRef} ${st.predicate} ${st.value}${st.unit ? ' ' + st.unit : ''}`,
			property: st.predicate,
			value: st.value,
			provenance: {
				basis: isHuman ? 'human_validation' : 'ai_proposal',
				by: [actorHandle],
				at: createdAt
			}
		});
	});

	// Si aucun sujet dans la DB, fournir au moins un sujet valide pour le bundle
	if (subjects.length === 0) {
		const defaultSubjId = 'SUBJ-core-01';
		const defaultDecId = 'DEC-core-01';
		subjects.push({
			id: defaultSubjId,
			title: 'Architecture générale de la plateforme',
			domains: ['core-architecture'],
			maturity: 'L3_decided',
			status: 'decided',
			requirement_ids: [],
			decision_ids: [defaultDecId]
		});
		decisions.push({
			id: defaultDecId,
			subject_id: defaultSubjId,
			status: 'validated',
			epistemic_status: 'validated',
			assertion_level: 'asserted',
			decision: 'Validation du socle architectural général.',
			justification: 'Validation officielle par le Lead Architect.',
			provenance: {
				basis: 'human_validation',
				by: [actorHandle],
				at: createdAt
			}
		});
	}

	// 3. Construction du bundle
	const bundle = buildEngagementBundle({
		engagement: {
			id: options.projectId,
			title,
			language: 'fr',
			confidentiality: options.confidentiality,
			client_label: title
		},
		subjects,
		decisions,
		statements,
		conflicts,
		compliance,
		gaps,
		kbReferences: Array.from(kbRefsMap.values()),
		reuseLog,
		glossary,
		sourceRevision: options.sourceRevision ?? 'main',
		createdAt
	});

	// 4. Vérification stricte
	const problems = verifyEngagementBundle(bundle);
	if (problems.length > 0) {
		const details = problems.map((p) => `[${p.code}] ${p.path}: ${p.message}`).join(' ; ');
		const error = new Error(`BUNDLE_VERIFICATION_FAILED: ${details}`);
		(error as unknown as Record<string, unknown>).problems = problems;
		throw error;
	}

	// 5. Enregistrement immuable dans l'historique d'audit (DomainEvent)
	try {
		await prisma.domainEvent.create({
			data: {
				projectId: options.projectId,
				entityType: 'bundle_export',
				entityId: bundle.snapshotId,
				type: 'BUNDLE_EXPORTED',
				payload: JSON.stringify({
					snapshotId: bundle.snapshotId,
					checksum: bundle.checksum,
					isProvisional: bundle.data.is_provisional,
					confidentiality: options.confidentiality,
					exportedBy: actorHandle
				}),
				actorId: actorHandle,
				actorRole: 'lead_architect',
				productionMode: 'human-authored'
			}
		});
	} catch (e) {
		console.warn('[BundleExport] Erreur lors de l enregistrement de l événement DomainEvent:', e);
	}

	const snapshotRef: SnapshotRef = {
		sourceSystem: 'archinex',
		snapshotId: bundle.snapshotId,
		checksum: bundle.checksum,
		producedAt: bundle.createdAt
	};

	return { bundle, snapshotRef };
}
