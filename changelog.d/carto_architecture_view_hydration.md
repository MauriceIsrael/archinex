### Portée stricte d'hydratation des vues Phase 5 et de la vue d'architecture lockée
- **Catalogue projet & instanciation ontologique (`src/lib/domain/edp/componentCatalog.ts`, `src/lib/server/edp/componentCatalogRepository.ts`)** :
  - `loadProjectComponentCatalog` démarre désormais un projet vierge avec `components: []` (opt-in) au lieu d'injecter l'intégralité de `DEFAULT_COMPONENT_CATALOG`.
  - `instantiateCatalogFromOntologyBindings` applique un filtrage strict : seuls les composants liés aux `boundUrns`, leurs dépendances transitives (`dependsOn`, `vault-cluster`, `pki-ca`, `siem-soc`) et les composants marqués comme propres au projet (`emergent-slot` / `projectScoped`) sont retenus (avec option `preserveBaseCatalog` pour les catalogues projet déjà persistés).
- **Vues Phase 5 & Architecture Lockée (`src/lib/server/edp/decisionSlotRegistry.ts`, `src/routes/api/projects/[projectId]/catalog/+server.ts`, `src/lib/components/deliberation/Phase5ConsolidationHub.svelte`, `src/lib/components/deliberation/LiveArchitectureLockView.svelte`)** :
  - `GET /api/projects/[projectId]/catalog` hydrate la topologie, les scénarios What-If et le Jumeau Sylva à partir des composants actifs du projet et expose un paramètre `includeReferenceCatalog=true` (désactivé par défaut).
  - `buildLiveArchitectureLockSnapshot` marque chaque composant avec `isHydratedInProject` et l'UI Phase 5 / Architecture Lockée masque par défaut les composants tiers non hydratés avec un bouton de bascule explicite.
- **Tests** :
  - Ajout de `tests/contract/edp-architecture-view-hydration-scope.test.ts`.
