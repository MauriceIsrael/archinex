### IMP V2 Lot 1 — Modèle de données & Catalogues étendus (#302, #303)
- **Catalogues & Modèle (`src/lib/domain/edp/componentCatalog.ts`)** :
  - Extension des classes NIC (`storage`, `backup`, `oob`) et ajout des catalogues `qosClasses`, `vlanPools`, `vniPools`, `firewalls` (`interzone`, `external`, `operator-link`), `certificateProfiles` (conformes RGS) et `drivers` (`CapabilityMatrix`).
  - Ajout de l'entité `OrganizationSpec` (`kind: Organization`), de `deriveOrganizationBubble` et `validateOrganization` (§5.1).
  - Extension de `LogicalComponent` pour les blocs IMP V2 (`network.fabric`, `routePropagation`/`bgpPropagation`, `loadBalancers`, `tunnels`, `apns`, `compute.namespaces`, `compute.hardware`, `storage.objectStores`, `exposure`, `observability`, `data.databases`, `supplyChain`, `lifecycle`).
  - Ajout de `validateCertificateProfilesAndRgs` (rejet X.509 inline & RSA < 3072) et `validateDriverCapabilities`.
- **Tests (`tests/contract/imp-v2-lot1-catalogs-and-model.test.ts`)** :
  - Ajout de 6 tests de contrat couvrant les catalogues V2, `Organization`, certificats/RGS, blocs V2 et `CapabilityMatrix`.
