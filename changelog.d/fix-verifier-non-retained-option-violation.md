### Corrigé
- **Critère L2 → L3 « Vérificateur d’architecture passé » en multi-options (`src/lib/domain/maturityCriteria.ts`, `src/lib/server/projects/maturityCriteriaService.ts`, `src/lib/components/deliberation/SubjectThreadView.svelte`)** :
  - Une non-conformité détectée par `@verifier` sur une option concurrente (ou rejetée) ne bloque plus le passage au vert du critère tant qu'au moins une option candidate vérifiée est conforme (et que l'option retenue, lorsqu'une décision existe, ne présente pas de violation ouverte).
