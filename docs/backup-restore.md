# Guide de Restauration de la Base de Données et des Comptes Utilisateurs — Archinex

> **Ce guide détaille la procédure complète pour restaurer une ancienne base de données SQLite dans Archinex, explicite la gestion rigoureuse des fichiers journaux `.db-wal` et `.db-shm`, permet de récupérer les comptes utilisateurs associés et d'assurer la synchronisation avec le Knowledge Hub.**

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
- `prisma/dev.db-wal` : Journal de pré-écriture (*Write-Ahead Logging*).
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

## 2. Que faire des fichiers `.db-wal` et `.db-shm` ?

Le mode WAL (*Write-Ahead Logging*) est indispensable aux performances et à la concurrence d'Archinex (il permet à des lecteurs de ne pas bloquer les rédacteurs et inversement). Cependant, son fonctionnement multi-fichiers impose des règles strictes lors des sauvegardes et restaurations.

### 2.1 Rôle et cycle de vie de chaque fichier
- **`dev.db` (Fichier principal)** : Contient les pages B-Tree pérennes. Tant qu'un *checkpoint* n'a pas eu lieu, ce fichier peut ne pas contenir les transactions les plus récentes.
- **`dev.db-wal` (Journal de pré-écriture)** : Toutes les écritures (`INSERT`, `UPDATE`, `DELETE`) sont d'abord apposées séquentiellement dans ce fichier. Lors d'un arrêt propre de toutes les connexions ou périodiquement, SQLite exécute un *checkpoint* qui recopie ces pages dans `dev.db` et tronque le fichier WAL.
- **`dev.db-shm` (Shared Memory)** : Index volatile partagé entre les processus pour localiser les pages dans le WAL sans balayer tout le fichier journal. **Ce fichier ne contient aucune donnée métier.**

### 2.2 Règle d'or pour le fichier `.db-shm`
> [!IMPORTANT]
> **Le fichier `.db-shm` ne doit JAMAIS être sauvegardé ni restauré.**
> - Il est purement temporaire et recréé automatiquement par SQLite à l'ouverture de la base.
> - Si un fichier `dev.db-shm` traîne sur le disque avant une restauration, **supprimez-le systématiquement**. Conserver un `.shm` issu d'une autre base ou d'un processus antérieur expose à des erreurs de mappage mémoire (`SQLITE_IOERR_SHMMAP`) ou à des incohérences de verrous.

### 2.3 Règle d'or pour le fichier `.db-wal` : Deux scénarios distincts

#### Scénario A · Lors d'une SAUVEGARDE (Backup)
Si vous copiez uniquement `dev.db` alors qu'un fichier `dev.db-wal` non vide existe sur le disque, **votre sauvegarde sera incomplète ou incohérente** : les dernières transactions (ex: utilisateurs créés, décisions d'architecture récentes) se trouvent encore dans le WAL.

**Deux méthodes recommandées pour une sauvegarde intègre :**
1. **Méthode 1 : Forcer un Checkpoint avant de copier (Flush complet)**
   Avant de copier `dev.db`, ordonnez à SQLite de rapatrier toutes les transactions du WAL dans la base principale et de tronquer le WAL :
   ```bash
   node -e "const Database = require('better-sqlite3'); const db = new Database('prisma/dev.db'); const res = db.pragma('wal_checkpoint(TRUNCATE)'); console.log('Checkpoint status:', res); db.close();"
   ```
   Une fois le WAL tronqué (taille ramenée à 0 octet), `dev.db` contient 100 % des données et peut être copié en tant que fichier unique autonome.
2. **Méthode 2 : Cliché atomique à chaud via `VACUUM INTO` (Recommandé)**
   SQLite permet de créer une sauvegarde autonome parfaite, 100 % compactée et réconciliée, sans dépendance au WAL :
   ```bash
   node -e "const Database = require('better-sqlite3'); const db = new Database('prisma/dev.db'); db.prepare('VACUUM INTO ?').run('prisma/dev.db.bak'); console.log('Sauvegarde atomique dev.db.bak créée !'); db.close();"
   ```

#### Scénario B · Lors d'une RESTAURATION (Restore)

##### Cas standard : Vous restaurez un fichier autonome (`.bak` ou `.db`)
Si vous remplacez `dev.db` par une sauvegarde autonome :
1. **Arrêtez l'application.**
2. **Supprimez impérativement `dev.db-wal` et `dev.db-shm` résiduels** présents dans le dossier `prisma/`.
   > [!CAUTION]
   > **Le piège du Rejeu Croisé (*Cross-WAL Replay Corruption*) :**
   > Si vous écrasez `dev.db` par une ancienne sauvegarde mais laissez en place l'ancien fichier `dev.db-wal` de la session courante, SQLite va tenter au démarrage de rejouer les écritures de cet ancien WAL sur votre base restaurée. Comme les numéros de page ne correspondent pas, la base restaurée sera **immédiatement et irrémédiablement corrompue**.

##### Cas particulier : Votre sauvegarde incluait un fichier WAL associé
Si votre sauvegarde comportait un couple coordonné (ex: `dev.db.current_bak` et `dev.db-wal.current_bak`) :
1. Supprimez tout fichier `dev.db-shm`.
2. Restaurez `dev.db.current_bak` vers `prisma/dev.db`.
3. Restaurez `dev.db-wal.current_bak` vers `prisma/dev.db-wal`.
4. Forcez immédiatement la réconciliation et le vidage du WAL dans `dev.db` :
   ```bash
   node -e "const Database = require('better-sqlite3'); const db = new Database('prisma/dev.db'); db.pragma('wal_checkpoint(TRUNCATE)'); console.log('WAL réconcilié et tronqué !'); db.close();"
   ```
   Dès lors, `dev.db` est entièrement à jour et le WAL est vidé.

### 2.4 Matrice décisionnelle des fichiers

| Fichier | Nature & Rôle | À la Sauvegarde (Backup) | À la Restauration (Restore) |
| :--- | :--- | :--- | :--- |
| **`dev.db`** | Données principales persistantes | À copier (après checkpoint ou via `VACUUM INTO`) | À écraser par le fichier restauré |
| **`dev.db-wal`** | Transactions récentes non réconciliées | À vider via `wal_checkpoint(TRUNCATE)` avant copie ; sinon à copier impérativement avec `dev.db` | **À supprimer** si restauration autonome ; à réconcilier si restauré conjointement |
| **`dev.db-shm`** | Index volatile en mémoire partagée | **Ne jamais sauvegarder** | **À supprimer systématiquement** (recréé automatiquement) |

---

## 3. Procédure de Restauration Pas-à-Pas (Cas Nominal)

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

### Étape 3 : Remplacer la base et purger les résidus WAL / SHM
Pour restaurer une ancienne base autonome (par exemple `prisma/dev.db.bak`) :

**Sous Windows (PowerShell) :**
```powershell
# 1. Suppression obligatoire des résidus WAL et SHM
Remove-Item prisma/dev.db-wal, prisma/dev.db-shm -Force -ErrorAction SilentlyContinue

# 2. Restauration de la sauvegarde vers dev.db
Copy-Item prisma/dev.db.bak prisma/dev.db -Force
```

**Sous Linux / macOS (Bash) :**
```bash
# 1. Suppression obligatoire des résidus WAL et SHM
rm -f prisma/dev.db-wal prisma/dev.db-shm

# 2. Restauration de la sauvegarde vers dev.db
cp prisma/dev.db.bak prisma/dev.db
```

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

## 4. Gestion et Récupération des Comptes Utilisateurs

### 4.1 Vos comptes restaurés sont déjà fonctionnels
Dans une base SQLite restaurée, **tous les utilisateurs enregistrés à la date du backup sont intégralement préservés**, y compris leurs mots de passe d'origine, leurs profils experts et leurs droits Casbin.

Par exemple, dans la sauvegarde `dev.db.bak` présente dans le dépôt, les comptes suivants sont immédiatement opérationnels :
- `admin@archinex.local` (Lead Architect - Admin)
- `architect@archinex.local` (Architecte Domaine)
- `expert@archinex.local` (Expert Sécurité & Cloud)
- `maurice.israel+maint@free.fr` (Momo Maint - Admin)
- `maurice.israel+archi@free.fr` (Momo KB)
- `loic@archinex.local` (Expert Conformance 3GPP)

### 4.2 Réinjecter ou rafraîchir les comptes démo sans écraser les comptes restaurés
Si votre ancienne base ne disposait pas des comptes de démonstration canoniques ou si vous souhaitez réaligner les règles Casbin globales :

```bash
npx prisma db seed
# ou : npx tsx prisma/seed.ts
```

> [!TIP]
> Le script `prisma/seed.ts` utilise des opérations `upsert` ciblées sur les e-mails `@archinex.local`. Il **ne supprime pas** vos comptes personnalisés préexistants et se contente de créer ou mettre à jour les comptes et permissions par défaut.

### 4.3 Réinitialiser le mot de passe d'un administrateur (Perte d'accès)
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

### 4.4 Synchronisation avec le Knowledge Hub (LLMOps)
Si votre instance Archinex est connectée au Hub souverain LLMOps (`LLMOPS_BASE_URL`) :
- Les comptes démo sont synchronisés lors de l'exécution de `prisma/seed.ts`.
- Pour tout autre compte utilisateur restauré, Archinex assure une synchronisation **JIT** (*Just-in-Time*) : dès que l'utilisateur se connecte sur `/login` ou accède à l'espace `/kb`, son handle et ses droits d'expertise sont validés auprès du registre LLMOps.

---

## 5. Vérification Immédiate Post-Restauration

Avant de relancer l'application, vous pouvez valider en quelques secondes l'état de la base restaurée :

### 5.1 Contrôle d'intégrité SQLite et état du WAL
```bash
node -e "const Database = require('better-sqlite3'); const db = new Database('prisma/dev.db'); console.log('Intégrité :', db.pragma('integrity_check')); console.log('Mode journal :', db.pragma('journal_mode'));"
```

### 5.2 Inspecter les utilisateurs présents dans la base
```bash
node -e "const Database = require('better-sqlite3'); const db = new Database('prisma/dev.db'); console.table(db.prepare('SELECT id, name, email, role FROM users').all());"
```

### 5.3 Inspecter les engagements / projets restaurés
```bash
node -e "const Database = require('better-sqlite3'); const db = new Database('prisma/dev.db'); console.table(db.prepare('SELECT id, title, shortName, status FROM engagements').all());"
```

### 5.4 Démarrer le serveur et se connecter
```bash
npm run dev
```
Rendez-vous sur [http://localhost:5173/login](http://localhost:5173/login) pour vous connecter avec les identifiants restaurés ou réinitialisés.

---

## 6. Cas d'un Déploiement Conteneurisé (Docker / Sandbox)

Dans une image Docker (`deploy/sandbox` ou image de production) :
- La base SQLite se trouve dans le volume monté sur `/app/prisma`.
- Pour restaurer une ancienne base dans un conteneur :
  ```bash
  # 1. Arrêter le conteneur ou purger les fichiers WAL dans le conteneur
  docker exec -it <container_id> rm -f /app/prisma/dev.db-wal /app/prisma/dev.db-shm
  
  # 2. Copier la base restaurée dans le conteneur
  docker cp dev.db.bak <container_id>:/app/prisma/dev.db
  
  # 3. Redémarrer le conteneur (l'entrypoint exécute automatiquement db push et bootstrap-admin)
  docker restart <container_id>
  ```
