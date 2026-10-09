# Changelog

Journal des évolutions d'Archinex, reconstitué à partir de l'historique git.
Les lots (`A0`…`A30`) correspondent aux issues GitHub du projet. Le journal d'ArcKit
(outil de méthode embarqué) est conservé dans [`.arckit/CHANGELOG.md`](.arckit/CHANGELOG.md).

Aucune version n'a encore été publiée : tout figure sous *Non publié*.

## Non publié

### 2026-10-09 — Ingestion ArcKit, fournisseurs LLM, ergonomie
- Ajout du pipeline d'audit des exigences inspiré d'ArcKit (`src/lib/server/ingest/`).
- Fournisseur LLM multiple : Anthropic Claude ou serveur local (Ollama), découverte dynamique des modèles.
- Création et scission de sujets à la demande ; questions métier interactives ; liaison exigences ↔ sujets.
- Correctifs : projets de démonstration isolés, sujets créés à L0, jours de stagnation réels, statut LLMOps explicite.
- Script `npm run db:reset`.

### 2026-10-04 → 2026-10-08 — Espace de délibération (A24 à A30)
- A24 un sujet = une conversation ; A25 composeur structuré ; A26 stepper de maturation L0→L5.
- A27 carte de décision et faits affirmés ; A28 cascade de questions et sujets enfants ;
  A29 agent proposeur et détection de doublons ; A30 règles de projet et dérogations justifiées.
- Interface en deux colonnes, allègement progressif de l'affichage.

### 2026-10-03 — Dossier scellé et Hub (A16 à A23)
- Dossier d'engagement scellé (`EngagementBundle`), export OSCAL, différentiel, alignement sur l'enveloppe de la suite.
- A23 : Archinex écrit dans le Hub LLMOps ; bascule du système d'enregistrement.
- Sceau canonique du gel couvrant le contenu.

### 2026-10-02 — Réutilisation et factorisation (A12 à A15)
- Vecteurs sémantiques, confirmation de réutilisation par hypothèse, calibration sur jeu annoté, second RFP.
- Factorisation hiérarchique (map-reduce) des RFP volumineux.
- Sécurité : l'identité de l'acteur provient uniquement de la session.

### 2026-10-01 — Gouvernance de la base de connaissances (A6 à A11)
- Comptes experts et rôles KB, boîte de revue, atelier de doctrine, référentiels réglementaires,
  évaluations, tableau de bord et publication scellée.
- Tests de contrat contre un serveur LLMOps réel.

### 2026-09-27 → 2026-09-29 — Socle (A0 à A5)
- A0 assainissement ; A1 état serveur partagé et verrou optimiste ; A2 critères et options ;
  A3 débat multi-agents borné ; A4 maturité calculée et arbitrage humain (porte G3) ;
  A5 capitalisation vers la KB (porte G4).
