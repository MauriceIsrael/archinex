import { prisma } from '$lib/server/prisma';
import type { EngagementBundle, ConfidentialityLevel, HubSnapshotPin } from '$lib/domain/engagementBundle';
import { verifyEngagementBundle } from '$lib/domain/bundleVerifier';
import { assembleEngagementBundle, sanitizeHandle, type AssemblyInput } from '$lib/domain/bundleAssembly';
import type { SnapshotRef } from '$lib/domain/freezeExport';
import { listRequirementSources, toAssemblySources } from '$lib/server/projects/requirementsDb';

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
	/** Engagement basculé : snapshot du Hub qui détient les faits engagés. */
	factsFromHub?: HubSnapshotPin;
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

	// 1. Lecture de l'état stocké (aucune interprétation ici : l'assemblage est une fonction pure)
	const project = await prisma.project.findUnique({
		where: { id: options.projectId },
		include: {
			subjects: { include: { decision: true, questions: true, options: true } },
			statements: true
		}
	});

	let title: string;
	if (project) {
		title = project.title;
	} else {
		const engagementRecord = await prisma.engagement.findUnique({ where: { id: options.projectId } });
		if (!engagementRecord) {
			throw new Error(`NOT_FOUND: Projet ou engagement '${options.projectId}' introuvable.`);
		}
		title = engagementRecord.title;
	}

	const sources = project ? await listRequirementSources(project.id) : [];
	const now = options.now ?? new Date();
	const actorHandle = sanitizeHandle(options.actorHandle);

	// 2. Assemblage déterministe du dossier (même état stocké = même sceau)
	const input: AssemblyInput = {
		project: { id: options.projectId, title },
		confidentiality: options.confidentiality,
		sourceRevision: options.sourceRevision,
		factsFromHub: options.factsFromHub,
		now,
		sources: toAssemblySources(sources),
		subjects: (project?.subjects ?? []).map((s) => ({
			id: s.id,
			sectionRef: s.sectionRef,
			name: s.name,
			domain: s.domain,
			maturityLevel: s.maturityLevel,
			requirementRefs: parseJsonArray<string>(s.requirementRefs),
			decision: s.decision
				? {
						id: s.decision.id,
						retainedOptionId: s.decision.retainedOptionId,
						rejected: parseJsonArray<{ optionId: string; reason: string }>(s.decision.rejected),
						rationale: s.decision.rationale,
						arbiterId: s.decision.arbiterId,
						decidedAt: s.decision.decidedAt
					}
				: null,
			options: s.options.map((o) => ({ id: o.id, title: o.title })),
			questions: s.questions.map((q) => ({ id: q.id, text: q.text, blocking: q.blocking, status: q.status }))
		})),
		statements: (project?.statements ?? []).map((st) => ({
			id: st.id,
			subjectId: st.subjectId,
			subjectRef: st.subjectRef,
			predicate: st.predicate,
			value: st.value,
			unit: st.unit,
			productionMode: st.productionMode,
			author: st.author,
			createdAt: st.createdAt
		}))
	};

	const bundle = assembleEngagementBundle(input);

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

function parseJsonArray<T>(raw: string | null | undefined): T[] {
	try {
		const v = JSON.parse(raw || '[]');
		return Array.isArray(v) ? (v as T[]) : [];
	} catch {
		return [];
	}
}
