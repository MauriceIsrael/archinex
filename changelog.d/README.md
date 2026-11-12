# Fragments de Changelog (`changelog.d/`)

Ce répertoire évite les conflits de fusion sur `CHANGELOG.md` lorsque plusieurs Pull Requests évoluent en parallèle.

## Règle pour les Pull Requests

- **Ne modifiez pas `CHANGELOG.md` directement** dans une PR de fonctionnalité ou de correctif.
- Créez un fichier **`changelog.d/<nom-de-branche>.md`** (par exemple `changelog.d/feat-mon-sujet.md`) contenant votre entrée formatée comme dans `CHANGELOG.md` :

```markdown
### Titre clair de l'évolution ou du correctif
- **Composant / Périmètre (`chemin/du/fichier.ts`)** :
  - Description concise de ce qui change.
- **Tests & Documentation** :
  - Ajout de `tests/contract/...` et mise à jour de `USER_GUIDE.md`.
```

## Consolidation automatique

1. En PR, `npm run verify` (via `npm run changelog:check`) vérifie que les fragments présents dans `changelog.d/` sont valides et non vides.
2. Lors de la fusion sur `main`, le workflow GitHub Actions [`.github/workflows/changelog-consolidate.yml`](../.github/workflows/changelog-consolidate.yml) exécute `node scripts/consolidate-changelog.mjs` :
   - insère chaque fragment sous `## Non publié` dans `CHANGELOG.md` ;
   - supprime les fichiers de fragments consolidés ;
   - pousse le commit `[skip ci]` sur `main`.
