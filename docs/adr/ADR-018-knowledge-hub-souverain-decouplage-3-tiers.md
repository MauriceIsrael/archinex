# ADR-018 : Découplage en 3 Tiers et Knowledge Hub Souverain (LLMOps)

- **Statut** : Accepté
- **Date** : 2026-11-22
- **Contexte** : Lot A6/A7, issues #252 (découplage persistance / code) et #253 (Knowledge Hub source de vérité)
- **Références** : [`ARCHITECTURE.md`](../../ARCHITECTURE.md), [`docs/hub-parity.md`](../hub-parity.md), `tests/contract/persistence-isolation-guard.test.ts`

---

## 1. Contexte et Problématique

Dans les premières itérations d'Archinex, le dépôt Git contenait simultanément le code du moteur applicatif, des fichiers d'état locaux (bases SQLite, résultats d'évaluation `eval-results/`, projets utilisateurs dans `projects/`) et des copies locales de la doctrine d'entreprise. Ce couplage posait trois risques majeurs :
1. **Pollution du dépôt applicatif** : fuites de données projets, conflits Git sur des binaires SQLite et impossibilité de livrer un conteneur *stateless*.
2. **Double source de vérité doctrinale** : si chaque instance Archinex maintient sa propre copie de l'ontologie ou des règles, la doctrine d'entreprise diverge immédiatement entre projets.
3. **Usurpation ou perte de traçabilité d'identité** : un jeton technique partagé sans propagation de l'acteur humain empêche d'appliquer la séparation des tâches (auteur ≠ relecteur) et le contrôle par domaine possédé (`ownedDomains`).

---

## 2. Décision

Le système est découpé en **trois tiers strictement étanches** :

1. **Dépôt applicatif `archinex` (Moteur Logiciel *Stateless*)** :
   - Porte uniquement le code source SvelteKit/TypeScript, les oracles Rego génériques, les scripts de vérification et des fixtures anonymisées dans `tests/fixtures/` réservées aux tests unitaires et contractuels.
   - Exclut par `.gitignore` et par garde-fou contractuel (`tests/contract/persistence-isolation-guard.test.ts`) tout fichier `*.db`, `*.sqlite`, `eval-results/` et tout projet utilisateur hors `projects/000-global/`.
2. **Couche de Persistance Runtime (Base Prisma)** :
   - Stocke l'état vivant des projets, utilisateurs, délibérations, décisions, votes, EDP et `DriftFinding` (SQLite en développement local, PostgreSQL en production).
   - Aucun commit Git n'est jamais émis pour persister l'état d'un projet utilisateur.
3. **Knowledge Hub Souverain (`LLMOps`)** :
   - Service et dépôt séparés (`MauriceIsrael/LLMOps`) constituant l'unique autorité sur la doctrine d'entreprise, les référentiels réglementaires, l'ontologie SI/Telco, le registre des propriétaires (`owners`) et les portes G5–G7.
   - **Consommation prioritaire** : `src/lib/server/edp/ontologyClient.ts` (`GET /api/knowledge/ontology/export`) et `src/lib/server/doctrine/doctrineService.ts` (`GET /api/knowledge/context`) interrogent systématiquement le Hub en priorité.
   - **Capitalisation *stateless* (Porte G4)** : `src/lib/server/projects/capitalizationDb.ts` transmet les candidats via `POST /api/knowledge/candidates` sans écriture locale sur disque.
   - **Propagation d'identité souveraine** : chaque appel expert propage l'en-tête HTTP `X-Actor-Email` ; le jeton de service `LLMOPS_AUTH_TOKEN` reste confiné côté serveur et n'est jamais exposé au navigateur.

---

## 3. Alternatives Écartées

- **Embarquer la doctrine et l'ontologie dans `archinex` (monorepo couplé)** : impossible de gouverner la doctrine indépendamment du cycle de release de l'application ou de la partager avec d'autres outils d'entreprise.
- **Persister les projets dans Git** : inadapté aux mises à jour concurrentes multi-utilisateurs, au contrôle d'accès fin Casbin et à la confidentialité des dossiers clients.

---

## 4. Conséquences

### Positives
- Livraison *stateless* en conteneur (Cloud Run / Kubernetes) sans état local caché.
- Autorité doctrinale unique et auditable entre tous les projets (boucle fermée G4 → G5 → G6 → G7 → synchronisation ontologique).
- Traçabilité nominative de chaque action experte (`X-Actor-Email`) et séparation stricte auteur / relecteur.

### Négatives & Mitigations
- Dépendance réseau au Knowledge Hub : mitigée par le cache mémoire *singleflight* en lecture (`src/lib/server/llmops/client.ts`) et par la politique d'échec fermé explicite en production ([ADR-020](ADR-020-interdiction-repli-silencieux-production.md)).
- Contrat d'API inter-services à maintenir : verrouillé par les suites de contrat `tests/contract/llmops-live*.test.ts` et le suivi de parité [`docs/hub-parity.md`](../hub-parity.md).
