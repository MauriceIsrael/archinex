# Proposition A7 — Boîte de Revue des Experts, Actions et Notifications (Porte G5)

## Contexte
Le jalon G5 matérialise le premier flux métier complet de gouvernance de la doctrine : un expert humain qualifié relit, commente, amende ou approuve un candidat de son domaine directement dans l'interface Archinex, sans passer par la ligne de commande (Issue #2).

Conformément à la constitution et à l'architecture cible, **LLMOps désigne le destinataire et émet des événements, tandis qu'Archinex délivre les notifications et gère l'interaction avec ses utilisateurs**.

## Objectifs
1. **Boîte de Revue `/kb/reviews`** :
   - Alimentée par `GET /api/knowledge/reviews/inbox` avec `X-Actor-Email`.
   - Affichage du motif (`review`, `second_review`, `advice`), délai d'attente, échéance `due_at` (5 jours ouvrés), mise en évidence des retards.
   - Filtres par domaine et par type d'actif (`pattern`, `amendment`, `rex`, `principle`).
2. **Fiche de Revue de Candidat `/kb/reviews/[id]`** :
   - Visualisation du contenu proposé et du diff.
   - Affichage des **7 contrôles automatiques LLMOps** : conformité de schéma, clarté rédactionnelle, testabilité des clauses, non-duplication, souveraineté/air-gap, alignement domaine, impact architectural.
   - Historique des révisions et fil de commentaires interactif.
3. **Actions d'Examen Opposables** :
   - `PATCH /api/knowledge/candidates/{id}` (`accept`, `amend`, `reject`) sans champ `reviewer` (l'acteur est formellement identifié par `X-Actor-Email`).
   - Rejet motivé obligatoire, éditeur de contenu pour `amend`.
   - Traitement explicite des codes HTTP : `403 Forbidden` (l'expert ne possède pas le domaine) et `409 Conflict` (transition d'état interdite).
4. **Sollicitation Croisée & Seconde Revue** :
   - Réassignation (`POST .../assign`) et demande d'avis ou de seconde revue (`POST .../request-review`).
   - La seconde revue d'un principe est déclenchée automatiquement et apparaît dans la boîte du second relecteur.
5. **Moteur de Notification et Polling Idempotent** :
   - Polling périodique de `GET /api/knowledge/events?since=<cursor>` toutes les 30 secondes.
   - Persistance du curseur d'événement (`KbEventCursor`) pour garantir une stricte idempotence (zéro duplication).
   - Distribution in-app (`KbNotification`) aux utilisateurs Archinex identifiés par leur handle.
   - Traitement des événements : `candidate.submitted`, `candidate.assigned`, `review.requested`, `candidate.reviewed`, `candidate.commented`, `reminder.due`.
6. **Journalisation DomainEvent** :
   - Chaque action d'expertise est enregistrée dans la table `DomainEvent` d'Archinex en ajout seul.
7. **Tolérance aux Pannes & Résilience** :
   - Gestion élégante des réponses `503 Unavailable` si la base de gouvernance LLMOps est déconnectée.
