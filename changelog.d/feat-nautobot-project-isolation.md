### Isolation multi-projets & configuration par projet pour Nautobot 2.x SSoT
- **Configuration par projet (`src/lib/domain/engagements.ts`)** :
  - Ajout de `ProjectNautobotConfig` sur `ProjectStrategy.nautobot` (`url`, `token`, `isolationPrefix`, `isolateByProject`).
- **Isolation logique & résolution de scope (`src/lib/server/edp/nautobotSync.ts`)** :
  - Ajout de `resolveProjectNautobotOptions`, `normalizeProjectScope`, `scopedNautobotName`, `unscopeNautobotName`, `belongsToProjectScope` et `projectTagName`.
  - Lorsque `projectScope` est actif (par défaut sur une instance Nautobot partagée), `syncHydratedInventoryToNautobot` isole les objets par projet (`Namespace` IPAM `archinex-<scope>`, `VLANGroup` `vg-<scope>`, tag `project-<scope>`, préfixage `<scope>--` des Tenants, Circuits, VRFs, Devices et objets VPN) et `pullLiveInventoryFromNautobot` filtre et dépréfixe les objets du projet sans fuite entre projets.
- **Endpoints EDP & Webhook (`src/routes/api/projects/[projectId]/subjects/[subjectId]/edp/+server.ts`, `src/routes/api/webhooks/nautobot/+server.ts`)** :
  - Résolution automatique des options Nautobot du projet avant les appels push/pull.
- **Tests & Documentation** :
  - Ajout de `tests/contract/edp-nautobot-project-isolation.test.ts` et mise à jour de `ARCHITECTURE.md` et `USER_GUIDE.md`.
