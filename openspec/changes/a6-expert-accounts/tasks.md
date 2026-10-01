# Tâches A6 — Comptes Experts, Rôles KB & Propagation d'Identité

## 1. Modèle de données & Prisma
- [x] 1.1 Ajouter le modèle `KbProfile` et la relation 1:1 avec `User` dans `prisma/schema.prisma`.
- [x] 1.2 Exécuter `npx prisma db push` et `npx prisma generate`.
- [x] 1.3 Mettre à jour `prisma/seed-dev.ts` pour inclure des profils experts de test et les règles Casbin correspondantes.

## 2. Types & Client LLMOps
- [x] 2.1 Étendre `src/lib/types/llmops.ts` avec `KbOwner`, `KbOwnersRegistry`, `KbUserProfile`, `KbMeResponse`.
- [x] 2.2 Adapter `src/lib/server/llmops/client.ts` pour gérer `X-Actor-Email` et implémenter `getOwners()`, `updateOwners()`, `getMe()`.
- [x] 2.3 Mettre à jour `tests/helpers/fakeLlmops.ts` pour simuler les routes `/api/knowledge/owners` et `/api/knowledge/me`.

## 3. Persistance & Logique Métier Expert
- [x] 3.1 Créer `src/lib/server/kbProfilesDb.ts` avec création d'invitation (validité 7 jours), activation de compte, listing, modification et synchronisation Casbin.
- [x] 3.2 Créer le helper d'autorisation `src/lib/auth/kbGuard.server.ts` pour vérifier les droits `kb:*`.

## 4. Routes API
- [x] 4.1 Implémenter `GET /api/admin/experts` et `POST /api/admin/experts` (invitation d'expert).
- [x] 4.2 Implémenter `PATCH /api/admin/experts/[id]` et `DELETE /api/admin/experts/[id]`.
- [x] 4.3 Implémenter `POST /api/invite/activate` (activation via token d'invitation).
- [x] 4.4 Implémenter `GET /api/knowledge/me` (profil KB et revues en attente).

## 5. Interface Utilisateur
- [x] 5.1 Ajouter l'onglet « Experts KB » dans `/admin/+page.svelte` et les composants de gestion d'experts.
- [x] 5.2 Créer la page d'activation d'invitation `/invite/+page.svelte`.
- [x] 5.3 Créer la page de profil expert `/kb/me/+page.svelte`.

## 6. Tests & Validation
- [x] 6.1 Rédiger les tests de contrat `tests/contract/kb-profiles.test.ts`.
- [x] 6.2 Rédiger les tests d'intégration `tests/integration/expert-accounts.test.ts`.
- [x] 6.3 Vérifier que `npm run verify` passe l'ensemble des 4 portes (denylist, tests, svelte-check, build).


