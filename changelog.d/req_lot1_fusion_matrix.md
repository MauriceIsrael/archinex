### Propositions initiales dans la matrice de décision (passe directe & `@proposer`)
- **Factorisation directe (`src/lib/server/llm/rfpFactorizer.ts`, `src/lib/domain/factorization.ts`)** :
  - Génération et normalisation (`normalizeProposal`) du bloc `proposal` (`options`, `criteria`, `evaluations`, `singleOptionRationale`) lors de la passe directe holistique et de la consolidation Map-Reduce, afin d'alimenter automatiquement la matrice de décision dès l'import d'un RFP.
- **Délibération (`src/lib/server/agents/proposer.ts`, `src/lib/server/agents/debateOrchestrator.ts`, `src/lib/server/projects/proposalSeeder.ts`, `src/lib/components/deliberation/OptionsMatrix.svelte`, `src/lib/components/deliberation/SubjectThreadView.svelte`)** :
  - Lorsqu'aucune option n'est encore formalisée sur un sujet, l'agent `@proposer` génère une proposition structurée (`options`, `criteria`, `evaluations`) matérialisée en base (`llm-proposed`) sans dupliquer les critères existants.
  - Ajout d'un bouton `Proposer options & critères (@proposer)` directement dans `OptionsMatrix.svelte` lorsque la matrice est vide.
- **Tests** :
  - Ajout de `tests/contract/proposal-matrix-seeding.test.ts` couvrant la factorisation directe, `@proposer` et `seedSubjectProposal`.
