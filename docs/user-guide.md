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

### Posture 1 : Appropriation & Cadrage Pédagogique
- **Quand l'activer ?** Lors de l'ingestion initiale d'un dossier, à l'arrivée d'un nouvel intervenant, ou lorsqu'un doute subsiste sur une contrainte normative.
- **Ce que vous voyez** : Les fiches de synthèse vulgarisées des standards régissant la section (ex: 3GPP Release 17 pour la radio 5G, Directive NIS2 pour la continuité d'activité, Uptime Institute pour les datacenters).
- **Action** : Prenez connaissance des exigences clés puis cliquez sur **« Passer en Délibération »** dès que le périmètre est clair.

### Posture 2 : Délibération & Cristallisation (Cœur Dialectique)
- **Explorer le Board de Maturité & Ouvrir un Sujet** :
  - Les sujets en haut du tableau sont ceux qui possèdent le plus fort effet multiplicateur (`Débloque`).
  - Un simple clic sur une ligne du tableau ouvre directement le **Fil de Délibération du sujet** dans le Workbench 3 colonnes sans changer d'écran.
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

