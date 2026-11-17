import { describe, expect, it } from 'vitest';
import type { CorpusDocument, ExtractedClause } from '$lib/domain/corpus';
import { confrontClausesWithKnowledgeBase, inferLotFromText } from '$lib/domain/rfpConfrontation';
import { isDomainInPack, matchClausesToSubject } from '$lib/domain/clauseMatching';
import type { Encoder } from '$lib/server/similarity/encoder';
import {
  classifyArchitectRoleSemantically,
  classifyClauseCriticalitySemantically,
  confrontClausesSemantically,
  inferLotSemantically
} from '$lib/server/similarity/rfpSemanticClassifier';
import { doctrineService } from '$lib/server/doctrine/doctrineService';
import { matchKnowledgeAssetsSemantically } from '$lib/server/similarity/knowledgeGraphSemanticMatcher';

function createWave2MockEncoder(): Encoder {
  return {
    model: 'mock-wave2-bge',
    version: async () => '1.0',
    encode: async (text: string) => {
      const t = text.toLowerCase();
      // [security/iam, infra/k8s, sovereignty/legal, resilience/backup, mandatory/blocking]
      const v = [0, 0, 0, 0, 0];
      if (/chiffrement|pki|iam|identit[ée]s|zero[- ]trust|anssi|nis2|hsm|authentification/.test(t)) v[0] += 1;
      if (/kubernetes|bare[- ]metal|conteneur|stockage|latence|virtualisation|cluster/.test(t)) v[1] += 1;
      if (/souverain|secnumcloud|localisation des donn[ée]es|juridique|rgpd/.test(t)) v[2] += 1;
      if (/r[ée]silience|sauvegarde|continuit[ée]|d[ée]connect[ée]|reprise|pca|pra/.test(t)) v[3] += 1;
      if (/imp[ée]rative|obligatoire|rejet|strictement|mandatory|strict/.test(t)) v[4] += 1;
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      return norm > 0 ? v.map((x) => x / norm) : [0.2, 0.2, 0.2, 0.2, 0.2];
    }
  };
}

describe('Vague 2 & 3 — Confrontation RFP, Doctrine, Knowledge Graph & UI Helpers', () => {
  it('rfpConfrontation : le repli lexical générique fonctionne hors télécom (santé/IT)', () => {
    const clauses: ExtractedClause[] = [
      {
        id: 'cl-fhir-1',
        clauseRef: '§3.1',
        title: 'Interopérabilité FHIR des dossiers médicaux',
        text: 'La plateforme clinique doit exposer une passerelle FHIR sécurisée pour les dossiers patients.',
        criticality: 'majeur'
      }
    ];
    const docs: CorpusDocument[] = [
      {
        id: 'doc-fhir',
        title: 'Architecture Santé Numérique',
        origin: 'contributor_external',
        category: 'standard',
        categoryLabel: 'Standard Technique',
        sourceOrAuthor: 'Équipe Architecture',
        version: '1.0',
        extractedClausesCount: 0,
        keyClauses: [],
        addedDate: '2026-01-01',
        lastUpdated: '2026-01-01',
        summary: 'Passerelle FHIR clinique',
        relatedSubjectIds: [],
        inducedRules: [
          {
            id: 'RULE-FHIR-01',
            title: 'Passerelle FHIR clinique',
            type: 'obligation',
            description: 'Exposition normalisée des dossiers médicaux patients via passerelle FHIR.'
          }
        ]
      }
    ];

    const results = confrontClausesWithKnowledgeBase(clauses, docs, []);
    expect(results.confrontations).toHaveLength(1);
    expect(results.confrontations[0].status).toBe('compliant');
    expect(results.confrontations[0].matchedRuleId).toBe('RULE-FHIR-01');
  });

  it('rfpSemanticClassifier : classe criticité, rôle, lot et confronte par cosinus', async () => {
    const encoder = createWave2MockEncoder();

    const crit = await classifyClauseCriticalitySemantically(
      'Exigence impérative et strictement obligatoire sous peine de rejet.',
      encoder
    );
    expect(crit.matchMode).toBe('semantic');
    expect(crit.criticality).toBe('bloquant');

    const role = await classifyArchitectRoleSemantically(
      'Authentification forte et gestion des clés sur HSM avec zéro-trust.',
      encoder
    );
    expect(role.matchMode).toBe('semantic');
    expect(role.role).toBe('security_architect');

    const lot = await inferLotSemantically('Plan de reprise après sinistre et sauvegarde hors-site', encoder);
    expect(lot.matchMode).toBe('semantic');
    expect(lot.lotId).toBe('LOT-05-RESIL');

    const clauses: ExtractedClause[] = [
      {
        id: 'cl-k8s-1',
        clauseRef: '§5.2',
        title: 'Orchestration de conteneurs',
        text: 'Déploiement automatisé sur cluster Kubernetes et virtualisation.',
        criticality: 'majeur'
      }
    ];
    const docs: CorpusDocument[] = [
      {
        id: 'doc-k8s',
        title: 'Socle Conteneurs',
        origin: 'contributor_external',
        category: 'standard',
        categoryLabel: 'Standard',
        sourceOrAuthor: 'Infra',
        version: '1.0',
        extractedClausesCount: 0,
        keyClauses: [],
        addedDate: '2026-01-01',
        lastUpdated: '2026-01-01',
        summary: 'Cluster Kubernetes',
        relatedSubjectIds: [],
        inducedRules: [
          {
            id: 'RULE-K8S-01',
            title: 'Plateforme Kubernetes',
            type: 'obligation',
            description: 'Socle bare-metal et orchestration Kubernetes.'
          }
        ]
      }
    ];
    const confronted = await confrontClausesSemantically(clauses, docs, [], encoder);
    expect(confronted[0].status).toBe('compliant');
    expect(confronted[0].matchedRuleId).toBe('RULE-K8S-01');
  });

  it('doctrineService : detectRecallsFromRulesAsync rapproche les règles par embeddings', async () => {
    const encoder = createWave2MockEncoder();
    const rules = [
      {
        id: 'P-001',
        title: 'Souveraineté des données',
        content: 'Hébergement qualifié SecNumCloud et localisation des données en Europe.',
        kind: 'principle'
      },
      {
        id: 'P-002',
        title: 'Orchestration Kubernetes',
        content: 'Déploiement sur cluster bare-metal.',
        kind: 'principle'
      }
    ];

    const recalls = await doctrineService.detectRecallsFromRulesAsync(
      'Conformité juridique RGPD et localisation des données souveraines',
      rules as any,
      encoder
    );
    expect(recalls.map((r) => r.id)).toContain('P-001');
  });

  it('knowledgeGraphSemanticMatcher : rapproche les actifs du snapshot par cosinus', async () => {
    const encoder = createWave2MockEncoder();
    const matches = await matchKnowledgeAssetsSemantically(
      'Plan de continuité PCA/PRA et reprise après sinistre en mode déconnecté',
      {
        assets: [
          { id: 'ADR-0010', title: 'Sauvegarde & Continuité', domain: 'resilience', kind: 'decision', status: 'validated', summary: '', tags: [] },
          { id: 'ADR-0020', title: 'Fédération IAM', domain: 'security', kind: 'decision', status: 'validated', summary: '', tags: [] }
        ],
        controls: [],
        applicability_index: {}
      } as any,
      encoder
    );

    expect(matches.get('ADR-0010')?.matchMode).toBe('semantic');
    expect(matches.get('ADR-0010')?.score).toBeGreaterThanOrEqual(0.95);
    expect(matches.has('ADR-0020')).toBe(false);
  });

  it('clauseMatching & inferLotFromText : zéro collision de sous-chaînes dans DomainsPicker et association exacte', () => {
    expect(isDomainInPack('orange-vendor', '3gpp')).toBe(false);
    expect(isDomainInPack('simple-ui', '3gpp')).toBe(false);
    expect(isDomainInPack('3gpp-core', '3gpp')).toBe(true);
    expect(isDomainInPack('cyber-security', 'security')).toBe(true);

    const matched = matchClausesToSubject(
      { name: 'Continuité', section_ref: '§4.2', coveredClauseRefs: ['REQ-99'] },
      [
        { clauseRef: 'REQ-99', title: 'Autre titre', text: 'Texte' },
        { clauseRef: '§1.1', title: 'Hors sujet', text: 'Autre' }
      ]
    );
    expect(matched.map((c) => c.clauseRef)).toEqual(['REQ-99']);
    expect(inferLotFromText('Sécurité TLS et NIS2')).toBe('LOT-04-SECOPS');
  });
});
