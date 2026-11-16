### Extension du socle ontologique et du catalogue composants aux périmètres OSS/SMO/CMDB, eSIM SM-DP+, N3IWF/WLAN, eMBMS/Slicing & PQC (#326)
- **Taxonomie & Ontologie (`src/lib/domain/edp/togafTaxonomy.ts`, `tests/fixtures/edp/ontology_export.json`)** :
  - Ajout de 9 axes ontologiques (`esim_smdp_provisioning`, `oss_smo_mediation`, `oss_automation_hitl`, `cmdb_asset_inventory`, `service_assurance_probes`, `non3gpp_wlan_interworking`, `core_5g_network_slicing`, `embms_multicast_broadcast`, `pqc_crypto_agility`) avec leurs feuilles, variantes et prérequis transitifs.
- **Catalogue de composants (`src/lib/domain/edp/componentCatalog.ts`)** :
  - Ajout des composants logiques `esim-smdp`, `oss-smo-mediation`, `cmdb-inventory` et `n3iwf-epdg-gateway` (multi-NIC, VRF, Vault, certificats, overlays `prod`/`preprod`/`lab`) et rattachement des feuilles URN.
- **Évaluation & Oracle Rego (`src/lib/server/edp/refinementCoverage.ts`, `edp/policies/multi_axis_refinement.rego`)** :
  - Détection contextuelle des nouveaux axes, hydratation de `extended_domains.telecom_oss_smdp` et ajout des 9 règles OPA/Rego associées.
- **Tests** :
  - Ajout de `tests/contract/edp-oss-smdp-telecom-axes.test.ts`.
