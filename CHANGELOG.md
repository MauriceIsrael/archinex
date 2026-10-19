# Changelog

Journal des évolutions d'Archinex, reconstitué à partir de l'historique git.
Les lots (`A0`…`A30`) correspondent aux issues GitHub du projet. Le journal d'ArcKit
(outil de méthode embarqué) est conservé dans [`.arckit/CHANGELOG.md`](.arckit/CHANGELOG.md).

Aucune version n'a encore été publiée : tout figure sous *Non publié*.

## Non publié

### Sécurité : le login n'accepte plus le hash stocké comme mot de passe (archinex#137)
- `POST /api/auth/login` et `POST /api/invite/accept` (compte existant) acceptaient aussi `user.passwordHash === password` (repli
  « texte clair » des comptes de démonstration) : qui lisait `users.passwordHash` (fuite de base, sauvegarde) ouvrait la session en
  le soumettant tel quel. Les deux routes passent par `verifyPassword` (`src/lib/auth/password.server.ts`), bcrypt seulement.
- Reproduit avant le correctif (le hash donnait un 200), 5 tests ensuite (`tests/integration/login-no-plaintext-fallback.test.ts`).
- Conséquence : un compte dont `passwordHash` contiendrait encore un mot de passe en clair ne peut plus se connecter. `prisma/seed.ts`
  et les créations de comptes hachent déjà ; à refaire par le seed ou une réinitialisation de mot de passe si un tel compte existe.

### Bac à sable : un Hub et un Archinex neufs et vierges, en conteneurs (`deploy/sandbox`)
- `./sandbox.sh up` construit et démarre le Hub (LLMOps), Archinex et un proxy HTTPS (Caddy) sur une URL de test, sans engagement,
  projet ni donnée : 4 comptes de test aux mots de passe aléatoires, registre des experts du Hub réduit à ces 4 personnes, Hub en
  mode strict (assertions d'acteur signées, clé d'Archinex générée au premier lancement). `reset` efface les données, `destroy` tout.
- N'exécute pas `docker-entrypoint.sh`, qui sème des comptes de démonstration aux mots de passe publics (archinex#137 pour le repli
  « texte clair » du login). Exige un Hub au contrat ≥ 1.39. Les images n'ont pas été construites par l'auteur (pas de démon Docker) :
  voir `deploy/sandbox/README.md`, « État de la vérification ».

### J0 : une clause d'automatisation n'est plus évacuée par le modèle seul (archinex#132)
- Constat du jalon J0 (`eval-results/decision-j0.md`) : un faux négatif dangereux identique aux deux passes, `REQ-Lot1-216` (création automatique
  d'incidents), évacuée comme « fonction standard ITSM ».
- Double protection sur la famille d'automatisation (pas un cas isolé) :
  1. **Consigne système** (`CLASSIFY_SYSTEM` dans `src/lib/server/ingest/arckitRequirementsPipeline.ts`) : instruit explicitement le modèle
     que toute automatisation (auto-remédiation, boucle fermée, création ou bascule automatique, action sans intervention humaine) relève
     de « deliberate » et n'est jamais une commodité.
  2. **Invariant déterministe** (`applyClassificationInvariants` avec `src/lib/domain/automationMarkers.ts`) : une clause non « info » qui décrit
     une automatisation ne peut pas être évacuée par le modèle : elle passe « à qualifier », avec la proposition du modèle conservée pour l'humain.
- Traçabilité et auteur du juge : `AuditReference` (`src/lib/domain/requirementsAuditEval.ts`), `examples/reference-template.json`, les rapports Markdown
  (`src/lib/domain/requirementsAuditReport.ts`) et `scripts/eval-requirements-audit.ts` intègrent et vérifient désormais l'auteur (`author`), la date (`date`)
  et le statut (`status`) du juge indépendant.
- Mesuré sur les évacuations archivées de J0 (92 clauses) : `REQ-Lot1-216` n'est plus évacuée ; `REQ-Lot1-259` (même famille) est aussi renvoyée ;
  « à qualifier » passe de 0 à 2 clauses sur 92 (2 %, plafond 30 %). Les quatre autres évacuations restent.
- **Le jalon n'est pas rejoué** : ce correctif a été écrit en voyant le cas ; le rejeu doit se faire sur un autre dossier avec un juge fixé avant la mesure
  (`docs/jalon-j0.md`). L'issue reste ouverte jusque-là.

### Identité des experts : assertion signée Ed25519 auprès du Hub (LLMOps#144)
- `src/lib/server/llmops/actorAssertion.ts` : assertion d'acteur signée (`X-Actor-Token`, JWT EdDSA, `jti` neuf par requête, 60 s) quand une clé est
  configurée ; sinon l'en-tête brut `X-Actor-Email` comme avant. `LLMOPS_ACTOR_AUTH=assertion` exige la clé et n'envoie jamais l'en-tête brut.
- `scripts/gen-actor-key.mjs` produit la clé privée et le JWKS public. Faux Hub des tests : vérifie la signature, l'émetteur, le destinataire,
  l'expiration et le rejeu comme le Hub 1.37, avec un mode strict.

### Revue des candidats : séparation des tâches du Hub 1.37 (#131)
- Le Hub interdit à l'auteur d'un candidat de le relire. Archinex affichait « Erreur HTTP 400 » ; il dit maintenant « Séparation des tâches : vous êtes l'auteur… »
  (statut `forbidden`, code `separation_of_duties`), et l'écran de revue désactive accepter / amender / rejeter pour l'auteur avec une note.
- Tests live A11 : le candidat est relu par un autre acteur, et le refus de l'auteur est vérifié ; délai explicite pour A8 (5 à 7 s).
- Le faux Hub des tests applique la même règle, avec la forme réelle de la réponse.

### Vérification du Découpage PDF des RFP sur Échantillon & Rapport d'Extraction (#50)
- **Rapport d'extraction automatique & Métriques de qualité** :
  - Module métier dédié (`src/lib/domain/rfpExtractionReport.ts`) calculant la couverture textuelle (`coverageRate`), le score de qualité du découpage (0 à 100), le nombre d'exigences et de pages.
  - Détection et classification des motifs de référence (`REQ-Lot1-*`, `Art. *`, `Clause *`, `§*`) avec mise en avant du motif dominant.
  - Alerte de couverture textuelle si moins de 60 % du document est rattaché à des exigences.
- **Détection exhaustive et explicite des anomalies de découpage** :
  - Détection des trous dans la numérotation séquentielle (`detectNumberingGaps`), avec identification des bornes et des numéros manquants (ex: `REQ-Lot1-13 .. REQ-Lot1-14`).
  - Détection des doublons disambiguïsés avec suffixe `#2` (`detectDuplicatesAndUnnumbered`).
  - Détection des références sans numéro explicite (`REQ-Lot1-?`) ou atypiques ne respectant pas le motif dominant.
  - Détection des clauses anormalement courtes (< 25 caractères) ou volumineuses (> 2 500 caractères).
  - Détection des pages sans aucune clause (sommaires, pages de garde, annexes non découpées).
- **Échantillon de vérification humaine côte à côte** :
  - Générateur d'échantillon (`generateVerificationSample`) sélectionnant en priorité absolue toutes les clauses associées à des anomalies, complétées par des clauses représentatives réparties sur le document.
  - Composant Svelte `RfpExtractionVerification.svelte` offrant une vue comparative : clause extraite à gauche (référence, titre, texte, criticité, anomalie), page source du document avec son numéro de page à droite.
  - Possibilité de valider l'échantillon ou de signaler une clause problématique avant le lancement de l'audit.
- **Traçabilité & Persistance dans les exécutions de factorisation** :
  - Intégration de `HumanExtractionValidation` dans `FactorizeRequest`, `FactorizationRun` (base de données) et `RfpFactorizationResponse`.
  - Affichage clair du statut de validation humaine (ou alerte d'absence de vérification) dans le composant de révision `RfpFactorizationReview.svelte`.
- **Tests** :
  - Tests de contrat d'extraction et de détection d'anomalies sur deux mises en page de RFP réelles (`examples/Lulu.pdf` de 194 pages et `examples/lumicc-noc/rfp-section4-noc.md`) dans `tests/contract/rfp-extraction-report.test.ts`.
  - Tests de contrat de persistance et traçabilité de la validation dans `tests/contract/rfp-factorize-validation.test.ts`.

### Montée de version Prisma 6.19 → 7.10 (#60)
- **Prisma 7.10 (dernière 7.x stable)** avec le générateur `prisma-client` (sortie dans `src/generated/prisma`, ignorée par git) et l'adaptateur `@prisma/adapter-better-sqlite3` (instanciation centralisée dans `src/lib/server/prismaFactory.ts`).
- L'URL de base passe dans `prisma.config.ts` ; les chemins `file:./` restent résolus relativement à `prisma/`.
- `prisma db push` ne génère plus le client : `npx prisma generate` ajouté en CI, et l'option `--skip-generate` supprimée.
- `casbin-prisma-adapter@1.12` est déjà compatible Prisma 7 (peer `^7.2.0`). Prisma 8 reste en release candidate : non ciblé.

### Export d'Architecture HLD & Projections C4/Mermaid dans l'Engagement Bundle (#122)
- **Peuplement automatique du modèle d'architecture (`data.architecture`)** :
  - `assembleEngagementBundle` extrait et synthétise les éléments (`BundleElement`) et relations (`BundleRelation`) à partir des sujets, options retenues et statements formalisés.
  - Classification canonique des composants (`actor`, `system`, `component`, `datastore`, `network`, `interface`, `boundary`) et des relations (`uses`, `depends_on`, `data_flow`, `deploys_to`, `protects`, `contains`).
  - Détermination temporelle déterministe via `findEarliestStoredIsoDate` pour garantir l'absence d'aléa ou de fuite de l'horloge d'assemblage dans le corps des données d'architecture.
- **Génération de projections formelles (Mermaid, Structurizr C4 DSL, SysML v2)** :
  - Projections locales par sujet dans `data.subjects[i].projections` et consolidées dans `data.architecture.projections.by_subject`.
  - Projections globales d'ensemble dans `data.architecture.projections` (`mermaid`, `structurizr_dsl` / `structurizrDSL`, `sysml_v2` / `sysmlV2`).
- **Conformité & Intégrité du Bundle** :
  - Extension du schéma JSON `engagement_bundle.schema.1.1.json` validée avec Ajv.
  - Contrôles de validation stricts dans `bundleVerifier.ts` : vérification des catégories d'éléments (`ELEMENT_KIND_INVALID`), des types de relations (`RELATION_KIND_INVALID`), détection des frontières circulaires (`CIRCULAR_BOUNDARY`) et validation des références de sujets (`DANGLING_REF`).
  - Déterminisme cryptographique absolu du sceau SHA-256 sans dérive, insensible à l'ordre des collections en entrée.
- **Tests** : 5 tests de contrat d'export d'architecture dans `tests/contract/bundle-architecture-export.test.ts`.

### Pipeline ArcKit pour le Benchmark LUMICC (#121)
- **Support natif du pipeline ArcKit dans `benchmarkRunner.ts`** :
  - Ajout de l'option `pipeline?: 'deterministic' | 'arckit'` dans `BenchmarkRunOptions`.
  - Intégration de `runRequirementsAudit` : classement par lots, application stricte des invariants déterministes (repêchage des clauses bloquantes en `to_qualify`, exclusion des commodités `evacuated` des sujets de délibération, conversion des clarifications en `gaps` opposables).
  - Factorisation $N \text{ clauses} \to K \text{ sujets}$ (`FactorizedArchitecturalSubject`) convertis en `BundleSubject`s canoniques avec questions initiales et d'experts.
  - Option `elicit?: boolean` permettant de déclencher l'élicitation multi-critères approfondie via `elicitSubjectDetails` (génération de critères pondérés, d'options et de questions expertes).
  - Injection du client LLM via `llm?: LlmPort` pour permettre des bancs d'évaluation hors-ligne reproductibles ou en local souverain.
- **Enrichissement de `BenchmarkRunResult`** :
  - Exposition des rapports `arckitReport: ArcKitAuditReport` et `factorizedSubjects: FactorizedArchitecturalSubject[]` pour mesurer le ratio de compression du bruit, le repêchage des faux négatifs dangereux et la complétude d'architecture.
- **Outil CLI `scripts/benchmark-run.ts`** :
  - Nouvelles options en ligne de commande : `--pipeline <deterministic|arckit>` et `--elicit`, avec enrichissement du rapport d'artefact `--summary-out`.
- **Tests** : 3 tests de contrat dédiés dans `tests/contract/benchmark-arckit-pipeline.test.ts`.

### Portabilité des Décisions & Filtrage du Moissonnage (#120)
- **Qualification de portabilité à l'arbitrage** : Ajout d'une dimension de portabilité lors de l'enregistrement d'une décision d'arbitrage (`CreateDecisionSchema`, `ArbitrationPanel.svelte`) :
  - `project_specific` (Spécifique au contrat / projet) : décision liée aux contraintes singulières du client ou du contrat, exclue du moissonnage général (`harvestable: false`).
  - `reusable_product_capability` (Capacité produit réutilisable) : solution générique ou capacité technique réemployable, éligible au moissonnage LLMOps (`harvestable: true`).
  - `reusable_architecture_doctrine` (Doctrine d'architecture transverse) : règle d'ingénierie ou principe général à capitaliser dans la doctrine transverse (`harvestable: true`).
- **Garde-fou au moissonnage & transmission au Hub** :
  - `buildKbCandidates` (`capitalization.ts`) filtre immédiatement les décisions `project_specific` et renvoie une liste vide afin d'empêcher toute pollution de la doctrine globale par des spécificités contractuelles.
  - `recordDecisionInHub` (`hubDecisions.ts`) propage explicitement les propriétés `portability` et `harvestable` au Hub LLMOps.
  - Badge visuel contextuel affiché dans la carte de décision de l'arbitrage.
- **Pédagogie & Guide de décision** : Intégration dans `DecisionGuideModal.svelte` des explications sur la qualification de portabilité et la protection de la doctrine globale.
- **Tests** : Tests de contrat dans `tests/contract/decision-portability.test.ts` et `tests/contract/capitalization.test.ts`, et mise à jour des tests d'intégration du Hub.

### Matrice de Conformité de Base Standardisée (#118)
- **Statuts de conformité unifiés** : Support natif des positions de conformité `Compliant`, `Partially compliant`, `Non-compliant` et `Provisional` sur les décisions d'arbitrage et les exigences sources.
- **Règle de justification substantielle** : Obligation stricte de renseigner une réserve / justification explicite (au moins 5 caractères) dès lors qu'un arbitrage est `Partially compliant` ou `Non-compliant`. Contrôles appliqués dans les schémas Zod (`CreateDecisionSchema`), la base de données (`arbitrationDb.ts`) et la vérification de bundle (`bundleVerifier.ts`).
- **Export et Visualisation multi-formats** :
  - Route d'API dédiée `/api/projects/[projectId]/compliance-matrix` proposant les formats `markdown` (tableau opposable structuré), `csv` (tableur RFC 4180 avec BOM UTF-8) et `json` (modèle typé).
  - Onglet dédié « Matrice de Conformité » dans le Hub d'Artefacts (`ArtifactRegenerationHub.svelte`) avec synthèse exécutive (taux de conformité pondéré, répartition des statuts) et bouton d'export direct en CSV.
- **Intégrité de schéma** : Respect strict du schéma de bundle 1.1 sans altération de contrat fermé (`additionalProperties: false`).
- **Tests** : 8 tests de contrat validant les règles de conformité, l'exportation et la compatibilité de bundle dans `tests/contract/compliance-matrix.test.ts`.

### Indicateur d'Alerte sur les Clauses KB non Validées ou non Publiées (#119)
- **Bannière d'alerte et santé de doctrine** : Composant réutilisable `KbClausesHealthBanner.svelte` informant l'architecte du volume de contrôles KB actifs, du nombre de clauses vérifiables (`checks:`) validées et de la proportion de clauses en attente de test ou de publication.
- **Badge d'alerte contextuel** : Affichage d'un badge d'avertissement explicite (`data-testid="kb-clauses-health-alert"`) lorsqu'au moins une clause en attente est détectée, avec renvoi direct vers la console KB.
- **Intégration transverse** : Déployé sur la page d'accueil des projets (`+page.svelte`), le tableau de bord de la base de connaissances (`/kb/dashboard/+page.svelte`) et le panneau des référentiels réglementaires applicables (`RegulatoryFrameworksPanel.svelte`).
- **Tests** : 5 tests de contrat validant les calculs de santé et le filtrage contextuel dans `tests/contract/kb-clauses-health-alert.test.ts`.

### Adaptateur de Benchmark S3 : Enregistrement de `kb_references` sur `confirm_reuse` (archinex-benchmark#1)
- **Constat** : En mode $S_3$ (assisté), lorsqu'un expert confirmait le réemploi d'une décision antérieure (`action: "confirm_reuse"`), `benchmarkRunner.ts` ajoutait l'entrée correspondante dans `data.reuse_log` (`matched_ref`), mais omettait d'inscrire la référence dans `data.kb_references` et de la passer à `buildEngagementBundle`. Le vérificateur `verifyEngagementBundle` rejetait alors le bundle scellé avec l'erreur `[KB_REF_UNLISTED]`.
- **Correction** : Inscription automatique de `matched_ref` dans `kbReferences` lors du traitement de `confirm_reuse`, transmission de `kbReferences` à `buildEngagementBundle`, et tolérance `k.ref || k.id` dans `bundleVerifier.ts`.
- **Vérification** : Nouveau test de contrat dans `tests/contract/benchmark-adapter.test.ts` (7/7 passés).

### Ergonomie du Workbench de Délibération & Contrôles Globaux de l'Application (#114)
- **Pastille de connectivité LLMOps globale** : déplacée depuis l'en-tête de délibération vers l'en-tête supérieur permanent de l'application (`+layout.svelte`, à côté des contrôles de langue et de thème). Elle affiche l'état temps réel (Connecté au Hub en direct, mode Local souverain, ou synchronisation en cours) et permet de relancer la synchronisation d'un simple clic depuis n'importe quel écran.
- **Menu d'aide global & guide méthodologique** : intégration d'une icône d'aide discrète `?` dans l'en-tête global donnant accès à la modale « Comment décider ? » (guide des niveaux de maturité L0→L5 et leviers d'arbitrage) sur l'ensemble des pages.
- **Épuration du bandeau Délibération & HLD** : suppression des boutons redondants ou anachroniques issus des anciens prototypes (simulateur de rôle d'architecte déconnecté du RBAC réel, faux bouton de bascule « Opérateur humain / Agent IA », doublon d'invitation d'expert déjà géré dans la mini-app `/users`, et bouton « Sceller » hors contexte déplacé là où le scellement s'opère réellement).
- **Aération visuelle** : le sélecteur de projets et d'engagements s'étend désormais sur une grille fluide occupant toute la largeur disponible.

### Tests live : les quatre anciens échecs, expliqués
- Jeton par défaut de `llmops-mcp` aligné sur celui du serveur de contrat (`contract-service-token`) ; délai explicite pour le test A14
  (banc de similarité, ~5 s). Les autres causes (révision d'ADR-0001, engagement de démonstration absent) étaient dans le serveur de
  contrat du Hub : LLMOps#129. `docs/testing.md` mis à jour.

### Couverture exigence → contrôle (K17, contrat 1.31 du Hub)
- **Constat** : l'export d'Archinex n'a jamais calculé la section `compliance` (elle valait toujours `[]` hors banc d'essai). K17 n'est
  donc pas un transfert à retirer d'Archinex mais une capacité du Hub, que la matrice de traçabilité lit désormais.
- Une décision envoyée au Hub porte `based_on` : les références de la base de connaissances de l'**option retenue**. Le Hub les confronte
  aux contrôles rapprochés de chaque exigence (`allocated` / `proposed` / `uncovered`, déclaratif, jamais « vérifié »).
- La matrice de traçabilité d'un projet basculé gagne une colonne « Contrôles déclarés ».
- Lecture de l'instantané (schéma 1.7) : un statut inconnu ou une origine autre que le Hub fait **refuser** l'instantané ; un instantané
  sans section se lit normalement.
- **Limite** : une exigence créée par l'API d'écriture n'a pas de contrôle rapproché ; la section est donc vide pour un projet d'Archinex
  tant que le Hub ne l'accepte ou ne le calcule pas (voir `docs/hub-parity.md`).
- Parité : `compliance` n'est plus « absente du Hub » ; le scénario n'en éprouve rien.
- Test du parcours contre un vrai Hub : `tests/contract/hub-compliance-live.test.ts`.
- Correction de #108 (explorateur de doctrine), qui rendait `main` rouge : « Validé par » lisait des champs inexistants
  (`validated_by`) au lieu de `review.by` / `review.at` ; le test construisait le client avec de mauvais arguments.

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
