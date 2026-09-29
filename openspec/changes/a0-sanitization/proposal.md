# Proposition OpenSpec : Lot A0 — Assainissement

## 1. Contexte & Problématique
Archinex devient le propriétaire exclusif de l'état des projets d'architecture et du déroulé de co-conception en 6 étapes.
Aujourd'hui, le code source `src/` contient des données de projets de démonstration en dur (noms de projets, CCTP, Telco/MCX, SUSE, Rubidium, PTP), ainsi que des règles de doctrine et de standards (`KNOWN_DOCTRINE_RULES`, `DEFAULT_KB_STANDARDS`) codées directement dans le dépôt client.
Par ailleurs, les tests automatisés dépendent de conditions locales (runtime de conteneurs Docker manquant ou instable, base SQLite modifiée dans git) au lieu de pouvoir s'exécuter de façon autonome sur une machine vierge.

## 2. Objectifs du Lot A0 (Porte G1)
1. **Tests 100% autonomes** :
   - Ajout d'un script `pretest` (`prisma generate && svelte-kit sync`).
   - Saut propre et documenté des tests `testcontainers` si `TEST_CONTAINERS !== '1'`.
   - Retrait des fichiers générés (`prisma/dev.db`, logs) du suivi git avec ajout au `.gitignore` et script `prisma/seed-dev.ts`.
2. **Sortie intégrale des données de démo de `src/`** :
   - Déplacement vers `examples/suse-telco-cloud/` et `examples/cctp-rfp/`.
   - Création d'un script `scripts/seed.ts` (`npm run seed -- examples/<projet>`).
   - Store démarrant sans projet actif (`activeEngagementId = ''`), avec affichage d'un état vide (« Créer un projet » ou « Importer un exemple »).
   - Retrait de `generatePtpConfigJSON` et assainissement de `localLlmClient.ts` (`http://localhost:11434`).
3. **Externalisation stricte de la doctrine** :
   - Remplacement des règles en dur par `src/lib/server/doctrine/doctrineService.ts` appelant `llmopsClient.getDoctrineContext()`.
   - Repli hors ligne propre sur l'instantané scellé sans inventer de verdict.
4. **Contrats LLMOps L1 consommés** :
   - Extension de `llmops.ts` et `client.ts` avec `getDoctrineContext()`, `checkOption()`, `getFrameworkCoverage()`, `setApplicableFrameworks()`, `submitCandidate()`, `listCandidates()`.
   - Faux serveur `tests/helpers/fakeLlmops.ts` et fixtures associées.
5. **Garde-fou automatisé** :
   - `scripts/check-no-project-names.mjs` vérifiant l'absence totale de termes interdits dans `src/` (vérifié dans `npm run verify`).
