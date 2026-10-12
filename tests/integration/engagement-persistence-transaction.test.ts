import { describe, it, expect } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { saveEngagementToDb, getEngagementByIdFromDb } from '$lib/server/engagementsDb';
import { buildEngagementProfileFromWorkspaceInput } from '$lib/domain/engagements';

describe('Persistance & Synchronisation Relationnelle (#87)', () => {
	it('active le mode WAL et le busy_timeout sur SQLite', async () => {
		const journalMode = await prisma.$queryRawUnsafe<Array<{ journal_mode: string }>>('PRAGMA journal_mode;');
		expect(journalMode[0]?.journal_mode.toLowerCase()).toBe('wal');

		const busyTimeout = await prisma.$queryRawUnsafe<Array<{ timeout: bigint }>>('PRAGMA busy_timeout;');
		expect(Number(busyTimeout[0]?.timeout)).toBeGreaterThanOrEqual(5000);
	});

	it('persiste un engagement et ses sujets de façon atomique sans avaler d\'erreur', async () => {
		const stamp = Date.now();
		const testProjectId = `test-persist-tx-${stamp}`;
		const testSubjectId = `sub-tx-${stamp}`;

		const { engagement } = buildEngagementProfileFromWorkspaceInput({
			id: testProjectId,
			title: 'Projet Test Transaction',
			type: 'project_rfp',
			description: 'Test de persistance atomique',
			strategy: { objectives: [], principles: [], constraints: [] },
			participants: [{ id: 'user-tx-test', role: 'lead_architect' } as any],
			initialSubjects: [
				{
					id: testSubjectId,
					factorizationId: 'SUBJ-TX-01',
					name: 'Architecture distribuée et cohérence',
					waitingForRole: 'lead_architect',
					effort: 'M',
					initialQuestion: 'Quelle stratégie de réplication adopter ?',
					nature: 'architecture',
					dependsOn: [],
					proposal: {
						options: [{ title: 'Option 1 Raft', summary: 'Consensus Raft' }],
						criteria: [{ name: 'Cohérence', kind: 'nfr', weight: 5, description: 'Cohérence forte' }],
						evaluations: [{ option: 'Option 1 Raft', criterion: 'Cohérence', score: 2, justification: 'Consensus garanti' }]
					}
				}
			]
		});

		// 1. Sauvegarde
		const saved = await saveEngagementToDb(engagement);
		expect(saved.id).toBe(testProjectId);

		// 2. Vérification dans les tables relationnelles
		const projectRow = await prisma.project.findUnique({ where: { id: testProjectId } });
		expect(projectRow).not.toBeNull();
		expect(projectRow?.title).toBe('Projet Test Transaction');

		const subjectRow = await prisma.subject.findUnique({ where: { id: testSubjectId } });
		expect(subjectRow).not.toBeNull();
		expect(subjectRow?.nature).toBe('architecture');
		expect(subjectRow?.problemStatement).toBe('Quelle stratégie de réplication adopter ?');

		// 3. Relecture via getEngagementByIdFromDb
		const reloaded = await getEngagementByIdFromDb(testProjectId);
		expect(reloaded).not.toBeNull();
		const foundSubject = reloaded?.subjects.find((s) => s.id === testSubjectId);
		expect(foundSubject).toBeDefined();
		expect(foundSubject?.problem_statement).toBe('Quelle stratégie de réplication adopter ?');
	});
});

