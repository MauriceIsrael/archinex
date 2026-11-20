### Correctif du statut d'hydratation Nautobot lorsque l'instance est arrêtée
- **Client Nautobot (`src/lib/server/edp/nautobotSync.ts`)** :
  - Enregistrement explicite de l'erreur de connexion dans `errors` (`Nautobot injoignable (...)`) lors de l'échec du probe `/api/status/` dans `syncHydratedInventoryToNautobot` et `pullLiveInventoryFromNautobot`.
- **Endpoint EDP (`src/routes/api/projects/[projectId]/subjects/[subjectId]/edp/+server.ts`)** :
  - Pour `action === 'hydrate'`, retourne `success: false`, `notificationType: 'warning'` et un message explicite (`Nautobot injoignable (...) — synchronisation SSoT non effectuée`) lorsque Nautobot est inaccessible ou en erreur partielle, au lieu d'un faux message de succès.
- **Atelier Phase 4 (`src/lib/components/deliberation/Phase4RefinementHub.svelte`)** :
  - Utilisation du niveau de notification `'warning'` dans `triggerEdpAction` lorsque `nautobotSynced === false` ou `notificationType === 'warning'`, et affichage d'un bandeau d'état persistant (`phase4-nautobot-sync-warning` / `phase4-nautobot-sync-ok`) dans le bloc d'hydratation LLD.
- **Tests** :
  - Ajout de `tests/contract/edp-nautobot-hydration-status.test.ts` couvrant l'indisponibilité Nautobot sur le client et l'API EDP.
