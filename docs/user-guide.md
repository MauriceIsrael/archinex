# User Guide — Archinex Deliberation Workbench

> **Guide utilisateur à l'attention des Lead Architects, Architectes Experts, Spécialistes Métier et Responsables Conformité.**

---

## 1. Vue d'Ensemble du Workbench

Le **Workbench de Délibération Archinex** permet à une équipe d'ingénierie système et d'architecture de converger rapidement sur des dossiers complexes (CCTP, RFP, cahiers des charges) en éliminant les pertes de temps documentaires et les faux consensus.

L'interface est structurée autour de zones opérationnelles claires :
1. **En-tête supérieur global** : Présent sur toutes les pages de l'application, il regroupe la **pastille de connectivité LLMOps** (mode live ou local souverain, avec resynchronisation à la demande), le **menu d'aide méthodologique** (accès direct au guide « Comment décider ? »), ainsi que les sélecteurs de langue et de thème.
2. **En-tête de Projet & Sélecteur de Posture** : Dédié au cadrage opérationnel, il affiche les espaces de travail actifs (Blueprint, RFP, projets) et permet de basculer instantanément entre les 3 phases de travail (*Phase 1 : Appropriation*, *Phase 2 : Délibération*, *Phase 3 : Rendu*).
3. **Tableau de Maturité (Vue d'ensemble)** : Priorisation stricte par le nombre de sujets débloqués en aval et état d'avancement L0→L5.
4. **Workbench de Délibération (Un sujet = Une conversation)** : Disposition sur 3 colonnes :
   - À gauche : **Liste des Sujets**, navigation fluide de type messagerie/conversations.
   - Au centre : **Fil du Sujet**, fil dialectique structuré distinguant sans ambiguïté les agents IA (à gauche, bordure pointillée, badge IA) des humains (à droite, bulle pleine, rôle), avec objections ouvertes épinglées en tête.
   - À droite : **Dossier de Consultation (repliable)**, accès en lecture seule au brouillon télégraphique, à la matrice d'options multi-critères et aux références doctrinales.

---

## 2. Les Rôles et Leurs Habilitations

| Rôle | Périmètre Opérationnel | Habilitations Clés |
| :--- | :--- | :--- |
| **Lead Architect** | Arbitrage global & modération du dossier | - Tranchage des conflits ouverts (passage L3)<br>- Arbitrage humain (Porte G3) et capitalisation des décisions vers la base de connaissances (Porte G4)<br>- Scellement officiel SHA-256 de section pour homologation |
| **Architecte Expert Infra / Réseau** | Dimensionnement technique & faisabilité | - Saisie et rectification d'hypothèses matérielles<br>- Chiffrage des impacts financiers<br>- Traitement des questions ouvertes assignées |
| **Architecte Domaine Métier** | Couverture des besoins fonctionnels | - Évaluation des variantes divergentes (A vs B)<br>- Signalement des écarts d'exigences |
| **Architecte Sécurité & Conformité NIS2** | Résilience opérationnelle & auditabilité | - Validation de conformité aux doctrines ANSSI<br>- Examen des dépendances causales |

---

## 3. Guide Pas-à-Pas des 3 Postures Contextuelles

### 1.1 Initialisation Guidée d'un Espace de Travail (5 Étapes)
L'assistant de création d'espace (`/workspaces/new` ou modale du bandeau de projet) guide l'équipe à travers 5 étapes épurées :
1. **Cadrage & Description** : Saisie du titre du projet, type d'engagement (RFP, Blueprint, Audit NIS2, POC) et slug d'identification.
2. **Stratégie Globale, Principes & Référentiels** :
   - *Objectifs Stratégiques Macro* : Orientent la délibération et pondèrent les critères d'évaluation des variantes.
   - *Principes Directeurs d'Architecture* : Règles transverses opposables (ex: Zero-Trust, souveraineté).
   - *Contraintes Non Négociables (Lignes Rouges)* : Verrous stricts interdisant certaines solutions.
   - *Référentiels Réglementaires Applicables* : Déclaration des cadres opposables (NIS2, SecNumCloud, ISO 27001, etc.) dont les contrôles accompagneront chaque sujet.
3. **Documents Amonts** : Versement des pièces contractuelles (CCTP, RFP, spécifications métier) ou confrontation directe via le moteur de dépouillement.
4. **Participants & Équipe Habilitée** : Affectation des Lead Architects, Experts et Sachants Métier.
5. **Lancement & Scellement Initial** : Création de l'espace et transition vers la phase d'appropriation.

### Posture 1 : Appropriation & Cadrage Pédagogique
- **Quand l'activer ?** Lors de l'ingestion initiale d'un dossier, à l'arrivée d'un nouvel intervenant, ou lorsqu'un doute subsiste sur une contrainte normative.
- **Ce que vous voyez** : Les fiches de synthèse vulgarisées des standards régissant la section (ex: 3GPP Release 17 pour la radio 5G, Directive NIS2 pour la continuité d'activité, Uptime Institute pour les datacenters).
- **Action** : Prenez connaissance des exigences clés puis cliquez sur **« Passer en Délibération »** dès que le périmètre est clair.

### Posture 2 : Délibération & Cristallisation (Cœur Dialectique)
- **Explorer le Board de Maturité & Ouvrir un Sujet** :
  - Les sujets en haut du tableau sont ceux qui possèdent le plus fort effet multiplicateur (`Débloque`).
  - Un simple clic sur une ligne du tableau ouvre directement le **Fil de Délibération du sujet** dans le Workbench 3 colonnes sans changer d'écran.
  - **Mémorisation du sujet, du mode de vue et de la posture active (`localStorage`)** :
    - Le dernier sujet sélectionné, le mode d'affichage (`board` pour le Tableau de maturité / vue d'ensemble ou `conversation` pour le Fil de délibération) ainsi que la posture active (`appropriation`, `deliberation`, `rendu`) sont automatiquement mémorisés dans le stockage local du navigateur (clés scopées par projet : `archinex:activeSubjectId:<id>`, `archinex:deliberationViewMode:<id>`, `archinex:activePosture:<id>`).
    - Lors de toute navigation transversale ou rafraîchissement de page, votre position exacte de travail est fidèlement restaurée sans vous faire resauter sur le tableau global.
    - La synchronisation avec LLMOps en arrière-plan opère en mode silencieux (`silent: true`) : elle ne déclenche pas de toasts intempestifs lors du chargement de page et préserve scrupuleusement la vue courante. Les notifications visuelles restent réservées aux clics manuels de resynchronisation.
- **Workbench de Délibération (3 colonnes)** :
  - **Colonne de gauche (Liste des sujets)** : navigation instantanée entre toutes les conversations de sujets avec filtres rapides (Bloquants, À faire, Actés).
  - **Colonne centrale (Fil du sujet)** :
    - *Objections ouvertes épinglées* : restent en haut tant qu'elles ne sont pas résolues, avec actions formelles *Répondre*, *Accepter le risque* ou *Retirer* (habilitées selon `canCloseObjection`).
    - *Grammaire visuelle* : les agents IA sont alignés à gauche (bordure pointillée, badge `IA` `llm-derived`), les humains à droite (bulle pleine, avatar et rôle).
    - *Fondement* : lien dépliable « Pourquoi ? » révélant les bases factuelles de chaque affirmation.
    - *Doctrines* : puces de référence cliquables (§ règle) menant à la fiche dans `/knowledge`.
    - *Synthèse* : cartes pleine largeur posant les compromis de délibération.
  - **Colonne de droite (Dossier repliable)** :
    - Mode lecture seule regroupant le brouillon télégraphique, la matrice d'options multi-critères et le registre des doctrines mobilisées.
    - Se replie/déplie d'un clic pour laisser un espace de lecture maximal au fil de délibération.
- **Trancher un conflit d'architecture & Clore les objections** :
  - Le Lead Architect traite les objections ouvertes et tranche le passage à L3 après épuisement des contradictions.
- **Capitalisation (Porte G4)** :
  - Une fois le sujet arbitré, l'onglet « Arbitrage G3 & Capitalisation G4 » prépare des candidats anonymisés (décision, dérogations, retour d'expérience).
  - Vous les relisez, les modifiez au besoin, puis les transmettez au Knowledge Hub : rien n'est envoyé sans cette action explicite.

### Posture 3 : Rendu & Homologation
- **Vérifier la barrière de certification** :
  - Cliquez sur **« Sceller Section »**.
  - Le système contrôle automatiquement les 4 critères bloquants (Maturité $\ge$ L3, Zéro conflit, Zéro hypothèse non justifiée, Rôle Lead Architect).
- **Sceller et Exporter** :
  - Cliquez sur **« Sceller la Section (SHA-256) »**.
  - L'empreinte cryptographique unique est générée et scellée. Téléchargez le livrable officiel `sealed_snapshot.json`.
- **Régénérer les artefacts système** :
  - Consultez les projections instantanées dans le **Hub d'Artefacts** :
    - **Mermaid** pour l'affichage visuel en réunion.
    - **Structurizr DSL** pour l'intégration dans votre référentiel C4.
    - **SysML v2** pour l'ingénierie système formelle.
    - **Profil PTP JSON** pour le déploiement sur les équipements de transmission.
  - Cliquez sur **« Régénérer sans dérive (`sync-artifacts`) »** pour garantir 0% de divergence entre les décisions prouvées et les modèles générés.

---

## 4. Méthodologie d'Ingestion & Délibération (Méthodologie ArcKit)

### 4.0 Ingestion Épurée, Vérification sur Échantillon & Rapport d'Extraction (#50)
Avant de lancer l'audit ou la factorisation sémantique d'un RFP, Archinex propose une interface épurée et génère un **rapport d'extraction complet** pour permettre une relecture humaine sur échantillon :

- **Interface de saisie allégée** :
  - Accès direct aux trois modes réels d'ingestion : **Fichier Local** (PDF avec calque vectoriel, Markdown, Texte brut, JSON), **Coller le texte** ou **URL Web distante**.
  - Suppression des modèles pré-intégrés factices au profit d'un écran vierge, focalisé sur le document réel de l'opérateur.
  - Le rapport de contrôle et l'échantillon ne s'activent qu'une fois un document réel chargé ou collé, évitant la surcharge visuelle à l'ouverture de la boîte de dialogue.

- **Rapport d'extraction automatique** :
  - **Statistiques globales** : nombre d'exigences extraites, nombre de pages du document source, taux de couverture textuelle effective du document (`coverageRate`) avec seuil d'alerte si la couverture est inférieure à 60 %.
  - **Motifs de référence** : identification des préfixes récurrents (`REQ-Lot1-*`, `Art. *`, `Clause *`, etc.) et mise en évidence du motif dominant.
  - **Anomalies de découpage explicitement listées** :
    - *Trous dans la numérotation séquentielle* (ex: saut de `REQ-Lot1-12` à `REQ-Lot1-15`, indiquant les numéros manquants `13` et `14`).
    - *Références en double* (renvois ou tableaux récapitulatifs disambiguïsés avec suffixe `#2`).
    - *Références sans numéro* (ex: `REQ-Lot1-?`) ou *atypiques* ne suivant pas la convention dominante.
    - *Clauses anormalement courtes* (< 25 caractères) ou *volumineuses* (> 2 500 caractères, signalant une possible concaténation d'exigences sans séparateur).
    - *Pages sans clause* (sommaires, pages de garde, annexes non structurées).

- **Échantillon de vérification humaine côte à côte : Ce qu'il apporte** :
  - **Faisabilité cognitive (2 minutes vs 3 jours)** : Un CCTP compte souvent 300 à 1 500 exigences. Il est impossible pour un architecte de tout relire avant de lancer un dépouillement. L'échantillon (10 à 20 clauses) sélectionne en priorité absolue **100 % des clauses détectées avec anomalie**, complétées d'un échantillon représentatif de clauses nominales réparties sur le document.
  - **Garantie anti-hallucination & intégrité amont** : Le découpage PDF est le maillon le plus critique. Si un tableau à double colonne a fusionné deux exigences ou sauté une page, l'IA aval factorisera sur une base viciée (*garbage in, garbage out*).
  - **Traçabilité & Conformité AI Act / ISO 42001** : L'attestation de validation humaine (identité de l'opérateur, horodatage ISO, clauses examinées, anomalies acceptées) est persistée avec l'audit scellé.

- **Protocole Opérateur : Que faire en cas de problème ?** :
  1. *Clause mal découpée ou tronquée dans l'échantillon* : Cliquer sur **« Signaler »** (Flag) pour consigner le défaut dans la traçabilité. L'opérateur peut ensuite ajuster ou corriger la clause directement dans la zone de texte brut avant validation.
  2. *Échec d'extraction PDF (scan image, 0% de couverture, pages vides)* : Si le PDF ne contient pas de calque texte (document numérisé), appliquer un OCR préalable (ex: OCRmyPDF, Acrobat) ou basculer sur le mode **« Coller le texte »** ou un export Markdown / `.txt`.
  3. *Anomalie bénigne / Faux positif (ex: saut de numérotation normal dans le document client)* : Vérifier dans la colonne droite (calque source du PDF) que le numéro manquant n'existe effectivement pas dans le document. Cliquer sur **« Confirmer »** ou **« Valider tout l'échantillon »** : l'anomalie est enregistrée comme acceptée et ne bloque pas l'audit.
  4. *Lancement sans validation* : L'analyse reste possible même sans validation humaine préalable, mais le rapport final portera la mention explicite d'avertissement *« Validation humaine non effectuée »*.

- **Traçabilité & Persistance** :
  - L'attestation de validation humaine (identité de l'architecte, horodatage ISO, clauses examinées, anomalies acceptées) est persistée avec l'exécution de factorisation (`FactorizationRun`).
  - Toute analyse lancée sans validation préalable est marquée comme non vérifiée et affiche un bandeau d'avertissement dans la synthèse des résultats (`RfpFactorizationReview`).


### 4.1 Audit des exigences : le modèle propose, vous disposez
À l'import d'un RFP, le modèle de langage classe **chaque clause** dans l'un de quatre états. Ce sont des **propositions** : rien n'est décidé tant que vous ne les avez pas relues.

1. **`deliberated` (à délibérer)** : l'exigence engage un choix d'architecture avec de vraies alternatives, ou entre en tension avec une autre contrainte. Les clauses de cet état sont regroupées en sujets (niveau L0) avec une question, une hypothèse de départ et des questions pour le sachant métier.
2. **`evacuated` (évacuation proposée)** : exigence nominale couverte par des produits standard. Le motif est **obligatoire** et visible ; aucune clause n'est supprimée du registre.
3. **`clarification_needed` (à clarifier)** : exigence ambiguë ; le modèle formule une question précise pour le donneur d'ordre.
4. **`to_qualify` (à qualifier par vous)** : le pipeline n'a pas pu ou pas osé trancher.

**Garde-fous, appliqués par le code et non par le modèle :**
- Chaque clause reçoit exactement un état ; une clause oubliée par le modèle devient « à qualifier ».
- Une clause **bloquante** n'est jamais évacuée automatiquement : elle devient « à qualifier », avec la proposition du modèle jointe.
- Une évacuation sans motif exploitable, ou une clarification sans question, devient « à qualifier ».
- Si le modèle est injoignable, **tout** est « à qualifier » : le système ne déclare jamais « sans enjeu » faute de pouvoir analyser.
- Le taux de couverture affiché ne compte pas les clauses « à qualifier ».
- Une évacuation à tort se corrige en un clic (« Promouvoir en Sujet Archi »).

**Ce que l'import conserve.** À la confirmation, le texte de toutes les clauses, la proposition du modèle pour chacune (état, motif) et les sujets retenus avec leurs clauses sont enregistrés. Le dossier d'engagement scellé les reprend, en distinguant ce que le modèle propose de ce qu'une personne a décidé (voir `docs/jalon-j0.md`). Le **rapport d'audit** reste téléchargeable pour la relecture.

Si l'audit n'aboutit pas entièrement (lot en échec, regroupement impossible), l'ancien moteur de factorisation prend le relais et un avertissement l'indique ; aucun rapport partiel n'est affiché.

### 4.2 Typologie des Criticités & Critères Sous-Jacents
| Criticité | Signification | Critères & Déclencheurs NLP | Traitement dans Archinex |
| :--- | :--- | :--- | :--- |
| **Bloquant** (`bloquant`) | Exigence éliminatoire & non-négociable | Verbes modaux stricts RFC 2119 (*« DOIT OBLIGATOIREMENT »*, *« IMPÉRATIF »*, *« FORMELLEMENT INTERDIT »*, *« SHALL NOT »*) ou contraintes dures : **SecNumCloud, NIS2, 24×7, holdover GNSS 30j sub-microseconde, redondance géo**. | Effort porté à **L ou XL**, arbitrage formel obligatoire par le `lead_architect` ou `security_officer`. |
| **Majeur** (`majeur`) | Exigence normative standard | Verbes d'obligation standard (*« DOIT »*, *« MUST »*, *« SHALL »*, *« EXIGE »*, *« REQUIS »*). | Effort standard M, traitée en délibération collective. |
| **Info** (`info`) | Recommandation ou contexte | Formulations incitatives (*« DEVRAIT »*, *« SHOULD »*, *« MAY »*), descriptif d'exploitation. | Recommandations sans impact bloquant. |

### 4.3 Interaction sur les Questions & Maturation du Sujet
Dans le panneau de délibération, les questions métier (ArcKit) et de cascade (K20) disposent d'un bouton interactif **`[ 💬 Répondre / Éclairer ]`** offrant 3 modes de conversion :
* **`💡 Poser comme Hypothèse`** : Injecte la réponse dans `draft.suppose`, ce qui **satisfait immédiatement le critère de jalon L1 (« Hypothèse formulée »)**.
* **`📌 Acter comme Retenu`** : Consigne directement la réponse comme choix d'architecture arrêté (`draft.retenu`).
* **`💬 Débattre`** : Diffuse la réponse dans le fil de délibération pour confrontation entre pairs.

### 4.4 Modèle de Données & Génération de Livrables
L'information stockée dans Archinex (exigences sources `ExtractedClause`, sujets `MaturitySubject`, brouillons `TelegraphicDraft`, faits machine-readable `Statement`, décisions `Decision`) alimente directement les générateurs de livrables :
1. **Bundle d'Architecture Scellé (`EngagementBundle` v1.0 SHA-256)** : Export JSON canonique opposable pour audit et conformité.
2. **Fiches ADR (Architecture Decision Records)** : Synthèses standardisées reliant les exigences sources, le dilemme, les options écartées et le choix retenu.
3. **Matrice de Traçabilité des Exigences (RTM)** : Tableau 100% reliant chaque clause du RFP (y compris celles évacuées) à son traitement architectural.
4. **Dossier d'Architecture Générale & Technique (HLD / DLD)** : Compilation structurée des sections ayant franchi les jalons L3 et L4.
5. **Matrice de Conformité de Base (`ComplianceMatrix`)** : Tableau exhaustif reliant chaque exigence source à son statut de conformité standardisé, sa réserve éventuelle et sa décision d'arbitrage.

### 4.5 Matrice de Conformité & Arbitrage Réglementaire (Issue #118)
Pour chaque sujet d'architecture instruit, l'arbitre ou le Lead Architect formalise sa décision en qualifiant la posture de conformité :
- **`Compliant` (Conforme)** : L'architecture retenue répond intégralement à l'exigence ou au contrôle réglementaire.
- **`Partially compliant` (Partiellement conforme)** : Réponse partielle, réserve technique ou dispense accordée. **Une justification ou réserve explicite d'au moins 5 caractères est obligatoirement requise**.
- **`Non-compliant` (Non conforme / Écarté)** : Non-respect assumé ou arbitrage négatif. **Une justification explicite d'au moins 5 caractères est obligatoirement requise**.
- **`Provisional` (Provisoire)** : En attente de délibération, question ouverte bloquante ou conflit non arbitré.

**Accès & Exploitation :**
- Dans l'onglet **« Matrice de Conformité »** du Hub d'Artefacts : consultation directe de la synthèse exécutive (taux de conformité pondéré, décompte par statut) et du tableau opposable.
- Bouton **`Télécharger CSV`** : génération d'un export tableur conforme RFC 4180 avec BOM UTF-8 (compatible Excel et LibreOffice).
- Endpoint REST dédié : `GET /api/projects/{projectId}/compliance-matrix?format=markdown|csv|json`.

### 4.6 Indicateur de Santé des Clauses Réglementaires KB (Issue #119)
Pour garantir qu'aucun dossier ne s'appuie sur une doctrine réglementaire obsolète ou non éprouvée :
- Le bandeau **`KbClausesHealthBanner`** analyse en temps réel les clauses de vérification (`checks:`) associées aux contrôles KB actifs.
- Un **badge d'alerte orange** (`data-testid="kb-clauses-health-alert"`) s'affiche automatiquement dès lors qu'une exigence dans le périmètre possède des clauses en attente de test ou non publiées.
- L'indicateur est visible sur le tableau de bord d'accueil, la console KB (`/kb/dashboard`) et le panneau des référentiels applicables de chaque engagement.

### 4.7 Qualification de Portabilité des Décisions & Moissonnage LLMOps (Issue #120)
Lors de l'arbitrage humain d'un sujet (Porte G3), le Lead Architect qualifie expressément la portée de réemploi de chaque décision :
- **`Spécifique au contrat / projet` (`project_specific`)** : Arbitrage dicté par des contraintes locales ou contractuelles exclusives. **Cette décision est formellement exclue du moissonnage général (`harvestable: false`)** afin d'éviter toute pollution de la doctrine globale.
- **`Capacité produit réutilisable` (`reusable_product_capability`)** : Solution générique ou composant logiciel réemployable sur d'autres projets. Éligible au moissonnage (`harvestable: true`).
- **`Doctrine d'architecture transverse` (`reusable_architecture_doctrine`)** : Principe d'ingénierie ou règle de conception à intégrer dans la base doctrinale pérenne. Éligible au moissonnage (`harvestable: true`).

**Mécanismes de protection :**
- Le générateur de candidats de capitalisation (`buildKbCandidates`) bloque systématiquement les décisions à portée projet.
- La transmission vers le Hub LLMOps (`recordDecisionInHub`) enrichit l'enregistrement des attributs `portability` et `harvestable`.
- Un badge visuel spécifique matérialise la qualification de portabilité retenue dans la carte de décision.

### 4.8 Banc d'Évaluation & Pipeline ArcKit (Issue #121)
Pour évaluer objectivement la valeur ajoutée des capacités d'ingestion et d'élicitation sans interface graphique (Benchmark LUMICC) :
- L'adaptateur de banc de test en boîte noire `benchmarkRunner.ts` supporte le paramètre `pipeline: 'arckit'`.
- Il exécute le pipeline d'audit complet (`runRequirementsAudit`) : classification des clauses, application des invariants déterministes (repêchage automatique des exigences dures), évacuation des commodités hors du périmètre de délibération, et factorisation des clauses en sujets d'architecture ciblés (`BundleSubject`).
- L'option `--elicit` (ou `elicit: true`) active le moteur dialectique `elicitSubjectDetails` pour enrichir les sujets de critères pondérés et d'options multi-critères.
- L'outil en ligne de commande `scripts/benchmark-run.ts` expose les indicateurs de compression du bruit et de traitement des gaps dans son fichier d'artefact (`--summary-out`).

### 4.9 Export d'Architecture HLD & Projections C4/Mermaid du Bundle (Issue #122)
Lors de l'assemblage et du scellement de l'Engagement Bundle (`assembleEngagementBundle`), le modèle d'architecture est automatiquement projeté et structuré dans `data.architecture` :
- **Éléments & Relations canoniques** :
  - Les sujets de délibération, leurs options d'architecture et les faits techniques (`Statement`) sont traduits en composants (`system`, `component`, `datastore`, `network`, `interface`) et relations (`uses`, `depends_on`, `data_flow`, `deploys_to`, `protects`, `contains`).
  - Chaque élément ou relation conserve sa traçabilité complète vers les décisions d'arbitrage (`decision_ids`), son niveau d'affirmation (`asserted` ou `proposed`) et sa provenance.
- **Projections Multi-Formats Déterministes** :
  - Projections C4 / Mermaid (`flowchart TD`), Structurizr DSL (`workspace { ... }`) et SysML v2 (`package ...`).
  - Disponibles au niveau global dans `data.architecture.projections` et par sujet dans `data.subjects[i].projections` (ainsi que dans `data.architecture.projections.by_subject`).
  - Génération déterministe garantissant la stricte reproductibilité du sceau SHA-256 d'intégrité de l'engagement.
- **Vérification d'intégrité et de conformité** :
  - Le vérificateur opposable `verifyEngagementBundle` contrôle la validité des genres d'éléments, l'absence de circularité dans les frontières (`CIRCULAR_BOUNDARY`) et la résolution complète des identifiants cités dans les projections.



### 4.10 Dépouillement RFP en arrière-plan, reprise sur cache et notifications
Pour traiter les appels d'offres volumineux (plusieurs centaines ou milliers de clauses) sans contraindre l'architecte à attendre devant son écran ni perdre ses calculs en cas d'incident :
- **Suivi et notifications en tâche de fond** :
  - Le dépouillement s'exécute côté serveur via `factorizationJobs.ts`.
  - L'application met à jour le titre de l'onglet du navigateur (`⏳ Tri des exigences (X/Y) · Archinex`) et émet une notification Web système (`new Notification(...)`) dès que le résultat est prêt (`✅ (Prêt !)`).
  - Un système d'écoute en arrière-plan permet de naviguer partout dans l'application (tableaux de bord, délibération, relecture de doctrine) sans interrompre le suivi ni manquer la notification.
- **Résilience et détection de quota/crédits LLM (Fast-Fail)** :
  - Détection proactive des erreurs de solde (`isLlmCreditOrQuotaError`) chez les fournisseurs d'API (ex. Anthropic, OpenAI).
  - En cas d'épuisement de crédits, le moteur stoppe immédiatement les appels suivants au lieu d'accumuler les échecs, conserve les lots déjà validés en mémoire cache SQLite (`FactorizationStageCache`) et signale l'état reprenable.
- **Reprise instantanée sans surcoût** :
  - L'interface met en évidence un bouton **« Reprendre l'analyse »**.
  - La reprise relit instantanément les étapes déjà calculées depuis le cache local (quelques millisecondes) et ne sollicite le modèle LLM que pour les lots restants et les étapes de synthèse finale.
- **Partitionnement sécurisé (`PARTITION_MAX_CHARS: 250 000`)** :
  - Les exigences à délibérer sont découpées en tranches indépendantes de 250k caractères au plus lors de la cartographie (étape 3a), garantissant une consommation de jetons maîtrisée et une mise en cache par tranche.
