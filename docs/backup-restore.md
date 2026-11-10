# Guide de Restauration de la Base de Données et des Comptes Utilisateurs — Archinex

> **Ce guide détaille la procédure complète pour restaurer une ancienne base de données SQLite dans Archinex, récupérer les comptes utilisateurs associés, maintenir l'intégrité des règles d'accès Casbin et synchroniser les profils experts avec le Knowledge Hub.**

---

## 1. Architecture de Persistance d'Archinex

Archinex s'appuie sur **Prisma** avec le moteur **SQLite** (`@prisma/adapter-better-sqlite3` et `better-sqlite3`).

### 1.1 Emplacement et Fichiers Clés
Par défaut, la configuration définie dans `prisma.config.ts` et `.env` pointe sur :
```env
DATABASE_URL="file:./dev.db"
```
Ce chemin est résolu relativement au dossier `prisma/` :
- `prisma/dev.db` : Fichier principal de la base SQLite active.
- `prisma/dev.db-wal` : Journal de pré-écriture (*Write-Ahead Logging*). Il contient les transactions récentes non encore écrites sur le fichier principal.
- `prisma/dev.db-shm` : Fichier d'index en mémoire partagée du mode WAL.
- `prisma/dev.db.bak` (et `prisma/*.bak`) : Fichiers d'anciennes sauvegardes ou clichés de référence.

### 1.2 Structure des Comptes Utilisateurs
Dans Archinex, les comptes utilisateurs et leurs habilitations sont répartis sur trois tables relationnelles liées :
1. **`users` (`model User`)** :
   - Identité (`id`, `name`, `email`).
   - Empreinte de mot de passe sécurisée (`passwordHash` haché avec `bcrypt`).
   - Rôle applicatif principal (`role`: `'admin'` ou `'user'`).
   - Attributs ABAC en JSON (`attributes` : département, habilitation/clearance, tags).
2. **`kb_profiles` (`model KbProfile`)** :
   - Lié en 1-à-1 à la table `users` via `userId`.
   - Identifiant expert (`kbHandle`, ex: `@sec-expert`, `@admin-lead`).
   - Rôles d'arbitrage de doctrine (`kbRoles` : `kb:review`, `kb:evaluate`, `kb:maintain`, `kb:admin`).
   - Domaines de compétence (`ownedDomains` : `['security', 'cloud', 'architecture']`).
3. **`casbin_rule` (`model CasbinRule`)** :
   - Table du moteur d'autorisation Casbin.
   - Contient les règles RBAC/ABAC reliant directement les utilisateurs (`ptype: 'g'`) aux rôles applicatifs et permissions KB.

---

## 2. Procédure de Restauration Pas-à-Pas (Cas Nominal)

> [!WARNING]
> **Ne jamais restaurer ou remplacer le fichier `dev.db` pendant que le serveur applicatif (`npm run dev`) ou un conteneur est en cours d'exécution.**
> Les verrous SQLite actifs et le journal WAL écraseraient ou corrompraient la base restaurée.

### Étape 1 : Arrêter les processus actifs
Arrêtez le serveur de développement dans votre terminal (`Ctrl + C`) ou éteignez les conteneurs Docker en cours d'exécution :
```bash
# Si docker compose / sandbox est actif :
docker compose down
```

### Étape 2 : Sauvegarder préventivement la base actuelle
Avant toute manipulation, préservez l'état actuel de votre environnement :

**Sous Windows (PowerShell) :**
```powershell
Copy-Item prisma/dev.db "prisma/dev.db.pre-restore-$(Get-Date -Format 'yyyyMMdd-HHmmss')" -ErrorAction SilentlyContinue
```

**Sous Linux / macOS (Bash) :**
```bash
cp prisma/dev.db "prisma/dev.db.pre-restore-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
```

### Étape 3 : Remplacer la base et purger les résidus WAL
Pour restaurer une ancienne base (par exemple `prisma/dev.db.bak` ou un fichier `archive.db`) :

1. **Supprimer les fichiers temporaires WAL résiduels** pour éviter que d'anciennes transactions mémoire ne s'appliquent sur la nouvelle base :
   - Supprimez `prisma/dev.db-wal` et `prisma/dev.db-shm` (s'ils existent).
2. **Copier le fichier de sauvegarde** vers `prisma/dev.db`.

**Sous Windows (PowerShell) :**
```powershell
# Suppression des fichiers résiduels de la base active
Remove-Item prisma/dev.db-wal, prisma/dev.db-shm -Force -ErrorAction SilentlyContinue

# Restauration depuis dev.db.bak (ou le fichier de votre choix)
Copy-Item prisma/dev.db.bak prisma/dev.db -Force
```

**Sous Linux / macOS (Bash) :**
```bash
rm -f prisma/dev.db-wal prisma/dev.db-shm
cp prisma/dev.db.bak prisma/dev.db
```

> [!NOTE]
> Si votre sauvegarde était accompagnée d'un fichier WAL spécifique (ex: `dev.db-wal.current_bak`), restaurez conjointement ce fichier sous le nom `prisma/dev.db-wal`.

### Étape 4 : Régénérer le client Prisma et aligner le schéma
Si le schéma Prisma a évolué depuis la création de l'ancienne sauvegarde, appliquez les évolutions de structure sans perte de données :

```bash
# 1. Regénérer le client typé TypeScript
npx prisma generate

# 2. Synchroniser le schéma Prisma avec la base restaurée
npx prisma db push
```

`prisma db push` va inspecter la base restaurée et créer d'éventuelles tables ou colonnes manquantes introduites dans les versions récentes du code sans toucher aux données existantes.

---

## 3. Gestion et Récupération des Comptes Utilisateurs

### 3.1 Vos comptes restaurés sont déjà fonctionnels
Dans une base SQLite restaurée, **tous les utilisateurs enregistrés à la date du backup sont intégralement préservés**, y compris leurs mots de passe d'origine, leurs profils experts et leurs droits Casbin.

Par exemple, dans la sauvegarde `dev.db.bak` présente dans le dépôt, les comptes suivants sont immédiatement opérationnels :
- `admin@archinex.local` (Lead Architect - Admin)
- `architect@archinex.local` (Architecte Domaine)
- `expert@archinex.local` (Expert Sécurité & Cloud)
- `maurice.israel+maint@free.fr` (Momo Maint - Admin)
- `maurice.israel+archi@free.fr` (Momo KB)
- `loic@archinex.local` (Expert Conformance 3GPP)

### 3.2 Réinjecter ou rafraîchir les comptes démo sans écraser les comptes restaurés
Si votre ancienne base ne disposait pas des comptes de démonstration canoniques ou si vous souhaitez réaligner les règles Casbin globales :

```bash
npx prisma db seed
# ou : npx tsx prisma/seed.ts
```

> [!TIP]
> Le script `prisma/seed.ts` utilise des opérations `upsert` ciblées sur les e-mails `@archinex.local`. Il **ne supprime pas** vos comptes personnalisés préexistants et se contente de créer ou mettre à jour les comptes et permissions par défaut.

### 3.3 Réinitialiser le mot de passe d'un administrateur (Perte d'accès)
Si vous avez restauré une base dont vous ne connaissez plus le mot de passe administrateur :

#### Méthode A : Via le script officiel de bootstrap
Archinex inclut `prisma/bootstrap-admin.ts`, capable de promouvoir un utilisateur ou de créer un administrateur garanti :

**Sous Windows (PowerShell) :**
```powershell
$env:ARCHINEX_BOOTSTRAP_ADMIN_EMAIL="admin@archinex.local"
$env:ARCHINEX_BOOTSTRAP_ADMIN_PASSWORD="NouveauMotDePasse123!"
npx tsx prisma/bootstrap-admin.ts
```

**Sous Linux / macOS (Bash) :**
```bash
ARCHINEX_BOOTSTRAP_ADMIN_EMAIL="admin@archinex.local" \
ARCHINEX_BOOTSTRAP_ADMIN_PASSWORD="NouveauMotDePasse123!" \
npx tsx prisma/bootstrap-admin.ts
```

#### Méthode B : Réinitialisation instantanée en ligne de commande
Vous pouvez mettre à jour le mot de passe de n'importe quel compte directement avec ce one-liner Node.js :

```bash
node -e "const bcrypt = require('bcryptjs'); const Database = require('better-sqlite3'); const db = new Database('prisma/dev.db'); const hash = bcrypt.hashSync('MonSuperPass123', 10); db.prepare('UPDATE users SET passwordHash = ? WHERE email = ?').run(hash, 'admin@archinex.local'); console.log('✅ Mot de passe mis à jour !');"
```

### 3.4 Synchronisation avec le Knowledge Hub (LLMOps)
Si votre instance Archinex est connectée au Hub souverain LLMOps (`LLMOPS_BASE_URL`) :
- Les comptes démo sont synchronisés lors de l'exécution de `prisma/seed.ts`.
- Pour tout autre compte utilisateur restauré, Archinex assure une synchronisation **JIT** (*Just-in-Time*) : dès que l'utilisateur se connecte sur `/login` ou accède à l'espace `/kb`, son handle et ses droits d'expertise sont validés auprès du registre LLMOps.

---

## 4. Vérification Immédiate Post-Restauration

Avant de relancer l'application, vous pouvez valider en 2 secondes l'état de la base restaurée :

### 4.1 Inspecter les utilisateurs présents dans la base
Exécutez cette commande dans votre terminal :

```bash
node -e "const Database = require('better-sqlite3'); const db = new Database('prisma/dev.db'); console.table(db.prepare('SELECT id, name, email, role FROM users').all());"
```

### 4.2 Inspecter les engagements / projets restaurés
```bash
node -e "const Database = require('better-sqlite3'); const db = new Database('prisma/dev.db'); console.table(db.prepare('SELECT id, title, shortName, status FROM engagements').all());"
```

### 4.3 Démarrer le serveur et se connecter
```bash
npm run dev
```
Rendez-vous sur [http://localhost:5173/login](http://localhost:5173/login) pour vous connecter avec les identifiants restaurés ou réinitialisés.

---

## 5. Cas d'un Déploiement Conteneurisé (Docker / Sandbox)

Dans une image Docker (`deploy/sandbox` ou image de production) :
- La base SQLite se trouve dans le volume monté sur `/app/prisma`.
- Pour restaurer une ancienne base dans un conteneur en cours d'exécution :
  ```bash
  # 1. Copier la base restaurée dans le conteneur
  docker cp dev.db.bak <container_id>:/app/prisma/dev.db
  
  # 2. Redémarrer le conteneur (l'entrypoint exécute automatiquement db push et bootstrap-admin)
  docker restart <container_id>
  ```
