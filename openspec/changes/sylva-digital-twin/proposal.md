# Proposition : Jumeau numérique de Sylva branché à l'hydratation (#292)

## 1. Problème : le what-if actuel est un compteur, pas un modèle

`simulateWhatIfDatacenters` ([`refResolver.ts`](../../../src/lib/domain/edp/refResolver.ts)) et `summarizeWhatIfComparison`
([`logicalViews.ts`](../../../src/lib/domain/edp/logicalViews.ts)) répondaient uniquement à « combien d'instances, de NICs, d'hôtes ? »
(`estimatedBareMetalHosts = dcs.length * 2`) et dessinaient un Mermaid. Ils ne répondaient à **aucune** des questions qui
justifient réellement un choix **3 DCs (défaut)** vs **2 DCs + Témoin** vs **2 DCs secs** :

| Question de l'architecte | Réponse initiale | Ce que fournit le Jumeau Sylva (#292, #293) |
|---|---|---|
| Le control-plane RKE2 (`etcd`, 3 membres) survit-il à la perte d'un DC ? | aucune | calcul de quorum par domaine de défaillance (`1+1+1` sur 3 DCs vs `1+1+1(arbiter)` sur 2 DCs + Témoin vs `2+1` sur 2 DCs secs) |
| Les réplicas de stockage (Longhorn/Ceph, `RF=3`) restent-ils disponibles et écrivables ? | aucune | placement par domaine de défaillance + quorum d'écriture des réplicas |
| Les charges (UPF/5G, SR-IOV VFs, Hugepages 1Gi, CPU/RAM) rentrent-elles sur les hôtes survivants après panne ? | aucune | bin-packing de capacité par pool Sylva (`sylva-cnf-sriov-dpdk`, `sylva-general-compute`) sous panne |
| Les contrôleurs BMC Redfish (`capm3` Metal3) répondent-ils et sont-ils appariés à Nautobot ? | chaîne d'URL statique | génération déterministe d'un bouchon Redfish `sushy-tools` (`sushy-emulator`) + simulation de panne OOB/PDU |
| Les flux de médiation (`secgw` → `dea`) restent-ils joignables si un DC ou un lien tombe ? | aucune | vérification de continuité des chemins de médiation par domaine |
| Comment arbitrer quand la résilience est à proposer par l'équipe vs imposée par le client ? | un tableau de 4 compteurs | double mode **Exploration/Proposition** (matrice Bronze / Silver / Gold) et **Conformité Client** (verdict OPA + détection d'exigences contradictoires) |

## 2. Vision & Décisions Architecturales Actées (#292)

Un **jumeau numérique pré-déploiement** de Sylva (ciblant **Sylva `LATEST`**) :
1. **Topologie de référence (Baseline = 3 DCs par défaut)** :
   - **Gold (`3dc-active` — défaut)** : 3 Datacenters (`dc1`, `dc2`, `dc3`), control-plane RKE2 `1+1+1`, stockage `RF=3` (1 réplica par DC), management cluster étiré sur 3 DCs. Survit sans coupure (`RTO ≈ 0`) à la perte complète de n'importe quel DC.
   - **Silver (`2dc-witness` — 2 DCs + Site Témoin / Arbiter)** : 2 Datacenters porteurs de charges (`dc1`, `dc2`) + 1 site témoin léger (`dc3-witness`) hébergeant uniquement le 3e membre de quorum `etcd` et l'arbitre stockage. Maintient le quorum automatique si `dc1` ou `dc2` tombe, avec coût matériel réduit.
   - **Bronze (`2dc-split` — 2 DCs secs sans témoin)** : répartition asymétrique `2+1` du control-plane sur `dc1` et `dc2`. Si `dc1` (porteur de 2 membres sur 3) tombe, le quorum `etcd` est perdu (1/3 < 2/3) et nécessite une intervention manuelle (`etcd --force-new-cluster`, `RTO > 0`).
2. **Double mode d'arbitrage (Proposition d'équipe vs Fixé par le client)** :
   - **Mode Proposition (`proposal`)** : lorsque c'est à l'équipe d'architecture de formuler une recommandation, le jumeau exécute la matrice complète (`3 DCs`, `2 DCs + Témoin`, `2 DCs secs`) face aux pannes (`dc_loss`, `host_loss`, `power_feed_loss`, `link_partition`) et calcule la recommandation optimale selon l'objectif de résilience.
   - **Mode Conformité Client (`client-mandated`)** : lorsque le client impose ses contraintes (ex. nombre de DCs plafonné ou cible `RTO = 0` sur perte de site), le jumeau vérifie si la topologie exigée tient sous panne et alimente l'oracle OPA (`edp/policies/twin_resilience.rego`) pour prouver formellement la conformité ou documenter une réserve technique si les exigences client sont mathématiquement incompatibles.
3. **Outillage CI & Bouchonnage Bare-Metal (`helm`, `kwok`, `sushy-tools`)** :
   - `helm template` (T0), le moteur analytique TS (T1), `kwok` (T2 scheduler K8s sans kubelet) et `sushy-emulator` en mode *fake driver in-memory* (bouchon Redfish BMC généré depuis `nautobot_planned_devices` pour respecter la règle d'or Sylva n°2 `infra_provider: capm3`) sont exécutables en CI.

## 3. Hors périmètre (explicite)

- Pas de simulation de performance du plan de données (débit paquet DPDK/SR-IOV, latence radio 5G) : modélisé comme **contrainte de capacité et d'affinité matérielle** uniquement.
- Pas de remplacement de Nautobot (SSoT) ni de Flux/Sylva : le jumeau les **lit**, il n'y écrit jamais.
- Pas de contournement des Invariants II/III : un `twin_report` n'est jamais `validated` sans validateur humain.

## 4. Impact sur les Invariants d'Archinex

| Invariant | Impact |
|---|---|
| I (5 facettes) | `twin_report` porte contenu, justification (`subjectId`, scénarios, mode `proposal` ou `client-mandated`), autorité (`computed`), maturité, révisabilité (hash du modèle) |
| II (`verified × llm-derived` interdit) | le jumeau est 100 % déterministe et sans LLM ; un LLM peut *proposer* des scénarios, jamais calculer les verdicts |
| III (silence ≠ approbation) | scénario requis non exécuté ⇒ `insufficient_input`, jamais `compliant` |
| VI (rétractation) | tout changement du modèle (hash) ou de version Sylva rend les `twin_report` antérieurs `stale` |
