/**
 * Taxonomie unifiée TOGAF TRM + Standards (ANSSI / NIS2 / 3GPP / arc42)
 * et Référentiel des Briques d'Architecture (Architecture Building Blocks).
 *
 * Sert de socle unique entre :
 * - L'audit des exigences RFP (routage des commodités vers des emplacements de décision),
 * - Le Document Engine (couches application / component / infrastructure / iaas / context),
 * - Le graphe d'ontologie (axes de raffinement et fermeture transitive des prérequis),
 * - Le catalogue de composants logiques (instanciation de la topologie complète).
 */

export type DocumentEngineLayer = 'context' | 'application' | 'component' | 'infrastructure' | 'iaas';

export type TogafDomainId =
	| 'application-business'
	| 'security-trust'
	| 'network-connectivity'
	| 'platform-compute'
	| 'data-persistence'
	| 'operations-observability'
	| 'facilities-sovereignty';

export interface TogafDomainDefinition {
	id: TogafDomainId;
	label: string;
	shortLabel: string;
	documentEngineLayer: DocumentEngineLayer;
	togafReference: string;
	description: string;
}

export const TOGAF_DOMAINS: Record<TogafDomainId, TogafDomainDefinition> = {
	'application-business': {
		id: 'application-business',
		label: 'Applications Métier & Services',
		shortLabel: 'Applications',
		documentEngineLayer: 'application',
		togafReference: 'TOGAF Phase B/C — Application Architecture & Business Services',
		description: 'Fonctions métier critiques, serveurs applicatifs, SIG/cartographie, services temps réel et interfaces API.'
	},
	'security-trust': {
		id: 'security-trust',
		label: 'Sécurité, Identité & Chaîne de Confiance',
		shortLabel: 'Sécurité & Confiance',
		documentEngineLayer: 'component',
		togafReference: 'TOGAF Security Architecture / ANSSI RGS / NIS2 Art. 21',
		description: 'Racine matérielle HSM, hiérarchie PKI, coffre de secrets Vault, IAM/FIDO2, bastion PAM et cloisonnement de zones.'
	},
	'network-connectivity': {
		id: 'network-connectivity',
		label: 'Réseau, Connectivité & Périmètre',
		shortLabel: 'Réseau & Périmètre',
		documentEngineLayer: 'infrastructure',
		togafReference: 'TOGAF Phase D — Network Infrastructure & Perimeter Connectivity',
		description: 'Fabric datacenter EVPN, interconnexions WAN IPsec, proxy sortant explicite, reverse proxy WAF, DNS/DHCP/IPAM et OOB.'
	},
	'platform-compute': {
		id: 'platform-compute',
		label: 'Plateforme d’Exécution & Calcul',
		shortLabel: 'Plateforme & Compute',
		documentEngineLayer: 'infrastructure',
		togafReference: 'TOGAF Phase D — Platform Services & Runtime Containers',
		description: 'Substrat matériel bare-metal, clusters Kubernetes, registre d’images OCI signé et fidélité multi-environnements.'
	},
	'data-persistence': {
		id: 'data-persistence',
		label: 'Données, Stockage & Persistance',
		shortLabel: 'Données & Stockage',
		documentEngineLayer: 'component',
		togafReference: 'TOGAF Phase C — Data Architecture & Storage Persistence',
		description: 'Réplication bloc/objet distribuée, chiffrement au repos LUKS2/KMS et sauvegardes immuables WORM.'
	},
	'operations-observability': {
		id: 'operations-observability',
		label: 'Exploitation, Observabilité & Résilience',
		shortLabel: 'Exploitation & PRA',
		documentEngineLayer: 'component',
		togafReference: 'TOGAF Architecture Governance / ITIL / ISO 22301',
		description: 'Collecte OTLP, corrélation SIEM/SOC, alerting SLO, bascule PCA/PRA multi-sites et exercices d’homologation.'
	},
	'facilities-sovereignty': {
		id: 'facilities-sovereignty',
		label: 'Installations Physiques, Temps & Souveraineté',
		shortLabel: 'Installations & Temps',
		documentEngineLayer: 'iaas',
		togafReference: 'TOGAF Physical Infrastructure / EU Cloud Sovereignty / ITU-T Timing',
		description: 'Hébergement datacenter, double adduction électrique 2N, refroidissement, synchronisation temporelle et souveraineté.'
	}
};

export const TOGAF_DOMAIN_ORDER: readonly TogafDomainId[] = [
	'application-business',
	'security-trust',
	'network-connectivity',
	'platform-compute',
	'data-persistence',
	'operations-observability',
	'facilities-sovereignty'
];

export type ReferenceDecisionType = 'type1_deliberate' | 'type2_default_ratify';

export interface ReferenceBuildingBlock {
	id: string;
	title: string;
	togafDomain: TogafDomainId;
	documentEngineLayer: DocumentEngineLayer;
	defaultDecisionType: ReferenceDecisionType;
	axisUrn: string;
	defaultLeafUrn: string;
	logicalComponentName?: string;
	rationale: string;
	keywords: string[];
}

/**
 * Catalogue unifié des 29 briques d'architecture de référence alignées sur les axes ontologiques d'Archinex.
 * Sert à :
 * 1. Capturer les clauses « commodité » évacuées du débat vers des emplacements de décision dédiés ;
 * 2. Détecter les angles morts architecturaux sur les 7 domaines TOGAF ;
 * 3. Aligner les axes ontologiques, les composants logiques et les couches Document Engine.
 */
export const TOGAF_REFERENCE_BUILDING_BLOCKS: ReferenceBuildingBlock[] = [
	// --- 1. Security & Chain of Trust (transverse requis pour toute architecture critique) ---
	{
		id: 'hsm-key-custody',
		title: 'Racine Matérielle HSM & Cérémonie de Clés',
		togafDomain: 'security-trust',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:hsm_key_custody',
		defaultLeafUrn: 'urn:archinex:ontology:security:hsm:eviden_proteccio',
		logicalComponentName: 'hsm-appliance',
		rationale: 'Requis dès que des clés racines PKI, de chiffrement au repos ou d’auto-déverrouillage doivent être protégées matériellement.',
		keywords: ['hsm', 'pkcs11', 'pkcs#11', 'fips 140', 'proteccio', 'thales luna', 'utimaco', 'nshield', 'ceremonie de cles', 'materiel cryptographique']
	},
	{
		id: 'pki-hierarchy',
		title: 'Hiérarchie PKI (Autorité Racine Hors Ligne & Autorités Intermédiaires)',
		togafDomain: 'security-trust',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:pki_hierarchy',
		defaultLeafUrn: 'urn:archinex:ontology:security:pki:root_offline_airgap',
		logicalComponentName: 'pki-ca',
		rationale: 'Toute architecture émettant des certificats X.509 internes doit définir sa racine hors ligne et ses autorités subordonnées.',
		keywords: ['pki', 'autorite de certification', 'root ca', 'ca racine', 'sous-ca', 'crl', 'ocsp', 'x509', 'x.509', 'certificat']
	},
	{
		id: 'pki-3gpp-ndsaf',
		title: 'PKI Télécom 3GPP TS 33.310 (CMPv2 / NDS-AF)',
		togafDomain: 'security-trust',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:pki_3gpp_ndsaf',
		defaultLeafUrn: 'urn:archinex:ontology:security:pki:ejbca_cmpv2',
		logicalComponentName: 'pki-ca',
		rationale: 'Indispensable pour l’enrôlement automatique des certificats IPsec IKEv2 des équipements réseau et cœur télécom.',
		keywords: ['cmpv2', '33.310', 'nds/af', 'ejbca', 'seg', 'enrolement', 'scep', 'acme']
	},
	{
		id: 'vault-unseal-mode',
		title: 'Coffre de Secrets & Mode de Déverrouillage (Auto-Unseal PKCS#11)',
		togafDomain: 'security-trust',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:vault_unseal_mode',
		defaultLeafUrn: 'urn:archinex:ontology:security:vault:openbao_pkcs11_hsm',
		logicalComponentName: 'vault-cluster',
		rationale: 'Élimine le redémarrage manuel par clés Shamir en couplant le déverrouillage du coffre au HSM.',
		keywords: ['auto-unseal', 'unseal', 'deverrouillage', 'shamir', 'openbao', 'kms', 'vault']
	},
	{
		id: 'secrets-vault-management',
		title: 'Gestion Centralisée des Secrets & Baux Dynamiques',
		togafDomain: 'security-trust',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:secrets_vault_management',
		defaultLeafUrn: 'urn:archinex:ontology:security:secrets:vault_dynamic_leases',
		logicalComponentName: 'vault-cluster',
		rationale: 'Garantit l’absence de secret statique en clair dans les dépôts Git et la rotation automatique des identifiants.',
		keywords: ['secret', 'secrets', 'external-secrets', 'eso', 'coffre-fort', 'mot de passe', 'rotation', 'credential']
	},
	{
		id: 'iam-federation-mfa',
		title: 'Fédération d’Identité (OIDC / SAML), MFA FIDO2 & RBAC',
		togafDomain: 'security-trust',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:iam_federation_mfa',
		defaultLeafUrn: 'urn:archinex:ontology:security:iam:oidc_fido2_rbac',
		logicalComponentName: 'iam-keycloak',
		rationale: 'Point de décision unifié pour l’authentification forte humaine et machine.',
		keywords: ['iam', 'oidc', 'keycloak', 'lemonldap', 'saml', 'mfa', 'fido2', 'webauthn', 'rbac', 'authentification', 'sso', 'annuaire', 'ldap']
	},
	{
		id: 'pam-admin-bastion',
		title: 'Bastion d’Administration PAM en Coupure de Zone OAM',
		togafDomain: 'security-trust',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:pam_admin_bastion',
		defaultLeafUrn: 'urn:archinex:ontology:security:bastion:wallix_pam',
		logicalComponentName: 'admin-bastion',
		rationale: 'Exigé par NIS2 et le guide d’hygiène ANSSI pour tout rebond d’administration et enregistrement de session privilégiée.',
		keywords: ['bastion', 'pam', 'wallix', 'teleport', 'ssh', 'rdp', 'rebond', 'enregistrement de session', 'privilege']
	},
	{
		id: 'pki-mtls-workload',
		title: 'PKI Interne Workload & mTLS Automatisé (Cert-Manager / SPIFFE)',
		togafDomain: 'security-trust',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:pki_mtls_workload',
		defaultLeafUrn: 'urn:archinex:ontology:security:pki:cert_manager_spiffe_mtls',
		logicalComponentName: 'pki-ca',
		rationale: 'Chiffre et authentifie mutuellement tous les flux est-ouest inter-microservices.',
		keywords: ['mtls', 'spiffe', 'spire', 'cert-manager', 'service mesh', 'est-ouest']
	},
	{
		id: 'security-zoning',
		title: 'Zonage de Sécurité & Cloisonnement OAM / Usager',
		togafDomain: 'security-trust',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:security_zoning',
		defaultLeafUrn: 'urn:archinex:ontology:security:zone:oam',
		rationale: 'Structure le cloisonnement entre zones de confiance, exploitation et plans de données.',
		keywords: ['zone de securite', 'zonage', 'cloisonnement', 'oam', 'dmz', 'nis2', 'segmentation']
	},

	// --- 2. Network & Connectivity ---
	{
		id: 'egress-filtering-proxy',
		title: 'Proxy Sortant Explicite & Filtrage FQDN de Liste Blanche',
		togafDomain: 'network-connectivity',
		documentEngineLayer: 'infrastructure',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:egress_filtering_proxy',
		defaultLeafUrn: 'urn:archinex:ontology:network:proxy:squid_explicit_fqdn',
		logicalComponentName: 'ingress-waf-proxy',
		rationale: 'Aucune charge interne ne doit disposer d’un accès sortant direct sans médiation par proxy explicite journalisé.',
		keywords: ['proxy sortant', 'forward proxy', 'squid', 'egress', 'filtrage fqdn', 'mandataire', 'sortie internet']
	},
	{
		id: 'ingress-reverse-proxy',
		title: 'Reverse Proxy Ingress, Terminaison TLS & WAF',
		togafDomain: 'network-connectivity',
		documentEngineLayer: 'infrastructure',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:ingress_reverse_proxy',
		defaultLeafUrn: 'urn:archinex:ontology:network:ingress:envoy_coraza_waf',
		logicalComponentName: 'ingress-waf-proxy',
		rationale: 'Protège tous les points d’entrée HTTPS/API exposés en DMZ avant le routage vers les zones applicatives.',
		keywords: ['reverse proxy', 'ingress', 'waf', 'envoy', 'coraza', 'haproxy', 'nginx', 'modsecurity', 'terminaison tls']
	},
	{
		id: 'dns-dhcp-ipam',
		title: 'Services Réseau Fondamentaux (DNS Autoritaire/Récursif, DHCP, IPAM)',
		togafDomain: 'network-connectivity',
		documentEngineLayer: 'infrastructure',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:dns_dhcp_ipam',
		defaultLeafUrn: 'urn:archinex:ontology:network:dns:unbound_bind9_kea',
		rationale: 'Socle d’adressage et de résolution de noms indispensable avant toute hydratation de composants et certificats.',
		keywords: ['dns', 'dhcp', 'ipam', 'unbound', 'bind9', 'kea', 'coredns', 'dnssec', 'rpz', 'resolution de noms']
	},
	{
		id: 'oob-management',
		title: 'Réseau d’Administration Hors-Bande (OOB / Redfish)',
		togafDomain: 'network-connectivity',
		documentEngineLayer: 'infrastructure',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:oob_management',
		defaultLeafUrn: 'urn:archinex:ontology:telecom:network:oob',
		rationale: 'Isole le plan de contrôle matériel BMC/iDRAC/iLO du trafic applicatif.',
		keywords: ['oob', 'hors-bande', 'hors bande', 'bmc', 'redfish', 'idrac', 'ilo', 'ipmi']
	},
	{
		id: 'network-underlay-fabric',
		title: 'Fabric Datacenter (Spine-Leaf BGP EVPN)',
		togafDomain: 'network-connectivity',
		documentEngineLayer: 'infrastructure',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:network_underlay_fabric',
		defaultLeafUrn: 'urn:archinex:ontology:telecom:network:spine_leaf_evpn',
		rationale: 'Détermine la topologie de commutation, les VRF et la redondance ToR.',
		keywords: ['spine', 'leaf', 'evpn', 'vxlan', 'bgp', 'vrf', 'fabric', 'tor']
	},
	{
		id: 'wan-interco-encryption',
		title: 'Chiffrement des Interconnexions WAN & Médiation Partenaire',
		togafDomain: 'network-connectivity',
		documentEngineLayer: 'infrastructure',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:wan_interco_encryption',
		defaultLeafUrn: 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256',
		rationale: 'Impose le profil cryptographique IPsec/MACsec et les points de médiation obligatoires.',
		keywords: ['ipsec', 'ikev2', 'wan', 'interconnexion', 'tunnel', 'secgw', 'dea', 's6a', 'mediation']
	},

	// --- 3. Application & Business Services ---
	{
		id: 'gis-tile-engine',
		title: 'Serveur Cartographique SIG / GIS & Fonds de Carte Hors Ligne',
		togafDomain: 'application-business',
		documentEngineLayer: 'application',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:gis_tile_engine',
		defaultLeafUrn: 'urn:archinex:ontology:application:gis:geoserver_postgis_offline',
		logicalComponentName: 'gis-server',
		rationale: 'Brique applicative transverse de géolocalisation WMS/WMTS/WFS pouvant opérer en mode déconnecté.',
		keywords: ['cartographie', 'cartographique', 'carte', 'sig', 'gis', 'wms', 'wfs', 'wmts', 'geoserver', 'postgis', 'tuiles', 'qgis']
	},
	{
		id: 'gis-location-fusion',
		title: 'Fusion de Localisation Multi-Sources, Cloisonnement Identité & Géofencing SIG',
		togafDomain: 'application-business',
		documentEngineLayer: 'application',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:gis_location_fusion',
		defaultLeafUrn: 'urn:archinex:ontology:application:gis:central_fusion_hybrid_geofencing',
		logicalComponentName: 'gis-server',
		rationale: 'Détermine quel composant logique (gis-server, ptt-server, core-network) porte le pipeline de fusion de position multi-sources, le cloisonnement des identités radio et l’évaluation du géofencing.',
		keywords: ['fusion de localisation', 'geofencing', 'géofencing', 'localisation multi-sources', 'pipeline de localisation', 'imsi', 'supi', 'suci', 'geofence', 'positionnement']
	},

	// --- 4. Platform & Compute ---
	{
		id: 'compute-substrate',
		title: 'Substrat Compute & Profils Matériels / Orchestration',
		togafDomain: 'platform-compute',
		documentEngineLayer: 'infrastructure',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:compute_substrate',
		defaultLeafUrn: 'urn:archinex:ontology:infrastructure:server:baremetal',
		rationale: 'Détermine le socle physique, SR-IOV/DPDK et la distribution Kubernetes cible.',
		keywords: ['baremetal', 'bare-metal', 'hyperviseur', 'sylva', 'rke2', 'kubernetes', 'sriov', 'dpdk', 'compute']
	},
	{
		id: 'env-fidelity',
		title: 'Parité Multi-Environnements (Dev / Recette Iso-Prod / Prod)',
		togafDomain: 'platform-compute',
		documentEngineLayer: 'infrastructure',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:env_fidelity',
		defaultLeafUrn: 'urn:archinex:ontology:platform:env:iso_prod_3tiers',
		rationale: 'Impose l’architecture identique des environnements de qualification et de production.',
		keywords: ['iso-prod', 'recette', 'preprod', 'staging', 'environnement', 'parite']
	},
	{
		id: 'oci-artifact-registry',
		title: 'Registre d’Artéfacts OCI Air-Gap, Signature Cosign & Scan CVE',
		togafDomain: 'platform-compute',
		documentEngineLayer: 'infrastructure',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:oci_artifact_registry',
		defaultLeafUrn: 'urn:archinex:ontology:platform:registry:harbor_cosign_trivy',
		rationale: 'Stocke localement images conteneurs et charts Helm signés avec blocage des vulnérabilités critiques.',
		keywords: ['registre', 'registry', 'harbor', 'oci', 'cosign', 'trivy', 'sbom', 'mirror', 'air-gap', 'helm']
	},

	// --- 5. Data & Persistence ---
	{
		id: 'storage-replication',
		title: 'Topologie de Réplication Stockage (Bloc / Objet)',
		togafDomain: 'data-persistence',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:storage_replication',
		defaultLeafUrn: 'urn:archinex:ontology:storage:csi:ceph_rbd_3replicas',
		rationale: 'Définit la durabilité des données applicatives et la tolérance aux pannes matérielles.',
		keywords: ['stockage', 'ceph', 'rook', 'rbd', 'csi', 's3', 'erasure', 'longhorn', 'persistance']
	},
	{
		id: 'encryption-at-rest',
		title: 'Chiffrement au Repos & Gestion Externe des Clés',
		togafDomain: 'data-persistence',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:encryption_at_rest',
		defaultLeafUrn: 'urn:archinex:ontology:security:crypto:luks2_kms_hsm',
		rationale: 'Protège les disques et volumes contre l’accès physique ou la fuite de supports.',
		keywords: ['luks', 'chiffrement au repos', 'at-rest', 'aes-xts', 'tde']
	},
	{
		id: 'backup-immutability',
		title: 'Sauvegarde Immuable (Object-Lock WORM)',
		togafDomain: 'data-persistence',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:backup_immutability',
		defaultLeafUrn: 'urn:archinex:ontology:storage:backup:s3_object_lock_worm',
		rationale: 'Protège la reprise contre le chiffrement malveillant ou l’effacement des sauvegardes.',
		keywords: ['sauvegarde', 'backup', 'worm', 'object-lock', 'immuable', 'velero', 'ransomware']
	},

	// --- 6. Operations, Observability & Resilience ---
	{
		id: 'metrics-traces-pipeline',
		title: 'Pipeline Unifié Métriques, Logs & Traces (OpenTelemetry)',
		togafDomain: 'operations-observability',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:metrics_traces_pipeline',
		defaultLeafUrn: 'urn:archinex:ontology:observability:telemetry:otel_prometheus_loki',
		rationale: 'Standardise la télémétrie d’infrastructure et applicative vers le NOC.',
		keywords: ['opentelemetry', 'otel', 'prometheus', 'loki', 'grafana', 'telemetrie', 'metriques', 'traces']
	},
	{
		id: 'siem-audit-retention',
		title: 'Journalisation d’Audit Immuable & Corrélation SIEM / SOC',
		togafDomain: 'operations-observability',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:siem_audit_retention',
		defaultLeafUrn: 'urn:archinex:ontology:observability:soc:siem_syslog_tls_nis2',
		logicalComponentName: 'siem-soc',
		rationale: 'Assure la conservation légale, la détection d’intrusion et l’auditabilité réglementaire NIS2.',
		keywords: ['siem', 'soc', 'syslog', 'journalisation', 'audit', 'forensic', 'wazuh', 'falco']
	},
	{
		id: 'slo-alerting-runbooks',
		title: 'Contrat SLO, Alerting & Runbooks d’Exploitation NOC',
		togafDomain: 'operations-observability',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:slo_alerting_runbooks',
		defaultLeafUrn: 'urn:archinex:ontology:observability:noc:alertmanager_slo_burnrate',
		rationale: 'Relie chaque alerte d’exploitation à une procédure documentée et un engagement de service.',
		keywords: ['slo', 'sla', 'noc', 'alertmanager', 'runbook', 'astreinte', 'supervision']
	},
	{
		id: 'multi-site-failover',
		title: 'Topologie de Bascule Multi-Sites (PCA / PRA)',
		togafDomain: 'operations-observability',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:multi_site_failover',
		defaultLeafUrn: 'urn:archinex:ontology:resilience:drp:active_active_stretched',
		rationale: 'Formalise les objectifs RTO/RPO et le mécanisme de bascule entre datacenters.',
		keywords: ['pca', 'pra', 'rto', 'rpo', 'multi-site', 'bascule', 'witness', 'drp', 'reprise']
	},
	{
		id: 'chaos-drp-testing',
		title: 'Exercices Périodiques de Bascule PRA',
		togafDomain: 'operations-observability',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:chaos_drp_testing',
		defaultLeafUrn: 'urn:archinex:ontology:resilience:testing:automated_gameday_quarterly',
		rationale: 'Valide périodiquement en conditions réelles l’opérabilité du plan de reprise.',
		keywords: ['gameday', 'chaos', 'exercice', 'test pra', 'test de bascule', 'homologation']
	},

	// --- 7. Facilities, Timing & Sovereignty ---
	{
		id: 'power-cooling-resilience',
		title: 'Résilience Électrique & Refroidissement (Dual-Feed 2N)',
		togafDomain: 'facilities-sovereignty',
		documentEngineLayer: 'iaas',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:power_cooling_resilience',
		defaultLeafUrn: 'urn:archinex:ontology:facilities:power:dual_feed_2n',
		rationale: 'Écarte tout point de défaillance unique sur la chaîne d’alimentation électrique des baies.',
		keywords: ['electrique', 'pdu', 'dual-feed', '2n', 'onduleur', 'ups', 'climatisation', 'datacenter']
	},
	{
		id: 'timing-sync-ntp',
		title: 'Synchronisation Temporelle Haute Précision (GNSS / IEEE 1588v2 / NTP)',
		togafDomain: 'facilities-sovereignty',
		documentEngineLayer: 'iaas',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:timing_sync_ntp',
		defaultLeafUrn: 'urn:archinex:ontology:facilities:timing:gnss_ieee1588_stratum1',
		rationale: 'Conditionne la corrélation des journaux SIEM, la validité cryptographique et la synchronisation radio/cœur.',
		keywords: ['synchronisation temporelle', 'horloge', 'ntp', 'chrony', 'stratum', 'gnss', 'gps', 'ieee 1588', 'synce']
	},

	// --- 8. Services Managés eSIM SM-DP+, OSS/SMO/CMDB, Interworking WLAN, eMBMS/Slicing & PQC ---
	{
		id: 'esim-smdp-provisioning',
		title: 'Provisioning eSIM SM-DP+ (GSMA SGP.22), Certification SAS-SM & Gouvernance 4-Yeux',
		togafDomain: 'security-trust',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:esim_smdp_provisioning',
		defaultLeafUrn: 'urn:archinex:ontology:security:esim:smdp_sas_sm_eu_hsm',
		logicalComponentName: 'esim-smdp',
		rationale: 'Encadre l’hébergement souverain SAS-SM, le HSM FIPS 140-3 L3 et la double approbation 4-yeux des profils eSIM.',
		keywords: ['smdp+', 'sm-dp+', 'esim', 'euicc', 'sgp.22', 'sas-sm', 'profil sim', '4-yeux', 'four-eyes', 'provisioning sim']
	},
	{
		id: 'oss-smo-mediation',
		title: 'Médiation OSS / EMS & Modèle NRM Unifié (3GPP TS 28.532 / MOCN)',
		togafDomain: 'operations-observability',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:oss_smo_mediation',
		defaultLeafUrn: 'urn:archinex:ontology:operations:oss:unified_nrm_ts28532_mediation',
		logicalComponentName: 'oss-smo-mediation',
		rationale: 'Normalise les compteurs et alarmes multi-fournisseurs vers un NRM unifié et encadre les interfaces EMS/MNO.',
		keywords: ['oss', 'smo', 'ems', 'nrm', 'ts 28.532', 'fcaps', 'mediation oss', 'restconf', 'netconf', 'mocn', 'ran tiers']
	},
	{
		id: 'oss-automation-hitl',
		title: 'Automatisation SMO/OSS, Corrélation RCA & Human-in-the-Loop',
		togafDomain: 'operations-observability',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:oss_automation_hitl',
		defaultLeafUrn: 'urn:archinex:ontology:operations:smo:graduated_hitl_remediation',
		logicalComponentName: 'oss-smo-mediation',
		rationale: 'Arbitre le degré d’automatisation en boucle fermée vs approbation humaine et la corrélation RCA.',
		keywords: ['boucle fermee', 'closed loop', 'human-in-the-loop', 'approbation humaine', 'remediation', 'rca', 'correlation alarmes', 'aiops']
	},
	{
		id: 'cmdb-asset-inventory',
		title: 'Inventaire Réseau, CMDB & Réconciliation ITSM Encadrée',
		togafDomain: 'operations-observability',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type2_default_ratify',
		axisUrn: 'urn:archinex:ontology:axis:cmdb_asset_inventory',
		defaultLeafUrn: 'urn:archinex:ontology:operations:cmdb:nautobot_itsm_reconciliation',
		logicalComponentName: 'cmdb-inventory',
		rationale: 'Garantit la cohérence entre l’inventaire OSS/Nautobot, la découverte automatique et la CMDB ITSM.',
		keywords: ['cmdb', 'itsm', 'inventaire', 'decouverte automatique', 'referentiel actifs', 'reconciliation inventaire']
	},
	{
		id: 'service-assurance-probes',
		title: 'Assurance de Service, Sondes Actives Bout-en-Bout & Gouvernance QoS 5QI',
		togafDomain: 'operations-observability',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:service_assurance_probes',
		defaultLeafUrn: 'urn:archinex:ontology:operations:assurance:e2e_probes_5qi_qos',
		logicalComponentName: 'oss-smo-mediation',
		rationale: 'Mesure les KPI bout-en-bout (latence, gigue, 5QI) sans sondes invasives dans les équipements tiers.',
		keywords: ['sonde active', 'sondes actives', 'assurance de service', 'service assurance', '5qi', 'qos', 'kpi ptt', 'latence voix', 'mcptt']
	},
	{
		id: 'non3gpp-wlan-interworking',
		title: 'Interworking Wi-Fi / WLAN Offload Non-3GPP (N3IWF / ePDG / ATSSS)',
		togafDomain: 'network-connectivity',
		documentEngineLayer: 'infrastructure',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:non3gpp_wlan_interworking',
		defaultLeafUrn: 'urn:archinex:ontology:network:interworking:n3iwf_epdg_ipsec',
		logicalComponentName: 'n3iwf-epdg-gateway',
		rationale: 'Sécurise l’accès au cœur 5G/4G depuis des réseaux WLAN/Wi-Fi non approuvés via N3IWF/ePDG.',
		keywords: ['n3iwf', 'epdg', 'atsss', 'wlan offload', 'wifi offload', 'wi-fi', 'non-3gpp', 'interworking']
	},
	{
		id: 'core-5g-network-slicing',
		title: 'Tranchage Réseau 5G (Network Slicing SST / S-NSSAI / 5QI)',
		togafDomain: 'network-connectivity',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:core_5g_network_slicing',
		defaultLeafUrn: 'urn:archinex:ontology:telecom:core:slicing_5qi_sst_isolation',
		logicalComponentName: 'core-network',
		rationale: 'Isole les tranches de service critiques (PPDR, télémétrie, gestion) par S-NSSAI, DNN et priorité 5QI.',
		keywords: ['slicing', 'network slicing', 'tranche 5g', 'tranches 5g', 'sst', 'sd', 'nssai', 's-nssai', 'dnn']
	},
	{
		id: 'embms-multicast-broadcast',
		title: 'Diffusion Multicast / Broadcast Groupe Mission-Critical (eMBMS / 5MBS)',
		togafDomain: 'application-business',
		documentEngineLayer: 'application',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:embms_multicast_broadcast',
		defaultLeafUrn: 'urn:archinex:ontology:application:broadcast:embms_5mbs_group_broadcast',
		logicalComponentName: 'ptt-server',
		rationale: 'Optimise la diffusion de groupe PPDR/PTT sur cellule radio via BM-SC / eMBMS / 5MBS avec repli unicast.',
		keywords: ['embms', '5mbs', 'mbs', 'multicast', 'broadcast', 'diffusion groupe', 'bm-sc', 'mbms']
	},
	{
		id: 'pqc-crypto-agility',
		title: 'Cryptographie Post-Quantique (PQC ML-KEM / ML-DSA) & Crypto-Agilité',
		togafDomain: 'security-trust',
		documentEngineLayer: 'component',
		defaultDecisionType: 'type1_deliberate',
		axisUrn: 'urn:archinex:ontology:axis:pqc_crypto_agility',
		defaultLeafUrn: 'urn:archinex:ontology:security:pqc:hybrid_mlkem_mldsa_agility',
		logicalComponentName: 'pki-ca',
		rationale: 'Prépare la transition cryptographique par hybridation classique/PQC et rotation automatisée des certificats.',
		keywords: ['pqc', 'post-quantique', 'post quantum', 'ml-kem', 'ml-dsa', 'kyber', 'dilithium', 'crypto-agilite', 'crypto agilite']
	}
];

const LEGACY_TO_TOGAF_MAP: Record<string, TogafDomainId> = {
	// Applications & Business Services
	'application': 'application-business',
	'application-business': 'application-business',
	'business': 'application-business',
	'ptt-services': 'application-business',
	'gis-services': 'application-business',
	'gis': 'application-business',
	'mission-critical': 'application-business',
	'FR': 'application-business',

	// Security & Trust
	'security': 'security-trust',
	'security-trust': 'security-trust',
	'securite': 'security-trust',
	'iam': 'security-trust',
	'pki': 'security-trust',
	'trust': 'security-trust',
	'diffusion-restreinte': 'security-trust',

	// Network & Connectivity
	'network': 'network-connectivity',
	'network-connectivity': 'network-connectivity',
	'telecom': 'network-connectivity',
	'core-network': 'network-connectivity',
	'interconnection': 'network-connectivity',
	'INT': 'network-connectivity',

	// Platform & Compute
	'platform': 'platform-compute',
	'platform-compute': 'platform-compute',
	'cloud-platform': 'platform-compute',
	'infrastructure': 'platform-compute',
	'it': 'platform-compute',
	'delivery': 'platform-compute',
	'ai-assistance': 'platform-compute',

	// Data & Persistence
	'data': 'data-persistence',
	'data-persistence': 'data-persistence',
	'storage': 'data-persistence',
	'DR': 'data-persistence',

	// Operations, Observability & Resilience
	'operations-observability': 'operations-observability',
	'observability': 'operations-observability',
	'resilience': 'operations-observability',
	'operations': 'operations-observability',
	'general': 'operations-observability',
	'cost': 'operations-observability',
	'BR': 'operations-observability',
	'NFR': 'operations-observability',

	// Facilities & Sovereignty
	'facilities': 'facilities-sovereignty',
	'facilities-sovereignty': 'facilities-sovereignty',
	'sovereignty': 'facilities-sovereignty',
	'timing-sync': 'facilities-sovereignty',
	'device-hardware': 'facilities-sovereignty',
	'FAC': 'facilities-sovereignty'
};

function foldText(raw: string): string {
	return raw
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, ' ')
		.replace(/[^a-z0-9#./_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Convertit une catégorie ou un domaine hétérogène historique vers l'un des 7 domaines TOGAF canoniques.
 */
export function resolveTogafDomain(rawDomainOrCategory?: string | null): TogafDomainId {
	if (!rawDomainOrCategory) return 'operations-observability';
	const trimmed = rawDomainOrCategory.trim();
	if (trimmed in LEGACY_TO_TOGAF_MAP) {
		return LEGACY_TO_TOGAF_MAP[trimmed];
	}
	const lower = trimmed.toLowerCase();
	if (lower in LEGACY_TO_TOGAF_MAP) {
		return LEGACY_TO_TOGAF_MAP[lower];
	}
	if (lower.includes('sec') || lower.includes('pki') || lower.includes('hsm') || lower.includes('iam')) {
		return 'security-trust';
	}
	if (lower.includes('net') || lower.includes('telco') || lower.includes('proxy') || lower.includes('wan')) {
		return 'network-connectivity';
	}
	if (lower.includes('stor') || lower.includes('data') || lower.includes('backup')) {
		return 'data-persistence';
	}
	if (lower.includes('facil') || lower.includes('power') || lower.includes('sovereign') || lower.includes('time')) {
		return 'facilities-sovereignty';
	}
	if (lower.includes('app') || lower.includes('gis') || lower.includes('carto') || lower.includes('ptt')) {
		return 'application-business';
	}
	if (lower.includes('infra') || lower.includes('plat') || lower.includes('compute')) {
		return 'platform-compute';
	}
	return 'operations-observability';
}

/**
 * Associe de manière déterministe un texte d'exigence ou de clause à une brique d'architecture
 * de référence. Priorise les briques avec le plus grand nombre d'indices lexicaux concordants.
 */
export function matchReferenceBuildingBlock(
	text: string,
	rawCategoryOrDomain?: string
): ReferenceBuildingBlock | undefined {
	const folded = ` ${foldText(text)} `;
	if (folded.trim().length === 0) return undefined;

	const hintedDomain = rawCategoryOrDomain ? resolveTogafDomain(rawCategoryOrDomain) : undefined;
	let bestBlock: ReferenceBuildingBlock | undefined;
	let bestScore = 0;

	for (const block of TOGAF_REFERENCE_BUILDING_BLOCKS) {
		let score = 0;
		for (const kw of block.keywords) {
			const foldedKw = foldText(kw);
			if (!foldedKw) continue;
			if (folded.includes(` ${foldedKw} `) || (foldedKw.length >= 5 && folded.includes(foldedKw))) {
				score += foldedKw.includes(' ') ? 3 : 2;
			}
		}
		if (score === 0) continue;
		if (hintedDomain && block.togafDomain === hintedDomain) {
			score += 1;
		}
		if (score > bestScore) {
			bestScore = score;
			bestBlock = block;
		}
	}

	return bestBlock;
}

export interface BlindSpotScanReport {
	coveredCount: number;
	totalReferenceBlocks: number;
	coveragePercent: number;
	missingByDomain: Record<TogafDomainId, ReferenceBuildingBlock[]>;
	missingBlocks: ReferenceBuildingBlock[];
}

/**
 * Détecte les briques d'architecture de référence absentes des axes déjà couverts d'un projet,
 * afin d'identifier les angles morts transverses avant l'édition des LLD.
 */
export function scanProjectArchitecturalBlindSpots(
	coveredAxisUrns: Iterable<string>,
	activeDomains?: TogafDomainId[]
): BlindSpotScanReport {
	const covered = new Set(coveredAxisUrns);
	const domainFilter = activeDomains && activeDomains.length > 0 ? new Set(activeDomains) : null;

	const relevantBlocks = domainFilter
		? TOGAF_REFERENCE_BUILDING_BLOCKS.filter((b) => domainFilter.has(b.togafDomain))
		: TOGAF_REFERENCE_BUILDING_BLOCKS;

	const missingBlocks = relevantBlocks.filter((b) => !covered.has(b.axisUrn));
	const missingByDomain = Object.fromEntries(
		TOGAF_DOMAIN_ORDER.map((d) => [d, [] as ReferenceBuildingBlock[]])
	) as Record<TogafDomainId, ReferenceBuildingBlock[]>;

	for (const block of missingBlocks) {
		missingByDomain[block.togafDomain].push(block);
	}

	const totalReferenceBlocks = relevantBlocks.length;
	const coveredCount = totalReferenceBlocks - missingBlocks.length;
	const coveragePercent =
		totalReferenceBlocks > 0 ? Math.round((coveredCount / totalReferenceBlocks) * 100) : 100;

	return {
		coveredCount,
		totalReferenceBlocks,
		coveragePercent,
		missingByDomain,
		missingBlocks
	};
}

export interface EmergentCapabilityDetection {
	isEmergent: boolean;
	capabilityId: string;
	title: string;
	togafDomain: TogafDomainId;
	documentEngineLayer: DocumentEngineLayer;
	suggestedComponentName: string;
	suggestedTier: 'application' | 'platform' | 'infrastructure';
	candidateExistingComponents: string[];
	rationale: string;
}

interface EmergentArchetype {
	id: string;
	title: string;
	togafDomain: TogafDomainId;
	documentEngineLayer: DocumentEngineLayer;
	suggestedComponentName: string;
	suggestedTier: 'application' | 'platform' | 'infrastructure';
	candidateExistingComponents: string[];
	rationale: string;
	keywords: string[];
}

const EMERGENT_CAPABILITY_ARCHETYPES: EmergentArchetype[] = [
	{
		id: 'emergent-iot-telemetry-gateway',
		title: 'Collecte, Médiation & Télémétrie IoT / Capteurs Terrain',
		togafDomain: 'application-business',
		documentEngineLayer: 'application',
		suggestedComponentName: 'iot-gateway',
		suggestedTier: 'application',
		candidateExistingComponents: ['gis-server', 'ptt-server', 'core-network', 'ingress-waf-proxy'],
		rationale:
			'Capacité IoT / capteurs / courtiers MQTT-LoRaWAN absente du catalogue de composants standard : exige une décision explicite d’allocation à un composant existant ou d’instanciation d’un nouveau composant logique (iot-gateway).',
		keywords: [
			'iot',
			'lorawan',
			'mqtt',
			'coap',
			'capteur',
			'capteurs',
			'passerelle iot',
			'edge sensor',
			'zigbee',
			'nb-iot',
			'lwm2m',
			'telemetrie terrain',
			'objets connectes'
		]
	},
	{
		id: 'emergent-video-media-relay',
		title: 'Relais Flux Vidéo Temps Réel & Médiation Multimédia',
		togafDomain: 'application-business',
		documentEngineLayer: 'application',
		suggestedComponentName: 'media-streaming-relay',
		suggestedTier: 'application',
		candidateExistingComponents: ['ptt-server', 'gis-server', 'ingress-waf-proxy'],
		rationale:
			'Flux vidéo / streaming temps réel non couvert par une brique standard : exige de décider si ptt-server absorbe le relais média ou si un composant dédié media-streaming-relay est instancié.',
		keywords: [
			'flux video',
			'streaming video',
			'rtsp',
			'webrtc',
			'videoprotection',
			'encodage video',
			'camera',
			'cameras',
			'drone video'
		]
	},
	{
		id: 'emergent-ai-inference-engine',
		title: 'Moteur d’Inférence IA & Traitement Cognitif Souverain',
		togafDomain: 'application-business',
		documentEngineLayer: 'application',
		suggestedComponentName: 'ai-inference-service',
		suggestedTier: 'application',
		candidateExistingComponents: ['ptt-server', 'gis-server', 'db-ha'],
		rationale:
			'Capacité d’inférence IA / traitement cognitif hors catalogue standard : exige l’allocation explicite d’un composant logique responsable (ai-inference-service ou composant applicatif existant).',
		keywords: [
			'inference ia',
			'modele llm',
			'gpu inference',
			'rag',
			'reconnaissance vocale',
			'transcription automatique',
			'agent ia'
		]
	}
];

function slugifyEmergentComponentName(text: string): string {
	const stopWords = new Set([
		'le',
		'la',
		'les',
		'de',
		'du',
		'des',
		'et',
		'ou',
		'en',
		'un',
		'une',
		'pour',
		'sur',
		'avec',
		'dans',
		'par',
		'aux',
		'systeme',
		'service',
		'module',
		'gestion',
		'architecture',
		'sujet',
		'exigence',
		'fonction',
		'traitement'
	]);
	const tokens = foldText(text)
		.split(/[^a-z0-9]+/)
		.filter((tok) => tok.length >= 3 && !/^\d+$/.test(tok) && !stopWords.has(tok));
	const base = tokens.slice(0, 2).join('-') || 'custom-domain';
	return `${base}-service`;
}

/**
 * Détecte dès l'ingestion (Phase 1) ou lors du raffinement (Phase 4) si une exigence ou un sujet
 * introduit une capacité inédite (ex. IoT, capteurs LoRaWAN/MQTT, flux vidéo, ou tout besoin
 * `novel_requirement` non couvert par les briques TOGAF de référence), afin d'ouvrir un
 * emplacement d'allocation de composant explicite et d'interdire tout choix silencieux.
 */
export function detectEmergentCapabilityNeed(
	text: string,
	rawCategoryOrDomain?: string,
	options?: {
		isNovelSubject?: boolean;
		fallbackTitle?: string;
		availableComponents?: string[];
	}
): EmergentCapabilityDetection | undefined {
	const folded = ` ${foldText(text)} `;
	if (folded.trim().length === 0) return undefined;

	const resolveCandidateComponents = (archetypeDefaults: string[]): string[] => {
		const provided = (options?.availableComponents || [])
			.map((c) => c.trim())
			.filter(Boolean);
		if (provided.length === 0) return archetypeDefaults;
		// Prioriser les composants du catalogue projet qui correspondent aux archétypes, puis compléter avec le reste du catalogue actif
		const preferred = archetypeDefaults.filter((c) => provided.includes(c));
		const others = provided.filter((c) => !preferred.includes(c));
		return [...preferred, ...others].slice(0, 6);
	};

	// 1. Test des archétypes émergents explicites (IoT, Vidéo, IA...)
	let bestArchetype: EmergentArchetype | undefined;
	let bestScore = 0;
	for (const arch of EMERGENT_CAPABILITY_ARCHETYPES) {
		let score = 0;
		for (const kw of arch.keywords) {
			const foldedKw = foldText(kw);
			if (!foldedKw) continue;
			if (folded.includes(` ${foldedKw} `) || (foldedKw.length >= 5 && folded.includes(foldedKw))) {
				score += foldedKw.includes(' ') ? 3 : 2;
			}
		}
		if (score > bestScore) {
			bestScore = score;
			bestArchetype = arch;
		}
	}

	if (bestArchetype && bestScore > 0) {
		return {
			isEmergent: true,
			capabilityId: bestArchetype.id,
			title: bestArchetype.title,
			togafDomain: bestArchetype.togafDomain,
			documentEngineLayer: bestArchetype.documentEngineLayer,
			suggestedComponentName: bestArchetype.suggestedComponentName,
			suggestedTier: bestArchetype.suggestedTier,
			candidateExistingComponents: resolveCandidateComponents(bestArchetype.candidateExistingComponents),
			rationale: bestArchetype.rationale
		};
	}

	// 2. Si une brique de référence TOGAF couvre déjà le besoin, ce n'est pas un angle mort inédit
	const matchedBlock = matchReferenceBuildingBlock(text, rawCategoryOrDomain);
	if (matchedBlock) {
		return undefined;
	}

	// 3. Sujet explicitement qualifié d'inédit (`novel_requirement`) ou exigence fonctionnelle sans brique connue
	const togafDomain = resolveTogafDomain(rawCategoryOrDomain);
	if (options?.isNovelSubject || togafDomain === 'application-business') {
		const suggestedComponentName = slugifyEmergentComponentName(options?.fallbackTitle || text);
		const capabilitySlug = suggestedComponentName.replace(/-service$/, '');
		return {
			isEmergent: true,
			capabilityId: `emergent-${capabilitySlug}`,
			title: options?.fallbackTitle
				? `Allocation de Composant Émergent : ${options.fallbackTitle}`
				: `Capacité Fonctionnelle Émergente (${suggestedComponentName})`,
			togafDomain,
			documentEngineLayer: TOGAF_DOMAINS[togafDomain].documentEngineLayer,
			suggestedComponentName,
			suggestedTier: togafDomain === 'application-business' ? 'application' : 'platform',
			candidateExistingComponents: resolveCandidateComponents(['gis-server', 'ptt-server', 'core-network', 'db-ha']),
			rationale:
				'Besoin fonctionnel ou sujet inédit ne correspondant à aucune brique de référence du catalogue : l’architecte doit décider quel composant existant porte la fonction ou instancier un nouveau composant logique.'
		};
	}

	return undefined;
}

