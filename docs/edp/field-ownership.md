# Propriété des champs et cycle de vie des statuts (Nautobot)

Référence : [ADR-017](../adr/ADR-017-nautobot-point-unique-reconciliation.md), issue #398. Code : `src/lib/domain/edp/fieldOwnership.ts`.

## Principe

Archinex crée les objets Nautobot au statut **Planned**. Ils évoluent ensuite par les **connecteurs** et l'enforcement dans le système réel, qui écrivent leur état dans Nautobot. Archinex **lit** cet état ; il ne force jamais un statut « réalisé ».

Chaque champ appartient à une classe :

| Classe | Propriétaire | Effet |
|---|---|---|
| `intent` | Archinex | réécrit à chaque push ; une modification externe est un **écart** |
| `realized` | connecteurs | jamais écrasé par Archinex ; une évolution légitime n'est **pas** un écart |
| `operational` | personne | libre, non surveillé, jamais écrasé |

Champ ou type inconnu du registre : `operational`. `archinex_*` : `intent`. `realized_*` : `realized`.

## Registre (tranche minimale, version 1)

| Type | Intention | Réalisé |
|---|---|---|
| `tenancy.tenant` | `name`, `tenant_group`, `tags`, `custom_fields` | (aucun : un Tenant n'a pas de statut) |
| `dcim.device` | `name`, `device_type`, `role`, `tenant`, `location`, `platform`, `oob_ip`, `power_feeds`, `interfaces`, `primary_ip4`, `primary_ip6`, `comments`, `tags`, `custom_fields` | `status`, `serial`, `software_version` |
| `ipam.prefix` | `prefix`, `namespace`, `tenant`, `vlan`, `tags`, `custom_fields` | `status` |
| `ipam.vlan` | `vid`, `name`, `vlan_group`, `tenant`, `location`, `tags`, `custom_fields` | `status` |
| `ipam.ipaddress` | `address`, `dns_name`, `parent`, `tenant`, `tags`, `custom_fields` | `status` |

`address`, `primary_ip4` et `primary_ip6` sont des intentions tant qu'Archinex calcule l'adresse ; elle deviendra réalisée quand l'allocation sera déléguée à l'IPAM de Nautobot (#351).

## Statuts

Chemin nominal : `planned` → `staged` / `provisioning` → `active`.

| Statut observé (attendu `planned`) | Verdict | Écart ? |
|---|---|---|
| identique | `unchanged` | non |
| plus avancé dans le chemin nominal | `progress` | **non** (réalisation légitime) |
| `failed`, `offline`, `quarantined`, `deprecated`, `decommissioning`, `decommissioned`, `retired` | `regression` | oui : `status_regression` |
| recul dans le chemin nominal (ex. `active` → `planned`) | `regression` | oui : `status_regression` |
| statut inconnu | `unexpected` | oui : `attribute_mismatch` |

Transitions par acteur :
- **Archinex** : crée en `planned` ; peut demander `decommissioning` (décision humaine tracée). Rien d'autre.
- **Connecteur** : progression nominale, signalement de panne, retrait.

## Protection du push

Sur un objet **existant**, `guardIntentPush` ne conserve que les champs d'intention : jamais de statut, de champ réalisé ni de champ opérationnel. À la **création**, le payload est inchangé (création en `planned`).

## Limites connues

- Seule la tranche minimale est couverte ; les circuits et objets VPN conservent le comportement historique (gelés, voir l'ADR).
- `tags` est traité comme une métadonnée d'intention : une balise ajoutée par un tiers est écrasée au prochain push.
- Le contrat d'écriture des preuves par les connecteurs (`realized_*`, `evidence_ref`) est défini par #399.
