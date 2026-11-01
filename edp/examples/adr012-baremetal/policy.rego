# METADATA
# title: Oracle Rego ADR-012 — Substrat Bare-Metal Kubernetes Telco Cloud
# description: Vérification de conformité des manifestes K8s (Sylva) et équipements Nautobot Planned.

package archinex.edp.adr012

import rego.v1
import data.archinex.edp.common

# ==============================================================================
# BLOC D'ONTOLOGIE ISOLÉ (Substituable par data.ontology via #181)
# ==============================================================================
default ontology_allowed_roles := ["control-plane", "worker"]
default ontology_required_status := "planned"

edp_id := "EDP-ADR012-01"

# 1. Règle : Interface OOB requise sur tout équipement baremetal
deny_missing_oob contains "rule_oob_required" if {
	some dev in input.sources.nautobot_planned_devices.content
	not common.has_field(dev, "oob_ip")
}

deny_missing_oob contains "rule_oob_required" if {
	some dev in input.sources.nautobot_planned_devices.content
	common.has_field(dev, "oob_ip")
	dev.oob_ip == ""
}

# 2. Règle : Correspondance exacte de l'hôte BMC (pas de sous-chaîne)
deny_bmc_mismatch contains "rule_bmc_exact_match" if {
	some bmh in input.sources.k8s_manifests.content
	bmh.kind == "BareMetalHost"
	some dev in input.sources.nautobot_planned_devices.content
	dev.name == bmh.metadata.name
	common.has_field(bmh.spec, "bmc")
	common.has_field(bmh.spec.bmc, "address")
	bmc_host := common.host_of(bmh.spec.bmc.address)
	bmc_host != dev.oob_ip
}

# 3. Règle : Rôle valide de la machine baremetal
deny_invalid_role contains "rule_role_valid" if {
	some bmh in input.sources.k8s_manifests.content
	bmh.kind == "BareMetalHost"
	common.has_field(bmh.spec, "role")
	not bmh.spec.role in ontology_allowed_roles
}

deny_invalid_role contains "rule_role_valid" if {
	some bmh in input.sources.k8s_manifests.content
	bmh.kind == "BareMetalHost"
	not common.has_field(bmh.spec, "role")
}

# 4. Règle : Partitionnement des interfaces réseau (au moins 2 interfaces)
deny_missing_partitioning contains "rule_partitioned_interfaces" if {
	some dev in input.sources.nautobot_planned_devices.content
	not common.has_field(dev, "interfaces")
}

deny_missing_partitioning contains "rule_partitioned_interfaces" if {
	some dev in input.sources.nautobot_planned_devices.content
	common.has_field(dev, "interfaces")
	count(dev.interfaces) < 2
}

# 5. Règle : Spécification Cluster non vide (reproduction du cas PoC spec: {})
deny_empty_spec contains "rule_cluster_spec_non_empty" if {
	some manifest in input.sources.k8s_manifests.content
	manifest.kind == "Cluster"
	not common.has_field(manifest, "spec")
}

deny_empty_spec contains "rule_cluster_spec_non_empty" if {
	some manifest in input.sources.k8s_manifests.content
	manifest.kind == "Cluster"
	common.has_field(manifest, "spec")
	count(manifest.spec) == 0
}

# 6. Règle : Statut d'équipement planifié dans Nautobot
deny_invalid_status contains "rule_planned_status" if {
	some dev in input.sources.nautobot_planned_devices.content
	dev.status != ontology_required_status
}

# Agrégation des violations
all_violations := array.concat(
	array.concat(
		array.concat(
			array.concat(
				array.concat(
					[v | some v in deny_missing_oob],
					[v | some v in deny_bmc_mismatch]
				),
				[v | some v in deny_invalid_role]
			),
			[v | some v in deny_missing_partitioning]
		),
		[v | some v in deny_empty_spec]
	),
	[v | some v in deny_invalid_status]
)

# Contrôle des sources requises (contrat anti-vacuité)
missing := common.missing_inputs(input.sources, ["k8s_manifests", "nautobot_planned_devices"])

# Statut standard EDP
status := common.build_status(edp_id, true, all_violations, missing)
