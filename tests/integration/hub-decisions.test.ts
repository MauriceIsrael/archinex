/** Enregistrement d'une décision dans le Hub (#103) : ce qu'Archinex envoie, dans quel ordre, au nom de qui, et ce qu'il refuse. */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { recordDecisionInHub, HubDecisionError } from '$lib/server/projects/hubDecisions';
import { HubApiError } from '$lib/types/llmops';
import type { LLMOpsClient } from '$lib/server/llmops/client';

const PID = 'test-hub-decisions';
const SID = `${PID}-s1`;
const AUTHOR = 'user-hubdec-author';
const project = { id: PID, shortName: PID, strategy: JSON.stringify({ systemOfRecord: 'hub', hubEngagementId: 'eng-hubdec' }) };

type Call = { fn: string; args: unknown[] };
function fakeClient(opts: { status?: 'proposed' | 'active'; failOn?: Partial<Record<string, Error>> } = {}) {
	const calls: Call[] = [];
	const step = (fn: string, result: unknown) => async (...args: unknown[]) => {
		calls.push({ fn, args });
		const err = opts.failOn?.[fn];
		if (err) throw err;
		return result;
	};
	const client = {
		addRequirements: step('addRequirements', { created: [], unchanged: [] }),
		addSubject: step('addSubject', { created: true, subject: 's' }),
		addDecision: step('addDecision', { decision: { id: 'D-abc123', status: opts.status ?? 'proposed' }, created: true }),
		assertDecision: step('assertDecision', { decision: { id: 'D-abc123', status: 'active' } }),
		advanceSubjectMaturity: step('advanceSubjectMaturity', { subject: 's', level: 'L3_decided' })
	} as unknown as LLMOpsClient;
	return { client, calls };
}

const decisionRow = () => ({
	id: 'dec-hubdec-1',
	retainedOptionId: `${SID}-a`,
	rejected: JSON.stringify([{ optionId: `${SID}-b`, reason: 'Dépend du transport' }]),
	rationale: 'Une horloge locale tient 30 jours.',
	reversibility: 'costly',
	arbiterId: AUTHOR,
	acceptedViolations: JSON.stringify([{ typedId: 'principle:P-009', justification: 'Pilote seulement.' }])
});
const subjectRow = { id: SID, name: 'Autonomie', problemStatement: 'Tenir 30 jours' };
const FACTS = [{ key: 'topology.dc_count', value: 2, source_excerpt: 'sur deux sites' }];

describe('Décision d\'un projet basculé : envoi au Hub', () => {
	beforeAll(async () => {
		await prisma.project.deleteMany({ where: { id: PID } });
		await prisma.user.deleteMany({ where: { id: AUTHOR } });
		await prisma.user.create({ data: { id: AUTHOR, name: 'Alice', email: 'Alice.Author@exemple.org', passwordHash: 'h', role: 'lead_architect' } });
	});
	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: PID } });
		await prisma.user.deleteMany({ where: { id: AUTHOR } });
	});
	beforeEach(async () => {
		await prisma.project.deleteMany({ where: { id: PID } });
		await prisma.project.create({ data: { id: PID, shortName: PID, type: 'project_rfp', badge: 'RFP', title: 'Projet', description: 't', strategy: project.strategy } });
		await prisma.subject.create({ data: { id: SID, projectId: PID, sectionRef: '§1', name: 'Autonomie', maturityLevel: 'L2_decomposed' } });
		await prisma.option.createMany({
			data: [
				{ id: `${SID}-a`, subjectId: SID, title: 'Horloge locale', summary: 'a', origin: 'human', author: 'x', productionMode: 'human-authored', kbRefs: JSON.stringify(['pattern:PAT-001', 'ADR-0007', 'ADR-0007', '  ', 42]) },
				{ id: `${SID}-b`, subjectId: SID, title: 'Distribution réseau', summary: 'b', origin: 'human', author: 'x', productionMode: 'human-authored', kbRefs: JSON.stringify(['ADR-0001']) }
			]
		});
	});

	it('envoie le TEXTE des options (pas leurs identifiants), propose au nom de l\'auteur, puis affirme au nom d\'une autre personne', async () => {
		const { client, calls } = fakeClient();
		const res = await recordDecisionInHub(project, subjectRow, decisionRow(), FACTS, 'bob.decider@exemple.org', client);
		expect(res).toEqual({ hubDecisionId: 'D-abc123', alreadyAsserted: false });
		expect(calls.map((c) => c.fn)).toEqual(['addSubject', 'addDecision', 'assertDecision', 'advanceSubjectMaturity']);

		const [engagement, body, actor, key] = calls[1].args as [string, Record<string, unknown>, string, string];
		expect(engagement).toBe('eng-hubdec');
		expect(body).toEqual({
			subject: 'Autonomie',
			decision: 'Horloge locale',
			rationale: 'Une horloge locale tient 30 jours.',
			reversibility: 'costly',
			rejected: [{ option: 'Distribution réseau', reason: 'Dépend du transport' }],
			accepted_violations: [{ typed_id: 'principle:P-009', justification: 'Pilote seulement.' }],
			based_on: [{ id: 'ADR-0007' }, { id: 'pattern:PAT-001' }], // références de l'option RETENUE, dédoublonnées, triées
			facts: FACTS,
			portability: 'project_specific',
			harvestable: false
		});
		expect(JSON.stringify(body)).not.toContain(SID); // aucun identifiant d'Archinex
		expect(body).not.toHaveProperty('retained_option');
		expect(actor).toBe('alice.author@exemple.org'); // l'auteur, pas la personne qui affirme
		expect(key).toBe('dec-dec-hubdec-1'); // clé stable : un rejeu ne duplique rien
		// L'affirmation utilise l'identifiant RENVOYÉ PAR LE HUB, au nom d'une autre personne.
		expect(calls[2].args).toEqual(['eng-hubdec', 'D-abc123', 'bob.decider@exemple.org']);
		expect(calls[3].args).toEqual(['eng-hubdec', 'Autonomie', 'L3_decided', 'bob.decider@exemple.org']);
	});

	it('ne cite pas la base de connaissances quand l\'option retenue n\'en cite rien (aucun lien exigence → contrôle déclaré)', async () => {
		await prisma.option.update({ where: { id: `${SID}-a` }, data: { kbRefs: '[]' } });
		const { client, calls } = fakeClient();
		await recordDecisionInHub(project, subjectRow, decisionRow(), [], 'bob.decider@exemple.org', client);
		expect((calls.find((c) => c.fn === 'addDecision')!.args[1] as { based_on: unknown[] }).based_on).toEqual([]);
	});

	it('un rejeu sur une décision déjà affirmée au Hub n\'affirme pas deux fois', async () => {
		const { client, calls } = fakeClient({ status: 'active' });
		const res = await recordDecisionInHub(project, subjectRow, decisionRow(), [], 'bob@exemple.org', client);
		expect(res.alreadyAsserted).toBe(true);
		expect(calls.map((c) => c.fn)).not.toContain('assertDecision');
		expect(calls.map((c) => c.fn)).toContain('advanceSubjectMaturity');
	});

	it('une erreur du Hub n\'est jamais avalée : elle remonte avec son code, et rien ne suit', async () => {
		const { client, calls } = fakeClient({ failOn: { addDecision: new HubApiError(400, 'invalid_argument', "'decision' is required", { argument: 'decision' }) } });
		await expect(recordDecisionInHub(project, subjectRow, decisionRow(), [], 'bob@exemple.org', client)).rejects.toMatchObject({ status: 400, code: 'invalid_argument', argument: 'decision' });
		expect(calls.map((c) => c.fn)).toEqual(['addSubject', 'addDecision']);
	});

	it('l\'auto-validation refusée par le Hub remonte (409), sans avancer le sujet à L3', async () => {
		const { client, calls } = fakeClient({ failOn: { assertDecision: new HubApiError(409, 'self_validation', 'même personne') } });
		await expect(recordDecisionInHub(project, subjectRow, decisionRow(), [], 'alice.author@exemple.org', client)).rejects.toMatchObject({ status: 409, code: 'self_validation' });
		expect(calls.map((c) => c.fn)).not.toContain('advanceSubjectMaturity');
	});

	it('refuse sans appeler le Hub quand une option est introuvable ou que l\'auteur n\'a pas d\'adresse', async () => {
		const { client, calls } = fakeClient();
		await prisma.option.delete({ where: { id: `${SID}-b` } });
		await expect(recordDecisionInHub(project, subjectRow, decisionRow(), [], 'bob@exemple.org', client)).rejects.toMatchObject({ code: 'OPTION_UNKNOWN' });
		await expect(recordDecisionInHub(project, subjectRow, { ...decisionRow(), arbiterId: 'user-inconnu' }, [], 'bob@exemple.org', client)).rejects.toBeInstanceOf(HubDecisionError);
		expect(calls).toEqual([]);
	});

	it('accepte comme auteur une adresse e-mail directe', async () => {
		const { client, calls } = fakeClient();
		await recordDecisionInHub(project, subjectRow, { ...decisionRow(), arbiterId: 'Carl@Exemple.org' }, [], 'bob@exemple.org', client);
		expect((calls.find((c) => c.fn === 'addDecision')!.args as unknown[])[2]).toBe('carl@exemple.org');
	});
});
