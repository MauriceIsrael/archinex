# Changelog

Journal des évolutions d'Archinex, reconstitué à partir de l'historique git.
Les lots (`A0`…`A30`) correspondent aux issues GitHub du projet. Le journal d'ArcKit
(outil de méthode embarqué) est conservé dans [`.arckit/CHANGELOG.md`](.arckit/CHANGELOG.md).

Aucune version n'a encore été publiée : tout figure sous *Non publié*.

## Non publié

### Environnement Docker d'Intégration & Outillage (Nautobot, Batfish, OPA Server)
- **Pile Conteneurisée d'Outillage Intégrateur (`deploy/integrator-tools/compose.yml`)** :
  - Déploiement local de Nautobot 2.2 avec PostgreSQL 15, Redis 7 et worker Celery pour servir de source de vérité DCIM.
  - Intégration de Batfish (`batfish/batfish:latest`) sur les ports 9997 (API pybatfish) et 9996 pour la simulation et la vérification des matrices de flux réseau.
  - Intégration d'un serveur OPA REST (`openpolicyagent/opa:latest`) sur le port 8181 en complément du binaire CLI local `tools/bin/opa.exe`.
- **Script d'Ensemencement Témoin Nautobot (`deploy/integrator-tools/seed-nautobot.py`)** :
  - Injection idempotente de la topologie requise par les oracles Sylva CAPI : site `pop-valmondois`, rôle `telco-baremetal-worker`, serveur `srv-telco-bm-01` au statut `Planned`, interface `bmc` et adresse de management `192.0.2.10/24` (RFC 5737).
- **Scripts d'Exploitation & Automatisation (`tools.ps1`, `tools.sh`, `README.md`)** :
  - Commandes `up`, `down`, `status`, `seed`, `test`, `reset` avec contrôle automatique du statut du moteur Docker Desktop et diagnostics de connectivité.
- **Tests de contrat** : ajout de `tests/contract/edp-integrator-tools-docker.test.ts` (4 tests passants, total 91 tests de contrat EDP passants).

### Alignement Sylva CAPI & Nautobot DCIM pour les Paquets de Décision Exécutables (EDP)
- **Requête d'Extraction GraphQL Nautobot Planned (`src/lib/server/edp/adapters/nautobot_planned_extract.graphql`, `nautobotAdapter.ts`)** :
  - Intégration de la requête GraphQL officielle ciblant les équipements au statut `planned` avec leurs interfaces `bmc` (type, MAC, adresses IP).
  - Ajout de la fonction `parseNautobotGraphqlResponse` extrayant automatiquement l'adresse OOB depuis les interfaces BMC pour les formats de réponse GraphQL bruts.
- **Fixture et Typage Sylva CAPI Cluster (`sylva_values_candidate.yaml`, `sylvaAdapter.ts`)** :
  - Intégration de la fixture de valeurs de référence `sylva-capi-cluster` avec providers Metal3 (`capm3`), RKE2 (`cabpr`), image SLE Micro RT 5.5 et BMC Redfish.
  - Définition de l'interface TypeScript `SylvaCapiClusterValues` pour le typage des configurations d'unités Sylva.
- **Tests de contrat** : enrichissement de `tests/contract/edp-verify-and-gate.test.ts` (11 tests passants).

### Paquet de Décision Exécutable (EDP) : Rédaction Assistée, IHM & Évaluation Finale (Palier 5 - Issues #184, #186, #187, #188, #189)
- **Chaîne d'Acceptation Déterministe pour Rédaction Assistée LLM (`src/lib/server/edp/edpDrafting.ts`) (#184)** :
  - Pipeline de validation automatique imposé avant toute présentation à l'humain enchaînant : schéma formel, pureté d'intension (zéro fuite IP/MAC/hostnames), contrôle des liaisons d'ontologie, conformité des fixtures, auto-test OPA natif et garde de mutation.
  - Exigence stricte Invariant II : interdiction absolue pour un draft LLM de revendiquer le statut `validated` sans approbation humaine formelle (assignation obligatoire du statut `proposed` et de la provenance `llm-proposed-human-approved`).
  - Journalisation en mémoire des métriques de génération (durée d'exécution, score de mutation, nombre de mutants tués, étape de rejet) pour analyse d'évaluation.
- **Composant Fiche EDP dans l'IHM Workbench (`src/lib/components/edp/EdpCard.svelte`) (#186)** :
  - Panneau dédié conditionné par le drapeau `ARCHINEX_EXPERIMENTAL_EDP=1` (invisible et sans aucun impact de rendu si le drapeau est absent).
  - Affichage complet du statut, mode de production, validateur humain, révisions d'ontologie liées, score de mutation (100% garanti) et dernier verdict d'évaluation avec violations.
  - Alerte visuelle immédiate en cas de statut `stale` (caducité Invariant VI) avec désactivation de l'action de validation.
  - Restriction de l'action de validation aux seuls rôles d'architectes habilités (`Lead Architect`, `Domain Architect`, `Security Architect`).
  - Dialogue de contestation d'architecture obligeant la saisie d'un énoncé humain (`human-authored`, Invariant III).
- **Second EDP de Référence : Isolation de Zones de Sécurité NIS2 (`edp/examples/adr015-security-zones/`) (#187)** :
  - Implémentation complète de l'oracle de décision ADR-015 pour tester la généralité du système sur un domaine différent du substrat bare-metal.
  - Résolution d'adresses IP vers les zones réseau projetées par l'ontologie, contrôle d'isolation stricte et gestion des exceptions autorisées par classe de trafic (ex: télémétrie).
  - Score de mutation atteint : **2/2 mutants tués (100 %)**.
  - Mocks complets en adresses de documentation réservées RFC 5737 : entrée conforme (`pass.json`), défaillances unitaires ciblées (`fail_rule_1` et `fail_rule_2`) et cas d'adresses inconnues retournant `insufficient_input`.
- **Guide Intégrateur Hors-Ligne (`docs/edp/integrator-guide.md`) (#188)** :
  - Manuel pas à pas complet pour les intégrateurs et auditeurs tiers : installation d'OPA avec contrôle de somme de contrôle SHA-256, préparation d'entrée `refined_input`, exécution de `edp verify` hors-ligne et interprétation des lots de preuves cryptographiques et des codes de sortie (0, 1, 2, 3).
  - Section d'honnêteté méthodologique : "Ce qu'un vert ne prouve pas" détaillant les limites intrinsèques sur les artefacts et les champs non modélisés.
- **Plan d'Évaluation, Rapport & Décision de Promotion (`docs/edp/`, `docs/adr/ADR-016-promotion-edp-experimental.md`) (#189)** :
  - Critères objectifs C1 à C5 figés dans `docs/edp/evaluation-plan.md`.
  - Rapport consolidé `docs/edp/evaluation-report.md` démontrant l'atteinte des 5 critères avec preuves d'exécution.
  - ADR-016 prononçant le **GO** pour la promotion progressive de l'EDP sous condition du maintien du feature flag et des invariants constitutionnels.
- **Tests** : 14 nouveaux tests de contrat dans `tests/contract/edp-palier-5.test.ts` portant la suite complète à **85 tests de contrat EDP passants** à 100 %.


### Paquet de Décision Exécutable (EDP) : Vérification, Adaptateurs & CI Gate (Palier 4 - Issues #182, #178, #179, #183, #185)
- **Service et Commande `edp verify` (`src/lib/server/edp/edpVerify.ts`, `scripts/edp-verify.ts`) (#182)** :
  - Orchestration complète d'évaluation d'un EDP : validation structurelle du paquet, validation de non-vacuité des entrées de raffinement, compilation déterministe de la projection d'ontologie (`data.ontology`) et évaluation via OPA.
  - Émission d'un lot de preuves scellé (`EvidenceBundle`) avec empreintes cryptographiques SHA-256 (EDP, politique, ontologie, entrées), versions des moteurs, verdict à 4 états et violations détaillées.
  - Codes de sortie standardisés pour intégration CI/CD : 0 (`compliant`), 1 (`violated`), 2 (`insufficient_input` / `not_applicable`), 3 (`unavailable` / erreur exécuteur).
- **Adaptateur Sylva / CAPI (`src/lib/server/edp/adapters/sylvaAdapter.ts`) (#178)** :
  - Transformation des manifestes Kubernetes issus d'un rendu Helm (`helm template`) en payload `refined_input` conforme avec traçabilité complète de provenance (outil, version, commande, hash).
  - Sanitization automatique et suppression stricte de tout manifeste de type `Secret` ou de clés/valeurs sensibles (`password`, `token`, `bearer`, clés privées).
  - Fixtures de test hors-ligne dans `tests/fixtures/edp/sylva/`.
- **Adaptateur Nautobot Planned (`src/lib/server/edp/adapters/nautobotAdapter.ts`) (#179)** :
  - Transformation et normalisation des équipements déclarés dans Nautobot GraphQL au statut `planned` vers le contrat `nautobot_planned_devices`.
  - Normalisation des adresses OOB sans masque de sous-réseau CIDR pour correspondre exactement aux contrats de conformité bare-metal.
  - Fixtures de test hors-ligne dans `tests/fixtures/edp/nautobot/`.
- **Spike d'Architecture : Instanciation Blueprint vers Nautobot Planned (`docs/edp/spike-nautobot-design-builder.md`) (#183)** :
  - Analyse approfondie de la viabilité d'une instanciation automatisée dans Nautobot Design Builder versus extraction de fixtures.
  - Décision et recommandation d'architecture argumentée : **NO-GO** sur l'instanciation dynamique d'HLD dans un Nautobot chaud (fragilité, non-idempotence, couplage fort) et **GO** sur le patron d'adaptateur hors-ligne par extraction GraphQL et fixtures scellées.
- **Porte d'Architecture CI `edp-gate` (`scripts/edp-gate.ts`, `scripts/edp-gate.sh`, `.github/workflows/edp-architecture-gate.yml.example`) (#185)** :
  - Script unifié validant en chaîne : le schéma JSON de l'EDP, la suite de tests natifs `opa test`, la garde de mutation (exigence de 100 % de mutants tués), la vérification d'entrée conforme (`pass.json`) et le rejet effectif de toutes les entrées à défaut.
  - Script bash d'exécution CI portable et modèle de workflow GitHub Actions documenté.
- **Tests** : 9 nouveaux tests de contrat dans `tests/contract/edp-verify-and-gate.test.ts` portant la suite complète à 71 tests de contrat au vert.


### Paquet de Décision Exécutable (EDP) : Ontologie & Persistance Souveraine (Palier 3 - Issues #173, #181, #174, #177)
- **Client d'Ontologie & Contrôle des Liaisons (`ontologyClient.ts`) (#173)** :
  - Client de lecture du catalogue d'ontologie supportant le mode fixture hors-ligne pour la CI et l'intégration API avec le Knowledge Hub sans aucun appel de modèle.
  - Détection rigoureuse des URNs inconnues (erreur bloquante), des révisions futures inexistantes et avertissement `stale_binding` dès qu'une liaison est sur une révision antérieure.
  - En cas d'indisponibilité du Hub, levée d'une erreur explicite sans jamais inventer de données.
- **Compilateur de Projections & Linter de Littéraux (`projectionCompiler.ts`) (#181)** :
  - Compilateur projetant les entités liées en un document `data.ontology` canonique pour OPA avec empreinte cryptographique SHA-256 déterministe (reproductibilité octet pour octet).
  - Linter Rego analysant les politiques pour détecter les littéraux codés en dur qui doublonnent des valeurs d'ontologie.
- **Persistance Prisma & Application Inviolable de l'Invariant II (`edpRepository.ts`, `prisma/schema.prisma`) (#174)** :
  - Modèle additif `ExecutableDecisionPackage` stockant l'intension, les facettes épistémiques, les hashs de politiques et les métadonnées de validation.
  - Règle constitutionnelle absolue (Invariant II) : refus bloquant de toute transition vers le statut `validated` pour un EDP dérivé par LLM (`llm-derived`) sans un validateur humain dûment identifié et habilité.
  - Respect strict des rôles formels (Invariant VII) : seuls les rôles d'architectes habilités peuvent homologuer un EDP.
  - Isolation étanche par drapeau `ARCHINEX_EXPERIMENTAL_EDP=1`.
- **Rétractation Automatique & Maintenance de Vérité (`retractEdpOnAntecedentChange`) (#177)** :
  - Application directe de l'Invariant VI : dès qu'une décision d'architecture source est rétractée ou qu'une URN d'ontologie liée change de révision, l'EDP bascule automatiquement à l'état `stale` avec consignation explicite de la cause (`staleReason`).
  - Interdiction formelle de présenter un EDP `stale` comme `validated`.
- **Tests** : 15 tests de contrat dans `tests/contract/edp-ontology-and-persistence.test.ts` (total 62 tests passants sur les Paliers 1, 2 & 3).

### Paquet de Décision Exécutable (EDP) : Moteur OPA, Bibliothèque Rego & Référence ADR-012 (Palier 2 - Issues #171, #175, #180, #176, #172)
- **Exécuteur OPA Déterministe (`opaRunner.ts`, `install-opa.ps1`, `install-opa.sh`) (#171)** :
  - Exécuteur OPA encapsulant `opa test` et `opa eval` avec gestion des timeouts, typage strict des résultats et détection de version minimale (Rego v1).
  - Règle bloquante : le statut `unavailable` en cas d'absence du binaire OPA n'est jamais confondu avec un succès (`pass`).
  - Scripts d'installation automatique et de contrôle d'intégrité SHA-256 pour OPA v1.21.4 sous Windows et Linux / CI.
- **Bibliothèque Rego Commune (`policies/lib/edp_common.rego`) (#175)** :
  - Fonctions helpers standard : extraction sûre de l'hôte `host_of(url)` évitant les fausses correspondances par sous-chaîne (`contains`), `missing_inputs` et `build_status` conforme aux 4 verdicts.
  - Documentation intégrée des 3 pièges Rego : champ indéfini, comparaison de sous-chaîne et ensemble vide (vacuité).
  - 7 tests unitaires Rego natifs (`policies/lib/edp_common_test.rego`).
- **EDP de Référence ADR-012 Substrat Bare-Metal (`edp/examples/adr012-baremetal/`) (#180)** :
  - Définition complète de l'oracle pour le substrat Kubernetes Telco Cloud (Sylva / CAPI et Nautobot Planned) couvrant 6 règles architecturales ciblées.
  - Isolation du bloc d'ontologie en tête de politique pour substitution future par `data.ontology`.
  - Mocks Red/Green complets : `pass.json`, 6 mocks à défaut unique (`fail_rule_1` à `fail_rule_6`) et mock multi-dérive d'agrégation.
- **Garde de Mutation Déterministe (`scripts/edp-mutation-gate.ts`) (#176)** :
  - Analyseur de mutation Rego testant la résilience de l'oracle par suppression de règles (`drop_rule`).
  - Score de mutation atteint : **6/6 mutants tués (100 %)** sur ADR-012.
- **Contrat des Fixtures & Adresses Réservées (`validateFixturesContract.ts`) (#172)** :
  - Validateur exigeant exactement 1 mock conforme, 1 mock défaillant par règle ciblant un défaut unique, et le confinement strict de toutes les adresses IP aux plages documentaires RFC 5737 (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) et RFC 3849 (`2001:db8::/32`).
- **Tests** : 22 tests de contrat dans `tests/contract/edp-opa-runner.test.ts`, `tests/contract/edp-rego-common.test.ts` et `tests/contract/edp-adr012-reference.test.ts` (total 47 tests passants sur les Paliers 1 & 2).

### Paquet de Décision Exécutable (EDP) : Spécifications, Schémas & Invariants (Palier 1 - Issues #167, #168, #169, #170)
- **Proposition OpenSpec A12 (`openspec/changes/a12-edp/`) (#167)** :
  - Cadrage complet, spécification formelle (`proposal.md`, `design.md`, `tasks.md`, `.openspec.yaml`) ancrée dans la Constitution d'Archinex.
  - Déclinaison concrète des Invariants I (5 facettes), II (`verified × llm-derived` interdit sans validateur humain habilité), III (le silence n'est pas une approbation), IV (brouillon appât percutant), V (portes G3 et G4), VI (rétractation vers `stale`), VII (rôles formels) et X (matérialisation visuelle).
  - Convention normative de verdict à 4 états : `compliant | violated | not_applicable | insufficient_input`.
  - Documentation du cadre expérimental (`ARCHINEX_EXPERIMENTAL_EDP=1` et branche socle `experimental/edp`).
- **JSON Schema du Paquet de Décision Exécutable (`src/lib/schemas/edp.schema.json`, `validateEdp.ts`) (#168)** :
  - Définition du schéma JSON Draft-07 couvrant `metadata`, `decision_context`, `refinement_contract`, `verification_oracle` et `provenance`.
  - Rejet systématique de tout paquet dépourvu de `verification_oracle` ou de suite `self_test`.
  - Fixtures valides (`valid-adr012-baremetal.json`, `valid-adr015-security-zones.json`) et 8 fixtures invalides typées.
- **Contrôle de Pureté de l'Intension (`src/lib/domain/edp/intentionPurity.ts`) (#169)** :
  - Détection lexicale et regex des valeurs d'instanciation physique ou logique : IPv4, IPv6, préfixes CIDR, adresses MAC et noms d'hôtes pointés dans `decision_context`.
  - Liste blanche stricte garantissant zéro faux positif sur les numéros de version logicielle (`RKE2 1.28`, `5.5`), spécifications (`3GPP TS 23.501`, `RFC 5737`), métriques (`5QI 128-254`, `VLAN 100`, `MTU 1500`) et gabarits (`<IP>`, `${NODE_IP}`, `example.com`).
  - Fonction pure, déterministe et isolée de tout appel réseau.
- **Contrat d'Entrée de Raffinement (`src/lib/schemas/refined_input.schema.json`, `validateRefinedInput.ts`) (#170)** :
  - Schéma et validateur des entrées de raffinement (LLD) avec métadonnées de provenance obligatoires (`tool`, `version`, `command`, `sha256`, `generated_at`).
  - Élimination des faux positifs par vacuité : verdict `insufficient_input` dès qu'une source déclarée est manquante ou vide.
  - Rejet des sources non déclarées (`verdict: violated`).
- **Tests** : 25 tests de contrat dans `tests/contract/edp-schema.test.ts`, `tests/contract/edp-intention-purity.test.ts` et `tests/contract/edp-refined-input.test.ts`.

### Rendu Graphique : Aperçu Plein Écran au Maintien du Clic & Spécification Sécurité Télécom S6a
- **Aperçu Plein Écran Dynamique au Maintien du Clic (`MermaidViewer`)** :
  - L'appui maintenu (clic gauche enfoncé) sur n'importe quel diagramme Mermaid l'affiche instantanément en surcouche plein écran haute lisibilité (`backdrop-blur`, dimensions maximales de l'écran, zoom optimisé).
  - Le relâchement de la souris (`pointerup`, `mouseup` ou sortie d'écran) referme immédiatement l'overlay et replace l'utilisateur dans son flux de travail.
  - Possibilité complémentaire de verrouiller le mode plein écran via le bouton dédié ou de quitter avec la touche Échap.
  - Ajout d'un indicateur discret d'aide ergonomique au survol du graphe.
- **Topologie & Séquence Télécom 3GPP S6a (IPsec ESP & Médiation DEA)** :
  - Prise en charge des architectures réseau critiques avec interconnexion sécurisée entre lots (ex: Lot 3 MME Tiers ↔ Lot 1 Cœur / HSS).
  - Diagramme d'architecture cible générant les 3 zones de confiance : Réseau Tiers (MME), DMZ de sécurité (SecGW-Lot1 en terminaison IPsec ESP + DEA-Lot1 en médiation Diameter / masquage topologique TH), et Cœur souverain (HSS-Lot1) avec matérialisation explicite du flux direct non chiffré formellement interdit.
  - Diagramme de séquence 3GPP en 4 phases : négociation IKEv2 / SA ESP, encapsulation/décapsulation IPsec, inspection Diameter S6a (AVP / TH) par le DEA, et résolution sécurisée HSS.
- **Tests & Assurance Qualité** :
  - Nouveaux tests de contrat dans `tests/contract/artifact-projections.test.ts` validant la projection déterministe de la topologie réseau et de la séquence S6a.

### Ergonomie de Délibération & Phase 3 : Filtrage par Lots/Parties et Sélecteur de Sujets L4
- **Filtre Lots / Parties dans le Fil de Délibération (`SubjectConversationList`)** :
  - Intégration de la barre de filtrage par lots d'architecture (`FolderKanban`) dans le fil de délibération, alignée sur celle du tableau de maturité.
  - Synchronisation bidirectionnelle de `selectedPartId` via le store `deliberationStore`, garantissant que le lot sélectionné est conservé lors du passage entre le Tableau de maturité, le Fil de conversation et la Phase 3.
  - Mise à jour dynamique des compteurs de filtres rapides (« Tous », « Bloqués », « À faire », « Arbitrés ») en fonction du lot sélectionné.
- **Sélecteur de Sujet en Phase 3 Rendu & Homologation (`Phase3SubjectSelector`)** :
  - Composant interactif en tête de la Phase 3 permettant de re-sélectionner instantanément le sujet ciblé sans devoir retourner en Phase 2.
  - Pré-filtrage par défaut sur les sujets **🎯 Spécifiés L4** (prêts pour l'homologation), avec bascule vers les sujets **⚖️ Arbitrés L3+** ou **Tous les sujets**.
  - Repli intelligent automatique vers L3+ ou Tous si aucun sujet n'a encore atteint le palier L4 dans le projet actif.
  - Sélecteur de lots d'architecture intégré (`FolderKanban`) et recherche textuelle rapide (§11, WAPT, réseau, etc.).
  - Sélection réactive du sujet (`deliberationStore.selectSubject(id, false)`) sans altérer le mode de vue actif.
- **Tests & Assurance Qualité** :
  - Nouveau test de contrat dans `tests/contract/phase3-subject-selector.test.ts` validant le pré-filtrage L4, la synchronisation du store et le repli sans erreur.

### Phase 3 Rendu & Homologation : Intégration du Schéma d'Architecture Cible Spécifiée et Déploiement Sécurisé
- **Rendu d'Architecture Technique vs Graphe Décisionnel** :
  - Introduction du générateur déterministe `generateTargetArchitectureDiagram` dans `artifactProjections.ts`, aligné sur les patterns ArcKit (`arckit-diagram` C4 Container / Flowchart).
  - Matérialisation concrète des frontières architecturales : périmètre de la solution autonome (modules, agents embarqués, console, métrologie locale) vs périmètre du SI existant/client (supervision, logs/SIEM, dépôts).
  - Représentation explicite des flux d'interfaces avec leurs protocoles (SNMP Trap, API REST, Syslog TLS) et de la chaîne de confiance (paquets signés, guichet de validation humaine, agents de déploiement).
- **Chaîne de Déploiement et Séquence d'Homologation** :
  - Ajout de `generateDeploymentSequenceDiagram` modélisant les 3 phases de déploiement et d'homologation : 1. Construction & signature cryptographique, 2. Porte d'homologation / validation humaine en recette/INT, 3. Déploiement sécurisé avec vérification de signature.
- **Expérience Utilisateur en Phase 3 (Rendu & Homologation)** :
  - Dans `ArtifactRegenerationHub.svelte`, ajout d'un sélecteur de vues Mermaid : **🎯 Architecture Spécifiée (Cible)** (vue par défaut), **🔄 Chaîne de Déploiement & Homologation** (séquence) et **⚖️ Graphe Décisionnel (Auditabilité)** (arbre causal épistémique).
  - Dans `HldFragmentView.svelte`, affichage interactif direct du schéma d'architecture spécifiée sous la décision actée.
  - Dans `renderHldFragmentMarkdown`, inclusion automatique du bloc ```mermaid` dans le dossier Markdown exporté.
- **Tests & Assurance Qualité** :
  - Nouveaux tests de contrat dans `tests/contract/artifact-projections.test.ts` et `tests/contract/hld-fragment.test.ts` couvrant les cas hybrides complexes (supervision RATP, WAPT, validation humaine) et le fallback propre sans décision.


### Dépouillement RFP : Allègement de l'Interface & Retrait des Modèles Pré-intégrés Factices
- **Allègement de la modale de confrontation et factorisation RFP (`RfpConfrontationDialog`)** :
  - Retrait du mode et du bouton « Modèles Pré-intégrés » au profit d'un flux d'entrée épuré par défaut centré sur les documents réels (**Fichier Local**, **Coller le texte**, **URL Web**).
  - Suppression de la grille encombrante des cartes de modèles d'exemple à l'ouverture de la boîte de dialogue.
  - La zone de texte et les métadonnées s'initialisent désormais vierges pour un traitement direct sans artefacts de démonstration.
  - L'échantillon de vérification humaine et le rapport d'extraction ne s'affichent que dynamiquement lorsqu'un texte réel est chargé ou saisi.
- **Documentation et Protocole Opérateur** :
  - Clarification de la valeur ajoutée de l'échantillon de vérification humaine (contrôle rapide anti-hallucination sur les anomalies prioritaires, faisabilité en 2 minutes).
  - Guide opérationnel détaillé dans `docs/user-guide.md` sur la conduite à tenir par l'opérateur en cas d'anomalie de découpage.
### Initialisation d'Espace de Travail : Allègement des Étapes 1 et 3
- **Étape 1 (Cadrage & Description)** :
  - Retrait du bloc « Démarrage Éclair · Présets Métiers » (et « Démarrage Rapide » dans la modale) au profit d'une interface épurée sans présélection ferroviaire ou cloud souverain par défaut.
- **Étape 3 (Docs Amonts)** :
  - Suppression de la bannière redondante « Invariant Épistémique · Patrimoine Commun Enrichi » pour aérer l'espace visuel.
  - Suppression du bloc « Lier des Normes & Standards Déjà Présents dans le Socle Commun », les référentiels réglementaires et standards applicables étant déjà formellement sélectionnés à l'Étape 2.
- **Alignement Complet** :
  - Application synchronisée sur la page pleine `/workspaces/new` et la boîte de dialogue modale `CreateWorkspaceDialog.svelte`.
  - Ajout du test de non-régression dans `tests/contract/workspace-creation.test.ts`.

### Titre de l'Application : Remplacement du Titre Boilerplate par « archinex »
- **Harmonisation de la bannière et des locales** :
  - Remplacement de la chaîne boilerplate `A small app to have fun` (et ses déclinaisons `Une petite app pour rigoler` / `Una pequeña aplicación para divertirse`) par `archinex` dans tous les dictionnaires de localisation (`en.json`, `en-UK.json`, `fr-FR.json`, `es.json`).
  - Alignement de la valeur par défaut dans `src/routes/+layout.svelte` et de la balise `<title>` sur la page de connexion (`src/routes/login/+page.svelte`).
  - Ajout du test de contrat de non-régression dans `tests/contract/app-title.test.ts`.


### Démo LUMICC : Ensemencement Complet des 16 Sujets d'Architecture (seed:lulu)
- **Extension de l'engagement lumicc-lot1-noc post-ingestion** :
  - Passage de 7 à 16 sujets d'architecture d'entreprise et de solution au niveau L1_framed.
  - Couverture exhaustive des 12 thématiques factorisées du RFP Section 4 (NOC & Résilience) : haute disponibilité, médiation OSS/NRM, supervision RAN MNO, RCA/AIOps, collecte NOC/SOC, automatisation SMO, gouvernance QoS 5QI, assurance de service (sondes E2E) et CMDB.
  - Préservation des options en draft et des pondérations multicritères MCDA sur l'ensemble des sujets.
  - Mise à jour du contrat de test seed-lulu.test.ts.

### Référentiels & Doctrine : Auto-enrichissement IA et Suggestions Locales Sans Dépendance Serveur Hub (#93 & #99)
- **Suppression de la dépendance LLM côté LLMOps & Résolution du 404** :
  - Déplacement de l'inférence des suggestions doctrinales dans Archinex via `LocalLlmClient` (Ollama local / API Claude) et heuristiques déterministes `FRAMEWORK_TOPIC_PATTERNS`.
  - L'endpoint unitaire `POST /api/frameworks/ingestions/[id]/requirements/[reqId]/suggest-links` prend le relais localement si le Hub ne sert pas la route (évite l'erreur HTTP 404).
- **Auto-enrichissement « Zéro Friction » post-ingestion** :
  - À chaque ingestion de référentiel (`POST /api/frameworks/ingestions`), Archinex pré-génère immédiatement les critères d'acceptation, les liaisons vers les principes/patrons actifs et les termes de recherche, puis les soumet au Hub via `POST .../link-proposals`.
  - Ajout d'une route `POST /api/frameworks/ingestions/[id]/auto-suggest` et du bouton « Auto-enrichir par l'IA » dans l'interface pour enrichir un référentiel existant en un clic.
  - Intégration de tests de contrat complets dans `tests/contract/framework-auto-suggest.test.ts`.

### Délibération : Clarté et restitution détaillée des erreurs de validation de décision (#35)
- **Restitution explicite des contraintes d'arbitrage (`POST /decision` & IHM)** :
  - Restitution dans le message d'erreur des champs en défaut précis (ex: motivation trop courte, option retenue absente, justification de dispense incomplète) plutôt qu'un message générique bloquant « Données de décision invalides ».
  - Intégration du détail des erreurs de validation dans `OptionsMatrix.svelte`, `DecisionSurveyCard.svelte` et `ArbitrationPanel.svelte`.
  - Ajout des tests de contrat validant les contraintes Zod de `CreateDecisionSchema` et l'explicitation des erreurs.

### Délibération : Élimination de la mutation d'état interdite dans le calcul du rapport de maturité (#35)
- **Correction Svelte 5 (`state_unsafe_mutation` dans `SubjectThreadView.svelte`)** :
  - Remplacement de la mutation directe en place de l'objet `$state criteriaReport` au sein de la rune `$derived.by(effectiveReport)` par une dérivation pure et fonctionnelle.
  - Résolution du crash complet du Workbench de délibération à l'exécution.


### Délibération & RBAC : Clarification du Critère d'Homologation Lead Architect (#35)
- **Conservation du jalon L4/L5 validé (`maturityCriteria.ts`)** :
  - Dès lors qu'un sujet a été homologué (`L4_specified` ou `L5_archived`), le critère `lead_architect_approval` reste marqué comme satisfait pour tous les profils consultant le dossier.
  - Lorsque le sujet est en attente d'homologation (`L3_decided`), la description du critère explicite clairement le rôle requis (`Lead Architect`) en miroir du rôle actif de la session (ex: `expert`, `contributeur`), dissipant tout malentendu avec une désynchronisation de données.


### Délibération & Homologation : Franchissement du Jalon L4 et Visibilité de l'Affirmation (#35)
- **Affirmation formelle de décision (`DecisionSurveyCard` & `arbitrationDb`)** :
  - Restitution systématique de l'événement `DECISION_ASSERTED` dans `getSubjectArbitrationContext` via le champ `validatedBy`.
  - Masquage automatique du bouton d'action *"Affirmer la décision et ses faits"* une fois l'affirmation actée par un pair, au profit du bandeau vert d'autorité certifiant le décideur habilité.
- **Homologation de la Spécification Technique (Jalon L4)** :
  - **Correction du faux blocage `FORMAL_DECISION_REQUIRED`** : `deliberationStore.setSubjectLevel` et la route API `PATCH /subjects/[id]` n'exigent plus l'arbitrage formel lorsqu'un sujet est déjà acté (`L3_decided`) et qu'il franchit le jalon d'ingénierie `L4_specified`.
  - **Prise en compte réactive de la spécification rédigée** : le critère `specification_drafted` est immédiatement validé dès lors qu'un contenu de spécification DLD est renseigné dans l'atelier, et synchronisé en base (`deliberationStatus: 'specified'`).
  - **Résolution des sous-sujets dérivés (A28)** : le bouton d'action du critère de sous-sujets non cadrés oriente directement vers l'onglet *Questions en cascade* pour cadrer les sous-sujets en attente.


### Délibération : Nettoyage syntaxique du composant fil de délibération (#35)
- **Correction du gabarit Svelte (`SubjectThreadView.svelte`)** :
  - Élimination d'un fragment dupliqué résiduel (balises fermantes orphelines et ré-instanciation de l'en-tête de spécification DLD) provoquant une erreur de compilation Svelte `block_unexpected_close`.


### Délibération & Ingénierie : Pédagogie des 5 Piliers Structurants et Atelier de Spécification DLD (#35)
- **Fil Directeur Pédagogique : Les 5 Piliers de la Délibération d'Architecture** :
  - Intégration dans le volet de spécification d'un bandeau visuel rappelant l'enchaînement logique et les questions clés pour l'architecte :
    1. *Question (Problème)* : « Quel problème résout-on ? » (affichage de la question d'architecture)
    2. *Cadrage & Hypothèse* : « Quelle est la cible initiale ? » (affichage de l'hypothèse de référence)
    3. *Options & Variantes* : « Quelles alternatives comparées ? » (compteur et état des options explorées)
    4. *Critères & Conformité* : « Sur quoi juge-t-on le choix ? » (compteur des critères opposables)
    5. *Arbitrage L3 Acté* : « Quelle option retenue et pourquoi ? » (décision arbitrée et motivée)
  - Clarification du bouton d'accès aux notes télégraphiques d'appoint (*« Consulter les notes télégraphiques brutes (5 colonnes) »*).
### Délibération : Persistance du Mode de Vue & Synchronisation LLMOps Silencieuse en Tâche de Fond
- **Persistance intégrale de la vue de délibération (`deliberationStore.svelte.ts`)** :
  - **Mémorisation du mode d'affichage et de la posture** : persistance automatique dans le `localStorage` du navigateur sous les clés `archinex:deliberationViewMode:<id>` (`board` vs `conversation`) et `archinex:activePosture:<id>` (`appropriation`, `deliberation`, `rendu`), en complément de `archinex:activeSubjectId:<id>`.
  - **Navigation et rechargement sans perte de contexte** : lors d'un rechargement de page ou d'une navigation transversale, l'utilisateur conserve sa posture et son panneau exact (ex: le fil de délibération sur un sujet spécifique), évitant le renvoi automatique et intempestif sur le tableau de maturité global.
  - **Support des paramètres d'URL explicites** : dans `src/routes/deliberation/+page.svelte`, prise en compte prioritaire des paramètres de requête (`mode`, `subject`, `posture`) si présents.
- **Synchronisation d'arrière-plan silencieuse (`silent: true`)** :
  - **Suppression des alertes / toasts intempestifs** : ajout du drapeau `options.silent` dans `deliberationStore.syncWithLLMOps`. Les vérifications et synchronisations automatiques en tâche de fond (sur `onMount` de `/deliberation` et du badge d'en-tête `LLMOpsStatusBadge`) opèrent désormais silencieusement sans bombarder l'utilisateur de notifications toast.
  - **Conservation du retour visuel sur action explicite** : les clics manuels sur les boutons de synchronisation ou de test de connexion continuent d'afficher les notifications de confirmation ou d'erreur.
  - **Protection contre la réinitialisation de l'engagement actif** : validation de l'existence de l'identifiant d'engagement retourné par LLMOps avant toute affectation pour prévenir la désélection inopinée du projet courant.
- **Tests** :
  - Extension de la suite de contrat `tests/contract/deliberation-localstorage-subject.test.ts` (8 tests) couvrant la persistance et la restauration de `deliberationViewMode` et `activePosture` lors de `initFromDb` et `switchEngagement`, ainsi que le comportement sans toast de `syncWithLLMOps(..., { silent: true })`.
### Délibération & Ingénierie : Atelier de Spécification Détaillée (DLD) et Bandeau Doctrinal Rétractable (#35)
- **Bannière de Spécification Haut Niveau (Décision L3)** :
  - Dès qu'une décision d'arbitrage est opposable (`L3_decided`), le volet *« 📚 Doctrines, RFP & Brouillon »* ancre en tout début la décision d'arbitrage actée : option retenue, réversibilité, contresignature de l'arbitre et justification technique (`rationale`).
  - La rédaction de la spécification détaillée découle ainsi directement et formellement de la décision prise en amont.
- **Tiroir Doctrinal Rétractable (`isDoctrineDrawerOpen`)** :
  - Remplacement de l'ancienne colonne doctrine de 50% par un bandeau accordéon compact cliquable, libérant l'intégralité de la largeur d'écran pour le travail d'ingénierie et de rédaction.
- **Atelier de Rédaction Technique (DLD - Spécification Détaillée)** :
  - Assistant IA (`✨ Pré-remplir avec l'IA`) pour pré-remplir instantanément la trame d'ingénierie (composants, flux, interfaces, protocoles) à partir de l'option arbitrée et de ses motivations.
  - Espace de saisie markdown libre avec persistance locale automatique par sujet (`localStorage`).
  - Actions immédiates : bouton de sauvegarde `💾 Enregistrer` et bouton d'homologation formelle `✅ Homologuer Spécification (L4)`.
  - Bascule optionnelle vers la vue grille télégraphique en 5 colonnes.
- **Tests** :
  - Extension de la suite de contrat `tests/contract/deliberation-conversation.test.ts` vérifiant l'affichage de la spécification haut niveau, la présence du tiroir de doctrine et des commandes de l'atelier DLD.


### Boîte de Réception des Revues KB : Filtrage Anti-Auto-Évaluation & Séparation des Tâches (#131)
- **Prévention de l'auto-évaluation dans la Boîte de Réception (`/kb/reviews`)** :
  - **Filtre par défaut « À examiner uniquement (exclure mes clauses) »** : la boîte de réception n'affiche par défaut que les clauses soumises par des tiers pour lesquelles l'expert connecté est habilité à statuer, évitant de découvrir a posteriori sur la page d'examen qu'il est l'auteur de la clause et qu'il ne peut pas s'auto-évaluer.
  - **Distingo clair Auteur vs Relecteur** :
    - Calcul automatique de `isAuthor` via `isCandidateAuthor` comparant l'auteur au handle d'expert (`@handle`) ou à l'adresse e-mail de session.
    - Remplacement du bouton d'action principal `Examiner` par un bouton secondaire `Consulter (Auteur)` (`btn-view-own-candidate`) avec infobulle rappelant la règle de séparation des tâches.
    - Ajout du badge visible *« Votre clause (Auteur) »* avec icône de cadenas et mention explicite *(Vous)* à côté du nom de l'auteur.
  - **Comptage et alertes de retard contextualisés** : les alertes de retard (Porte G5) ne comptabilisent que les revues en retard que l'expert connecté peut effectivement débloquer.
  - **Support API souverain** : prise en charge du paramètre `exclude_own=true` et transmission du handle d'acteur sur `GET /api/knowledge/reviews/inbox` et `LLMOpsClient.getReviewInbox`.
- **Tests** :
  - Nouvelle suite de tests de contrat `tests/contract/kb-review-inbox-authorship.test.ts` validant le marquage `isAuthor`, le filtrage avec `excludeOwn`, la visibilité croisée pour les pairs et l'interdiction constitutionnelle d'auto-évaluation.
### Capitalisation Knowledge Hub : Intégration Directe du Panneau Porte G4 dans la Matrice Multi-Critères
- **Intégration et scroll fluide (`OptionsMatrix.svelte`, `SubjectThreadView.svelte`)** :
  - Montage direct du composant `CapitalizationPanel` sous la grille d'options (`#capitalization-section`) dès qu'une décision d'architecture est actée (`L3_decided`).
  - Fonctionnement immédiat du bouton « Candidats KB (G4) » de la bannière de fil de délibération : le clic bascule sur l'onglet matrice et défile directement jusqu'à la section de capitalisation, permettant à tout architecte de préparer et soumettre les candidats sans navigation superflue.
- **Tests** : extension de la suite de contrat `tests/contract/options-matrix-view.test.ts` validant la présence de `id="capitalization-section"` et du bouton de préparation des candidats.

### Matrice Multi-Critères : Amélioration de la Visibilité du Bouton « Modifier » des Options Humaines
- **Affichage et ergonomie renforcée (`OptionsMatrix.svelte`)** :
  - Style visuel rehaussé pour le bouton `Modifier` dans l'en-tête de colonne avec badge violet contrasté (`bg-purple-500/10 text-purple-700 border-purple-500/30`), supprimant le masquage adaptatif (`hidden sm:inline`) pour garantir la présence permanente du libellé textuel quelle que soit la largeur de colonne ou la taille d'écran.
  - Correction du typage strict TypeScript sur le filtre d'origine (`opt.origin === 'human'`).
  - Bouton `Éditer` mis en valeur dans le cadre de détails déplié.

### Matrice Multi-Critères : Édition Directe des Propositions d'Architecture Humaines & Re-jeu de Conformité
- **Modification des options humaines (`OptionEditor.svelte`, `OptionsMatrix.svelte`)** :
  - Ajout d'un bouton `Modifier` (`Edit3`) directement dans l'en-tête de colonne des options proposées par un opérateur ou architecte (`origin === 'human' || origin === 'architect'`), ainsi qu'un bouton d'action `Éditer` dans le bloc déplié de résumé technique (`Détails`).
  - Pré-remplissage complet de la modale (`OptionEditor.svelte`) avec les données existantes (titre, résumé, origine) via la prop `initialData`.
  - Prise en charge de la mise à jour asynchrone via `PATCH /api/projects/:projectId/subjects/:subjectId/options/:optionId` avec contrôle de concurrence optimiste (`expectedVersion`).
  - Réévaluation et rafraîchissement automatique instantané de la conformité doctrinale (`/compliance`) dès l'enregistrement de l'option modifiée, permettant de vérifier en direct si la reformulation lève ou non une clause de non-conformité (ex: négation levée).
- **Tests** : extension de la suite de contrat `tests/contract/options-matrix-view.test.ts` validant la présence du bouton `Modifier` sur les propositions humaines et son masquage sur les propositions LLM.


### Matrice Multi-Critères : Explicitation des Termes Déclencheurs / Violés dans les Alertes de Conformité
- **Infobulle et diagnostic granulaire de conformité (`OptionsMatrix.svelte`)** :
  - Enrichissement de l'infobulle (`title`) de l'étiquette « Non conforme » au survol : mention explicite des termes détectés dans le texte de l'option (`matchedTerms`) ayant déclenché la clause ou l'interdiction (`• Termes détectés / déclencheurs : « ... »`).
  - Affichage direct des termes déclencheurs dans le bandeau rouge de décision L3 (« Conformité réglementaire de l'option retenue ») pour guider l'architecte dans la justification de l'écart ou la rectification du texte.
- **Tests** : extension de la suite de contrat `tests/contract/options-matrix-view.test.ts`.


### Préférence Utilisateur : Mémorisation du Dernier Sujet de Délibération dans le LocalStorage
- **Persistance automatique et scopée par espace (`deliberationStore.svelte.ts`)** :
  - Enregistrement réactif du sujet actif sélectionné dans le `localStorage` sous la clé `archinex:activeSubjectId:<engagementId>` lors de l'appel à `selectSubject(id)`.
  - Scoping par projet / engagement évitant toute collision ou incohérence de référence d'un projet à l'autre.
- **Restauration fluide et sécurisée** :
  - Restauration automatique du dernier sujet consulté lors de l'hydratation initiale (`initFromDb`) et lors du basculement d'espace de travail (`switchEngagement`).
  - Validation défensive d'intégrité : vérification que le sujet mémorisé appartient bien aux sujets actifs de l'engagement, avec repli gracieux et transparent sur le sujet par défaut (`defaultSubjectId` ou premier sujet) en cas de suppression ou d'incohérence.
- **Navigation unifiée (`KnowledgeNodePanel.svelte`)** :
  - Alignement de la navigation depuis la vue graphe de connaissances (`navigateToSubject`) pour utiliser `selectSubject` et bénéficier de la persistance locale automatique.
- **Tests** :
  - Suite de tests de contrat dédiée `tests/contract/deliberation-localstorage-subject.test.ts` validant la persistance sous clé scopée, la restauration lors de `initFromDb`, le rabat en cas d'identifiant obsolète et la rétention lors d'allers-retours entre différents projets.

### Matrice Multi-Critères : Déblocage de la Création d'Options/Critères (Schéma Zod API) & Ajout Réactif
- **Correction du schéma de validation de l'API (`optionsApiSchemas.ts`, `optionsDb.ts`)** :
  - Rendu du champ `id` optionnel (`id: z.string().min(1).optional()`) dans `CreateOptionSchema`, `CreateCriterionSchema` et `CreateTradeOffSchema`, levant l'erreur HTTP 400 (Validation failed) lors de l'ajout manuel d'une proposition par un opérateur.
  - Génération automatique déterministe de l'identifiant côté backend dans `createTradeOff` si non spécifié par le client (aligné sur `createOption` et `createCriterion`).
- **Déballage réactif et remontée granulaire des erreurs (`OptionsMatrix.svelte`)** :
  - Déballage systématique de la réponse API (`created.option ?? created`, `created.criterion ?? created`, etc.), garantissant l'apparition instantanée de la 4ᵉ colonne (et des suivantes) avec son libellé et son icône d'origine humaine dans la matrice sans nécessiter de rafraîchir la page.
  - Extraction granulaire des erreurs HTTP (`err.reason || err.error || err.message`) avec messages d'action explicites en cas d'expiration de session (401) ou de droits restreints (403).
- **Attente asynchrone et maintien de la saisie (`OptionEditor.svelte`, `CriteriaEditor.svelte`)** :
  - Attente de la validation serveur (`await onSave(...)`) avant fermeture de la modale pour éviter les fermetures silencieuses sur échec réseau ou d'autorisation, et conservation des champs saisis en cas d'erreur.
  - État de soumission (`isSubmitting`) désactivant le bouton pendant le traitement pour éviter les doubles créations.
- **Tests** : extension des suites de contrat `tests/contract/options-evaluations.test.ts` (validation Zod avec/sans id) et `tests/contract/options-matrix-view.test.ts` (apparition dynamique de la 4ᵉ colonne).


### Délibération & Composeur Structuré : Feedback Visuel d'Erreurs, Droits d'Accès et Raccourci Clavier
- **Routage visuel des notifications vers le système de Toasts (`deliberationStore.svelte.ts`)** : connexion de `deliberationStore.logNotification` au système réactif `toast` (`$lib/toast`), garantissant que les notifications de succès, d'information et d'erreur (HTTP 401, 403, validation) s'affichent immédiatement sous forme d'alertes visuelles à l'écran plutôt que d'être silencieusement conservées en mémoire.
- **Gestion explicite des erreurs d'authentification et de droits (`StructuredComposer.svelte`, `SubjectThreadView.svelte`)** :
  - Extraction granulaire des messages d'erreur du backend (`err.reason || err.error || err.message`).
  - Messages clairs et actionnables en cas de non-authentification (HTTP 401 avec invitation à se connecter sur `/login`) ou de droits insuffisants (HTTP 403 réservé aux membres du projet).
  - Remontée d'erreur explicite lors de l'adoption d'une hypothèse de cadrage (`handleAdoptHypothesis`).
- **Ergonomie du composeur structuré (`StructuredComposer.svelte`)** :
  - Ajout du raccourci clavier `Ctrl+Enter` / `Cmd+Enter` pour soumettre directement un argument ou une hypothèse étayée, ou afficher immédiatement le champ manquant requis.
  - Signalisation visuelle rehaussée (`bg-amber-500/10 border-amber-500/25`) de la raison de validation (obligation de fondement étayé d'au moins 5 caractères).
- **Tests** : extension de la suite de contrat `tests/contract/structured-composer.test.ts` validant la propagation des notifications vers la file des toasts réactifs.
### Lisibilité & Ergonomie de la Matrice Multi-Critères (Options & Propositions Longues)
- **Affichage multi-lignes sans tronquage (`OptionsMatrix.svelte`)** : suppression de la coupure forcée `line-clamp-1` sur les titres de propositions au profit d'un retour à la ligne naturel (`whitespace-normal break-words leading-snug`), préservant l'intégralité des intitulés longs même complexes.
- **Largeur optimisée des colonnes d'options** : passage de `min-w-[170px]` à `min-w-[220px] max-w-[320px]` pour offrir un espace de lecture aéré sans dégrader le défilement horizontal.
- **Badges d'identification rapides (`Option A`, `Option B`...)** : attribution automatique d'un repère visuel standardisé pour chaque colonne facilitant le repérage et la comparaison.
- **Tiroir / bouton de détails pour le résumé technique** : intégration d'un bouton `Détails` (`Info`) dans chaque en-tête permettant de déplier/replier le résumé technique (`opt.summary`) de la proposition directement dans la grille, complété par des infobulles natives (`title`) complètes au survol.
- **Tests** : suite de tests de contrat dédiée `tests/contract/options-matrix-view.test.ts` validant l'affichage des badges, l'enroulement multi-lignes, les infobulles et les dimensions des colonnes.

### Ergonomie de la Délibération : Espace Sujet Unifié, Vue Split par Défaut, Liste Repliable et Capitalisation G4 Contextualisée
- **Fusion du panneau principal et du Dossier du sujet (`DeliberationWorkbench.svelte`, `SubjectThreadView.svelte`)** : suppression de la 3e colonne redondante au profit d’un **Espace Sujet Unifié** (9 à 12 colonnes) structuré autour d’un en-tête unique, de la timeline horizontale de maturation en haut et de 4 volets complémentaires sans doublon (`💬 Délibération & Cadrage`, `⚖️ Options, Matrice & Arbitrage`, `📚 Doctrines, RFP & Brouillon`, `🌿 Cascade & Règles`).
- **Repli de l'arbre des sujets (`SubjectConversationList.svelte`, `DeliberationWorkbench.svelte`)** : ajout d'un bouton `⇥ Replier` masquant la colonne des sujets pour donner 100% de la largeur de l'écran (12 colonnes) au workbench, et bouton `📂 Sujets` dans l'en-tête du fil pour la redéplier à la demande.
- **Mode Split par défaut sur grand écran (`btn-toggle-split`)** : affichage côte à côte par défaut sur écrans larges du fil de discussion à gauche et de la matrice / analyse à droite, avec possibilité de basculer en pleine largeur.
- **Contextualisation selon le niveau de maturité et intégration Porte G4 (`CapitalizationPanel.svelte`, `SubjectThreadView.svelte`)** :
  - Masquage des formulaires d'arbitrage inaccessibles en phase `L0/L1` au profit d'un guide pédagogique d'exploration.
  - Activation de l'affirmation collégiale `K16`, des faits `K18` et de la capitalisation Porte G4 à partir du niveau `L3+`.
  - Bouton d'action proéminent « ✨ Préparer les Candidats KB maintenant » dans le panneau de capitalisation et raccourci direct dans le bandeau de décision du fil.
  - Actions contextualisées `📦 Préparer les candidats KB (G4)` ajoutées aux jalons `L3` et `L4` dans la timeline (`getMilestoneContextualActions`).
- **Suppression des duplications (`TelegraphicDraftView.svelte`)** : élimination des onglets imbriqués redondants en mode lecture seule pour afficher directement la synthèse des 5 colonnes.
- **Timeline horizontale de maturation (`L0 → L5`) avec critères et actions contextualisées (`MaturityStepper.svelte`)** : grille compacte des critères du jalon inspecté avec boutons d'actions humaines et agents IA.
- **Bandeau de Cadrage compact sur 2 lignes (`SubjectProblemCard.svelte`)** : synthèse en 2 lignes (Question centrale éditable in-place + pastilles Hypothèse, Dilemme, Exigences RFP, Questions métier et raccourci vers la Matrice), dépliable à la demande, sans dupliquer les cartes d’options dans le fil.
- Tests : `tests/contract/deliberation-conversation.test.ts` (15 tests de contrat).
### Démonstrateur LUMICC ("Lulu") : Ensemencement "Juste Après Ingestion" (`seed:lulu`)
- **Jeu d'essai LUMICC "Juste Après Ingestion" (`examples/lumicc-ingested/`)** :
  - Fourniture d'un état d'ingestion authentique issu de l'audit ArcKit J0 sur le Lot 1 (NOC, Cœur 5G PPDR & Résilience, 92 clauses).
  - Les 7 sujets d'architecture sont positionnés au niveau `L1_framed` avec dilemmes cadrés, options contrastées et critères multicritères pré-positionnés en statut `draft`.
  - Fil de délibération (`dialogue.json`) et énoncés scellés (`statements.json`) vierges, permettant de rejouer en séance les 4 scénarios clés de délibération architecturale (nominal, débat d'experts, blocage réglementaire, capitalisation Porte G4).
- **Script d'ensemencement idempotent (`scripts/seed-lulu.ts` & `npm run seed:lulu`)** :
  - Réinitialisation instantanée de l'espace projet `lumicc-lot1-noc` dans Prisma (`dev.db`).
  - Enregistrement automatique de l'audit de dépouillement `run_lumicc_live_j0` dans `factorization_runs` pour démonstration immédiate du jalon J0 depuis l'IHM.
- **Tests** : suite de tests de contrat dédiée `tests/contract/seed-lulu.test.ts`.


### Dépouillement RFP : suivi en arrière-plan, notifications Web, reprise sur quota et partitionnement résilient
- **Notifications d'arrière-plan & mise à jour du titre d'onglet (`backgroundAuditNotifier.ts`, `+layout.svelte`, `RfpConfrontationDialog.svelte`)** :
  - Support de l'API Web Notifications (`new Notification(...)`) informant l'utilisateur dès que le dépouillement en tâche de fond est terminé ou requiert une action, même si l'onglet est masqué ou en arrière-plan.
  - Titre dynamique de l'onglet pendant le traitement (`⏳ Tri des exigences (X/Y) · Archinex`) et signalétique immédiate à l'achèvement (`✅ (Prêt !)` ou `⚠️ (Reprise possible)`).
  - Toasts globaux persistants et écoute continue en arrière-plan dans `+layout.svelte` permettant de naviguer librement dans l'application sans perdre le suivi du dépouillement.
- **Détection des erreurs de quota/crédits LLM & Fast-Fail (`arckitRequirementsPipeline.ts`, `factorizationJobs.ts`)** :
  - Détection proactive des erreurs de solde insuffisant ou de quota (`isLlmCreditOrQuotaError`) chez les fournisseurs d'inférence (Anthropic, OpenAI, etc.).
  - Interruption rapide (Fast-Fail) dès qu'un lot échoue pour manque de crédit : arrêt immédiat des requêtes suivantes vouées à l'échec et omission de l'étape 3a afin de préserver les crédits restants et le temps d'attente.
  - Conservation intégrale en base de données SQLite/Postgres (`FactorizationStageCache`) de tous les lots validés avant la coupure.
  - Positionnement d'un statut explicite reprenable (`partial` avec message clair d'épuisement de crédits).
- **Mise en avant immédiate de la reprise dans l'interface (`RfpConfrontationDialog.svelte`)** :
  - Affichage d'un bandeau d'alerte spécifique et visible avec le bouton « Reprendre l'analyse » dès qu'une analyse est incomplète ou suspendue (sans contraindre l'utilisateur à naviguer dans l'historique déroulant).
  - Relance instantanée relisant les lots déjà validés depuis le cache local (durée de quelques millisecondes pour les étapes acquises).
- **Partitionnement sécurisé de l'étape de cartographie (`PARTITION_MAX_CHARS`)** :
  - Abaissement de `PARTITION_MAX_CHARS` de 1 200 000 à 250 000 caractères (~60 000 tokens) pour éviter les prompts monolithiques gigantesques (500k+ caractères) aux limites de contexte et de quotas de sortie, permettant un découpage en parties indépendantes mémorisées individuellement dans le cache de reprise.
- **Tests** : suite de tests de contrat dédiée `tests/contract/audit-background-notifications-and-resume.test.ts`.


### Performance & Fluidité : optimisation du Dashboard et des mini-apps (baisse de latence de 3,6 s à < 100 ms)
- **Cache mémoire en lecture & déduplication Singleflight (`LLMOpsClient`)** :
  - Mise en cache en mémoire des appels GET lourds (`/api/compliance/frameworks`, `/api/knowledge/health`, `/api/knowledge/checks`, `/api/knowledge/publications`, `/health`, `/snapshot/latest`) avec TTL adaptatif (30 s en nominal, 2 s en cas d'erreur transitoire).
  - Déduplication Singleflight des requêtes concurrentes : une seule requête est envoyée au backend LLMOps lorsque plusieurs composants ou requêtes SSR sollicitent la même ressource en parallèle.
  - Invalidation atomique du cache lors de toute mutation (`POST`, `PUT`, `PATCH`, `DELETE`) ou changement de `baseUrl`.
- **Allégement drastique des payloads SSR et API (`engagementsDb.ts`, `+page.server.ts`, `/api/engagements`)** :
  - Élagage des clauses textuelles lourdes (`keyClauses: []`) sur les vues globales tout en préservant le compteur `extractedClausesCount` pour les KPI et graphiques, réduisant la charge utile de 2,9 Mo à moins de 100 Ko (> 97 % de réduction).
  - Suppression des propositions temporaires mortes (`subjects.proposal`) lors de la restitution des listes de projets.
  - Élimination du double-fetch client redondant (`/api/engagements`, 2,7 Mo) dans `deliberationStore` via hydratation différée `queueMicrotask` lorsque les données sont déjà fournies par le SSR (`initFromDb`).
- **Résolution granulaire des icônes Lucide à la compilation (`vite.config.ts`)** :
  - Création du plugin Vite `lucideOptimizePlugin` transformant les imports barils globaux `import { ... } from 'lucide-svelte'` en imports directs `import Icon from 'lucide-svelte/icons/<kebab>'`.
  - Élimination du waterfall de 3 788 requêtes HTTP et compilation de 1 929 modules d'icônes en mode dev.
  - Navigation client instantanée entre Dashboard et mini-apps mesurée à moins de 100 ms (Workspaces : 36 ms, Délibération : 68 ms, Dashboard : 93 ms).
- **Tests** : suites de tests dédiées `tests/contract/llmops-client-cache.test.ts` (mise en cache, singleflight, invalidation) et `tests/contract/corpus-payload-optimization.test.ts` (intégrité des compteurs et réduction de taille de charge utile).

### Client LLM (`LocalLlmClient`) : chargement automatique de `.env` sous `vite dev` et garde contre les requêtes Ollama sans modèle
- **Hydratation de `process.env` via `loadEnv` dans `vite.config.ts` et lecture de secours `.env` dans `LocalLlmClient` (`parseDotEnvFile`)** : sous `npm run dev` (`vite dev`), les variables non préfixées par `VITE_` (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `LLM_PROVIDER`, `LLM_LOCAL_ENDPOINT`, `LLM_LOCAL_MODEL`) n'étaient pas injectées dans `process.env`, ce qui faisait basculer `localLlmClient` sur `http://localhost:11434` avec un modèle vide `""` (`HTTP 400 {"error":"model is required"}`). Le client résout désormais les variables d'environnement depuis `process.env` avec repli automatique sur `.env`.
- **Auto-découverte ou erreur explicite sur `chatLocal` sans modèle** : lorsqu'un appel local est tenté sans identifiant de modèle, `chatLocal` interroge d'abord `/api/tags` pour sélectionner un modèle local disponible et lève une erreur explicite (`Aucun modèle LLM configuré ni détecté`) au lieu d'envoyer `{"model": ""}` à Ollama.
- Tests : `tests/contract/local-llm-factorizer.test.ts` (chargement depuis un fichier `.env` temporaire et rejet explicite sans appel `/api/chat` lorsque `model` est vide).

### Capitalisation (Porte G4) : généralisation des décisions projet et conformité du contrat `POST /api/knowledge/candidates` vers LLMOps
- **Généralisation explicite en Porte G4** (`prepareSubjectKbCandidates` / `submitSubjectKbCandidates`) : une décision d'arbitrage initialement qualifiée `project_specific` par construction en Porte G3 peut désormais être anonymisée et généralisée par l'architecte en Porte G4 (`portability: 'reusable_architecture_doctrine'`, `harvestable: true`) afin d'être moissonnée par LLMOps et réutilisée comme doctrine à la délibération suivante.
- **Filtrage des métadonnées d'arbitrage** (`buildKbCandidates`, `prepareSubjectKbCandidates`, `submitSubjectKbCandidates`) : exclusion systématique des marqueurs techniques `COMPLIANCE_STATUS:*` et `PORTABILITY:*` stockés dans `acceptedViolations`, qui généraient auparavant de faux candidats `amendment` rejetés en `400 Bad Request` par LLMOps.
- **Normalisation complète du payload candidat LLMOps** (`formatCandidateProposedContent`, `normalizeKbDomain`, `normalizeTargetAssetId`, `inferCandidateAssetType`) : génération systématique de `proposed_content` (front matter YAML `PAT-xxx` / `ADR-xxxx` + sections Markdown réglementaires), `asset_type`, `target_asset_id`, `domain` normalisé (`general` -> `architecture`) et `evidence` d'engagement, avec anonymisation intégrale incluant l'identifiant et le nom court du projet.
- **Protection du niveau de maturité `L3_decided`** (`saveEngagementProfile` dans `engagementsDb.ts`) : préservation garantie du niveau `L3_decided` lorsqu'une décision existe en base lors d'une synchronisation du profil d'engagement.
- Tests : `tests/contract/capitalization.test.ts` et `tests/integration/kb-capitalization.test.ts`.

### Clauses vérifiables : rédaction assistée d'une clause pour les contrôles sans clause (archinex#99)
- **Bouton « Proposer une clause »** : sur `/kb/clauses` (onglet « Contrôles sans clause »), chaque contrôle obligatoire dépourvu de clause dispose désormais d'un bouton d'action dédié permettant de générer une proposition assistée par IA (`Sparkles`).
- **Générateur IA bilingue (`clauseDrafter.ts`)** : dérivation automatique de clauses déterministes structurées (`kind: 'requires' | 'forbids'`, `when.terms_any`, `expect.terms_any`, `message`) à partir du texte officiel de l'exigence et des métadonnées du contrôle. Les termes déclencheurs et attendus sont générés systématiquement en français et en anglais afin de couvrir les options rédigées dans l'une ou l'autre langue. Provenance marquée `llm-derived`.
- **Repli déterministe résilient** : en cas d'indisponibilité, d'absence de configuration du modèle ou de délai dépassé, un mécanisme de repli thématique et lexical (analyses des risques, sauvegardes et PCA/PRA, authentification et MFA, chiffrement, gestion des incidents, chaîne d'approvisionnement, vulnérabilités, journalisation) garantit la production immédiate d'une clause conforme sans jamais bloquer l'utilisateur par une erreur HTTP 500.
- **Atelier interactif d'amendement et banc d'essai** : le relecteur peut modifier les déclencheurs, conditions attendues, message explicatif et type de règle, et tester immédiatement la clause proposée sur une option d'architecture libre (« Essayer sur une option ») pour observer le verdict de conformité déterministe (`verdict: 'violates' | 'supports'`) avant enregistrement.
- **Cycle de vie non bloquant dans LLMOps** : l'enregistrement soumet la clause avec le statut `draft` et la provenance `llm-derived` (`POST /api/kb/clauses/[assetId]/save-draft`). Elle rejoint la file de relecture de doctrine sans bloquer les arbitrages d'architecture tant qu'un relecteur habilité ne l'a pas formellement validée (conformément au contrat LLMOps 1.26).
- **Navigation directe par onglet** : support du paramètre d'URL `?tab=missing` (ou `tab=draft`, `validated`, `rejected`) sur `/kb/clauses`.
- **Tests** : suite de tests de contrat dédiée `tests/contract/issue_99_assisted_clause_drafting.test.ts` (8 tests couvrant la génération IA, le repli déterministe bilingue, la protection 401/400 des routes API, la persistance `draft` dans fakeLLMOps et le rendu SSR).
### Base de connaissances : extraction du motif de conflit 409 et explication 4 yeux lors de la publication d'ingestion (archinex#156)
- **Extraction du motif Hub (409 Conflict)** : dans `LLMOpsClient.applyFrameworkIngestion`, extraction de `body.reason || body.error` (au lieu du seul `body.error`), permettant de restituer le motif précis renvoyé par l'enveloppe normalisée du Knowledge Hub (ex. `separation_of_duties` ou `the ingestion is abandoned`) au lieu du repli générique « Conflit lors de l’application ».
- **Transmission HTTP dans la route API** : la route `POST /api/frameworks/ingestions/[id]/apply` transmet désormais `reason` et `code: 'separation_of_duties'` en cas de conflit HTTP 409.
- **Interface utilisateur (/kb/frameworks/[id])** :
  - Affichage du motif exact dans l'alerte d'erreur lors d'une tentative de publication bloquée (titre adapté « Publication bloquée (Conflit 409) » au lieu de « Déclaration Bloquée »).
  - Détection du motif `separation_of_duties` : affichage d'un titre explicite « Séparation des fonctions requise (contrôle des 4 yeux) » et d'un encart explicatif dédié rappelant le principe du contrôle des 4 yeux / revue indépendante (règle d'intégrité issue #91) invitant à confier la publication à un pair mainteneur qui n'a pas instruit les exigences.
- Tests : `tests/contract/kb-apply-conflict-reason.test.ts` (7 tests de contrat couvrant l'extraction des motifs 409/403/400 dans le client LLMOps, la route API `apply` et le rendu SSR de l'alerte avec explication des 4 yeux).


### Référentiels réglementaires : visibilité, masquage des ingestions abandonnées et liens directs (/kb/frameworks)
- Lorsqu'aucun référentiel de conformité n'est encore recensé dans le snapshot actif (`GET /api/compliance/frameworks` vide), la section supérieure de `/kb/frameworks` affiche désormais des liens directs cliquables vers les lots d'ingestion disponibles (ex: `/kb/frameworks/{id}`).
- **Masquage des ingestions abandonnées** : les lots d'ingestion ayant le statut `abandoned` ne sont plus comptabilisés ni listés dans l'encart d'alerte supérieur (« X lots d'ingestion disponibles en revue ») ni dans la vue par défaut de l'historique (`statusFilter === 'all'`).
- Un onglet dédié « Abandonnées » permet d'accéder spécifiquement aux ingestions archivées, tandis que l'onglet par défaut liste « Toutes les actives ».
- L'accordéon inférieur « Historique des Ingestions » ne s'ouvre automatiquement par défaut que s'il existe des ingestions actives non abandonnées.
- Sur la page de détail d'un lot d'ingestion (`/kb/frameworks/[id]`), lorsqu'une ingestion est abandonnée : affichage d'un bandeau explicite d'avertissement et du badge « Abandonnée » rappelant le motif d'abandon et l'auteur, désactivation des boutons de publication (`applyIngestion`) et de déclaration d'opposabilité (`triggerCoverageDeclaration`), et masquage du chargement de propositions JSON.
- Tests : `tests/contract/issue_90_frameworks_knowledge.test.ts` (vérification de l'exclusion des ingestions abandonnées dans l'état vide et la vue par défaut, affichage sur filtre `abandoned`, et bandeau/actions désactivées sur l'écran de détail).

### Tableau de bord : correction du lien d'action vers la validation des clauses KB et redirection de courtoisie
- Le bouton « Valider & publier les clauses » du composant `KbClausesHealthBanner` pointait vers `/knowledge/clauses`, ce qui déclenchait la route de détail d'actif `/knowledge/[id]` avec `id = "clauses"` et provoquait une erreur `404 Actif "clauses" introuvable`.
- Le lien de la bannière pointe désormais directement vers la route canonique de gestion des clauses `/kb/clauses`.
- Ajout d'une redirection de courtoisie HTTP 307 dans `src/routes/knowledge/[id]/+page.server.ts` pour rediriger automatiquement toute requête vers `/knowledge/clauses` vers `/kb/clauses`, évitant ainsi l'erreur 404 en cas d'accès direct ou via un ancien signet.
- Tests : vérification du lien `/kb/clauses` rendu par `KbClausesHealthBanner` dans `tests/contract/kb-clauses-health-alert.test.ts` et de la redirection 307 dans `tests/contract/issue_95_knowledge_explorer.test.ts`.
### Posture 3 (Rendu & Homologation) : les schémas et le fragment de HLD se lisent comme un brouillon de tableau blanc
- **C4** : le Structurizr DSL produit est accepté par le CLI officiel (2025.11.09). Avant : `enterprise` (retiré du langage), containers homonymes, relation parent → enfant. Une vue `container` s'ajoute à la vue de contexte (qui ne montre pas les containers) ; les liens causaux `basedOn` deviennent des relations « fonde » ; plus de personne inventée à partir des participants (`src/lib/domain/structurizrDsl.ts`).
- **Solidité visible** : chaque énoncé dessiné (Mermaid, C4, SysML, JSON) porte vérifié / conçu non vérifié / hypothèse / en revue / contesté / en conflit / confiance non renseignée, en libellé et en couleur (`src/lib/domain/epistemicBadge.ts`). Énoncés remplacés ou retirés non dessinés, leur nombre dit ; deux valeurs actives différentes pour un prédicat = conflit, plus de « dernière valeur lue » dans le JSON. Fin du « Verified Architecture » sur chaque élément C4 et du `confidence: 'verified'` codé en dur dans l'export scellé.
- **Brouillon** : hypothèses, conflits à arbitrer, questions ouvertes et bandeau « PROVISOIRE » (paramètre `draft`, lu jusque-là par aucun générateur) ; bandeau aussi sur les schémas globaux du dossier scellé.
- **Option retenue à l'écran** : le store charge décision et options (`fetchDecisionContext`) et les passe au contexte de projection ; le gel les charge avant de sceller. L'identifiant de l'arbitre n'est pas transmis.
- **Fragment de HLD** : « En bref » en tête (Markdown et écran), Y-statement sans le problème ni la justification en double, identifiants typés humanisés, métadonnées `COMPLIANCE_STATUS:*` / `PORTABILITY:*` hors des « écarts acceptés », pas de « risque accepté » sans décision.
- Empreintes : les projections scellées changent de contenu, donc d'empreinte, pour un même dossier (décision assumée, pas de production).
- Tests : `tests/contract/structurizr-dsl.test.ts` (invariants + vrai CLI via `STRUCTURIZR_CLI` ou `npm run test:structurizr`), `epistemic-projections.test.ts`, `hld-fragment.test.ts`.
- **Limites** : SysML v2 non validé par un outil SysML ; schémas globaux sans le détail par énoncé ; `data.statements` de l'export scellé contient encore les énoncés retirés, présentés comme affirmés ; validation Mermaid hors tests (`jsdom` absent), rendu contrôlé à la main avec Playwright.

### Knowledge Hub : distinction du refus 403 « expert non enregistré » face à l'indisponibilité 503 (archinex#145)
- Un utilisateur Archinex non inscrit dans le registre des experts du Hub voyait `/kb/reviews` afficher à tort « Mode Hors-Ligne ou Service LLMOps Indisponible (503) — Le Knowledge Hub distant n'est pas joignable » et la pastille d'en-tête basculer sur « LLMOps Local », alors que le Hub répondait précisément 403 `{"status":"unauthorized","reason":"'...' is not a registered expert."}`.
- Le client LLMOps (`client.ts`) distingue désormais rigoureusement le statut `not_registered` (403 avec raison non enregistré), `unauthorized` (401 jeton/assertion invalide), `unavailable` (503 ou panne réseau) et `ok`.
- Message d'orientation explicite délivré : « Votre adresse n'est pas inscrite dans le registre des experts du Hub : demandez à un administrateur (Administration → Inscrire dans le registre LLMOps) ».
- Les écrans `/kb/reviews` et `/kb/me` affichent un bandeau d'information dédié au lieu d'une fausse alerte de dégradation réseau.
- La pastille d'en-tête « LLMOps Connecté » ne bascule plus sur « Local » lors d'un 403 : le service LLMOps distant est joignable et connecté.
- Tests : `tests/contract/kb-not-registered-expert.test.ts` (7 tests de contrat exhaustifs avec simulation du faux Hub, vérification des statuts 401/403/503 et maintien de la pastille connectée) et `tests/contract/llmops-live.test.ts` (test contre le vrai Hub vivant).

### Bac à sable : support Windows avec Docker Desktop (`deploy/sandbox`)
- Script natif PowerShell `deploy/sandbox/sandbox.ps1` avec parité totale de commandes (`up`, `status`, `creds`, `smoke`, `logs`, `down`, `reset`, `destroy`) pour Windows avec Docker Desktop.
- Dérivation cryptographique des clés d'acteur Ed25519 (RFC 8037) et des secrets aléatoires sans dépendance externe binaire en s'appuyant sur l'API native `node:crypto` (avec repli OpenSSL).
- Normalisation des chemins Windows et conversion `cygpath -m` dans `deploy/sandbox/sandbox.sh` pour prévenir l'interprétation des chemins de contexte `/c/...` comme dossiers relatifs sous Windows Docker Desktop.
- Ajout de `.gitattributes` garantissant les fins de ligne `LF` sur les scripts shell, Dockerfile, Caddyfile et scripts montés dans les conteneurs Linux, et `CRLF` sur PowerShell.
- Mots de passe conviviaux par défaut en local sur `localhost` (`admin123`, `architect123`, `security123`, `ciso123`) ou configurables via `SANDBOX_SIMPLE_PASSWORDS=1` pour simplifier les tests locaux sans compromettre la sécurité sur URL publique.
- Suite de tests de contrat dédiée (`tests/contract/sandbox-windows-support.test.ts`).
- Correction de l'erreur Docker Compose `failed to get console: The handle is invalid` sous Windows : suppression de la redirection de sortie de `Invoke-SandboxCompose` dans une variable (qui détruisait le handle de console), activation par défaut de `BUILDKIT_PROGRESS=plain` pour les terminaux non interactifs/IDE, et enregistrement systématique de `LLMOPS_DIR` dans `.sandbox/env`.
### Démonstration : pré-chargement de l'engagement LUMICC et de l'audit ArcKit (sans clé API)
- Ajout du jeu de données de référence examples/lumicc-noc/ (Lot 1 LUMICC : NOC, Cœur 5G PPDR & Résilience) :
  - 92 clauses RFP analysées, 7 sujets d'architecture cardinaux formalisés avec options et critères MCDA.
  - Énoncés épistémiques avec dépendances causales directes (basedOn) pour la démonstration de la rétractation en cascade.
  - Délibération d'équipe multi-experts reconstituée.
- Enrichissement de prisma/seed.ts pour pré-charger automatiquement le projet lumicc-lot1-noc ainsi que l'exécution d'audit run_lumicc_live_j0 dans Prisma (FactorizationRun). La démonstration complète peut être animée hors-ligne sans clé API externe.
- Guide de démonstration complet rédigé dans [docs/demo-guide.md](docs/demo-guide.md) détaillant les principes ArcKit (triage 4 compartiments, factorisation N→K, élicitation MCDA, projections déterministes d'artefacts) et le scénario en 3 actes.
### Sécurité : validation stricte de JWT_SECRET et suppression de la valeur publique du Dockerfile (archinex#141)
- L'étape `runner` du `Dockerfile` fixait une valeur par défaut publique (`archinex-super-secret-production-jwt-key-2026`). Elle a été retirée : le secret de session ne doit jamais être figé dans l'image.
- Au démarrage en production (`NODE_ENV=production`), le conteneur (`docker-entrypoint.sh`) et le serveur (`src/lib/auth/jwt.server.ts`, hook `init` dans `src/hooks.server.ts`) **refusent de démarrer** si `JWT_SECRET` est absent, plus court que 32 caractères ou égal à l'une des valeurs publiques connues (Dockerfile, développement, exemple, CI), avec un message d'erreur explicite indiquant la procédure de génération (`openssl rand -hex 32`).
- Les sessions et jetons d'administration forgés avec une ancienne clé publique ou de repli sont rejetés lors de la vérification.
- Documentation mise à jour (`GCP_CLOUD_RUN_DEPLOYMENT.md`, `docs/fresh-install.md`, `docs/developer-guide.md`) pour détailler la génération et l'injection via Secret Manager (`--set-secrets JWT_SECRET=archinex-jwt-secret:latest`).
- Tests de contrat : `tests/contract/jwt-secret-validation.test.ts` (12 tests validant le refus des clés publiques, l'exigence de longueur, l'échec de démarrage, et le rejet des jetons forgés).

### Rendu et homologation : correction de l'erreur Svelte `each_key_duplicate` dans le fragment HLD
- Dans `HldFragmentView.svelte`, les listes de chaînes de caractères (points ouverts, conséquences, risques acceptés, avertissements, critères et scores) utilisaient la valeur comme clé dans les blocs `{#each ...}`. Lorsqu'une question ou objection ouverte partageait le même intitulé (par exemple lors de relances automatiques de proposition de découpage du sujet pour lever la stagnation), Svelte levait une exception fatale `each_key_duplicate`.
- Les boucles d'affichage statiques de listes simples ont été dé-clées dans `HldFragmentView.svelte` ainsi que dans la vue de consultation des cadres (`kb/frameworks/[id]`).
- Dans `src/lib/domain/hldFragment.ts`, `openPoints`, `acceptedRisks`, `acceptedViolations`, `coverageWarnings` et `requirementRefs` sont désormais systématiquement dédoublonnés à la construction du fragment HLD.
- Tests : validation du dédoublonnage et de la non-régression dans `tests/contract/hld-fragment.test.ts`.

### Serveur de développement : résolution de `.prisma/client/index-browser` sous Vite dev (archinex#144)
- Correction du plantage au démarrage de `npm run dev` (`vite dev`) : lors de la première requête, l'optimiseur de dépendances de Vite tentait de pré-bundler `casbin-prisma-adapter` côté client navigateur. Cet adaptateur important `@prisma/client`, esbuild tentait de résoudre le point d'entrée navigateur (`index-browser.js`), qui échouait sur `.prisma/client/index-browser` (introuvable suite à la migration Prisma 7 générant le client dans `src/generated/prisma`).
- `vite.config.ts` : retrait de `casbin`, `casbin-prisma-adapter` et `jose` de `optimizeDeps.include` (modules serveur/SSR qui n'ont pas à être pré-bundlés côté client) ; ajout de `@prisma/client`, `casbin` et `casbin-prisma-adapter` dans `optimizeDeps.exclude` ; configuration de `ssr.external` pour `@prisma/client` et `casbin-prisma-adapter`.
- Suite de tests de contrat dédiée : `tests/contract/vite-dev-server.test.ts` validant la configuration et le démarrage sans erreur du serveur Vite de développement.

### Sécurité : le conteneur ne sème plus de comptes de démonstration
- `docker-entrypoint.sh` lançait `prisma/seed.ts` à chaque démarrage : comptes `admin@archinex.local` / `admin123` (et `user123`) publics.
  Il appelle maintenant `prisma/bootstrap-admin.ts` : un premier administrateur est créé seulement si aucun n'existe et si
  `ARCHINEX_BOOTSTRAP_ADMIN_EMAIL` est défini (`ARCHINEX_BOOTSTRAP_ADMIN_PASSWORD` : 12 caractères minimum, sinon mot de passe généré et
  affiché une fois). Idempotent. Les autres comptes se créent depuis `/admin` (`docs/fresh-install.md`, § 3 bis).
- Le jeu de démonstration reste disponible à la demande : `ARCHINEX_SEED_DEMO=1`.
- La page `/login` n'affiche plus les boutons « Demo accounts » (identifiants en clair) hors développement : le bundle de production ne
  contenait pas seulement le bouton, mais `admin123` dans le JavaScript client ; vérifié absent après correction.
- Tests : `tests/integration/bootstrap-admin.test.ts` (6).

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
