/**
 * Décisions sur les exigences d'un projet basculé sur le Hub (contrat 1.27) : ce que fait Archinex, et ce qu'il ne fait pas.
 * Le client du Hub est un faux qui enregistre les appels ; le Hub réel est exercé par tests/live/hub-requirements-live.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { saveRequirementAudit } from '$lib/server/projects/requirementsDb';
import {
	proposeRequirementDecision,
	assertRequirementDecision,
	reconcileRequirementsToHub
} from '$lib/server/projects/hubRequirementDecisions';
import { simulateProjectMigration } from '$lib/server/projects/hubMigrationService';
import { hubRequirementId } from '$lib/domain/hubRequirementId';
import { buildRequirementAudit, requirementBundleId, sourceSha256, type ReviewedClause } from '$lib/domain/requirementAudit';
import { HubApiError } from '$lib/types/llmops';
import type { LLMOpsClient } from '$lib/server/llmops/client';

const PID = 'test-hub-req-decisions';
const USER = 'user-hub-req-admin';
const RFP = 'Texte intégral du RFP pour les décisions sur les exigences.';
const SHA = sourceSha256(RFP);
const R1 = requirementBundleId(SHA, 'R-1');
const R2 = requirementBundleId(SHA, 'R-2');
const R3 = requirementBundleId(SHA, 'REQ-Lot1-960#2'); // un « # » que le Hub refuse

const clauses: ReviewedClause[] = [
	{ clauseRef: 'R-1', title: 'Autonomie', text: 'Autonomie 30 jours.', criticality: 'bloquant', disposition: 'deliberated', deliberationReason: 'Coût contre dépendance' },
	{ clauseRef: 'R-2', title: 'Mobilier', text: 'Six postes.', criticality: 'info', disposition: 'evacuated', evacuationReason: 'Hors périmètre technique' },
	{ clauseRef: 'REQ-Lot1-960#2', title: 'Chiffrement', text: 'Flux chiffrés.', criticality: 'majeur', disposition: 'to_qualify', qualifyReason: 'Indécis' }
];

type Call = { fn: string; args: unknown[] };
function fakeClient(opts: { assertFails?: (n: number) => Error | null } = {}) {
	const calls: Call[] = [];
	let asserts = 0;
	const client = {
		addRequirements: async (...args: unknown[]) => (calls.push({ fn: 'addRequirements', args }), { created: [], unchanged: [] }),
		addSubject: async (...args: unknown[]) => (calls.push({ fn: 'addSubject', args }), { created: true, subject: 's' }),
		proposeRequirementDisposition: async (...args: unknown[]) => (calls.push({ fn: 'propose', args }), { created: true, requirement: { id: String(args[1]) } }),
		assertRequirementDisposition: async (...args: unknown[]) => {
			calls.push({ fn: 'assert', args });
			const err = opts.assertFails?.(++asserts);
			if (err) throw err;
			return { requirement: { id: String(args[1]) } };
		},
		withdrawRequirementDisposition: async (...args: unknown[]) => (calls.push({ fn: 'withdraw', args }), { requirement: { id: String(args[1]) } }),
		carrySubjectRequirements: async (...args: unknown[]) => (calls.push({ fn: 'carry', args }), { subject: String(args[1]), requirement_ids: [] })
	} as unknown as LLMOpsClient;
	return { client, calls };
}

const project = { id: PID, shortName: PID, strategy: JSON.stringify({ systemOfRecord: 'hub', hubEngagementId: 'eng-hub-req' }) };

async function clean() {
	await prisma.project.deleteMany({ where: { id: PID } });
	await prisma.user.deleteMany({ where: { id: USER } });
}

describe('Décisions sur les exigences d\'un projet basculé', () => {
	beforeAll(async () => {
		await clean();
		await prisma.user.create({ data: { id: USER, name: 'Alice', email: 'alice.admin@exemple.org', passwordHash: 'h', role: 'admin' } });
	});
	afterAll(clean);

	beforeEach(async () => {
		await prisma.project.deleteMany({ where: { id: PID } });
		await prisma.project.create({
			data: { id: PID, shortName: PID, type: 'project_rfp', badge: 'RFP', title: 'Projet test', description: 't', strategy: project.strategy }
		});
		await prisma.projectMember.create({ data: { projectId: PID, userId: USER, role: 'lead_architect', domains: '[]' } });
		await saveRequirementAudit(
			PID,
			buildRequirementAudit({ sourceText: RFP, sourceTitle: 'RFP test', model: 'm', auditedAt: '2026-10-01T08:00:00.000Z', reviewed: clauses, confirmedDeliberated: ['R-1'] }),
			'@alice'
		);
		await prisma.subject.create({
			data: { id: `${PID}-s1`, projectId: PID, sectionRef: '§1', name: 'Autonomie', maturityLevel: 'L1_framed', requirementRefs: JSON.stringify([R1, R2]) }
		});
	});

	it('propose dans le Hub après s\'être assuré que l\'exigence y existe, au nom de la session, sans rien écrire en local', async () => {
		const { client, calls } = fakeClient();
		await proposeRequirementDecision(project, R2, { disposition: 'evacuated', reason: 'Hors périmètre technique' }, 'alice.admin@exemple.org', client);
		expect(calls.map((c) => c.fn)).toEqual(['addRequirements', 'propose']);
		const sent = (calls[0].args[1] as { requirements: Array<Record<string, unknown>> }).requirements[0];
		expect(sent).toMatchObject({ id: R2, section: 'R-2', criticality: 'info' });
		expect(sent).not.toHaveProperty('bundleId');
		expect(calls[1].args).toEqual(['eng-hub-req', R2, { disposition: 'evacuated', reason: 'Hors périmètre technique' }, 'alice.admin@exemple.org']);
		// Une seule source de vérité : la décision humaine n'est écrite que dans le Hub.
		const row = await prisma.requirement.findFirstOrThrow({ where: { clauseRef: 'R-2', source: { projectId: PID } } });
		expect(row.decidedDisposition).toBeNull();
	});

	it('transmet au Hub un identifiant qu\'il accepte quand la référence de la clause ne l\'est pas', async () => {
		const { client, calls } = fakeClient();
		await proposeRequirementDecision(project, R3, { disposition: 'deliberated' }, 'alice.admin@exemple.org', client);
		const id = (calls[0].args[1] as { requirements: Array<{ id: string }> }).requirements[0].id;
		expect(id).toBe(hubRequirementId(R3));
		expect(id).not.toContain('#');
	});

	it('refuse une exigence inconnue, un texte trop long pour le Hub et une adresse e-mail', async () => {
		const { client } = fakeClient();
		await expect(proposeRequirementDecision(project, 'SRC-00000000:X', { disposition: 'deliberated' }, 'a@b.org', client)).rejects.toThrow(/NOT_FOUND/);
		await prisma.requirement.updateMany({ where: { clauseRef: 'R-2', source: { projectId: PID } }, data: { text: 'x'.repeat(4001) } });
		await expect(proposeRequirementDecision(project, R2, { disposition: 'evacuated', reason: 'Hors périmètre technique' }, 'a@b.org', client)).rejects.toThrow(/TEXT_TOO_LONG/);
		await prisma.requirement.updateMany({ where: { clauseRef: 'R-2', source: { projectId: PID } }, data: { text: 'Contact: jane.doe@exemple.org' } });
		await expect(proposeRequirementDecision(project, R2, { disposition: 'evacuated', reason: 'Hors périmètre technique' }, 'a@b.org', client)).rejects.toThrow(/EMAIL/);
	});

	it('affirme sans toucher aux sujets quand le Hub accepte', async () => {
		const { client, calls } = fakeClient();
		await assertRequirementDecision(project, R2, 'bob.decider@exemple.org', client);
		expect(calls.map((c) => c.fn)).toEqual(['assert']);
	});

	it('quand un sujet porte encore l\'exigence, la retire dans le Hub puis en local, et réessaie une seule fois', async () => {
		const { client, calls } = fakeClient({
			assertFails: (n) => (n === 1 ? new HubApiError(409, 'carried_by_subject', 'portée', { subjects: ['Autonomie'] }) : null)
		});
		await assertRequirementDecision(project, R2, 'bob.decider@exemple.org', client);
		expect(calls.map((c) => c.fn)).toEqual(['assert', 'carry', 'assert']);
		expect(calls[1].args).toEqual(['eng-hub-req', 'Autonomie', { remove: [R2] }, 'bob.decider@exemple.org']);
		const s = await prisma.subject.findUniqueOrThrow({ where: { id: `${PID}-s1` } });
		expect(JSON.parse(s.requirementRefs)).toEqual([R1]);
	});

	it('si le second essai échoue aussi, l\'erreur du Hub remonte telle quelle (pas de boucle)', async () => {
		const { client, calls } = fakeClient({ assertFails: () => new HubApiError(409, 'carried_by_subject', 'portée', { subjects: ['Autonomie'] }) });
		await expect(assertRequirementDecision(project, R2, 'bob@x.org', client)).rejects.toMatchObject({ code: 'carried_by_subject' });
		expect(calls.filter((c) => c.fn === 'assert')).toHaveLength(2);
	});

	it('une autre erreur du Hub (auto-validation) remonte sans retirer personne d\'un sujet', async () => {
		const { client, calls } = fakeClient({ assertFails: () => new HubApiError(409, 'self_validation', 'même personne') });
		await expect(assertRequirementDecision(project, R2, 'alice@x.org', client)).rejects.toMatchObject({ code: 'self_validation' });
		expect(calls.map((c) => c.fn)).toEqual(['assert']);
		const s = await prisma.subject.findUniqueOrThrow({ where: { id: `${PID}-s1` } });
		expect(JSON.parse(s.requirementRefs)).toEqual([R1, R2]);
	});

	it('met le Hub au niveau de l\'état local : exigences, puis sujets qui les portent, avec des identifiants Hub', async () => {
		const { client, calls } = fakeClient();
		const res = await reconcileRequirementsToHub(project, 'alice.admin@exemple.org', client);
		expect(res).toEqual({ requirements: 3, subjects: 1 });
		expect(calls.map((c) => c.fn)).toEqual(['addRequirements', 'addSubject']);
		const subj = calls[1].args[1] as { name: string; requirement_ids: string[] };
		expect(subj).toMatchObject({ name: 'Autonomie', requirement_ids: [R1, R2] });
	});

	it('envoie les exigences au Hub par lots de 500 au plus', async () => {
		const many: ReviewedClause[] = Array.from({ length: 1201 }, (_, i) => ({
			clauseRef: `M-${i}`, title: `Clause ${i}`, text: `Texte ${i}`, criticality: 'info', disposition: 'evacuated', evacuationReason: 'Hors périmètre technique'
		}));
		const bigText = 'RFP volumineux pour le test des lots';
		await saveRequirementAudit(PID, buildRequirementAudit({ sourceText: bigText, sourceTitle: 'Gros RFP', model: 'm', auditedAt: '2026-10-01T08:00:00.000Z', reviewed: many, confirmedDeliberated: [] }), '@alice');
		const { client, calls } = fakeClient();
		await reconcileRequirementsToHub(project, 'alice@x.org', client);
		const sizes = calls.filter((c) => c.fn === 'addRequirements').map((c) => (c.args[1] as { requirements: unknown[] }).requirements.length);
		expect(sizes.reduce((a, b) => a + b, 0)).toBe(1204);
		expect(Math.max(...sizes)).toBeLessThanOrEqual(500);
	});
});

describe('Migration : exigences auditées', () => {
	beforeAll(async () => {
		await clean();
		await prisma.user.create({ data: { id: USER, name: 'Alice', email: 'alice.admin@exemple.org', passwordHash: 'h', role: 'admin' } });
	});
	afterAll(clean);

	beforeEach(async () => {
		await prisma.project.deleteMany({ where: { id: PID } });
		await prisma.project.create({ data: { id: PID, shortName: PID, type: 'project_rfp', badge: 'RFP', title: 'Projet migration', description: 't' } });
		await prisma.projectMember.create({ data: { projectId: PID, userId: USER, role: 'lead_architect', domains: '[]' } });
		await saveRequirementAudit(
			PID,
			buildRequirementAudit({ sourceText: RFP, sourceTitle: 'RFP test', model: 'm', auditedAt: '2026-10-01T08:00:00.000Z', reviewed: clauses, confirmedDeliberated: ['R-1'] }),
			'@alice',
			new Date('2026-10-02T09:00:00Z')
		);
		await prisma.subject.create({
			data: { id: `${PID}-s1`, projectId: PID, sectionRef: '§1', name: 'Autonomie', maturityLevel: 'L1_framed', requirementRefs: JSON.stringify([R1]) }
		});
	});

	it('reprend les exigences avec des identifiants Hub et le rattachement des sujets', async () => {
		const report = await simulateProjectMigration(PID);
		expect(report.ok).toBe(true);
		const ids = report.accepted.requirements.map((r) => r.id);
		expect(ids).toContain(R1);
		expect(ids).toContain(hubRequirementId(R3));
		expect(report.accepted.subjects[0].requirementIds).toEqual([R1]);
		expect(report.accepted.requirements.find((r) => r.id === R1)).toMatchObject({ section: 'R-1', criticality: 'bloquant' });
	});

	it('n\'affirme rien au nom du lot : une décision humaine déjà prise est listée pour être réaffirmée', async () => {
		const report = await simulateProjectMigration(PID);
		expect(report.dispositionsToReassert).toEqual([
			{ requirementId: R1, hubRequirementId: R1, disposition: 'deliberated', reason: null, decidedBy: '@alice', decidedAt: '2026-10-02T09:00:00.000Z' }
		]);
	});

	it('refuse la migration plutôt que de tronquer un texte ou de laisser passer une adresse e-mail', async () => {
		await prisma.requirement.updateMany({ where: { clauseRef: 'R-2', source: { projectId: PID } }, data: { text: 'x'.repeat(4001) } });
		await prisma.requirement.updateMany({ where: { clauseRef: 'R-1', source: { projectId: PID } }, data: { text: 'Écrire à jane.doe@exemple.org' } });
		const report = await simulateProjectMigration(PID);
		expect(report.ok).toBe(false);
		expect(report.rejected.map((r) => r.code)).toEqual(expect.arrayContaining(['TEXT_TOO_LONG', 'EMAIL']));
	});

	it('un sujet qui porte une exigence non reprise est un rejet visible, pas une omission', async () => {
		await prisma.subject.update({ where: { id: `${PID}-s1` }, data: { requirementRefs: JSON.stringify(['SRC-ffffffff:X']) } });
		const report = await simulateProjectMigration(PID);
		expect(report.ok).toBe(false);
		expect(report.rejected.some((r) => r.code === 'DANGLING' && r.entityId === 'SRC-ffffffff:X')).toBe(true);
	});
});
