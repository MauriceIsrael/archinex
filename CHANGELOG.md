# Changelog

Journal des évolutions d'Archinex, reconstitué à partir de l'historique git.
Les lots (`A0`…`A30`) correspondent aux issues GitHub du projet. Le journal d'ArcKit
(outil de méthode embarqué) est conservé dans [`.arckit/CHANGELOG.md`](.arckit/CHANGELOG.md).

Aucune version n'a encore été publiée : tout figure sous *Non publié*.

## Non publié

### Couverture déclarée exigence → contrôle (K17, contrat 1.30 du Hub)
- **Constat** : l'export d'Archinex n'a jamais calculé la section `compliance` (elle valait toujours `[]` hors banc d'essai). K17 n'est donc pas
  un transfert à retirer d'Archinex mais une capacité nouvelle du Hub, que la matrice de traçabilité lit désormais.
- Une décision envoyée au Hub porte `based_on` : les références de la base de connaissances de l'**option retenue**. Le Hub en tire,
  dans son instantané de connaissances épinglé, les contrôles que ces éléments mettent en œuvre et les déclare couverts pour les
  exigences que le sujet porte (`allocated` si la décision est affirmée, `proposed` sinon ; jamais « vérifié »).
- La matrice de traçabilité d'un projet basculé gagne une colonne « Contrôles déclarés ».
- Lecture de l'instantané (schéma 1.7) : un statut autre que `allocated`/`proposed`, ou une ligne qui n'est pas fondée sur une décision,
  fait **refuser** l'instantané.
- Parité : `compliance` n'est plus « absente du Hub » ; le scénario n'en éprouve rien (Archinex ne calcule pas cette section).
- Test du parcours contre un vrai Hub : `tests/contract/hub-compliance-live.test.ts`.

### Décision d'un projet basculé : elle atteint enfin le Hub (#103)
- **Cause** : la route `…/decision/assert` d'un projet basculé envoyait au Hub `retained_option` (un identifiant d'option
  d'Archinex), que le Hub refuse en 400 (`'decision' is required`), puis **avalait l'erreur** et écrivait la décision comme
  affirmée en local. Le faux Hub du test acceptait n'importe quelle forme : il validait le bug.
- **Corrigé** : le Hub reçoit le **texte** de l'option retenue et des options écartées, la décision **proposée au nom de son
  auteur** (identifié par son e-mail), puis **affirmée par la personne connectée** avec l'identifiant renvoyé par le Hub ;
  le sujet passe à L3 dans le Hub, qui est le système d'enregistrement de sa maturité. Clé d'idempotence stable.
- **Aucune erreur du Hub n'est avalée** : si le Hub refuse (ou est injoignable), la route refuse avec le code et la raison du
  Hub, et **rien n'est écrit en local** (sujet à L2, pas d'événement, pas d'énoncé).
- **Vocabulaire des faits** : le Hub ne reconnaît que le sien (`topology.dc_count`, `data.rpo_target_s`…), avec des valeurs
  typées ; celui d'Archinex (`resilience_mode`, `site_count`…) n'en recoupait aucune clé. Pour un projet basculé,
  l'extraction et l'affirmation utilisent le vocabulaire du Hub (lu dans son instantané) ; « 2 » devient 2 quand c'est sans
  ambiguïté, sinon la valeur est refusée avec sa clé (422 `FACT_VALUE`), jamais devinée.
- Types alignés sur le contrat (`HubDecisionInput.decision`, `rejected`) : le compilateur attrape désormais la mauvaise forme.
- Test du parcours contre un **vrai Hub** (`tests/contract/hub-decision-live.test.ts`) ; le faux Hub de
  `decision-survey-card.test.ts` applique maintenant le contrat du Hub.
- Limite connue : les faits cochés à l'affirmation sont enregistrés dans la proposition faite au nom de l'auteur ; le Hub les
  attribue donc à l'auteur, alors que c'est la personne qui affirme qui les a choisis.

### Dossier scellé déterministe, avec les exigences du RFP
- L'audit clause par clause est désormais **enregistré** (tables `RequirementSource` / `Requirement`) au lieu d'être
  perdu à la confirmation de l'import. La proposition du modèle et la décision humaine sont deux jeux de colonnes
  distincts : un nouvel audit ne touche jamais une décision humaine.
- Le dossier d'engagement scellé contient les exigences (état, motif, niveau d'assertion `asserted`/`proposed`/`open`,
  auteur, date), leur rattachement aux sujets, et les lacunes correspondantes (clause à qualifier ou à clarifier).
- Assemblage réécrit comme fonction pure (`bundleAssembly.ts`) : même état stocké, mêmes octets scellés, quelle que
  soit l'heure d'export ou l'ordre des lignes en base. Plus de sujet « par défaut » ni de décision inventée ; un sujet
  n'est « décidé » que s'il existe une décision enregistrée ; une incohérence devient une lacune visible.
- Le vérificateur contrôle aussi les exigences (motif obligatoire pour une évacuation, clause bloquante jamais
  évacuée, clause à délibérer portée par un sujet, clause à clarifier ou à qualifier signalée par une lacune).
- Preuve de la chaîne « JSON scellé → document » : `renderTraceabilityMatrix` produit la matrice de traçabilité à
  partir du seul dossier, refuse un dossier altéré ou incohérent, et donne le même texte pour le même sceau.
- API : `POST/GET /api/projects/{id}/requirements`, `PATCH /api/projects/{id}/requirements/{SRC-xxxx:clause}`
  (l'auteur est celui de la session).
- Correctif : `sanitizeHandle` est idempotent (un handle `@nom` n'était plus reconnu et devenait `@lead-architect`).
- Contrat `EngagementBundle` **1.1** (décision du propriétaire) : exigences auditées, lacunes typées par `kind`.
  Le schéma proposé est dans `tests/fixtures/bundle/engagement_bundle.schema.1.1.json` et les dossiers produits y sont validés
  (ajv) par les tests. La validation a révélé des écarts de l'ancien export avec le schéma 1.0 de la suite, corrigés :
  décisions (`title`, `rationale`, `alternatives` objets), énoncés (`predicate`), `sha256` des sources, statuts de sujet.
  Les dossiers 1.0 restent vérifiables. **À soumettre à la suite** (le schéma 1.0 y est figé).
- Limite connue : la décision humaine clause par clause n'a pas encore d'écran (API seulement).

### Le Hub, émetteur unique de l'instantané d'un projet basculé (archinex#34, contrat LLMOps 1.27)
- Une exigence évacuée par une personne, avec son motif, est un **fait engagé** : pour un projet basculé elle s'enregistre
  dans le Hub (proposée par un membre, affirmée par un décideur distinct), jamais en local. La proposition brute du modèle
  reste dans Archinex. Routes : `PATCH …/requirements/{id}` (propose), `POST …/assert`, `POST …/withdraw`.
- Migration vers le Hub : reprise des exigences auditées (par 500, jamais tronquées) et du rattachement des sujets ; une
  décision déjà prise n'est pas reprise au nom du lot, le rapport la liste pour être réaffirmée.
- **Archinex n'émet plus rien pour un projet basculé** : l'export réconcilie puis rend la référence de l'instantané du Hub. Le
  « mode Hub » de la PR #47 (dossier de processus épinglant le Hub) est retiré, ainsi que `pins.hub_snapshot` du contrat 1.1.
- `GET /api/projects/{id}/traceability-matrix` : matrice produite depuis l'artefact scellé qui fait foi (instantané du Hub,
  sceau revérifié ici ; sinon dossier local vérifié). Un même modèle de lecture, un seul rendu.
- Parité dossier d'Archinex / instantané du Hub mesurée sur un scénario réel : [`docs/hub-parity.md`](docs/hub-parity.md).
- Identifiants d'exigence acceptés par le Hub (`hubRequirementId`) : déterministes, injectifs.
- Bug relevé, non corrigé ici : la route d'affirmation d'une décision d'un projet basculé n'atteint jamais le Hub (#103).
### Rapport d'audit lisible et protocole du jalon J0
- Rapport Markdown de l'audit : pourquoi ces sujets (tension relevée sur chaque clause), ce que devient chaque autre
  clause, ce qu'il faut relire en priorité, comparaison avec une référence. Chaque clause y figure exactement une fois.
  Disponible par `--report` (ligne de commande) et par un bouton de téléchargement dans l'écran de revue.
- L'écran de revue affiche « Pourquoi à délibérer » sur chaque clause retenue.
- Protocole pas à pas du jalon J0 (`docs/jalon-j0.md`) et modèle de fichier de référence (`examples/reference-template.json`).
- L'état des clauses non retenues est conservé après la confirmation de l'import (voir ci-dessus).

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
