# User Guide — Archinex Deliberation Workbench

> **Guide utilisateur à l'attention des Lead Architects, Architectes Experts, Spécialistes Métier et Responsables Conformité.**

---

## 1. Vue d'Ensemble du Workbench

Le **Workbench de Délibération Archinex** permet à une équipe d'ingénierie système et d'architecture de converger rapidement sur des dossiers complexes (CCTP, RFP, cahiers des charges) en éliminant les pertes de temps documentaires et les faux consensus.

L'interface est structurée autour de 3 zones opérationnelles :
1. **En-tête & Sélecteur de Posture** : Détermine le mode de travail individuel de l'architecte (Appropriation, Délibération ou Rendu).
2. **Zone Principale Bilatérale** :
   - À gauche : **Board de Maturité** (priorisation stricte par le nombre de sujets débloqués en aval).
   - À droite : **Brouillon-Appât Télégraphique** (lignes concises, surcoûts chiffrés en k€, détection automatique de modifications textuelles).
3. **Zone Inférieure Dialectique** : Fil de discussion multi-canaux (interne et Discord) avec détection proactive des décisions antérieures (ADR) et inspecteur de dépendances.

---

## 2. Les Rôles et Leurs Habilitations

| Rôle | Périmètre Opérationnel | Habilitations Clés |
| :--- | :--- | :--- |
| **Lead Architect** | Arbitrage global & modération du dossier | - Tranchage des conflits ouverts (passage L3)<br>- Approbation des règles induites au Tour 8 (SPARQL)<br>- Scellement officiel SHA-256 de section pour homologation |
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
- **Explorer le Board de Maturité** :
  - Les sujets en haut du tableau sont ceux qui possèdent le plus fort effet multiplicateur (`Débloque`). Concentrez l'effort en priorité sur ces lignes.
  - Repérez les pastilles orange de **stagnation (> 14 jours)** nécessitant une relance.
- **Rectifier une hypothèse en place (Capteur par le Diff)** :
  - Sur le panneau de droite, cliquez sur le bouton **« Rectifier »** à côté d'une hypothèse chiffrée.
  - Modifiez directement la valeur (ex: remplacer `holdover ≥ 30 j` par `holdover ≥ 15 j`).
  - Cliquez sur **« Valider la rectification »** : un énoncé auditable `human-authored` est automatiquement consigné.
- **Trancher un conflit d'architecture** :
  - Si un conflit ouvert est signalé en rouge, le Lead Architect clique sur **« Trancher (L3) »** après confrontation des options.
  - La maturité passe instantanément à L3 et l'effet domino débloque les sections dépendantes.
- **Rejeter une variante divergente** :
  - Pour exclure une variante B non retenue, cliquez sur **« Rejeter cette variante »**, saisissez le motif d'exclusion opposable et validez.
- **Inspecteur « Pourquoi ? » & Rétractation Causale** :
  - En bas de chaque énoncé dans le panneau dialectique, cliquez sur **« Pourquoi ? »**.
  - L'inspecteur affiche les 5 facettes de l'énoncé, son chemin de justification et calcule son rayon d'impact (*blast radius*).
  - Cliquez sur **« Contester et Rétracter »** si l'hypothèse sous-jacente est compromise : le moteur DAG rétrograde automatiquement tous ses dépendants en cascade.
- **Validation Tour 8 SmartMemory** :
  - Dès qu'une récurrence de décision est détectée, le bandeau supérieur propose la règle candidate.
  - Le Lead Architect inspecte la requête SPARQL 1.1 et valide ou rejette l'inscription de la doctrine.

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
