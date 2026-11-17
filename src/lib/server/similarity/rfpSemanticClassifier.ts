/**
 * Classification et confrontation sémantique des clauses RFP via `SemanticAnchorClassifier`
 * et `matchEntitiesSemantically` (comparateur cosinus sur embeddings).
 */
import type { CorpusDocument, ExtractedClause } from '$lib/domain/corpus';
import {
  confrontClausesWithKnowledgeBase,
  inferLotFromText,
  type ClauseConfrontation
} from '$lib/domain/rfpConfrontation';
import type { ArchitectRole, Statement } from '$lib/types/epistemic';
import type { Encoder } from './encoder';
import {
  SemanticAnchorClassifier,
  matchEntitiesSemantically,
  tryResolveSemanticEncoder,
  type MatchMode
} from './semanticClassifier';

const criticalityClassifier = new SemanticAnchorClassifier<'bloquant' | 'majeur' | 'info'>({
  bloquant: {
    prototypes: [
      'Exigence impérative et strictement obligatoire sous peine de rejet ou non-conformité bloquante',
      'Mandatory strict requirement, strictly forbidden, critical availability or sovereignty constraint'
    ],
    lexicalPatterns: [
      /\b(doit\s+obligatoirement|imp[ée]ratif|formellement\s+interdit|bloquant|secnumcloud|shall\s+not|24[x×]7)\b/i
    ]
  },
  majeur: {
    prototypes: [
      'Exigence fonctionnelle ou technique attendue que la solution doit satisfaire',
      'Standard requirement that the proposed system must or shall support'
    ],
    lexicalPatterns: [/\b(doit|exige|n[ée]cessite|requis|shall|must|requires)\b/i]
  },
  info: {
    prototypes: [
      'Contexte informatif, présentation générale ou souhait indicatif non contraignant',
      'Informational background or optional context without mandatory constraint'
    ]
  }
});

const architectRoleClassifier = new SemanticAnchorClassifier<
  'security_architect' | 'infra_expert_architect' | 'lead_architect'
>({
  security_architect: {
    prototypes: [
      'Sécurité des systèmes, chiffrement, PKI, gestion des identités IAM, conformité ANSSI, NIS2 et zéro-trust',
      'Cybersecurity, cryptography, identity management, compliance audit and zero-trust hardening'
    ],
    lexicalPatterns: [/\b(s[ée]curit[ée]|chiffr\w*|certifi\w*|zero[- ]trust|iam|pki|hsm|anssi|nis2)\b/i]
  },
  infra_expert_architect: {
    prototypes: [
      'Infrastructure système, réseau IP, latence, virtualisation, Kubernetes, matériel et stockage persistant',
      'Infrastructure engineering, networking, low latency, compute clusters, hardware and storage'
    ],
    lexicalPatterns: [/\b(r[ée]seau|infra\w*|mat[ée]riel|latence|stockage|compute|kubernetes|k8s)\b/i]
  },
  lead_architect: {
    prototypes: [
      'Gouvernance globale d’architecture, urbanisme applicatif, intégration transverse et trajectoire projet',
      'Enterprise architecture governance, cross-cutting integration and solution roadmap'
    ]
  }
});

const lotClassifier = new SemanticAnchorClassifier<
  'LOT-01-SOUV' | 'LOT-02-INFRA' | 'LOT-03-TELCO' | 'LOT-04-SECOPS' | 'LOT-05-RESIL'
>({
  'LOT-01-SOUV': {
    prototypes: [
      'Souveraineté numérique, hébergement qualifié SecNumCloud, localisation des données et conformité juridique',
      'Digital sovereignty, qualified sovereign cloud hosting, data residency and legal compliance'
    ],
    lexicalPatterns: [/\b(souv\w*|secnum\w*|juridique|rgpd)\b/i]
  },
  'LOT-02-INFRA': {
    prototypes: [
      'Infrastructure socle, serveurs bare-metal, clusters Kubernetes, virtualisation et stockage',
      'Core infrastructure, bare-metal servers, Kubernetes orchestration and storage'
    ],
    lexicalPatterns: [/\b(infra\w*|bare[- ]?metal|k8s|kubernetes|serveur\w*|compute)\b/i]
  },
  'LOT-03-TELCO': {
    prototypes: [
      'Télécommunications, cœur réseau 4G/5G, connectivité radio, synchronisation temporelle et routage WAN',
      'Telecommunications, mobile core, radio access, timing synchronization and WAN routing'
    ],
    lexicalPatterns: [/\b(telco|synchro\w*|upf|radio|5g|r[ée]seau|wan)\b/i]
  },
  'LOT-04-SECOPS': {
    prototypes: [
      'Cybersécurité opérationnelle, chiffrement des flux, PKI, IAM, bastion, SIEM et conformité NIS2',
      'Security operations, encryption, PKI, IAM, SIEM monitoring and NIS2 compliance'
    ],
    lexicalPatterns: [/\b(sec\w*|chiffr\w*|nis2|cert\w*|iam|pki|siem)\b/i]
  },
  'LOT-05-RESIL': {
    prototypes: [
      'Résilience en mode déconnecté, continuité d’activité PCA/PRA, sauvegarde et reprise après sinistre',
      'Disconnected mode resilience, business continuity, backup and disaster recovery'
    ],
    lexicalPatterns: [/\b(r[ée]sil\w*|d[ée]connect[ée]|continuit[ée]|sauvegarde|reprise|pca|pra)\b/i]
  }
});

export async function classifyClauseCriticalitySemantically(
  text: string,
  encoderOverride?: Encoder
): Promise<{ criticality: 'bloquant' | 'majeur' | 'info'; matchMode: MatchMode }> {
  const res = await criticalityClassifier.classify(text, { encoder: encoderOverride });
  return {
    criticality: res.label ?? 'info',
    matchMode: res.matchMode
  };
}

export async function classifyArchitectRoleSemantically(
  text: string,
  encoderOverride?: Encoder
): Promise<{ role: ArchitectRole; matchMode: MatchMode }> {
  const res = await architectRoleClassifier.classify(text, { encoder: encoderOverride });
  return {
    role: res.label ?? 'lead_architect',
    matchMode: res.matchMode
  };
}

export async function inferLotSemantically(
  text: string,
  encoderOverride?: Encoder
): Promise<{ lotId: string; matchMode: MatchMode }> {
  const encoder = tryResolveSemanticEncoder(encoderOverride);
  if (encoder && text.trim()) {
    const res = await lotClassifier.classify(text, { encoder });
    if (res.label && res.zone !== 'none') {
      return { lotId: res.label, matchMode: res.matchMode };
    }
  }
  return {
    lotId: inferLotFromText(text),
    matchMode: 'lexical-fallback'
  };
}

/**
 * Confronte des clauses RFP au patrimoine existant par comparateur cosinus sur embeddings
 * lorsque un encodeur réel est actif, avec repli vers `confrontClausesWithKnowledgeBase()`.
 */
export async function confrontClausesSemantically(
  clauses: ExtractedClause[],
  corpusDocuments: CorpusDocument[],
  existingStatements: Statement[],
  encoderOverride?: Encoder
): Promise<ClauseConfrontation[]> {
  const encoder = tryResolveSemanticEncoder(encoderOverride);
  if (!encoder) {
    return confrontClausesWithKnowledgeBase(clauses, corpusDocuments, existingStatements).confrontations;
  }

  type KbCandidate =
    | { kind: 'rule'; doc: CorpusDocument; ruleId: string; ruleTitle: string }
    | { kind: 'keyClause'; doc: CorpusDocument; kcTitle: string; kcRef: string }
    | { kind: 'keyIdea'; doc: CorpusDocument }
    | { kind: 'statement'; stmt: Statement };

  const candidates: Array<{ item: KbCandidate; text: string }> = [];
  for (const doc of corpusDocuments) {
    for (const rule of doc.inducedRules || []) {
      candidates.push({
        item: { kind: 'rule', doc, ruleId: rule.id, ruleTitle: rule.title },
        text: `${rule.title}. ${rule.description}`
      });
    }
    for (const kc of doc.keyClauses || []) {
      candidates.push({
        item: { kind: 'keyClause', doc, kcTitle: kc.title, kcRef: kc.clauseRef },
        text: `${kc.title}. ${kc.text}`
      });
    }
    for (const idea of doc.keyIdeas || []) {
      candidates.push({
        item: { kind: 'keyIdea', doc },
        text: idea
      });
    }
  }
  for (const stmt of existingStatements) {
    candidates.push({
      item: { kind: 'statement', stmt },
      text: `${stmt.triplet.subject} ${stmt.triplet.predicate} ${String(stmt.triplet.value)}`
    });
  }

  const results: ClauseConfrontation[] = [];
  for (const clause of clauses) {
    const clauseText = `${clause.title}. ${clause.text}`;
    const matches = await matchEntitiesSemantically(clauseText, candidates, {
      encoder,
      threshold: 0.72,
      topK: 1
    });

    if (matches.length > 0) {
      const hit = matches[0];
      const base = {
        id: `conf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        clauseRef: clause.clauseRef,
        title: clause.title,
        text: clause.text,
        criticality: clause.criticality,
        status: 'compliant' as const,
        confidence: hit.score
      };

      if (hit.item.kind === 'rule') {
        results.push({
          ...base,
          matchedDocumentId: hit.item.doc.id,
          matchedDocumentTitle: hit.item.doc.title,
          matchedRuleId: hit.item.ruleId,
          rationale: `Rapprochement sémantique (${Math.round(hit.score * 100)}%) avec la règle "${hit.item.ruleTitle}" de "${hit.item.doc.title}".`,
          suggestedRole: 'infra_expert_architect',
          proposedEpistemicAction: 'Rattacher à la règle existante sans surcoût.'
        });
        continue;
      }
      if (hit.item.kind === 'keyClause') {
        results.push({
          ...base,
          matchedDocumentId: hit.item.doc.id,
          matchedDocumentTitle: hit.item.doc.title,
          rationale: `Rapprochement sémantique (${Math.round(hit.score * 100)}%) avec "${hit.item.kcTitle}" (${hit.item.kcRef}).`,
          suggestedRole: 'infra_expert_architect',
          proposedEpistemicAction: 'Réutiliser la solution technique éprouvée.'
        });
        continue;
      }
      if (hit.item.kind === 'keyIdea') {
        results.push({
          ...base,
          matchedDocumentId: hit.item.doc.id,
          matchedDocumentTitle: hit.item.doc.title,
          rationale: `Aligné sémantiquement (${Math.round(hit.score * 100)}%) avec "${hit.item.doc.title}".`,
          suggestedRole: 'lead_architect',
          proposedEpistemicAction: 'Validation formelle L3.'
        });
        continue;
      }
      results.push({
        ...base,
        rationale: `Déjà résolu sémantiquement (${Math.round(hit.score * 100)}%) par l'énoncé ${hit.item.stmt.id}.`,
        suggestedRole: (hit.item.stmt.authority.role as ArchitectRole) || 'lead_architect',
        proposedEpistemicAction: 'Héritage immédiat de la décision L3.'
      });
      continue;
    }

    // Aucun match sémantique >= 0.72 -> repli individuel (risques / écart + rôle sémantique)
    const fallback = confrontClausesWithKnowledgeBase([clause], corpusDocuments, existingStatements).confrontations[0];
    if (fallback && fallback.status === 'gap') {
      const roleRes = await classifyArchitectRoleSemantically(clauseText, encoder);
      fallback.suggestedRole = roleRes.role;
    }
    if (fallback) results.push(fallback);
  }

  return results;
}
