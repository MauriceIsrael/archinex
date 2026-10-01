# Proposition A6 — Comptes Experts, Rôles KB & Propagation d'Identité

## Contexte
La gouvernance souveraine de la doctrine d'entreprise exige une traçabilité rigoureuse et une séparation stricte des responsabilités (Issue #1, GitHub #7).
Archinex opère en tant qu'interface d'action et gestionnaire de comptes utilisateurs/experts locaux, tandis que LLMOps (Knowledge Hub) demeure l'autorité sur le registre des propriétaires (`owners`) et sur la recevabilité doctrinale.

Chaque action d'expert (revue, évaluation, maintenance de règle, arbitrage doctrinal) initiée dans Archinex et transmise à LLMOps doit obligatoirement propager l'identité de l'expert via l'entête HTTP `X-Actor-Email`, sans jamais exposer de secret de service dans le navigateur de l'utilisateur.

## Objectifs
1. **Modèle de données & Profils KB (`KbProfile`)** :
   - Association 1:1 à `User` (Prisma) avec attributs : `kbHandle` unique (ex: `@sec-lead`), `kbRoles` (`kb:review`, `kb:evaluate`, `kb:maintain`, `kb:admin`), `ownedDomains` (domaines assignés), `delegated`, statut d'invitation (jeton unique 7 jours) et `isActive`.
2. **Propagation d'Identité Souveraine (`X-Actor-Email`)** :
   - Enrichissement du client serveur `LLMOpsClient` pour injecter dynamiquement `X-Actor-Email` pour toutes les requêtes expertes.
   - Refus strict et garde-fou si une tentative d'action experte est déclenchée sans identité d'acteur authentifié.
3. **Contrôle d'accès & Casbin** :
   - Habilitation des rôles `kb:*` dans Casbin (`g, <userId>, kb:review`, `p, kb:review, kb:candidate, review`...).
   - Interdiction formelle à un utilisateur standard ou à une identité non reconnue de poser des actes d'expertise.
4. **Synchronisation d'Owners avec LLMOps** :
   - Endpoints `GET /api/knowledge/me`, `GET /api/knowledge/owners`, `PUT /api/knowledge/owners`.
   - Dès qu'un expert active son compte via son jeton d'invitation sur Archinex, synchronisation immédiate avec LLMOps en marquant l'expert comme activé (`delegated: true`).
   - Tolérance aux pannes : repli gracieux et gestion des retours `503 Unavailable` si la base de gouvernance LLMOps est déconnectée.
5. **Interface d'administration & Profil Expert** :
   - Gestionnaire d'experts dans l'administration (`/admin` onglet Experts KB & `/admin/experts`) : invitation par email, attribution des rôles KB et domaines, visualisation et copie du lien d'invitation.
   - Endpoint d'activation `/api/invite/activate` (token unique 7j).
   - Widget et page de profil `/kb/me` affichant le handle, les rôles KB, les domaines gérés et le décompte des revues en attente.
