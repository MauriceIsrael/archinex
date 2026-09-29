# Conception Technique A1 — État serveur partagé

## 1. Choix d'Architecture de Stockage & Compatibilité
- **Dualité SQLite (Dev) / PostgreSQL (Prod)** : Le schéma Prisma n'utilise aucune fonctionnalité propriétaire d'un SGBD spécifique. Les tableaux et objets complexes sont sérialisés en chaînes JSON standardisées (`String`).
- **Transition `Engagement` vers `Project`** :
  - Création du modèle `Project` mappé sur la table `projects`.
  - La table `engagements` reste présente et lisible pour assurer la non-régression immédiate, puis sera dépréciée au profit des tables relationnelles.

## 2. Modèles Prisma Normalisés

```prisma
model Project {
  id          String   @id
  title       String
  shortName   String
  type        String   // generic_blueprint, project_rfp, audit_resilience, poc_migration
  badge       String
  description String
  status      String   @default("active") // active, archived
  strategy    String   @default("{}")     // ProjectStrategy JSON
  version     Int      @default(1)
  
  members     ProjectMember[]
  subjects    Subject[]
  statements  Statement[]
  events      DomainEvent[]
  frameworks  ProjectFramework[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("projects")
}

model ProjectMember {
  id        String   @id @default(cuid())
  projectId String
  userId    String
  role      String   // lead_architect, domain_expert, contributor, viewer
  domains   String   @default("[]") // JSON array of domain tags
  
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([projectId, userId])
  @@map("project_members")
}

model Subject {
  id                 String   @id
  projectId          String
  sectionRef         String
  name               String
  domain             String?  @default("general")
  problemStatement   String?  @default("")
  maturityLevel      String   @default("L0_named") // L0_named, L1_framed, L2_decomposed, L3_decided, L4_specified, L5_archived
  deliberationStatus String   @default("open")     // open, debating, ready_for_arbitration, arbitrated
  waitingForRole     String?  @default("lead_architect")
  relativeEffort     String?  @default("M")
  blockingCount      Int      @default(0)
  unlocksCount       Int      @default(0)
  version            Int      @default(1)
  
  project            Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  questions          Question[]
  
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([projectId, sectionRef])
  @@map("subjects")
}

model Statement {
  id              String   @id
  projectId       String
  subjectId       String?
  section         String
  
  // Facette 1 : Contenu (Triplet)
  subjectRef      String   // Sujet ontologique du triplet
  predicate       String
  value           String
  unit            String?
  
  // Facette 2 : Justification
  basedOn         String   @default("[]") // JSON array d'antécédents
  appliedRule     String?
  
  // Facette 3 : Autorité (Invariant II)
  author          String
  role            String
  productionMode  String   // human-authored, llm-proposed-human-approved, llm-derived
  
  // Facette 4 : Maturité & Confiance
  confidence      String   // verified, designed, observed, stated-by-client, assumed
  subjectLevel    String   // L0_named..L4_specified
  
  // Facette 5 : Révisabilité
  consequences    String?
  status          String   @default("active") // active, contested, retracted
  version         Int      @default(1)
  
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  antecedents     StatementAntecedent[] @relation("Descendant")
  dependents      StatementAntecedent[] @relation("Ancestor")
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([projectId, section])
  @@map("statements")
}

model StatementAntecedent {
  statementId  String
  antecedentId String
  
  statement    Statement @relation("Descendant", fields: [statementId], references: [id], onDelete: Cascade)
  antecedent   Statement @relation("Ancestor", fields: [antecedentId], references: [id], onDelete: Cascade)

  @@id([statementId, antecedentId])
  @@map("statement_antecedents")
}

model Question {
  id           String   @id
  subjectId    String
  text         String
  assignedRole String
  blocking     Boolean  @default(false)
  status       String   @default("open") // open, answered, waived
  version      Int      @default(1)
  
  subject      Subject  @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("questions")
}

model DomainEvent {
  id             String   @id @default(cuid())
  projectId      String
  entityType     String   // project, subject, statement, question, member
  entityId       String
  type           String   // CREATED, UPDATED, DELETED, MATURITY_CHANGED, RETRACTED, etc.
  payload        String   // JSON detail
  actorId        String
  actorRole      String
  productionMode String
  createdAt      DateTime @default(now())
  
  project        Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId, createdAt])
  @@map("domain_events")
}

model ProjectFramework {
  id             String   @id @default(cuid())
  projectId      String
  framework      String
  coverageStatus String   // covered, partial, missing, unknown
  coverageDetail String   @default("{}") // JSON
  checkedAt      DateTime @default(now())
  
  project        Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, framework])
  @@map("project_frameworks")
}
```

## 3. Mécanisme de Verrouillage Optimiste & Gestion de Concurrence
Chaque requête de mise à jour (`PATCH`, `DELETE`) envoie `expectedVersion`.
Exemple sur `Subject` :
```typescript
const updated = await prisma.$transaction(async (tx) => {
  const current = await tx.subject.findUnique({ where: { id: subjectId } });
  if (!current) throw new NotFoundError();
  if (current.version !== expectedVersion) {
    throw new ConflictError('Version mismatch', current);
  }
  
  const next = await tx.subject.update({
    where: { id: subjectId },
    data: {
      ...updates,
      version: current.version + 1
    }
  });

  await tx.domainEvent.create({
    data: {
      projectId: current.projectId,
      entityType: 'subject',
      entityId: subjectId,
      type: 'SUBJECT_UPDATED',
      payload: JSON.stringify(updates),
      actorId,
      actorRole,
      productionMode
    }
  });

  return next;
});
```

En cas de conflit (`409 Conflict`), le serveur renvoie l'entité courante avec sa nouvelle version pour que l'IHM propose la fusion ou le rechargement.

## 4. Rejeu d'État par Événements (`replaySubject`)
Une fonction pure `replaySubject(initialState, events)` permet de reconstituer l'état exact d'un sujet à un instant $t$ à partir de son journal de bord `DomainEvent`, garantissant l'auditabilité et la reproductibilité des décisions d'architecture.

## 5. Rétractation Causalement Clôturée en Base (Invariant VI)
Lorsqu'un énoncé $S_1$ est invalidé (`status = 'retracted'`), la fonction serveur `retractStatementCascade(projectId, statementId)` :
1. Recherche récursivement tous les énoncés dépendants dans `StatementAntecedent`.
2. Dégrade tous les descendants au statut `assumed` ou `retracted` selon la criticité.
3. Écrit un événement `STATEMENT_RETRACTED` pour chacun dans la même transaction.
