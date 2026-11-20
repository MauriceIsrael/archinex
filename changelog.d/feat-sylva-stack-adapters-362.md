### Ajouts
- **Connecteurs Port/Adapter de la stack Sylva (`src/lib/server/edp/adapters/`)** (#362) :
  - `batfishAdapter.ts` (#353) : soumission de snapshots réseau et vérification d'atteignabilité / ACL (`buildBatfishOpaInput`).
  - `openbaoAdapter.ts` (#354) : validation et provisionnement des montages/chemins KV v2 et des rôles PKI X.509.
  - `keycloakAdapter.ts` (#357) : validation et provisionnement des realms, clients OIDC, rôles et groupes via l'API Admin.
  - `ociSupplyChainAdapter.ts` (#355) : vérification d'artefacts OCI / signatures Cosign sur Zot et scan CVE via `trivy server`.
  - `ddiDnsAdapter.ts` (#352) : vérification et réservation de zones DNS et d'enregistrements FQDN sur Technitium DNS.
  - `gitopsForgeAdapter.ts` (#356) : création de branche, push du bundle `sylvaGitopsExport.ts` et ouverture de PR sur Forgejo.
  - Mode dégradé propre (`mode: 'degraded'`, `reachable: false`) lorsque les services Docker sont hors-ligne, avec suite de tests contractuels et d'intégration (`SYLVA_STACK_LIVE=1`).
