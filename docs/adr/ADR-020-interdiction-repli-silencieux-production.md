# ADR-020 : Interdiction de Repli Silencieux en Production (Politique Fail-Closed)

- **Statut** : Accepté
- **Date** : 2026-11-22
- **Contexte** : Issues #141 (`JWT_SECRET`), #253 (Knowledge Hub souverain), #377 (détection de dérive Nautobot), garde-fous de conformité G3
- **Références** : `tests/contract/persistence-isolation-guard.test.ts`, `src/lib/server/edp/ontologyClient.ts`, `src/lib/server/doctrine/doctrineService.ts`, `src/lib/server/edp/opaRunner.ts`, [`docs/adr/ADR-017-nautobot-point-unique-reconciliation.md`](ADR-017-nautobot-point-unique-reconciliation.md)

---

## 1. Contexte et Problématique

Archinex est une **couche d'assurance de décision** utilisée sur des dossiers critiques (NIS2, ANSSI, réseaux télécoms critiques). Un repli silencieux vers des données factices (*mocks*), des fixtures de test, des valeurs par défaut ou un statut « conforme » en cas de panne d'une dépendance constitue une **fausse assurance dangereuse** :
- Une décision arbitrée alors que le Knowledge Hub est injoignable pourrait apparaître « conforme » sans qu'aucune règle d'entreprise n'ait été vérifiée.
- Un inventaire Nautobot indisponible pourrait afficher « 0 dérive » au lieu de « non vérifié ».
- Un serveur de production démarré avec un `JWT_SECRET` d'exemple compromettrait toutes les sessions.

---

## 2. Décision

Archinex applique une politique stricte d'**échec fermé (*fail-closed*)** et d'**interdiction de repli silencieux** sur l'ensemble des chemins critiques :

1. **Knowledge Hub LLMOps (`ontologyClient.ts`, `doctrineService.ts`)** :
   - Si un Hub est configuré (`hubUrl` / `LLMOPS_BASE_URL`) mais injoignable, une **erreur explicite** est levée (aucun repli silencieux vers les fixtures).
   - En production (`NODE_ENV=production`), l'absence de configuration du Hub interdit tout chargement de fixture de test ; le statut `offline: true` est propagé sans invention de règles.
   - Les fixtures scellées (`tests/fixtures/edp/ontology_export.json`, `llmops-sealed-snapshot.json`) sont réservées aux tests automatisés et au développement hors-ligne explicitement identifié.
2. **Arbitrage Porte G3 (`complianceCheck`)** :
   - Chaque arbitrage persiste un bloc `complianceCheck` (`checked` | `partial` | `not_checked`, `hubRevision`, `checkedAt`, `unassessedRuleIds[]`).
   - En état `not_checked` ou `partial`, l'arbitrage est **refusé** sauf dérogation explicite motivée, tracée dans le bundle et classée `Provisional` dans la matrice de conformité.
3. **Oracles OPA (`opaRunner.ts`)** :
   - L'indisponibilité du binaire OPA produit `unavailable` ; l'absence ou la vacuité des entrées produit `insufficient_input`. Aucun de ces deux états n'est jamais assimilé à `compliant`.
4. **Réconciliation Nautobot ([ADR-017](ADR-017-nautobot-point-unique-reconciliation.md))** :
   - Nautobot injoignable, connecteur muet ou donnée périmée produisent l'état **non vérifié**, jamais « aucune dérive ».
   - Le webhook `POST /api/webhooks/nautobot` refuse en échec fermé (`HTTP 401`) toute requête sans signature HMAC valide.
5. **Sécurité de session & démarrage (`JWT_SECRET`, comptes démo)** :
   - En production (`NODE_ENV=production`), le serveur refuse de démarrer si `JWT_SECRET` est absent, inférieur à 32 caractères ou égal à une valeur publique d'exemple (#141).
   - Le conteneur de production ne sème jamais de comptes de démonstration à mots de passe publics (`docs/fresh-install.md` §3 bis).

---

## 3. Alternatives Écartées

- **Dégradation silencieuse sur fixtures locales en production** : masque les pannes d'infrastructure derrière de fausses validations de conformité.
- **Marquer « conforme par défaut » lorsqu'un service externe ne répond pas** : inacceptable dans une plateforme d'assurance d'architecture.

---

## 4. Conséquences

### Positives
- Toute absence de preuve (Hub hors-ligne, OPA absent, Nautobot muet) est visible, tracée et opposable.
- Couverture directe par les tests contractuels (`tests/contract/persistence-isolation-guard.test.ts` et suites d'arbitrage/EDP).

### Négatives & Mitigations
- Expérience plus stricte lors de l'installation initiale (exigence de configuration `JWT_SECRET`, OPA, Hub) : mitigée par la documentation claire de démarrage rapide (`README.md`, `docs/fresh-install.md`) et le comportement de développement local explicitement distingué de `NODE_ENV=production`.
