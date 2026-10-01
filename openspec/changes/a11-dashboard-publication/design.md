# Spécification Technique & Design : Tableau de Bord KB, Publication Scellée et Porte G7 (Lot A11)

## 1. Modèle de Données & Types

### 1.1 `KbHealthMetrics`
```typescript
export interface KbHealthMetrics {
  doctrine_health: {
    total_assets: number;
    principles_count: number;
    patterns_count: number;
    decisions_count: number;
    controls_count: number;
    glossary_count: number;
  };
  reviews_summary: {
    pending_count: number;
    overdue_count: number;
    avg_review_duration_days: number;
  };
  regulatory_coverage: {
    total_frameworks: number;
    total_requirements: number;
    covered_requirements: number;
    coverage_percentage: number;
  };
  evals_summary: {
    latest_recall: number;
    gate_g6_passed: boolean;
    last_benchmark_at: string;
  };
  storage: {
    mode: 'demo' | 'persistent';
    persistent: boolean;
    provider: string;
  };
  gate_g7_eligible: boolean;
  gate_g7_blockers: string[];
}
```

### 1.2 `KbPublication`
```typescript
export interface KbPublication {
  id: string;
  snapshot_id: string;
  version: string;
  published_at: string;
  published_by: string;
  sha256_checksum: string;
  changelog: string;
  assets_count: number;
  storage_persistent: boolean;
}
```

### 1.3 `KbCampaign`
```typescript
export interface KbCampaign {
  id: string;
  title: string;
  domain: string;
  target_asset_type: string;
  target_count: number;
  created_at: string;
  created_by: string;
  due_at: string;
  status: 'active' | 'completed' | 'cancelled';
  description: string;
  progress: {
    current: number;
    target: number;
  };
}
```

## 2. API LLMOps & Archinex

### 2.1 `GET /api/knowledge/health`
Renvoie `KbHealthMetrics`. Permet d'évaluer la Porte G7 :
- `gate_g7_eligible`: vrai si `evals_summary.latest_recall >= 0.80`, `reviews_summary.overdue_count === 0`, et pas d'objection bloquante.
- `gate_g7_blockers`: liste textuelle des points bloquants le cas échéant.

### 2.2 `GET /api/knowledge/publications`
Renvoie la liste ordonnée antichronologique des publications passées.

### 2.3 `POST /api/knowledge/publications`
Déclenche une publication officielle :
- Vérifie les rôles de l'acteur (`kb:admin` ou `kb:maintain` requis, 403 sinon).
- Si `gate_g7_eligible` est faux, renvoie **409 Conflict** `{ error: "Conditions de la Porte G7 non remplies", blockers: [...] }`.
- Si valide :
  - Calcule l'empreinte SHA-256 du catalogue actif.
  - Génère l'identifiant d'instantané (ex: `snapshot-YYYY-MM-DD-<hash>`).
  - Incrémente la version de doctrine (ex: `v1.2.0`).
  - Enregistre la publication et retourne **201 Created**.

### 2.4 `GET` & `POST /api/knowledge/campaigns` & `PATCH /api/knowledge/campaigns/[id]`
Gestion des campagnes d'enrichissement ciblées :
- `GET` : liste des campagnes.
- `POST` : création d'une nouvelle campagne (`title`, `domain`, `target_asset_type`, `target_count`, `due_at`, `description`).
- `PATCH` : mise à jour du statut ou incrémentation de la progression.

## 3. Interface Utilisateur (`/kb/dashboard`)
1. **Bandeau d'Alerte Mode Démo Éphémère** : Affiché en tête de page si `storage.mode === "demo"` ou `!storage.persistent`.
2. **KPIs Santé & Gouvernance** : 4 cartes (Doctrine Active, Délais de Revue, Couverture Référentiels, Rappel Benchmark).
3. **Module de Publication & Scellement Porte G7** :
   - Badge d'éligibilité (Prêt pour publication vs Bloqué avec liste des obstacles).
   - Bouton d'action ouvrant une modale de publication (avec champ de changelog).
   - Historique des publications avec affichage de l'empreinte cryptographique SHA-256 et du changelog.
4. **Module Campagnes d'Enrichissement** :
   - Liste des campagnes en cours avec barre de progression.
   - Bouton "Nouvelle Campagne" pour les curateurs.
