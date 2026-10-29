import { createHash } from 'node:crypto';
import type { RefinedInputPayload } from '../../../domain/edp/validateRefinedInput.js';

export interface NautobotDeviceInput {
  name: string;
  status: string | { name: string; value?: string };
  role?: string;
  oob_ip?: string | { address: string };
  interfaces?: Array<{ name: string; type?: string; enabled?: boolean }>;
  [key: string]: unknown;
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

  return {
    name: raw.name,
    status: statusStr.toLowerCase(),
    role: raw.role,
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
