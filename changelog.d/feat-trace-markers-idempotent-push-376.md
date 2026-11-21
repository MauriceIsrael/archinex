### Marquage de traçabilité `archinex_*` et push Nautobot idempotent, avec simulation (#376)
- **Marquage (`src/lib/server/edp/traceMarkers.ts`, `nautobotSync.ts`)** :
  - Chaque objet de la tranche minimale (Tenant, Device, Prefix, VLAN, IP) porte `archinex_project`, `archinex_subject_id`, `archinex_decision_id`, `archinex_decision_revision`, `archinex_clause_refs` et l'empreinte d'intention `archinex_intent_hash` (`v1:<sha256>` sur les seuls champs d'intention). Champs personnalisés créés de façon idempotente (`ensureTraceCustomFields`).
  - La route EDP (`action: "hydrate"`) fournit projet, sujet, décision et révision.
- **Push idempotent** : même intention = aucune écriture (création en Planned, `noop`, `update` des seuls champs d'intention). Un objet **non marqué** n'est jamais modifié, supprimé ni rattaché à des interfaces ou IP (adoption seulement sur demande, `adoptUnmarked`). Archinex ne supprime jamais d'objet.
- **Corrections** : types de site fusionnés avec l'existant au lieu d'être remplacés par une liste fixe ; IP primaire et objets de support réécrits seulement s'ils diffèrent.
- **Simulation** : `dryRun` n'envoie aucune écriture et renvoie `plan` et `planSummary` (`nautobotSyncSummary`).
- **Dérive (`driftService.ts`)** : les empreintes `v1:` se comparent champ par champ ; la comparaison de résumé complet (qui inclut identifiant et statut) ne s'applique plus qu'aux anciennes empreintes.
- **Registre (`fieldOwnership.ts`)** : `primary_ip4` / `primary_ip6` sont de l'intention tant qu'Archinex calcule l'adresse.
- **Tests & Documentation** : ajout de `tests/contract/trace-markers-idempotent-push.test.ts` (11 tests, Nautobot simulé à état) et de `docs/edp/nautobot-trace-markers.md`.
