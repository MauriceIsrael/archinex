### Correctif KPI « NaN » sur le tableau de bord de délibération (#392)
- **Normalisation unifiée serveur → store (`src/lib/domain/maturityBoard.ts`, `src/lib/server/engagementsDb.ts`, `src/lib/stores/deliberationStore.svelte.ts`)** :
  - Ajout du mapper typé `normalizeMaturitySubject` / `normalizeMaturitySubjects` et de `toSafeCount` pour convertir de façon homogène les sujets issus du serveur (clés camelCase Prisma `unlocksCount`/`blockingCount` ou objets JSON partiels) en `MaturitySubject` canoniques avec compteurs finis garantis.
  - Application systématique de la normalisation à la lecture DB (`mapPrismaToEngagementProfile`, `overlayServerSubjects`) et à la frontière du store (`initFromDb`, `switchEngagement`), ainsi que de valeurs par défaut sûres dans `totalUnlocks`, `totalBlocking`, `sortMaturityBoard`, `resolveSubjectArbitration` et `retractation.ts`.
- **Garde d'affichage & seed démo (`src/lib/components/deliberation/DeliberationDashboardKpis.svelte`, `scripts/seed-demo.ts`)** :
  - Garde `Number.isFinite` sur l'affichage des KPI `totalUnlocks` et `totalBlocking` pour prévenir tout affichage `NaN`.
  - Complétion des champs de maturité par défaut sur le sujet de démonstration dans `scripts/seed-demo.ts`.
- **Tests** :
  - Ajout de `tests/contract/deliberation-kpi-subject-normalization.test.ts` couvrant la normalisation camelCase/partielle, le calcul des agrégats du store et la garde d'affichage KPI.
