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
# AXE 8 : CHAÎNE DE CONFIANCE PKI / HSM / VAULT / BASTION PAM / PROXY DMZ
# ==============================================================================

violations contains v if {
	pki_proj := object.get(data.ontology, "security_pki_root_offline_airgap", null)
	pki_proj != null
	tc := object.get(input, "trust_chain", {})
	tc.root_ca_key_custody != pki_proj.key_custody_mode
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_software_root_ca_key",
		"axis": "urn:archinex:ontology:axis:pki_hierarchy",
		"message": sprintf("Clé privée racine PKI non protégée sur matériel dédié (%v au lieu de %v)", [object.get(tc, "root_ca_key_custody", "absent"), pki_proj.key_custody_mode]),
		"violated_clause_urn": get_clause_urn(pki_proj, "urn:archinex:kb:clause:anssi:rgs_pki_hierarchy"),
		"violated_requirement_id": "REQ-Sec-PKI-01",
	}
}

violations contains v if {
	vault_proj := object.get(data.ontology, "security_vault_openbao_pkcs11_hsm", null)
	vault_proj != null
	tc := object.get(input, "trust_chain", {})
	tc.vault_unseal_mode != vault_proj.unseal_mechanism
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_unsealed_vault_without_hsm",
		"axis": "urn:archinex:ontology:axis:vault_unseal_mode",
		"message": sprintf("Mode d'auto-déverrouillage du coffre Vault/OpenBao non conforme (%v au lieu de %v)", [object.get(tc, "vault_unseal_mode", "absent"), vault_proj.unseal_mechanism]),
		"violated_clause_urn": get_clause_urn(vault_proj, "urn:archinex:kb:clause:nis2:vault_hsm_unseal"),
		"violated_requirement_id": "REQ-Sec-Vault-01",
	}
}

violations contains v if {
	bastion_proj := object.get(data.ontology, "security_bastion_wallix_pam", null)
	bastion_proj != null
	tc := object.get(input, "trust_chain", {})
	tc.oam_session_recording != bastion_proj.bastion_session_recording
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_direct_oam_without_bastion",
		"axis": "urn:archinex:ontology:axis:pam_admin_bastion",
		"message": sprintf("Enregistrement de session bastion PAM requis sur la zone OAM (attendu: %v)", [bastion_proj.bastion_session_recording]),
		"violated_clause_urn": get_clause_urn(bastion_proj, "urn:archinex:kb:clause:nis2:oam_strict_bastion"),
		"violated_requirement_id": "REQ-Lot1-SecZone-01",
	}
}

violations contains v if {
	proxy_proj := object.get(data.ontology, "network_proxy_squid_explicit_fqdn", null)
	proxy_proj != null
	tc := object.get(input, "trust_chain", {})
	tc.egress_mode != proxy_proj.egress_mode
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_unfiltered_internet_egress",
		"axis": "urn:archinex:ontology:axis:egress_filtering_proxy",
		"message": sprintf("Sortie DMZ non médiatisée par proxy FQDN explicite (%v au lieu de %v)", [object.get(tc, "egress_mode", "absent"), proxy_proj.egress_mode]),
		"violated_clause_urn": get_clause_urn(proxy_proj, "urn:archinex:kb:clause:anssi:egress_proxy_whitelist"),
		"violated_requirement_id": "REQ-Sec-Proxy-01",
	}
}

# ==============================================================================
# AXE 9 : COUVERTURE MULTI-DOMAINES ÉTENDUE (RÉSEAU, STOCKAGE, IAM, OBS, DRP, OCI)
# ==============================================================================

is_non_evpn_fabric(nf, sf_proj) if {
	object.get(nf, "underlay_protocol", "") != sf_proj.underlay_protocol
}

is_non_evpn_fabric(nf, sf_proj) if {
	object.get(nf, "overlay_protocol", "") != sf_proj.overlay_protocol
}

violations contains v if {
	sf_proj := object.get(data.ontology, "telecom_network_spine_leaf_evpn", null)
	sf_proj != null
	ed := object.get(input, "extended_domains", {})
	nf := object.get(ed, "network_fabric", {})
	nf.tor_uplinks_per_rack < sf_proj.min_tor_switches_per_rack
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_single_tor_uplink",
		"axis": "urn:archinex:ontology:axis:network_underlay_fabric",
		"message": sprintf("Redondance Top-of-Rack insuffisante (%v liens par baie au lieu de %v)", [object.get(nf, "tor_uplinks_per_rack", "absent"), sf_proj.min_tor_switches_per_rack]),
		"violated_clause_urn": get_clause_urn(sf_proj, "urn:archinex:kb:clause:net:spine_leaf_uplinks"),
		"violated_requirement_id": "REQ-Net-Fabric-Uplink",
	}
}

violations contains v if {
	sf_proj := object.get(data.ontology, "telecom_network_spine_leaf_evpn", null)
	sf_proj != null
	ed := object.get(input, "extended_domains", {})
	nf := object.get(ed, "network_fabric", {})
	is_non_evpn_fabric(nf, sf_proj)
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_non_evpn_fabric",
		"axis": "urn:archinex:ontology:axis:network_underlay_fabric",
		"message": sprintf("Fabrique réseau non conforme au profil EVPN/eBGP attendu (%v/%v au lieu de %v/%v)", [object.get(nf, "underlay_protocol", "absent"), object.get(nf, "overlay_protocol", "absent"), sf_proj.underlay_protocol, sf_proj.overlay_protocol]),
		"violated_clause_urn": get_clause_urn(sf_proj, "urn:archinex:kb:clause:net:evpn_overlay"),
		"violated_requirement_id": "REQ-Net-Fabric-Evpn",
	}
}

violations contains v if {
	up_proj := object.get(data.ontology, "security_zone_user_plane", null)
	up_proj != null
	ed := object.get(input, "extended_domains", {})
	up := object.get(ed, "user_plane_zone", {})
	up.isolation_level != up_proj.isolation_level
	v := {
		"rule": "data.archinex.edp.adr015.deny_user_plane_management_leak",
		"axis": "urn:archinex:ontology:axis:security_zoning",
		"message": sprintf("Isolation de zone plan utilisateur non conforme (%v au lieu de %v)", [object.get(up, "isolation_level", "absent"), up_proj.isolation_level]),
		"violated_clause_urn": get_clause_urn(up_proj, "urn:archinex:kb:clause:sec:user_plane_isolation"),
		"violated_requirement_id": "REQ-Sec-UserPlane",
	}
}

violations contains v if {
	csi_proj := object.get(data.ontology, "storage_csi_ceph_rbd_3replicas", null)
	csi_proj != null
	ed := object.get(input, "extended_domains", {})
	sc := object.get(ed, "storage_csi", {})
	sc.replication_factor < csi_proj.min_replication_factor
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_insufficient_storage_replicas",
		"axis": "urn:archinex:ontology:axis:storage_replication",
		"message": sprintf("Facteur de réplication stockage insuffisant (%v réplicas au lieu de %v)", [object.get(sc, "replication_factor", "absent"), csi_proj.min_replication_factor]),
		"violated_clause_urn": get_clause_urn(csi_proj, "urn:archinex:kb:clause:storage:csi_replication"),
		"violated_requirement_id": "REQ-Storage-Replication",
	}
}

violations contains v if {
	obj_proj := object.get(data.ontology, "storage_s3_object_erasure_coding", null)
	obj_proj != null
	ed := object.get(input, "extended_domains", {})
	os := object.get(ed, "object_storage", {})
	os.versioning_enabled != obj_proj.versioning_required
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_unprotected_s3_bucket",
		"axis": "urn:archinex:ontology:axis:storage_replication",
		"message": sprintf("Versioning du stockage objet non conforme (requis: %v)", [obj_proj.versioning_required]),
		"violated_clause_urn": get_clause_urn(obj_proj, "urn:archinex:kb:clause:storage:object_versioning"),
		"violated_requirement_id": "REQ-Storage-Object",
	}
}

violations contains v if {
	enc_proj := object.get(data.ontology, "security_crypto_luks2_kms_hsm", null)
	enc_proj != null
	ed := object.get(input, "extended_domains", {})
	enc := object.get(ed, "encryption_at_rest", {})
	enc.cipher != enc_proj.cipher
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_unencrypted_storage_volume",
		"axis": "urn:archinex:ontology:axis:encryption_at_rest",
		"message": sprintf("Algorithme de chiffrement au repos non conforme (%v au lieu de %v)", [object.get(enc, "cipher", "absent"), enc_proj.cipher]),
		"violated_clause_urn": get_clause_urn(enc_proj, "urn:archinex:kb:clause:sec:encryption_cipher"),
		"violated_requirement_id": "REQ-Sec-Encryption",
	}
}

violations contains v if {
	bkp_proj := object.get(data.ontology, "storage_backup_s3_object_lock_worm", null)
	bkp_proj != null
	ed := object.get(input, "extended_domains", {})
	bkp := object.get(ed, "backup_vault", {})
	bkp.immutability_mode != bkp_proj.immutability_mode
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_mutable_backup_repository",
		"axis": "urn:archinex:ontology:axis:backup_immutability",
		"message": sprintf("Mode d'immuabilité des sauvegardes non conforme (%v au lieu de %v)", [object.get(bkp, "immutability_mode", "absent"), bkp_proj.immutability_mode]),
		"violated_clause_urn": get_clause_urn(bkp_proj, "urn:archinex:kb:clause:storage:backup_worm"),
		"violated_requirement_id": "REQ-Storage-Backup",
	}
}

violations contains v if {
	iam_proj := object.get(data.ontology, "security_iam_oidc_fido2_rbac", null)
	iam_proj != null
	ed := object.get(input, "extended_domains", {})
	iam := object.get(ed, "iam_rbac", {})
	iam.forbid_cluster_admin_group != iam_proj.forbid_cluster_admin_group
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_wildcard_cluster_admin_rbac",
		"axis": "urn:archinex:ontology:axis:iam_federation_mfa",
		"message": sprintf("Interdiction de groupe cluster-admin générique requise (%v)", [iam_proj.forbid_cluster_admin_group]),
		"violated_clause_urn": get_clause_urn(iam_proj, "urn:archinex:kb:clause:sec:rbac_least_privilege"),
		"violated_requirement_id": "REQ-Sec-IAM-RBAC",
	}
}

violations contains v if {
	iam_proj := object.get(data.ontology, "security_iam_oidc_fido2_rbac", null)
	iam_proj != null
	ed := object.get(input, "extended_domains", {})
	iam := object.get(ed, "iam_rbac", {})
	iam.mfa_level != iam_proj.mfa_level
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_missing_mfa_enforcement",
		"axis": "urn:archinex:ontology:axis:iam_federation_mfa",
		"message": sprintf("Niveau d'authentification multifacteur insuffisant (%v au lieu de %v)", [object.get(iam, "mfa_level", "absent"), iam_proj.mfa_level]),
		"violated_clause_urn": get_clause_urn(iam_proj, "urn:archinex:kb:clause:sec:iam_strong_mfa"),
		"violated_requirement_id": "REQ-Sec-IAM-MFA",
	}
}

violations contains v if {
	mtls_proj := object.get(data.ontology, "security_pki_cert_manager_spiffe_mtls", null)
	mtls_proj != null
	ed := object.get(input, "extended_domains", {})
	wpki := object.get(ed, "workload_pki", {})
	wpki.mtls_enforcement != mtls_proj.mtls_enforcement
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_plaintext_interservice_flow",
		"axis": "urn:archinex:ontology:axis:pki_mtls_workload",
		"message": sprintf("Politique mTLS inter-services insuffisante (%v au lieu de %v)", [object.get(wpki, "mtls_enforcement", "absent"), mtls_proj.mtls_enforcement]),
		"violated_clause_urn": get_clause_urn(mtls_proj, "urn:archinex:kb:clause:sec:workload_strict_mtls"),
		"violated_requirement_id": "REQ-Sec-Workload-mTLS",
	}
}

violations contains v if {
	sec_proj := object.get(data.ontology, "security_secrets_vault_dynamic_leases", null)
	sec_proj != null
	ed := object.get(input, "extended_domains", {})
	sec := object.get(ed, "secrets_management", {})
	sec.allow_static_k8s_secrets != sec_proj.allow_static_k8s_secrets
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_static_secret_in_git",
		"axis": "urn:archinex:ontology:axis:secrets_vault_management",
		"message": sprintf("Secrets statiques non conformes aux baux dynamiques Vault (allow_static_k8s_secrets attendu: %v)", [sec_proj.allow_static_k8s_secrets]),
		"violated_clause_urn": get_clause_urn(sec_proj, "urn:archinex:kb:clause:sec:dynamic_secret_leases"),
		"violated_requirement_id": "REQ-Sec-Vault-Leases",
	}
}

violations contains v if {
	tel_proj := object.get(data.ontology, "observability_telemetry_otel_prometheus_loki", null)
	tel_proj != null
	ed := object.get(input, "extended_domains", {})
	obs := object.get(ed, "observability", {})
	obs.collector_standard != tel_proj.collector_standard
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_unmonitored_workload",
		"axis": "urn:archinex:ontology:axis:metrics_traces_pipeline",
		"message": sprintf("Standard collecteur de télémétrie non conforme (%v au lieu de %v)", [object.get(obs, "collector_standard", "absent"), tel_proj.collector_standard]),
		"violated_clause_urn": get_clause_urn(tel_proj, "urn:archinex:kb:clause:obs:opentelemetry_standard"),
		"violated_requirement_id": "REQ-Obs-Telemetry",
	}
}

violations contains v if {
	siem_proj := object.get(data.ontology, "observability_soc_siem_syslog_tls_nis2", null)
	siem_proj != null
	ed := object.get(input, "extended_domains", {})
	obs := object.get(ed, "observability", {})
	obs.siem_transport != siem_proj.transport
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_missing_siem_audit_sink",
		"axis": "urn:archinex:ontology:axis:siem_audit_retention",
		"message": sprintf("Transport d'audit SIEM non conforme (%v au lieu de %v)", [object.get(obs, "siem_transport", "absent"), siem_proj.transport]),
		"violated_clause_urn": get_clause_urn(siem_proj, "urn:archinex:kb:clause:obs:siem_tls_audit"),
		"violated_requirement_id": "REQ-Obs-SIEM",
	}
}

violations contains v if {
	alert_proj := object.get(data.ontology, "observability_noc_alertmanager_slo_burnrate", null)
	alert_proj != null
	ed := object.get(input, "extended_domains", {})
	obs := object.get(ed, "observability", {})
	obs.require_runbook_annotation != alert_proj.require_runbook_annotation
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_alert_without_runbook_url",
		"axis": "urn:archinex:ontology:axis:slo_alerting_runbooks",
		"message": sprintf("Annotation runbook requise sur toutes les règles d'alerte SLO (%v)", [alert_proj.require_runbook_annotation]),
		"violated_clause_urn": get_clause_urn(alert_proj, "urn:archinex:kb:clause:obs:slo_runbook_annotation"),
		"violated_requirement_id": "REQ-Obs-Runbook",
	}
}

violations contains v if {
	aa_proj := object.get(data.ontology, "resilience_drp_active_active_stretched", null)
	aa_proj != null
	ed := object.get(input, "extended_domains", {})
	drp := object.get(ed, "drp", {})
	drp.witness_site_present != aa_proj.witness_site_required
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_missing_quorum_witness_site",
		"axis": "urn:archinex:ontology:axis:multi_site_failover",
		"message": sprintf("Site témoin de quorum requis pour la topologie actif-actif étendue (%v)", [aa_proj.witness_site_required]),
		"violated_clause_urn": get_clause_urn(aa_proj, "urn:archinex:kb:clause:res:quorum_witness"),
		"violated_requirement_id": "REQ-Res-DRP-Quorum",
	}
}

violations contains v if {
	ap_proj := object.get(data.ontology, "resilience_drp_active_passive_warm_standby", null)
	ap_proj != null
	ed := object.get(input, "extended_domains", {})
	drp := object.get(ed, "drp", {})
	drp.rpo_seconds > ap_proj.rpo_seconds
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_rpo_exceeding_threshold",
		"axis": "urn:archinex:ontology:axis:multi_site_failover",
		"message": sprintf("Objectif RPO dépassé (%v secondes au-delà du maximum de %v s)", [object.get(drp, "rpo_seconds", "absent"), ap_proj.rpo_seconds]),
		"violated_clause_urn": get_clause_urn(ap_proj, "urn:archinex:kb:clause:res:rpo_threshold"),
		"violated_requirement_id": "REQ-Res-DRP-RPO",
	}
}

violations contains v if {
	gd_proj := object.get(data.ontology, "resilience_testing_automated_gameday_quarterly", null)
	gd_proj != null
	ed := object.get(input, "extended_domains", {})
	drp := object.get(ed, "drp", {})
	drp.days_since_last_drill > gd_proj.max_days_between_drills
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_untested_drp_plan",
		"axis": "urn:archinex:ontology:axis:chaos_drp_testing",
		"message": sprintf("Plan de reprise non exercé dans le délai maximal (%v jours au-delà de %v jours)", [object.get(drp, "days_since_last_drill", "absent"), gd_proj.max_days_between_drills]),
		"violated_clause_urn": get_clause_urn(gd_proj, "urn:archinex:kb:clause:res:gameday_cadence"),
		"violated_requirement_id": "REQ-Res-GameDay",
	}
}

violations contains v if {
	reg_proj := object.get(data.ontology, "platform_registry_harbor_cosign_trivy", null)
	reg_proj != null
	ed := object.get(input, "extended_domains", {})
	reg := object.get(ed, "oci_registry", {})
	reg.cosign_verification != reg_proj.cosign_verification
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_unsigned_oci_image",
		"axis": "urn:archinex:ontology:axis:oci_artifact_registry",
		"message": sprintf("Vérification cryptographique des signatures d'images OCI requise (%v)", [reg_proj.cosign_verification]),
		"violated_clause_urn": get_clause_urn(reg_proj, "urn:archinex:kb:clause:plat:signed_oci_images"),
		"violated_requirement_id": "REQ-Plat-Registry-Cosign",
	}
}

# ==============================================================================
# AXE 10 : ORACLES IMP V2 (RGS/CERTIFICATS, ORGANIZATION, CAPABILITY MATRIX, CHARTE)
# ==============================================================================

violations contains v if {
	imp := object.get(input, "imp_v2", {})
	some cert in object.get(imp, "certificates", [])
	not object.get(cert, "profile", null)
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_certificate_without_profile",
		"axis": "urn:archinex:ontology:axis:imp_v2_rgs",
		"message": sprintf("Le certificat '%v' doit référencer un profil partagé (certificateProfiles).", [cert.name]),
		"violated_clause_urn": "urn:archinex:kb:clause:pki:certificate_profile",
		"violated_requirement_id": "REQ-IMP-V2-RGS",
	}
}

violations contains v if {
	imp := object.get(input, "imp_v2", {})
	some cert in object.get(imp, "certificates", [])
	inline_fields := [f | some f in ["validityDays", "keySize", "algorithm", "extendedKeyUsage", "keyUsage"]; object.get(cert, f, null) != null]
	count(inline_fields) > 0
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_inline_x509_certificate_properties",
		"axis": "urn:archinex:ontology:axis:imp_v2_rgs",
		"message": sprintf("Le certificat '%v' contient des propriétés X.509 inline interdites (%v).", [cert.name, concat(", ", inline_fields)]),
		"violated_clause_urn": "urn:archinex:kb:clause:pki:certificate_profile",
		"violated_requirement_id": "REQ-IMP-V2-RGS",
	}
}

violations contains v if {
	imp := object.get(input, "imp_v2", {})
	some prof in object.get(imp, "certificate_profiles", [])
	lower(object.get(prof, "algorithm", "")) == "rsa"
	object.get(prof, "keySize", 0) < 3072
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_non_rgs_rsa_key_size",
		"axis": "urn:archinex:ontology:axis:imp_v2_rgs",
		"message": sprintf("Profil '%v' non conforme RGS : clé RSA %v < 3072 bits.", [prof.name, prof.keySize]),
		"violated_clause_urn": "urn:archinex:kb:clause:pki:rgs_crypto_floor",
		"violated_requirement_id": "REQ-IMP-V2-RGS",
	}
}

violations contains v if {
	imp := object.get(input, "imp_v2", {})
	some tls_ver in object.get(imp, "tls_min_versions", [])
	lower(tls_ver) in {"tls1.0", "tls1.1"}
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_deprecated_tls_version",
		"axis": "urn:archinex:ontology:axis:imp_v2_rgs",
		"message": sprintf("Version TLS obsolète '%v' rejetée par la politique crypto RGS (minimum TLS 1.2).", [tls_ver]),
		"violated_clause_urn": "urn:archinex:kb:clause:pki:rgs_crypto_floor",
		"violated_requirement_id": "REQ-IMP-V2-RGS",
	}
}

violations contains v if {
	imp := object.get(input, "imp_v2", {})
	some org in object.get(imp, "organizations", [])
	forbidden := [k | some k in ["compute", "firewall", "exposure"]; object.get(org.spec, k, null) != null]
	count(forbidden) > 0
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_organization_with_component_sections",
		"axis": "urn:archinex:ontology:axis:imp_v2_organization",
		"message": sprintf("L'Organization '%v' ne peut pas déclarer %v (réservé aux Components).", [org.metadata.name, concat(", ", forbidden)]),
		"violated_clause_urn": "urn:archinex:kb:clause:imp:organization_separation",
		"violated_requirement_id": "REQ-IMP-V2-ORG",
	}
}

violations contains v if {
	imp := object.get(input, "imp_v2", {})
	avail := {op | some op in object.get(imp, "available_driver_operations", [])}
	some req_op in object.get(imp, "required_driver_operations", [])
	not req_op in avail
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_missing_driver_capability",
		"axis": "urn:archinex:ontology:axis:imp_v2_drivers",
		"message": sprintf("Capacité driver manquante dans la CapabilityMatrix : '%v'.", [req_op]),
		"violated_clause_urn": "urn:archinex:kb:clause:imp:driver_capability_matrix",
		"violated_requirement_id": "REQ-IMP-V2-DRIVER",
	}
}

violations contains v if {
	imp := object.get(input, "imp_v2", {})
	some chk in object.get(imp, "charter_checks", [])
	not chk.eligible
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_integration_charter_violation",
		"axis": "urn:archinex:ontology:axis:imp_v2_charter",
		"message": sprintf("Charte d'intégration non satisfaite pour '%v' : %v", [chk.component, concat("; ", object.get(chk, "missing", []))]),
		"violated_clause_urn": "urn:archinex:kb:clause:imp:integration_charter",
		"violated_requirement_id": "REQ-IMP-V2-CHARTER",
	}
}

violations contains v if {
	imp := object.get(input, "imp_v2", {})
	some err in object.get(imp, "firewall_path_errors", [])
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_unprotected_cross_zone_firewall_path",
		"axis": "urn:archinex:ontology:axis:imp_v2_network",
		"message": err,
		"violated_clause_urn": "urn:archinex:kb:clause:imp:firewall_path_deduction",
		"violated_requirement_id": "REQ-IMP-V2-FWPATH",
	}
}

violations contains v if {
	imp := object.get(input, "imp_v2", {})
	some err in object.get(imp, "ip_fabric_errors", [])
	v := {
		"rule": "data.archinex.edp.multiaxis.deny_ip_fabric_security_violation",
		"axis": "urn:archinex:ontology:axis:imp_v2_network",
		"message": err,
		"violated_clause_urn": "urn:archinex:kb:clause:imp:ip_fabric_whitelist",
		"violated_requirement_id": "REQ-IMP-V2-FABRIC",
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
