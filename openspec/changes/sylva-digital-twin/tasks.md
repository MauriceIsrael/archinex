# Tâches : Jumeau numérique de Sylva (#292, #293, #294)

## Palier 1 : Fondations T0 + T1, Matrice 3 DCs / 2 DCs + Témoin / 2 DCs, Bouchon `sushy` & Oracle OPA (#293)
- [x] 1. Cadrage OpenSpec (`proposal.md`, `design.md`, `tasks.md`) & création des issues GitHub (#292, #293, #294)
- [x] 2. Modèle du jumeau (`src/lib/domain/edp/sylvaTwin.ts`) : `buildSylvaTwinModel` depuis l'inventaire hydraté et le catalogue de composants (3 DCs par défaut, pools Sylva, CPU/RAM/Hugepages/SR-IOV, `assumptions[]`)
- [x] 3. Simulateur de scénarios et d'injections de pannes (`dc_loss`, `host_loss`, `power_feed_loss`, `link_partition`) sur les 3 topologies (`3dc-active`, `2dc-witness`, `2dc-split`)
- [x] 4. Double mode d'arbitrage : Mode **Proposition d'équipe** (`proposal`) vs Mode **Conformité Client** (`client-mandated`)
- [x] 5. Générateur de bouchon Redfish `sushy-tools` (`generateSushyEmulatorConfig`) et de nœuds `KWOK` (`generateKwokNodeManifests`) pour la CI
- [x] 6. Source `twin_report` scellée par SHA-256 (`buildTwinRefinedInputSource`) & Oracle Rego `edp/policies/twin_resilience.rego` + évaluateur `evaluateSylvaTwinResilience`
- [x] 7. Branchement à `composeMultiAxisHydration`, `summarizeWhatIfComparison` et l'API `/api/projects/[projectId]/catalog`
- [x] 8. Mise à jour de `Phase4RefinementHub.svelte` : comparateur **3 DCs (défaut) / 2 DCs + Témoin / 2 DCs**, sélecteur de mode (Proposition vs Client), indicateurs de survie (`etcd`, Stockage, Capacité SR-IOV, Médiation) et aperçu du bouchon Redfish `sushy-emulator`
- [x] 9. Tests de contrat exhaustifs (`tests/contract/sylva-digital-twin.test.ts`) + documentation (`ARCHITECTURE.md`, `USER_GUIDE.md`, `changelog.d/`)

## Palier 2 : Exécution CI conteneurisée KWOK & `sushy-emulator` (#294)
- [ ] 10. Ajout du conteneur `sushy-emulator` dans `deploy/integrator-tools/docker-compose.yml`
- [ ] 11. Job CI d'exécution `helm template` (Sylva `LATEST`) + `kwok` et test de calibration T1 ↔ T2

## Palier 3 : Boucle jumeau sur l'état observé (#292)
- [ ] 12. Réconciliation continue avec l'état observé Nautobot / FluxCD (`nautobotSync` + `transformSylvaManifestsToRefinedInput`)
- [ ] 13. Péremption automatique (`stale`) des rapports sur dérive de modèle
