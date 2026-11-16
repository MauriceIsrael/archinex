### Phase 4 EDP : Composant cible unifié, motif d'activation et filtrage de pertinence des axes (#321)
- **Catalogue & Moteur de couverture (`src/lib/domain/edp/componentCatalog.ts`, `src/lib/server/edp/refinementCoverage.ts`, `src/lib/server/edp/decisionSlotRegistry.ts`)** :
  - Unification de la résolution du composant cible via `resolveTargetComponentsForUrns` et export de `DEFAULT_URN_TO_COMPONENT` (combinés avec les triplets `instantiates_component`, les projections et le catalogue projet), y compris sur chaque feuille (`CandidateLeafSummary.targetComponents`).
  - Ajout du motif d'activation (`activationReason`) et du score/niveau de pertinence (`relevanceScore`, `relevanceLevel`) sur chaque axe, avec correspondance lexicale sur bornes de mots (`matchEntityAgainstCorpus`) et filtrage automatique des axes hors-périmètre vers `outOfScopeAxes`.
  - Support de l'exclusion manuelle d'axes (`excludedAxisUrns`) sans polluer `composedBindings`.
- **API & IHM Phase 4 (`src/routes/api/projects/[projectId]/subjects/[subjectId]/edp/+server.ts`, `src/lib/components/deliberation/Phase4RefinementHub.svelte`)** :
  - Ajout des actions `dismiss_axis` et `restore_axis` dans l'API EDP du sujet.
  - Affichage explicite du composant cible sur chaque axe, chaque feuille liée et chaque règle Rego, ainsi que du motif d'activation, du badge de pertinence, du bouton `✕ Hors-périmètre` et du panneau repliable des axes masqués.
- **Tests** :
  - Ajout de `tests/contract/edp-issue321-component-target-and-relevance.test.ts`.
