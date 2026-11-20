### Correctif du rendu des fragments HLD en phase 3 (`Cannot read properties of undefined (reading 'replace')`)
- **Chargement du fragment HLD (`src/lib/server/projects/hldFragmentDb.ts`)** :
  - Propagation de `axisUrn` (avec repli sur `slotId` / `urn` / `axisTitle`) et des métadonnées associées lors du mapping des `decisionSlots` et `ontologyAxes` issus de `refinementCoverage` de l'EDP.
- **Projections Mermaid & Rendu Markdown (`src/lib/domain/artifactProjections.ts`, `src/lib/domain/hldFragment.ts`)** :
  - Sécurisation de `safeMmdId`, de la clé d'axe dans `buildMultiAxisTargetArchitectureDiagram`, de `cell()` et de `decision.rationale` contre les valeurs `undefined` ou `null`.
- **Tests** :
  - Ajout d'un test de non-régression dans `tests/contract/hld-fragment.test.ts`.
