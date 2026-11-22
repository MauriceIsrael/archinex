import { prisma } from '../prisma';
import { getApplicableFrameworks } from '$lib/server/compliance/complianceService';
import { listOptions } from '../projects/optionsDb';
import { listCriteria } from '../projects/optionsDb';
import {
	createArgument,
	listArguments,
	createDebateRun,
	updateDebateRun,
	type CreateArgumentData
} from '../projects/debateDb';
import { runProposerWithProposal } from './proposer';
import { seedSubjectProposal } from '../projects/proposalSeeder';
import type { SubjectProposal } from '$lib/domain/factorization';
import { runChallengerAgent } from './challenger';
import { runVerifierAgent } from './verifier';
import { runSynthesizerAgent } from './synthesizer';
import { doctrineService } from '../doctrine/doctrineService';
import type { ActorInfo } from '../projects/projectsDb';
import type { DebateRun, Argument } from '$lib/domain/debate';

const PROPOSER_ACTOR: ActorInfo = { userId: 'agent:proposer', role: 'architect_agent', productionMode: 'llm-derived' };

async function materializeProposerProposal(subjectId: string, proposal: SubjectProposal | undefined) {
	if (!proposal) return null;
	const seeded = await seedSubjectProposal(subjectId, proposal, PROPOSER_ACTOR);
	if (proposal.singleOptionRationale) {
		await prisma.subject.update({
			where: { id: subjectId },
			data: { singleOptionRationale: proposal.singleOptionRationale }
		});
	}
	return seeded;
}

export interface OrchestrationResult {
	run: DebateRun;
	roundsExecuted: number;
	newArgumentsCount: number;
	newQuestionsCount: number;
}

/** Règles transmises au vérificateur : de quoi couvrir tous les contrôles des référentiels déclarés (CRA + NIS2 = 48). */
const VERIFIER_MAX_RULES = 120;

type DoctrineRuleItem = {
	id: string;
	title?: string;
	excerpt?: string;
	relevant?: boolean;
	required?: boolean;
};

/**
 * Charge le contexte doctrinal applicable au sujet (LLMOps + règles locales du corpus en complément)
 * afin que le vérificateur dispose toujours des règles opposables disponibles.
 */
async function loadSubjectDoctrineContext(subject: {
	name: string;
	domain?: string | null;
	projectId: string;
}): Promise<{ allowedKbRefs: string[]; doctrine: DoctrineRuleItem[] }> {
	const byId = new Map<string, DoctrineRuleItem>();
	try {
		const docCtx = await doctrineService.getDoctrineContext({
			topics: [subject.name],
			domains: subject.domain ? [subject.domain] : [],
			frameworks: await getApplicableFrameworks(subject.projectId),
			// Le vérificateur lit TOUS les contrôles imposés : un contrôle mal classé par la recherche ne doit pas lui échapper
			maxItems: VERIFIER_MAX_RULES,
			maxChars: VERIFIER_MAX_RULES * 400
		});
		if (docCtx && Array.isArray(docCtx.items)) {
			for (const item of docCtx.items as DoctrineRuleItem[]) {
				if (item?.id && !byId.has(item.id)) {
					byId.set(item.id, item);
				}
			}
		}
	} catch (err) {
		console.warn('[Orchestrator] Doctrine indisponible :', (err as any).message);
	}

	// Compléter avec les règles induites des documents locaux du corpus si LLMOps n'a rien remonté
	if (byId.size === 0) {
		try {
			const corpusDocs = await prisma.corpusDocument.findMany({
				select: { id: true, title: true, summary: true, inducedRules: true }
			});
			for (const doc of corpusDocs) {
				let parsedRules: Array<{ id?: string; title?: string; text?: string; summary?: string }> = [];
				try {
					parsedRules = JSON.parse(doc.inducedRules || '[]');
				} catch {
					parsedRules = [];
				}
				if (Array.isArray(parsedRules) && parsedRules.length > 0) {
					for (const r of parsedRules) {
						if (r?.id && !byId.has(r.id)) {
							byId.set(r.id, {
								id: r.id,
								title: r.title || doc.title,
								excerpt: r.text || r.summary || doc.summary
							});
						}
					}
				} else if (doc.id && !byId.has(doc.id)) {
					byId.set(doc.id, {
						id: doc.id,
						title: doc.title,
						excerpt: doc.summary
					});
				}
			}
		} catch {
			// Corpus local facultatif
		}
	}

	const doctrine = Array.from(byId.values());
	return {
		allowedKbRefs: doctrine.map((r) => r.id),
		doctrine
	};
}

export async function orchestrateDebate(
	subjectId: string,
	options: {
		maxRounds?: number;
		actor?: ActorInfo;
	} = {}
): Promise<OrchestrationResult> {
	const maxRounds = Math.min(3, Math.max(1, options.maxRounds ?? 3));
	const actor = options.actor || { userId: 'debate-orchestrator', role: 'lead_architect' };

	const subject = await prisma.subject.findUnique({
		where: { id: subjectId },
		include: { project: true }
	});
	if (!subject) throw new Error(`Subject ${subjectId} introuvable`);

	// Récupération des options et critères
	const [opts, crits] = await Promise.all([
		listOptions(subjectId),
		listCriteria(subjectId)
	]);

	if (opts.length === 0) {
		throw new Error(
			`Impossible d'orchestrer un débat sur le sujet ${subject.name} : aucune option d'architecture n'a été formulée.`
		);
	}

	// Récupération de la doctrine autorisée pour ce sujet
	const { allowedKbRefs, doctrine } = await loadSubjectDoctrineContext(subject);

	// Création du run de débat
	const run = await createDebateRun(subjectId, maxRounds);
	let roundsExecuted = 0;
	let newArgumentsCount = 0;
	let newQuestionsCount = 0;

	try {
		for (let round = 1; round <= maxRounds; round++) {
			roundsExecuted = round;
			await updateDebateRun(run.id, { round });

			const existingArgs = await listArguments(subjectId);

			// 1. Proposer Agent
			const { arguments: proposerArgs } = await runProposerWithProposal({
				subject: { id: subject.id, name: subject.name, sectionRef: subject.sectionRef },
				options: opts,
				criteria: crits,
				allowedKbRefs,
				round
			});

			for (const arg of proposerArgs) {
				await createArgument(
					subjectId,
					arg,
					{ userId: 'agent:proposer', role: 'architect_agent', productionMode: 'llm-derived' },
					allowedKbRefs
				);
				newArgumentsCount++;
			}

			// 2. Challenger Agent (Objections)
			const updatedArgs1 = await listArguments(subjectId);
			const challengerArgs = await runChallengerAgent({
				subject: { id: subject.id, name: subject.name, sectionRef: subject.sectionRef },
				options: opts,
				criteria: crits,
				existingArguments: updatedArgs1,
				allowedKbRefs,
				round
			});

			for (const arg of challengerArgs) {
				await createArgument(
					subjectId,
					arg,
					{ userId: 'agent:challenger', role: 'architect_agent', productionMode: 'llm-derived' },
					allowedKbRefs
				);
				newArgumentsCount++;
			}

			// 3. Verifier Agent (Conformité KB)
			if (allowedKbRefs.length > 0) {
				const verifierArgs = await runVerifierAgent({
					subject: { id: subject.id, name: subject.name, sectionRef: subject.sectionRef },
					options: opts,
					allowedKbRefs,
					doctrine,
					round
				});

				for (const arg of verifierArgs) {
					await createArgument(
						subjectId,
						arg,
						{ userId: 'agent:verifier', role: 'compliance_agent', productionMode: 'llm-derived' },
						allowedKbRefs
					);
					newArgumentsCount++;
				}
			}

			// 4. Synthesizer Agent (Compromis & Questions Arbitrage)
			const updatedArgs2 = await listArguments(subjectId);
			const synthResult = await runSynthesizerAgent({
				subject: { id: subject.id, name: subject.name, sectionRef: subject.sectionRef },
				options: opts,
				criteria: crits,
				existingArguments: updatedArgs2,
				allowedKbRefs,
				round
			});

			for (const arg of synthResult.arguments) {
				await createArgument(
					subjectId,
					arg,
					{ userId: 'agent:synthesizer', role: 'moderator_agent', productionMode: 'llm-derived' },
					allowedKbRefs
				);
				newArgumentsCount++;
			}

			// Enregistrement des questions d'arbitrage générées pour les humains
			for (const q of synthResult.questions) {
				const qId = `q-${round}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
				await prisma.question.create({
					data: {
						id: qId,
						subjectId,
						text: q.text,
						assignedRole: q.assignedRole,
						blocking: q.blocking,
						status: 'open',
						version: 1
					}
				});
				newQuestionsCount++;
			}

			// Arrêt après 1 tour complet si suffisamment d'arguments et d'objections ont été posés
			// pour permettre à l'humain d'intervenir
			if (proposerArgs.length === 0 && challengerArgs.length === 0) {
				break;
			}
		}

		// Clôture du run
		const finalRun = await updateDebateRun(run.id, {
			status: 'completed',
			round: roundsExecuted
		});

		// Mise à jour de l'état de délibération du sujet
		await prisma.subject.update({
			where: { id: subjectId },
			data: {
				deliberationStatus: 'debating',
				maturityLevel: subject.maturityLevel === 'L0_named' || subject.maturityLevel === 'L1_framed' ? 'L2_decomposed' : subject.maturityLevel
			}
		});

		await prisma.domainEvent.create({
			data: {
				projectId: subject.projectId,
				entityType: 'subject',
				entityId: subjectId,
				type: 'DEBATE_ROUND_COMPLETED',
				payload: JSON.stringify({
					runId: run.id,
					rounds: roundsExecuted,
					argumentsProduced: newArgumentsCount,
					questionsProduced: newQuestionsCount
				}),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: 'llm-derived'
			}
		});

		return {
			run: finalRun,
			roundsExecuted,
			newArgumentsCount,
			newQuestionsCount
		};
	} catch (err: any) {
		await updateDebateRun(run.id, {
			status: 'failed',
			error: err.message
		});
		throw err;
	}
}

/**
 * Invoque un agent spécifique ciblé par @mention (A25 / Issue #36)
 * Respecte strictement l'isolation par engagement et par sujet.
 */
export async function invokeSpecificAgent(
	subjectId: string,
	agentRole: 'proposer' | 'challenger' | 'verifier' | 'synthesizer',
	contextPrompt?: string,
	actor?: ActorInfo
): Promise<Argument[]> {
	const subject = await prisma.subject.findUnique({
		where: { id: subjectId },
		include: { project: true }
	});
	if (!subject) throw new Error(`Subject ${subjectId} introuvable`);

	const [opts, crits, existingArgs] = await Promise.all([
		listOptions(subjectId),
		listCriteria(subjectId),
		listArguments(subjectId)
	]);

	// Récupération de la doctrine autorisée pour ce sujet
	const { allowedKbRefs, doctrine } = await loadSubjectDoctrineContext(subject);

	const createdArgs: Argument[] = [];
	const currentRound = existingArgs.length > 0 ? Math.max(...existingArgs.map((a) => a.round)) : 1;

	switch (agentRole) {
		case 'challenger': {
			const challengerArgs = await runChallengerAgent({
				subject: { id: subject.id, name: subject.name, sectionRef: subject.sectionRef },
				options: opts,
				criteria: crits,
				existingArguments: existingArgs,
				allowedKbRefs,
				round: currentRound
			});
			for (const arg of challengerArgs) {
				const created = await createArgument(
					subjectId,
					arg,
					{ userId: 'agent:challenger', role: 'architect_agent', productionMode: 'llm-derived' },
					allowedKbRefs
				);
				createdArgs.push(created);
			}
			break;
		}
		case 'proposer': {
			const proposerResult = await runProposerWithProposal({
				subject: { id: subject.id, name: subject.name, sectionRef: subject.sectionRef },
				options: opts,
				criteria: crits,
				allowedKbRefs,
				round: currentRound,
				contextPrompt
			});
			if (opts.length === 0 && proposerResult.proposal) {
				await materializeProposerProposal(subjectId, proposerResult.proposal);
			}
			for (const arg of proposerResult.arguments) {
				const created = await createArgument(
					subjectId,
					arg,
					PROPOSER_ACTOR,
					allowedKbRefs
				);
				createdArgs.push(created);
			}
			break;
		}
		case 'verifier': {
			const verifierArgs = await runVerifierAgent({
				subject: { id: subject.id, name: subject.name, sectionRef: subject.sectionRef },
				options: opts,
				allowedKbRefs,
				doctrine,
				round: currentRound
			});
			for (const arg of verifierArgs) {
				const created = await createArgument(
					subjectId,
					arg,
					{ userId: 'agent:verifier', role: 'compliance_agent', productionMode: 'llm-derived' },
					allowedKbRefs
				);
				createdArgs.push(created);
			}
			break;
		}
		case 'synthesizer': {
			const synthResult = await runSynthesizerAgent({
				subject: { id: subject.id, name: subject.name, sectionRef: subject.sectionRef },
				options: opts,
				criteria: crits,
				existingArguments: existingArgs,
				allowedKbRefs,
				round: currentRound
			});
			for (const arg of synthResult.arguments) {
				const created = await createArgument(
					subjectId,
					arg,
					{ userId: 'agent:synthesizer', role: 'moderator_agent', productionMode: 'llm-derived' },
					allowedKbRefs
				);
				createdArgs.push(created);
			}
			break;
		}
	}

	return createdArgs;
}
