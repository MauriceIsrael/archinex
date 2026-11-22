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

---

## Cartographie d'Usage : Quel diagramme, à quel endroit, pour quelle question ?

Pour éviter à la fois les murs de texte illisibles et les schémas décoratifs sans valeur probante, Archinex positionne chaque famille de diagramme déterministe à l'endroit exact où une question d'architecture complexe doit être tranchée ou démontrée :

| Phase / Section du Mémoire RFP | Diagramme Déterministe Utilisé | Source & Moteur | Question d'Architecture Éclairée |
| :--- | :--- | :--- | :--- |
| **Phase 1 · Corpus & Vagues Q&R** *(Section 1 & Section 3 RFP)* | **Grille d'Unités de Couverture** (`coverage-unit-grid` SVG) & **Graphe d'Impact Q&R** (`buildQaAmendmentsImpactMermaid`) | `coverageUnitGrid.ts` / `rfpNarrativeAssembler.ts` | *Avons-nous couvert 100 % des clauses du CCTP et quelles décisions sont remises en cause par la dernière vague de Q&R acheteur ?* |
| **Phase 2 · Délibération & Porte G3** *(Section 2 RFP & `DecisionCard`)* | **Radar Multi-Critères** (`decision-radar` SVG), **Matrice Thermique** (`decision-heatmap` SVG), **Traces KB Appariées** (`paired-policy-traces` SVG) & **Schéma Causal de Décision** (`DecisionDiagramModel` Mermaid) | `decisionRadar.ts`, `decisionCardCharts.ts`, `pairedPolicyTraces.ts`, `decisionDiagramModel.ts` | *Pourquoi l'option retenue domine-t-elle les alternatives, sur quelle règle doctrinale KB diverge-t-elle, et quelles exigences couvre-t-elle ?* |
| **Phase 2/3 · Dérogations & Risque Résiduel** *(Porte G3 & HLD)* | **Couches Compensatoires** (`compensating-layers` SVG) & **Carte de Cycle de Vie L0–L5** (`lifecyclePhaseMap.ts` SVG) | `compensatingLayers.ts`, `lifecyclePhaseMap.ts` | *Lorsqu'une réserve ou dérogation est acceptée, quelles barrières (Conception, CI, Nautobot, Runtime) compensent le risque résiduel ?* |
| **Phase 3 · Rendu HLD & Interfaces Multi-Lots** *(Section 3 & Section 4 RFP)* | **Matrice 4 Colonnes de Traçabilité** (`requirement-traceability` SVG), **Arbre de Blocs TOGAF** (`traceable-blocks` SVG), **Topologie des Frontières Inter-Lots** (`buildInterLotBoundariesMermaid`), **C4X / Structurizr DSL / SysML v2** | `requirementTraceability.ts`, `traceableBlockTree.ts`, `rfpNarrativeAssembler.ts`, `c4xDsl.ts`, `structurizrDsl.ts` | *Chaque exigence est-elle reliée à une brique et une preuve ? Les frontières entre lots (ex. Réseau ↔ Applicatif) sont-elles cosignées des deux côtés ?* |
| **Phase 4 · Raffinement KAOS, CMDB Planned & FinOps** *(Section 5 RFP)* | **Séquence d'Homologation** (`deploymentSequenceSvg.ts` SVG) & **Arbre Capacitaire FinOps BOM** (`buildFinOpsBomMermaid`) | `deploymentSequenceSvg.ts`, `rfpNarrativeAssembler.ts`, `finopsBom.ts` | *Quel est le dimensionnement exact en `Planned-Capacity` (serveurs, composants, U de baie, kW) et comment se décompose le TCO / CAPEX / OPEX ?* |
| **Phase 5 · Consolidation Multi-DC & Réconciliation Nautobot** *(Section 5 RFP & `Phase5DriftView`)* | **3 Vues Mermaid Synchronisées** (**5.2 Vue Logique**, **5.3 Vue Déploiement Multi-DC → Pool → Tenant**, **5.4 Vue Physique / CMDB**) & **Triptyque Architecture Delta** (`architecture-delta` SVG *Before · Changes · After*) | `logicalViews.ts` (`composeProjectLogicalTopology`), `architectureDelta.ts` | *Comment les composants logiques se projettent-ils sur les datacenters et pools matériels, et quels écarts (`ADDED/REMOVED/CHANGED`) existent entre l'intention scellée et Nautobot ?* |

