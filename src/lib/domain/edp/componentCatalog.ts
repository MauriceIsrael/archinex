/**
 * Catalogue de Composants Logiques & Modèle Terrain (Lot 1 — Issue #283).
 *
 * Sépare strictement :
 * - L'Ontologie Archinex (connaissance normative, clauses, règles OPA),
 * - Les Catalogues de Valeurs admises (environments, datacenters, zones, nic-classes, tiers, functional-domains),
 * - Les Composants Logiques (Base agnostique de l'environnement : Component -> Module -> Instance),
 * - Les Overlays d'Environnement & Datacenter (substitutions param.* permettant le What-If 2 vs 3 DCs).
 */

export type EntityLifecycleStatus = 'active' | 'staged' | 'inactive';
export type ComponentClass = 'infrastructure' | 'business' | 'external' | 'domain-functional' | 'domain-technical';
export type NicClass = 'admin' | 'business' | 'events' | 'internal' | 'storage' | 'backup' | 'oob';
export type NicSubClass = 'trusted' | 'untrusted' | 'sync';
export type StorageTierName = 'hot' | 'warm' | 'cold';
export type ModuleKind = 'vm' | 'container' | 'forward-proxy';
export type SslTerminationMode = 'origin' | 'destination' | 'none' | 'on-proxy';
export type CertificateIssuanceMethod = 'acme' | 'scep' | 'internal-ca' | 'manual';
export type FirewallUsageType = 'interzone' | 'external' | 'operator-link';
export type CertificateAlgorithm = 'rsa' | 'ecdsa' | 'ed25519';

export interface EnvironmentCatalogEntry {
  name: string;
  tier: number;
  policies: {
    changeWindow?: string;
    minReplicas?: number;
    immutableImageTag?: boolean;
    siemMandatory?: boolean;
  };
  allowedZones: string[];
}

export interface DatacenterCatalogEntry {
  name: string;
  region: string;
  failureDomain: string;
  drRole: 'primary' | 'secondary' | 'tertiary';
}

export interface FunctionalDomainCatalogEntry {
  name: string;
  description: string;
  editors: string[];
  policies?: {
    tier?: number;
    changeWindow?: string;
    drTarget?: number;
  };
}

export interface StorageTierCatalogEntry {
  tier: StorageTierName;
  media: 'ssd' | 'hybrid' | 'hdd';
  defaultReclaimPolicy: 'retain' | 'delete';
}

export interface QosClassCatalogEntry {
  name: string;
  dscp: string;
  tos?: number;
  priority: 'highest' | 'high' | 'standard' | 'low';
  description?: string;
}

export interface PoolRangeCatalogEntry {
  zone: string;
  range: string;
}

export interface FirewallCatalogEntry {
  name: string;
  usage: FirewallUsageType;
  zones: string[];
  enforcement: string;
  operatorRef?: string;
}

export interface CertificateProfileCatalogEntry {
  name: string;
  description?: string;
  type: 'server' | 'client' | 'email' | 'code-signing' | 'ca';
  validityDays: number;
  keySize: number;
  algorithm: CertificateAlgorithm;
  extendedKeyUsage: string[];
  keyUsage: string[];
  keyType: {
    private: 'nonExportable';
    storage: 'hsm' | 'vault';
  };
}

export interface DriverCatalogEntry {
  name: string;
  targetTechnology: string;
  operations: string[];
  supportsPlan: boolean;
}

export interface ValueCatalogs {
  version: string;
  environments: EnvironmentCatalogEntry[];
  datacenters: DatacenterCatalogEntry[];
  zones: string[];
  nicClasses: NicClass[];
  nicSubClasses: NicSubClass[];
  storageTiers: StorageTierCatalogEntry[];
  functionalDomains: FunctionalDomainCatalogEntry[];
  forbiddenOffsets: { min: number; max: number };
  qosClasses?: QosClassCatalogEntry[];
  vlanPools?: PoolRangeCatalogEntry[];
  vniPools?: PoolRangeCatalogEntry[];
  firewalls?: FirewallCatalogEntry[];
  certificateProfiles?: CertificateProfileCatalogEntry[];
  drivers?: DriverCatalogEntry[];
}

export interface IpAllocationSpec {
  by: 'offset' | 'dhcp' | 'reserved';
  value?: number | string;
  perInstance?: boolean;
}

export interface NicSpec {
  class: NicClass;
  subClass?: NicSubClass | null;
  index: number;
  vrf: string;
  subnetRef: string;
  ip: IpAllocationSpec;
  defaultRoute?: boolean;
}

export interface RoutePropagationRule {
  to: string; // target VRF or 'any'
  prefixes: string[];
  action: 'allow' | 'deny';
}

export interface BgpPropagationRule {
  to: string; // target VRF or 'any'
  prefixes: string[];
  announce: 'none' | { via: 'evpn'; anycastFrom: string[] };
}

export interface VrfFabricSpec {
  vni?: string | { by: 'allocation' | 'offset'; pool: string; offset?: number };
  attached?: string[];
  routePropagation?: RoutePropagationRule[];
  bgpPropagation?: BgpPropagationRule[];
}

export interface VrfSpec {
  name: string;
  domain: string;
  tenantRef?: string;
  fabric?: VrfFabricSpec;
}

export interface ExplicitRouteSpec {
  name: string;
  type: 'static' | 'leaked' | 'default';
  from: string;
  to: { vrf: string; prefix: string };
  nextHop: string;
  whitelist?: string;
  reason?: string;
}

export interface IpFabricSpec {
  underlay: {
    protocol: 'evpn-vxlan' | 'vrf-lite';
    bgpAsn: string | number;
    peers: Array<{ name: string; model: string; role: 't0' | 't1'; communities?: string[] }>;
  };
  vniPool: string;
  leafs: Array<{ name: string; zone: string }>;
  security?: {
    bgpSessions: {
      authentication: { method: 'tcp-ao' | 'md5'; secret: string };
      gtsm?: { ttl: number };
      maxPrefix?: { limit: number; threshold: string; action: 'shutdown' | 'warn' };
    };
    vtep?: {
      allowedPeers: string[];
      vniLeaking: 'deny' | 'allow';
    };
    ingressFiltering?: Array<{ rule: string; action: 'deny' | 'allow' }>;
  };
}

export interface LoadBalancerSpec {
  name: string;
  class: 'l4' | 'l7';
  listeners: Array<{
    name: string;
    port: number;
    vip: string;
    protocol: 'http' | 'https' | 'tcp' | 'udp';
    certificates?: string[];
    tlsVersion?: string;
  }>;
  backends: string[];
  healthCheck?: { proto: 'tcp' | 'http' | 'https'; port: number; interval: string; unhealthy: number };
  sessionPersistence?: 'none' | 'source-ip' | 'cookie';
}

export interface VpnTunnelSpec {
  name: string;
  type: 'site-to-site' | 'remote-access';
  endpoints: { local: string; remote: string };
  auth: { method: 'psk' | 'certificate'; certificate?: string };
  ike?: { version: number; encryption: string; group: number; lifetime: string };
  routing?: { advertise: string[]; mode: 'policy-based' | 'route-based' };
  monitoring?: { probe: 'dpd'; interval: string };
  status?: EntityLifecycleStatus;
}

export interface ApnSpec {
  name: string;
  type: 'dedicated' | 'common';
  organization?: string;
  slice?: { class: string; qos: { priority: string; guaranteed: boolean; dscp: string } };
  ipPools: Array<{
    name: string;
    cidr: string;
    family: 'ipv4' | 'ipv6';
    assignment: 'dynamic' | 'static';
    reserved?: Array<{ name: string; offset: number }>;
  }>;
  dns?: {
    resolvers: string[];
    view: { include: string[]; default: 'deny' };
    searchDomains?: string[];
  };
  sgi?: {
    gateway: string;
    logicalInterface: string;
    targets: string[];
  };
  status?: EntityLifecycleStatus;
}

export interface SubnetSpec {
  name: string;
  cidr: string; // doit être ref(param.*) dans une Base
  vrf: string;
  zone: string;
  class: NicClass;
  subClass?: NicSubClass;
  reserved?: Record<string, { offset: number }>;
}

export interface ExternalAddressSpec {
  name: string;
  cidr: string;
  family: 'ipv4' | 'ipv6';
  service?: string;
}

export interface ForwardProxySpec {
  engine: string;
  accountRef: string;
  ingressFilter: Array<{ source: string; ports: number[] }>;
  egressFilter: Array<{ target: string; ports: number[]; proto?: string }>;
  egressPolicy: { default: 'deny' | 'allow'; snatRef: string };
}

export interface ModulePlacementSpec {
  requiredDataplane: 'sriov-dpdk' | 'standard-nis2' | 'dmz-isolated';
  zone: string;
  pool?: string;
}

export interface ModuleStorageMountSpec {
  name: string;
  size: string; // ex. "50Gi" ou "ref(param.disk.db)"
  tier: StorageTierName;
  svmRef?: string;
  reclaimPolicy?: 'retain' | 'delete';
}

export interface ModuleSpec {
  name: string;
  kind: ModuleKind;
  role: string;
  status: EntityLifecycleStatus;
  instances: number | string; // nombre par défaut ou ref(param.*)
  placement: ModulePlacementSpec;
  nics: NicSpec[];
  helm?: {
    repo: string;
    chart: string;
    version: string; // version ou ref(param.*)
  };
  proxy?: ForwardProxySpec;
  storage?: ModuleStorageMountSpec[];
}

export interface SvmSpec {
  name: string;
  tenantRef: string;
  backend: string;
  tiers: Array<{
    tier: StorageTierName;
    quota: string; // ex. ref(param.storage.hot.quota)
  }>;
}

export interface NfsExportSpec {
  name: string;
  svm: string;
  tier: StorageTierName;
  path: string;
  access: Array<{
    grant: string; // ex. group:ptt-app ou component:gis-server
    rights: 'ro' | 'rw' | 'none';
    rootSquash?: boolean;
  }>;
}

export interface VaultPathSpec {
  name: string;
  rule: string;
  rotationDays: number;
}

export interface CertificateSpec {
  name: string;
  type: 'server' | 'client' | 'email' | 'code-signing' | 'ca';
  /** Référence obligatoire en IMP V2 vers un profil partagé (`certificateProfiles[...]`) */
  profile?: string;
  cn: string;
  sanDns?: string[];
  sanIps?: string[];
  /** Champs X.509 hérités V1 : interdits inline en V2 si `profile` est utilisé */
  validityDays?: number;
  keySize?: number;
  algorithm?: CertificateAlgorithm;
  extendedKeyUsage?: string[];
  keyUsage?: string[];
  issuanceMethod: CertificateIssuanceMethod;
  autoRenew?: boolean;
  boundToVip?: string;
  sslTermination?: SslTerminationMode;
  status?: EntityLifecycleStatus;
}

export interface ContainerNamespaceSpec {
  name: string;
  zone: string;
  apiKey?: { secret: string; storage: 'vault' };
  quotas: {
    cpu: number | string;
    memory: string;
    storage?: string;
    persistentVolumeClaims?: number;
  };
  ingress?: { ipPool: string };
  egress?: { ipPool: string; qos?: { dscp: string } };
  logs?: { forwarder: string; destination: string; config?: string };
  networkTelemetry?: {
    sources: Array<{ type: string; targets?: string; samplers?: string }>;
  };
  monitoring?: { agent: string; discover: 'auto' | 'manual' };
  storage?: Array<{
    tier: StorageTierName;
    size: string;
    accessMode: string;
    retainPolicy: 'retain' | 'delete';
  }>;
  status?: EntityLifecycleStatus;
}

export interface BareMetalHardwareSpec {
  name: string;
  model: string;
  role: string;
  cpu: { sockets: number; cores: number };
  memory: string;
  nics: Array<{ class: NicClass; model: string; ports: number }>;
  firmware: {
    bios: { version: string; baseline: string };
    bmc: { version: string; protocol: 'redfish' };
  };
  oob: { class: 'oob'; address: string };
  status?: EntityLifecycleStatus;
}

export interface ObjectStoreSpec {
  name: string;
  svm?: string;
  buckets: Array<{
    name: string;
    versioning: boolean;
    retention?: { mode: 'compliance' | 'governance'; days: number };
    encryption: { atRest: string; kms: string };
    quota: string;
    access: Array<{ grant: string; rights: Array<'get' | 'put' | 'list' | 'delete'> }>;
  }>;
  dedup?: { enabled: boolean };
}

export interface ExposureSpec {
  entryPoints?: Array<{
    name: string;
    type: 'reverse-proxy' | 'api-gateway';
    hostname: string;
    vip: string;
    certificates: string[];
    tls: { minVersion: string; termination: SslTerminationMode; backendTls?: 'mtls' | 'tls' | 'none' };
    routes: Array<{ path: string; backend: string }>;
    rateLimit?: { rps: number; burst: number };
    status?: EntityLifecycleStatus;
  }>;
  fileTransfers?: Array<{
    name: string;
    direction: 'inbound' | 'outbound' | 'bidirectional';
    protocol: 'sftp' | 'ftps' | 'ws';
    partners: string[];
    localPath: string;
    schedule: string;
    encryption?: { atRest: string; key: string };
    status?: EntityLifecycleStatus;
  }>;
  email?: Array<{
    name: string;
    direction: 'outbound' | 'inbound';
    relay: string;
    sender: string;
    security: { transport: 'starttls' | 'tls'; signing?: 'smime'; certificate?: string };
    status?: EntityLifecycleStatus;
  }>;
}

export interface ObservabilitySpec {
  logs?: {
    metadata: string;
    sources: Array<{ module: string; format: 'json' | 'syslog'; transform?: string; destination: string }>;
  };
  kpis?: Array<{
    name: string;
    type: 'latency' | 'ratio' | 'gauge' | 'counter';
    target: string;
    window: string;
    source?: string;
  }>;
  alerting?: Array<{
    kpi: string;
    condition: string;
    severity: 'critical' | 'warning' | 'info';
    notify: string[];
  }>;
}

export interface DatabaseServiceSpec {
  name: string;
  engine: string;
  ha: { mode: string; replicas: number; method: 'synchronous' | 'asynchronous'; failover: 'automatic' | 'manual' };
  sizing: { storage: { size: string; tier: StorageTierName }; connections: number };
  backup: { policy: string; pitr: boolean; retentionDays: number };
  access: Array<{ grant: string; rights: 'ro' | 'rw' }>;
  endpoints: { service: string; port: number };
}

export interface SupplyChainSpec {
  repositories?: Array<{
    name: string;
    type: 'generic' | 'maven' | 'helm' | 'oci';
    replication: { mode: 'active-active' | 'active-passive'; acrossDcs: string[]; backend: string };
    promotion: Array<{ fromEnv: string; toEnv: string; requires: string[] }>;
    sas?: { checks: string[]; polling?: string };
  }>;
  pipelines?: Array<{
    name: string;
    scope: 'component' | 'infra';
    source: string;
    trust: { signedPackagesOnly: boolean };
  }>;
}

export interface LifecycleSpec {
  install?: string;
  upgrade?: string;
  decommission?: string;
  bootstrap?: { staticIp: boolean; reclaim: boolean };
  rollback?: { strategy: 'none' | 'redeploy' | string };
}

export interface OrganizationSpec {
  apiVersion: 'archinex.io/v1alpha1' | 'imp.example.io/v1';
  kind: 'Organization';
  metadata: {
    name: string;
    displayName: string;
    status: EntityLifecycleStatus;
    version: string;
    manifestVersion: number;
  };
  spec: {
    type: 'customer' | 'internal' | 'partner';
    dnsDomains: string[];
    apns: string[];
    consumes: string[];
    contacts: { owner: string; oncall: string };
    // Champs interdits sur Organization (présents en type optionnel pour détection de violation)
    compute?: unknown;
    firewall?: unknown;
    exposure?: unknown;
  };
}

export interface OrganizationBubble {
  organization: string;
  tenant: string;
  vrf: string;
  dnsDomain: string;
  apns: string[];
  consumes: string[];
  status: EntityLifecycleStatus;
}

export interface FirewallGroupSpec {
  name: string;
  membersRef: string;
}

export interface FirewallRuleSpec {
  id: string;
  from: string;
  to: string;
  proto: 'tcp' | 'udp' | 'sctp' | 'icmp';
  ports: number[];
  action: 'allow' | 'deny';
  log?: boolean;
  sslTermination?: SslTerminationMode;
  tlsVersion?: string;
  functionalFlow?: string;
  category?: 'explicit' | 'auto-generated';
  generatedBy?: string;
  generatedFrom?: string;
}

export interface LogicalFlowSegment {
  segment: string;
  from: string;
  to: string;
  proto: 'tcp' | 'udp' | 'sctp';
  port: number;
  direction?: 'out' | 'in';
  sslTermination?: SslTerminationMode;
  tlsVersion?: string;
}

export interface LogicalInterfaceSpec {
  name: string; // ex. S6a, S11, N2, Gi, Rx-N5, WMS-WFS
  direction: 'bidirectional' | 'unidirectional';
  description: string;
  flows: LogicalFlowSegment[];
}

export interface UseCaseSpec {
  name: string;
  description: string;
  interfaces: string[]; // ex. ["ref(logicalInterfaces[S6a])", "ref(component:core-network.logicalInterfaces[Rx-N5])"]
  status?: EntityLifecycleStatus;
}

export interface CrossTenantContract {
  targetComponent: string;
  purpose: string;
  approvedBy: string[];
}

export interface LogicalComponent {
  apiVersion: 'archinex.io/v1alpha1';
  kind: 'LogicalComponent';
  metadata: {
    name: string;
    displayName: string;
    tenant: string;
    external: boolean;
    functionalDomain: string;
    editor: string;
    status: EntityLifecycleStatus;
    version: string;
    manifestVersion: number;
    labels?: Record<string, string>;
  };
  spec: {
    class: ComponentClass;
    dependsOn?: string[];
    crossTenantContracts?: CrossTenantContract[];
    network?: {
      vrfs?: VrfSpec[];
      subnets?: SubnetSpec[];
      addresses?: ExternalAddressSpec[];
      vrfBridges?: Array<{ fromVrf: string; toVrf: string; viaModule: string }>;
      fabric?: IpFabricSpec;
      routes?: ExplicitRouteSpec[];
      loadBalancers?: LoadBalancerSpec[];
      tunnels?: VpnTunnelSpec[];
      apns?: ApnSpec[];
      firewalls?: Array<{
        name: string;
        ref: string;
        component: string;
        attaches: Array<{ from: string; to: string }>;
        vrfLinks: string[];
      }>;
    };
    compute?: {
      modules: ModuleSpec[];
      namespaces?: ContainerNamespaceSpec[];
      hardware?: BareMetalHardwareSpec[];
    };
    storage?: {
      svms?: SvmSpec[];
      exports?: NfsExportSpec[];
      objectStores?: ObjectStoreSpec[];
    };
    security?: {
      vault?: {
        mount: string;
        paths: VaultPathSpec[];
      };
      certificates?: CertificateSpec[];
      certificateProfiles?: CertificateProfileCatalogEntry[];
      sbom?: Array<{
        module: string;
        format: 'cyclonedx' | 'spdx';
        generated: 'build-time' | 'runtime';
        vulnerabilities: { scan: string; dailyUpdate: boolean; policy: 'block-critical' | 'warn' };
      }>;
      endpoint?: {
        edr?: { agent: string; dailyUpdate: boolean };
        av?: { agent: string; dailyUpdate: boolean };
        integrityCheck?: { mode: 'fim'; paths: string[] };
      };
    };
    firewall?: {
      policy: 'deny-by-default';
      groups: FirewallGroupSpec[];
      rules: FirewallRuleSpec[];
    };
    exposure?: ExposureSpec;
    observability?: ObservabilitySpec;
    data?: {
      databases?: DatabaseServiceSpec[];
    };
    supplyChain?: SupplyChainSpec;
    lifecycle?: LifecycleSpec;
    logicalInterfaces?: LogicalInterfaceSpec[];
    useCases?: UseCaseSpec[];
  };
}

export interface EnvironmentOverlay {
  apiVersion: 'archinex.io/v1alpha1';
  kind: 'EnvironmentOverlay';
  metadata: {
    name: string;
    environment: string;
    version: string;
    manifestVersion: number;
  };
  spec: {
    datacenters: string[]; // ex: ['dc1', 'dc2'] ou ['dc1', 'dc2', 'dc3'] pour What-If
    substitutions: Record<string, unknown>;
    policies?: {
      changeWindow?: string;
      minReplicas?: number;
      immutableImageTag?: boolean;
    };
  };
}

export interface ComponentCatalogBundle {
  catalogs: ValueCatalogs;
  components: LogicalComponent[];
  overlays: EnvironmentOverlay[];
}

export interface BaseLintIssue {
  component: string;
  path: string;
  code:
    | 'hardcoded-env-value'
    | 'invalid-catalog-ref'
    | 'invalid-nic-config'
    | 'invalid-organization'
    | 'invalid-certificate-profile'
    | 'missing-driver-capability';
  message: string;
}

export const DEFAULT_VALUE_CATALOGS: ValueCatalogs = {
  version: '1.0.0',
  environments: [
    {
      name: 'prod',
      tier: 1,
      policies: {
        changeWindow: 'Sunday 02:00-06:00',
        minReplicas: 2,
        immutableImageTag: true,
        siemMandatory: true
      },
      allowedZones: ['dmz', 'app', 'data', 'admin', 'events']
    },
    {
      name: 'preprod',
      tier: 2,
      policies: {
        changeWindow: 'Wednesday 22:00-02:00',
        minReplicas: 2,
        immutableImageTag: true,
        siemMandatory: true
      },
      allowedZones: ['dmz', 'app', 'data', 'admin', 'events']
    },
    {
      name: 'lab',
      tier: 3,
      policies: {
        minReplicas: 1,
        immutableImageTag: false,
        siemMandatory: false
      },
      allowedZones: ['dmz', 'app', 'data', 'admin', 'events']
    }
  ],
  datacenters: [
    { name: 'dc1', region: 'eu-west-1', failureDomain: 'az-paris-nord', drRole: 'primary' },
    { name: 'dc2', region: 'eu-west-1', failureDomain: 'az-paris-sud', drRole: 'secondary' },
    { name: 'dc3', region: 'eu-west-2', failureDomain: 'az-lyon-est', drRole: 'tertiary' }
  ],
  zones: ['dmz', 'app', 'data', 'admin', 'events'],
  nicClasses: ['admin', 'business', 'events', 'internal', 'storage', 'backup', 'oob'],
  nicSubClasses: ['trusted', 'untrusted', 'sync'],
  storageTiers: [
    { tier: 'hot', media: 'ssd', defaultReclaimPolicy: 'delete' },
    { tier: 'warm', media: 'hybrid', defaultReclaimPolicy: 'retain' },
    { tier: 'cold', media: 'hdd', defaultReclaimPolicy: 'retain' }
  ],
  qosClasses: [
    { name: 'ef', dscp: 'ef', tos: 184, priority: 'highest', description: 'Expedited Forwarding (VoIP / Signaling / Slice critique)' },
    { name: 'af31', dscp: 'af31', tos: 104, priority: 'high', description: 'Assured Forwarding Class 3 (API / Trafic applicatif prioritaire)' },
    { name: 'best-effort', dscp: 'cs0', tos: 0, priority: 'standard', description: 'Trafic standard' }
  ],
  vlanPools: [
    { zone: 'dmz', range: '1100-1199' },
    { zone: 'app', range: '1200-1299' },
    { zone: 'data', range: '1300-1399' },
    { zone: 'admin', range: '1400-1499' },
    { zone: 'events', range: '1500-1599' }
  ],
  vniPools: [
    { zone: 'dmz', range: '10100-10199' },
    { zone: 'app', range: '10200-10299' },
    { zone: 'data', range: '10300-10399' }
  ],
  firewalls: [
    {
      name: 'fw-interzone-core',
      usage: 'interzone',
      zones: ['admin', 'app', 'data', 'dmz', 'events'],
      enforcement: 'zone-to-zone deny-by-default'
    },
    {
      name: 'fw-external',
      usage: 'external',
      zones: ['dmz', 'untrusted-external'],
      enforcement: 'deny-by-default'
    },
    {
      name: 'fw-operator-link',
      usage: 'operator-link',
      zones: ['core-signaling', 'operators'],
      enforcement: 'strict-signaling, ips: enabled'
    }
  ],
  certificateProfiles: [
    {
      name: 'tls-server-std',
      description: 'Standard TLS server certificate (RGS-aligned)',
      type: 'server',
      validityDays: 90,
      keySize: 3072,
      algorithm: 'rsa',
      extendedKeyUsage: ['serverAuth', 'clientAuth'],
      keyUsage: ['digitalSignature', 'keyEncipherment'],
      keyType: { private: 'nonExportable', storage: 'hsm' }
    },
    {
      name: 'tls-client-mtls',
      description: 'Machine-to-machine mTLS client certificate',
      type: 'client',
      validityDays: 365,
      keySize: 256,
      algorithm: 'ecdsa',
      extendedKeyUsage: ['clientAuth'],
      keyUsage: ['digitalSignature'],
      keyType: { private: 'nonExportable', storage: 'vault' }
    }
  ],
  drivers: [
    {
      name: 'cluster-rancher',
      targetTechnology: 'Kubernetes / RKE2 Orchestrator',
      operations: ['createTenant', 'createComponent', 'createModule', 'deployWorkload', 'reconcile'],
      supportsPlan: true
    },
    {
      name: 'ip-fabric',
      targetTechnology: 'EVPN/VXLAN Spine-Leaf Fabric',
      operations: ['createTenant', 'createComponent', 'createModule', 'createVrf', 'createVlan', 'applyRoutes', 'applyBgpPropagation', 'reconcile'],
      supportsPlan: true
    },
    {
      name: 'firewall-ngfw',
      targetTechnology: 'NGFW / Firewall Fleet',
      operations: ['createTenant', 'createComponent', 'createModule', 'applyFirewall', 'reconcile'],
      supportsPlan: true
    },
    {
      name: 'ipam-dns',
      targetTechnology: 'Central IPAM + Per-VRF DNS',
      operations: ['createTenant', 'createComponent', 'createModule', 'manageAddressPlan', 'reconcile'],
      supportsPlan: true
    },
    {
      name: 'hardware-redfish',
      targetTechnology: 'BMC / Redfish / Metal3',
      operations: ['createTenant', 'createComponent', 'createModule', 'manageHardware', 'reconcile'],
      supportsPlan: true
    },
    {
      name: 'storage-svm',
      targetTechnology: 'Storage Array / SVMs / S3',
      operations: ['createTenant', 'createComponent', 'createModule', 'provisionStorage', 'reconcile'],
      supportsPlan: true
    }
  ],
  functionalDomains: [
    {
      name: 'core-network',
      description: 'Fonctions cœur de réseau 4G/5GC (AMF, SMF, UPF, HSS, DEA, SecGW)',
      editors: ['netops-core'],
      policies: { tier: 1, changeWindow: 'Sunday 02:00-06:00', drTarget: 99.999 }
    },
    {
      name: 'ptt-services',
      description: 'Services critiques Mission-Critical (MCPTT, MCVideo, MCData)',
      editors: ['ptt-ops'],
      policies: { tier: 1, drTarget: 99.99 }
    },
    {
      name: 'gis-services',
      description: 'Cartographie, SIG, PostGIS et tuiles temps réel',
      editors: ['gis-ops'],
      policies: { tier: 2, drTarget: 99.95 }
    },
    {
      name: 'security',
      description: 'Services de sécurité transverses (PKI, IAM, Proxy, SIEM)',
      editors: ['secops'],
      policies: { tier: 1, drTarget: 99.999 }
    },
    {
      name: 'it',
      description: 'Services d’infrastructure IT et externes',
      editors: ['itops', 'netops-transport']
    }
  ],
  forbiddenOffsets: { min: 0, max: 31 }
};

export const DEFAULT_COMPONENT_CATALOG: LogicalComponent[] = [
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'LogicalComponent',
    metadata: {
      name: 'core-network',
      displayName: 'Cœur de Réseau 4G/5GC (AMF/SMF/UPF/HSS)',
      tenant: 'tenant-core-network',
      external: false,
      functionalDomain: 'core-network',
      editor: 'netops-core',
      status: 'active',
      version: '2.1.0',
      manifestVersion: 14,
      labels: { criticality: 'tier-1' }
    },
    spec: {
      class: 'business',
      dependsOn: ['eir-proxy'],
      crossTenantContracts: [
        {
          targetComponent: 'ptt-server',
          purpose: 'Contrôle QoS Rx/N5 entre serveur PTT et cœur 5GC',
          approvedBy: ['netops-core', 'ptt-ops']
        },
        {
          targetComponent: 'gsma-eir',
          purpose: 'Vérification IMEI S13/EIR via proxy DMZ',
          approvedBy: ['netops-core', 'netops-transport']
        }
      ],
      network: {
        vrfs: [
          { name: 'vrf-core-sig', domain: 'sig.core.internal', tenantRef: 'ref(component.metadata.tenant)' },
          { name: 'vrf-core-events', domain: 'events.internal' },
          { name: 'vrf-core-admin', domain: 'admin.internal' }
        ],
        subnets: [
          {
            name: 'sn-core-sig',
            cidr: 'ref(param.core.subnet.sig)',
            vrf: 'vrf-core-sig',
            zone: 'app',
            class: 'business',
            subClass: 'trusted',
            reserved: { gateway: { offset: 1 }, 'vip-rx': { offset: 10 } }
          },
          {
            name: 'sn-core-events',
            cidr: 'ref(param.core.subnet.events)',
            vrf: 'vrf-core-events',
            zone: 'events',
            class: 'events'
          },
          {
            name: 'sn-core-admin',
            cidr: 'ref(param.core.subnet.admin)',
            vrf: 'vrf-core-admin',
            zone: 'admin',
            class: 'admin'
          }
        ]
      },
      compute: {
        modules: [
          {
            name: 'upf-cnf',
            kind: 'container',
            role: 'user-plane',
            status: 'active',
            instances: 'ref(param.core.instances.upf)',
            placement: {
              requiredDataplane: 'sriov-dpdk',
              zone: 'app',
              pool: 'sylva-cnf-sriov-dpdk'
            },
            nics: [
              { class: 'admin', index: 1, vrf: 'vrf-core-admin', subnetRef: 'sn-core-admin', ip: { by: 'offset', value: 32, perInstance: true } },
              { class: 'business', subClass: 'trusted', index: 2, vrf: 'vrf-core-sig', subnetRef: 'sn-core-sig', ip: { by: 'offset', value: 40, perInstance: true }, defaultRoute: true },
              { class: 'events', index: 3, vrf: 'vrf-core-events', subnetRef: 'sn-core-events', ip: { by: 'dhcp' } }
            ],
            helm: { repo: 'oci://registry.sylva.internal/telco', chart: 'open5gs-upf', version: 'ref(param.core.chartVersion)' },
            storage: [{ name: 'upf-logs', size: '50Gi', tier: 'warm', svmRef: 'svm-core-network' }]
          },
          {
            name: 'hss-dea',
            kind: 'container',
            role: 'signaling-mediation',
            status: 'active',
            instances: 2,
            placement: {
              requiredDataplane: 'standard-nis2',
              zone: 'app',
              pool: 'sylva-standard-nis2'
            },
            nics: [
              { class: 'admin', index: 1, vrf: 'vrf-core-admin', subnetRef: 'sn-core-admin', ip: { by: 'offset', value: 50, perInstance: true } },
              { class: 'business', subClass: 'trusted', index: 2, vrf: 'vrf-core-sig', subnetRef: 'sn-core-sig', ip: { by: 'offset', value: 60, perInstance: true }, defaultRoute: true },
              { class: 'events', index: 3, vrf: 'vrf-core-events', subnetRef: 'sn-core-events', ip: { by: 'dhcp' } }
            ],
            helm: { repo: 'oci://registry.sylva.internal/telco', chart: 'diameter-dea-hss', version: 'ref(param.core.chartVersion)' }
          }
        ]
      },
      storage: {
        svms: [
          {
            name: 'svm-core-network',
            tenantRef: 'ref(component.metadata.tenant)',
            backend: 'longhorn-nvme',
            tiers: [
              { tier: 'hot', quota: 'ref(param.storage.hot.quota)' },
              { tier: 'warm', quota: 'ref(param.storage.warm.quota)' }
            ]
          }
        ]
      },
      security: {
        vault: {
          mount: 'vault://tenant-core-network',
          paths: [{ name: 'diameter-secret', rule: 'high-entropy-32', rotationDays: 90 }]
        },
        certificates: [
          {
            name: 'core-rx-tls',
            type: 'server',
            cn: 'rx.sig.core.internal',
            sanDns: ['rx.sig.core.internal'],
            sanIps: ['ref(network.subnets[sn-core-sig].reserved[vip-rx])'],
            validityDays: 90,
            issuanceMethod: 'internal-ca',
            autoRenew: true,
            boundToVip: 'ref(network.subnets[sn-core-sig].reserved[vip-rx])',
            sslTermination: 'destination'
          }
        ]
      },
      firewall: {
        policy: 'deny-by-default',
        groups: [
          { name: 'core-sig-endpoints', membersRef: 'ref(compute.modules[hss-dea].instances[*].nics[class=business].ip)' },
          { name: 'core-upf-endpoints', membersRef: 'ref(compute.modules[upf-cnf].instances[*].nics[class=business].ip)' },
          { name: 'core-events', membersRef: 'ref(compute.modules[upf-cnf].instances[*].nics[class=events].ip)' }
        ],
        rules: [
          {
            id: 'r-core-rx',
            from: 'ref(component:ptt-server.firewall.groups[ptt-app])',
            to: 'group:core-sig-endpoints',
            proto: 'tcp',
            ports: [3868],
            action: 'allow',
            log: true,
            tlsVersion: 'tls1.3',
            functionalFlow: 'Rx-N5'
          }
        ]
      },
      logicalInterfaces: [
        {
          name: 'S6a',
          direction: 'bidirectional',
          description: 'Signalisation MME <-> HSS via SecGW & DEA (Diameter SCTP/3868)',
          flows: [
            { segment: 'seg-1', from: 'group:ext-mme-lot3', to: 'group:secgw-lot1', proto: 'sctp', port: 3868, direction: 'out' },
            { segment: 'seg-2', from: 'group:secgw-lot1', to: 'group:core-sig-endpoints', proto: 'sctp', port: 3868, direction: 'out' }
          ]
        },
        {
          name: 'Rx-N5',
          direction: 'bidirectional',
          description: 'Contrôle QoS applicatif PTT <-> Cœur 5GC',
          flows: [
            { segment: 'seg-1', from: 'group:ptt-app', to: 'group:core-sig-endpoints', proto: 'tcp', port: 3868, direction: 'out', tlsVersion: 'tls1.3' }
          ]
        }
      ],
      useCases: [
        {
          name: 'ptt-priority-call',
          description: 'Établissement d’appel critique PTT avec QoS garantie sur le cœur 5GC',
          interfaces: ['ref(logicalInterfaces[Rx-N5])', 'ref(logicalInterfaces[S6a])'],
          status: 'active'
        }
      ]
    }
  },
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'LogicalComponent',
    metadata: {
      name: 'ptt-server',
      displayName: 'Serveur PTT (MCPTT / MCVideo / MCData)',
      tenant: 'tenant-ptt-server',
      external: false,
      functionalDomain: 'ptt-services',
      editor: 'ptt-ops',
      status: 'active',
      version: '3.4.0',
      manifestVersion: 9
    },
    spec: {
      class: 'business',
      dependsOn: ['core-network', 'gis-server'],
      crossTenantContracts: [
        {
          targetComponent: 'gis-server',
          purpose: 'Flux cartographique WMS/WFS pour géolocalisation des terminaux PTT',
          approvedBy: ['ptt-ops', 'gis-ops']
        }
      ],
      network: {
        vrfs: [
          { name: 'vrf-ptt-app', domain: 'ptt.internal', tenantRef: 'ref(component.metadata.tenant)' },
          { name: 'vrf-ptt-events', domain: 'events.internal' },
          { name: 'vrf-ptt-admin', domain: 'admin.internal' }
        ],
        subnets: [
          {
            name: 'sn-ptt-app',
            cidr: 'ref(param.ptt.subnet.app)',
            vrf: 'vrf-ptt-app',
            zone: 'app',
            class: 'business',
            reserved: { gateway: { offset: 1 }, 'vip-ptt': { offset: 10 } }
          },
          { name: 'sn-ptt-events', cidr: 'ref(param.ptt.subnet.events)', vrf: 'vrf-ptt-events', zone: 'events', class: 'events' },
          { name: 'sn-ptt-admin', cidr: 'ref(param.ptt.subnet.admin)', vrf: 'vrf-ptt-admin', zone: 'admin', class: 'admin' }
        ]
      },
      compute: {
        modules: [
          {
            name: 'mcptt-core',
            kind: 'container',
            role: 'ptt-control',
            status: 'active',
            instances: 'ref(param.ptt.instances.mcptt)',
            placement: { requiredDataplane: 'standard-nis2', zone: 'app', pool: 'sylva-standard-nis2' },
            nics: [
              { class: 'admin', index: 1, vrf: 'vrf-ptt-admin', subnetRef: 'sn-ptt-admin', ip: { by: 'offset', value: 32, perInstance: true } },
              { class: 'business', index: 2, vrf: 'vrf-ptt-app', subnetRef: 'sn-ptt-app', ip: { by: 'offset', value: 40, perInstance: true }, defaultRoute: true },
              { class: 'events', index: 3, vrf: 'vrf-ptt-events', subnetRef: 'sn-ptt-events', ip: { by: 'dhcp' } }
            ],
            helm: { repo: 'oci://registry.sylva.internal/ptt', chart: 'ptt-suite', version: 'ref(param.ptt.chartVersion)' },
            storage: [{ name: 'ptt-media', size: '100Gi', tier: 'hot', svmRef: 'svm-ptt-server' }]
          }
        ]
      },
      storage: {
        svms: [
          {
            name: 'svm-ptt-server',
            tenantRef: 'ref(component.metadata.tenant)',
            backend: 'longhorn-nvme',
            tiers: [{ tier: 'hot', quota: 'ref(param.storage.hot.quota)' }]
          }
        ]
      },
      security: {
        vault: {
          mount: 'vault://tenant-ptt-server',
          paths: [{ name: 'sip-tls-key', rule: 'ecdsa-p256', rotationDays: 60 }]
        },
        certificates: [
          {
            name: 'ptt-api-tls',
            type: 'server',
            cn: 'api.ptt.internal',
            sanDns: ['api.ptt.internal'],
            sanIps: ['ref(network.subnets[sn-ptt-app].reserved[vip-ptt])'],
            validityDays: 90,
            issuanceMethod: 'internal-ca',
            autoRenew: true
          }
        ]
      },
      firewall: {
        policy: 'deny-by-default',
        groups: [
          { name: 'ptt-app', membersRef: 'ref(compute.modules[mcptt-core].instances[*].nics[class=business].ip)' },
          { name: 'ptt-events', membersRef: 'ref(compute.modules[mcptt-core].instances[*].nics[class=events].ip)' }
        ],
        rules: [
          {
            id: 'r-PTT-gis',
            from: 'group:ptt-app',
            to: 'ref(component:gis-server.firewall.groups[gis-api])',
            proto: 'tcp',
            ports: [443],
            action: 'allow',
            log: true,
            tlsVersion: 'tls1.3',
            functionalFlow: 'WMS-WFS'
          }
        ]
      },
      logicalInterfaces: [
        {
          name: 'WMS-WFS',
          direction: 'unidirectional',
          description: 'Requêtes cartographiques PTT -> GIS Server (HTTPS/GeoJSON)',
          flows: [
            { segment: 'seg-1', from: 'group:ptt-app', to: 'group:gis-api', proto: 'tcp', port: 443, direction: 'out', tlsVersion: 'tls1.3' }
          ]
        }
      ],
      useCases: [
        {
          name: 'tactical-situation-map',
          description: 'Affichage cartographique temps réel des groupes PTT',
          interfaces: ['ref(logicalInterfaces[WMS-WFS])'],
          status: 'active'
        }
      ]
    }
  },
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'LogicalComponent',
    metadata: {
      name: 'gis-server',
      displayName: 'Serveur GIS / Cartographie (PostGIS & Tuiles)',
      tenant: 'tenant-gis-server',
      external: false,
      functionalDomain: 'gis-services',
      editor: 'gis-ops',
      status: 'active',
      version: '1.8.0',
      manifestVersion: 6
    },
    spec: {
      class: 'business',
      network: {
        vrfs: [
          { name: 'vrf-gis-app', domain: 'gis.internal', tenantRef: 'ref(component.metadata.tenant)' },
          { name: 'vrf-gis-events', domain: 'events.internal' },
          { name: 'vrf-gis-admin', domain: 'admin.internal' }
        ],
        subnets: [
          {
            name: 'sn-gis-app',
            cidr: 'ref(param.gis.subnet.app)',
            vrf: 'vrf-gis-app',
            zone: 'data',
            class: 'business',
            reserved: { gateway: { offset: 1 }, 'vip-gis': { offset: 10 } }
          },
          { name: 'sn-gis-events', cidr: 'ref(param.gis.subnet.events)', vrf: 'vrf-gis-events', zone: 'events', class: 'events' },
          { name: 'sn-gis-admin', cidr: 'ref(param.gis.subnet.admin)', vrf: 'vrf-gis-admin', zone: 'admin', class: 'admin' }
        ]
      },
      compute: {
        modules: [
          {
            name: 'geoserver-api',
            kind: 'container',
            role: 'gis-api',
            status: 'active',
            instances: 'ref(param.gis.instances.api)',
            placement: { requiredDataplane: 'standard-nis2', zone: 'data', pool: 'sylva-standard-nis2' },
            nics: [
              { class: 'admin', index: 1, vrf: 'vrf-gis-admin', subnetRef: 'sn-gis-admin', ip: { by: 'offset', value: 32, perInstance: true } },
              { class: 'business', index: 2, vrf: 'vrf-gis-app', subnetRef: 'sn-gis-app', ip: { by: 'offset', value: 40, perInstance: true }, defaultRoute: true },
              { class: 'events', index: 3, vrf: 'vrf-gis-events', subnetRef: 'sn-gis-events', ip: { by: 'dhcp' } }
            ],
            helm: { repo: 'oci://registry.sylva.internal/gis', chart: 'geoserver-postgis', version: 'ref(param.gis.chartVersion)' },
            storage: [{ name: 'gis-tiles', size: '200Gi', tier: 'warm', svmRef: 'svm-gis-server', reclaimPolicy: 'retain' }]
          }
        ]
      },
      storage: {
        svms: [
          {
            name: 'svm-gis-server',
            tenantRef: 'ref(component.metadata.tenant)',
            backend: 'longhorn-nvme',
            tiers: [{ tier: 'warm', quota: 'ref(param.storage.warm.quota)' }]
          }
        ],
        exports: [
          {
            name: 'tiles-archive',
            svm: 'svm-gis-server',
            tier: 'warm',
            path: '/svm-gis-server/tiles-archive',
            access: [{ grant: 'group:gis-api', rights: 'rw', rootSquash: true }]
          }
        ]
      },
      security: {
        vault: {
          mount: 'vault://tenant-gis-server',
          paths: [{ name: 'postgis-db-password', rule: 'default-password', rotationDays: 90 }]
        },
        certificates: [
          {
            name: 'gis-wms-tls',
            type: 'server',
            cn: 'wms.gis.internal',
            sanDns: ['wms.gis.internal'],
            sanIps: ['ref(network.subnets[sn-gis-app].reserved[vip-gis])'],
            validityDays: 90,
            issuanceMethod: 'internal-ca',
            autoRenew: true
          }
        ]
      },
      firewall: {
        policy: 'deny-by-default',
        groups: [
          { name: 'gis-api', membersRef: 'ref(compute.modules[geoserver-api].instances[*].nics[class=business].ip)' },
          { name: 'gis-events', membersRef: 'ref(compute.modules[geoserver-api].instances[*].nics[class=events].ip)' }
        ],
        rules: []
      }
    }
  },
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'LogicalComponent',
    metadata: {
      name: 'eir-proxy',
      displayName: 'Proxy Sortant EIR (Squid DMZ)',
      tenant: 'tenant-eir-proxy',
      external: false,
      functionalDomain: 'security',
      editor: 'secops',
      status: 'active',
      version: '1.2.0',
      manifestVersion: 18
    },
    spec: {
      class: 'infrastructure',
      dependsOn: ['gsma-eir'],
      network: {
        vrfs: [
          { name: 'vrf-eir-trusted', domain: 'eir-trusted.internal', tenantRef: 'ref(component.metadata.tenant)' },
          { name: 'vrf-dmz-untrusted', domain: 'untrust.dmz.internal' }
        ],
        subnets: [
          {
            name: 'sn-proxy-trust',
            cidr: 'ref(param.proxy.subnet.trust)',
            vrf: 'vrf-eir-trusted',
            zone: 'dmz',
            class: 'business',
            subClass: 'trusted',
            reserved: { gateway: { offset: 1 } }
          },
          {
            name: 'sn-proxy-untrust',
            cidr: 'ref(param.proxy.subnet.untrust)',
            vrf: 'vrf-dmz-untrusted',
            zone: 'dmz',
            class: 'business',
            subClass: 'untrusted',
            reserved: { gateway: { offset: 1 } }
          }
        ],
        vrfBridges: [{ fromVrf: 'vrf-eir-trusted', toVrf: 'vrf-dmz-untrusted', viaModule: 'squid' }]
      },
      compute: {
        modules: [
          {
            name: 'squid',
            kind: 'forward-proxy',
            role: 'vrf-bridge',
            status: 'active',
            instances: 2,
            placement: { requiredDataplane: 'dmz-isolated', zone: 'dmz', pool: 'sylva-standard-nis2' },
            nics: [
              { class: 'business', subClass: 'trusted', index: 1, vrf: 'vrf-eir-trusted', subnetRef: 'sn-proxy-trust', ip: { by: 'offset', value: 35, perInstance: true }, defaultRoute: true },
              { class: 'business', subClass: 'untrusted', index: 2, vrf: 'vrf-dmz-untrusted', subnetRef: 'sn-proxy-untrust', ip: { by: 'offset', value: 35, perInstance: true }, defaultRoute: false }
            ],
            proxy: {
              engine: 'squid',
              accountRef: 'vault://tenant-eir-proxy/service-account',
              ingressFilter: [{ source: 'ref(component:core-network.firewall.groups[core-sig-endpoints])', ports: [3128] }],
              egressFilter: [{ target: 'ref(component:gsma-eir.network.addresses)', ports: [443], proto: 'tcp' }],
              egressPolicy: { default: 'deny', snatRef: 'ref(component.metadata.tenant)' }
            },
            helm: { repo: 'oci://registry.sylva.internal/sec', chart: 'squid-proxy', version: 'ref(param.proxy.chartVersion)' }
          }
        ]
      },
      firewall: {
        policy: 'deny-by-default',
        groups: [
          { name: 'eir-proxy-svc', membersRef: 'ref(compute.modules[squid].instances[*].nics[class=business,subClass=trusted].ip)' }
        ],
        rules: [
          {
            id: 'r-eir-egress',
            from: 'group:eir-proxy-svc',
            to: 'ref(component:gsma-eir.firewall.groups[default])',
            proto: 'tcp',
            ports: [443],
            action: 'allow',
            sslTermination: 'origin',
            tlsVersion: 'tls1.3',
            functionalFlow: 'EIR-Query'
          }
        ]
      }
    }
  },
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'LogicalComponent',
    metadata: {
      name: 'gsma-eir',
      displayName: 'GSMA EIR Externe (Base IMEI Partenaire)',
      tenant: 'tenant-ext-gsma-eir',
      external: true,
      functionalDomain: 'it',
      editor: 'netops-transport',
      status: 'active',
      version: '1.0.0',
      manifestVersion: 3
    },
    spec: {
      class: 'external',
      network: {
        addresses: [{ name: 'gsma-eir-eu', cidr: '198.51.100.0/24', family: 'ipv4', service: 'https-eir' }]
      },
      firewall: {
        policy: 'deny-by-default',
        groups: [{ name: 'default', membersRef: 'ref(network.addresses)' }],
        rules: []
      }
    }
  },
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'LogicalComponent',
    metadata: {
      name: 'mdm-emm',
      displayName: 'Plateforme MDM / EMM & Gestion de Flotte Terminaux',
      tenant: 'tenant-mdm-emm',
      external: false,
      functionalDomain: 'it',
      editor: 'itops',
      status: 'active',
      version: '1.0.0',
      manifestVersion: 1,
      labels: { criticality: 'tier-1', layer: 'endpoint-management' }
    },
    spec: {
      class: 'domain-technical',
      dependsOn: ['pki-ca', 'iam-keycloak', 'siem-soc', 'vault-cluster'],
      network: {
        vrfs: [
          { name: 'vrf-mdm-app', domain: 'mdm.internal', tenantRef: 'ref(component.metadata.tenant)' },
          { name: 'vrf-mdm-events', domain: 'events.internal' },
          { name: 'vrf-mdm-admin', domain: 'admin.internal' }
        ],
        subnets: [
          {
            name: 'sn-mdm-app',
            cidr: 'ref(param.mdm.subnet.app)',
            vrf: 'vrf-mdm-app',
            zone: 'app',
            class: 'business',
            reserved: { gateway: { offset: 1 }, 'vip-mdm': { offset: 10 } }
          },
          { name: 'sn-mdm-events', cidr: 'ref(param.mdm.subnet.events)', vrf: 'vrf-mdm-events', zone: 'events', class: 'events' },
          { name: 'sn-mdm-admin', cidr: 'ref(param.mdm.subnet.admin)', vrf: 'vrf-mdm-admin', zone: 'admin', class: 'admin' }
        ]
      },
      compute: {
        modules: [
          {
            name: 'mdm-controller',
            kind: 'container',
            role: 'mdm-api',
            status: 'active',
            instances: 'ref(param.mdm.instances.controller)',
            placement: { requiredDataplane: 'standard-nis2', zone: 'app', pool: 'sylva-standard-nis2' },
            nics: [
              { class: 'admin', index: 1, vrf: 'vrf-mdm-admin', subnetRef: 'sn-mdm-admin', ip: { by: 'offset', value: 32, perInstance: true } },
              { class: 'business', index: 2, vrf: 'vrf-mdm-app', subnetRef: 'sn-mdm-app', ip: { by: 'offset', value: 40, perInstance: true }, defaultRoute: true },
              { class: 'events', index: 3, vrf: 'vrf-mdm-events', subnetRef: 'sn-mdm-events', ip: { by: 'dhcp' } }
            ],
            helm: { repo: 'oci://registry.sylva.internal/endpoint', chart: 'mdm-emm', version: 'ref(param.mdm.chartVersion)' },
            storage: [{ name: 'mdm-inventory', size: '100Gi', tier: 'warm', svmRef: 'svm-mdm-emm', reclaimPolicy: 'retain' }]
          }
        ]
      },
      storage: {
        svms: [
          {
            name: 'svm-mdm-emm',
            tenantRef: 'ref(component.metadata.tenant)',
            backend: 'longhorn-nvme',
            tiers: [{ tier: 'warm', quota: 'ref(param.storage.warm.quota)' }]
          }
        ]
      },
      security: {
        vault: {
          mount: 'vault://tenant-mdm-emm',
          paths: [{ name: 'mdm-api-signing-key', rule: 'default-password', rotationDays: 90 }]
        },
        certificates: [
          {
            name: 'mdm-api-tls',
            type: 'server',
            cn: 'mdm.internal',
            sanDns: ['mdm.internal', 'emm.internal'],
            sanIps: ['ref(network.subnets[sn-mdm-app].reserved[vip-mdm])'],
            validityDays: 90,
            issuanceMethod: 'internal-ca',
            autoRenew: true
          }
        ]
      },
      firewall: {
        policy: 'deny-by-default',
        groups: [
          { name: 'mdm-controller', membersRef: 'ref(compute.modules[mdm-controller].instances[*].nics[class=business].ip)' },
          { name: 'mdm-events', membersRef: 'ref(compute.modules[mdm-controller].instances[*].nics[class=events].ip)' }
        ],
        rules: []
      }
    }
  },
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'LogicalComponent',
    metadata: {
      name: 'endpoint-os-profile',
      displayName: 'Profil OS Terminal Durci & Contrôleur de Posture Endpoint',
      tenant: 'tenant-endpoint-os-profile',
      external: false,
      functionalDomain: 'security',
      editor: 'secops',
      status: 'active',
      version: '1.0.0',
      manifestVersion: 1,
      labels: { criticality: 'tier-1', layer: 'endpoint-hardening' }
    },
    spec: {
      class: 'domain-technical',
      dependsOn: ['mdm-emm', 'pki-ca', 'siem-soc'],
      network: {
        vrfs: [
          { name: 'vrf-endpoint-app', domain: 'endpoint.internal', tenantRef: 'ref(component.metadata.tenant)' },
          { name: 'vrf-endpoint-events', domain: 'events.internal' },
          { name: 'vrf-endpoint-admin', domain: 'admin.internal' }
        ],
        subnets: [
          {
            name: 'sn-endpoint-app',
            cidr: 'ref(param.endpoint.subnet.app)',
            vrf: 'vrf-endpoint-app',
            zone: 'app',
            class: 'business',
            reserved: { gateway: { offset: 1 }, 'vip-endpoint': { offset: 10 } }
          },
          { name: 'sn-endpoint-events', cidr: 'ref(param.endpoint.subnet.events)', vrf: 'vrf-endpoint-events', zone: 'events', class: 'events' },
          { name: 'sn-endpoint-admin', cidr: 'ref(param.endpoint.subnet.admin)', vrf: 'vrf-endpoint-admin', zone: 'admin', class: 'admin' }
        ]
      },
      compute: {
        modules: [
          {
            name: 'endpoint-policy-agent',
            kind: 'container',
            role: 'endpoint-attestation',
            status: 'active',
            instances: 'ref(param.endpoint.instances.policy)',
            placement: { requiredDataplane: 'standard-nis2', zone: 'app', pool: 'sylva-standard-nis2' },
            nics: [
              { class: 'admin', index: 1, vrf: 'vrf-endpoint-admin', subnetRef: 'sn-endpoint-admin', ip: { by: 'offset', value: 32, perInstance: true } },
              { class: 'business', index: 2, vrf: 'vrf-endpoint-app', subnetRef: 'sn-endpoint-app', ip: { by: 'offset', value: 40, perInstance: true }, defaultRoute: true },
              { class: 'events', index: 3, vrf: 'vrf-endpoint-events', subnetRef: 'sn-endpoint-events', ip: { by: 'dhcp' } }
            ],
            helm: { repo: 'oci://registry.sylva.internal/endpoint', chart: 'endpoint-os-profile', version: 'ref(param.endpoint.chartVersion)' }
          }
        ]
      },
      security: {
        vault: {
          mount: 'vault://tenant-endpoint-os-profile',
          paths: [{ name: 'attestation-root-key', rule: 'default-password', rotationDays: 90 }]
        },
        certificates: [
          {
            name: 'endpoint-attestation-tls',
            type: 'server',
            cn: 'attestation.endpoint.internal',
            sanDns: ['attestation.endpoint.internal'],
            sanIps: ['ref(network.subnets[sn-endpoint-app].reserved[vip-endpoint])'],
            validityDays: 90,
            issuanceMethod: 'internal-ca',
            autoRenew: true
          }
        ]
      },
      firewall: {
        policy: 'deny-by-default',
        groups: [
          { name: 'endpoint-policy-agent', membersRef: 'ref(compute.modules[endpoint-policy-agent].instances[*].nics[class=business].ip)' },
          { name: 'endpoint-events', membersRef: 'ref(compute.modules[endpoint-policy-agent].instances[*].nics[class=events].ip)' }
        ],
        rules: []
      }
    }
  }
];

/**
 * Composants logiques transverses de sécurité, chaîne de confiance, identité, observabilité et périmètre DMZ
 * nécessaires à l'hydratation complète des flux implicites (`pki-ca-endpoints`, `siem-collectors`, `vault://*`).
 * Conservés séparément de DEFAULT_COMPONENT_CATALOG pour préserver la compatibilité des tests de référence de Lot 1.
 */
export const TRANSVERSE_COMPONENT_CATALOG: LogicalComponent[] = [
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'LogicalComponent',
    metadata: {
      name: 'hsm-appliance',
      displayName: 'Module Matériel de Sécurité HSM (PKCS#11 Réseau)',
      tenant: 'tenant-security-trust',
      external: false,
      functionalDomain: 'security',
      editor: 'secops',
      status: 'active',
      version: '1.0.0',
      manifestVersion: 1,
      labels: { criticality: 'tier-1', layer: 'trust-root' }
    },
    spec: {
      class: 'domain-technical',
      dependsOn: ['siem-soc'],
      network: {
        vrfs: [
          { name: 'vrf-sec-hsm', domain: 'hsm.sec.internal', tenantRef: 'ref(component.metadata.tenant)' },
          { name: 'vrf-sec-events', domain: 'events.internal' },
          { name: 'vrf-sec-admin', domain: 'admin.internal' }
        ],
        subnets: [
          {
            name: 'sn-hsm-app',
            cidr: 'ref(param.hsm.subnet.app)',
            vrf: 'vrf-sec-hsm',
            zone: 'data',
            class: 'business',
            subClass: 'trusted',
            reserved: { gateway: { offset: 1 }, 'vip-pkcs11': { offset: 10 } }
          },
          { name: 'sn-hsm-events', cidr: 'ref(param.hsm.subnet.events)', vrf: 'vrf-sec-events', zone: 'events', class: 'events' },
          { name: 'sn-hsm-admin', cidr: 'ref(param.hsm.subnet.admin)', vrf: 'vrf-sec-admin', zone: 'admin', class: 'admin' }
        ]
      },
      compute: {
        modules: [
          {
            name: 'hsm-pkcs11-node',
            kind: 'vm',
            role: 'hardware-trust-root',
            status: 'active',
            instances: 'ref(param.hsm.instances.appliance)',
            placement: { requiredDataplane: 'standard-nis2', zone: 'data', pool: 'sylva-standard-nis2' },
            nics: [
              { class: 'admin', index: 1, vrf: 'vrf-sec-admin', subnetRef: 'sn-hsm-admin', ip: { by: 'offset', value: 32, perInstance: true } },
              { class: 'business', subClass: 'trusted', index: 2, vrf: 'vrf-sec-hsm', subnetRef: 'sn-hsm-app', ip: { by: 'offset', value: 40, perInstance: true }, defaultRoute: true },
              { class: 'events', index: 3, vrf: 'vrf-sec-events', subnetRef: 'sn-hsm-events', ip: { by: 'dhcp' } }
            ],
            helm: { repo: 'oci://registry.sylva.internal/sec', chart: 'hsm-pkcs11-agent', version: 'ref(param.hsm.chartVersion)' }
          }
        ]
      },
      firewall: {
        policy: 'deny-by-default',
        groups: [
          { name: 'hsm-pkcs11-cluster', membersRef: 'ref(compute.modules[hsm-pkcs11-node].instances[*].nics[class=business].ip)' }
        ],
        rules: [
          {
            id: 'r-hsm-pkcs11',
            from: 'group:pki-ca-endpoints',
            to: 'group:hsm-pkcs11-cluster',
            proto: 'tcp',
            ports: [2000, 1792],
            action: 'allow',
            log: true,
            tlsVersion: 'tls1.3',
            functionalFlow: 'PKCS11-HSM'
          }
        ]
      }
    }
  },
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'LogicalComponent',
    metadata: {
      name: 'pki-ca',
      displayName: 'Autorité de Certification PKI (EJBCA CMPv2 & ACME)',
      tenant: 'tenant-security-pki',
      external: false,
      functionalDomain: 'security',
      editor: 'secops',
      status: 'active',
      version: '2.0.0',
      manifestVersion: 4,
      labels: { criticality: 'tier-1', layer: 'trust-chain' }
    },
    spec: {
      class: 'domain-technical',
      dependsOn: ['hsm-appliance', 'vault-cluster'],
      network: {
        vrfs: [
          { name: 'vrf-pki-app', domain: 'pki.sec.internal', tenantRef: 'ref(component.metadata.tenant)' },
          { name: 'vrf-pki-events', domain: 'events.internal' },
          { name: 'vrf-pki-admin', domain: 'admin.internal' }
        ],
        subnets: [
          {
            name: 'sn-pki-app',
            cidr: 'ref(param.pki.subnet.app)',
            vrf: 'vrf-pki-app',
            zone: 'data',
            class: 'business',
            subClass: 'trusted',
            reserved: { gateway: { offset: 1 }, 'vip-ca': { offset: 10 } }
          },
          { name: 'sn-pki-events', cidr: 'ref(param.pki.subnet.events)', vrf: 'vrf-pki-events', zone: 'events', class: 'events' },
          { name: 'sn-pki-admin', cidr: 'ref(param.pki.subnet.admin)', vrf: 'vrf-pki-admin', zone: 'admin', class: 'admin' }
        ]
      },
      compute: {
        modules: [
          {
            name: 'ejbca-ca',
            kind: 'container',
            role: 'certificate-authority',
            status: 'active',
            instances: 'ref(param.pki.instances.ejbca)',
            placement: { requiredDataplane: 'standard-nis2', zone: 'data', pool: 'sylva-standard-nis2' },
            nics: [
              { class: 'admin', index: 1, vrf: 'vrf-pki-admin', subnetRef: 'sn-pki-admin', ip: { by: 'offset', value: 32, perInstance: true } },
              { class: 'business', subClass: 'trusted', index: 2, vrf: 'vrf-pki-app', subnetRef: 'sn-pki-app', ip: { by: 'offset', value: 40, perInstance: true }, defaultRoute: true },
              { class: 'events', index: 3, vrf: 'vrf-pki-events', subnetRef: 'sn-pki-events', ip: { by: 'dhcp' } }
            ],
            helm: { repo: 'oci://registry.sylva.internal/sec', chart: 'ejbca-cmpv2-ha', version: 'ref(param.pki.chartVersion)' }
          }
        ]
      },
      security: {
        vault: {
          mount: 'vault://tenant-security-pki',
          paths: [{ name: 'ca-db-credentials', rule: 'high-entropy-32', rotationDays: 30 }]
        },
        certificates: [
          {
            name: 'sub-ca-cmpv2',
            type: 'ca',
            cn: 'ca.pki.sec.internal',
            sanDns: ['ca.pki.sec.internal', 'cmpv2.pki.sec.internal'],
            sanIps: ['ref(network.subnets[sn-pki-app].reserved[vip-ca])'],
            validityDays: 1825,
            issuanceMethod: 'internal-ca',
            autoRenew: false,
            boundToVip: 'ref(network.subnets[sn-pki-app].reserved[vip-ca])',
            sslTermination: 'destination'
          }
        ]
      },
      firewall: {
        policy: 'deny-by-default',
        groups: [
          { name: 'pki-ca-endpoints', membersRef: 'ref(compute.modules[ejbca-ca].instances[*].nics[class=business].ip)' }
        ],
        rules: [
          {
            id: 'r-pki-hsm',
            from: 'group:pki-ca-endpoints',
            to: 'group:hsm-pkcs11-cluster',
            proto: 'tcp',
            ports: [2000, 1792],
            action: 'allow',
            log: true,
            tlsVersion: 'tls1.3',
            functionalFlow: 'PKCS11-HSM'
          }
        ]
      }
    }
  },
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'LogicalComponent',
    metadata: {
      name: 'vault-cluster',
      displayName: 'Coffre de Secrets HA (OpenBao / Vault PKCS#11)',
      tenant: 'tenant-security-vault',
      external: false,
      functionalDomain: 'security',
      editor: 'secops',
      status: 'active',
      version: '2.1.0',
      manifestVersion: 5,
      labels: { criticality: 'tier-1', layer: 'trust-chain' }
    },
    spec: {
      class: 'domain-technical',
      dependsOn: ['hsm-appliance', 'pki-ca'],
      network: {
        vrfs: [
          { name: 'vrf-vault-app', domain: 'vault.sec.internal', tenantRef: 'ref(component.metadata.tenant)' },
          { name: 'vrf-vault-events', domain: 'events.internal' },
          { name: 'vrf-vault-admin', domain: 'admin.internal' }
        ],
        subnets: [
          {
            name: 'sn-vault-app',
            cidr: 'ref(param.vault.subnet.app)',
            vrf: 'vrf-vault-app',
            zone: 'data',
            class: 'business',
            subClass: 'trusted',
            reserved: { gateway: { offset: 1 }, 'vip-vault': { offset: 10 } }
          },
          { name: 'sn-vault-events', cidr: 'ref(param.vault.subnet.events)', vrf: 'vrf-vault-events', zone: 'events', class: 'events' },
          { name: 'sn-vault-admin', cidr: 'ref(param.vault.subnet.admin)', vrf: 'vrf-vault-admin', zone: 'admin', class: 'admin' }
        ]
      },
      compute: {
        modules: [
          {
            name: 'openbao-raft',
            kind: 'container',
            role: 'secrets-kms',
            status: 'active',
            instances: 'ref(param.vault.instances.cluster)',
            placement: { requiredDataplane: 'standard-nis2', zone: 'data', pool: 'sylva-standard-nis2' },
            nics: [
              { class: 'admin', index: 1, vrf: 'vrf-vault-admin', subnetRef: 'sn-vault-admin', ip: { by: 'offset', value: 32, perInstance: true } },
              { class: 'business', subClass: 'trusted', index: 2, vrf: 'vrf-vault-app', subnetRef: 'sn-vault-app', ip: { by: 'offset', value: 40, perInstance: true }, defaultRoute: true },
              { class: 'events', index: 3, vrf: 'vrf-vault-events', subnetRef: 'sn-vault-events', ip: { by: 'dhcp' } }
            ],
            helm: { repo: 'oci://registry.sylva.internal/sec', chart: 'openbao-ha-raft', version: 'ref(param.vault.chartVersion)' }
          }
        ]
      },
      security: {
        certificates: [
          {
            name: 'vault-api-tls',
            type: 'server',
            cn: 'vault.sec.internal',
            sanDns: ['vault.sec.internal'],
            sanIps: ['ref(network.subnets[sn-vault-app].reserved[vip-vault])'],
            validityDays: 90,
            issuanceMethod: 'internal-ca',
            autoRenew: true,
            boundToVip: 'ref(network.subnets[sn-vault-app].reserved[vip-vault])',
            sslTermination: 'destination'
          }
        ]
      },
      firewall: {
        policy: 'deny-by-default',
        groups: [
          { name: 'vault-kms-cluster', membersRef: 'ref(compute.modules[openbao-raft].instances[*].nics[class=business].ip)' }
        ],
        rules: [
          {
            id: 'r-vault-hsm-unseal',
            from: 'group:vault-kms-cluster',
            to: 'group:hsm-pkcs11-cluster',
            proto: 'tcp',
            ports: [2000, 1792],
            action: 'allow',
            log: true,
            tlsVersion: 'tls1.3',
            functionalFlow: 'Vault-AutoUnseal'
          }
        ]
      }
    }
  },
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'LogicalComponent',
    metadata: {
      name: 'iam-keycloak',
      displayName: 'Fédération d’Identité IAM (Keycloak OIDC / FIDO2)',
      tenant: 'tenant-security-iam',
      external: false,
      functionalDomain: 'security',
      editor: 'secops',
      status: 'active',
      version: '24.0.0',
      manifestVersion: 3,
      labels: { criticality: 'tier-1', layer: 'identity' }
    },
    spec: {
      class: 'domain-technical',
      dependsOn: ['pki-ca', 'vault-cluster', 'siem-soc'],
      network: {
        vrfs: [
          { name: 'vrf-iam-app', domain: 'iam.sec.internal', tenantRef: 'ref(component.metadata.tenant)' },
          { name: 'vrf-iam-events', domain: 'events.internal' },
          { name: 'vrf-iam-admin', domain: 'admin.internal' }
        ],
        subnets: [
          {
            name: 'sn-iam-app',
            cidr: 'ref(param.iam.subnet.app)',
            vrf: 'vrf-iam-app',
            zone: 'app',
            class: 'business',
            subClass: 'trusted',
            reserved: { gateway: { offset: 1 }, 'vip-sso': { offset: 10 } }
          },
          { name: 'sn-iam-events', cidr: 'ref(param.iam.subnet.events)', vrf: 'vrf-iam-events', zone: 'events', class: 'events' },
          { name: 'sn-iam-admin', cidr: 'ref(param.iam.subnet.admin)', vrf: 'vrf-iam-admin', zone: 'admin', class: 'admin' }
        ]
      },
      compute: {
        modules: [
          {
            name: 'keycloak-idp',
            kind: 'container',
            role: 'identity-provider',
            status: 'active',
            instances: 'ref(param.iam.instances.keycloak)',
            placement: { requiredDataplane: 'standard-nis2', zone: 'app', pool: 'sylva-standard-nis2' },
            nics: [
              { class: 'admin', index: 1, vrf: 'vrf-iam-admin', subnetRef: 'sn-iam-admin', ip: { by: 'offset', value: 32, perInstance: true } },
              { class: 'business', subClass: 'trusted', index: 2, vrf: 'vrf-iam-app', subnetRef: 'sn-iam-app', ip: { by: 'offset', value: 40, perInstance: true }, defaultRoute: true },
              { class: 'events', index: 3, vrf: 'vrf-iam-events', subnetRef: 'sn-iam-events', ip: { by: 'dhcp' } }
            ],
            helm: { repo: 'oci://registry.sylva.internal/sec', chart: 'keycloak-ha', version: 'ref(param.iam.chartVersion)' }
          }
        ]
      },
      security: {
        vault: {
          mount: 'vault://tenant-security-iam',
          paths: [{ name: 'oidc-signing-keys', rule: 'ecdsa-p256', rotationDays: 90 }]
        },
        certificates: [
          {
            name: 'iam-sso-tls',
            type: 'server',
            cn: 'sso.iam.sec.internal',
            sanDns: ['sso.iam.sec.internal'],
            sanIps: ['ref(network.subnets[sn-iam-app].reserved[vip-sso])'],
            validityDays: 90,
            issuanceMethod: 'internal-ca',
            autoRenew: true
          }
        ]
      },
      firewall: {
        policy: 'deny-by-default',
        groups: [
          { name: 'iam-idp-endpoints', membersRef: 'ref(compute.modules[keycloak-idp].instances[*].nics[class=business].ip)' }
        ],
        rules: []
      }
    }
  },
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'LogicalComponent',
    metadata: {
      name: 'admin-bastion',
      displayName: 'Bastion d’Administration PAM (Coupure Zone OAM)',
      tenant: 'tenant-security-bastion',
      external: false,
      functionalDomain: 'security',
      editor: 'secops',
      status: 'active',
      version: '3.0.0',
      manifestVersion: 2,
      labels: { criticality: 'tier-1', layer: 'oam-control' }
    },
    spec: {
      class: 'domain-technical',
      dependsOn: ['iam-keycloak', 'siem-soc', 'pki-ca'],
      network: {
        vrfs: [
          { name: 'vrf-bastion-oam', domain: 'bastion.oam.internal', tenantRef: 'ref(component.metadata.tenant)' },
          { name: 'vrf-bastion-events', domain: 'events.internal' },
          { name: 'vrf-bastion-admin', domain: 'admin.internal' }
        ],
        subnets: [
          {
            name: 'sn-bastion-app',
            cidr: 'ref(param.bastion.subnet.app)',
            vrf: 'vrf-bastion-oam',
            zone: 'admin',
            class: 'business',
            subClass: 'trusted',
            reserved: { gateway: { offset: 1 }, 'vip-pam': { offset: 10 } }
          },
          { name: 'sn-bastion-events', cidr: 'ref(param.bastion.subnet.events)', vrf: 'vrf-bastion-events', zone: 'events', class: 'events' },
          { name: 'sn-bastion-admin', cidr: 'ref(param.bastion.subnet.admin)', vrf: 'vrf-bastion-admin', zone: 'admin', class: 'admin' }
        ]
      },
      compute: {
        modules: [
          {
            name: 'pam-bastion',
            kind: 'vm',
            role: 'privileged-access-bastion',
            status: 'active',
            instances: 'ref(param.bastion.instances.pam)',
            placement: { requiredDataplane: 'standard-nis2', zone: 'admin', pool: 'sylva-standard-nis2' },
            nics: [
              { class: 'admin', index: 1, vrf: 'vrf-bastion-admin', subnetRef: 'sn-bastion-admin', ip: { by: 'offset', value: 32, perInstance: true } },
              { class: 'business', subClass: 'trusted', index: 2, vrf: 'vrf-bastion-oam', subnetRef: 'sn-bastion-app', ip: { by: 'offset', value: 40, perInstance: true }, defaultRoute: true },
              { class: 'events', index: 3, vrf: 'vrf-bastion-events', subnetRef: 'sn-bastion-events', ip: { by: 'dhcp' } }
            ],
            helm: { repo: 'oci://registry.sylva.internal/sec', chart: 'pam-bastion-ha', version: 'ref(param.bastion.chartVersion)' }
          }
        ]
      },
      security: {
        vault: {
          mount: 'vault://tenant-security-bastion',
          paths: [{ name: 'pam-session-keys', rule: 'ed25519-ssh-ca', rotationDays: 30 }]
        },
        certificates: [
          {
            name: 'bastion-web-tls',
            type: 'server',
            cn: 'pam.oam.internal',
            sanDns: ['pam.oam.internal'],
            sanIps: ['ref(network.subnets[sn-bastion-app].reserved[vip-pam])'],
            validityDays: 90,
            issuanceMethod: 'internal-ca',
            autoRenew: true
          }
        ]
      },
      firewall: {
        policy: 'deny-by-default',
        groups: [
          { name: 'bastion-pam-jump', membersRef: 'ref(compute.modules[pam-bastion].instances[*].nics[class=business].ip)' }
        ],
        rules: [
          {
            id: 'r-bastion-iam',
            from: 'group:bastion-pam-jump',
            to: 'group:iam-idp-endpoints',
            proto: 'tcp',
            ports: [443],
            action: 'allow',
            log: true,
            tlsVersion: 'tls1.3',
            functionalFlow: 'PAM-OIDC-MFA'
          }
        ]
      }
    }
  },
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'LogicalComponent',
    metadata: {
      name: 'siem-soc',
      displayName: 'Collecteur & Corrélation SIEM / SOC (Syslog TLS & Audit)',
      tenant: 'tenant-security-siem',
      external: false,
      functionalDomain: 'security',
      editor: 'secops',
      status: 'active',
      version: '4.7.0',
      manifestVersion: 3,
      labels: { criticality: 'tier-1', layer: 'observability-soc' }
    },
    spec: {
      class: 'domain-technical',
      dependsOn: ['pki-ca', 'vault-cluster'],
      network: {
        vrfs: [
          { name: 'vrf-siem-events', domain: 'siem.sec.internal', tenantRef: 'ref(component.metadata.tenant)' },
          { name: 'vrf-siem-admin', domain: 'admin.internal' }
        ],
        subnets: [
          {
            name: 'sn-siem-app',
            cidr: 'ref(param.siem.subnet.app)',
            vrf: 'vrf-siem-events',
            zone: 'events',
            class: 'business',
            subClass: 'trusted',
            reserved: { gateway: { offset: 1 }, 'vip-siem': { offset: 10 } }
          },
          { name: 'sn-siem-admin', cidr: 'ref(param.siem.subnet.admin)', vrf: 'vrf-siem-admin', zone: 'admin', class: 'admin' }
        ]
      },
      compute: {
        modules: [
          {
            name: 'siem-ingestor',
            kind: 'container',
            role: 'siem-collector',
            status: 'active',
            instances: 'ref(param.siem.instances.collector)',
            placement: { requiredDataplane: 'standard-nis2', zone: 'events', pool: 'sylva-standard-nis2' },
            nics: [
              { class: 'admin', index: 1, vrf: 'vrf-siem-admin', subnetRef: 'sn-siem-admin', ip: { by: 'offset', value: 32, perInstance: true } },
              { class: 'business', subClass: 'trusted', index: 2, vrf: 'vrf-siem-events', subnetRef: 'sn-siem-app', ip: { by: 'offset', value: 40, perInstance: true }, defaultRoute: true }
            ],
            helm: { repo: 'oci://registry.sylva.internal/sec', chart: 'siem-opensearch-wazuh', version: 'ref(param.siem.chartVersion)' }
          }
        ]
      },
      security: {
        vault: {
          mount: 'vault://tenant-security-siem',
          paths: [{ name: 'indexer-tls-creds', rule: 'high-entropy-32', rotationDays: 90 }]
        },
        certificates: [
          {
            name: 'siem-syslog-tls',
            type: 'server',
            cn: 'siem.sec.internal',
            sanDns: ['siem.sec.internal'],
            sanIps: ['ref(network.subnets[sn-siem-app].reserved[vip-siem])'],
            validityDays: 90,
            issuanceMethod: 'internal-ca',
            autoRenew: true
          }
        ]
      },
      firewall: {
        policy: 'deny-by-default',
        groups: [
          { name: 'siem-collectors', membersRef: 'ref(compute.modules[siem-ingestor].instances[*].nics[class=business].ip)' }
        ],
        rules: []
      }
    }
  },
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'LogicalComponent',
    metadata: {
      name: 'ingress-waf-proxy',
      displayName: 'Passerelle DMZ (Reverse Proxy WAF & Proxy Sortant FQDN)',
      tenant: 'tenant-security-dmz',
      external: false,
      functionalDomain: 'security',
      editor: 'secops',
      status: 'active',
      version: '1.5.0',
      manifestVersion: 2,
      labels: { criticality: 'tier-1', layer: 'perimeter-dmz' }
    },
    spec: {
      class: 'infrastructure',
      dependsOn: ['pki-ca', 'siem-soc'],
      network: {
        vrfs: [
          { name: 'vrf-dmz-ingress', domain: 'dmz.sec.internal', tenantRef: 'ref(component.metadata.tenant)' },
          { name: 'vrf-dmz-events', domain: 'events.internal' },
          { name: 'vrf-dmz-admin', domain: 'admin.internal' }
        ],
        subnets: [
          {
            name: 'sn-dmz-waf',
            cidr: 'ref(param.wafproxy.subnet.dmz)',
            vrf: 'vrf-dmz-ingress',
            zone: 'dmz',
            class: 'business',
            subClass: 'trusted',
            reserved: { gateway: { offset: 1 }, 'vip-ingress': { offset: 10 } }
          },
          { name: 'sn-dmz-events', cidr: 'ref(param.wafproxy.subnet.events)', vrf: 'vrf-dmz-events', zone: 'events', class: 'events' },
          { name: 'sn-dmz-admin', cidr: 'ref(param.wafproxy.subnet.admin)', vrf: 'vrf-dmz-admin', zone: 'admin', class: 'admin' }
        ]
      },
      compute: {
        modules: [
          {
            name: 'envoy-coraza-waf',
            kind: 'container',
            role: 'ingress-waf-egress',
            status: 'active',
            instances: 'ref(param.wafproxy.instances.envoy)',
            placement: { requiredDataplane: 'dmz-isolated', zone: 'dmz', pool: 'sylva-standard-nis2' },
            nics: [
              { class: 'admin', index: 1, vrf: 'vrf-dmz-admin', subnetRef: 'sn-dmz-admin', ip: { by: 'offset', value: 32, perInstance: true } },
              { class: 'business', subClass: 'trusted', index: 2, vrf: 'vrf-dmz-ingress', subnetRef: 'sn-dmz-waf', ip: { by: 'offset', value: 40, perInstance: true }, defaultRoute: true },
              { class: 'events', index: 3, vrf: 'vrf-dmz-events', subnetRef: 'sn-dmz-events', ip: { by: 'dhcp' } }
            ],
            helm: { repo: 'oci://registry.sylva.internal/sec', chart: 'envoy-coraza-waf', version: 'ref(param.wafproxy.chartVersion)' }
          }
        ]
      },
      security: {
        vault: {
          mount: 'vault://tenant-security-dmz',
          paths: [{ name: 'waf-tls-secrets', rule: 'ecdsa-p256', rotationDays: 30 }]
        },
        certificates: [
          {
            name: 'dmz-ingress-tls',
            type: 'server',
            cn: 'ingress.dmz.sec.internal',
            sanDns: ['ingress.dmz.sec.internal'],
            sanIps: ['ref(network.subnets[sn-dmz-waf].reserved[vip-ingress])'],
            validityDays: 90,
            issuanceMethod: 'internal-ca',
            autoRenew: true,
            boundToVip: 'ref(network.subnets[sn-dmz-waf].reserved[vip-ingress])',
            sslTermination: 'on-proxy'
          }
        ]
      },
      firewall: {
        policy: 'deny-by-default',
        groups: [
          { name: 'dmz-proxy-waf', membersRef: 'ref(compute.modules[envoy-coraza-waf].instances[*].nics[class=business].ip)' }
        ],
        rules: []
      }
    }
  }
];

export const COMPLETE_COMPONENT_CATALOG: LogicalComponent[] = [
  ...DEFAULT_COMPONENT_CATALOG,
  ...TRANSVERSE_COMPONENT_CATALOG
];

const DEFAULT_URN_TO_COMPONENT: Record<string, string> = {
  'urn:archinex:ontology:security:hsm:eviden_proteccio': 'hsm-appliance',
  'urn:archinex:ontology:security:hsm:thales_luna': 'hsm-appliance',
  'urn:archinex:ontology:security:hsm:utimaco_secserver': 'hsm-appliance',
  'urn:archinex:ontology:security:pki:root_offline_airgap': 'pki-ca',
  'urn:archinex:ontology:security:pki:step_ca_acme_internal': 'pki-ca',
  'urn:archinex:ontology:security:pki:ejbca_cmpv2': 'pki-ca',
  'urn:archinex:ontology:security:vault:openbao_pkcs11_hsm': 'vault-cluster',
  'urn:archinex:ontology:security:vault:hashicorp_enterprise_hsm': 'vault-cluster',
  'urn:archinex:ontology:security:secrets:vault_dynamic_leases': 'vault-cluster',
  'urn:archinex:ontology:security:iam:oidc_fido2_rbac': 'iam-keycloak',
  'urn:archinex:ontology:security:bastion:wallix_pam': 'admin-bastion',
  'urn:archinex:ontology:security:bastion:teleport_recorded_session': 'admin-bastion',
  'urn:archinex:ontology:observability:soc:siem_syslog_tls_nis2': 'siem-soc',
  'urn:archinex:ontology:network:proxy:squid_explicit_fqdn': 'ingress-waf-proxy',
  'urn:archinex:ontology:network:ingress:envoy_coraza_waf': 'ingress-waf-proxy',
  'urn:archinex:ontology:application:gis:geoserver_postgis_offline': 'gis-server',
  'urn:archinex:ontology:application:gis:qgis_server_wmts': 'gis-server',
  'urn:archinex:ontology:application:gis:central_fusion_hybrid_geofencing': 'gis-server',
  'urn:archinex:ontology:application:gis:central_fusion_server_only_geofencing': 'gis-server',
  'urn:archinex:ontology:application:gis:distributed_terminal_geofencing': 'ptt-server',
  'urn:archinex:ontology:endpoint:mdm:emm_zero_touch_enrollment': 'mdm-emm',
  'urn:archinex:ontology:endpoint:mdm:onprem_sovereign_emm': 'mdm-emm',
  'urn:archinex:ontology:security:pki:endpoint_scep_est_enrollment': 'pki-ca',
  'urn:archinex:ontology:endpoint:os:hardened_verified_boot': 'endpoint-os-profile',
  'urn:archinex:ontology:endpoint:os:standard_managed_profile': 'endpoint-os-profile',
  'urn:archinex:ontology:endpoint:crypto:fbe_hardware_keystore': 'endpoint-os-profile',
  'urn:archinex:ontology:endpoint:sandbox:work_profile_strict_isolation': 'endpoint-os-profile',
  'urn:archinex:ontology:endpoint:sandbox:dedicated_kiosk_cobo': 'endpoint-os-profile',
  'urn:archinex:ontology:endpoint:ota:signed_ab_staged_rollout': 'mdm-emm'
};

/**
 * Construit un composant logique conforme au modèle Base × Overlay × DC (0 IP en dur, Multi-NIC,
 * VRF alignées, Vault + PKI + SIEM) pour une capacité fonctionnelle émergente (ex: `iot-gateway`).
 */
export function createEmergentLogicalComponent(
  rawName: string,
  displayName?: string
): LogicalComponent {
  const safeName = rawName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'emergent-service';
  const shortPrefix = safeName.split('-')[0] || 'emergent';

  return {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'LogicalComponent',
    metadata: {
      name: safeName,
      displayName: displayName || `Service Applicatif Émergent (${safeName})`,
      tenant: `tenant-${safeName}`,
      external: false,
      functionalDomain: 'it',
      editor: 'itops',
      status: 'active',
      version: '1.0.0',
      manifestVersion: 1,
      labels: { criticality: 'tier-2', layer: 'application-emergent', origin: 'emergent-slot' }
    },
    spec: {
      class: 'business',
      dependsOn: ['pki-ca', 'vault-cluster', 'siem-soc'],
      network: {
        vrfs: [
          { name: `vrf-${shortPrefix}-app`, domain: `${safeName}.internal`, tenantRef: 'ref(component.metadata.tenant)' },
          { name: `vrf-${shortPrefix}-events`, domain: 'events.internal' },
          { name: `vrf-${shortPrefix}-admin`, domain: 'admin.internal' }
        ],
        subnets: [
          {
            name: `sn-${shortPrefix}-app`,
            cidr: 'ref(param.emergent.subnet.app)',
            vrf: `vrf-${shortPrefix}-app`,
            zone: 'data',
            class: 'business',
            reserved: { gateway: { offset: 1 }, [`vip-${shortPrefix}`]: { offset: 10 } }
          },
          {
            name: `sn-${shortPrefix}-events`,
            cidr: 'ref(param.emergent.subnet.events)',
            vrf: `vrf-${shortPrefix}-events`,
            zone: 'events',
            class: 'events'
          },
          {
            name: `sn-${shortPrefix}-admin`,
            cidr: 'ref(param.emergent.subnet.admin)',
            vrf: `vrf-${shortPrefix}-admin`,
            zone: 'admin',
            class: 'admin'
          }
        ]
      },
      compute: {
        modules: [
          {
            name: `${safeName}-engine`,
            kind: 'container',
            role: `${safeName}-worker`,
            status: 'active',
            instances: 'ref(param.emergent.instances.worker)',
            placement: { requiredDataplane: 'standard-nis2', zone: 'data', pool: 'sylva-standard-nis2' },
            nics: [
              {
                class: 'admin',
                index: 1,
                vrf: `vrf-${shortPrefix}-admin`,
                subnetRef: `sn-${shortPrefix}-admin`,
                ip: { by: 'offset', value: 32, perInstance: true }
              },
              {
                class: 'business',
                index: 2,
                vrf: `vrf-${shortPrefix}-app`,
                subnetRef: `sn-${shortPrefix}-app`,
                ip: { by: 'offset', value: 40, perInstance: true },
                defaultRoute: true
              },
              {
                class: 'events',
                index: 3,
                vrf: `vrf-${shortPrefix}-events`,
                subnetRef: `sn-${shortPrefix}-events`,
                ip: { by: 'dhcp' }
              }
            ],
            helm: {
              repo: `oci://registry.sylva.internal/${shortPrefix}`,
              chart: safeName,
              version: 'ref(param.emergent.chartVersion)'
            },
            storage: [
              {
                name: `${shortPrefix}-data`,
                size: '100Gi',
                tier: 'warm',
                svmRef: `svm-${safeName}`,
                reclaimPolicy: 'retain'
              }
            ]
          }
        ]
      },
      storage: {
        svms: [
          {
            name: `svm-${safeName}`,
            tenantRef: 'ref(component.metadata.tenant)',
            backend: 'longhorn-nvme',
            tiers: [{ tier: 'warm', quota: 'ref(param.storage.warm.quota)' }]
          }
        ],
        exports: []
      },
      security: {
        vault: {
          mount: `vault://tenant-${safeName}`,
          paths: [{ name: `${shortPrefix}-service-secret`, rule: 'default-password', rotationDays: 90 }]
        },
        certificates: [
          {
            name: `${safeName}-tls`,
            type: 'server',
            cn: `${safeName}.internal`,
            sanDns: [`${safeName}.internal`],
            sanIps: [`ref(network.subnets[sn-${shortPrefix}-app].reserved[vip-${shortPrefix}])`],
            validityDays: 90,
            issuanceMethod: 'internal-ca',
            autoRenew: true
          }
        ]
      },
      firewall: {
        policy: 'deny-by-default',
        groups: [
          {
            name: `${safeName}-endpoints`,
            membersRef: `ref(compute.modules[${safeName}-engine].instances[*].nics[class=business].ip)`
          }
        ],
        rules: []
      }
    }
  };
}

/**
 * Instancie un catalogue de composants complet à partir d'un catalogue de base et des liaisons
 * ontologiques sélectionnées, en résolvant transitivement leurs dépendances `dependsOn`.
 */
export function instantiateCatalogFromOntologyBindings(
  boundUrns: string[],
  baseCatalog: LogicalComponent[] = DEFAULT_COMPONENT_CATALOG,
  componentUrnMap: Record<string, string> = DEFAULT_URN_TO_COMPONENT
): LogicalComponent[] {
  const byName = new Map<string, LogicalComponent>();
  for (const c of COMPLETE_COMPONENT_CATALOG) {
    byName.set(c.metadata.name, c);
  }
  for (const c of baseCatalog) {
    byName.set(c.metadata.name, c);
  }

  const selectedNames = new Set<string>(baseCatalog.map((c) => c.metadata.name));
  const queue: string[] = [];

  for (const urn of boundUrns) {
    const mapped = componentUrnMap[urn];
    if (mapped && byName.has(mapped) && !selectedNames.has(mapped)) {
      selectedNames.add(mapped);
      queue.push(mapped);
      continue;
    }

    const emergentNewMatch = /^urn:archinex:ontology:application:emergent:new_([a-z0-9_-]+)$/i.exec(urn);
    if (emergentNewMatch) {
      const compName = emergentNewMatch[1].replace(/_/g, '-').toLowerCase();
      if (!byName.has(compName)) {
        byName.set(compName, createEmergentLogicalComponent(compName));
      }
      if (!selectedNames.has(compName)) {
        selectedNames.add(compName);
        queue.push(compName);
      }
      continue;
    }

    const emergentAllocMatch = /^urn:archinex:ontology:application:emergent:allocate_([a-z0-9_-]+)$/i.exec(urn);
    if (emergentAllocMatch) {
      const compName = emergentAllocMatch[1].replace(/_/g, '-').toLowerCase();
      if (byName.has(compName) && !selectedNames.has(compName)) {
        selectedNames.add(compName);
        queue.push(compName);
      }
    }
  }

  // Résoudre aussi les dépendances implicitement portées par les composants sélectionnés (ex: pki-ca / siem-soc / vault)
  for (const name of [...selectedNames]) {
    queue.push(name);
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const currentName = queue.shift()!;
    if (visited.has(currentName)) continue;
    visited.add(currentName);

    const comp = byName.get(currentName);
    if (!comp) continue;

    for (const dep of comp.spec.dependsOn || []) {
      if (byName.has(dep) && !selectedNames.has(dep)) {
        selectedNames.add(dep);
      }
      if (!visited.has(dep)) {
        queue.push(dep);
      }
    }
    if (comp.spec.security?.vault?.mount && byName.has('vault-cluster') && !selectedNames.has('vault-cluster')) {
      selectedNames.add('vault-cluster');
      queue.push('vault-cluster');
    }
    if ((comp.spec.security?.certificates || []).some((c) => c.autoRenew) && byName.has('pki-ca') && !selectedNames.has('pki-ca')) {
      selectedNames.add('pki-ca');
      queue.push('pki-ca');
    }
    if (
      (comp.spec.compute?.modules || []).some((m) => m.nics.some((n) => n.class === 'events')) &&
      byName.has('siem-soc') &&
      !selectedNames.has('siem-soc')
    ) {
      selectedNames.add('siem-soc');
      queue.push('siem-soc');
    }
  }

  return Array.from(byName.values()).filter((c) => selectedNames.has(c.metadata.name));
}

export const DEFAULT_ENVIRONMENT_OVERLAYS: EnvironmentOverlay[] = [
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'EnvironmentOverlay',
    metadata: { name: 'prod', environment: 'prod', version: '1.0.0', manifestVersion: 1 },
    spec: {
      datacenters: ['dc1', 'dc2'],
      substitutions: {
        'core.subnet.sig': '10.40.10.0/24',
        'core.subnet.events': '10.40.11.0/24',
        'core.subnet.admin': '10.40.12.0/24',
        'core.instances.upf': 2,
        'core.chartVersion': '2.1.4',
        'ptt.subnet.app': '10.41.10.0/24',
        'ptt.subnet.events': '10.41.11.0/24',
        'ptt.subnet.admin': '10.41.12.0/24',
        'ptt.instances.mcptt': 3,
        'ptt.chartVersion': '3.4.2',
        'gis.subnet.app': '10.42.10.0/24',
        'gis.subnet.events': '10.42.11.0/24',
        'gis.subnet.admin': '10.42.12.0/24',
        'gis.instances.api': 2,
        'gis.chartVersion': '1.8.1',
        'proxy.subnet.trust': '10.43.10.0/24',
        'proxy.subnet.untrust': '10.43.20.0/24',
        'proxy.chartVersion': '1.2.0',
        'hsm.subnet.app': '10.140.10.0/24',
        'hsm.subnet.events': '10.140.11.0/24',
        'hsm.subnet.admin': '10.140.12.0/24',
        'hsm.instances.appliance': 2,
        'hsm.chartVersion': '1.0.0',
        'pki.subnet.app': '10.141.10.0/24',
        'pki.subnet.events': '10.141.11.0/24',
        'pki.subnet.admin': '10.141.12.0/24',
        'pki.instances.ejbca': 2,
        'pki.chartVersion': '8.2.0',
        'vault.subnet.app': '10.142.10.0/24',
        'vault.subnet.events': '10.142.11.0/24',
        'vault.subnet.admin': '10.142.12.0/24',
        'vault.instances.cluster': 3,
        'vault.chartVersion': '2.1.0',
        'iam.subnet.app': '10.143.10.0/24',
        'iam.subnet.events': '10.143.11.0/24',
        'iam.subnet.admin': '10.143.12.0/24',
        'iam.instances.keycloak': 2,
        'iam.chartVersion': '24.0.2',
        'bastion.subnet.app': '10.144.10.0/24',
        'bastion.subnet.events': '10.144.11.0/24',
        'bastion.subnet.admin': '10.144.12.0/24',
        'bastion.instances.pam': 2,
        'bastion.chartVersion': '3.0.1',
        'siem.subnet.app': '10.145.10.0/24',
        'siem.subnet.admin': '10.145.12.0/24',
        'siem.instances.collector': 3,
        'siem.chartVersion': '4.7.2',
        'wafproxy.subnet.dmz': '10.146.10.0/24',
        'wafproxy.subnet.events': '10.146.11.0/24',
        'wafproxy.subnet.admin': '10.146.12.0/24',
        'wafproxy.instances.envoy': 2,
        'wafproxy.chartVersion': '1.5.0',
        'emergent.subnet.app': '10.47.10.0/24',
        'emergent.subnet.events': '10.47.11.0/24',
        'emergent.subnet.admin': '10.47.12.0/24',
        'emergent.instances.worker': 2,
        'emergent.chartVersion': '1.0.0',
        'mdm.subnet.app': '10.48.10.0/24',
        'mdm.subnet.events': '10.48.11.0/24',
        'mdm.subnet.admin': '10.48.12.0/24',
        'mdm.instances.controller': 2,
        'mdm.chartVersion': '2.4.0',
        'endpoint.subnet.app': '10.49.10.0/24',
        'endpoint.subnet.events': '10.49.11.0/24',
        'endpoint.subnet.admin': '10.49.12.0/24',
        'endpoint.instances.policy': 2,
        'endpoint.chartVersion': '1.2.0',
        'storage.hot.quota': '500Gi',
        'storage.warm.quota': '2Ti'
      },
      policies: {
        changeWindow: 'Sunday 02:00-06:00',
        minReplicas: 2,
        immutableImageTag: true
      }
    }
  },
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'EnvironmentOverlay',
    metadata: { name: 'preprod', environment: 'preprod', version: '1.0.0', manifestVersion: 1 },
    spec: {
      datacenters: ['dc1', 'dc2'],
      substitutions: {
        'core.subnet.sig': '10.50.10.0/24',
        'core.subnet.events': '10.50.11.0/24',
        'core.subnet.admin': '10.50.12.0/24',
        'core.instances.upf': 2,
        'core.chartVersion': '2.1.4',
        'ptt.subnet.app': '10.51.10.0/24',
        'ptt.subnet.events': '10.51.11.0/24',
        'ptt.subnet.admin': '10.51.12.0/24',
        'ptt.instances.mcptt': 2,
        'ptt.chartVersion': '3.4.2',
        'gis.subnet.app': '10.52.10.0/24',
        'gis.subnet.events': '10.52.11.0/24',
        'gis.subnet.admin': '10.52.12.0/24',
        'gis.instances.api': 2,
        'gis.chartVersion': '1.8.1',
        'proxy.subnet.trust': '10.53.10.0/24',
        'proxy.subnet.untrust': '10.53.20.0/24',
        'proxy.chartVersion': '1.2.0',
        'hsm.subnet.app': '10.150.10.0/24',
        'hsm.subnet.events': '10.150.11.0/24',
        'hsm.subnet.admin': '10.150.12.0/24',
        'hsm.instances.appliance': 2,
        'hsm.chartVersion': '1.0.0',
        'pki.subnet.app': '10.151.10.0/24',
        'pki.subnet.events': '10.151.11.0/24',
        'pki.subnet.admin': '10.151.12.0/24',
        'pki.instances.ejbca': 2,
        'pki.chartVersion': '8.2.0',
        'vault.subnet.app': '10.152.10.0/24',
        'vault.subnet.events': '10.152.11.0/24',
        'vault.subnet.admin': '10.152.12.0/24',
        'vault.instances.cluster': 3,
        'vault.chartVersion': '2.1.0',
        'iam.subnet.app': '10.153.10.0/24',
        'iam.subnet.events': '10.153.11.0/24',
        'iam.subnet.admin': '10.153.12.0/24',
        'iam.instances.keycloak': 2,
        'iam.chartVersion': '24.0.2',
        'bastion.subnet.app': '10.154.10.0/24',
        'bastion.subnet.events': '10.154.11.0/24',
        'bastion.subnet.admin': '10.154.12.0/24',
        'bastion.instances.pam': 2,
        'bastion.chartVersion': '3.0.1',
        'siem.subnet.app': '10.155.10.0/24',
        'siem.subnet.admin': '10.155.12.0/24',
        'siem.instances.collector': 2,
        'siem.chartVersion': '4.7.2',
        'wafproxy.subnet.dmz': '10.156.10.0/24',
        'wafproxy.subnet.events': '10.156.11.0/24',
        'wafproxy.subnet.admin': '10.156.12.0/24',
        'wafproxy.instances.envoy': 2,
        'wafproxy.chartVersion': '1.5.0',
        'emergent.subnet.app': '10.57.10.0/24',
        'emergent.subnet.events': '10.57.11.0/24',
        'emergent.subnet.admin': '10.57.12.0/24',
        'emergent.instances.worker': 2,
        'emergent.chartVersion': '1.0.0',
        'mdm.subnet.app': '10.58.10.0/24',
        'mdm.subnet.events': '10.58.11.0/24',
        'mdm.subnet.admin': '10.58.12.0/24',
        'mdm.instances.controller': 2,
        'mdm.chartVersion': '2.4.0',
        'endpoint.subnet.app': '10.59.10.0/24',
        'endpoint.subnet.events': '10.59.11.0/24',
        'endpoint.subnet.admin': '10.59.12.0/24',
        'endpoint.instances.policy': 2,
        'endpoint.chartVersion': '1.2.0',
        'storage.hot.quota': '200Gi',
        'storage.warm.quota': '1Ti'
      },
      policies: {
        changeWindow: 'Wednesday 22:00-02:00',
        minReplicas: 2,
        immutableImageTag: true
      }
    }
  },
  {
    apiVersion: 'archinex.io/v1alpha1',
    kind: 'EnvironmentOverlay',
    metadata: { name: 'lab', environment: 'lab', version: '1.0.0', manifestVersion: 1 },
    spec: {
      datacenters: ['dc1'],
      substitutions: {
        'core.subnet.sig': '10.60.10.0/24',
        'core.subnet.events': '10.60.11.0/24',
        'core.subnet.admin': '10.60.12.0/24',
        'core.instances.upf': 1,
        'core.chartVersion': '2.1.4-rc1',
        'ptt.subnet.app': '10.61.10.0/24',
        'ptt.subnet.events': '10.61.11.0/24',
        'ptt.subnet.admin': '10.61.12.0/24',
        'ptt.instances.mcptt': 1,
        'ptt.chartVersion': '3.4.2-rc1',
        'gis.subnet.app': '10.62.10.0/24',
        'gis.subnet.events': '10.62.11.0/24',
        'gis.subnet.admin': '10.62.12.0/24',
        'gis.instances.api': 1,
        'gis.chartVersion': '1.8.1',
        'proxy.subnet.trust': '10.63.10.0/24',
        'proxy.subnet.untrust': '10.63.20.0/24',
        'proxy.chartVersion': '1.2.0',
        'hsm.subnet.app': '10.160.10.0/24',
        'hsm.subnet.events': '10.160.11.0/24',
        'hsm.subnet.admin': '10.160.12.0/24',
        'hsm.instances.appliance': 1,
        'hsm.chartVersion': '1.0.0-rc1',
        'pki.subnet.app': '10.161.10.0/24',
        'pki.subnet.events': '10.161.11.0/24',
        'pki.subnet.admin': '10.161.12.0/24',
        'pki.instances.ejbca': 1,
        'pki.chartVersion': '8.2.0',
        'vault.subnet.app': '10.162.10.0/24',
        'vault.subnet.events': '10.162.11.0/24',
        'vault.subnet.admin': '10.162.12.0/24',
        'vault.instances.cluster': 1,
        'vault.chartVersion': '2.1.0',
        'iam.subnet.app': '10.163.10.0/24',
        'iam.subnet.events': '10.163.11.0/24',
        'iam.subnet.admin': '10.163.12.0/24',
        'iam.instances.keycloak': 1,
        'iam.chartVersion': '24.0.2',
        'bastion.subnet.app': '10.164.10.0/24',
        'bastion.subnet.events': '10.164.11.0/24',
        'bastion.subnet.admin': '10.164.12.0/24',
        'bastion.instances.pam': 1,
        'bastion.chartVersion': '3.0.1',
        'siem.subnet.app': '10.165.10.0/24',
        'siem.subnet.admin': '10.165.12.0/24',
        'siem.instances.collector': 1,
        'siem.chartVersion': '4.7.2',
        'wafproxy.subnet.dmz': '10.166.10.0/24',
        'wafproxy.subnet.events': '10.166.11.0/24',
        'wafproxy.subnet.admin': '10.166.12.0/24',
        'wafproxy.instances.envoy': 1,
        'wafproxy.chartVersion': '1.5.0',
        'emergent.subnet.app': '10.67.10.0/24',
        'emergent.subnet.events': '10.67.11.0/24',
        'emergent.subnet.admin': '10.67.12.0/24',
        'emergent.instances.worker': 1,
        'emergent.chartVersion': '1.0.0-rc1',
        'mdm.subnet.app': '10.68.10.0/24',
        'mdm.subnet.events': '10.68.11.0/24',
        'mdm.subnet.admin': '10.68.12.0/24',
        'mdm.instances.controller': 1,
        'mdm.chartVersion': '2.4.0-rc1',
        'endpoint.subnet.app': '10.69.10.0/24',
        'endpoint.subnet.events': '10.69.11.0/24',
        'endpoint.subnet.admin': '10.69.12.0/24',
        'endpoint.instances.policy': 1,
        'endpoint.chartVersion': '1.2.0-rc1',
        'storage.hot.quota': '50Gi',
        'storage.warm.quota': '200Gi'
      },
      policies: {
        minReplicas: 1,
        immutableImageTag: false
      }
    }
  }
];

const IPV4_LITERAL_REGEX = /\b(?:25[0-5]|2[0-4]\d|[01]?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d?\d)){3}(?:\/\d{1,2})?\b/;

/**
 * Linter Base : vérifie qu'un LogicalComponent interne (Base) ne contient aucune valeur
 * dépendante d'un environnement (CIDR/IP en dur, tag :latest, champ environment).
 */
export function lintBaseComponentNoHardcodedEnv(component: LogicalComponent): BaseLintIssue[] {
  const issues: BaseLintIssue[] = [];
  const compName = component.metadata.name;

  if ((component.metadata as Record<string, unknown>).environment) {
    issues.push({
      component: compName,
      path: 'metadata.environment',
      code: 'hardcoded-env-value',
      message: `La Base '${compName}' ne doit jamais déclarer 'metadata.environment' (réservé aux EnvironmentOverlays).`
    });
  }

  // Les composants externes déclarent leurs CIDRs publics dans network.addresses, pas les internes
  if (!component.metadata.external) {
    for (const [idx, sub] of (component.spec.network?.subnets || []).entries()) {
      if (IPV4_LITERAL_REGEX.test(sub.cidr) && !sub.cidr.startsWith('ref(')) {
        issues.push({
          component: compName,
          path: `spec.network.subnets[${idx}].cidr`,
          code: 'hardcoded-env-value',
          message: `Le subnet '${sub.name}' utilise un CIDR littéral '${sub.cidr}' au lieu de 'ref(param.*)'.`
        });
      }
    }
  }

  for (const [mIdx, mod] of (component.spec.compute?.modules || []).entries()) {
    if (mod.helm?.version === 'latest') {
      issues.push({
        component: compName,
        path: `spec.compute.modules[${mIdx}].helm.version`,
        code: 'hardcoded-env-value',
        message: `Le module '${mod.name}' utilise le tag 'latest' interdit dans une Base.`
      });
    }
  }

  for (const [rIdx, rule] of (component.spec.firewall?.rules || []).entries()) {
    if (IPV4_LITERAL_REGEX.test(rule.from) || IPV4_LITERAL_REGEX.test(rule.to)) {
      issues.push({
        component: compName,
        path: `spec.firewall.rules[${rIdx}]`,
        code: 'hardcoded-env-value',
        message: `La règle firewall '${rule.id}' contient une IP littérale ; seules les références de groupes ou 'ref()' sont autorisées.`
      });
    }
  }

  return issues;
}

/**
 * Valide la cohérence d'un composant vis-à-vis des Catalogues de valeurs admises et des règles Multi-NIC.
 */
export function validateComponentAgainstCatalogs(
  component: LogicalComponent,
  catalogs: ValueCatalogs = DEFAULT_VALUE_CATALOGS
): BaseLintIssue[] {
  const issues: BaseLintIssue[] = [];
  const compName = component.metadata.name;

  const fd = catalogs.functionalDomains.find((d) => d.name === component.metadata.functionalDomain);
  if (!fd) {
    issues.push({
      component: compName,
      path: 'metadata.functionalDomain',
      code: 'invalid-catalog-ref',
      message: `Domaine fonctionnel '${component.metadata.functionalDomain}' absent du catalogue (admis: ${catalogs.functionalDomains.map((d) => d.name).join(', ')}).`
    });
  } else if (!fd.editors.includes(component.metadata.editor)) {
    issues.push({
      component: compName,
      path: 'metadata.editor',
      code: 'invalid-catalog-ref',
      message: `L'éditeur '${component.metadata.editor}' n'est pas habilité pour le domaine '${fd.name}' (admis: ${fd.editors.join(', ')}).`
    });
  }

  if (component.metadata.external && (component.spec.compute?.modules?.length || 0) > 0) {
    issues.push({
      component: compName,
      path: 'spec.compute.modules',
      code: 'invalid-nic-config',
      message: `Un composant externe (external: true) ne peut pas déclarer de modules compute.`
    });
  }

  const subnetsByName = new Map((component.spec.network?.subnets || []).map((s) => [s.name, s]));
  for (const mod of component.spec.compute?.modules || []) {
    const businessNics = mod.nics.filter((n) => n.class === 'business');
    const defaultRoutes = mod.nics.filter((n) => n.defaultRoute === true);

    if (businessNics.length > 0 && defaultRoutes.length !== 1) {
      issues.push({
        component: compName,
        path: `spec.compute.modules[${mod.name}].nics`,
        code: 'invalid-nic-config',
        message: `Le module '${mod.name}' doit avoir exactement une NIC 'business' avec defaultRoute: true (trouvé: ${defaultRoutes.length}).`
      });
    }

    for (const nic of mod.nics) {
      if (!catalogs.nicClasses.includes(nic.class)) {
        issues.push({
          component: compName,
          path: `spec.compute.modules[${mod.name}].nics[${nic.index}].class`,
          code: 'invalid-catalog-ref',
          message: `Classe NIC '${nic.class}' non admise par le catalogue.`
        });
      }
      const sub = subnetsByName.get(nic.subnetRef);
      if (!sub) {
        issues.push({
          component: compName,
          path: `spec.compute.modules[${mod.name}].nics[${nic.index}].subnetRef`,
          code: 'invalid-nic-config',
          message: `La NIC index=${nic.index} du module '${mod.name}' référence un subnet inexistant '${nic.subnetRef}'.`
        });
      } else {
        if (sub.vrf !== nic.vrf) {
          issues.push({
            component: compName,
            path: `spec.compute.modules[${mod.name}].nics[${nic.index}].vrf`,
            code: 'invalid-nic-config',
            message: `Désalignement VRF sur '${mod.name}' NIC index=${nic.index} : NIC.vrf='${nic.vrf}' != Subnet.vrf='${sub.vrf}'.`
          });
        }
        if (sub.class !== nic.class) {
          issues.push({
            component: compName,
            path: `spec.compute.modules[${mod.name}].nics[${nic.index}].class`,
            code: 'invalid-nic-config',
            message: `Désalignement classe NIC/Subnet sur '${mod.name}' : NIC.class='${nic.class}' != Subnet.class='${sub.class}'.`
          });
        }
      }

      if (
        nic.ip.by === 'offset' &&
        typeof nic.ip.value === 'number' &&
        nic.ip.value >= catalogs.forbiddenOffsets.min &&
        nic.ip.value <= catalogs.forbiddenOffsets.max
      ) {
        issues.push({
          component: compName,
          path: `spec.compute.modules[${mod.name}].nics[${nic.index}].ip`,
          code: 'invalid-nic-config',
          message: `Offset IP ${nic.ip.value} interdit sur '${mod.name}' (plage réservée domaine .${catalogs.forbiddenOffsets.min}-.${catalogs.forbiddenOffsets.max}).`
        });
      }
    }
  }

  return issues;
}

/**
 * Dérive la bulle réseau/DNS/APN d'une entité Organization (IMP V2 §5.1).
 * Les ressources de la bulle appartiennent à la plateforme (`tenant-org-<name>`).
 */
export function deriveOrganizationBubble(org: OrganizationSpec): OrganizationBubble {
  const slug = org.metadata.name.replace(/^org-/, '');
  return {
    organization: org.metadata.name,
    tenant: `tenant-org-${slug}`,
    vrf: `vrf-org-${slug}`,
    dnsDomain: org.spec.dnsDomains[0] || `${slug}.internal.example.io`,
    apns: [...org.spec.apns],
    consumes: [...org.spec.consumes],
    status: org.metadata.status
  };
}

/**
 * Valide une entité `kind: Organization` selon les règles IMP V2 §5.1 :
 * une organisation ne peut porter ni `compute`, ni `firewall`, ni `exposure`.
 */
export function validateOrganization(org: OrganizationSpec): BaseLintIssue[] {
  const issues: BaseLintIssue[] = [];
  const name = org.metadata.name;

  if (org.kind !== 'Organization') {
    issues.push({
      component: name,
      path: 'kind',
      code: 'invalid-organization',
      message: `L'entité '${name}' doit avoir kind='Organization'.`
    });
  }

  for (const forbiddenField of ['compute', 'firewall', 'exposure'] as const) {
    if (org.spec[forbiddenField] !== undefined) {
      issues.push({
        component: name,
        path: `spec.${forbiddenField}`,
        code: 'invalid-organization',
        message: `Une Organization ne peut pas déclarer '${forbiddenField}' (réservé aux Components).`
      });
    }
  }

  if (!org.spec.dnsDomains || org.spec.dnsDomains.length === 0) {
    issues.push({
      component: name,
      path: 'spec.dnsDomains',
      code: 'invalid-organization',
      message: `L'Organization '${name}' doit déclarer au moins un domaine DNS dans dnsDomains.`
    });
  }

  return issues;
}

/**
 * Valide les certificats d'un composant selon IMP V2 §3.6.2 :
 * - les propriétés X.509 techniques vivent dans un profil (`certificateProfiles`), jamais inline ;
 * - conformité RGS : RSA >= 3072 bits (ou ECDSA >= 256 / Ed25519).
 */
export function validateCertificateProfilesAndRgs(
  component: LogicalComponent,
  catalogs: ValueCatalogs = DEFAULT_VALUE_CATALOGS
): BaseLintIssue[] {
  const issues: BaseLintIssue[] = [];
  const compName = component.metadata.name;
  const profiles = [
    ...(catalogs.certificateProfiles || []),
    ...(component.spec.security?.certificateProfiles || [])
  ];

  for (const cert of component.spec.security?.certificates || []) {
    if (!cert.profile) {
      issues.push({
        component: compName,
        path: `spec.security.certificates[${cert.name}].profile`,
        code: 'invalid-certificate-profile',
        message: `Le certificat '${cert.name}' doit référencer un profil (profile: ref(certificateProfiles[...])).`
      });
      continue;
    }

    const inlineFields = (['validityDays', 'keySize', 'algorithm', 'extendedKeyUsage', 'keyUsage'] as const).filter(
      (f) => cert[f] !== undefined
    );
    if (inlineFields.length > 0) {
      issues.push({
        component: compName,
        path: `spec.security.certificates[${cert.name}]`,
        code: 'invalid-certificate-profile',
        message: `Le certificat '${cert.name}' déclare des propriétés X.509 inline (${inlineFields.join(', ')}) interdites en IMP V2.`
      });
    }

    const match = cert.profile.match(/certificateProfiles\[([^\]]+)\]/);
    const profileName = match ? match[1] : cert.profile;
    const resolvedProfile = profiles.find((p) => p.name === profileName);
    if (!resolvedProfile) {
      issues.push({
        component: compName,
        path: `spec.security.certificates[${cert.name}].profile`,
        code: 'invalid-catalog-ref',
        message: `Profil de certificat '${profileName}' introuvable dans le catalogue.`
      });
    } else if (resolvedProfile.algorithm === 'rsa' && resolvedProfile.keySize < 3072) {
      issues.push({
        component: compName,
        path: `spec.security.certificateProfiles[${resolvedProfile.name}].keySize`,
        code: 'invalid-certificate-profile',
        message: `Profil '${resolvedProfile.name}' non conforme RGS : clé RSA ${resolvedProfile.keySize} < 3072 bits.`
      });
    }
  }

  return issues;
}

/**
 * Vérifie que toutes les opérations requises sont couvertes par la CapabilityMatrix des drivers (§7.2 règle 4).
 */
export function validateDriverCapabilities(
  requiredOperations: string[],
  catalogs: ValueCatalogs = DEFAULT_VALUE_CATALOGS
): BaseLintIssue[] {
  const issues: BaseLintIssue[] = [];
  const availableOps = new Set((catalogs.drivers || []).flatMap((d) => d.operations));

  for (const op of requiredOperations) {
    if (!availableOps.has(op)) {
      issues.push({
        component: 'platform',
        path: 'catalogs.drivers',
        code: 'missing-driver-capability',
        message: `Capacité driver manquante dans catalogs/drivers.yaml : '${op}'.`
      });
    }
  }

  return issues;
}
