# Tâches d'Implémentation : Tableau de Bord KB, Publication Scellée et Porte G7 (Lot A11 - Issue #6)

- [x] 1. Types & Client LLMOps
  - [x] 1.1 Définir les types TypeScript (`KbHealthMetrics`, `KbPublication`, `KbCampaign`) dans `src/lib/types/llmops.ts`.
  - [x] 1.2 Implémenter le simulateur health, publications et campagnes dans `tests/helpers/fakeLlmops.ts`.
  - [x] 1.3 Implémenter les méthodes client dans `src/lib/server/llmops/client.ts` (`getKbHealth`, `listKbPublications`, `publishKbDoctrine`, `listKbCampaigns`, `createKbCampaign`, `updateKbCampaign`).

- [x] 2. Routes API Serveur Archinex
  - [x] 2.1 Implémenter `GET /api/knowledge/health/+server.ts`.
  - [x] 2.2 Implémenter `GET` et `POST /api/knowledge/publications/+server.ts` avec vérification des rôles (`kb:admin`/`kb:maintain`) et contrôle de la Porte G7 (409 Conflict si bloqué).
  - [x] 2.3 Implémenter `GET` et `POST /api/knowledge/campaigns/+server.ts` et `PATCH /api/knowledge/campaigns/[id]/+server.ts`.

- [x] 3. Interface Utilisateur & Intégration
  - [x] 3.1 Créer la page de tableau de bord `/kb/dashboard/+page.server.ts` et `+page.svelte`.
  - [x] 3.2 Afficher le bandeau d'alerte stockage éphémère (Mode Démo) si `storage.mode === "demo"`.
  - [x] 3.3 Implémenter la section de publication scellée (Porte G7) avec modale de publication et historique des snapshots SHA-256.
  - [x] 3.4 Implémenter la section des campagnes d'enrichissement ciblées avec création et suivi de progression.
  - [x] 3.5 Ajouter le lien de navigation dans le menu utilisateur de `src/routes/+layout.svelte`.

- [x] 4. Tests, Documentation & Validation
  - [x] 4.1 Tests de contrat `tests/contract/dashboard-publication.test.ts`.
  - [x] 4.2 Tests d'intégration `tests/integration/gate-g7-publication.test.ts`.
  - [x] 4.3 Documentation dans `USER_GUIDE.md` et `ARCHITECTURE.md`.
  - [x] 4.4 Exécution des 4 portes de qualité (`npm run verify`).

