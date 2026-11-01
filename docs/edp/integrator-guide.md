# Guide Intégrateur : Exécution Hors Ligne d'un Paquet de Décision Exécutable (`edp verify`)

Ce guide s'adresse aux intégrateurs, équipes d'ingénierie et sous-traitants implémentant les architectures régies par Archinex. Il détaille comment vérifier la conformité d'artefacts d'ingénierie (manifestes Kubernetes, exports Nautobot, configurations réseau) de manière autonome, souveraine, reproductible et en environnement hermétique (air-gapped), sans connexion au Knowledge Hub ni appel à un LLM.

---

## 1. Prérequis et Installation d'OPA (Vérifié par Somme de Contrôle)

Le moteur d'évaluation des oracles d'Archinex repose sur l'Open Policy Agent (OPA) officiel, fixé en version déterministe compatible Rego v1.

### 1.1 Téléchargement et Contrôle d'Intégrité SHA-256

#### Sous Linux / macOS :
```bash
# Téléchargement de la version fixée v1.21.4
curl -L -o opa https://openpolicyagent.org/downloads/v1.21.4/opa_linux_amd64

# Contrôle cryptographique strict (SHA-256 requis : 8a75a7c29e7c10b72c7247fa93c2069b76db2e91244585c54d39f4ad59a93077)
echo "8a75a7c29e7c10b72c7247fa93c2069b76db2e91244585c54d39f4ad59a93077  opa" | sha256sum -c -

chmod +x opa
sudo mv opa /usr/local/bin/opa
```

#### Sous Windows :
```powershell
# Exécution du script automatisé embarqué dans Archinex :
.\scripts\install-opa.ps1
```
Le binaire est installé dans `tools/bin/opa.exe` avec vérification de son empreinte SHA-256 (`efad1c0ee4e3150d213f7babdaff3440b18b93c7368b465fca42cda392947f7c`).

---

## 2. Structure d'un Paquet EDP et Préparation des Entrées

Un paquet de décision exécutable est livré avec :
1. `edp.json` : Le descripteur formel de la décision (conforme à `edp.schema.json`).
2. `policy.rego` : L'oracle d'évaluation déterministe rédigé en Rego v1.
3. `policy_test.rego` : La suite d'auto-tests garantissant un score de mutation de 100 %.

### 2.2 Extraction Nautobot DCIM et Manifestes Sylva CAPI
Pour les architectures télécoms basées sur Sylva et Nautobot :
1. **Extraction Nautobot Planned** : Utilisez la requête GraphQL embarquée dans `src/lib/server/edp/adapters/nautobot_planned_extract.graphql` pour extraire les équipements au statut `planned` avec leurs interfaces BMC Redfish.
2. **Génération Sylva CAPI** : Utilisez les valeurs de référence `tests/fixtures/edp/sylva/sylva_values_candidate.yaml` avec `helm template my-cluster sylva/sylva-capi-cluster -f sylva_values_candidate.yaml` pour produire les manifestes de contrôle (BareMetalHost, Metal3Cluster, RKE2ControlPlane).

### 2.1 Format de l'Entrée de Raffinement (`refined_input`)
Pour vérifier vos artefacts, emballez-les dans un fichier JSON conforme à `refined_input.schema.json` :

```json
{
  "sources": {
    "k8s_manifests": {
      "provenance": {
        "tool": "helm",
        "version": "v3.14.0",
        "command": "helm template my-cluster sylva/sylva-core",
        "sha256": "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
        "generated_at": "2026-10-29T10:00:00Z"
      },
      "content": [
        {
          "apiVersion": "metal3.io/v1alpha1",
          "kind": "BareMetalHost",
          "metadata": { "name": "worker-01" },
          "spec": {
            "bmc": { "address": "redfish-virtualmedia://192.0.2.10/redfish/v1/Systems/1" },
            "role": "worker"
          }
        }
      ]
    }
  }
}
```

> [!IMPORTANT]
> **Règle de Non-Vacuité (Invariant I & IV)** :
> Aucune règle d'architecture n'est évaluée si les sources requises sont absentes ou vides. Vous ne pouvez pas obtenir un verdict conforme par simple omission de fichiers.

---

## 3. Exécution de la Commande `edp verify`

Lancez la commande de vérification depuis votre terminal ou dans votre pipeline CI/CD :

```bash
# Vérification d'un paquet à partir de vos fichiers locaux :
npx tsx scripts/edp-verify.ts \
  --edp edp/examples/adr012-baremetal/edp.json \
  --input mon-input-raffinee.json \
  --output lot-de-preuves.json
```

---

## 4. Codes de Sortie et Vocabulaire du Verdict

La commande `edp verify` retourne des codes de sortie déterministes :

| Code de Sortie | Verdict | Signification Opérationnelle |
| :---: | :---: | :--- |
| **0** | `compliant` | **Succès** : Tous les artefacts fournis satisfont intégralement les règles architecturales formelles. |
| **1** | `violated` | **Rejet** : Au moins une règle de décision a été enfreinte (les violations sont listées dans la sortie). |
| **2** | `insufficient_input` ou `not_applicable` | **Incomplet** : Une source requise manque, un champ essentiel est indéfini ou la décision ne concerne pas ces composants. |
| **3** | `unavailable` / Erreur | **Erreur système** : Binaire OPA introuvable, schéma corrompu ou crash d'exécution. |

---

## 5. Le Lot de Preuves Scellé (`EvidenceBundle`)

En cas de succès ou d'échec, un lot de preuves cryptographique est généré :
```json
{
  "edp_id": "EDP-ADR012-01",
  "revision": 1,
  "policy_sha256": "78892f4c2ebfcbc59aba3803b54687429295455bccff7df203306dd461826046",
  "ontology_fingerprint": "a3b890...4f",
  "input_sha256": "81f32a...e0",
  "opa_version": "1.21.4",
  "verdict": "compliant",
  "violations": [],
  "verified_at": "2026-10-29T10:15:30Z",
  "duration_ms": 78
}
```
Ce lot de preuves peut être archivé comme attestation d'audit pour les revues de passage de jalon (Gate G3).

---

## 6. Ce qu'un Vert Ne Prouve Pas (Transparence Méthodologique)

> [!CAUTION]
> **Limites Intrinsèques de la Vérification d'Architecture :**
> Un verdict `compliant` avec un code de sortie 0 constitue une garantie formelle **sur les données fournies**, mais ne saurait se substituer à une qualification d'exécution en environnement de production réel.

1. **Représentativité des Artefacts** :
   Si vos manifestes générés par Helm n'incluent pas les profils finaux instanciés sur le site ou si les variables de surcharge GitOps ne sont pas rendues, le test est aveugle aux dérives ultérieures.
2. **Champs Non Modélisés** :
   L'oracle OPA ne vérifie que les contraintes explicitement formulées dans la décision. Une absence de violation n'implique pas l'absence d'autres vulnérabilités réseau ou d'incompatibilités physiques.
3. **Immuabilité Postérieure** :
   Le lot de preuves scelle l'état des artefacts au moment de l'exécution ($T_0$). Si une intervention manuelle ou un script d'ajustement modifie l'environnement après le déploiement sans repasser par le pipeline, la preuve devient caduque.
