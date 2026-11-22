# Métriques Générées du Dépôt — Archinex

> **Fichier généré automatiquement** par `npm run docs:metrics` (`scripts/generate-doc-metrics.mjs`).
> Ne pas modifier les chiffres à la main : exécuter `npm run docs:metrics` après ajout de tests, de règles OPA ou d'ADR.

---

## 1. Synthèse Qualité & Couverture

| Indicateur | Valeur mesurée | Source |
| :--- | ---: | :--- |
| Fichiers de tests Vitest (unitaires, contrat, intégration, API) | **229** | `tests/` (hors `tests/e2e/browser/`) |
| Cas de tests Vitest (`it` / `test`) | **1552** | `tests/` (hors `tests/e2e/browser/`) |
| Fichiers de parcours E2E Playwright | **6** | `tests/e2e/browser/` |
| Cas de tests E2E Playwright | **24** | `tests/e2e/browser/` |
| Politiques OPA / Rego v1 | **3** | `edp/policies/` |
| Règles d'évaluation OPA (`deny` / `violation` / `warn`) | **82** | `edp/policies/` |
| Décisions d'Architecture (ADR) | **5** | `docs/adr/` |

---

## 2. Détail des Politiques OPA / Rego

| Fichier de politique | Règles détectées |
| :--- | ---: |
| `edp/policies/multi_axis_refinement.rego` | 57 |
| `edp/policies/sylva_golden_rules.rego` | 18 |
| `edp/policies/twin_resilience.rego` | 7 |

---

## 3. Socle Ontologique de Référence (Fixture CI)

Mesuré sur `tests/fixtures/edp/ontology_export.json` :
- **Concepts HLD** : 0
- **Axes de raffinement (`kind: "axis"`)** : 0
- **Feuilles d'implémentation (`kind: "leaf"`)** : 0
- **Relations / Triplets** : 205
