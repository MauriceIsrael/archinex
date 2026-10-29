# METADATA
# title: Bibliothèque Rego Commune Archinex pour Paquets de Décision Exécutables (EDP)
# description: Helpers de sécurité, extraction d'hôte et convention de verdict normatif à 4 états.
# authors:
#   - Maurice Israel <maurice@archinex.io>

package archinex.edp.common

import rego.v1

# ==============================================================================
# DOCUMENTATION DES TROIS PIÈGES CLASSIQUES REGO & HLD
# ==============================================================================
# 1. PIÈGE DU CHAMP INDÉFINI :
#    En Rego, l'accès à un champ absent (ex: cluster.spec.baremetal) rend la règle
#    indéfinie. Si une règle de violation s'appuie sur une condition niée sans
#    vérifier la présence du champ, elle ne se déclenche jamais (« faux négatif »).
#    Solution : Utiliser 'has_field' systématiquement avant d'interroger un champ facultatif.
#
# 2. PIÈGE DE LA COMPARAISON PAR SOUS-CHAÎNE :
#    L'usage de 'contains(bmc_url, ip)' valide à tort l'adresse 10.0.0.100 contre 10.0.0.10
#    car la sous-chaîne correspond.
#    Solution : Extraire rigoureusement l'hôte avec 'host_of(url)' et comparer par égalité exacte.
#
# 3. PIÈGE DE L'ENSEMBLE VIDE (VACUITÉ) :
#    Une règle universelle du type "every d in devices { ... }" est vraie par vacuité
#    si devices est vide ou absent.
#    Solution : Contrôle préalable obligatoire via 'missing_inputs' et verdict
#    'insufficient_input' dès qu'un conteneur requis est vide.
# ==============================================================================

# Suppression du schéma réseau (http://, https://, ipmi://, etc.)
strip_scheme(url) := parts[1] if {
	parts := split(url, "://")
	count(parts) > 1
} else := url

# Suppression des identifiants (user:pass@host)
strip_auth(hp) := parts[1] if {
	parts := split(hp, "@")
	count(parts) > 1
} else := hp

# Extraction selon le type d'adresse (IPv6 entre crochets vs standard)
extract_host(hp) := trim_prefix(p[0], "[") if {
	startswith(hp, "[")
	p := split(hp, "]")
} else := p[0] if {
	p := split(hp, ":")
}

# Extraction sûre de l'hôte (nom d'hôte ou adresse IP) depuis une URL
host_of(url) := host if {
	without_scheme := strip_scheme(url)
	path_parts := split(without_scheme, "/")
	host_and_port := path_parts[0]
	cleaned_host_port := strip_auth(host_and_port)
	host := extract_host(cleaned_host_port)
}

# Vérifie si un objet contient un champ non nul
has_field(obj, key) if {
	is_object(obj)
	_ := obj[key]
}

# Calcule les entrées manquantes parmi une liste de clés requises
missing_inputs(input_data, required_keys) := [k |
	some k in required_keys
	not has_field(input_data, k)
]

# Calcule le verdict final à partir des violations, de l'applicabilité et des manques
compute_verdict(is_applicable, violations, missing) := "not_applicable" if not is_applicable

compute_verdict(is_applicable, violations, missing) := "insufficient_input" if {
	is_applicable
	count(missing) > 0
}

compute_verdict(is_applicable, violations, missing) := "violated" if {
	is_applicable
	count(missing) == 0
	count(violations) > 0
}

compute_verdict(is_applicable, violations, missing) := "compliant" if {
	is_applicable
	count(missing) == 0
	count(violations) == 0
}

# Constructeur standard de statut EDP
build_status(edp_id, is_applicable, violations, missing) := {
	"edp_id": edp_id,
	"verdict": compute_verdict(is_applicable, violations, missing),
	"applicable": is_applicable,
	"violations": violations,
	"missing_inputs": missing
}
