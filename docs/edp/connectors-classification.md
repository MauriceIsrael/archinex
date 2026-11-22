# Classement et relocalisation des 6 adaptateurs Port/Adapter

Référence : [ADR-017](../adr/ADR-017-nautobot-point-unique-reconciliation.md), issues #411, #381, #399. Code : `connectors/`.

## Principe

Conformément à l'ADR-017, **Nautobot est l'unique point de réconciliation bidirectionnel d'Archinex** :

- Le cœur d'Archinex (`src/`) ne contient **aucun chemin d'écriture** vers un outil d'implémentation (forge Git, Vault, IdP, DNS, Batfish, registre OCI) et n'importe aucun fichier de `connectors/`.
- Les 6 adaptateurs livrés par la PR #363 sont sortis de `src/lib/server/edp/adapters/` vers l'espace dédié `connectors/` (hors cœur applicatif), où ils servent de socle aux connecteurs derrière Nautobot.
- Chaque connecteur lit les objets marqués dans Nautobot, agit ou vérifie dans l'outil cible, puis écrit son **statut réalisé et sa preuve** dans Nautobot via son propre jeton au moindre privilège (`connectors/writeBackContract.ts`, #399).

## Tableau de classement des 6 adaptateurs (#411)

| Adaptateur (origine PR #363) | Nouveau chemin | Chemins d'écriture identifiés | Classement ADR-017 | Statut write-back (#399) | Suivi |
|---|---|---|---|---|---|
| **Forge Git / GitOps (Forgejo)** (`gitopsForgeAdapter.ts`) | `connectors/gitopsForgeAdapter.ts` | Création dépôt/branche, push de fichiers, ouverture PR | **Connecteur derrière Nautobot** *(socle du connecteur de référence Sylva GitOps)* | **Implémenté** (`buildWriteBackPayload`, `reportRealizationToNautobot` → `realized_status`, `realized_revision`, `realized_by`, `evidence_ref`) | #381 |
| **Registre OCI + Cosign + Trivy** (`ociSupplyChainAdapter.ts`) | `connectors/ociSupplyChainAdapter.ts` | Aucune écriture (vérification lecture seule de manifests, signatures et CVE) | **Connecteur derrière Nautobot (contrôle lecture seule)** | **À reprendre** (câblage sur `writeBackToNautobot`) | #355 / #397 |
| **Batfish** (`batfishAdapter.ts`) | `connectors/batfishAdapter.ts` | Création réseau / soumission de snapshot réseau (PUT/POST Batfish) | **Connecteur derrière Nautobot** | **À reprendre** (lecture des objets Nautobot + write-back du verdict d'analyse) | #353 / #397 |
| **OpenBao / Vault / PKI** (`openbaoAdapter.ts`) | `connectors/openbaoAdapter.ts` | Provisionnement montages KV v2 et rôles PKI (`provision: true`, POST) | **Connecteur derrière Nautobot** | **À reprendre** (câblage sur `writeBackToNautobot`, verdict d'existence des chemins/profils) | #354 / #397 |
| **Keycloak (IdP)** (`keycloakAdapter.ts`) | `connectors/keycloakAdapter.ts` | Provisionnement realms, clients OIDC, rôles et groupes (`provision: true`, POST) | **Connecteur derrière Nautobot** | **À reprendre** (câblage sur `writeBackToNautobot`, verdict realms/rôles/scopes) | #357 / #397 |
| **DNS / DDI (Technitium)** (`ddiDnsAdapter.ts`) | `connectors/ddiDnsAdapter.ts` | Création de zones DNS et enregistrements (`provision: true`) | **Connecteur derrière Nautobot** | **À reprendre** (câblage sur `writeBackToNautobot`, verdict de réservation/collision) | #352 / #397 |

## Modules neutres conservés dans le cœur (`src/lib/server/edp/`)

Les deux modules sans écriture vers un outil tiers ont été sortis de `adapters/` et renommés en modules neutres dans `src/lib/server/edp/` :

| Ancien fichier | Nouveau chemin | Rôle | Changements #411 |
|---|---|---|---|
| ~~`src/lib/server/edp/adapters/sylvaAdapter.ts`~~ | `src/lib/server/edp/manifestSanitizer.ts` | Assainissement anti-secrets (`sanitizeManifests`) et transformation `refined_input` | Déplacé en module neutre ; aucun appel réseau |
| ~~`src/lib/server/edp/adapters/nautobotAdapter.ts`~~ + `.graphql` | `src/lib/server/edp/nautobotPlannedExtract.ts` + `nautobot_planned_extract.graphql` | Lecture seule GraphQL de l'inventaire Nautobot *Planned* | Déplacé en module neutre ; variable `$site_slug: [String]` paramétrée (suppression du site par défaut codé en dur) |

## Contrat de write-back (`connectors/writeBackContract.ts`)

Champs écrits par PATCH REST sur l'objet Nautobot cible (jamais de champ d'intention `archinex_*`) :

- `custom_fields.realized_status` : `staged` | `provisioning` | `active` | `failed` | `decommissioning` | `decommissioned` | `unverified`
- `custom_fields.realized_at` : horodatage ISO-8601
- `custom_fields.realized_revision` : révision de décision appliquée
- `custom_fields.realized_by` : `<connecteur>@<version>`
- `custom_fields.evidence_ref` : URL vérifiable (PR, run CI, résultat de Job)
- `status` *(optionnel)* : statut Nautobot aligné sur la progression nominale ([field-ownership.md](field-ownership.md))
