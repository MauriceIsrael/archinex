# Vues Éditoriales SVG Déterministes (Intégration `diagram-design`)

Ce module (`src/lib/domain/editorialSvg/`) transpose dans Archinex le système de design éditorial de [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design) (licence MIT) sous forme d'un **moteur de projection SVG 100 % déterministe**, intégré en parallèle de Mermaid dans l'onglet **« Vues Éditoriales (SVG) »** de `ArtifactRegenerationHub.svelte`.

## Architecture

- **`tokens.ts`** : Rôles sémantiques (`paper`, `paper-2`, `ink`, `muted`, `soft`, `rule`, `rule-solid`, `accent`, `accent-tint`, `link`) en variantes `light`, `dark` et `full-editorial`. Chaque rôle texte vérifie un ratio de contraste **WCAG AA ≥ 4.5:1** (`verifySkinContrast`). Mode `system` fonts par défaut (100 % hors-ligne).
- **`primitives.ts`** : Quantification stricte `snap4()` sur grille `4px`, connecteurs orthogonaux à coudes arrondis (`r=8` / `r=6`, zéro segment diagonal), boîtes à masque `paper` opaque et bordure hairline `1px` sans ombre, enveloppe accessible (`role="img"`, `<title>` en premier enfant, `<desc>` en second), callouts éditoriaux de marge et export `.html` autonome.
- **`dials.ts`** : Les **4 Cadrans** (`Skin`, `Size`, `Detail`, `Audience`) et le **Fidelity Ledger** documentant tout élément agrégé ou tronqué selon le budget de densité (`simplified` ≤ 7, `balanced` ≤ 12, `faithful` ≤ 24).
- **`traceableBlockTree.ts`** (Vue pilote #1 — #422) : Projette `ProjectionBlockGraph` (axes TOGAF et énoncés) en arbre `data-block-*` avec export sidecar `.registry.json` déterministe et sans horodatage.
- **`requirementTraceability.ts`** (Vue pilote #2 — #420) : Matrice 4 colonnes **Source → Exigence → Satisfait par → Vérifié par** avec contrat explicite `data-trace-missing="true"` sur tout lien absent.
- **`recommender.ts`** (Socle #427) : Directeur Éditorial évaluant les signaux structurés du sujet pour classer les vues les plus pertinentes.
- **`verifiers.ts`** (Socle #424) : Vérificateurs déterministes exécutés en CI (contraste WCAG AA, accessibilité SVG, grille `4px`, orthogonalité des connecteurs, intégrité sans cycle du `.registry.json`).
