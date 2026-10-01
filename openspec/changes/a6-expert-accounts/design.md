# Conception Technique A6 — Comptes Experts, Rôles KB & Propagation d'Identité

## 1. Architecture des Données (Prisma & SQLite/PostgreSQL)

### 1.1 Modèle Prisma `KbProfile`
```prisma
model KbProfile {
  id                  String    @id @default(cuid())
  userId              String    @unique
  user                User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  kbHandle            String    @unique
  kbRoles             String    @default("[\"kb:review\"]") // JSON array
  ownedDomains        String    @default("[]")             // JSON array
  delegated           Boolean   @default(false)            // Synchronisé avec LLMOps
  invitationToken     String?   @unique
  invitationExpiresAt DateTime?
  isActive            Boolean   @default(true)
  
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  @@map("kb_profiles")
}
```

### 1.2 Rôles KB canoniques
- `kb:review` : Revue et approbation/rejet de candidats et de règles.
- `kb:evaluate` : Exécution et labellisation d'évaluations et de benchmarks.
- `kb:maintain` : Création, modification et refactorisation de clauses de doctrine.
- `kb:admin` : Gestion des experts, attribution de domaines et publication de releases KB.

## 2. Propagation d'Identité Souveraine (`X-Actor-Email`)

### 2.1 Injection d'entête HTTP dans `LLMOpsClient`
Toute méthode d'interaction experte accepte un contexte d'acteur :
```typescript
interface ActorContext {
  email: string;
  handle?: string;
}
```
L'entête est injecté sur les routes :
- `/api/knowledge/me`
- `/api/knowledge/owners` (lecture et synchronisation)
- `/api/knowledge/candidates` (actions de revue futures A7)
- `/api/knowledge/rules` (maintien de règles A8)
- `/api/evaluations/*` (évaluations A9)

Si `actorEmail` est absent lors d'une action experte requise, le client lève une exception claire `ActorIdentityRequiredError`.

### 2.2 Sécurité Réseau & Zéro-Secret Client
Le navigateur n'a jamais accès au token d'authentification LLMOps (`LLMOPS_AUTH_TOKEN`). Tous les appels transitent par les handlers SvelteKit `/api/...` qui vérifient la session JWT locale, extraient `session.user.email` et délèguent à `llmopsClient` avec l'entête `X-Actor-Email`.

## 3. Gestion des Invitations & Cycle de Vie
1. **Création d'une invitation** :
   - L'administrateur crée un expert avec nom, email, `kbHandle`, `kbRoles` et `ownedDomains`.
   - Génération d'un token aléatoire sécurisé (UUID v4 / hex 32 chars) stocké dans `invitationToken` avec `invitationExpiresAt = now + 7 days`.
   - L'utilisateur est créé avec un mot de passe temporaire ou verrouillé, `role = 'user'`, et son profil `KbProfile`.
2. **Activation de compte** :
   - L'expert suit le lien d'invitation `/invite?token=xyz` ou appelle `POST /api/invite/activate`.
   - Fournit son mot de passe définitif.
   - Validation du token (non expiré, existant).
   - Le token est invalidé (`invitationToken = null`, `invitationExpiresAt = null`), le compte activé (`isActive = true`), `delegated = true`.
   - Déclenchement automatique de la synchronisation d'owner auprès de LLMOps (`PUT /api/knowledge/owners`).
3. **Casbin & Habilitations** :
   - Les règles de groupement Casbin `g(userId, role)` sont mises à jour pour refléter les `kbRoles`.
   - Vérification native via `requirePermission(locals, 'kb:candidate', 'review')` ou `canUserPerformKbAction()`.

## 4. Tolérance aux Pannes & Résilience Dégradée
Si LLMOps renvoie `503 Service Unavailable` (ex: gouvernance DB LLMOps déconnectée) ou est inaccessible :
- `getMe()` bascule sur le profil local `KbProfile` sans interrompre l'expérience utilisateur.
- Les synchronisations `updateOwners()` échouées sont journalisées proprement sans bloquer l'activation locale de l'expert.
