/**
 * Parité réelle entre le dossier scellé d'Archinex et l'instantané du Hub (archinex#34), sur UN scénario construit des deux
 * côtés : le dossier par l'assemblage d'Archinex sur sa base, l'instantané par le VRAI Hub.
 *
 *   LLMOPS_LIVE_URL=http://127.0.0.1:8099 npx vitest run tests/contract/hub-parity-live.test.ts
 *
 * Le test fixe la liste exacte de ce que le Hub ne porte pas encore : si le Hub gagne une section, ou en perd une, il échoue
 * et la doc `docs/hub-parity.md` doit suivre. L'écart est listé, jamais masqué.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { LLMOpsClient } from '$lib/server/llmops/client';
import { saveRequirementAudit, decideRequirement } from '$lib/server/projects/requirementsDb';
import { exportEngagementBundle } from '$lib/server/bundleExportService';
import { reconcileRequirementsToHub, proposeRequirementDecision, assertRequirementDecision } from '$lib/server/projects/hubRequirementDecisions';
import { requireVerifiedHubSnapshot } from '$lib/domain/hubSnapshot';
import { compareBundleWithHubSnapshot, renderParityReport } from '$lib/domain/hubParity';
import { renderTraceabilityMatrix } from '$lib/domain/bundleRtm';
import { renderTraceabilityView, viewFromHubSnapshot } from '$lib/domain/traceability';
import { buildRequirementAudit, requirementBundleId, sourceSha256, type ReviewedClause } from '$lib/domain/requirementAudit';

const LIVE = process.env.LLMOPS_LIVE_URL;
const ADA = 'ada@example.org';
const DAN = 'dan@example.org';
const CARL = 'carl@example.org';
const RUN = Math.floor(1000 + Math.random() * 9000);
const ENG = `live-parity-${RUN}`;
const PID = `test-live-parity-${RUN}`;
const RFP = `Texte intégral du RFP de parité ${RUN}.`;
const SHA = sourceSha256(RFP);
const R1 = requirementBundleId(SHA, 'R-1');
const R2 = requirementBundleId(SHA, 'R-2');
const R3 = requirementBundleId(SHA, 'R-3');
const RATIONALE = 'Une horloge locale tient 30 jours sans dépendre du transport.';
const REASON = 'Hors périmètre technique';

const clauses: ReviewedClause[] = [
	{ clauseRef: 'R-1', title: 'Autonomie', text: 'Autonomie de 30 jours.', criticality: 'bloquant', disposition: 'deliberated', deliberationReason: 'Coût contre dépendance' },
	{ clauseRef: 'R-2', title: 'Mobilier', text: 'Six postes de travail.', criticality: 'info', disposition: 'evacuated', evacuationReason: REASON },
	{ clauseRef: 'R-3', title: 'Chiffrement', text: 'Tous les flux de gestion sont chiffrés.', criticality: 'majeur', disposition: 'to_qualify', qualifyReason: 'Indécis' }
];

describe.skipIf(!LIVE)('Parité dossier d\'Archinex / instantané du Hub (scénario réel)', () => {
	let report: ReturnType<typeof compareBundleWithHubSnapshot>;
	let bundleMd: string;
	let hubMd: string;

	beforeAll(async () => {
		const operator = new LLMOpsClient({ baseUrl: LIVE!, authToken: 'demo-token' });
		const arx = new LLMOpsClient({ baseUrl: LIVE!, authToken: 'arx-token' });
		const suite = new LLMOpsClient({ baseUrl: LIVE!, authToken: 'suite-token' });

		// ── Côté Archinex : un projet NON basculé, état local, dossier scellé par l'assemblage ──────────────────────
		await prisma.project.deleteMany({ where: { id: PID } });
		await prisma.project.create({ data: { id: PID, shortName: PID, type: 'project_rfp', badge: 'RFP', title: 'Projet de parité', description: 't' } });
		await saveRequirementAudit(
			PID,
			buildRequirementAudit({ sourceText: RFP, sourceTitle: 'RFP de parité', model: 'm', auditedAt: '2026-10-01T08:00:00.000Z', reviewed: clauses, confirmedDeliberated: ['R-1'] }),
			'@dan',
			new Date('2026-10-02T09:00:00Z')
		);
		await decideRequirement(PID, R2, { disposition: 'evacuated', reason: REASON }, '@dan', new Date('2026-10-02T10:00:00Z'));
		const sid = `${PID}-s1`;
		await prisma.subject.create({ data: { id: sid, projectId: PID, sectionRef: '§1', name: 'Autonomie', maturityLevel: 'L3_decided', requirementRefs: JSON.stringify([R1]) } });
		await prisma.option.createMany({
			data: [
				{ id: `${sid}-a`, subjectId: sid, title: 'Horloge locale', summary: 'a', origin: 'human', author: 'carl@example.org', productionMode: 'human-authored' },
				{ id: `${sid}-b`, subjectId: sid, title: 'Distribution réseau', summary: 'b', origin: 'human', author: 'carl@example.org', productionMode: 'human-authored' }
			]
		});
		await prisma.decision.create({
			data: {
				id: `${sid}-d`, subjectId: sid, retainedOptionId: `${sid}-a`, rejected: JSON.stringify([{ optionId: `${sid}-b`, reason: 'Dépend du transport' }]),
				rationale: RATIONALE, reversibility: 'costly', arbiterId: DAN, arbiterRole: 'domain_expert', decidedAt: new Date('2026-10-03T10:00:00Z')
			}
		});
		await prisma.statement.create({
			data: {
				id: `${PID}-st1`, projectId: PID, subjectId: sid, section: '§1', subjectRef: 'Autonomie', predicate: 'has_property', value: 'holdover 30 j',
				author: CARL, role: 'domain_architect', productionMode: 'human-authored', confidence: 'designed', subjectLevel: 'L3_decided', status: 'active'
			}
		});
		const { bundle } = await exportEngagementBundle({ projectId: PID, confidentiality: 'internal', actorHandle: '@ada' });

		// ── Côté Hub : le même état, par les gestes du Hub (proposer puis affirmer par une autre personne) ───────────
		await operator.createManagedEngagement({ engagement: ENG, confidentiality: 'internal', admin_email: ADA, admin_handle: '@ada' });
		await arx.setEngagementMembers(ENG, [
			{ email: ADA, handle: '@ada', role: 'admin' },
			{ email: DAN, handle: '@dan', role: 'decider' },
			{ email: CARL, handle: '@carl', role: 'contributor' }
		], ADA);
		const hubProject = { id: PID, shortName: PID, strategy: JSON.stringify({ hubEngagementId: ENG }) };
		await reconcileRequirementsToHub(hubProject, CARL, arx);
		await proposeRequirementDecision(hubProject, R1, { disposition: 'deliberated' }, CARL, arx);
		await assertRequirementDecision(hubProject, R1, DAN, arx);
		await proposeRequirementDecision(hubProject, R2, { disposition: 'evacuated', reason: REASON }, CARL, arx);
		await assertRequirementDecision(hubProject, R2, DAN, arx);
		const dec = (await arx.addDecision(
			ENG,
			{ subject: 'Autonomie', decision: 'Horloge locale', rationale: RATIONALE, reversibility: 'costly', rejected: [{ option: 'Distribution réseau', reason: 'Dépend du transport' }], facts: [] } as never,
			CARL,
			'parity-dec'
		)) as unknown as { decision: { id: string } };
		await arx.assertDecision(ENG, dec.decision.id, DAN);
		const st = await arx.addStatement(ENG, { subject: 'Autonomie', value: 'holdover 30 j', confidence: 'designed', section: '§1', predicate: 'has_property' } as never, CARL, 'parity-st');
		await arx.assertStatement(ENG, st.statement.id, DAN);
		await arx.advanceSubjectMaturity(ENG, 'Autonomie', 'L3_decided', DAN);

		const issued = await arx.exportEngagementSnapshot(ENG, ADA);
		const snapshot = requireVerifiedHubSnapshot(await suite.getEngagementExport(ENG, issued.snapshotRef.snapshotId));

		report = compareBundleWithHubSnapshot(bundle, snapshot);
		bundleMd = renderTraceabilityMatrix(bundle);
		hubMd = renderTraceabilityView(viewFromHubSnapshot(snapshot));
		console.log('\n' + renderParityReport(report));
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: PID } });
	});

	it('ce que le Hub porte coïncide avec le dossier : aucun écart de contenu', () => {
		expect(report.differences).toEqual([]);
	});

	it('les sections que le Hub ne porte pas encore sont exactement celles-ci (liste fermée, à tenir à jour)', () => {
		expect(report.absentInHub.sort()).toEqual(['architecture', 'glossary', 'reuse_log', 'source_documents']);
	});

	it('exigences, sujets, décisions et énoncés sont couverts', () => {
		const status = Object.fromEntries(report.sections.map((s) => [s.section, s.status]));
		expect(status).toMatchObject({ requirements: 'covered', subjects: 'covered', decisions: 'covered', statements: 'covered' });
	});

	it('ce que ce scénario n\'éprouve pas est dit comme tel (jamais « couverte » sur zéro élément)', () => {
		const notExercised = report.sections.filter((s) => s.status === 'not_exercised').map((s) => s.section).sort();
		// Le scénario ne cite aucun élément de la base : aucune couverture n'est déclarée, rien n'est comparé (couvert par hub-compliance-live).
		expect(notExercised).toEqual(['compliance', 'conflicts', 'kb_references']);
	});

	it('la matrice de traçabilité dit la même chose des exigences décidées, depuis l\'un ou l\'autre artefact', () => {
		for (const md of [bundleMd, hubMd]) {
			expect(md).toMatch(/R-1.*À délibérer/);
			expect(md).toMatch(/R-2.*Évacuée/);
		}
		// Seul le dossier connaît la proposition brute du modèle (« à qualifier ») ; le Hub n'engage que ce qu'une personne a décidé.
		expect(bundleMd).toMatch(/R-3.*À qualifier/);
		expect(hubMd).toMatch(/Sans décision/);
		void R3;
	});
});
