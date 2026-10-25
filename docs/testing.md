# Tests : repartir d'une base propre

`npm run verify` (denylist, tests, types Svelte, build) est la porte qualité, et c'est ce que lance la CI (sur chaque PR et sur `main`, pas sur chaque push d'une branche sans PR : ouvrir la PR, en brouillon au besoin). Ce document dit comment
obtenir un résultat **reproductible**, ce que `verify` ne lance **pas**, et comment lire les écarts connus.

## Les règles

1. **Dépendances du verrou** : `npm ci` (jamais `npm install`, qui peut réécrire `package-lock.json`).
2. **`DATABASE_URL` est obligatoire** pour les tests d'intégration (`file:./dev.db`). Sans elle, Prisma échoue à l'initialisation
   et toutes les suites concernées apparaissent comme **« ignorées »**, pas comme en échec : un « vert » trompeur. Si le nombre de
   tests ignorés dépasse 101 (voir plus bas), c'est le premier suspect.
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
npx prisma db push && npx prisma generate      # dev.db neuve, puis le client (Prisma 7 ne le génère plus au db push)
npm run verify                                   # les 4 portes : denylist, vitest, svelte-check, build
# La porte « build » peut manquer de mémoire avec le tas par défaut de Node (mesuré sur main : code 134) :
# NODE_OPTIONS=--max-old-space-size=8192 npx vite build
```

Dans un dépôt de travail existant, au minimum : `rm -f dev.db dev.db-journal && npx prisma db push`, puis `npm run verify`.

## Ce que `verify` ne lance pas

| Suite | Ignorés | Comment la lancer |
|---|---|---|
| Hub réel : `hub-*-live` (K17, décisions, exigences, parité, matrice) | 22 | serveur de contrat du Hub, voir ci-dessous |
| Contrat réel LLMOps : `llmops-live*`, `llmops-mcp`, `kb-clauses-live` | 58 | idem (`kb-clauses-live` exige en plus `LLMOPS_LIVE_MAINTAINER=maint@example.org`) |
| Parcours conteneurisés : `closed-loop-deliberation`, `regulatory-to-capitalization` | 16 | `TEST_CONTAINERS=1` (testcontainers construit l'image du Hub) ou `LLMOPS_LIVE_URL` |
| Validation du C4 par le vrai Structurizr : `structurizr-dsl` (3 de ses 12 tests) | 4 | `STRUCTURIZR_CLI=/chemin/structurizr.sh npm run test:structurizr` (Java et le [CLI Structurizr](https://github.com/structurizr/cli/releases) ; sans le CLI, la commande **échoue** au lieu de s'ignorer) |
| Parcours navigateur : `tests/e2e/browser/*.spec.ts` (Playwright) | — | `npm run test:e2e:browser` (exige Hub réel + navigateur) |

Les 101 tests ignorés de `verify` (mesuré le 2026-10-24) sont les quatre premières lignes, à un test près que ce tableau ne localise pas. **Le dépôt n'a aucune CI qui les exécute** : aujourd'hui, ils ne
tournent que quand quelqu'un les lance.

### Lancer les tests « live » contre un Hub

**La CI les lance** : `.github/workflows/hub-live.yml` extrait le Hub (dépôt public LLMOps), démarre son serveur de contrat sur le runner
et rejoue les 10 fichiers ci-dessous, sur chaque PR, sur `main`, chaque nuit et à la demande (`llmops_ref` : branche, étiquette ou empreinte du Hub).
Il éprouve Archinex contre le Hub **tel qu'il est sur `main`**, pas contre une version figée : un échec nocturne sans changement
d'Archinex veut dire que le Hub a changé. Rejouer en local reste utile pour déboguer :

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


---

## Inventaire exhaustif des suites de tests

### 1. Tests E2E Navigateur & Démonstrations Visuelles (Playwright)
Dossier : `tests/e2e/browser/` (configuré dans `playwright.config.ts`).

| Spécification | Rôle & Scénario | Mode d'exécution standard | Mode Démo Interactif (Chromium visible + ralenti 600ms + vidéo) |
|---|---|---|---|
| `regulatory-to-capitalization.spec.ts` | **Boucle fermée complète en 7 actes** : Appropriation RFP $\rightarrow$ Ingestion NIS2 $ightarrow$ Délibération $ightarrow$ Décision $ightarrow$ Capitalisation $ightarrow$ Audit accessibilité `axe-core`. | `npx playwright test tests/e2e/browser/regulatory-to-capitalization.spec.ts` | `npm run demo:e2e` |
| `second-rfp-reuse.spec.ts` | **Preuve de réutilisation sur second RFP** : Dépouillement, détection sémantique ADR-0001, garantie D8 (confirmation obligatoire sans faux positif silencieux). | `npx playwright test tests/e2e/browser/second-rfp-reuse.spec.ts` | `cross-env DEMO_E2E=1 playwright test tests/e2e/browser/second-rfp-reuse.spec.ts --project=chromium` |
| `second-rfp-zero-tolerance.spec.ts` | **Validation stricte des hypothèses d'architecture** : Rejet immédiat si une hypothèse ne tient pas, obligation de motif. | `npx playwright test tests/e2e/browser/second-rfp-zero-tolerance.spec.ts` | `cross-env DEMO_E2E=1 playwright test tests/e2e/browser/second-rfp-zero-tolerance.spec.ts --project=chromium` |
| `lumicc-demo.spec.ts` | **Démonstration de bout en bout Cas Réel LUMICC** (Lot 1 NOC & Cœur 5G PPDR) : Reprise de l'audit live Claude scellé J0 (`run_lumicc_live_j0`), exploration des 3 DC POST, matrice d'options UDR, contraintes Holdover GNSS 30j et arbitrage Porte G3. | `npx playwright test tests/e2e/browser/lumicc-demo.spec.ts` | `npm run demo:lumicc` |

*Captures d'écran produites automatiquement : `tests/e2e/screenshots/`.*

---

### 2. Tests de Bout en Bout API (E2E Backend)
Dossier : `tests/e2e/`.

* **`regulatory-to-capitalization.test.ts`** (833 lignes) :
  Exécute les 7 actes de la chaîne fermée en appelant directement les services et la base de données.
  * *Avec conteneur Docker éphémère (testcontainers)* :
    `TEST_CONTAINERS=1 npx vitest run tests/e2e/regulatory-to-capitalization.test.ts`
  * *Contre un serveur LLMOps existant* :
    `LLMOPS_LIVE_URL=http://127.0.0.1:8099 npx vitest run tests/e2e/regulatory-to-capitalization.test.ts`
* **`second-rfp-reuse-api.test.ts`** :
  Vérifie au niveau API que les actifs capitalisés sont retrouvés et réutilisés sans régression sur un nouveau projet vierge.
* **`it-cloud-platform.test.ts`** :
  Second cas de test IT pure (Plateforme Cloud Privé Souveraine — Porte G4).

---

### 3. Tests d'Intégration
Dossier : `tests/integration/` (~30 suites).

* **Boucle fermée & Délibération** :
  * `closed-loop-deliberation.test.ts` : Délibération en base vierge (clean slate Docker tmpfs + SQLite neuve).
  * `deliberation-workflow.test.ts` : Transition des états de maturation L0 à L3.
  * `causal-retraction-cascade.test.ts` : Invalidation en cascade lorsqu'un énoncé amont est rétracté.
* **Multi-agents & Débat** :
  * `expert-debate-maturation.test.ts` : Débat entre experts de domaine et maturation d'options.
  * `multi-agent-debate.test.ts` : Débat dialectique contradictoire orchestré par agents.
  * `arbitration-gate.test.ts` : Enregistrement et verrouillage des arbitrages (Porte G3).
* **Capitalisation & Hub LLMOps** :
  * `kb-capitalization.test.ts` : Soumission de candidats patterns/principes vers le Hub.
  * `llmops-mcp.test.ts` : Communication MCP (SSE) avec le Hub de connaissances.
  * `frameworks-coverage.test.ts` & `gate-g7-publication.test.ts` : Ingestion et publication scellée de doctrine.

---

### 4. Tests de Contrat
Dossier : `tests/contract/` (~50 suites).

* **Contrats d'interface & Robustesse** :
  * `bundle-schema-1-1.test.ts` & `bundle-assembly.test.ts` : Validation des schémas d'export d'architecture.
  * `jwt-secret-validation.test.ts` : Rejet au démarrage des secrets JWT faibles ou par défaut (#141).
  * `sandbox-windows-support.test.ts` : Support natif Windows PowerShell (BOM UTF-8, CRLF/LF) et compose.
  * `issue_93_framework_review.test.ts` : Droits de revue par domaine (`userOwnsDomain`) et rejet des versions génériques (#93).
  * `kb-apply-conflict-reason.test.ts` : Extraction du motif de conflit 409 et règle de séparation des fonctions 4 yeux (#156).
* **Parité Hub Live (rejouables contre `llmops-contract:latest`)** :
  * `hub-parity-live.test.ts`, `hub-compliance-live.test.ts`, `hub-decision-live.test.ts`, `hub-requirements-live.test.ts`, `hub-traceability-route-live.test.ts`.

---

### 5. Bancs Externes Associés

* **`archinex-benchmark` (ABE v2.1)** :
  * Banc boîte noire indépendant évaluant le couple Archinex + LLMOps sur 6 cas réels held-out du RFP LUMICC (*Lulu*).
  * Conteneur Docker étanche avec volumes hôtes en lecture seule (`:ro`) et bac à sable en RAM :
    `docker compose -f docker-compose.test.yml up --build --abort-on-container-exit`
* **`LLMOps` (Hub de Connaissances)** :
  * Garde-fous de non-régression absolue : `test_frozen_interfaces.py` (formes figées MCP/REST) et `test_ladybug_version_guard.py` (moteur graphe < 0.21).
  * Image propre de test : `make test-docker` (`Dockerfile.test`).
  * Serveur de contrat de référence pour les clients : `Dockerfile.contract` (`llmops-contract:latest`).
