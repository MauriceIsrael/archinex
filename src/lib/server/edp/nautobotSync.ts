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
  urls: {
    circuits: string;
    tenants: string;
    devices: string;
    prefixes: string;
  };
  errors: string[];
}

async function nbFetch(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${DEFAULT_NAUTOBOT_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Token ${DEFAULT_NAUTOBOT_TOKEN}`,
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
  patchOnExisting = true
): Promise<any> {
  const sep = listPath.includes('?') ? '&' : '?';
  const existing = await nbFetch(`${listPath}${sep}${queryParam}`);
  if (existing.results && existing.results.length > 0) {
    const item = existing.results[0];
    if (patchOnExisting && item.id) {
      try {
        return await nbFetch(`${listPath}${item.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(createPayload)
        });
      } catch {
        return item;
      }
    }
    return item;
  }
  return nbFetch(listPath, {
    method: 'POST',
    body: JSON.stringify(createPayload)
  });
}

/**
 * Synchronise de manière idempotente l'inventaire hydraté multi-axes et son graphe de réconciliation
 * (Tenants Lot 2/3, Provider, CircuitType, Circuit S6a `link-ip-lot3-secgw1`, Terminaisons A/Z,
 * VLAN 1403, Préfixe IP 100.64.14.0/30, Équipements Externes 3GPP Shadow, Nœuds de Médiation SecGW/DEA/HSS
 * et Serveurs Bare-Metal Sylva) dans l'instance Nautobot 2.x active.
 */
export async function syncHydratedInventoryToNautobot(
  hydrated: MultiAxisHydratedInventory
): Promise<NautobotSyncSummary> {
  const summary: NautobotSyncSummary = {
    reachable: false,
    tenantsSynced: 0,
    circuitsSynced: 0,
    prefixesSynced: 0,
    vlansSynced: 0,
    devicesSynced: 0,
    urls: {
      circuits: `${DEFAULT_NAUTOBOT_URL}/circuits/circuits/`,
      tenants: `${DEFAULT_NAUTOBOT_URL}/tenancy/tenants/`,
      devices: `${DEFAULT_NAUTOBOT_URL}/dcim/devices/`,
      prefixes: `${DEFAULT_NAUTOBOT_URL}/ipam/prefixes/`
    },
    errors: []
  };

  try {
    await nbFetch('/api/status/');
    summary.reachable = true;
  } catch {
    return summary;
  }

  try {
    // 0. Récupérer les référentiels de base Nautobot (Status Active/Planned, Location pop-valmondois, Namespace Global)
    const statusesRes = await nbFetch('/api/extras/statuses/?limit=50');
    const statusPlanned =
      statusesRes.results?.find((s: any) => s.name === 'Planned')?.id || 'Planned';
    const statusActive =
      statusesRes.results?.find((s: any) => s.name === 'Active')?.id || 'Active';

    const locationsRes = await nbFetch('/api/dcim/locations/?limit=10');
    const defaultLocation = locationsRes.results?.[0];
    const defaultLocationId = defaultLocation?.id;

    // S'assurer que le LocationType "Site" autorise bien l'attachement des Devices, Terminaisons de Circuits, VLANs et Préfixes
    if (defaultLocation?.location_type?.id) {
      try {
        await nbFetch(`/api/dcim/location-types/${defaultLocation.location_type.id}/`, {
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
        });
      } catch {
        // Ignorer si déjà configuré
      }
    }

    const namespacesRes = await nbFetch('/api/ipam/namespaces/?limit=10');
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
          }
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
          }
        );

        const circuitType = await getOrCreateByQuery(
          '/api/circuits/circuit-types/',
          `name=${encodeURIComponent('Interco-WAN-IPsec-ESP-S6a')}`,
          {
            name: 'Interco-WAN-IPsec-ESP-S6a',
            description:
              'Liaison Inter-Lots portant Tunnel IPsec ESP (IKEv2 AES-256-GCM) et Médiation Diameter S6a'
          }
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
            circuitPayload
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
                }
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
                }
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
                vlanPayload
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
                prefixPayload
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
    if (defaultLocationId) {
      const mfrDell = await getOrCreateByQuery('/api/dcim/manufacturers/', 'name=Dell', {
        name: 'Dell',
        description: 'Dell Technologies'
      });
      const mfrHpe = await getOrCreateByQuery('/api/dcim/manufacturers/', 'name=HPE', {
        name: 'HPE',
        description: 'Hewlett Packard Enterprise'
      });
      const mfr3gpp = await getOrCreateByQuery(
        '/api/dcim/manufacturers/',
        `name=${encodeURIComponent('3GPP-Telco-NRM')}`,
        {
          name: '3GPP-Telco-NRM',
          description: '3GPP TS 28.620 / 28.541 Network Resource Model Functions'
        }
      );

      const dtR750 = await getOrCreateByQuery(
        '/api/dcim/device-types/',
        `model=${encodeURIComponent('PowerEdge R750')}`,
        {
          manufacturer: mfrDell.id,
          model: 'PowerEdge R750',
          part_number: 'R750-TELCO-SRIOV-DPDK'
        }
      );
      const dtDl380 = await getOrCreateByQuery(
        '/api/dcim/device-types/',
        `model=${encodeURIComponent('ProLiant DL380')}`,
        {
          manufacturer: mfrHpe.id,
          model: 'ProLiant DL380',
          part_number: 'DL380-SYLVA-NIS2'
        }
      );
      const dt3gppShadow = await getOrCreateByQuery(
        '/api/dcim/device-types/',
        `model=${encodeURIComponent('ExternalFunction-3GPP-Shadow')}`,
        {
          manufacturer: mfr3gpp.id,
          model: 'ExternalFunction-3GPP-Shadow',
          part_number: '3GPP-TS28620-EXT'
        }
      );
      const dtMediationCnf = await getOrCreateByQuery(
        '/api/dcim/device-types/',
        `model=${encodeURIComponent('Sylva-CNF-Appliance')}`,
        {
          manufacturer: mfr3gpp.id,
          model: 'Sylva-CNF-Appliance',
          part_number: 'SYLVA-CNF-L1'
        }
      );

      const roleWorker = await getOrCreateByQuery(
        '/api/extras/roles/',
        `name=${encodeURIComponent('telco-baremetal-worker')}`,
        {
          name: 'telco-baremetal-worker',
          color: '2196f3',
          content_types: ['dcim.device'],
          description: 'Nœud Bare-Metal Sylva (CAPM3 / RKE2)'
        }
      );
      const roleShadow = await getOrCreateByQuery(
        '/api/extras/roles/',
        `name=${encodeURIComponent('external-3gpp-shadow')}`,
        {
          name: 'external-3gpp-shadow',
          color: 'ff9800',
          content_types: ['dcim.device'],
          description: 'Équipement Tiers Externe (Shadow Object 3GPP TS 28.620 ExternalFunction)'
        }
      );
      const roleMediation = await getOrCreateByQuery(
        '/api/extras/roles/',
        `name=${encodeURIComponent('lot1-mediation-core-cnf')}`,
        {
          name: 'lot1-mediation-core-cnf',
          color: '4caf50',
          content_types: ['dcim.device'],
          description: 'Fonction Réseau Cœur & Médiation Lot 1 (SecGW / DEA S6a / HSS)'
        }
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
            }
          );
          if (devObj?.id) summary.devicesSynced++;
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
            payload
          );
          if (extObj?.id) summary.devicesSynced++;
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
            payload
          );
          if (nodeObj?.id) summary.devicesSynced++;
        } catch (e: any) {
          summary.errors.push(`Mediation node ${node.id}: ${e.message}`);
        }
      }
    }
  } catch (e: any) {
    summary.errors.push(e.message);
  }

  return summary;
}
