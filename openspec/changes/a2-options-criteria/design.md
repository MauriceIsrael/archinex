# Conception Technique A2 — Critères, options, compromis, décision

## 1. Modèles de Données & Relations Prisma

Les modèles relationnels sont rattachés aux `Subject` et `Project` existants. Toutes les entités modifiables portent `version Int @default(1)`.

```prisma
model Criterion {
  id             String   @id
  subjectId      String
  name           String
  description    String   @default("")
  kind           String   // functional, nfr, cost, risk, compliance
  weight         Int      @default(3) // 1 à 5
  kbRef          String?
  author         String
  role           String   @default("lead_architect")
  productionMode String   // human-authored, llm-proposed-human-approved, llm-derived
  version        Int      @default(1)
  
  subject        Subject  @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  evaluations    OptionEvaluation[]
  
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([subjectId])
  @@map("criteria")
}

model Option {
  id             String   @id
  subjectId      String
  title          String
  summary        String
  origin         String   // human, llm-proposed, kb-pattern
  kbRefs         String   @default("[]") // JSON array
  status         String   @default("proposed") // proposed, debated, retained, rejected
  author         String
  role           String   @default("lead_architect")
  productionMode String   // human-authored, llm-proposed-human-approved, llm-derived
  version        Int      @default(1)
  
  subject        Subject  @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  evaluations    OptionEvaluation[]
  tradeOffs      TradeOff[]
  
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([subjectId])
  @@map("options")
}

model OptionEvaluation {
  id             String   @id @default(cuid())
  optionId       String
  criterionId    String
  score          Int      // -2 à +2
  justification  String   // Requise, jamais vide
  evidenceRefs   String   @default("[]") // JSON array
  author         String
  role           String   @default("lead_architect")
  productionMode String   // human-authored, llm-proposed-human-approved, llm-derived
  version        Int      @default(1)
  
  option         Option    @relation(fields: [optionId], references: [id], onDelete: Cascade)
  criterion      Criterion @relation(fields: [criterionId], references: [id], onDelete: Cascade)
  
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([optionId, criterionId])
  @@map("option_evaluations")
}

model TradeOff {
  id             String   @id
  subjectId      String
  optionId       String
  gains          String
  sacrifices     String
  criterionIds   String   @default("[]") // JSON array
  version        Int      @default(1)
  
  option         Option   @relation(fields: [optionId], references: [id], onDelete: Cascade)
  
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([subjectId, optionId])
  @@map("trade_offs")
}

model Decision {
  id                 String   @id
  subjectId          String   @unique
  retainedOptionId   String
  rejected           String   @default("[]") // JSON array [{optionId, reason}]
  rationale          String
  reversibility      String   // reversible, costly, irreversible
  arbiterId          String
  arbiterRole        String
  decidedAt          DateTime @default(now())
  acceptedViolations String   @default("[]") // JSON array [{typedId, justification}]
  kbCandidateIds     String   @default("[]") // JSON array
  version            Int      @default(1)
  
  subject            Subject  @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@map("decisions")
}
```

## 2. Fonctions Pures de Domaine (`src/lib/domain/options.ts`)
- `weightedScore(optionId, criteria, evaluations): number`
  Calcule la somme pondérée $\sum (\text{score} \times \text{weight}) / \sum \text{weight}$ normalisée.
- `validateEvaluation(evaluation): { valid: boolean; reason?: string }`
  Rejette impérativement toute évaluation sans justification textuelle non vide.
- `convertVarianteBToOption(subjectId, varianteBText, author): Option`
  Assure la passerelle d'héritage depuis l'ancien format binaire vers le nouveau modèle à $N$ options.

## 3. Services Serveur & API REST
Endpoints sous `/api/projects/[projectId]/subjects/[subjectId]/...` :
- `criteria/+server.ts` : GET liste, POST création d'un critère.
- `criteria/[criterionId]/+server.ts` : PATCH avec `expectedVersion`, DELETE.
- `options/+server.ts` : GET liste, POST création d'une option.
- `options/[optionId]/+server.ts` : PATCH avec `expectedVersion`, DELETE.
- `evaluations/+server.ts` : GET liste, POST / PUT évaluation avec validation de justification.
- `tradeoffs/+server.ts` : GET, POST, DELETE.
- `decision/+server.ts` : GET décision courante, POST enregistrement de l'arbitrage (Lead Architect).

Toutes les écritures émettent un `DomainEvent` (`CRITERION_CREATED`, `OPTION_CREATED`, `EVALUATION_RECORDED`, `DECISION_RECORDED`) dans la même transaction.
