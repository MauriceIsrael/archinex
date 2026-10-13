/**
 * Contrat réel Archinex ⇄ Hub 1.27 : décision sur les exigences d'un projet basculé, jusqu'à l'instantané scellé.
 * À exécuter contre un VRAI Hub (pas de faux) :
 *
 *   # dans LLMOps (contrat 1.27) : un serveur avec les jetons arx-token (eng:delegate) et suite-token (eng:service)
 *   LLMOPS_LIVE_URL=http://127.0.0.1:8099 npx vitest run tests/contract/hub-requirements-live.test.ts
 *
 * Sans LLMOPS_LIVE_URL, ces tests sont ignorés (comme les autres tests « live »).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { LLMOpsClient } from '$lib/server/llmops/client';
import { saveRequirementAudit } from '$lib/server/projects/requirementsDb';
import {
	reconcileRequirementsToHub,
	proposeRequirementDecision,
	assertRequirementDecision,
	withdrawRequirementDecision
} from '$lib/server/projects/hubRequirementDecisions';
import { requireVerifiedHubSnapshot, hubSnapshotProblems } from '$lib/domain/hubSnapshot';
import { renderTraceabilityView, viewFromHubSnapshot } from '$lib/domain/traceability';
import { hubRequirementId } from '$lib/domain/hubRequirementId';
import { buildRequirementAudit, requirementBundleId, sourceSha256, type ReviewedClause } from '$lib/domain/requirementAudit';
import { HubApiError } from '$lib/types/llmops';

const LIVE = process.env.LLMOPS_LIVE_URL;
const ADA = 'ada@example.org'; // admin
const DAN = 'dan@example.org'; // decider
const CARL = 'carl@example.org'; // contributor

const RUN = Math.floor(1000 + Math.random() * 9000);
const ENG = `live-req-${RUN}`;
const PID = `test-live-hub-req-${RUN}`;
const RFP = `Texte intégral du RFP du test réel ${RUN}.`;
const SHA = sourceSha256(RFP);
const R1 = requirementBundleId(SHA, 'R-1');
const R2 = requirementBundleId(SHA, 'R-2');
const R3 = requirementBundleId(SHA, 'REQ-Lot1-960#2');

const clauses: ReviewedClause[] = [
	{ clauseRef: 'R-1', title: 'Autonomie', text: 'Autonomie de 30 jours.', criticality: 'bloquant', disposition: 'deliberated', deliberationReason: 'Coût contre dépendance' },
	{ clauseRef: 'R-2', title: 'Mobilier', text: 'Six postes de travail.', criticality: 'info', disposition: 'evacuated', evacuationReason: 'Hors périmètre technique' },
	{ clauseRef: 'REQ-Lot1-960#2', title: 'Chiffrement', text: 'Tous les flux de gestion sont chiffrés.', criticality: 'majeur', disposition: 'to_qualify', qualifyReason: 'Indécis' }
];

describe.skipIf(!LIVE)('Hub réel 1.27 : décisions sur les exigences d\'un projet basculé', () => {
	let arx: LLMOpsClient; // jeton « eng:delegate » : agit au nom d'une personne (X-Actor-Email)
	let suite: LLMOpsClient; // jeton « eng:service » : lit l'instantané
	let project: { id: string; shortName: string; strategy: string };

	beforeAll(async () => {
		const operator = new LLMOpsClient({ baseUrl: LIVE!, authToken: 'demo-token' });
		arx = new LLMOpsClient({ baseUrl: LIVE!, authToken: 'arx-token' });
		suite = new LLMOpsClient({ baseUrl: LIVE!, authToken: 'suite-token' });

		await operator.createManagedEngagement({ engagement: ENG, confidentiality: 'internal', admin_email: ADA, admin_handle: '@ada' });
		await arx.setEngagementMembers(
			ENG,
			[
				{ email: ADA, handle: '@ada', role: 'admin' },
				{ email: DAN, handle: '@dan', role: 'decider' },
				{ email: CARL, handle: '@carl', role: 'contributor' }
			],
			ADA
		);

		await prisma.project.deleteMany({ where: { id: PID } });
		const strategy = JSON.stringify({ systemOfRecord: 'hub', hubEngagementId: ENG });
		await prisma.project.create({ data: { id: PID, shortName: PID, type: 'project_rfp', badge: 'RFP', title: 'Projet réel', description: 't', strategy } });
		await saveRequirementAudit(
			PID,
			buildRequirementAudit({ sourceText: RFP, sourceTitle: 'RFP réel', model: 'm', auditedAt: '2026-10-01T08:00:00.000Z', reviewed: clauses, confirmedDeliberated: [] }),
			'@ada'
		);
		await prisma.subject.create({
			data: { id: `${PID}-s1`, projectId: PID, sectionRef: '§1', name: 'Autonomie et mobilier', maturityLevel: 'L1_framed', requirementRefs: JSON.stringify([R1, R2]) }
		});
		project = { id: PID, shortName: PID, strategy };
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: PID } });
	});

	it('1. met le Hub au niveau : exigences (avec un identifiant que le Hub accepte) et sujet qui les porte', async () => {
		const res = await reconcileRequirementsToHub(project, CARL, arx);
		expect(res).toEqual({ requirements: 3, subjects: 1 });
		const again = await reconcileRequirementsToHub(project, CARL, arx); // idempotent
		expect(again).toEqual({ requirements: 3, subjects: 1 });
	});

	it('2. un contributeur n\'affirme pas ; un décideur n\'affirme pas sa propre proposition', async () => {
		await proposeRequirementDecision(project, R2, { disposition: 'evacuated', reason: 'Hors périmètre technique' }, CARL, arx);
		await expect(assertRequirementDecision(project, R2, CARL, arx)).rejects.toMatchObject({ status: 403, reason: 'role_insufficient' });
		await withdrawRequirementDecision(project, R2, CARL, arx);
		// Le décideur propose lui-même : il ne peut pas l'affirmer (409 self_validation), même avec le bon rôle.
		await proposeRequirementDecision(project, R2, { disposition: 'evacuated', reason: 'Hors périmètre technique' }, DAN, arx);
		await expect(assertRequirementDecision(project, R2, DAN, arx)).rejects.toMatchObject({ status: 409, code: 'self_validation' });
		await withdrawRequirementDecision(project, R2, DAN, arx);
		await proposeRequirementDecision(project, R2, { disposition: 'evacuated', reason: 'Hors périmètre technique' }, CARL, arx);
	});

	it('3. un décideur distinct affirme ; le sujet qui portait l\'exigence évacuée la libère, dans le Hub puis en local', async () => {
		const res = await assertRequirementDecision(project, R2, DAN, arx);
		expect(res.requirement.disposition).toMatchObject({ value: 'evacuated', status: 'active', author: '@carl', validated_by: '@dan' });
		const s = await prisma.subject.findUniqueOrThrow({ where: { id: `${PID}-s1` } });
		expect(JSON.parse(s.requirementRefs)).toEqual([R1]);
	});

	it('4. le Hub refuse une évacuation sans motif, avec le champ concerné', async () => {
		const err = await proposeRequirementDecision(project, R1, { disposition: 'evacuated', reason: 'non' }, CARL, arx).catch((e) => e);
		expect(err).toBeInstanceOf(HubApiError);
		expect(err.status).toBe(400);
		expect(err.argument).toBe('reason');
	});

	it('5. on retire une décision proposée puis on en reprend une autre', async () => {
		await proposeRequirementDecision(project, R1, { disposition: 'clarification_needed', reason: 'Quelle autonomie minimale est exigée ?' }, CARL, arx);
		await withdrawRequirementDecision(project, R1, CARL, arx);
		await proposeRequirementDecision(project, R1, { disposition: 'deliberated' }, CARL, arx);
		const res = await assertRequirementDecision(project, R1, DAN, arx);
		expect(res.requirement.disposition).toMatchObject({ value: 'deliberated', status: 'active' });
	});

	it('6. l\'instantané scellé par le Hub se relit, son sceau se vérifie ici, et la matrice se rend depuis lui seul', async () => {
		const issued = await arx.exportEngagementSnapshot(ENG, ADA);
		const env = await suite.getEngagementExport(ENG, issued.snapshotRef.snapshotId);
		// Le sceau du Hub (Python) est recalculé ici (TypeScript) : les deux profils canoniques coïncident à l'octet.
		expect(hubSnapshotProblems(env)).toEqual([]);
		const snap = requireVerifiedHubSnapshot(env);
		expect(snap.schemaVersion).toBe('1.6');
		expect(snap.checksum).toBe(issued.snapshotRef.checksum);

		const byId = new Map(snap.data.requirements.map((r) => [r.id, r]));
		expect(byId.get(R1)!.disposition).toMatchObject({ value: 'deliberated', assertion_level: 'asserted', validated_by: '@dan' });
		expect(byId.get(R2)!.disposition).toMatchObject({ value: 'evacuated', assertion_level: 'asserted', author: '@carl', validated_by: '@dan' });
		expect(byId.get(hubRequirementId(R3))!.disposition).toBeUndefined(); // « à qualifier » n'existe pas au Hub
		const subject = snap.data.subjects.find((s) => s.name === 'Autonomie et mobilier')!;
		expect(subject.requirement_ids).toEqual([R1]);

		const md = renderTraceabilityView(viewFromHubSnapshot(snap));
		expect(md).toMatch(/R-1.*À délibérer.*décidé par une personne.*@dan.*Autonomie et mobilier/);
		expect(md).toMatch(/R-2.*Évacuée.*@dan \(proposé par @carl\)/);
		expect(md).toMatch(/Sans décision/);
		expect(md).not.toContain('example.org');
		// Même instantané, même texte.
		expect(renderTraceabilityView(viewFromHubSnapshot(snap))).toBe(md);
	});

	it('7. un instantané altéré après coup est refusé à la lecture', async () => {
		const issued = await arx.exportEngagementSnapshot(ENG, ADA);
		const env = JSON.parse(JSON.stringify(await suite.getEngagementExport(ENG, issued.snapshotRef.snapshotId)));
		env.data.requirements[0].text = 'Texte modifié après coup';
		expect(hubSnapshotProblems(env).join(' ')).toMatch(/sceau/);
		expect(() => requireVerifiedHubSnapshot(env)).toThrow(/refusé/);
	});

	it('8. une exigence à délibérer qu\'aucun sujet ne porte arrête l\'émission du Hub', async () => {
		await arx.carrySubjectRequirements(ENG, 'Autonomie et mobilier', { remove: [R1] }, CARL);
		const err = await arx.exportEngagementSnapshot(ENG, ADA).catch((e) => e);
		expect(err).toBeInstanceOf(HubApiError);
		expect(JSON.stringify(err.details)).toContain('REQ_UNCOVERED');
		// Le rattachement remis, l'émission redevient possible : réconciliation avant scellement.
		await reconcileRequirementsToHub(project, CARL, arx);
		// (le local ne porte plus R1 ? il le porte : la libération n'a eu lieu que pour R2)
		await expect(arx.exportEngagementSnapshot(ENG, ADA)).resolves.toBeTruthy();
	});
});
