### Résolution du conflit de port entre `sushy-emulator` et le Knowledge Hub LLMOps
- **Pile Docker intégrateur (`deploy/integrator-tools/compose.yml`, `tools.ps1`, `tools.sh`, `.github/workflows/twin-ci.yml`)** :
  - Déplacement du port hôte exposé par `sushy-emulator` de `127.0.0.1:8000` vers `127.0.0.1:8090` (mapping `8090:8000`) afin de libérer le port `8000` réservé au Knowledge Hub LLMOps local (`LLMOPS_BASE_URL=http://127.0.0.1:8000`).
- **Diagnostic Ontologie (`src/lib/server/edp/ontologyClient.ts`)** :
  - Ajout de la cause exacte (`err.message`, ex. code HTTP 404) dans le journal d'avertissement lors du basculement sur les fixtures hors-ligne en développement.
- **Tests & Documentation** :
  - Mise à jour du test de contrat `tests/contract/edp-integrator-tools-docker.test.ts` (vérification `8090:8000` et non-collision `8000:8000`) ainsi que de `deploy/integrator-tools/README.md` et `USER_GUIDE.md`.
