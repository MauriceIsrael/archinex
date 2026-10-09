import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import { sanitizeHandle } from '$lib/domain/bundleAssembly';
import { listRequirementSources, saveRequirementAudit } from '$lib/server/projects/requirementsDb';
import { effectiveRequirementState, sourceBundleId, requirementBundleId } from '$lib/domain/requirementAudit';

const AuditSchema = z.object({
	source: z.object({
		title: z.string().min(1),
		kind: z.literal('rfp'),
		language: z.string().min(2),
		version: z.string().optional(),
		sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/)
	}),
	model: z.string().min(1),
	auditedAt: z.string().datetime(),
	items: z
		.array(
			z.object({
				clauseRef: z.string().min(1),
				title: z.string(),
				text: z.string().min(1),
				criticality: z.enum(['bloquant', 'majeur', 'info']),
				category: z.string().optional(),
				disposition: z.enum(['deliberated', 'evacuated', 'clarification_needed', 'to_qualify']),
				reason: z.string().optional(),
				clarificationQuestion: z.string().optional(),
				position: z.number().int().min(0)
			})
		)
		.min(1),
	confirmedDeliberated: z.array(z.string())
});

async function authorize(event: Parameters<RequestHandler>[0]) {
	const session = event.locals.session;
	if (!session?.user) return { error: json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 }) };
	const project = await prisma.project.findUnique({ where: { id: event.params.projectId }, include: { members: true } });
	if (!project) return { error: json({ status: 'error', error: `Projet ${event.params.projectId} introuvable` }, { status: 404 }) };
	const isMember = project.members.some((m) => m.userId === session.user.id);
	if (!isMember && session.user.role !== 'admin') {
		return { error: json({ status: 'error', error: 'forbidden', reason: "Réservé aux membres du projet" }, { status: 403 }) };
	}
	return { session };
}

/** Enregistre l'audit d'un RFP (propositions du modèle + clauses confirmées par l'humain). Idempotent. */
export const POST: RequestHandler = async (event) => {
	const auth = await authorize(event);
	if (auth.error) return auth.error;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ status: 'error', error: 'Corps JSON invalide' }, { status: 400 });
	}
	const parsed = AuditSchema.safeParse(body);
	if (!parsed.success) {
		return json({ status: 'error', error: 'INVALID_AUDIT', issues: parsed.error.issues.slice(0, 10) }, { status: 400 });
	}

	try {
		const actor = sanitizeHandle(auth.session!.user.email);
		const result = await saveRequirementAudit(event.params.projectId, parsed.data, actor);
		return json({ status: 'ok', ...result });
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		const status = message.startsWith('NOT_FOUND') ? 404 : message.startsWith('SOURCE_ID_COLLISION') || message.startsWith('DUPLICATE_CLAUSE') ? 409 : 500;
		return json({ status: 'error', error: message }, { status });
	}
};

/** État retenu de chaque exigence (décision humaine > proposition du modèle). */
export const GET: RequestHandler = async (event) => {
	const auth = await authorize(event);
	if (auth.error) return auth.error;

	const sources = await listRequirementSources(event.params.projectId);
	return json({
		status: 'ok',
		sources: sources.map((s) => ({
			id: sourceBundleId(s.sha256),
			title: s.title,
			sha256: s.sha256,
			auditModel: s.auditModel,
			auditedAt: s.auditedAt?.toISOString() ?? null,
			requirements: s.requirements.map((r) => {
				const st = effectiveRequirementState(r);
				return {
					id: requirementBundleId(s.sha256, r.clauseRef),
					clauseRef: r.clauseRef,
					title: r.title,
					criticality: r.criticality,
					disposition: st.disposition,
					reason: st.reason ?? null,
					clarificationQuestion: st.clarificationQuestion ?? null,
					assertionLevel: st.assertionLevel,
					by: st.by,
					at: st.at.toISOString()
				};
			})
		}))
	});
};
