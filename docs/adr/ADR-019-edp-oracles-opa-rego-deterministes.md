# ADR-019 : Oracles Déterministes EDP sur Open Policy Agent (OPA / Rego v1)

- **Statut** : Accepté
- **Date** : 2026-11-22
- **Contexte** : Sous-système EDP (Épique #166, [ADR-016](ADR-016-promotion-edp-experimental.md)), Phase 4 KAOS & 15 règles d'or Sylva
- **Références** : [`docs/adr/ADR-016-promotion-edp-experimental.md`](ADR-016-promotion-edp-experimental.md), [`docs/architecture-contracts.md`](../architecture-contracts.md), `src/lib/server/edp/opaRunner.ts`, `src/lib/server/edp/projectionCompiler.ts`, `scripts/edp-mutation-gate.ts`

---

## 1. Contexte et Problématique

Pour vérifier qu'un inventaire d'ingénierie détaillée (LLD, valeurs `SylvaWorkloadCluster`, inventaire Nautobot, catalogue logique) respecte une décision HLD arbitrée en Porte G3, deux pièges doivent être évités :
1. **Évaluation par LLM** : non déterministe, sujette aux hallucinations, impossible à opposer en audit réglementaire (NIS2 / ANSSI) et interdite en autonomie par l'Invariant II (`verified × llm-derived`).
2. **Règles ad hoc en TypeScript contenant des littéraux métier en dur** : difficiles à auditer par des experts sécurité/réseau, couplées au code applicatif et exposées au risque de faux positifs par vacuité (une boucle sur un tableau vide qui retourne « conforme »).

---

## 2. Décision

1. **Moteur d'évaluation : binaire officiel Open Policy Agent (OPA) épinglé** :
   - Version épinglée (`v1.21.4`) installée via `scripts/install-opa.sh` (Linux/CI) et `scripts/install-opa.ps1` (Windows) avec vérification obligatoire d'empreinte SHA-256.
   - Exécution isolée hors-ligne (*air-gap*) encapsulée dans `src/lib/server/edp/opaRunner.ts`.
   - Si le binaire OPA est absent ou échoue, l'état retourné est `unavailable`, jamais `compliant` ([ADR-020](ADR-020-interdiction-repli-silencieux-production.md)).
2. **Langage et bibliothèque normative : Rego v1 avec convention à 4 verdicts** :
   - Les politiques résident dans `edp/policies/` (`multi_axis_refinement.rego`, `sylva_golden_rules.rego`, `twin_resilience.rego`).
   - Toute évaluation d'oracle distingue 4 états : `compliant`, `violated`, `not_applicable`, `insufficient_input`. Toute entrée attendue absente, vide ou non prouvée déclenche `insufficient_input` (prévention de la vacuité).
3. **Séparation Intension / Extension & Projections `data.ontology`** :
   - Les règles Rego ne codent pas en dur les paramètres métier : `src/lib/server/edp/projectionCompiler.ts` compile les `projections` des feuilles ontologiques en `data.ontology` (avec empreinte canonique SHA-256) et détecte les duplications littérales.
   - `src/lib/domain/edp/intentionPurity.ts` interdit les IP, CIDR, MAC ou noms d'hôtes dans le contexte de décision HLD.
4. **Garde de mutation déterministe à 100 %** :
   - `scripts/edp-mutation-gate.ts` vérifie par neutralisation de règles (`drop_rule`) que 100 % des mutants sont tués par les cas de test avant acceptation d'un oracle.
5. **Périmètre des oracles (articulation avec [ADR-017](ADR-017-nautobot-point-unique-reconciliation.md))** :
   - Les oracles de **décision** (évalués sur l'intention et sur un instantané lu de Nautobot) vivent dans Archinex.
   - Les contrôles d'**enforcement** sur les systèmes réels vivent dans les connecteurs derrière Nautobot et remontent leurs preuves par write-back.

---

## 3. Alternatives Écartées

- **Juge LLM pour la conformité LLD** : non déterministe, non reproductible et contraire à l'Invariant II.
- **Moteur de règles TypeScript maison** : réinvente un évaluateur déclaratif standardisé, moins lisible pour les équipes sécurité/cloud déjà familières de Rego/Kyverno/OPA.
- **OPA en service HTTP distant obligatoire** : rompt l'exigence d'exécution 100 % autonome en CI et en environnement *air-gap*.

---

## 4. Conséquences

### Positives
- Verdicts 100 % déterministes, reproductibles hors-ligne et auditables avec rétro-traçabilité vers la clause réglementaire violée (`violated_clause_urn`).
- Prévention structurelle des faux positifs par vacuité (`insufficient_input`) et par tests faibles (garde de mutation 100 %).

### Négatives & Mitigations
- Prérequis d'installation du binaire OPA en local et en CI : documenté explicitement dans le démarrage rapide (`README.md`, `docs/fresh-install.md`) et automatisé par `scripts/install-opa.sh` / `scripts/install-opa.ps1`.
- Montée en compétence Rego : mitigée par la chaîne de rédaction assistée sous contrôle déterministe (`edpDrafting.ts`) et la détection automatique des oracles fantômes (`loadImplementedRegoRuleNames`).
