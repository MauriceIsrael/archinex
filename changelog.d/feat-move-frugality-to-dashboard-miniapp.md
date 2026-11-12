### Top 5 des opportunités de frugalité dans la miniapp Tableau de bord
- **Composant Miniapp Tableau de Bord (`src/lib/components/dashboard/FrugalityOpportunitiesCard.svelte`, `src/routes/+page.svelte`, `+page.server.ts`)** :
  - Déplacement du composant de la vue `/deliberation` vers la miniapp **Tableau de bord** (`/`), au sein de la vue exécutive principale du portefeuille d'architecture.
  - Calcul et hydratation serveur automatique (`+page.server.ts`), avec filtrage par projet et ouverture directe du sujet dans l'atelier de délibération via `switchEngagement()`.
- **Endpoints API Projet & Global (`/api/frugality-opportunities`, `/api/projects/[projectId]/frugality-opportunities`)** :
  - Extraction serveur et calcul à la volée du Top 5 des opportunités au niveau global (portefeuille) ou ciblé par projet.
- **Tests & Documentation** :
  - Mise à jour de `USER_GUIDE.md` (Section 14.1) et tests unitaires / intégration complets.
