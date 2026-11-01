package archinex.edp.common_test

import rego.v1
import data.archinex.edp.common

# Test de l'extraction d'hôte et prévention du piège de sous-chaîne
test_host_of_standard if {
	common.host_of("http://192.0.2.10:8080/redfish/v1") == "192.0.2.10"
	common.host_of("https://srv-node-01.corp.internal/bmc") == "srv-node-01.corp.internal"
	common.host_of("ipmi://admin:secret@[2001:db8::1]:623") == "2001:db8::1"
}

# Reproduction du piège du PoC : 10.0.0.100 face à 10.0.0.10
test_host_of_no_substring_confusion if {
	extracted := common.host_of("https://10.0.0.100/redfish")
	extracted == "10.0.0.100"
	extracted != "10.0.0.10"
}

# Test des entrées manquantes (anti-vacuité)
test_missing_inputs if {
	input_data := {"k8s_manifests": [{"kind": "Cluster"}]}
	required := ["k8s_manifests", "nautobot_devices"]
	missing := common.missing_inputs(input_data, required)
	missing == ["nautobot_devices"]
}

# Test de verdict à 4 états
test_status_compliant if {
	status := common.build_status("EDP-TEST", true, [], [])
	status.verdict == "compliant"
	status.applicable == true
	count(status.violations) == 0
}

test_status_violated if {
	status := common.build_status("EDP-TEST", true, ["rule_fail"], [])
	status.verdict == "violated"
	count(status.violations) == 1
}

test_status_insufficient_input if {
	status := common.build_status("EDP-TEST", true, [], ["k8s_manifests"])
	status.verdict == "insufficient_input"
}

test_status_not_applicable if {
	status := common.build_status("EDP-TEST", false, [], [])
	status.verdict == "not_applicable"
}
