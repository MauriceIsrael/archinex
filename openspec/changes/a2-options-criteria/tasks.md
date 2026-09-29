# Tâches du Lot A2 — Critères, options, compromis, décision (Porte G2 - Partie 2)

- [x] **1. Modèle de Domaine & Fonctions Pures**
  - [x] 1.1 Créer `src/lib/domain/options.ts` avec les interfaces (`Criterion`, `Option`, `OptionEvaluation`, `TradeOff`, `Decision`), `weightedScore`, `validateEvaluation` et `convertVarianteBToOption`.
  - [x] 1.2 Écrire les tests de contrat de domaine dans `tests/contract/options-evaluations.test.ts`.

- [x] **2. Schéma Prisma & Persistance Serveur**
  - [x] 2.1 Enrichir `prisma/schema.prisma` avec les modèles `Criterion`, `Option`, `OptionEvaluation`, `TradeOff`, `Decision`.
  - [x] 2.2 Exécuter `npx prisma db push` et `npx prisma generate`.
  - [x] 2.3 Créer `src/lib/server/projects/optionsDb.ts` (CRUD normalisé avec `version Int`, contrôle de concurrence `expectedVersion` et enregistrement des événements `DomainEvent`).

- [x] **3. Routes API REST Multi-Options**
  - [x] 3.1 Définir les schémas Zod dans `src/lib/schemas/optionsApiSchemas.ts`.
  - [x] 3.2 Créer les routes sous `src/routes/api/projects/[projectId]/subjects/[subjectId]/...` :
    - `criteria/+server.ts` & `criteria/[criterionId]/+server.ts`
    - `options/+server.ts` & `options/[optionId]/+server.ts`
    - `evaluations/+server.ts`
    - `tradeoffs/+server.ts`
    - `decision/+server.ts`

- [x] **4. Enrichissement de l'Élicitation & Compatibilité**
  - [x] 4.1 Mettre à jour `src/lib/domain/subjectElicitor.ts` pour générer au moins 3 critères et 3 options tout en maintenant la rétrocompatibilité `variante_b`.
  - [x] 4.2 Mettre à jour les tests d'élicitation (`tests/contract/subject-elicitor.test.ts`).

- [x] **5. Composants IHM & Matrice Décisionnelle**
  - [x] 5.1 Créer `src/lib/components/deliberation/OptionsMatrix.svelte` (critères en lignes, options en colonnes, score pondéré indicatif, badges `productionMode`).
  - [x] 5.2 Créer `src/lib/components/deliberation/CriteriaEditor.svelte`, `OptionEditor.svelte`, `TradeOffList.svelte`.
  - [x] 5.3 Intégrer la matrice d'options dans `src/lib/components/deliberation/TelegraphicDraftView.svelte`.

- [x] **6. Tests & Validation Globale**
  - [x] 6.1 Créer `tests/integration/options-matrix.test.ts` (persistance, transactions, scoring, rejet sans justification).
  - [x] 6.2 Valider la porte `npm run verify` (denylist, vitest, svelte-check, build).
