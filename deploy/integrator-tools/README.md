# Environnement Docker d'Intégration & Outillage (Nautobot, Batfish, OPA)

Cet environnement fournit aux intégrateurs et aux oracles de conformité Archinex/LLMOps une pile complète de vérification locale pour l'infrastructure Telco-Cloud (Project Sylva & SUSE Rancher) :

1. **Nautobot 2.x (DCIM SSOT)** : Source de vérité des équipements planifiés, rôles matériels, interfaces BMC/Redfish et adresses IP réservées (RFC 5737).
2. **PostgreSQL 15 & Redis 7** : Persistance et file de tâches Celery pour Nautobot.
3. **Batfish (All-in-One)** : Simulateur de configuration et vérificateur de matrice de flux réseau.
4. **Open Policy Agent (OPA Server)** : Serveur d'évaluation Rego pour les oracles EDP (en complément du binaire CLI local `tools/bin/opa.exe`).

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
