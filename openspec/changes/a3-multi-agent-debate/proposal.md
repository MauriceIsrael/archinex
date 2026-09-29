# Proposition A3 — Débat Multi-Agents Borné & Arguments Structurés

## 1. Contexte & Problématique
Dans la version initiale d'Archinex, le débat dialectique consistait en un fil de chat linéaire informel et des provocations heuristiques.
Pour garantir une réelle rigueur d'ingénierie et préparer l'arbitrage humain (Porte G3) :
- Les échanges doivent être modélisés sous forme d'**arguments structurés** rattachés aux options techniques en compétition.
- Chaque argument doit expliciter sa posture (`stance`: `support`, `objection`, `question`, `verification`, `synthesis`), son assertion télégraphique (`claim`), et ses fondements factuels ou techniques (`grounds` obligatoires).
- Les citations de doctrine (`kbRefs`) doivent être vérifiables contre le contexte de doctrine réel fourni par LLMOps (interdiction d'inventer des références).
- Le débat est orchestré entre 4 rôles d'agents spécialisés (`proposer`, `challenger`, `verifier`, `synthesizer`) avec une limite stricte de 3 tours pour éviter toute boucle infinie ou dérive.
- L'expert humain peut intervenir à tout moment ; les agents doivent répondre en priorité aux arguments humains ouverts au tour suivant. L'absence de réponse humaine ne clôt jamais une objection (Invariant III).

## 2. Objectifs Clés
1. **Modèle de données normalisé Prisma** : tables `arguments` et `debate_runs`.
2. **Validation stricte de domaine** : rejet des arguments sans `grounds` ou avec `kbRefs` fantaisistes.
3. **Quatre agents spécialisés** :
   - `proposer` : arguments de soutien et options complémentaires.
   - `challenger` : au moins 1 objection par option (coûts cachés, risques, dépendances).
   - `verifier` : vérification vis-à-vis des règles de doctrine et de conformité.
   - `synthesizer` : points de tension, compromis et questions pour l'humain.
4. **Orchestrateur de débat borné** : 3 tours maximum, exécution asynchrone traçable avec `DebateRun`.
5. **Interface de débat structuré** : vue par option, mise en avant des stances, actions humaines (*répondre*, *accepter le risque*, *contester*).
