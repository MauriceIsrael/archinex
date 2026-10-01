# Tâches A7 — Boîte de Revue des Experts, Actions et Notifications (Porte G5)

## 1. Schéma Prisma & Persistance
- [x] 1.1 Ajouter les modèles `KbNotification` et `KbEventCursor` dans `prisma/schema.prisma`.
- [x] 1.2 Exécuter `npx prisma db push` et `npx prisma generate`.

## 2. Types & Simulation LLMOps
- [x] 2.1 Définir les types `KbReviewInboxItem`, `KbCandidateDetail`, `KbAutomaticCheck`, `KbComment`, `KbEvent` dans `src/lib/types/llmops.ts`.
- [x] 2.2 Mettre à jour `tests/helpers/fakeLlmops.ts` pour gérer l'inbox, les détails candidat avec 7 contrôles, les actions `accept/amend/reject`, la réassignation, la seconde revue, les commentaires et le flux d'événements.

## 3. Client LLMOps & Service d'Événements
- [x] 3.1 Implémenter les méthodes client dans `src/lib/server/llmops/client.ts` (`getReviewInbox`, `getCandidate`, `reviewCandidate`, `assignCandidate`, `requestReview`, `getComments`, `addComment`, `pollEvents`).
- [x] 3.2 Créer `src/lib/server/kbNotifications.ts` avec le polling idempotent et la distribution locale des notifications.

## 4. Routes API
- [x] 4.1 Implémenter `GET /api/knowledge/reviews/inbox`.
- [x] 4.2 Implémenter `GET /api/knowledge/candidates/[id]` et `PATCH /api/knowledge/candidates/[id]` (avec gestion 403 et 409).
- [x] 4.3 Implémenter `POST /api/knowledge/candidates/[id]/assign` et `POST /api/knowledge/candidates/[id]/request-review`.
- [x] 4.4 Implémenter `GET /api/knowledge/candidates/[id]/comments` et `POST /api/knowledge/candidates/[id]/comments`.
- [x] 4.5 Implémenter `GET /api/knowledge/notifications` et `POST /api/knowledge/notifications/poll`.

## 5. Interface Utilisateur
- [x] 5.1 Créer la page Boîte de Réception `/kb/reviews/+page.svelte` et `+page.server.ts` avec filtres et alertes d'échéance.
- [x] 5.2 Créer la page Fiche de Revue `/kb/reviews/[id]/+page.svelte` et `+page.server.ts` avec affichage des 7 contrôles, éditeur d'amendement, modale de rejet et fil de commentaires.
- [x] 5.3 Intégrer le centre de notifications (badge et panneau déroulant) dans la navigation générale.

## 6. Tests & Validation Porte G5
- [x] 6.1 Rédiger les tests de contrat `tests/contract/kb-reviews.test.ts`.
- [x] 6.2 Rédiger les tests d'intégration `tests/integration/expert-review-inbox.test.ts`.
- [x] 6.3 Vérifier que `npm run verify` passe l'ensemble des 4 portes.
- [x] 6.4 Mettre à jour `USER_GUIDE.md` et `ARCHITECTURE.md`.
