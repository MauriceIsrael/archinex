package archinex.edp.adr012_test

import rego.v1
import data.archinex.edp.adr012

# Mock conforme de base (RFC 5737 : TEST-NET-1 192.0.2.0/24)
base_compliant_input := {
	"sources": {
		"k8s_manifests": {
			"provenance": {"tool": "helm", "version": "3.14", "command": "template", "sha256": "0000000000000000000000000000000000000000000000000000000000000000", "generated_at": "2026-10-29T10:00:00Z"},
			"content": [
				{
					"kind": "Cluster",
					"metadata": {"name": "cluster-telco-01"},
					"spec": {"infrastructureRef": {"name": "infra-suse"}}
				},
				{
					"kind": "BareMetalHost",
					"metadata": {"name": "srv-edge-01"},
					"spec": {
						"role": "control-plane",
						"bmc": {"address": "https://192.0.2.10/redfish/v1"}
					}
				}
			]
		},
		"nautobot_planned_devices": {
			"provenance": {"tool": "nautobot", "version": "2.0", "command": "export", "sha256": "0000000000000000000000000000000000000000000000000000000000000000", "generated_at": "2026-10-29T10:00:00Z"},
			"content": [
				{
					"name": "srv-edge-01",
					"status": "planned",
					"oob_ip": "192.0.2.10",
					"interfaces": [
						{"name": "oob0", "type": "management"},
						{"name": "eth0", "type": "data"}
					]
				}
			]
		}
	}
}

# 1. Test du mock conforme
test_adr012_compliant if {
	st := adr012.status with input as base_compliant_input
	st.verdict == "compliant"
	count(st.violations) == 0
}

# 2. Test Règle 1 : OOB manquant
test_adr012_fail_missing_oob if {
	bad_input := json.patch(base_compliant_input, [
		{"op": "remove", "path": "/sources/nautobot_planned_devices/content/0/oob_ip"}
	])
	st := adr012.status with input as bad_input
	st.verdict == "violated"
	st.violations == ["rule_oob_required"]
}

# 3. Test Règle 2 : Décalage BMC URL (cas reproduit de sous-chaîne 192.0.2.100 vs 192.0.2.10)
test_adr012_fail_bmc_mismatch if {
	bad_input := json.patch(base_compliant_input, [
		{"op": "replace", "path": "/sources/k8s_manifests/content/1/spec/bmc/address", "value": "https://192.0.2.100/redfish"}
	])
	st := adr012.status with input as bad_input
	st.verdict == "violated"
	st.violations == ["rule_bmc_exact_match"]
}

# 4. Test Règle 3 : Rôle non autorisé
test_adr012_fail_invalid_role if {
	bad_input := json.patch(base_compliant_input, [
		{"op": "replace", "path": "/sources/k8s_manifests/content/1/spec/role", "value": "unauthorized-custom-role"}
	])
	st := adr012.status with input as bad_input
	st.verdict == "violated"
	st.violations == ["rule_role_valid"]
}

# 5. Test Règle 4 : Partitionnement d'interfaces manquant
test_adr012_fail_missing_partitioning if {
	bad_input := json.patch(base_compliant_input, [
		{"op": "replace", "path": "/sources/nautobot_planned_devices/content/0/interfaces", "value": [{"name": "single_eth"}]}
	])
	st := adr012.status with input as bad_input
	st.verdict == "violated"
	st.violations == ["rule_partitioned_interfaces"]
}

# 6. Test Règle 5 : Spécification Cluster vide (reproduction du cas spec: {})
test_adr012_fail_empty_cluster_spec if {
	bad_input := json.patch(base_compliant_input, [
		{"op": "replace", "path": "/sources/k8s_manifests/content/0/spec", "value": {}}
	])
	st := adr012.status with input as bad_input
	st.verdict == "violated"
	st.violations == ["rule_cluster_spec_non_empty"]
}

# 7. Test Règle 6 : Statut non planifié (ex: active au lieu de planned)
test_adr012_fail_invalid_status if {
	bad_input := json.patch(base_compliant_input, [
		{"op": "replace", "path": "/sources/nautobot_planned_devices/content/0/status", "value": "active"}
	])
	st := adr012.status with input as bad_input
	st.verdict == "violated"
	st.violations == ["rule_planned_status"]
}

# 8. Test d'agrégation multi-dérive (PoC historique)
test_adr012_multi_drift if {
	drift_input := json.patch(base_compliant_input, [
		{"op": "replace", "path": "/sources/k8s_manifests/content/0/spec", "value": {}},
		{"op": "replace", "path": "/sources/k8s_manifests/content/1/spec/role", "value": "bad-role"},
		{"op": "replace", "path": "/sources/nautobot_planned_devices/content/0/status", "value": "deployed"}
	])
	st := adr012.status with input as drift_input
	st.verdict == "violated"
	count(st.violations) == 3
}
