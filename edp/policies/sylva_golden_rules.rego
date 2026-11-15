# METADATA
# title: Règles d'Or d'Enforcement Sylva Telco Cloud (15 Invariants de Production)
# description: Évalue la conformité d'un descripteur SylvaWorkloadCluster ou des valeurs d'hydratation face aux standards d'architecture Cloud-Native Telco de Sylva.

package archinex.edp.sylva

import rego.v1

# Normalisation du spec et des metadata selon la racine reçue
default target_spec := {}
target_spec := input.spec if {
	input.spec != null
}

target_spec := input.sylva_workload_cluster_values.spec if {
	input.spec == null
	input.sylva_workload_cluster_values.spec != null
}

default target_metadata := {}
target_metadata := input.metadata if {
	input.metadata != null
}

target_metadata := input.sylva_workload_cluster_values.metadata if {
	input.metadata == null
	input.sylva_workload_cluster_values.metadata != null
}

# Helpers d'accès tolérants (supportent la structure CRD SylvaWorkloadCluster ET les Helm values sylva-units)
unit_in_units_is_false(name) if {
	object.get(object.get(target_spec, "units", {}), name, {}).enabled == false
}

unit_in_enabled_units_is_false(name) if {
	object.get(object.get(target_spec, "enabledUnits", {}), name, false) == false
}

is_unit_active(name) if {
	not unit_in_units_is_false(name)
	not unit_in_enabled_units_is_false(name)
	object.get(object.get(target_spec, "units", {}), name, {}).enabled == true
}

is_unit_active(name) if {
	not unit_in_units_is_false(name)
	not unit_in_enabled_units_is_false(name)
	object.get(object.get(target_spec, "enabledUnits", {}), name, false) == true
}

get_infra_provider := infra if {
	raw := object.get(object.get(target_spec, "capi_providers", {}), "infra_provider", "")
	raw != ""
	infra := raw
} else := infra if {
	raw := object.get(target_spec, "infrastructure", "")
	raw == "metal3"
	infra := "capm3"
} else := infra if {
	infra := object.get(target_spec, "infrastructure", "")
}

get_bootstrap_provider := b if {
	raw := object.get(object.get(target_spec, "capi_providers", {}), "bootstrap_provider", "")
	raw != ""
	b := raw
} else := b if {
	raw := object.get(object.get(target_spec, "controlPlane", {}), "provider", "")
	raw == "rke2"
	b := "cabpr"
} else := b if {
	b := object.get(object.get(target_spec, "controlPlane", {}), "provider", "")
}

# ==============================================================================
# RÈGLE 1 : CNI CILIUM MANDATAIRE
# ==============================================================================
violations contains v if {
	not is_unit_active("cilium")
	v := {
		"rule": "sylva_rule_01_cni_cilium_mandatory",
		"category": "networking",
		"message": "Le CNI Cilium (spec.units.cilium.enabled ou spec.enabledUnits.cilium) est mandataire pour la conformité réseau et sécurité Sylva.",
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:cilium_mandatory",
		"violated_requirement_id": "REQ-Sylva-01",
	}
}

# ==============================================================================
# RÈGLE 2 : FOURNISSEURS CAPI CONFORMES (capm3 Baremetal + cabpr RKE2)
# ==============================================================================
violations contains v if {
	infra := get_infra_provider
	infra != "capm3"
	infra != "metal3"
	v := {
		"rule": "sylva_rule_02_capi_providers_capm3",
		"category": "infrastructure",
		"message": sprintf("Le fournisseur d'infrastructure CAPI doit être 'capm3' ou 'metal3' (reçu: '%v')", [infra]),
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:capi_providers",
		"violated_requirement_id": "REQ-Sylva-02",
	}
}

violations contains v if {
	bootstrap := get_bootstrap_provider
	bootstrap != "cabpr"
	bootstrap != "rke2"
	v := {
		"rule": "sylva_rule_02_capi_providers_cabpr",
		"category": "infrastructure",
		"message": sprintf("Le fournisseur de bootstrap CAPI doit être 'cabpr' ou 'rke2' (reçu: '%v')", [bootstrap]),
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:capi_providers",
		"violated_requirement_id": "REQ-Sylva-02",
	}
}

# ==============================================================================
# RÈGLE 3 : IMAGE OS DURCIE (SLE Micro RT / Hardened)
# ==============================================================================
violations contains v if {
	hardened := object.get(object.get(target_spec, "os_image_selector", {}), "hardened", false)
	hardened != true
	v := {
		"rule": "sylva_rule_03_os_image_hardened",
		"category": "security",
		"message": "L'image du système d'exploitation hôte (spec.os_image_selector.hardened) doit être explicitement durcie.",
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:hardened_os",
		"violated_requirement_id": "REQ-Sylva-03",
	}
}

# ==============================================================================
# RÈGLE 4 : ADMISSION CONTROLLER KYVERNO ACTIF
# ==============================================================================
violations contains v if {
	not is_unit_active("kyverno")
	v := {
		"rule": "sylva_rule_04_kyverno_admission_mandatory",
		"category": "governance",
		"message": "Le contrôleur d'admission Kyverno (spec.units.kyverno.enabled ou spec.enabledUnits.kyverno) doit être actif pour l'enforcement des politiques de sécurité.",
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:kyverno_admission",
		"violated_requirement_id": "REQ-Sylva-04",
	}
}

# ==============================================================================
# RÈGLE 5 : PILE D'OBSERVABILITÉ / MONITORING ACTIVE
# ==============================================================================
violations contains v if {
	not is_unit_active("monitoring")
	v := {
		"rule": "sylva_rule_05_monitoring_observability_mandatory",
		"category": "observability",
		"message": "L'unité de supervision telco (spec.units.monitoring.enabled ou spec.enabledUnits.monitoring) doit être activée.",
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:monitoring_observability",
		"violated_requirement_id": "REQ-Sylva-05",
	}
}

# ==============================================================================
# RÈGLE 6 : LOAD-BALANCER METALLB ACTIF
# ==============================================================================
violations contains v if {
	not is_unit_active("metallb")
	v := {
		"rule": "sylva_rule_06_metallb_loadbalancer_mandatory",
		"category": "networking",
		"message": "L'unité d'équilibrage MetalLB (spec.units.metallb.enabled ou spec.enabledUnits.metallb) doit être activée pour router les VIP de contrôle.",
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:metallb_loadbalancer",
		"violated_requirement_id": "REQ-Sylva-06",
	}
}

# ==============================================================================
# RÈGLE 7 : GESTIONNAIRE DE SECRETS VAULT MANDATAIRE POUR PROFILS NIS2 / SEC
# ==============================================================================
has_nis2_requirement if {
	some _, md in object.get(target_spec, "machine_deployments", {})
	contains(lower(object.get(object.get(md, "rke2", {}).nodeLabels, "sylva.org/dataplane", "")), "nis2")
}

has_nis2_requirement if {
	some _, bmh in object.get(target_spec, "baremetal_hosts", {})
	contains(lower(object.get(object.get(bmh, "bmh_metadata", {}).labels, "host-group", "")), "nis2")
}

violations contains v if {
	has_nis2_requirement
	not is_unit_active("vault")
	v := {
		"rule": "sylva_rule_07_vault_mandatory_for_nis2",
		"category": "security",
		"message": "Pour tout profil déployant des nœuds NIS2, l'unité HashiCorp Vault (spec.units.vault.enabled ou spec.enabledUnits.vault) est mandataire.",
		"violated_clause_urn": "urn:archinex:kb:clause:nis2:art21_crypto",
		"violated_requirement_id": "REQ-Lot1-1343",
	}
}

# ==============================================================================
# RÈGLE 8 : CNI MULTUS MANDATAIRE SI DATAPLANE SR-IOV
# ==============================================================================
has_sriov_pool if {
	some _, md in object.get(target_spec, "machine_deployments", {})
	contains(lower(object.get(object.get(md, "rke2", {}).nodeLabels, "sylva.org/dataplane", "")), "sriov")
}

violations contains v if {
	has_sriov_pool
	not is_unit_active("multus")
	v := {
		"rule": "sylva_rule_08_multus_mandatory_with_sriov",
		"category": "networking",
		"message": "Le méta-CNI Multus (spec.units.multus.enabled ou spec.enabledUnits.multus) doit être activé lorsqu'un pool de calcul utilise le dataplane SR-IOV/DPDK.",
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:multus_sriov",
		"violated_requirement_id": "REQ-Sylva-08",
	}
}

# ==============================================================================
# RÈGLE 9 : OPÉRATEURS SR-IOV ACTIFS SI DATAPLANE SR-IOV
# ==============================================================================
violations contains v if {
	has_sriov_pool
	not is_unit_active("sriov")
	v := {
		"rule": "sylva_rule_09_sriov_operators_mandatory_with_sriov",
		"category": "dataplane",
		"message": "L'opérateur 'sriov' (spec.units.sriov.enabled ou spec.enabledUnits.sriov) doit être activé en présence de pools SR-IOV.",
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:sriov_operator",
		"violated_requirement_id": "REQ-Sylva-09",
	}
}

violations contains v if {
	has_sriov_pool
	not is_unit_active("sriov-resources")
	v := {
		"rule": "sylva_rule_09_sriov_resources_mandatory_with_sriov",
		"category": "dataplane",
		"message": "L'opérateur 'sriov-resources' (spec.units['sriov-resources'].enabled ou spec.enabledUnits['sriov-resources']) doit être activé en présence de pools SR-IOV.",
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:sriov_operator",
		"violated_requirement_id": "REQ-Sylva-09",
	}
}

# ==============================================================================
# RÈGLE 10 : SÉLECTEUR DE GROUPE D'HÔTES (hostSelector.matchLabels["host-group"])
# ==============================================================================
violations contains v if {
	some md_name, md in object.get(target_spec, "machine_deployments", {})
	template := object.get(object.get(md, "machine_deployment_spec", {}), "template", {})
	host_group := object.get(object.get(object.get(template, "spec", {}), "hostSelector", {}).matchLabels, "host-group", "")
	host_group == ""
	v := {
		"rule": "sylva_rule_10_machine_deployment_host_selector",
		"category": "scheduling",
		"message": sprintf("Le MachineDeployment '%v' doit définir matchLabels['host-group'] pour le ciblage Metal3.", [md_name]),
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:host_selector_match_labels",
		"violated_requirement_id": "REQ-Sylva-10",
	}
}

# ==============================================================================
# RÈGLE 11 : LABELS RKE2 SYLVA (sylva.org/pool & sylva.org/dataplane)
# ==============================================================================
violations contains v if {
	some md_name, md in object.get(target_spec, "machine_deployments", {})
	node_labels := object.get(object.get(md, "rke2", {}), "nodeLabels", {})
	pool_label := object.get(node_labels, "sylva.org/pool", "")
	pool_label == ""
	v := {
		"rule": "sylva_rule_11_machine_deployment_node_labels_pool",
		"category": "scheduling",
		"message": sprintf("Le MachineDeployment '%v' doit comporter le nodeLabel 'sylva.org/pool'.", [md_name]),
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:node_labels_dataplane",
		"violated_requirement_id": "REQ-Sylva-11",
	}
}

violations contains v if {
	some md_name, md in object.get(target_spec, "machine_deployments", {})
	node_labels := object.get(object.get(md, "rke2", {}), "nodeLabels", {})
	dp_label := object.get(node_labels, "sylva.org/dataplane", "")
	dp_label == ""
	v := {
		"rule": "sylva_rule_11_machine_deployment_node_labels_dataplane",
		"category": "scheduling",
		"message": sprintf("Le MachineDeployment '%v' doit comporter le nodeLabel 'sylva.org/dataplane'.", [md_name]),
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:node_labels_dataplane",
		"violated_requirement_id": "REQ-Sylva-11",
	}
}

# ==============================================================================
# RÈGLE 12 : CPU MANAGER STATIQUE POUR POOLS DPDK / NUMA
# ==============================================================================
violations contains v if {
	some md_name, md in object.get(target_spec, "machine_deployments", {})
	contains(lower(object.get(object.get(md, "rke2", {}).nodeLabels, "sylva.org/dataplane", "")), "sriov")
	args := object.get(object.get(md, "rke2", {}), "kubeletExtraArgs", [])
	not "--cpu-manager-policy=static" in args
	v := {
		"rule": "sylva_rule_12_sriov_static_cpu_manager",
		"category": "dataplane",
		"message": sprintf("Le pool CNF '%v' requiert '--cpu-manager-policy=static' dans kubeletExtraArgs.", [md_name]),
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:static_cpu_manager",
		"violated_requirement_id": "REQ-Sylva-12",
	}
}

# ==============================================================================
# RÈGLE 13 : TOPOLOGY MANAGER SINGLE-NUMA POUR POOLS DPDK
# ==============================================================================
violations contains v if {
	some md_name, md in object.get(target_spec, "machine_deployments", {})
	contains(lower(object.get(object.get(md, "rke2", {}).nodeLabels, "sylva.org/dataplane", "")), "sriov")
	args := object.get(object.get(md, "rke2", {}), "kubeletExtraArgs", [])
	not "--topology-manager-policy=single-numa-node" in args
	v := {
		"rule": "sylva_rule_13_sriov_topology_manager_single_numa",
		"category": "dataplane",
		"message": sprintf("Le pool CNF '%v' requiert '--topology-manager-policy=single-numa-node' dans kubeletExtraArgs pour l'alignement NUMA PCIe/CPU.", [md_name]),
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:single_numa_topology",
		"violated_requirement_id": "REQ-Sylva-13",
	}
}

# Helper pour extraire l'adresse BMC qu'elle soit sous host.bmc.address ou host.bmh_spec.bmc.address
get_bmc_address(host) := addr if {
	addr := object.get(object.get(host, "bmc", {}), "address", "")
	addr != ""
} else := addr if {
	addr := object.get(object.get(object.get(host, "bmh_spec", {}), "bmc", {}), "address", "")
	addr != ""
} else := ""

# ==============================================================================
# RÈGLE 14 : ADRESSE BMC REDFISH VALIDE SUR CHAQUE HÔTE BARE-METAL
# ==============================================================================
violations contains v if {
	some host_name, host in object.get(target_spec, "baremetal_hosts", {})
	addr := get_bmc_address(host)
	not contains(addr, "redfish")
	v := {
		"rule": "sylva_rule_14_baremetal_hosts_valid_bmc",
		"category": "hardware",
		"message": sprintf("L'hôte '%v' doit définir une adresse BMC Redfish conforme (reçu: '%v').", [host_name, addr]),
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:baremetal_bmc_redfish",
		"violated_requirement_id": "REQ-Sylva-14",
	}
}

# Helper pour extraire l'adresse MAC
get_boot_mac(host) := mac if {
	mac := object.get(host, "bootMACAddress", "")
	mac != ""
} else := mac if {
	mac := object.get(object.get(host, "bmh_spec", {}), "bootMACAddress", "")
	mac != ""
} else := ""

# ==============================================================================
# RÈGLE 15 : ADRESSE MAC DE BOOT NON VIDE SUR CHAQUE HÔTE BARE-METAL
# ==============================================================================
violations contains v if {
	some host_name, host in object.get(target_spec, "baremetal_hosts", {})
	mac := get_boot_mac(host)
	mac == ""
	v := {
		"rule": "sylva_rule_15_baremetal_hosts_valid_mac",
		"category": "hardware",
		"message": sprintf("L'hôte '%v' doit définir une adresse bootMACAddress valide.", [host_name]),
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:baremetal_boot_mac",
		"violated_requirement_id": "REQ-Sylva-15",
	}
}

# ==============================================================================
# VERDICT GLOBAL
# ==============================================================================
violation_messages := [v.message | some v in violations]

verdict := "compliant" if {
	count(violations) == 0
} else := "violated"

evaluation := {
	"verdict": verdict,
	"violations": [v | some v in violations],
	"violation_messages": violation_messages,
	"rule_count": 15,
	"passed_rules_count": 15 - count(violations),
}
