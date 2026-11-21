# Marquage de traçabilité et push idempotent vers Nautobot

Référence : [ADR-017](../adr/ADR-017-nautobot-point-unique-reconciliation.md), issue #376. Code : `src/lib/server/edp/traceMarkers.ts`, `src/lib/server/edp/nautobotSync.ts`. Propriété des champs : [field-ownership.md](field-ownership.md).

## Champs personnalisés `archinex_*`

Chaque objet de la tranche minimale (Tenant, Device, Prefix, VLAN, IPAddress) porte :

| Champ | Contenu |
|---|---|
| `archinex_project` | projet (à défaut, scope de projet) |
| `archinex_subject_id` | sujet de délibération |
| `archinex_decision_id` | décision |
| `archinex_decision_revision` | révision de la décision (entier) |
| `archinex_clause_refs` | clauses (liste JSON triée) |
| `archinex_intent_hash` | empreinte d'intention `v1:<sha256>` |

Seuls les champs renseignés sont écrits. L'empreinte couvre **uniquement les champs d'intention** (registre de propriété) : jamais le statut, ni les champs réalisés, ni `tags` / `custom_fields`.

## Comportement du push

| Situation de l'objet | Action | Écriture |
|---|---|---|
| absent | `create` (en *Planned*, avec marqueurs) | oui |
| marqué, même empreinte | `noop` | **non** |
| marqué, empreinte différente | `update` (champs d'intention seulement) | oui |
| **non marqué** | `skip_unmarked` | **non** : jamais modifié, ni supprimé, ni rattaché à des interfaces ou IP |
| non marqué, adoption demandée (`adoptUnmarked`) | `adopt` (ajout des marqueurs) | oui |

Un second push de la même décision ne produit **aucune écriture** : les champs personnalisés, le statut *Planned*, les types de site, l'IP primaire et les objets de support sont tous comparés à l'existant avant d'écrire (`payloadAlreadyApplied`, prudent : au moindre doute l'écriture a lieu). Archinex **ne supprime jamais** d'objet.

## Simulation (`dryRun`)

`syncHydratedInventoryToNautobot(inventaire, { dryRun: true, ... })` n'envoie **aucune écriture** ; le résumé contient `plan` (actions sur les objets d'intention et écritures d'objets de support) et `planSummary` (« 3 création(s), 1 mise(s) à jour, 12 inchangé(s), 2 non marqué(s) ignoré(s) … »). Dans la route EDP, `POST …/edp` avec `action: "hydrate"` et `dryRun: true` renvoie ce plan dans `nautobotSyncSummary`.

## Prérequis Nautobot

- Nautobot 2.x ; le module VPN natif (hors tranche minimale) demande 2.2+.
- Le jeton du projet doit pouvoir **lire et créer des champs personnalisés** (`extras.customfield`) : ils sont créés au premier push, de façon idempotente, sur les cinq types.
- Les types de site utilisés doivent autoriser les types de contenu requis ; Archinex les **fusionne** avec l'existant (il n'en retire jamais).

## Limites connues

- Les objets créés par une version précédente d'Archinex n'ont pas de marqueurs : ils sont ignorés tant que l'adoption n'est pas demandée explicitement.
- Les empreintes `v1:` se comparent champ par champ dans la détection de dérive ; l'ancienne comparaison de résumé complet n'est conservée que pour les empreintes sans préfixe.
- Hors tranche minimale (circuits, VPN) : comportement historique, gelé (ADR-017).
