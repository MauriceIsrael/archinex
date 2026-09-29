# Proposition A1 — État serveur partagé

## 1. Contexte & Problématique
Dans l'état actuel (Lot A0), les projets sont stockés sous forme de colonnes JSON sérialisées (`subjects`, `drafts`, `statements`, `dialogueMessages`) dans la table `engagements`. De plus, le client web reposait historiquement sur `localStorage` comme cache persistant local.

Cette structure présente des limites majeures pour la co-conception :
- **Perte de données en cas d'éditions concurrentes** : écrasement du bloc JSON complet lors d'une sauvegarde concurrente.
- **Absence d'historique transactionnel fin** : impossible de tracer qui a modifié quel énoncé, pourquoi et selon quelle causalité.
- **Rétractation locale** : la cascade de rétractation (Invariant VI) est calculée localement côté client plutôt que garantie de manière atomique en base.

## 2. Solution Proposée
1. **Schéma Prisma normalisé** avec verrouillage optimiste (`version Int @default(1)`) :
   - `projects` : méta-informations du projet, stratégie, version.
   - `project_members` : membres avec rôles et domaines de spécialité.
   - `subjects` : sujets de délibération normalisés (`sectionRef`, `domain`, `problemStatement`, `maturityLevel`, `deliberationStatus`, `version`).
   - `statements` : énoncés épistémiques portant leurs 5 facettes en colonnes relationnelles.
   - `statement_antecedents` : table de liaison matérialisant le graphe de causalité pour la rétractation.
   - `questions` : questions d'architecture ouvertes ou bloquantes assignées à un rôle.
   - `domain_events` : journal d'événements append-only horodaté pour chaque mutation.
   - `project_frameworks` : état de couverture réglementaire du projet.

2. **API REST collaborative sous `/api/projects/[projectId]/...`** :
   - Opérations CRUD avec contrôle systématique de `expectedVersion` (renvoi `409 Conflict` en cas de collision).
   - Enregistrement atomique de chaque `DomainEvent` dans la même transaction Prisma que la mutation.
   - Flux d'événements `GET /api/projects/[projectId]/events?since=<eventId>`.
   - Contrôle d'accès Casbin par projet.

3. **Alignement du Store & Invariants** :
   - `deliberationStore.svelte.ts` ne stocke plus les projets en `localStorage` : le serveur est l'unique source de vérité.
   - Rejeu d'état possible via `replaySubject`.
   - Cascade de rétractation exécutée côté serveur dans une transaction Prisma.

4. **Outil de migration idempotent** :
   - `scripts/migrate-json-engagements.ts` convertit les projets existants (JSON) vers les tables relationnelles normalisées avec sauvegarde préalable.
