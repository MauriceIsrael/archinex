# Conception Technique : Ingestion de Référentiels et Déclaration de Couverture (Lot A10)

## 1. Architecture Globale

```mermaid
sequenceDiagram
    autonumber
    actor Expert as Expert Domaine
    participant UI as Archinex UI (/kb/frameworks)
    participant Archinex as SvelteKit Server API
    participant LLMOps as Knowledge Hub LLMOps

    Expert->>UI: Téléverse un fichier réglementaire (.pdf, .md, .txt, .html, .docx)
    UI->>Archinex: POST /api/frameworks/ingestions (multipart/form-data)
    Archinex->>LLMOps: POST /api/frameworks/ingestions [X-Actor-Email]
    LLMOps-->>Archinex: 201 Created { ingestion_id, total_requirements, requirements: [...] }
    Archinex-->>UI: Redirige vers /kb/frameworks/{ingestion_id}

    loop Revue Ligne par Ligne
        Expert->>UI: Sélectionne une exigence non traitée
        opt Suggestion de Liaisons
            UI->>Archinex: POST /api/frameworks/ingestions/{id}/requirements/{reqId}/suggest-links
            Archinex->>LLMOps: POST .../suggest-links (ou LLM local)
            LLMOps-->>Archinex: { suggested_assets: [...], llm_derived: true }
            Archinex-->>UI: Affiche suggestions avec badge llm-derived
        end
        Expert->>UI: Décision (accept / amend / reject)
        UI->>Archinex: PATCH /api/frameworks/ingestions/{id}/requirements/{reqId}
        Note over Archinex: Vérifie que Expert possède le domaine de l'exigence (403 sinon)<br/>Vérifie le motif si reject (400 sinon)
        Archinex->>LLMOps: PATCH .../requirements/{reqId} [X-Actor-Email]
        LLMOps-->>Archinex: 200 OK (Exigence mise à jour)
        Archinex-->>UI: Mise à jour temps réel du statut
    end

    Expert->>UI: Déclarer la couverture du référentiel
    UI->>Archinex: POST /api/frameworks/{fw}/coverage-declaration
    Archinex->>LLMOps: POST /api/frameworks/{fw}/coverage-declaration [X-Actor-Email]
    alt Exigences non résolues subsistent
        LLMOps-->>Archinex: 409 Conflict { error, missing_requirements: [...] }
        Archinex-->>UI: 409 Affiche liste bloquante des exigences à traiter
    else Toutes exigences résolues
        LLMOps-->>Archinex: 200 OK { coverage_declared: true, declared_at, declared_by }
        Archinex-->>UI: 200 Attestation formelle de couverture affichée
    end
```

## 2. Modèles de Données & Types TypeScript

```typescript
export type FrameworkIngestionFormat = 'pdf' | 'html' | 'txt' | 'md' | 'docx';
export type FrameworkRequirementStatus = 'pending' | 'accepted' | 'amended' | 'rejected';

export interface FrameworkRequirement {
  id: string;
  framework_id: string;
  section: string;
  title: string;
  text: string;
  domain: string;
  status: FrameworkRequirementStatus;
  mapped_assets: string[];
  amendment_notes?: string;
  rejection_reason?: string;
  reviewed_by?: string;
  reviewed_at?: string;
}

export interface FrameworkIngestion {
  id: string;
  framework_id: string;
  framework_name: string;
  version: string;
  file_name: string;
  file_format: FrameworkIngestionFormat;
  file_size_bytes: number;
  created_at: string;
  status: 'processing' | 'ready' | 'failed';
  total_requirements: number;
  reviewed_requirements: number;
  requirements: FrameworkRequirement[];
}

export interface FrameworkLinkSuggestion {
  asset_id: string;
  title: string;
  confidence: number;
  rationale: string;
}

export interface FrameworkLinkSuggestionResult {
  suggested_assets: FrameworkLinkSuggestion[];
  llm_derived: true;
}

export interface CoverageDeclarationResult {
  success: boolean;
  framework_id: string;
  coverage_declared: boolean;
  declared_at: string;
  declared_by: string;
  total_requirements: number;
  covered_requirements: number;
  uncovered_requirements?: string[];
}
```

## 3. Gestion des Erreurs et Robustesse
- **Validation de taille de fichier** : Rejet immédiat avec HTTP 413 si la taille dépasse 20 Mo.
- **Formats autorisés** : Contrôle d'extension et MIME-type (`.pdf`, `.html`, `.txt`, `.md`, `.docx`).
- **Contrôle d'Habilitation 403** : Seuls les experts disposant du domaine spécifié sur l'exigence peuvent la valider ou la rejeter.
- **Conflit 409** : Blocage formel de la déclaration de conformité si des exigences non résolues subsistent.
