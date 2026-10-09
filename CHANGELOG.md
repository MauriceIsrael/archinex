# Changelog

Journal des évolutions d'Archinex, reconstitué à partir de l'historique git.
Les lots (`A0`…`A30`) correspondent aux issues GitHub du projet. Le journal d'ArcKit
(outil de méthode embarqué) est conservé dans [`.arckit/CHANGELOG.md`](.arckit/CHANGELOG.md).

Aucune version n'a encore été publiée : tout figure sous *Non publié*.

## Non publié

### Plus aucune donnée de démonstration ni de repli fabriqué
- Le client LLMOps ne connaît plus aucun projet et ne lit plus de fixtures du dossier `tests/` : si LLMOps est
  injoignable, la santé est `unreachable`, les listes sont vides, l'instantané et les écritures échouent explicitement.
- Supprimés : le jeu « hors ligne » servi aux projets de démo, la fausse santé « ok », la fausse santé KB
  (qui annonçait un rappel de 85 % et une publication G7 éligible), les simulations activées par
  `ALLOW_OFFLINE_MOCK` / `USE_FAKE_LLMOPS` dans `src/`, et la campagne d'enrichissement préchargée.
- Garde-fou denylist : 33 violations → 0.
- Les tests 1 à 6 de `llmops-adapter.test.ts` passaient grâce à ces fixtures sans rien prouver ; ils testent désormais
  l'adaptateur contre un serveur HTTP local explicite, et vérifient qu'un LLMOps absent ne produit aucune donnée.
  Le contrat réel reste couvert par `llmops-live*.test.ts` (`LLMOPS_LIVE_URL`).

### Intégration continue
- Ajout de `.github/workflows/verify.yml` : `npm run verify` (denylist, tests, types, build) à chaque push et pull request.

### Audit des exigences en étapes (remplace l'audit câblé sur un seul RFP)
- Le pipeline d'ingestion classe désormais chaque clause avec le modèle configuré (lots, JSON validé par schéma),
  puis des contrôles déterministes garantissent : un état par clause, aucune évacuation de clause bloquante ou sans motif,
  chaque clause à délibérer dans exactement un sujet.
- Nouvel état « à qualifier » : en cas de doute ou de panne du modèle, la clause revient à l'humain au lieu d'être évacuée.
  Avant ce changement, tout RFP autre que la section de démonstration voyait ses clauses déclarées « évacuées ».
- Taux de couverture honnête (les clauses « à qualifier » n'y comptent pas) ; l'interface affiche un compteur « À qualifier ».
- Les analyses expertes du RFP de démonstration quittent `src/` pour `examples/lumicc-noc/reference-analysis.json`.
- Outil de mesure : `npm run eval:requirements` (rappel, faux négatifs dangereux, appariement des points durs).
- Correctif d'affichage : un résultat produit par Claude n'est plus présenté comme un « repli heuristique ».

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
