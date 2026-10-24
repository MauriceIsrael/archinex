# Bac à sable : un Hub et un Archinex neufs et vierges

Fabrique, en conteneurs et derrière HTTPS, un environnement où l'on peut jouer sans risque : le Hub de connaissances
(LLMOps) et Archinex, **sans aucun engagement, projet ni donnée**, reliés comme en déploiement (assertions d'acteur signées,
Hub en mode strict). Rien n'est partagé avec une installation existante : tout vit dans des volumes Docker dédiés.

## Utilisation

### Sous Windows (PowerShell + Docker Desktop)

```powershell
cd deploy\sandbox
.\sandbox.ps1 up        # construit (première fois : plusieurs minutes), démarre, affiche l'URL et les comptes
.\sandbox.ps1 smoke     # vérifie le Hub, le mode strict et la connexion
.\sandbox.ps1 creds     # rappelle l'URL et les comptes
.\sandbox.ps1 reset     # EFFACE les données : « up » repart de bases vierges (mêmes comptes)
.\sandbox.ps1 destroy   # supprime tout, secrets compris
```

Prérequis Windows :
- **Docker Desktop** démarré avec `docker compose` v2.
- **PowerShell** (Windows PowerShell 5.1 ou PowerShell 7+).
- **Node.js** (utilisé pour dériver la paire de clés Ed25519 RFC 8037 et les jetons aléatoires sans binaire externe requis) ou `openssl`.
- `curl.exe` (présent de base sur Windows 10 et 11).

### Sous Linux / macOS ou Git Bash / WSL

```bash
cd deploy/sandbox
./sandbox.sh up        # construit (première fois : plusieurs minutes), démarre, affiche l'URL et les comptes
./sandbox.sh smoke     # vérifie le Hub, le mode strict et la connexion
./sandbox.sh creds     # rappelle l'URL et les comptes
./sandbox.sh reset     # EFFACE les données : « up » repart de bases vierges (mêmes comptes)
./sandbox.sh destroy   # supprime tout, secrets compris
```

Prérequis : Docker avec `docker compose` v2, `node` ou `openssl`, `python3` ou `python` ou `node`, `curl`. Le dépôt LLMOps est pris dans `../LLMOps` s'il existe à
côté d'Archinex, sinon cloné (branche `LLMOPS_REF`, défaut `main`) ; `LLMOPS_DIR` désigne une copie précise.

### Une URL de test publique

```bash
# Sous Linux / macOS / Bash
SANDBOX_ORIGIN=https://test.exemple.org ./sandbox.sh up

# Sous Windows (PowerShell)
$env:SANDBOX_ORIGIN = 'https://test.exemple.org'
.\sandbox.ps1 up
```

Le nom de domaine doit pointer vers la machine, avec les ports 80 et 443 ouverts : le proxy (Caddy) obtient seul un certificat
valide. Sans `SANDBOX_ORIGIN`, l'URL est `https://localhost:8443` avec un certificat local (le navigateur avertit : attendu).
**HTTPS est obligatoire** : Archinex ne pose ses cookies de session qu'en https.

## Ce que contient « vierge »

| | Contenu au départ |
|---|---|
| Hub | la doctrine versionnée du dépôt (`data/kb` : référentiels, contrôles, principes), sa seule base de référence ; **aucun engagement** (celui de démonstration de l'image n'est pas lu) ; base de gouvernance neuve (candidats, revues, audit) ; registre des experts réduit aux 4 personnes de test |
| Archinex | base SQLite neuve : **4 comptes de test**, aucun projet, aucun espace de travail |

Les 4 comptes (mots de passe conviviaux `admin123`… par défaut en local sur `localhost`, ou tirés au hasard sur domaine public, rappelés par `creds` et gardés dans `.sandbox/env`) :

| Compte | Mot de passe (local) | Rôle Archinex | Expert du Hub |
|---|---|---|---|
| `admin@sandbox.test` | `admin123` | administrateur | `@maintainers` (maintenir, administrer) |
| `architect@sandbox.test` | `architect123` | utilisateur | `@core-owner-architecture` (relire) |
| `security@sandbox.test` | `security123` | utilisateur | `@security-compliance-team` (relire) |
| `ciso@sandbox.test` | `ciso123` | utilisateur | `@ciso-office` (évaluer) |

Pour éprouver la séparation des tâches : soumettre un candidat avec `architect`, le relire avec `security`.

## Ce qui est différent d'un déploiement réel

- Le démarrage **n'exécute pas** `docker-entrypoint.sh`, qui sème des comptes de démonstration aux mots de passe publics
  (`admin123`…) : inacceptable sur une URL joignable.
- Un seul jeton de service, tiré au hasard ; embeddings jouets autorisés (`ALLOW_TOY_EMBEDDINGS=1`) : les fonctions de
  similarité n'ont **aucune valeur sémantique**.
- Sans `ANTHROPIC_API_KEY` (à exporter avant `up`), les fonctions qui demandent un modèle sont indisponibles ; il n'y a pas de
  serveur local de modèle.
- L'envoi d'e-mails n'est pas configuré (les liens d'invitation ne partent pas).
- Le Hub n'écoute que sur `127.0.0.1:8000` (curl depuis la machine) ; seul Archinex est exposé, par le proxy.
- Les données du registre des experts sont écrites dans le conteneur du Hub à chaque démarrage (non conservées par `reset`,
  reconstruites par `up`).

## Fichiers

`sandbox.ps1` (pilote Windows PowerShell), `sandbox.sh` (pilote Bash / Linux / macOS), `compose.yml`, `Caddyfile`, `hub-init.py` (registre des experts), `archinex-init.mjs` (comptes de test).
Les secrets sont dans `.sandbox/` (ignoré par git, droits 600).

## État de la vérification

La configuration (`docker compose config`) est valide et chaque moitié a été éprouvée **hors conteneur** avec exactement ces
variables : le Hub démarre vierge en mode strict (une clé de confiance, en-tête brut refusé en 401) ; Archinex crée ses comptes
(deux fois de suite sans doublon), l'administrateur de test se connecte, et le journal d'audit du Hub montre ses appels acceptés
en `assertion` (alors qu'en mode `header` le Hub refuse en `signed_actor_required`). **Les images n'ont pas été construites ni
lancées** (l'environnement de rédaction n'a pas de démon Docker) : la première construction sur votre machine est le premier
vrai essai de `compose.yml`, du proxy et de `smoke`.
