# Tests : repartir d'une base propre

`npm run verify` (denylist, tests, types Svelte, build) est la porte qualité, et c'est ce que lance la CI (sur chaque PR et sur `main`, pas sur chaque push d'une branche sans PR : ouvrir la PR, en brouillon au besoin). Ce document dit comment
obtenir un résultat **reproductible**, ce que `verify` ne lance **pas**, et comment lire les écarts connus.

## Les règles

1. **Dépendances du verrou** : `npm ci` (jamais `npm install`, qui peut réécrire `package-lock.json`).
2. **`DATABASE_URL` est obligatoire** pour les tests d'intégration (`file:./dev.db`). Sans elle, Prisma échoue à l'initialisation
   et toutes les suites concernées apparaissent comme **« ignorées »**, pas comme en échec : un « vert » trompeur. Si le nombre de
   tests ignorés dépasse 96 (voir plus bas), c'est le premier suspect.
3. **Base SQLite neuve** : les tests partagent `dev.db` et s'exécutent l'un après l'autre (`fileParallelism: false`). Un test qui a
   échoué en route peut laisser des lignes.
4. **Aucun test ne parle à un vrai LLM ni à un Hub de développement** : `LLMOPS_BASE_URL` est forcé à `http://127.0.0.1:1` par
   `vitest.config.ts`. Les tests « live » se lancent explicitement contre un serveur dédié (plus bas).

## Procédure : copie propre

```bash
git worktree add ../archinex-clean HEAD         # ou : git clone <dépôt> archinex-clean
cd ../archinex-clean
export DATABASE_URL=file:./dev.db JWT_SECRET=ci-only-secret-not-used-anywhere-else-0123456789
npm ci
npx prisma db push                               # crée dev.db neuve et génère le client
npm run verify                                   # les 4 portes : denylist, vitest, svelte-check, build
```

Dans un dépôt de travail existant, au minimum : `rm -f dev.db dev.db-journal && npx prisma db push`, puis `npm run verify`.

## Ce que `verify` ne lance pas

| Suite | Ignorés | Comment la lancer |
|---|---|---|
| Hub réel : `hub-*-live` (K17, décisions, exigences, parité, matrice) | 22 | serveur de contrat du Hub, voir ci-dessous |
| Contrat réel LLMOps : `llmops-live*`, `llmops-mcp`, `kb-clauses-live` | 58 | idem (`kb-clauses-live` exige en plus `LLMOPS_LIVE_MAINTAINER=maint@example.org`) |
| Parcours conteneurisés : `closed-loop-deliberation`, `regulatory-to-capitalization` | 16 | `TEST_CONTAINERS=1` (testcontainers construit l'image du Hub) ou `LLMOPS_LIVE_URL` |
| Parcours navigateur : `tests/e2e/browser/*.spec.ts` (Playwright) | — | `npm run test:e2e:browser` (exige Hub réel + navigateur) |

Les 96 tests ignorés de `verify` sont les trois premières lignes. **Le dépôt n'a aucune CI qui les exécute** : aujourd'hui, ils ne
tournent que quand quelqu'un les lance.

### Lancer les tests « live » contre un Hub

Le Hub fournit un serveur de contrat jetable (copie de travail de la base de connaissances, gouvernance SQLite, jetons de test).

```bash
# Dans le dépôt LLMOps, au choix :
make contract-server                              # poetry ; écoute sur 127.0.0.1:8099
# ou, avec Docker (aucune installation Python) :
docker build -f docker/Dockerfile.contract -t llmops-contract:latest .
docker run --rm -p 8099:8000 llmops-contract:latest

# Dans ce dépôt :
LLMOPS_LIVE_URL=http://127.0.0.1:8099 npx vitest run \
  tests/contract/hub-compliance-live.test.ts tests/contract/hub-decision-live.test.ts \
  tests/contract/hub-requirements-live.test.ts tests/contract/hub-parity-live.test.ts \
  tests/contract/hub-traceability-route-live.test.ts \
  tests/contract/llmops-live.test.ts tests/contract/llmops-live-a9-a11.test.ts \
  tests/contract/llmops-live-a12-a15.test.ts tests/contract/llmops-live-reuse-negative.test.ts \
  tests/integration/llmops-mcp.test.ts
```

Les tests `hub-*-live` ont besoin d'un Hub au contrat 1.31 ou plus (la couverture K17) et des jetons
`arx-token` / `suite-token` du serveur de contrat. Un Hub plus ancien fait échouer les assertions de version, c'est attendu.

Le jeton par défaut des tests live est celui du serveur de contrat (`contract-service-token`) ; `LLMOPS_LIVE_TOKEN` le remplace
pour un autre serveur. `llmops-mcp` lit l'engagement `nordwave-mcx-2027`, que le serveur de contrat fournit depuis la PR
LLMOps#129 (`[contrat —]`) : contre un serveur plus ancien, les trois tests `get_board` répondent `count: 0` et échouent, c'est attendu.

## Écarts connus (à corriger, pas à ignorer)

Aucun test live connu en échec contre un serveur de contrat au contrat 1.35 incluant LLMOps#129 (9 fichiers, 1 test ignoré). Le test A14
(banc de similarité, ~5 s) a un délai explicite de 60 s : il dépassait les 5 s par défaut de vitest.

Historique : quatre anciens tests live échouaient (A11 « publication » et « santé après publication » : le serveur de contrat
réécrivait ADR-0001 sans relever sa révision, ce que le registre des versions du Hub refuse ; `llmops-mcp` : jeton par défaut inconnu
du serveur de contrat, donc SSE en 401, puis engagement de démonstration absent).

## Ce qui n'est pas mesuré

- Pas d'outil de couverture de code. Mesure grossière (recherche du chemin dans les tests) : 66 des 113 routes d'API ne sont citées
  par aucun test ; 32 des 157 composants Svelte sont nommés dans un test.
- Les trois specs Playwright ne sont lancées ni par `verify` ni par la CI.

## Dernier état connu

Sur la branche de ce document : 109 fichiers, 803 tests ; 707 réussis, 0 échec, 96 ignorés (les suites « live » ci-dessus).
Les 22 tests `hub-*-live` ont été rejoués contre le serveur de contrat du dépôt du Hub (`main`, contrat 1.31) : 22 réussis.
