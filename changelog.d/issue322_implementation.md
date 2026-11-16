### Extension du socle ontologique et du catalogue composants aux périmètres Terminaux / OS / MDM-EMM (#322)
- **Taxonomie & Ontologie (`src/lib/domain/edp/togafTaxonomy.ts`, `tests/fixtures/edp/ontology_export.json`)** :
  - Ajout de 6 axes ontologiques dédiés aux terminaux, OS endpoints et MDM/EMM (`endpoint_mdm_enrollment`, `endpoint_pki_enrollment`, `endpoint_os_hardening`, `endpoint_local_encryption`, `endpoint_app_sandboxing`, `endpoint_ota_updates`) avec leurs feuilles et prérequis transitifs vers `pki_hierarchy`.
- **Catalogue de composants (`src/lib/domain/edp/componentCatalog.ts`)** :
  - Ajout des composants logiques `mdm-emm` et `endpoint-os-profile` (multi-NIC, VRF, Vault, certificats, overlays `prod`/`preprod`/`lab`) et rattachement explicite des feuilles URN vers `mdm-emm`, `endpoint-os-profile` et `pki-ca` (SCEP/EST).
- **Évaluation & Oracle Rego (`src/lib/server/edp/refinementCoverage.ts`, `edp/policies/multi_axis_refinement.rego`)** :
  - Détection contextuelle des axes `endpoint_*`, hydratation de `extended_domains.endpoint_mdm` et ajout des 6 règles OPA/Rego correspondantes (`deny_unenrolled_endpoint_mdm`, `deny_unapproved_endpoint_pki_protocol`, `deny_unverified_endpoint_os_boot`, `deny_unencrypted_endpoint_storage`, `deny_missing_endpoint_app_sandbox`, `deny_unsigned_endpoint_ota_update`).
- **Tests** :
  - Ajout de la suite de tests contractuels `tests/contract/edp-endpoint-os-mdm-emm.test.ts`.
