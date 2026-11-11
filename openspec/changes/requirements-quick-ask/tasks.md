# Tâches d'Implémentation : Quick-Ask Exigences (`requirements-quick-ask`)

## Palier 1 : Domaine, Sérialisation Canonique & Prompt Caching
- [x] 1. Étendre le client LLM pour le cache de préfixe partagé
  - [x] 1.1 Ajouter le support optionnel de blocs système cacheables (`cacheable?: boolean` / `cache_control: { type: 'ephemeral' }`) dans `src/lib/server/llm/types.ts` et `src/lib/server/llm/localLlmClient.ts` (Anthropic)
  - [x] 1.2 Ajouter un test unitaire dans `tests/` vérifiant que le payload Anthropic émet `cache_control` sur le préfixe système lorsqu'activé et reste rétrocompatible sinon
- [x] 2. Construire le module domaine et service de Q&A sur exigences
  - [x] 2.1 Créer `src/lib/domain/requirementsQa.ts` (schémas Zod de réponse, calcul de l'empreinte canonique du corpus, formateur déterministe des exigences + liens `Subject.requirementRefs`)
  - [x] 2.2 Créer `src/lib/server/projects/requirementsQaService.ts` : chargement via `listRequirementSources`, mode Full-Context vs repli filtré hybride si dépassement de contexte, appel `localLlmClient.chat`, filtrage/validation stricte des `clauseRef` citées contre les exigences réelles
  - [x] 2.3 Écrire les tests de contrat / unitaires (cas `imposed`, `not_found`, `partial_or_implicit`, rejet d'une `clauseRef` hallucinée, stabilité octet pour octet du préfixe canonique entre deux utilisateurs)

## Palier 2 : API REST Sécurisée
- [x] 3. Exposer l'endpoint projet
  - [x] 3.1 Créer `src/routes/api/projects/[projectId]/requirements/ask/+server.ts` avec `authorizeProjectAccess`, validation Zod, gestion propre des erreurs LLM indisponible (`503`) / projet sans exigences (`422` explicite)
  - [x] 3.2 Ajouter les tests d'intégration API (autorisation projet, validation payload, réponse avec faux `LlmPort`)

## Palier 3 : Interface Flottante Clavier (Svelte 5)
- [x] 4. Composant Quick-Ask et intégration Workbench
  - [x] 4.1 Créer `src/lib/components/deliberation/RequirementsQuickAskModal.svelte` (panneau flottant non bloquant, mode compact/étendu, verdict badge, citations cliquables, historique de session, suggestions rapides)
  - [x] 4.2 Brancher le raccourci clavier global (`Ctrl+K` / `Cmd+K` / `Alt+/` + `Escape`) dans `src/routes/deliberation/+page.svelte` et ajouter un bouton d'accès discret avec badge raccourci dans `ProjectEngagementHeader.svelte`
  - [x] 4.3 Permettre le saut vers le sujet lié (`deliberationStore.selectSubject(...)`) au clic sur une citation rattachée à un sujet
  - [x] 4.4 Ajouter un test Playwright vérifiant l'ouverture/fermeture au clavier, l'envoi d'une question et l'affichage des citations `clauseRef`

## Palier 4 : Documentation & Vérification
- [x] 5. Documentation et parité CI
  - [x] 5.1 Mettre à jour `docs/user-guide.md` et `docs/developer-guide.md` (raccourci clavier, fonctionnement Full-Context + Prompt Caching, limites)
  - [x] 5.2 Exécuter la suite complète (`npm run check`, `npm test`, `npm run check:denylist`, `npm run verify`) et préparer la PR sur une branche dédiée `feat/requirements-quick-ask`
