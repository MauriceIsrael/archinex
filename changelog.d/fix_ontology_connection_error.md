### Corrigé
- **Diagnostic `OntologyClient` (`src/lib/server/edp/ontologyClient.ts`)** : inclut désormais `err.message` dans le log de repli lorsqu'un service distant répond en erreur sur le port `8000`.
- **Test `sylva-digital-twin.test.ts`** : normalisation `\r\n` → `\n` pour la compatibilité Windows.
