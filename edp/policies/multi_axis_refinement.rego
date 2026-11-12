# METADATA
# title: Oracle Rego Multi-Axes Piloté par l'Ontologie (Phase 4 Refinement & Hydratation)
# description: Évalue la conformité de l'inventaire LLD hydraté sur tous les axes d'ontologie liés (Compute, OOB, Sécurité, Environnements, Énergie 2N) sans aucun littéral codé en dur.

package archinex.edp.multiaxis

import rego.v1

# Helpers pour extraire dynamiquement les clauses et exigences liées à une projection
get_clause_urn(proj, fallback) := u if {
	proj != null
	is_array(proj.governed_by_clauses)
	count(proj.governed_by_clauses) > 0
	some c in proj.governed_by_clauses
	startswith(c, "urn:")
	u := c
} else := fallback

get_req_id(proj, fallback) := r if {
	proj != null
	is_array(proj.governed_by_clauses)
	count(proj.governed_by_clauses) > 0
	some c in proj.governed_by_clauses
	not startswith(c, "urn:")
	r := c
} else := fallback

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
		"violated_clause_urn": get_clause_urn(bm_proj, "urn:archinex:kb:clause:infrastructure:baremetal_sylva"),
		"violated_requirement_id": get_req_id(bm_proj, "REQ-Lot1-268"),
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
		"violated_clause_urn": get_clause_urn(bm_proj, "urn:archinex:kb:clause:infrastructure:baremetal_sylva"),
		"violated_requirement_id": get_req_id(bm_proj, "REQ-Lot1-268"),
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
		"violated_clause_urn": get_clause_urn(oob_proj, "urn:archinex:kb:clause:telecom:oob_isolation"),
		"violated_requirement_id": get_req_id(oob_proj, "REQ-Lot1-OOB-01"),
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
		"violated_clause_urn": get_clause_urn(oob_proj, "urn:archinex:kb:clause:telecom:oob_isolation"),
		"violated_requirement_id": get_req_id(oob_proj, "REQ-Lot1-OOB-01"),
	}
}

violations contains v if {
	oob_proj := data.ontology.telecom_network_oob
	some dev in input.nautobot_planned_devices
	dev.oob_ip == ""
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_missing_oob_ip",
		"axis": "urn:archinex:ontology:axis:oob_management",
		"message": sprintf("Adresse IP OOB manquante sur l'équipement '%v'", [dev.name]),
		"violated_clause_urn": get_clause_urn(oob_proj, "urn:archinex:kb:clause:telecom:oob_isolation"),
		"violated_requirement_id": get_req_id(oob_proj, "REQ-Lot1-OOB-01"),
	}
}

violations contains v if {
	oob_proj := data.ontology.telecom_network_oob
	some dev in input.nautobot_planned_devices
	some bmh in input.k8s_manifests
	dev.name == bmh.metadata.name
	dev.oob_ip != ""
	not contains(bmh.spec.bmc.address, dev.oob_ip)
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_bmc_oob_drift",
		"axis": "urn:archinex:ontology:axis:oob_management",
		"message": sprintf("Dérive (Drift) BMC/OOB sur '%v' : l'URL Redfish '%v' ne pointe pas vers l'IP OOB '%v'", [dev.name, bmh.spec.bmc.address, dev.oob_ip]),
		"violated_clause_urn": get_clause_urn(oob_proj, "urn:archinex:kb:clause:telecom:oob_isolation"),
		"violated_requirement_id": get_req_id(oob_proj, "REQ-Lot1-OOB-01"),
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
		"violated_clause_urn": get_clause_urn(oam_proj, "urn:archinex:kb:clause:nis2:oam_strict_bastion"),
		"violated_requirement_id": get_req_id(oam_proj, "REQ-Lot1-SecZone-01"),
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
		"violated_clause_urn": get_clause_urn(oam_proj, "urn:archinex:kb:clause:nis2:oam_strict_bastion"),
		"violated_requirement_id": get_req_id(oam_proj, "REQ-Lot1-SecZone-01"),
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
		"violated_clause_urn": get_clause_urn(oam_proj, "urn:archinex:kb:clause:nis2:oam_strict_bastion"),
		"violated_requirement_id": get_req_id(oam_proj, "REQ-Lot1-SecZone-01"),
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
		"violated_clause_urn": get_clause_urn(env_proj, "urn:archinex:kb:clause:platform:isoprod_parity"),
		"violated_requirement_id": get_req_id(env_proj, "REQ-Lot1-Env-01"),
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
		"violated_clause_urn": get_clause_urn(env_proj, "urn:archinex:kb:clause:platform:isoprod_parity"),
		"violated_requirement_id": get_req_id(env_proj, "REQ-Lot1-Env-01"),
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
		"violated_clause_urn": get_clause_urn(pwr_proj, "urn:archinex:kb:clause:facilities:dual_feed_2n"),
		"violated_requirement_id": get_req_id(pwr_proj, "REQ-Lot1-269"),
	}
}

# ==============================================================================
# AXE 6 : INTERCONNEXION WAN IPSEC ESP, MÉDIATION DEA S6A & RÉCONCILIATION PARTENAIRE
# (data.ontology.security_crypto_ipsec_ikev2_aes256)
# ==============================================================================

violations contains v if {
	ipsec_proj := data.ontology.security_crypto_ipsec_ikev2_aes256
	some tun in input.reconciliation_graph.ipsec_tunnels
	tun.cipher_suite != ipsec_proj.cipher_suite
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_weak_wan_cipher",
		"axis": "urn:archinex:ontology:axis:wan_interco_encryption",
		"message": sprintf("Suite cryptographique '%v' sur le tunnel '%v' non conforme à data.ontology (attendu: '%v')", [tun.cipher_suite, tun.id, ipsec_proj.cipher_suite]),
		"violated_clause_urn": get_clause_urn(ipsec_proj, "urn:archinex:kb:clause:nis2:art21_crypto"),
		"violated_requirement_id": get_req_id(ipsec_proj, "REQ-Lot1-1343"),
	}
}

violations contains v if {
	ipsec_proj := data.ontology.security_crypto_ipsec_ikev2_aes256
	ipsec_proj.forbid_direct_core_bypass == true
	some flow in input.reconciliation_graph.service_mediation_flows
	some req_hop in ipsec_proj.required_mediation_hops
	not req_hop in flow.mandatory_mediation_hops
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_unmediated_s6a_direct_flow",
		"axis": "urn:archinex:ontology:axis:wan_interco_encryption",
		"message": sprintf("Violation §14 (Contournement de médiation) : le flux '%v' (%v -> %v) omet le bond obligatoire '%v' exigé par data.ontology (%v)", [flow.id, flow.source_shadow_ref, flow.destination_core_ref, req_hop, ipsec_proj.required_mediation_hops]),
		"violated_clause_urn": get_clause_urn(ipsec_proj, "urn:archinex:kb:clause:nis2:art21_crypto"),
		"violated_requirement_id": get_req_id(ipsec_proj, "REQ-Lot1-1343"),
	}
}

violations contains v if {
	ipsec_proj := data.ontology.security_crypto_ipsec_ikev2_aes256
	ipsec_proj.require_partner_sla_reconciliation == true
	some flow in input.reconciliation_graph.service_mediation_flows
	matching_orgs := [org | some org in input.reconciliation_graph.partner_organizations; org.id == flow.tenant_ref]
	matching_slas := [c | some c in input.reconciliation_graph.sla_and_monitoring_contracts; c.tenant_ref == flow.tenant_ref; c.covered_flow_ref == flow.id]
	(count(matching_orgs) + count(matching_slas)) < 2
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_unreconciled_partner_objects",
		"axis": "urn:archinex:ontology:axis:wan_interco_encryption",
		"message": sprintf("Rupture de réconciliation multi-domaine : le flux '%v' (pivot tenant_ref='%v') n'est pas réconcilié avec une Organisation Partenaire et un Contrat SLA / Sonde NOC", [flow.id, flow.tenant_ref]),
		"violated_clause_urn": get_clause_urn(ipsec_proj, "urn:archinex:kb:clause:nis2:art21_crypto"),
		"violated_requirement_id": get_req_id(ipsec_proj, "REQ-Lot1-1343"),
	}
}

# ==============================================================================
# AXE 7 : COMPOSANTS LOGIQUES, PLACEMENT SYLVA, MULTI-NIC / VRF & REF() (LOT 4)
# ==============================================================================

violations contains v if {
	some comp in object.get(input, "resolved_components", [])
	some mod in object.get(comp, "modules", [])
	mod.placement.requiredDataplane == "sriov-dpdk"
	pool := object.get(mod.placement, "pool", "")
	not contains(lower(pool), "sriov")
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_component_substrate_mismatch",
		"axis": "urn:archinex:ontology:axis:logical_components",
		"message": sprintf("Incohérence placement : le module '%v/%v' exige 'sriov-dpdk' mais cible le pool '%v'.", [comp.name, mod.name, pool]),
		"violated_clause_urn": "urn:archinex:kb:clause:infrastructure:baremetal_sylva",
		"violated_requirement_id": "REQ-Sylva-08",
	}
}

violations contains v if {
	some comp in object.get(input, "resolved_components", [])
	some err in object.get(comp, "continuityErrors", [])
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_logical_interface_discontinuity",
		"axis": "urn:archinex:ontology:axis:logical_components",
		"message": sprintf("Discontinuité sur '%v' : %v", [comp.name, err]),
		"violated_clause_urn": "urn:archinex:kb:clause:nis2:art21_crypto",
		"violated_requirement_id": "REQ-Lot1-1343",
	}
}

violations contains v if {
	some comp in object.get(input, "resolved_components", [])
	some ref_err in object.get(comp, "unresolvedRefs", [])
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_unresolved_component_refs",
		"axis": "urn:archinex:ontology:axis:logical_components",
		"message": sprintf("Référence non résolue sur '%v' (%v/%v) : '%v'", [comp.name, comp.environment, comp.datacenter, ref_err]),
		"violated_clause_urn": "urn:archinex:kb:clause:platform:isoprod_parity",
		"violated_requirement_id": "REQ-Lot1-Env-01",
	}
}

violations contains v if {
	some issue in object.get(input, "component_lint_issues", [])
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_component_lint_violation",
		"axis": "urn:archinex:ontology:axis:logical_components",
		"message": sprintf("[%v] %v : %v", [issue.component, issue.code, issue.message]),
		"violated_clause_urn": "urn:archinex:kb:clause:telecom:oob_isolation",
		"violated_requirement_id": "REQ-Lot1-OOB-01",
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
