### Ajouté
- **Phase 2 (Délibération) — Tiroir des exigences RFP rattachées (`SubjectRequirementsDrawer`)** : expose directement dans `SubjectThreadView` les exigences RFP liées au sujet (référence de clause, titre, criticité et texte complet dépliable), alimentées par `GET /api/projects/[projectId]/subjects/[subjectId]/workbench` (`resolveSubjectRequirements`).

### Modifié
- **Phase 3 (Rendu HLD)** : recentrage de `HldFragmentView` sur le rendu et l'homologation avec une section « Traçabilité · Exigences couvertes » compacte et repliée par défaut (incluant le texte complet à la demande et un lien direct vers la Phase 2).
- **Onglet Doctrines & Brouillon** : libellé clarifié en `{doctrineItems.length} doctrines · {citedKbRefs.length} citées` pour éviter toute confusion avec les exigences RFP.
