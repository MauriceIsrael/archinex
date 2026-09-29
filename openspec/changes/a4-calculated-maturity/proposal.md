# Proposition de Changement — Lot A4 : Maturité Calculée & Arbitrage Humain (Porte G3)

## 1. Contexte & Problème
Jusqu'à présent, le passage d'un niveau de maturité à un autre pouvait être manuel ou subjectif. Or, selon la doctrine Archinex et le plan de co-conception, un sujet d'architecture ne doit être arbitrable que lorsqu'il a atteint un niveau de maturité objectivé et mesurable :
1. Les critères sont posés et pondérés (au moins 2 critères).
2. Au moins 2 options ont été formulées et évaluées sur chacun de ces critères avec justification.
3. Toutes les objections du débat contradictoire ont reçu une réponse explicite (`answered`) ou une acceptation de risque motivée (`accepted_risk`) par un expert humain.
4. Aucun avertissement ou violation doctrinale n'est ignoré sans dispense explicite (`acceptedViolations`).
5. Aucune question bloquante n'est laissée en suspens.
6. La couverture des référentiels réglementaires prescrits pour le projet est complète (`covered`).

Enfin, seul un humain habilité (expert du domaine ou lead architect) peut prononcer l'arbitrage opposable, scellant le passage à `L3_decided`.

## 2. Solution Proposée
1. **Règles de maturité pures (`src/lib/domain/maturityRules.ts`)** :
   - Fonction pure `computeMaturity(input)` retournant le niveau calculé (`L0_named`, `L1_framed`, `L2_decomposed`, `L3_decided`), un booléen `readyForArbitration`, et une liste structurée de `blockers`.
   - Codes de blocage normalisés : `MISSING_CRITERIA`, `UNEVALUATED_OPTION`, `OPEN_OBJECTION`, `UNRESOLVED_VIOLATION`, `OPEN_BLOCKING_QUESTION`, `COVERAGE_INCOMPLETE`.
2. **Couverture Réglementaire (`ProjectFramework`)** :
   - Modèle Prisma `ProjectFramework` persistant les référentiels applicables et leur statut de couverture (`covered`, `partial`, `missing`, `unknown`).
   - Intégration avec `doctrineService.getFrameworkCoverage()`.
3. **Porte d'Arbitrage et Persistance de la Décision** :
   - Route `POST /api/projects/[id]/subjects/[sid]/decision` rejetant systématiquement les requêtes non mûres avec HTTP 422 et le détail des blocages.
   - Contrôle d'autorisation RBAC/Casbin garantissant que seuls les experts du domaine du sujet ou le Lead Architect peuvent arbitrer.
   - Enregistrement de la décision avec motifs d'éviction, réversibilité, violations acceptées et passage automatique à `L3_decided`.
4. **Interface Utilisateur** :
   - `ArbitrationPanel.svelte` : tableau de bord d'arbitrage récapitulant critères, options, verdicts, objections, blocages éventuels, et formulaire d'arbitrage sécurisé.
   - `MaturityBoardTable.svelte` : affichage du niveau calculé et indicateur de blocages.
