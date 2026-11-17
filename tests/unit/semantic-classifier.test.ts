import { describe, expect, it, vi } from 'vitest';
import type { Encoder } from '$lib/server/similarity/encoder';
import {
  SemanticAnchorClassifier,
  classifyConfidenceZone,
  cosineSimilarity,
  matchEntitiesSemantically
} from '$lib/server/similarity/semanticClassifier';

/**
 * Encodeur sémantique déterministe de test : projette des concepts (même formulés
 * avec des synonymes différents) dans un espace vectoriel 4D orthogonal.
 */
function createConceptMockEncoder(): { encoder: Encoder; encodeSpy: ReturnType<typeof vi.fn> } {
  const encodeFn = vi.fn(async (text: string): Promise<number[]> => {
    const t = text.toLowerCase();
    // [sécurité/blocage, réseau/latence, stockage/données, conformité/audit]
    const v = [0, 0, 0, 0];
    if (/s[ée]curit[ée]|chiffr|zero-trust|authentification|mfa|secnumcloud|confidentialit[ée]/.test(t)) {
      v[0] += 1;
    }
    if (/bloqu|incompatibilit[ée] majeure|suspendre|arr[êe]t|critique|emp[êe]che/.test(t)) {
      v[0] += 0.9;
    }
    if (/r[ée]seau|latence|bande passante|routage|ipsec|vlan|connectivit[ée]/.test(t)) {
      v[1] += 1;
    }
    if (/stockage|base de donn[ée]es|persistance|sauvegarde|postgres|ceph|s3/.test(t)) {
      v[2] += 1;
    }
    if (/conformit[ée]|audit|r[ée]glementaire|nis2|rgpd|anssi|homologation/.test(t)) {
      v[3] += 1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return norm > 0 ? v.map((x) => x / norm) : [0.25, 0.25, 0.25, 0.25];
  });

  return {
    encodeSpy: encodeFn,
    encoder: {
      model: 'mock-bge-m3',
      version: async () => 'v1-test',
      encode: encodeFn
    }
  };
}

describe('SemanticClassifier & SemanticEntityMatcher', () => {
  it('calcule correctement la similarité cosinus et gère les cas limites', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it('classe les zones de confiance selon les seuils calibrés', () => {
    expect(classifyConfidenceZone(0.85)).toBe('strong');
    expect(classifyConfidenceZone(0.70)).toBe('possible');
    expect(classifyConfidenceZone(0.50)).toBe('none');
  });

  it('classe un texte synonyme via SemanticAnchorClassifier et met en cache les prototypes', async () => {
    const { encoder, encodeSpy } = createConceptMockEncoder();
    const classifier = new SemanticAnchorClassifier<'network' | 'storage' | 'compliance'>({
      network: {
        prototypes: ['Connectivité réseau, routage IP et maîtrise de la latence'],
        lexicalPatterns: [/\b(réseau|latence|routage)\b/i]
      },
      storage: {
        prototypes: ['Base de données, stockage persistant et sauvegarde'],
        lexicalPatterns: [/\b(stockage|base de données|sauvegarde)\b/i]
      },
      compliance: {
        prototypes: ['Conformité réglementaire, audit ANSSI et homologation'],
        lexicalPatterns: [/\b(conformité|audit|homologation)\b/i]
      }
    });

    // Formulation sans le mot "stockage" ni "base de données" (utilise "postgres" et "persistance")
    const res1 = await classifier.classify('Persistance transactionnelle sur cluster Postgres', {
      encoder
    });
    expect(res1.matchMode).toBe('semantic');
    expect(res1.label).toBe('storage');
    expect(res1.zone).toBe('strong');
    expect(res1.score).toBeGreaterThanOrEqual(0.95);

    const callsAfterFirst = encodeSpy.mock.calls.length;
    // 3 prototypes + 1 requête = 4 appels
    expect(callsAfterFirst).toBe(4);

    // Second appel : les prototypes sont en cache, seul le texte requête est encodé
    const res2 = await classifier.classify('Bande passante et tunnel IPsec inter-sites', {
      encoder
    });
    expect(res2.label).toBe('network');
    expect(encodeSpy.mock.calls.length).toBe(callsAfterFirst + 1);
  });

  it('bascule explicitement en lexical-fallback lorsque aucun encodeur sémantique réel est actif', async () => {
    const classifier = new SemanticAnchorClassifier<'blocking' | 'normal'>({
      blocking: {
        prototypes: ['Question bloquante empêchant la validation'],
        lexicalPatterns: [/\bbloqu\w*\b/i, /\bemp[êe]ch\w*\b/i]
      },
      normal: {
        prototypes: ['Précision mineure ou information complémentaire'],
        lexicalPatterns: [/\bpr[ée]cision\b/i]
      }
    });

    const res = await classifier.classify('Point bloquant sur le chiffrement des flux');
    expect(res.matchMode).toBe('lexical-fallback');
    expect(res.label).toBe('blocking');
  });

  it('rapproche des entités dynamiques via matchEntitiesSemantically en réutilisant les vecteurs pré-calculés', async () => {
    const { encoder } = createConceptMockEncoder();
    const candidates = [
      {
        item: { id: 'leaf-net' },
        text: 'Connectivité réseau et latence',
        vector: [0, 1, 0, 0] // vecteur pré-calculé
      },
      {
        item: { id: 'leaf-audit' },
        text: 'Audit de conformité réglementaire',
        vector: [0, 0, 0, 1]
      },
      {
        item: { id: 'leaf-db' },
        text: 'Stockage objet S3 et sauvegarde'
      }
    ];

    const matches = await matchEntitiesSemantically('Homologation ANSSI et conformité NIS2', candidates, {
      encoder,
      threshold: 0.65,
      topK: 2
    });

    expect(matches.length).toBe(1);
    expect(matches[0].item.id).toBe('leaf-audit');
    expect(matches[0].matchMode).toBe('semantic');
    expect(matches[0].score).toBeGreaterThanOrEqual(0.95);
  });
});
