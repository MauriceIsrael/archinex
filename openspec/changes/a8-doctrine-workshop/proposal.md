# Proposition A8 — Atelier de Doctrine : Création, Amendement et Simulation de Clauses Testables

## 1. Contexte & Problématique
Dans l'architecture du Knowledge Hub, la doctrine d'entreprise ne doit pas être rédigée de manière informelle ou ambiguë. Pour être opérationnelle et vérifiable automatiquement, chaque clause doit respecter des formats d'actifs stricts (`principle`, `pattern`, `decision`, `control`, `glossary`) et comporter des prédicats testables formels (`when`, `expect`, `requires`, `forbids`).

Aujourd'hui, les experts ne disposent pas d'un atelier interactif permettant :
1. De charger un gabarit officiel préconfiguré avec squelette de rédaction.
2. De valider à blanc en temps réel la conformité de leur saisie (validité du schéma, testabilité, clarté).
3. De simuler l'impact de la nouvelle clause sur les options existantes ou sur un banc d'évaluation (calcul du différentiel de précision et alerte sur les régressions de rappel).
4. De soumettre la clause rédigée directement dans le circuit de revue collégiale (Lot A7).

## 2. Solution Proposée
1. **Templates d'Actifs (`GET /api/knowledge/templates/{asset_type}`)** :
   - Fournit les schémas et squelettes pour : `principle`, `pattern`, `decision`, `control`, `glossary`, `rule`, `amendment`.
2. **Validation à Blanc en Temps Réel (`POST /api/knowledge/candidates/validate`)** :
   - Vérifie la syntaxe, la conformité souveraine, l'absence de duplicata et calcule un score prévisionnel de testabilité.
3. **Éditeur de Clauses Testables & Prédicats Structurés** :
   - Interface intuitive pour définir :
     - `when` : Condition d'activation / contexte architectural déclencheur.
     - `expect` : Règle formelle attendue / assertion vérifiable.
     - `requires` : Prérequis technologiques ou organisationnels.
     - `forbids` : Anti-patrons proscrits ou incompatibilités.
4. **Moteur de Simulation en Ligne (`POST /api/knowledge/checks/simulate`)** :
   - Exécute la clause proposée contre des options de test ou des cas d'évaluation.
   - Restitue :
     - Verdicts d'évaluation (`supports`, `violates`, `unassessed`).
     - Taux de précision estimé et indicateur de rappel.
     - Alerte de régression : bandeau d'avertissement en cas de régression du rappel ou d'introduction de faux positifs.
5. **Atelier d'Édition Dédié (`/kb/workshop`)** :
   - Sélecteur de modèle et assistant de rédaction pas-à-pas.
   - Simulation interactive immédiate.
   - Soumission sécurisée avec propagation de l'identité expert `X-Actor-Email`.
