# Guide de Démonstration : LUMICC Lot 1 (Lulu) & ArcKit

Ce guide présente la démarche et le scénario complet pour animer une démonstration d'**Archinex** couplé à **LLMOps (Le Hub)** auprès d'un collège d'architectes d'entreprise et d'architectes de solutions critiques.

Il s'appuie sur le cas réel d'appel d'offres **LUMICC · Lot 1 (NOC, Cœur 5G PPDR & Résilience)** pré-chargé dans la base sans nécessiter de clé API externe pour la session.

---

## 1. Préparation & Pré-chargement de l'Environnement

L'environnement de démo est conçu pour être prêt instantanément après un simple clonage et initialisation de la base :

```bash
# Dans le dépôt archinex
npx prisma db push --skip-generate
npx prisma db seed
npm run dev
```

### Ce qui est pré-chargé par le seed :
1. **Engagement `lumicc-lot1-noc`** :
   - Titre : *LUMICC · Lot 1 (NOC, Cœur 5G PPDR & Résilience)*.
   - Profil : Secteur Réseau Critique / Sécurité Publique (PPDR), 4 membres d'équipe (`lead-architect`, `infra-architect`, `sec-architect`, `domain-architect`).
   - 7 sujets cardinaux formalisés avec options et critères MCDA.
   - Énoncés épistémiques avec graphe de causalité (`basedOn`) prêt pour la démo de rétractation.
   - Fil dialectique reconstitué avec échanges d'experts contradictoires.
2. **Audit ArcKit RFP `run_lumicc_live_j0`** :
   - Analyse de 92 clauses du RFP LUMICC Lot 1.
   - Statut : **Terminé (Complété)**.
   - Les 4 compartiments de triage sont déjà calculés : 77 à délibérer, 6 évacuées, 9 clarifications.
   - Aucune clé d'API Anthropic n'est sollicitée lors de la démo pour consulter l'audit, naviguer dans le découpage ou inspecter les justifications.

---

## 2. Principes ArcKit Démontrés

### A. Le Triage Délibératif en 4 Compartiments
ArcKit refuse l'injection brute de centaines d'exigences dans un LLM. Il sépare mécaniquement le bruit contractuel des véritables choix de conception :
1. **À Délibérer (`deliberate`)** : Exigences porteuses d'arbitrage structurant (ex: redondance 3 DC vs 2 DC, synchronisation GNSS 30 jours, chiffrement eSIM 4-yeux).
2. **Évacuées (`evacuate`)** : Clauses standardisées, commodités ou purement contractuelles (ex: conformité RoHS/WEEE, reporting financier mensuel, formats PDF des livrables) qui ne nécessitent aucun compromis d'ingénierie.
3. **Clarifications (`clarify`)** : Ambiguïtés textuelles, contradictions ou lacunes dans le RFP nécessitant une Question/Réponse au client avant de trancher.
4. **Transversales (`transversal`)** : Exigences de gouvernance globale s'appliquant à tous les sous-systèmes (ex: RGPD, journalisation centralisée mTLS).

### B. La Factorisation N $\to$ K
Plutôt que de traiter 92 exigences de façon isolée (ce qui conduit à des choix incohérents et contradictoires), ArcKit factorise les 92 clauses en **7 sujets d'architecture systémiques** :
- `SUBJ-01` : Topologie Cœur & NOC en 3 Datacenters (POST Luxembourg, Bettembourg, Roost).
- `SUBJ-02` : Raccordement Wi-Fi VoWiFi/PPDR sans composant N3IWF non certifié.
- `SUBJ-03` : Synchronisation PTP et autonomie Holdover GNSS 30 jours.
- `SUBJ-04` : Plateforme de Médiation EMS FCAPS unifiée vs silos constructeurs.
- `SUBJ-05` : Provisioning eSIM OTA multi-profils avec contrôle 4-yeux.
- `SUBJ-06` : Démarcation MNO / Core 5G dédié EUCCS.
- `SUBJ-07` : Frontière d'interopérabilité FRMCS (Train-to-Ground).

### C. Le Premier Questionnement & Élicitation MCDA
Pour chaque sujet identifié, ArcKit ne génère pas une solution unique "hallucinée", mais génère l'espace de délibération de l'architecte :
- **Options en concurrence** (ex: Option A *Cluster Actif/Actif 3 sites* vs Option B *Actif/Passif 2 sites + PRA froid*).
- **Critères d'évaluation pondérés** : Disponibilité ($\ge 99,999\%$), RTO ($< 5\text{s}$), CAPEX/OPEX, Risque d'interopérabilité multi-constructeurs.
- **Dilemmes opérationnels** : Tensions explicites mises en avant pour forcer l'architecte à argumenter.

---

## 3. Comprendre le Faux Négatif du Jalon J0 (`REQ-Lot1-216`)

Lors de l'évaluation rigoureuse en boîte noire du Jalon J0 contre la vérité terrain certifiée par le juge indépendant, un désaccord a été détecté :
- **Clause** : `REQ-Lot1-216 Automated Incident creation (C) 50` (*"The NOC solution shall provide the functionality of automatic Incident ticket creation/update in the ITSM platform upon alarm correlation..."*).
- **Sortie initiale Claude Sonnet 3.5** : Classée en `evacuate` (considérée comme un simple interfaçage API ITSM/Jira standard).
- **Vérité Terrain Expert** : Classée en point dur d'architecture (`deliberate` / `HP-03-AUTOMATION-SMO`).
  - *Pourquoi ?* Sur un réseau 5G critique de sécurité civile (PPDR), l'automatisation en boucle fermée de création d'incidents présente un risque vital d'avalanche de tickets paralysant les équipes de garde lors d'une tempête réseau, et engage la responsabilité juridique sur les SLAs de disponibilité.
- **Résolution dans Archinex** :
  1. *Prompting renforcé* : Injonction explicite ordonnant de classer toute clause touchant à l'auto-remédiation, la boucle fermée ou l'action autonome en `deliberate`.
  2. *Invariant déterministe* ([`automationMarkers.ts`](file:///c:/Users/Momo/Documents/Dev/archinex/src/lib/server/arckit/automationMarkers.ts)) : Un filtre de règles formelles intercepte toute clause contenant des marqueurs d'automatisation critique et refuse catégoriquement son évacuation.

---

## 4. Les Projections Déterministes d'Artefacts (Zéro Dérive)

Archinex applique le principe de **génération sans LLM** pour les livrables d'ingénierie :
Une fois les décisions arrêtées et scellées dans l'engagement (empreinte SHA-256), les artefacts techniques sont projetés de façon 100 % déterministe par [`artifactProjections.ts`](file:///c:/Users/Momo/Documents/Dev/archinex/src/lib/server/export/artifactProjections.ts) :

1. **Diagramme Mermaid C4** : Conteneurs et flux réseau réels déduits des énoncés retenus.
2. **Structurizr DSL** : Modèle formel importable dans les outils de modélisation d'entreprise.
3. **SysML v2** : Définition des blocs système, contraintes d'autonomie et ports de synchronisation.
4. **Profil PTP ITU-T G.8275.1 (JSON)** : Configuration technique des horloges maîtresses télécom.
5. **Matrice de Conformité Excel** : Traçabilité clause par clause avec statut d'audit et décision associée.

---

## 5. Déroulé de la Démonstration (Les 3 Actes)

### Acte 1 : Confrontation RFP & Facteur d'Échelle (ArcKit Triage)
- **Objectif** : Montrer comment passer d'un cahier des charges massif et anxiogène de 92 clauses à une cartographie claire en 2 minutes.
- **Écran** : Naviguer sur `http://localhost:5173/projects/lumicc-lot1-noc/audit`.
- **Ce qu'on montre** :
  - La vue synthétique : 92 clauses ingérées, 77 délibérées, 6 évacuées, 9 clarifications.
  - L'inspection d'une clause évacuée (justification : pure clause de conformité légale).
  - L'inspection de `REQ-Lot1-216` : mise en évidence du tag d'automatisation critique forcé en délibération.
  - La matrice de factorisation : comment les 92 clauses sont distillées dans les 7 sujets d'architecture.

### Acte 2 : Maturation Dialectique & Résolution du Dilemme
- **Objectif** : Montrer que l'architecture n'est pas un prompt à LLM, mais une délibération d'équipe outillée.
- **Écran** : Naviguer sur `http://localhost:5173/projects/lumicc-lot1-noc/subjects/SUBJ-03` (Synchronisation GNSS & Holdover).
- **Ce qu'on montre** :
  - La matrice multicritère (MCDA) : Option A (Holdover Rubidium local 30 jours) vs Option B (Sync PTP WAN inter-sites).
  - Le fil dialectique d'échanges entre l'architecte Infrastructure et l'architecte Sécurité.
  - La formulation des énoncés épistémiques avec leurs statuts (`retenu`, `suppose`, `conflit`).
  - **L'effet Wow (Rétractation en cascade)** : Passer l'énoncé sur la disponibilité de la fibre inter-DC en statut `réfuté` et observer Archinex marquer immédiatement les énoncés dépendants en alerte de caducité.

### Acte 3 : Projection Déterministe & Alignement Zéro-Dérive
- **Objectif** : Répondre à l'angoisse des architectes : *"Est-ce que votre outil génère des documents incohérents avec la réalité ?"*.
- **Écran** : Naviguer sur `http://localhost:5173/projects/lumicc-lot1-noc/artifacts`.
- **Ce qu'on montre** :
  - Le panneau **Artifact Hub** avec les 5 formats disponibles.
  - L'affichage interactif du diagramme Mermaid C4 (topologie 3 DC POST, liens PTP, mTLS).
  - Le téléchargement du fichier Structurizr DSL et du JSON ITU-T G.8275.1.
  - L'explication clé : *"Ces fichiers n'ont pas été rédigés par un modèle de langage avec risque d'hallucination. Ils sont projetés directement depuis l'arbre de décisions validé par votre équipe."*
