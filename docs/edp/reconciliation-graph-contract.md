# Contrat du Graphe de Réconciliation : Modèle (Hub) × Instances (Projet)

> **Référence** : Issue #414 · S'appuie sur #413 (généralisation de l'hydratation), #388, #380 (provenance du verdict) et ADR-017.
> **Schéma JSON formel** : [`src/lib/schemas/reconciliation-graph.schema.json`](../../src/lib/schemas/reconciliation-graph.schema.json).

---

## 1. Principe directeur

Le graphe de réconciliation multi-objets sépare strictement **doctrine d'entreprise** et **instanciation projet** :

| Responsabilité | Porteur | Contenu | Pureté d'intention |
|---|---|---|---|
| **Modèle** (`reconciliation_model`) | **Hub d'ontologie** (feuille d'ontologie dans `hydration_template.reconciliation_model` + `projections` + `oracle_rules`) | Classes d'objets attendues (`required_classes`), relations référentielles exigées (`required_relations`), exigence de pivot (`require_pivot`), standards normatifs (`standards_applied`), paramètres de règles (`projections`). | **Aucun identifiant concret** (pas d'organisation, de nœud, d'IP, de CIDR ni de VLAN). |
| **Instances** (`reconciliationInstances`) | **Projet** (donnée LLD du projet via `lldOverrides.reconciliationInstances`, ou lecture live depuis Nautobot selon ADR-017) | Identifiants concrets des 7 classes d'objets, `pivot_tenant_id`, sous-réseaux, VLANs, extrémités, bonds de médiation, contrats SLA. | Valeurs d'instanciation confinées au LLD du projet. |

### Composition
```text
Modèle (feuilles d'ontologie liées) × Instances (projet)  ──►  ReconciliationObjectGraph
```
- **Compatibilité ascendante** : si aucune instance projet (`overrides.instances`) n'est fournie, `composeReconciliationGraph()` continue d'accepter le fragment historique `hydration_template.reconciliation_graph` présent dans les fixtures de test.
- **Priorité projet** : dès que le projet fournit `reconciliationInstances`, ce jeu d'instances est validé contre le modèle fusionné des feuilles liées et compose le graphe final (les standards normatifs du modèle et du projet sont fusionnés sans doublon ; `sources` trace à la fois les URN des feuilles modèles et la provenance projet).

---

## 2. Les 7 classes d'objets du graphe

| Classe (`ReconciliationClassKey`) | Rôle générique | Références vérifiées par défaut |
|---|---|---|
| `partner_organizations` | Organisations partenaires / tenants | `id` unique ; cible de `pivot_tenant_id` et `tenant_ref` |
| `external_shadow_nodes` | Nœuds externes hors périmètre géré | `tenant_ref` → `partner_organizations` |
| `internal_mediation_nodes` | Nœuds internes de terminaison, médiation ou cœur | `tenant_ref` → `partner_organizations`, `peer_shadow_ref` → `external_shadow_nodes`, `upstream_secgw_ref` / `allowed_upstream_ref` → `internal_mediation_nodes` |
| `ip_underlay_links` | Liens IP sous-jacents / circuits | `tenant_ref` → `partner_organizations`, `endpoint_a` / `endpoint_z` → nœuds (externes ou internes) |
| `ipsec_tunnels` | Tunnels chiffrés d'interconnexion | `tenant_ref` → `partner_organizations`, `underlay_link_ref` → `ip_underlay_links`, `termination_a` / `termination_z` → nœuds |
| `service_mediation_flows` | Flux applicatifs médiés | `tenant_ref` → `partner_organizations`, `source_shadow_ref` / `destination_core_ref` → nœuds, `ipsec_tunnel_ref` → `ipsec_tunnels`, `mandatory_mediation_hops[]` → `internal_mediation_nodes` |
| `sla_and_monitoring_contracts` | Contrats SLA et sondes de supervision | `tenant_ref` → `partner_organizations`, `covered_flow_ref` → `service_mediation_flows`, `covered_tunnel_ref` → `ipsec_tunnels`, `monitored_targets[]` → objets du graphe |

---

## 3. Validation d'intégrité (`validateReconciliationInstances`)

Avant toute composition depuis une source projet, `validateReconciliationInstances(instances, model)` vérifie :

1. **Identifiants obligatoires et uniques** :
   - Chaque objet de chaque classe possède un champ `id` non vide (`missing_id`).
   - Aucun doublon d'`id` au sein d'une même classe (`duplicate_id`).
   - Aucun doublon d'`id` entre `external_shadow_nodes` et `internal_mediation_nodes` (`duplicate_id`).
2. **Complétude du modèle** :
   - Chaque classe listée dans `model.required_classes` contient au moins une instance (`missing_required_class`).
3. **Tenant pivot** :
   - Lorsque `require_pivot` est vrai (comportement par défaut dès qu'un modèle ou au moins un objet existe), `pivot_tenant_id` doit être non vide (`missing_pivot`) et exister dans `partner_organizations` (`unresolved_pivot`).
4. **Intégrité référentielle** :
   - Toutes les références natives du tableau ci-dessus, ainsi que toute règle supplémentaire déclarée dans `model.required_relations` (y compris `required: true`), doivent pointer vers un objet existant dans les classes cibles (`missing_required_ref`, `unresolved_ref`).

Toute anomalie rejette la composition en levant `ReconciliationIntegrityError` avec la liste détaillée des `issues` et un message explicite.

---

## 4. Garde anti-vacuité (`insufficient_input`)

Si une feuille d'ontologie liée exige un graphe de réconciliation — soit parce qu'elle déclare `hydration_template.reconciliation_model`, soit parce qu'elle référence des `oracle_rules` qui itèrent sur `input.reconciliation_graph` (`deny_weak_wan_cipher`, `deny_unmediated_s6a_direct_flow`, `deny_unreconciled_partner_objects`) — et qu'aucune instance projet (ni fragment de test) n'est fournie :

- `evaluateMultiAxisOracle()` retourne **`verdict: "insufficient_input"`** accompagné de `insufficientInputReasons`, **jamais `"compliant"`**.
- Le même garde-fou est appliqué directement dans `edp/policies/multi_axis_refinement.rego` (`insufficient_inputs`) lorsque les projections de l'Axe 6 sont chargées sur un graphe vide.
- Le verdict `"insufficient_input"` bloque le scellement `architecture.lock` (`decisionSlotRegistry.ts`) ainsi que l'export GitOps (`sylvaGitopsExport.ts`).

---

## 5. Exemple complet (domaine Santé / HDS — hors télécom)

Cet exemple illustre une interconnexion chiffrée entre un centre hospitalier et un laboratoire d'imagerie partenaire (échange DICOM/HL7 sous contrainte HDS).

### 5.1. Feuille d'ontologie côté Hub (modèle pur, zéro identifiant concret)

```json
{
  "urn": "urn:archinex:ontology:health:interco:hds_partner_exchange",
  "revision": 1,
  "kind": "leaf",
  "title": "Interconnexion partenaire HDS chiffrée et médiée",
  "domain": "security",
  "oracle_rules": [
    "data.archinex.edp.multiaxis.deny_weak_wan_cipher",
    "data.archinex.edp.multiaxis.deny_unreconciled_partner_objects"
  ],
  "hydration_template": {
    "reconciliation_model": {
      "required_classes": [
        "partner_organizations",
        "external_shadow_nodes",
        "internal_mediation_nodes",
        "ip_underlay_links",
        "ipsec_tunnels",
        "service_mediation_flows",
        "sla_and_monitoring_contracts"
      ],
      "require_pivot": true,
      "standards_applied": [
        "Référentiel HDS (Hébergement de Données de Santé)",
        "IHE XDS / DICOM TLS-IPsec Inter-Établissements"
      ],
      "required_relations": [
        {
          "from_class": "service_mediation_flows",
          "field": "mandatory_mediation_hops",
          "target_classes": ["internal_mediation_nodes"],
          "required": true,
          "is_array": true
        },
        {
          "from_class": "sla_and_monitoring_contracts",
          "field": "covered_flow_ref",
          "target_classes": ["service_mediation_flows"],
          "required": true
        }
      ]
    }
  },
  "projections": {
    "cipher_suite": "AES-256-GCM",
    "require_partner_sla_reconciliation": true
  }
}
```

### 5.2. Instances fournies par le projet (LLD projet : `lldOverrides.reconciliationInstances`)

```json
{
  "source": "project:chu-imagerie-hds",
  "pivot_tenant_id": "org-labo-radiologie-nord",
  "partner_organizations": [
    {
      "id": "org-labo-radiologie-nord",
      "name": "Laboratoire d'Imagerie Médicale du Nord",
      "noc_contact": "astreinte-si@labo-nord.example.org"
    }
  ],
  "external_shadow_nodes": [
    {
      "id": "ext-pacs-labo-01",
      "tenant_ref": "org-labo-radiologie-nord",
      "zone": "ZONE-PARTENAIRE-IMAGERIE"
    }
  ],
  "internal_mediation_nodes": [
    {
      "id": "gw-hds-dmz-01",
      "role": "Passerelle VPN HDS DMZ",
      "zone": "ZONE-DMZ-HDS",
      "tenant_ref": "org-labo-radiologie-nord",
      "peer_shadow_ref": "ext-pacs-labo-01"
    },
    {
      "id": "broker-hl7-01",
      "role": "Médiateur applicatif HL7/DICOM avec pseudonymisation",
      "zone": "ZONE-MEDIATION-SANTE",
      "tenant_ref": "org-labo-radiologie-nord",
      "allowed_upstream_ref": "gw-hds-dmz-01"
    },
    {
      "id": "pacs-core-chu-01",
      "role": "Archiveur PACS central du CHU",
      "zone": "ZONE-COEUR-HDS",
      "allowed_upstream_ref": "broker-hl7-01"
    }
  ],
  "ip_underlay_links": [
    {
      "id": "link-wan-hds-labo-01",
      "tenant_ref": "org-labo-radiologie-nord",
      "endpoint_a": "ext-pacs-labo-01",
      "endpoint_z": "gw-hds-dmz-01",
      "subnet": "198.51.100.4/30",
      "vlan_id": 3102
    }
  ],
  "ipsec_tunnels": [
    {
      "id": "tun-hds-labo-01",
      "tenant_ref": "org-labo-radiologie-nord",
      "underlay_link_ref": "link-wan-hds-labo-01",
      "termination_a": "ext-pacs-labo-01",
      "termination_z": "gw-hds-dmz-01",
      "cipher_suite": "AES-256-GCM",
      "pfs_dh_group": "DH-20-ECP384"
    }
  ],
  "service_mediation_flows": [
    {
      "id": "flow-dicom-labo-to-chu",
      "tenant_ref": "org-labo-radiologie-nord",
      "source_shadow_ref": "ext-pacs-labo-01",
      "ipsec_tunnel_ref": "tun-hds-labo-01",
      "mandatory_mediation_hops": ["gw-hds-dmz-01", "broker-hl7-01"],
      "destination_core_ref": "pacs-core-chu-01",
      "direct_bypass_allowed": false
    }
  ],
  "sla_and_monitoring_contracts": [
    {
      "id": "sla-hds-imagerie-01",
      "tenant_ref": "org-labo-radiologie-nord",
      "covered_flow_ref": "flow-dicom-labo-to-chu",
      "covered_tunnel_ref": "tun-hds-labo-01",
      "monitored_targets": ["link-wan-hds-labo-01", "tun-hds-labo-01", "broker-hl7-01"]
    }
  ]
}
```
