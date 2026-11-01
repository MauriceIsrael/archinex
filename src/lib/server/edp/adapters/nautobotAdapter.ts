import { createHash } from 'node:crypto';
import type { RefinedInputPayload } from '../../../domain/edp/validateRefinedInput.js';

export interface NautobotDeviceInput {
  name: string;
  status: string | { name: string; value?: string };
  role?: string | { name: string };
  oob_ip?: string | { address: string };
  interfaces?: Array<{
    name: string;
    type?: string;
    enabled?: boolean;
    ip_addresses?: Array<{ address?: string; host?: string }>;
  }>;
  [key: string]: unknown;
}

export const NAUTOBOT_PLANNED_EXTRACT_QUERY = `query ExtractPlannedTelcoInventory($site_slug: [String] = ["pop-valmondois"]) {
  devices(location: $site_slug, status: "planned") {
    name
    status {
      name
    }
    role {
      name
    }
    _custom_field_data
    interfaces(name__ic: "bmc") {
      name
      type
      mac_address
      ip_addresses {
        address
        host
        parent {
          prefix
          vrf {
            name
          }
          _custom_field_data
        }
      }
    }
  }
}`;

/**
 * Transforme le résultat brut d'une requête GraphQL Nautobot en liste de NautobotDeviceInput.
 * Extrait l'IP OOB depuis l'interface BMC si elle n'est pas directement déclarée sur l'appareil.
 */
export function parseNautobotGraphqlResponse(response: {
  data?: { devices?: Array<Record<string, unknown>> };
  devices?: Array<Record<string, unknown>> | Record<string, unknown>;
}): NautobotDeviceInput[] {
  let rawDevices: any[] = [];
  if (response.data && Array.isArray(response.data.devices)) {
    rawDevices = response.data.devices;
  } else if (Array.isArray(response.devices)) {
    rawDevices = response.devices;
  }

  return rawDevices.map((d: any) => {
    let oobIp = d.oob_ip;

    // Si oob_ip n'est pas directement défini, chercher dans les interfaces BMC
    if (!oobIp && Array.isArray(d.interfaces)) {
      const bmcInterface = d.interfaces.find((iface: any) =>
        /bmc|ilo|idrac|ipmi|redfish/i.test(iface.name || '')
      );
      if (bmcInterface && Array.isArray(bmcInterface.ip_addresses) && bmcInterface.ip_addresses.length > 0) {
        const firstIp = bmcInterface.ip_addresses[0];
        oobIp = firstIp.host || firstIp.address;
      }
    }

    const roleStr = typeof d.role === 'object' && d.role !== null ? d.role.name : d.role;

    return {
      name: d.name,
      status: d.status,
      role: roleStr,
      oob_ip: oobIp,
      interfaces: d.interfaces
    };
  });
}

export interface NautobotTransformOptions {
  devices: NautobotDeviceInput[];
  version?: string;
  command?: string;
  generatedAt?: string;
}

/**
 * Normalise un équipement extrait de Nautobot GraphQL en schéma standard EDP (Issue #179).
 */
export function normalizeNautobotDevice(raw: NautobotDeviceInput): Record<string, unknown> {
  const statusStr = typeof raw.status === 'object' && raw.status !== null ? raw.status.value || raw.status.name : String(raw.status || '');
  const oobIpStr = typeof raw.oob_ip === 'object' && raw.oob_ip !== null ? raw.oob_ip.address.split('/')[0] : (raw.oob_ip ? String(raw.oob_ip).split('/')[0] : undefined);
  const roleStr = typeof raw.role === 'object' && raw.role !== null ? raw.role.name : (raw.role ? String(raw.role) : undefined);

  return {
    name: raw.name,
    status: statusStr.toLowerCase(),
    role: roleStr,
    oob_ip: oobIpStr,
    interfaces: (raw.interfaces || []).map((iface) => ({
      name: iface.name,
      type: iface.type || 'generic'
    }))
  };
}

/**
 * Transforme les équipements Nautobot Planned en un payload 'refined_input' conforme avec provenance (Issue #179).
 */
export function transformNautobotExportToRefinedInput(
  options: NautobotTransformOptions
): RefinedInputPayload {
  if (!options.devices || !Array.isArray(options.devices)) {
    throw new Error('Les données d’export Nautobot doivent être un tableau d’équipements.');
  }

  const normalized = options.devices.map((d) => normalizeNautobotDevice(d));
  const contentStr = JSON.stringify(normalized);
  const sha256 = createHash('sha256').update(contentStr).digest('hex');

  return {
    sources: {
      nautobot_planned_devices: {
        provenance: {
          tool: 'nautobot-gql-exporter',
          version: options.version || '2.2.0',
          command: options.command || 'query { devices(status: "planned") { name status oob_ip interfaces } }',
          sha256,
          generated_at: options.generatedAt || new Date().toISOString()
        },
        content: normalized
      }
    }
  };
}
