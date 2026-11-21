# Vues Éditoriales SVG Déterministes (Intégration `diagram-design`)

Ce module (`src/lib/domain/editorialSvg/`) transpose dans Archinex le système de design éditorial de [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design) (licence MIT) sous forme d'un **moteur de projection SVG 100 % déterministe**, intégré en parallèle de Mermaid dans `ArtifactRegenerationHub.svelte` et `ImpactGraphExplorer.svelte`.

## Architecture & Vues Implémentées

- **`tokens.ts`** : Rôles sémantiques (`paper`, `paper-2`, `ink`, `muted`, `soft`, `rule`, `rule-solid`, `accent`, `accent-tint`, `link`) en variantes `light`, `dark` et `full-editorial`. Ratio de contraste **WCAG AA ≥ 4.5:1** vérifié (`verifySkinContrast`). Mode `system` fonts par défaut (100 % hors-ligne).
- **`primitives.ts`** : Quantification stricte `snap4()` sur grille `4px`, connecteurs orthogonaux à coudes arrondis (`r=8` / `r=6`, zéro segment diagonal), boîtes hairline `1px` sans ombre à masque `paper` opaque, callouts éditoriaux de marge, enveloppe accessible (`role="img"`, `<title>` premier enfant, `<desc>` second enfant) et export `.html` autonome.
- **`dials.ts`** : Les **4 Cadrans** (`Skin`, `Size`, `Detail`, `Audience`) et le **Fidelity Ledger** documentant tout élément agrégé ou tronqué.
- **`traceableBlockTree.ts`** (#422) : Décomposition en blocs traçables TOGAF (`data-block-*`) + export sidecar `.registry.json` sans horodatage.
- **`requirementTraceability.ts`** (#420) : Matrice 4 colonnes **Source → Exigence → Satisfait par → Vérifié par** avec contrat explicite `data-trace-missing="true"` sur tout lien absent.
- **`architectureDelta.ts`** (#421) : Triptyque synchronisé **Before · Changes · After** sur grille `4px` partagée (stabilité des coordonnées `unchanged`, registre central `ADDED/REMOVED/CHANGED/MOVED/REWIRED`), branché dans `ImpactGraphExplorer.svelte`.
- **`pairedPolicyTraces.ts`** (#423) : Traces appariées d'évaluation de règles KB (`PASS`, `FAIL`, `SKIPPED`, `NOT_REACHED`, `UNVERIFIED` distinct de `PASS`) avec marqueur de **1re divergence**.
- **`compensatingLayers.ts`** (#423) : Empilement de couches de gouvernance et de sécurité compensatoires avec bandeau explicite de **risque résiduel**.
- **`decisionCardCharts.ts`** (#423) : Matrice thermique pondérée Options × Critères avec valeurs numériques explicites dans chaque cellule et callout d'arbitrage en marge.
- **`decisionRadar.ts`** (#423) : Radar multi-axes (3 à 6 critères) comparant la forme des compromis avec une unique série focale `accent` pour l'option retenue.
- **`lifecyclePhaseMap.ts`** (Patron §9) : Carte de cycle de vie de maturité L0–L5 avec rail principal, bande d'interruption/reprise (conflit épistémique, rétractation) et issues terminales (scellement L5, dérogation signée).
- **`deploymentSequenceSvg.ts`** (`type-sequence`) : Séquence d'homologation & déploiement (Arbitre → Archinex → KB/OPA → Nautobot) avec fragment combiné `ALT`.
- **`coverageUnitGrid.ts`** (`type-unit-grid`) : Grille discrète d'unités (1 tuile cliquable = 1 exigence) pour visualiser la complétude de dossiers de 10 à 120 exigences sans masquer les trous.
- **`recommender.ts` + `editorialRecommenderAgent.ts` + `POST /api/projects/[projectId]/subjects/[subjectId]/editorial-recommendations`** (#427) : **Directeur Éditorial** hybride (heuristique déterministe instantanée + enrichissement optionnel par `LocalLlmClient` avec validation stricte des `focalId` contre les IDs réels et protection `authorizeProjectAccess`).
- **`verifiers.ts` + `hldBundle.ts`** (#424) : Vérificateurs CI de géométrie (`4px`, orthogonalité, stabilité `Architecture Delta`, bijection du registre, contrat `data-trace-missing`, contraste WCAG AA, intégrité `.registry.json`) et empaquetage HLD (`.svg` + `.html` + `.registry.json` + embed Markdown).
