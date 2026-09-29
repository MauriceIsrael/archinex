# Design Technique — Lot A4 : Maturité Calculée & Arbitrage Humain

## 1. Modèle de Domaine (`src/lib/domain/maturityRules.ts`)

```typescript
export type MaturityBlockerCode =
  | 'MISSING_PROBLEM_STATEMENT'
  | 'MISSING_CRITERIA'
  | 'INSUFFICIENT_OPTIONS'
  | 'UNEVALUATED_OPTION'
  | 'OPEN_OBJECTION'
  | 'UNRESOLVED_VIOLATION'
  | 'OPEN_BLOCKING_QUESTION'
  | 'COVERAGE_INCOMPLETE';

export interface MaturityBlocker {
  code: MaturityBlockerCode;
  message: string;
  targetId?: string;
}

export interface MaturityComputationInput {
  subject: {
    id: string;
    name: string;
    domain?: string | null;
    problemStatement?: string | null;
    maturityLevel: SubjectMaturity;
    deliberationStatus: string;
  };
  criteria: Criterion[];
  options: Option[];
  evaluations: OptionEvaluation[];
  arguments: Argument[];
  acceptedViolations?: Array<{ typedId: string; justification: string }>;
  requiredFrameworks?: Array<{ frameworkId: string; status: 'covered' | 'partial' | 'missing' | 'unknown' }>;
  decision?: Decision | null;
}

export interface MaturityComputationResult {
  level: SubjectMaturity;
  readyForArbitration: boolean;
  blockers: MaturityBlocker[];
}
```

## 2. Persistance & Schéma Prisma

- Modèle `ProjectFramework`:
  - `id`, `projectId`, `frameworkId`, `status` ('covered', 'partial', 'missing', 'unknown'), `missingRequirements` (Json), `checkedAt`.
- Modèle `Decision`:
  - `id`, `subjectId`, `retainedOptionId`, `rejected` (Json), `rationale`, `reversibility`, `arbiterId`, `arbiterRole`, `decidedAt`, `acceptedViolations` (Json), `kbCandidateIds` (Json).

## 3. Contrôle d'Accès & Casbin
Pour arbitrer un sujet :
```typescript
export function canArbitrateSubject(actor: ActorInfo, subjectDomain?: string | null): boolean {
  if (actor.role === 'lead_architect' || actor.role === 'Lead Architect') return true;
  if (actor.role === 'domain_expert' || actor.role === 'domain_architect') {
    if (!subjectDomain) return true;
    return actor.domains?.includes(subjectDomain) ?? false;
  }
  return false;
}
```
Rejette avec HTTP 403 si l'acteur n'est pas autorisé.

## 4. API d'Arbitrage (`POST /api/projects/[projectId]/subjects/[subjectId]/decision`)
1. Récupère le sujet, critères, options, évaluations, arguments, frameworks du projet.
2. Calcule `computeMaturity(...)`.
3. Si `!readyForArbitration`, renvoie HTTP 422 `{ error: 'Subject is not ready for arbitration', blockers }`.
4. Vérifie l'autorisation de l'acteur (Casbin / `canArbitrateSubject`). Si refusé -> HTTP 403.
5. Sauvegarde la décision dans `Decision`, met à jour `Subject.maturityLevel = 'L3_decided'`, `Subject.deliberationStatus = 'arbitrated'`.
6. Enregistre un `DomainEvent` (`subject.arbitrated`).
