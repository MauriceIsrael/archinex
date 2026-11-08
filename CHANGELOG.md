# Changelog

Journal des Ã©volutions d'Archinex, reconstituÃ© Ã  partir de l'historique git.
Les lots (`A0`â€¦`A30`) correspondent aux issues GitHub du projet. Le journal d'ArcKit
(outil de mÃ©thode embarquÃ©) est conservÃ© dans [`.arckit/CHANGELOG.md`](.arckit/CHANGELOG.md).

Aucune version n'a encore Ã©tÃ© publiÃ©e : tout figure sous *Non publiÃ©*.

## Non publié

### Correction Synchronisation Matrice de Couverture & Registre LLMOps
- **Synchronisation Automatique Lors de l'Édition (`updateCentralizedAccount`)** :
  - La modification des domaines de responsabilité et des rôles KB depuis la fiche détaillée (`AdminAccountSheetDialog`) est désormais automatiquement synchronisée avec LLMOps (`PUT /api/knowledge/owners`), éliminant la nécessité d'un bouton secondaire distinct.
  - Extension du schéma de validation `UpdateAccountSchema` (`PATCH /api/admin/accounts`) avec `registerInLlmops`.
- **Résilience d'Autorisation & Rebond `kb:admin` (Fallback)** :
  - Correction de l'erreur `403 Forbidden` (`the 'kb:admin' role or token scope is required`) en cas d'appel de gouvernance initié par un compte local non encore inscrit : rebond automatique transparent sur l'identité d'administration déclarée dans le registre LLMOps (ex: `@maintainers`).
  - Ajout du scope `kb:admin` dans les configurations d'authentification de service local (`scripts/serve_local.py`).
- **Mise à Jour Dynamique de la Matrice & Résorption des Groupes Orphelins** :
  - Mise à jour en direct de la vue d'ensemble par domaine (`domainsOverview`) dès qu'un domaine technique est associé à un compte utilisateur (`hasAccount: true`, e-mail et nom affichés).
  - Filtrage des groupes génériques orphelins : un groupe sans e-mail dont tous les domaines ont été réaffectés à des experts nominatifs est automatiquement retiré du bandeau d'alerte des responsables sans compte.
- **Tests de Contrat Exhaustifs** :
  - Ajout de `tests/contract/coverage-matrix-sync.test.ts` validant le cycle complet : détection d'orphelin, création d'expert, mise à jour de la matrice, synchronisation lors de modifications et rebond d'autorisation 403.

### Suite d'Intégration Sylva, Validation de Schéma KRM & Règles d'Or OPA (Smart-Light Gate)
- **Validation Formelle contre le Schéma CRD Sylva (`tests/fixtures/sylva/`)** :
  - Export et formalisation du schéma JSON Schema Draft-07 et de la CustomResourceDefinition Kubernetes pour `SylvaWorkloadCluster` (`workloadcluster.sylva.org/v1alpha1`).
  - Validation exhaustive de la structure générée par l'hydratation multi-axes (`spec.capi_providers`, `spec.units`, `spec.baremetal_hosts`, `spec.machine_deployments`).
- **Évaluateur des 15 Règles d'Or d'Enforcement Sylva (`edp/policies/sylva_golden_rules.rego`)** :
  - Implémentation en Rego v1 des 15 règles d'or télécom de Sylva : CNI Cilium mandataire, CAPI `capm3` + `cabpr` (RKE2), OS SLE Micro durci, admission controller Kyverno actif, observabilité monitoring telco, load-balancer MetalLB, secrets Vault obligatoires pour les pools NIS2, méta-CNI Multus et opérateurs SR-IOV actifs pour le dataplane DPDK, `hostSelector.matchLabels` sur `host-group`, labels de pools RKE2 `sylva.org/pool` et `dataplane`, CPU Manager statique et Topology Manager single-NUMA pour DPDK, adresses BMC Redfish virtuelles et adresses MAC de boot valides.
- **Service de Validation & Test d'Intégration Démo (`sylvaValidation.ts` & `edp-sylva-integration-schema-and-rules.test.ts`)** :
  - Nouveau module serveur `src/lib/server/edp/sylvaValidation.ts` intégrant `validateSylvaWorkloadClusterSchema` (Ajv) et `evaluateSylvaGoldenRules` (OPA).
  - Suite de tests Vitest validant le cas nominal `seed:demo` (§14 Lulu Lot 3 ↔ Lot 1), le rejet des schémas invalides, la détection précise des 15 dérives de production, et la réconciliation biunivoque entre les nœuds Nautobot et les hôtes bare-metal Sylva.
- **Porte Qualité Unifiée Smart-Light (`scripts/verify.mjs` & `scripts/check-sylva-golden-rules.ts`)** :
  - Nouveau point d'entrée CLI `npm run check:sylva` (`scripts/check-sylva-golden-rules.ts`).
  - Intégration dans `scripts/verify.mjs` sous une 2e étape dédiée, garantissant une exécution ultra-rapide (< 100ms) et conservant un pipeline PR unique (`verify.yml`) sous les 3 minutes.

### Unification de l'Administration des Comptes & Enrôlement Automatique JIT (Archinex SSoT)
- **Source Unique de Vérité (SSoT) pour les Comptes Archinex & LLMOps** :
  - Centralisation intégrale du cycle de vie des identités et des droits dans Archinex : la création, la modification et l'assignation de domaines d'expertise synchronisent immédiatement le registre souverain LLMOps (`data/kb/owners.yaml`).
  - Suppression définitive des messages invitant l'utilisateur à faire des démarches administratives complexes ou de synchronisation manuelle (« Compte non inscrit dans le registre... demandez à un administrateur »).
- **Auto-Enrôlement Transparent à la Volée (Zero-Touch JIT Provisioning)** :
  - Implémentation de `ensureArchinexUserRegisteredInLlmops(email)` dans `src/lib/server/accountsAdmin.ts`.
  - Prise en charge automatique sur les points d'entrée doctrinaux (`/kb/me`, `/kb/reviews`, `/kb/reviews/[id]`, `/api/knowledge/me`, `/api/knowledge/reviews/inbox`) : en cas de réponse 403 `not_registered`, Archinex auto-inscrit immédiatement l'expert auprès de LLMOps selon son profil local et relance la requête de manière transparente.
- **Amorçage Idempotent au Démarrage (`prisma/seed.ts`)** :
  - Synchronisation automatique et non bloquante des profils de démonstration (`@admin-lead`, `@sec-expert`) vers LLMOps dès l'exécution de `db:reset` ou `seed`. Si LLMOps n'est pas encore démarré, l'enrôlement JIT prend le relais au premier accès sans erreur.
- **Tests de Contrat & Robustesse** :
  - Ajout de `tests/contract/unified-account-ssot.test.ts` validant le provisionnement JIT, l'auto-synchronisation à la création de compte et la création à la volée de profil KB local.
  - Conformité complète aux vérifications TypeScript et diagnostics Svelte (`svelte-check` 0 erreurs, 0 avertissements).

### Interface Simplifiée de Création de Compte & Sélecteur de Domaines LLMOps (#76)
- **Séparation Nette des Domaines de Responsabilité et des Rôles** :
  - Distinction formelle entre les compétences techniques/métier (*Domaines de responsabilité* : périmètre d'autorité d'un expert sur les clauses, ex: `3GPP conformance`, `5g-security`, `telecom-core`) et les habilitations d'action (*Rôles projet* et *Rôles doctrine LLMOps* : `kb:review`, `kb:maintain`, `kb:evaluate`, `kb:admin`).
- **Nouveau Composant Visuel `DomainsPicker.svelte`** :
  - Remplacement de la saisie textuelle à l'aveugle par un sélecteur interactif alimenté dynamiquement par le registre LLMOps (`ownersRegistry.domains`).
  - Ajout de filtres thématiques (`Tous`, `3GPP & Télécom`, `Sécurité & Conformité`, `Architecture & Cloud`), de badges cliquables et de recherche en temps réel.
  - Ajout de raccourcis 1-clic préconfigurés : **`+ Pack 3GPP`** (`conformance`, `interoperability`, `telecom-core`, `mobile-core`, `5g-security`, `network-exposure`, `sba`, `mission-critical-security`) et **`+ Pack Sécurité`** (`security`, `security-architecture`, `hardening`, `cryptography`, `vulnerability-management`, `iam`, `compliance`).
- **Dérivation Automatique du Handle LLMOps & Expérience Épurée** :
  - Dérivation instantanée du handle (ex: `@prenom-nom`) à partir de l'email ou du nom renseigné, sans forcer la saisie manuelle.
  - Suppression des boutons superflus et automatisation de l'inscription dans le registre LLMOps.
  - Intégration transparente dans `AdminCreateAccountDialog` et `AdminAccountSheetDialog` (fiche profil utilisateur).
- **Tests de Contrat & Validation de Non-Régression** :
  - Ajout de `tests/contract/simplified-account-creation.test.ts` validant la création d'expert multi-domaines 3GPP, la dérivation automatique de handle et la payload envoyée au registre LLMOps.
  - Validation complète des tests de contrat centralisés (`tests/contract/issue_76_centralized_accounts.test.ts`).
>>>>>>> c374e33 (fix(admin): synchronisation en temps réel de la matrice de couverture LLMOps et rebond 403)
### Rationalisation Ergonomique du Menu « Knowledge Hub »
- **Unification de la Navigation autour de la Base de Connaissance (`src/routes/+layout.svelte`)** :
  - Regroupement de l'ensemble des mini-applications de la Knowledge Base dans un menu latéral dédié **« Knowledge Hub »** (barre latérale desktop étendue/réduite et tiroir mobile), supprimant la dispersion hétérogène entre le menu gauche et le menu caché sous l'avatar utilisateur.
  - Allègement du menu utilisateur en haut à droite (limité à l'identité du compte connecté, son rôle et l'action de déconnexion).
  - Structuration progressive des sous-menus en **3 paliers ergonomiques** distingués par des séparateurs visuels (`role="separator"`) :
    1. **1. Visualisation & Exploration** : *Base de Connaissance* (`/knowledge`), *Profil Expert KB* (`/kb/me`), *Référentiels & Couverture* (`/kb/frameworks`).
    2. **2. Doctrine & Rédaction** : *Atelier de Doctrine* (`/kb/workshop`), *Clauses vérifiables* (`/kb/clauses`).
    3. **3. Validation & Évaluation** : *Boîte de Revue KB* (`/kb/reviews` — badge `G5`), *Banc d'Évaluation KB* (`/kb/evals` — badge `G6`), *Tableau de Bord & Publication* (`/kb/dashboard` — badge `G7`).
  - Traduction complète des clés de navigation dans les 4 dictionnaires (`fr-FR.json`, `en.json`, `en-UK.json`, `es.json`) et ajout du test de contrat `tests/contract/knowledge-hub-menu.test.ts`.

### Correction Résilience Brouillons Télégraphiques & KPI Délibération (`seed:demo`)
- **Résilience Itérabilité `draft.suppose` & Tableaux Télégraphiques** :
  - Correction de l'erreur `TypeError: draft.suppose is not iterable` survenue lors de l'accès à la vue Délibération / Board sur des engagements ou démos n'ayant pas initialisé la structure de brouillon complète.
  - Sécurisation du calcul de cumul CAPEX dans `DeliberationDashboardKpis.svelte` avec parcours défensif `draft?.suppose ?? []`.
  - Sécurisation du moteur de rendu `renderTelegraphicDraft` (`src/lib/domain/telegraphic.ts`) face aux brouillons partiels (protection sur `retenu`, `suppose`, `conflit`, `manque`).
  - Normalisation et assainissement automatique des brouillons dans `deliberationStore` (`activeDraft`, `selectEngagement`, `initFromDb`) et `src/lib/server/engagementsDb.ts`.
  - Complétude du brouillon télégraphique généré dans `scripts/seed-demo.ts` pour le sujet §14 (injections de `section_id`, `subject`, `maturity`, `suppose`, `retenu`, `conflit`, `manque`).
  - Ajout des tests de contrat de résilience dans `tests/contract/telegraphic-draft.test.ts` et `tests/contract/seed-demo-self-contained.test.ts`.

### Anonymisation ComplÃ¨te du Dossier RÃ©el de DÃ©monstration (Â« Lulu Â»)
- **Anonymisation Exhaustive Docs, Code, Tests et Jeux d'Essai** :
  - Remplacement et anonymisation intÃ©grale de toute rÃ©fÃ©rence spÃ©cifique au profit du pseudonyme souverain Â« Lulu Â» sur l'ensemble de l'application (documentation, scripts, tests de contrat, tests E2E, rapports d'Ã©valuation et corpus d'exemples).
  - Renommage des rÃ©pertoires de jeux d'essai : `examples/lulu-ingested/` et `examples/lulu-noc/`.
  - Renommage des scripts et suites de test : `scripts/build-lulu-demo.ts`, `tests/e2e/browser/lulu-demo.spec.ts`, et script npm `demo:lulu`.
  - Normalisation des identifiants mÃ©tier : `lulu-lot1-noc`, `SUBJ-LULU-*`, `DOC-LULU-*`, `run_lulu_live_j0`.
  - Validation complÃ¨te de non-rÃ©gression : 100 % de la suite de tests (144 fichiers de test, 1099 tests passants) validÃ©e.

### Démonstrateur Autonome seed:demo sur Base Vierge & Idempotence
- **Auto-Bootstrap de la Démo §14 (scripts/seed-demo.ts)** :
  - Élimination de la dépendance à un état préalable de la base : le script auto-initialise de manière idempotente le projet lulu-avec-options-et-criteres-proposes, l'engagement et le sujet §14 dès qu'ils sont absents.
  - Auto-provisionnement de l'administrateur démo (dmin@archinex.local / dmin123) et des règles d'autorisation Casbin sur base vierge pour garantir un accès immédiat à l'IHM.
  - Ajout du test de contrat 	ests/contract/seed-demo-self-contained.test.ts validant l'exécution sur base totalement vierge et l'idempotence des passages successifs.

### Socle Ontologique 6 Concepts SI/Telco, Cumul de Variantes Sylva, RÃ©conciliation Multi-Objets (Â§14) & Synchronisation Live Nautobot 2.x (`npm run seed:demo`)
- **Enrichissement du Socle Ontologique (`tests/fixtures/edp/ontology_export.json`)** :
  - Couverture complÃ¨te des **6 grands concepts HLD SI/Telco** (`telco_cloud_platform`, `interconnection_gateway`, `storage_data_persistence`, `iam_security_zerotrust`, `observability_noc_soc`, `resilience_drp_continuity`), **18 sous-axes obligatoires (`requires_aspect`)** et **21 feuilles d'implÃ©mentation (`implemented_by`)**.
  - Positionnement de **SUSE Telco Cloud & Sylva** par dÃ©faut sur l'axe `compute_substrate` avec support du **cumul de variantes (OU inclusif)** (`+ Cumuler`, `â‡„ Remplacer`, `âœ• Retirer`) permettant d'hydrater simultanÃ©ment le pool `sylva-cnf-sriov-dpdk` (CNF CÅ“ur de RÃ©seau) et le pool `sylva-standard-nis2`.
- **IntÃ©gration Propre avec Sylva (`SylvaWorkloadCluster` `workloadcluster.sylva.org/v1alpha1`)** :
  - GÃ©nÃ©ration native du descripteur `sylva_workload_cluster_values` (`capi_providers: capm3 + cabpr`, `units: cilium, multus, sriov, vault, kyverno, monitoring`, `baremetal_hosts` et `machine_deployments`) et des `BareMetalHost` `metal3.io/v1alpha1` sans rÃ©inventer l'opÃ©rateur `sylva-units`.
- **Graphe d'Objets Exhaustif Ã  7 Classes & RÃ©conciliation Multi-Domaine (`reconciliation_graph`, `multi_axis_refinement.rego`)** :
  - ModÃ©lisation conjointe des 7 classes d'objets autour de la clÃ© pivot `tenant_ref = "org-lot3-mno"` (3GPP TS 28.620 NRM `ExternalFunction`, TM Forum SID GB922 `Party/Resource/Service/SLA`, Nephio KRM & Nautobot SSoT).
  - Ajout des rÃ¨gles Rego `deny_unmediated_s6a_direct_flow` et `deny_unreconciled_partner_objects` et des 2 scÃ©narios de dÃ©rive associÃ©s dans `Phase4RefinementHub.svelte`.
- **Synchronisation Temps RÃ©el vers Nautobot 2.x (`src/lib/server/edp/nautobotSync.ts`) & DÃ©monstrateur `npm run seed:demo` (`scripts/seed-demo.ts`)** :
  - PoussÃ©e REST idempotente dans Nautobot (`http://localhost:8080`) des Tenants (`org-lot3-mno`, `org-lot2-ran`), du Circuit S6a (`link-ip-lot3-secgw1`) avec ses Terminaisons A/Z, du VLAN `1403`, du prÃ©fixe `100.64.14.0/30` et des 7 Ã©quipements DCIM.
  - Ajout du script `npm run seed:demo` prÃ©parant le parcours complet Phase 1 $\rightarrow$ Phase 4 sur l'exigence **Â§14 de Lulu (Lot 3 â†” Lot 1)**.

### Phase 4 DÃ©diÃ©e Â« Refinement & Hydratation Â», Matrice KAOS Multi-Axes & Simulateur de Drift OPA
- **Nouvelle Phase 4 Macroscopique (`Phase4RefinementHub.svelte`, `ProjectEngagementHeader.svelte`)** :
  - Ajout d'un 4Ã¨me grand onglet de projet **Â« Phase 4 Â· ðŸ§ª Refinement & Hydratation Â»** (`posture = 'refinement'`) dÃ©diÃ© au passage du HLD (L3/L4) au LLD exÃ©cutable, complÃ©tÃ© par un bouton d'accÃ¨s rapide depuis la Phase 2.
  - Cockpit temps rÃ©el affichant les 4 KPIs d'ingÃ©nierie : complÃ©tude KAOS (`AND-Refinement`), traÃ§abilitÃ© des clauses d'intention HLD, objets LLD `planned` gÃ©nÃ©rÃ©s et verdict de l'Oracle OPA avec empreinte SHA-256 `data.ontology`.
- **Oracle Rego Multi-Axes UnifiÃ© (`edp/policies/multi_axis_refinement.rego`) & Simulateur de Drift CMDB** :
  - Ã‰valuation formelle par OPA des 5 axes obligatoires de l'ontologie (*Substrat Compute Bare-Metal*, *Plan Hors-Bande OOB*, *Zonage SÃ©curitÃ© OAM/UPF*, *ParitÃ© Environnements Dev/Recette Iso-Prod/Prod*, *RÃ©silience Ã‰lectrique 2N*) directement sur l'inventaire LLD hydratÃ© du sujet et sans aucun littÃ©ral codÃ© en dur.
  - Simulateur interactif de dÃ©rive (*Drift CMDB*) permettant d'injecter et de vÃ©rifier en un clic la dÃ©tection par OPA d'une dÃ©rive sur chacun des 5 axes (`unapproved_hardware`, `bmc_oob_mismatch`, `unproxied_oam`, `non_isoprod_staging`, `single_power_feed`).
- **Moteur de Couverture du Raffinement & Composition Multi-Axes (`src/lib/server/edp/refinementCoverage.ts`)** :
  - Remplacement de tout aiguillage syntaxique en dur par une interrogation formelle du graphe d'ontologie (`requires_aspect` pour la dÃ©composition conjonctive KAOS AND-Refinement des sous-axes obligatoires ; `implemented_by` pour la sÃ©lection disjonctive OR-Refinement des feuilles d'implÃ©mentation porteuses des projections et rÃ¨gles Rego).
  - Calcul de la **Matrice de Couverture du Raffinement** distinguant pour chaque axe obligatoire : `covered_executable` (ðŸŸ¢ couvert par une feuille dotÃ©e de rÃ¨gles Rego), `covered_no_oracle` (ðŸŸ¡ feuille liÃ©e mais dÃ©pourvue d'oracle Rego) et `missing_refinement` (ðŸ”´ lacune de raffinement / sous-axe oubliÃ©).
  - ContrÃ´le automatique des dÃ©pendances inter-axes (`depends_on`, `constrains`, `conflicts_with`) et composition multi-axes des artefacts d'hydratation LLD (`nautobot_planned_devices`, `k8s_manifests`, `security_zones`, `environments`).
- **Interface de Couverture & Liaison Interactive dans `EdpCard.svelte`** :
  - Affichage visuel de la matrice KAOS dans l'onglet `ðŸ§ª Oracle EDP` avec barre de progression de complÃ©tude et boutons `+ Raffiner via Â« ... Â»` permettant de lier une feuille d'ontologie sur un axe manquant en un clic (`action: 'bind_aspect'`).
- **Visualiseur & Ã‰diteur de Triplets Ontologiques dans `/knowledge` (`OntologyTripletsEditor.svelte`, `/api/knowledge/ontology`)** :
  - Nouvel onglet `ðŸ•¸ï¸ Ontologie & Triplets ({S, V, O})` permettant de visualiser l'arbre `Concept HLD -> requires_aspect -> Sous-Axe -> implemented_by -> Feuille & RÃ¨gles Rego` et d'ajouter/supprimer dynamiquement des triplets `{ Sujet, Verbe, ComplÃ©ment }`.
- **Tests de contrat** : ajout de `tests/contract/edp-refinement-coverage-and-triplets.test.ts` (5 tests passants, 100 % de la suite EDP et sÃ©curitÃ© validÃ©e).

### Environnement Docker d'IntÃ©gration & Outillage (Nautobot, Batfish, OPA Server)
- **Pile ConteneurisÃ©e d'Outillage IntÃ©grateur (`deploy/integrator-tools/compose.yml`)** :
  - DÃ©ploiement local de Nautobot 2.2 avec PostgreSQL 15, Redis 7 et worker Celery pour servir de source de vÃ©ritÃ© DCIM.
  - IntÃ©gration de Batfish (`batfish/batfish:latest`) sur les ports 9997 (API pybatfish) et 9996 pour la simulation et la vÃ©rification des matrices de flux rÃ©seau.
  - IntÃ©gration d'un serveur OPA REST (`openpolicyagent/opa:latest`) sur le port 8181 en complÃ©ment du binaire CLI local `tools/bin/opa.exe`.
- **Script d'Ensemencement TÃ©moin Nautobot (`deploy/integrator-tools/seed-nautobot.py`)** :
  - Injection idempotente de la topologie requise par les oracles Sylva CAPI : site `pop-valmondois`, rÃ´le `telco-baremetal-worker`, serveur `srv-telco-bm-01` au statut `Planned`, interface `bmc` et adresse de management `192.0.2.10/24` (RFC 5737).
- **Scripts d'Exploitation & Automatisation (`tools.ps1`, `tools.sh`, `README.md`)** :
  - Commandes `up`, `down`, `status`, `seed`, `test`, `reset` avec contrÃ´le automatique du statut du moteur Docker Desktop et diagnostics de connectivitÃ©.
- **Tests de contrat** : ajout de `tests/contract/edp-integrator-tools-docker.test.ts` (4 tests passants, total 91 tests de contrat EDP passants).

### Alignement Sylva CAPI & Nautobot DCIM pour les Paquets de DÃ©cision ExÃ©cutables (EDP)
- **RequÃªte d'Extraction GraphQL Nautobot Planned (`src/lib/server/edp/adapters/nautobot_planned_extract.graphql`, `nautobotAdapter.ts`)** :
  - IntÃ©gration de la requÃªte GraphQL officielle ciblant les Ã©quipements au statut `planned` avec leurs interfaces `bmc` (type, MAC, adresses IP).
  - Ajout de la fonction `parseNautobotGraphqlResponse` extrayant automatiquement l'adresse OOB depuis les interfaces BMC pour les formats de rÃ©ponse GraphQL bruts.
- **Fixture et Typage Sylva CAPI Cluster (`sylva_values_candidate.yaml`, `sylvaAdapter.ts`)** :
  - IntÃ©gration de la fixture de valeurs de rÃ©fÃ©rence `sylva-capi-cluster` avec providers Metal3 (`capm3`), RKE2 (`cabpr`), image SLE Micro RT 5.5 et BMC Redfish.
  - DÃ©finition de l'interface TypeScript `SylvaCapiClusterValues` pour le typage des configurations d'unitÃ©s Sylva.
- **Tests de contrat** : enrichissement de `tests/contract/edp-verify-and-gate.test.ts` (11 tests passants).

### Paquet de DÃ©cision ExÃ©cutable (EDP) : RÃ©daction AssistÃ©e, IHM & Ã‰valuation Finale (Palier 5 - Issues #184, #186, #187, #188, #189)
- **ChaÃ®ne d'Acceptation DÃ©terministe pour RÃ©daction AssistÃ©e LLM (`src/lib/server/edp/edpDrafting.ts`) (#184)** :
  - Pipeline de validation automatique imposÃ© avant toute prÃ©sentation Ã  l'humain enchaÃ®nant : schÃ©ma formel, puretÃ© d'intension (zÃ©ro fuite IP/MAC/hostnames), contrÃ´le des liaisons d'ontologie, conformitÃ© des fixtures, auto-test OPA natif et garde de mutation.
  - Exigence stricte Invariant II : interdiction absolue pour un draft LLM de revendiquer le statut `validated` sans approbation humaine formelle (assignation obligatoire du statut `proposed` et de la provenance `llm-proposed-human-approved`).
  - Journalisation en mÃ©moire des mÃ©triques de gÃ©nÃ©ration (durÃ©e d'exÃ©cution, score de mutation, nombre de mutants tuÃ©s, Ã©tape de rejet) pour analyse d'Ã©valuation.
- **Composant Fiche EDP dans l'IHM Workbench (`src/lib/components/edp/EdpCard.svelte`) (#186)** :
  - Panneau dÃ©diÃ© conditionnÃ© par le drapeau `ARCHINEX_EXPERIMENTAL_EDP=1` (invisible et sans aucun impact de rendu si le drapeau est absent).
  - Affichage complet du statut, mode de production, validateur humain, rÃ©visions d'ontologie liÃ©es, score de mutation (100% garanti) et dernier verdict d'Ã©valuation avec violations.
  - Alerte visuelle immÃ©diate en cas de statut `stale` (caducitÃ© Invariant VI) avec dÃ©sactivation de l'action de validation.
  - Restriction de l'action de validation aux seuls rÃ´les d'architectes habilitÃ©s (`Lead Architect`, `Domain Architect`, `Security Architect`).
  - Dialogue de contestation d'architecture obligeant la saisie d'un Ã©noncÃ© humain (`human-authored`, Invariant III).
- **Second EDP de RÃ©fÃ©rence : Isolation de Zones de SÃ©curitÃ© NIS2 (`edp/examples/adr015-security-zones/`) (#187)** :
  - ImplÃ©mentation complÃ¨te de l'oracle de dÃ©cision ADR-015 pour tester la gÃ©nÃ©ralitÃ© du systÃ¨me sur un domaine diffÃ©rent du substrat bare-metal.
  - RÃ©solution d'adresses IP vers les zones rÃ©seau projetÃ©es par l'ontologie, contrÃ´le d'isolation stricte et gestion des exceptions autorisÃ©es par classe de trafic (ex: tÃ©lÃ©mÃ©trie).
  - Score de mutation atteint : **2/2 mutants tuÃ©s (100 %)**.
  - Mocks complets en adresses de documentation rÃ©servÃ©es RFC 5737 : entrÃ©e conforme (`pass.json`), dÃ©faillances unitaires ciblÃ©es (`fail_rule_1` et `fail_rule_2`) et cas d'adresses inconnues retournant `insufficient_input`.
- **Guide IntÃ©grateur Hors-Ligne (`docs/edp/integrator-guide.md`) (#188)** :
  - Manuel pas Ã  pas complet pour les intÃ©grateurs et auditeurs tiers : installation d'OPA avec contrÃ´le de somme de contrÃ´le SHA-256, prÃ©paration d'entrÃ©e `refined_input`, exÃ©cution de `edp verify` hors-ligne et interprÃ©tation des lots de preuves cryptographiques et des codes de sortie (0, 1, 2, 3).
  - Section d'honnÃªtetÃ© mÃ©thodologique : "Ce qu'un vert ne prouve pas" dÃ©taillant les limites intrinsÃ¨ques sur les artefacts et les champs non modÃ©lisÃ©s.
- **Plan d'Ã‰valuation, Rapport & DÃ©cision de Promotion (`docs/edp/`, `docs/adr/ADR-016-promotion-edp-experimental.md`) (#189)** :
  - CritÃ¨res objectifs C1 Ã  C5 figÃ©s dans `docs/edp/evaluation-plan.md`.
  - Rapport consolidÃ© `docs/edp/evaluation-report.md` dÃ©montrant l'atteinte des 5 critÃ¨res avec preuves d'exÃ©cution.
  - ADR-016 prononÃ§ant le **GO** pour la promotion progressive de l'EDP sous condition du maintien du feature flag et des invariants constitutionnels.
- **Tests** : 14 nouveaux tests de contrat dans `tests/contract/edp-palier-5.test.ts` portant la suite complÃ¨te Ã  **85 tests de contrat EDP passants** Ã  100 %.


### Paquet de DÃ©cision ExÃ©cutable (EDP) : VÃ©rification, Adaptateurs & CI Gate (Palier 4 - Issues #182, #178, #179, #183, #185)
- **Service et Commande `edp verify` (`src/lib/server/edp/edpVerify.ts`, `scripts/edp-verify.ts`) (#182)** :
  - Orchestration complÃ¨te d'Ã©valuation d'un EDP : validation structurelle du paquet, validation de non-vacuitÃ© des entrÃ©es de raffinement, compilation dÃ©terministe de la projection d'ontologie (`data.ontology`) et Ã©valuation via OPA.
  - Ã‰mission d'un lot de preuves scellÃ© (`EvidenceBundle`) avec empreintes cryptographiques SHA-256 (EDP, politique, ontologie, entrÃ©es), versions des moteurs, verdict Ã  4 Ã©tats et violations dÃ©taillÃ©es.
  - Codes de sortie standardisÃ©s pour intÃ©gration CI/CD : 0 (`compliant`), 1 (`violated`), 2 (`insufficient_input` / `not_applicable`), 3 (`unavailable` / erreur exÃ©cuteur).
- **Adaptateur Sylva / CAPI (`src/lib/server/edp/adapters/sylvaAdapter.ts`) (#178)** :
  - Transformation des manifestes Kubernetes issus d'un rendu Helm (`helm template`) en payload `refined_input` conforme avec traÃ§abilitÃ© complÃ¨te de provenance (outil, version, commande, hash).
  - Sanitization automatique et suppression stricte de tout manifeste de type `Secret` ou de clÃ©s/valeurs sensibles (`password`, `token`, `bearer`, clÃ©s privÃ©es).
  - Fixtures de test hors-ligne dans `tests/fixtures/edp/sylva/`.
- **Adaptateur Nautobot Planned (`src/lib/server/edp/adapters/nautobotAdapter.ts`) (#179)** :
  - Transformation et normalisation des Ã©quipements dÃ©clarÃ©s dans Nautobot GraphQL au statut `planned` vers le contrat `nautobot_planned_devices`.
  - Normalisation des adresses OOB sans masque de sous-rÃ©seau CIDR pour correspondre exactement aux contrats de conformitÃ© bare-metal.
  - Fixtures de test hors-ligne dans `tests/fixtures/edp/nautobot/`.
- **Spike d'Architecture : Instanciation Blueprint vers Nautobot Planned (`docs/edp/spike-nautobot-design-builder.md`) (#183)** :
  - Analyse approfondie de la viabilitÃ© d'une instanciation automatisÃ©e dans Nautobot Design Builder versus extraction de fixtures.
  - DÃ©cision et recommandation d'architecture argumentÃ©e : **NO-GO** sur l'instanciation dynamique d'HLD dans un Nautobot chaud (fragilitÃ©, non-idempotence, couplage fort) et **GO** sur le patron d'adaptateur hors-ligne par extraction GraphQL et fixtures scellÃ©es.
- **Porte d'Architecture CI `edp-gate` (`scripts/edp-gate.ts`, `scripts/edp-gate.sh`, `.github/workflows/edp-architecture-gate.yml.example`) (#185)** :
  - Script unifiÃ© validant en chaÃ®ne : le schÃ©ma JSON de l'EDP, la suite de tests natifs `opa test`, la garde de mutation (exigence de 100 % de mutants tuÃ©s), la vÃ©rification d'entrÃ©e conforme (`pass.json`) et le rejet effectif de toutes les entrÃ©es Ã  dÃ©faut.
  - Script bash d'exÃ©cution CI portable et modÃ¨le de workflow GitHub Actions documentÃ©.
- **Tests** : 9 nouveaux tests de contrat dans `tests/contract/edp-verify-and-gate.test.ts` portant la suite complÃ¨te Ã  71 tests de contrat au vert.


### Paquet de DÃ©cision ExÃ©cutable (EDP) : Ontologie & Persistance Souveraine (Palier 3 - Issues #173, #181, #174, #177)
- **Client d'Ontologie & ContrÃ´le des Liaisons (`ontologyClient.ts`) (#173)** :
  - Client de lecture du catalogue d'ontologie supportant le mode fixture hors-ligne pour la CI et l'intÃ©gration API avec le Knowledge Hub sans aucun appel de modÃ¨le.
  - DÃ©tection rigoureuse des URNs inconnues (erreur bloquante), des rÃ©visions futures inexistantes et avertissement `stale_binding` dÃ¨s qu'une liaison est sur une rÃ©vision antÃ©rieure.
  - En cas d'indisponibilitÃ© du Hub, levÃ©e d'une erreur explicite sans jamais inventer de donnÃ©es.
- **Compilateur de Projections & Linter de LittÃ©raux (`projectionCompiler.ts`) (#181)** :
  - Compilateur projetant les entitÃ©s liÃ©es en un document `data.ontology` canonique pour OPA avec empreinte cryptographique SHA-256 dÃ©terministe (reproductibilitÃ© octet pour octet).
  - Linter Rego analysant les politiques pour dÃ©tecter les littÃ©raux codÃ©s en dur qui doublonnent des valeurs d'ontologie.
- **Persistance Prisma & Application Inviolable de l'Invariant II (`edpRepository.ts`, `prisma/schema.prisma`) (#174)** :
  - ModÃ¨le additif `ExecutableDecisionPackage` stockant l'intension, les facettes Ã©pistÃ©miques, les hashs de politiques et les mÃ©tadonnÃ©es de validation.
  - RÃ¨gle constitutionnelle absolue (Invariant II) : refus bloquant de toute transition vers le statut `validated` pour un EDP dÃ©rivÃ© par LLM (`llm-derived`) sans un validateur humain dÃ»ment identifiÃ© et habilitÃ©.
  - Respect strict des rÃ´les formels (Invariant VII) : seuls les rÃ´les d'architectes habilitÃ©s peuvent homologuer un EDP.
  - Isolation Ã©tanche par drapeau `ARCHINEX_EXPERIMENTAL_EDP=1`.
- **RÃ©tractation Automatique & Maintenance de VÃ©ritÃ© (`retractEdpOnAntecedentChange`) (#177)** :
  - Application directe de l'Invariant VI : dÃ¨s qu'une dÃ©cision d'architecture source est rÃ©tractÃ©e ou qu'une URN d'ontologie liÃ©e change de rÃ©vision, l'EDP bascule automatiquement Ã  l'Ã©tat `stale` avec consignation explicite de la cause (`staleReason`).
  - Interdiction formelle de prÃ©senter un EDP `stale` comme `validated`.
- **Tests** : 15 tests de contrat dans `tests/contract/edp-ontology-and-persistence.test.ts` (total 62 tests passants sur les Paliers 1, 2 & 3).

### Paquet de DÃ©cision ExÃ©cutable (EDP) : Moteur OPA, BibliothÃ¨que Rego & RÃ©fÃ©rence ADR-012 (Palier 2 - Issues #171, #175, #180, #176, #172)
- **ExÃ©cuteur OPA DÃ©terministe (`opaRunner.ts`, `install-opa.ps1`, `install-opa.sh`) (#171)** :
  - ExÃ©cuteur OPA encapsulant `opa test` et `opa eval` avec gestion des timeouts, typage strict des rÃ©sultats et dÃ©tection de version minimale (Rego v1).
  - RÃ¨gle bloquante : le statut `unavailable` en cas d'absence du binaire OPA n'est jamais confondu avec un succÃ¨s (`pass`).
  - Scripts d'installation automatique et de contrÃ´le d'intÃ©gritÃ© SHA-256 pour OPA v1.21.4 sous Windows et Linux / CI.
- **BibliothÃ¨que Rego Commune (`policies/lib/edp_common.rego`) (#175)** :
  - Fonctions helpers standard : extraction sÃ»re de l'hÃ´te `host_of(url)` Ã©vitant les fausses correspondances par sous-chaÃ®ne (`contains`), `missing_inputs` et `build_status` conforme aux 4 verdicts.
  - Documentation intÃ©grÃ©e des 3 piÃ¨ges Rego : champ indÃ©fini, comparaison de sous-chaÃ®ne et ensemble vide (vacuitÃ©).
  - 7 tests unitaires Rego natifs (`policies/lib/edp_common_test.rego`).
- **EDP de RÃ©fÃ©rence ADR-012 Substrat Bare-Metal (`edp/examples/adr012-baremetal/`) (#180)** :
  - DÃ©finition complÃ¨te de l'oracle pour le substrat Kubernetes Telco Cloud (Sylva / CAPI et Nautobot Planned) couvrant 6 rÃ¨gles architecturales ciblÃ©es.
  - Isolation du bloc d'ontologie en tÃªte de politique pour substitution future par `data.ontology`.
  - Mocks Red/Green complets : `pass.json`, 6 mocks Ã  dÃ©faut unique (`fail_rule_1` Ã  `fail_rule_6`) et mock multi-dÃ©rive d'agrÃ©gation.
- **Garde de Mutation DÃ©terministe (`scripts/edp-mutation-gate.ts`) (#176)** :
  - Analyseur de mutation Rego testant la rÃ©silience de l'oracle par suppression de rÃ¨gles (`drop_rule`).
  - Score de mutation atteint : **6/6 mutants tuÃ©s (100 %)** sur ADR-012.
- **Contrat des Fixtures & Adresses RÃ©servÃ©es (`validateFixturesContract.ts`) (#172)** :
  - Validateur exigeant exactement 1 mock conforme, 1 mock dÃ©faillant par rÃ¨gle ciblant un dÃ©faut unique, et le confinement strict de toutes les adresses IP aux plages documentaires RFC 5737 (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) et RFC 3849 (`2001:db8::/32`).
- **Tests** : 22 tests de contrat dans `tests/contract/edp-opa-runner.test.ts`, `tests/contract/edp-rego-common.test.ts` et `tests/contract/edp-adr012-reference.test.ts` (total 47 tests passants sur les Paliers 1 & 2).

### Paquet de DÃ©cision ExÃ©cutable (EDP) : SpÃ©cifications, SchÃ©mas & Invariants (Palier 1 - Issues #167, #168, #169, #170)
- **Proposition OpenSpec A12 (`openspec/changes/a12-edp/`) (#167)** :
  - Cadrage complet, spÃ©cification formelle (`proposal.md`, `design.md`, `tasks.md`, `.openspec.yaml`) ancrÃ©e dans la Constitution d'Archinex.
  - DÃ©clinaison concrÃ¨te des Invariants I (5 facettes), II (`verified Ã— llm-derived` interdit sans validateur humain habilitÃ©), III (le silence n'est pas une approbation), IV (brouillon appÃ¢t percutant), V (portes G3 et G4), VI (rÃ©tractation vers `stale`), VII (rÃ´les formels) et X (matÃ©rialisation visuelle).
  - Convention normative de verdict Ã  4 Ã©tats : `compliant | violated | not_applicable | insufficient_input`.
  - Documentation du cadre expÃ©rimental (`ARCHINEX_EXPERIMENTAL_EDP=1` et branche socle `experimental/edp`).
- **JSON Schema du Paquet de DÃ©cision ExÃ©cutable (`src/lib/schemas/edp.schema.json`, `validateEdp.ts`) (#168)** :
  - DÃ©finition du schÃ©ma JSON Draft-07 couvrant `metadata`, `decision_context`, `refinement_contract`, `verification_oracle` et `provenance`.
  - Rejet systÃ©matique de tout paquet dÃ©pourvu de `verification_oracle` ou de suite `self_test`.
  - Fixtures valides (`valid-adr012-baremetal.json`, `valid-adr015-security-zones.json`) et 8 fixtures invalides typÃ©es.
- **ContrÃ´le de PuretÃ© de l'Intension (`src/lib/domain/edp/intentionPurity.ts`) (#169)** :
  - DÃ©tection lexicale et regex des valeurs d'instanciation physique ou logique : IPv4, IPv6, prÃ©fixes CIDR, adresses MAC et noms d'hÃ´tes pointÃ©s dans `decision_context`.
  - Liste blanche stricte garantissant zÃ©ro faux positif sur les numÃ©ros de version logicielle (`RKE2 1.28`, `5.5`), spÃ©cifications (`3GPP TS 23.501`, `RFC 5737`), mÃ©triques (`5QI 128-254`, `VLAN 100`, `MTU 1500`) et gabarits (`<IP>`, `${NODE_IP}`, `example.com`).
  - Fonction pure, dÃ©terministe et isolÃ©e de tout appel rÃ©seau.
- **Contrat d'EntrÃ©e de Raffinement (`src/lib/schemas/refined_input.schema.json`, `validateRefinedInput.ts`) (#170)** :
  - SchÃ©ma et validateur des entrÃ©es de raffinement (LLD) avec mÃ©tadonnÃ©es de provenance obligatoires (`tool`, `version`, `command`, `sha256`, `generated_at`).
  - Ã‰limination des faux positifs par vacuitÃ© : verdict `insufficient_input` dÃ¨s qu'une source dÃ©clarÃ©e est manquante ou vide.
  - Rejet des sources non dÃ©clarÃ©es (`verdict: violated`).
- **Tests** : 25 tests de contrat dans `tests/contract/edp-schema.test.ts`, `tests/contract/edp-intention-purity.test.ts` et `tests/contract/edp-refined-input.test.ts`.
### Optimisation & Cache de l'Extraction de Faits de DÃ©cision (Agent Synthesizer)
- **Mise en cache multi-niveaux et dÃ©duplication Singleflight (`src/lib/server/agents/decisionFactsCache.ts`)** :
  - ClÃ© de hachage SHA-256 dÃ©terministe basÃ©e sur le contenu de la dÃ©cision (`rationale`, `retainedOptionTitle`, rÃ©sumÃ©) et la liste normalisÃ©e du vocabulaire autorisÃ©.
  - Cache mÃ©moire ultra-rapide (< 1 ms) pour les accÃ¨s rÃ©pÃ©tÃ©s en cours d'exÃ©cution.
  - DÃ©duplication *Singleflight* des requÃªtes concurrentes en vol, interdisant tout doublon d'appel externe au LLM pour la mÃªme dÃ©cision.
  - Persistance asynchrone dans la table de cache de base (`FactorizationStageCache`) pour survivre aux redÃ©marrages de l'application.
  - Route API mise Ã  jour (`/api/projects/[projectId]/subjects/[subjectId]/decision/extract-facts`) pour renvoyer le statut de cache et la source (`cache-memory`, `cache-db` ou `live`).
- **Fluidification & Cache Client (`src/lib/components/deliberation/DecisionSurveyCard.svelte`)** :
  - MÃ©morisation de l'Ã©tat d'extraction et cache en mÃ©moire cÃ´tÃ© client pour Ã©viter toute rÃ©Ã©mission de requÃªte HTTP lors des bascules d'onglets ou des retours sur un sujet dÃ©jÃ  consultÃ©.
  - Ã‰limination des boucles de requÃªtes lorsque Claude renvoie une liste de faits vide (`{"facts": []}`).
- **Tests unitaires et de non-rÃ©gression (`tests/unit/decision-facts-cache.test.ts`)** :
  - 4 tests unitaires validant le calcul de clÃ© dÃ©terministe, le service live vs cache-mÃ©moire (0 token LLM additionnel), la dÃ©duplication de requÃªtes en vol et le mÃ©canisme d'invalidation.


### Architecture Cible GÃ©nÃ©rique : Ã‰limination des RÃ¨gles Projet en Dur & RÃ©activitÃ© en Direct des SpÃ©cifications
- **Suppression IntÃ©grale des RÃ¨gles SpÃ©cifiques en Dur (`artifactProjections.ts`)** :
  - Ã‰limination formelle de toutes les conditions et chaÃ®nes codÃ©es en dur liÃ©es Ã  un projet particulier (`ratp`, `pcc`, `luxembourg`, `lulu`, `apres-tetra`).
  - Chaque artefact graphique (Mermaid C4, sÃ©quence de dÃ©ploiement, SysML, Structurizr) est dÃ©sormais formellement Ã©tiquetÃ© et compartimentÃ© par son identifiant de projet `projectId` (`subgraph SYSTEM["SystÃ¨me : ${projectName} (${sectionRef}) [Projet: ${projectId}]"]`).
  - DÃ©duction dynamique de l'Ã©cosystÃ¨me externe Ã  partir des mÃ©tadonnÃ©es du projet (`enterpriseName` et `projectName`) : `SI ${enterpriseName} (Existant)`, `Supervision Externe (${enterpriseName})`, `Guichet Homologation / Validation Humaine (${enterpriseName})`, `Plateforme Logs & Audit (${enterpriseName})`, etc.
  - DÃ©tection architecturale par archÃ©types gÃ©nÃ©riques (`hasTelecomCrypto`, `hasMultiEnv`, `hasSupervision`, `hasLogs`, `hasDeployment`, `hasAuth`) opÃ©rant sans prÃ©supposÃ© de marque ou de client.
- **RÃ©activitÃ© en Direct des Artefacts lors de l'Ã‰dition de SpÃ©cification (`deliberationStore`, `SubjectThreadView`)** :
  - Ajout de l'Ã©tat rÃ©actif `detailedSpecs = $state<Record<string, string>>({})` dans `deliberationStore`, avec mise en cache et restauration par engagement lors des bascules de projet.
  - Liaison bidirectionnelle instantanÃ©e sur la zone de saisie du workbench L4 (`SubjectThreadView`) : chaque frappe (`oninput`) met Ã  jour le texte de la spÃ©cification dÃ©taillÃ©e dans le store.
  - Le calcul des projections (`getProjectionContext`) injecte `detailedSpecText` en temps rÃ©el : dÃ¨s qu'une exigence ou contrainte est rÃ©digÃ©e (ex: chiffrement IPsec ESP, mÃ©diation DEA, ou topologie 3 plateformes), les schÃ©mas de la Phase 3 se reconfigurent immÃ©diatement sans action manuelle.
- **Cycle de Vie & DÃ©clencheurs de RÃ©gÃ©nÃ©ration** :
  - *Automatique rÃ©actif* : recalcul immÃ©diat via les expressions dÃ©rivÃ©es Svelte 5 (`$derived`) dÃ¨s modification des dÃ©cisions L3 ou de la spÃ©cification L4.
  - *Manuel* : bouton Â« RÃ©gÃ©nÃ©rer Â» dans `ArtifactRegenerationHub` pour forcer le recalcul Ã  partir de la version serveur.
  - *Scellement & Export* : gÃ©nÃ©ration figÃ©e et horodatÃ©e lors de la signature cryptographique SHA-256 (Jalon L5) ou de l'export du fragment HLD.
- **Tests & Assurance QualitÃ©** :
  - Test de contrat nÂ°13 dans `tests/contract/artifact-projections.test.ts` validant la rÃ©activitÃ© en direct des diagrammes lors de l'Ã©volution de `detailedSpecText` sans altÃ©rer la dÃ©cision L3.
  - Mise Ã  niveau des tests de non-rÃ©gression (13/13 rÃ©ussis).


### Isolation Inter-Projets des Artefacts & Socle Multi-Plateformes (Lulu)
- **Isolation Stricte des Contextes de Projet (`deliberationStore`)** :
  - Sauvegarde et restauration complÃ¨tes des `decisionContexts` et des `frozenSnapshots` par identifiant d'engagement dans `engagementCache`.
  - RÃ©initialisation propre Ã  vide lors de l'ouverture d'un nouvel engagement non mis en cache, Ã©liminant toute fuite ou persistance d'artefacts d'un projet prÃ©cÃ©dent (ex: spÃ©cifications ou schÃ©mas RATP affichÃ©s par erreur sur le projet luxembourgeois Lulu).
- **Suppression DÃ©finitive des LibellÃ©s en Dur dans les Projections Cibles (`artifactProjections`)** :
  - Conditionnement systÃ©matique des mentions d'outillage RATP et PCC (`mentionsRATP`) : utilisation par dÃ©faut de libellÃ©s agnostiques et souverains (`Passerelle d'Export & Connecteurs d'IntÃ©gration`, `Supervision & Exploitation Externe`, `Responsable Exploitation / RSSI`).
- **ModÃ©lisation DÃ©diÃ©e du Socle Multi-Plateformes & Qualification Industrielle** :
  - Prise en charge des topologies Ã  3 plateformes : **Plateforme de Production (PROD)**, **PrÃ©-production Unique Iso-Ã‰tat** (accueil de l'Ã©tat candidat, rÃ©plique technique exacte de la PROD), et **Plateforme de Test RÃ©duit avec Test-RAN**.
  - IntÃ©gration de la zone dÃ©centralisÃ©e **Qualification Fournisseurs** avec porte de **ContrÃ´le d'Audit & ReprÃ©sentativitÃ©** des bancs d'essais usine.
  - Diagramme de sÃ©quence de dÃ©ploiement et qualification en 3 phases (Usine & audit, banc radio Test-RAN, prÃ©-production iso-Ã©tat vers bascule de production).
- **Tests de Non-RÃ©gression & Isolation** :
  - Nouveaux tests de contrat dans `tests/contract/artifact-projections.test.ts` garantissant l'absence totale de mentions RATP/PCC sur les spÃ©cifications Lulu et la bonne gÃ©nÃ©ration de la topologie multi-plateformes.

### SÃ©curitÃ© & Gouvernance : Garde d'AccÃ¨s Anonyme (Dashboard Seul) & FiabilitÃ© de l'Homologation L4
- **Restriction des Visiteurs Anonymes au Dashboard Global (`+layout.svelte`, `+page.svelte`)** :
  - Pour les visiteurs non authentifiÃ©s (`!session`), la barre latÃ©rale et le menu mobile ne prÃ©sentent que le Dashboard (Â« Executive Cockpit Â») ainsi qu'un bouton direct de connexion (`/login`).
  - Les accÃ¨s directs par URL aux espaces de travail (`/workspaces`, `/workspaces/new`), Ã  l'atelier de dÃ©libÃ©ration (`/deliberation`), et au graphe de connaissances (`/knowledge`, `/knowledge/[id]`) sont protÃ©gÃ©s cÃ´tÃ© serveur via `requireAuth(locals, '/login?redirectTo=...')`.
  - MÃ©morisation et validation sÃ©curisÃ©e du paramÃ¨tre `redirectTo` sur la mire de connexion pour rediriger l'utilisateur vers la page initialement demandÃ©e aprÃ¨s authentification.
- **Fiabilisation des Transitions de MaturitÃ© & Homologation L4 (`SubjectThreadView.svelte`)** :
  - VÃ©rification systÃ©matique du code de retour HTTP (`res.ok`) sur `patchSubject` lors de l'homologation d'une spÃ©cification L4 et des changements de jalons.
  - En cas d'erreur de requÃªte (notamment `401 Unauthorized` si la session a expirÃ© ou est absente), affichage immÃ©diat d'une notification explicite et rechargement de l'Ã©tat serveur pour Ã©viter les faux succÃ¨s visuels.
- **Tests & Assurance QualitÃ©** :
  - Nouveau test de contrat dans `tests/contract/anonymous-dashboard-guard.test.ts` validant les redirections vers `/login`, le filtrage du menu et la prÃ©servation de `redirectTo`.


### Rendu Graphique : AperÃ§u Plein Ã‰cran au Maintien du Clic & SpÃ©cification SÃ©curitÃ© TÃ©lÃ©com S6a
- **AperÃ§u Plein Ã‰cran Dynamique au Maintien du Clic (`MermaidViewer`)** :
  - L'appui maintenu (clic gauche enfoncÃ©) sur n'importe quel diagramme Mermaid l'affiche instantanÃ©ment en surcouche plein Ã©cran haute lisibilitÃ© (`backdrop-blur`, dimensions maximales de l'Ã©cran, zoom optimisÃ©).
  - Le relÃ¢chement de la souris (`pointerup`, `mouseup` ou sortie d'Ã©cran) referme immÃ©diatement l'overlay et replace l'utilisateur dans son flux de travail.
  - PossibilitÃ© complÃ©mentaire de verrouiller le mode plein Ã©cran via le bouton dÃ©diÃ© ou de quitter avec la touche Ã‰chap.
  - Ajout d'un indicateur discret d'aide ergonomique au survol du graphe.
- **Topologie & SÃ©quence TÃ©lÃ©com 3GPP S6a (IPsec ESP & MÃ©diation DEA)** :
  - Prise en charge des architectures rÃ©seau critiques avec interconnexion sÃ©curisÃ©e entre lots (ex: Lot 3 MME Tiers â†” Lot 1 CÅ“ur / HSS).
  - Diagramme d'architecture cible gÃ©nÃ©rant les 3 zones de confiance : RÃ©seau Tiers (MME), DMZ de sÃ©curitÃ© (SecGW-Lot1 en terminaison IPsec ESP + DEA-Lot1 en mÃ©diation Diameter / masquage topologique TH), et CÅ“ur souverain (HSS-Lot1) avec matÃ©rialisation explicite du flux direct non chiffrÃ© formellement interdit.
  - Diagramme de sÃ©quence 3GPP en 4 phases : nÃ©gociation IKEv2 / SA ESP, encapsulation/dÃ©capsulation IPsec, inspection Diameter S6a (AVP / TH) par le DEA, et rÃ©solution sÃ©curisÃ©e HSS.
- **Tests & Assurance QualitÃ©** :
  - Nouveaux tests de contrat dans `tests/contract/artifact-projections.test.ts` validant la projection dÃ©terministe de la topologie rÃ©seau et de la sÃ©quence S6a.

### Ergonomie de DÃ©libÃ©ration & Phase 3 : Filtrage par Lots/Parties et SÃ©lecteur de Sujets L4
- **Filtre Lots / Parties dans le Fil de DÃ©libÃ©ration (`SubjectConversationList`)** :
  - IntÃ©gration de la barre de filtrage par lots d'architecture (`FolderKanban`) dans le fil de dÃ©libÃ©ration, alignÃ©e sur celle du tableau de maturitÃ©.
  - Synchronisation bidirectionnelle de `selectedPartId` via le store `deliberationStore`, garantissant que le lot sÃ©lectionnÃ© est conservÃ© lors du passage entre le Tableau de maturitÃ©, le Fil de conversation et la Phase 3.
  - Mise Ã  jour dynamique des compteurs de filtres rapides (Â« Tous Â», Â« BloquÃ©s Â», Â« Ã€ faire Â», Â« ArbitrÃ©s Â») en fonction du lot sÃ©lectionnÃ©.
- **SÃ©lecteur de Sujet en Phase 3 Rendu & Homologation (`Phase3SubjectSelector`)** :
  - Composant interactif en tÃªte de la Phase 3 permettant de re-sÃ©lectionner instantanÃ©ment le sujet ciblÃ© sans devoir retourner en Phase 2.
  - PrÃ©-filtrage par dÃ©faut sur les sujets **ðŸŽ¯ SpÃ©cifiÃ©s L4** (prÃªts pour l'homologation), avec bascule vers les sujets **âš–ï¸ ArbitrÃ©s L3+** ou **Tous les sujets**.
  - Repli intelligent automatique vers L3+ ou Tous si aucun sujet n'a encore atteint le palier L4 dans le projet actif.
  - SÃ©lecteur de lots d'architecture intÃ©grÃ© (`FolderKanban`) et recherche textuelle rapide (Â§11, WAPT, rÃ©seau, etc.).
  - SÃ©lection rÃ©active du sujet (`deliberationStore.selectSubject(id, false)`) sans altÃ©rer le mode de vue actif.
- **Tests & Assurance QualitÃ©** :
  - Nouveau test de contrat dans `tests/contract/phase3-subject-selector.test.ts` validant le prÃ©-filtrage L4, la synchronisation du store et le repli sans erreur.

### Phase 3 Rendu & Homologation : IntÃ©gration du SchÃ©ma d'Architecture Cible SpÃ©cifiÃ©e et DÃ©ploiement SÃ©curisÃ©
- **Rendu d'Architecture Technique vs Graphe DÃ©cisionnel** :
  - Introduction du gÃ©nÃ©rateur dÃ©terministe `generateTargetArchitectureDiagram` dans `artifactProjections.ts`, alignÃ© sur les patterns ArcKit (`arckit-diagram` C4 Container / Flowchart).
  - MatÃ©rialisation concrÃ¨te des frontiÃ¨res architecturales : pÃ©rimÃ¨tre de la solution autonome (modules, agents embarquÃ©s, console, mÃ©trologie locale) vs pÃ©rimÃ¨tre du SI existant/client (supervision, logs/SIEM, dÃ©pÃ´ts).
  - ReprÃ©sentation explicite des flux d'interfaces avec leurs protocoles (SNMP Trap, API REST, Syslog TLS) et de la chaÃ®ne de confiance (paquets signÃ©s, guichet de validation humaine, agents de dÃ©ploiement).
- **ChaÃ®ne de DÃ©ploiement et SÃ©quence d'Homologation** :
  - Ajout de `generateDeploymentSequenceDiagram` modÃ©lisant les 3 phases de dÃ©ploiement et d'homologation : 1. Construction & signature cryptographique, 2. Porte d'homologation / validation humaine en recette/INT, 3. DÃ©ploiement sÃ©curisÃ© avec vÃ©rification de signature.
- **ExpÃ©rience Utilisateur en Phase 3 (Rendu & Homologation)** :
  - Dans `ArtifactRegenerationHub.svelte`, ajout d'un sÃ©lecteur de vues Mermaid : **ðŸŽ¯ Architecture SpÃ©cifiÃ©e (Cible)** (vue par dÃ©faut), **ðŸ”„ ChaÃ®ne de DÃ©ploiement & Homologation** (sÃ©quence) et **âš–ï¸ Graphe DÃ©cisionnel (AuditabilitÃ©)** (arbre causal Ã©pistÃ©mique).
  - Dans `HldFragmentView.svelte`, affichage interactif direct du schÃ©ma d'architecture spÃ©cifiÃ©e sous la dÃ©cision actÃ©e.
  - Dans `renderHldFragmentMarkdown`, inclusion automatique du bloc ```mermaid` dans le dossier Markdown exportÃ©.
- **Tests & Assurance QualitÃ©** :
  - Nouveaux tests de contrat dans `tests/contract/artifact-projections.test.ts` et `tests/contract/hld-fragment.test.ts` couvrant les cas hybrides complexes (supervision RATP, WAPT, validation humaine) et le fallback propre sans dÃ©cision.


### DÃ©pouillement RFP : AllÃ¨gement de l'Interface & Retrait des ModÃ¨les PrÃ©-intÃ©grÃ©s Factices
- **AllÃ¨gement de la modale de confrontation et factorisation RFP (`RfpConfrontationDialog`)** :
  - Retrait du mode et du bouton Â« ModÃ¨les PrÃ©-intÃ©grÃ©s Â» au profit d'un flux d'entrÃ©e Ã©purÃ© par dÃ©faut centrÃ© sur les documents rÃ©els (**Fichier Local**, **Coller le texte**, **URL Web**).
  - Suppression de la grille encombrante des cartes de modÃ¨les d'exemple Ã  l'ouverture de la boÃ®te de dialogue.
  - La zone de texte et les mÃ©tadonnÃ©es s'initialisent dÃ©sormais vierges pour un traitement direct sans artefacts de dÃ©monstration.
  - L'Ã©chantillon de vÃ©rification humaine et le rapport d'extraction ne s'affichent que dynamiquement lorsqu'un texte rÃ©el est chargÃ© ou saisi.
- **Documentation et Protocole OpÃ©rateur** :
  - Clarification de la valeur ajoutÃ©e de l'Ã©chantillon de vÃ©rification humaine (contrÃ´le rapide anti-hallucination sur les anomalies prioritaires, faisabilitÃ© en 2 minutes).
  - Guide opÃ©rationnel dÃ©taillÃ© dans `docs/user-guide.md` sur la conduite Ã  tenir par l'opÃ©rateur en cas d'anomalie de dÃ©coupage.
### Initialisation d'Espace de Travail : AllÃ¨gement des Ã‰tapes 1 et 3
- **Ã‰tape 1 (Cadrage & Description)** :
  - Retrait du bloc Â« DÃ©marrage Ã‰clair Â· PrÃ©sets MÃ©tiers Â» (et Â« DÃ©marrage Rapide Â» dans la modale) au profit d'une interface Ã©purÃ©e sans prÃ©sÃ©lection ferroviaire ou cloud souverain par dÃ©faut.
- **Ã‰tape 3 (Docs Amonts)** :
  - Suppression de la banniÃ¨re redondante Â« Invariant Ã‰pistÃ©mique Â· Patrimoine Commun Enrichi Â» pour aÃ©rer l'espace visuel.
  - Suppression du bloc Â« Lier des Normes & Standards DÃ©jÃ  PrÃ©sents dans le Socle Commun Â», les rÃ©fÃ©rentiels rÃ©glementaires et standards applicables Ã©tant dÃ©jÃ  formellement sÃ©lectionnÃ©s Ã  l'Ã‰tape 2.
- **Alignement Complet** :
  - Application synchronisÃ©e sur la page pleine `/workspaces/new` et la boÃ®te de dialogue modale `CreateWorkspaceDialog.svelte`.
  - Ajout du test de non-rÃ©gression dans `tests/contract/workspace-creation.test.ts`.

### Titre de l'Application : Remplacement du Titre Boilerplate par Â« archinex Â»
- **Harmonisation de la banniÃ¨re et des locales** :
  - Remplacement de la chaÃ®ne boilerplate `A small app to have fun` (et ses dÃ©clinaisons `Une petite app pour rigoler` / `Una pequeÃ±a aplicaciÃ³n para divertirse`) par `archinex` dans tous les dictionnaires de localisation (`en.json`, `en-UK.json`, `fr-FR.json`, `es.json`).
  - Alignement de la valeur par dÃ©faut dans `src/routes/+layout.svelte` et de la balise `<title>` sur la page de connexion (`src/routes/login/+page.svelte`).
  - Ajout du test de contrat de non-rÃ©gression dans `tests/contract/app-title.test.ts`.


### DÃ©mo Lulu : Ensemencement Complet des 16 Sujets d'Architecture (seed:lulu)
- **Extension de l'engagement lulu-lot1-noc post-ingestion** :
  - Passage de 7 Ã  16 sujets d'architecture d'entreprise et de solution au niveau L1_framed.
  - Couverture exhaustive des 12 thÃ©matiques factorisÃ©es du RFP Section 4 (NOC & RÃ©silience) : haute disponibilitÃ©, mÃ©diation OSS/NRM, supervision RAN MNO, RCA/AIOps, collecte NOC/SOC, automatisation SMO, gouvernance QoS 5QI, assurance de service (sondes E2E) et CMDB.
  - PrÃ©servation des options en draft et des pondÃ©rations multicritÃ¨res MCDA sur l'ensemble des sujets.
  - Mise Ã  jour du contrat de test seed-lulu.test.ts.

### RÃ©fÃ©rentiels & Doctrine : Auto-enrichissement IA et Suggestions Locales Sans DÃ©pendance Serveur Hub (#93 & #99)
- **Suppression de la dÃ©pendance LLM cÃ´tÃ© LLMOps & RÃ©solution du 404** :
  - DÃ©placement de l'infÃ©rence des suggestions doctrinales dans Archinex via `LocalLlmClient` (Ollama local / API Claude) et heuristiques dÃ©terministes `FRAMEWORK_TOPIC_PATTERNS`.
  - L'endpoint unitaire `POST /api/frameworks/ingestions/[id]/requirements/[reqId]/suggest-links` prend le relais localement si le Hub ne sert pas la route (Ã©vite l'erreur HTTP 404).
- **Auto-enrichissement Â« ZÃ©ro Friction Â» post-ingestion** :
  - Ã€ chaque ingestion de rÃ©fÃ©rentiel (`POST /api/frameworks/ingestions`), Archinex prÃ©-gÃ©nÃ¨re immÃ©diatement les critÃ¨res d'acceptation, les liaisons vers les principes/patrons actifs et les termes de recherche, puis les soumet au Hub via `POST .../link-proposals`.
  - Ajout d'une route `POST /api/frameworks/ingestions/[id]/auto-suggest` et du bouton Â« Auto-enrichir par l'IA Â» dans l'interface pour enrichir un rÃ©fÃ©rentiel existant en un clic.
  - IntÃ©gration de tests de contrat complets dans `tests/contract/framework-auto-suggest.test.ts`.

### DÃ©libÃ©ration : ClartÃ© et restitution dÃ©taillÃ©e des erreurs de validation de dÃ©cision (#35)
- **Restitution explicite des contraintes d'arbitrage (`POST /decision` & IHM)** :
  - Restitution dans le message d'erreur des champs en dÃ©faut prÃ©cis (ex: motivation trop courte, option retenue absente, justification de dispense incomplÃ¨te) plutÃ´t qu'un message gÃ©nÃ©rique bloquant Â« DonnÃ©es de dÃ©cision invalides Â».
  - IntÃ©gration du dÃ©tail des erreurs de validation dans `OptionsMatrix.svelte`, `DecisionSurveyCard.svelte` et `ArbitrationPanel.svelte`.
  - Ajout des tests de contrat validant les contraintes Zod de `CreateDecisionSchema` et l'explicitation des erreurs.

### DÃ©libÃ©ration : Ã‰limination de la mutation d'Ã©tat interdite dans le calcul du rapport de maturitÃ© (#35)
- **Correction Svelte 5 (`state_unsafe_mutation` dans `SubjectThreadView.svelte`)** :
  - Remplacement de la mutation directe en place de l'objet `$state criteriaReport` au sein de la rune `$derived.by(effectiveReport)` par une dÃ©rivation pure et fonctionnelle.
  - RÃ©solution du crash complet du Workbench de dÃ©libÃ©ration Ã  l'exÃ©cution.


### DÃ©libÃ©ration & RBAC : Clarification du CritÃ¨re d'Homologation Lead Architect (#35)
- **Conservation du jalon L4/L5 validÃ© (`maturityCriteria.ts`)** :
  - DÃ¨s lors qu'un sujet a Ã©tÃ© homologuÃ© (`L4_specified` ou `L5_archived`), le critÃ¨re `lead_architect_approval` reste marquÃ© comme satisfait pour tous les profils consultant le dossier.
  - Lorsque le sujet est en attente d'homologation (`L3_decided`), la description du critÃ¨re explicite clairement le rÃ´le requis (`Lead Architect`) en miroir du rÃ´le actif de la session (ex: `expert`, `contributeur`), dissipant tout malentendu avec une dÃ©synchronisation de donnÃ©es.


### DÃ©libÃ©ration & Homologation : Franchissement du Jalon L4 et VisibilitÃ© de l'Affirmation (#35)
- **Affirmation formelle de dÃ©cision (`DecisionSurveyCard` & `arbitrationDb`)** :
  - Restitution systÃ©matique de l'Ã©vÃ©nement `DECISION_ASSERTED` dans `getSubjectArbitrationContext` via le champ `validatedBy`.
  - Masquage automatique du bouton d'action *"Affirmer la dÃ©cision et ses faits"* une fois l'affirmation actÃ©e par un pair, au profit du bandeau vert d'autoritÃ© certifiant le dÃ©cideur habilitÃ©.
- **Homologation de la SpÃ©cification Technique (Jalon L4)** :
  - **Correction du faux blocage `FORMAL_DECISION_REQUIRED`** : `deliberationStore.setSubjectLevel` et la route API `PATCH /subjects/[id]` n'exigent plus l'arbitrage formel lorsqu'un sujet est dÃ©jÃ  actÃ© (`L3_decided`) et qu'il franchit le jalon d'ingÃ©nierie `L4_specified`.
  - **Prise en compte rÃ©active de la spÃ©cification rÃ©digÃ©e** : le critÃ¨re `specification_drafted` est immÃ©diatement validÃ© dÃ¨s lors qu'un contenu de spÃ©cification DLD est renseignÃ© dans l'atelier, et synchronisÃ© en base (`deliberationStatus: 'specified'`).
  - **RÃ©solution des sous-sujets dÃ©rivÃ©s (A28)** : le bouton d'action du critÃ¨re de sous-sujets non cadrÃ©s oriente directement vers l'onglet *Questions en cascade* pour cadrer les sous-sujets en attente.


### DÃ©libÃ©ration : Nettoyage syntaxique du composant fil de dÃ©libÃ©ration (#35)
- **Correction du gabarit Svelte (`SubjectThreadView.svelte`)** :
  - Ã‰limination d'un fragment dupliquÃ© rÃ©siduel (balises fermantes orphelines et rÃ©-instanciation de l'en-tÃªte de spÃ©cification DLD) provoquant une erreur de compilation Svelte `block_unexpected_close`.


### DÃ©libÃ©ration & IngÃ©nierie : PÃ©dagogie des 5 Piliers Structurants et Atelier de SpÃ©cification DLD (#35)
- **Fil Directeur PÃ©dagogique : Les 5 Piliers de la DÃ©libÃ©ration d'Architecture** :
  - IntÃ©gration dans le volet de spÃ©cification d'un bandeau visuel rappelant l'enchaÃ®nement logique et les questions clÃ©s pour l'architecte :
    1. *Question (ProblÃ¨me)* : Â« Quel problÃ¨me rÃ©sout-on ? Â» (affichage de la question d'architecture)
    2. *Cadrage & HypothÃ¨se* : Â« Quelle est la cible initiale ? Â» (affichage de l'hypothÃ¨se de rÃ©fÃ©rence)
    3. *Options & Variantes* : Â« Quelles alternatives comparÃ©es ? Â» (compteur et Ã©tat des options explorÃ©es)
    4. *CritÃ¨res & ConformitÃ©* : Â« Sur quoi juge-t-on le choix ? Â» (compteur des critÃ¨res opposables)
    5. *Arbitrage L3 ActÃ©* : Â« Quelle option retenue et pourquoi ? Â» (dÃ©cision arbitrÃ©e et motivÃ©e)
  - Clarification du bouton d'accÃ¨s aux notes tÃ©lÃ©graphiques d'appoint (*Â« Consulter les notes tÃ©lÃ©graphiques brutes (5 colonnes) Â»*).
### DÃ©libÃ©ration : Persistance du Mode de Vue & Synchronisation LLMOps Silencieuse en TÃ¢che de Fond
- **Persistance intÃ©grale de la vue de dÃ©libÃ©ration (`deliberationStore.svelte.ts`)** :
  - **MÃ©morisation du mode d'affichage et de la posture** : persistance automatique dans le `localStorage` du navigateur sous les clÃ©s `archinex:deliberationViewMode:<id>` (`board` vs `conversation`) et `archinex:activePosture:<id>` (`appropriation`, `deliberation`, `rendu`), en complÃ©ment de `archinex:activeSubjectId:<id>`.
  - **Navigation et rechargement sans perte de contexte** : lors d'un rechargement de page ou d'une navigation transversale, l'utilisateur conserve sa posture et son panneau exact (ex: le fil de dÃ©libÃ©ration sur un sujet spÃ©cifique), Ã©vitant le renvoi automatique et intempestif sur le tableau de maturitÃ© global.
  - **Support des paramÃ¨tres d'URL explicites** : dans `src/routes/deliberation/+page.svelte`, prise en compte prioritaire des paramÃ¨tres de requÃªte (`mode`, `subject`, `posture`) si prÃ©sents.
- **Synchronisation d'arriÃ¨re-plan silencieuse (`silent: true`)** :
  - **Suppression des alertes / toasts intempestifs** : ajout du drapeau `options.silent` dans `deliberationStore.syncWithLLMOps`. Les vÃ©rifications et synchronisations automatiques en tÃ¢che de fond (sur `onMount` de `/deliberation` et du badge d'en-tÃªte `LLMOpsStatusBadge`) opÃ¨rent dÃ©sormais silencieusement sans bombarder l'utilisateur de notifications toast.
  - **Conservation du retour visuel sur action explicite** : les clics manuels sur les boutons de synchronisation ou de test de connexion continuent d'afficher les notifications de confirmation ou d'erreur.
  - **Protection contre la rÃ©initialisation de l'engagement actif** : validation de l'existence de l'identifiant d'engagement retournÃ© par LLMOps avant toute affectation pour prÃ©venir la dÃ©sÃ©lection inopinÃ©e du projet courant.
- **Tests** :
  - Extension de la suite de contrat `tests/contract/deliberation-localstorage-subject.test.ts` (8 tests) couvrant la persistance et la restauration de `deliberationViewMode` et `activePosture` lors de `initFromDb` et `switchEngagement`, ainsi que le comportement sans toast de `syncWithLLMOps(..., { silent: true })`.
### DÃ©libÃ©ration & IngÃ©nierie : Atelier de SpÃ©cification DÃ©taillÃ©e (DLD) et Bandeau Doctrinal RÃ©tractable (#35)
- **BanniÃ¨re de SpÃ©cification Haut Niveau (DÃ©cision L3)** :
  - DÃ¨s qu'une dÃ©cision d'arbitrage est opposable (`L3_decided`), le volet *Â« ðŸ“š Doctrines, RFP & Brouillon Â»* ancre en tout dÃ©but la dÃ©cision d'arbitrage actÃ©e : option retenue, rÃ©versibilitÃ©, contresignature de l'arbitre et justification technique (`rationale`).
  - La rÃ©daction de la spÃ©cification dÃ©taillÃ©e dÃ©coule ainsi directement et formellement de la dÃ©cision prise en amont.
- **Tiroir Doctrinal RÃ©tractable (`isDoctrineDrawerOpen`)** :
  - Remplacement de l'ancienne colonne doctrine de 50% par un bandeau accordÃ©on compact cliquable, libÃ©rant l'intÃ©gralitÃ© de la largeur d'Ã©cran pour le travail d'ingÃ©nierie et de rÃ©daction.
- **Atelier de RÃ©daction Technique (DLD - SpÃ©cification DÃ©taillÃ©e)** :
  - Assistant IA (`âœ¨ PrÃ©-remplir avec l'IA`) pour prÃ©-remplir instantanÃ©ment la trame d'ingÃ©nierie (composants, flux, interfaces, protocoles) Ã  partir de l'option arbitrÃ©e et de ses motivations.
  - Espace de saisie markdown libre avec persistance locale automatique par sujet (`localStorage`).
  - Actions immÃ©diates : bouton de sauvegarde `ðŸ’¾ Enregistrer` et bouton d'homologation formelle `âœ… Homologuer SpÃ©cification (L4)`.
  - Bascule optionnelle vers la vue grille tÃ©lÃ©graphique en 5 colonnes.
- **Tests** :
  - Extension de la suite de contrat `tests/contract/deliberation-conversation.test.ts` vÃ©rifiant l'affichage de la spÃ©cification haut niveau, la prÃ©sence du tiroir de doctrine et des commandes de l'atelier DLD.


### BoÃ®te de RÃ©ception des Revues KB : Filtrage Anti-Auto-Ã‰valuation & SÃ©paration des TÃ¢ches (#131)
- **PrÃ©vention de l'auto-Ã©valuation dans la BoÃ®te de RÃ©ception (`/kb/reviews`)** :
  - **Filtre par dÃ©faut Â« Ã€ examiner uniquement (exclure mes clauses) Â»** : la boÃ®te de rÃ©ception n'affiche par dÃ©faut que les clauses soumises par des tiers pour lesquelles l'expert connectÃ© est habilitÃ© Ã  statuer, Ã©vitant de dÃ©couvrir a posteriori sur la page d'examen qu'il est l'auteur de la clause et qu'il ne peut pas s'auto-Ã©valuer.
  - **Distingo clair Auteur vs Relecteur** :
    - Calcul automatique de `isAuthor` via `isCandidateAuthor` comparant l'auteur au handle d'expert (`@handle`) ou Ã  l'adresse e-mail de session.
    - Remplacement du bouton d'action principal `Examiner` par un bouton secondaire `Consulter (Auteur)` (`btn-view-own-candidate`) avec infobulle rappelant la rÃ¨gle de sÃ©paration des tÃ¢ches.
    - Ajout du badge visible *Â« Votre clause (Auteur) Â»* avec icÃ´ne de cadenas et mention explicite *(Vous)* Ã  cÃ´tÃ© du nom de l'auteur.
  - **Comptage et alertes de retard contextualisÃ©s** : les alertes de retard (Porte G5) ne comptabilisent que les revues en retard que l'expert connectÃ© peut effectivement dÃ©bloquer.
  - **Support API souverain** : prise en charge du paramÃ¨tre `exclude_own=true` et transmission du handle d'acteur sur `GET /api/knowledge/reviews/inbox` et `LLMOpsClient.getReviewInbox`.
- **Tests** :
  - Nouvelle suite de tests de contrat `tests/contract/kb-review-inbox-authorship.test.ts` validant le marquage `isAuthor`, le filtrage avec `excludeOwn`, la visibilitÃ© croisÃ©e pour les pairs et l'interdiction constitutionnelle d'auto-Ã©valuation.
### Capitalisation Knowledge Hub : IntÃ©gration Directe du Panneau Porte G4 dans la Matrice Multi-CritÃ¨res
- **IntÃ©gration et scroll fluide (`OptionsMatrix.svelte`, `SubjectThreadView.svelte`)** :
  - Montage direct du composant `CapitalizationPanel` sous la grille d'options (`#capitalization-section`) dÃ¨s qu'une dÃ©cision d'architecture est actÃ©e (`L3_decided`).
  - Fonctionnement immÃ©diat du bouton Â« Candidats KB (G4) Â» de la banniÃ¨re de fil de dÃ©libÃ©ration : le clic bascule sur l'onglet matrice et dÃ©file directement jusqu'Ã  la section de capitalisation, permettant Ã  tout architecte de prÃ©parer et soumettre les candidats sans navigation superflue.
- **Tests** : extension de la suite de contrat `tests/contract/options-matrix-view.test.ts` validant la prÃ©sence de `id="capitalization-section"` et du bouton de prÃ©paration des candidats.

### Matrice Multi-CritÃ¨res : AmÃ©lioration de la VisibilitÃ© du Bouton Â« Modifier Â» des Options Humaines
- **Affichage et ergonomie renforcÃ©e (`OptionsMatrix.svelte`)** :
  - Style visuel rehaussÃ© pour le bouton `Modifier` dans l'en-tÃªte de colonne avec badge violet contrastÃ© (`bg-purple-500/10 text-purple-700 border-purple-500/30`), supprimant le masquage adaptatif (`hidden sm:inline`) pour garantir la prÃ©sence permanente du libellÃ© textuel quelle que soit la largeur de colonne ou la taille d'Ã©cran.
  - Correction du typage strict TypeScript sur le filtre d'origine (`opt.origin === 'human'`).
  - Bouton `Ã‰diter` mis en valeur dans le cadre de dÃ©tails dÃ©pliÃ©.

### Matrice Multi-CritÃ¨res : Ã‰dition Directe des Propositions d'Architecture Humaines & Re-jeu de ConformitÃ©
- **Modification des options humaines (`OptionEditor.svelte`, `OptionsMatrix.svelte`)** :
  - Ajout d'un bouton `Modifier` (`Edit3`) directement dans l'en-tÃªte de colonne des options proposÃ©es par un opÃ©rateur ou architecte (`origin === 'human' || origin === 'architect'`), ainsi qu'un bouton d'action `Ã‰diter` dans le bloc dÃ©pliÃ© de rÃ©sumÃ© technique (`DÃ©tails`).
  - PrÃ©-remplissage complet de la modale (`OptionEditor.svelte`) avec les donnÃ©es existantes (titre, rÃ©sumÃ©, origine) via la prop `initialData`.
  - Prise en charge de la mise Ã  jour asynchrone via `PATCH /api/projects/:projectId/subjects/:subjectId/options/:optionId` avec contrÃ´le de concurrence optimiste (`expectedVersion`).
  - RÃ©Ã©valuation et rafraÃ®chissement automatique instantanÃ© de la conformitÃ© doctrinale (`/compliance`) dÃ¨s l'enregistrement de l'option modifiÃ©e, permettant de vÃ©rifier en direct si la reformulation lÃ¨ve ou non une clause de non-conformitÃ© (ex: nÃ©gation levÃ©e).
- **Tests** : extension de la suite de contrat `tests/contract/options-matrix-view.test.ts` validant la prÃ©sence du bouton `Modifier` sur les propositions humaines et son masquage sur les propositions LLM.


### Matrice Multi-CritÃ¨res : Explicitation des Termes DÃ©clencheurs / ViolÃ©s dans les Alertes de ConformitÃ©
- **Infobulle et diagnostic granulaire de conformitÃ© (`OptionsMatrix.svelte`)** :
  - Enrichissement de l'infobulle (`title`) de l'Ã©tiquette Â« Non conforme Â» au survol : mention explicite des termes dÃ©tectÃ©s dans le texte de l'option (`matchedTerms`) ayant dÃ©clenchÃ© la clause ou l'interdiction (`â€¢ Termes dÃ©tectÃ©s / dÃ©clencheurs : Â« ... Â»`).
  - Affichage direct des termes dÃ©clencheurs dans le bandeau rouge de dÃ©cision L3 (Â« ConformitÃ© rÃ©glementaire de l'option retenue Â») pour guider l'architecte dans la justification de l'Ã©cart ou la rectification du texte.
- **Tests** : extension de la suite de contrat `tests/contract/options-matrix-view.test.ts`.


### PrÃ©fÃ©rence Utilisateur : MÃ©morisation du Dernier Sujet de DÃ©libÃ©ration dans le LocalStorage
- **Persistance automatique et scopÃ©e par espace (`deliberationStore.svelte.ts`)** :
  - Enregistrement rÃ©actif du sujet actif sÃ©lectionnÃ© dans le `localStorage` sous la clÃ© `archinex:activeSubjectId:<engagementId>` lors de l'appel Ã  `selectSubject(id)`.
  - Scoping par projet / engagement Ã©vitant toute collision ou incohÃ©rence de rÃ©fÃ©rence d'un projet Ã  l'autre.
- **Restauration fluide et sÃ©curisÃ©e** :
  - Restauration automatique du dernier sujet consultÃ© lors de l'hydratation initiale (`initFromDb`) et lors du basculement d'espace de travail (`switchEngagement`).
  - Validation dÃ©fensive d'intÃ©gritÃ© : vÃ©rification que le sujet mÃ©morisÃ© appartient bien aux sujets actifs de l'engagement, avec repli gracieux et transparent sur le sujet par dÃ©faut (`defaultSubjectId` ou premier sujet) en cas de suppression ou d'incohÃ©rence.
- **Navigation unifiÃ©e (`KnowledgeNodePanel.svelte`)** :
  - Alignement de la navigation depuis la vue graphe de connaissances (`navigateToSubject`) pour utiliser `selectSubject` et bÃ©nÃ©ficier de la persistance locale automatique.
- **Tests** :
  - Suite de tests de contrat dÃ©diÃ©e `tests/contract/deliberation-localstorage-subject.test.ts` validant la persistance sous clÃ© scopÃ©e, la restauration lors de `initFromDb`, le rabat en cas d'identifiant obsolÃ¨te et la rÃ©tention lors d'allers-retours entre diffÃ©rents projets.

### Matrice Multi-CritÃ¨res : DÃ©blocage de la CrÃ©ation d'Options/CritÃ¨res (SchÃ©ma Zod API) & Ajout RÃ©actif
- **Correction du schÃ©ma de validation de l'API (`optionsApiSchemas.ts`, `optionsDb.ts`)** :
  - Rendu du champ `id` optionnel (`id: z.string().min(1).optional()`) dans `CreateOptionSchema`, `CreateCriterionSchema` et `CreateTradeOffSchema`, levant l'erreur HTTP 400 (Validation failed) lors de l'ajout manuel d'une proposition par un opÃ©rateur.
  - GÃ©nÃ©ration automatique dÃ©terministe de l'identifiant cÃ´tÃ© backend dans `createTradeOff` si non spÃ©cifiÃ© par le client (alignÃ© sur `createOption` et `createCriterion`).
- **DÃ©ballage rÃ©actif et remontÃ©e granulaire des erreurs (`OptionsMatrix.svelte`)** :
  - DÃ©ballage systÃ©matique de la rÃ©ponse API (`created.option ?? created`, `created.criterion ?? created`, etc.), garantissant l'apparition instantanÃ©e de la 4áµ‰ colonne (et des suivantes) avec son libellÃ© et son icÃ´ne d'origine humaine dans la matrice sans nÃ©cessiter de rafraÃ®chir la page.
  - Extraction granulaire des erreurs HTTP (`err.reason || err.error || err.message`) avec messages d'action explicites en cas d'expiration de session (401) ou de droits restreints (403).
- **Attente asynchrone et maintien de la saisie (`OptionEditor.svelte`, `CriteriaEditor.svelte`)** :
  - Attente de la validation serveur (`await onSave(...)`) avant fermeture de la modale pour Ã©viter les fermetures silencieuses sur Ã©chec rÃ©seau ou d'autorisation, et conservation des champs saisis en cas d'erreur.
  - Ã‰tat de soumission (`isSubmitting`) dÃ©sactivant le bouton pendant le traitement pour Ã©viter les doubles crÃ©ations.
- **Tests** : extension des suites de contrat `tests/contract/options-evaluations.test.ts` (validation Zod avec/sans id) et `tests/contract/options-matrix-view.test.ts` (apparition dynamique de la 4áµ‰ colonne).


### DÃ©libÃ©ration & Composeur StructurÃ© : Feedback Visuel d'Erreurs, Droits d'AccÃ¨s et Raccourci Clavier
- **Routage visuel des notifications vers le systÃ¨me de Toasts (`deliberationStore.svelte.ts`)** : connexion de `deliberationStore.logNotification` au systÃ¨me rÃ©actif `toast` (`$lib/toast`), garantissant que les notifications de succÃ¨s, d'information et d'erreur (HTTP 401, 403, validation) s'affichent immÃ©diatement sous forme d'alertes visuelles Ã  l'Ã©cran plutÃ´t que d'Ãªtre silencieusement conservÃ©es en mÃ©moire.
- **Gestion explicite des erreurs d'authentification et de droits (`StructuredComposer.svelte`, `SubjectThreadView.svelte`)** :
  - Extraction granulaire des messages d'erreur du backend (`err.reason || err.error || err.message`).
  - Messages clairs et actionnables en cas de non-authentification (HTTP 401 avec invitation Ã  se connecter sur `/login`) ou de droits insuffisants (HTTP 403 rÃ©servÃ© aux membres du projet).
  - RemontÃ©e d'erreur explicite lors de l'adoption d'une hypothÃ¨se de cadrage (`handleAdoptHypothesis`).
- **Ergonomie du composeur structurÃ© (`StructuredComposer.svelte`)** :
  - Ajout du raccourci clavier `Ctrl+Enter` / `Cmd+Enter` pour soumettre directement un argument ou une hypothÃ¨se Ã©tayÃ©e, ou afficher immÃ©diatement le champ manquant requis.
  - Signalisation visuelle rehaussÃ©e (`bg-amber-500/10 border-amber-500/25`) de la raison de validation (obligation de fondement Ã©tayÃ© d'au moins 5 caractÃ¨res).
- **Tests** : extension de la suite de contrat `tests/contract/structured-composer.test.ts` validant la propagation des notifications vers la file des toasts rÃ©actifs.
### LisibilitÃ© & Ergonomie de la Matrice Multi-CritÃ¨res (Options & Propositions Longues)
- **Affichage multi-lignes sans tronquage (`OptionsMatrix.svelte`)** : suppression de la coupure forcÃ©e `line-clamp-1` sur les titres de propositions au profit d'un retour Ã  la ligne naturel (`whitespace-normal break-words leading-snug`), prÃ©servant l'intÃ©gralitÃ© des intitulÃ©s longs mÃªme complexes.
- **Largeur optimisÃ©e des colonnes d'options** : passage de `min-w-[170px]` Ã  `min-w-[220px] max-w-[320px]` pour offrir un espace de lecture aÃ©rÃ© sans dÃ©grader le dÃ©filement horizontal.
- **Badges d'identification rapides (`Option A`, `Option B`...)** : attribution automatique d'un repÃ¨re visuel standardisÃ© pour chaque colonne facilitant le repÃ©rage et la comparaison.
- **Tiroir / bouton de dÃ©tails pour le rÃ©sumÃ© technique** : intÃ©gration d'un bouton `DÃ©tails` (`Info`) dans chaque en-tÃªte permettant de dÃ©plier/replier le rÃ©sumÃ© technique (`opt.summary`) de la proposition directement dans la grille, complÃ©tÃ© par des infobulles natives (`title`) complÃ¨tes au survol.
- **Tests** : suite de tests de contrat dÃ©diÃ©e `tests/contract/options-matrix-view.test.ts` validant l'affichage des badges, l'enroulement multi-lignes, les infobulles et les dimensions des colonnes.

### Ergonomie de la DÃ©libÃ©ration : Espace Sujet UnifiÃ©, Vue Split par DÃ©faut, Liste Repliable et Capitalisation G4 ContextualisÃ©e
- **Fusion du panneau principal et du Dossier du sujet (`DeliberationWorkbench.svelte`, `SubjectThreadView.svelte`)** : suppression de la 3e colonne redondante au profit dâ€™un **Espace Sujet UnifiÃ©** (9 Ã  12 colonnes) structurÃ© autour dâ€™un en-tÃªte unique, de la timeline horizontale de maturation en haut et de 4 volets complÃ©mentaires sans doublon (`ðŸ’¬ DÃ©libÃ©ration & Cadrage`, `âš–ï¸ Options, Matrice & Arbitrage`, `ðŸ“š Doctrines, RFP & Brouillon`, `ðŸŒ¿ Cascade & RÃ¨gles`).
- **Repli de l'arbre des sujets (`SubjectConversationList.svelte`, `DeliberationWorkbench.svelte`)** : ajout d'un bouton `â‡¥ Replier` masquant la colonne des sujets pour donner 100% de la largeur de l'Ã©cran (12 colonnes) au workbench, et bouton `ðŸ“‚ Sujets` dans l'en-tÃªte du fil pour la redÃ©plier Ã  la demande.
- **Mode Split par dÃ©faut sur grand Ã©cran (`btn-toggle-split`)** : affichage cÃ´te Ã  cÃ´te par dÃ©faut sur Ã©crans larges du fil de discussion Ã  gauche et de la matrice / analyse Ã  droite, avec possibilitÃ© de basculer en pleine largeur.
- **Contextualisation selon le niveau de maturitÃ© et intÃ©gration Porte G4 (`CapitalizationPanel.svelte`, `SubjectThreadView.svelte`)** :
  - Masquage des formulaires d'arbitrage inaccessibles en phase `L0/L1` au profit d'un guide pÃ©dagogique d'exploration.
  - Activation de l'affirmation collÃ©giale `K16`, des faits `K18` et de la capitalisation Porte G4 Ã  partir du niveau `L3+`.
  - Bouton d'action proÃ©minent Â« âœ¨ PrÃ©parer les Candidats KB maintenant Â» dans le panneau de capitalisation et raccourci direct dans le bandeau de dÃ©cision du fil.
  - Actions contextualisÃ©es `ðŸ“¦ PrÃ©parer les candidats KB (G4)` ajoutÃ©es aux jalons `L3` et `L4` dans la timeline (`getMilestoneContextualActions`).
- **Suppression des duplications (`TelegraphicDraftView.svelte`)** : Ã©limination des onglets imbriquÃ©s redondants en mode lecture seule pour afficher directement la synthÃ¨se des 5 colonnes.
- **Timeline horizontale de maturation (`L0 â†’ L5`) avec critÃ¨res et actions contextualisÃ©es (`MaturityStepper.svelte`)** : grille compacte des critÃ¨res du jalon inspectÃ© avec boutons d'actions humaines et agents IA.
- **Bandeau de Cadrage compact sur 2 lignes (`SubjectProblemCard.svelte`)** : synthÃ¨se en 2 lignes (Question centrale Ã©ditable in-place + pastilles HypothÃ¨se, Dilemme, Exigences RFP, Questions mÃ©tier et raccourci vers la Matrice), dÃ©pliable Ã  la demande, sans dupliquer les cartes dâ€™options dans le fil.
- Tests : `tests/contract/deliberation-conversation.test.ts` (15 tests de contrat).
### DÃ©monstrateur Lulu : Ensemencement "Juste AprÃ¨s Ingestion" (`seed:lulu`)
- **Jeu d'essai Lulu "Juste AprÃ¨s Ingestion" (`examples/lulu-ingested/`)** :
  - Fourniture d'un Ã©tat d'ingestion authentique issu de l'audit ArcKit J0 sur le Lot 1 (NOC, CÅ“ur 5G PPDR & RÃ©silience, 92 clauses).
  - Les 7 sujets d'architecture sont positionnÃ©s au niveau `L1_framed` avec dilemmes cadrÃ©s, options contrastÃ©es et critÃ¨res multicritÃ¨res prÃ©-positionnÃ©s en statut `draft`.
  - Fil de dÃ©libÃ©ration (`dialogue.json`) et Ã©noncÃ©s scellÃ©s (`statements.json`) vierges, permettant de rejouer en sÃ©ance les 4 scÃ©narios clÃ©s de dÃ©libÃ©ration architecturale (nominal, dÃ©bat d'experts, blocage rÃ©glementaire, capitalisation Porte G4).
- **Script d'ensemencement idempotent (`scripts/seed-lulu.ts` & `npm run seed:lulu`)** :
  - RÃ©initialisation instantanÃ©e de l'espace projet `lulu-lot1-noc` dans Prisma (`dev.db`).
  - Enregistrement automatique de l'audit de dÃ©pouillement `run_lulu_live_j0` dans `factorization_runs` pour dÃ©monstration immÃ©diate du jalon J0 depuis l'IHM.
- **Tests** : suite de tests de contrat dÃ©diÃ©e `tests/contract/seed-lulu.test.ts`.


### DÃ©pouillement RFP : suivi en arriÃ¨re-plan, notifications Web, reprise sur quota et partitionnement rÃ©silient
- **Notifications d'arriÃ¨re-plan & mise Ã  jour du titre d'onglet (`backgroundAuditNotifier.ts`, `+layout.svelte`, `RfpConfrontationDialog.svelte`)** :
  - Support de l'API Web Notifications (`new Notification(...)`) informant l'utilisateur dÃ¨s que le dÃ©pouillement en tÃ¢che de fond est terminÃ© ou requiert une action, mÃªme si l'onglet est masquÃ© ou en arriÃ¨re-plan.
  - Titre dynamique de l'onglet pendant le traitement (`â³ Tri des exigences (X/Y) Â· Archinex`) et signalÃ©tique immÃ©diate Ã  l'achÃ¨vement (`âœ… (PrÃªt !)` ou `âš ï¸ (Reprise possible)`).
  - Toasts globaux persistants et Ã©coute continue en arriÃ¨re-plan dans `+layout.svelte` permettant de naviguer librement dans l'application sans perdre le suivi du dÃ©pouillement.
- **DÃ©tection des erreurs de quota/crÃ©dits LLM & Fast-Fail (`arckitRequirementsPipeline.ts`, `factorizationJobs.ts`)** :
  - DÃ©tection proactive des erreurs de solde insuffisant ou de quota (`isLlmCreditOrQuotaError`) chez les fournisseurs d'infÃ©rence (Anthropic, OpenAI, etc.).
  - Interruption rapide (Fast-Fail) dÃ¨s qu'un lot Ã©choue pour manque de crÃ©dit : arrÃªt immÃ©diat des requÃªtes suivantes vouÃ©es Ã  l'Ã©chec et omission de l'Ã©tape 3a afin de prÃ©server les crÃ©dits restants et le temps d'attente.
  - Conservation intÃ©grale en base de donnÃ©es SQLite/Postgres (`FactorizationStageCache`) de tous les lots validÃ©s avant la coupure.
  - Positionnement d'un statut explicite reprenable (`partial` avec message clair d'Ã©puisement de crÃ©dits).
- **Mise en avant immÃ©diate de la reprise dans l'interface (`RfpConfrontationDialog.svelte`)** :
  - Affichage d'un bandeau d'alerte spÃ©cifique et visible avec le bouton Â« Reprendre l'analyse Â» dÃ¨s qu'une analyse est incomplÃ¨te ou suspendue (sans contraindre l'utilisateur Ã  naviguer dans l'historique dÃ©roulant).
  - Relance instantanÃ©e relisant les lots dÃ©jÃ  validÃ©s depuis le cache local (durÃ©e de quelques millisecondes pour les Ã©tapes acquises).
- **Partitionnement sÃ©curisÃ© de l'Ã©tape de cartographie (`PARTITION_MAX_CHARS`)** :
  - Abaissement de `PARTITION_MAX_CHARS` de 1 200 000 Ã  250 000 caractÃ¨res (~60 000 tokens) pour Ã©viter les prompts monolithiques gigantesques (500k+ caractÃ¨res) aux limites de contexte et de quotas de sortie, permettant un dÃ©coupage en parties indÃ©pendantes mÃ©morisÃ©es individuellement dans le cache de reprise.
- **Tests** : suite de tests de contrat dÃ©diÃ©e `tests/contract/audit-background-notifications-and-resume.test.ts`.


### Performance & FluiditÃ© : optimisation du Dashboard et des mini-apps (baisse de latence de 3,6 s Ã  < 100 ms)
- **Cache mÃ©moire en lecture & dÃ©duplication Singleflight (`LLMOpsClient`)** :
  - Mise en cache en mÃ©moire des appels GET lourds (`/api/compliance/frameworks`, `/api/knowledge/health`, `/api/knowledge/checks`, `/api/knowledge/publications`, `/health`, `/snapshot/latest`) avec TTL adaptatif (30 s en nominal, 2 s en cas d'erreur transitoire).
  - DÃ©duplication Singleflight des requÃªtes concurrentes : une seule requÃªte est envoyÃ©e au backend LLMOps lorsque plusieurs composants ou requÃªtes SSR sollicitent la mÃªme ressource en parallÃ¨le.
  - Invalidation atomique du cache lors de toute mutation (`POST`, `PUT`, `PATCH`, `DELETE`) ou changement de `baseUrl`.
- **AllÃ©gement drastique des payloads SSR et API (`engagementsDb.ts`, `+page.server.ts`, `/api/engagements`)** :
  - Ã‰lagage des clauses textuelles lourdes (`keyClauses: []`) sur les vues globales tout en prÃ©servant le compteur `extractedClausesCount` pour les KPI et graphiques, rÃ©duisant la charge utile de 2,9 Mo Ã  moins de 100 Ko (> 97 % de rÃ©duction).
  - Suppression des propositions temporaires mortes (`subjects.proposal`) lors de la restitution des listes de projets.
  - Ã‰limination du double-fetch client redondant (`/api/engagements`, 2,7 Mo) dans `deliberationStore` via hydratation diffÃ©rÃ©e `queueMicrotask` lorsque les donnÃ©es sont dÃ©jÃ  fournies par le SSR (`initFromDb`).
- **RÃ©solution granulaire des icÃ´nes Lucide Ã  la compilation (`vite.config.ts`)** :
  - CrÃ©ation du plugin Vite `lucideOptimizePlugin` transformant les imports barils globaux `import { ... } from 'lucide-svelte'` en imports directs `import Icon from 'lucide-svelte/icons/<kebab>'`.
  - Ã‰limination du waterfall de 3 788 requÃªtes HTTP et compilation de 1 929 modules d'icÃ´nes en mode dev.
  - Navigation client instantanÃ©e entre Dashboard et mini-apps mesurÃ©e Ã  moins de 100 ms (Workspaces : 36 ms, DÃ©libÃ©ration : 68 ms, Dashboard : 93 ms).
- **Tests** : suites de tests dÃ©diÃ©es `tests/contract/llmops-client-cache.test.ts` (mise en cache, singleflight, invalidation) et `tests/contract/corpus-payload-optimization.test.ts` (intÃ©gritÃ© des compteurs et rÃ©duction de taille de charge utile).

### Client LLM (`LocalLlmClient`) : chargement automatique de `.env` sous `vite dev` et garde contre les requÃªtes Ollama sans modÃ¨le
- **Hydratation de `process.env` via `loadEnv` dans `vite.config.ts` et lecture de secours `.env` dans `LocalLlmClient` (`parseDotEnvFile`)** : sous `npm run dev` (`vite dev`), les variables non prÃ©fixÃ©es par `VITE_` (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `LLM_PROVIDER`, `LLM_LOCAL_ENDPOINT`, `LLM_LOCAL_MODEL`) n'Ã©taient pas injectÃ©es dans `process.env`, ce qui faisait basculer `localLlmClient` sur `http://localhost:11434` avec un modÃ¨le vide `""` (`HTTP 400 {"error":"model is required"}`). Le client rÃ©sout dÃ©sormais les variables d'environnement depuis `process.env` avec repli automatique sur `.env`.
- **Auto-dÃ©couverte ou erreur explicite sur `chatLocal` sans modÃ¨le** : lorsqu'un appel local est tentÃ© sans identifiant de modÃ¨le, `chatLocal` interroge d'abord `/api/tags` pour sÃ©lectionner un modÃ¨le local disponible et lÃ¨ve une erreur explicite (`Aucun modÃ¨le LLM configurÃ© ni dÃ©tectÃ©`) au lieu d'envoyer `{"model": ""}` Ã  Ollama.
- Tests : `tests/contract/local-llm-factorizer.test.ts` (chargement depuis un fichier `.env` temporaire et rejet explicite sans appel `/api/chat` lorsque `model` est vide).

### Capitalisation (Porte G4) : gÃ©nÃ©ralisation des dÃ©cisions projet et conformitÃ© du contrat `POST /api/knowledge/candidates` vers LLMOps
- **GÃ©nÃ©ralisation explicite en Porte G4** (`prepareSubjectKbCandidates` / `submitSubjectKbCandidates`) : une dÃ©cision d'arbitrage initialement qualifiÃ©e `project_specific` par construction en Porte G3 peut dÃ©sormais Ãªtre anonymisÃ©e et gÃ©nÃ©ralisÃ©e par l'architecte en Porte G4 (`portability: 'reusable_architecture_doctrine'`, `harvestable: true`) afin d'Ãªtre moissonnÃ©e par LLMOps et rÃ©utilisÃ©e comme doctrine Ã  la dÃ©libÃ©ration suivante.
- **Filtrage des mÃ©tadonnÃ©es d'arbitrage** (`buildKbCandidates`, `prepareSubjectKbCandidates`, `submitSubjectKbCandidates`) : exclusion systÃ©matique des marqueurs techniques `COMPLIANCE_STATUS:*` et `PORTABILITY:*` stockÃ©s dans `acceptedViolations`, qui gÃ©nÃ©raient auparavant de faux candidats `amendment` rejetÃ©s en `400 Bad Request` par LLMOps.
- **Normalisation complÃ¨te du payload candidat LLMOps** (`formatCandidateProposedContent`, `normalizeKbDomain`, `normalizeTargetAssetId`, `inferCandidateAssetType`) : gÃ©nÃ©ration systÃ©matique de `proposed_content` (front matter YAML `PAT-xxx` / `ADR-xxxx` + sections Markdown rÃ©glementaires), `asset_type`, `target_asset_id`, `domain` normalisÃ© (`general` -> `architecture`) et `evidence` d'engagement, avec anonymisation intÃ©grale incluant l'identifiant et le nom court du projet.
- **Protection du niveau de maturitÃ© `L3_decided`** (`saveEngagementProfile` dans `engagementsDb.ts`) : prÃ©servation garantie du niveau `L3_decided` lorsqu'une dÃ©cision existe en base lors d'une synchronisation du profil d'engagement.
- Tests : `tests/contract/capitalization.test.ts` et `tests/integration/kb-capitalization.test.ts`.

### Clauses vÃ©rifiables : rÃ©daction assistÃ©e d'une clause pour les contrÃ´les sans clause (archinex#99)
- **Bouton Â« Proposer une clause Â»** : sur `/kb/clauses` (onglet Â« ContrÃ´les sans clause Â»), chaque contrÃ´le obligatoire dÃ©pourvu de clause dispose dÃ©sormais d'un bouton d'action dÃ©diÃ© permettant de gÃ©nÃ©rer une proposition assistÃ©e par IA (`Sparkles`).
- **GÃ©nÃ©rateur IA bilingue (`clauseDrafter.ts`)** : dÃ©rivation automatique de clauses dÃ©terministes structurÃ©es (`kind: 'requires' | 'forbids'`, `when.terms_any`, `expect.terms_any`, `message`) Ã  partir du texte officiel de l'exigence et des mÃ©tadonnÃ©es du contrÃ´le. Les termes dÃ©clencheurs et attendus sont gÃ©nÃ©rÃ©s systÃ©matiquement en franÃ§ais et en anglais afin de couvrir les options rÃ©digÃ©es dans l'une ou l'autre langue. Provenance marquÃ©e `llm-derived`.
- **Repli dÃ©terministe rÃ©silient** : en cas d'indisponibilitÃ©, d'absence de configuration du modÃ¨le ou de dÃ©lai dÃ©passÃ©, un mÃ©canisme de repli thÃ©matique et lexical (analyses des risques, sauvegardes et PCA/PRA, authentification et MFA, chiffrement, gestion des incidents, chaÃ®ne d'approvisionnement, vulnÃ©rabilitÃ©s, journalisation) garantit la production immÃ©diate d'une clause conforme sans jamais bloquer l'utilisateur par une erreur HTTP 500.
- **Atelier interactif d'amendement et banc d'essai** : le relecteur peut modifier les dÃ©clencheurs, conditions attendues, message explicatif et type de rÃ¨gle, et tester immÃ©diatement la clause proposÃ©e sur une option d'architecture libre (Â« Essayer sur une option Â») pour observer le verdict de conformitÃ© dÃ©terministe (`verdict: 'violates' | 'supports'`) avant enregistrement.
- **Cycle de vie non bloquant dans LLMOps** : l'enregistrement soumet la clause avec le statut `draft` et la provenance `llm-derived` (`POST /api/kb/clauses/[assetId]/save-draft`). Elle rejoint la file de relecture de doctrine sans bloquer les arbitrages d'architecture tant qu'un relecteur habilitÃ© ne l'a pas formellement validÃ©e (conformÃ©ment au contrat LLMOps 1.26).
- **Navigation directe par onglet** : support du paramÃ¨tre d'URL `?tab=missing` (ou `tab=draft`, `validated`, `rejected`) sur `/kb/clauses`.
- **Tests** : suite de tests de contrat dÃ©diÃ©e `tests/contract/issue_99_assisted_clause_drafting.test.ts` (8 tests couvrant la gÃ©nÃ©ration IA, le repli dÃ©terministe bilingue, la protection 401/400 des routes API, la persistance `draft` dans fakeLLMOps et le rendu SSR).
### Base de connaissances : extraction du motif de conflit 409 et explication 4 yeux lors de la publication d'ingestion (archinex#156)
- **Extraction du motif Hub (409 Conflict)** : dans `LLMOpsClient.applyFrameworkIngestion`, extraction de `body.reason || body.error` (au lieu du seul `body.error`), permettant de restituer le motif prÃ©cis renvoyÃ© par l'enveloppe normalisÃ©e du Knowledge Hub (ex. `separation_of_duties` ou `the ingestion is abandoned`) au lieu du repli gÃ©nÃ©rique Â« Conflit lors de lâ€™application Â».
- **Transmission HTTP dans la route API** : la route `POST /api/frameworks/ingestions/[id]/apply` transmet dÃ©sormais `reason` et `code: 'separation_of_duties'` en cas de conflit HTTP 409.
- **Interface utilisateur (/kb/frameworks/[id])** :
  - Affichage du motif exact dans l'alerte d'erreur lors d'une tentative de publication bloquÃ©e (titre adaptÃ© Â« Publication bloquÃ©e (Conflit 409) Â» au lieu de Â« DÃ©claration BloquÃ©e Â»).
  - DÃ©tection du motif `separation_of_duties` : affichage d'un titre explicite Â« SÃ©paration des fonctions requise (contrÃ´le des 4 yeux) Â» et d'un encart explicatif dÃ©diÃ© rappelant le principe du contrÃ´le des 4 yeux / revue indÃ©pendante (rÃ¨gle d'intÃ©gritÃ© issue #91) invitant Ã  confier la publication Ã  un pair mainteneur qui n'a pas instruit les exigences.
- Tests : `tests/contract/kb-apply-conflict-reason.test.ts` (7 tests de contrat couvrant l'extraction des motifs 409/403/400 dans le client LLMOps, la route API `apply` et le rendu SSR de l'alerte avec explication des 4 yeux).


### RÃ©fÃ©rentiels rÃ©glementaires : visibilitÃ©, masquage des ingestions abandonnÃ©es et liens directs (/kb/frameworks)
- Lorsqu'aucun rÃ©fÃ©rentiel de conformitÃ© n'est encore recensÃ© dans le snapshot actif (`GET /api/compliance/frameworks` vide), la section supÃ©rieure de `/kb/frameworks` affiche dÃ©sormais des liens directs cliquables vers les lots d'ingestion disponibles (ex: `/kb/frameworks/{id}`).
- **Masquage des ingestions abandonnÃ©es** : les lots d'ingestion ayant le statut `abandoned` ne sont plus comptabilisÃ©s ni listÃ©s dans l'encart d'alerte supÃ©rieur (Â« X lots d'ingestion disponibles en revue Â») ni dans la vue par dÃ©faut de l'historique (`statusFilter === 'all'`).
- Un onglet dÃ©diÃ© Â« AbandonnÃ©es Â» permet d'accÃ©der spÃ©cifiquement aux ingestions archivÃ©es, tandis que l'onglet par dÃ©faut liste Â« Toutes les actives Â».
- L'accordÃ©on infÃ©rieur Â« Historique des Ingestions Â» ne s'ouvre automatiquement par dÃ©faut que s'il existe des ingestions actives non abandonnÃ©es.
- Sur la page de dÃ©tail d'un lot d'ingestion (`/kb/frameworks/[id]`), lorsqu'une ingestion est abandonnÃ©e : affichage d'un bandeau explicite d'avertissement et du badge Â« AbandonnÃ©e Â» rappelant le motif d'abandon et l'auteur, dÃ©sactivation des boutons de publication (`applyIngestion`) et de dÃ©claration d'opposabilitÃ© (`triggerCoverageDeclaration`), et masquage du chargement de propositions JSON.
- Tests : `tests/contract/issue_90_frameworks_knowledge.test.ts` (vÃ©rification de l'exclusion des ingestions abandonnÃ©es dans l'Ã©tat vide et la vue par dÃ©faut, affichage sur filtre `abandoned`, et bandeau/actions dÃ©sactivÃ©es sur l'Ã©cran de dÃ©tail).

### Tableau de bord : correction du lien d'action vers la validation des clauses KB et redirection de courtoisie
- Le bouton Â« Valider & publier les clauses Â» du composant `KbClausesHealthBanner` pointait vers `/knowledge/clauses`, ce qui dÃ©clenchait la route de dÃ©tail d'actif `/knowledge/[id]` avec `id = "clauses"` et provoquait une erreur `404 Actif "clauses" introuvable`.
- Le lien de la banniÃ¨re pointe dÃ©sormais directement vers la route canonique de gestion des clauses `/kb/clauses`.
- Ajout d'une redirection de courtoisie HTTP 307 dans `src/routes/knowledge/[id]/+page.server.ts` pour rediriger automatiquement toute requÃªte vers `/knowledge/clauses` vers `/kb/clauses`, Ã©vitant ainsi l'erreur 404 en cas d'accÃ¨s direct ou via un ancien signet.
- Tests : vÃ©rification du lien `/kb/clauses` rendu par `KbClausesHealthBanner` dans `tests/contract/kb-clauses-health-alert.test.ts` et de la redirection 307 dans `tests/contract/issue_95_knowledge_explorer.test.ts`.
### Posture 3 (Rendu & Homologation) : les schÃ©mas et le fragment de HLD se lisent comme un brouillon de tableau blanc
- **C4** : le Structurizr DSL produit est acceptÃ© par le CLI officiel (2025.11.09). Avant : `enterprise` (retirÃ© du langage), containers homonymes, relation parent â†’ enfant. Une vue `container` s'ajoute Ã  la vue de contexte (qui ne montre pas les containers) ; les liens causaux `basedOn` deviennent des relations Â« fonde Â» ; plus de personne inventÃ©e Ã  partir des participants (`src/lib/domain/structurizrDsl.ts`).
- **SoliditÃ© visible** : chaque Ã©noncÃ© dessinÃ© (Mermaid, C4, SysML, JSON) porte vÃ©rifiÃ© / conÃ§u non vÃ©rifiÃ© / hypothÃ¨se / en revue / contestÃ© / en conflit / confiance non renseignÃ©e, en libellÃ© et en couleur (`src/lib/domain/epistemicBadge.ts`). Ã‰noncÃ©s remplacÃ©s ou retirÃ©s non dessinÃ©s, leur nombre dit ; deux valeurs actives diffÃ©rentes pour un prÃ©dicat = conflit, plus de Â« derniÃ¨re valeur lue Â» dans le JSON. Fin du Â« Verified Architecture Â» sur chaque Ã©lÃ©ment C4 et du `confidence: 'verified'` codÃ© en dur dans l'export scellÃ©.
- **Brouillon** : hypothÃ¨ses, conflits Ã  arbitrer, questions ouvertes et bandeau Â« PROVISOIRE Â» (paramÃ¨tre `draft`, lu jusque-lÃ  par aucun gÃ©nÃ©rateur) ; bandeau aussi sur les schÃ©mas globaux du dossier scellÃ©.
- **Option retenue Ã  l'Ã©cran** : le store charge dÃ©cision et options (`fetchDecisionContext`) et les passe au contexte de projection ; le gel les charge avant de sceller. L'identifiant de l'arbitre n'est pas transmis.
- **Fragment de HLD** : Â« En bref Â» en tÃªte (Markdown et Ã©cran), Y-statement sans le problÃ¨me ni la justification en double, identifiants typÃ©s humanisÃ©s, mÃ©tadonnÃ©es `COMPLIANCE_STATUS:*` / `PORTABILITY:*` hors des Â« Ã©carts acceptÃ©s Â», pas de Â« risque acceptÃ© Â» sans dÃ©cision.
- Empreintes : les projections scellÃ©es changent de contenu, donc d'empreinte, pour un mÃªme dossier (dÃ©cision assumÃ©e, pas de production).
- Tests : `tests/contract/structurizr-dsl.test.ts` (invariants + vrai CLI via `STRUCTURIZR_CLI` ou `npm run test:structurizr`), `epistemic-projections.test.ts`, `hld-fragment.test.ts`.
- **Limites** : SysML v2 non validÃ© par un outil SysML ; schÃ©mas globaux sans le dÃ©tail par Ã©noncÃ© ; `data.statements` de l'export scellÃ© contient encore les Ã©noncÃ©s retirÃ©s, prÃ©sentÃ©s comme affirmÃ©s ; validation Mermaid hors tests (`jsdom` absent), rendu contrÃ´lÃ© Ã  la main avec Playwright.

### Knowledge Hub : distinction du refus 403 Â« expert non enregistrÃ© Â» face Ã  l'indisponibilitÃ© 503 (archinex#145)
- Un utilisateur Archinex non inscrit dans le registre des experts du Hub voyait `/kb/reviews` afficher Ã  tort Â« Mode Hors-Ligne ou Service LLMOps Indisponible (503) â€” Le Knowledge Hub distant n'est pas joignable Â» et la pastille d'en-tÃªte basculer sur Â« LLMOps Local Â», alors que le Hub rÃ©pondait prÃ©cisÃ©ment 403 `{"status":"unauthorized","reason":"'...' is not a registered expert."}`.
- Le client LLMOps (`client.ts`) distingue dÃ©sormais rigoureusement le statut `not_registered` (403 avec raison non enregistrÃ©), `unauthorized` (401 jeton/assertion invalide), `unavailable` (503 ou panne rÃ©seau) et `ok`.
- Message d'orientation explicite dÃ©livrÃ© : Â« Votre adresse n'est pas inscrite dans le registre des experts du Hub : demandez Ã  un administrateur (Administration â†’ Inscrire dans le registre LLMOps) Â».
- Les Ã©crans `/kb/reviews` et `/kb/me` affichent un bandeau d'information dÃ©diÃ© au lieu d'une fausse alerte de dÃ©gradation rÃ©seau.
- La pastille d'en-tÃªte Â« LLMOps ConnectÃ© Â» ne bascule plus sur Â« Local Â» lors d'un 403 : le service LLMOps distant est joignable et connectÃ©.
- Tests : `tests/contract/kb-not-registered-expert.test.ts` (7 tests de contrat exhaustifs avec simulation du faux Hub, vÃ©rification des statuts 401/403/503 et maintien de la pastille connectÃ©e) et `tests/contract/llmops-live.test.ts` (test contre le vrai Hub vivant).

### Bac Ã  sable : support Windows avec Docker Desktop (`deploy/sandbox`)
- Script natif PowerShell `deploy/sandbox/sandbox.ps1` avec paritÃ© totale de commandes (`up`, `status`, `creds`, `smoke`, `logs`, `down`, `reset`, `destroy`) pour Windows avec Docker Desktop.
- DÃ©rivation cryptographique des clÃ©s d'acteur Ed25519 (RFC 8037) et des secrets alÃ©atoires sans dÃ©pendance externe binaire en s'appuyant sur l'API native `node:crypto` (avec repli OpenSSL).
- Normalisation des chemins Windows et conversion `cygpath -m` dans `deploy/sandbox/sandbox.sh` pour prÃ©venir l'interprÃ©tation des chemins de contexte `/c/...` comme dossiers relatifs sous Windows Docker Desktop.
- Ajout de `.gitattributes` garantissant les fins de ligne `LF` sur les scripts shell, Dockerfile, Caddyfile et scripts montÃ©s dans les conteneurs Linux, et `CRLF` sur PowerShell.
- Mots de passe conviviaux par dÃ©faut en local sur `localhost` (`admin123`, `architect123`, `security123`, `ciso123`) ou configurables via `SANDBOX_SIMPLE_PASSWORDS=1` pour simplifier les tests locaux sans compromettre la sÃ©curitÃ© sur URL publique.
- Suite de tests de contrat dÃ©diÃ©e (`tests/contract/sandbox-windows-support.test.ts`).
- Correction de l'erreur Docker Compose `failed to get console: The handle is invalid` sous Windows : suppression de la redirection de sortie de `Invoke-SandboxCompose` dans une variable (qui dÃ©truisait le handle de console), activation par dÃ©faut de `BUILDKIT_PROGRESS=plain` pour les terminaux non interactifs/IDE, et enregistrement systÃ©matique de `LLMOPS_DIR` dans `.sandbox/env`.
### DÃ©monstration : prÃ©-chargement de l'engagement Lulu et de l'audit ArcKit (sans clÃ© API)
- Ajout du jeu de donnÃ©es de rÃ©fÃ©rence examples/lulu-noc/ (Lot 1 Lulu : NOC, CÅ“ur 5G PPDR & RÃ©silience) :
  - 92 clauses RFP analysÃ©es, 7 sujets d'architecture cardinaux formalisÃ©s avec options et critÃ¨res MCDA.
  - Ã‰noncÃ©s Ã©pistÃ©miques avec dÃ©pendances causales directes (basedOn) pour la dÃ©monstration de la rÃ©tractation en cascade.
  - DÃ©libÃ©ration d'Ã©quipe multi-experts reconstituÃ©e.
- Enrichissement de prisma/seed.ts pour prÃ©-charger automatiquement le projet lulu-lot1-noc ainsi que l'exÃ©cution d'audit run_lulu_live_j0 dans Prisma (FactorizationRun). La dÃ©monstration complÃ¨te peut Ãªtre animÃ©e hors-ligne sans clÃ© API externe.
- Guide de dÃ©monstration complet rÃ©digÃ© dans [docs/demo-guide.md](docs/demo-guide.md) dÃ©taillant les principes ArcKit (triage 4 compartiments, factorisation Nâ†’K, Ã©licitation MCDA, projections dÃ©terministes d'artefacts) et le scÃ©nario en 3 actes.
### SÃ©curitÃ© : validation stricte de JWT_SECRET et suppression de la valeur publique du Dockerfile (archinex#141)
- L'Ã©tape `runner` du `Dockerfile` fixait une valeur par dÃ©faut publique (`archinex-super-secret-production-jwt-key-2026`). Elle a Ã©tÃ© retirÃ©e : le secret de session ne doit jamais Ãªtre figÃ© dans l'image.
- Au dÃ©marrage en production (`NODE_ENV=production`), le conteneur (`docker-entrypoint.sh`) et le serveur (`src/lib/auth/jwt.server.ts`, hook `init` dans `src/hooks.server.ts`) **refusent de dÃ©marrer** si `JWT_SECRET` est absent, plus court que 32 caractÃ¨res ou Ã©gal Ã  l'une des valeurs publiques connues (Dockerfile, dÃ©veloppement, exemple, CI), avec un message d'erreur explicite indiquant la procÃ©dure de gÃ©nÃ©ration (`openssl rand -hex 32`).
- Les sessions et jetons d'administration forgÃ©s avec une ancienne clÃ© publique ou de repli sont rejetÃ©s lors de la vÃ©rification.
- Documentation mise Ã  jour (`GCP_CLOUD_RUN_DEPLOYMENT.md`, `docs/fresh-install.md`, `docs/developer-guide.md`) pour dÃ©tailler la gÃ©nÃ©ration et l'injection via Secret Manager (`--set-secrets JWT_SECRET=archinex-jwt-secret:latest`).
- Tests de contrat : `tests/contract/jwt-secret-validation.test.ts` (12 tests validant le refus des clÃ©s publiques, l'exigence de longueur, l'Ã©chec de dÃ©marrage, et le rejet des jetons forgÃ©s).

### Rendu et homologation : correction de l'erreur Svelte `each_key_duplicate` dans le fragment HLD
- Dans `HldFragmentView.svelte`, les listes de chaÃ®nes de caractÃ¨res (points ouverts, consÃ©quences, risques acceptÃ©s, avertissements, critÃ¨res et scores) utilisaient la valeur comme clÃ© dans les blocs `{#each ...}`. Lorsqu'une question ou objection ouverte partageait le mÃªme intitulÃ© (par exemple lors de relances automatiques de proposition de dÃ©coupage du sujet pour lever la stagnation), Svelte levait une exception fatale `each_key_duplicate`.
- Les boucles d'affichage statiques de listes simples ont Ã©tÃ© dÃ©-clÃ©es dans `HldFragmentView.svelte` ainsi que dans la vue de consultation des cadres (`kb/frameworks/[id]`).
- Dans `src/lib/domain/hldFragment.ts`, `openPoints`, `acceptedRisks`, `acceptedViolations`, `coverageWarnings` et `requirementRefs` sont dÃ©sormais systÃ©matiquement dÃ©doublonnÃ©s Ã  la construction du fragment HLD.
- Tests : validation du dÃ©doublonnage et de la non-rÃ©gression dans `tests/contract/hld-fragment.test.ts`.

### Serveur de dÃ©veloppement : rÃ©solution de `.prisma/client/index-browser` sous Vite dev (archinex#144)
- Correction du plantage au dÃ©marrage de `npm run dev` (`vite dev`) : lors de la premiÃ¨re requÃªte, l'optimiseur de dÃ©pendances de Vite tentait de prÃ©-bundler `casbin-prisma-adapter` cÃ´tÃ© client navigateur. Cet adaptateur important `@prisma/client`, esbuild tentait de rÃ©soudre le point d'entrÃ©e navigateur (`index-browser.js`), qui Ã©chouait sur `.prisma/client/index-browser` (introuvable suite Ã  la migration Prisma 7 gÃ©nÃ©rant le client dans `src/generated/prisma`).
- `vite.config.ts` : retrait de `casbin`, `casbin-prisma-adapter` et `jose` de `optimizeDeps.include` (modules serveur/SSR qui n'ont pas Ã  Ãªtre prÃ©-bundlÃ©s cÃ´tÃ© client) ; ajout de `@prisma/client`, `casbin` et `casbin-prisma-adapter` dans `optimizeDeps.exclude` ; configuration de `ssr.external` pour `@prisma/client` et `casbin-prisma-adapter`.
- Suite de tests de contrat dÃ©diÃ©e : `tests/contract/vite-dev-server.test.ts` validant la configuration et le dÃ©marrage sans erreur du serveur Vite de dÃ©veloppement.

### SÃ©curitÃ© : le conteneur ne sÃ¨me plus de comptes de dÃ©monstration
- `docker-entrypoint.sh` lanÃ§ait `prisma/seed.ts` Ã  chaque dÃ©marrage : comptes `admin@archinex.local` / `admin123` (et `user123`) publics.
  Il appelle maintenant `prisma/bootstrap-admin.ts` : un premier administrateur est crÃ©Ã© seulement si aucun n'existe et si
  `ARCHINEX_BOOTSTRAP_ADMIN_EMAIL` est dÃ©fini (`ARCHINEX_BOOTSTRAP_ADMIN_PASSWORD` : 12 caractÃ¨res minimum, sinon mot de passe gÃ©nÃ©rÃ© et
  affichÃ© une fois). Idempotent. Les autres comptes se crÃ©ent depuis `/admin` (`docs/fresh-install.md`, Â§ 3 bis).
- Le jeu de dÃ©monstration reste disponible Ã  la demande : `ARCHINEX_SEED_DEMO=1`.
- La page `/login` n'affiche plus les boutons Â« Demo accounts Â» (identifiants en clair) hors dÃ©veloppement : le bundle de production ne
  contenait pas seulement le bouton, mais `admin123` dans le JavaScript client ; vÃ©rifiÃ© absent aprÃ¨s correction.
- Tests : `tests/integration/bootstrap-admin.test.ts` (6).

### SÃ©curitÃ© : le login n'accepte plus le hash stockÃ© comme mot de passe (archinex#137)
- `POST /api/auth/login` et `POST /api/invite/accept` (compte existant) acceptaient aussi `user.passwordHash === password` (repli
  Â« texte clair Â» des comptes de dÃ©monstration) : qui lisait `users.passwordHash` (fuite de base, sauvegarde) ouvrait la session en
  le soumettant tel quel. Les deux routes passent par `verifyPassword` (`src/lib/auth/password.server.ts`), bcrypt seulement.
- Reproduit avant le correctif (le hash donnait un 200), 5 tests ensuite (`tests/integration/login-no-plaintext-fallback.test.ts`).
- ConsÃ©quence : un compte dont `passwordHash` contiendrait encore un mot de passe en clair ne peut plus se connecter. `prisma/seed.ts`
  et les crÃ©ations de comptes hachent dÃ©jÃ  ; Ã  refaire par le seed ou une rÃ©initialisation de mot de passe si un tel compte existe.

### Bac Ã  sable : un Hub et un Archinex neufs et vierges, en conteneurs (`deploy/sandbox`)
- `./sandbox.sh up` construit et dÃ©marre le Hub (LLMOps), Archinex et un proxy HTTPS (Caddy) sur une URL de test, sans engagement,
  projet ni donnÃ©e : 4 comptes de test aux mots de passe alÃ©atoires, registre des experts du Hub rÃ©duit Ã  ces 4 personnes, Hub en
  mode strict (assertions d'acteur signÃ©es, clÃ© d'Archinex gÃ©nÃ©rÃ©e au premier lancement). `reset` efface les donnÃ©es, `destroy` tout.
- N'exÃ©cute pas `docker-entrypoint.sh`, qui sÃ¨me des comptes de dÃ©monstration aux mots de passe publics (archinex#137 pour le repli
  Â« texte clair Â» du login). Exige un Hub au contrat â‰¥ 1.39. Les images n'ont pas Ã©tÃ© construites par l'auteur (pas de dÃ©mon Docker) :
  voir `deploy/sandbox/README.md`, Â« Ã‰tat de la vÃ©rification Â».

### J0 : une clause d'automatisation n'est plus Ã©vacuÃ©e par le modÃ¨le seul (archinex#132)
- Constat du jalon J0 (`eval-results/decision-j0.md`) : un faux nÃ©gatif dangereux identique aux deux passes, `REQ-Lot1-216` (crÃ©ation automatique
  d'incidents), Ã©vacuÃ©e comme Â« fonction standard ITSM Â».
- Double protection sur la famille d'automatisation (pas un cas isolÃ©) :
  1. **Consigne systÃ¨me** (`CLASSIFY_SYSTEM` dans `src/lib/server/ingest/arckitRequirementsPipeline.ts`) : instruit explicitement le modÃ¨le
     que toute automatisation (auto-remÃ©diation, boucle fermÃ©e, crÃ©ation ou bascule automatique, action sans intervention humaine) relÃ¨ve
     de Â« deliberate Â» et n'est jamais une commoditÃ©.
  2. **Invariant dÃ©terministe** (`applyClassificationInvariants` avec `src/lib/domain/automationMarkers.ts`) : une clause non Â« info Â» qui dÃ©crit
     une automatisation ne peut pas Ãªtre Ã©vacuÃ©e par le modÃ¨le : elle passe Â« Ã  qualifier Â», avec la proposition du modÃ¨le conservÃ©e pour l'humain.
- TraÃ§abilitÃ© et auteur du juge : `AuditReference` (`src/lib/domain/requirementsAuditEval.ts`), `examples/reference-template.json`, les rapports Markdown
  (`src/lib/domain/requirementsAuditReport.ts`) et `scripts/eval-requirements-audit.ts` intÃ¨grent et vÃ©rifient dÃ©sormais l'auteur (`author`), la date (`date`)
  et le statut (`status`) du juge indÃ©pendant.
- MesurÃ© sur les Ã©vacuations archivÃ©es de J0 (92 clauses) : `REQ-Lot1-216` n'est plus Ã©vacuÃ©e ; `REQ-Lot1-259` (mÃªme famille) est aussi renvoyÃ©e ;
  Â« Ã  qualifier Â» passe de 0 Ã  2 clauses sur 92 (2 %, plafond 30 %). Les quatre autres Ã©vacuations restent.
- **Le jalon n'est pas rejouÃ©** : ce correctif a Ã©tÃ© Ã©crit en voyant le cas ; le rejeu doit se faire sur un autre dossier avec un juge fixÃ© avant la mesure
  (`docs/jalon-j0.md`). L'issue reste ouverte jusque-lÃ .

### IdentitÃ© des experts : assertion signÃ©e Ed25519 auprÃ¨s du Hub (LLMOps#144)
- `src/lib/server/llmops/actorAssertion.ts` : assertion d'acteur signÃ©e (`X-Actor-Token`, JWT EdDSA, `jti` neuf par requÃªte, 60 s) quand une clÃ© est
  configurÃ©e ; sinon l'en-tÃªte brut `X-Actor-Email` comme avant. `LLMOPS_ACTOR_AUTH=assertion` exige la clÃ© et n'envoie jamais l'en-tÃªte brut.
- `scripts/gen-actor-key.mjs` produit la clÃ© privÃ©e et le JWKS public. Faux Hub des tests : vÃ©rifie la signature, l'Ã©metteur, le destinataire,
  l'expiration et le rejeu comme le Hub 1.37, avec un mode strict.

### Revue des candidats : sÃ©paration des tÃ¢ches du Hub 1.37 (#131)
- Le Hub interdit Ã  l'auteur d'un candidat de le relire. Archinex affichait Â« Erreur HTTP 400 Â» ; il dit maintenant Â« SÃ©paration des tÃ¢ches : vous Ãªtes l'auteurâ€¦ Â»
  (statut `forbidden`, code `separation_of_duties`), et l'Ã©cran de revue dÃ©sactive accepter / amender / rejeter pour l'auteur avec une note.
- Tests live A11 : le candidat est relu par un autre acteur, et le refus de l'auteur est vÃ©rifiÃ© ; dÃ©lai explicite pour A8 (5 Ã  7 s).
- Le faux Hub des tests applique la mÃªme rÃ¨gle, avec la forme rÃ©elle de la rÃ©ponse.

### VÃ©rification du DÃ©coupage PDF des RFP sur Ã‰chantillon & Rapport d'Extraction (#50)
- **Rapport d'extraction automatique & MÃ©triques de qualitÃ©** :
  - Module mÃ©tier dÃ©diÃ© (`src/lib/domain/rfpExtractionReport.ts`) calculant la couverture textuelle (`coverageRate`), le score de qualitÃ© du dÃ©coupage (0 Ã  100), le nombre d'exigences et de pages.
  - DÃ©tection et classification des motifs de rÃ©fÃ©rence (`REQ-Lot1-*`, `Art. *`, `Clause *`, `Â§*`) avec mise en avant du motif dominant.
  - Alerte de couverture textuelle si moins de 60 % du document est rattachÃ© Ã  des exigences.
- **DÃ©tection exhaustive et explicite des anomalies de dÃ©coupage** :
  - DÃ©tection des trous dans la numÃ©rotation sÃ©quentielle (`detectNumberingGaps`), avec identification des bornes et des numÃ©ros manquants (ex: `REQ-Lot1-13 .. REQ-Lot1-14`).
  - DÃ©tection des doublons disambiguÃ¯sÃ©s avec suffixe `#2` (`detectDuplicatesAndUnnumbered`).
  - DÃ©tection des rÃ©fÃ©rences sans numÃ©ro explicite (`REQ-Lot1-?`) ou atypiques ne respectant pas le motif dominant.
  - DÃ©tection des clauses anormalement courtes (< 25 caractÃ¨res) ou volumineuses (> 2 500 caractÃ¨res).
  - DÃ©tection des pages sans aucune clause (sommaires, pages de garde, annexes non dÃ©coupÃ©es).
- **Ã‰chantillon de vÃ©rification humaine cÃ´te Ã  cÃ´te** :
  - GÃ©nÃ©rateur d'Ã©chantillon (`generateVerificationSample`) sÃ©lectionnant en prioritÃ© absolue toutes les clauses associÃ©es Ã  des anomalies, complÃ©tÃ©es par des clauses reprÃ©sentatives rÃ©parties sur le document.
  - Composant Svelte `RfpExtractionVerification.svelte` offrant une vue comparative : clause extraite Ã  gauche (rÃ©fÃ©rence, titre, texte, criticitÃ©, anomalie), page source du document avec son numÃ©ro de page Ã  droite.
  - PossibilitÃ© de valider l'Ã©chantillon ou de signaler une clause problÃ©matique avant le lancement de l'audit.
- **TraÃ§abilitÃ© & Persistance dans les exÃ©cutions de factorisation** :
  - IntÃ©gration de `HumanExtractionValidation` dans `FactorizeRequest`, `FactorizationRun` (base de donnÃ©es) et `RfpFactorizationResponse`.
  - Affichage clair du statut de validation humaine (ou alerte d'absence de vÃ©rification) dans le composant de rÃ©vision `RfpFactorizationReview.svelte`.
- **Tests** :
  - Tests de contrat d'extraction et de dÃ©tection d'anomalies sur deux mises en page de RFP rÃ©elles (`examples/Lulu.pdf` de 194 pages et `examples/lulu-noc/rfp-section4-noc.md`) dans `tests/contract/rfp-extraction-report.test.ts`.
  - Tests de contrat de persistance et traÃ§abilitÃ© de la validation dans `tests/contract/rfp-factorize-validation.test.ts`.

### MontÃ©e de version Prisma 6.19 â†’ 7.10 (#60)
- **Prisma 7.10 (derniÃ¨re 7.x stable)** avec le gÃ©nÃ©rateur `prisma-client` (sortie dans `src/generated/prisma`, ignorÃ©e par git) et l'adaptateur `@prisma/adapter-better-sqlite3` (instanciation centralisÃ©e dans `src/lib/server/prismaFactory.ts`).
- L'URL de base passe dans `prisma.config.ts` ; les chemins `file:./` restent rÃ©solus relativement Ã  `prisma/`.
- `prisma db push` ne gÃ©nÃ¨re plus le client : `npx prisma generate` ajoutÃ© en CI, et l'option `--skip-generate` supprimÃ©e.
- `casbin-prisma-adapter@1.12` est dÃ©jÃ  compatible Prisma 7 (peer `^7.2.0`). Prisma 8 reste en release candidate : non ciblÃ©.

### Export d'Architecture HLD & Projections C4/Mermaid dans l'Engagement Bundle (#122)
- **Peuplement automatique du modÃ¨le d'architecture (`data.architecture`)** :
  - `assembleEngagementBundle` extrait et synthÃ©tise les Ã©lÃ©ments (`BundleElement`) et relations (`BundleRelation`) Ã  partir des sujets, options retenues et statements formalisÃ©s.
  - Classification canonique des composants (`actor`, `system`, `component`, `datastore`, `network`, `interface`, `boundary`) et des relations (`uses`, `depends_on`, `data_flow`, `deploys_to`, `protects`, `contains`).
  - DÃ©termination temporelle dÃ©terministe via `findEarliestStoredIsoDate` pour garantir l'absence d'alÃ©a ou de fuite de l'horloge d'assemblage dans le corps des donnÃ©es d'architecture.
- **GÃ©nÃ©ration de projections formelles (Mermaid, Structurizr C4 DSL, SysML v2)** :
  - Projections locales par sujet dans `data.subjects[i].projections` et consolidÃ©es dans `data.architecture.projections.by_subject`.
  - Projections globales d'ensemble dans `data.architecture.projections` (`mermaid`, `structurizr_dsl` / `structurizrDSL`, `sysml_v2` / `sysmlV2`).
- **ConformitÃ© & IntÃ©gritÃ© du Bundle** :
  - Extension du schÃ©ma JSON `engagement_bundle.schema.1.1.json` validÃ©e avec Ajv.
  - ContrÃ´les de validation stricts dans `bundleVerifier.ts` : vÃ©rification des catÃ©gories d'Ã©lÃ©ments (`ELEMENT_KIND_INVALID`), des types de relations (`RELATION_KIND_INVALID`), dÃ©tection des frontiÃ¨res circulaires (`CIRCULAR_BOUNDARY`) et validation des rÃ©fÃ©rences de sujets (`DANGLING_REF`).
  - DÃ©terminisme cryptographique absolu du sceau SHA-256 sans dÃ©rive, insensible Ã  l'ordre des collections en entrÃ©e.
- **Tests** : 5 tests de contrat d'export d'architecture dans `tests/contract/bundle-architecture-export.test.ts`.

### Pipeline ArcKit pour le Benchmark Lulu (#121)
- **Support natif du pipeline ArcKit dans `benchmarkRunner.ts`** :
  - Ajout de l'option `pipeline?: 'deterministic' | 'arckit'` dans `BenchmarkRunOptions`.
  - IntÃ©gration de `runRequirementsAudit` : classement par lots, application stricte des invariants dÃ©terministes (repÃªchage des clauses bloquantes en `to_qualify`, exclusion des commoditÃ©s `evacuated` des sujets de dÃ©libÃ©ration, conversion des clarifications en `gaps` opposables).
  - Factorisation $N \text{ clauses} \to K \text{ sujets}$ (`FactorizedArchitecturalSubject`) convertis en `BundleSubject`s canoniques avec questions initiales et d'experts.
  - Option `elicit?: boolean` permettant de dÃ©clencher l'Ã©licitation multi-critÃ¨res approfondie via `elicitSubjectDetails` (gÃ©nÃ©ration de critÃ¨res pondÃ©rÃ©s, d'options et de questions expertes).
  - Injection du client LLM via `llm?: LlmPort` pour permettre des bancs d'Ã©valuation hors-ligne reproductibles ou en local souverain.
- **Enrichissement de `BenchmarkRunResult`** :
  - Exposition des rapports `arckitReport: ArcKitAuditReport` et `factorizedSubjects: FactorizedArchitecturalSubject[]` pour mesurer le ratio de compression du bruit, le repÃªchage des faux nÃ©gatifs dangereux et la complÃ©tude d'architecture.
- **Outil CLI `scripts/benchmark-run.ts`** :
  - Nouvelles options en ligne de commande : `--pipeline <deterministic|arckit>` et `--elicit`, avec enrichissement du rapport d'artefact `--summary-out`.
- **Tests** : 3 tests de contrat dÃ©diÃ©s dans `tests/contract/benchmark-arckit-pipeline.test.ts`.

### PortabilitÃ© des DÃ©cisions & Filtrage du Moissonnage (#120)
- **Qualification de portabilitÃ© Ã  l'arbitrage** : Ajout d'une dimension de portabilitÃ© lors de l'enregistrement d'une dÃ©cision d'arbitrage (`CreateDecisionSchema`, `ArbitrationPanel.svelte`) :
  - `project_specific` (SpÃ©cifique au contrat / projet) : dÃ©cision liÃ©e aux contraintes singuliÃ¨res du client ou du contrat, exclue du moissonnage gÃ©nÃ©ral (`harvestable: false`).
  - `reusable_product_capability` (CapacitÃ© produit rÃ©utilisable) : solution gÃ©nÃ©rique ou capacitÃ© technique rÃ©employable, Ã©ligible au moissonnage LLMOps (`harvestable: true`).
  - `reusable_architecture_doctrine` (Doctrine d'architecture transverse) : rÃ¨gle d'ingÃ©nierie ou principe gÃ©nÃ©ral Ã  capitaliser dans la doctrine transverse (`harvestable: true`).
- **Garde-fou au moissonnage & transmission au Hub** :
  - `buildKbCandidates` (`capitalization.ts`) filtre immÃ©diatement les dÃ©cisions `project_specific` et renvoie une liste vide afin d'empÃªcher toute pollution de la doctrine globale par des spÃ©cificitÃ©s contractuelles.
  - `recordDecisionInHub` (`hubDecisions.ts`) propage explicitement les propriÃ©tÃ©s `portability` et `harvestable` au Hub LLMOps.
  - Badge visuel contextuel affichÃ© dans la carte de dÃ©cision de l'arbitrage.
- **PÃ©dagogie & Guide de dÃ©cision** : IntÃ©gration dans `DecisionGuideModal.svelte` des explications sur la qualification de portabilitÃ© et la protection de la doctrine globale.
- **Tests** : Tests de contrat dans `tests/contract/decision-portability.test.ts` et `tests/contract/capitalization.test.ts`, et mise Ã  jour des tests d'intÃ©gration du Hub.

### Matrice de ConformitÃ© de Base StandardisÃ©e (#118)
- **Statuts de conformitÃ© unifiÃ©s** : Support natif des positions de conformitÃ© `Compliant`, `Partially compliant`, `Non-compliant` et `Provisional` sur les dÃ©cisions d'arbitrage et les exigences sources.
- **RÃ¨gle de justification substantielle** : Obligation stricte de renseigner une rÃ©serve / justification explicite (au moins 5 caractÃ¨res) dÃ¨s lors qu'un arbitrage est `Partially compliant` ou `Non-compliant`. ContrÃ´les appliquÃ©s dans les schÃ©mas Zod (`CreateDecisionSchema`), la base de donnÃ©es (`arbitrationDb.ts`) et la vÃ©rification de bundle (`bundleVerifier.ts`).
- **Export et Visualisation multi-formats** :
  - Route d'API dÃ©diÃ©e `/api/projects/[projectId]/compliance-matrix` proposant les formats `markdown` (tableau opposable structurÃ©), `csv` (tableur RFC 4180 avec BOM UTF-8) et `json` (modÃ¨le typÃ©).
  - Onglet dÃ©diÃ© Â« Matrice de ConformitÃ© Â» dans le Hub d'Artefacts (`ArtifactRegenerationHub.svelte`) avec synthÃ¨se exÃ©cutive (taux de conformitÃ© pondÃ©rÃ©, rÃ©partition des statuts) et bouton d'export direct en CSV.
- **IntÃ©gritÃ© de schÃ©ma** : Respect strict du schÃ©ma de bundle 1.1 sans altÃ©ration de contrat fermÃ© (`additionalProperties: false`).
- **Tests** : 8 tests de contrat validant les rÃ¨gles de conformitÃ©, l'exportation et la compatibilitÃ© de bundle dans `tests/contract/compliance-matrix.test.ts`.

### Indicateur d'Alerte sur les Clauses KB non ValidÃ©es ou non PubliÃ©es (#119)
- **BanniÃ¨re d'alerte et santÃ© de doctrine** : Composant rÃ©utilisable `KbClausesHealthBanner.svelte` informant l'architecte du volume de contrÃ´les KB actifs, du nombre de clauses vÃ©rifiables (`checks:`) validÃ©es et de la proportion de clauses en attente de test ou de publication.
- **Badge d'alerte contextuel** : Affichage d'un badge d'avertissement explicite (`data-testid="kb-clauses-health-alert"`) lorsqu'au moins une clause en attente est dÃ©tectÃ©e, avec renvoi direct vers la console KB.
- **IntÃ©gration transverse** : DÃ©ployÃ© sur la page d'accueil des projets (`+page.svelte`), le tableau de bord de la base de connaissances (`/kb/dashboard/+page.svelte`) et le panneau des rÃ©fÃ©rentiels rÃ©glementaires applicables (`RegulatoryFrameworksPanel.svelte`).
- **Tests** : 5 tests de contrat validant les calculs de santÃ© et le filtrage contextuel dans `tests/contract/kb-clauses-health-alert.test.ts`.

### Adaptateur de Benchmark S3 : Enregistrement de `kb_references` sur `confirm_reuse` (archinex-benchmark#1)
- **Constat** : En mode $S_3$ (assistÃ©), lorsqu'un expert confirmait le rÃ©emploi d'une dÃ©cision antÃ©rieure (`action: "confirm_reuse"`), `benchmarkRunner.ts` ajoutait l'entrÃ©e correspondante dans `data.reuse_log` (`matched_ref`), mais omettait d'inscrire la rÃ©fÃ©rence dans `data.kb_references` et de la passer Ã  `buildEngagementBundle`. Le vÃ©rificateur `verifyEngagementBundle` rejetait alors le bundle scellÃ© avec l'erreur `[KB_REF_UNLISTED]`.
- **Correction** : Inscription automatique de `matched_ref` dans `kbReferences` lors du traitement de `confirm_reuse`, transmission de `kbReferences` Ã  `buildEngagementBundle`, et tolÃ©rance `k.ref || k.id` dans `bundleVerifier.ts`.
- **VÃ©rification** : Nouveau test de contrat dans `tests/contract/benchmark-adapter.test.ts` (7/7 passÃ©s).

### Ergonomie du Workbench de DÃ©libÃ©ration & ContrÃ´les Globaux de l'Application (#114)
- **Pastille de connectivitÃ© LLMOps globale** : dÃ©placÃ©e depuis l'en-tÃªte de dÃ©libÃ©ration vers l'en-tÃªte supÃ©rieur permanent de l'application (`+layout.svelte`, Ã  cÃ´tÃ© des contrÃ´les de langue et de thÃ¨me). Elle affiche l'Ã©tat temps rÃ©el (ConnectÃ© au Hub en direct, mode Local souverain, ou synchronisation en cours) et permet de relancer la synchronisation d'un simple clic depuis n'importe quel Ã©cran.
- **Menu d'aide global & guide mÃ©thodologique** : intÃ©gration d'une icÃ´ne d'aide discrÃ¨te `?` dans l'en-tÃªte global donnant accÃ¨s Ã  la modale Â« Comment dÃ©cider ? Â» (guide des niveaux de maturitÃ© L0â†’L5 et leviers d'arbitrage) sur l'ensemble des pages.
- **Ã‰puration du bandeau DÃ©libÃ©ration & HLD** : suppression des boutons redondants ou anachroniques issus des anciens prototypes (simulateur de rÃ´le d'architecte dÃ©connectÃ© du RBAC rÃ©el, faux bouton de bascule Â« OpÃ©rateur humain / Agent IA Â», doublon d'invitation d'expert dÃ©jÃ  gÃ©rÃ© dans la mini-app `/users`, et bouton Â« Sceller Â» hors contexte dÃ©placÃ© lÃ  oÃ¹ le scellement s'opÃ¨re rÃ©ellement).
- **AÃ©ration visuelle** : le sÃ©lecteur de projets et d'engagements s'Ã©tend dÃ©sormais sur une grille fluide occupant toute la largeur disponible.

### Tests live : les quatre anciens Ã©checs, expliquÃ©s
- Jeton par dÃ©faut de `llmops-mcp` alignÃ© sur celui du serveur de contrat (`contract-service-token`) ; dÃ©lai explicite pour le test A14
  (banc de similaritÃ©, ~5 s). Les autres causes (rÃ©vision d'ADR-0001, engagement de dÃ©monstration absent) Ã©taient dans le serveur de
  contrat du Hub : LLMOps#129. `docs/testing.md` mis Ã  jour.

### Couverture exigence â†’ contrÃ´le (K17, contrat 1.31 du Hub)
- **Constat** : l'export d'Archinex n'a jamais calculÃ© la section `compliance` (elle valait toujours `[]` hors banc d'essai). K17 n'est
  donc pas un transfert Ã  retirer d'Archinex mais une capacitÃ© du Hub, que la matrice de traÃ§abilitÃ© lit dÃ©sormais.
- Une dÃ©cision envoyÃ©e au Hub porte `based_on` : les rÃ©fÃ©rences de la base de connaissances de l'**option retenue**. Le Hub les confronte
  aux contrÃ´les rapprochÃ©s de chaque exigence (`allocated` / `proposed` / `uncovered`, dÃ©claratif, jamais Â« vÃ©rifiÃ© Â»).
- La matrice de traÃ§abilitÃ© d'un projet basculÃ© gagne une colonne Â« ContrÃ´les dÃ©clarÃ©s Â».
- Lecture de l'instantanÃ© (schÃ©ma 1.7) : un statut inconnu ou une origine autre que le Hub fait **refuser** l'instantanÃ© ; un instantanÃ©
  sans section se lit normalement.
- **Limite** : une exigence crÃ©Ã©e par l'API d'Ã©criture n'a pas de contrÃ´le rapprochÃ© ; la section est donc vide pour un projet d'Archinex
  tant que le Hub ne l'accepte ou ne le calcule pas (voir `docs/hub-parity.md`).
- ParitÃ© : `compliance` n'est plus Â« absente du Hub Â» ; le scÃ©nario n'en Ã©prouve rien.
- Test du parcours contre un vrai Hub : `tests/contract/hub-compliance-live.test.ts`.
- Correction de #108 (explorateur de doctrine), qui rendait `main` rouge : Â« ValidÃ© par Â» lisait des champs inexistants
  (`validated_by`) au lieu de `review.by` / `review.at` ; le test construisait le client avec de mauvais arguments.

### DÃ©cision d'un projet basculÃ© : elle atteint enfin le Hub (#103)
- **Cause** : la route `â€¦/decision/assert` d'un projet basculÃ© envoyait au Hub `retained_option` (un identifiant d'option
  d'Archinex), que le Hub refuse en 400 (`'decision' is required`), puis **avalait l'erreur** et Ã©crivait la dÃ©cision comme
  affirmÃ©e en local. Le faux Hub du test acceptait n'importe quelle forme : il validait le bug.
- **CorrigÃ©** : le Hub reÃ§oit le **texte** de l'option retenue et des options Ã©cartÃ©es, la dÃ©cision **proposÃ©e au nom de son
  auteur** (identifiÃ© par son e-mail), puis **affirmÃ©e par la personne connectÃ©e** avec l'identifiant renvoyÃ© par le Hub ;
  le sujet passe Ã  L3 dans le Hub, qui est le systÃ¨me d'enregistrement de sa maturitÃ©. ClÃ© d'idempotence stable.
- **Aucune erreur du Hub n'est avalÃ©e** : si le Hub refuse (ou est injoignable), la route refuse avec le code et la raison du
  Hub, et **rien n'est Ã©crit en local** (sujet Ã  L2, pas d'Ã©vÃ©nement, pas d'Ã©noncÃ©).
- **Vocabulaire des faits** : le Hub ne reconnaÃ®t que le sien (`topology.dc_count`, `data.rpo_target_s`â€¦), avec des valeurs
  typÃ©es ; celui d'Archinex (`resilience_mode`, `site_count`â€¦) n'en recoupait aucune clÃ©. Pour un projet basculÃ©,
  l'extraction et l'affirmation utilisent le vocabulaire du Hub (lu dans son instantanÃ©) ; Â« 2 Â» devient 2 quand c'est sans
  ambiguÃ¯tÃ©, sinon la valeur est refusÃ©e avec sa clÃ© (422 `FACT_VALUE`), jamais devinÃ©e.
- Types alignÃ©s sur le contrat (`HubDecisionInput.decision`, `rejected`) : le compilateur attrape dÃ©sormais la mauvaise forme.
- Test du parcours contre un **vrai Hub** (`tests/contract/hub-decision-live.test.ts`) ; le faux Hub de
  `decision-survey-card.test.ts` applique maintenant le contrat du Hub.
- Limite connue : les faits cochÃ©s Ã  l'affirmation sont enregistrÃ©s dans la proposition faite au nom de l'auteur ; le Hub les
  attribue donc Ã  l'auteur, alors que c'est la personne qui affirme qui les a choisis.

### Dossier scellÃ© dÃ©terministe, avec les exigences du RFP
- L'audit clause par clause est dÃ©sormais **enregistrÃ©** (tables `RequirementSource` / `Requirement`) au lieu d'Ãªtre
  perdu Ã  la confirmation de l'import. La proposition du modÃ¨le et la dÃ©cision humaine sont deux jeux de colonnes
  distincts : un nouvel audit ne touche jamais une dÃ©cision humaine.
- Le dossier d'engagement scellÃ© contient les exigences (Ã©tat, motif, niveau d'assertion `asserted`/`proposed`/`open`,
  auteur, date), leur rattachement aux sujets, et les lacunes correspondantes (clause Ã  qualifier ou Ã  clarifier).
- Assemblage rÃ©Ã©crit comme fonction pure (`bundleAssembly.ts`) : mÃªme Ã©tat stockÃ©, mÃªmes octets scellÃ©s, quelle que
  soit l'heure d'export ou l'ordre des lignes en base. Plus de sujet Â« par dÃ©faut Â» ni de dÃ©cision inventÃ©e ; un sujet
  n'est Â« dÃ©cidÃ© Â» que s'il existe une dÃ©cision enregistrÃ©e ; une incohÃ©rence devient une lacune visible.
- Le vÃ©rificateur contrÃ´le aussi les exigences (motif obligatoire pour une Ã©vacuation, clause bloquante jamais
  Ã©vacuÃ©e, clause Ã  dÃ©libÃ©rer portÃ©e par un sujet, clause Ã  clarifier ou Ã  qualifier signalÃ©e par une lacune).
- Preuve de la chaÃ®ne Â« JSON scellÃ© â†’ document Â» : `renderTraceabilityMatrix` produit la matrice de traÃ§abilitÃ© Ã 
  partir du seul dossier, refuse un dossier altÃ©rÃ© ou incohÃ©rent, et donne le mÃªme texte pour le mÃªme sceau.
- API : `POST/GET /api/projects/{id}/requirements`, `PATCH /api/projects/{id}/requirements/{SRC-xxxx:clause}`
  (l'auteur est celui de la session).
- Correctif : `sanitizeHandle` est idempotent (un handle `@nom` n'Ã©tait plus reconnu et devenait `@lead-architect`).
- Contrat `EngagementBundle` **1.1** (dÃ©cision du propriÃ©taire) : exigences auditÃ©es, lacunes typÃ©es par `kind`.
  Le schÃ©ma proposÃ© est dans `tests/fixtures/bundle/engagement_bundle.schema.1.1.json` et les dossiers produits y sont validÃ©s
  (ajv) par les tests. La validation a rÃ©vÃ©lÃ© des Ã©carts de l'ancien export avec le schÃ©ma 1.0 de la suite, corrigÃ©s :
  dÃ©cisions (`title`, `rationale`, `alternatives` objets), Ã©noncÃ©s (`predicate`), `sha256` des sources, statuts de sujet.
  Les dossiers 1.0 restent vÃ©rifiables. **Ã€ soumettre Ã  la suite** (le schÃ©ma 1.0 y est figÃ©).
- Limite connue : la dÃ©cision humaine clause par clause n'a pas encore d'Ã©cran (API seulement).

### Le Hub, Ã©metteur unique de l'instantanÃ© d'un projet basculÃ© (archinex#34, contrat LLMOps 1.27)
- Une exigence Ã©vacuÃ©e par une personne, avec son motif, est un **fait engagÃ©** : pour un projet basculÃ© elle s'enregistre
  dans le Hub (proposÃ©e par un membre, affirmÃ©e par un dÃ©cideur distinct), jamais en local. La proposition brute du modÃ¨le
  reste dans Archinex. Routes : `PATCH â€¦/requirements/{id}` (propose), `POST â€¦/assert`, `POST â€¦/withdraw`.
- Migration vers le Hub : reprise des exigences auditÃ©es (par 500, jamais tronquÃ©es) et du rattachement des sujets ; une
  dÃ©cision dÃ©jÃ  prise n'est pas reprise au nom du lot, le rapport la liste pour Ãªtre rÃ©affirmÃ©e.
- **Archinex n'Ã©met plus rien pour un projet basculÃ©** : l'export rÃ©concilie puis rend la rÃ©fÃ©rence de l'instantanÃ© du Hub. Le
  Â« mode Hub Â» de la PR #47 (dossier de processus Ã©pinglant le Hub) est retirÃ©, ainsi que `pins.hub_snapshot` du contrat 1.1.
- `GET /api/projects/{id}/traceability-matrix` : matrice produite depuis l'artefact scellÃ© qui fait foi (instantanÃ© du Hub,
  sceau revÃ©rifiÃ© ici ; sinon dossier local vÃ©rifiÃ©). Un mÃªme modÃ¨le de lecture, un seul rendu.
- ParitÃ© dossier d'Archinex / instantanÃ© du Hub mesurÃ©e sur un scÃ©nario rÃ©el : [`docs/hub-parity.md`](docs/hub-parity.md).
- Identifiants d'exigence acceptÃ©s par le Hub (`hubRequirementId`) : dÃ©terministes, injectifs.
- Bug relevÃ©, non corrigÃ© ici : la route d'affirmation d'une dÃ©cision d'un projet basculÃ© n'atteint jamais le Hub (#103).
### Rapport d'audit lisible et protocole du jalon J0
- Rapport Markdown de l'audit : pourquoi ces sujets (tension relevÃ©e sur chaque clause), ce que devient chaque autre
  clause, ce qu'il faut relire en prioritÃ©, comparaison avec une rÃ©fÃ©rence. Chaque clause y figure exactement une fois.
  Disponible par `--report` (ligne de commande) et par un bouton de tÃ©lÃ©chargement dans l'Ã©cran de revue.
- L'Ã©cran de revue affiche Â« Pourquoi Ã  dÃ©libÃ©rer Â» sur chaque clause retenue.
- Protocole pas Ã  pas du jalon J0 (`docs/jalon-j0.md`) et modÃ¨le de fichier de rÃ©fÃ©rence (`examples/reference-template.json`).
- L'Ã©tat des clauses non retenues est conservÃ© aprÃ¨s la confirmation de l'import (voir ci-dessus).

### Plus aucune donnÃ©e de dÃ©monstration ni de repli fabriquÃ©
- Le client LLMOps ne connaÃ®t plus aucun projet et ne lit plus de fixtures du dossier `tests/` : si LLMOps est
  injoignable, la santÃ© est `unreachable`, les listes sont vides, l'instantanÃ© et les Ã©critures Ã©chouent explicitement.
- SupprimÃ©s : le jeu Â« hors ligne Â» servi aux projets de dÃ©mo, la fausse santÃ© Â« ok Â», la fausse santÃ© KB
  (qui annonÃ§ait un rappel de 85 % et une publication G7 Ã©ligible), les simulations activÃ©es par
  `ALLOW_OFFLINE_MOCK` / `USE_FAKE_LLMOPS` dans `src/`, et la campagne d'enrichissement prÃ©chargÃ©e.
- Garde-fou denylist : 33 violations â†’ 0.
- Les tests 1 Ã  6 de `llmops-adapter.test.ts` passaient grÃ¢ce Ã  ces fixtures sans rien prouver ; ils testent dÃ©sormais
  l'adaptateur contre un serveur HTTP local explicite, et vÃ©rifient qu'un LLMOps absent ne produit aucune donnÃ©e.
  Le contrat rÃ©el reste couvert par `llmops-live*.test.ts` (`LLMOPS_LIVE_URL`).

### IntÃ©gration continue
- Ajout de `.github/workflows/verify.yml` : `npm run verify` (denylist, tests, types, build) Ã  chaque push et pull request.

### Audit des exigences en Ã©tapes (remplace l'audit cÃ¢blÃ© sur un seul RFP)
- Le pipeline d'ingestion classe dÃ©sormais chaque clause avec le modÃ¨le configurÃ© (lots, JSON validÃ© par schÃ©ma),
  puis des contrÃ´les dÃ©terministes garantissent : un Ã©tat par clause, aucune Ã©vacuation de clause bloquante ou sans motif,
  chaque clause Ã  dÃ©libÃ©rer dans exactement un sujet.
- Nouvel Ã©tat Â« Ã  qualifier Â» : en cas de doute ou de panne du modÃ¨le, la clause revient Ã  l'humain au lieu d'Ãªtre Ã©vacuÃ©e.
  Avant ce changement, tout RFP autre que la section de dÃ©monstration voyait ses clauses dÃ©clarÃ©es Â« Ã©vacuÃ©es Â».
- Taux de couverture honnÃªte (les clauses Â« Ã  qualifier Â» n'y comptent pas) ; l'interface affiche un compteur Â« Ã€ qualifier Â».
- Les analyses expertes du RFP de dÃ©monstration quittent `src/` pour `examples/lulu-noc/reference-analysis.json`.
- Outil de mesure : `npm run eval:requirements` (rappel, faux nÃ©gatifs dangereux, appariement des points durs).
- Correctif d'affichage : un rÃ©sultat produit par Claude n'est plus prÃ©sentÃ© comme un Â« repli heuristique Â».

### 2026-10-09 â€” Ingestion ArcKit, fournisseurs LLM, ergonomie
- Ajout du pipeline d'audit des exigences inspirÃ© d'ArcKit (`src/lib/server/ingest/`).
- Fournisseur LLM multiple : Anthropic Claude ou serveur local (Ollama), dÃ©couverte dynamique des modÃ¨les.
- CrÃ©ation et scission de sujets Ã  la demande ; questions mÃ©tier interactives ; liaison exigences â†” sujets.
- Correctifs : projets de dÃ©monstration isolÃ©s, sujets crÃ©Ã©s Ã  L0, jours de stagnation rÃ©els, statut LLMOps explicite.
- Script `npm run db:reset`.

### 2026-10-04 â†’ 2026-10-08 â€” Espace de dÃ©libÃ©ration (A24 Ã  A30)
- A24 un sujet = une conversation ; A25 composeur structurÃ© ; A26 stepper de maturation L0â†’L5.
- A27 carte de dÃ©cision et faits affirmÃ©s ; A28 cascade de questions et sujets enfants ;
  A29 agent proposeur et dÃ©tection de doublons ; A30 rÃ¨gles de projet et dÃ©rogations justifiÃ©es.
- Interface en deux colonnes, allÃ¨gement progressif de l'affichage.

### 2026-10-03 â€” Dossier scellÃ© et Hub (A16 Ã  A23)
- Dossier d'engagement scellÃ© (`EngagementBundle`), export OSCAL, diffÃ©rentiel, alignement sur l'enveloppe de la suite.
- A23 : Archinex Ã©crit dans le Hub LLMOps ; bascule du systÃ¨me d'enregistrement.
- Sceau canonique du gel couvrant le contenu.

### 2026-10-02 â€” RÃ©utilisation et factorisation (A12 Ã  A15)
- Vecteurs sÃ©mantiques, confirmation de rÃ©utilisation par hypothÃ¨se, calibration sur jeu annotÃ©, second RFP.
- Factorisation hiÃ©rarchique (map-reduce) des RFP volumineux.
- SÃ©curitÃ© : l'identitÃ© de l'acteur provient uniquement de la session.

### 2026-10-01 â€” Gouvernance de la base de connaissances (A6 Ã  A11)
- Comptes experts et rÃ´les KB, boÃ®te de revue, atelier de doctrine, rÃ©fÃ©rentiels rÃ©glementaires,
  Ã©valuations, tableau de bord et publication scellÃ©e.
- Tests de contrat contre un serveur LLMOps rÃ©el.

### 2026-09-27 â†’ 2026-09-29 â€” Socle (A0 Ã  A5)
- A0 assainissement ; A1 Ã©tat serveur partagÃ© et verrou optimiste ; A2 critÃ¨res et options ;
  A3 dÃ©bat multi-agents bornÃ© ; A4 maturitÃ© calculÃ©e et arbitrage humain (porte G3) ;
  A5 capitalisation vers la KB (porte G4).
