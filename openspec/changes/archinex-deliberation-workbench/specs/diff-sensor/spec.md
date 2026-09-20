# Spécification : Le Capteur par le Diff (`diff-sensor`)

## ADDED Requirements

### Requirement: Édition en Place du Brouillon Télégraphique
Le système SHALL permettre la modification directe en place du texte du brouillon-appât. L'interface propose un éditeur inline réactif permettant à l'architecte de corriger immédiatement une valeur, d'éliminer une variante ou d'ajouter une précision sans passer par un formulaire complexe de saisie.

### Requirement: Capture Automatique du Diff en Énoncé Attribué
Le système SHALL analyser en temps réel chaque modification textuelle effectuée par un architecte humain :
- Extraire la différence sémantique entre l'hypothèse affichée et la correction saisie.
- Générer automatiquement un objet `Statement` attribué :
  - `production_mode: human-authored`
  - Auteur et rôle issus de la session active de l'architecte.
  - Horodatage certifié.
  - Référence explicite à l'énoncé ou à l'hypothèse antérieure rectifiée (`based_on` / antécédent).

### Requirement: Règle Dure — Le Silence n'est Pas une Approbation
Le système SHALL respecter rigoureusement l'asymétrie de la capture épistémique :
- **Si l'architecte corrige en place** (« non, 15 j suffisent ») $\rightarrow$ Un énoncé attribué entre dans le graphe.
- **Si l'architecte conteste explicitement** (« la variante B est exclue car incompatible MCX ») $\rightarrow$ Un énoncé de contrainte ou d'arbitrage entre dans le graphe.
- **Si l'architecte ne réagit pas (Silence)** $\rightarrow$ **Absolument rien n'entre dans le graphe**. L'hypothèse reste non prouvée (`assumed`), le manque reste grand ouvert et le compteur de blocages ne diminue pas.

---

## Scenarios

#### Scenario: Saisie d'une correction manuscrite en un tour
- **GIVEN** le brouillon affichant `supposé holdover ≥ 30 j`
- **WHEN** l'architecte remplace le texte directement par `holdover ≥ 15 j` et valide
- **THEN** un nouvel énoncé `S-0043` est généré avec `predicate: holdover`, `value: 15 j`, `production_mode: human-authored`
- **AND** le diff est consigné, liant la rectification à l'ancienne hypothèse.

#### Scenario: Contestation d'une variante divergente
- **GIVEN** le brouillon proposant la `variante B : GNSS + NTP dégradé`
- **WHEN** l'architecte coche ou saisit « Variante B rejetée : indisponibilité temps réel inacceptable »
- **THEN** une décision d'exclusion est consignée dans le graphe
- **AND** la variante est retirée du brouillon régénéré.

#### Scenario: Silence de l'architecte ne validant aucune hypothèse
- **GIVEN** un brouillon généré comportant 3 hypothèses `assumed`
- **WHEN** l'architecte consulte l'écran, navigue vers une autre section ou ferme la session sans modifier le texte
- **THEN** aucune écriture n'a lieu dans la base de données
- **AND** le sujet reste au niveau `L1` ou `L2`, sans jamais être promu vers `L3_decided`.
