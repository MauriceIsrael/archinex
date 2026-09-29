# Tâches du Lot A0 — Assainissement (Porte G1)

- [x] **1. Contrats LLMOps L1 & Client**
  - [x] 1.1 Étendre `src/lib/types/llmops.ts` avec `DoctrineContext`, `CheckResult`, `FrameworkCoverage`, `KbCandidate`.
  - [x] 1.2 Implémenter dans `src/lib/server/llmops/client.ts` les méthodes `getDoctrineContext`, `checkOption`, `getFrameworkCoverage`, `setApplicableFrameworks`, `submitCandidate`, `listCandidates`.
  - [x] 1.3 Mettre en place le repli hors-ligne scellé pour `getDoctrineContext` et `checkOption` (`unassessed`, `offline: true`).
  - [x] 1.4 Créer le faux serveur de test `tests/helpers/fakeLlmops.ts` et les fixtures associées dans `tests/fixtures/llmops/`.

- [x] **2. Tests Autonomes & Hygiène du Dépôt**
  - [x] 2.1 Ajouter le script `pretest` (`prisma generate && svelte-kit sync`) dans `package.json`.
  - [x] 2.2 Protéger `tests/helpers/clean-slate-environment.ts` pour ignorer proprement `testcontainers` si `TEST_CONTAINERS !== '1'`.
  - [x] 2.3 Retirer du suivi Git `prisma/dev.db` et les fichiers journaux, mettre à jour `.gitignore`.
  - [x] 2.4 Fournir le script `prisma/seed-dev.ts` pour initialiser une base SQLite de développement vierge et valide.

- [x] **3. Sortie des Données de Démonstration de `src/`**
  - [x] 3.1 Extraire les constantes de données d'instance de `src/lib/domain/engagements.ts` vers `examples/suse-telco-cloud/` et `examples/cctp-rfp/`.
  - [x] 3.2 Extraire `INITIAL_CORPUS_DOCUMENTS` de `corpus.ts` et les données d'amorçage de `deliberationStore.svelte.ts`.
  - [x] 3.3 Déplacer `src/lib/fixtures/llmops-nordwave-bundle.json` vers `tests/fixtures/llmops/`.
  - [x] 3.4 Créer le script `scripts/seed.ts` et la commande `npm run seed -- examples/<projet>` (upsert idempotent).
  - [x] 3.5 Supprimer `seedEngagementsIfEmpty()` de `GET /api/engagements` (base vide = liste vide).
  - [x] 3.6 Adapter le store et l'UI pour démarrer avec `activeEngagementId = ''` et afficher un état vide élégant.
  - [x] 3.7 Supprimer `generatePtpConfigJSON` de `src/lib/domain/artifactProjections.ts`.
  - [x] 3.8 Configurer `localLlmClient.ts` avec le défaut `http://localhost:11434` et la variable d'environnement `LLM_LOCAL_ENDPOINT`.

- [x] **4. Externalisation Stricte de la Doctrine**
  - [x] 4.1 Supprimer `KNOWN_DOCTRINE_RULES` et `detectProactiveDoctrineRecalls` de `src/lib/domain/dialectic.ts`.
  - [x] 4.2 Créer `src/lib/server/doctrine/doctrineService.ts` avec cache mémoire et appel à `llmopsClient.getDoctrineContext()`.
  - [x] 4.3 Supprimer `DEFAULT_KB_STANDARDS` de `src/lib/server/llm/rfpFactorizer.ts` et injecter la doctrine via `doctrineService`.
  - [x] 4.4 Adapter le composant de rappel de doctrine pour consommer `doctrineService`.

- [x] **5. Garde-Fou Automatisé & Validation de la Porte G1**
  - [x] 5.1 Créer `.project-names-denylist` et `scripts/check-no-project-names.mjs`.
  - [x] 5.2 Intégrer `scripts/check-no-project-names.mjs` dans `npm run verify`.
  - [x] 5.3 Valider la porte G1 : `npm run verify` vert, tests autonomes sans conteneur, aucun nom de projet ni doctrine dans `src/`.
