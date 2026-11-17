/**
 * Résolution sémantique de domaine TOGAF et rapprochement de briques d'architecture
 * par comparateur cosinus sur embeddings (`SemanticAnchorClassifier` & `matchEntitiesSemantically`),
 * avec repli explicite sur `resolveTogafDomain` / `matchReferenceBuildingBlock` si aucun encodeur réel n'est actif.
 */
import {
  TOGAF_REFERENCE_BUILDING_BLOCKS,
  matchReferenceBuildingBlock,
  resolveTogafDomain,
  type ReferenceBuildingBlock,
  type TogafDomainId
} from '$lib/domain/edp/togafTaxonomy';
import type { Encoder } from './encoder';
import {
  SemanticAnchorClassifier,
  matchEntitiesSemantically,
  tryResolveSemanticEncoder,
  type MatchMode
} from './semanticClassifier';

const togafDomainClassifier = new SemanticAnchorClassifier<TogafDomainId>({
  'security-trust': {
    prototypes: [
      'Sécurité, chiffrement, PKI, HSM, gestion des identités IAM, bastion PAM, zéro-trust et homologation ANSSI',
      'Security, cryptography, key management, identity access management and compliance hardening'
    ],
    lexicalPatterns: [/\b(sec|security|securite|sécurité|pki|hsm|iam|cyber|crypto|secops|zero-trust)\b/i]
  },
  'network-connectivity': {
    prototypes: [
      'Connectivité réseau, routage IP, VLAN, pare-feu, VPN IPsec, WAN, télécoms et proxy',
      'Network connectivity, routing, switching, firewall, IPsec VPN, WAN and telecom core'
    ],
    lexicalPatterns: [/\b(net|network|reseau|réseau|telco|proxy|wan|lan|sdwan|vlan|ipsec)\b/i]
  },
  'data-persistence': {
    prototypes: [
      'Stockage persistant, base de données SQL/NoSQL, stockage objet S3, sauvegarde et réplication',
      'Data persistence, relational database, object storage, backup and disaster recovery'
    ],
    lexicalPatterns: [/\b(stor|storage|stockage|data|donnees|données|backup|sauvegarde|db|database|sql)\b/i]
  },
  'facilities-sovereignty': {
    prototypes: [
      'Hébergement physique, datacenters bi-sites, souveraineté SecNumCloud, énergie et synchronisation temporelle de précision',
      'Physical facilities, sovereign cloud hosting, power redundancy and precision time synchronization'
    ],
    lexicalPatterns: [/\b(facil|facilities|power|energie|énergie|sovereign|souverain|secnumcloud|time|gnss)\b/i]
  },
  'application-business': {
    prototypes: [
      'Applications métier, services cartographiques, voix critique, portails et APIs applicatives',
      'Business applications, mapping services, mission-critical communications and domain APIs'
    ],
    lexicalPatterns: [/\b(app|application|gis|carto|sig)\b/i]
  },
  'platform-compute': {
    prototypes: [
      'Plateforme de calcul, Kubernetes, virtualisation KVM, serveurs bare-metal, conteneurs et orchestration',
      'Compute platform, Kubernetes orchestration, hypervisors, bare-metal servers and container runtime'
    ],
    lexicalPatterns: [/\b(infra|infrastructure|plat|platform|plateforme|compute|k8s|kubernetes|cloud|baremetal)\b/i]
  },
  'operations-observability': {
    prototypes: [
      'Supervision, observabilité, métrologie, logs SIEM, alertes, exploitation NOC/SOC et déploiement continu',
      'Operations, observability, monitoring, metrics, centralized logging, alerting and continuous deployment'
    ],
    lexicalPatterns: [/\b(ops|observ|supervis|monit|siem|syslog|télémétrie|exploitation|noc|soc)\b/i]
  }
});

export async function resolveTogafDomainSemantically(
  text: string,
  rawDomainOrCategory?: string | null,
  encoderOverride?: Encoder
): Promise<{ domain: TogafDomainId; matchMode: MatchMode; score: number }> {
  if (rawDomainOrCategory && rawDomainOrCategory.trim()) {
    const direct = resolveTogafDomain(rawDomainOrCategory);
    if (direct !== 'operations-observability' || /ops|observ|supervis|monit|explo/i.test(rawDomainOrCategory)) {
      return { domain: direct, matchMode: 'lexical-fallback', score: 1 };
    }
  }

  const encoder = tryResolveSemanticEncoder(encoderOverride);
  if (encoder && text.trim()) {
    const res = await togafDomainClassifier.classify(text, { encoder });
    if (res.label) {
      return { domain: res.label, matchMode: res.matchMode, score: res.score };
    }
  }

  return {
    domain: resolveTogafDomain(rawDomainOrCategory || text),
    matchMode: 'lexical-fallback',
    score: 0
  };
}

export async function matchBuildingBlockSemantically(
  text: string,
  rawCategoryOrDomain?: string,
  encoderOverride?: Encoder
): Promise<{ block: ReferenceBuildingBlock | undefined; matchMode: MatchMode; score: number }> {
  const encoder = tryResolveSemanticEncoder(encoderOverride);
  if (encoder && text.trim()) {
    const candidates = TOGAF_REFERENCE_BUILDING_BLOCKS.map((b) => ({
      item: b,
      text: `${b.title}. ${b.rationale} ${b.keywords.join(', ')}`
    }));
    const matches = await matchEntitiesSemantically(text, candidates, {
      encoder,
      threshold: 0.65,
      topK: 1
    });
    if (matches.length > 0) {
      return { block: matches[0].item, matchMode: 'semantic', score: matches[0].score };
    }
  }

  const fallback = matchReferenceBuildingBlock(text, rawCategoryOrDomain);
  return {
    block: fallback,
    matchMode: 'lexical-fallback',
    score: fallback ? 0.7 : 0
  };
}
