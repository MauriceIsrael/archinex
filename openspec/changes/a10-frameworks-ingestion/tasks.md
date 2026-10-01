# Tâches d'Implémentation : Référentiels Réglementaires (Lot A10 - Issue #5)

- [x] 1. Types & Client LLMOps
  - [x] 1.1 Définir les types TypeScript (`FrameworkIngestion`, `FrameworkRequirement`, `FrameworkLinkSuggestionResult`, `CoverageDeclarationResult`) dans `src/lib/types/llmops.ts`.
  - [x] 1.2 Implémenter le simulateur d'ingestion et de déclaration dans `tests/helpers/fakeLlmops.ts`.
  - [x] 1.3 Implémenter les méthodes client dans `src/lib/server/llmops/client.ts` (`ingestFramework`, `listFrameworkIngestions`, `getFrameworkIngestion`, `reviewFrameworkRequirement`, `suggestFrameworkRequirementLinks`, `declareFrameworkCoverage`).

- [x] 2. Routes API Serveur Archinex
  - [x] 2.1 Implémenter `POST /api/frameworks/ingestions` et `GET /api/frameworks/ingestions` dans `src/routes/api/frameworks/ingestions/+server.ts`.
  - [x] 2.2 Implémenter `GET /api/frameworks/ingestions/[id]/+server.ts`.
  - [x] 2.3 Implémenter `PATCH /api/frameworks/ingestions/[id]/requirements/[reqId]/+server.ts` avec contrôle d'habilitation domaine et motif obligatoire pour le rejet.
  - [x] 2.4 Implémenter `POST /api/frameworks/ingestions/[id]/requirements/[reqId]/suggest-links/+server.ts`.
  - [x] 2.5 Implémenter `POST /api/frameworks/[fw]/coverage-declaration/+server.ts` gérant la détection d'exigences manquantes (409 Conflict).

- [x] 3. Interface Utilisateur Svelte 5
  - [x] 3.1 Créer la vue d'ensemble des référentiels `/kb/frameworks` avec téléversement drag-and-drop, statut et indicateurs de couverture.
  - [x] 3.2 Créer la vue de revue ligne par ligne `/kb/frameworks/[id]` avec filtrage, tableau interactif des exigences, suggestion IA (`llm-derived`), modales d'amendement/rejet et bouton de déclaration de couverture.
  - [x] 3.3 Mettre à jour la navigation globale dans `src/routes/+layout.svelte`.

- [x] 4. Tests, Documentation & Validation
  - [x] 4.1 Tests de contrat `tests/contract/frameworks-ingestion.test.ts` (upload, parsing, contrôle domaine 403, motif rejet 400).
  - [x] 4.2 Tests d'intégration `tests/integration/frameworks-coverage.test.ts` (cycle complet upload -> revue -> 409 conflict -> résolution -> 200 coverage declaration).
  - [x] 4.3 Documentation dans `USER_GUIDE.md` et `ARCHITECTURE.md`.
  - [x] 4.4 Exécution des 4 portes de qualité (`npm run verify`).
