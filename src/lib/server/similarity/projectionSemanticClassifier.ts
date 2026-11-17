/**
 * Résolution sémantique du patron architectural pour `artifactProjections.ts`
 * via `SemanticAnchorClassifier` (comparateur cosinus sur embeddings).
 */
import type { ArchitectureProjectionPattern } from '$lib/domain/artifactProjections';
import type { Encoder } from './encoder';
import { SemanticAnchorClassifier, tryResolveSemanticEncoder } from './semanticClassifier';

const projectionPatternClassifier = new SemanticAnchorClassifier<ArchitectureProjectionPattern>({
  telecom_crypto: {
    prototypes: [
      'Chiffrement périmétrique IPsec ESP en passerelle de sécurité et médiation de signalisation réseau chiffrée',
      'Perimeter IPsec ESP security gateway and encrypted core signaling mediation'
    ],
    lexicalPatterns: [/\b(ipsec\s+esp|diameter|chiffrement\s+p[ée]rim[ée]trique)\b/i]
  },
  active_active_geo: {
    prototypes: [
      'Architecture actif/actif géoredondante bi-site avec GSLB, routage multiple et arbitrage split-brain',
      'Geo-redundant active-active dual-site architecture with GSLB and split-brain quorum'
    ],
    lexicalPatterns: [/\b(actif[- /]*actif|g[eé]oredondan\w*|bi-site|dual[- ]site|split[- ]brain)\b/i]
  },
  edge_survivability: {
    prototypes: [
      'Survie locale en mode îlotage déconnecté, bulle autonome en périphérie en cas de coupure backhaul',
      'Local edge survivability in isolated island mode during backhaul outage'
    ],
    lexicalPatterns: [/\b(survie|[iî]lotage|isolated\s+island|mode\s+d[eé]connect[ée])\b/i]
  },
  lmr_interworking: {
    prototypes: [
      'Passerelle d’interconnexion hybride entre réseau radio historique et système haut débit critique',
      'Hybrid legacy radio to broadband critical communications interworking gateway'
    ],
    lexicalPatterns: [/\b(interworking|interconnexion\s+radio|passerelle\s+hybride)\b/i]
  },
  mcx_decoupling: {
    prototypes: [
      'Découplage canonique des services critiques voix et données sur cœur SIP et services communs',
      'Canonical decoupling of critical voice and data services over SIP core and common services'
    ],
    lexicalPatterns: [/\b(d[ée]couplage\s+canonique|sip\s+core|voix\s+critique)\b/i]
  },
  generic: {
    prototypes: [
      'Architecture logicielle standard avec console d’administration, supervision et connecteurs d’intégration',
      'Standard service architecture with admin console, observability and integration connectors'
    ]
  }
});

/**
 * Résout sémantiquement le patron de diagramme cible lorsque un encodeur réel est actif.
 * Retourne `undefined` si aucun encodeur réel n'est configuré ou si le score est insuffisant.
 */
export async function resolveProjectionPatternSemantically(
  specText: string,
  encoderOverride?: Encoder
): Promise<ArchitectureProjectionPattern | undefined> {
  const encoder = tryResolveSemanticEncoder(encoderOverride);
  if (!encoder || !specText.trim()) return undefined;

  const res = await projectionPatternClassifier.classify(specText, { encoder });
  if (res.label && res.zone !== 'none') {
    return res.label;
  }
  return undefined;
}
