# Design Technique : Lot A0 — Assainissement & Externalisation de la Doctrine

## 1. Architecture Cible & Flux

```
               [ Spécification Entrée / RFP ]
                             │
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │                 ARCHINEX (Client / Serveur)             │
  │  - État des projets & déroulé de co-conception (6 étapes)│
  │  - Code générique dans src/ (zéro nom de projet)        │
  │  - Zéro doctrine codée en dur                            │
  └──────────────┬───────────────────────────▲──────────────┘
                 │                           │
  Doctrine &     │ POST /api/knowledge/check │ Contexte Doctrine
  Vérifications  │ POST candidates           │ GET /api/knowledge/context
                 ▼                           │
  ┌──────────────────────────────────────────┴──────────────┐
  │                   LLMOps (Serveur MCP)                  │
  │  - get_doctrine_context (contexte applicable)           │
  │  - check_option (verdicts supports / violates)          │
  │  - Couverture réglementaire & File de candidats KB       │
  │  - Instantané scellé pour repli hors-ligne               │
  └─────────────────────────────────────────────────────────┘
```

## 2. Découpage des Responsabilités

### 2.1 Sortie des données d'exemples
- `examples/<projet>/` : contient les fichiers JSON `project.json`, `subjects.json`, `statements.json`, `corpus/*.json`, `dialogue.json`.
- `scripts/seed.ts` : injecte un exemple dans la base de données SQLite/PostgreSQL de façon idempotente (upsert par id).
- `src/lib/domain/engagements.ts` : allégé pour ne conserver que les interfaces TypeScript, types de schémas et fonctions de transformation pures.
- `src/lib/domain/corpus.ts` : allégé de `INITIAL_CORPUS_DOCUMENTS`.
- `src/lib/stores/deliberationStore.svelte.ts` : initialise `activeEngagementId = ''` et un tableau vide d'engagements par défaut si aucune donnée n'est présente.

### 2.2 Externalisation de la doctrine
- Création de `src/lib/server/doctrine/doctrineService.ts` :
  - Fournit `getDoctrineContext(subjectId, domains, frameworks)`.
  - Cache en mémoire LRU/Map indexé par `(subject, domains.sort().join(), frameworks.sort().join())`.
  - Appelle `llmopsClient.getDoctrineContext(...)`.
  - En mode hors-ligne, filtre l'instantané scellé `llmops-sealed-snapshot.json` sans jamais inventer de règles ni de verdicts.
- Retrait de `KNOWN_DOCTRINE_RULES`, `detectProactiveDoctrineRecalls` de `src/lib/domain/dialectic.ts`.
- Retrait de `DEFAULT_KB_STANDARDS` de `src/lib/server/llm/rfpFactorizer.ts`. Les prompts reçoivent la doctrine dynamique ou la mention explicite « aucune doctrine disponible ».

### 2.3 Contrats LLMOps
- Dans `src/lib/types/llmops.ts` :
  - `DoctrineContext`
  - `CheckResult`
  - `FrameworkCoverage`
  - `KbCandidate`
- Dans `src/lib/server/llmops/client.ts` :
  - `getDoctrineContext(params)`
  - `checkOption(params)`
  - `getFrameworkCoverage(engagement)`
  - `setApplicableFrameworks(engagement, frameworks)`
  - `submitCandidate(candidate)`
  - `listCandidates(filter)`
  - Gestion du repli hors-ligne rigoureux (`offline: true`, statut `unassessed` pour les vérifications, aucune invention).
- Faux serveur de test dans `tests/helpers/fakeLlmops.ts`.

### 2.4 Tests et Garde-fous
- `scripts/check-no-project-names.mjs` : lit `.project-names-denylist` et scanne récursivement `src/` (insensible à la casse).
- Script `pretest` dans `package.json` : assure `prisma generate && svelte-kit sync` avant chaque exécution de tests.
- `tests/helpers/clean-slate-environment.ts` : conditionne les tests Docker à `process.env.TEST_CONTAINERS === '1'`.
