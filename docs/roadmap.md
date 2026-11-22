# Feuille de Route (Roadmap) — Archinex

> **Évolution d'Archinex : de la délibération et de la pré-hydratation SSoT vers la réconciliation bidirectionnelle en boucle fermée.**
> Pour la vue d'ensemble du système, voir [`ARCHITECTURE.md`](../ARCHITECTURE.md) ; pour le modèle de parcours unifié, voir [`docs/concepts.md`](concepts.md).

---

## 1. Orientation Révisée (Prime sur les Horizons Historiques)

Décision formalisée dans l'[ADR-017](adr/ADR-017-nautobot-point-unique-reconciliation.md) (statut : proposé).

1. **Nautobot est l'unique point de réconciliation bidirectionnel d'Archinex.** Archinex crée les objets au statut *Planned* et ne parle à aucun outil d'implémentation. Les connecteurs vers les systèmes réels (GitOps Sylva, DNS/DDI, Vault/PKI, IdP, Batfish, supply chain, ITSM) sont **derrière Nautobot** : ils lisent ses objets, agissent, puis y écrivent leur statut et leur preuve. Archinex lit cet état ; il ne force jamais un statut « réalisé » (épique #372, #398, #399).
2. **Archinex se concentre sur la délibération, la complétude de la couverture des exigences et la justification visuelle** (épique #400).
3. **Ordre de réalisation** : sécurité et intégrité (P0) → fiabilité de la décision (#373) → tranche minimale de réconciliation Nautobot puis cadre des connecteurs (#372) → couverture et visuels (#400) → généralisation (#374, prérequis du push générique).
4. **Gel** : aucun nouvel appel d'écriture d'Archinex vers un outil d'implémentation, et aucun nouveau connecteur direct, tant que la tranche minimale (Tenant ; Device + statut ; Prefix/VLAN/IP) n'est pas en production sur un projet réel.
5. Les adaptateurs existants (`src/lib/server/edp/adapters/`) ne sont pas câblés dans l'application ; leur relocalisation est suivie dans #411.

Les horizons 1 à 3 ci-dessous décrivent l'intention d'origine : les éléments qui parlent directement à un outil (export GitOps vers une forge, Batfish, Prometheus, Nephio) sont **à re-cadrer derrière Nautobot** et **gelés** jusqu'à la clôture de la tranche minimale.

---

## 2. Horizon 1 — Court Terme (Implémenté — Épique #241) : GitOps Sylva Natif & Détection de Dérive Nautobot

1. **Export GitOps Direct vers un Dépôt `sylva-core` (`workload-clusters/`) — #238 (`src/lib/server/edp/sylvaGitopsExport.ts`)** :
   - Permet depuis la Phase 4 (`action: 'export_sylva_gitops'`) de sérialiser le fichier `workload-clusters/<cluster-name>/values.yaml` (assaini de tout secret via `sanitizeManifests()`) et d'ouvrir une Merge Request (GitLab API v4) ou Pull Request (GitHub REST API) vers un dépôt `sylva-core`. L'export est bloqué (`HTTP 409`) si le verdict de l'Oracle OPA est `violated`. *(À déplacer derrière Nautobot dans #381 conformément à l'[ADR-017](adr/ADR-017-nautobot-point-unique-reconciliation.md)).*
2. **Collecte Temps Réel (Pull / Webhook) & Détection de Dérive Persistée (`DriftFinding`) depuis Nautobot 2.x — #239 / #377 (`pullLiveInventoryFromNautobot`, `src/lib/server/edp/driftService.ts` & `POST /api/webhooks/nautobot`)** :
   - Compare l'**intention figée** de l'EDP (`hydratedInventory` + `intent_hash`) à l'état observé dans Nautobot **sans jamais muter l'EDP d'origine** (`executable_decision_packages`).
   - Les écarts sont typés et persistés dans `drift_findings` (`DriftFinding` : `missing`, `unexpected`, `attribute_mismatch`, `status_regression`, dédupliqués par empreinte `(projectId, fingerprint)`), et les objets dépourvus de marquage `archinex_*` sont enregistrés comme écarts **« hors décision »** (`outOfDecision: true`), jamais ignorés.
   - Le webhook `POST /api/webhooks/nautobot` exige une **signature HMAC par projet** (`X-Hook-Signature` / `X-Archinex-Signature`, pré-filtrée dans `src/hooks.server.ts`, échec fermé 401), rattache le sujet/décision exclusivement par les marqueurs `archinex_*` de l'objet Nautobot, garantit l'**idempotence** par identifiant d'événement (`webhook_event_receipts`), répond en `202 Accepted` avec évaluation oracle asynchrone stockée dans `edp_oracle_verdicts`, et remonte explicitement toute erreur de persistance.
3. **Modélisation Native des Tunnels IPsec dans le Module VPN de Nautobot 2.2+ — #240 (`src/lib/server/edp/nautobotSync.ts`)** :
   - Instancie de manière idempotente via `/api/vpn/` les objets `vpn.IKEProposal`, `vpn.IPSecProposal`, `vpn.VPNProfile` et `vpn.VPNTunnel`. *(Conservé et gelé hors tranche minimale selon [ADR-017](adr/ADR-017-nautobot-point-unique-reconciliation.md)).*

---

## 3. Horizon 2 — Moyen Terme (Gelé / À Re-cadrer Derrière Nautobot) : Workloads CNF Multi-DC & Preuve Formelle Batfish

4. **Compilation GitOps des Workloads CNF 3GPP & CNI Secondaires (`workloads/cnfs/base` & `overlays/dc1`, `overlays/dc2`)** :
   - Génération des CRD `NetworkAttachmentDefinition` (`k8s.cni.cncf.io`) et patches Kustomize / `values.yaml` des pods CNF à partir des objets IPAM/VLAN alloués dans Nautobot, consommés par un connecteur GitOps derrière Nautobot.
5. **Preuve Formelle du Plan de Routage & Filtrage par Couplage Batfish → Write-Back Nautobot** :
   - Vérification symbolique d'inaccessibilité directe (*Reachability Query*) et de transit obligatoire (*Service Chaining / Waypointing Invariant*) via un connecteur Batfish derrière Nautobot, remontant son verdict par write-back.

---

## 4. Horizon 3 — Long Terme (Gelé / À Re-cadrer Derrière Nautobot) : Boucle Observabilité & Ouverture Edge à Grande Échelle

6. **Génération des Règles Prometheus `PrometheusRule` & Alertmanager** :
   - Compilation des contrats `sla_and_monitoring_contracts` en règles d'alerte SLO par `tenant_ref` et d'inhibition pour les nœuds intermittents.
7. **Rétroaction Continue Observabilité → Statut Épistémique de la Décision** :
   - En cas de violation répétée d'un SLO ou de dérive persistante détectée en production sur un axe ontologique, marquage automatique de l'EDP comme `stale` (Invariant VI) et notification de l'architecte responsable dans le fil de délibération.
8. **Ouverture Optionnelle vers Nephio (`PackageVariantSet` / Porch) pour Flotte Edge Hétérogène ($N \ge 50\text{–}1000$ sites)** :
   - Superflu sur un cœur 2-DC ou 3-DC homogène (où FluxCD/Kustomize + Sylva suffisent) ; pertinent uniquement si le périmètre s'étend à une flotte massive de sites Edge/Far-Edge hétérogènes nécessitant un *fan-out* dynamique piloté par l'inventaire Nautobot.
