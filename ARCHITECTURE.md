# Archinex · Software Architecture Documentation

> **Document d'Architecture Système du Moteur de Co-Conception et Délibération Archinex.**
> Conforme aux standards de modélisation système, à la constitution épistémique et aux spécifications *LLMOps × SmartMemory*.

---

## 1. Vue Globale du Système

Archinex est le **seul propriétaire de l'état des projets et du déroulé de co-conception**, orchestré selon une architecture SvelteKit 2 / Prisma :
1. **Socle d'Administration & Sécurité** : Authentification JWT, contrôle d'accès basé sur les attributs (Casbin ABAC/RBAC) et persistance relationnelle Prisma ORM (SQLite en développement, PostgreSQL en production).
2. **Moteur de Délibération Architecturale** : Chaîne de co-conception opposable en 6 étapes :
   - Extraction des sujets et cadrage télégraphique ;
   - Critères multi-facettes, options contrastées et compromis ;
   - Débat contradictoire multi-agents borné (Proposer, Challenger, Verifier, Synthesizer) ;
   - Évaluation automatisée de la maturité calculée (`computeMaturity`) ;
   - Arbitrage humain opposable (Porte G3, passage à `L3_decided`) ;
   - Capitalisation souveraine vers le Knowledge Hub LLMOps (Porte G4).

```mermaid
graph TD
    User((Architecte / Expert Humain)) <--> UI[Interface Svelte 5 / Runes]
    
    subgraph "Couche Interface & Délibération"
        UI --> Board[MaturityBoardTable]
        UI --> Matrix[OptionsCriteriaMatrix]
        UI --> Debate[DebateThreadView]
        UI --> Arbitrate[ArbitrationPanel Gate G3]
        UI --> Capitalize[CapitalizationPanel Gate G4]
    end
    
    subgraph "Couche Domaine Métier (Logique Pure TypeScript)"
        Maturity[maturityRules.ts / computeMaturity]
        Capitalization[capitalization.ts / buildKbCandidates & anonymize]
        Epistemic[epistemicEnvelope.ts / Triplet 5 Facettes]
        DAG[retractation.ts / Truth Maintenance DAG]
    end
    
    subgraph "Couche Agents & Intelligence Locale"
        Orchestrator[debateOrchestrator.ts]
        Orchestrator --> Proposer[proposer.ts]
        Orchestrator --> Challenger[challenger.ts]
        Orchestrator --> Verifier[verifier.ts]
        Orchestrator --> Synthesizer[synthesizer.ts]
        LocalLLM[localLlmClient.ts / Ollama Local Air-Gap]
    end

    subgraph "Couche Persistance Serveur & Passerelle Doctrinale"
        Prisma[Prisma ORM / projectsDb, optionsDb, debateDb, arbitrationDb, capitalizationDb]
        Casbin[Casbin RBAC & Habilitation Domaine]
        DoctrineService[doctrineService.ts / LLMOps Client]
        DB[(Base dev.db)]
    end
    
    UI <--> Prisma
    Prisma --> Casbin
    Prisma <--> DB
    Debate --> Orchestrator
    Orchestrator --> LocalLLM
    Orchestrator --> DoctrineService
    Arbitrate --> Maturity
    Capitalize --> Capitalization
    Capitalize --> DoctrineService
```

---

## 2. Le Modèle Épistémique et la Constitution

Tout énoncé, option, argument ou décision manipulé par Archinex obéit aux invariants de la Constitution (`openspec/constitution.md`) :

### Invariants Inviolables
1. **Énoncé à 5 facettes** : Contenu (triplet ontologique), Justification (antécédents), Autorité (auteur, rôle, mode de production), Maturité (niveau, confiance), Révisabilité.
2. **Règle Bloquante `verified × llm-derived`** : Aucun énoncé ni argument ne peut être promu au statut de confiance `verified` s'il est produit en mode `llm-derived`. La vérification et la décision requièrent formellement l'intervention humaine d'un architecte qualifié (`human-authored` ou `llm-proposed-human-approved`).
3. **Règle du Silence** : Une hypothèse, objection ou dilemme non contesté n'est **jamais** considéré comme approuvé tacitement. L'approbation doit résulter d'un acte formel d'arbitrage.
4. **Brouillon Télégraphique** : Style télégraphique dense, sans jargon creux ni verbiage IA non vérifié.

---

## 3. Le Cycle de Co-Conception en 6 Étapes

```mermaid
flowchart LR
    S1["1. Cadrage Sujet"] --> S2["2. Critères & Options"]
    S2 --> S3["3. Débat Multi-Agents"]
    S3 --> S4["4. Maturité Calculée"]
    S4 --> S5["5. Arbitrage Humain G3"]
    S5 --> S6["6. Capitalisation KB G4"]
```

### Étape 1 : Cadrage du Sujet
Énonciation claire du `problemStatement` et référence de section. Le sujet démarre au niveau `L0_named` puis `L1_framed`.

### Étape 2 : Critères & Options Contrastées
Définition d'au moins 2 critères d'évaluation pondérés et formulation d'au moins 2 options d'architecture viables. Chaque option est notée (de -2 à +2) sur l'ensemble des critères avec justification obligatoire.

### Étape 3 : Débat Multi-Agents Borné
Un tour d'orchestration (3 tours maximum) enchaîne 4 agents spécialisés :
- **Proposer** : Défend les options et suggère des options complémentaires si nécessaire.
- **Challenger** : Émet au moins une objection argumentée par option (risques, coûts cachés, dépendances).
- **Verifier** : Contrôle la conformité avec la doctrine via `checkOption` et produit des arguments de vérification avec références KB strictes.
- **Synthesizer** : Résume les points de tension, les compromis et les questions clés pour l'arbitre humain.

Toute objection doit être résolue (`answered` ou `accepted_risk`) par un expert humain habilité avant l'arbitrage.

### Étape 4 : Calcul Dynamique de la Maturité (`computeMaturity`)
La maturité d'un sujet n'est plus fixée manuellement : elle est calculée par une fonction pure qui évalue 8 codes de blocage :
- `MISSING_PROBLEM_STATEMENT` : Problème non formulé.
- `MISSING_CRITERIA` : Moins de 2 critères définis.
- `INSUFFICIENT_OPTIONS` : Moins de 2 options formulées.
- `UNEVALUATED_OPTION` : Option non évaluée sur tous les critères.
- `OPEN_OBJECTION` : Objection ouverte non résolue dans le débat.
- `UNRESOLVED_VIOLATION` : Règle doctrinale violée sans dérogation justifiée.
- `OPEN_BLOCKING_QUESTION` : Question bloquante sans réponse.
- `COVERAGE_INCOMPLETE` : Référentiel réglementaire projet (`NIS2`, `SecNumCloud`...) non couvert.

### Étape 5 : Arbitrage Humain Opposable (Porte G3)
Seul un `lead_architect` ou un `domain_expert` habilité sur le domaine du sujet peut prononcer l'arbitrage :
- Sélection de l'option retenue ;
- Enregistrement des motifs d'écartement pour chaque alternative ;
- Évaluation de la réversibilité (`reversible`, `costly`, `irreversible`) ;
- Enregistrement des dérogations acceptées avec justification opposable ;
- Promotion formelle à `L3_decided` et transformation des énoncés dérivés en `llm-proposed-human-approved`.

### Étape 6 : Capitalisation Souveraine vers LLMOps (Porte G4)
Chaque arbitrage produit automatiquement des candidats à la Knowledge Base :
1. `new_asset` : Si l'option retenue constitue un nouveau pattern sans antécédent doctrinal.
2. `amendment` : Pour chaque dérogation acceptée, afin d'adapter la règle d'entreprise.
3. `rex` : Synthèse systématique du compromis architectural et des motifs du choix.

**Garanties Souveraines :**
- **Anonymisation stricte** : Nettoyage automatique des noms de projets, clients, sites, participants, adresses IP et volumes chiffrés.
- **Invariant III (Human-in-the-loop)** : L'architecte prévisualise et peut modifier chaque candidat avant envoi. Rien n'est expédié sans action humaine explicite.
- **Suivi des statuts** : Synchronisation avec la file LLMOps (`in_review`, `accepted`, `rejected`).

---

## 4. Pipeline de Validation et d'Assurance Qualité

La qualité et l'étanchéité du système sont garanties par le script unifié `node scripts/verify.mjs` validant 4 portes d'acceptation :
1. **Denylist Check** : 0 terme projet ou fournisseur interdit dans `src/`.
2. **Vitest Test Suites** : 201 tests unitaires, contractuels et d'intégration validés.
3. **Svelte Check** : 0 erreur, 0 avertissement de typage strict TypeScript / Svelte 5.
4. **Production Build** : Compilation complète des bundles client et serveur SSR.

---

## 5. Gouvernance Knowledge Hub & Comptes Experts (Lot A6)

Archinex gère les comptes utilisateurs locaux et assure la propagation stricte de l'identité des experts vers LLMOps, qui demeure l'autorité sur le registre des propriétaires (`owners`) et la recevabilité doctrinale.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Administrateur Archinex
    actor Expert as Expert KB Humain
    participant Archinex as Serveur Archinex
    participant Casbin as Moteur Casbin (ABAC/RBAC)
    participant LLMOps as Knowledge Hub LLMOps

    Admin->>Archinex: POST /api/admin/experts (name, email, @handle, kbRoles, domains)
    Archinex->>Archinex: Crée User + KbProfile (invitationToken 7j)
    Archinex->>Casbin: Enregistre les politiques de groupement g(userId, kb:*)
    Archinex-->>Admin: Lien d'activation unique (/invite?token=...)
    
    Expert->>Archinex: POST /api/invite/activate (token, password)
    Archinex->>Archinex: Valide le jeton, scelle le mot de passe (delegated=true)
    Archinex->>LLMOps: PUT /api/knowledge/owners [X-Actor-Email: expert@...]
    LLMOps-->>Archinex: 200 OK (Propriétaire synchronisé)

    Expert->>Archinex: GET /api/knowledge/me
    Archinex->>LLMOps: GET /api/knowledge/me [X-Actor-Email: expert@...]
    LLMOps-->>Archinex: { handle, kb_roles, owned_domains, pending_reviews }
    Archinex-->>Expert: Fiche d'identité souveraine opposable
```

### Rôles KB Canoniques
- `kb:review` : Droit de voter, d'approuver ou de rejeter les candidats de doctrine et amendements.
- `kb:evaluate` : Droit d'exécuter et d'annoter les bancs d'évaluation et suites de tests.
- `kb:maintain` : Droit de modifier et de mettre à jour directement les règles de doctrine et templates de prompt.
- `kb:admin` : Droit de superviser les propriétaires, publier des releases doctrinales et administrer la gouvernance.

### Propagation d'Identité Souveraine (`X-Actor-Email`)
Tout appel expert émis vers LLMOps (`/api/knowledge/me`, `/api/knowledge/owners`, `/api/knowledge/candidates`...) propage l'entête HTTP `X-Actor-Email: <user_email>`. Aucun secret de service (`LLMOPS_AUTH_TOKEN`) n'est jamais exposé au navigateur client.

---

## 6. Boîte de Revue Experte, Actions d'Examen et Notifications (Lot A7 - Porte G5)

Archinex implémente la boîte de réception des revues et l'espace de décision expert pour statuer sur les candidats de doctrine soumis par les projets ou les architectes.

```mermaid
sequenceDiagram
    autonumber
    actor Expert as Expert Relecteur
    participant Archinex as Archinex (/kb/reviews)
    participant Engine as Notification & Polling Engine
    participant DB as Base Prisma (dev.db)
    participant LLMOps as Knowledge Hub LLMOps

    Engine->>LLMOps: GET /api/knowledge/events?since=<cursor>
    LLMOps-->>Engine: 200 OK { events, next_cursor }
    Engine->>DB: Upsert KbEventCursor & crée KbNotification (dédoublonnées)
    
    Expert->>Archinex: GET /kb/reviews
    Archinex->>LLMOps: GET /api/knowledge/reviews/inbox [X-Actor-Email]
    LLMOps-->>Archinex: 200 OK (Candidats filtrés, is_overdue recalculé)
    Archinex-->>Expert: Boîte de revue avec alertes retards (≥ 5 jours)

    Expert->>Archinex: PATCH /api/knowledge/candidates/{id} (action: accept/amend/reject)
    Note over Archinex: Vérifie habilitation domaine (403 si non possédé)<br/>Vérifie état non terminal (409 si déjà finalisé)
    Archinex->>LLMOps: PATCH /api/knowledge/candidates/{id} [X-Actor-Email, sans champ reviewer]
    alt Candidat de type principle
        LLMOps->>LLMOps: Enregistre avis 1 + Déclenche automatiquement second avis collégial
    else Actif standard
        LLMOps->>LLMOps: Valide et intègre dans la doctrine
    end
    LLMOps-->>Archinex: 200 OK (Candidat mis à jour)
    Archinex->>DB: Log append-only DomainEvent
    Archinex-->>Expert: Feedback visuel immédiat
```

### Invariants & Règles de Gouvernance Clés (Porte G5)
1. **Les 7 Contrôles Automatiques LLMOps** : Chaque candidat reçu affiche les résultats de 7 contrôles préalables formels (`schema_validity`, `clarity_score`, `testability`, `non_duplication`, `sovereign_compliance`, `domain_alignment`, `architectural_impact`).
2. **Double-Avis Obligatoire pour les Principes** : Tout candidat de type `principle` accepté par un expert déclenche automatiquement une tâche de second avis collégial auprès d'un pair avant intégration définitive.
3. **Contrôle d'Autorisation par Domaine (403 Forbidden)** : Un expert ne peut statuer que sur les candidats appartenant à ses domaines déclarés (`ownedDomains`). Tout écart est refusé avec une notification explicite.
4. **Interdiction du Rejet Sans Motif** : Rejeter un candidat exige un motif obligatoire circonstancié (règle constitutionnelle IV).
5. **Idempotence Absolue du Moteur d'Événements** : Le curseur persistant `KbEventCursor` et le suivi des identifiants d'événements garantissent zéro doublon de notification, même en cas de pollings multiples concurrents.
6. **Résilience et Dégradation Gracieuse** : En cas de code 503 du service de gouvernance LLMOps, l'interface bascule en lecture dégradée sans planter.

---

## 7. Atelier de Doctrine, Templates d'Actifs et Simulation de Clauses (Lot A8 - Issue #3)

L'Atelier de Doctrine (`/kb/workshop`) est l'environnement d'ingénierie doctrinale souveraine permettant aux architectes et experts de concevoir, valider et simuler des clauses de doctrine avant leur soumission formelle.

```mermaid
sequenceDiagram
    autonumber
    actor Architect as Architecte / Expert
    participant UI as Studio d'Auteur (/kb/workshop)
    participant Archinex as Archinex SvelteKit API
    participant LLMOps as Knowledge Hub LLMOps

    Architect->>UI: Sélectionne un type d'actif (ex: control, rule, pattern)
    UI->>Archinex: GET /api/knowledge/templates/{type}
    Archinex->>LLMOps: GET /api/knowledge/templates/{type}
    LLMOps-->>Archinex: 200 OK (Schéma formel, squelette YAML, prédicats types)
    Archinex-->>UI: Préremplit le formulaire et l'éditeur de prédicats

    loop Édition & Validation Live
        Architect->>UI: Modifie le draft & affine when/expect/requires/forbids
        UI->>Archinex: POST /api/knowledge/candidates/validate
        Archinex->>LLMOps: POST /api/knowledge/candidates/validate
        LLMOps-->>Archinex: 200 OK (valid: boolean, 7 automated checks pré-estimés)
        Archinex-->>UI: Affiche le diagnostic pré-vol (schéma, clarté, testabilité...)
    end

    opt Simulation sur Bancs de Tests & Non-Régression
        Architect->>UI: Clique sur "Simuler les clauses"
        UI->>Archinex: POST /api/knowledge/checks/simulate { predicates, test_cases }
        Archinex->>LLMOps: POST /api/knowledge/checks/simulate
        LLMOps-->>Archinex: 200 OK { precision, recall, regression_detected, verdicts }
        Archinex-->>UI: Affiche Precision/Recall + Bannière alerte si régression détectée
    end

    Architect->>UI: Soumettre pour revue formelle
    UI->>Archinex: POST /api/knowledge/candidates (draft validé)
    Archinex->>LLMOps: POST /api/knowledge/candidates [X-Actor-Email]
    LLMOps-->>Archinex: 201 Created (candidat inséré dans l'inbox G5)
    Archinex-->>UI: Redirection / confirmation avec identifiant canonique
```

### Invariants & Règles de Conception (Lot A8)
1. **Templates Canoniques Déclaratifs** : 7 types d'actifs normés (`principle`, `pattern`, `decision`, `control`, `glossary`, `rule`, `amendment`) disposant chacun de règles de validation strictes et d'exemples de prédicats testables.
2. **Prédicats Formels Opérables** : Chaque règle ou clause de contrôle articule ses conditions autour de quatre axes unifiés : `when` (champ d'application/déclencheur), `expect` (condition d'admissibilité), `requires` (dépendances obligatoires) et `forbids` (anti-patrons proscrits).
3. **Pré-vol Live (Zero Bad Submission)** : Le point d'entrée `POST /api/knowledge/candidates/validate` anticipe la notation des 7 contrôles automatiques LLMOps, alertant l'auteur sur les manques de clarté, de testabilité ou de complétude avant toute publication.
4. **Moteur de Simulation & Alerte de Régression** : La simulation sur cas de test historiques évalue la Précision et le Rappel de la clause. Si une nouvelle version de clause casse des cas conformes existants (`regression_detected: true`), une bannière d'alerte rouge bloque la soumission non surveillée.
5. **Circuit Ouvert vers la Boîte de Revue (Porte G5)** : Une clause rédigée et validée est directement enregistrée comme candidat `DRAFT` ou `SUBMITTED`, garantissant la continuité immédiate avec la boîte d'examen experte (`/kb/reviews`).

---

## 8. Ingestion des Référentiels Réglementaires et Déclaration de Couverture (Lot A10 - Issue #5)

L'espace Référentiels Réglementaires (`/kb/frameworks`) dote Archinex de la capacité d'ingérer des référentiels externes multi-formats, d'instruire chaque exigence ligne par ligne et d'émettre des attestations formelles de conformité opposables.

```mermaid
sequenceDiagram
    autonumber
    actor Expert as Expert Domaine (sec-lead)
    participant UI as Interface (/kb/frameworks)
    participant Archinex as Archinex API
    participant LLMOps as Knowledge Hub LLMOps

    Expert->>UI: Téléverse le référentiel (.pdf, .html, .txt, .md, .docx ≤ 20 Mo)
    UI->>Archinex: POST /api/frameworks/ingestions (multipart/form-data)
    Archinex->>LLMOps: POST /api/frameworks/ingestions [X-Actor-Email]
    LLMOps-->>Archinex: 201 Created (Découpage en exigences + ID d'ingestion)
    Archinex-->>UI: Affichage du tableau de bord d'instruction

    loop Instruction Ligne par Ligne
        Expert->>UI: Sélectionne une exigence
        opt Suggestions de Liaisons Doctrinales
            UI->>Archinex: POST .../requirements/{id}/suggest-links
            Archinex->>LLMOps: POST .../suggest-links
            LLMOps-->>Archinex: 200 OK { suggested_assets, llm_derived: true }
            Archinex-->>UI: Affiche suggestions avec étiquette d'assistance IA
        end
        Expert->>UI: Statut (accept / amend / reject avec motif)
        UI->>Archinex: PATCH .../requirements/{id}
        Note over Archinex: Vérifie habilitation domaine (403 si non possédé)<br/>Vérifie motif obligatoire si rejet (400 si vide)
        Archinex->>LLMOps: PATCH .../requirements/{id} [X-Actor-Email]
        LLMOps-->>Archinex: 200 OK (Exigence instruite)
    end

    Expert->>UI: Clique sur "Déclarer la Couverture Opposable"
    UI->>Archinex: POST /api/frameworks/{fw}/coverage-declaration
    Archinex->>LLMOps: POST /api/frameworks/{fw}/coverage-declaration [X-Actor-Email]
    alt Exigences non résolues en attente
        LLMOps-->>Archinex: 409 Conflict { missing_requirements: [...] }
        Archinex-->>UI: Blocage formel et affichage des exigences incomplètes
    else 100% des exigences instruites
        LLMOps-->>Archinex: 200 OK { coverage_declared: true, declared_at, declared_by }
        Archinex-->>UI: Certificat souverain d'attestation de conformité
    end
```

### Invariants & Règles de Gouvernance Clés (Lot A10)
1. **Téléversement Multi-Format Sécurisé** : Prise en charge des formats `.pdf`, `.html`, `.txt`, `.md`, `.docx` avec contrôle strict de taille plafonné à 20 Mo (HTTP 413).
2. **Découpage & Indexation d'Exigences** : Chaque clause réglementaire devient une entité atomique inspectable, traçable et rattachée à un domaine d'architecture.
3. **Assistance IA Étiquetée (`llm-derived`)** : Les correspondances sémantiques proposées par le LLM local ne constituent que des suggestions d'aide à la décision ; elles nécessitent obligatoirement un acte de validation explicite par l'expert humain (Invariant II).
4. **Cloisonnement d'Habilitation par Domaine (403 Forbidden)** : Un relecteur ne peut accepter, amender ou rejeter une exigence que s'il est formellement propriétaire du domaine correspondant (`ownedDomains`).
5. **Interdiction Absolue du Rejet Arbitraire (400 Bad Request)** : Tout rejet d'exigence réglementaire impose un motif textuel circonstancié expliquant l'inapplicabilité (Règle constitutionnelle IV).
6. **Scellement Opposable & Détection de Conflit (409 Conflict)** : La déclaration de couverture est conditionnée à la résolution exhaustive de 100% des exigences du référentiel. Toute lacune déclenche un blocage 409 mentionnant nominativement les exigences manquantes.



