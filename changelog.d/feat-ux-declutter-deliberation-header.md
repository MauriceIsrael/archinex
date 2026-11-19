### Allégement visuel de l'en-tête global et du workbench de délibération
- **Workbench de délibération (`MaturityStepper.svelte`, `SubjectThreadView.svelte`)** :
  - Repli par défaut de la timeline de critères `MaturityStepper` (`initialExpanded = false`) avec compteur synthétique `Critères (X/Y)` pour libérer l'espace de lecture.
  - Passage par défaut de `SubjectThreadView` en mode onglets pleine largeur (`isSplitView = false`), la vue split côte-à-côte restant accessible via le bouton dédié.
- **En-têtes et services techniques (`+layout.svelte`, `ProjectEngagementHeader.svelte`)** :
  - Suppression de la répétition du titre d'engagement dans `ProjectEngagementHeader` (déjà affiché dans la pilule globale).
  - Regroupement des badges techniques `LLMOps` et `DocEngine` sous un indicateur compact « Services » dans l'en-tête global.
- **Tests** :
  - Mise à jour des tests de contrat dans `tests/contract/deliberation-conversation.test.ts` et `tests/contract/deliberation-header-refactor.test.ts`.
