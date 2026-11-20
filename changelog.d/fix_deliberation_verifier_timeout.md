### Corrigé
- **Critère L2 → L3 « Vérificateur d’architecture passé » (`src/lib/domain/maturityCriteria.ts`, `src/lib/server/projects/maturityCriteriaService.ts`)** : introduction du prédicat partagé `hasVerifierPassed()` afin qu'un constat `verification` conforme (`resolution: 'open'`) valide bien le critère, tandis qu'une violation/non-conformité ouverte le maintient bloqué jusqu'à résolution (`answered` ou `accepted_risk`).
- **Résolution des non-conformités dans le fil (`src/lib/components/deliberation/SubjectMessageBubble.svelte`)** : affichage des actions de clôture / acceptation de risque sur les constats `verification` signalant une non-conformité.
- **Agents interactifs de délibération (`src/lib/server/agents/verifier.ts`, `proposer.ts`, `challenger.ts`, `synthesizer.ts`, `agentConfig.ts`, `debateOrchestrator.ts`)** :
  - Délai dédié `INTERACTIVE_AGENT_TIMEOUT_MS` (2 min par défaut, surchargeable par variable d'environnement) et `effort: 'medium'` pour éviter les attentes silencieuses prolongées.
  - Bascule sur le repli déterministe lorsque le filtrage `optionId`/`kbRefs` vide les résultats LLM (au lieu de renvoyer silencieusement `[]`), avec résolution tolérante de `optionId` par titre d'option.
  - Enrichissement du contexte doctrinal avec les règles locales du `CorpusDocument` si LLMOps ne remonte aucune règle.
- **Retour UI et garde-fous (`src/lib/components/deliberation/MaturityStepper.svelte`, `SubjectThreadView.svelte`, `src/routes/api/projects/[projectId]/subjects/[subjectId]/debate/+server.ts`)** :
  - État de chargement (spinner + bouton désactivé) sur les boutons d'action agent du stepper L2 → L3.
  - Timeout client (`AbortController`), garde de changement de sujet, notification d'avertissement explicite si 0 constat est produit, et correction de `actor.userId` (`sessionUser?.id` au lieu de `'current-user'`).
