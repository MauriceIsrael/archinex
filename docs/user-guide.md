# Archinex · Guide Utilisateur

> **Guide utilisateur canonique à l'attention des Lead Architects, Architectes Experts, Spécialistes Métier, Responsables Conformité et Administrateurs de la plateforme Archinex.**
>
> Pour la définition formelle des 5 phases, des niveaux de maturité (`L0`→`L5`), des portes `G3`→`G7`, des invariants épistémiques et du glossaire, voir [`docs/concepts.md`](concepts.md).

---

## 1. Authentification, Profils & Navigation Globale

### 1.1 Authentification & Mode Visiteur
Le système utilise une gestion de session sécurisée avec hachage **bcrypt** et jetons JWT en cookies HTTP-only :
- **Mode Visiteur (Anonyme)** : lorsqu'aucun utilisateur n'est authentifié, l'application est restreinte au **Dashboard Global** (« Executive Cockpit »). Les espaces de travail (`/workspaces`), l'atelier de délibération (`/deliberation`) et le graphe de connaissances (`/knowledge`) sont protégés par un garde serveur (`requireAuth`) redirigeant vers `/login?redirectTo=...`.
- **Connexion** : rendez-vous sur `/login` avec votre adresse e-mail et mot de passe. Après authentification, vous êtes redirigé vers votre destination initiale.

### 1.2 Rôles et Habilitations

| Rôle | Périmètre Opérationnel | Habilitations Clés |
| :--- | :--- | :--- |
| **Lead Architect** (`lead_architect`) | Arbitrage global & modération du dossier | - Arbitrage de tous les domaines (passage `L3_decided`, Porte G3)<br>- Capitalisation des décisions vers le Knowledge Hub (Porte G4)<br>- Homologation `L4` et scellement officiel SHA-256 `L5` |
| **Architecte Expert / Domaine** (`domain_expert` / `domain_architect`) | Dimensionnement technique, sécurité, réseau, cloud, data ou métier | - Arbitrage des sujets relevant de ses domaines attribués<br>- Saisie et rectification d'hypothèses, chiffrage des impacts, évaluation des variantes<br>- Traitement des questions ouvertes assignées |
| **Contributeur** (`contributor`) | Participation aux débats | - Évaluation des options et proposition d'alternatives<br>- Formulation d'arguments et d'objections |
| **Observateur** (`viewer`) | Consultation seule | - Lecture du tableau de maturité, des dossiers et des rendus |

### 1.3 Contrôles Globaux & Architecture Ergonomique à 2 Niveaux
L'en-tête supérieur de l'application est accessible en permanence :
- **Pastille de connectivité LLMOps** : affiche l'état de synchronisation avec le Knowledge Hub (`Connecté`, `Local` ou `En synchronisation...`). Un clic déclenche une resynchronisation manuelle ; la synchronisation en arrière-plan au chargement s'effectue silencieusement (`silent: true`) pour préserver la vue courante.
- **Pastille d'état Document Engine** : surveille la connectivité du serveur Document Engine (port `3001` par défaut).
- **Menu d'aide méthodologique (`?`)** : ouvre le guide interactif *« Comment décider ? »* (L2→L3, Diff, Porte G4, Scellement L5).
- **Préférences** : sélecteur de langue (Français / Anglais / Espagnol) et de thème (Clair / Sombre / Système).

L'ergonomie distingue deux échelles cognitives complémentaires :
- **Niveau Projet (Macro)** : barre supérieure de `/deliberation` (*Phase 1 · Corpus & Règles*, *Tableau des Sujets*, *Phase 5 · Consolidation*) et pastille projet cliquable dans l'en-tête global.
- **Niveau Sujet (Micro)** : navigation par sujet ouvert (*Phase 2 · Délibération → Phase 3 · Rendu HLD → Phase 4 · Raffinement*), tiroir synthétique des exigences RFP rattachées (`SubjectRequirementsDrawer`) et mémorisation automatique par projet dans `localStorage` (`archinex:activeSubjectId:<id>`, `archinex:deliberationViewMode:<id>`, `archinex:activePosture:<id>`).

---

## 2. Initialisation Guidée & Vue d'Ensemble des 5 Phases

### 2.1 Initialisation Guidée d'un Espace de Travail (5 Étapes)
L'assistant de création d'espace (`/workspaces/new`) guide l'équipe en 5 étapes :
1. **Cadrage & Description** : titre du projet, type d'engagement (`RFP`, `Blueprint`, `Audit NIS2`, `POC`) et slug d'identification.
2. **Stratégie Globale, Principes & Référentiels** : objectifs stratégiques macro, principes directeurs d'architecture, contraintes non négociables (lignes rouges) et référentiels réglementaires applicables (NIS2, SecNumCloud, ISO 27001, etc.).
3. **Documents Amonts** : versement des pièces contractuelles (CCTP, RFP, spécifications métier) ou lancement du moteur de dépouillement.
4. **Participants & Équipe Habilitée** : affectation des Lead Architects, Experts et Sachants Métier.
5. **Lancement & Scellement Initial** : création de l'espace et transition vers la Phase 1.

### 2.2 Les 5 Phases du Parcours Unifié
1. **Phase 1 · Corpus & Règles (Appropriation)** : ingestion CCTP/RFP, rapport d'extraction sur échantillon, audit 4 compartiments, fiches de synthèse des standards (3GPP, NIS2, Uptime Institute) et factorisation en sujets.
2. **Phase 2 · Délibération (Cœur Dialectique)** : tableau de maturité trié par effet multiplicateur (`unlocks_count`), Workbench de délibération, débat multi-agents borné, triage des objections, arbitrage opposable Porte G3 (standard ou Fast-Track G3) et capitalisation Porte G4.
3. **Phase 3 · Rendu HLD (Homologation & Projections)** : spécification HLD, barrière de certification, scellement SHA-256, projections multi-modèles déterministes (Mermaid, C4X, Structurizr DSL, SysML v2, JSON, SVG éditoriaux) et export Word `.docx` via Document Engine.
4. **Phase 4 · Raffinement (Intention & Planification LLD)** : matrice KAOS multi-axes, prévisualisation `dry-run` Nautobot (`Planned-Capacity` vs `Planned-Allocated`), oracles OPA/Rego, Jumeau Numérique Sylva et valorisation FinOps BOM.
5. **Phase 5 · Consolidation (Réalisation & Dérive)** : 4 piliers transverses, cartographie interactive 2D Sylva, registre d'emplacements TOGAF, graphe causal d'impact & simulateur What-If, réconciliation Nautobot et scellement `architecture.lock`.

---

## 3. Phase 1 · Ingestion RFP, Audit ArcKit & Dépouillement

### 3.1 Ingestion Épurée, Vérification sur Échantillon & Rapport d'Extraction (#50)
Avant d'exécuter l'audit ou la factorisation sémantique d'un document, Archinex propose trois modes réels d'ingestion (**Fichier Local** PDF vectoriel/Markdown/TXT/JSON, **Coller le texte**, **URL distante**) et génère un **rapport d'extraction synthétique** :
- **Statistiques globales** : nombre d'exigences extraites, nombre de pages, taux de couverture d'extraction en caractères (`extractionCharCoverage`, distinct de la couverture de délibération définie dans [`docs/concepts.md`](concepts.md)) avec seuil d'alerte sous 60 %.
- **Détection explicite des anomalies** : trous de numérotation séquentielle (`REQ-Lot1-13 .. REQ-Lot1-14`), doublons disambiguïsés (`#2`), références sans numéro (`REQ-Lot1-?`), clauses trop courtes (< 25 caractères) ou volumineuses (> 2 500 caractères), pages sans clause.
- **Échantillon de vérification humaine côte à côte** : sélectionne 100 % des clauses en anomalie complétées de clauses de contrôle, avec la clause extraite à gauche et l'extrait source PDF à droite. L'opérateur peut **Confirmer**, **Signaler** ou corriger le texte avant lancement. L'attestation est persistée avec `FactorizationRun` ; un lancement sans validation affiche un bandeau d'avertissement explicite.

### 3.2 Audit des Exigences en 4 Compartiments (Le modèle propose, vous disposez)
À l'import d'un RFP, chaque clause reçoit exactement un état proposé :
1. **`deliberated` (à délibérer)** : engage un choix d'architecture avec alternatives ou tensions ; regroupée en sujets `L0` avec question, hypothèse et questions métier.
2. **`evacuated` (évacuation proposée)** : commodité couverte par des produits standard, avec **motif obligatoire** ; aucune clause n'est supprimée et toute évacuation se corrige en un clic (*« Promouvoir en Sujet Archi »*).
3. **`clarification_needed` (à clarifier)** : exigence ambiguë accompagnée d'une question pour le donneur d'ordre.
4. **`to_qualify` (à qualifier par vous)** : cas non tranché par le pipeline.

**Garde-fous appliqués par le code :** une clause **bloquante** n'est jamais évacuée automatiquement ; une évacuation sans motif ou une clarification sans question bascule en `to_qualify` ; si le modèle est injoignable, tout passe en `to_qualify` ; le taux de couverture affiché exclut `to_qualify`. Le dossier scellé conserve toutes les clauses et distingue les propositions du modèle des décisions humaines (voir [`docs/jalon-j0.md`](jalon-j0.md)).

### 3.3 Typologie des Criticités

| Criticité | Signification | Déclencheurs NLP typiques | Traitement Archinex |
| :--- | :--- | :--- | :--- |
| **Bloquant** (`bloquant`) | Exigence éliminatoire non négociable | RFC 2119 stricts (*« DOIT OBLIGATOIREMENT »*, *« IMPÉRATIF »*, *« SHALL NOT »*) ou contraintes dures (SecNumCloud, NIS2, 24×7, holdover GNSS 30j, redondance géo) | Effort L/XL, arbitrage formel obligatoire par `lead_architect` ou expert habilité |
| **Majeur** (`majeur`) | Exigence normative standard | *« DOIT »*, *« MUST »*, *« SHALL »*, *« EXIGE »* | Effort M, délibération collective |
| **Info** (`info`) | Recommandation ou contexte | *« DEVRAIT »*, *« SHOULD »*, *« MAY »* | Sans impact bloquant |

### 3.4 Dépouillement en Arrière-Plan, Cache & Reprise
Pour les appels d'offres volumineux (centaines ou milliers de clauses) :
- **Exécution serveur & notifications** : orchestrée via `factorizationJobs.ts`, avec mise à jour du titre d'onglet (`⏳ Tri des exigences (X/Y)`) et notification Web système (`✅ Prêt !`) permettant de naviguer librement dans l'application.
- **Résilience & Fast-Fail quota** : détection proactive des erreurs de quota/crédits LLM (`isLlmCreditOrQuotaError`), conservation des lots validés dans le cache SQLite (`FactorizationStageCache`) et bouton **« Reprendre l'analyse »** sans recalculer les étapes déjà traitées.
- **Partitionnement sécurisé** : découpage en tranches indépendantes (`PARTITION_MAX_CHARS: 250 000`) lors de la cartographie.

---

## 4. Phase 2 · Délibération, Arbitrage G3 & Capitalisation G4

### 4.1 Ergonomie de l'Espace Sujet Unifié
Depuis le **Tableau de Maturité** (trié par `Débloque`), un clic ouvre le sujet dans le Workbench (colonne de liste des sujets repliable via `⇥ Replier` / `📂 Sujets`) :
- **Timeline horizontale de maturation (`L0 Nommé` → `L5 Archivé`)** : ouverte sur le prochain jalon à franchir, avec critères de passage et actions contextualisées (`Reformuler`, `@proposer`, `@verifier`, `@challenger`, `@synthesizer`, `Trancher dans la Matrice`, `Préparer les candidats KB`).
- **4 Volets Unifiés (vue Split Fil + Matrice sur grand écran)** :
  1. **Délibération & Cadrage** : bandeau de cadrage compact, tiroir des exigences RFP rattachées, objections ouvertes épinglées, fil dialectique (agents IA à gauche en pointillés `llm-derived`, humains à droite en bulle pleine) et composeur structuré.
  2. **Options, Matrice, Arbitrage & Capitalisation (G3/G4)** : critères pondérés, matrice d'évaluation `[-2 ; +2]`, arbitrage formel, affirmation `K16`, extraction des faits `K18` et `CapitalizationPanel`.
  3. **Doctrines, RFP & Brouillon** : doctrines LLMOps applicables, règles citées (puces cliquables vers `/knowledge`) et brouillon télégraphique.
  4. **Cascade & Règles** : arbre de découverte interactif (`DiscoveryTreeView`), diagnostic des règles (`ProjectRulesPanel`) et angles morts (`🤖`).

### 4.2 Chaîne de Maturation d'un Sujet (Étapes 1 à 6)
1. **Cadrage (`L0` → `L1`)** : définir le problème/dilemme d'architecture. Les questions métier (ArcKit) et de cascade (`K20`) disposent du bouton **`[ 💬 Répondre / Éclairer ]`** avec 3 modes : *Poser comme Hypothèse* (`draft.suppose`, valide le critère L1), *Acter comme Retenu* (`draft.retenu`) ou *Débattre*.
2. **Critères & Alternatives (`L1` → `L2`)** : ajouter au moins deux critères pondérés et deux options viables (manuellement ou via `@proposer`), puis évaluer chaque option sur `[-2 ; +2]` avec justification concise.
3. **Débat Multi-Agents Borné** : 4 agents (**Proposer**, **Challenger**, **Verifier**, **Synthesizer**) interviennent sur 3 tours maximum. Toute objection ouverte requiert une action humaine explicite (*Répondre*, *Accepter le risque avec justification* ou *Retirer*).
4. **Suivi de Maturité Calculée** : la bannière d'alerte liste en temps réel les blocages actifs (objections bloquantes ouvertes, violations doctrinales sans dérogation, référentiels incomplets).
5. **Arbitrage Opposable (`L2` → `L3_decided`, Porte G3)** :
   - Sélectionner l'option retenue, motiver le rejet des alternatives, qualifier la réversibilité (*réversible*, *coûteuse*, *structurante/irréversible*) et la **posture de conformité** (`Compliant`, `Partially compliant` ou `Non-compliant` avec justification $\ge 5$ caractères, `Provisional`).
   - Qualifier la **portabilité** (#120) : `project_specific` (exclu du moissonnage, `harvestable: false`), `reusable_product_capability` ou `reusable_architecture_doctrine` (`harvestable: true`).
   - Vérifier le bandeau **Contrôle réglementaire KB** (*fail-closed* si Hub non connecté ou vérification incomplète ; dérogation explicite motivée tracée en `Provisional`).
   - Tant qu'un sujet n'est pas scellé (`L5_archived`), un arbitrage `L3`/`L4` reste révisable (`rév. v2`, etc.).
6. **Extraction des Faits, Cascade & Capitalisation (Porte G4)** :
   - Extraction et affirmation des faits machine-lisibles (`K18`), visualisation de l'arbre de découverte (`DiscoveryTreeView`) et diagnostic des règles (`ProjectRulesPanel`).
   - Génération automatique de candidats anonymisés (`new_asset`, `amendment`, `rex`), relecture humaine obligatoire (**Invariant III**) et transmission à LLMOps.

### 4.3 Chatbot Assistant Exigences au Clavier (`Quick-Ask`)
Accessible partout dans le Workbench via `Alt+/` (`Ctrl+K` / `Cmd+K`) ou le bouton **« Assistant Exigences · Alt+/ »** :
- Fenêtre flottante non bloquante (masquable via `Échap`), strictement en lecture assistée (ne modifie aucune décision).
- Verdict sourcé (`Exigé`, `Partiel / Implicite`, `Non mentionné`, `Contradictoire`), réserves (`caveats`) et liens directs `clauseRef` vers le sujet concerné.

---

## 5. Capacités RFP War Room (#442–#450)

Pour répondre aux contraintes opérationnelles des réponses à appels d'offres complexes (délais courts, vagues d'errata client, lots multiples, chiffrage BPU), Archinex intègre un ensemble de capacités dédiées **RFP War Room** :

### 5.1 Mode Fast-Track G3 (#442)
Lorsqu'un sujet correspond à une décision standard évidente ou à une hypothèse structurante sans controverse réelle, l'architecte habilité peut activer le **Mode Fast-Track G3** dans le panneau d'arbitrage (`ArbitrationPanel.svelte`) :
- Active `fastTrack: true` avec une justification dédiée (`fastTrackRationale` $\ge 10$ caractères).
- Lève uniquement les prérequis d'exploration comparative (`MISSING_CRITERIA`, `INSUFFICIENT_OPTIONS`, `UNEVALUATED_OPTION`) afin d'éviter la création artificielle d'options « homme de paille ».
- **Maintient intégralement tous les garde-fous critiques** : `MISSING_PROBLEM_STATEMENT`, `OPEN_OBJECTION` bloquante, `OPEN_BLOCKING_QUESTION`, `UNRESOLVED_VIOLATION` et contrôle KB *fail-closed*.

### 5.2 Triage de Sévérité & Acquittement Motivé en Lot des Objections (#445)
Dans `PinnedObjections.svelte`, les objections sont qualifiées selon deux niveaux de sévérité :
- **`blocking` (Bloquante)** : empêche le passage en `L3_decided` jusqu'à résolution explicite.
- **`advisory` (Consultative)** : émise en avertissement non bloquant (`ADVISORY_OBJECTION` dans `computeMaturity`), permettant de tracer les points de vigilance sans paralyser le chemin critique.
- **Acquittement motivé en lot (`batchResolveObjections`)** : la barre d'actions en lot permet de clore plusieurs objections sélectionnées avec une motivation explicite commune, dans le respect strict de la **Règle du Silence** (aucune clôture tacite).

### 5.3 Vagues Q&R Acheteur / Errata CCTP & Matrice de Conformité Contractuelle (#443)
Le module `src/lib/domain/rfpErrata.ts` outille la gestion des vagues de Questions/Réponses et errata publiés par l'acheteur en cours d'appel d'offres :
- **Import CSV de vague Q&R (`parseBuyerQaWaveCsv`)** : ingère les réponses officielles de l'acheteur en les rattachant aux clauses cibles (`clarifies`, `modifies`, `withdraws`).
- **Propagation causale automatique** : tout amendement disruptif (`modifies` ou `withdraws`) déclenche le moteur de rétractation (`executeRetractionCascade`), rétrograde automatiquement les sujets impactés (`L3_decided` → `L2_decomposed`) et marque les paquets EDP concernés comme `stale` (caducs).
- **Matrice de Conformité Contractuelle Acheteur** : exportable en **CSV (compatible Excel)** et **Markdown**, intégrant les clauses initiales et leurs amendements Q&R.

### 5.4 Cold Start Ontologique pour Briques Émergentes (#444)
Lorsque le RFP impose une brique inédite non encore modélisée dans l'ontologie LLMOps (ex. passerelle IoT, streaming vidéo, inférence IA), `src/lib/domain/edp/emergentColdStart.ts` évite tout blocage pendant l'avant-vente :
- Propose **5 archétypes TOGAF génériques** (`EMERGENT_ARCHETYPES`) pour catégoriser immédiatement le composant émergent.
- Évalue de façon déterministe **6 garde-fous transverses de base** (`evaluateEmergentBaselineGuards`) sans nécessiter d'écriture Rego manuelle pendant le sprint RFP.
- Génère automatiquement un **candidat Porte G4 (`new_asset`)** embarquant le squelette ontologique prêt à être soumis à LLMOps en fin d'engagement.

### 5.5 Granularité CMDB Nautobot : `Planned-Capacity` vs `Planned-Allocated` (#447)
En Phase 4 (`Phase4NautobotPlanPreview.svelte`, `src/lib/server/edp/nautobotSync.ts`), la projection CMDB distingue deux niveaux de granularité :
- **`Planned-Capacity` (`capacity_sizing` — Avant-vente RFP)** : verrouille la topologie, les équipements, les rôles et les interfaces logiques tout en différant l'attribution des adresses IP/MAC nominales à la phase d'ingénierie détaillée.
- **`Planned-Allocated` (`lld_allocated` — Ingénierie LLD)** : renseigne l'adressage complet (IP, VLAN, MAC, câblage) prêt pour la réconciliation avec l'infrastructure réelle.

### 5.6 Valorisation BOM / BPU Dynamique FinOps (#446)
Le moteur `src/lib/domain/edp/finopsBom.ts` relie directement l'architecture hydratée au chiffrage économique :
- Calcule dynamiquement **CAPEX**, **OPEX annuel**, **TCO**, encombrement (**U de baie**), **puissance électrique (kW)** et **jours-hommes d'intégration** à partir de l'inventaire hydraté (`computeDynamicBomFromHydration`).
- Compare automatiquement le coût et l'empreinte des profils topologiques du Jumeau Numérique Sylva (`compareTopologyProfilesBom` : 3 DCs Gold vs 2 DCs + Témoin Silver vs 2 DCs Secs Bronze).
- Exporte le bordereau de prix unitaire au format tableur (`exportBomToBpuCsv`).

### 5.7 Co-Signature d'Interfaces Inter-Lots & Assembleur Narratif RFP (#448)
Pour les réponses multi-lots (ex. Lot Réseau ↔ Lot Applicatif ↔ Lot Exploitation) :
- **Contrats d'interface & double signature (`src/lib/domain/interLotCollaboration.ts`)** : chaque frontière inter-lots exige une **double signature humaine par deux acteurs distincts** (lot producteur et lot consommateur) ; la barrière `evaluateInterLotCoSignatureGate` bloque le gel tant qu'une interface critique reste unilatérale.
- **Assembleur narratif sans dérive (`src/lib/domain/rfpNarrativeAssembler.ts`)** : `assembleRfpTechnicalMemo` compile automatiquement le mémoire technique RFP à partir des décisions scellées, de la matrice de conformité Q&R, des co-signatures inter-lots, de la synthèse BOM FinOps, des diagrammes Mermaid déterministes et des recommandations SVG éditoriales (voir la cartographie d'usage dans [`docs/EDITORIAL_DIAGRAMS.md`](EDITORIAL_DIAGRAMS.md)).

---

## 6. Phase 3 · Rendu HLD, Scellement & Exports Documentaires

### 6.1 Barrière de Certification, Scellement SHA-256 & Dossier d'Engagement
En Phase 3, le bandeau compact `Phase3SubjectSelector` pré-filtre par défaut les sujets **Spécifiés L4** (avec bascule rapide `L3+` / `Tous` et filtre par Lots/Parties).
- **Barrière de certification** : contrôle automatique des critères bloquants (Maturité $\ge$ L3, zéro conflit ouvert, zéro hypothèse non justifiée, rôle Lead Architect).
- **Dossier d'Engagement Scellé (`EngagementBundle`, profil `canonical-json-v1`)** :
  - Seul ce qui a été validé par une personne habilitée (ou confirmé dans le journal de réutilisation) est exporté en `asserted` ; les propositions IA restent `proposed`.
  - Sélection obligatoire de la confidentialité (`public`, `internal`, `confidential`, `secret`) dans `FreezeSectionDialog`.
  - **Bandeau « Dossier Provisoire »** affiché tant qu'un sujet reste sous `L3_decided` ou qu'un conflit est ouvert.
  - Encapsulation dans `SuiteSnapshotEnvelope` avec référence détachable `SnapshotRef` (`L5_archived` projeté en `L4_specified`).
- **Matrice de Conformité (`ComplianceMatrix`, #118)** : accessible dans l'onglet dédié du Hub d'Artefacts, exportable en CSV RFC 4180 (BOM UTF-8) ou via `GET /api/projects/{projectId}/compliance-matrix?format=markdown|csv|json`.
- **Export OSCAL NIST SSP v1.0.0** : seules les exigences liées à des contrôles `asserted` portent l'état `implemented` (`satisfied`).
- **Comparateur & Rétroaction** : `diffEngagementBundles` détecte les régressions épistémiques (`asserted` → `proposed`) ; `extractBundleKbCandidates` renvoie les décisions natives validées vers la boîte de revue (`in_review`).

### 6.2 Projections Visuelles Déterministes & Réactivité en Direct
Le Hub d'Artefacts (`ArtifactRegenerationHub`) et `HldFragmentView` projettent en temps réel (via Svelte 5 `$derived`) et sans dérive documentaire :
1. **Architecture Spécifiée (Cible)** : diagramme de conteneurs/flux (Mermaid C4 / Flowchart), Structurizr DSL, C4X et SysML v2.
2. **Chaîne de Déploiement & Homologation** : diagramme de séquence de la chaîne de confiance.
3. **Graphe Décisionnel (Auditabilité)** : graphe causal épistémique (hypothèses, énoncés, conflits, options).
4. **Diagrammes SVG Éditoriaux** : voir [`docs/EDITORIAL_DIAGRAMS.md`](EDITORIAL_DIAGRAMS.md).
- **Aperçu Plein Écran (Press & Hold)** : maintenez le clic gauche sur un diagramme Mermaid pour l'agrandir instantanément en plein écran (relâchez pour revenir, ou verrouillez via la barre d'outils).

### 6.3 Génération HLD Word (`.docx`) & Connexion Document Engine / Studio
Dans la barre d'actions de `HldFragmentView` :
- **Pastille Document Engine (`DocumentEngineStatusBadge`)** : Vert (`3001` prêt), Ambre (hors ligne avec commande `npm run server`), Bleu (test en cours).
- **Génération `.docx` avec garde préventive** : le bouton **« Générer HLD Word (.docx) »** est désactivé tant que Document Engine n'est pas joignable ; lorsqu'il est actif, il compile les fragments HLD en livrable Word typographié avec figures vectorielles haute résolution (option `?includeMermaidCode=true` disponible si besoin).
- **Rebond Document Studio** : bouton **« Document Studio »** vers le cockpit d'édition (`DOCUMENT_STUDIO_URL`, port `5174` par défaut).

---

## 7. Phase 4 & Phase 5 · Raffinement EDP, Jumeau Sylva & Consolidation

### 7.1 Paquets de Décision Exécutables (EDP) & Oracles OPA
Le sous-système EDP est toujours actif (prérequis OPA dans [`docs/fresh-install.md`](fresh-install.md)). Chaque décision porte une fiche `EdpCard` (état `PROPOSÉ` / `VALIDÉ` / `STALE`, validateur humain, score de mutation 100 %, verdict `COMPLIANT` / `VIOLATED` / `INSUFFICIENT_INPUT` / `NOT_APPLICABLE`).

Vérification hors-ligne et porte CI locale :
```bash
npx tsx scripts/edp-verify.ts \
  --edp edp/examples/adr012-baremetal/edp.json \
  --input edp/examples/adr012-baremetal/mocks/pass.json

npx tsx scripts/edp-gate.ts
```
Codes de sortie `edp-gate` : `0` (`compliant`), `1` (`violated`), `2` (`insufficient_input`), `3` (`unavailable`).

### 7.2 Phase 4 · Matrice KAOS Multi-Axes, Hydratation & Jumeau Numérique Sylva
Dans `/deliberation?posture=refinement` (`Phase4RefinementHub`) :
- **Matrice KAOS des 5 Axes Obligatoires** (*Substrat Compute*, *Plan Hors-Bande OOB*, *Zonage Sécurité NIS2*, *Fidélité Environnements Dev/Recette/Prod*, *Résilience Électrique 2N*) plus axes applicatifs contextuels (ex. SIG) et axe dynamique *0. Allocation de Composant Logique* pour capacités émergentes.
- **Zéro défaut silencieux** : toute pré-liaison porte le badge **`🟠 Défaut proposé — À ratifier`** jusqu'à ratification explicite (`bindingOrigin = 'explicit'`).
- **Simulateur de dérive CMDB (Drift)** : déclenche en un clic une dérive sur chaque axe pour vérifier la détection Rego (`multi_axis_refinement.rego`).
- **Jumeau Numérique de Sylva** : compare en temps réel 3 profils topologiques (**3 DCs Gold `3dc-active`**, **2 DCs + Témoin Silver `2dc-witness`**, **2 DCs Secs Bronze `2dc-split`**) en mode *Proposition Équipe* ou *Fixé par le Client* (vérifié par `edp/policies/twin_resilience.rego`), avec aperçu du bouchon Redfish **`sushy-emulator.conf`**.
- **Isolation Multi-Projets Nautobot 2.x** : isolation logique automatique par `projectScope` (`Namespace` IPAM, `VLANGroup`, tags et préfixage `<scope>--`) ou instance dédiée par projet.

### 7.3 Phase 5 · Consolidation, 4 Piliers, Graphe Causal & `architecture.lock`
Dans **Phase 5 · Consolidation** (`Phase5ConsolidationHub` & `LiveArchitectureLockView`) :
- **4 Piliers Transverses** : *Socle / Architecture transverse*, *Sécurité*, *Gestion / Gouvernance*, *GitOps / Exploitation*.
- **4 Vues complémentaires** :
  1. **Cartographie Interactive 2D Sylva** (3 Plans Verticaux × 3 Piliers Transverses + inspecteur latéral).
  2. **Matrice Ligne-à-Ligne des Emplacements** (`Axe → Variante → Composant → Statut Lock`) avec instanciation en 1 clic de `LogicalComponent` émergent conforme `Base × Overlay × DC`.
  3. **Manifeste `architecture.lock` Temps Réel** (JSON + SHA-256 progressif, bloqué en `409 Conflict` tant qu'un choix reste implicite).
  4. **Graphe Mermaid d'Export Filtré** (`mermaidLockedOnly` ou `mermaidFullWithStatus`).
- **Graphe Causal d'Impact & Simulateur What-If (`#phase5-impact-graph`)** : contextualisé par sujet, enrichissement IA optionnel (avec repli déterministe), bascule *Optimum Nominal* ↔ *Compromis Coût* et registre de dette technique (`Vx → Vy`).

### 7.4 Pile Docker d'Intégration & Ensemencements Démo
- **Pile d'outils intégrateur (`deploy/integrator-tools`)** : `.\tools.ps1 up|status|test|reset-nautobot` démarre Nautobot (`8080`), Batfish (`9997`), OPA (`8181`), sushy-emulator (`8001`), OpenBao (`8200`), Keycloak (`8085`), Zot (`5000`), Trivy (`4954`), Technitium DDI (`5380`) et Forgejo (`3001`).
- **Ensemencements démo** :
  ```bash
  # Dossier complet Phases 1 → 4 autonome et idempotent sur base vierge
  npm run seed:demo

  # Dossier Lulu Lot 1 à l'état "Juste Après Ingestion" (7 sujets L1_framed)
  npm run seed:lulu
  ```
- **Banc de test en boîte noire (`scripts/benchmark-run.ts`)** : supporte `pipeline: 'arckit'` et `--elicit` pour les évaluations S2/S3 sans interface graphique.

---

## 8. Gouvernance Knowledge Hub LLMOps (`/kb/*`)

L'ensemble des mini-applications de doctrine est regroupé dans le menu latéral **Knowledge Hub** en 3 paliers :
1. **Visualisation & Exploration** : *Base de Connaissance* (`/knowledge`, incluant l'onglet **Ontologie & Triplets** `/knowledge?view=ontology`), *Profil Expert KB* (`/kb/me`), *Référentiels & Couverture* (`/kb/frameworks`).
2. **Doctrine & Rédaction** : *Atelier de Doctrine* (`/kb/workshop`), *Clauses vérifiables* (`/kb/clauses`).
3. **Validation & Évaluation** : *Boîte de Revue KB* (`/kb/reviews` — Porte G5), *Banc d'Évaluation KB* (`/kb/evals` — Porte G6), *Tableau de Bord & Publication* (`/kb/dashboard` — Porte G7).

### 8.1 Boîte de Revue des Candidats (`/kb/reviews`) — Porte G5
- **Séparation des tâches (règle des 4 yeux)** : un expert ne peut jamais s'auto-évaluer sur une clause dont il est l'auteur. Le filtre par défaut exclut ses propres clauses ; décoché, elles apparaissent en lecture seule (`Consulter (Auteur)`).
- **7 Contrôles Automatiques LLMOps** : `schema_validity`, `clarity_score`, `testability`, `non_duplication`, `sovereign_compliance`, `domain_alignment`, `architectural_impact`.
- **Actions opposables** : *Accepter* (double revue collégiale automatique pour les `principle`), *Amender* (avec motif), *Rejeter* (motif obligatoire), *Assigner à un pair*, *Solliciter un 2nd avis*, fil de discussion et alertes de retard ($\ge 5$ jours ouvrés). Contrôle d'habilitation strict par domaine (`403 Forbidden` sinon).

### 8.2 Réutilisation d'une Décision Validée (« Deuxième RFP », Tolérance Zéro)
Archinex **propose** une décision validée similaire mais ne la réutilise jamais automatiquement :
1. Cliquez sur **Examiner les hypothèses** : aucune hypothèse n'est présumée valide.
2. Jugez **chaque** hypothèse (*Valide*, *Invalide* ou *Inconnue*).
3. Choisissez l'issue : *Réutiliser tel quel* (toutes valides), *Réutiliser avec exception* (commentaire obligatoire), *Rejeter, hypothèse rompue* (réouvre la question), *Rejeter, pas le même sujet* (raison mémorisée) ou *Reporter*. Une décision sans hypothèses documentées ou remplacée ne peut pas être réutilisée.

### 8.3 Atelier de Doctrine (`/kb/workshop`) & Clauses Vérifiables
- Gabarits officiels : `principle`, `pattern`, `decision`, `control`, `glossary`, `rule`, `amendment`.
- Prédicats testables : `WHEN`, `EXPECT`, `REQUIRES`, `FORBIDS`.
- **Validation à blanc & Simulateur d'impact** : estime les 7 contrôles automatiques, mesure la précision et le rappel de doctrine avec alerte de régression avant soumission à `/kb/reviews`.
- **Santé des clauses (`KbClausesHealthBanner`, #119)** : badge d'alerte orange dès qu'une exigence du périmètre possède des clauses non testées ou non publiées.

### 8.4 Référentiels Réglementaires (`/kb/frameworks`)
- Téléversement multi-format (`.pdf`, `.html`, `.txt`, `.md`, `.docx`, max 20 Mo) et découpage automatique en exigences unitaires.
- Auto-enrichissement IA local (`LocalLlmClient`, étiqueté `llm-derived`) à l'ingestion et à la demande (*Auto-enrichir par l'IA* / *Suggérer correspondances IA*).
- Revue ligne par ligne (*Accepter*, *Amender*, *Rejeter* avec motif obligatoire, contrôle par `ownedDomains`).
- **Déclaration Formelle de Couverture Opposable (Porte G6)** : bloquée en `409 Conflict` tant qu'une exigence reste en attente.

### 8.5 Banc d'Évaluation (`/kb/evals`) & Tableau de Bord / Publication (`/kb/dashboard`, Porte G7)
- **Banc d'Évaluation (`check_option_v1`)** : annotation de la vérité terrain réservée à `kb:evaluate` (`human_verified`, `disputed`, `needs_review`). Critère Porte G6 : rappel réel $\ge 80\%$ sur les cas `human_verified`. Signalement de désaccord doctrinal directement depuis `/deliberation`.
- **Publication Scellée (Porte G7)** : réservée à `kb:admin` ou `kb:maintain`, bloquée en `409 Conflict` si des revues critiques sont en retard ou si le rappel est $< 80\%$. Produit un instantané scellé SHA-256 (`snapshot-YYYY-MM-DD-<hash>`). Un bandeau permanent avertit si le Hub tourne en mode démo éphémère.
- **Campagnes d'enrichissement** : pilotage par domaine, type d'actif, objectif et échéance.

---

## 9. Administration, Comptes SSoT, Réflexes & Frugalité

### 9.1 Gestion Centralisée des Comptes (`/admin`)
Archinex est la **Source Unique de Vérité (SSoT)** des identités, rôles applicatifs et droits doctrinaux :
- **Deux dimensions orthogonales** : domaines de responsabilité (`DomainsPicker` avec packs rapides `+ Pack 3GPP`, `+ Pack Sécurité`) et rôles (système, espace de travail, doctrine KB `kb:review` / `kb:evaluate` / `kb:maintain` / `kb:admin`).
- **Synchronisation automatique & JIT Provisioning** : dérivation du handle canonique (`@prenom-nom`), synchronisation en direct vers LLMOps (`PUT /api/knowledge/owners`), liens d'activation sécurisés valables 7 jours (`/invite?token=...`), matrice de couverture des domaines et supervision des politiques Casbin.

### 9.2 Studio Admin des Réflexes d'Architecture (`/admin/reflexes`)
Réservé aux administrateurs (`role: admin`) :
- Catalogue & éditeur No-Code versionné (`draft` → `published` → `deprecated`) des réflexes de cascade (« Si on décide X → Penser à Y »).
- Vocabulaire canonique & synonymes, bac à sable & replay historique sur décisions anonymisées, et promotion en 1 clic des angles morts IA (`🤖`) en réflexes déterministes.

### 9.3 Top 5 des Opportunités de Frugalité (`/`)
Sur le **Tableau de bord** (`/`), une carte met en lumière les 5 meilleurs arbitrages économiques du portefeuille (confrontation référence technique maximale vs alternatives plus sobres sur les critères `kind: 'cost'` à compromis technique maîtrisé $\Delta \text{Tech} \le 1.0$), avec statut en direct (*À arbitrer*, *Frugalité actée*, *Surcoût premium assumé*) et ouverture directe du sujet dans `/deliberation`.

---

## 10. Dépannage Fréquent

- **« Arbitrage refusé (blocages actifs) »** : vérifiez que toutes les options sont évaluées (ou activez le mode Fast-Track G3 si le sujet est éligible), qu'aucune objection bloquante n'est ouverte et que la couverture des référentiels projet est complète.
- **« 403 Habilitation insuffisante »** : seul le Lead Architect ou un expert affecté au domaine du sujet peut enregistrer la décision.
- **« 403 Interdit : domaine non possédé »** : pour examiner un candidat KB ou une exigence réglementaire, vous devez être propriétaire du domaine (`ownedDomains`).
- **« 403 Habilitation d'évaluation / de publication manquante »** : l'annotation du jeu de test requiert `kb:evaluate` ; la publication scellée requiert `kb:admin` ou `kb:maintain`.
- **« 409 Conflit : Conditions de la Porte G7 non remplies »** : des revues critiques en retard subsistent ou le rappel benchmark est inférieur à 80 %.
- **« 409 Conflit : exigences non couvertes restantes »** : toutes les exigences d'un référentiel doivent être instruites avant de déclarer la couverture.
- **« 413 Fichier trop volumineux »** : taille maximale de 20 Mo pour le téléversement de référentiel.
- **« Mode Hors-Ligne (Offline) »** : si LLMOps est injoignable, l'arbitrage passe en échec fermé (*fail-closed*) ; une dérogation motivée reste possible et tracée en `Provisional`.
- **« Jeton d'invitation expiré »** : les invitations expirent après 7 jours ; demandez une nouvelle invitation à un administrateur.
