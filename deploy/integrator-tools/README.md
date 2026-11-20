# Environnement Docker d'Intégration & Outillage Sylva (Nautobot, Batfish, OPA, OpenBao, Keycloak, Zot/Trivy, DDI, Forgejo)

Cet environnement fournit aux intégrateurs et aux oracles de conformité Archinex/LLMOps une pile complète et légère de vérification locale représentative d'un écosystème réel basé sur **Project Sylva** & **SUSE Rancher** :

1. **Nautobot 2.x (DCIM/IPAM SSOT, #351)** : Source de vérité des équipements planifiés, rôles matériels, interfaces BMC/Redfish et adresses IP réservées (RFC 5737).
2. **PostgreSQL 15 & Redis 7** : Persistance et file de tâches Celery pour Nautobot.
3. **Batfish (All-in-One, #353)** : Simulateur de configuration et vérificateur de matrice de flux réseau.
4. **Open Policy Agent (OPA Server)** : Serveur d'évaluation Rego pour les oracles EDP (en complément du binaire CLI local `tools/bin/opa.exe`).
5. **sushy-emulator (`quay.io/metal3-io/sushy-tools`)** : Bouchon Redfish BMC *in-memory* monté avec `sushy-emulator.conf` généré par le Jumeau Numérique Sylva (`capm3`).
6. **OpenBao (`openbao/openbao`, #354)** : Gestionnaire de secrets et PKI X.509 en mode dev.
7. **Keycloak (`quay.io/keycloak/keycloak`, #357)** : Fournisseur d'identité OIDC/IAM pour l'écosystème Sylva.
8. **Zot + Trivy Server (`ghcr.io/project-zot/zot` & `aquasec/trivy`, #355)** : Registre OCI compatible Cosign/ORAS et serveur d'analyse CVE/SBOM.
9. **Technitium DNS Server (`technitium/dns-server`, #352)** : Service DDI/DNS programmable via API REST.
10. **Forgejo (`codeberg.org/forgejo/forgejo`, #356)** : Forge GitOps légère (dépôts, PR, webhooks) pour les exports Sylva.

---

## 1. Démarrage Rapide

### Prérequis
- **Docker Desktop** (Windows) ou démon Docker (Linux/macOS) en cours d'exécution.
- Binaire OPA local installé via `scripts/install-opa.ps1` (déjà présent dans `tools/bin/opa.exe`).

### Sous Windows (PowerShell)
```powershell
cd deploy\integrator-tools
.\tools.ps1 up      # Démarre la pile, attend Nautobot et injecte l'inventaire témoin (seed)
.\tools.ps1 status  # Affiche les conteneurs et les URLs de service
.\tools.ps1 test    # Vérifie la connectivité GraphQL Nautobot et l'API OPA
.\tools.ps1 down    # Arrête les conteneurs
```

### Sous Linux / macOS / WSL (Bash)
```bash
cd deploy/integrator-tools
./tools.sh up
./tools.sh status
./tools.sh down
```

---

## 2. Inventaire Télécom Témoin (Seed Sylva / SUSE)

Le script `seed-nautobot.py` injecte automatiquement les données requises pour valider les décisions EDP et les templates CAPI Sylva :

| Attribut | Valeur injectée | Rôle dans l'oracle EDP |
|---|---|---|
| **Site / Location** | `pop-valmondois` | Périmètre géographique du déploiement Edge |
| **Role** | `telco-baremetal-worker` | Validation du rôle serveur dans Nautobot |
| **Device Name** | `srv-telco-bm-01` | Nom d'hôte apparié au `BareMetalHost` CAPI |
| **Status** | `Planned` | Statut exigé par le query GraphQL d'extraction |
| **BMC Interface** | `bmc` | Détection de l'accès Out-of-Band Redfish |
| **IP Address** | `192.0.2.10/24` | IP conforme RFC 5737 (pureté des intentions) |

---

## 3. Points d'Accès et Identifiants

- **Nautobot Web UI** : `http://localhost:8080`
  - Utilisateur : `admin`
  - Mot de passe : `adminpassword`
  - Token API : `0123456789abcdef0123456789abcdef01234567`
- **Nautobot GraphQL API** : `http://localhost:8080/api/graphql/`
  - En-tête : `Authorization: Token 0123456789abcdef0123456789abcdef01234567`
- **Batfish API** : `http://localhost:9997`
- **OPA Server REST** : `http://localhost:8181/v1/data`
- **sushy-emulator Redfish API** : `http://localhost:8000/redfish/v1/Systems`
- **OpenBao (Secrets & PKI)** : `http://localhost:8200` (Root token dev : `archinex-bao-dev-token`)
- **Keycloak (IdP / OIDC)** : `http://localhost:8085` (`admin` / `adminpassword`)
- **Zot OCI Registry** : `http://localhost:5000/v2/`
- **Trivy Server (CVE / SBOM)** : `http://localhost:4954`
- **Technitium DDI / DNS** : `http://localhost:5380` (`admin` / `adminpassword`, DNS UDP/TCP sur le port `5353`)
- **Forgejo (GitOps PR/CI)** : `http://localhost:3001` (SSH Git sur le port `2222`)
