# METADATA
# title: Oracle Rego Multi-Axes Piloté par l'Ontologie (Phase 4 Refinement & Hydratation)
# description: Évalue la conformité de l'inventaire LLD hydraté sur tous les axes d'ontologie liés (Compute, OOB, Sécurité, Environnements, Énergie 2N) sans aucun littéral codé en dur.

package archinex.edp.multiaxis

import rego.v1

# ==============================================================================
# AXE 1 : SUBSTRAT COMPUTE BARE-METAL (data.ontology.infrastructure_server_baremetal)
# ==============================================================================

violations contains v if {
	bm_proj := data.ontology.infrastructure_server_baremetal
	some dev in input.nautobot_planned_devices
	not dev.device_type in bm_proj.baremetal_types
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_unapproved_hardware_profile",
		"axis": "urn:archinex:ontology:axis:compute_substrate",
		"message": sprintf("Profil matériel '%v' sur '%v' non homologué dans data.ontology (attendu: %v)", [dev.device_type, dev.name, bm_proj.baremetal_types]),
	}
}

violations contains v if {
	bm_proj := data.ontology.infrastructure_server_baremetal
	some bmh in input.k8s_manifests
	not bmh.spec.role in bm_proj.allowed_roles
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_invalid_node_role",
		"axis": "urn:archinex:ontology:axis:compute_substrate",
		"message": sprintf("Rôle CAPI '%v' sur '%v' interdit par data.ontology (attendu: %v)", [bmh.spec.role, bmh.metadata.name, bm_proj.allowed_roles]),
	}
}

# ==============================================================================
# AXE 2 : PLAN D'ADMINISTRATION HORS-BANDE OOB (data.ontology.telecom_network_oob)
# ==============================================================================

violations contains v if {
	oob_proj := data.ontology.telecom_network_oob
	some dev in input.nautobot_planned_devices
	dev.status != oob_proj.required_status
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_invalid_device_status",
		"axis": "urn:archinex:ontology:axis:oob_management",
		"message": sprintf("Statut Nautobot '%v' sur '%v' non conforme à data.ontology (requis: '%v')", [dev.status, dev.name, oob_proj.required_status]),
	}
}

violations contains v if {
	oob_proj := data.ontology.telecom_network_oob
	some dev in input.nautobot_planned_devices
	count(dev.interfaces) < oob_proj.min_interfaces
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_insufficient_interfaces",
		"axis": "urn:archinex:ontology:axis:oob_management",
		"message": sprintf("Équipement '%v' n'a que %d interface(s) ; data.ontology exige au moins %d interfaces (OOB + Data)", [dev.name, count(dev.interfaces), oob_proj.min_interfaces]),
	}
}

violations contains v if {
	_ := data.ontology.telecom_network_oob
	some dev in input.nautobot_planned_devices
	dev.oob_ip == ""
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_missing_oob_ip",
		"axis": "urn:archinex:ontology:axis:oob_management",
		"message": sprintf("Adresse IP OOB manquante sur l'équipement '%v'", [dev.name]),
	}
}

violations contains v if {
	_ := data.ontology.telecom_network_oob
	some dev in input.nautobot_planned_devices
	some bmh in input.k8s_manifests
	dev.name == bmh.metadata.name
	dev.oob_ip != ""
	not contains(bmh.spec.bmc.address, dev.oob_ip)
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_bmc_oob_drift",
		"axis": "urn:archinex:ontology:axis:oob_management",
		"message": sprintf("Dérive (Drift) BMC/OOB sur '%v' : l'URL Redfish '%v' ne pointe pas vers l'IP OOB '%v'", [dev.name, bmh.spec.bmc.address, dev.oob_ip]),
	}
}

# ==============================================================================
# AXE 3 : ZONAGE DE SÉCURITÉ & CLOISONNEMENT NIS2 (data.ontology.security_zone_*)
# ==============================================================================

violations contains v if {
	oam_proj := data.ontology.security_zone_oam
	matching := [z | some z in input.security_zones; z.urn == oam_proj.urn]
	count(matching) == 0
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_missing_oam_zone",
		"axis": "urn:archinex:ontology:axis:security_zoning",
		"message": "Aucune zone de sécurité OAM déclarée dans l'inventaire alors que la feuille OAM est liée",
	}
}

violations contains v if {
	oam_proj := data.ontology.security_zone_oam
	some z in input.security_zones
	z.urn == oam_proj.urn
	z.isolation_level != oam_proj.isolation_level
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_weak_oam_isolation",
		"axis": "urn:archinex:ontology:axis:security_zoning",
		"message": sprintf("Niveau d'isolation de la zone '%v' ('%v') inférieur à l'exigence data.ontology ('%v')", [z.zone_id, z.isolation_level, oam_proj.isolation_level]),
	}
}

violations contains v if {
	oam_proj := data.ontology.security_zone_oam
	some z in input.security_zones
	z.urn == oam_proj.urn
	z.proxy_required != oam_proj.proxy_required
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_unproxied_oam_access",
		"axis": "urn:archinex:ontology:axis:security_zoning",
		"message": sprintf("La zone OAM '%v' doit imposer un bastion/proxy obligatoire (proxy_required=%v)", [z.zone_id, oam_proj.proxy_required]),
	}
}

# ==============================================================================
# AXE 4 : FIDÉLITÉ & PARITÉ DES ENVIRONNEMENTS (data.ontology.platform_env_iso_prod_3tiers)
# ==============================================================================

violations contains v if {
	env_proj := data.ontology.platform_env_iso_prod_3tiers
	some req_tier in env_proj.required_tiers
	present := [e | some e in input.environments; e.env == req_tier]
	count(present) == 0
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_missing_environment_tier",
		"axis": "urn:archinex:ontology:axis:env_fidelity",
		"message": sprintf("Palier d'environnement obligatoire '%v' absent de la topologie LLD", [req_tier]),
	}
}

violations contains v if {
	env_proj := data.ontology.platform_env_iso_prod_3tiers
	env_proj.staging_must_be_isoprod == true
	some e in input.environments
	e.env != env_proj.required_tiers[0]
	e.isoprod != true
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_non_isoprod_staging",
		"axis": "urn:archinex:ontology:axis:env_fidelity",
		"message": sprintf("Rupture de parité : l'environnement '%v' doit être strictement Iso-Prod (isoprod=true)", [e.env]),
	}
}

# ==============================================================================
# AXE 5 : RÉSILIENCE ÉLECTRIQUE 2N (data.ontology.facilities_power_dual_feed_2n)
# ==============================================================================

violations contains v if {
	pwr_proj := data.ontology.facilities_power_dual_feed_2n
	some dev in input.nautobot_planned_devices
	count(dev.power_feeds) < pwr_proj.min_power_supplies
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_single_power_feed",
		"axis": "urn:archinex:ontology:axis:power_cooling_resilience",
		"message": sprintf("Résilience électrique violée sur '%v' : %d alimentation(s) raccordée(s) au lieu de %d (mode %v)", [dev.name, count(dev.power_feeds), pwr_proj.min_power_supplies, pwr_proj.redundancy_mode]),
	}
}

# ==============================================================================
# SYNTHÈSE DU VERDICT MULTI-AXES
# ==============================================================================

violation_messages := [v.message | some v in violations]

verdict := "compliant" if {
	count(violations) == 0
} else := "violated"

evaluation := {
	"verdict": verdict,
	"violations": [v | some v in violations],
	"violation_messages": violation_messages,
	"evaluated_axes_count": count(data.ontology),
}

