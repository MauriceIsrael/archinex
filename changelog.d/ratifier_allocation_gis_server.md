### Correctif de ratification en Phase 5 sans `coverageInput` explicite
- **API Decision Slots (`src/routes/api/projects/[projectId]/decision-slots/+server.ts`)** :
  - Hydratation automatique du contexte projet depuis Prisma (`loadProjectHydrationContextFromDb`) dans `POST` lorsque `body.coverageInput` est absent (parité avec `GET`), évitant l'erreur « Aucun emplacement éligible à la ratification en lot n’a été trouvé. » lors de la ratification unitaire ou en lot depuis la Vue Architecture Lockée.
- **Tests** :
  - Ajout de `tests/contract/decision-slots-post-hydration.test.ts` couvrant la ratification unitaire, la ratification en lot et la révocation sans `coverageInput`.
