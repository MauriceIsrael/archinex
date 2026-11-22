# Concepts Fondamentaux d'Archinex

Ce document définit les modèles canoniques qui structurent la délibération, la complétude de couverture des exigences et la justification visuelle dans Archinex (Épique #400).

## 1. Modèle unique de complétude de la couverture des exigences (#401)

Module de domaine pur : `src/lib/domain/coverageModel.ts`.

La couverture se mesure toujours sur une **liste explicite d'exigences** (dénominateur connu), jamais sur un pourcentage de caractères extraits (celui-ci est nommé `extractionCharCoverage` dans `rfpExtractionReport.ts`).

### Chaîne monotone d'étapes calculées (jamais saisies)

Chaque exigence progresse selon 6 états strictement ordonnés :

1. **`unqualified` (Non qualifiée)** : exigence importée mais non encore qualifiée.
2. **`qualified` (Qualifiée)** : disposition établie (`deliberated`, `evacuated` avec motif explicite d'au moins 5 caractères, ou `clarification_needed` avec question/motif). Une évacuation sans motif est interdite et lève un trou bloquant (`EVACUATION_WITHOUT_MOTIVE`).
3. **`attached` (Rattachée)** : exigence reliée à au moins un sujet de délibération.
4. **`decided` (Décidée)** : le sujet rattaché dispose d'une décision active portant une justification suffisante **et** une vérification KB tracée (`checked` ou dérogation motivée `derogated`).
5. **`planned` (Planifiée)** : au moins un objet Nautobot est planifié et marqué pour cette exigence.
6. **`realized_proven` (Réalisée prouvée)** : preuve d'exécution (write-back) confirmée depuis Nautobot ou un connecteur aval.

### Propriété de monotonie et règle de scellement

- Une étape ne régresse jamais sans événement explicite (`retraction`, `decision_invalidated`, `subject_detached`, `nautobot_unlinked`, `drift_detected`, `disposition_reset`).
- **Scellement (`evaluateSealingReadiness`)** : le scellement d'une section ou d'un dossier est refusé si une exigence bloquante reste en deçà de `decided` sans acceptation explicite tracée (`acceptedDeviations`), ou si une évacuation sans motif existe.
- **Source de vérité unique** : l'API (`GET /api/projects/[projectId]/coverage`), la vue de couverture visuelle (`CoverageMatrixView.svelte`) et la matrice de traçabilité exportée (`traceability.ts`) consomment toutes `coverageModel.ts` et affichent les mêmes chiffres.

## 2. Vue de couverture visuelle (#402)

Composant : `src/lib/components/deliberation/CoverageMatrixView.svelte` et exporteurs `src/lib/domain/coverageExport.ts`.

- Matrice **exigences × étapes** regroupable par section, domaine ou criticité, filtrable par criticité, domaine, état et responsable.
- Accessibilité : chaque cellule porte une **icône et un texte explicite** (jamais la couleur seule), une navigation clavier et un repli en liste à 390 px.
- Performance : fenêtrage / pagination par tranches de 60 lignes permettant d'afficher 1 000+ exigences sans blocage.
- Exports déterministes : SVG, PNG et CSV.

## 3. Carte de décision (#403)

Modèle : `src/lib/domain/decisionCard.ts` · Composant : `src/lib/components/deliberation/DecisionCard.svelte`.

Avant de trancher, l'arbitre dispose sur un seul écran de **ce qu'il signe** :
- Exigences sources couvertes et leur criticité ;
- Contraintes KB applicables et leur verdict (`conforme`, `viole`, `inconnu`, `non_verifie` lorsque le Hub est injoignable — jamais affichés comme « conforme »), avec distinction règles validées vs brouillon ;
- Matrice thermique options × critères pondérés avec score et décomposition ;
- Arguments (pour, contre, objections) avec statut et origine (humain / agent) ;
- Décision, réversibilité, motifs d'écartement et écarts acceptés ;
- Conséquences planifiées en mode `dry-run` dans Nautobot ;
- Export imprimable (SVG et Markdown) pour le dossier HLD.

## 4. Modèle de décision unique pour les schémas (#404)

Module : `src/lib/domain/decisionDiagramModel.ts`.

- Toutes les représentations (Mermaid, Structurizr DSL, C4X DSL, Graphe d'impact) dérivent d'un **modèle intermédiaire unique** (`DecisionDiagramModel`).
- **Provenance par élément** : chaque nœud et chaque arête porte une référence source (`requirement`, `statement`, `clause`, `decision`, `option` ou `hypothesis`). Tout élément sans provenance est rejeté.
- **Empreinte anti-dérive** : `modelFingerprint` et `sourceFingerprint` (SHA-256 canonique) garantissent que toute modification d'une décision modifie le schéma correspondant.
- **Validation syntaxique** automatique des sorties Mermaid, Structurizr DSL et C4X en CI.

## 5. Recentrage des Phases 4 et 5 (#405)

- **Phase 4 — Intention & planification** : liens ontologie ↔ exigences, prévisualisation `dry-run` du plan Nautobot (`Phase4NautobotPlanPreview.svelte`), lien unique vers Nautobot, vérification d'intention OPA et ratification. Le simulateur de dérive est relégué dans un tiroir de démonstration replié hors parcours principal (`Phase4DriftDemoDrawer.svelte`).
- **Phase 5 — Réalisation & dérive** : lecture seule de l'état Nautobot (`Planifié`, `Réalisé prouvé`, `Non vérifié`), écarts ouverts et décisions caduques (`Phase5RealizationPanel.svelte`). Les actions de résolution sont strictement limitées à **Remédier**, **Amender** et **Déroger**.
