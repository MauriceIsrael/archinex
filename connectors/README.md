# Connecteurs derrière Nautobot (`connectors/`)

Références : [ADR-017](../docs/adr/ADR-017-nautobot-point-unique-reconciliation.md), [Classification des adaptateurs](../docs/edp/connectors-classification.md), issues #411, #381, #399.

## Rôle et frontière

Cet espace regroupe les **6 adaptateurs Port/Adapter** historiquement créés dans `src/lib/server/edp/adapters/` (PR #363). Conformément à l'ADR-017 :

- **Le cœur d'Archinex (`src/`) n'importe aucun fichier de `connectors/`** et n'exécute aucune écriture directe vers un outil d'implémentation.
- **Nautobot est l'unique point de réconciliation bidirectionnel** : Archinex y pousse l'intention (*Planned*) et y lit l'état réalisé.
- Les connecteurs de `connectors/` vivent **derrière Nautobot** : ils lisent les objets Nautobot, agissent ou vérifient dans l'outil cible, puis écrivent leur statut et leur preuve dans Nautobot via le contrat de write-back (`writeBackContract.ts`, #399).

## État des 6 connecteurs

| Connecteur | Fichier | Classement ADR-017 | Write-back #399 |
|---|---|---|---|
| Forge Git / GitOps (Forgejo) | `gitopsForgeAdapter.ts` | **Connecteur derrière Nautobot (socle du connecteur de référence #381)** | Implémenté (`buildWriteBackPayload`, `reportRealizationToNautobot`) |
| Registre OCI + Cosign + Trivy (Zot) | `ociSupplyChainAdapter.ts` | **Connecteur derrière Nautobot (vérification lecture seule)** | À reprendre (reprise sur `writeBackContract.ts`) |
| Batfish (analyse réseau) | `batfishAdapter.ts` | **Connecteur derrière Nautobot** | À reprendre (reprise sur `writeBackContract.ts`) |
| OpenBao / Vault / PKI | `openbaoAdapter.ts` | **Connecteur derrière Nautobot** | À reprendre (reprise sur `writeBackContract.ts`) |
| Keycloak (IdP) | `keycloakAdapter.ts` | **Connecteur derrière Nautobot** | À reprendre (reprise sur `writeBackContract.ts`) |
| DNS / DDI (Technitium) | `ddiDnsAdapter.ts` | **Connecteur derrière Nautobot** | À reprendre (reprise sur `writeBackContract.ts`) |

## Modules neutres conservés dans le cœur (`src/lib/server/edp/`)

- `src/lib/server/edp/manifestSanitizer.ts` (`sanitizeManifests`, `transformSylvaManifestsToRefinedInput`) : utilitaire pur d'assainissement anti-secrets et de transformation en `refined_input`, sans appel réseau.
- `src/lib/server/edp/nautobotPlannedExtract.ts` + `nautobot_planned_extract.graphql` : lecture seule GraphQL depuis Nautobot, avec requête paramétrée (`$site_slug: [String]`, aucun site codé en dur).
