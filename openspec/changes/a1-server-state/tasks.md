# Tâches du Lot A1 — État serveur partagé (Porte G2 - Partie 1)

- [x] **1. Schéma Prisma Normalisé & Migration**
  - [x] 1.1 Enrichir `prisma/schema.prisma` avec `Project`, `ProjectMember`, `Subject`, `Statement`, `StatementAntecedent`, `Question`, `DomainEvent`, `ProjectFramework`.
  - [x] 1.2 Exécuter `npx prisma db push` et `npx prisma generate` pour générer le client typé.
  - [x] 1.3 Créer `scripts/migrate-json-engagements.ts` avec options `--dry-run` et `--backup <file>` pour migrer de façon idempotente les engagements JSON existants vers les tables normalisées.

- [x] **2. Services Serveur & Gestion de Concurrence Optimiste**
  - [x] 2.1 Créer `src/lib/server/projects/projectsDb.ts` (CRUD normalisé avec `version Int`, contrôle de concurrence `expectedVersion` renvoyant 409 et émission atomique de `DomainEvent`).
  - [x] 2.2 Implémenter la cascade de rétractation transactionnelle serveur dans `src/lib/server/projects/retractionCascade.ts`.
  - [x] 2.3 Implémenter la fonction de rejeu d'état `replaySubject(events)` dans `src/lib/domain/eventReplay.ts`.

- [x] **3. Routes API REST Normalisées**
  - [x] 3.1 Définir les schémas Zod d'entrée dans `src/lib/schemas/projectApiSchemas.ts`.
  - [x] 3.2 Créer les routes `src/routes/api/projects/[projectId]/subjects/+server.ts` et `.../subjects/[subjectId]/+server.ts` (GET, POST, PATCH avec `expectedVersion`, DELETE).
  - [x] 3.3 Créer les routes pour statements, questions, members sous `src/routes/api/projects/[projectId]/...`.
  - [x] 3.4 Créer la route d'événements `src/routes/api/projects/[projectId]/events/+server.ts` (polling `?since=<eventId>`).
  - [x] 3.5 Appliquer les autorisations Casbin sur les ressources projets.

- [x] **4. Adaptation du Store & Disparition du localStorage Métier**
  - [x] 4.1 Retirer toute écriture/lecture de `localStorage` pour les données de projet et de délibération dans `src/lib/stores/deliberationStore.svelte.ts`.
  - [x] 4.2 Brancher les mutations du store sur les endpoints `/api/projects/[projectId]/...` avec gestion optimiste et rollback sur 409.

- [x] **5. Tests & Validation de Concurrence**
  - [x] 5.1 Créer `tests/integration/concurrency-optimistic-locking.test.ts` (deux clients avec même `expectedVersion` -> 1 succès, 1 conflit 409 sans corruption).
  - [x] 5.2 Créer `tests/integration/domain-event-replay.test.ts` (vérification de la reconstruction de sujet par `replaySubject`).
  - [x] 5.3 Valider la migration sur `examples/` (`tests/integration/project-migration.test.ts`).
  - [x] 5.4 Valider `npm run verify`.
