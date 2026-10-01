# Conception Technique A7 — Boîte de Revue des Experts, Actions et Notifications (Porte G5)

## 1. Modèles de Données Persistants (Prisma)

### 1.1 Modèle `KbNotification`
Stocke les notifications in-app distribuées aux experts et utilisateurs locaux :
```prisma
model KbNotification {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  recipientHandle String
  eventType       String   // candidate.submitted, candidate.assigned, review.requested, etc.
  candidateId     String?
  title           String
  message         String
  read            Boolean  @default(false)
  metadata        String   @default("{}") // JSON
  createdAt       DateTime @default(now())

  @@index([userId, read])
  @@map("kb_notifications")
}
```

### 1.2 Modèle `KbEventCursor`
Curseur de synchronisation pour le polling des événements LLMOps :
```prisma
model KbEventCursor {
  id           String   @id // e.g. "llmops_events_cursor"
  cursor       String
  lastPolledAt DateTime @default(now())

  @@map("kb_event_cursors")
}
```

## 2. Contrats d'Intégration LLMOps API v1.5

### 2.1 Boîte de Réception (`GET /api/knowledge/reviews/inbox`)
- Headers requis : `Authorization`, `X-Actor-Email: <user_email>`.
- Réponse :
```typescript
export interface KbReviewInboxItem {
  id: string; // ID de la demande de revue
  candidate_id: string;
  title: string;
  kind: 'new_asset' | 'amendment' | 'rex' | 'principle';
  domain: string;
  reason: 'review' | 'second_review' | 'advice';
  waiting_since: string;
  due_at: string; // 5 jours ouvrés par défaut
  is_overdue: boolean;
  author: string;
  severity?: 'critical' | 'major' | 'minor' | 'info';
}
```

### 2.2 Fiche Candidat & 7 Contrôles Automatiques (`GET /api/knowledge/candidates/{id}`)
Les 7 contrôles automatiques retournés par LLMOps :
1. `schema_validity` : respect du schéma d'actif.
2. `clarity_score` : clarté rédactionnelle et concision.
3. `testability` : présence de prédicats testables (when/expect).
4. `non_duplication` : absence de redondance avec la doctrine existante.
5. `sovereign_compliance` : détection d'exfiltration ou dépendance cloud externe.
6. `domain_alignment` : cohérence avec le périmètre du domaine.
7. `architectural_impact` : analyse de criticité et d'effet de bord.

### 2.3 Actions d'Examen (`PATCH /api/knowledge/candidates/{id}`)
- Requête :
```json
{
  "action": "accept" | "amend" | "reject",
  "reason": "Motif obligatoire en cas de rejet ou d'amendement",
  "amended_content": { ... }
}
```
- Aucun champ `reviewer` n'est envoyé : LLMOps extrait l'acteur de `X-Actor-Email`.
- Gestion des erreurs HTTP spécifiques :
  - `403 Forbidden` : l'expert ne possède pas le domaine du candidat.
  - `409 Conflict` : transition d'état invalide (ex: candidat déjà accepté ou rejeté).

### 2.4 Sollicitations Croisées
- Réassignation : `POST /api/knowledge/candidates/{id}/assign` (`{ assignee: "@other-expert", reason: "..." }`)
- Seconde revue / Avis : `POST /api/knowledge/candidates/{id}/request-review` (`{ kind: "second_review" | "advice", recipient: "@reviewer2", message: "...", due_at: "..." }`)
- Règle constitutionnelle des principes : la soumission d'un actif de type `principle` déclenche automatiquement une seconde revue.

## 3. Moteur d'Événements & Polling Idempotent
1. Le service `pollAndDispatchEvents()` interroge `GET /api/knowledge/events?since=<cursor>`.
2. Pour chaque événement renvoyé :
   - Parcours des handles cibles dans `recipients`.
   - Résolution locale des utilisateurs Archinex via `kbHandle` dans `KbProfile`.
   - Insertion de `KbNotification` pour chaque utilisateur concerné.
   - Journalisation d'un `DomainEvent` en base.
3. Enregistrement transactionnel du nouveau curseur (`KbEventCursor.cursor = newCursor`).
4. Toute ré-exécution avec le même curseur ne génère aucun doublon.

## 4. Expérience Utilisateur
- `/kb/reviews` : tableau ergonomique avec badges d'urgence, temps restant, filtres par domaine et par type.
- `/kb/reviews/[id]` : fiche de revue complète avec aperçu des 7 contrôles, éditeur markdown pour `amend`, modale de confirmation motivée pour `reject`, dialogue de réassignation et fil de discussion.
- En-tête de navigation : cloche de notifications en temps réel avec badge de notifications non lues.
