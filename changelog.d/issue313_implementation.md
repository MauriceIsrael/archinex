### Correctif Phase 4/5 : retrait d'une feuille ontologique et révocation de ratification (#313)
- **Exclusions explicites (`src/lib/server/edp/refinementCoverage.ts`, `src/routes/api/projects/[projectId]/subjects/[subjectId]/edp/+server.ts`)** :
  - Ajout de `excludedLeafUrns` dans `SubjectRefinementInput` et persistance dans l'EDP lors du retrait (`bindMode: 'remove'`) pour éviter la ré-inférence automatique par `autoBindFromText`.
  - Correction du message de retour lors du retrait d'une feuille ontologique et synchronisation de la révocation dans le registre projet.
- **Révocation d'un choix ratifié (`src/lib/server/edp/decisionSlotRegistry.ts`, `src/routes/api/projects/[projectId]/decision-slots/+server.ts`)** :
  - Ajout de `revokeProjectSlotRatification` et `getProjectRatificationAuditLog` avec journalisation d'audit (`revocations`), exposés en Phase 4 (`action: 'unratify'`) et en Phase 5 (`action: 'unratify_slot'`).
- **Interface Phase 4 & Phase 5 (`src/lib/components/deliberation/Phase4RefinementHub.svelte`, `src/lib/components/deliberation/LiveArchitectureLockView.svelte`)** :
  - Affichage du bouton `✕ Retirer` dès qu'une feuille est liée (même s'il n'y en a qu'une) et ajout du bouton `↺ Révoquer` avec confirmation pour revenir sur un choix ratifié.
- **Tests** :
  - Ajout de `tests/contract/edp-issue313-remove-and-unratify.test.ts`.
