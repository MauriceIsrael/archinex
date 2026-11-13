# Tâches : Jumeau numérique de Sylva (proposition)

## Palier 1 : Fondations T0 + T1 (tranche livrable)
- [ ] 1. Cadrage : valider `design.md` (questions ouvertes §9), invariants ontologiques de résilience
- [ ] 2. `twin/model.ts` + `buildTwinModel` depuis `MultiAxisHydratedInventory` (+ `assumptions[]`)
- [ ] 3. `twin/scenarios.ts` : `ScenarioSpec`, deltas de topologie, `dc_loss`/`host_loss`/`link_partition`/`feed_loss`
- [ ] 4. Moteur T1 `analytic` : placement par domaine, quorum etcd, quorum stockage, packing de capacité
- [ ] 5. Moteur T0 `render` : `helm template` épinglé, DAG des unités, réutilisation `validateSylvaWorkloadClusterSchema` + règles d'or
- [ ] 6. `TwinReport` canonique + scellement (`model_sha256`, `scenario_sha256`, seed) + cache
- [ ] 7. Ontologie : `projections.twin_invariants` sur les feuilles de résilience ; `edp/policies/twin_resilience.rego` + mutation
- [ ] 8. Injection `sources.twin_report` dans le flux `edpDrafting`/`edpVerify` (verdict `insufficient_input` si absent)
- [ ] 9. Adaptateur de compatibilité du what-if 2/3 DCs ; tests de non-régression
- [ ] 10. API `twin/runs` + `authorizeProjectAccess` ; Prisma `TwinRun`
- [ ] 11. UI : comparaison base/variante dans `Phase4RefinementHub` (remplace `whatIfDcCount`)
- [ ] 12. Docs : `ARCHITECTURE.md`, `USER_GUIDE.md`, `docs/edp/integrator-guide.md` (§ « ce qu'un vert ne prouve pas »), fragment `changelog.d/`

## Palier 2 : Fidélité scheduler et réseau
- [ ] 13. Moteur T2 `kwok` (nœuds depuis Nautobot, manifestes rendus, panne par zone) + job asynchrone
- [ ] 14. Moteur T3 `batfish` (flux de médiation, absence de bypass)
- [ ] 15. Tests de calibration T1 ↔ T2

## Palier 3 : Boucle jumeau (synchronisation avec l'observé)
- [ ] 16. Étalon T4 (CAPI + provider de substitution) en nightly
- [ ] 17. Import de l'état observé (Nautobot actual, Flux/CAPI) via `nautobotSync` + `transformSylvaManifestsToRefinedInput` ; rapport de dérive intention ↔ observé
- [ ] 18. Péremption automatique (`stale`) des rapports sur changement de modèle ou de version Sylva
