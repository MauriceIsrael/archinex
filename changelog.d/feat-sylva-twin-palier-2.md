### Jumeau Numérique Sylva — Palier 2 : `sushy-emulator` & Runner KWOK CI (#292, #294)
- **Intégration `sushy-emulator` (`deploy/integrator-tools/compose.yml`, `sushy-emulator.conf`)** :
  - Ajout du service `sushy-emulator` (`quay.io/metal3-io/sushy-tools:latest`) monté avec la configuration Redfish `capm3` générée depuis le Jumeau Numérique, et mise à jour des scripts `tools.ps1` / `tools.sh` / `README.md`.
- **Moteur T2 KWOK & Calibration T1 ↔ T2 (`src/lib/domain/edp/sylvaTwin.ts`, `scripts/`)** :
  - Ajout de `generateKwokWorkloadManifests()` et `calibrateT1WithKwokResults()` pour confronter les prédictions analytiques T1 au `kube-scheduler` réel sous `kwokctl` (état nominal + panne `dc_loss_primary`).
  - Ajout des scripts `scripts/generate-twin-ci-bundle.ts` et `scripts/calibrate-twin-t1-t2.ts` ainsi que du chart Helm `edp/charts/sylva-workload-twin/`.
- **Workflow CI & Tests (`.github/workflows/twin-ci.yml`, `tests/contract/sylva-digital-twin.test.ts`)** :
  - Nouveau workflow CI exécutant `sushy-emulator` Redfish, `helm lint` / `helm template` (Sylva `LATEST`), `kwokctl` et la calibration T1 ↔ T2.
  - Extension des tests de contrat dans `tests/contract/sylva-digital-twin.test.ts`.
