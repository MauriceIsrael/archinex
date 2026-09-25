# Archinex · Software Architecture Documentation

> **Document d'Architecture Système du Workbench de Délibération Archinex.**
> Conforme aux standards de modélisation système et aux spécifications *SmartMemory × LLMOps*.

---

## 1. Vue Globale du Système

Archinex repose sur une architecture bicéphale intégrée sous **SvelteKit 2** :
1. **Socle d'Administration & Sécurité** : Authentification JWT, contrôle d'accès basé sur les attributs (Casbin ABAC/RBAC) et persistance Prisma ORM sur SQLite (`better-sqlite3`).
2. **Workbench de Délibération Architecturale** : Moteur de vérité logique, gestion des controverses épistémiques, brouillons-appâts télégraphiques, rappels de doctrine proactifs et projections déterministes vers les outils système tiers.

```mermaid
graph TD
    User((Architecte / Expert)) <--> UI[Interface Svelte 5 / Runes]
    
    subgraph "Couche Client & Postures Contextuelles"
        UI --> PostureSelector[ContextualPostureSelector]
        UI --> Board[MaturityBoardTable]
        UI --> Draft[TelegraphicDraftView / Diff Sensor]
        UI --> Chat[DialecticChatPanel]
        UI --> RuleBanner[RuleApprovalBanner Tour 8]
        UI --> Inspector[WhyInspector & Blast Radius]
        UI --> Hub[ArtifactRegenerationHub]
        UI --> FreezeModal[FreezeSectionDialog]
    end
    
    subgraph "Couche Domaine Métier (Logique Pure TypeScript)"
        Store[deliberationStore.svelte.ts]
        Store --> Epistemic[epistemicEnvelope.ts / universalSha256]
        Store --> Tone[telegraphic.ts / Anti-Blabla Filter]
        Store --> DAG[retractation.ts / Causal DAG & Truth Maintenance]
        Store --> Diff[diffSensor.ts / Rule of Silence]
        Store --> Dialectic[dialectic.ts / ADR Proactive Recall]
        Store --> Freeze[freezeExport.ts / Certification Gating]
        Store --> Projections[artifactProjections.ts / Mermaid, DSL, SysML, JSON]
    end
    
    subgraph "Couche Persistance & Sécurité Serveur"
        Hooks[hooks.server.ts]
        JWT[Service JWT / Cookies Sécurisés]
        Casbin[Moteur Casbin ABAC/RBAC]
        Prisma[Prisma ORM]
        DB[(Base dev.db - SQLite)]
    end
    
    PostureSelector & Board & Draft & Chat & Hub <--> Store
    Hooks --> JWT
    Hooks --> Casbin
    Casbin --> Prisma
    Prisma <--> DB
```

---

## 2. Le Modèle Épistémique à 5 Facettes

Pour éviter l'illusion de consensus et l'hallucination d'accords par l'IA, tout énoncé d'architecture manipulé par Archinex est encapsulé dans un contrat strict à 5 facettes :

```mermaid
classDiagram
    class Statement {
        +String id
        +String section
        +Triplet triplet
        +Justification justification
        +Authority authority
        +Maturity maturity
        +Revisability revisability
        +String status
    }
    class Triplet {
        +String subject
        +String predicate
        +Any value
    }
    class Justification {
        +String[] basedOn
        +String rule
        +String validationDate
    }
    class Authority {
        +String author
        +ArchitectRole role
        +ProductionMode productionMode
    }
    class Maturity {
        +MaturityLevel subjectLevel
        +ConfidenceLevel confidence
    }
    class Revisability {
        +String[] antecedents
        +String lastReviewDate
    }
    Statement *-- Triplet
    Statement *-- Justification
    Statement *-- Authority
    Statement *-- Maturity
    Statement *-- Revisability
```

### Invariant Inviolable : Règle Bloquante `verified × llm-derived`
Aucun énoncé ne peut être promu au statut de confiance `verified` s'il est produit en mode `llm-derived`. La vérification requiert formellement l'intervention humaine d'un architecte qualifié (`human-authored` ou `llm-proposed-human-approved`). Tout manquement est rejeté dès la couche de validation du schéma (`epistemicEnvelope.ts`).

### Hachage FIPS 180-2 Client / Serveur Isomorphe
Afin d'éviter tout écueil d'incompatibilité entre l'environnement Node.js (`crypto.createHash`) et le bundle navigateur Vite, le calcul des empreintes d'intégrité repose sur une implémentation pure TypeScript de **SHA-256** (`universalSha256`), garantissant une stricte parité d'empreinte sur l'ensemble des couches.

---

## 3. Le Moteur de Rétractation Causale (Truth Maintenance System)

Lorsqu'une hypothèse est contestée ou invalidée par un architecte (par exemple lors de la remise en cause d'un oscillateur Rubidium sur `S-0031`), le système ne supprime pas l'historique : il propage l'invalidation le long du graphe acyclique direct (DAG) des dépendances.

```mermaid
sequenceDiagram
    autonumber
    actor Arch as Lead Architect
    participant UI as DialecticChatPanel / WhyInspector
    participant Store as deliberationStore
    participant Retract as retractation.ts (Moteur DAG)
    participant Board as MaturityBoardTable

    Arch->>UI: Clic "Contester / Rétracter" sur S-0031
    UI->>Store: retractStatement('S-0031', 'Perte certif Tier IV')
    Store->>Retract: executeRetractionCascade(S-0031)
    Retract->>Retract: buildCausalDAG(statements)
    Retract->>Retract: findTransitiveDependents('S-0031') -> ['S-0042']
    Retract-->>Store: Énoncés descendants rétrogradés à 'assumed'
    Store->>Board: Rétrogradation des sujets liés en 'is_provisional: true'
    Store-->>UI: Notification visuelle & Journalisation d'invalidation
    Note over Board: sub_sync retombe sous L3 et déverrouille les alertes
```

---

## 4. Capteur par le Diff & Règle Stricte du Silence

- **Édition textuelle en place** : L'architecte modifie directement les brouillons télégraphiques. Le composant `diffSensor.ts` calcule la différence (`oldValue` vs `newValue`) et génère immédiatement un énoncé auditable sans exiger de formulaire verbeux.
- **Règle du Silence** : Une hypothèse non contestée n'est **jamais** considérée comme acceptée. L'approbation doit résulter d'un acte formel d'arbitrage.

---

## 5. Gel de Section & Projections Déterministes Sans Dérive (No Doc Drift)

Archinex ne stocke pas de représentations graphiques statiques. Tout artefact système est une **projection déterministe** générée à la volée à partir des énoncés scellés :

```mermaid
graph LR
    Statements[(Énoncés Scellés L3+)] --> Engine[Générateur Déterministe]
    Engine --> Mermaid["Mermaid C4 (Visuel & Flux)"]
    Engine --> DSL["Structurizr DSL (.dsl)"]
    Engine --> SysML["SysML v2 (Ingénierie Système)"]
    Engine --> PTP["Profil PTP ITU-T G.8275.1 (JSON)"]
    
    subgraph "Garantie No Doc Drift"
        Statements -.-> Snapshot["Snapshot Scellé SHA-256 (Livrable d'Homologation)"]
    end
```

### Critères de la Barrière de Certification (Gating)
1. **Maturité** : Section $\ge$ `L3_decided`.
2. **Conflits** : 0 conflit d'architecture ouvert.
3. **Hypothèses** : 0 énoncé `assumed` actif.
4. **Habilitation** : Rôle `Lead Architect` requis.

---

## 6. Pipeline de Validation et d'Assurance Qualité

Le système est validé par une pyramide de tests contractuels et d'intégration :
- `epistemic-statement.test.ts` : Rejet des énoncés invalides et interdiction `verified × llm-derived`.
- `telegraphic-draft.test.ts` : Rendu strict et filtre anti-blabla.
- `maturity-board.test.ts` : Ordonnancement par déblocages et détection de stagnation.
- `diff-sensor.test.ts` : Capture de rectifications et règle du silence.
- `dialectic-recall.test.ts` : Moteur de rappel proactif d'ADRs.
- `retractation-engine.test.ts` : Propagation de clôture logique sur DAG causal.
- `freeze-export.test.ts` : Scellement cryptographique et projections sans dérive.
- `deliberation-workflow.test.ts` : Scénario d'intégration bout-en-bout.
