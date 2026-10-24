# Guide d'Installation & Initialisation — Archinex Deliberation Workbench

> **Ce guide résout et explicite les questions fréquentes lors d'une première installation (« fresh install ») : configuration du `.env`, rôles des commandes d'initialisation Prisma, comptes de démonstration fonctionnels, introspection dynamique des modèles LLM et spécifications du service Anthropic.**

---

## 1. Vue d'ensemble du processus d'installation

L'installation complète d'Archinex s'effectue en 4 étapes ordonnées :

```bash
# 1. Cloner le dépôt et installer les dépendances Node.js
git clone https://github.com/votre-orga/archinex.git
cd archinex
npm install

# 2. Configurer le fichier d'environnement
cp .env.example .env

# 3. Initialiser le schéma puis injecter les données initiales
npx prisma generate
npx prisma db push
npx prisma db seed

# 4. Lancer le serveur de développement
npm run dev
```

---

## 2. Configuration du fichier `.env`

Le fichier `.env` configure l'accès aux bases de données locales, aux clés de chiffrement de session et aux connecteurs d'inférence d'IA.

| Variable | Valeur par défaut / Exemple | Requis ? | Description & Utilisation |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | `"file:./dev.db"` | **Oui** | Emplacement de la base SQLite. Dans Prisma, le chemin `"file:./dev.db"` est résolu relativement au dossier `prisma/` (le fichier généré sera donc `prisma/dev.db`). Pour un chemin absolu : `"file:/chemin/absolu/dev.db"`. |
| `JWT_SECRET` | `"change-me-min-32-chars-random-string-000"` | **Oui** (prod) | Chaîne secrète d'au moins 32 caractères pour signer/vérifier les jetons JWT (HS256). **Obligatoire en production** (`NODE_ENV=production`) : le conteneur et le serveur refusent de démarrer si elle est absente, < 32 caractères ou égale à une valeur publique d'exemple (#141). Génération : `openssl rand -hex 32`. Repli de dev toléré hors production. |
| `LLM_PROVIDER` | `auto` | Optionnel | Fournisseur d'inférence LLM principal :<br>• `auto` : Utilise Anthropic si `ANTHROPIC_API_KEY` est fournie, sinon bascule sur le serveur local Ollama.<br>• `local` : Force l'utilisation stricte du serveur local Ollama (souverain, aucune donnée envoyée à un tiers).<br>• `anthropic` : Force l'utilisation stricte de l'API Anthropic. |
| `LLM_LOCAL_ENDPOINT` | `http://localhost:11434` | Si local | URL de base du serveur d'inférence local souverain (généralement Ollama ou vLLM). Archinex applique une politique de sécurité air-gap interdisant les URL publiques pour ce paramètre. |
| `LLM_LOCAL_MODEL` | `llama3.1` (ou votre modèle local) | Si local | Modèle local par défaut à utiliser si aucune détection dynamique ou sélection utilisateur n'est effectuée. |
| `LLM_LOCAL_TIMEOUT_MS`| `180000` (3 minutes) | Optionnel | Délai d'expiration HTTP (timeout) en millisecondes pour les requêtes vers le serveur d'inférence local. |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | Optionnel | Clé d'API standard pour le service Anthropic Messages. Si absente, les fonctionnalités d'IA basculent sur le moteur local ou restent en attente d'un modèle local. |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Optionnel | URL de base du service Anthropic. À renseigner si votre entreprise utilise un proxy souverain, une passerelle d'entreprise ou un endpoint compatible avec l'API Messages d'Anthropic. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Optionnel | Modèle Claude à cibler par défaut lors de l'utilisation de l'API Anthropic (ex: `claude-sonnet-5-5`, `claude-3-7-sonnet-20250219`). |
| `LLMOPS_BASE_URL` | `http://127.0.0.1:8000` | Optionnel | URL du Knowledge Hub LLMOps central. Si LLMOps n'est pas démarré localement, Archinex fonctionne en mode autonome sans bloquer. |
| `LLMOPS_AUTH_TOKEN` | `bearer_token_secret` | Optionnel | Jeton d'authentification de service Archinex portant les permissions requises (`kb:review`, `kb:delegate`). |
| `LLMOPS_ENGAGEMENT` | `default-project` | Optionnel | Identifiant de l'engagement/projet actif pour la capitalisation et la synchronisation avec LLMOps. |
| `LLMOPS_ALLOWED_HOSTS`| *(vide)* | Optionnel | Liste d'hôtes distants autorisés (séparés par des virgules) si LLMOps est hébergé en dehors du réseau local (règle de sécurité air-gap). |

---

## 3. Pourquoi `npx prisma db seed` après `prisma db push` ?

Les développeurs se demandent souvent pourquoi deux commandes sont nécessaires lors d'une nouvelle installation :

0. **`npx prisma generate`** : depuis Prisma 7, `db push` ne génère plus le client ; cette commande le produit dans `src/generated/prisma` (ignoré par git).

1. **`npx prisma db push`** :
   - Analyse le fichier `prisma/schema.prisma`.
   - Crée le fichier de base de données SQLite `prisma/dev.db` s'il n'existe pas.
   - Crée toutes les tables, index et relations (tables `User`, `KbProfile`, `CasbinRule`, `Engagement`, `CorpusDocument`, etc.).
   - **Mais les tables sont totalement vides.** Il n'y a aucun compte utilisateur, aucun droit d'accès et aucun projet de référence.

2. **`npx prisma db seed`** :
   - Rempli la base avec le jeu de données initial indispensable au fonctionnement :
     - Les comptes utilisateurs de démonstration avec leurs mots de passe hachés (`bcrypt`).
     - Les profils d'experts Knowledge Base (`@admin-lead`, `@sec-expert`).
     - Les règles d'autorisation RBAC/ABAC Casbin (droits d'administration, de lecture, et politiques KB `kb:review`, `kb:maintain`).
     - Les projets exemples de référence (`examples/suse-telco-cloud` et `examples/cctp-rfp`) avec leurs documents de corpus associés.
   - **En développement local, sans cette étape, il est impossible de se connecter.** (Le conteneur, lui, crée son premier administrateur autrement : voir § 3 bis.)

> [!TIP]
> Vous pouvez à tout moment réinitialiser proprement la base de développement avec la commande :
> ```bash
> npm run db:reset
> ```
> Cette commande vide la base de données, réapplique le schéma et relance l'ensemble du seed.

---

## 3 bis. Conteneur / production : premier administrateur et création des comptes

**Le conteneur (`docker-entrypoint.sh`) ne sème plus de comptes de démonstration.** Ils avaient des mots de passe publics
(`admin123`, `user123`), donc n'importe qui pouvait se connecter à une instance exposée.

**Premier compte (administrateur).** Au démarrage, `prisma/bootstrap-admin.ts` crée un administrateur si, et seulement si, aucun n'existe
et si `ARCHINEX_BOOTSTRAP_ADMIN_EMAIL` est défini :

| Variable | Rôle |
| :--- | :--- |
| `ARCHINEX_BOOTSTRAP_ADMIN_EMAIL` | adresse du premier administrateur (obligatoire pour qu'il soit créé) |
| `ARCHINEX_BOOTSTRAP_ADMIN_PASSWORD` | son mot de passe, 12 caractères au minimum. Absent : un mot de passe fort est **généré et affiché une seule fois** dans le journal du conteneur |
| `ARCHINEX_BOOTSTRAP_ADMIN_NAME` | nom affiché (défaut « Administrateur ») |

Relancer le conteneur ne recrée ni ne modifie jamais un compte. Si l'adresse existe déjà comme simple utilisateur, elle est promue
administrateur sans changer son mot de passe. Sans la variable (et sans administrateur), le démarrage le signale et personne ne peut
se connecter : définir la variable et redémarrer.

**Créer les autres comptes (en tant qu'administrateur).** Connectez-vous, ouvrez **Administration** (`/admin`, « Gestion centralisée des
comptes »), puis **Nouveau compte** :
1. nom, adresse e-mail, rôle applicatif (`admin` ou `user`) ;
2. activation, sans envoi d'e-mail : soit un **mot de passe initial** (6 caractères minimum, compte actif tout de suite), soit un **lien
   d'activation à usage unique** valable 7 jours, à transmettre à la personne (`/invite?token=…`) ;
3. rôles dans les espaces de travail ;
4. si la personne relit la base de connaissances : handle KB, rôles (`kb:review`, `kb:evaluate`, `kb:maintain`, `kb:admin`), domaines, et
   « Inscrire dans le registre LLMOps » pour que le Hub la reconnaisse (le Hub décide de ses droits à partir de son propre registre).

La même opération existe en API : `POST /api/admin/accounts` (session administrateur).

**Jeu de démonstration, à la demande seulement.** `ARCHINEX_SEED_DEMO=1` fait lancer `prisma/seed.ts` au démarrage du conteneur : comptes
`@archinex.local` / `@example.com` à mots de passe **publics**. À réserver à une instance de démonstration sans donnée réelle.

---

## 4. Comptes de démonstration pré-configurés (développement local)

Après avoir exécuté `npx prisma db seed` (ou `npm run db:reset`), les comptes suivants sont créés et utilisables directement sur la page `/login` :

| Compte / Rôle | Email | Mot de passe | Rôles & Profil KB |
| :--- | :--- | :--- | :--- |
| **Lead Architect (Admin)** | `admin@archinex.local` | `admin123` | Rôle système `admin`<br>Profil KB : `@admin-lead`<br>Pouvoirs : Administration complète, validation de doctrine, arbitrage. |
| **Architecte Domaine** | `architect@archinex.local` | `user123` | Rôle système `user`<br>Département : Ingénierie<br>Pouvoirs : Contribution, formulation d'hypothèses, participation aux débats. |
| **Expert Sécurité & Cloud** | `expert@archinex.local` | `user123` | Rôle système `user`<br>Profil KB : `@sec-expert`<br>Pouvoirs : Revue de conformité, maintenance des clauses et doctrines. |
| *Compte Admin hérité (tests)* | `admin@example.com` | `admin123` | Rôle système `admin` (maintenu pour rétro-compatibilité des scripts de test). |
| *Compte User hérité (tests)* | `user@example.com` | `user123` | Rôle système `user` (maintenu pour rétro-compatibilité des scripts de test). |

Sur la page de connexion ([http://localhost:5173/login](http://localhost:5173/login)), des boutons d'accès rapide permettent de pré-remplir instantanément les identifiants de ces comptes de test.

---

## 5. Modèles LLM & Découverte Dynamique (Introspection)

### Problème résolu
Dans les versions antérieures, des modèles particuliers (comme `ministral:latest` ou `qwen2.5-coder:14b`) étaient inscrits en dur dans les sélecteurs de l'IHM, provoquant des erreurs ou de l'incompréhension si ces modèles n'étaient pas préalablement téléchargés dans votre instance locale Ollama.

### Fonctionnement de l'introspection dynamique
1. **Découverte automatique locale** :
   - Dès l'ouverture du dialogue d'élicitation ou de confrontation RFP, Archinex interroge automatiquement l'API locale Ollama (`GET /api/tags` et `GET /v1/models`).
   - Seuls les modèles **réellement installés et disponibles** sur votre machine sont listés dans le sélecteur.
   - Aucun modèle fictif n'est inventé ou imposé si votre serveur local ne le possède pas.
2. **Si aucun modèle n'est installé localement** :
   - L'interface affiche un champ de saisie libre ou une alerte explicite vous invitant soit à télécharger un modèle avec `ollama pull <modèle>`, soit à renseigner une clé API dans `.env`.
3. **Modèles recommandés pour l'analyse d'architecture** :
   - Si vous utilisez Ollama en local, vous pouvez télécharger un modèle adapté à la structuration logique :
     ```bash
     ollama pull llama3.1:8b
     # ou
     ollama pull qwen2.5-coder:14b
     # ou
     ollama pull mistral
     ```

---

## 6. Spécification du Service derrière la Clé d'API Anthropic

### Quelle tête doit avoir le service ?
Le service ciblé par `ANTHROPIC_API_KEY` est l'**API standard Anthropic Messages** :
- **Protocole** : HTTP POST vers `/v1/messages`.
- **Client sous-jacent** : SDK officiel `@anthropic-ai/sdk`.
- **Format de requêtes** : Messages structurés (`system`, `messages: [{ role: 'user' | 'assistant', content }]`), flux de réponse SSE (`stream: true`).
- **Modèles compatibles** : Famille Claude 3.5, Claude 3.7, Claude Sonnet, Opus ou Haiku (ex: `claude-3-5-sonnet-20241022`, `claude-3-7-sonnet-20250219`).

### Utilisation d'un Proxy d'Entreprise ou d'une Passerelle Souveraine
Si votre organisation utilise un proxy mandataire d'entreprise, une passerelle LLM (ex: LiteLLM, Cloudflare AI Gateway, proxy AWS Bedrock/GCP Vertex compatible Messages API) :
1. Renseignez la variable `ANTHROPIC_BASE_URL` dans votre `.env` :
   ```bash
   ANTHROPIC_BASE_URL=https://votre-passerelle-ia.entreprise.internal
   ANTHROPIC_API_KEY=votre-jeton-ou-cle-interne
   ```
2. Le client Archinex dirigera automatiquement toutes les requêtes vers votre point de terminaison interne en respectant les en-têtes officiels (`x-api-key`, `anthropic-version`).
