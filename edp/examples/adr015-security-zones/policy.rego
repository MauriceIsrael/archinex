package archinex.adr015

import rego.v1
import data.archinex.edp.common

# Métadonnées de l'EDP
edp_id := "EDP-ADR015-01"

# Ontologie des zones de sécurité réseau (ADR-015)
# Surchargée par data.ontology.network_zones si compilée
default default_zones := {
	"oam": {
		"prefixes": ["192.0.2.0/24"],
		"isolated_from": ["user_plane"],
		"allowed_traffic_classes": ["telemetry"],
	},
	"user_plane": {
		"prefixes": ["198.51.100.0/24"],
		"isolated_from": ["oam"],
		"allowed_traffic_classes": [],
	},
	"signaling": {
		"prefixes": ["203.0.113.0/24"],
		"isolated_from": [],
		"allowed_traffic_classes": ["sctp"],
	},
}

zones := data.ontology.network_zones if {
	data.ontology.network_zones
} else := default_zones

# Résolution d'une adresse IP vers sa zone de sécurité
resolve_zone(ip) := zone_name if {
	some zone_name, zone_data in zones
	some prefix in zone_data.prefixes
	net.cidr_contains(prefix, ip)
}

# Extraction robuste des flux réseau (supportant le payload refined_input et le mock unitaire)
traffic_flows := input.sources.network_flows.content.traffic_flows if {
	input.sources.network_flows.content.traffic_flows
} else := input.traffic_flows if {
	input.traffic_flows
} else := []

# Règle d'insuffisance : flux contenant une IP non résolue
unresolved_flows contains msg if {
	some flow in traffic_flows
	not resolve_zone(flow.src_ip)
	msg := concat("", ["Flux avec IP source inconnue non rattachable a une zone : ", flow.src_ip])
}

unresolved_flows contains msg if {
	some flow in traffic_flows
	not resolve_zone(flow.dst_ip)
	msg := concat("", ["Flux avec IP destination inconnue non rattachable a une zone : ", flow.dst_ip])
}

# Règle 1 : Violation d'isolation de zone
deny_cross_zone_isolation contains "rule_cross_zone_isolation" if {
	some flow in traffic_flows
	src_zone := resolve_zone(flow.src_ip)
	dst_zone := resolve_zone(flow.dst_ip)
	src_zone
	dst_zone

	# Vérifier si la zone cible est déclarée isolée
	zone_config := zones[src_zone]
	zone_config.isolated_from[_] == dst_zone

	# Vérifier si la classe de trafic n'est pas autorisée en exception
	allowed := zone_config.allowed_traffic_classes[_] == flow.traffic_class
	not allowed
}

# Règle 2 : Protection OAM - Flux entrants restreints
deny_unsecured_oam contains "rule_unsecured_oam" if {
	some flow in traffic_flows
	dst_zone := resolve_zone(flow.dst_ip)
	dst_zone == "oam"
	allowed_oam_classes := ["telemetry", "management"]
	not flow.traffic_class in allowed_oam_classes
}

# Agrégation des violations
all_violations := array.concat(
	[v | some v in deny_cross_zone_isolation],
	[v | some v in deny_unsecured_oam]
)

# Calcul des entrées manquantes
missing := [msg | some msg in unresolved_flows]

# Statut standard EDP à 4 états (Invariant I)
is_applicable := count(traffic_flows) > 0
status := common.build_status(edp_id, is_applicable, all_violations, missing)
