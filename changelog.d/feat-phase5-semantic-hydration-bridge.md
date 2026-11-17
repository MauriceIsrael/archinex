### Hydratation sémantique Prisma → Phase 5 & affichage des composants résolus en Phase 4
- **Pont Prisma → Phase 5 par matching sémantique (`src/lib/server/edp/projectHydrationContext.ts`, `src/lib/server/similarity/togafSemanticResolver.ts`, `src/routes/api/projects/[projectId]/decision-slots/+server.ts`, `src/routes/api/projects/[projectId]/catalog/+server.ts`, `src/lib/domain/edp/togafTaxonomy.ts`)** :
  - Ajout de `matchAllBuildingBlocksSemantically` et `loadProjectHydrationContextFromDb` pour agréger automatiquement les exigences, sujets et énoncés du projet et hydrater les blocs TOGAF pertinents dès la Phase 5.
- **Interface Phase 4 (`src/lib/components/deliberation/Phase4RefinementHub.svelte`)** :
  - Affichage dédié des composants applicatifs et logiques hydratés (`resolved_components`) ciblés par les axes du sujet.
- **Tests** :
  - Extension de `tests/contract/edp-architecture-view-hydration-scope.test.ts` (matching sémantique + repli lexical).
