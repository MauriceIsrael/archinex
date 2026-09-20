# Technical Design : Archinex Deliberation Workbench

Ce document détaille l'architecture technique, les choix d'implémentation UI sous Svelte 5, les flux de données et les contrats d'interfaçage pour le workbench Archinex.

---

## 1. Architecture Générale de l'Application

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Archinex UI (SvelteKit / Svelte 5)               │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Header & Sélecteur de Posture Contextuelle (Non-Bloquant) :              │
│    [Mode actif : 1. Appropriation / Pédagogie | 2. Délibération | 3. Rendu] │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ 2. Board de Maturité & Gaps          │ 3. Éditeur de Brouillon-Appât        │
│    - Table 6 colonnes (unlocks)      │    - Rendu télégraphique             │
│    - Widget Progression des Gaps     │    - Conséquences & Coûts (€)        │
│    - Effet d'entraînement animé      │    - Variantes A / B divergentes     │
│    - Pastilles Stagnation            │    - Capteur inline de diff          │
├──────────────────────────────────────┴──────────────────────────────────────┤
│ 4. Tiroir de Délibération & Maïeutique (Droite / Collapsible)                │
│    - Fil de discussion multi-acteurs (Interface + Salon Discord de projet)  │
│    - Cartes de Rappel Proactif de Doctrine (ADR-xxxx, Principes P-xxxx)     │
│    - Tour 8 : Approbation de règles candidates (SPARQL)                     │
│    - Tour 11 : Centre d'arbitrage de contradictions (Conflits ouverts)      │
│    - File des questions & Relance en 1 clic                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                               ▲                        ▲
                               │                        │
               [Client SSE FastMCP / JSON Snapshot]  [SmartMemory & Discord Webhook]
                               │                        │
                               ▼                        ▼
                        LLMOps Server             Inférence & NLP
```

---

## 2. Structure des Composants & Gestion d'État Svelte 5

L'état de l'application repose exclusivement sur les **Runes Svelte 5** (`$state`, `$derived`, `$props`) encapsulées dans des modules réactifs `.svelte.ts` (aucun store Svelte 4) :

### 2.1 Modules d'État (`src/lib/stores/`)
- `deliberationStore.svelte.ts` :
  - `activePosture`: Posture active de l'architecte pour le sujet sélectionné (`appropriation`, `deliberation`, `render`), basculable à volonté sans bloquer le reste de l'équipe.
  - `boardItems`: Tableau des sujets du Board avec tri réactif calculé (`$derived`) sur `unlocks_count`.
  - `gapsStatus`: État des gaps d'architecture résolus/ouverts (G1 à G5).
  - `activeSubjectId`: Sujet actuellement sélectionné.
  - `activeDraft`: Structure télégraphique du brouillon pour le sujet actif.
  - `isProvisional`: Booléen global indiquant si des conflits ouverts ou des sujets non mûrs subsistent.
- `dialecticChatStore.svelte.ts` :
  - `messages`: Flux de discussion unifié (messages des architectes, interventions des agents, imports de salon Discord).
  - `recalledAssets`: Liste des ADRs et principes suggérés proactivement selon le contexte du débat en cours.
- `diffWatcher.svelte.ts` :
  - Détecte les modifications textuelles en temps réel dans l'éditeur télégraphique.
  - Calcule le diff sémantique et prépare l'objet `Statement` attribué (`production_mode: human-authored`).
- `conflictStore.svelte.ts` :
  - Gère la liste des contradictions (`open_conflicts`) et les formulaires d'arbitrage (Tour 11).
- `ruleApprovalStore.svelte.ts` :
  - Liste les règles d'inférence candidates proposées par SmartMemory (Tour 8).

### 2.2 Composants UI Clés (`src/lib/components/workbench/`)
- `ContextualPostureSelector.svelte` : Sélecteur fluide permettant à l'architecte de choisir sa posture sur la section active (pédagogie/appropriation, délibération active, synthèse de rendu).
- `MaturityBoardTable.svelte` : Tableau 6 colonnes avec filtres rapides (« Tous », « Bloqués », « Mes sujets », « Stagnants »).
- `GapProgressionWidget.svelte` : Jauge interactive affichant le franchissement des paliers de maturité et la fermeture des gaps.
- `TelegraphicDraftEditor.svelte` : Rendu télégraphique avec coloration syntaxique :
  - `retenu` en Cyan / Bleu
  - `supposé` en Rose / Rouge avec mise en valeur des conséquences chiffrées (`+180 k€`)
  - `conflit` en Orange vif
  - `manque` avec puce d'assignation
  - `variante B` encadrée en pointillé
- `DialecticChatPanel.svelte` : Panneau d'échanges multi-acteurs connecté au webhook Discord, avec intégration des cartes de rappel.
- `ArbitrationModal.svelte` : Fenêtre modale guidant le Lead Architect pour trancher un conflit (choix du gagnant, motif consigné, passage en `superseded`).
- `RuleApprovalBanner.svelte` : Bandeau de validation d'une règle candidate SPARQL avant inscription dans le graphe.
- `FreezeSectionDialog.svelte` : Dialogue de scellement formel avec calcul du SHA-256 et fixation des `ExternalRef`.
- `WhyInspector.svelte` : Popover / tiroir d'inspection de justification (« Pourquoi ? ») affichant la généalogie complète d'un fait.
- `ImpactSimulationModal.svelte` : Simulateur d'impact prédictif évaluant les ruptures logiques avant modification d'un énoncé.
- `ArtifactRegenerationHub.svelte` : Hub de synchronisation et de régénération déterministe des schémas (C4 Structurizr, Mermaid, SysML v2) et fichiers de conf.
- `DiscordCardBridge.svelte` : Passerelle de génération des cartes d'action interactives envoyées au salon Discord de projet.

---

## 3. Charte Visuelle Épistémique

Pour éliminer toute ambiguïté sur la valeur d'une affirmation, Archinex applique une charte chromatique stricte :

| Statut Épistémique | Couleur UI / Badge Tailwind | Traitement Visuel | Règle d'Usage |
|---|---|---|---|
| **`verified`** | Émeraude (`emerald-600`) | Bordure pleine, coche discrète | Preuve locale attestée par un humain. |
| **`designed`** | Bleu Océan (`blue-600`) | Fond teinté, texte net | Intention d'architecture de cadrage. |
| **`vendor-stated`** | Violet (`purple-600`) | Badge contour | Affirmation fournisseur (datasheet). |
| **`stated-by-client`** | Ambre (`amber-600`) | Badge avec guillemets | Exigence brute client à raffiner. |
| **`assumed`** | Rose / Rouge (`rose-500`) | Bordure pointillée, italique, avertissement | Hypothèse de travail non prouvée. |

---

## 4. Contrats d'Intégration & Données

### 4.1 Client MCP SSE & Mode Snapshot Local
L'application supporte deux modes d'alimentation configurables dans `src/lib/config.ts` :
1. **Mode Connecté FastMCP (SSE)** :
   - Écoute du flux `/sse` exposé par le serveur LLMOps.
   - Appels typés aux outils `get_render_payload`, `get_board`, `get_conflicts`, `get_open_questions`.
2. **Mode Local-First (Snapshot Scellé)** :
   - Lecture directe du fichier `fixtures/sealed_snapshot.json` (ou `data/snapshot.json`).
   - Permet une démonstration instantanée sans latence réseau et une autonomie hors-ligne totale.

### 4.2 Bibliothèque Cliente SmartMemory
SmartMemory est intégré sous forme de module TypeScript client (`src/lib/smartmemory/`) :
- **Extraction NLP** : Parse les phrases saisies par l'architecte pour en extraire les triplets `sujet · prédicat · valeur`.
- **Induction de Règles Candidates** : Lorsque deux décisions similaires sont prises, propose une règle formelle SPARQL (ex: `site MCX ⇒ holdover ≥ 30 j`) soumise au Lead Architect au Tour 8.

---

## 5. Matrice des Rôles & Sécurité ABAC (Casbin)

La sécurité repose sur l'adaptateur Casbin du template-app (`casbin-prisma-adapter`) :

| Rôle | Consultation Board & Brouillon | Édition en Place (Diff) | Réponse Questions | Arbitrage Conflits (Tour 11) | Approbation Règles (Tour 8) | Gel Section (Homologation) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Lead Architect** | ✅ | ✅ | ✅ | ✅ **(Exclusif)** | ✅ **(Exclusif)** | ✅ **(Exclusif)** |
| **Domain Expert Architect** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Client / Sponsor** | ✅ | ❌ | ✅ *(sur ses questions)*| ❌ | ❌ | ❌ |
| **Auditeur / Observateur** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
