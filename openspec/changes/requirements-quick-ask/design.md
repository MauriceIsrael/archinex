# Conception Détaillée : Quick-Ask Exigences (`requirements-quick-ask`)

## 1. Architecture Générale

```
┌────────────────────────────────────────────────────────────────────┐
│  IHM Workbench (`src/routes/deliberation/+page.svelte`)            │
│  - Raccourci global : Cmd/Ctrl+K (ou Alt+/)                        │
│  - `RequirementsQuickAskModal.svelte` : fenêtre flottante compacte │
│    * Champ question + suggestions contextuelles                    │
│    * Verdict structuré + réponse markdown                          │
│    * Puces cliquables `clauseRef` (criticité, disposition, extrait) │
└───────────────────────────────┬────────────────────────────────────┘
                                │ POST /api/projects/[projectId]/requirements/ask
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  API SvelteKit (`.../requirements/ask/+server.ts`)                 │
│  - `authorizeProjectAccess(event, projectId)`                      │
│  - Validation Zod (`question`, `history?`, `sourceIds?`, `model?`) │
└───────────────────────────────┬────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  Service `requirementsQa.ts` (`src/lib/server/projects/`)          │
│  1. Charge `listRequirementSources(projectId)` (+ `Subject` liés)  │
│  2. Sérialise un contexte canonique déterministe (tri par position)│
│  3. Estime les tokens vs capacité du modèle :                      │
│     - Mode A (Full-Context + Prefix Cache) si <= budget contexte   │
│     - Mode B (Pré-filtrage hybride lexical + cosinus ou lots)      │
│  4. Appelle `localLlmClient.chat(...)` en mode JSON strict         │
│  5. Vérifie côté serveur que chaque `clauseRef` citée existe bien  │
└────────────────────────────────────────────────────────────────────┘
```

## 2. Stratégie de Contexte et Coût Multi-Utilisateurs

### 2.1 Pourquoi on ne renvoie pas « tout le PDF brut »
Un PDF de RFP contient beaucoup de bruit (en-têtes, pieds de page, clauses juridiques standard, mises en forme). Archinex a déjà extrait les exigences unitaires dans la table `Requirement` (`clauseRef`, `title`, `text`, `criticality`, `category`, `proposedDisposition`, `decidedDisposition`).
Sérialisées de façon compacte, 150 à 400 exigences représentent typiquement **10 000 à 45 000 tokens** — soit une fraction de la fenêtre de Claude (1M tokens) ou d'un modèle local récent (32k–128k).
Le `sourceText` brut de `FactorizationRun` n'est utilisé qu'en repli explicite si le projet n'a pas encore de `RequirementSource` enregistrée (ou sur option explicite pour chercher hors exigences extraites).

### 2.2 Sérialisation Canonique & Prompt Caching (Partage Multi-Utilisateurs)
Pour éviter que $N$ architectes posant des questions sur le même projet ne paient/recalculent le même préfixe à chaque tour :
1. **Préfixe strictement déterministe** : le bloc système + la liste des exigences (triée par `source.sha256` puis `position` et `clauseRef`) sont construits de manière **identique octet pour octet** tant que les exigences du projet n'ont pas changé. Aucune donnée spécifique à l'utilisateur ou à l'horodatage courant n'est injectée dans ce préfixe.
2. **Cache côté Anthropic (`LocalLlmClient`)** : étendre `ChatOptions` / `ChatMessage` (option `cacheable?: boolean` sur un message `system` ou bloc système dédié) afin d'émettre `cache_control: { type: 'ephemeral' }` sur le bloc contenant les exigences.
   - Le premier architecte qui pose une question remplit le cache Anthropic (TTL 5 min par défaut, rafraîchi à chaque hit).
   - Tous les autres architectes du même projet qui posent des questions dans la fenêtre de cache bénéficient d'une lecture de préfixe en cache (latence TTFT réduite et coût d'input fortement diminué).
3. **Cache côté Ollama / vLLM local** : grâce à l'ordre canonique identique du préfixe système, le serveur d'inférence local réutilise naturellement son **KV-cache de préfixe** entre requêtes consécutives sur le même projet (sous réserve de capacité VRAM et d'absence d'éviction par un autre prompt).

### 2.3 Mode B — Repli Automatique pour Gros Corpus ou Petit `num_ctx`
Si le budget estimé dépasse le seuil configuré pour le modèle actif (par ex. petit modèle Ollama configuré à 8k–16k tokens) :
1. **Scoring hybride déterministe en mémoire** (`selectRelevantRequirements`) :
   - Score lexical BM25-like / correspondance de termes normalisés + synonymes/variantes numériques (ex. `3`, `trois`, `tri-`, `redondan*`).
   - Score cosinus optionnel via `ollamaEncoder` (si configuré) sur les exigences.
   - Conservation des `topK` clauses + clauses `bloquant` prioritaires jusqu'à remplir le budget de contexte, en signalant explicitement dans la réponse que l'analyse a été restreinte aux $K$ clauses les plus pertinentes (transparence anti-faux négatif).

## 3. Contrat d'API et Validation Anti-Hallucination

### 3.1 Endpoint `POST /api/projects/[projectId]/requirements/ask`
- **Sécurité** : `authorizeProjectAccess(event, projectId)` ; aucun appel LLM hors utilisateur authentifié et autorisé sur le projet.
- **Requête (Zod)** :
  ```ts
  {
    question: string; // 2..2000 caractères
    history?: Array<{ role: 'user' | 'assistant'; content: string }>; // max 10 derniers tours
    model?: string;
    includeEvacuated?: boolean; // défaut: true (crucial pour éviter les angles morts)
  }
  ```
- **Réponse JSON** :
  ```ts
  {
    status: 'ok';
    verdict: 'imposed' | 'partial_or_implicit' | 'not_found' | 'contradictory';
    answer: string; // synthèse concise avec références [clauseRef]
    caveats: string[]; // ex: clauses en clarification_needed ou to_qualify, ou mode filtré
    citations: Array<{
      clauseRef: string;
      sourceTitle: string;
      title: string;
      criticality: 'bloquant' | 'majeur' | 'info';
      effectiveDisposition: string;
      excerpt: string;
      linkedSubjectIds: string[];
    }>;
    meta: {
      mode: 'full_context' | 'filtered';
      totalRequirements: number;
      evaluatedRequirements: number;
      model: string;
      cacheHint: string; // sha256 court du corpus sérialisé
    };
  }
  ```
- **Garde-fou serveur** : chaque `clauseRef` retournée par le modèle est vérifiée contre l'index réel des `Requirement` du projet. Toute référence inventée est écartée et journalisée avant renvoi au client.

## 4. Interface Utilisateur : Palette Flottante Clavier (`Quick-Ask`)

### 4.1 Ergonomie Moderne (Style Command Palette / Quick Chat)
Plutôt qu'une modale centrée lourde qui masque l'écran ou qu'un onglet séparé qui casse le fil de délibération :
- **Déclenchement** :
  - Raccourci clavier global `Ctrl+K` / `Cmd+K` (ou `Alt+/` si `Ctrl+K` est déjà pris par le navigateur) intercepté uniquement hors champs de saisie incompatibles ou via un bouton compact discret dans `ProjectEngagementHeader.svelte` affichant le badge raccourci (`⌘K` / `Ctrl+K`).
  - `Esc` ferme la fenêtre tout en **conservant l'historique de session** en mémoire tant qu'on reste sur le projet.
- **Forme visuelle** :
  - **Panneau flottant ancré** (ex. coin inférieur droit ou panneau latéral flottant translucide/ombré, déplaçable ou redimensionnable entre mode compact et mode étendu), **sans backdrop opaque bloquant**, afin que l'architecte continue à voir le sujet ou le fragment HLD derrière.
  - **Chips de statut + citations cliquables** : chaque `clauseRef` citée s'affiche en badge (`bloquant`, `à clarifier`, `évacuée`) ; un clic ouvre ou met en surbrillance la clause / le sujet associé dans le workbench.
  - **Rappel visuel épistémique** : mention discrète « Lecture assistée sur dossier d'exigences — ne vaut pas validation humaine » (Invariant II / III).
