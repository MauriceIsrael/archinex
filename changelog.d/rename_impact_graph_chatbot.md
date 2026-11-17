### Ergonomie Délibération : Graphe d'Impact en Phase 5 & Assistant Exigences centré
- **En-tête Projet (`ProjectEngagementHeader.svelte`) & Phase 5 (`Phase5ConsolidationHub.svelte`)** :
  - Déplacement de la vue **Graphe d'Impact & Décisions (What-If)** hors du niveau 1 de l'en-tête projet vers une section dédiée `#phase5-impact-graph` dans **Phase 5 · Consolidation**, avec bouton d'accès rapide dans l'en-tête de la Phase 5 (la route URL `?mode=graph` reste supportée pour rétrocompatibilité).
  - Positionnement du déclencheur du chatbot au centre de l'en-tête, entre l'échelle Projet (Niveau 1) et l'échelle Sujet (Niveau 2), et renommage de « Exigences » / « Quick-Ask Exigences » en **« Assistant Exigences »** (`RequirementsQuickAskModal.svelte`) avec sous-titre précisant son périmètre (clauses RFP/CCTP et citations `[clauseRef]`).
- **Tests** :
  - Mise à jour de `tests/contract/phase5-header-and-pillars.test.ts`.
