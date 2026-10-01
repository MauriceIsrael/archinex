import http from 'node:http';
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
  VerdictFeedbackItem
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
    verdictFeedbacks: []
  };
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
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = {};
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
      /^\/(api\/knowledge|kb)\/candidates\/([a-zA-Z0-9_-]+)(\/(assign|request-review|comments))?$/
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

      const fwId = framework_id || 'FW-CUSTOM';
      const fwName = framework_name || file_name || 'Référentiel Inconnu';
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

    // PATCH /api/frameworks/ingestions/:id/requirements/:reqId
    const reqPatchMatch = pathname.match(
      /^\/api\/frameworks\/ingestions\/([a-zA-Z0-9_-]+)\/requirements\/([a-zA-Z0-9_-]+)$/
    );
    if (reqPatchMatch && method === 'PATCH') {
      const ingId = reqPatchMatch[1];
      const reqId = reqPatchMatch[2];
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

      const { status: newStatus, mapped_assets, amendment_notes, rejection_reason } = body || {};

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
        const predicted: 'supports' | 'violates' = c.expected_status;
        const matched = predicted === c.expected_status;
        return {
          case_id: c.id,
          option_title: c.option_title,
          rule_id: c.rule_id,
          predicted_status: predicted,
          expected_status: c.expected_status,
          matched,
          human_annotated: c.human_annotated
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

    // GET /api/knowledge/verdict-feedback
    if (pathname === '/api/knowledge/verdict-feedback' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.verdictFeedbacks
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
