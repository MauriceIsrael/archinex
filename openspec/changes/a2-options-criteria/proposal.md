# Proposition Lot A2 — Critères, options, compromis, décision (Porte G2 - Partie 2)

## 1. Contexte & Problématique
Dans l'architecture initiale, chaque sujet de maturité était assorti d'une simple « variante B » textuelle binaire, sans critères d'évaluation explicites, sans pondération et sans formalisation des compromis (gains / sacrifices). Cette approche restreignait la délibération et ne permettait pas une réelle confrontation d'options d'architecture (patterns KB, propositions humaines innovantes, alternatives LLM).

## 2. Objectifs du Lot A2
- **Comparaison multi-critères à $N$ options** : Chaque sujet d'architecture peut héberger plusieurs options concurrentes (minimum 3 recommandées), évaluées selon une grille de critères typés (`functional`, `nfr`, `cost`, `risk`, `compliance`) pondérés de 1 à 5.
- **Rigueur épistémique sur les évaluations** : Toute évaluation d'option (`OptionEvaluation`, note de -2 à +2) exige une `justification` argumentée sous peine de rejet formel.
- **Calcul indicatif non décisionnel** : La fonction `weightedScore` calcule un score indicatif pour éclairer les architectes sans jamais se substituer à la souveraineté de l'arbitre humain (Invariant V & VII).
- **Compromis explicites (`TradeOff`) & Décision d'arbitrage (`Decision`)** : Traçabilité des gains, sacrifices, options écartées avec motifs et conditions de réversibilité.
- **Rétrocompatibilité totale** : Les brouillons télégraphiques conservent les facettes SUPPOSE, CONFLIT, MANQUE (Invariant IV), et l'ancienne `variante_b` est convertie automatiquement en `Option` (`origin: llm-proposed`).
- **Élicitation enrichie (`subjectElicitor`)** : Génération automatique d'au moins 3 critères et 3 options lors de l'extraction.
- **Interface matricielle interactive (`OptionsMatrix.svelte`)** : Visualisation claire avec badges `productionMode` (Invariant I & II).
