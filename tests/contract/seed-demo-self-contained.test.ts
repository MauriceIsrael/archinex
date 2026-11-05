import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrismaClient, type PrismaClient } from '../../src/lib/server/prismaFactory';
import {
  seedDemo,
  PROJECT_ID,
  SUBJECT_ID,
  RETAINED_OPTION_ID
} from '../../scripts/seed-demo';

describe('seedDemo — Démonstration Autonome (§14 Lulu Lot 3 ↔ Lot 1) sur Base Vierge', () => {
  let tmpDir: string;
  let dbFile: string;
  let testPrisma: PrismaClient;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'archinex-seed-demo-test-'));
    dbFile = join(tmpDir, 'test_seed_demo.db');

    // Cloner la structure DDL réelle de dev.db pour un test rapide et isolé
    copyFileSync('prisma/dev.db', dbFile);
    testPrisma = createPrismaClient(`file:${dbFile}`);

    // Vider explicitement toutes les tables métier pour créer une base 100% vierge
    await (testPrisma as any).executableDecisionPackage.deleteMany();
    await testPrisma.decision.deleteMany();
    await testPrisma.option.deleteMany();
    await testPrisma.subject.deleteMany();
    await testPrisma.engagement.deleteMany();
    await testPrisma.project.deleteMany();
    await testPrisma.user.deleteMany();
    await testPrisma.casbinRule.deleteMany();
  });

  afterEach(async () => {
    if (testPrisma) {
      await testPrisma.$disconnect();
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('s’exécute avec succès sur une base de données totalement vierge (0 projets, 0 sujets)', async () => {
    // Vérification de la vacuité initiale
    const initialProjectCount = await testPrisma.project.count();
    const initialSubjectCount = await testPrisma.subject.count();
    const initialUserCount = await testPrisma.user.count();

    expect(initialProjectCount).toBe(0);
    expect(initialSubjectCount).toBe(0);
    expect(initialUserCount).toBe(0);

    // Exécution du seed autonome
    const result = await seedDemo(testPrisma);

    expect(result).toBeDefined();
    expect(result.projectId).toBe(PROJECT_ID);
    expect(result.subjectId).toBe(SUBJECT_ID);
    expect(result.oracleEval.verdict).toBe('compliant');
    expect(result.coverage.metrics.axisCoveragePercent).toBe(100);

    // Vérification de la création automatique du projet et du sujet
    const project = await testPrisma.project.findUnique({
      where: { id: PROJECT_ID }
    });
    expect(project).toBeDefined();
    expect(project?.title).toBe('Lulu (avec options et critères proposés)');

    const subject = await testPrisma.subject.findUnique({
      where: { id: SUBJECT_ID }
    });
    expect(subject).toBeDefined();
    expect(subject?.sectionRef).toBe('§14');

    // Vérification de la décision et de l'option retenue
    const decision = await testPrisma.decision.findUnique({
      where: { subjectId: SUBJECT_ID }
    });
    expect(decision?.retainedOptionId).toBe(RETAINED_OPTION_ID);
    expect(decision?.rationale).toBe("c'est la bonne");

    // Vérification de la persistance de l'EDP Phase 4
    const edp = await (testPrisma as any).executableDecisionPackage.findUnique({
      where: { id: `EDP-${SUBJECT_ID}` }
    });
    expect(edp).toBeDefined();
    expect(edp.status).toBe('proposed');

    // Vérification de l'administrateur démo créé pour l'accès IHM direct
    const adminUser = await testPrisma.user.findUnique({
      where: { email: 'admin@archinex.local' }
    });
    expect(adminUser).toBeDefined();
    expect(adminUser?.role).toBe('admin');
  });

  it('est strictement idempotent lors de multiples exécutions successives', async () => {
    // 1ère exécution sur base vierge
    await seedDemo(testPrisma);
    // 2ème exécution
    const secondResult = await seedDemo(testPrisma);

    expect(secondResult.oracleEval.verdict).toBe('compliant');
    const projectCount = await testPrisma.project.count();
    expect(projectCount).toBe(1);
    const subjectCount = await testPrisma.subject.count();
    expect(subjectCount).toBe(1);
  });
});
