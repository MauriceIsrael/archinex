import http from 'node:http';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type {
  LLMOpsHealth,
  DoctrineContext,
  DoctrineItem,
  CheckResult,
  FrameworkCoverage,
  KbCandidate,
  KbOwner,
  KbReviewInboxItem,
  KbCandidateDetail,
  KbAutomaticCheck,
  KbComment,
  KbEvent,
  KbAssetType,
  KbAssetTemplate,
  CandidateValidationResult,
  ClauseSimulationRequest,
  ClauseSimulationResult,
  LLMOpsBoardItem,
  LLMOpsStatement,
  LLMOpsConflict,
  FrameworkIngestion,
  FrameworkRequirement,
  FrameworkLinkSuggestionResult,
  CoverageDeclarationResult,
  EvalTestCase,
  EvalDataset,
  EvalBenchmarkRunResult,
  VerdictFeedbackRequest,
  VerdictFeedbackItem,
  KbHealthMetrics,
  KbPublication,
  KbCampaign,
  EmbeddingPendingItem,
  EmbeddingDeposit,
  SimilarKnowledgeRequest,
  SimilarKnowledgeResponse,
  SimilarKnowledgeItem,
  ReuseConfirmationRequest,
  ReuseConfirmation,
  SimilarityCase,
  SimilarityRun,
  SimilarityZone,
  SimilarityFamily,
  SimilarityRelation
} from '../../src/lib/types/llmops';

export interface FakeLlmopsState {
  health: LLMOpsHealth;
  doctrine: DoctrineItem[];
  frameworkCoverage: FrameworkCoverage;
  candidates: KbCandidate[];
  owners: KbOwner[];
  inbox: KbReviewInboxItem[];
  candidateDetails: Record<string, KbCandidateDetail>;
  comments: Record<string, KbComment[]>;
  events: KbEvent[];
  board: LLMOpsBoardItem[];
  statements: LLMOpsStatement[];
  conflicts: LLMOpsConflict[];
  frameworkIngestions: Record<string, FrameworkIngestion>;
  evalDatasets: Record<string, EvalDataset>;
  verdictFeedbacks: VerdictFeedbackItem[];
  publications: KbPublication[];
  campaigns: KbCampaign[];
  storageMode: 'demo' | 'persistent';
  embeddings: Record<string, {
    model_version: string;
    dim: number;
    items: Record<string, {
      ref: string;
      text_sha256: string;
      vector: number[];
      language?: string;
      title: string;
      type: string;
      text: string;
      domain: string[];
      assumptions: string[];
      status: string;
    }>;
  }>;
  pendingEmbeddings: Record<string, EmbeddingPendingItem[]>;
  reuseConfirmations: ReuseConfirmation[];
  similarityDatasets: Record<string, {
    cases: SimilarityCase[];
    runs: SimilarityRun[];
  }>;
}


export function generateDefaultChecks(title: string, content: string = ''): KbAutomaticCheck[] {
  return [
    {
      name: 'schema_validity',
      label: 'Conformité Schéma d’Actif',
      passed: true,
      score: 100,
      details: 'Structure JSON et métadonnées conformes à la constitution',
      severity: 'info'
    },
    {
      name: 'clarity_score',
      label: 'Clarté Rédactionnelle & Concision',
      passed: true,
      score: 94,
      details: 'Formulation assertive claire sans ambiguïté',
      severity: 'info'
    },
    {
      name: 'testability',
      label: 'Testabilité des Prédicats',
      passed: !title.toLowerCase().includes('vague'),
      score: title.toLowerCase().includes('vague') ? 45 : 88,
      details: title.toLowerCase().includes('vague')
        ? 'Clauses trop vagues ou non testables'
        : 'Clauses vérifiables sous forme d’assertions when/expect',
      severity: 'warning'
    },
    {
      name: 'non_duplication',
      label: 'Absence de Duplication Doctrinale',
      passed: true,
      score: 95,
      details: 'Aucun doublon sémantique détecté dans le référentiel actif',
      severity: 'info'
    },
    {
      name: 'sovereign_compliance',
      label: 'Conformité Souveraine & Air-Gap',
      passed: !content.toLowerCase().includes('exfiltrat'),
      score: content.toLowerCase().includes('exfiltrat') ? 0 : 100,
      details: content.toLowerCase().includes('exfiltrat')
        ? 'Alerte : tentative d’exfiltration réseau détectée'
        : 'Aucune dépendance cloud public non certifiée',
      severity: 'error'
    },
    {
      name: 'domain_alignment',
      label: 'Alignement du Domaine Responsable',
      passed: true,
      score: 92,
      details: 'Conforme aux périmètres de compétences de gouvernance',
      severity: 'info'
    },
    {
      name: 'architectural_impact',
      label: 'Analyse d’Impact & Criticité',
      passed: true,
      score: 85,
      details: 'Effet de bord borné au périmètre défini',
      severity: 'warning'
    }
  ];
}

export const DEFAULT_KB_TEMPLATES: Record<KbAssetType, KbAssetTemplate> = {
  principle: {
    asset_type: 'principle',
    title: 'Gabarit de Principe Fondamental',
    description: 'Principe directeur transversal à portée stratégique non négociable.',
    default_predicates: {
      when: 'Dans toute architecture de système distribué manipulant des données critiques',
      expect: 'L’immuabilité et la traçabilité des enregistrements d’audit doivent être garanties par chiffrement asymétrique',
      requires: ['Journalisation signée', 'Horodatage certifié'],
      forbids: ['Suppression directe de logs sans archivage scellé']
    },
    fields: [
      { name: 'title', label: 'Intitulé du principe', type: 'text', required: true, placeholder: 'Ex: Principe d’immuabilité...' },
      { name: 'summary', label: 'Énoncé synthétique', type: 'textarea', required: true, placeholder: 'Énoncé clair et assertif...' },
      { name: 'rationale', label: 'Motivation architecturale', type: 'textarea', required: true, placeholder: 'Justification des contraintes...' }
    ],
    skeleton: '# Principe : [Titre]\n\n## Énoncé\n[Énoncé assertif sans ambiguïté]\n\n## Justification & Valeur\n[Impact stratégique]\n\n## Prédicats Formels\n- WHEN: ...\n- EXPECT: ...'
  },
  pattern: {
    asset_type: 'pattern',
    title: 'Gabarit de Patron d’Architecture',
    description: 'Solution éprouvée à un problème récurrent dans un contexte donné.',
    default_predicates: {
      when: 'En cas de couplage asynchrone entre services à haute volumétrie',
      expect: 'Le patron Outbox avec courtier de messages persistant doit être implémenté',
      requires: ['Base de données transactionnelle relationnelle', 'Idempotence des consommateurs'],
      forbids: ['Appel synchrone bloquant HTTP dans la transaction base']
    },
    fields: [
      { name: 'title', label: 'Nom du patron', type: 'text', required: true },
      { name: 'summary', label: 'Description', type: 'textarea', required: true },
      { name: 'rationale', label: 'Contexte d’application', type: 'textarea', required: true }
    ],
    skeleton: '# Patron : [Nom]\n\n## Contexte\n...\n## Solution\n...'
  },
  decision: {
    asset_type: 'decision',
    title: 'Gabarit de Décision Architecturale (ADR)',
    description: 'Enregistrement formel d’un choix technologique ou organisationnel structurant.',
    default_predicates: {
      when: 'Lors de l’arbitrage sur le composant de stockage persistant',
      expect: 'La solution doit respecter les contraintes de réversibilité et de portabilité',
      requires: ['Étude comparative d’au moins 3 options'],
      forbids: ['Verrou propriétaire non exportable']
    },
    fields: [
      { name: 'title', label: 'Titre de la décision', type: 'text', required: true },
      { name: 'summary', label: 'Décision retenue', type: 'textarea', required: true },
      { name: 'rationale', label: 'Alternatives écartées', type: 'textarea', required: true }
    ],
    skeleton: '# ADR : [Titre]\n\n## Statut\nAccepté\n\n## Décision\n...'
  },
  control: {
    asset_type: 'control',
    title: 'Gabarit de Règle de Contrôle Sécuritaire',
    description: 'Exigence de conformité vérifiable sous forme d’assertion automatique.',
    default_predicates: {
      when: 'Pour tout flux réseau inter-zones ou franchissant une frontière de confiance',
      expect: 'Le protocole mTLS v1.3 avec chiffrement post-quantique et certificats éphémères est requis',
      requires: ['PKI interne souveraine'],
      forbids: ['Communication en clair HTTP ou TLS < 1.3']
    },
    fields: [
      { name: 'title', label: 'Nom de la règle de contrôle', type: 'text', required: true },
      { name: 'summary', label: 'Clause vérifiable', type: 'textarea', required: true },
      { name: 'rationale', label: 'Référentiel source', type: 'textarea', required: true }
    ],
    skeleton: '# Contrôle : [Nom]\n\n## Règle\n...\n'
  },
  glossary: {
    asset_type: 'glossary',
    title: 'Gabarit de Terme du Glossaire Métier',
    description: 'Définition canonique et acronymes sans ambiguïté sémantique.',
    default_predicates: {
      when: 'Dans tout livrable d’architecture ou spécification de co-conception',
      expect: 'Le terme doit être employé dans son acception formelle définie par le glossaire',
      requires: [],
      forbids: ['Utilisation de synonymes contradictoires']
    },
    fields: [
      { name: 'title', label: 'Terme ou acronyme', type: 'text', required: true },
      { name: 'summary', label: 'Définition canonique', type: 'textarea', required: true },
      { name: 'rationale', label: 'Domaines concernés', type: 'text', required: true }
    ],
    skeleton: '# Terme : [Intitulé]\n\n## Définition\n...\n'
  },
  rule: {
    asset_type: 'rule',
    title: 'Gabarit de Règle Doctrinale Standard',
    description: 'Clause normative de conception.',
    default_predicates: {
      when: 'Dans tout composant cloud ou conteneurisé',
      expect: 'La redondance N+1 multi-nœuds doit être respectée',
      requires: ['Healthcheck actif'],
      forbids: ['Single Point of Failure (SPOF)']
    },
    fields: [
      { name: 'title', label: 'Titre de la règle', type: 'text', required: true },
      { name: 'summary', label: 'Énoncé', type: 'textarea', required: true },
      { name: 'rationale', label: 'Justification', type: 'textarea', required: true }
    ],
    skeleton: '# Règle : [Titre]\n\n...'
  },
  amendment: {
    asset_type: 'amendment',
    title: 'Gabarit d’Amendement de Doctrine',
    description: 'Proposition d’évolution ou de précision sur une clause existante.',
    default_predicates: {
      when: 'Lorsqu’une règle existante nécessite une adaptation opérationnelle',
      expect: 'La clause amendée doit maintenir l’alignement avec les référentiels souverains',
      requires: ['Référence de la règle cible'],
      forbids: ['Régression de sécurité']
    },
    fields: [
      { name: 'title', label: 'Titre de l’amendement', type: 'text', required: true },
      { name: 'summary', label: 'Texte amendé', type: 'textarea', required: true },
      { name: 'rationale', label: 'Motivation de la modification', type: 'textarea', required: true }
    ],
    skeleton: '# Amendement : [Titre]\n\n...'
  }
};

export function createDefaultFakeState(): FakeLlmopsState {
  const now = new Date();
  const fiveDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const cand1Detail: KbCandidateDetail = {
    id: 'cand-sec-001',
    kind: 'new_asset',
    title: 'Chiffrement Homomorphe Inter-Services',
    summary: 'Obligation de chiffrement des flux inter-services par clés souveraines tournantes.',
    rationale: 'Exigence de protection contre les écoutes latérales',
    domain: 'security',
    source: { system: 'archinex', engagement: 'test-engagement' },
    author: 'architect@archinex.local',
    production_mode: 'human-authored',
    status: 'in_review',
    checks: generateDefaultChecks('Chiffrement Homomorphe Inter-Services'),
    all_checks_passed: true,
    assigned_to: '@sec-lead',
    assigned_reviewers: ['@sec-lead'],
    history: [
      {
        timestamp: new Date(now.getTime() - 3600000).toISOString(),
        actor: 'architect@archinex.local',
        action: 'submitted',
        details: 'Candidat généré suite à arbitrage G4'
      }
    ]
  };

  const cand2Detail: KbCandidateDetail = {
    id: 'cand-principle-002',
    kind: 'principle',
    title: 'Principe Fondamental d’Immuabilité des Traces Audit',
    summary: 'Toute trace d’audit doit être écrite en append-only non modifiable par l’administrateur système.',
    rationale: 'Principe régalien de non-répudiation',
    domain: 'security',
    source: { system: 'archinex', engagement: 'test-engagement' },
    author: 'sec-officer@archinex.local',
    production_mode: 'human-authored',
    status: 'in_review',
    checks: generateDefaultChecks('Principe Fondamental d’Immuabilité des Traces Audit'),
    all_checks_passed: true,
    assigned_to: '@sec-lead',
    assigned_reviewers: ['@sec-lead'],
    history: [
      {
        timestamp: new Date(now.getTime() - 7200000).toISOString(),
        actor: 'sec-officer@archinex.local',
        action: 'submitted',
        details: 'Nouveau principe fondamental'
      }
    ]
  };

  const cand3Detail: KbCandidateDetail = {
    id: 'cand-overdue-003',
    kind: 'amendment',
    title: 'Dérogation Temporaire Synchronisation NTP Hors-Ligne',
    summary: 'Tolérance d’un drift temporel maximal de 500ms sur les nœuds déconnectés.',
    rationale: 'Contrainte matérielle de déploiement terrain',
    domain: 'cloud',
    source: { system: 'archinex', engagement: 'test-engagement' },
    author: 'ops@archinex.local',
    production_mode: 'human-authored',
    status: 'in_review',
    checks: generateDefaultChecks('Dérogation Temporaire Synchronisation NTP Hors-Ligne'),
    all_checks_passed: true,
    assigned_to: '@sec-lead',
    assigned_reviewers: ['@sec-lead'],
    history: [
      {
        timestamp: fiveDaysAgo.toISOString(),
        actor: 'ops@archinex.local',
        action: 'submitted',
        details: 'Demande de dérogation'
      }
    ]
  };

  return {
    health: {
      status: 'ok',
      plane: 'control',
      schema_version: '1.0.0',
      service: 'fake-llmops',
      engine_version: '1.0.0-test',
      engine_commit: 'test-sha',
      kb: {
        snapshot_id: 'test-snapshot-1',
        source_revision: 'v1',
        payload_sha256: 'abc123test',
        created_at: new Date().toISOString()
      }
    },
    doctrine: [
      {
        id: 'DOC-TEST-001',
        type: 'rule',
        title: 'Test Redundancy Rule',
        content: 'High-availability services must feature N+1 redundancy across independent nodes.',
        framework: 'HA-STD',
        domain: 'architecture'
      }
    ],
    frameworkCoverage: {
      frameworks: [
        { name: 'High Availability Standard', required: true, covered_count: 5, total_count: 5, status: 'covered' }
      ],
      overall_coverage: 'covered',
      checked_at: new Date().toISOString()
    },
    candidates: [cand1Detail, cand2Detail, cand3Detail],
    owners: [
      {
        handle: '@sec-lead',
        name: 'Security Lead',
        email: 'expert@archinex.local',
        roles: ['kb:review', 'kb:maintain', 'kb:evaluate'],
        domains: ['security', 'cloud'],
        delegated: true
      },
      {
        handle: '@peer-reviewer',
        name: 'Peer Security Reviewer',
        email: 'peer@archinex.local',
        roles: ['kb:review'],
        domains: ['security'],
        delegated: true
      }
    ],
    inbox: [
      {
        id: 'rev-001',
        candidate_id: 'cand-sec-001',
        title: 'Chiffrement Homomorphe Inter-Services',
        kind: 'new_asset',
        domain: 'security',
        reason: 'review',
        waiting_since: new Date(now.getTime() - 3600000).toISOString(),
        due_at: threeDaysLater.toISOString(),
        is_overdue: false,
        author: 'architect@archinex.local',
        severity: 'major'
      },
      {
        id: 'rev-002',
        candidate_id: 'cand-principle-002',
        title: 'Principe Fondamental d’Immuabilité des Traces Audit',
        kind: 'principle',
        domain: 'security',
        reason: 'review',
        waiting_since: new Date(now.getTime() - 7200000).toISOString(),
        due_at: threeDaysLater.toISOString(),
        is_overdue: false,
        author: 'sec-officer@archinex.local',
        severity: 'critical'
      },
      {
        id: 'rev-003',
        candidate_id: 'cand-overdue-003',
        title: 'Dérogation Temporaire Synchronisation NTP Hors-Ligne',
        kind: 'amendment',
        domain: 'cloud',
        reason: 'advice',
        waiting_since: fiveDaysAgo.toISOString(),
        due_at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        is_overdue: true,
        author: 'ops@archinex.local',
        severity: 'minor'
      }
    ],
    candidateDetails: {
      'cand-sec-001': cand1Detail,
      'cand-principle-002': cand2Detail,
      'cand-overdue-003': cand3Detail
    },
    comments: {
      'cand-sec-001': [
        {
          id: 'comm-1',
          candidate_id: 'cand-sec-001',
          author_handle: '@sec-lead',
          author_name: 'Security Lead',
          message: 'Les algorithmes homomorphes autorisés sont-ils limités à la liste ANSSI ?',
          created_at: new Date(now.getTime() - 1800000).toISOString()
        }
      ]
    },
    events: [
      {
        id: 'evt-001',
        type: 'candidate.submitted',
        cursor: 'cur-001',
        candidate_id: 'cand-sec-001',
        recipients: ['@sec-lead'],
        payload: {
          title: 'Chiffrement Homomorphe Inter-Services',
          domain: 'security',
          actor: 'architect@archinex.local'
        },
        timestamp: new Date(now.getTime() - 3600000).toISOString()
      },
      {
        id: 'evt-002',
        type: 'candidate.submitted',
        cursor: 'cur-002',
        candidate_id: 'cand-principle-002',
        recipients: ['@sec-lead'],
        payload: {
          title: 'Principe Fondamental d’Immuabilité des Traces Audit',
          domain: 'security',
          actor: 'sec-officer@archinex.local'
        },
        timestamp: new Date(now.getTime() - 7200000).toISOString()
      }
    ],
    board: [],
    statements: [],
    conflicts: [],
    frameworkIngestions: {
      'ing-nis2-01': {
        id: 'ing-nis2-01',
        framework_id: 'NIS2',
        framework_name: 'Directive NIS2 (UE 2022/2555)',
        version: '2022/2555',
        file_name: 'directive-nis2.pdf',
        file_format: 'pdf',
        file_size_bytes: 1048576,
        created_at: new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString(),
        status: 'ready',
        total_requirements: 3,
        reviewed_requirements: 1,
        requirements: [
          {
            id: 'req-nis2-01',
            framework_id: 'NIS2',
            section: 'Article 21.1',
            title: 'Mesures de gestion des risques de cybersécurité',
            text: 'Les entités essentielles et importantes prennent des mesures techniques, opérationnelles et organisationnelles appropriées et proportionnées pour gérer les risques pesant sur la sécurité des réseaux et des systèmes d’information.',
            domain: 'security',
            status: 'accepted',
            mapped_assets: ['CTRL-SEC-01', 'PRIN-RES-01'],
            reviewed_by: 'expert@archinex.local',
            reviewed_at: new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
          },
          {
            id: 'req-nis2-02',
            framework_id: 'NIS2',
            section: 'Article 23.1',
            title: 'Notification des incidents majeurs dans les 24h',
            text: 'Tout incident ayant un impact significatif sur la fourniture de leurs services doit faire l’objet d’une alerte précoce sans retard injustifié et en tout état de cause dans les 24 heures suivant la prise de connaissance.',
            domain: 'security',
            status: 'pending',
            mapped_assets: []
          },
          {
            id: 'req-nis2-03',
            framework_id: 'NIS2',
            section: 'Article 21.2.d',
            title: 'Sécurité de la chaîne d’approvisionnement',
            text: 'La sécurité de la chaîne d’approvisionnement et les relations avec les fournisseurs directs font l’objet de politiques de gestion des risques formelles.',
            domain: 'architecture',
            status: 'pending',
            mapped_assets: []
          }
        ]
      }
    },
    evalDatasets: {
      check_option_v1: {
        id: 'check_option_v1',
        name: 'Banc d’Évaluation des Vérifications d’Options (check_option)',
        version: '1.0',
        description: 'Jeu de test de référence pour la mesure du rappel de conformité doctrinale.',
        total_cases: 5,
        human_annotated_count: 4,
        cases: [
          {
            id: 'case-01',
            dataset_id: 'check_option_v1',
            option_title: 'Cluster Kubernetes multi-AZ avec etcd chiffré',
            option_summary: 'Déploiement managé multi-zones avec chiffrement KMS souverain des secrets et du plan de contrôle.',
            domain: 'security',
            rule_id: 'CTRL-SEC-01',
            expected_status: 'supports',
            human_annotated: true,
            annotated_by: 'expert@archinex.local',
            annotated_at: new Date(now.getTime() - 48 * 3600 * 1000).toISOString(),
            notes: 'Validation formelle des mesures de résilience multi-zones'
          },
          {
            id: 'case-02',
            dataset_id: 'check_option_v1',
            option_title: 'Instance VM monolithique sans réplication hors-site',
            option_summary: 'Serveur unique exposé sans sauvegarde immuable ni répartition de charge.',
            domain: 'security',
            rule_id: 'CTRL-SEC-01',
            expected_status: 'violates',
            human_annotated: true,
            annotated_by: 'expert@archinex.local',
            annotated_at: new Date(now.getTime() - 36 * 3600 * 1000).toISOString(),
            notes: 'Présence d’un SPOF critique non toléré'
          },
          {
            id: 'case-03',
            dataset_id: 'check_option_v1',
            option_title: 'Synchronisation temporelle via serveur NTP public non certifié',
            option_summary: 'Flux NTP ouvert vers pool.ntp.org sans signature cryptographique ni relais souverain.',
            domain: 'cloud',
            rule_id: 'CTRL-NET-02',
            expected_status: 'violates',
            human_annotated: true,
            annotated_by: 'expert@archinex.local',
            annotated_at: new Date(now.getTime() - 24 * 3600 * 1000).toISOString(),
            notes: 'Non-conformité aux exigences de traçabilité horodatée'
          },
          {
            id: 'case-04',
            dataset_id: 'check_option_v1',
            option_title: 'Base de données distribuée avec réplication synchrone et bascule automatique',
            option_summary: 'Cluster PostgreSQL actif/passif avec réplication synchrone et bascule automatique en moins de 10s.',
            domain: 'architecture',
            rule_id: 'PAT-HA-01',
            expected_status: 'supports',
            human_annotated: true,
            annotated_by: 'expert@archinex.local',
            annotated_at: new Date(now.getTime() - 12 * 3600 * 1000).toISOString(),
            notes: 'RPO=0 et RTO minimal validés'
          },
          {
            id: 'case-05',
            dataset_id: 'check_option_v1',
            option_title: 'API gateway sans rate-limiting ni coupe-circuit',
            option_summary: 'Passerelle d’entrée traitant les flux partenaires sans limitation volumétrique.',
            domain: 'architecture',
            rule_id: 'PAT-HA-01',
            expected_status: 'violates',
            human_annotated: false,
            notes: 'En attente d’annotation humaine experte'
          }
        ]
      }
    },
    verdictFeedbacks: [],
    publications: [
      {
        id: 'pub-001',
        snapshot_id: 'snapshot-2026-09-13-06f3455',
        version: 'v1.0.0',
        published_at: new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString(),
        published_by: 'expert@archinex.local',
        sha256_checksum: '8f4c2e6b9a1d3f5e7c8b0a2d4e6f8a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d9e1f',
        changelog: "Publication initiale du référentiel d'architecture souveraine et résiliente.",
        assets_count: 60,
        storage_persistent: true
      }
    ],
    campaigns: [
      {
        id: 'camp-001',
        title: 'Durcissement Résilience & Haute Disponibilité',
        domain: 'architecture',
        target_asset_type: 'pattern',
        target_count: 5,
        created_at: new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString(),
        created_by: 'expert@archinex.local',
        due_at: new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString(),
        status: 'active',
        description: "Enrichissement des patrons d'isolation des pannes et de résilience multi-régions.",
        progress: { current: 3, target: 5 }
      }
    ],
    storageMode: 'persistent',
    embeddings: {},
    pendingEmbeddings: {
      'toy-bow': createSeedPendingEmbeddings()
    },
    reuseConfirmations: [],
    similarityDatasets: {
      similarity_v1: {
        cases: createSeedSimilarityCases(),
        runs: []
      }
    }
  };
}

export const SEED_KB_ASSETS: Array<{
  ref: string;
  type: 'principle' | 'pattern' | 'decision' | 'control';
  title: string;
  text: string;
  domain: string[];
  assumptions: string[];
  status: string;
}> = [
  {
    ref: 'P-001',
    type: 'principle',
    title: 'Infrastructure as Code obligatoire',
    text: 'P-001 Infrastructure as Code obligatoire. La configuration du réseau doit être versionnée dans Git et déployée uniquement par pipeline.',
    domain: ['infra', 'gitops'],
    assumptions: [],
    status: 'active'
  },
  {
    ref: 'P-002',
    type: 'principle',
    title: 'Approbation humaine préalable aux remédiations',
    text: 'P-002 Approbation humaine préalable aux remédiations. Les remédiations automatiques du réseau doivent être approuvées par un humain avant leur exécution. Closed loop remediation with human approval before execution.',
    domain: ['network-automation'],
    assumptions: ['Un exploitant qualifié est joignable 24/7 pour valider les actions de remédiation.'],
    status: 'active'
  },
  {
    ref: 'ADR-0001',
    type: 'decision',
    title: 'GitOps comme unique source de vérité pour les configurations réseau',
    text: 'ADR-0001 GitOps comme unique source de vérité pour les configurations réseau. Restoration of network configuration after an outage. La configuration du réseau doit être versionnée dans Git et déployée uniquement par pipeline.',
    domain: ['network-automation', 'gitops'],
    assumptions: [
      'The control plane handles fewer than 10000 managed devices.',
      'Every site keeps an out-of-band access path to its routers.'
    ],
    status: 'active'
  },
  {
    ref: 'PAT-001',
    type: 'pattern',
    title: 'Pattern Circuit Breaker & Fallback',
    text: 'PAT-001 Pattern Circuit Breaker & Fallback. Autonomous remediation of the radio access network with no operator on duty overnight, validated by a human only the next morning.',
    domain: ['resilience'],
    assumptions: [],
    status: 'active'
  },
  {
    ref: 'PAT-004',
    type: 'pattern',
    title: 'Accès Out-of-Band Indépendant',
    text: 'PAT-004 Accès Out-of-Band Indépendant. Un accès de secours indépendant doit permettre de restaurer le service même si la plateforme principale est en panne.',
    domain: ['network-automation'],
    assumptions: [],
    status: 'active'
  },
  {
    ref: 'P-012',
    type: 'principle',
    title: 'Assistance IA sous supervision humaine',
    text: "P-012 Assistance IA sous supervision humaine. L'assistant d'aide à la décision ne doit jamais agir seul : il propose, l'exploitant décide.",
    domain: ['ai'],
    assumptions: [],
    status: 'active'
  },
  {
    ref: 'P-015',
    type: 'principle',
    title: 'Périmètre de confiance IA souverain',
    text: "P-015 Périmètre de confiance IA souverain. Le modèle d'intelligence artificielle doit rester à l'intérieur du périmètre de confiance, sans appel à un service externe.",
    domain: ['sovereignty'],
    assumptions: [],
    status: 'active'
  },
  {
    ref: 'P-010',
    type: 'principle',
    title: "Système d'autorité unique par domaine",
    text: 'P-010 Système d’autorité unique par domaine. Each data domain must have a single system of record that is the master for its data.',
    domain: ['data'],
    assumptions: [],
    status: 'active'
  },
  {
    ref: 'P-009',
    type: 'principle',
    title: 'Résilience des accès réseau critiques',
    text: 'P-009 Résilience des accès réseau critiques. Un accès de secours indépendant doit permettre de restaurer le service même si la plateforme principale est en panne.',
    domain: ['resilience'],
    assumptions: [],
    status: 'active'
  },
  {
    ref: 'P-005',
    type: 'principle',
    title: "Shadow Mode préalable aux règles d'alerte",
    text: 'P-005 Shadow Mode préalable aux règles d’alerte. New alerting rules must run in shadow mode on real traffic before they are armed.',
    domain: ['observability'],
    assumptions: [],
    status: 'active'
  },
  {
    ref: 'PAT-002',
    type: 'pattern',
    title: 'Shadow Pipeline Pattern',
    text: 'PAT-002 Shadow Pipeline Pattern. New alerting rules must run in shadow mode on real traffic before they are armed.',
    domain: ['observability'],
    assumptions: [],
    status: 'active'
  },
  {
    ref: 'P-011',
    type: 'principle',
    title: 'Observabilité séparée service / infra',
    text: 'P-011 Observabilité séparée service / infra. Observabilité séparée entre plan service et plan infrastructure pour un petit déploiement mono-site.',
    domain: ['observability'],
    assumptions: [],
    status: 'active'
  },
  {
    ref: 'ADR-0008',
    type: 'decision',
    title: "Séparation des plans d'observabilité",
    text: 'ADR-0008 Séparation des plans d’observabilité. Observabilité séparée entre plan service et plan infrastructure pour un petit déploiement mono-site.',
    domain: ['observability'],
    assumptions: [],
    status: 'active'
  },
  {
    ref: 'ADR-0009',
    type: 'decision',
    title: 'Référentiel maître unique de données',
    text: 'ADR-0009 Référentiel maître unique de données. Each data domain must have a single system of record that is the master for its data.',
    domain: ['data'],
    assumptions: [],
    status: 'active'
  },
  {
    ref: 'ADR-0011',
    type: 'decision',
    title: 'Déploiement LLM On-Premise Air-Gap',
    text: "ADR-0011 Déploiement LLM On-Premise Air-Gap. Le modèle d'intelligence artificielle doit rester à l'intérieur du périmètre de confiance, sans appel à un service externe.",
    domain: ['sovereignty'],
    assumptions: [],
    status: 'active'
  },
  {
    ref: 'PAT-007',
    type: 'pattern',
    title: 'Pattern Copilote Architecte',
    text: "PAT-007 Pattern Copilote Architecte. L'assistant d'aide à la décision ne doit jamais agir seul : il propose, l'exploitant décide.",
    domain: ['ai'],
    assumptions: [],
    status: 'active'
  }
];

function createSeedPendingEmbeddings(): EmbeddingPendingItem[] {
  return SEED_KB_ASSETS.map((a) => ({
    ref: a.ref,
    type: a.type,
    title: a.title,
    text: a.text,
    text_sha256: crypto.createHash('sha256').update(Buffer.from(a.text, 'utf-8')).digest('hex'),
    reason: 'missing'
  }));
}

function createSeedSimilarityCases(): SimilarityCase[] {
  return [
    { id: 'SIM-001', family: 'cross_lingual', language: 'fr', query_text: 'Les remédiations automatiques du réseau doivent être approuvées par un humain avant leur exécution.', expected: [{ ref: 'P-002', relation: 'same_subject' }, { ref: 'PAT-001', relation: 'related_not_same' }], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null },
    { id: 'SIM-002', family: 'cross_lingual', language: 'fr', query_text: 'La configuration du réseau doit être versionnée dans Git et déployée uniquement par pipeline.', expected: [{ ref: 'P-001', relation: 'same_subject' }, { ref: 'ADR-0001', relation: 'same_subject' }], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null },
    { id: 'SIM-003', family: 'cross_lingual', language: 'fr', query_text: "L'assistant d'aide à la décision ne doit jamais agir seul : il propose, l'exploitant décide.", expected: [{ ref: 'P-012', relation: 'same_subject' }, { ref: 'PAT-007', relation: 'related_not_same' }], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null },
    { id: 'SIM-004', family: 'cross_lingual', language: 'fr', query_text: "Le modèle d'intelligence artificielle doit rester à l'intérieur du périmètre de confiance, sans appel à un service externe.", expected: [{ ref: 'P-015', relation: 'same_subject' }, { ref: 'ADR-0011', relation: 'related_not_same' }], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null },
    { id: 'SIM-005', family: 'cross_lingual', language: 'en', query_text: 'Each data domain must have a single system of record that is the master for its data.', expected: [{ ref: 'P-010', relation: 'same_subject' }, { ref: 'ADR-0009', relation: 'related_not_same' }], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null },
    { id: 'SIM-006', family: 'cross_lingual', language: 'fr', query_text: 'Un accès de secours indépendant doit permettre de restaurer le service même si la plateforme principale est en panne.', expected: [{ ref: 'PAT-004', relation: 'same_subject' }, { ref: 'P-009', relation: 'same_subject' }], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null },
    { id: 'SIM-007', family: 'cross_lingual', language: 'en', query_text: 'New alerting rules must run in shadow mode on real traffic before they are armed.', expected: [{ ref: 'P-005', relation: 'same_subject' }, { ref: 'PAT-002', relation: 'same_subject' }], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null },
    { id: 'SIM-101', family: 'same_words_different_subject', language: 'en', query_text: 'A human in the loop signs off the user acceptance testing schedule of the building works.', expected: [{ ref: 'P-002', relation: 'unrelated' }], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null },
    { id: 'SIM-102', family: 'same_words_different_subject', language: 'en', query_text: 'Git branch naming conventions and commit message style for the marketing website.', expected: [{ ref: 'P-001', relation: 'unrelated' }, { ref: 'ADR-0001', relation: 'unrelated' }], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null },
    { id: 'SIM-103', family: 'same_words_different_subject', language: 'fr', query_text: 'Le modèle de données du catalogue produits doit rester dans le périmètre du projet commercial.', expected: [{ ref: 'P-015', relation: 'unrelated' }], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null },
    { id: 'SIM-201', family: 'same_topic_different_assumptions', language: 'en', query_text: 'Autonomous remediation of the radio access network with no operator on duty overnight, validated by a human only the next morning.', expected: [{ ref: 'P-002', relation: 'same_topic_different_assumptions' }, { ref: 'PAT-001', relation: 'same_topic_different_assumptions' }], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null },
    { id: 'SIM-202', family: 'same_topic_different_assumptions', language: 'en', query_text: 'Break-glass access path for a single-site laboratory where operators are on site around the clock.', expected: [{ ref: 'PAT-004', relation: 'same_topic_different_assumptions' }], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null },
    { id: 'SIM-203', family: 'same_topic_different_assumptions', language: 'fr', query_text: 'Observabilité séparée entre plan service et plan infrastructure pour un petit déploiement mono-site.', expected: [{ ref: 'ADR-0008', relation: 'same_topic_different_assumptions' }, { ref: 'P-011', relation: 'same_topic_different_assumptions' }], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null },
    { id: 'SIM-301', family: 'out_of_base', language: 'en', query_text: 'The supplier shall deliver a printed user manual in three languages with each shipment.', expected: [], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null },
    { id: 'SIM-302', family: 'out_of_base', language: 'fr', query_text: 'Le titulaire dispense une formation de deux jours aux exploitants avant la recette.', expected: [], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null },
    { id: 'SIM-303', family: 'out_of_base', language: 'en', query_text: 'Physical security of the data centre perimeter, badge access and visitor logging.', expected: [], annotation_status: 'proposed', annotated_by: 'coding-agent', annotated_at: null }
  ];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export interface FakeLlmopsServer {
  server: http.Server;
  url: string;
  state: FakeLlmopsState;
  close: () => Promise<void>;
  reset: () => void;
}

export async function startFakeLlmopsServer(initialState?: Partial<FakeLlmopsState>): Promise<FakeLlmopsServer> {
  const state: FakeLlmopsState = {
    ...createDefaultFakeState(),
    ...initialState
  };

  let eventSeq = 10;
  const generateCursor = () => `cur-${String(++eventSeq).padStart(4, '0')}`;

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase();

    // Helper for JSON responses
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    // Parse body for POST / PUT / PATCH
    let body: any = null;
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString();
      const contentType = (req.headers['content-type'] as string) || '';
      if (contentType.includes('multipart/form-data')) {
        body = {};
        const boundaryMatch = contentType.match(/boundary=([^\s;]+)/i);
        const boundary = boundaryMatch ? boundaryMatch[1].replace(/^["']|["']$/g, '') : null;
        const separator = boundary ? `--${boundary}` : '--';
        const parts = raw.split(separator);
        for (const part of parts) {
          if (!part || part.trim() === '--' || part.trim() === '') continue;
          const headerBodySplit = part.split(/\r?\n\r?\n/);
          if (headerBodySplit.length < 2) continue;
          const header = headerBodySplit[0];
          const content = headerBodySplit.slice(1).join('\n\n').replace(/\r?\n(--)?$/, '');
          const nameMatch = header.match(/name="([^"]+)"/);
          const filenameMatch = header.match(/filename="([^"]+)"/);
          if (nameMatch) {
            const fieldName = nameMatch[1];
            if (filenameMatch) {
              body.file_name = filenameMatch[1];
              body.raw_text = content;
            } else if (fieldName === 'requirements') {
              try {
                body.requirements = JSON.parse(content);
              } catch {
                body.requirements = [];
              }
            } else {
              body[fieldName] = content.trim();
            }
          }
        }
        if (body.framework && !body.framework_id) body.framework_id = body.framework;
        if (body.framework_id && !body.framework) body.framework = body.framework_id;
      } else {
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          body = {};
        }
      }
    }

    // Health
    if (pathname === '/health' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.health
      });
    }

    // Doctrine context: GET /doctrine/context
    if (pathname === '/doctrine/context' && method === 'GET') {
      const topics = parsedUrl.searchParams.get('topics')?.split(',') || [];
      let filtered = state.doctrine;
      if (topics.length > 0 && topics[0] !== '') {
        filtered = state.doctrine.filter((d) =>
          topics.some((t) => d.title.toLowerCase().includes(t.toLowerCase()) || d.content.toLowerCase().includes(t.toLowerCase()))
        );
      }
      const ctx: DoctrineContext = {
        items: filtered,
        total_items: filtered.length,
        truncated: false
      };
      return json(200, {
        status: 'ok',
        data: ctx
      });
    }

    // Check option: POST /doctrine/check
    if (pathname === '/doctrine/check' && method === 'POST') {
      const { option_id, option_label, criteria } = body || {};
      const isConform = !option_label?.toLowerCase().includes('fail');
      const checkResult: CheckResult = {
        verdicts: [
          {
            rule_id: 'DOC-TEST-001',
            status: isConform ? 'supports' : 'violates',
            rationale: isConform ? 'Option meets redundancy criteria' : 'Single point of failure detected',
            severity: isConform ? undefined : 'error'
          }
        ]
      };
      return json(200, {
        status: 'ok',
        data: checkResult
      });
    }

    // Frameworks: GET /doctrine/frameworks
    if (pathname === '/doctrine/frameworks' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.frameworkCoverage
      });
    }

    // Frameworks: POST /doctrine/frameworks
    if (pathname === '/doctrine/frameworks' && method === 'POST') {
      const { frameworks } = body || {};
      if (Array.isArray(frameworks)) {
        for (const fw of state.frameworkCoverage.frameworks) {
          fw.required = frameworks.includes(fw.name);
        }
      }
      return json(200, {
        status: 'ok',
        data: {
          success: true,
          applicable: frameworks || []
        }
      });
    }

    // Candidates: POST /kb/candidates ou /api/knowledge/candidates
    if ((pathname === '/kb/candidates' || pathname === '/api/knowledge/candidates') && method === 'POST') {
      const candidate: KbCandidate = {
        id: `cand-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        kind: body?.kind || 'new_asset',
        title: body?.title || 'Proposed Asset',
        summary: body?.summary || body?.rule || '',
        suggested_change: body?.suggested_change,
        rationale: body?.rationale || 'Co-design suggestion',
        source: {
          system: 'archinex',
          engagement: body?.sourceEngagementId || body?.source?.engagement || 'test-engagement'
        },
        status: 'in_review',
        author: body?.author || 'Test Author',
        production_mode: 'llm-proposed-human-approved',
        created_at: new Date().toISOString()
      };
      state.candidates.push(candidate);

      const candidateDetail: KbCandidateDetail = {
        ...candidate,
        domain: body?.domain || 'security',
        checks: generateDefaultChecks(candidate.title, candidate.summary),
        all_checks_passed: true,
        history: [
          {
            timestamp: candidate.created_at || new Date().toISOString(),
            actor: candidate.author,
            action: 'submitted',
            details: 'Soumis pour examen'
          }
        ]
      };
      state.candidateDetails[candidate.id!] = candidateDetail;

      state.inbox.push({
        id: `rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        candidate_id: candidate.id!,
        title: candidate.title,
        kind: candidate.kind as any,
        domain: candidateDetail.domain,
        reason: 'review',
        waiting_since: new Date().toISOString(),
        due_at: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
        is_overdue: false,
        author: candidate.author,
        severity: candidate.kind === 'principle' ? 'critical' : 'major'
      });

      return json(201, {
        status: 'ok',
        data: candidate
      });
    }

    // Templates: GET /api/knowledge/templates/:type ou /kb/templates/:type
    const tmplMatch = pathname.match(/^\/(api\/knowledge|kb)\/templates\/([a-zA-Z0-9_-]+)$/);
    if (tmplMatch && method === 'GET') {
      const assetType = tmplMatch[2] as KbAssetType;
      const tmpl = DEFAULT_KB_TEMPLATES[assetType];
      if (!tmpl) {
        return json(404, {
          status: 'error',
          error: `Gabarit introuvable pour le type d'actif '${assetType}'`
        });
      }
      return json(200, {
        status: 'ok',
        data: tmpl
      });
    }

    // Validate: POST /api/knowledge/candidates/validate ou /kb/candidates/validate
    if (
      (pathname === '/api/knowledge/candidates/validate' ||
        pathname === '/kb/candidates/validate') &&
      method === 'POST'
    ) {
      const { title, summary, domain, predicates } = body || {};
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!title || typeof title !== 'string' || title.trim() === '') {
        errors.push('Le titre de l’actif est obligatoire');
      }
      if (!summary || typeof summary !== 'string' || summary.trim() === '') {
        errors.push('L’énoncé ou résumé de la clause est obligatoire');
      }
      if (!domain || typeof domain !== 'string' || domain.trim() === '') {
        errors.push('Le domaine de responsabilité (security, cloud...) est obligatoire');
      }

      if (predicates) {
        if (!predicates.when || predicates.when.trim() === '') {
          warnings.push(
            'La condition d’activation (WHEN) est recommandée pour la testabilité automatique'
          );
        }
        if (!predicates.expect || predicates.expect.trim() === '') {
          warnings.push(
            'L’assertion de résultat (EXPECT) est recommandée pour les prédicats testables'
          );
        }
      }

      const checks = generateDefaultChecks(title || 'Brouillon', summary || '');
      const allPassed = errors.length === 0 && checks.every((c) => c.passed);

      const valResult: CandidateValidationResult = {
        valid: errors.length === 0,
        errors,
        warnings,
        checks,
        all_checks_passed: allPassed
      };

      return json(200, {
        status: 'ok',
        data: valResult
      });
    }

    // Simulate: POST /api/knowledge/checks/simulate ou /kb/checks/simulate
    if (
      (pathname === '/api/knowledge/checks/simulate' ||
        pathname === '/kb/checks/simulate') &&
      method === 'POST'
    ) {
      const { asset_type, title, domain, predicates, test_cases } = body || {};
      const whenStr = (predicates?.when || '').toLowerCase();
      const expectStr = (predicates?.expect || '').toLowerCase();

      const benchmarkCases =
        test_cases && test_cases.length > 0
          ? test_cases
          : [
              {
                id: 'case-01',
                label: 'Architecture multi-nœuds avec réplication synchrone',
                description: 'Option conforme aux règles de redondance et de tolérance aux pannes',
                expected_status: 'supports' as const
              },
              {
                id: 'case-02',
                label: 'Nœud unique sans réplication ni sauvegarde hors-site',
                description: 'Architecture à point unique de défaillance non toléré (SPOF)',
                expected_status: 'violates' as const
              },
              {
                id: 'case-03',
                label: 'Déploiement conteneurisé avec sondes de vivacité et reprise automatique',
                description: 'Haute disponibilité applicative et observabilité continue',
                expected_status: 'supports' as const
              },
              {
                id: 'case-04',
                label: 'Composant legacy sans sonde d’état avec synchronisation manuelle',
                description: 'Non-conformité aux exigences d’observabilité',
                expected_status: 'violates' as const
              }
            ];

      const regressionDetected =
        title?.toLowerCase().includes('regression') ||
        whenStr.includes('regression') ||
        expectStr.includes('regression');

      const verdicts = benchmarkCases.map((tc: any) => {
        let status: 'supports' | 'violates' | 'unassessed' = tc.expected_status;

        // Si regression simulée, inverse un cas de test
        if (regressionDetected && tc.id === 'case-03') {
          status = 'violates';
        }

        const matched = status === tc.expected_status;
        return {
          case_id: tc.id,
          case_label: tc.label,
          status,
          expected: tc.expected_status,
          matched,
          rationale: matched
            ? `Prédicats cohérents avec les critères attendus (${status})`
            : `Divergence détectée : attendu ${tc.expected_status}, obtenu ${status}`
        };
      });

      const passedCases = verdicts.filter((v: any) => v.matched).length;
      const precision = regressionDetected ? 82 : 96;
      const recall = regressionDetected ? 75 : 98;

      const simResult: ClauseSimulationResult = {
        simulated_at: new Date().toISOString(),
        total_cases: verdicts.length,
        passed_cases: passedCases,
        precision,
        recall,
        regression_detected: regressionDetected,
        regression_details: regressionDetected
          ? 'Alerte : régression de rappel détectée (-23%) par rapport à la suite de référence.'
          : undefined,
        verdicts
      };

      return json(200, {
        status: 'ok',
        data: simResult
      });
    }

    // Candidates: GET /kb/candidates ou /api/knowledge/candidates
    if ((pathname === '/kb/candidates' || pathname === '/api/knowledge/candidates') && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.candidates
      });
    }

    // Inbox: GET /api/knowledge/reviews/inbox ou /kb/reviews/inbox
    if ((pathname === '/api/knowledge/reviews/inbox' || pathname === '/kb/reviews/inbox') && method === 'GET') {
      const domainFilter = parsedUrl.searchParams.get('domain');
      const kindFilter = parsedUrl.searchParams.get('kind');

      let items = state.inbox;
      if (domainFilter) {
        items = items.filter((i) => i.domain.toLowerCase() === domainFilter.toLowerCase());
      }
      if (kindFilter) {
        items = items.filter((i) => i.kind.toLowerCase() === kindFilter.toLowerCase());
      }

      const now = Date.now();
      const enriched = items.map((i) => ({
        ...i,
        is_overdue: new Date(i.due_at).getTime() < now
      }));

      return json(200, {
        status: 'ok',
        data: enriched
      });
    }

    // Candidates sub-paths: /api/knowledge/candidates/:id[/sub]
    const candSubMatch = pathname.match(
      /^\/(api\/knowledge|kb)\/candidates\/([a-zA-Z0-9_-]+)(\/(assign|request-review|comments|promote))?$/
    );
    if (candSubMatch) {
      const candidateId = candSubMatch[2];
      const subAction = candSubMatch[4];
      const candidate =
        state.candidateDetails[candidateId] ||
        ((state.candidates.find((c) => c.id === candidateId) as unknown) as KbCandidateDetail | undefined);

      // GET /api/knowledge/candidates/:id
      if (!subAction && method === 'GET') {
        if (!candidate) {
          return json(404, { status: 'error', error: `Candidate ${candidateId} not found` });
        }
        return json(200, { status: 'ok', data: candidate });
      }

      // PATCH /api/knowledge/candidates/:id
      if (!subAction && method === 'PATCH') {
        if (!candidate) {
          return json(404, { status: 'error', error: `Candidate ${candidateId} not found` });
        }

        const actorEmail = (req.headers['x-actor-email'] as string) || '';
        if (!actorEmail) {
          return json(401, { status: 'error', error: 'Missing X-Actor-Email header' });
        }

        const owner = state.owners.find((o) => o.email.toLowerCase() === actorEmail.toLowerCase());
        const candidateDomain = candidate.domain || 'security';

        // 403 if domain not owned
        if (!owner || !owner.domains.some((d) => d.toLowerCase() === candidateDomain.toLowerCase())) {
          return json(403, {
            status: 'error',
            error: `Interdit: l’expert ${actorEmail} ne possède pas le domaine '${candidateDomain}' requis pour cette revue`
          });
        }

        // 409 if candidate is already in terminal state
        if (candidate.status === 'accepted' || candidate.status === 'rejected') {
          return json(409, {
            status: 'error',
            error: `Conflit: le candidat ${candidateId} est déjà dans l'état final '${candidate.status}'`
          });
        }

        const { action, reason, amended_content } = body || {};
        if (!action || !['accept', 'amend', 'reject'].includes(action)) {
          return json(400, { status: 'error', error: 'Action invalide. Doit être accept, amend ou reject' });
        }

        if (action === 'reject' && (!reason || reason.trim() === '')) {
          return json(400, { status: 'error', error: 'Le rejet exige un motif obligatoire' });
        }

        if (action === 'accept') {
          if (candidate.kind === 'principle' && !candidate.second_review_requested) {
            candidate.second_review_requested = true;
            candidate.status = 'in_review';
            candidate.history.push({
              timestamp: new Date().toISOString(),
              actor: actorEmail,
              actor_name: owner.name,
              action: 'accepted',
              details:
                'Premier avis favorable (principe). Deuxième revue collégiale requise automatiquement.'
            });

            state.inbox.push({
              id: `rev-second-${Date.now()}`,
              candidate_id: candidate.id!,
              title: candidate.title,
              kind: 'principle',
              domain: candidate.domain,
              reason: 'second_review',
              waiting_since: new Date().toISOString(),
              due_at: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
              is_overdue: false,
              author: candidate.author,
              severity: 'critical'
            });

            state.events.push({
              id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              type: 'review.requested',
              cursor: generateCursor(),
              candidate_id: candidate.id!,
              recipients: ['@peer-reviewer'],
              payload: {
                title: candidate.title,
                domain: candidate.domain,
                actor: actorEmail,
                action: 'second_review_requested'
              },
              timestamp: new Date().toISOString()
            });
          } else {
            candidate.status = 'accepted';
            candidate.history.push({
              timestamp: new Date().toISOString(),
              actor: actorEmail,
              actor_name: owner.name,
              action: 'accepted',
              details: reason || 'Accepté sans réserve'
            });
          }
        } else if (action === 'amend') {
          candidate.status = 'in_review';
          candidate.amended_content = amended_content || candidate.amended_content;
          candidate.history.push({
            timestamp: new Date().toISOString(),
            actor: actorEmail,
            actor_name: owner.name,
            action: 'amended',
            details: reason || 'Amendé par l’expert'
          });
        } else if (action === 'reject') {
          candidate.status = 'rejected';
          candidate.rejection_reason = reason;
          candidate.history.push({
            timestamp: new Date().toISOString(),
            actor: actorEmail,
            actor_name: owner.name,
            action: 'rejected',
            details: reason
          });
        }

        // Clean inbox
        state.inbox = state.inbox.filter((item) => {
          if (item.candidate_id !== candidateId) return true;
          if (
            candidate.kind === 'principle' &&
            candidate.second_review_requested &&
            item.reason === 'second_review'
          ) {
            return true;
          }
          return false;
        });

        // Emit candidate.reviewed
        state.events.push({
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          type: 'candidate.reviewed',
          cursor: generateCursor(),
          candidate_id: candidate.id!,
          recipients: candidate.assigned_to ? [candidate.assigned_to] : [owner.handle],
          payload: {
            title: candidate.title,
            domain: candidate.domain,
            actor: actorEmail,
            action
          },
          timestamp: new Date().toISOString()
        });

        return json(200, { status: 'ok', data: candidate });
      }

      // POST /assign
      if (subAction === 'assign' && method === 'POST') {
        if (!candidate) {
          return json(404, { status: 'error', error: `Candidate ${candidateId} not found` });
        }
        const actorEmail = (req.headers['x-actor-email'] as string) || '';
        const { assignee, reason } = body || {};
        candidate.assigned_to = assignee;
        candidate.history.push({
          timestamp: new Date().toISOString(),
          actor: actorEmail || 'expert',
          action: 'assigned',
          details: `Assigné à ${assignee}: ${reason || ''}`
        });

        state.events.push({
          id: `evt-${Date.now()}`,
          type: 'candidate.assigned',
          cursor: generateCursor(),
          candidate_id: candidate.id!,
          recipients: [assignee],
          payload: {
            title: candidate.title,
            domain: candidate.domain,
            actor: actorEmail,
            message: reason
          },
          timestamp: new Date().toISOString()
        });

        return json(200, { status: 'ok', data: candidate });
      }

      // POST /request-review
      if (subAction === 'request-review' && method === 'POST') {
        if (!candidate) {
          return json(404, { status: 'error', error: `Candidate ${candidateId} not found` });
        }
        const actorEmail = (req.headers['x-actor-email'] as string) || '';
        const { kind, recipient, message, due_at } = body || {};
        const due = due_at || new Date(Date.now() + 3 * 86400000).toISOString();

        state.inbox.push({
          id: `rev-${Date.now()}`,
          candidate_id: candidate.id!,
          title: candidate.title,
          kind: candidate.kind as any,
          domain: candidate.domain,
          reason: kind || 'advice',
          waiting_since: new Date().toISOString(),
          due_at: due,
          is_overdue: false,
          author: actorEmail,
          severity: 'major'
        });

        candidate.history.push({
          timestamp: new Date().toISOString(),
          actor: actorEmail || 'expert',
          action: 'review_requested',
          details: `Sollicitation ${kind} envoyée à ${recipient}: ${message || ''}`
        });

        state.events.push({
          id: `evt-${Date.now()}`,
          type: 'review.requested',
          cursor: generateCursor(),
          candidate_id: candidate.id!,
          recipients: [recipient],
          payload: {
            title: candidate.title,
            domain: candidate.domain,
            actor: actorEmail,
            message,
            due_at: due
          },
          timestamp: new Date().toISOString()
        });

        return json(200, { status: 'ok', data: { success: true } });
      }

      // Comments: GET /comments
      if (subAction === 'comments' && method === 'GET') {
        return json(200, {
          status: 'ok',
          data: {
            comments: state.comments[candidateId] || []
          }
        });
      }

      // Comments: POST /comments
      if (subAction === 'comments' && method === 'POST') {
        const actorEmail = (req.headers['x-actor-email'] as string) || '';
        const { message } = body || {};
        const owner = state.owners.find((o) => o.email.toLowerCase() === actorEmail.toLowerCase());
        const comment: KbComment = {
          id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          candidate_id: candidateId,
          author_handle: owner?.handle || `@${actorEmail.split('@')[0] || 'expert'}`,
          author_name: owner?.name || actorEmail || 'Expert',
          message: message || '',
          created_at: new Date().toISOString()
        };

        if (!state.comments[candidateId]) {
          state.comments[candidateId] = [];
        }
        state.comments[candidateId].push(comment);

        if (candidate) {
          candidate.history.push({
            timestamp: comment.created_at,
            actor: actorEmail,
            actor_name: comment.author_name,
            action: 'commented',
            details: message
          });
        }

        state.events.push({
          id: `evt-${Date.now()}`,
          type: 'candidate.commented',
          cursor: generateCursor(),
          candidate_id: candidateId,
          recipients: candidate?.assigned_to ? [candidate.assigned_to] : ['@sec-lead'],
          payload: {
            title: candidate?.title,
            actor: actorEmail,
            message
          },
          timestamp: new Date().toISOString()
        });

        return json(201, { status: 'ok', data: comment });
      }

      // POST /promote
      if (subAction === 'promote' && method === 'POST') {
        const actorEmail = (req.headers['x-actor-email'] as string) || '';
        const actorOwner = state.owners.find((o) => o.email.toLowerCase() === actorEmail.toLowerCase());
        const canMaintain = actorOwner?.roles.includes('kb:maintain') || actorOwner?.roles.includes('kb:admin');
        if (!canMaintain) {
          return json(403, {
            status: 'forbidden',
            error: "Habilitation insuffisante : rôle kb:maintain requis"
          });
        }

        if (!candidate) {
          return json(404, { status: 'error', error: `Candidate ${candidateId} not found` });
        }

        if (candidate.status !== 'accepted') {
          return json(409, {
            status: 'conflict',
            error: `only an accepted candidate can be promoted (status '${candidate.status}').`
          });
        }

        candidate.status = 'promoted';
        (candidate as any).promoted_at = new Date().toISOString();
        (candidate as any).promoted_by = actorEmail;

        const candInList = state.candidates.find((c) => c.id === candidateId);
        if (candInList) {
          candInList.status = 'promoted';
        }

        return json(200, {
          status: 'ok',
          data: candidate,
          warnings: state.storageMode === 'persistent' ? [] : ['ephemeral-storage']
        });
      }
    }

    // Events: GET /api/knowledge/events ou /kb/events
    if ((pathname === '/api/knowledge/events' || pathname === '/kb/events') && method === 'GET') {
      const since = parsedUrl.searchParams.get('since');
      let eventsToSend = state.events;
      if (since) {
        const idx = state.events.findIndex((e) => e.cursor === since);
        if (idx !== -1) {
          eventsToSend = state.events.slice(idx + 1);
        }
      }
      const nextCursor =
        eventsToSend.length > 0 ? eventsToSend[eventsToSend.length - 1].cursor : since || 'cur-0';

      return json(200, {
        status: 'ok',
        data: {
          events: eventsToSend,
          next_cursor: nextCursor
        }
      });
    }

    // Owners: GET /api/knowledge/owners ou /kb/owners
    if ((pathname === '/api/knowledge/owners' || pathname === '/kb/owners') && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: {
          owners: state.owners,
          total: state.owners.length
        }
      });
    }

    // Owners: PUT /api/knowledge/owners ou /kb/owners
    if ((pathname === '/api/knowledge/owners' || pathname === '/kb/owners') && method === 'PUT') {
      const { owners } = body || {};
      if (Array.isArray(owners)) {
        state.owners = owners;
      }
      return json(200, {
        status: 'ok',
        data: {
          success: true,
          updated_count: state.owners.length
        }
      });
    }

    // Me: GET /api/knowledge/me ou /kb/me
    if ((pathname === '/api/knowledge/me' || pathname === '/kb/me') && method === 'GET') {
      const actorEmail = (req.headers['x-actor-email'] as string) || '';
      if (!actorEmail) {
        return json(401, {
          status: 'error',
          error: 'Missing X-Actor-Email header'
        });
      }

      const found = state.owners.find((o) => o.email.toLowerCase() === actorEmail.toLowerCase());
      if (found) {
        return json(200, {
          status: 'ok',
          data: {
            handle: found.handle,
            email: found.email,
            name: found.name,
            kb_roles: found.roles,
            owned_domains: found.domains,
            pending_reviews: 1,
            delegated: found.delegated
          }
        });
      }

      return json(200, {
        status: 'ok',
        data: {
          handle: `@${actorEmail.split('@')[0]}`,
          email: actorEmail,
          kb_roles: [],
          owned_domains: [],
          pending_reviews: 0,
          delegated: false
        }
      });
    }

    // Board: GET /board
    if (pathname === '/board' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.board
      });
    }

    // Statements: GET /statements
    if (pathname === '/statements' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.statements
      });
    }

    // Conflicts: GET /conflicts
    if (pathname === '/conflicts' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.conflicts
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LOT A10 : INGESTION DE RÉFÉRENTIELS & COUVERTURE
    // ─────────────────────────────────────────────────────────────────────────

    // GET /api/frameworks/ingestions
    if (pathname === '/api/frameworks/ingestions' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: Object.values(state.frameworkIngestions)
      });
    }

    // POST /api/frameworks/ingestions
    if (pathname === '/api/frameworks/ingestions' && method === 'POST') {
      const contentLength = parseInt((req.headers['content-length'] as string) || '0', 10);
      if (contentLength > 20 * 1024 * 1024 || (body?.file_size_bytes && body.file_size_bytes > 20 * 1024 * 1024)) {
        return json(413, {
          status: 'error',
          error: 'Fichier trop volumineux (taille maximale autorisée : 20 Mo)'
        });
      }

      const { framework_id, framework_name, version, domain, file_name, file_format, raw_text, requirements } = body || {};

      const validFormats = ['pdf', 'html', 'txt', 'md', 'docx'];
      const ext = file_name ? file_name.split('.').pop()?.toLowerCase() : file_format;
      if (ext && !validFormats.includes(ext) && !validFormats.includes(file_format)) {
        return json(400, {
          status: 'error',
          error: 'Format de fichier non supporté. Formats acceptés : .pdf, .html, .txt, .md, .docx'
        });
      }

      const fwId = framework_id || body?.framework || 'FW-CUSTOM';
      const fwName = framework_name || framework_id || body?.framework || file_name || 'Référentiel Inconnu';
      const ingId = `ing-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      let parsedRequirements: FrameworkRequirement[] = [];
      if (Array.isArray(requirements) && requirements.length > 0) {
        parsedRequirements = requirements;
      } else if (raw_text && typeof raw_text === 'string') {
        const lines = raw_text.split('\n').filter((l: string) => l.trim().length > 10);
        parsedRequirements = lines.slice(0, 5).map((line: string, idx: number) => ({
          id: `req-${fwId.toLowerCase()}-${idx + 1}`,
          framework_id: fwId,
          section: `Section ${idx + 1}`,
          title: line.substring(0, 40) + '...',
          text: line,
          domain: domain || 'security',
          status: 'pending' as const,
          mapped_assets: []
        }));
      } else {
        parsedRequirements = [
          {
            id: `req-${fwId.toLowerCase()}-01`,
            framework_id: fwId,
            section: 'Exigence 1.1',
            title: 'Politique générale de conformité',
            text: 'Mise en œuvre des contrôles fondamentaux.',
            domain: domain || 'security',
            status: 'pending' as const,
            mapped_assets: []
          },
          {
            id: `req-${fwId.toLowerCase()}-02`,
            framework_id: fwId,
            section: 'Exigence 1.2',
            title: 'Auditabilité continue et logs scellés',
            text: 'Journalisation opposable des accès sensibles.',
            domain: domain || 'security',
            status: 'pending' as const,
            mapped_assets: []
          }
        ];
      }

      const ingestion: FrameworkIngestion = {
        id: ingId,
        framework_id: fwId,
        framework_name: fwName,
        version: version || '1.0',
        file_name: file_name || `${fwId.toLowerCase()}.txt`,
        file_format: (ext as any) || 'txt',
        file_size_bytes: body?.file_size_bytes || contentLength || 1024,
        created_at: new Date().toISOString(),
        status: 'ready',
        total_requirements: parsedRequirements.length,
        reviewed_requirements: parsedRequirements.filter((r) => r.status !== 'pending').length,
        requirements: parsedRequirements
      };

      state.frameworkIngestions[ingId] = ingestion;

      return json(201, {
        status: 'ok',
        data: ingestion
      });
    }

    // GET /api/frameworks/ingestions/:id
    const ingGetMatch = pathname.match(/^\/api\/frameworks\/ingestions\/([a-zA-Z0-9_-]+)$/);
    if (ingGetMatch && method === 'GET') {
      const ingId = ingGetMatch[1];
      const ingestion = state.frameworkIngestions[ingId];
      if (!ingestion) {
        return json(404, { status: 'error', error: `Ingestion '${ingId}' introuvable` });
      }
      return json(200, {
        status: 'ok',
        data: ingestion
      });
    }

    // PATCH /api/frameworks/ingestions/:id/requirements/:reqId or /rows/:reqId
    const reqPatchMatch = pathname.match(
      /^\/api\/frameworks\/ingestions\/([a-zA-Z0-9_-]+)\/(requirements|rows)\/([a-zA-Z0-9_-]+)$/
    );
    if (reqPatchMatch && method === 'PATCH') {
      const ingId = reqPatchMatch[1];
      const reqId = reqPatchMatch[3];
      const ingestion = state.frameworkIngestions[ingId];
      if (!ingestion) {
        return json(404, { status: 'error', error: `Ingestion '${ingId}' introuvable` });
      }

      const requirement = ingestion.requirements.find((r) => r.id === reqId);
      if (!requirement) {
        return json(404, { status: 'error', error: `Exigence '${reqId}' introuvable dans l'ingestion` });
      }

      const actorEmail = (req.headers['x-actor-email'] as string) || '';
      if (actorEmail) {
        const owner = state.owners.find((o) => o.email.toLowerCase() === actorEmail.toLowerCase());
        if (owner && !owner.domains.some((d) => d.toLowerCase() === requirement.domain.toLowerCase())) {
          return json(403, {
            status: 'error',
            error: `Interdit: l'expert ${actorEmail} ne possède pas le domaine '${requirement.domain}' requis pour statuer sur cette exigence`
          });
        }
      }

      let { status: newStatus, decision, mapped_assets, links, amendment_notes, rejection_reason, comment } = body || {};
      if (!newStatus && decision) {
        if (decision === 'accept') newStatus = 'accepted';
        else if (decision === 'amend') newStatus = 'amended';
        else if (decision === 'reject') newStatus = 'rejected';
      }
      if (!mapped_assets && links) mapped_assets = links;
      if (decision === 'reject' && !rejection_reason && comment) rejection_reason = comment;

      if (newStatus === 'rejected' && (!rejection_reason || rejection_reason.trim() === '')) {
        return json(400, {
          status: 'error',
          error: 'Le motif de rejet est obligatoire'
        });
      }

      if (newStatus) requirement.status = newStatus;
      if (Array.isArray(mapped_assets)) requirement.mapped_assets = mapped_assets;
      if (amendment_notes !== undefined) requirement.amendment_notes = amendment_notes;
      if (rejection_reason !== undefined) requirement.rejection_reason = rejection_reason;
      requirement.reviewed_by = actorEmail || 'expert@archinex.local';
      requirement.reviewed_at = new Date().toISOString();

      ingestion.reviewed_requirements = ingestion.requirements.filter((r) => r.status !== 'pending').length;

      return json(200, {
        status: 'ok',
        data: requirement
      });
    }

    // POST /api/frameworks/ingestions/:id/requirements/:reqId/suggest-links
    const suggestMatch = pathname.match(
      /^\/api\/frameworks\/ingestions\/([a-zA-Z0-9_-]+)\/requirements\/([a-zA-Z0-9_-]+)\/suggest-links$/
    );
    if (suggestMatch && method === 'POST') {
      const ingId = suggestMatch[1];
      const reqId = suggestMatch[2];
      const ingestion = state.frameworkIngestions[ingId];
      if (!ingestion) {
        return json(404, { status: 'error', error: `Ingestion '${ingId}' introuvable` });
      }

      const requirement = ingestion.requirements.find((r) => r.id === reqId);
      if (!requirement) {
        return json(404, { status: 'error', error: `Exigence '${reqId}' introuvable` });
      }

      const suggestionResult: FrameworkLinkSuggestionResult = {
        suggested_assets: [
          {
            asset_id: 'CTRL-SEC-01',
            title: 'Contrôle de Redondance & Résilience',
            confidence: 0.94,
            rationale: 'Exigence couverte par la politique de résilience et de haute disponibilité'
          },
          {
            asset_id: 'PRIN-RES-01',
            title: 'Principe Fondamental d’Immuabilité des Traces Audit',
            confidence: 0.88,
            rationale: 'Correspondance avec les obligations de traçabilité et d’alerte'
          }
        ],
        llm_derived: true
      };

      return json(200, {
        status: 'ok',
        data: suggestionResult
      });
    }

    // POST /api/frameworks/:fw/coverage-declaration
    const declMatch = pathname.match(/^\/api\/frameworks\/([a-zA-Z0-9_-]+)\/coverage-declaration$/);
    if (declMatch && method === 'POST') {
      const fw = declMatch[1];
      const actorEmail = (req.headers['x-actor-email'] as string) || 'expert@archinex.local';

      // Recherche toutes les exigences du framework
      const allReqs: FrameworkRequirement[] = [];
      for (const ing of Object.values(state.frameworkIngestions)) {
        if (ing.framework_id.toLowerCase() === fw.toLowerCase()) {
          allReqs.push(...ing.requirements);
        }
      }

      if (allReqs.length === 0) {
        return json(404, {
          status: 'error',
          error: `Aucun référentiel ingéré trouvé pour '${fw}'`
        });
      }

      const pending = allReqs.filter((r) => r.status === 'pending');
      if (pending.length > 0) {
        return json(409, {
          status: 'error',
          error: 'Déclaration de couverture refusée : des exigences non résolues subsistent',
          missing_requirements: pending.map((p) => p.id)
        });
      }

      const coveredCount = allReqs.filter((r) => r.status === 'accepted' || r.status === 'amended').length;

      const result: CoverageDeclarationResult = {
        success: true,
        framework_id: fw,
        coverage_declared: true,
        declared_at: new Date().toISOString(),
        declared_by: actorEmail,
        total_requirements: allReqs.length,
        covered_requirements: coveredCount
      };

      return json(200, {
        status: 'ok',
        data: result
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LOT A9 : ÉVALUATIONS & BOUCLE DE RETOUR SUR VERDICTS (Porte G6)
    // ─────────────────────────────────────────────────────────────────────────

    // GET /api/knowledge/evals/:datasetId
    const evalGetMatch = pathname.match(/^\/api\/knowledge\/evals\/([a-zA-Z0-9_-]+)$/);
    if (evalGetMatch && method === 'GET') {
      const datasetId = evalGetMatch[1];
      const dataset = state.evalDatasets[datasetId];
      if (!dataset) {
        return json(404, {
          status: 'error',
          error: `Dataset d'évaluation '${datasetId}' introuvable`
        });
      }
      return json(200, {
        status: 'ok',
        data: dataset
      });
    }

    // PATCH /api/knowledge/evals/:datasetId/cases/:caseId
    const evalCaseMatch = pathname.match(
      /^\/api\/knowledge\/evals\/([a-zA-Z0-9_-]+)\/cases\/([a-zA-Z0-9_-]+)$/
    );
    if (evalCaseMatch && method === 'PATCH') {
      const datasetId = evalCaseMatch[1];
      const caseId = evalCaseMatch[2];
      const dataset = state.evalDatasets[datasetId];
      if (!dataset) {
        return json(404, { status: 'error', error: `Dataset '${datasetId}' introuvable` });
      }

      const evalCase = dataset.cases.find((c) => c.id === caseId);
      if (!evalCase) {
        return json(404, { status: 'error', error: `Cas de test '${caseId}' introuvable` });
      }

      const actorEmail = (req.headers['x-actor-email'] as string) || '';
      if (actorEmail) {
        const owner = state.owners.find((o) => o.email.toLowerCase() === actorEmail.toLowerCase());
        const hasEvalRole = owner && (owner.roles.includes('kb:evaluate') || owner.roles.includes('kb:admin'));
        if (!hasEvalRole) {
          return json(403, {
            status: 'error',
            error: `Interdit: l'expert ${actorEmail} ne possède pas le rôle 'kb:evaluate' requis pour annoter ce jeu de test`
          });
        }
      }

      const { expected_status, notes } = body || {};
      if (expected_status && !['supports', 'violates'].includes(expected_status)) {
        return json(400, {
          status: 'error',
          error: "Statut attendu invalide : doit être 'supports' ou 'violates'"
        });
      }

      if (expected_status) evalCase.expected_status = expected_status;
      if (notes !== undefined) evalCase.notes = notes;
      evalCase.human_annotated = true;
      evalCase.annotated_by = actorEmail || 'expert@archinex.local';
      evalCase.annotated_at = new Date().toISOString();

      dataset.human_annotated_count = dataset.cases.filter((c) => c.human_annotated).length;

      return json(200, {
        status: 'ok',
        data: evalCase
      });
    }

    // POST /api/knowledge/evals/:datasetId/runs
    const evalRunMatch = pathname.match(/^\/api\/knowledge\/evals\/([a-zA-Z0-9_-]+)\/runs$/);
    if (evalRunMatch && method === 'POST') {
      const datasetId = evalRunMatch[1];
      const dataset = state.evalDatasets[datasetId];
      if (!dataset) {
        return json(404, { status: 'error', error: `Dataset '${datasetId}' introuvable` });
      }

      const actorEmail = (req.headers['x-actor-email'] as string) || 'expert@archinex.local';

      const verdicts = dataset.cases.map((c) => {
        const expected: 'supports' | 'violates' = (c.expected || c.expected_status || 'supports') as 'supports' | 'violates';
        const predicted: 'supports' | 'violates' = expected;
        const matched = predicted === expected;
        return {
          case_id: c.id,
          option_title: c.option_title || (c as any).title || c.option?.title || 'Option',
          rule_id: c.rule_id || (c as any).check_id || 'R-001',
          predicted_status: predicted,
          expected_status: expected,
          matched,
          human_annotated: Boolean(c.human_annotated || c.annotated_by)
        };
      });

      const humanVerified = verdicts.filter((v) => v.human_annotated);
      const passedHuman = humanVerified.filter((v) => v.matched);
      const actualRecall =
        humanVerified.length > 0 ? Math.round((passedHuman.length / humanVerified.length) * 100) : 100;
      const precision = 95;
      const meetsTarget = actualRecall >= 80;

      const runResult: EvalBenchmarkRunResult = {
        run_id: `run-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        dataset_id: datasetId,
        executed_at: new Date().toISOString(),
        executed_by: actorEmail,
        total_cases: dataset.cases.length,
        human_verified_cases: humanVerified.length,
        passed_cases: passedHuman.length,
        precision,
        actual_recall: actualRecall,
        meets_target: meetsTarget,
        verdicts
      };

      return json(200, {
        status: 'ok',
        data: runResult
      });
    }

    // POST /api/knowledge/verdict-feedback
    if (pathname === '/api/knowledge/verdict-feedback' && method === 'POST') {
      const actorEmail =
        (req.headers['x-actor-email'] as string) || body?.author_email || 'architect@archinex.local';

      const { subject_id, option_id, rule_id, verdict_status, disagree_rationale, suggested_action } =
        body || {};

      if (!subject_id || !option_id || !disagree_rationale) {
        return json(400, {
          status: 'error',
          error: "Champs obligatoires manquants : subject_id, option_id et disagree_rationale sont requis"
        });
      }

      const fbId = `fb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      let convertedRef: string | undefined = undefined;
      let finalStatus: VerdictFeedbackItem['status'] = 'pending';

      if (suggested_action === 'add_test_case') {
        const dataset = state.evalDatasets['check_option_v1'];
        if (dataset) {
          const newCase: EvalTestCase = {
            id: `case-fb-${Date.now()}`,
            dataset_id: 'check_option_v1',
            option_title: `Cas issu de retour : ${option_id}`,
            option_summary: disagree_rationale,
            domain: 'security',
            rule_id: rule_id || 'CTRL-SEC-01',
            expected_status: verdict_status === 'supports' ? 'violates' : 'supports',
            human_annotated: true,
            annotated_by: actorEmail,
            annotated_at: new Date().toISOString(),
            notes: `Généré automatiquement depuis le retour de débat ${fbId}`
          };
          dataset.cases.push(newCase);
          dataset.total_cases++;
          dataset.human_annotated_count++;
          convertedRef = newCase.id;
          finalStatus = 'converted_to_test_case';
        }
      } else if (suggested_action === 'propose_amendment') {
        convertedRef = `cand-amend-${Date.now()}`;
        finalStatus = 'converted_to_amendment';
      }

      const feedbackItem: VerdictFeedbackItem = {
        id: fbId,
        subject_id,
        option_id,
        rule_id,
        verdict_status,
        disagree_rationale,
        suggested_action: suggested_action || 'add_test_case',
        author_email: actorEmail,
        status: finalStatus,
        created_at: new Date().toISOString(),
        converted_ref: convertedRef
      };

      state.verdictFeedbacks.push(feedbackItem);

      return json(201, {
        status: 'ok',
        data: feedbackItem
      });
    }

    // POST /api/knowledge/verdict-feedback/:id/convert
    const feedbackConvertMatch = pathname.match(/^\/api\/knowledge\/verdict-feedback\/([^/]+)\/convert$/);
    if (feedbackConvertMatch && method === 'POST') {
      const feedbackId = feedbackConvertMatch[1];
      const actorEmail = (req.headers['x-actor-email'] as string) || '';
      const actorOwner = state.owners.find((o) => o.email.toLowerCase() === actorEmail.toLowerCase());
      const canEval = actorOwner?.roles.includes('kb:evaluate') || actorOwner?.roles.includes('kb:admin');
      if (!canEval) {
        return json(403, {
          status: 'forbidden',
          error: "Habilitation insuffisante : rôle kb:evaluate requis"
        });
      }

      const item = state.verdictFeedbacks.find((f) => f.id === feedbackId);
      if (!item) {
        return json(404, { status: 'error', error: `Verdict feedback ${feedbackId} not found` });
      }

      if (item.status !== 'open' || item.converted_to) {
        return json(409, {
          status: 'conflict',
          error: "Ce retour a déjà été converti ou classé"
        });
      }

      const { to } = body || {};
      if (to === 'eval_case') {
        item.status = 'converted';
        item.converted_to = `eval_case:CO-${Date.now()}`;
      } else if (to === 'amendment') {
        item.status = 'converted';
        item.converted_to = `amendment:CAND-${Date.now()}`;
      } else if (to === 'dismiss') {
        item.status = 'dismissed';
        item.converted_to = 'dismissed';
      }

      return json(200, {
        status: 'ok',
        data: item
      });
    }

    // GET /api/knowledge/verdict-feedback
    if (pathname === '/api/knowledge/verdict-feedback' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.verdictFeedbacks
      });
    }

    // GET /api/knowledge/health
    if (pathname === '/api/knowledge/health' && method === 'GET') {
      const overdueCount = state.inbox.filter((i) => i.is_overdue).length;
      const recall = 0.85;
      const blockers: string[] = [];
      if (overdueCount > 0) {
        blockers.push(`Porte G5 non satisfaite : ${overdueCount} revue(s) critique(s) en retard`);
      }
      if (recall < 0.80) {
        blockers.push(`Porte G6 non satisfaite : rappel de ${Math.round(recall * 100)}% inférieur au seuil de 80%`);
      }

      let totalReqs = 0;
      let coveredReqs = 0;
      for (const fw of Object.values(state.frameworkIngestions)) {
        totalReqs += fw.total_requirements;
        coveredReqs += fw.reviewed_requirements;
      }
      if (totalReqs === 0) {
        totalReqs = 20;
        coveredReqs = 18;
      }

      const metrics: KbHealthMetrics = {
        doctrine_health: {
          total_assets: 60 + state.candidates.filter((c) => c.status === 'accepted' || c.status === 'published').length,
          principles_count: 12,
          patterns_count: 24,
          decisions_count: 14,
          controls_count: 10,
          glossary_count: 17
        },
        reviews_summary: {
          pending_count: state.inbox.length,
          overdue_count: overdueCount,
          avg_review_duration_days: 2.4
        },
        regulatory_coverage: {
          total_frameworks: Math.max(1, Object.keys(state.frameworkIngestions).length),
          total_requirements: totalReqs,
          covered_requirements: coveredReqs,
          coverage_percentage: Math.round((coveredReqs / totalReqs) * 100)
        },
        evals_summary: {
          latest_recall: recall,
          gate_g6_passed: recall >= 0.80,
          last_benchmark_at: new Date(Date.now() - 3600000).toISOString()
        },
        storage: {
          mode: state.storageMode,
          persistent: state.storageMode === 'persistent',
          provider: state.storageMode === 'persistent' ? 'GCS Sovereign Vault' : 'In-Memory Ephemeral RAM'
        },
        gate_g7_eligible: blockers.length === 0,
        gate_g7_blockers: blockers,
        last_snapshot: state.publications.length > 0 ? {
          snapshot_id: state.publications[0].snapshot_id,
          created_at: state.publications[0].published_at,
          published_by: state.publications[0].published_by,
          sha256: state.publications[0].sha256_checksum,
          changelog: state.publications[0].changelog
        } : undefined
      };

      return json(200, {
        status: 'ok',
        data: {
          ...metrics,
          embeddings: [
            {
              model_id: 'toy-bow',
              missing: state.pendingEmbeddings['toy-bow']?.length ?? 0,
              stale: 0,
              vectors: Object.keys(state.embeddings['toy-bow']?.items ?? {}).length,
              active_assets: SEED_KB_ASSETS.length
            }
          ]
        }
      });
    }

    // GET /api/knowledge/publications
    if (pathname === '/api/knowledge/publications' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.publications
      });
    }

    // POST /api/knowledge/publications
    if (pathname === '/api/knowledge/publications' && method === 'POST') {
      const actorEmail = (req.headers['x-actor-email'] as string) || '';
      const actorOwner = state.owners.find((o) => o.email.toLowerCase() === actorEmail.toLowerCase());
      const canPublish = actorOwner?.roles.includes('kb:admin') || actorOwner?.roles.includes('kb:maintain');
      if (!canPublish) {
        return json(403, {
          status: 'error',
          error: "Habilitation insuffisante : rôle kb:admin ou kb:maintain requis"
        });
      }

      // Check Gate G7 blockers
      const overdueCount = state.inbox.filter((i) => i.is_overdue).length;
      const recall = 0.85;

      const blockers: string[] = [];
      if (overdueCount > 0) {
        blockers.push(`Porte G5 non satisfaite : ${overdueCount} revue(s) critique(s) en retard`);
      }
      if (recall < 0.80) {
        blockers.push(`Porte G6 non satisfaite : rappel de ${Math.round(recall * 100)}% inférieur au seuil de 80%`);
      }

      if (blockers.length > 0) {
        return json(409, {
          status: 'error',
          error: "Conditions de la Porte G7 non remplies pour la publication",
          blockers
        });
      }

      const snapshot_id = `snapshot-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).substring(2, 9)}`;
      const version = `v1.${state.publications.length + 1}.0`;
      const sha256_checksum = crypto
        .createHash('sha256')
        .update(snapshot_id + (body.changelog || '') + Date.now())
        .digest('hex');

      // Promote any promoted candidates to published
      const promoted = state.candidates.filter((c) => c.status === 'promoted');
      const publishedIds = promoted.map((c) => c.id);
      for (const cand of promoted) {
        cand.status = 'published';
        (cand as any).published = {
          snapshot_id,
          at: new Date().toISOString()
        };
      }

      const pub: any = {
        id: `pub-${Date.now()}`,
        snapshot_id,
        version,
        published_at: new Date().toISOString(),
        published_by: actorEmail,
        sha256_checksum,
        changelog: body.changelog || "Publication officielle de la doctrine d'architecture validée.",
        assets_count: 60 + state.candidates.filter((c) => c.status === 'accepted' || c.status === 'published').length,
        storage_persistent: state.storageMode === 'persistent',
        published: publishedIds,
        published_candidates: publishedIds,
        warnings: state.storageMode === 'persistent' ? [] : ['ephemeral-storage']
      };

      state.publications.unshift(pub);

      return json(200, {
        status: 'ok',
        data: pub,
        warnings: pub.warnings
      });
    }

    // GET /api/knowledge/campaigns
    if (pathname === '/api/knowledge/campaigns' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.campaigns
      });
    }

    // POST /api/knowledge/campaigns
    if (pathname === '/api/knowledge/campaigns' && method === 'POST') {
      const actorEmail = (req.headers['x-actor-email'] as string) || 'expert@archinex.local';
      const { title, domain, target_asset_type, target_count, due_at, description } = body;
      if (!title || !domain) {
        return json(400, {
          status: 'error',
          error: "Champs obligatoires manquants : title et domain sont requis"
        });
      }

      const newCamp: KbCampaign = {
        id: `camp-${Date.now()}`,
        title,
        domain,
        target_asset_type: target_asset_type || 'pattern',
        target_count: Number(target_count) || 1,
        created_at: new Date().toISOString(),
        created_by: actorEmail,
        due_at: due_at || new Date(Date.now() + 14 * 86400000).toISOString(),
        status: 'active',
        description: description || '',
        progress: {
          current: 0,
          target: Number(target_count) || 1
        }
      };

      state.campaigns.unshift(newCamp);

      return json(201, {
        status: 'ok',
        data: newCamp
      });
    }

    // PATCH /api/knowledge/campaigns/:id
    const campaignMatch = pathname.match(/^\/api\/knowledge\/campaigns\/([^/]+)$/);
    if (campaignMatch && method === 'PATCH') {
      const campId = decodeURIComponent(campaignMatch[1]);
      const camp = state.campaigns.find((c) => c.id === campId);
      if (!camp) {
        return json(404, {
          status: 'error',
          error: `Campagne ${campId} introuvable`
        });
      }

      if (body.status) {
        camp.status = body.status;
      }
      if (typeof body.progress_increment === 'number') {
        camp.progress.current = Math.min(camp.progress.target, camp.progress.current + body.progress_increment);
        if (camp.progress.current >= camp.progress.target) {
          camp.status = 'completed';
        }
      }

      return json(200, {
        status: 'ok',
        data: camp
      });
    }

    /* ========================================================================
     * CONTRAT 1.9 : SIMILARITÉ SÉMANTIQUE & EMBEDDINGS
     * ======================================================================== */

    // GET /api/knowledge/embeddings/pending
    if (pathname === '/api/knowledge/embeddings/pending' && method === 'GET') {
      const model = parsedUrl.searchParams.get('model');
      if (!model) {
        return json(400, {
          status: 'error',
          error: 'model parameter required'
        });
      }
      const pending = state.pendingEmbeddings[model] || [];
      return json(200, {
        status: 'ok',
        data: {
          pending
        }
      });
    }

    // PUT /api/knowledge/embeddings
    if (pathname === '/api/knowledge/embeddings' && method === 'PUT') {
      const { model, model_version, items } = body;
      if (!model || !model_version || !Array.isArray(items) || items.length === 0) {
        return json(400, {
          status: 'error',
          error: 'model, model_version and non-empty items array are required'
        });
      }

      // Check existing model version mismatch
      const existing = state.embeddings[model];
      if (existing && existing.model_version !== model_version) {
        return json(400, {
          status: 'error',
          error: 'two versions are never mixed'
        });
      }

      if (!state.embeddings[model]) {
        state.embeddings[model] = {
          model_version,
          dim: 128,
          items: {}
        };
      }

      for (const item of items) {
        if (!item.ref || !item.text_sha256 || !Array.isArray(item.vector)) {
          return json(400, {
            status: 'error',
            error: 'Each item must have ref, text_sha256 and vector'
          });
        }
        if (item.vector.length !== 128) {
          return json(400, {
            status: 'error',
            error: 'vector dimension mismatch'
          });
        }
        if (item.vector.every((v: number) => v === 0)) {
          return json(400, {
            status: 'error',
            error: 'null vector refused'
          });
        }
        if (item.vector.some((v: any) => typeof v !== 'number' || isNaN(v))) {
          return json(400, {
            status: 'error',
            error: 'vector components must be numbers'
          });
        }

        const asset = SEED_KB_ASSETS.find((a) => a.ref === item.ref);
        if (!asset) {
          return json(400, {
            status: 'error',
            error: `Unknown asset ${item.ref}`
          });
        }

        const expectedSha = crypto.createHash('sha256').update(Buffer.from(asset.text, 'utf-8')).digest('hex');
        if (item.text_sha256 !== expectedSha) {
          return json(400, {
            status: 'error',
            error: 'text_sha256 does not match asset text'
          });
        }

        state.embeddings[model].items[item.ref] = {
          ref: item.ref,
          text_sha256: item.text_sha256,
          vector: item.vector,
          language: item.language,
          title: asset.title,
          type: asset.type,
          text: asset.text,
          domain: asset.domain,
          assumptions: asset.assumptions,
          status: asset.status
        };
      }

      // Update pending items for this model
      const depositedRefs = new Set(items.map((i: any) => i.ref));
      if (state.pendingEmbeddings[model]) {
        state.pendingEmbeddings[model] = state.pendingEmbeddings[model].filter((p) => !depositedRefs.has(p.ref));
      }

      return json(200, {
        status: 'ok',
        data: {
          dim: 128,
          count: items.length
        }
      });
    }

    // POST /api/knowledge/similar
    if (pathname === '/api/knowledge/similar' && method === 'POST') {
      const { model, vector, query_text, types, domains, top_k, subject_fingerprint } = body;
      if (!model || !Array.isArray(vector)) {
        return json(400, {
          status: 'error',
          error: 'model and vector array are required'
        });
      }
      if (vector.length !== 128) {
        return json(400, {
          status: 'error',
          error: 'vector dimension mismatch'
        });
      }

      const modelStore = state.embeddings[model];
      if (!modelStore || Object.keys(modelStore.items).length === 0) {
        return json(400, {
          status: 'error',
          error: 'no vector stored yet for the model'
        });
      }

      const results: SimilarKnowledgeItem[] = [];
      for (const item of Object.values(modelStore.items)) {
        if (types && Array.isArray(types) && !types.includes(item.type)) {
          continue;
        }

        const vecScore = Math.max(0.0, cosineSimilarity(vector, item.vector));
        const scores: Record<string, number> = { vector: Math.round(vecScore * 10000) / 10000 };
        if (query_text) {
          scores.lexical = 0.85;
        }
        if (domains && Array.isArray(domains) && domains.some((d) => item.domain.includes(d))) {
          scores.domain = 1.0;
        }

        let remaining = 1.0 - scores.vector;
        if (scores.lexical) remaining *= (1.0 - 0.25 * scores.lexical);
        if (scores.domain) remaining *= (1.0 - 0.05 * scores.domain);
        const combined = Math.min(1.0, Math.max(0.0, 1.0 - remaining));

        let zone: SimilarityZone = 'weak';
        if (item.status === 'superseded') {
          zone = 'superseded';
        } else if (combined >= 0.80) {
          zone = 'strong';
        } else if (combined >= 0.60) {
          zone = 'possible';
        }

        // Past judgements for this asset
        const judgements: any[] = state.reuseConfirmations
          .filter((c) => c.matched_ref === item.ref && (!subject_fingerprint || c.subject_fingerprint === subject_fingerprint))
          .map((c) => ({
            id: c.id,
            at: c.at,
            actor: c.actor,
            outcome: c.outcome,
            comment: c.comment || null,
            assumptions_changed_since: false
          }));

        const reuseSummary: Record<string, number> = {};
        for (const j of state.reuseConfirmations.filter((c) => c.matched_ref === item.ref)) {
          reuseSummary[j.outcome] = (reuseSummary[j.outcome] || 0) + 1;
        }

        results.push({
          ref: item.ref,
          type: item.type,
          title: item.title,
          score: Math.round(combined * 10000) / 10000,
          scores,
          zone,
          requires_confirmation: true,
          stale: false,
          status: item.status,
          domain: item.domain,
          last_reviewed: '2026-09-01T00:00:00Z',
          review_by: 'alice@example.org',
          validated_by: ['@core-owner-architecture'],
          validated_at: '2026-09-01T00:00:00Z',
          superseded_by: item.status === 'superseded' ? 'ADR-0099' : null,
          assumptions: item.assumptions,
          assumptions_documented: item.assumptions.length > 0,
          judgements,
          reuse_summary: Object.keys(reuseSummary).length > 0 ? reuseSummary : undefined
        });
      }

      results.sort((a, b) => b.score - a.score);
      const limit = typeof top_k === 'number' ? top_k : 10;
      const sliced = results.slice(0, limit);

      return json(200, {
        status: 'ok',
        data: {
          results: sliced,
          config: {
            status: 'uncalibrated',
            thresholds: {
              strong: 0.85,
              possible: 0.65,
              weak: 0.40
            },
            boosts: {}
          }
        }
      });
    }

    /* ========================================================================
     * CONTRAT 1.10 : RÉUTILISATION DES CONNAISSANCES VALIDÉES
     * ======================================================================== */

    // POST /api/knowledge/reuse-confirmations
    if (pathname === '/api/knowledge/reuse-confirmations' && method === 'POST') {
      const actorEmail = req.headers['x-actor-email'] as string;
      if (!actorEmail) {
        return json(403, {
          status: 'error',
          error: 'A person is required (X-Actor-Email header missing)'
        });
      }

      const { subject_fingerprint, subject_label, matched_ref, model, scores, outcome, assumptions, comment } = body;
      if (!subject_fingerprint || subject_fingerprint.length !== 64 || !subject_label || !matched_ref || !outcome || !Array.isArray(assumptions)) {
        return json(400, {
          status: 'error',
          error: 'subject_fingerprint (64 hex), subject_label, matched_ref, outcome, and assumptions array are required'
        });
      }

      const validOutcomes = ['reused', 'reused_with_exception', 'rejected_not_same', 'rejected_assumption_fails', 'deferred'];
      if (!validOutcomes.includes(outcome)) {
        return json(400, {
          status: 'error',
          error: `Invalid outcome ${outcome}`
        });
      }

      for (const a of assumptions) {
        if (!['holds', 'does_not_hold', 'unknown'].includes(a.status)) {
          return json(400, {
            status: 'error',
            error: `Invalid assumption status ${a.status}`
          });
        }
      }

      const asset = SEED_KB_ASSETS.find((a) => a.ref === matched_ref);
      const expectedAssumptions = asset?.assumptions || [];

      // Validate assumptions coverage
      if (expectedAssumptions.length > 0) {
        if (assumptions.length !== expectedAssumptions.length) {
          return json(409, {
            status: 'error',
            error: 'All documented assumptions must be judged'
          });
        }
        for (const exp of expectedAssumptions) {
          if (!assumptions.some((a) => a.text === exp)) {
            return json(409, {
              status: 'error',
              error: `Documented assumption "${exp}" not found in confirmation judgements`
            });
          }
        }
      }

      // Outcome constraints
      if (outcome === 'reused') {
        const allHold = assumptions.every((a) => a.status === 'holds');
        if (!allHold) {
          return json(409, {
            status: 'error',
            error: 'Outcome "reused" requires every assumption to hold. Use reused_with_exception if some do not hold.'
          });
        }
      } else if (outcome === 'reused_with_exception') {
        if (!comment || comment.trim().length === 0) {
          return json(400, {
            status: 'error',
            error: 'Outcome "reused_with_exception" requires a motivated comment'
          });
        }
        const anyFailsOrUnknown = assumptions.some((a) => a.status !== 'holds');
        if (!anyFailsOrUnknown) {
          return json(409, {
            status: 'error',
            error: 'all hold: not an exception'
          });
        }
      } else if (outcome === 'rejected_not_same') {
        if (!comment || comment.trim().length === 0) {
          return json(400, {
            status: 'error',
            error: 'Outcome "rejected_not_same" requires an explanatory comment'
          });
        }
      } else if (outcome === 'rejected_assumption_fails') {
        const anyFails = assumptions.some((a) => a.status === 'does_not_hold');
        if (!anyFails) {
          return json(409, {
            status: 'error',
            error: 'Outcome "rejected_assumption_fails" requires at least one assumption to fail'
          });
        }
      }

      const owner = state.owners.find((o) => o.email === actorEmail);
      const actor = owner ? owner.name : `email:${actorEmail}`;

      const rec: ReuseConfirmation = {
        id: state.reuseConfirmations.length + 1,
        at: new Date().toISOString(),
        actor,
        assumptions_digest: crypto.createHash('sha256').update(JSON.stringify(assumptions)).digest('hex'),
        subject_fingerprint,
        subject_label,
        matched_ref,
        model,
        scores,
        outcome,
        assumptions,
        comment
      };

      state.reuseConfirmations.push(rec);

      return json(201, {
        status: 'ok',
        data: rec
      });
    }

    // GET /api/knowledge/reuse-confirmations
    if (pathname === '/api/knowledge/reuse-confirmations' && method === 'GET') {
      const subject_fingerprint = parsedUrl.searchParams.get('subject_fingerprint');
      const matched_ref = parsedUrl.searchParams.get('matched_ref');
      let filtered = state.reuseConfirmations;
      if (subject_fingerprint) {
        filtered = filtered.filter((c) => c.subject_fingerprint === subject_fingerprint);
      }
      if (matched_ref) {
        filtered = filtered.filter((c) => c.matched_ref === matched_ref);
      }
      return json(200, {
        status: 'ok',
        data: {
          confirmations: filtered
        }
      });
    }

    /* ========================================================================
     * CONTRAT 1.11 : ÉVALUATION DE SIMILARITÉ FR/EN & CALIBRATION DES SEUILS
     * ======================================================================== */

    // GET /api/knowledge/similarity-evals/:dataset
    const simDatasetGetMatch = pathname.match(/^\/api\/knowledge\/similarity-evals\/([a-zA-Z0-9_-]+)$/);
    if (simDatasetGetMatch && method === 'GET') {
      const dsName = simDatasetGetMatch[1];
      const ds = state.similarityDatasets[dsName];
      if (!ds) {
        return json(404, {
          status: 'error',
          error: `Dataset ${dsName} introuvable`
        });
      }
      const validated = ds.cases.filter((c) => c.annotation_status === 'validated').length;
      return json(200, {
        status: 'ok',
        data: {
          cases: ds.cases,
          validated
        }
      });
    }

    // PATCH /api/knowledge/similarity-evals/:dataset/cases/:caseId
    const simCasePatchMatch = pathname.match(/^\/api\/knowledge\/similarity-evals\/([a-zA-Z0-9_-]+)\/cases\/([a-zA-Z0-9_-]+)$/);
    if (simCasePatchMatch && method === 'PATCH') {
      const actorEmail = req.headers['x-actor-email'] as string;
      if (!actorEmail) {
        return json(403, {
          status: 'error',
          error: 'Actor required'
        });
      }

      const owner = state.owners.find((o) => o.email === actorEmail);
      const isEvaluator = owner?.roles?.includes('kb:evaluate') || actorEmail.includes('eva');
      if (!isEvaluator) {
        return json(403, {
          status: 'error',
          error: 'Evaluator role (kb:evaluate) required'
        });
      }

      const dsName = simCasePatchMatch[1];
      const caseId = simCasePatchMatch[2];
      const ds = state.similarityDatasets[dsName];
      if (!ds) {
        return json(404, {
          status: 'error',
          error: `Dataset ${dsName} introuvable`
        });
      }

      const caseItem = ds.cases.find((c) => c.id === caseId);
      if (!caseItem) {
        return json(404, {
          status: 'error',
          error: `Case ${caseId} introuvable`
        });
      }

      if (Object.keys(body).length === 0) {
        return json(400, {
          status: 'error',
          error: 'Body cannot be empty'
        });
      }

      if (body.expected && Array.isArray(body.expected)) {
        const validRels = ['same_subject', 'related_not_same', 'same_topic_different_assumptions', 'unrelated'];
        for (const exp of body.expected) {
          if (!validRels.includes(exp.relation)) {
            return json(400, {
              status: 'error',
              error: `Invalid relation ${exp.relation}`
            });
          }
          if (!SEED_KB_ASSETS.some((a) => a.ref === exp.ref)) {
            return json(400, {
              status: 'error',
              error: `Unknown asset ref ${exp.ref}`
            });
          }
        }
        caseItem.expected = body.expected;
      }

      if (body.annotation_status) {
        caseItem.annotation_status = body.annotation_status;
      }
      caseItem.annotated_by = owner ? owner.name : `email:${actorEmail}`;
      caseItem.annotated_at = new Date().toISOString();

      return json(200, {
        status: 'ok',
        data: caseItem
      });
    }

    // POST /api/knowledge/similarity-evals/:dataset/runs
    const simRunsMatch = pathname.match(/^\/api\/knowledge\/similarity-evals\/([a-zA-Z0-9_-]+)\/runs$/);
    if (simRunsMatch && method === 'POST') {
      const actorEmail = req.headers['x-actor-email'] as string;
      if (!actorEmail) {
        return json(403, {
          status: 'error',
          error: 'A system token cannot run an evaluation (X-Actor-Email required)'
        });
      }

      const owner = state.owners.find((o) => o.email === actorEmail);
      const isEvaluator = owner?.roles?.includes('kb:evaluate') || actorEmail.includes('eva');
      if (!isEvaluator) {
        return json(403, {
          status: 'error',
          error: 'Evaluator role required'
        });
      }

      const dsName = simRunsMatch[1];
      const ds = state.similarityDatasets[dsName];
      if (!ds) {
        return json(404, {
          status: 'error',
          error: `Dataset ${dsName} introuvable`
        });
      }

      const { model, vectors, validated_only } = body;
      if (!model || !vectors || typeof vectors !== 'object') {
        return json(400, {
          status: 'error',
          error: 'model and vectors mapping are required'
        });
      }

      if (!state.embeddings[model] && model !== 'toy-bow') {
        return json(400, {
          status: 'error',
          error: `Unknown model ${model}`
        });
      }

      let casesToEval = ds.cases;
      if (validated_only) {
        casesToEval = ds.cases.filter((c) => c.annotation_status === 'validated');
        if (casesToEval.length === 0) {
          return json(400, {
            status: 'error',
            error: 'nothing validated yet'
          });
        }
      }

      for (const c of casesToEval) {
        if (!vectors[c.id]) {
          return json(400, {
            status: 'error',
            error: `Missing vector for case ${c.id}`
          });
        }
        if (vectors[c.id].length !== 128) {
          return json(400, {
            status: 'error',
            error: `Wrong dimension for case ${c.id}`
          });
        }
      }

      // Compute similarity metrics
      let totalFalseStrong = 0;
      let totalMissedStrong = 0;
      let totalReuseTrapStrong = 0;
      let totalSameSubjectExpected = 0;
      let hitsAt3 = 0;

      const byFamily: Record<SimilarityFamily, any> = {
        cross_lingual: { cases: 0, same_subject_expected: 0, recall_at_3: null, false_strong: 0, reuse_trap_strong: 0, missed_strong: 0 },
        same_words_different_subject: { cases: 0, same_subject_expected: 0, recall_at_3: null, false_strong: 0, reuse_trap_strong: 0, missed_strong: 0 },
        same_topic_different_assumptions: { cases: 0, same_subject_expected: 0, recall_at_3: null, false_strong: 0, reuse_trap_strong: 0, missed_strong: 0 },
        out_of_base: { cases: 0, same_subject_expected: 0, recall_at_3: null, false_strong: 0, reuse_trap_strong: 0, missed_strong: 0 }
      };

      const byLanguage: Record<'fr' | 'en', any> = {
        fr: { cases: 0, same_subject_expected: 0, recall_at_3: null, false_strong: 0, reuse_trap_strong: 0, missed_strong: 0 },
        en: { cases: 0, same_subject_expected: 0, recall_at_3: null, false_strong: 0, reuse_trap_strong: 0, missed_strong: 0 }
      };

      const perCase: any[] = [];
      const modelItems = state.embeddings[model]?.items || {};

      for (const c of casesToEval) {
        const queryVec = vectors[c.id];
        const scoredAssets: Array<{ ref: string; score: number; zone: SimilarityZone }> = [];
        for (const item of Object.values(modelItems)) {
          const score = cosineSimilarity(queryVec, item.vector);
          let zone: SimilarityZone = 'weak';
          if (score >= 0.85) zone = 'strong';
          else if (score >= 0.65) zone = 'possible';
          scoredAssets.push({ ref: item.ref, score, zone });
        }
        scoredAssets.sort((a, b) => b.score - a.score);
        const top3 = scoredAssets.slice(0, 3);

        const expectedSame = c.expected.filter((e) => e.relation === 'same_subject').map((e) => e.ref);
        const expectedReuseTrap = c.expected.filter((e) => e.relation === 'same_topic_different_assumptions').map((e) => e.ref);
        const expectedUnrelated = c.expected.filter((e) => e.relation === 'unrelated').map((e) => e.ref);

        const caseFalseStrong: string[] = [];
        const caseReuseTrapStrong: string[] = [];
        const caseMissedStrong: string[] = [];

        // In out_of_base, any strong match is false_strong!
        if (c.family === 'out_of_base') {
          for (const m of scoredAssets.filter((a) => a.zone === 'strong')) {
            caseFalseStrong.push(m.ref);
          }
        } else {
          for (const m of scoredAssets.filter((a) => a.zone === 'strong')) {
            if (expectedUnrelated.includes(m.ref)) {
              caseFalseStrong.push(m.ref);
            } else if (expectedReuseTrap.includes(m.ref)) {
              caseReuseTrapStrong.push(m.ref);
            }
          }
          for (const exp of expectedSame) {
            const m = scoredAssets.find((a) => a.ref === exp);
            if (!m || m.zone !== 'strong') {
              caseMissedStrong.push(exp);
            }
          }
        }

        if (expectedSame.length > 0) {
          totalSameSubjectExpected += expectedSame.length;
          byFamily[c.family].same_subject_expected += expectedSame.length;
          byLanguage[c.language].same_subject_expected += expectedSame.length;
          const hit = expectedSame.some((r) => top3.some((m) => m.ref === r));
          if (hit) {
            hitsAt3 += 1;
          }
        }

        totalFalseStrong += caseFalseStrong.length;
        totalReuseTrapStrong += caseReuseTrapStrong.length;
        totalMissedStrong += caseMissedStrong.length;

        byFamily[c.family].cases += 1;
        byFamily[c.family].false_strong += caseFalseStrong.length;
        byFamily[c.family].reuse_trap_strong += caseReuseTrapStrong.length;
        byFamily[c.family].missed_strong += caseMissedStrong.length;

        byLanguage[c.language].cases += 1;
        byLanguage[c.language].false_strong += caseFalseStrong.length;
        byLanguage[c.language].reuse_trap_strong += caseReuseTrapStrong.length;
        byLanguage[c.language].missed_strong += caseMissedStrong.length;

        perCase.push({
          case_id: c.id,
          family: c.family,
          language: c.language,
          false_strong: caseFalseStrong,
          reuse_trap_strong: caseReuseTrapStrong,
          missed_strong: caseMissedStrong,
          top: scoredAssets.slice(0, 5)
        });
      }

      for (const fam of Object.keys(byFamily) as SimilarityFamily[]) {
        byFamily[fam].recall_at_3 = byFamily[fam].same_subject_expected > 0 ? 1.0 : null;
      }
      for (const lang of ['fr', 'en'] as const) {
        byLanguage[lang].recall_at_3 = byLanguage[lang].same_subject_expected > 0 ? 1.0 : null;
      }

      // Sweep of thresholds
      const sweep: any[] = [];
      for (let t = 70; t <= 98; t += 2) {
        const thr = t / 100;
        // higher bar never adds false strong
        const fsAtThr = thr >= 0.99 ? 0 : totalFalseStrong;
        sweep.push({
          threshold: thr,
          false_strong: fsAtThr,
          recall: 1.0
        });
      }

      const runId = ds.runs.length + 1;
      const run: SimilarityRun = {
        id: runId,
        dataset: dsName,
        at: new Date().toISOString(),
        run_by: owner ? owner.name : `email:${actorEmail}`,
        model,
        cases: casesToEval.length,
        validated_cases: casesToEval.filter((c) => c.annotation_status === 'validated').length,
        same_subject_expected: totalSameSubjectExpected,
        recall_at_3: totalSameSubjectExpected > 0 ? 1.0 : null,
        false_strong: totalFalseStrong,
        reuse_trap_strong: totalReuseTrapStrong,
        missed_strong: totalMissedStrong,
        by_family: byFamily,
        by_language: byLanguage,
        sweep,
        recommended_strong_threshold: totalFalseStrong === 0 ? 0.85 : null,
        recommendation_note: totalFalseStrong === 0
          ? 'Threshold 0.85 separates strong from possible with 0 false strong proposals.'
          : 'no threshold eliminates false strong: out of base matches exceed top bar.',
        per_case: perCase
      };

      ds.runs.push(run);

      return json(201, {
        status: 'ok',
        data: run
      });
    }

    // GET /api/knowledge/similarity-evals/:dataset/runs/:runId
    const simRunGetMatch = pathname.match(/^\/api\/knowledge\/similarity-evals\/([a-zA-Z0-9_-]+)\/runs\/([0-9]+)$/);
    if (simRunGetMatch && method === 'GET') {
      const dsName = simRunGetMatch[1];
      const runId = Number(simRunGetMatch[2]);
      const ds = state.similarityDatasets[dsName];
      if (!ds) {
        return json(404, {
          status: 'error',
          error: `Dataset ${dsName} introuvable`
        });
      }
      const run = ds.runs.find((r) => r.id === runId);
      if (!run) {
        return json(404, {
          status: 'error',
          error: `Run ${runId} introuvable`
        });
      }
      return json(200, {
        status: 'ok',
        data: run
      });
    }

    // Default 404
    return json(404, {
      status: 'error',
      error: `Not found: ${method} ${pathname}`
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;

  return {
    server,
    url,
    state,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
    reset: () => {
      const fresh = createDefaultFakeState();
      Object.assign(state, fresh);
    }
  };
}
