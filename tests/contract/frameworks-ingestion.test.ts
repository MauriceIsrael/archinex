import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';

describe('Contract: Frameworks Ingestion, Review & Coverage Declaration (Lot A10)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;

  beforeAll(async () => {
    fakeLlmops = await startFakeLlmopsServer();
    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'test-token-a10'
    });
  });

  afterAll(async () => {
    await fakeLlmops.close();
  });

  it('1. Rejette les fichiers dépassant 20 Mo avec code 413', async () => {
    const res = await client.ingestFramework(
      {
        framework_id: 'OVERSIZED',
        framework_name: 'Fichier Géant',
        file_name: 'giant.pdf',
        file_format: 'pdf',
        file_size_bytes: 25 * 1024 * 1024 // 25 Mo > 20 Mo
      },
      'expert@archinex.local'
    );

    expect(res.status).toBe('too_large');
    expect(res.error).toMatch(/20 Mo/i);
  });

  it('2. Ingère et découpe un référentiel multi-format (.md, .txt, .pdf)', async () => {
    const res = await client.ingestFramework(
      {
        framework_id: 'ISO-27001',
        framework_name: 'Norme ISO/IEC 27001:2022',
        version: '2022',
        domain: 'security',
        file_name: 'iso27001.md',
        file_format: 'md',
        file_size_bytes: 45000,
        raw_text:
          '# Clause 5.1 Leadership et engagement de la direction\nLa direction doit démontrer son engagement envers le SMSI.\n# Clause 6.1 Actions face aux risques et opportunités\nÉvaluation continue des risques de sécurité de l’information.\n# Clause 8.2 Appréciation des risques de sécurité\nRéalisation d’évaluations des risques à des intervalles planifiés.'
      },
      'expert@archinex.local'
    );

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.framework_id).toBe('ISO-27001');
    expect(res.data!.requirements.length).toBeGreaterThan(0);
    expect(res.data!.status).toBe('ready');
  });

  it('3. listFrameworkIngestions liste l’ensemble des référentiels disponibles', async () => {
    const res = await client.listFrameworkIngestions('expert@archinex.local');

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.length).toBeGreaterThanOrEqual(2); // NIS2 initial + ISO-27001
    const ids = res.data!.map((f) => f.framework_id);
    expect(ids).toContain('NIS2');
    expect(ids).toContain('ISO-27001');
  });

  it('4. getFrameworkIngestion renvoie le détail d’un référentiel et ses exigences', async () => {
    const res = await client.getFrameworkIngestion('ing-nis2-01', 'expert@archinex.local');

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.framework_id).toBe('NIS2');
    expect(res.data!.requirements.length).toBe(3);
    expect(res.data!.requirements[0].id).toBe('req-nis2-01');
  });

  it('5. reviewFrameworkRequirement refuse les modifications d’un domaine non possédé (403 Forbidden)', async () => {
    // expert@archinex.local possède ['security', 'cloud'], mais req-nis2-03 appartient au domaine 'architecture'
    const res = await client.reviewFrameworkRequirement(
      'ing-nis2-01',
      'req-nis2-03',
      {
        status: 'accepted'
      },
      'expert@archinex.local'
    );

    expect(res.status).toBe('forbidden');
    expect(res.error).toMatch(/ne possède pas le domaine 'architecture'/i);
  });

  it('6. reviewFrameworkRequirement impose un motif obligatoire pour tout rejet (400 Bad Request)', async () => {
    const res = await client.reviewFrameworkRequirement(
      'ing-nis2-01',
      'req-nis2-02',
      {
        status: 'rejected',
        rejection_reason: '' // Vide -> Erreur 400
      },
      'expert@archinex.local'
    );

    expect(res.status).toBe('bad_request');
    expect(res.error).toMatch(/motif de rejet/i);
  });

  it('7. suggestFrameworkRequirementLinks fournit des suggestions doctrinales étiquetées llm-derived', async () => {
    const res = await client.suggestFrameworkRequirementLinks(
      'ing-nis2-01',
      'req-nis2-02',
      'expert@archinex.local'
    );

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.llm_derived).toBe(true);
    expect(res.data!.suggested_assets.length).toBeGreaterThan(0);
    expect(res.data!.suggested_assets[0].asset_id).toBeDefined();
    expect(res.data!.suggested_assets[0].confidence).toBeGreaterThan(0.5);
  });

  it('8. declareFrameworkCoverage renvoie 409 Conflict si des exigences non résolues subsistent', async () => {
    // Dans ing-nis2-01, req-nis2-02 et req-nis2-03 sont encore en status 'pending'
    const res = await client.declareFrameworkCoverage('NIS2', 'expert@archinex.local');

    expect(res.status).toBe('conflict');
    expect(res.missing_requirements).toBeDefined();
    expect(res.missing_requirements!.length).toBeGreaterThan(0);
  });

  it('9. declareFrameworkCoverage délivre une attestation 200 OK dès lors que toutes les exigences sont instruites', async () => {
    // On résout les exigences restantes :
    // req-nis2-02 (domaine security) : acceptée par expert@archinex.local
    const resReq2 = await client.reviewFrameworkRequirement(
      'ing-nis2-01',
      'req-nis2-02',
      {
        status: 'accepted',
        mapped_assets: ['CTRL-SEC-01', 'CTRL-SEC-ALERT']
      },
      'expert@archinex.local'
    );
    expect(resReq2.status).toBe('ok');

    // req-nis2-03 (domaine architecture) : résolue par un acteur ou en direct
    fakeLlmops.state.frameworkIngestions['ing-nis2-01'].requirements[2].status = 'amended';
    fakeLlmops.state.frameworkIngestions['ing-nis2-01'].requirements[2].mapped_assets = ['PAT-SUPPLY-01'];

    // Déclaration de couverture
    const declRes = await client.declareFrameworkCoverage('NIS2', 'expert@archinex.local');

    expect(declRes.status).toBe('ok');
    expect(declRes.data).toBeDefined();
    expect(declRes.data!.coverage_declared).toBe(true);
    expect(declRes.data!.framework_id).toBe('NIS2');
    expect(declRes.data!.total_requirements).toBe(3);
    expect(declRes.data!.covered_requirements).toBe(3);
  });
});
