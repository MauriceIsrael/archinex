package archinex.adr015_test

import rego.v1
import data.archinex.adr015

test_compliant_intra_zone if {
	mock_input := {
		"traffic_flows": [
			{
				"id": "flow-01",
				"src_ip": "192.0.2.10",
				"dst_ip": "192.0.2.20",
				"traffic_class": "management"
			}
		]
	}
	adr015.status.verdict == "compliant" with input as mock_input
	count(adr015.all_violations) == 0 with input as mock_input
}

test_allowed_exception_flow if {
	# OAM est isolé de user_plane sauf pour la classe "telemetry"
	mock_input := {
		"traffic_flows": [
			{
				"id": "flow-02",
				"src_ip": "192.0.2.15",
				"dst_ip": "198.51.100.25",
				"traffic_class": "telemetry"
			}
		]
	}
	adr015.status.verdict == "compliant" with input as mock_input
	count(adr015.all_violations) == 0 with input as mock_input
}

test_cross_zone_violation if {
	# OAM vers user_plane avec classe non autorisée (ex: "raw_http")
	mock_input := {
		"traffic_flows": [
			{
				"id": "flow-03",
				"src_ip": "192.0.2.15",
				"dst_ip": "198.51.100.25",
				"traffic_class": "raw_http"
			}
		]
	}
	adr015.status.verdict == "violated" with input as mock_input
	adr015.all_violations == ["rule_cross_zone_isolation"] with input as mock_input
}

test_unsecured_oam_violation if {
	# Flux entrant vers OAM avec classe non autorisée (ex: "game_streaming")
	mock_input := {
		"traffic_flows": [
			{
				"id": "flow-05",
				"src_ip": "203.0.113.10",
				"dst_ip": "192.0.2.50",
				"traffic_class": "game_streaming"
			}
		]
	}
	adr015.status.verdict == "violated" with input as mock_input
	adr015.all_violations == ["rule_unsecured_oam"] with input as mock_input
}

test_unresolved_ip_insufficient_input if {
	# IP 10.0.0.1 n'est dans aucun préfixe de zone déclaré
	mock_input := {
		"traffic_flows": [
			{
				"id": "flow-04",
				"src_ip": "10.0.0.1",
				"dst_ip": "198.51.100.25",
				"traffic_class": "telemetry"
			}
		]
	}
	adr015.status.verdict == "insufficient_input" with input as mock_input
	count(adr015.unresolved_flows) == 1 with input as mock_input
}

test_empty_flows_not_applicable if {
	mock_input := {
		"traffic_flows": []
	}
	adr015.status.verdict == "not_applicable" with input as mock_input
}
