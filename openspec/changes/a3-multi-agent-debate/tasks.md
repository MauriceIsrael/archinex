# Tâches du Lot A3 — Débat Multi-Agents Borné (Porte G3 - Partie 1)

- [x] **1. Modèle de Domaine & Fonctions Pures**
  - [x] 1.1 Créer `src/lib/domain/debate.ts` (interfaces `Argument`, `DebateRun`, `Stance`, `validateArgument`).
  - [x] 1.2 Écrire les tests de contrat de domaine dans `tests/contract/debate-argument.test.ts`.

- [x] **2. Schéma Prisma & Persistance**
  - [x] 2.1 Enrichir `prisma/schema.prisma` avec `Argument` et `DebateRun`.
  - [x] 2.2 Exécuter `npx prisma db push` et `npx prisma generate`.
  - [x] 2.3 Créer `src/lib/server/projects/debateDb.ts` (CRUD normalisé, gestion des rounds, résolution d'objections, et `DomainEvent`).

- [x] **3. Agents Spécialisés & Orchestration Bornée**
  - [x] 3.1 Créer les prompts versionnés sous `src/lib/server/agents/prompts/` (`proposer.md`, `challenger.md`, `verifier.md`, `synthesizer.md`).
  - [x] 3.2 Implémenter les 4 agents avec validation Zod (`proposer.ts`, `challenger.ts`, `verifier.ts`, `synthesizer.ts`).
  - [x] 3.3 Implémenter l'orchestrateur de débat `src/lib/server/agents/debateOrchestrator.ts` (borne max 3 rounds, priorisation des interventions humaines).

- [x] **4. Routes API REST**
  - [x] 4.1 Définir les schémas Zod dans `src/lib/schemas/debateApiSchemas.ts`.
  - [x] 4.2 Créer les routes sous `src/routes/api/projects/[projectId]/subjects/[subjectId]/...` :
    - `arguments/+server.ts`
    - `arguments/[argumentId]/resolve/+server.ts`
    - `debate/+server.ts`

- [x] **5. Interface IHM : Fil de Débat Structuré**
  - [x] 5.1 Créer `src/lib/components/deliberation/DebateThreadView.svelte` (regroupement par option, affichage des stances, actions humaines: répondre, accepter le risque).
  - [x] 5.2 Remplacer ou enrichir le panneau de discussion dans `src/lib/components/deliberation/TelegraphicDraftView.svelte` (onglet 2).

- [x] **6. Tests & Validation de Porte**
  - [x] 6.1 Créer `tests/integration/multi-agent-debate.test.ts` (test avec `fakeLlm` déterministe).
  - [x] 6.2 Valider la porte `npm run verify`.
