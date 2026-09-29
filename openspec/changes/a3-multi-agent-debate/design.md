# Conception Technique A3 — Débat Multi-Agents Borné

## 1. Modèle Relationnel Prisma

```prisma
model Argument {
  id               String   @id
  subjectId        String
  optionId         String?
  targetArgumentId String?
  stance           String   // support, objection, question, verification, synthesis
  claim            String   // Assertion télégraphique courte
  grounds          String   // Fondement factuel, calcul ou référence (REQUIS)
  kbRefs           String   @default("[]") // JSON array d'identifiants doctrine
  confidence       String   @default("assumed") // certified, verified, assumed, dubious
  author           String
  authorKind       String   // agent:proposer, agent:challenger, agent:verifier, agent:synthesizer, human
  productionMode   String   // human-authored, llm-derived
  round            Int      @default(1)
  resolution       String   @default("open") // open, answered, accepted_risk, withdrawn
  resolvedBy       String?
  resolvedAt       DateTime?
  version          Int      @default(1)

  subject          Subject   @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  option           Option?   @relation(fields: [optionId], references: [id], onDelete: Cascade)
  targetArgument   Argument? @relation("ArgumentReplies", fields: [targetArgumentId], references: [id], onDelete: SetNull)
  replies          Argument[] @relation("ArgumentReplies")

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([subjectId, optionId])
  @@index([targetArgumentId])
  @@map("arguments")
}

model DebateRun {
  id          String    @id
  subjectId   String
  status      String    @default("running") // running, completed, failed
  round       Int       @default(1)
  maxRounds   Int       @default(3)
  startedAt   DateTime  @default(now())
  finishedAt  DateTime?
  error       String?

  subject     Subject   @relation(fields: [subjectId], references: [id], onDelete: Cascade)

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([subjectId])
  @@map("debate_runs")
}
```

## 2. Invariants & Règles de Domaine (`src/lib/domain/debate.ts`)
- `validateArgument(arg, allowedKbRefs?)`:
  - `grounds.trim().length > 0` est obligatoire. Rejet si vide.
  - Si `allowedKbRefs` est fourni (doctrine issue de LLMOps pour ce sujet), tout `kbRef` cité doit en faire partie, sinon rejet.
  - Si `authorKind.startsWith('agent:')` => `productionMode` DOIT être `llm-derived`.
  - Si `authorKind === 'human'` => `productionMode` DOIT être `human-authored`.
- `canCloseObjection`:
  - Seul un humain (expert ou lead architect) peut marquer une objection `accepted_risk` ou `answered`.

## 3. Agents Spécialisés (`src/lib/server/agents/`)
- `proposer.ts` : génère des arguments `support` valorisant les forces d'une option vis-à-vis des critères.
- `challenger.ts` : produit au moins 1 `objection` par option (risques opérationnels, surcoûts cachés, verrous technologiques).
- `verifier.ts` : confronte chaque option à la doctrine disponible (`checkOption`) et produit des arguments `verification`.
- `synthesizer.ts` : produit un bilan contradictoire `synthesis` formulant les compromis et dilemmes clés à destination de l'arbitre humain.
- `debateOrchestrator.ts` :
  - Orchestre 1 tour : Proposer -> Challenger -> Verifier -> Synthesizer.
  - Limite stricte de 3 tours.
  - Traite les arguments humains ouverts en priorité.

## 4. API REST
- `GET /api/projects/[projectId]/subjects/[subjectId]/arguments`
- `POST /api/projects/[projectId]/subjects/[subjectId]/arguments`
- `PATCH /api/projects/[projectId]/subjects/[subjectId]/arguments/[argumentId]/resolve`
- `POST /api/projects/[projectId]/subjects/[subjectId]/debate` (déclenche un run asynchrone)
- `GET /api/projects/[projectId]/subjects/[subjectId]/debate` (état du run en cours)
