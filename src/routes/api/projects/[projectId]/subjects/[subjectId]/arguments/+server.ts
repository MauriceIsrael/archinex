import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import { listArguments, createArgument } from '$lib/server/projects/debateDb';
import { CreateArgumentSchema } from '$lib/schemas/debateApiSchemas';
import { getActorInfo } from '$lib/server/projects/actorHelper';
import { doctrineService } from '$lib/server/doctrine/doctrineService';
import { extractMentions } from '$lib/domain/debate';
import { invokeSpecificAgent } from '$lib/server/agents/debateOrchestrator';

export const GET: RequestHandler = async ({ params, url }) => {
	const { subjectId } = params;
	const optionId = url.searchParams.get('optionId');

	try {
		const args = await listArguments(subjectId, optionId);
		return json(args);
	} catch (err: any) {
		return json({ message: err.message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	const { projectId, subjectId } = params;
	const body = await request.json();
	const parsed = CreateArgumentSchema.safeParse(body);

	if (!parsed.success) {
		return json({ message: 'Validation invalide', errors: parsed.error.format() }, { status: 400 });
	}

	const actor = getActorInfo(request);

	// S'assurer de la présence du sujet dans la base relationnelle
	// (notamment pour les sujets issus de la synchro LLMOps ou des engagements locaux)
	let existingSubject = await prisma.subject.findUnique({ where: { id: subjectId } });
	if (!existingSubject) {
		let project = await prisma.project.findUnique({ where: { id: projectId } });
		if (!project) {
			const eng = await prisma.engagement.findUnique({ where: { id: projectId } });
			if (eng) {
				project = await prisma.project.create({
					data: {
						id: eng.id,
						title: eng.title,
						shortName: eng.shortName,
						type: eng.type,
						badge: eng.badge,
						description: eng.description,
						status: 'active',
						strategy: eng.strategy,
						version: 1
					}
				});
			} else {
				project = await prisma.project.create({
					data: {
						id: projectId,
						title: projectId,
						shortName: projectId,
						type: 'project_rfp',
						badge: 'PROJET',
						description: `Projet ${projectId}`,
						status: 'active',
						strategy: '{}',
						version: 1
					}
				});
			}
		}

		const eng = await prisma.engagement.findUnique({ where: { id: projectId } });
		let subjectMeta: any = null;
		if (eng?.subjects) {
			try {
				const list = JSON.parse(eng.subjects);
				subjectMeta = list.find((s: any) => s.id === subjectId);
			} catch {}
		}

		const cleanName = subjectMeta?.name || subjectId.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
		const sectionRef = subjectMeta?.section_ref || (subjectId.startsWith('§') ? subjectId : '§4.x');

		existingSubject = await prisma.subject.create({
			data: {
				id: subjectId,
				projectId: project.id,
				sectionRef,
				name: cleanName,
				domain: subjectMeta?.domain || 'general',
				problemStatement: subjectMeta?.problem_statement || `Instruction d'architecture sur ${cleanName}`,
				maturityLevel: subjectMeta?.level || 'L1_framed',
				deliberationStatus: 'debating',
				waitingForRole: subjectMeta?.waiting_for_role || 'lead_architect',
				relativeEffort: subjectMeta?.relative_effort || 'M',
				blockingCount: 0,
				unlocksCount: 1,
				version: 1
			}
		});
	}

	// Récupérer doctrine context pour vérifier les kbRefs
	let allowedKbRefs: string[] = [];
	try {
		const docCtx = await doctrineService.getDoctrineContext();
		if (docCtx && Array.isArray(docCtx.items)) {
			allowedKbRefs = docCtx.items.map((i: any) => i.id);
		}
	} catch (err) {
		// Pas bloquant si doctrine inaccessible
	}

	// Extraire les mentions (#base et @agent)
	const mentions = extractMentions(`${parsed.data.claim} ${parsed.data.grounds}`);
	const combinedKbRefs = Array.from(new Set([...(parsed.data.kbRefs || []), ...mentions.kbRefs]));

	// Enrichir allowedKbRefs pour inclure les doctrines locales du corpus
	try {
		const projectDocs = await prisma.corpusDocument.findMany({ select: { id: true, inducedRules: true } });
		for (const doc of projectDocs) {
			allowedKbRefs.push(doc.id);
			try {
				const rules = JSON.parse(doc.inducedRules || '[]');
				for (const r of rules) if (r.id) allowedKbRefs.push(r.id);
			} catch {}
		}
	} catch {}

	try {
		const argId = `arg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
		const created = await createArgument(
			subjectId,
			{
				id: argId,
				...parsed.data,
				kbRefs: combinedKbRefs,
				authorKind: 'human'
			},
			actor,
			allowedKbRefs.length > 0 ? allowedKbRefs : undefined
		);

		// Si un ou plusieurs agents sont mentionnés (@challenger, @proposer, @verifier, @synthesizer),
		// déclencher l'agent visé dans le fil du sujet courant
		const triggeredAgentArguments: any[] = [];
		for (const agentRole of mentions.agentMentions) {
			try {
				const agentResults = await invokeSpecificAgent(
					subjectId,
					agentRole,
					`${parsed.data.claim} - ${parsed.data.grounds}`,
					actor
				);
				triggeredAgentArguments.push(...agentResults);
			} catch (agentErr) {
				console.warn(`[Agent Trigger] Échec invocation @${agentRole}:`, agentErr);
			}
		}

		return json({ ...created, triggeredAgentArguments }, { status: 201 });
	} catch (err: any) {
		return json({ message: err.message }, { status: 400 });
	}
};
