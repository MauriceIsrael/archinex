### Plafonnement épistémique des arguments `llm-derived` (invariant `verified × llm-derived`)
- **Domaine & Persistance (`src/lib/domain/debate.ts`, `src/lib/server/projects/debateDb.ts`, `src/lib/server/prismaFactory.ts`, `src/lib/server/agents/verifier.ts`)** :
  - Ajout de `capArgumentConfidence` (`LLM_DERIVED_MAX_CONFIDENCE = 'designed'`) et rejet explicite de la combinaison `confidence='verified'` × `productionMode='llm-derived'` dans `validateArgument`.
  - Plafonnement automatique à `designed` avec avertissement journalisé (`console.warn`) dans `createArgument` lorsqu'un agent (`llm-derived`) retourne `confidence: 'verified'`.
  - Ajout d'un garde-fou Prisma (`$extends`) dans `createPrismaClient` bloquant tout contournement direct (`create`, `createMany`, `createManyAndReturn`, `update`, `updateMany`, `upsert`) de l'invariant `verified × llm-derived` sur `Argument`.
  - Alignement du prompt système de `verifier.ts` afin de ne plus demander `"confidence": "verified"` au modèle.
- **Tests & Documentation** :
  - Ajout de `tests/contract/epistemic-argument-confidence.test.ts` couvrant le domaine, le plafonnement + journalisation dans `createArgument` et le garde-fou Prisma.
  - Mise à jour de `ARCHITECTURE.md` (§2) précisant que l'invariant `verified × llm-derived` couvre à la fois les énoncés et les arguments.
