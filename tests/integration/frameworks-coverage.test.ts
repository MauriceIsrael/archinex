import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';

describe('Integration: Cycle Complet Ingestion Référentiel, Revue & Déclaration de Couverture (Lot A10)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;

  beforeAll(async () => {
    fakeLlmops = await startFakeLlmopsServer();
    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'integration-token-a10'
    });
  });

  afterAll(async () => {
    await fakeLlmops.close();
  });

  it('Cycle complet : Ingestion DORA -> Conflit 409 -> Suggestions IA -> Revue Ligne par Ligne -> Déclaration 200', async () => {
    const actorEmail = 'expert@archinex.local';

    // Étape 1 : Ingestion du référentiel DORA
    const ingestionRes = await client.ingestFramework(
      {
        framework_id: 'DORA',
        framework_name: 'Digital Operational Resilience Act (UE 2022/2554)',
        version: '2022/2554',
        domain: 'security',
        file_name: 'dora-eu.pdf',
        file_format: 'pdf',
        file_size_bytes: 850000,
        requirements: [
          {
            id: 'req-dora-01',
            framework_id: 'DORA',
            section: 'Article 5',
            title: 'Gouvernance et organisation des risques TIC',
            text: 'L’organe de direction définit, approuve et supervise la mise en œuvre de la stratégie de résilience opérationnelle numérique.',
            domain: 'security',
            status: 'pending',
            mapped_assets: []
          },
          {
            id: 'req-dora-02',
            framework_id: 'DORA',
            section: 'Article 9',
            title: 'Mécanismes de détection continue des anomalies',
            text: 'Déploiement de mécanismes appropriés pour détecter rapidement les activités anormales et les incidents liés aux TIC.',
            domain: 'security',
            status: 'pending',
            mapped_assets: []
          },
          {
            id: 'req-dora-03',
            framework_id: 'DORA',
            section: 'Article 11',
            title: 'Politique de continuité des activités TIC',
            text: 'Plans de continuité complets prévoyant des objectifs de temps de reprise (RTO) et de perte de données (RPO).',
            domain: 'security',
            status: 'pending',
            mapped_assets: []
          }
        ]
      },
      actorEmail
    );

    expect(ingestionRes.status).toBe('ok');
    expect(ingestionRes.data).toBeDefined();
    const ingId = ingestionRes.data!.id;
    expect(ingestionRes.data!.framework_id).toBe('DORA');
    expect(ingestionRes.data!.total_requirements).toBe(3);
    expect(ingestionRes.data!.reviewed_requirements).toBe(0);

    // Étape 2 : Tentative prématurée de déclaration de couverture -> 409 Conflict
    const prematureDecl = await client.declareFrameworkCoverage('DORA', actorEmail);
    expect(prematureDecl.status).toBe('conflict');
    expect(prematureDecl.missing_requirements).toEqual(['req-dora-01', 'req-dora-02', 'req-dora-03']);

    // Étape 3 : Suggestion IA pour l'exigence 01
    const suggRes = await client.suggestFrameworkRequirementLinks(ingId, 'req-dora-01', actorEmail);
    expect(suggRes.status).toBe('ok');
    expect(suggRes.data?.llm_derived).toBe(true);
    const suggestedAsset = suggRes.data!.suggested_assets[0].asset_id;
    expect(suggestedAsset).toBeDefined();

    // Étape 4 : Instruction de req-dora-01 -> Acceptée avec les actifs suggérés
    const rev1 = await client.reviewFrameworkRequirement(
      ingId,
      'req-dora-01',
      {
        status: 'accepted',
        mapped_assets: [suggestedAsset, 'PRIN-GOV-01']
      },
      actorEmail
    );
    expect(rev1.status).toBe('ok');
    expect(rev1.data?.status).toBe('accepted');
    expect(rev1.data?.reviewed_by).toBe(actorEmail);

    // Étape 5 : Instruction de req-dora-02 -> Amendée avec notes opérationnelles
    const rev2 = await client.reviewFrameworkRequirement(
      ingId,
      'req-dora-02',
      {
        status: 'amended',
        mapped_assets: ['CTRL-SEC-ALERT'],
        amendment_notes: 'Détection SIEM temps réel avec rétention froide 12 mois.'
      },
      actorEmail
    );
    expect(rev2.status).toBe('ok');
    expect(rev2.data?.status).toBe('amended');

    // Étape 6 : Instruction de req-dora-03 -> Rejet sans motif échoue (400), puis rejet motivé réussit
    const failedReject = await client.reviewFrameworkRequirement(
      ingId,
      'req-dora-03',
      {
        status: 'rejected',
        rejection_reason: ''
      },
      actorEmail
    );
    expect(failedReject.status).toBe('bad_request');

    const validReject = await client.reviewFrameworkRequirement(
      ingId,
      'req-dora-03',
      {
        status: 'rejected',
        rejection_reason: 'Non applicable : le composant applicatif est sans état et géré par Kubernetes.'
      },
      actorEmail
    );
    expect(validReject.status).toBe('ok');
    expect(validReject.data?.status).toBe('rejected');

    // Étape 7 : Vérification de l'état de l'ingestion
    const finalIngestion = await client.getFrameworkIngestion(ingId, actorEmail);
    expect(finalIngestion.status).toBe('ok');
    expect(finalIngestion.data?.reviewed_requirements).toBe(3);

    // Étape 8 : Déclaration formelle de couverture -> 200 OK
    const finalDecl = await client.declareFrameworkCoverage('DORA', actorEmail);
    expect(finalDecl.status).toBe('ok');
    expect(finalDecl.data?.coverage_declared).toBe(true);
    expect(finalDecl.data?.framework_id).toBe('DORA');
    expect(finalDecl.data?.total_requirements).toBe(3);
    expect(finalDecl.data?.covered_requirements).toBe(2); // 1 acceptée + 1 amendée
    expect(finalDecl.data?.declared_by).toBe(actorEmail);
  });
});
