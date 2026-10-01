# Proposition d'Évolution : Évaluations & Retours sur Verdicts (Lot A9 - Issue #4 - Porte G6)

## 1. Contexte & Problématique
Pour franchir la **Porte de Qualité G6** ("Atelier & Evals Validés"), la doctrine architecturale et les moteurs de vérification doivent reposer sur un socle d'évaluation rigoureux, mesurable et continuellement enrichi par le terrain.

Deux piliers essentiels constituent le **Lot A9 (Issue #4)** :
1. **Banc d'Évaluation `check_option_v1` & Annotation Humaine (`kb:evaluate`)** :
   - Consultation du jeu de test de référence via `GET /api/knowledge/evals/check_option_v1`.
   - Annotation en ligne des cas de test (`PATCH .../cases/{id}`) réservée aux experts habilités par le rôle `kb:evaluate`.
   - Exécution du benchmark (`POST .../runs`) avec calcul du **Rappel Réel ($\ge 80\%$)**, calculé strictement sur les annotations validées par un humain (règle d'or de rigueur méthodologique).
2. **Boucle de Retour Terrain depuis les Débats d'Architecture** :
   - Depuis l'interface de délibération (`DebateThreadView.svelte`), les architectes peuvent signaler un désaccord ou une contestation sur un verdict doctrinal émis (`POST /api/knowledge/verdict-feedback`).
   - File de traitement des retours permettant de convertir un désaccord terrain directement en nouveau cas de test d'évaluation ou en amendement doctrinal soumis au circuit de revue.

## 2. Invariants & Principes Non Négociables
- **Rôle Dédié `kb:evaluate` (403 Forbidden)** : Seuls les experts dotés du rôle `kb:evaluate` (ou `kb:admin`) peuvent annoter les cas d'évaluation.
- **Rappel Réel Calculé sur l'Humain** : L'indicateur d'opposabilité de la Porte G6 exige un rappel $\ge 80\%$ calculé exclusivement sur le sous-ensemble de cas annotés et vérifiés par des humains.
- **Continuité des Débats** : Le signalement d'un désaccord ne bloque pas la délibération, mais crée un pont immédiat entre le projet terrain et la gouvernance de la doctrine.
