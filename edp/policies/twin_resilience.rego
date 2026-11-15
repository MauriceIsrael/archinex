# METADATA
# title: Oracle OPA de Résilience du Jumeau Numérique de Sylva (Issues #292, #293)
# description: Évalue la survie aux pannes (quorum etcd, stockage RF=3, capacité Bare-Metal SR-IOV/Hugepages, double alimentation PDU 2N, bouchon Redfish sushy-tools) d'un profil topologique Sylva.

package archinex.edp.twin

import rego.v1

# Normalisation de la racine : accepte soit un SylvaTwinArbitrationReport direct,
# soit un payload refined_input contenant sources.twin_report.content
default report := {}

report := input.sources.twin_report.content if {
	object.get(object.get(object.get(input, "sources", {}), "twin_report", {}), "content", null) != null
}

report := input.sylva_twin_report if {
	object.get(input, "sources", null) == null
	object.get(input, "sylva_twin_report", null) != null
}

report := input if {
	object.get(input, "sources", null) == null
	object.get(input, "sylva_twin_report", null) == null
	object.get(input, "profiles", null) != null
}

# Détermination du profil évalué :
# - en mode 'client-mandated' : requirements.mandatedProfileId (ou '2dc-split' par défaut)
# - en mode 'proposal' : defaultProfileId ('3dc-active')
default target_profile_id := "3dc-active"

target_profile_id := report.requirements.mandatedProfileId if {
	object.get(report, "mode", "") == "client-mandated"
	object.get(object.get(report, "requirements", {}), "mandatedProfileId", null) != null
}

target_profile_id := "2dc-split" if {
	object.get(report, "mode", "") == "client-mandated"
	object.get(object.get(report, "requirements", {}), "mandatedProfileId", null) == null
}

target_profile_id := report.defaultProfileId if {
	object.get(report, "mode", "") != "client-mandated"
	object.get(report, "defaultProfileId", null) != null
}

target_profile := p if {
	some p in report.profiles
	p.profileId == target_profile_id
}

# ==============================================================================
# RÈGLE 1 : MAINTIEN DU QUORUM ETCD SUR PERTE DU DATACENTER PRIMAIRE
# ==============================================================================
violations contains v if {
	report.requirements.requireEtcdQuorumOnDcLoss == true
	some f in target_profile.faultResults
	f.faultId == "dc_loss_primary"
	f.etcdQuorumSurvives != true
	v := {
		"rule": "twin_rule_01_etcd_quorum_on_dc_loss",
		"category": "resilience",
		"profileId": target_profile_id,
		"faultId": "dc_loss_primary",
		"message": sprintf("Profil '%s' : perte du quorum etcd RKE2 lors de la chute du DC primaire (%v/%v survivant < quorum 2).", [target_profile_id, f.etcdSurvivingMembers, f.etcdTotalMembers]),
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:twin_etcd_quorum",
		"violated_requirement_id": "REQ-Twin-Quorum-01",
	}
}

# ==============================================================================
# RÈGLE 2 : MAINTIEN DU QUORUM D'ÉCRITURE STOCKAGE (RF=3) SUR PERTE DE DC
# ==============================================================================
violations contains v if {
	report.requirements.requireStorageWritableOnDcLoss == true
	some f in target_profile.faultResults
	f.faultId == "dc_loss_primary"
	f.storageWritable != true
	v := {
		"rule": "twin_rule_02_storage_writable_on_dc_loss",
		"category": "storage",
		"profileId": target_profile_id,
		"faultId": "dc_loss_primary",
		"message": sprintf("Profil '%s' : stockage persistant en lecture seule après chute du DC primaire (%v réplica(s) survivant(s) < quorum %v).", [target_profile_id, f.storageSurvivingReplicas, f.storageWriteQuorum]),
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:twin_storage_quorum",
		"violated_requirement_id": "REQ-Twin-Storage-02",
	}
}

# ==============================================================================
# RÈGLE 3 : CAPACITÉ BARE-METAL / SR-IOV / HUGEPAGES SUFFISANTE APRÈS BASCULE
# ==============================================================================
violations contains v if {
	report.requirements.requireWorkloadCapacityOnDcLoss == true
	some f in target_profile.faultResults
	f.faultId == "dc_loss_primary"
	f.rescheduledWorkloadsFit != true
	v := {
		"rule": "twin_rule_03_workload_capacity_on_dc_loss",
		"category": "capacity",
		"profileId": target_profile_id,
		"faultId": "dc_loss_primary",
		"message": sprintf("Profil '%s' : capacité Bare-Metal / SR-IOV insuffisante sur les DCs survivants pour absorber les workloads (%v).", [target_profile_id, concat(", ", f.unschedulableModules)]),
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:twin_capacity_headroom",
		"violated_requirement_id": "REQ-Twin-Capacity-03",
	}
}

# ==============================================================================
# RÈGLE 4 : SURVIE À LA PERTE D'UNE VOIE D'ALIMENTATION ÉLECTRIQUE (PDU-A / 2N)
# ==============================================================================
violations contains v if {
	report.requirements.requireSinglePowerFeedSurvival == true
	some f in target_profile.faultResults
	f.faultId == "power_feed_loss_pdu_a"
	f.survivesZeroTouch != true
	v := {
		"rule": "twin_rule_04_dual_power_feed_survival",
		"category": "power",
		"profileId": target_profile_id,
		"faultId": "power_feed_loss_pdu_a",
		"message": sprintf("Profil '%s' : la perte de la voie électrique PDU-A provoque une interruption de service (exigence 2N violée).", [target_profile_id]),
		"violated_clause_urn": "urn:archinex:kb:clause:energy:dual_feed_2n",
		"violated_requirement_id": "REQ-Lot1-1343",
	}
}

# ==============================================================================
# RÈGLE 5 : RATTACHEMENT REDFISH BMC (SUSHY-EMULATOR / CAPM3)
# ==============================================================================
violations contains v if {
	report.requirements.requireBmcRedfishBound == true
	some sys in target_profile.sushyEmulator.systems
	not startswith(sys.bmcAddress, "redfish+http")
	v := {
		"rule": "twin_rule_05_bmc_redfish_bound",
		"category": "baremetal",
		"profileId": target_profile_id,
		"message": sprintf("Profil '%s' : le système Bare-Metal '%s' ne possède pas d'adresse Redfish valide (%s).", [target_profile_id, sys.name, sys.bmcAddress]),
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:capi_providers",
		"violated_requirement_id": "REQ-Sylva-02",
	}
}

# ==============================================================================
# RÈGLE 6 : RESPECT DU BUDGET RTO MAXIMAL SOUS PANNE
# ==============================================================================
violations contains v if {
	max_rto := object.get(report.requirements, "maxAllowedRtoSeconds", 0)
	target_profile.worstCaseRtoSeconds > max_rto
	v := {
		"rule": "twin_rule_06_rto_budget_exceeded",
		"category": "resilience",
		"profileId": target_profile_id,
		"message": sprintf("Profil '%s' : RTO pire cas estimé à %vs, supérieur au budget maximal autorisé (%vs).", [target_profile_id, target_profile.worstCaseRtoSeconds, max_rto]),
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:twin_rto_budget",
		"violated_requirement_id": "REQ-Twin-RTO-06",
	}
}

# ==============================================================================
# RÈGLE 7 : VALIDITÉ DU DAG DES UNITÉS SYLVA
# ==============================================================================
violations contains v if {
	target_profile.model.unitDagValid != true
	v := {
		"rule": "twin_rule_07_sylva_unit_dag_valid",
		"category": "gitops",
		"profileId": target_profile_id,
		"message": sprintf("Profil '%s' : le graphe de dépendances des unités Sylva (capi -> cilium -> multus -> sriov) est invalide.", [target_profile_id]),
		"violated_clause_urn": "urn:archinex:kb:clause:sylva:unit_dag",
		"violated_requirement_id": "REQ-Sylva-07",
	}
}

violation_messages contains msg if {
	some v in violations
	msg := v.message
}

default verdict := "violated"

verdict := "insufficient_input" if {
	count(object.get(report, "profiles", [])) == 0
}

verdict := "compliant" if {
	count(object.get(report, "profiles", [])) > 0
	count(violations) == 0
}

evaluation := {
	"verdict": verdict,
	"target_profile_id": target_profile_id,
	"mode": object.get(report, "mode", "proposal"),
	"recommended_profile_id": object.get(report, "recommendedProfileId", "3dc-active"),
	"violations": violations,
	"violation_messages": violation_messages,
	"rule_count": 7,
	"passed_rules_count": 7 - count(violations),
}
