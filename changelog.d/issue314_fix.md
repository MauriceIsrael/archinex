### Positionnement de l'onglet Phase 5 à droite de Phase 4 & Consolidation par 4 piliers transverses (#314)
- **Navigation (`src/lib/components/deliberation/ProjectEngagementHeader.svelte`)** :
  - Déplacement des boutons `Phase 5 · Consolidation` et `Architecture Lockée` à droite de `Phase 4 · Raffinement` pour rétablir la progression logique `Phase 2 → Phase 3 → Phase 4 → Phase 5`.
- **Ergonomie Phase 5 (`src/lib/components/deliberation/Phase5ConsolidationHub.svelte`, `LiveArchitectureLockView.svelte`)** :
  - Ajout d'un plan structuré en 4 piliers transverses (**Socle / Architecture transverse**, **Sécurité**, **Gestion / Gouvernance**, **GitOps / Exploitation**) avec statuts de verrouillage dynamiques et accès directs aux artefacts (`Vue Logique`, `Cartographie`, `Bindings Sécurité`, `architecture.lock`, `Matrice Décisions`, `Catalogue & Overlays`, `Redfish sushy`).
- **Tests & Documentation** :
  - Ajout de `tests/contract/phase5-header-and-pillars.test.ts` et mise à jour de `USER_GUIDE.md` et `ARCHITECTURE.md`.
