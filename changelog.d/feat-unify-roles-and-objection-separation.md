### Uniformisation des rôles (`admin` vs `lead_architect`) et séparation auteur/arbitre sur les objections
- **Résolution du rôle projet (`src/lib/server/projects/actorHelper.ts`, `src/routes/api/projects/[projectId]/subjects/[subjectId]/arguments/[argumentId]/resolve/+server.ts`, `src/lib/components/deliberation/DeliberationWorkbench.svelte`)** :
  - `resolveProjectActor` résout désormais systématiquement le rôle du membre sur le projet (`participants` / `project_members`), même lorsque son rôle global de session est `admin`.
  - Côté UI, `DeliberationWorkbench.svelte` priorise le rôle projet (`deliberationStore.currentRole`) sur le rôle de session (`sessionRole`).
- **Séparation stricte des pouvoirs (`src/lib/domain/options.ts`, `src/lib/server/projects/arbitrationDb.ts`, `src/lib/domain/maturityCriteria.ts`)** :
  - Retrait du rôle `admin` des fonctions d'arbitrage projet (`canDecideAlone`, `canArbitrateSubject`, `maturityCriteria`) : l'`admin` gère la plateforme (utilisateurs/groupes/droits), le `lead_architect` prend les décisions sur le projet.
- **Séparation auteur/arbitre sur les objections (`src/lib/domain/debate.ts`, `src/lib/server/projects/debateDb.ts`, `src/lib/components/deliberation/SubjectMessageBubble.svelte`, `src/lib/components/deliberation/PinnedObjections.svelte`)** :
  - L'auteur d'une objection ne peut plus la clore lui-même (`answered` / `accepted_risk`), mais conserve le droit de la retirer (`withdrawn`). Un autre `lead_architect` ou `domain_expert` du projet doit statuer.
- **Tests** :
  - Ajout de `tests/contract/role-unification-and-objection-separation.test.ts`.
