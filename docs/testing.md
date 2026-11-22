# Tests : repartir d'une base propre

`npm run verify` (denylist, `changelog:check`, bootstrap OPA/Prisma/SvelteKit + règles d'or Sylva/OPA, tests + couverture v8, types Svelte, build) est la porte qualité, et c'est ce que lance la CI (sur chaque PR et sur `main`, pas sur chaque push d'une branche sans PR : ouvrir la PR, en brouillon au besoin ; sur PR, le pré-vol `scripts/ci-preflight.mjs` court-circuite les étapes lourdes si seule la doc ou `changelog.d/` change depuis le dernier run vert). Ce document dit comment
obtenir un résultat **reproductible**, ce que `verify` ne lance **pas**, et comment lire les écarts connus.

## Les règles

1. **Dépendances du verrou** : `npm ci` (jamais `npm install`, qui peut réécrire `package-lock.json`).
2. **Bootstrap automatique sur clone propre (`pretest`)** : `scripts/ensure-test-env.mjs` s'exécute automatiquement avant `npm test` et dans `npm run verify`. Il installe OPA v1.21.4 (avec vérification SHA-256) si absent — ou échoue explicitement et lisiblement sans jamais ignorer silencieusement —, génère le client Prisma, initialise `prisma/dev.db` si absent et exécute `svelte-kit sync`.
3. **`DATABASE_URL` par défaut** : `vitest.config.ts` définit `DATABASE_URL=file:./dev.db` par défaut si la variable n'est pas fournie, évitant que Prisma échoue silencieusement et transforme les suites d'intégration en « verts » ignorés.
4. **Base SQLite neuve** : les tests partagent `prisma/dev.db` et s'exécutent l'un après l'autre (`fileParallelism: false`). Un test qui a échoué en route peut laisser des lignes ; pour repartir d'une base vierge : `rm -f prisma/dev.db prisma/dev.db-journal && npx prisma db push`.
5. **Aucun test ne parle à un vrai LLM ni à un Hub de développement** : `LLMOPS_BASE_URL` est forcé à `http://127.0.0.1:1` par `vitest.config.ts`. Les tests « live » se lancent explicitement contre un serveur dédié (plus bas).

## Procédure : copie propre

```bash
git worktree add ../archinex-clean HEAD         # ou : git clone <dépôt> archinex-clean
cd ../archinex-clean
npm ci
npm test                                        # bootstrap automatique (OPA + Prisma + SQLite + SvelteKit) puis vitest
npm run verify                                  # les 6 portes : denylist, changelog:check, sylva/OPA, vitest+couverture, svelte-check, build
# La porte « build » peut manquer de mémoire avec le tas par défaut de Node (mesuré sur main : code 134) :
# NODE_OPTIONS=--max-old-space-size=8192 npx vite build
```

Dans un dépôt de travail existant, pour repartir d'une base SQLite vierge : `rm -f prisma/dev.db prisma/dev.db-journal && npx prisma db push`, puis `npm run verify`.

## Ce que `verify` ne lance pas

| Suite | Ignorés | Comment la lancer |
|---|---|---|
| Hub réel : `hub-*-live` (K17, décisions, exigences, parité, matrice) | 22 | serveur de contrat du Hub (ou CI `.github/workflows/hub-live.yml`) |
| Contrat réel LLMOps : `llmops-live*`, `llmops-mcp`, `kb-clauses-live` | 59 | idem (`kb-clauses-live` exige en plus `LLMOPS_LIVE_MAINTAINER=maint@example.org`) |
| Parcours conteneurisés : `closed-loop-deliberation`, `regulatory-to-capitalization` | 16 | `TEST_CONTAINERS=1` (testcontainers construit l'image du Hub) ou `LLMOPS_LIVE_URL` |
| Validation du C4 par le vrai Structurizr : `structurizr-dsl` | 6 | `STRUCTURIZR_CLI=/chemin/structurizr.sh npm run test:structurizr` (Java et le [CLI Structurizr](https://github.com/structurizr/cli/releases) ; sans le CLI, la commande **échoue** au lieu de s'ignorer) |
| Stack Docker Sylva : `edp-sylva-docker-stack` | 1 | `TEST_DOCKER_STACK=1` avec Docker disponible |
| Parcours navigateur : `tests/e2e/browser/*.spec.ts` (Playwright) | — | `npm run test:e2e:browser` (ou CI nocturne `.github/workflows/playwright-nightly.yml` avec `USE_FAKE_LLMOPS=1`) |

Les tests ignorés par `verify` (~104 tests) sont **explicitement comptés et affichés par fichier** dans le résumé CI (`$GITHUB_STEP_SUMMARY`) via `scripts/ci-test-summary.mjs`, afin d'éliminer tout « vert » trompeur.
Les suites live contre le Hub sont exécutées par le workflow dédié `.github/workflows/hub-live.yml` (voir ci-dessous) ; les parcours Playwright sont exécutés chaque nuit par `.github/workflows/playwright-nightly.yml` avec LLM simulé.

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

## Couverture de code, tests par propriétés et Playwright nocturne

- **Couverture v8 (`npm run test:coverage`)** : configurée dans `vitest.config.ts` sur la logique pure `src/lib/domain/**/*.ts` avec seuils progressifs anti-régression. En CI (`verify.yml`), le rapport complet (`coverage/` : HTML, LCOV, `coverage-summary.json`) est publié en artefact (`vitest-coverage-report`) et résumé dans `$GITHUB_STEP_SUMMARY` avec le décompte exact des tests ignorés.
- **Tests par propriétés (`npm run test:property`)** : 4 suites `fast-check` dans `tests/property/` vérifient les invariants sur des entrées générées aléatoirement :
  - `retractation-dag.property.test.ts` : symétrie du DAG causal, terminaison avec cycles, clôture transitive et isolation du cône de rétrogradation ;
  - `compute-maturity.property.test.ts` : invariants de maturité L0–L5, scellement `L5_archived`, monotonie face aux objections ouvertes ;
  - `ipv4-uniqueness.property.test.ts` : injectivité et bornes de `computeIpFromCidrOffset`, unicité IPv4 multi-instances / multi-DC ;
  - `nautobot-idempotence.property.test.ts` : déterminisme de `computeObjectIntentHash`, idempotence (`noop`) de `planIntentWrite`, protection des objets non marqués et réversibilité du préfixage par projet.
- **Playwright nocturne (`.github/workflows/playwright-nightly.yml`)** : exécute chaque nuit (et sur `workflow_dispatch`) deux parcours complets (`regulatory-to-capitalization.spec.ts` et `second-rfp-reuse.spec.ts`) sur Chromium avec Hub/LLM simulés déterministes (`USE_FAKE_LLMOPS=1`, `FAKE_LLM_DETERMINISTIC=1`) et publie le rapport + captures en artefact.

## Dernier état connu

Avec la couverture v8 activée et les suites `fast-check` (#394) : plus de 1 460 tests passés, 0 échec, et les ~104 tests nécessitant un Hub/Docker/CLI externe sont comptabilisés et détaillés par fichier dans le résumé CI.
Les 22 tests `hub-*-live` sont rejoués automatiquement contre le serveur de contrat du Hub par `.github/workflows/hub-live.yml`.

---

## Inventaire exhaustif des suites de tests

### 1. Tests E2E Navigateur & Démonstrations Visuelles (Playwright)
Dossier : `tests/e2e/browser/` (configuré dans `playwright.config.ts`).

| Spécification | Rôle & Scénario | Mode d'exécution standard | Mode Démo Interactif (Chromium visible + ralenti 600ms + vidéo) |
|---|---|---|---|
| `regulatory-to-capitalization.spec.ts` | **Boucle fermée complète en 7 actes** : Appropriation RFP → Ingestion NIS2 → Délibération → Décision → Capitalisation → Audit accessibilité `axe-core`. | `npx playwright test tests/e2e/browser/regulatory-to-capitalization.spec.ts` | `npm run demo:e2e` |
| `accessibility.spec.ts` | **Audit accessibilité `axe-core`, cohérence française et responsive 390 px** : `/login`, `/`, `/deliberation` (Tableau, Phase 2, Phase 4, Phase 5), `/kb/dashboard` et `/kb/reviews` (0 violation critique, exécuté en CI). | `npm run test:a11y` | `npx playwright test --config=playwright.a11y.config.ts --headed` |
| `second-rfp-reuse.spec.ts` | **Preuve de réutilisation sur second RFP** : Dépouillement, détection sémantique ADR-0001, garantie D8 (confirmation obligatoire sans faux positif silencieux). | `npx playwright test tests/e2e/browser/second-rfp-reuse.spec.ts` | `cross-env DEMO_E2E=1 playwright test tests/e2e/browser/second-rfp-reuse.spec.ts --project=chromium` |
| `second-rfp-zero-tolerance.spec.ts` | **Validation stricte des hypothèses d'architecture** : Rejet immédiat si une hypothèse ne tient pas, obligation de motif. | `npx playwright test tests/e2e/browser/second-rfp-zero-tolerance.spec.ts` | `cross-env DEMO_E2E=1 playwright test tests/e2e/browser/second-rfp-zero-tolerance.spec.ts --project=chromium` |
| `lulu-demo.spec.ts` | **Démonstration de bout en bout Cas Réel Lulu** (Lot 1 NOC & Cœur 5G PPDR) : Reprise de l'audit live Claude scellé J0 (`run_lulu_live_j0`), exploration des 3 DC POST, matrice d'options UDR, contraintes Holdover GNSS 30j et arbitrage Porte G3. | `npx playwright test tests/e2e/browser/lulu-demo.spec.ts` | `npm run demo:lulu` |

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

### 4. Tests de Contrat & Propriétés
Dossiers : `tests/contract/` (~50 suites) et `tests/property/` (4 suites `fast-check`).

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
  * Banc boîte noire indépendant évaluant le couple Archinex + LLMOps sur 6 cas réels held-out du RFP Lulu (*Lulu*).
  * Conteneur Docker étanche avec volumes hôtes en lecture seule (`:ro`) et bac à sable en RAM :
    `docker compose -f docker-compose.test.yml up --build --abort-on-container-exit`
* **`LLMOps` (Hub de Connaissances)** :
  * Garde-fous de non-régression absolue : `test_frozen_interfaces.py` (formes figées MCP/REST) et `test_ladybug_version_guard.py` (moteur graphe < 0.21).
  * Image propre de test : `make test-docker` (`Dockerfile.test`).
  * Serveur de contrat de référence pour les clients : `Dockerfile.contract` (`llmops-contract:latest`).
