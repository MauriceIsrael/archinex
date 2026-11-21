# Réconciliation périodique Nautobot et vue « Dérive » (Issue #379)

Ce document décrit le mécanisme de **réconciliation périodique** par projet et la **vue « Dérive »** (Phase 5 · Consolidation + pastille dans l'en-tête), en complément du webhook HMAC réactif (#377) et du contrat de write-back des connecteurs (#399).

---

## 1. Principe directeur : jamais de vert par absence de données

Archinex distingue strictement trois postures (`evaluateDriftPosture` dans `src/lib/domain/edp/driftMetrics.ts`) :

| Posture | Condition exacte | Rendu |
|---|---|---|
| **`unverified`** (« Non vérifié ») | Aucune réconciliation réussie, dernière tentative en erreur ou Nautobot injoignable, ou dernière réconciliation réussie dépassant `staleThresholdSeconds`. | Ambre + icône `?` (**jamais vert**) |
| **`drift_detected`** (« Dérive détectée ») | Réconciliation fraîche réussie et au moins un `DriftFinding` ouvert ou une décision `stale`. | Rouge + icône alerte |
| **`no_drift`** (« Aucune dérive ») | Réconciliation fraîche réussie **et** 0 `DriftFinding` ouvert **et** 0 décision `stale`. | Vert + icône bouclier |

En cas de panne de Nautobot :
- le job passe l'état courant à `unverified`, incrémente `consecutiveFailures` et conserve intact `lastSuccessAt` ;
- aucun `DriftFinding` ouvert n'est fermé ;
- aucun objet de réalisation ne reste affiché « Réalisé prouvé » (tous basculent en `unverified`).

---

## 2. Job de réconciliation périodique (`reconciliationJob.ts`)

- **Persistance Prisma** :
  - `ProjectReconciliationState` (`project_reconciliation_states`) : intervalle configurable (`intervalSeconds`, défaut 300 s), seuil de péremption (`staleThresholdSeconds`, défaut 900 s), seuil de silence connecteur (`connectorSilentDays`, défaut 7 j), verrou atomique (`lockToken`, `lockedAt` avec TTL de 5 min), `lastAttemptAt`, `lastSuccessAt`, `lastStatus`, `consecutiveFailures`, `lastRealizationSnapshot`.
  - `ReconciliationRun` (`reconciliation_runs`) : historique des passes (`scheduled`, `manual`, `webhook_recovery`).
- **Idempotence** : `reconcileProject()` s'appuie sur `persistDriftFindings()` (déduplication par `(projectId, fingerprint)`) et résout automatiquement (`remediated` + `resolvedAt`) les écarts disparus uniquement lors d'une passe réussie.
- **Ordonnanceur** : `ReconciliationScheduler` démarre automatiquement dans `src/hooks.server.ts` hors environnement de test (désactivable via `RECONCILIATION_ENABLED=false`, intervalle par défaut via `RECONCILIATION_INTERVAL_SECONDS`).

---

## 3. État de réalisation (#399) et alimentation de la couverture (#402)

Le module pur `src/lib/domain/edp/realizationStatus.ts` évalue chaque objet planifié à partir des champs personnalisés Nautobot (`realized_status`, `realized_at`, `realized_revision`, `realized_by`, `evidence_ref`) :

- **`realized_proven`** : statut actif/réalisé **et** `evidence_ref` non vide **et** `realized_revision === revision` de l'EDP ;
- **`declared_unproven`** : statut actif/réalisé sans preuve ou avec révision divergente ;
- **`planned`** : objet planifié en attente d'exécution ;
- **`unverified`** : Nautobot injoignable, donnée périmée ou connecteur muet au-delà du seuil.

La fonction serveur `getProjectRealizationCoverage(projectId)` (`src/lib/server/edp/driftOverviewService.ts`) expose exactement cette même source de vérité pour la vue de couverture (#402).

---

## 4. API & Interface

- `GET /api/projects/[projectId]/drift` (`?includeResolved=true` optionnel) : retourne posture, ancienneté de dernière réconciliation, indicateurs (findings ouverts par sévérité, âge, délai moyen de détection, délai moyen de résolution, ratio « hors décision »), liste des écarts avec lien direct vers l'objet Nautobot, décisions `stale` et état de réalisation.
- `POST /api/projects/[projectId]/drift/reconcile` : lance une réconciliation immédiate (`trigger: 'manual'`) ou met à jour la configuration (`action: 'configure'`).
- **UI** :
  - Pastille dans `ProjectEngagementHeader.svelte` (`data-testid="header-drift-pill"`).
  - Vue complète `Phase5DriftView.svelte` (`data-testid="phase5-drift-view"`) intégrée dans `Phase5ConsolidationHub.svelte`.
  - Audit d'accessibilité automatisé (`@axe-core/playwright`) dans `tests/e2e/browser/drift-view-a11y.spec.ts`.
