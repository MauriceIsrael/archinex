### Fragments de Changelog (`changelog.d/`) & Pré-vol CI (`verify` / `hub-live`)
- **Suppression des conflits sur `CHANGELOG.md` (`changelog.d/`, `scripts/consolidate-changelog.mjs`, `.github/workflows/changelog-consolidate.yml`)** :
  - Remplacement de l'édition directe de `CHANGELOG.md` dans les PRs par des fragments isolés `changelog.d/<slug>.md`, validés par `npm run changelog:check` (intégré à `scripts/verify.mjs`) et consolidés automatiquement sous `## Non publié` lors du push sur `main`.
- **Court-circuit CI pour changements Markdown/Documentation (`scripts/ci-preflight.mjs`, `.github/workflows/verify.yml`, `.github/workflows/hub-live.yml`)** :
  - Ajout d'un pré-vol calculant l'empreinte Git de l'arbre hors documentation/changelog (`computeCodeTreeSignature`) et vérifiant le diff contre `main` ainsi que le marqueur de réussite en cache (`actions/cache`) pour éviter de relancer les ~4-5 min de tests/build quand seul du Markdown ou du changelog change.
- **Pratiques & Conventions (`.github/pull_request_template.md`, `.gitignore`, `docs/developer-guide.md`, `docs/testing.md`)** :
  - Mise à jour du template de PR, de la documentation développeur/tests et ajout de `.worktrees/` et `.ci-pass-marker` dans `.gitignore`.
- **Tests** :
  - Ajout de `tests/contract/changelog-consolidate.test.ts` et `tests/contract/ci-preflight.test.ts`.
