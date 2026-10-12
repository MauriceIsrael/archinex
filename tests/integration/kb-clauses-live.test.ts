/**
 * Revue des clauses vérifiables contre un vrai LLMOps (contrat 1.26) : lister, essayer, valider, publier,
 * puis le juge de conformité applique la clause validée.
 *
 * Opt-in, comme les autres tests réels : jamais le LLMOps de développement par défaut. Le test ÉCRIT dans la base
 * du LLMOps visé (décision et publication) : lancer un LLMOps jetable sur une copie de la base.
 *   LLMOPS_LIVE_URL=http://127.0.0.1:8001 LLMOPS_LIVE_MAINTAINER=maint@example.org npx vitest run tests/integration/kb-clauses-live.test.ts
 */
import { describe, it, expect } from 'vitest';
import { loadEnv } from 'vite';
import { LLMOpsClient } from '$lib/server/llmops/client';

const fileEnv = loadEnv('test', process.cwd(), 'LLMOPS_');
const LIVE_URL = process.env.LLMOPS_LIVE_URL;
const MAINTAINER = process.env.LLMOPS_LIVE_MAINTAINER;
const ASSET = 'NIS2-ART21-2C';
const CLAUSE = 'NIS2-ART21-2C-C1';
const NO_BACKUP = { title: 'Site unique', description: 'Un seul datacenter, aucune sauvegarde, pas de plan de reprise.' };

describe.skipIf(!LIVE_URL || !MAINTAINER)('Clauses vérifiables — LLMOps réel', () => {
  const client = new LLMOpsClient({
    baseUrl: LIVE_URL,
    authToken: process.env.LLMOPS_AUTH_TOKEN || fileEnv.LLMOPS_AUTH_TOKEN,
    allowedHosts: ['127.0.0.1', 'localhost']
  });

  it('valide une clause, la publie, et le juge la rapporte validée', async () => {
    const listed = await client.listCheckClauses({ asset_id: ASSET }, MAINTAINER);
    expect(listed.status, listed.error).toBe('ok');
    const row = listed.data!.clauses.find((c) => c.check_id === CLAUSE)!;
    expect(row.kind).toBe('forbids');
    expect(row.may_decide).toBe(true);

    const checks = listed.data!.clauses.map((c) => ({ id: c.check_id, kind: c.kind, when: c.when, ...(c.expect ? { expect: c.expect } : {}), message: c.message }));
    const trial = await client.tryAssetClauses(ASSET, checks, [NO_BACKUP]);
    expect(trial.status, trial.error).toBe('ok');
    expect(trial.data![0].after.find((v) => v.check_id === CLAUSE)?.verdict).toBe('violates');

    const decided = await client.decideCheckClause(ASSET, CLAUSE, { decision: 'validate' }, MAINTAINER!);
    expect(decided.status, decided.error).toBe('ok');
    expect(decided.data!.status).toBe('validated');

    const refused = await client.decideCheckClause(ASSET, CLAUSE, { decision: 'reject' }, MAINTAINER!);
    expect(refused.status).toBe('invalid'); // commentaire obligatoire

    const published = await client.publishKbDoctrine({}, MAINTAINER);
    expect(published.status, published.error).toBe('ok');
    expect((published.data as any).clause_decisions).toContain(`${ASSET}/${CLAUSE}`);

    const verdicts = await client.checkOption({ option: { id: 'opt-live', title: NO_BACKUP.title, summary: NO_BACKUP.description }, frameworks: ['NIS2'] });
    const v = ((verdicts as any).data?.verdicts ?? (verdicts as any).verdicts ?? []).find((x: any) => x.check_id === CLAUSE);
    expect(v?.verdict).toBe('violates');
    expect(v?.check_status).toBe('validated');
  }, 120_000);
});
