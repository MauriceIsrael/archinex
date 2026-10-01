# Conception Technique A8 — Atelier de Doctrine et Simulation de Clauses

## 1. Modèle de Données & Prédicats Testables

### 1.1 Structure d'une Clause Testable
```typescript
export interface TestablePredicates {
  when: string;       // Contexte / condition d'application (ex: "Lorsque le composant manipule des données Secret Défense")
  expect: string;     // Assertion attendue (ex: "Le chiffrement matériel certifié CSPN/FIPS 140-3 doit être activé")
  requires?: string[]; // Prérequis obligatoires (ex: ["HSM souverain dédié", "Audit log immuable"])
  forbids?: string[];  // Éléments strictement proscrits (ex: ["Stockage sur cloud multilocataire standard", "Export de clé en clair"])
}
```

### 1.2 Structure d'un Template d'Actif
```typescript
export type KbAssetType = 'principle' | 'pattern' | 'decision' | 'control' | 'glossary' | 'rule' | 'amendment';

export interface KbAssetTemplate {
  asset_type: KbAssetType;
  title: string;
  description: string;
  default_predicates: TestablePredicates;
  fields: Array<{
    name: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'array';
    required: boolean;
    placeholder?: string;
  }>;
  skeleton: string;
}
```

### 1.3 Simulation et Métriques de Précision / Rappel
```typescript
export interface ClauseSimulationRequest {
  asset_type: KbAssetType;
  title: string;
  domain: string;
  predicates: TestablePredicates;
  test_cases?: Array<{
    id: string;
    label: string;
    description: string;
    expected_status: 'supports' | 'violates';
  }>;
}

export interface ClauseSimulationResult {
  simulated_at: string;
  total_cases: number;
  passed_cases: number;
  precision: number;      // Pourcentage 0 à 100
  recall: number;         // Pourcentage 0 à 100
  regression_detected: boolean;
  regression_details?: string;
  verdicts: Array<{
    case_id: string;
    case_label: string;
    status: 'supports' | 'violates' | 'unassessed';
    expected: 'supports' | 'violates';
    matched: boolean;
    rationale: string;
  }>;
}
```

## 2. Flux d'Interaction Séquentiel

```mermaid
sequenceDiagram
    autonumber
    actor Expert as Expert KB (`kb:maintain` / `kb:review`)
    participant UI as Atelier Archinex (/kb/workshop)
    participant Server as Backend Archinex
    participant LLMOps as Knowledge Hub LLMOps

    Expert->>UI: Sélectionne un type d'actif (ex: principle)
    UI->>Server: GET /api/knowledge/templates/principle
    Server->>LLMOps: GET /api/knowledge/templates/principle
    LLMOps-->>Server: Gabarit + Prédicats par défaut
    Server-->>UI: Formulaire pré-rempli

    Expert->>UI: Saisit l'énoncé et les prédicats (when, expect, forbids)
    UI->>Server: POST /api/knowledge/candidates/validate (debounce)
    Server->>LLMOps: Validation à blanc
    LLMOps-->>Server: 7 Contrôles prévisionnels
    Server-->>UI: Indicateur de validité temps réel

    Expert->>UI: Clique sur "Simuler l'impact"
    UI->>Server: POST /api/knowledge/checks/simulate
    Server->>LLMOps: Exécution du banc de test de règles
    LLMOps-->>Server: Résultats, Précision, Rappel, Alerte régression
    Server-->>UI: Tableau des verdicts + Différentiel

    Expert->>UI: Clique sur "Soumettre à la revue"
    UI->>Server: POST /api/knowledge/candidates [X-Actor-Email]
    Server->>LLMOps: Enregistrement dans la file d'examen
    LLMOps-->>Server: 201 Created (candidat ID)
    Server-->>UI: Redirection vers /kb/reviews/{id}
```

## 3. Autorisations et Garde-Fous
- Accès restreint aux utilisateurs ayant au moins un rôle KB actif (`kb:review`, `kb:maintain`, `kb:evaluate`, ou `kb:admin`).
- Rejet si aucun domaine n'est spécifié.
- Alerte bloquante ou non bloquante avant soumission si `regression_detected === true`.
