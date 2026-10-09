import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { saveRequirementAudit, decideRequirement } from '$lib/server/projects/requirementsDb';
import { exportEngagementBundle } from '$lib/server/bundleExportService';
import { verifyEngagementBundle } from '$lib/domain/bundleVerifier';
import { renderTraceabilityMatrix } from '$lib/domain/bundleRtm';
import { buildRequirementAudit, requirementBundleId, sourceSha256, type ReviewedClause } from '$lib/domain/requirementAudit';

const PID = 'test-req-persistence';
const RFP_TEXT = 'Texte intégral du RFP de test pour la persistance des exigences.';
const SHA = sourceSha256(RFP_TEXT);

const clauses: ReviewedClause[] = [
	{ clauseRef: 'R-1', title: 'Autonomie', text: 'Autonomie 30 jours.', criticality: 'bloquant', disposition: 'deliberated', deliberationReason: 'Coût contre dépendance' },
	{ clauseRef: 'R-2', title: 'Mobilier', text: 'Six postes.', criticality: 'info', disposition: 'evacuated', evacuationReason: 'Hors périmètre technique' },
	{ clauseRef: 'R-3', title: 'Délai', text: 'Délai de reprise ?', criticality: 'majeur', disposition: 'clarification_needed', clarificationQuestion: 'Quel délai de reprise est toléré ?' },
	{ clauseRef: 'R-4', title: 'Chiffrement', text: 'Flux chiffrés.', criticality: 'majeur', disposition: 'to_qualify', qualifyReason: 'Le modèle n\'a pas pu trancher' }
];

const audit = (confirmed: string[]) =>
	buildRequirementAudit({ sourceText: RFP_TEXT, sourceTitle: 'RFP test', model: 'claude-test', auditedAt: '2026-10-01T08:00:00.000Z', reviewed: clauses, confirmedDeliberated: confirmed });

async function cleanup() {
	await prisma.project.deleteMany({ where: { id: PID } });
}

describe('Persistance des exigences et dossier scellé (base réelle)', () => {
	beforeAll(async () => {
		await cleanup();
		await prisma.project.create({ data: { id: PID, shortName: PID, type: 'project_rfp', badge: 'RFP', title: 'Projet test exigences', description: 'test' } });
	});
	afterAll(cleanup);

	it('enregistre l\'audit, idempotent : un second enregistrement ne duplique rien', async () => {
		const first = await saveRequirementAudit(PID, audit(['R-1']), '@alice', new Date('2026-10-02T09:00:00Z'));
		expect(first.requirements).toBe(4);
		expect(first.confirmedDeliberated).toBe(1);
		const again = await saveRequirementAudit(PID, audit(['R-1']), '@alice', new Date('2026-10-03T09:00:00Z'));
		expect(again.confirmedDeliberated).toBe(0);
		expect(await prisma.requirement.count({ where: { source: { projectId: PID } } })).toBe(4);
	});

	it('ne confond jamais la proposition du modèle et la décision humaine', async () => {
		const rows = await prisma.requirement.findMany({ where: { source: { projectId: PID } } });
		const r1 = rows.find((r) => r.clauseRef === 'R-1')!;
		expect(r1.decidedBy).toBe('@alice');
		expect(r1.decidedAt?.toISOString()).toBe('2026-10-02T09:00:00.000Z'); // pas réécrit par le second enregistrement
		const r2 = rows.find((r) => r.clauseRef === 'R-2')!;
		expect(r2.decidedDisposition).toBeNull();
		expect(r2.proposedBy).toBe('model:claude-test');
	});

	it('une décision humaine survit à un nouvel audit qui propose autre chose', async () => {
		await decideRequirement(PID, requirementBundleId(SHA, 'R-2'), { disposition: 'deliberated' }, '@bob', new Date('2026-10-04T09:00:00Z'));
		await saveRequirementAudit(PID, audit([]), '@alice', new Date('2026-10-05T09:00:00Z'));
		const r2 = await prisma.requirement.findFirstOrThrow({ where: { clauseRef: 'R-2', source: { projectId: PID } } });
		expect(r2.decidedDisposition).toBe('deliberated');
		expect(r2.decidedBy).toBe('@bob');
		expect(r2.proposedDisposition).toBe('evacuated');
	});

	it('refuse une évacuation sans motif et une disposition non décidable', async () => {
		await expect(decideRequirement(PID, requirementBundleId(SHA, 'R-4'), { disposition: 'evacuated', reason: 'non' }, '@bob')).rejects.toThrow(/INVALID_DECISION/);
		await expect(decideRequirement(PID, requirementBundleId(SHA, 'R-4'), { disposition: 'to_qualify' }, '@bob')).rejects.toThrow(/INVALID_DECISION/);
		await expect(decideRequirement(PID, 'SRC-00000000:R-1', { disposition: 'deliberated' }, '@bob')).rejects.toThrow(/NOT_FOUND/);
	});

	it('signale une clause à délibérer qu\'aucun sujet ne porte', async () => {
		const res = await decideRequirement(PID, requirementBundleId(SHA, 'R-4'), { disposition: 'deliberated' }, '@bob', new Date('2026-10-06T09:00:00Z'));
		expect(res.needsSubject).toBe(true);
	});

	it('refuse d\'exporter tant qu\'une clause à délibérer n\'a pas de sujet', async () => {
		// R-1, R-2 et R-4 sont décidées « à délibérer » mais aucun sujet ne les porte : le dossier doit le dire.
		await expect(
			exportEngagementBundle({ projectId: PID, confidentiality: 'internal', actorHandle: '@alice' })
		).rejects.toThrow(/BUNDLE_VERIFICATION_FAILED.*REQ_UNCOVERED/);
	});

	it('une fois les sujets rattachés, l\'export est vérifié, déterministe, et la matrice est générable', async () => {
		await prisma.subject.create({
			data: {
				id: `${PID}-s1`, projectId: PID, sectionRef: '§1', name: 'Autonomie et reprise', maturityLevel: 'L1_framed',
				requirementRefs: JSON.stringify(['R-1', 'R-2', 'R-4'].map((c) => requirementBundleId(SHA, c)))
			}
		});
		const a = await exportEngagementBundle({ projectId: PID, confidentiality: 'internal', actorHandle: '@alice' });
		await new Promise((r) => setTimeout(r, 15));
		const b = await exportEngagementBundle({ projectId: PID, confidentiality: 'internal', actorHandle: '@alice' });
		expect(verifyEngagementBundle(a.bundle)).toEqual([]);
		expect(a.bundle.checksum).toBe(b.bundle.checksum); // l'horloge d'export n'entre pas dans le sceau
		const rtm = renderTraceabilityMatrix(a.bundle);
		expect(rtm).toContain(requirementBundleId(SHA, 'R-3'));
		expect(rtm).toMatch(/R-3.*À clarifier.*proposé par le modèle/);
		expect(rtm).toMatch(/R-2.*À délibérer.*décidé par un humain.*@bob/);
	});
});
