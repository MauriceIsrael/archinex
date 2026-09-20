# Spécification : Le Board de Maturité (`maturity-board`)

## ADDED Requirements

### Requirement: Table Principale d'Allocation d'Effort (6 Colonnes)
Le système SHALL présenter l'avancement architectural sur un tableau de bord à 6 colonnes normalisées :
1. `§ Sujet` : Référence de section et nom du sujet d'architecture.
2. `Niveau` : Jalon de maturité actuel (`L0_named`, `L1_framed`, `L2_decomposed`, `L3_decided`, `L4_specified`).
3. `Bloquants` : Nombre de questions ou de conflits empêchant le sujet de monter de niveau (`blocking_count`).
4. `Débloque` : Nombre d'autres sujets du blueprint dont la progression dépend de la résolution de ce sujet (`unlocks_count`).
5. `En attente de` : Rôle ou entité devant fournir la réponse (ex: `Lead Architect`, `Network Architect`, `Client`, `Achats`).
6. `Effort` : Estimation de l'effort relatif nécessaire pour clore le niveau.

### Requirement: Tri Prioritaire par les Déblocages (`unlocks_count`)
Le système SHALL appliquer par défaut un tri décroissant sur la colonne **« Débloque » (`unlocks_count`)**. La ligne mise en évidence n'est pas celle qui cumule le plus de manques cosmétiques, mais celle dont la résolution libère le plus grand nombre d'autres sujets dans le blueprint d'architecture.

### Requirement: Détection et Signalement de la Stagnation (`stall_days`)
Le système SHALL calculer le nombre de jours consécutifs passés par chaque sujet à son niveau actuel (`stall_days`). Tout sujet bloqué à un niveau inférieur à L3 depuis plus d'un seuil paramétré (par défaut 14 jours) doit être visuellement marqué comme **stagnant** (`is_stalled: true`) avec mise en exergue dans l'interface.

### Requirement: File des Questions Sortantes & Relance en 1 Clic
Le système SHALL regrouper l'ensemble des questions ouvertes (`open_questions`) par destinataire (rôle formel). L'interface offre un bouton d'action directe permettant de notifier et relancer en un clic le destinataire responsable du blocage.

### Requirement: Couplage Dynamique Board $\leftrightarrow$ Panneau Brouillon
Le système SHALL actualiser instantanément le panneau latéral de prévisualisation dès qu'une ligne du Board est sélectionnée, afin d'afficher le brouillon-appât télégraphique correspondant à cette section.

### Requirement: Matérialisation Visuelle du Franchissement des Gaps & Effet d'Entraînement
Le système SHALL fournir un retour visuel direct et dynamique lors de chaque avancée décisionnelle :
1. **Franchissement des Paliers** : Dès qu'une décision ou une preuve est enregistrée, la bascule de palier (`L0_named` $\rightarrow$ `L1` $\rightarrow$ `L2` $\rightarrow$ `L3_decided`) est visuellement animée et mise en valeur par un changement d'état d'avancement.
2. **Résorption des Gaps d'Architecture** : Visualisation de l'extinction des gaps formels (lacunes de conformité G4, compétences non pourvues G5, contradictions non arbitrées G3).
3. **Effet d'Entraînement (Unlocks en chaîne)** : Lorsqu'un sujet clé est débloqué, les sujets dépendants dont le compteur de bloquants chute sont temporairement surlignés, rendant immédiatement palpable le bénéfice systémique de l'arbitrage pour toute l'équipe.

---

## Scenarios

#### Scenario: Priorisation d'un sujet à fort déblocage
- **GIVEN** le sujet `Résilience datacenter` (L0, 3 bloquants, débloque 4 autres sujets)
- **AND** le sujet `Terminaux PPDR` (L2, 8 bloquants, débloque 0 sujet)
- **WHEN** l'architecte ouvre le Board de maturité
- **THEN** `Résilience datacenter` apparaît en tête de liste avant `Terminaux PPDR`
- **AND** l'interface guide l'effort d'élicitation là où il a le plus grand effet multiplicateur.

#### Scenario: Matérialisation du franchissement d'un gap et déblocage en cascade
- **GIVEN** le sujet `Synchronisation` bloquant 3 autres sujets
- **WHEN** le Lead Architect arbitre le conflit avec `ADR-0012` et valide l'énoncé de holdover
- **THEN** le sujet `Synchronisation` franchit le palier `L3_decided`
- **AND** le Dashboard affiche l'extinction du conflit
- **AND** les 3 sujets dépendants voient leur compteur de bloquants diminuer immédiatement avec une mise en évidence visuelle de déblocage.

#### Scenario: Alerte sur sujet stagnant
- **GIVEN** le sujet `Architecture de service` resté à `L0_named` depuis 21 jours
- **WHEN** le Board est affiché
- **THEN** une pastille d'alerte `Stagnation (21 jours)` s'affiche sur la ligne
- **AND** le responsable `En attente de` est clairement identifié pour relance.

#### Scenario: Relance en un clic d'un expert
- **GIVEN** la question `Q-0007` en attente de l'expert `Network Architect`
- **WHEN** le Lead Architect clique sur le bouton « Relancer » de la ligne correspondante
- **THEN** une notification est envoyée au canal de l'expert avec la référence exacte du sujet et la question ciblée.
