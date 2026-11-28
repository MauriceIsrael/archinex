### Correction du filtrage par tag Nautobot 2.x lors de la réconciliation et du pull live
- **Synchronisation & Réconciliation Nautobot (`src/lib/server/edp/nautobotSync.ts`, `src/lib/server/edp/reconciliationJob.ts`)** :
  - Remplacement du paramètre de filtre obsolète `&tag=` (Nautobot 1.x / NetBox, rejeté en HTTP 400 `Unknown filter field` sous Nautobot 2.x avec `STRICT_FILTERING = True`) par le filtre Nautobot 2.x `&tags=` via le helper mutualisé `resolveProjectTagFilter`.
  - Vérification préalable de l'existence du tag projet (`project-<scope>`) et de ses `content_types` dans `/api/extras/tags/` afin d'éviter un HTTP 400 (`Select a valid choice`) sur un projet jamais encore synchronisé ou sur un modèle non couvert, avec maintien de l'isolation côté client (préfixe de scope, marqueurs `archinex_*`, namespace / VLAN group).
  - Ajout de `ipam.vlan` et `ipam.ipaddress` aux `content_types` du tag d'isolation projet et rattachement du tag projet aux VLANs et adresses IP synchronisés.
- **Tests** :
  - Durcissement des mocks Nautobot dans `tests/contract/edp-nautobot-project-isolation.test.ts` et `tests/integration/reconciliation-job.test.ts` pour simuler `STRICT_FILTERING = True` (rejet HTTP 400 de `tag` singulier et de `tags` inconnus/hors `content_types`) et ajout de cas de non-régression dédiés.
