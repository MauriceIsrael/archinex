# Tâches du Lot A4 — Maturité Calculée & Arbitrage Humain (Porte G3)

- [x] **1. Règles de Domaine & Calcul de Maturité**
  - [x] 1.1 Créer `src/lib/domain/maturityRules.ts` avec la fonction pure `computeMaturity(input)`.
  - [x] 1.2 Adapter `canTransitionMaturity` dans `src/lib/domain/maturityBoard.ts` pour s'appuyer sur la maturité calculée.
  - [x] 1.3 Écrire les tests unitaires / de contrat dans `tests/contract/maturity-rules.test.ts` (test pour chaque code de blocage).

- [x] **2. Modèle Prisma & Couverture Réglementaire**
  - [x] 2.1 Mettre à jour `prisma/schema.prisma` avec `ProjectFramework` et le modèle `Decision`.
  - [x] 2.2 Exécuter `npx prisma db push` et `npx prisma generate`.
  - [x] 2.3 Créer le service de couverture réglementaire `src/lib/server/projects/frameworksDb.ts` (appel à `doctrineService.getFrameworkCoverage`).

- [x] **3. Service d'Arbitrage & Contrôle d'Accès**
  - [x] 3.1 Créer `src/lib/server/projects/arbitrationDb.ts` (validation `readyForArbitration`, persistance `Decision`, promotion épistémique des énoncés, événement de domaine).
  - [x] 3.2 Implémenter la vérification des droits Casbin / domaine (`canArbitrateSubject`).
  - [x] 3.3 Créer la route d'API `POST /api/projects/[projectId]/subjects/[subjectId]/decision` (rejet 422 si non mûr, 403 si non habilité).

- [x] **4. Composants IHM**
  - [x] 4.1 Créer `src/lib/components/deliberation/ArbitrationPanel.svelte` (récapitulatif des options, verdicts, objections, blocages, formulaire de décision).
  - [x] 4.2 Mettre à jour `src/lib/components/deliberation/MaturityBoardTable.svelte` pour afficher le niveau calculé et les blocages.
  - [x] 4.3 Intégrer `ArbitrationPanel` dans la vue du sujet (`TelegraphicDraftView.svelte` onglet 4).

- [x] **5. Tests d'Intégration & Validation de Porte G3**
  - [x] 5.1 Créer `tests/integration/arbitration-gate.test.ts` (vérification du rejet 422 si incomplet, 403 si mauvais domaine, 200 et passage à L3 si complet).
  - [x] 5.2 Valider l'ensemble des 4 portes avec `npm run verify`.
