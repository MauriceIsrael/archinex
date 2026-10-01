# Tâches A8 — Atelier de Doctrine : Création, Amendement et Simulation de Clauses

## 1. Types & Modèles de Données
- [x] 1.1 Définir les types dans `src/lib/types/llmops.ts` (`TestablePredicates`, `KbAssetType`, `KbAssetTemplate`, `ClauseSimulationRequest`, `ClauseSimulationResult`, `CandidateValidationResult`).
- [x] 1.2 Mettre à jour `tests/helpers/fakeLlmops.ts` pour simuler `GET /api/knowledge/templates/{asset_type}`, `POST /api/knowledge/candidates/validate` et `POST /api/knowledge/checks/simulate`.

## 2. Client LLMOps
- [x] 2.1 Ajouter `getAssetTemplate(assetType: KbAssetType)` dans `src/lib/server/llmops/client.ts`.
- [x] 2.2 Ajouter `validateCandidate(candidate: Partial<KbCandidate>)` dans `src/lib/server/llmops/client.ts`.
- [x] 2.3 Ajouter `simulateClause(req: ClauseSimulationRequest)` dans `src/lib/server/llmops/client.ts`.

## 3. Routes API Archinex
- [x] 3.1 Créer `src/routes/api/knowledge/templates/[type]/+server.ts`.
- [x] 3.2 Créer `src/routes/api/knowledge/candidates/validate/+server.ts`.
- [x] 3.3 Créer `src/routes/api/knowledge/checks/simulate/+server.ts`.

## 4. Interface Utilisateur (/kb/workshop)
- [x] 4.1 Créer `src/routes/kb/workshop/+page.server.ts` avec vérification des rôles KB et chargement initial des domaines/templates.
- [x] 4.2 Créer `src/routes/kb/workshop/+page.svelte` :
  - Sélecteur de type d'actif (`principle`, `pattern`, `decision`, `control`, `glossary`).
  - Éditeur de prédicats structurés (`when`, `expect`, `requires`, `forbids`).
  - Panneau de simulation en direct avec calcul de précision/rappel et alertes de régression.
  - Boutons "Tester la clause" et "Soumettre à la revue".
- [x] 4.3 Ajouter le lien "Atelier de Doctrine" dans le menu utilisateur (`src/routes/+layout.svelte`).

## 5. Tests & Validation
- [x] 5.1 Rédiger les tests de contrat `tests/contract/kb-workshop.test.ts`.
- [x] 5.2 Rédiger les tests d'intégration `tests/integration/doctrine-simulation.test.ts`.
- [x] 5.3 Exécuter `npm run verify` et s'assurer que les 4 portes passent au vert.
- [x] 5.4 Mettre à jour `USER_GUIDE.md` et `ARCHITECTURE.md`.
