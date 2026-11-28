### Correctif métriques ontologiques & comblement des écarts de couverture (P1)
- **Métriques documentaires (`scripts/generate-doc-metrics.mjs`, `docs/metrics.md`)** :
  - Prise en charge de `Object.values(raw.entities)` lorsque `raw.entities` est un dictionnaire URN → entité (format Hub 1.42) en plus du format tableau historique, et régénération de `docs/metrics.md` (6 concepts HLD, 45 axes, 63 feuilles, 207 triplets).
- **Tests & Couverture** :
  - Ajout des tests de contrat unitaires pour `connectors/writeBackContract.ts` (`tests/contract/write-back-contract.test.ts`).
  - Ajout des tests de contrat de rendu Svelte et contrôles Playwright pour `ComplianceCheckBanner.svelte` et `EditorialDiagramViewer.svelte` (`tests/contract/compliance-check-banner.test.ts`, `tests/contract/editorial-diagram-viewer.test.ts`, `tests/e2e/browser/deliberation-components-check.spec.ts`).
  - Ajout des tests de branches ciblés pour `src/lib/domain/rfpNarrativeAssembler.ts` (`tests/unit/rfp-narrative-assembler.test.ts`) et `src/lib/domain/edp/emergentColdStart.ts` (`tests/unit/emergent-cold-start.test.ts`).
  - Extension de `tests/contract/doc-links-and-metrics.test.ts` pour valider les deux formats `raw.entities` et la non-nullité des compteurs ontologiques.
