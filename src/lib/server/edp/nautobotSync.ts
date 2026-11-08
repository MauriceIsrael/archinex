import type { MultiAxisHydratedInventory } from './refinementCoverage.js';

const DEFAULT_NAUTOBOT_URL = process.env.NAUTOBOT_URL || 'http://localhost:8080';
const DEFAULT_NAUTOBOT_TOKEN =
  process.env.NAUTOBOT_TOKEN || '0123456789abcdef0123456789abcdef01234567';

export interface NautobotSyncSummary {
  reachable: boolean;
  tenantsSynced: number;
  circuitsSynced: number;
  prefixesSynced: number;
  vlansSynced: number;
  devicesSynced: number;
  vpnTunnelsSynced: number;
  urls: {
    circuits: string;
    tenants: string;
    devices: string;
    prefixes: string;
    vpnTunnels: string;
  };
  errors: string[];
}

export interface NautobotLivePullResult {
  reachable: boolean;
  source: 'nautobot_live' | 'local_fallback';
  inventory: MultiAxisHydratedInventory;
  observedCounts: {
    devices: number;
    circuits: number;
    tenants: number;
    vpnTunnels: number;
  };
  detectedDrifts: string[];
  errors: string[];
}

export interface NautobotClientOptions {
  baseUrl?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

async function nbFetch(
  path: string,
  options: RequestInit = {},
  clientOpts: NautobotClientOptions = {}
): Promise<any> {
  const baseUrl = clientOpts.baseUrl || DEFAULT_NAUTOBOT_URL;
  const token = clientOpts.token || DEFAULT_NAUTOBOT_TOKEN;
  const fetchFn = clientOpts.fetchImpl || fetch;

  const url = `${baseUrl}${path}`;
  const res = await fetchFn(url, {
    ...options,
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(4000)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Nautobot ${options.method || 'GET'} ${path} -> ${res.status}: ${errText}`);
  }
  return res.json();
}

async function getOrCreateByQuery(
  listPath: string,
  queryParam: string,
  createPayload: Record<string, unknown>,
  patchOnExisting = true,
  clientOpts: NautobotClientOptions = {}
): Promise<any> {
  const sep = listPath.includes('?') ? '&' : '?';
  const existing = await nbFetch(`${listPath}${sep}${queryParam}`, {}, clientOpts);
  if (existing.results && existing.results.length > 0) {
    const item = existing.results[0];
    if (patchOnExisting && item.id) {
      try {
        return await nbFetch(
          `${listPath}${item.id}/`,
          {
            method: 'PATCH',
            body: JSON.stringify(createPayload)
          },
          clientOpts
        );
      } catch {
        return item;
      }
    }
    return item;
  }
  return nbFetch(
    listPath,
    {
      method: 'POST',
      body: JSON.stringify(createPayload)
    },
    clientOpts
  );
}

/**
 * Synchronise de manière idempotente l'inventaire hydraté multi-axes et son graphe de réconciliation
 * (Tenants Lot 2/3, Provider, CircuitType, Circuit S6a `link-ip-lot3-secgw1`, Terminaisons A/Z,
 * Objets natifs du module VPN Nautobot 2.2+ : `vpn.IKEProposal`, `vpn.IPSecProposal`, `vpn.VPNProfile`, `vpn.VPNTunnel`,
 * VLAN 1403, Préfixe IP 100.64.14.0/30, Équipements Externes 3GPP Shadow, Nœuds de Médiation SecGW/DEA/HSS
 * et Serveurs Bare-Metal Sylva) dans l'instance Nautobot 2.x active.
 */
export async function syncHydratedInventoryToNautobot(
  hydrated: MultiAxisHydratedInventory,
  clientOpts: NautobotClientOptions = {}
): Promise<NautobotSyncSummary> {
  const baseUrl = clientOpts.baseUrl || DEFAULT_NAUTOBOT_URL;
  const summary: NautobotSyncSummary = {
    reachable: false,
    tenantsSynced: 0,
    circuitsSynced: 0,
    prefixesSynced: 0,
    vlansSynced: 0,
    devicesSynced: 0,
    vpnTunnelsSynced: 0,
    urls: {
      circuits: `${baseUrl}/circuits/circuits/`,
      tenants: `${baseUrl}/tenancy/tenants/`,
      devices: `${baseUrl}/dcim/devices/`,
      prefixes: `${baseUrl}/ipam/prefixes/`,
      vpnTunnels: `${baseUrl}/vpn/vpn-tunnels/`
    },
    errors: []
  };

  try {
    await nbFetch('/api/status/', {}, clientOpts);
    summary.reachable = true;
  } catch {
    return summary;
  }

  try {
    // 0. Récupérer les référentiels de base Nautobot (Status Active/Planned, Location pop-valmondois, Namespace Global)
    const statusesRes = await nbFetch('/api/extras/statuses/?limit=50', {}, clientOpts);
    const statusPlanned =
      statusesRes.results?.find((s: any) => s.name === 'Planned')?.id || 'Planned';
    const statusActive =
      statusesRes.results?.find((s: any) => s.name === 'Active')?.id || 'Active';

    const locationsRes = await nbFetch('/api/dcim/locations/?limit=10', {}, clientOpts);
    const defaultLocation = locationsRes.results?.[0];
    const defaultLocationId = defaultLocation?.id;

    // S'assurer que le LocationType "Site" autorise bien l'attachement des Devices, Terminaisons de Circuits, VLANs et Préfixes
    if (defaultLocation?.location_type?.id) {
      try {
        await nbFetch(
          `/api/dcim/location-types/${defaultLocation.location_type.id}/`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              content_types: [
                'dcim.device',
                'circuits.circuittermination',
                'ipam.vlan',
                'ipam.prefix',
                'dcim.rack'
              ]
            })
          },
          clientOpts
        );
      } catch {
        // Ignorer si déjà configuré
      }
    }

    const namespacesRes = await nbFetch('/api/ipam/namespaces/?limit=10', {}, clientOpts);
    const defaultNamespaceId = namespacesRes.results?.[0]?.id;

    const rg = hydrated.reconciliation_graph;
    const tenantIdMap = new Map<string, string>();

    // 1. Synchronisation des Organisations Partenaires (tenancy.Tenant)
    for (const org of rg?.partner_organizations || []) {
      try {
        const orgSlug = String(org.id);
        const tenantObj = await getOrCreateByQuery(
          '/api/tenancy/tenants/',
          `name=${encodeURIComponent(orgSlug)}`,
          {
            name: orgSlug,
            description: `${org.name} — Démarcation : ${org.demarcation_point || 'MMR Lot 1'}`,
            comments: `Modèle TM Forum SID : ${org.tmf_sid_class || 'PartyRole'}\nContact NOC : ${org.noc_contact || 'N/A'}`
          },
          true,
          clientOpts
        );
        if (tenantObj?.id) {
          tenantIdMap.set(orgSlug, tenantObj.id);
          summary.tenantsSynced++;
        }
      } catch (e: any) {
        summary.errors.push(`Tenant ${org.id}: ${e.message}`);
      }
    }

    const pivotTenantUuid = tenantIdMap.get(rg?.pivot_tenant_id || 'org-lot3-mno') || null;

    // 2. Synchronisation du Provider, CircuitType, Circuit (`link-ip-lot3-secgw1`) & CircuitTerminations A/Z
    if (rg?.ip_underlay_links && rg.ip_underlay_links.length > 0) {
      try {
        const provider = await getOrCreateByQuery(
          '/api/circuits/providers/',
          `name=${encodeURIComponent('Provider-Lot3-MNO-Interco')}`,
          {
            name: 'Provider-Lot3-MNO-Interco',
            asn: 65003,
            noc_contact: 'noc@lot3-operator.fr',
            comments:
              'Opérateur Tiers Lot 3 fournissant le lien d’interconnexion S6a vers le SecGW-Lot1 (§14 Lulu).'
          },
          true,
          clientOpts
        );

        const circuitType = await getOrCreateByQuery(
          '/api/circuits/circuit-types/',
          `name=${encodeURIComponent('Interco-WAN-IPsec-ESP-S6a')}`,
          {
            name: 'Interco-WAN-IPsec-ESP-S6a',
            description:
              'Liaison Inter-Lots portant Tunnel IPsec ESP (IKEv2 AES-256-GCM) et Médiation Diameter S6a'
          },
          true,
          clientOpts
        );

        const tunnelInfo = rg.ipsec_tunnels?.[0];
        const flowInfo = rg.service_mediation_flows?.[0];
        const slaInfo = rg.sla_and_monitoring_contracts?.[0];
        const probeInfo = rg.sla_and_monitoring_contracts?.[1];

        for (const link of rg.ip_underlay_links) {
          const cid = String(link.id);
          const circuitPayload: Record<string, unknown> = {
            cid,
            provider: provider.id,
            circuit_type: circuitType.id,
            status: statusPlanned,
            commit_rate: 1000000,
            description: `Underlay ${link.subnet} (VLAN ${link.vlan_id}) | Tunnel ${tunnelInfo?.id || 'IPsec-ESP'} (${tunnelInfo?.cipher_suite || 'AES-256-GCM'}) | Flux ${flowInfo?.id || 'S6a'}`,
            comments: [
              `### Réconciliation Multi-Domaine Archinex (§14 Lot 3 ↔ Lot 1)`,
              `- **Pivot Tenant** : \`${link.tenant_ref}\``,
              `- **Extrémité A (3GPP Shadow)** : \`${link.endpoint_a}\` (\`ExternalMMEFunction\`)`,
              `- **Extrémité Z (Lot 1)** : \`${link.endpoint_z}\` (\`SecurityGatewayFunction\`)`,
              `- **Tunnel IPsec ESP** : \`${tunnelInfo?.id}\` (${tunnelInfo?.protocol} · ${tunnelInfo?.cipher_suite} · ${tunnelInfo?.pfs_dh_group})`,
              `- **Flux Médiatisé S6a** : \`${flowInfo?.id}\` (Hops obligatoires : ${(flowInfo?.mandatory_mediation_hops as string[] || []).join(' → ')})`,
              `- **Contrat SLA associé** : \`${slaInfo?.id || 'N/A'}\` (${slaInfo?.requirement_ref || 'REQ-Lot1-1343'})`,
              `- **Sonde NOC associée** : \`${probeInfo?.id || 'N/A'}\` (${probeInfo?.requirement_ref || 'REQ-Lot1-1274'})`
            ].join('\n')
          };
          if (pivotTenantUuid) {
            circuitPayload.tenant = pivotTenantUuid;
          }

          const circuitObj = await getOrCreateByQuery(
            '/api/circuits/circuits/',
            `cid=${encodeURIComponent(cid)}`,
            circuitPayload,
            true,
            clientOpts
          );

          if (circuitObj?.id) {
            summary.circuitsSynced++;
            if (defaultLocationId) {
              // Terminaison Z côté Lot 1 (pop-valmondois / SecGW-Lot1)
              await getOrCreateByQuery(
                '/api/circuits/circuit-terminations/',
                `circuit=${circuitObj.id}&term_side=Z`,
                {
                  circuit: circuitObj.id,
                  term_side: 'Z',
                  location: defaultLocationId,
                  port_speed: 10000000,
                  description: `Terminaison Lot 1 : ${link.endpoint_z} (SecGW-Lot1 IPsec ESP)`
                },
                true,
                clientOpts
              );
              // Terminaison A côté Partenaire Lot 3 (ext-mme-lot3-01)
              await getOrCreateByQuery(
                '/api/circuits/circuit-terminations/',
                `circuit=${circuitObj.id}&term_side=A`,
                {
                  circuit: circuitObj.id,
                  term_side: 'A',
                  location: defaultLocationId,
                  port_speed: 10000000,
                  description: `Terminaison Tiers Lot 3 : ${link.endpoint_a} (ExternalMMEFunction)`
                },
                true,
                clientOpts
              );
            }
          }

          // 3. Synchronisation du VLAN 1403 et du Préfixe IP 100.64.14.0/30 dans IPAM
          let vlanUuid: string | null = null;
          if (link.vlan_id) {
            try {
              const vlanPayload: Record<string, unknown> = {
                vid: Number(link.vlan_id),
                name: `vlan-${link.vlan_id}-lot3-secgw1`,
                status: statusActive,
                description: `VLAN d'interconnexion Underlay ${cid} (${link.endpoint_a} <-> ${link.endpoint_z})`
              };
              if (pivotTenantUuid) vlanPayload.tenant = pivotTenantUuid;
              if (defaultLocationId) vlanPayload.location = defaultLocationId;

              const vlanObj = await getOrCreateByQuery(
                '/api/ipam/vlans/',
                `vid=${link.vlan_id}`,
                vlanPayload,
                true,
                clientOpts
              );
              if (vlanObj?.id) {
                vlanUuid = vlanObj.id;
                summary.vlansSynced++;
              }
            } catch (e: any) {
              summary.errors.push(`VLAN ${link.vlan_id}: ${e.message}`);
            }
          }

          if (link.subnet) {
            try {
              const prefixPayload: Record<string, unknown> = {
                prefix: String(link.subnet),
                status: statusActive,
                description: `Interco Underlay ${cid} | Tunnel ${tunnelInfo?.id || 'IPsec-ESP'} (${link.endpoint_a} <-> ${link.endpoint_z})`
              };
              if (defaultNamespaceId) prefixPayload.namespace = defaultNamespaceId;
              if (pivotTenantUuid) prefixPayload.tenant = pivotTenantUuid;
              if (vlanUuid) prefixPayload.vlan = vlanUuid;

              const pfxObj = await getOrCreateByQuery(
                '/api/ipam/prefixes/',
                `prefix=${encodeURIComponent(String(link.subnet))}`,
                prefixPayload,
                true,
                clientOpts
              );
              if (pfxObj?.id) summary.prefixesSynced++;
            } catch (e: any) {
              summary.errors.push(`Prefix ${link.subnet}: ${e.message}`);
            }
          }
        }
      } catch (e: any) {
        summary.errors.push(`Circuit sync: ${e.message}`);
      }
    }

    // 4. Synchronisation des Équipements DCIM :
    //    - Serveurs Bare-Metal Sylva (Pools sylva-cnf-sriov-dpdk & sylva-standard-nis2)
    //    - Nœuds Externes Fictifs 3GPP NRM (ext-mme-lot3-01, ext-ran-cell-mobile-01)
    //    - Nœuds Internes de Médiation & Cœur Lot 1 (secgw-lot1-01, dea-lot1-01, hss-lot1-01)
    const deviceIdMap = new Map<string, string>();
    if (defaultLocationId) {
      const mfrDell = await getOrCreateByQuery(
        '/api/dcim/manufacturers/',
        'name=Dell',
        {
          name: 'Dell',
          description: 'Dell Technologies'
        },
        true,
        clientOpts
      );
      const mfrHpe = await getOrCreateByQuery(
        '/api/dcim/manufacturers/',
        'name=HPE',
        {
          name: 'HPE',
          description: 'Hewlett Packard Enterprise'
        },
        true,
        clientOpts
      );
      const mfr3gpp = await getOrCreateByQuery(
        '/api/dcim/manufacturers/',
        `name=${encodeURIComponent('3GPP-Telco-NRM')}`,
        {
          name: '3GPP-Telco-NRM',
          description: '3GPP TS 28.620 / 28.541 Network Resource Model Functions'
        },
        true,
        clientOpts
      );

      const dtR750 = await getOrCreateByQuery(
        '/api/dcim/device-types/',
        `model=${encodeURIComponent('PowerEdge R750')}`,
        {
          manufacturer: mfrDell.id,
          model: 'PowerEdge R750',
          part_number: 'R750-TELCO-SRIOV-DPDK'
        },
        true,
        clientOpts
      );
      const dtDl380 = await getOrCreateByQuery(
        '/api/dcim/device-types/',
        `model=${encodeURIComponent('ProLiant DL380')}`,
        {
          manufacturer: mfrHpe.id,
          model: 'ProLiant DL380',
          part_number: 'DL380-SYLVA-NIS2'
        },
        true,
        clientOpts
      );
      const dt3gppShadow = await getOrCreateByQuery(
        '/api/dcim/device-types/',
        `model=${encodeURIComponent('ExternalFunction-3GPP-Shadow')}`,
        {
          manufacturer: mfr3gpp.id,
          model: 'ExternalFunction-3GPP-Shadow',
          part_number: '3GPP-TS28620-EXT'
        },
        true,
        clientOpts
      );
      const dtMediationCnf = await getOrCreateByQuery(
        '/api/dcim/device-types/',
        `model=${encodeURIComponent('Sylva-CNF-Appliance')}`,
        {
          manufacturer: mfr3gpp.id,
          model: 'Sylva-CNF-Appliance',
          part_number: 'SYLVA-CNF-L1'
        },
        true,
        clientOpts
      );

      const roleWorker = await getOrCreateByQuery(
        '/api/extras/roles/',
        `name=${encodeURIComponent('telco-baremetal-worker')}`,
        {
          name: 'telco-baremetal-worker',
          color: '2196f3',
          content_types: ['dcim.device'],
          description: 'Nœud Bare-Metal Sylva (CAPM3 / RKE2)'
        },
        true,
        clientOpts
      );
      const roleShadow = await getOrCreateByQuery(
        '/api/extras/roles/',
        `name=${encodeURIComponent('external-3gpp-shadow')}`,
        {
          name: 'external-3gpp-shadow',
          color: 'ff9800',
          content_types: ['dcim.device'],
          description: 'Équipement Tiers Externe (Shadow Object 3GPP TS 28.620 ExternalFunction)'
        },
        true,
        clientOpts
      );
      const roleMediation = await getOrCreateByQuery(
        '/api/extras/roles/',
        `name=${encodeURIComponent('lot1-mediation-core-cnf')}`,
        {
          name: 'lot1-mediation-core-cnf',
          color: '4caf50',
          content_types: ['dcim.device'],
          description: 'Fonction Réseau Cœur & Médiation Lot 1 (SecGW / DEA S6a / HSS)'
        },
        true,
        clientOpts
      );

      // 4a. Serveurs Bare-Metal Sylva
      for (const dev of hydrated.nautobot_planned_devices || []) {
        try {
          const isHpe = String(dev.device_type).toLowerCase().includes('dl380');
          const devObj = await getOrCreateByQuery(
            '/api/dcim/devices/',
            `name=${encodeURIComponent(String(dev.name))}`,
            {
              name: String(dev.name),
              device_type: isHpe ? dtDl380.id : dtR750.id,
              role: roleWorker.id,
              location: defaultLocationId,
              status: statusPlanned,
              comments: `Pool Sylva : ${dev.cluster_pool || 'sylva-default'} | Profil : ${dev.dataplane_profile || 'Standard'} | OOB : ${dev.oob_ip} | PDU : ${(dev.power_feeds as string[] || []).join(' + ')}`
            },
            true,
            clientOpts
          );
          if (devObj?.id) {
            deviceIdMap.set(String(dev.name), devObj.id);
            summary.devicesSynced++;
          }
        } catch (e: any) {
          summary.errors.push(`Device ${dev.name}: ${e.message}`);
        }
      }

      // 4b. Équipements Externes Fictifs 3GPP NRM (ext-mme-lot3-01, ext-ran-cell-mobile-01)
      for (const ext of rg?.external_shadow_nodes || []) {
        try {
          const extTenantUuid = tenantIdMap.get(String(ext.tenant_ref)) || pivotTenantUuid;
          const payload: Record<string, unknown> = {
            name: String(ext.id),
            device_type: dt3gppShadow.id,
            role: roleShadow.id,
            location: defaultLocationId,
            status: statusPlanned,
            comments: `3GPP TS 28.620 ${ext.nrm_3gpp_class} (Shadow Object hors contrôle Lot 1) | Zone : ${ext.zone} | Tenant : ${ext.tenant_ref}`
          };
          if (extTenantUuid) payload.tenant = extTenantUuid;

          const extObj = await getOrCreateByQuery(
            '/api/dcim/devices/',
            `name=${encodeURIComponent(String(ext.id))}`,
            payload,
            true,
            clientOpts
          );
          if (extObj?.id) {
            deviceIdMap.set(String(ext.id), extObj.id);
            summary.devicesSynced++;
          }
        } catch (e: any) {
          summary.errors.push(`Shadow node ${ext.id}: ${e.message}`);
        }
      }

      // 4c. Nœuds Internes de Médiation & Cœur Lot 1 (secgw-lot1-01, dea-lot1-01, hss-lot1-01)
      for (const node of rg?.internal_mediation_nodes || []) {
        try {
          const payload: Record<string, unknown> = {
            name: String(node.id),
            device_type: dtMediationCnf.id,
            role: roleMediation.id,
            location: defaultLocationId,
            status: statusPlanned,
            comments: `3GPP ${node.nrm_3gpp_class} — ${node.role} | Zone : ${node.zone}`
          };
          if (pivotTenantUuid && node.id !== 'hss-lot1-01') {
            payload.tenant = pivotTenantUuid;
          }

          const nodeObj = await getOrCreateByQuery(
            '/api/dcim/devices/',
            `name=${encodeURIComponent(String(node.id))}`,
            payload,
            true,
            clientOpts
          );
          if (nodeObj?.id) {
            deviceIdMap.set(String(node.id), nodeObj.id);
            summary.devicesSynced++;
          }
        } catch (e: any) {
          summary.errors.push(`Mediation node ${node.id}: ${e.message}`);
        }
      }
    }

    // 5. Module VPN Natif Nautobot 2.2+ (Issue #240) :
    //    Instanciation idempotente de vpn.IKEProposal, vpn.IPSecProposal, vpn.VPNProfile et vpn.VPNTunnel
    if (rg?.ipsec_tunnels && rg.ipsec_tunnels.length > 0) {
      for (const tun of rg.ipsec_tunnels) {
        try {
          const tunId = String(tun.id || 'tun-ipsec-esp-lot3-secgw1');
          const cipherSuite = String(tun.cipher_suite || 'AES-256-GCM');
          const dhGroup = String(tun.pfs_dh_group || 'DH-20-ECP384');

          // 5a. vpn.IKEProposal
          const ikeProposal = await getOrCreateByQuery(
            '/api/vpn/ike-proposals/',
            `name=${encodeURIComponent('ike-prop-lot3-aes256gcm-dh20')}`,
            {
              name: 'ike-prop-lot3-aes256gcm-dh20',
              authentication_method: 'Certificate',
              encryption_algorithm: cipherSuite,
              authentication_algorithm: 'HMAC-SHA2-384',
              group: '20',
              sa_lifetime: 28800,
              description: `IKEv2 Proposal (§14 Lot 3 ↔ Lot 1) — ${cipherSuite} / ${dhGroup}`
            },
            true,
            clientOpts
          );

          // 5b. vpn.IPSecProposal
          const ipsecProposal = await getOrCreateByQuery(
            '/api/vpn/ipsec-proposals/',
            `name=${encodeURIComponent('ipsec-prop-lot3-esp-aes256gcm')}`,
            {
              name: 'ipsec-prop-lot3-esp-aes256gcm',
              protocol: 'ESP',
              encryption_algorithm: cipherSuite,
              authentication_algorithm: 'HMAC-SHA2-384',
              sa_lifetime_seconds: 3600,
              description: `IPsec ESP Proposal (§14 Lot 3 ↔ Lot 1) — ${cipherSuite}`
            },
            true,
            clientOpts
          );

          // 5c. vpn.VPNProfile
          const vpnProfilePayload: Record<string, unknown> = {
            name: 'vpn-prof-interco-lot3-s6a',
            description: `Profil VPN Interconnexion S6a Lot 3 ↔ SecGW-Lot1 (${cipherSuite}, PFS ${dhGroup})`,
            keepalive_enabled: true,
            keepalive_interval: Number(tun.dpd_timeout_sec || 10),
            keepalive_retries: 3
          };
          if (ikeProposal?.id) {
            vpnProfilePayload.ike_proposals = [ikeProposal.id];
          }
          if (ipsecProposal?.id) {
            vpnProfilePayload.ipsec_proposals = [ipsecProposal.id];
          }
          if (pivotTenantUuid) {
            vpnProfilePayload.tenant = pivotTenantUuid;
          }

          const vpnProfile = await getOrCreateByQuery(
            '/api/vpn/vpn-profiles/',
            `name=${encodeURIComponent('vpn-prof-interco-lot3-s6a')}`,
            vpnProfilePayload,
            true,
            clientOpts
          );

          // 5d. vpn.VPNTunnel (`tun-ipsec-esp-lot3-secgw1`)
          const tunnelPayload: Record<string, unknown> = {
            name: tunId,
            tunnel_id: tunId,
            status: statusPlanned,
            encapsulation: 'IPsec-Transport',
            description: `Tunnel IPsec ESP (${tun.termination_a} <-> ${tun.termination_z}) | Suite : ${cipherSuite} | Underlay : ${tun.underlay_link_ref}`
          };
          if (vpnProfile?.id) {
            tunnelPayload.vpn_profile = vpnProfile.id;
          }
          if (pivotTenantUuid) {
            tunnelPayload.tenant = pivotTenantUuid;
          }

          const vpnTunnelObj = await getOrCreateByQuery(
            '/api/vpn/vpn-tunnels/',
            `name=${encodeURIComponent(tunId)}`,
            tunnelPayload,
            true,
            clientOpts
          );

          if (vpnTunnelObj?.id) {
            summary.vpnTunnelsSynced++;
          }
        } catch (e: any) {
          summary.errors.push(`VPN Tunnel ${tun.id}: ${e.message}`);
        }
      }
    }
  } catch (e: any) {
    summary.errors.push(e.message);
  }

  return summary;
}

/**
 * Collecte en temps réel (Pull SSoT — Issue #239) l'état courant des objets dans Nautobot 2.x
 * (`GET /api/dcim/devices/`, `/api/circuits/circuits/`, `/api/tenancy/tenants/`, `/api/vpn/`)
 * lors de l'exécution de l'Oracle OPA, afin que toute modification manuelle effectuée par un opérateur
 * dans l'interface web de Nautobot (`http://localhost:8080`) soit immédiatement reflétée dans
 * l'inventaire évalué par `multi_axis_refinement.rego`.
 */
export async function pullLiveInventoryFromNautobot(
  baselineHydrated: MultiAxisHydratedInventory,
  clientOpts: NautobotClientOptions = {}
): Promise<NautobotLivePullResult> {
  const cloned: MultiAxisHydratedInventory = JSON.parse(JSON.stringify(baselineHydrated));
  const result: NautobotLivePullResult = {
    reachable: false,
    source: 'local_fallback',
    inventory: cloned,
    observedCounts: {
      devices: 0,
      circuits: 0,
      tenants: 0,
      vpnTunnels: 0
    },
    detectedDrifts: [],
    errors: []
  };

  try {
    await nbFetch('/api/status/', {}, clientOpts);
    result.reachable = true;
    result.source = 'nautobot_live';
  } catch {
    return result;
  }

  try {
    // 1. Lecture en direct des Tenants (/api/tenancy/tenants/)
    const tenantsRes = await nbFetch('/api/tenancy/tenants/?limit=100', {}, clientOpts);
    const liveTenants: any[] = Array.isArray(tenantsRes?.results) ? tenantsRes.results : [];
    result.observedCounts.tenants = liveTenants.length;

    const pivotTenantId = cloned.reconciliation_graph?.pivot_tenant_id || 'org-lot3-mno';
    if (liveTenants.length > 0 && cloned.reconciliation_graph) {
      const liveTenantNames = new Set(liveTenants.map((t) => String(t.name)));
      const filteredOrgs = (cloned.reconciliation_graph.partner_organizations || []).filter((org) =>
        liveTenantNames.has(String(org.id))
      );
      if (
        filteredOrgs.length < (cloned.reconciliation_graph.partner_organizations || []).length
      ) {
        result.detectedDrifts.push(
          `Tenant partenaire '${pivotTenantId}' absent ou supprimé dans Nautobot (/api/tenancy/tenants/)`
        );
      }
      cloned.reconciliation_graph.partner_organizations = filteredOrgs;
    }

    // 2. Lecture en direct des Équipements DCIM (/api/dcim/devices/)
    const devicesRes = await nbFetch('/api/dcim/devices/?limit=100', {}, clientOpts);
    const liveDevices: any[] = Array.isArray(devicesRes?.results) ? devicesRes.results : [];
    result.observedCounts.devices = liveDevices.length;

    const liveDeviceByName = new Map<string, any>();
    for (const d of liveDevices) {
      if (d?.name) {
        liveDeviceByName.set(String(d.name), d);
      }
    }

    for (const plannedDev of cloned.nautobot_planned_devices || []) {
      const devName = String(plannedDev.name);
      const liveDev = liveDeviceByName.get(devName);
      if (!liveDev) continue;

      // Modèle matériel (device_type)
      const liveModel =
        liveDev.device_type?.model ||
        liveDev.device_type?.display ||
        (typeof liveDev.device_type === 'string' ? liveDev.device_type : undefined);
      if (liveModel) {
        const normalizedModel = String(liveModel).toLowerCase();
        let mappedType = String(liveModel);
        if (normalizedModel.includes('r750')) {
          mappedType = 'Dell-PowerEdge-R750-Telco';
        } else if (normalizedModel.includes('dl380')) {
          mappedType = 'HPE-ProLiant-DL380-Gen11';
        }
        if (mappedType !== plannedDev.device_type) {
          result.detectedDrifts.push(
            `Device '${devName}' modifié dans Nautobot : device_type='${mappedType}' (attendu: '${plannedDev.device_type}')`
          );
          plannedDev.device_type = mappedType;
        }
      }

      // Statut Nautobot (Planned vs Active/Offline/Decommissioning...)
      const liveStatus =
        liveDev.status?.value ||
        liveDev.status?.name ||
        (typeof liveDev.status === 'string' ? liveDev.status : undefined);
      if (liveStatus) {
        const normalizedStatus = String(liveStatus).toLowerCase();
        if (normalizedStatus !== String(plannedDev.status).toLowerCase()) {
          result.detectedDrifts.push(
            `Device '${devName}' modifié dans Nautobot : status='${normalizedStatus}' (attendu: '${plannedDev.status}')`
          );
          plannedDev.status = normalizedStatus;
        }
      }

      // Inspection des métadonnées OOB et PDU éventuellement surchargées dans comments ou custom_fields
      const cf = liveDev._custom_field_data || liveDev.custom_fields || {};
      if (typeof cf.oob_ip === 'string') {
        if (cf.oob_ip !== plannedDev.oob_ip) {
          result.detectedDrifts.push(
            `Device '${devName}' modifié dans Nautobot : oob_ip='${cf.oob_ip}'`
          );
          plannedDev.oob_ip = cf.oob_ip;
        }
      } else if (typeof liveDev.comments === 'string') {
        const oobMatch = liveDev.comments.match(/OOB\s*:\s*([^\s|]+)/i);
        if (oobMatch && oobMatch[1]) {
          const parsedOob = oobMatch[1].trim();
          const finalOob =
            parsedOob.toLowerCase() === 'none' || parsedOob.toLowerCase() === 'aucune'
              ? ''
              : parsedOob;
          if (finalOob !== plannedDev.oob_ip) {
            result.detectedDrifts.push(
              `Device '${devName}' modifié dans Nautobot (comments OOB) : oob_ip='${finalOob}'`
            );
            plannedDev.oob_ip = finalOob;
          }
        }
        const pduMatch = liveDev.comments.match(/PDU\s*:\s*([^|\n]+)/i);
        if (pduMatch && pduMatch[1]) {
          const feeds = pduMatch[1]
            .split('+')
            .map((s: string) => s.trim())
            .filter(Boolean);
          if (feeds.length > 0 && feeds.length !== (plannedDev.power_feeds as any[])?.length) {
            result.detectedDrifts.push(
              `Device '${devName}' modifié dans Nautobot (comments PDU) : ${feeds.length} alimentation(s)`
            );
            plannedDev.power_feeds = feeds;
          }
        }
      }
    }

    // Vérifier aussi si le nœud de médiation DEA (`dea-lot1-01`) a été désactivé / décommissionné dans Nautobot
    const liveDea = liveDeviceByName.get('dea-lot1-01');
    if (liveDea && cloned.reconciliation_graph?.service_mediation_flows?.[0]) {
      const deaStatus = String(
        liveDea.status?.value || liveDea.status?.name || liveDea.status || ''
      ).toLowerCase();
      if (['offline', 'decommissioning', 'retired', 'failed'].includes(deaStatus)) {
        result.detectedDrifts.push(
          `Nœud de médiation 'dea-lot1-01' marqué '${deaStatus}' dans Nautobot -> contournement S6a détecté`
        );
        cloned.reconciliation_graph.service_mediation_flows[0].mandatory_mediation_hops = [
          'secgw-lot1-01'
        ];
      }
    }

    // 3. Lecture en direct des Circuits (/api/circuits/circuits/)
    const circuitsRes = await nbFetch('/api/circuits/circuits/?limit=100', {}, clientOpts);
    const liveCircuits: any[] = Array.isArray(circuitsRes?.results) ? circuitsRes.results : [];
    result.observedCounts.circuits = liveCircuits.length;

    if (liveCircuits.length > 0 && cloned.reconciliation_graph?.ip_underlay_links?.[0]) {
      const targetCid = String(cloned.reconciliation_graph.ip_underlay_links[0].id);
      const liveCircuit = liveCircuits.find((c) => String(c.cid) === targetCid);
      if (liveCircuit) {
        // Si un opérateur a détaché le Tenant du circuit S6a dans Nautobot
        const circuitTenantName =
          liveCircuit.tenant?.name ||
          liveCircuit.tenant?.display ||
          (typeof liveCircuit.tenant === 'string' ? liveCircuit.tenant : null);
        if (!circuitTenantName) {
          result.detectedDrifts.push(
            `Circuit '${targetCid}' orphelin de Tenant dans Nautobot (/api/circuits/circuits/)`
          );
          if (cloned.reconciliation_graph.service_mediation_flows?.[0]) {
            cloned.reconciliation_graph.service_mediation_flows[0].tenant_ref = 'ORPHAN_NO_TENANT';
          }
        }
        // Si les commentaires du circuit mentionnent un bypass DEA
        if (
          typeof liveCircuit.comments === 'string' &&
          /bypass[_\s-]*dea|direct[_\s-]*hss/i.test(liveCircuit.comments) &&
          cloned.reconciliation_graph.service_mediation_flows?.[0]
        ) {
          result.detectedDrifts.push(
            `Circuit '${targetCid}' modifié dans Nautobot : contournement DEA S6a déclaré`
          );
          cloned.reconciliation_graph.service_mediation_flows[0].mandatory_mediation_hops = [
            'secgw-lot1-01'
          ];
        }
      }
    }

    // 4. Lecture en direct du Module VPN Nautobot 2.2+ (/api/vpn/ipsec-proposals/ & /api/vpn/vpn-tunnels/)
    try {
      const ipsecPropsRes = await nbFetch('/api/vpn/ipsec-proposals/?limit=50', {}, clientOpts);
      const liveIpsecProps: any[] = Array.isArray(ipsecPropsRes?.results)
        ? ipsecPropsRes.results
        : [];
      const targetProp = liveIpsecProps.find(
        (p) => String(p.name) === 'ipsec-prop-lot3-esp-aes256gcm'
      );
      if (targetProp && cloned.reconciliation_graph?.ipsec_tunnels?.[0]) {
        const liveAlgo =
          targetProp.encryption_algorithm?.value ||
          targetProp.encryption_algorithm?.name ||
          targetProp.encryption_algorithm;
        if (liveAlgo && String(liveAlgo).toUpperCase() !== 'AES-256-GCM') {
          result.detectedDrifts.push(
            `Proposition IPsec '${targetProp.name}' dégradée dans Nautobot : encryption_algorithm='${liveAlgo}' (attendu: 'AES-256-GCM')`
          );
          cloned.reconciliation_graph.ipsec_tunnels[0].cipher_suite = String(liveAlgo);
        }
      }

      const vpnTunnelsRes = await nbFetch('/api/vpn/vpn-tunnels/?limit=50', {}, clientOpts);
      const liveVpnTunnels: any[] = Array.isArray(vpnTunnelsRes?.results)
        ? vpnTunnelsRes.results
        : [];
      result.observedCounts.vpnTunnels = liveVpnTunnels.length;
    } catch {
      // Module VPN optionnel si instance < 2.2
    }
  } catch (e: any) {
    result.errors.push(e.message);
  }

  return result;
}
