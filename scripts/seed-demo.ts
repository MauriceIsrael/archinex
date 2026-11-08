import { prisma } from '../src/lib/server/prisma.js';
import { loadOntologyCatalog } from '../src/lib/server/edp/ontologyClient.js';
import {
  computeRefinementCoverage,
  composeMultiAxisHydration,
  evaluateMultiAxisOracle
} from '../src/lib/server/edp/refinementCoverage.js';
import { syncHydratedInventoryToNautobot } from '../src/lib/server/edp/nautobotSync.js';

export const PROJECT_ID = 'lulu-avec-options-et-criteres-proposes';
export const SUBJECT_ID = 'sub_lulu-avec-options-et-criteres-proposes_89';
export const RETAINED_OPTION_ID = 'opt-1793311130542-wmhxr';
export const RETAINED_OPTION_TITLE =
  'Obligation de chiffrement IPsec ESP et médiation DEA pour les flux S6a Lot 3 ↔ Lot 1';

export const DETAILED_SPEC_MARKDOWN = `## 1. Contexte & Choix d'Architecture Validé (Socle L3)
- **Option retenue** : Obligation de chiffrement IPsec ESP et médiation DEA pour les flux S6a Lot 3 ↔ Lot 1
- **Motivation d'arbitrage** : c'est la bonne
- **Réversibilité & Conformité** : reversible · Compliant

## 2. Décomposition des Composants & Architecture Cible
- **Composant principal** : Obligation de chiffrement IPsec ESP et médiation DEA pour les flux S6a Lot 3 ↔ Lot 1
- **Rôle fonctionnel & principes clés** : Tout échange S6a initié par un MME tiers doit obligatoirement terminer son tunnel IPsec sur le SecGW-Lot1, puis être inspecté par le DEA-Lot1. Tous les flux directs vers le HSS-Lot1 doivent être chiffrés.
- **Modélisation exhaustive des objets (3GPP TS 28.620 NRM & TM Forum SID GB922)** :
  1. **Organisation Tiers (\`tenancy.Tenant\` / \`Party\`)** : \`org-lot3-mno\` (Opérateur Tiers Lot 3) & \`org-lot2-ran\` (Cellules Mobiles Lot 2).
  2. **Objet Externe Fictif (\`ExternalMMEFunction\`)** : \`ext-mme-lot3-01\` (Zone non-confiante \`ZONE-PARTNER-LOT3-UNTRUSTED\`).
  3. **Chaîne de Médiation Interne Lot 1** : \`secgw-lot1-01\` (Terminaison IPsec ESP) → \`dea-lot1-01\` (Filtrage Diameter S6a & Masquage Topologique) → \`hss-lot1-01\` (Cœur HSS Lot 1).

## 3. Interfaces, Protocoles & Matrice de Flux
- **Chiffrement & Sécurité** : Chiffrement matériel / logique de bout en bout (suites cryptographiques fortes \`IPsec-ESP-IKEv2\` / \`AES-256-GCM\` / \`DH-20-ECP384\` sur le tunnel \`tun-ipsec-esp-lot3-secgw1\` porté par le lien IP underlay \`link-ip-lot3-secgw1\`).
- **Médiation & Contrôle** : Passerelle dédiée de médiation (\`dea-lot1-01\`) pour l'isolation et la conformité aux exigences réglementaires sur le flux \`flow-s6a-lot3-to-hss1\`.
- **Séparation des zones** : Cloisonnement strict entre le périmètre Lot 1 (\`ZONE-DMZ-INTERCO-LOT1\`, \`ZONE-MEDIATION-SIGNALING-LOT1\`, \`ZONE-CORE-HSS-RESTRICTED\`) et les tiers (\`ZONE-PARTNER-LOT3-UNTRUSTED\`).

## 4. Exploitation, Supervision & Points de Vigilance
- **Supervision NOC** : Sondes de télémétrie temps réel (\`probe-noc-s6a-lot3\`, neutralisation des fausses alarmes cellules mobiles \`REQ-Lot1-1274\`) et contrat SLA d'hébergement (\`sla-lot3-hosting-s6a\`, démarcation \`REQ-Lot1-1343\`) réconciliés via le pivot \`tenant_ref = "org-lot3-mno"\`.
- **Haute Disponibilité** : Résilience électrique Dual-Feed 2N et bascule automatique VRRP/BFD sans rupture de service.`;

export async function seedDemo(client?: any) {
  const db = client || prisma;

  console.log('══════════════════════════════════════════════════════════════════════════════');
  console.log('🚀 ARCHINEX SEED:DEMO — Parcours Complet Bout-en-Bout (§14 Lulu Lot 3 ↔ Lot 1)');
  console.log('══════════════════════════════════════════════════════════════════════════════');

  // 0. Auto-initialisation si la base est neuve/vierge (Mode Autonome Self-Contained)
  await db.project.upsert({
    where: { id: PROJECT_ID },
    create: {
      id: PROJECT_ID,
      title: 'Lulu (avec options et critères proposés)',
      shortName: 'Lulu §14 Démo',
      type: 'project_rfp',
      badge: 'Lulu · Démo Bout-en-Bout',
      description:
        "Programme national large bande PPDR (Mission Critical) au Luxembourg. Parcours complet d'arbitrage §14 Lot 3 ↔ Lot 1.",
      status: 'active',
      strategy: JSON.stringify({
        objectives: [
          'Haute disponibilité 99,999 % et résilience géo-distribuée',
          'Chiffrement matériel de bout en bout et médiation DEA S6a',
          'Souveraineté des données et opérations (NIS2 / PSF)'
        ],
        principles: [
          'Standardisation 3GPP Release 17 / TS 28.620',
          'Architecture Zero-Trust avec mTLS et réconciliation SID GB922'
        ],
        constraints: [
          'Topologie 3 datacentres POST (RCE, RCS, RCW)',
          'Démarcation stricte : FRMCS confié aux CFL, réseaux MNO commerciaux au Lot 3'
        ]
      })
    },
    update: {}
  });

  await db.engagement.upsert({
    where: { id: PROJECT_ID },
    create: {
      id: PROJECT_ID,
      title: 'Lulu (avec options et critères proposés)',
      shortName: 'Lulu §14 Démo',
      type: 'project_rfp',
      badge: 'Lulu · Démo Bout-en-Bout',
      description:
        "Programme national large bande PPDR (Mission Critical) au Luxembourg. Parcours complet d'arbitrage §14 Lot 3 ↔ Lot 1.",
      status: 'active',
      defaultSubjectId: SUBJECT_ID,
      drafts: '{}',
      subjects: '[]'
    },
    update: {}
  });

  await db.subject.upsert({
    where: { id: SUBJECT_ID },
    create: {
      id: SUBJECT_ID,
      projectId: PROJECT_ID,
      sectionRef: '§14',
      name: 'Hébergement Lots 2/3, RAN tiers et cellules mobiles : sécurité contre souplesse',
      domain: 'general',
      problemStatement:
        'Comment le Lot 1 expose-t-il aux Lots 2/3, aux RAN tiers (FRMCS, in-house) et aux cellules intermittentes un point d\'accès unique, sécurisé et supervisé, qui couvre l\'hébergement physique en datacentre et la connectivité logique, sans élargir le périmètre de sécurité du Lot 1 ni dégrader la supervision NOC ?',
      maturityLevel: 'L1_framed',
      deliberationStatus: 'open',
      waitingForRole: 'lead_architect',
      requirementRefs: JSON.stringify([
        'REQ-Lot1-557',
        'REQ-Lot1-701',
        'REQ-Lot1-711',
        'REQ-Lot1-1270',
        'REQ-Lot1-1274',
        'REQ-Lot1-1275',
        'REQ-Lot1-1276',
        'REQ-Lot1-1277',
        'REQ-Lot1-1278',
        'REQ-Lot1-1279',
        'REQ-Lot1-1343'
      ])
    },
    update: {}
  });

  // Si la base ne contient aucun utilisateur démo, initialiser l'admin pour l'accès IHM direct
  const userCount = await db.user.count();
  if (userCount === 0) {
    const { default: bcrypt } = await import('bcryptjs');
    const adminPass = await bcrypt.hash('admin123', 10);
    await db.user.create({
      data: {
        id: 'usr_admin_001',
        name: 'Lead Architect (Admin)',
        email: 'admin@archinex.local',
        passwordHash: adminPass,
        role: 'admin',
        attributes: JSON.stringify({
          clearance: 3,
          department: 'Architecture & Systèmes',
          role: 'lead_architect',
          tags: ['internal']
        })
      }
    });
    await db.casbinRule.createMany({
      data: [
        { ptype: 'p', v0: 'admin', v1: '*', v2: '*' },
        { ptype: 'g', v0: 'usr_admin_001', v1: 'admin' }
      ]
    });
  }

  // 1. Positionner §14 comme sujet par défaut de l'engagement Lulu pour un accès immédiat
  console.log(`✅ [Phase 1 · Appropriation] Sujet par défaut positionné sur : ${SUBJECT_ID}`);
  console.log(`   Titre : §14 · Hébergement Lots 2/3, RAN tiers et cellules mobiles : sécurité contre souplesse`);

  // 2. Mettre à jour l'Option retenue et la Décision formelle en Phase 2 (Délibération)
  await db.option.upsert({
    where: { id: RETAINED_OPTION_ID },
    create: {
      id: RETAINED_OPTION_ID,
      subjectId: SUBJECT_ID,
      title: RETAINED_OPTION_TITLE,
      summary:
        'Tout échange S6a initié par un MME tiers doit obligatoirement terminer son tunnel IPsec sur le SecGW-Lot1, puis être inspecté par le DEA-Lot1. Tous les flux directs vers le HSS-Lot1 doivent être chiffrés.',
      origin: 'llm-proposed',
      status: 'retained',
      author: 'Architecte Sécurité Lot 1',
      role: 'lead_architect',
      productionMode: 'llm-proposed-human-approved'
    },
    update: {
      title: RETAINED_OPTION_TITLE,
      summary:
        'Tout échange S6a initié par un MME tiers doit obligatoirement terminer son tunnel IPsec sur le SecGW-Lot1, puis être inspecté par le DEA-Lot1. Tous les flux directs vers le HSS-Lot1 doivent être chiffrés.',
      status: 'retained'
    }
  });

  const decisionRecord = await db.decision.upsert({
    where: { subjectId: SUBJECT_ID },
    create: {
      id: `dec-${SUBJECT_ID}`,
      subjectId: SUBJECT_ID,
      retainedOptionId: RETAINED_OPTION_ID,
      rationale: "c'est la bonne",
      reversibility: 'reversible',
      arbiterId: 'Directeur Programme & Architecte Sécurité Lot 1',
      arbiterRole: 'lead_architect'
    },
    update: {
      retainedOptionId: RETAINED_OPTION_ID,
      rationale: "c'est la bonne",
      reversibility: 'reversible',
      arbiterId: 'Directeur Programme & Architecte Sécurité Lot 1',
      arbiterRole: 'lead_architect'
    }
  });
  console.log(`✅ [Phase 2 · Délibération] Décision arbitrée : "${RETAINED_OPTION_TITLE}" (Motivation : "${decisionRecord.rationale}")`);

  // 3. Mettre à jour la Spécification Détaillée (Phase 3 HLD) dans l'Engagement JSON
  const engagement = await db.engagement.findUnique({
    where: { id: PROJECT_ID }
  });

  if (engagement) {
    const drafts = JSON.parse(engagement.drafts || '{}');
    const existingDraft = drafts[SUBJECT_ID] || {};
    drafts[SUBJECT_ID] = {
      section_id: '§14',
      subject: 'Hébergement Lots 2/3, RAN tiers et cellules mobiles : sécurité contre souplesse',
      maturity: 'L3_decided',
      is_provisional: false,
      ...existingDraft,
      retainedOptionId: RETAINED_OPTION_ID,
      retainedOption: RETAINED_OPTION_TITLE,
      rationale: "c'est la bonne",
      reversibility: 'reversible',
      regulatoryStatus: 'Compliant',
      detailedSpec: DETAILED_SPEC_MARKDOWN,
      updatedBy: 'Directeur Programme (seed:demo)',
      updatedAt: new Date().toISOString(),
      retenu:
        Array.isArray(existingDraft.retenu) && existingDraft.retenu.length > 0
          ? existingDraft.retenu
          : [RETAINED_OPTION_TITLE],
      suppose:
        Array.isArray(existingDraft.suppose) && existingDraft.suppose.length > 0
          ? existingDraft.suppose
          : [
              {
                text: 'Chiffrement IPsec ESP et médiation DEA S6a obligatoires',
                consequence:
                  'Terminaison IPsec sur SecGW-Lot1 et filtrage Diameter S6a sur DEA-Lot1',
                cost_hint: '+45 k€'
              }
            ],
      conflit: Array.isArray(existingDraft.conflit) ? existingDraft.conflit : [],
      manque: Array.isArray(existingDraft.manque) ? existingDraft.manque : []
    };

    const parsed = JSON.parse(engagement.subjects || '[]');
    let subjectsList: any[] = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null
      ? Object.values(parsed)
      : [];

    let targetSubject = subjectsList.find((s) => s.id === SUBJECT_ID);
    if (!targetSubject) {
      targetSubject = {
        id: SUBJECT_ID,
        section_ref: '§14',
        name: 'Hébergement Lots 2/3, RAN tiers et cellules mobiles : sécurité contre souplesse',
        level: 'L3_decided',
        status: 'decided',
        requirement_ids: ['REQ-Lot1-1274', 'REQ-Lot1-1343'],
        problem_statement:
          'Comment héberger et interconnecter les équipements des Lots 2/3 tout en garantissant le chiffrement IPsec ESP, la médiation DEA S6a et la réconciliation SLA/NOC ?'
      };
      subjectsList.push(targetSubject);
    }

    targetSubject.decision = {
      retainedOptionId: RETAINED_OPTION_ID,
      retainedOptionTitle: RETAINED_OPTION_TITLE,
      rationale: "c'est la bonne",
      reversibility: 'reversible',
      regulatoryStatus: 'Compliant',
      detailedSpec: DETAILED_SPEC_MARKDOWN
    };

    await db.engagement.update({
      where: { id: PROJECT_ID },
      data: {
        defaultSubjectId: SUBJECT_ID,
        drafts: JSON.stringify(drafts),
        subjects: JSON.stringify(subjectsList)
      }
    });
  }
  console.log(`✅ [Phase 3 · Spécification HLD] Spécification L3/L4 enregistrée (4 sections + objets cibles)`);

  // 4. Phase 4 : Raffinement Ontologique Multi-Axes, Hydratation Exhaustive (7 classes d'objets) & Oracle OPA
  const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });

  const demoBindings = [
    { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
    { urn: 'urn:archinex:ontology:infrastructure:compute:suse_telco_cloud_sylva', revision: 1 },
    { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 },
    { urn: 'urn:archinex:ontology:telecom:network:spine_leaf_evpn', revision: 1 },
    { urn: 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256', revision: 1 },
    { urn: 'urn:archinex:ontology:security:zone:oam', revision: 2 },
    { urn: 'urn:archinex:ontology:security:zone:user_plane', revision: 1 },
    { urn: 'urn:archinex:ontology:platform:env:iso_prod_3tiers', revision: 1 },
    { urn: 'urn:archinex:ontology:facilities:power:dual_feed_2n', revision: 1 }
  ];

  const coverage = computeRefinementCoverage(
    {
      subjectId: SUBJECT_ID,
      title: '§14 · Hébergement Lots 2/3, RAN tiers et cellules mobiles : sécurité contre souplesse',
      problem:
        'Comment héberger et interconnecter les équipements des Lots 2/3 (MME tiers, RAN, cellules mobiles) tout en garantissant le chiffrement IPsec ESP, la médiation DEA S6a et la réconciliation SLA/NOC ?',
      decisionText: RETAINED_OPTION_TITLE,
      detailedSpec: DETAILED_SPEC_MARKDOWN,
      explicitBindings: demoBindings,
      autoBindFromText: true,
      selectedConceptUrn: 'AUTO'
    },
    catalog
  );

  const hydratedInventory = composeMultiAxisHydration(
    SUBJECT_ID,
    coverage.composedBindings,
    catalog,
    {}
  );

  const oracleEval = await evaluateMultiAxisOracle(
    hydratedInventory,
    coverage.composedBindings,
    catalog
  );

  const edpId = `EDP-${SUBJECT_ID}`;
  const edpPayload = {
    metadata: {
      id: edpId,
      title: `EDP §14 · Chiffrement IPsec ESP, Médiation DEA S6a & Réconciliation Lot 3 ↔ Lot 1`,
      status: 'proposed',
      revision: 1
    },
    selectedConceptUrn: 'AUTO',
    decision_context: {
      problem:
        'Garantir l’étanchéité cryptographique (IPsec ESP) et protocolaire (DEA S6a) entre le Lot 3 tiers et le cœur Lot 1 (HSS) tout en réconciliant l’inventaire, le SLA et le monitoring NOC.',
      decision: RETAINED_OPTION_TITLE,
      tradeoffs: [
        'Cumul multi-cluster SUSE Telco Cloud & Sylva : Pool SR-IOV/DPDK (SecGW/DEA) + Pool Standard NIS2',
        'Modélisation exhaustive 3GPP TS 28.620 NRM (ExternalMMEFunction) + TM Forum SID GB922 (Party/SLA/Probe)',
        'Réconciliation déterministe par clé pivot tenant_ref = "org-lot3-mno" vérifiée par OPA Rego'
      ],
      ontology_bindings: coverage.composedBindings
    },
    refinementCoverage: coverage,
    hydratedInventory,
    lldOverrides: {},
    lastVerdict: {
      verdict: oracleEval.verdict,
      verified_at: new Date().toISOString(),
      violations: oracleEval.violationMessages,
      detailedViolations: oracleEval.violations,
      ontologyFingerprint: oracleEval.ontologyFingerprint,
      mutation_score: 100
    },
    verification_oracle: {
      engine: 'opa',
      entrypoint: 'data.archinex.edp.multiaxis.evaluation',
      policy_files: [{ filename: 'edp/policies/multi_axis_refinement.rego' }]
    },
    provenance: {
      production_mode: 'llm-proposed-human-approved',
      created_at: new Date().toISOString()
    }
  };

  await (db as any).executableDecisionPackage.upsert({
    where: { id: edpId },
    create: {
      id: edpId,
      subjectId: SUBJECT_ID,
      decisionId: decisionRecord.id,
      status: 'proposed',
      revision: 1,
      productionMode: 'llm-proposed-human-approved',
      policyHash: oracleEval.ontologyFingerprint,
      content: JSON.stringify(edpPayload)
    },
    update: {
      subjectId: SUBJECT_ID,
      decisionId: decisionRecord.id,
      policyHash: oracleEval.ontologyFingerprint,
      content: JSON.stringify(edpPayload)
    }
  });

  const rg = hydratedInventory.reconciliation_graph;
  console.log(`✅ [Phase 4 · Raffinement, Hydratation & Réconciliation] EDP persisté : ${edpId}`);
  console.log(`   • Axes KAOS couverts         : ${coverage.metrics.coveredExecutableAxes}/${coverage.metrics.totalMandatoryAxes} (${coverage.metrics.axisCoveragePercent}%)`);
  console.log(`   • Pools Sylva hydratés       : ${hydratedInventory.nautobot_planned_devices.map((d: any) => `${d.name} [${d.cluster_pool}]`).join(' + ')}`);
  console.log(`   • Pivot de Réconciliation    : tenant_ref = "${rg.pivot_tenant_id}"`);
  console.log(`   • 7 Classes d'Objets Liées   :`);
  console.log(`     1. Organisations Tiers     : ${rg.partner_organizations.map((o: any) => o.id).join(', ')}`);
  console.log(`     2. Objets Externes 3GPP    : ${rg.external_shadow_nodes.map((n: any) => `${n.id} (${n.nrm_3gpp_class})`).join(', ')}`);
  console.log(`     3. Médiation & Cœur Lot 1  : ${rg.internal_mediation_nodes.map((n: any) => n.id).join(' → ')}`);
  console.log(`     4. Lien IP Underlay        : ${rg.ip_underlay_links.map((l: any) => `${l.id} (${l.subnet})`).join(', ')}`);
  console.log(`     5. Tunnel IPsec ESP        : ${rg.ipsec_tunnels.map((t: any) => `${t.id} (${t.cipher_suite})`).join(', ')}`);
  console.log(`     6. Flux Service S6a        : ${rg.service_mediation_flows.map((f: any) => `${f.id} [hops: ${f.mandatory_mediation_hops.join(' -> ')}]`).join(', ')}`);
  console.log(`     7. Contrats SLA & NOC      : ${rg.sla_and_monitoring_contracts.map((c: any) => `${c.id} (${c.requirement_ref})`).join(', ')}`);
  console.log(`   • Verdict Oracle OPA Rego    : ${oracleEval.verdict.toUpperCase()} (${oracleEval.violations.length} violation, ${oracleEval.evaluatedAxesCount} feuilles évaluées)`);

  const nbSync = await syncHydratedInventoryToNautobot(hydratedInventory);
  if (nbSync.reachable) {
    console.log(`✅ [Nautobot 2.x SSoT Live Sync] Synchronisation réussie sur http://localhost:8080 :`);
    console.log(`   • Tenants synchronisés       : ${nbSync.tenantsSynced} (${nbSync.urls.tenants})`);
    console.log(`   • Circuits synchronisés      : ${nbSync.circuitsSynced} (${nbSync.urls.circuits})`);
    console.log(`   • Préfixes IP & VLAN         : ${nbSync.prefixesSynced} préfixe(s), ${nbSync.vlansSynced} VLAN (${nbSync.urls.prefixes})`);
    console.log(`   • Équipements DCIM           : ${nbSync.devicesSynced} (${nbSync.urls.devices})`);
    if (nbSync.errors.length > 0) {
      console.log(`   ⚠️ Avertissements Nautobot   : ${nbSync.errors.join(' | ')}`);
    }
  } else {
    console.log(`ℹ️ [Nautobot SSoT] Conteneur Nautobot non joignable sur http://localhost:8080 (inventaire persisté localement).`);
  }
  console.log('══════════════════════════════════════════════════════════════════════════════');

  return {
    projectId: PROJECT_ID,
    subjectId: SUBJECT_ID,
    decisionRecord,
    coverage,
    hydratedInventory,
    oracleEval,
    edpId,
    nbSync
  };
}

export async function main() {
  return seedDemo(prisma);
}

const isDirectCli =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('seed-demo.ts') || process.argv[1].endsWith('seed-demo.js'));

if (isDirectCli) {
  main()
    .catch((err) => {
      console.error('❌ Erreur lors du seed:demo :', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
