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
export type NicClass = 'admin' | 'business' | 'events' | 'internal';
export type NicSubClass = 'trusted' | 'untrusted' | 'sync';
export type StorageTierName = 'hot' | 'warm' | 'cold';
export type ModuleKind = 'vm' | 'container' | 'forward-proxy';
export type SslTerminationMode = 'origin' | 'destination' | 'none' | 'on-proxy';
export type CertificateIssuanceMethod = 'acme' | 'scep' | 'internal-ca' | 'manual';

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

export interface VrfSpec {
  name: string;
  domain: string;
  tenantRef?: string;
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
  cn: string;
  sanDns?: string[];
  sanIps?: string[];
  validityDays: number;
  issuanceMethod: CertificateIssuanceMethod;
  autoRenew?: boolean;
  boundToVip?: string;
  sslTermination?: SslTerminationMode;
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
    };
    compute?: {
      modules: ModuleSpec[];
    };
    storage?: {
      svms?: SvmSpec[];
      exports?: NfsExportSpec[];
    };
    security?: {
      vault?: {
        mount: string;
        paths: VaultPathSpec[];
      };
      certificates?: CertificateSpec[];
    };
    firewall?: {
      policy: 'deny-by-default';
      groups: FirewallGroupSpec[];
      rules: FirewallRuleSpec[];
    };
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
  code: 'hardcoded-env-value' | 'invalid-catalog-ref' | 'invalid-nic-config';
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
  nicClasses: ['admin', 'business', 'events', 'internal'],
  nicSubClasses: ['trusted', 'untrusted', 'sync'],
  storageTiers: [
    { tier: 'hot', media: 'ssd', defaultReclaimPolicy: 'delete' },
    { tier: 'warm', media: 'hybrid', defaultReclaimPolicy: 'retain' },
    { tier: 'cold', media: 'hdd', defaultReclaimPolicy: 'retain' }
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
  }
];

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
