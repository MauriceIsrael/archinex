import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../../src/lib/server/prisma';
import { POST as webhookPost } from '../../src/routes/api/webhooks/nautobot/+server';
import {
  computeWebhookHmac,
  verifyNautobotWebhookHmac
} from '../../src/lib/server/edp/nautobotWebhookAuth';
import {
  flushPendingWebhookTasks,
  processAuthenticatedNautobotWebhook
} from '../../src/lib/server/edp/nautobotWebhookProcessor';
import {
  computeIntentHash,
  listDriftFindings,
  getLatestOracleVerdict
} from '../../src/lib/server/edp/driftService';
import { pullLiveInventoryFromNautobot } from '../../src/lib/server/edp/nautobotSync';

const TEST_RUN = `drift377_${Date.now()}`;
const PROJECT_ID = `proj_${TEST_RUN}`;
const SUBJECT_ID = `sub_${TEST_RUN}`;
const DECISION_ID = `dec_${TEST_RUN}`;
const EDP_ID = `edp_${TEST_RUN}`;
const WEBHOOK_SECRET = `super-secret-hmac-${TEST_RUN}`;

const FROZEN_INVENTORY = {
  subject_id: SUBJECT_ID,
  nautobot_planned_devices: [
    {
      id: 'dev-edge-01',
      name: 'edge-node-01',
      device_type: 'Generic-Rack-Server-2U',
      role: 'compute-node',
      site: 'dc-paris-1',
      status: 'planned',
      oob_ip: '10.200.0.10/24',
      power_feeds: ['PDU-A', 'PDU-B']
    }
  ]
};

const FROZEN_EDP_CONTENT = JSON.stringify({
  metadata: {
    id: EDP_ID,
    title: 'Déploiement noeuds compute génériques',
    status: 'validated',
    revision: 1
  },
  decision_context: {
    problem: 'Provisionner des noeuds de calcul conformes',
    decision: 'Utiliser le profil matériel standard',
    ontology_bindings: []
  },
  hydratedInventory: FROZEN_INVENTORY,
  lldOverrides: {}
});

function buildSignedRequest(
  payloadObj: Record<string, unknown>,
  options: {
    secret?: string;
    algorithm?: 'sha512' | 'sha256';
    headerName?: 'x-hook-signature' | 'x-archinex-signature';
    projectIdHeader?: string | null;
    eventId?: string;
    sync?: boolean;
  } = {}
) {
  const rawBody = JSON.stringify(payloadObj);
  const headers = new Headers({ 'content-type': 'application/json' });
  if (options.projectIdHeader !== null) {
    headers.set('x-archinex-project', options.projectIdHeader ?? PROJECT_ID);
  }
  if (options.eventId) {
    headers.set('x-nautobot-event-id', options.eventId);
  }
  if (options.secret) {
    const algo = options.algorithm || 'sha512';
    const digest = computeWebhookHmac(rawBody, options.secret, algo);
    const headerName = options.headerName || 'x-hook-signature';
    headers.set(headerName, algo === 'sha256' ? `sha256=${digest}` : digest);
  }
  const url = new URL(
    `http://localhost/api/webhooks/nautobot${options.sync ? '?sync=true' : ''}`
  );
  const request = new Request(url.toString(), {
    method: 'POST',
    headers,
    body: rawBody
  });
  return { request, url };
}

describe('Issue #377 — DriftFinding typé/persisté et webhook Nautobot authentifié (HMAC)', () => {
  beforeAll(async () => {
    await prisma.project.create({
      data: {
        id: PROJECT_ID,
        title: 'Projet Test Drift 377',
        shortName: 'DRIFT377',
        type: 'generic_blueprint',
        badge: 'TEST',
        description: 'Projet isolé pour tester la détection de dérive #377',
        strategy: JSON.stringify({
          nautobot: {
            url: 'http://127.0.0.1:1', // volontairement injoignable pour isoler le test sans Nautobot externe
            token: 'test-token',
            webhookSecret: WEBHOOK_SECRET,
            isolationPrefix: 'drift377',
            isolateByProject: true
          }
        })
      }
    });

    await prisma.subject.create({
      data: {
        id: SUBJECT_ID,
        projectId: PROJECT_ID,
        sectionRef: 'SEC-377',
        name: 'Noeuds Compute Génériques'
      }
    });

    await prisma.executableDecisionPackage.create({
      data: {
        id: EDP_ID,
        decisionId: DECISION_ID,
        subjectId: SUBJECT_ID,
        revision: 1,
        status: 'validated',
        content: FROZEN_EDP_CONTENT,
        policyHash: computeIntentHash(FROZEN_INVENTORY),
        productionMode: 'human-authored'
      }
    });
  });

  afterAll(async () => {
    await flushPendingWebhookTasks();
    await prisma.driftFinding.deleteMany({ where: { projectId: PROJECT_ID } });
    await prisma.webhookEventReceipt.deleteMany({ where: { projectId: PROJECT_ID } });
    await prisma.edpOracleVerdict.deleteMany({ where: { projectId: PROJECT_ID } });
    await prisma.executableDecisionPackage.deleteMany({ where: { id: EDP_ID } });
    await prisma.subject.deleteMany({ where: { id: SUBJECT_ID } });
    await prisma.project.deleteMany({ where: { id: PROJECT_ID } });
  });

  it('Critère 1 : un webhook non signé ou mal signé répond 401, sans aucun effet de bord', async () => {
    const unsigned = buildSignedRequest(
      {
        event: 'updated',
        model: 'dcim.device',
        data: {
          id: 'dev-unsigned-1',
          name: 'edge-node-01',
          status: 'offline',
          custom_fields: {
            archinex_project: PROJECT_ID,
            archinex_decision_id: DECISION_ID,
            archinex_subject_id: SUBJECT_ID
          }
        }
      },
      { eventId: `evt-unsigned-${TEST_RUN}` }
    );

    const resUnsigned = await webhookPost(unsigned as any);
    expect(resUnsigned.status).toBe(401);

    const badSig = buildSignedRequest(
      {
        event: 'updated',
        model: 'dcim.device',
        data: { id: 'dev-badsig-1', name: 'edge-node-01', status: 'offline' }
      },
      { secret: 'wrong-secret', eventId: `evt-badsig-${TEST_RUN}` }
    );
    const resBadSig = await webhookPost(badSig as any);
    expect(resBadSig.status).toBe(401);

    // Vérifier qu'aucun effet de bord n'a eu lieu en base
    const findings = await listDriftFindings({ projectId: PROJECT_ID });
    expect(findings).toHaveLength(0);

    const receipts = await prisma.webhookEventReceipt.findMany({
      where: { projectId: PROJECT_ID }
    });
    expect(receipts).toHaveLength(0);
  });

  it('Critères 2 & 3 : une modification manuelle d’un objet marqué produit exactement un DriftFinding (sans doublon sur rejeu) et ne modifie jamais l’EDP d’origine', async () => {
    const edpBefore = await prisma.executableDecisionPackage.findUnique({
      where: { id: EDP_ID }
    });
    expect(edpBefore).not.toBeNull();

    const payload = {
      event: 'updated',
      model: 'dcim.device',
      // Tentative d'injection d'un faux subjectId dans le corps : doit être ignorée
      subjectId: 'sub_forged_body',
      data: {
        id: 'nb-uuid-edge-01',
        name: 'drift377--edge-node-01',
        device_type: { model: 'Generic-Rack-Server-2U' },
        status: { value: 'offline' },
        custom_fields: {
          archinex_project: PROJECT_ID,
          archinex_subject_id: SUBJECT_ID,
          archinex_decision_id: DECISION_ID,
          archinex_clause_refs: ['REQ-COMPUTE-01', 'REQ-AVAIL-02'],
          archinex_intent_hash: computeIntentHash(FROZEN_INVENTORY.nautobot_planned_devices[0])
        }
      }
    };

    const eventId1 = `evt-marked-1-${TEST_RUN}`;
    const req1 = buildSignedRequest(payload, {
      secret: WEBHOOK_SECRET,
      algorithm: 'sha512',
      eventId: eventId1
    });

    const res1 = await webhookPost(req1 as any);
    expect(res1.status).toBe(202);
    const body1 = await res1.json();
    expect(body1.accepted).toBe(true);
    expect(body1.duplicate).toBe(false);
    expect(body1.subjectId).toBe(SUBJECT_ID);
    expect(body1.decisionId).toBe(DECISION_ID);
    expect(body1.outOfDecision).toBe(false);
    expect(body1.findingsCount).toBe(1);

    // Attendre la fin du traitement asynchrone (évaluation Oracle + persistance EdpOracleVerdict)
    await flushPendingWebhookTasks();

    // Rejeu avec le MÊME eventId : idempotence stricte (200 duplicate: true)
    const reqReplaySameEvent = buildSignedRequest(payload, {
      secret: WEBHOOK_SECRET,
      algorithm: 'sha512',
      eventId: eventId1
    });
    const resReplay1 = await webhookPost(reqReplaySameEvent as any);
    expect(resReplay1.status).toBe(200);
    const bodyReplay1 = await resReplay1.json();
    expect(bodyReplay1.duplicate).toBe(true);

    // Rejeu avec un NOUVEL eventId sur la même modification : déduplication DriftFinding (toujours 1 seul finding)
    const reqReplayNewEvent = buildSignedRequest(payload, {
      secret: WEBHOOK_SECRET,
      algorithm: 'sha256',
      headerName: 'x-archinex-signature',
      eventId: `evt-marked-2-${TEST_RUN}`
    });
    const resReplay2 = await webhookPost(reqReplayNewEvent as any);
    expect(resReplay2.status).toBe(202);
    await flushPendingWebhookTasks();

    const findings = await listDriftFindings({
      projectId: PROJECT_ID,
      outOfDecision: false
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('status_regression');
    expect(findings[0].subjectId).toBe(SUBJECT_ID);
    expect(findings[0].decisionId).toBe(DECISION_ID);
    expect(findings[0].clauseRefs).toEqual(['REQ-COMPUTE-01', 'REQ-AVAIL-02']);
    expect(findings[0].objectRef).toMatchObject({
      type: 'dcim.device',
      id: 'nb-uuid-edge-01',
      name: 'edge-node-01'
    });
    expect(findings[0].expected).toBe('planned');
    expect(findings[0].observed).toBe('offline');
    expect(findings[0].state).toBe('open');
    expect(findings[0].outOfDecision).toBe(false);

    // Critère 3 : l'EDP d'origine est strictement inchangé
    const edpAfter = await prisma.executableDecisionPackage.findUnique({
      where: { id: EDP_ID }
    });
    expect(edpAfter).not.toBeNull();
    expect(edpAfter!.content).toBe(edpBefore!.content);
    expect(edpAfter!.policyHash).toBe(edpBefore!.policyHash);
    expect(edpAfter!.status).toBe(edpBefore!.status);
    expect(edpAfter!.revision).toBe(edpBefore!.revision);
    expect(edpAfter!.updatedAt.getTime()).toBe(edpBefore!.updatedAt.getTime());

    // Le verdict de l'oracle a été stocké à côté dans `edp_oracle_verdicts` avec sa provenance
    const latestVerdict = await getLatestOracleVerdict({ edpId: EDP_ID });
    expect(latestVerdict).not.toBeNull();
    expect(latestVerdict!.source).toBe('nautobot_webhook');
    expect(latestVerdict!.verdict).toBe('violated');
    expect(latestVerdict!.provenance).toContain('dcim.device:updated');
    expect(latestVerdict!.driftFindingIds).toContain(findings[0].id);
  });

  it('Critère 4 : un objet non marqué produit un écart « hors décision » distinct, jamais ignoré (et ignore payload.subjectId)', async () => {
    const unmarkedReq = buildSignedRequest(
      {
        event: 'created',
        model: 'dcim.device',
        subjectId: SUBJECT_ID, // Doit être ignoré car l'objet Nautobot ne porte pas de marqueurs archinex_*
        data: {
          id: 'nb-uuid-rogue-99',
          name: 'drift377--rogue-switch-99',
          status: { value: 'active' }
        }
      },
      {
        secret: WEBHOOK_SECRET,
        eventId: `evt-unmarked-${TEST_RUN}`
      }
    );

    const res = await webhookPost(unmarkedReq as any);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.outOfDecision).toBe(true);
    expect(body.subjectId).toBeNull();
    expect(body.decisionId).toBeNull();
    expect(body.findingsCount).toBe(1);

    await flushPendingWebhookTasks();

    const outOfDecisionFindings = await listDriftFindings({
      projectId: PROJECT_ID,
      outOfDecision: true
    });
    expect(outOfDecisionFindings).toHaveLength(1);
    expect(outOfDecisionFindings[0].outOfDecision).toBe(true);
    expect(outOfDecisionFindings[0].subjectId).toBeNull();
    expect(outOfDecisionFindings[0].decisionId).toBeNull();
    expect(outOfDecisionFindings[0].kind).toBe('unexpected');
    expect(outOfDecisionFindings[0].objectRef).toMatchObject({
      type: 'dcim.device',
      id: 'nb-uuid-rogue-99',
      name: 'rogue-switch-99'
    });
  });

  it('Critère 5 : les erreurs de persistance remontent explicitement (journal + 500), aucun catch muet', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const failingDb = {
        webhookEventReceipt: {
          create: vi.fn().mockRejectedValue(new Error('SQLITE_READONLY: database is read-only'))
        }
      };

      const resReceiptErr = await processAuthenticatedNautobotWebhook({
        projectId: PROJECT_ID,
        headers: new Headers({ 'x-nautobot-event-id': `evt-dberr-1-${TEST_RUN}` }),
        rawBody: '{}',
        payload: { event: 'updated', model: 'dcim.device', data: { id: 'd1', name: 'd1' } },
        db: failingDb
      });
      expect(resReceiptErr.status).toBe(500);
      expect(resReceiptErr.body.accepted).toBe(false);
      expect(String(resReceiptErr.body.error)).toContain('SQLITE_READONLY');
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockClear();

      const failingDriftDb = {
        webhookEventReceipt: {
          create: vi.fn().mockResolvedValue({ id: 'rcpt-1' }),
          update: vi.fn().mockResolvedValue({ id: 'rcpt-1' })
        },
        project: {
          findUnique: vi.fn().mockResolvedValue(null)
        },
        driftFinding: {
          upsert: vi.fn().mockRejectedValue(new Error('DISK_FULL: cannot write drift_findings'))
        }
      };

      const resDriftErr = await processAuthenticatedNautobotWebhook({
        projectId: PROJECT_ID,
        headers: new Headers({ 'x-nautobot-event-id': `evt-dberr-2-${TEST_RUN}` }),
        rawBody: '{}',
        payload: { event: 'created', model: 'dcim.device', data: { id: 'd2', name: 'd2' } },
        db: failingDriftDb
      });
      expect(resDriftErr.status).toBe(500);
      expect(resDriftErr.body.accepted).toBe(false);
      expect(String(resDriftErr.body.error)).toContain('DISK_FULL');
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('pullLiveInventoryFromNautobot produit des DriftFindingDraft typés (attribut, régression statut, objet hors décision)', async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/status/') {
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      }
      if (url.pathname === '/api/dcim/devices/') {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 'nb-dev-1',
                name: 'edge-node-01',
                device_type: { model: 'Unapproved-Vendor-X1' },
                status: { value: 'failed' },
                custom_fields: {
                  archinex_project: PROJECT_ID,
                  archinex_subject_id: SUBJECT_ID,
                  archinex_decision_id: DECISION_ID,
                  archinex_clause_refs: ['REQ-HW-01']
                }
              },
              {
                id: 'nb-dev-rogue',
                name: 'manual-rogue-host',
                status: { value: 'active' }
              }
            ]
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };

    const pullRes = await pullLiveInventoryFromNautobot(FROZEN_INVENTORY as any, {
      baseUrl: 'http://localhost:8080',
      token: 'tok',
      driftContext: {
        projectId: PROJECT_ID,
        subjectId: SUBJECT_ID,
        decisionId: DECISION_ID
      },
      fetchImpl: mockFetch
    });

    expect(pullRes.reachable).toBe(true);
    expect(pullRes.findings.some((f) => f.kind === 'attribute_mismatch' && f.attributeKey === 'device_type')).toBe(true);
    expect(pullRes.findings.some((f) => f.kind === 'status_regression' && f.attributeKey === 'status')).toBe(true);
    expect(
      pullRes.findings.some(
        (f) => f.kind === 'unexpected' && f.outOfDecision === true && f.objectRef.name === 'manual-rogue-host'
      )
    ).toBe(true);
  });

  it('verifyNautobotWebhookHmac échoue fermé si le projet n’a aucun secret configuré', async () => {
    const rawBody = JSON.stringify({ event: 'updated', model: 'dcim.device', data: { id: 'x' } });
    const sig = computeWebhookHmac(rawBody, 'some-secret', 'sha512');
    const res = await verifyNautobotWebhookHmac({
      headers: new Headers({
        'x-hook-signature': sig,
        'x-archinex-project': 'proj_without_secret_377'
      }),
      url: new URL('http://localhost/api/webhooks/nautobot'),
      rawBody
    });
    expect(res.ok).toBe(false);
  });
});
