### Ajouté
- **Écosystème Docker Sylva dans `deploy/integrator-tools/compose.yml`** : ajout des services conteneurisés légers pour compléter l'environnement local d'intégration EDP :
  - **OpenBao** (`:8200`, `#354`) pour la validation des secrets et profils PKI X.509 ;
  - **Keycloak** (`:8085`, `#357`) pour la fédération OIDC / IAM ;
  - **Zot** (`:5000`) et **Trivy Server** (`:4954`, `#355`) pour le registre OCI compatible Cosign/ORAS et le scan CVE/SBOM ;
  - **Technitium DNS Server** (`:5380` / DNS `:15353`, `#352`) pour le service DDI/DNS programmable ;
  - **Forgejo** (`:3001` / SSH `:2222`, `#356`) pour l'automatisation GitOps locale.
- Mise à jour de `deploy/integrator-tools/tools.ps1`, `deploy/integrator-tools/tools.sh`, `deploy/integrator-tools/README.md` et des tests de contrat `tests/contract/edp-integrator-tools-docker.test.ts`.
