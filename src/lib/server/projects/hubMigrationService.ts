/**
 * Service de simulation et migration d'un projet vers le Knowledge Hub (K12 / K15 / K11).
 *
 * Règles :
 * - Le Hub enregistre l'engagé (exigences, sujets, maturité, questions, énoncés, conflits).
 * - Archinex conserve le processus de délibération local (critères, options, débats, dialogue).
 * - Les rôles sont projetés : lead_architect -> admin, domain_expert -> decider, contributor -> contributor, viewer -> reader.
 * - Handles uniques au format @handle (^[a-z0-9][a-z0-9._-]{0,62}$).
 * - Aucun e-mail dans les textes transmis (rejet code EMAIL).
 * - Rien ne naît affirmé : un énoncé repris sans valideur distinct reste 'proposed'.
 * - Les exigences auditées d'un RFP sont reprises avec les sujets qui les portent. Une décision déjà prise sur une clause
 *   n'est PAS reprise au nom du lot : le rapport la liste, un décideur du Hub l'affirme à nouveau.
 * - Bascule explicite du système d'enregistrement (systemOfRecord: 'hub').
 */

import { prisma } from '../prisma';
import { llmopsClient, type LLMOpsClient } from '../llmops/client';
import { listRequirementSources } from './requirementsDb';
import { requirementBundleId } from '$lib/domain/requirementAudit';
import { hubRequirementIdMap } from '$lib/domain/hubRequirementId';
import type {
	HubConfidentiality,
	HubConfidence,
	HubEngagementRole,
	HubMaturityInput,
	HubMember,
	HubOrigin,
	HubStatementInput
} from '$lib/types/llmops';

export const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/;

export const VALID_CONFIDENCE_LEVELS: HubConfidence[] = [
	'verified',
	'designed',
	'vendor-stated',
	'stated-by-client',
	'assumed'
];

export function mapArchinexRoleToHubRole(role: string): HubEngagementRole {
	const r = (role || '').toLowerCase().replace(/[\s-]/g, '_');
	if (r === 'lead_architect' || r === 'admin' || r === 'lead_architecte') return 'admin';
	if (
		r === 'domain_expert' ||
		r === 'decider' ||
		r === 'security_architect' ||
		r === 'infra_expert_architect' ||
		r === 'domain_architect' ||
		r === 'data_architect' ||
		r.includes('expert')
	) {
		return 'decider';
	}
	if (r === 'viewer' || r === 'reader') return 'reader';
	return 'contributor';
}

export function sanitizeHandle(handleOrEmail: string): string {
	let raw = (handleOrEmail || '').trim();
	if (raw.startsWith('@')) raw = raw.slice(1);
	else if (raw.includes('@')) raw = raw.split('@')[0];
	const cleaned = raw.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/^[^a-z0-9]+/, '');
	const truncated = cleaned.slice(0, 62);
	return `@${truncated || 'architect'}`;
}

export function isProjectCutOverToHub(project: { strategy?: any }): boolean {
	const strat = typeof project.strategy === 'string' ? JSON.parse(project.strategy || '{}') : (project.strategy || {});
	return strat.systemOfRecord === 'hub';
}

export interface MigrationProblem {
	code: 'EMAIL' | 'INVALID_CONFIDENCE' | 'INVALID_ID' | 'SELF_VALIDATION' | 'UNMAPPED_ROLE' | 'SCHEMA' | 'DANGLING' | 'TEXT_TOO_LONG';
	path: string;
	entityId: string;
	reason: string;
}

export interface AcceptedStatementMigration {
	id: string;
	subject: string;
	value: string;
	confidence: HubConfidence;
	origin: HubOrigin;
	authorHandle: string;
	validatorEmail?: string;
	willBeAsserted: boolean;
	section?: string;
	predicate?: string;
	role?: string;
	verbatim?: string;
}

/** Le Hub refuse un texte d'exigence de plus de 4000 caractères : on ne tronque pas, on refuse la migration. */
export const HUB_MAX_REQUIREMENT_TEXT = 4000;

export interface AcceptedRequirementMigration {
	id: string;
	text: string;
	section?: string;
	category?: string;
	criticality?: string;
	/** Identifiant du dossier scellé (`SRC-xxxx:clause`) quand l'exigence vient d'un audit de RFP. */
	bundleId?: string;
}

/** Décision humaine déjà prise sur une clause, non reprise au nom du lot : un décideur du Hub doit la re-proposer et l'affirmer. */
export interface DispositionToReassert {
	requirementId: string;
	hubRequirementId: string;
	disposition: string;
	reason: string | null;
	decidedBy: string;
	decidedAt: string;
}

export interface MigrationSimulationReport {
	projectId: string;
	engagementId: string;
	ok: boolean;
	counts: {
		members: number;
		subjects: number;
		statements: number;
		statementsAssertable: number;
		statementsProposedOnly: number;
		questions: number;
		requirements: number;
	};
	accepted: {
		members: HubMember[];
		subjects: Array<{ name: string; definition?: string; level: HubMaturityInput['level']; requirementIds?: string[] }>;
		statements: AcceptedStatementMigration[];
		questions: Array<{ id: string; question: string; subject?: string; section?: string }>;
		requirements: AcceptedRequirementMigration[];
	};
	/** Décisions sur des clauses à réaffirmer dans le Hub (rien n'est affirmé au nom du lot). */
	dispositionsToReassert: DispositionToReassert[];
	rejected: MigrationProblem[];
}

export interface MigrationExecutionResult {
	ok: boolean;
	projectId: string;
	engagementId: string;
	systemOfRecord: 'hub';
	report: MigrationSimulationReport;
	cutoverAt: string;
}

/**
 * Simule la migration d'un projet Archinex vers un engagement géré du Hub.
 * Produit un rapport exhaustif des éléments acceptés et rejetés, sans modifier les données.
 */
export async function simulateProjectMigration(projectId: string): Promise<MigrationSimulationReport> {
	const project = await prisma.project.findUnique({
		where: { id: projectId },
		include: {
			members: true,
			subjects: {
				include: {
					questions: true
				}
			},
			statements: true
		}
	});

	if (!project) {
		throw new Error(`Project ${projectId} not found`);
	}

	const strategy = typeof project.strategy === 'string' ? JSON.parse(project.strategy || '{}') : (project.strategy || {});
	const engagementId = (strategy.hubEngagementId || project.shortName || project.id)
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.slice(0, 64);

	const rejected: MigrationProblem[] = [];
	const acceptedMembers: HubMember[] = [];
	const memberEmailMap = new Map<string, string>(); // userId -> email
	const memberHandleMap = new Map<string, string>(); // userId/author -> handle
	const memberRoleMap = new Map<string, HubEngagementRole>(); // userId/email -> role
	const usedHandles = new Set<string>();

	// 1. Validation et projection des membres
	for (const m of project.members) {
		const user = await prisma.user.findUnique({ where: { id: m.userId } });
		if (!user || !user.email) {
			rejected.push({
				code: 'UNMAPPED_ROLE',
				path: `members.${m.id}`,
				entityId: m.id,
				reason: `Utilisateur ${m.userId} introuvable ou sans adresse e-mail`
			});
			continue;
		}

		let baseHandle = sanitizeHandle(user.name || user.email);
		let finalHandle = baseHandle;
		let suffix = 2;
		while (usedHandles.has(finalHandle)) {
			finalHandle = `${baseHandle}-${suffix++}`;
		}
		usedHandles.add(finalHandle);

		const hubRole = mapArchinexRoleToHubRole(m.role);
		acceptedMembers.push({
			email: user.email.toLowerCase(),
			handle: finalHandle,
			role: hubRole
		});

		memberEmailMap.set(m.userId, user.email.toLowerCase());
		memberEmailMap.set(user.email.toLowerCase(), user.email.toLowerCase());
		memberHandleMap.set(m.userId, finalHandle);
		memberHandleMap.set(user.email.toLowerCase(), finalHandle);
		if (user.name) memberHandleMap.set(user.name, finalHandle);
		memberRoleMap.set(user.email.toLowerCase(), hubRole);
	}

	// Un administrateur est strictement requis
	if (!acceptedMembers.some((m) => m.role === 'admin')) {
		rejected.push({
			code: 'UNMAPPED_ROLE',
			path: 'members',
			entityId: projectId,
			reason: 'Au moins un membre avec le rôle admin est requis pour administrer l’engagement'
		});
	}

	// 2. Validation des sujets
	const acceptedSubjects: Array<{ name: string; definition?: string; level: HubMaturityInput['level']; requirementIds?: string[] }> = [];
	for (const s of project.subjects) {
		const sName = s.name.trim();
		if (EMAIL_REGEX.test(sName)) {
			rejected.push({
				code: 'EMAIL',
				path: `subjects.${s.id}.name`,
				entityId: s.id,
				reason: 'Le nom du sujet contient une adresse e-mail proscrite'
			});
			continue;
		}

		const def = s.problemStatement || '';
		if (def && EMAIL_REGEX.test(def)) {
			rejected.push({
				code: 'EMAIL',
				path: `subjects.${s.id}.problemStatement`,
				entityId: s.id,
				reason: 'La définition du sujet contient une adresse e-mail proscrite'
			});
			continue;
		}

		let level = s.maturityLevel as HubMaturityInput['level'];
		if (level === ('L5_archived' as any)) {
			level = 'L4_specified';
		}

		const refs = parseRefs(s.requirementRefs);
		acceptedSubjects.push({
			name: sName,
			definition: def || undefined,
			level,
			...(refs.length > 0 ? { requirementIds: refs } : {})
		});
	}

	// 3. Validation des énoncés
	const acceptedStatements: AcceptedStatementMigration[] = [];
	let statementsAssertable = 0;
	let statementsProposedOnly = 0;

	for (const st of project.statements) {
		let hasEmailError = false;
		for (const [field, text] of [
			['value', st.value],
			['predicate', st.predicate],
			['section', st.section],
			['subjectRef', st.subjectRef]
		] as const) {
			if (text && EMAIL_REGEX.test(text)) {
				rejected.push({
					code: 'EMAIL',
					path: `statements.${st.id}.${field}`,
					entityId: st.id,
					reason: `L’énoncé contient une adresse e-mail proscrite dans le champ '${field}'`
				});
				hasEmailError = true;
				break;
			}
		}
		if (hasEmailError) continue;

		// Confiance
		const conf = st.confidence as HubConfidence;
		if (!VALID_CONFIDENCE_LEVELS.includes(conf)) {
			rejected.push({
				code: 'INVALID_CONFIDENCE',
				path: `statements.${st.id}.confidence`,
				entityId: st.id,
				reason: `Confiance '${st.confidence}' hors du vocabulaire de la suite`
			});
			continue;
		}

		// Auteur -> handle
		const authorHandle = memberHandleMap.get(st.author) || sanitizeHandle(st.author);
		const origin: HubOrigin = st.productionMode === 'llm-derived' ? 'llm-derived' : 'human';

		// Recherche d'un valideur distinct (soit via événement STATEMENT_ASSERTED, soit via champ validatedBy)
		let willBeAsserted = false;
		let validatorEmail: string | undefined = undefined;

		const assertionEvent = await prisma.domainEvent.findFirst({
			where: {
				projectId,
				entityId: st.id,
				type: 'STATEMENT_ASSERTED'
			},
			orderBy: { createdAt: 'desc' }
		});

		let validatorId: string | undefined = (st as any).validatedBy;
		if (!validatorId && assertionEvent) {
			try {
				const payload = JSON.parse(assertionEvent.payload || '{}');
				validatorId = payload.validatedBy || assertionEvent.actorId;
			} catch {
				validatorId = assertionEvent.actorId;
			}
		}

		if (validatorId) {
			const vEmail = memberEmailMap.get(validatorId) || (validatorId.includes('@') ? validatorId.toLowerCase() : undefined);
			const authorEmail = memberEmailMap.get(st.author) || (st.author.includes('@') ? st.author.toLowerCase() : undefined);

			if (vEmail && authorEmail && vEmail !== authorEmail) {
				const vRole = memberRoleMap.get(vEmail);
				if (vRole === 'decider' || vRole === 'admin') {
					willBeAsserted = true;
					validatorEmail = vEmail;
				}
			}
		}

		if (willBeAsserted) {
			statementsAssertable++;
		} else {
			statementsProposedOnly++;
		}

		acceptedStatements.push({
			id: st.id,
			subject: st.subjectRef || 'general',
			value: st.value,
			confidence: conf,
			origin,
			authorHandle,
			validatorEmail,
			willBeAsserted,
			section: st.section || 'general',
			predicate: st.predicate || 'has_property',
			role: st.role || 'architect'
		});
	}

	// 4. Validation des questions
	const acceptedQuestions: Array<{ id: string; question: string; subject?: string; section?: string }> = [];
	for (const s of project.subjects) {
		for (const q of s.questions) {
			if (EMAIL_REGEX.test(q.text)) {
				rejected.push({
					code: 'EMAIL',
					path: `questions.${q.id}.text`,
					entityId: q.id,
					reason: 'La question contient une adresse e-mail proscrite'
				});
				continue;
			}
			acceptedQuestions.push({
				id: q.id,
				question: q.text,
				subject: s.name,
				section: s.sectionRef || 'general'
			});
		}
	}

	// 5. Exigences issues de strategy.objectives ou constraints
	const acceptedRequirements: AcceptedRequirementMigration[] = [];
	const rawObjectives = Array.isArray(strategy.objectives) ? strategy.objectives : [];
	const rawConstraints = Array.isArray(strategy.constraints) ? strategy.constraints : [];
	const combinedReqs = [...rawObjectives, ...rawConstraints];

	combinedReqs.forEach((item: string, idx: number) => {
		if (typeof item === 'string' && item.trim()) {
			const text = item.trim();
			const reqId = `REQ-${(idx + 1).toString().padStart(3, '0')}`;
			if (EMAIL_REGEX.test(text)) {
				rejected.push({
					code: 'EMAIL',
					path: `strategy.requirements.${reqId}`,
					entityId: reqId,
					reason: 'L’exigence contient une adresse e-mail proscrite'
				});
			} else {
				acceptedRequirements.push({
					id: reqId,
					text,
					section: 'general'
				});
			}
		}
	});

	// 6. Exigences auditées d'un RFP : reprises avec leurs identifiants Hub, jamais tronquées
	const dispositionsToReassert: DispositionToReassert[] = [];
	const hubIdOf = new Map<string, string>();
	try {
		const sources = await listRequirementSources(projectId);
		const bundleIds = sources.flatMap((src) => src.requirements.map((r) => requirementBundleId(src.sha256, r.clauseRef)));
		for (const [bundleId, hubId] of hubRequirementIdMap(bundleIds)) hubIdOf.set(bundleId, hubId);
		for (const src of sources) {
			for (const r of src.requirements) {
				const bundleId = requirementBundleId(src.sha256, r.clauseRef);
				const hubId = hubIdOf.get(bundleId)!;
				const problem = [
					[r.text.length > HUB_MAX_REQUIREMENT_TEXT, 'TEXT_TOO_LONG', `Le texte de la clause ${r.clauseRef} dépasse ${HUB_MAX_REQUIREMENT_TEXT} caractères : le Hub ne le tronque pas`],
					[EMAIL_REGEX.test(r.text) || EMAIL_REGEX.test(r.title), 'EMAIL', `La clause ${r.clauseRef} contient une adresse e-mail proscrite`]
				].find(([bad]) => bad) as [boolean, MigrationProblem['code'], string] | undefined;
				if (problem) {
					rejected.push({ code: problem[1], path: `requirements.${bundleId}`, entityId: bundleId, reason: problem[2] });
					continue;
				}
				acceptedRequirements.push({
					id: hubId,
					text: r.text,
					section: r.clauseRef,
					category: r.category ?? 'general',
					criticality: r.criticality,
					bundleId
				});
				if (r.decidedDisposition && r.decidedBy && r.decidedAt) {
					dispositionsToReassert.push({
						requirementId: bundleId,
						hubRequirementId: hubId,
						disposition: r.decidedDisposition,
						reason: r.decidedReason,
						decidedBy: r.decidedBy,
						decidedAt: r.decidedAt.toISOString()
					});
				}
			}
		}
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		rejected.push({ code: 'INVALID_ID', path: 'requirements', entityId: projectId, reason: message });
	}

	// Un sujet ne peut porter qu'une exigence reprise : une référence inconnue est un rejet, pas une omission silencieuse
	const knownHubIds = new Set(acceptedRequirements.map((r) => r.id));
	for (const s of acceptedSubjects) {
		if (!s.requirementIds) continue;
		const mapped: string[] = [];
		for (const ref of s.requirementIds) {
			const hubId = hubIdOf.get(ref);
			if (hubId && knownHubIds.has(hubId)) mapped.push(hubId);
			else {
				rejected.push({
					code: 'DANGLING',
					path: `subjects.${s.name}.requirementRefs`,
					entityId: ref,
					reason: `Le sujet « ${s.name} » porte l'exigence ${ref}, qui n'est pas reprise`
				});
			}
		}
		s.requirementIds = mapped;
	}

	const ok = rejected.length === 0;

	return {
		projectId,
		engagementId,
		ok,
		counts: {
			members: acceptedMembers.length,
			subjects: acceptedSubjects.length,
			statements: acceptedStatements.length,
			statementsAssertable,
			statementsProposedOnly,
			questions: acceptedQuestions.length,
			requirements: acceptedRequirements.length
		},
		accepted: {
			members: acceptedMembers,
			subjects: acceptedSubjects,
			statements: acceptedStatements,
			questions: acceptedQuestions,
			requirements: acceptedRequirements
		},
		dispositionsToReassert,
		rejected
	};
}

function parseRefs(raw: string | null | undefined): string[] {
	try {
		const v = JSON.parse(raw || '[]');
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

/**
 * Exécute la migration et la bascule d'un projet vers le Hub.
 * Idempotent : peut être rejoué sans corrompre ni réinitialiser les affirmations.
 */
export async function executeProjectMigration(
	projectId: string,
	actorEmail: string,
	options: {
		confidentiality?: HubConfidentiality;
		client?: LLMOpsClient;
	} = {}
): Promise<MigrationExecutionResult> {
	const client = options.client || llmopsClient;
	const confidentiality: HubConfidentiality = options.confidentiality || 'confidential';

	// Étape 1 : Simulation préalable stricte (Fail Loud si rejets)
	const report = await simulateProjectMigration(projectId);
	if (!report.ok) {
		const reasons = report.rejected.map((r) => `[${r.code}] ${r.path}: ${r.reason}`).join(' ; ');
		throw new Error(`Migration refusée : ${report.rejected.length} anomalie(s) détectée(s) : ${reasons}`);
	}

	const adminMember = report.accepted.members.find((m) => m.role === 'admin');
	if (!adminMember) {
		throw new Error('Migration impossible : aucun membre administrateur valide');
	}

	const engagementId = report.engagementId;

	// Étape 2 : Création de l'engagement géré côté Hub (idempotent)
	try {
		await client.createManagedEngagement(
			{
				engagement: engagementId,
				confidentiality,
				admin_email: adminMember.email,
				admin_handle: adminMember.handle
			},
			actorEmail
		);
	} catch (err: any) {
		// 409 already exists est acceptable pour l'idempotence
		if (err.status !== 409 && !err.message?.includes('already exists')) {
			throw err;
		}
	}

	// Étape 3 : Synchronisation intégrale des membres
	await client.setEngagementMembers(engagementId, report.accepted.members, actorEmail);

	// Étape 4 : Ingestion des exigences (500 au plus par appel côté Hub)
	for (let i = 0; i < report.accepted.requirements.length; i += 500) {
		await client.addRequirements(
			engagementId,
			{
				requirements: report.accepted.requirements.slice(i, i + 500).map((r) => ({
					id: r.id,
					text: r.text,
					section: r.section || 'general',
					...(r.category ? { category: r.category } : {}),
					...(r.criticality ? { criticality: r.criticality } : {})
				}))
			},
			actorEmail
		);
	}

	// Étape 5 : Ingestion des sujets, avec les exigences qu'ils portent (contrat 1.27)
	for (const s of report.accepted.subjects) {
		await client.addSubject(
			engagementId,
			{
				name: s.name,
				definition: s.definition,
				...(s.requirementIds && s.requirementIds.length > 0 ? { requirement_ids: s.requirementIds } : {})
			},
			actorEmail
		);
	}

	// Étape 6 : Ingestion des questions
	for (const q of report.accepted.questions) {
		const qKey = `q-${q.id}`;
		await client.addQuestion(
			engagementId,
			{
				question: q.question,
				subject: q.subject,
				section: q.section,
				idempotency_key: qKey
			},
			actorEmail,
			qKey
		);
	}

	// Étape 7 : Ingestion des énoncés (idempotent) + affirmation sélective
	for (const st of report.accepted.statements) {
		const stmtKey = `stmt-${st.id}`;
		const addRes = await client.addStatement(
			engagementId,
			{
				subject: st.subject,
				value: st.value,
				confidence: st.confidence,
				section: st.section,
				predicate: st.predicate,
				role: st.role,
				verbatim: st.verbatim,
				origin: st.origin,
				idempotency_key: stmtKey
			},
			actorEmail,
			stmtKey
		);

		// Si l'énoncé a un valideur distinct qualifié et n'est pas encore active, on l'affirme
		if (st.willBeAsserted && st.validatorEmail && addRes.statement.status === 'proposed') {
			try {
				await client.assertStatement(engagementId, addRes.statement.id, st.validatorEmail);
			} catch (assertErr: any) {
				// Ne pas bloquer la migration si un conflit s'oppose à l'affirmation immédiate
				console.warn(`[Hub Migration] Affirmation de ${st.id} reportée :`, assertErr.message);
			}
		}
	}

	// Étape 8 : Avancement de la maturité des sujets
	for (const s of report.accepted.subjects) {
		if (s.level && s.level !== 'L0_named') {
			try {
				await client.advanceSubjectMaturity(engagementId, s.name, s.level, actorEmail);
			} catch (matErr: any) {
				// Si L3/L4 n'a pas encore d'énoncé affirmé, la maturité reste au niveau maximal permis
				console.warn(`[Hub Migration] Maturité ${s.level} pour '${s.name}' différée :`, matErr.message);
			}
		}
	}

	// Étape 9 : Bascule du système d'enregistrement dans la base locale
	const project = await prisma.project.findUnique({ where: { id: projectId } });
	const currentStrategy = typeof project?.strategy === 'string' ? JSON.parse(project.strategy || '{}') : (project?.strategy || {});
	const updatedStrategy = {
		...currentStrategy,
		systemOfRecord: 'hub',
		hubEngagementId: engagementId
	};

	await prisma.project.update({
		where: { id: projectId },
		data: {
			strategy: JSON.stringify(updatedStrategy),
			updatedAt: new Date()
		}
	});

	const cutoverAt = new Date().toISOString();
	return {
		ok: true,
		projectId,
		engagementId,
		systemOfRecord: 'hub',
		report,
		cutoverAt
	};
}
