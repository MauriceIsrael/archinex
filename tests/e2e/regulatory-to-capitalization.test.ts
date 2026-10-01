/**
 * Test E2E API — Réglementation → RFP → Délibération → Décision → Capitalisation
 * (Issue #12 : conteneur Docker éphémère / testcontainers, vrai LLMOps, boucle fermée)
 *
 * Exécution :
 *   TEST_CONTAINERS=1 npx vitest run tests/e2e/regulatory-to-capitalization.test.ts
 * Ou contre un serveur déjà lancé :
 *   LLMOPS_LIVE_URL=http://127.0.0.1:8099 npx vitest run tests/e2e/regulatory-to-capitalization.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { execSync } from 'node:child_process';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { prisma } from '$lib/server/prisma';
import { LLMOpsClient } from '$lib/server/llmops/client';
import { KbNotificationService } from '$lib/server/kbNotifications';
import { setupFakeLlm } from '../helpers/fakeLlm';
import {
  createProject,
  createSubject,
  type ActorInfo
} from '$lib/server/projects/projectsDb';
import {
  createCriterion,
  createOption,
  upsertEvaluation
} from '$lib/server/projects/optionsDb';
import { listArguments, resolveArgument } from '$lib/server/projects/debateDb';
import { orchestrateDebate } from '$lib/server/agents/debateOrchestrator';
import { recordArbitrationDecision } from '$lib/server/projects/arbitrationDb';
import { prepareSubjectKbCandidates } from '$lib/server/projects/capitalizationDb';

const LIVE_URL = process.env.LLMOPS_LIVE_URL;
const SHOULD_RUN = Boolean(LIVE_URL || process.env.TEST_CONTAINERS === '1');

// Personas d'intégration LLMOps & Archinex
const ALICE = 'alice@example.org'; // @core-owner-architecture (network-automation, architecture, automation)
const SEC = 'sec@example.org';     // @security-compliance-team (security-governance: NIS2)
const EVA = 'eva@example.org';     // @ciso-office (kb:evaluate)
const MAINT = 'maint@example.org'; // @maintainers (kb:maintain, kb:admin)

const SERVICE_TOKEN = process.env.LLMOPS_LIVE_TOKEN || 'contract-service-token';

const DB_FILE = resolve(process.cwd(), 'prisma/test-regulatory-e2e.db');
const DATABASE_URL = `file:${DB_FILE}`;

const PATTERN_OOB = `---
id: PAT-099
title: Out-of-band management network for the automation chain
type: pattern
status: draft
confidence: assumed
phase: [BUILD, RUN]
domain: [network-automation]
related: [P-009]
---

# PAT-099 — Out-of-band management network

## Problem
The automation chain loses reachability when the data network fails.

## Forces
Restoration must keep working during the outage it restores.

## Solution
Provide a dedicated out-of-band management network, with break-glass access.

## Trade-offs
Extra circuits and cabling.

## When not to use this
Sites with on-site hands available around the clock.
`;

const PRINCIPLE_OOB = `---
id: P-099
title: Out-of-band network isolation
type: principle
status: draft
confidence: assumed
phase: [BUILD, RUN]
domain: [network-automation]
---

# P-099 — Out-of-band network isolation

## Statement
The management and control plane must be physically and logically separated from user data traffic.

## How to verify
Inspect physical cabling and VLAN configurations to ensure no routing overlap exists between control and user planes.
`;

describe.skipIf(!SHOULD_RUN)('E2E : Réglementation → RFP → Délibération → Décision → Capitalisation', () => {
  let container: StartedTestContainer | null = null;
  let client: LLMOpsClient;
  let baseUrl: string;

  const projectId = `proj-reg-e2e-${Date.now()}`;
  const engagement1 = `eng-rfp-v1-${Date.now()}`;
  const engagement2 = `eng-rfp-v2-${Date.now()}`;

  const leadArchitect: ActorInfo = {
    userId: 'usr_lead_arch',
    role: 'lead_architect',
    productionMode: 'human-authored'
  };

  // État partagé entre les actes
  let rfpContent = '';
  let before41Controls: string[] = [];
  let before42Controls: string[] = [];
  let before43Controls: string[] = [];
  let beforeOptionVerdicts: any[] = [];
  let ingestionId = 0;
  let createdSnapshotId = '';
  let candidatePatternId = '';
  let candidatePrincipleId = '';
  let subjectHaId = `subj-ha-${Date.now()}`;
  let opt1Id = '';
  let opt2Id = '';

  beforeAll(async () => {
    const tStart = performance.now();
    console.log('\n[E2E Setup] Initialisation de l’environnement de test...');

    // 1. Démarrage conteneur LLMOps si nécessaire
    if (LIVE_URL) {
      baseUrl = LIVE_URL;
      console.log(`[E2E Setup] Utilisation du serveur LLMOps existant : ${baseUrl}`);
    } else {
      console.log('[E2E Setup] Démarrage du conteneur Docker llmops-contract:latest...');
      container = await new GenericContainer('llmops-contract:latest')
        .withExposedPorts(8000)
        .withWaitStrategy(
          Wait.forHttp('/health', 8000).withHeaders({
            Authorization: `Bearer ${SERVICE_TOKEN}`
          })
        )
        .start();

      const host = container.getHost();
      const port = container.getMappedPort(8000);
      baseUrl = `http://${host}:${port}`;
      console.log(`[E2E Setup] Conteneur LLMOps démarré sur ${baseUrl}`);
    }

    // 2. Client LLMOps
    client = new LLMOpsClient({
      baseUrl,
      authToken: SERVICE_TOKEN,
      timeoutMs: 60000
    });

    // 3. Reset et seed de la base SQLite Archinex
    process.env.DATABASE_URL = DATABASE_URL;
    if (existsSync(DB_FILE)) {
      try {
        unlinkSync(DB_FILE);
      } catch {
        // Ignorer si verrou temporaire
      }
    }

    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      env: { ...process.env, DATABASE_URL },
      stdio: 'pipe'
    });

    // Seed des utilisateurs et de leurs rôles
    const usersData = [
      { id: leadArchitect.userId, name: 'Lead Architect', email: 'lead@archinex.local', role: 'admin', handle: '@lead-arch', roles: ['kb:review', 'kb:maintain', 'kb:admin'], domains: ['architecture'] },
      { id: 'usr_alice', name: 'Alice Core Owner', email: ALICE, role: 'domain_expert', handle: '@core-owner-architecture', roles: ['kb:review'], domains: ['network-automation', 'architecture', 'automation'] },
      { id: 'usr_sec', name: 'Security Compliance', email: SEC, role: 'domain_expert', handle: '@security-compliance-team', roles: ['kb:review'], domains: ['security-governance'] },
      { id: 'usr_eva', name: 'Eva CISO Evaluator', email: EVA, role: 'domain_expert', handle: '@ciso-office', roles: ['kb:review', 'kb:evaluate'], domains: [] },
      { id: 'usr_maint', name: 'Maintainer Admin', email: MAINT, role: 'admin', handle: '@maintainers', roles: ['kb:review', 'kb:maintain', 'kb:admin'], domains: [] }
    ];

    await prisma.kbEventCursor.deleteMany();
    for (const u of usersData) {
      await prisma.kbNotification.deleteMany({ where: { user: { email: u.email } } });
      await prisma.kbProfile.deleteMany({ where: { user: { email: u.email } } });
      await prisma.user.deleteMany({ where: { email: u.email } });

      await prisma.user.create({
        data: {
          id: u.id,
          name: u.name,
          email: u.email,
          passwordHash: '$2a$10$wT8hM..test.hash',
          role: u.role,
          attributes: JSON.stringify({ role: u.role, clearance: 3 }),
          kbProfile: {
            create: {
              kbHandle: u.handle,
              kbRoles: JSON.stringify(u.roles),
              ownedDomains: JSON.stringify(u.domains),
              delegated: true,
              isActive: true
            }
          }
        }
      });
    }

    await prisma.casbinRule.deleteMany({
      where: {
        OR: [
          { v0: 'admin' },
          { v0: leadArchitect.userId },
          { v0: 'usr_maint' }
        ]
      }
    });

    await prisma.casbinRule.createMany({
      data: [
        { ptype: 'p', v0: 'admin', v1: '*', v2: '*' },
        { ptype: 'g', v0: leadArchitect.userId, v1: 'admin' },
        { ptype: 'g', v0: 'usr_maint', v1: 'admin' }
      ]
    });

    // Configuration fake LLM déterministe pour le débat
    setupFakeLlm({
      proposerArguments: [
        {
          optionId: 'opt-mock-1',
          claim: 'Haute disponibilité et isolation garanties par réseau hors-bande',
          grounds: 'Permet une supervision étanche et un temps de reprise nul en cas de coupure du plan de données.',
          kbRefs: []
        }
      ],
      challengerObjections: [
        {
          optionId: 'opt-mock-1',
          claim: 'Surcoût d infrastructure dédié et complexité de câblage',
          grounds: 'L exploitation d un second plan de commutation physique engendre un surcoût d investissement.',
          kbRefs: []
        }
      ]
    });

    console.log(`[E2E Setup] Prêt en ${Math.round(performance.now() - tStart)}ms`);
  }, 120000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (container) {
      console.log('\n[E2E Teardown] Arrêt du conteneur...');
      await container.stop();
    }
    if (existsSync(DB_FILE)) {
      try {
        unlinkSync(DB_FILE);
      } catch {
        //
      }
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ACTE 0 : BASE VIERGE
  // ───────────────────────────────────────────────────────────────────────────
  it('Acte 0 — Base vierge (Contrôle initial de la KB et du stockage)', async () => {
    const t0 = performance.now();

    const health = await client.getKbHealth(MAINT);
    expect(health.status).toBe('ok');
    expect(health.data?.storage).toMatchObject({ persistent: true, mode: 'normal' });

    // NIS2 n'est pas encore couvert (extrait non ingéré)
    const nis2Cov = health.data?.coverage?.['NIS2'];
    expect(nis2Cov?.status).not.toBe('covered');

    // Création du projet initial dans Archinex
    const proj = await createProject(
      {
        id: projectId,
        title: 'Plateforme Opérations Réseau NIS2',
        shortName: 'NETOPS',
        badge: 'NIS2',
        description: 'Démonstrateur bout-en-bout régulation vers capitalisation'
      },
      leadArchitect
    );
    expect(proj.id).toBe(projectId);

    const dur = Math.round(performance.now() - t0);
    console.log(`✓ [Acte 0 - Base vierge] Validé en ${dur}ms (Stockage: normal, NIS2: ${nis2Cov?.status ?? 'non-défini'})`);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ACTE 1 : ANALYSE DU RFP AVANT INGESTION (RÉFÉRENCE)
  // ───────────────────────────────────────────────────────────────────────────
  it('Acte 1 — Analyse du RFP AVANT ingestion (Référence d’appariement)', async () => {
    const t1 = performance.now();

    const rfpPath = resolve(process.cwd(), 'tests/fixtures/rfp/network-operations-nis2.md');
    expect(existsSync(rfpPath), `Le fichier RFP ${rfpPath} doit exister`).toBe(true);
    rfpContent = readFileSync(rfpPath, 'utf-8');

    // Découpage et appariement initial via shredRfp
    const shredRes = await client.shredRfp(rfpContent, 'rfp-netops-nis2', '1.0', engagement1);
    expect(shredRes.status).toBe('ok');
    expect(shredRes.candidates.length).toBeGreaterThanOrEqual(3);

    // Extraction des contrôles avant ingestion
    const c41 = shredRes.candidates.find(
      (c) => c.sourceFragment?.sectionPath?.[0]?.includes('4.1') || c.section?.includes('4.1') || c.originalText.includes('24 hours')
    );
    expect(c41, 'Clause 4.1 doit être extraite').toBeDefined();
    before41Controls = c41!.matched_controls || [];

    // Pour 4.1, avant ingestion : seul NIS2-ART21-2B côté NIS2 (pas encore NIS2-ART23-4)
    expect(before41Controls).toContain('NIS2-ART21-2B');
    expect(before41Controls).not.toContain('NIS2-ART23-4');

    const c42 = shredRes.candidates.find(
      (c) => c.sourceFragment?.sectionPath?.[0]?.includes('4.2') || c.section?.includes('4.2') || c.originalText.includes('training')
    );
    expect(c42, 'Clause 4.2 doit être extraite').toBeDefined();
    before42Controls = c42!.matched_controls || [];
    expect(before42Controls.some((c) => c.startsWith('NIS2-ART20'))).toBe(false);

    const c43 = shredRes.candidates.find(
      (c) => c.sourceFragment?.sectionPath?.[0]?.includes('4.3') || c.section?.includes('4.3') || c.originalText.includes('direct suppliers')
    );
    expect(c43, 'Clause 4.3 doit être extraite').toBeDefined();
    before43Controls = c43!.matched_controls || [];
    expect(before43Controls).not.toContain('NIS2-ART21-3');

    // Mesure de référence du juge d'option (checkOption) sur l'option avant capitalisation
    const checkBefore = await client.checkOption({
      option: {
        id: 'opt-netops-ha',
        title: 'Multi-region active-active network operations platform',
        summary: 'Out-of-band management network for the automation chain with break-glass access'
      },
      subject: 'Out-of-band management network for the automation chain',
      domains: ['network-automation'],
      frameworks: ['NIS2']
    });
    beforeOptionVerdicts = (checkBefore.verdicts || []) as any[];
    expect(beforeOptionVerdicts.some((v) => v.rule_id === 'PAT-099' || v.id === 'PAT-099' || v.typed_id === 'pattern:PAT-099')).toBe(false);

    // Initialisation du sujet d'architecture dans Archinex
    await createSubject(
      projectId,
      {
        id: subjectHaId,
        sectionRef: '§4.4',
        name: 'Topologie Haute Disponibilité & Télémesure Critique',
        domain: 'network-automation',
        problemStatement: 'Définir l architecture résiliente du réseau d exploitation avec reprise sub-30s.'
      },
      leadArchitect
    );

    const dur = Math.round(performance.now() - t1);
    console.log(`✓ [Acte 1 - Analyse RFP Référence] Validé en ${dur}ms (4.1 contrôles: [${before41Controls.join(', ')}])`);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ACTE 2 : INGESTION RÉGLEMENTAIRE (19 EXIGENCES NIS2, REVUE, VALIDATION)
  // ───────────────────────────────────────────────────────────────────────────
  it('Acte 2 — Ingestion réglementaire (19 exigences NIS2, revue par expert, publication)', async () => {
    const t2 = performance.now();

    const nis2Path = resolve(process.cwd(), 'tests/fixtures/frameworks/nis2_excerpt.txt');
    expect(existsSync(nis2Path), `Le fichier ${nis2Path} doit exister`).toBe(true);
    const nis2FileContent = readFileSync(nis2Path);

    // 1. Upload multipart par MAINT
    const up = await client.ingestFramework(
      {
        framework_id: 'NIS2',
        version: '2022/2555',
        file_name: 'nis2_excerpt.txt',
        file_content: nis2FileContent
      } as any,
      MAINT
    );
    expect(up.status, JSON.stringify(up)).toBe('ok');
    ingestionId = Number((up.data as any).id);
    expect(ingestionId).toBeGreaterThan(0);

    // 2. Vérification du détail : 19 exigences
    const detail = await client.getFrameworkIngestion(String(ingestionId), MAINT);
    expect(detail.status).toBe('ok');
    const totalReqs = (detail.data as any).total ?? (detail.data as any).requirements?.length;
    expect(totalReqs).toBe(19);

    // 3. Propositions de liens IA (marquées llm-derived)
    const linkProposals = await client.addFrameworkLinkProposals(
      ingestionId,
      {
        model: 'simulated-llm',
        proposals: [
          {
            requirement_id: 'NIS2-ART21-2A',
            satisfied_by: ['P-008'],
            acceptance_criteria: ['Politiques de sécurité et chiffrement validées']
          }
        ]
      },
      MAINT
    );
    expect(linkProposals.status).toBe('ok');

    // 4. Expert d'un autre domaine (ALICE) reçoit 403 sur une ligne security-governance
    const deniedAlice = await client.reviewFrameworkRequirement(
      String(ingestionId),
      'NIS2-ART21-2A',
      {
        decision: 'accept',
        comment: 'Tentative illégitime par l expert réseau'
      },
      ALICE
    );
    expect(deniedAlice.status).toBe('forbidden');

    // 5. Tentative de déclaration prématurée : refus 409 avec liste des manques
    const prematureDecl = await client.declareFrameworkCoverage('NIS2', SEC);
    expect(prematureDecl.status).toBe('conflict');

    // 6. Revue ligne par ligne par SEC (propriétaire du domaine security-governance)
    // Une en amend avec lien P-008 et critère d'acceptation
    const amendRes = await client.reviewFrameworkRequirement(
      String(ingestionId),
      'NIS2-ART21-2A',
      {
        decision: 'amend',
        links: ['P-008'],
        acceptance_criteria: ['Validation TLS 1.3 obligatoire'],
        comment: 'Amandé avec lien direct P-008'
      },
      SEC
    );
    expect(amendRes.status).toBe('ok');

    // Acceptation des 18 autres lignes
    const allRows = (detail.data as any).rows ?? (detail.data as any).requirements ?? [];
    for (const r of allRows) {
      const rid = r.requirement_id ?? r.id;
      if (rid === 'NIS2-ART21-2A') continue;
      const acceptRes = await client.reviewFrameworkRequirement(
        String(ingestionId),
        rid,
        {
          decision: 'accept',
          comment: 'Validé conforme par le RSSI'
        },
        SEC
      );
      expect(acceptRes.status, `Ligne ${rid} doit être acceptée`).toBe('ok');
    }

    // 7. Application de l'ingestion par MAINT
    const applied = await client.applyFrameworkIngestion(ingestionId, MAINT);
    expect(applied.status).toBe('ok');

    // 8. Publication de la doctrine par MAINT
    const published = await client.publishKbDoctrine({}, MAINT);
    expect(published.status).toBe('ok');
    expect(published.data).toBeDefined();
    expect(published.data!.snapshot_id).toMatch(/^snapshot-/);
    expect(published.warnings ?? []).toEqual([]);
    createdSnapshotId = published.data!.snapshot_id;

    // 9. Déclaration finale de couverture par SEC -> covered
    const coverageRes = await client.declareFrameworkCoverage('NIS2', SEC);
    expect(coverageRes.status).toBe('ok');

    const healthAfter = await client.getKbHealth(MAINT);
    expect((healthAfter.data as any).last_snapshot?.snapshot_id).toBe(createdSnapshotId);
    expect((healthAfter.data as any).coverage?.['NIS2']?.status).toBe('covered');

    const dur = Math.round(performance.now() - t2);
    console.log(`✓ [Acte 2 - Ingestion Réglementaire] Validé en ${dur}ms (Snapshot: ${createdSnapshotId}, Couverture: covered)`);
  }, 90000);

  // ───────────────────────────────────────────────────────────────────────────
  // ACTE 3 : PREUVE DE CAUSALITÉ SUR LE RFP
  // ───────────────────────────────────────────────────────────────────────────
  it('Acte 3 — Preuve de causalité sur le RFP (Nouveaux contrôles réglementaires associés)', async () => {
    const t3 = performance.now();

    // Rejouer le même RFP sur un engagement neuf
    const resAfter = await client.shredRfp(rfpContent, 'rfp-netops-nis2-v2', '1.0', engagement2);
    expect(resAfter.status).toBe('ok');

    const c41After = resAfter.candidates.find(
      (c) => c.sourceFragment?.sectionPath?.[0]?.includes('4.1') || c.section?.includes('4.1') || c.originalText.includes('24 hours')
    );
    expect(c41After).toBeDefined();
    const after41Controls = c41After!.matched_controls || [];

    const c42After = resAfter.candidates.find(
      (c) => c.sourceFragment?.sectionPath?.[0]?.includes('4.2') || c.section?.includes('4.2') || c.originalText.includes('training')
    );
    expect(c42After).toBeDefined();
    const after42Controls = c42After!.matched_controls || [];

    const c43After = resAfter.candidates.find(
      (c) => c.sourceFragment?.sectionPath?.[0]?.includes('4.3') || c.section?.includes('4.3') || c.originalText.includes('direct suppliers')
    );
    expect(c43After).toBeDefined();
    const after43Controls = c43After!.matched_controls || [];

    // Preuve explicite avant ≠ après (fermeture de boucle causale RFP)
    // 4.1 contient maintenant NIS2-ART23-4 (alerte précoce 24h) en plus de NIS2-ART21-2B
    expect(before41Controls).not.toContain('NIS2-ART23-4');
    expect(after41Controls).toContain('NIS2-ART23-4');
    expect(after41Controls).toContain('NIS2-ART21-2B');

    // 4.2 contient maintenant des contrôles Article 20 (gouvernance / formation)
    expect(before42Controls.some((c) => c.startsWith('NIS2-ART20'))).toBe(false);
    expect(after42Controls.some((c) => c.startsWith('NIS2-ART20'))).toBe(true);

    // 4.3 contient maintenant NIS2-ART21-3
    expect(before43Controls).not.toContain('NIS2-ART21-3');
    expect(after43Controls).toContain('NIS2-ART21-3');

    const dur = Math.round(performance.now() - t3);
    console.log(`✓ [Acte 3 - Causalité RFP] Validé en ${dur}ms (4.1 après: [${after41Controls.join(', ')}])`);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ACTE 4 : SUJETS ET DÉLIBÉRATION (DÉBAT MULTI-AGENTS, VERDICT, PORTE G3)
  // ───────────────────────────────────────────────────────────────────────────
  it('Acte 4 — Sujets et délibération (Maturité, débat multi-agents, feedback juge, arbitrage humain G3)', async () => {
    const t4 = performance.now();

    // 1. Critères et options du sujet
    const crit1 = await createCriterion(
      subjectHaId,
      {
        name: 'Temps de bascule et RTO',
        kind: 'nfr',
        weight: 5
      },
      leadArchitect
    );

    const crit2 = await createCriterion(
      subjectHaId,
      {
        name: 'Coût d infrastructure et complexité',
        kind: 'cost',
        weight: 3
      },
      leadArchitect
    );

    const opt1 = await createOption(
      subjectHaId,
      {
        title: 'Active-Active Multi-Région avec Réseau Hors-Bande Dédié',
        summary: 'Deux régions actives interconnectées avec réseau d automatisation dédié et break-glass access',
        origin: 'human',
        kbRefs: []
      },
      leadArchitect
    );
    opt1Id = opt1.id;

    const opt2 = await createOption(
      subjectHaId,
      {
        title: 'Active-Passive Cold Failover',
        summary: 'Site secondaire froid nécessitant une intervention manuelle',
        origin: 'human',
        kbRefs: []
      },
      leadArchitect
    );
    opt2Id = opt2.id;

    await upsertEvaluation(
      subjectHaId,
      {
        optionId: opt1Id,
        criterionId: crit1.id,
        score: 2,
        justification: 'RTO = 0 mesuré en test de résilience'
      },
      leadArchitect
    );

    await upsertEvaluation(
      subjectHaId,
      {
        optionId: opt1Id,
        criterionId: crit2.id,
        score: 1,
        justification: 'Surcoût modéré pour le lien d administration'
      },
      leadArchitect
    );

    await upsertEvaluation(
      subjectHaId,
      {
        optionId: opt2Id,
        criterionId: crit1.id,
        score: -2,
        justification: 'RTO > 30s incompatible avec les exigences de criticité'
      },
      leadArchitect
    );

    await upsertEvaluation(
      subjectHaId,
      {
        optionId: opt2Id,
        criterionId: crit2.id,
        score: 2,
        justification: 'Moins onéreux à l achat'
      },
      leadArchitect
    );

    // 2. Débat contradictoire multi-agents (A3)
    const debate = await orchestrateDebate(subjectHaId, {
      maxRounds: 1,
      actor: leadArchitect
    });
    expect(debate.newArgumentsCount).toBeGreaterThanOrEqual(1);

    // Résolution des objections ouvertes
    const args = await listArguments(subjectHaId);
    for (const a of args.filter((x) => x.stance === 'objection' && x.resolution === 'open')) {
      await resolveArgument(
        a.id,
        {
          resolution: 'accepted_risk',
          expectedVersion: a.version
        },
        leadArchitect,
        true
      );
    }

    // 3. Contestation d'un verdict du juge d'options (POST /api/knowledge/verdict-feedback)
    const fbRes = await client.submitVerdictFeedback(
      {
        typed_id: 'pattern:PAT-099',
        feedback: 'wrong_violation',
        justification: 'L isolation physique du réseau hors-bande annule tout risque de saturation croisée',
        option: {
          title: 'Active-Active Multi-Région avec Réseau Hors-Bande Dédié',
          description: 'Topologie réseau étanche'
        }
      },
      ALICE
    );
    expect(fbRes.status).toBe('ok');

    // 4. Avant décision humaine : la préparation de candidats est formellement refusée
    await expect(prepareSubjectKbCandidates(subjectHaId, leadArchitect)).rejects.toThrow(
      /arbitrage/i
    );

    // 5. Décision humaine opposable (Porte G3)
    const decision = await recordArbitrationDecision(
      subjectHaId,
      {
        retainedOptionId: opt1Id,
        rejected: [{ optionId: opt2Id, reason: 'RTO inacceptable pour la criticité' }],
        rationale: 'Retenu active-active avec réseau d administration hors-bande dédié.',
        reversibility: 'costly'
      },
      leadArchitect
    );
    expect(decision.id).toBeDefined();
    expect(decision.retainedOptionId).toBe(opt1Id);
    const updatedSubject = await prisma.subject.findUnique({ where: { id: subjectHaId } });
    expect(updatedSubject?.maturityLevel).toBe('L3_decided');
    expect(updatedSubject?.deliberationStatus).toBe('arbitrated');

    const dur = Math.round(performance.now() - t4);
    console.log(`✓ [Acte 4 - Délibération & Porte G3] Validé en ${dur}ms (Sujet arbitré: ${subjectHaId})`);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ACTE 5 : CAPITALISATION (SOUMISSION, DOUBLE REVUE, PROMOTION, PUBLICATION)
  // ───────────────────────────────────────────────────────────────────────────
  it('Acte 5 — Capitalisation (Préparation candidat, double revue, promotion et publication)', async () => {
    const t5 = performance.now();

    // 1. Préparation des candidats anonymisés depuis le sujet arbitré
    const prep = await prepareSubjectKbCandidates(subjectHaId, leadArchitect);
    expect(prep.candidates.length).toBeGreaterThanOrEqual(1);

    // 2. Soumission d'un pattern par ALICE
    const subPattern = await client.submitCandidate(
      {
        kind: 'new_asset',
        asset_type: 'pattern',
        title: 'Out-of-band management network for the automation chain',
        proposed_content: PATTERN_OOB,
        source: { system: 'archinex', engagement: engagement1 }
      } as any,
      ALICE
    );
    expect(subPattern.candidate_id).toMatch(/^CAND-\d{8}-\d{4}$/);
    expect(subPattern.candidate_id).not.toContain('LOCAL');
    candidatePatternId = subPattern.candidate_id;

    // 3. Relecture du pattern par l'expert du domaine (ALICE) via la boîte de revue
    const aliceInbox = await client.getReviewInbox(ALICE);
    expect(aliceInbox.status).toBe('ok');
    const patternInboxItem = (aliceInbox.data as any[]).find((i) => i.candidate_id === candidatePatternId);
    expect(patternInboxItem).toBeDefined();
    expect(patternInboxItem.reason).toBe('review');
    expect(typeof patternInboxItem.due_at).toBe('string');

    // Vérification des 7 contrôles automatiques
    const candDetail = await client.getCandidate(candidatePatternId, ALICE);
    expect((candDetail.data as any).checks.length).toBe(7);

    // Validation du pattern par ALICE
    const revPattern = await client.reviewCandidate(
      candidatePatternId,
      'accept',
      { reason: 'Architecture approuvée pour le domaine network-automation' },
      ALICE
    );
    expect(revPattern.status).toBe('ok');

    // 4. Soumission d'un principe : requiert obligatoirement une seconde revue collégiale
    const subPrinciple = await client.submitCandidate(
      {
        kind: 'new_asset',
        asset_type: 'principle',
        title: 'Out-of-band network isolation',
        proposed_content: PRINCIPLE_OOB,
        source: { system: 'archinex', engagement: engagement1 }
      } as any,
      ALICE
    );
    candidatePrincipleId = subPrinciple.candidate_id;
    expect(candidatePrincipleId).toMatch(/^CAND-\d{8}-\d{4}$/);

    // Première revue du principe par ALICE
    const firstPrincipleRev = await client.reviewCandidate(
      candidatePrincipleId,
      'accept',
      { reason: 'Principe fondamental vérifié' },
      ALICE
    );
    expect(firstPrincipleRev.status).toBe('ok');

    // La seconde revue est automatiquement sollicitée dans la boîte de MAINT
    const maintInbox = await client.getReviewInbox(MAINT);
    const secondRevItem = (maintInbox.data as any[]).find((i) => i.candidate_id === candidatePrincipleId);
    expect(secondRevItem).toBeDefined();
    expect(secondRevItem.reason).toBe('second_review');

    // Seconde revue par MAINT
    const secondPrincipleRev = await client.reviewCandidate(
      candidatePrincipleId,
      'accept',
      { reason: 'Validation collégiale architecture & gouvernance' },
      MAINT
    );
    expect(secondPrincipleRev.status).toBe('ok');

    // 5. Promotion par MAINT
    const promPattern = await client.promoteKbCandidate(candidatePatternId, MAINT);
    expect(promPattern.status).toBe('ok');
    expect(promPattern.warnings).toEqual([]);

    const promPrinciple = await client.promoteKbCandidate(candidatePrincipleId, MAINT);
    expect(promPrinciple.status).toBe('ok');

    // 6. Publication doctrinale par MAINT
    const pubFinal = await client.publishKbDoctrine({}, MAINT);
    expect(pubFinal.status).toBe('ok');
    expect(pubFinal.data).toBeDefined();
    const finalSnapshotId = pubFinal.data!.snapshot_id;
    expect(finalSnapshotId).toMatch(/^snapshot-/);
    expect(pubFinal.data!.published).toContain(candidatePatternId);
    expect(pubFinal.data!.published).toContain(candidatePrincipleId);

    // 7. Distribution des événements de gouvernance via KbNotificationService
    const notifService = new KbNotificationService(client);
    const dispatchResult = await notifService.pollAndDispatchEvents(client);
    expect(dispatchResult.events.length).toBeGreaterThan(0);
    expect(dispatchResult.processedCount).toBeGreaterThan(0);

    const dur = Math.round(performance.now() - t5);
    console.log(`✓ [Acte 5 - Capitalisation] Validé en ${dur}ms (Pattern: ${candidatePatternId}, Principe: ${candidatePrincipleId}, Snapshot: ${finalSnapshotId})`);
  }, 90000);

  // ───────────────────────────────────────────────────────────────────────────
  // ACTE 6 : BOUCLE FERMÉE (LE JUGE D'OPTIONS APPLIQUE LA RÈGLE CAPITALISÉE)
  // ───────────────────────────────────────────────────────────────────────────
  it('Acte 6 — Boucle fermée (Le juge d’options prend en compte la règle capitalisée)', async () => {
    const t6 = performance.now();

    // Reconsidération de la même option qu'à l'Acte 1 et l'Acte 4
    const checkAfter = await client.checkOption({
      option: {
        id: 'opt-netops-ha',
        title: 'Multi-region active-active network operations platform',
        summary: 'Out-of-band management network for the automation chain with zero data loss',
        kbRefs: ['PAT-099']
      },
      subject: 'Out-of-band management network for the automation chain',
      domains: ['network-automation'],
      frameworks: ['NIS2']
    });

    expect(checkAfter.offline).toBe(false);
    const afterVerdicts = (checkAfter.verdicts || []) as any[];

    // Preuve explicite avant ≠ après :
    // Avant l'acte 5, PAT-099 n'existait pas dans le corpus de contrôle
    expect(beforeOptionVerdicts.some((v) => v.rule_id === 'PAT-099' || v.id === 'PAT-099' || v.typed_id === 'pattern:PAT-099')).toBe(false);

    // Après l'acte 5, le juge d'options émet un verdict tenant compte de PAT-099
    const patternVerdict = afterVerdicts.find((v) => v.rule_id === 'PAT-099' || v.id === 'PAT-099' || v.typed_id === 'pattern:PAT-099');
    expect(patternVerdict, 'Le verdict du juge d’option doit mentionner PAT-099 après promotion/publication').toBeDefined();

    const dur = Math.round(performance.now() - t6);
    console.log(`✓ [Acte 6 - Boucle Fermée] Validé en ${dur}ms (Verdict PAT-099: ${patternVerdict?.verdict ?? 'détecté'})`);
  });
});
