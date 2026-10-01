# Tâches d'Implémentation : Évaluations et Retours sur Verdicts (Lot A9 - Issue #4)

- [x] 1. Types & Client LLMOps
  - [x] 1.1 Définir les types TypeScript (`EvalTestCase`, `EvalDataset`, `EvalBenchmarkRunResult`, `VerdictFeedbackRequest`, `VerdictFeedbackItem`) dans `src/lib/types/llmops.ts`.
  - [x] 1.2 Implémenter le simulateur d'évaluation et de feedback dans `tests/helpers/fakeLlmops.ts`.
  - [x] 1.3 Implémenter les méthodes client dans `src/lib/server/llmops/client.ts` (`getEvalDataset`, `annotateEvalTestCase`, `runEvalBenchmark`, `submitVerdictFeedback`, `listVerdictFeedbacks`).

- [x] 2. Routes API Serveur Archinex
  - [x] 2.1 Implémenter `GET /api/knowledge/evals/[datasetId]/+server.ts`.
  - [x] 2.2 Implémenter `PATCH /api/knowledge/evals/[datasetId]/cases/[caseId]/+server.ts` avec vérification du rôle `kb:evaluate` (403 Forbidden).
  - [x] 2.3 Implémenter `POST /api/knowledge/evals/[datasetId]/runs/+server.ts`.
  - [x] 2.4 Implémenter `POST /api/knowledge/verdict-feedback/+server.ts` et `GET /api/knowledge/verdict-feedback/+server.ts`.

- [x] 3. Interface Utilisateur & Intégration
  - [x] 3.1 Créer l'espace d'évaluation `/kb/evals` : liste des cas, panneau d'annotation, déclencheur de benchmark et jauge de rappel réel ($\ge 80\%$).
  - [x] 3.2 Intégrer le bouton "Signaler un désaccord" et sa modale de retour dans `src/lib/components/deliberation/DebateThreadView.svelte`.
  - [x] 3.3 Mettre à jour la navigation globale dans `src/routes/+layout.svelte`.

- [x] 4. Tests, Documentation & Validation
  - [x] 4.1 Tests de contrat `tests/contract/evals-benchmark.test.ts` (dataset, 403 sans rôle kb:evaluate, calcul de rappel humain, feedback).
  - [x] 4.2 Tests d'intégration `tests/integration/verdict-feedback-loop.test.ts` (cycle complet : désaccord dans un débat -> enregistrement feedback -> conversion en cas de test -> amélioration du benchmark).
  - [x] 4.3 Documentation dans `USER_GUIDE.md` et `ARCHITECTURE.md`.
  - [x] 4.4 Exécution des 4 portes de qualité (`npm run verify`).
