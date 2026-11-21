### Suppression du mode expérimental EDP : le sous-système est toujours actif
- **Code (`edpRepository.ts`, route `.../edp/+server.ts`, `deliberation/+page.server.ts`, `+page.svelte`, `ProjectEngagementHeader.svelte`, `EdpCard.svelte`)** :
  - Suppression du drapeau `ARCHINEX_EXPERIMENTAL_EDP`, de `isEdpFeatureEnabled`, de `FeatureDisabledError`, de la propriété `isExperimentalEnabled` et du paramètre `?edp=0|1`.
  - Les onglets Phase 4 et Phase 5, la route API EDP et le dépôt EDP sont désormais **toujours disponibles**, y compris en production (auparavant masqués ou inactifs en production sans le drapeau). Retrait du badge « EXPÉRIMENTAL » de la carte EDP.
- **Tests** : `edp-ontology-and-persistence`, `edp-palier-5`, `edp-ui-integration`, `phase5-header-and-pillars` adaptés ; un test vérifie l'absence de toute référence au drapeau.
- **Documentation** : `USER_GUIDE.md` §13, `ARCHITECTURE.md` §12, `docs/edp/evaluation-plan.md`, exemple de workflow, amendement de l'ADR-016 (condition « feature flag » caduque).
