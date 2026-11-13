# Proposition : Jumeau numérique de Sylva branché à l'hydratation

## 1. Problème : le what-if actuel est un compteur, pas un modèle

`simulateWhatIfDatacenters` ([`refResolver.ts`](../../../src/lib/domain/edp/refResolver.ts)) et `summarizeWhatIfComparison`
([`logicalViews.ts`](../../../src/lib/domain/edp/logicalViews.ts)) répondent à « combien d'instances, de NICs, d'hôtes ? »
(`estimatedBareMetalHosts = dcs.length * 2`) et dessinent un Mermaid. Ils ne répondent à **aucune** des questions qui
justifient réellement un choix 2 DCs vs 3 DCs :

| Question de l'architecte | Réponse actuelle | Ce qu'il faut |
|---|---|---|
| Le control-plane RKE2 (etcd, 3 membres) survit-il à la perte d'un DC ? | aucune | calcul de quorum par domaine de défaillance |
| Les réplicas de stockage (Longhorn/Ceph, RF=3) restent-ils disponibles et écrivables ? | aucune | placement + quorum des réplicas |
| Les charges (UPF, SR-IOV, hugepages) rentrent-elles sur les hôtes restants après panne ? | aucune | packing de capacité sous contraintes |
| Les flux de médiation (`secgw` → `dea`) restent-ils joignables si un lien tombe ? | aucune | accessibilité réseau |
| Quel est le delta de risque / coût entre options ? | un tableau de 4 compteurs | rapport comparatif tracé et rejouable |

Le what-if est aujourd'hui **disjoint** du pipeline de preuve : il n'alimente ni OPA, ni l'`EvidenceBundle`, ni les
critères des options (lot A2).

## 2. Vision

Un **jumeau numérique pré-déploiement** de Sylva (voir §5 pour la nuance de vocabulaire) :
1. **Compilé** depuis l'inventaire déjà produit par `composeMultiAxisHydration` (aucune saisie parallèle) ;
2. **Exécuté** sur des scénarios (variations d'intention *et* injections de pannes) à fidélité choisie (T0 à T4) ;
3. **Rendu en preuve** : un rapport `twin_report` déterministe, scellé (provenance + sha256), injecté comme source
   `refined_input` ; les invariants à tenir sous scénario sont déclarés **dans l'ontologie** (intension), évalués
   **par OPA** (extension) — exactement le modèle *staged configuration* déjà en place.

## 3. Hors périmètre (explicite)

- Pas de simulation de performance du plan de données (débit DPDK/SR-IOV, latence 5G) : modélisé comme **contrainte de
  capacité** uniquement.
- Pas de remplacement de Nautobot (SSoT) ni de Flux/Sylva : le jumeau les **lit**, il n'y écrit jamais.
- Pas de contournement des Invariants II/III : un `twin_report` n'est jamais `validated` sans validateur humain.

## 4. Impact sur les Invariants d'Archinex

| Invariant | Impact |
|---|---|
| I (5 facettes) | `twin_report` porte contenu, justification (`subjectId`, scénarios), autorité (`computed`), maturité, révisabilité (hash du modèle) |
| II (`verified × llm-derived` interdit) | le jumeau est déterministe et sans LLM ; un LLM peut *proposer* des scénarios, jamais les résultats |
| III (silence ≠ approbation) | scénario requis non exécuté ⇒ `insufficient_input`, jamais `compliant` |
| VI (rétractation) | tout changement du modèle (hash) ou de version Sylva rend les `twin_report` `stale` |

## 5. Vocabulaire : jumeau ou modèle ?

Avant déploiement, il n'existe pas d'actif physique à synchroniser : c'est un **modèle prédictif d'intention**. Il
devient un **vrai jumeau** quand il est calibré sur l'observé (Nautobot *actual*, état Flux/CAPI de Sylva, via
`nautobotSync` et le webhook existants, et `transformSylvaManifestsToRefinedInput`). La phase 3 (cf. `tasks.md`) ferme
cette boucle (dérive intention ↔ observé). Le nom « jumeau » est donc tenu **par roadmap**, pas par la phase 1.

## 6. Cadre expérimental

Additif, derrière `ARCHINEX_EXPERIMENTAL_EDP=1` et `ARCHINEX_TWIN_ENGINES=analytic[,render,kwok,batfish,capi]`. Sans le
drapeau, sorties actuelles inchangées. Le what-if « 2 vs 3 DCs » devient un cas particulier (famille de scénarios
`topology.datacenters`) derrière un adaptateur de compatibilité.
