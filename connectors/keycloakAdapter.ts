import {
  fetchWithTimeout,
  sanitizeBaseUrl,
  type AdapterHealthResult,
  type AdapterMode,
  type BaseAdapterOptions
} from './adapterTypes.js';

export const DEFAULT_KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://127.0.0.1:8085';
export const DEFAULT_KEYCLOAK_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER || 'admin';
export const DEFAULT_KEYCLOAK_ADMIN_PASSWORD =
  process.env.KEYCLOAK_ADMIN_PASSWORD || 'adminpassword';

export interface KeycloakClientOptions extends BaseAdapterOptions {
  adminUser?: string;
  adminPassword?: string;
  adminToken?: string;
}

export interface KeycloakOidcClientSpec {
  clientId: string;
  redirectUris?: string[];
  publicClient?: boolean;
  standardFlowEnabled?: boolean;
  serviceAccountsEnabled?: boolean;
  provision?: boolean;
}

export interface KeycloakOidcOptions extends KeycloakClientOptions {
  realm: string;
  clients: KeycloakOidcClientSpec[];
  provision?: boolean;
}

export interface KeycloakOidcClientStatus {
  clientId: string;
  exists: boolean;
  provisioned: boolean;
  internalId?: string;
}

export interface KeycloakOidcResult {
  reachable: boolean;
  mode: AdapterMode;
  baseUrl: string;
  realm: string;
  realmExists: boolean;
  clients: KeycloakOidcClientStatus[];
  compliant: boolean;
  checkedAt: string;
  errors: string[];
}

export interface KeycloakRoleSpec {
  name: string;
  description?: string;
}

export interface KeycloakGroupSpec {
  name: string;
}

export interface KeycloakRbacOptions extends KeycloakClientOptions {
  realm: string;
  roles?: KeycloakRoleSpec[];
  groups?: KeycloakGroupSpec[];
  provision?: boolean;
}

export interface KeycloakRbacItemStatus {
  name: string;
  exists: boolean;
  provisioned: boolean;
}

export interface KeycloakRbacResult {
  reachable: boolean;
  mode: AdapterMode;
  baseUrl: string;
  realm: string;
  roles: KeycloakRbacItemStatus[];
  groups: KeycloakRbacItemStatus[];
  compliant: boolean;
  checkedAt: string;
  errors: string[];
}

export interface KeycloakPort {
  checkHealth(options?: KeycloakClientOptions): Promise<AdapterHealthResult>;
  ensureRealmAndOidcClients(options: KeycloakOidcOptions): Promise<KeycloakOidcResult>;
  ensureRolesAndGroups(options: KeycloakRbacOptions): Promise<KeycloakRbacResult>;
}

/**
 * Adaptateur Keycloak (Port/Adapter) pour la validation et le provisionnement
 * des realms, clients OIDC, rôles et groupes via l'API Admin REST.
 */
export class KeycloakAdapter implements KeycloakPort {
  private readonly defaultOptions: KeycloakClientOptions;

  constructor(defaultOptions: KeycloakClientOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  private resolveConfig(override?: KeycloakClientOptions) {
    return {
      baseUrl: sanitizeBaseUrl(override?.baseUrl || this.defaultOptions.baseUrl || DEFAULT_KEYCLOAK_URL),
      adminUser: override?.adminUser || this.defaultOptions.adminUser || DEFAULT_KEYCLOAK_ADMIN_USER,
      adminPassword:
        override?.adminPassword || this.defaultOptions.adminPassword || DEFAULT_KEYCLOAK_ADMIN_PASSWORD,
      adminToken: override?.adminToken || this.defaultOptions.adminToken,
      timeoutMs: override?.timeoutMs ?? this.defaultOptions.timeoutMs ?? 5000,
      fetchImpl: override?.fetchImpl ?? this.defaultOptions.fetchImpl
    };
  }

  private async getAdminToken(
    cfg: ReturnType<KeycloakAdapter['resolveConfig']>
  ): Promise<{ reachable: boolean; token?: string; error?: string }> {
    if (cfg.adminToken) {
      return { reachable: true, token: cfg.adminToken };
    }

    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: cfg.adminUser,
      password: cfg.adminPassword
    });

    const res = await fetchWithTimeout<{ access_token?: string }>(
      `${cfg.baseUrl}/realms/master/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString()
      },
      cfg.timeoutMs,
      cfg.fetchImpl
    );

    if (res.networkError) {
      return { reachable: false, error: res.error };
    }
    if (!res.ok || !res.data?.access_token) {
      return {
        reachable: true,
        error: res.error || 'Authentification admin Keycloak refusée'
      };
    }

    return { reachable: true, token: res.data.access_token };
  }

  private async ensureRealm(
    baseUrl: string,
    token: string,
    realm: string,
    provision: boolean,
    timeoutMs: number,
    fetchImpl?: typeof fetch
  ): Promise<{ reachable: boolean; exists: boolean; error?: string }> {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };

    const getRes = await fetchWithTimeout(
      `${baseUrl}/admin/realms/${encodeURIComponent(realm)}`,
      { method: 'GET', headers },
      timeoutMs,
      fetchImpl
    );

    if (getRes.networkError) {
      return { reachable: false, exists: false, error: getRes.error };
    }
    if (getRes.ok) {
      return { reachable: true, exists: true };
    }
    if (!provision) {
      return { reachable: true, exists: false, error: `Realm '${realm}' absent` };
    }

    const createRes = await fetchWithTimeout(
      `${baseUrl}/admin/realms`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ realm, enabled: true })
      },
      timeoutMs,
      fetchImpl
    );

    if (createRes.networkError) {
      return { reachable: false, exists: false, error: createRes.error };
    }

    return {
      reachable: true,
      exists: createRes.ok,
      error: createRes.ok ? undefined : createRes.error
    };
  }

  async checkHealth(options?: KeycloakClientOptions): Promise<AdapterHealthResult> {
    const cfg = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();

    const res = await fetchWithTimeout<{ realm?: string }>(
      `${cfg.baseUrl}/realms/master`,
      { method: 'GET', headers: { Accept: 'application/json' } },
      cfg.timeoutMs,
      cfg.fetchImpl
    );

    if (res.networkError) {
      return {
        service: 'keycloak',
        reachable: false,
        mode: 'degraded',
        baseUrl: cfg.baseUrl,
        checkedAt,
        errors: [res.error || 'Keycloak injoignable']
      };
    }

    return {
      service: 'keycloak',
      reachable: true,
      mode: res.ok ? 'live' : 'degraded',
      baseUrl: cfg.baseUrl,
      version: res.data?.realm ? 'oidc-ready' : undefined,
      checkedAt,
      errors: res.ok ? [] : [res.error || `HTTP ${res.status}`]
    };
  }

  async ensureRealmAndOidcClients(
    options: KeycloakOidcOptions
  ): Promise<KeycloakOidcResult> {
    const cfg = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();
    const provisionDefault = options.provision ?? false;
    const errors: string[] = [];

    const auth = await this.getAdminToken(cfg);
    if (!auth.reachable || !auth.token) {
      return {
        reachable: auth.reachable,
        mode: 'degraded',
        baseUrl: cfg.baseUrl,
        realm: options.realm,
        realmExists: false,
        clients: [],
        compliant: false,
        checkedAt,
        errors: [auth.error || 'Keycloak hors-ligne']
      };
    }

    const realmCheck = await this.ensureRealm(
      cfg.baseUrl,
      auth.token,
      options.realm,
      provisionDefault,
      cfg.timeoutMs,
      cfg.fetchImpl
    );

    if (!realmCheck.reachable) {
      return {
        reachable: false,
        mode: 'degraded',
        baseUrl: cfg.baseUrl,
        realm: options.realm,
        realmExists: false,
        clients: [],
        compliant: false,
        checkedAt,
        errors: [realmCheck.error || 'Keycloak hors-ligne']
      };
    }
    if (realmCheck.error) {
      errors.push(realmCheck.error);
    }

    const headers = {
      Authorization: `Bearer ${auth.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };

    const clientStatuses: KeycloakOidcClientStatus[] = [];

    for (const client of options.clients) {
      const listRes = await fetchWithTimeout<Array<{ id?: string; clientId?: string }>>(
        `${cfg.baseUrl}/admin/realms/${encodeURIComponent(options.realm)}/clients?clientId=${encodeURIComponent(client.clientId)}`,
        { method: 'GET', headers },
        cfg.timeoutMs,
        cfg.fetchImpl
      );

      if (listRes.networkError) {
        return {
          reachable: false,
          mode: 'degraded',
          baseUrl: cfg.baseUrl,
          realm: options.realm,
          realmExists: realmCheck.exists,
          clients: clientStatuses,
          compliant: false,
          checkedAt,
          errors: [listRes.error || 'Keycloak hors-ligne']
        };
      }

      const matched = Array.isArray(listRes.data)
        ? listRes.data.find((c) => c.clientId === client.clientId)
        : undefined;

      let exists = Boolean(matched);
      let provisioned = false;
      let internalId = matched?.id;

      const shouldProvision = (client.provision ?? provisionDefault) && !exists && realmCheck.exists;
      if (shouldProvision) {
        const createRes = await fetchWithTimeout(
          `${cfg.baseUrl}/admin/realms/${encodeURIComponent(options.realm)}/clients`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              clientId: client.clientId,
              enabled: true,
              protocol: 'openid-connect',
              publicClient: client.publicClient ?? false,
              standardFlowEnabled: client.standardFlowEnabled ?? true,
              serviceAccountsEnabled: client.serviceAccountsEnabled ?? false,
              redirectUris: client.redirectUris || []
            })
          },
          cfg.timeoutMs,
          cfg.fetchImpl
        );

        if (createRes.ok) {
          exists = true;
          provisioned = true;
        } else {
          errors.push(`Client OIDC ${client.clientId}: ${createRes.error || `HTTP ${createRes.status}`}`);
        }
      }

      clientStatuses.push({
        clientId: client.clientId,
        exists,
        provisioned,
        internalId
      });
    }

    const compliant = realmCheck.exists && clientStatuses.every((c) => c.exists);

    return {
      reachable: true,
      mode: 'live',
      baseUrl: cfg.baseUrl,
      realm: options.realm,
      realmExists: realmCheck.exists,
      clients: clientStatuses,
      compliant,
      checkedAt,
      errors
    };
  }

  async ensureRolesAndGroups(
    options: KeycloakRbacOptions
  ): Promise<KeycloakRbacResult> {
    const cfg = this.resolveConfig(options);
    const checkedAt = new Date().toISOString();
    const provisionDefault = options.provision ?? false;
    const errors: string[] = [];

    const auth = await this.getAdminToken(cfg);
    if (!auth.reachable || !auth.token) {
      return {
        reachable: auth.reachable,
        mode: 'degraded',
        baseUrl: cfg.baseUrl,
        realm: options.realm,
        roles: [],
        groups: [],
        compliant: false,
        checkedAt,
        errors: [auth.error || 'Keycloak hors-ligne']
      };
    }

    const headers = {
      Authorization: `Bearer ${auth.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };

    const roleStatuses: KeycloakRbacItemStatus[] = [];
    for (const role of options.roles || []) {
      const getRes = await fetchWithTimeout(
        `${cfg.baseUrl}/admin/realms/${encodeURIComponent(options.realm)}/roles/${encodeURIComponent(role.name)}`,
        { method: 'GET', headers },
        cfg.timeoutMs,
        cfg.fetchImpl
      );

      if (getRes.networkError) {
        return {
          reachable: false,
          mode: 'degraded',
          baseUrl: cfg.baseUrl,
          realm: options.realm,
          roles: roleStatuses,
          groups: [],
          compliant: false,
          checkedAt,
          errors: [getRes.error || 'Keycloak hors-ligne']
        };
      }

      let exists = getRes.ok;
      let provisioned = false;

      if (!exists && provisionDefault) {
        const createRes = await fetchWithTimeout(
          `${cfg.baseUrl}/admin/realms/${encodeURIComponent(options.realm)}/roles`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              name: role.name,
              description: role.description || ''
            })
          },
          cfg.timeoutMs,
          cfg.fetchImpl
        );
        if (createRes.ok) {
          exists = true;
          provisioned = true;
        } else {
          errors.push(`Rôle ${role.name}: ${createRes.error || `HTTP ${createRes.status}`}`);
        }
      }

      roleStatuses.push({ name: role.name, exists, provisioned });
    }

    const groupStatuses: KeycloakRbacItemStatus[] = [];
    for (const group of options.groups || []) {
      const listRes = await fetchWithTimeout<Array<{ name?: string }>>(
        `${cfg.baseUrl}/admin/realms/${encodeURIComponent(options.realm)}/groups?search=${encodeURIComponent(group.name)}`,
        { method: 'GET', headers },
        cfg.timeoutMs,
        cfg.fetchImpl
      );

      if (listRes.networkError) {
        return {
          reachable: false,
          mode: 'degraded',
          baseUrl: cfg.baseUrl,
          realm: options.realm,
          roles: roleStatuses,
          groups: groupStatuses,
          compliant: false,
          checkedAt,
          errors: [listRes.error || 'Keycloak hors-ligne']
        };
      }

      let exists = Array.isArray(listRes.data) && listRes.data.some((g) => g.name === group.name);
      let provisioned = false;

      if (!exists && provisionDefault) {
        const createRes = await fetchWithTimeout(
          `${cfg.baseUrl}/admin/realms/${encodeURIComponent(options.realm)}/groups`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: group.name })
          },
          cfg.timeoutMs,
          cfg.fetchImpl
        );
        if (createRes.ok) {
          exists = true;
          provisioned = true;
        } else {
          errors.push(`Groupe ${group.name}: ${createRes.error || `HTTP ${createRes.status}`}`);
        }
      }

      groupStatuses.push({ name: group.name, exists, provisioned });
    }

    const compliant =
      roleStatuses.every((r) => r.exists) && groupStatuses.every((g) => g.exists);

    return {
      reachable: true,
      mode: 'live',
      baseUrl: cfg.baseUrl,
      realm: options.realm,
      roles: roleStatuses,
      groups: groupStatuses,
      compliant,
      checkedAt,
      errors
    };
  }
}

export function createKeycloakAdapter(options?: KeycloakClientOptions): KeycloakAdapter {
  return new KeycloakAdapter(options);
}

export async function checkKeycloakHealth(
  options?: KeycloakClientOptions
): Promise<AdapterHealthResult> {
  return new KeycloakAdapter(options).checkHealth();
}

export async function validateOrProvisionKeycloakOidc(
  options: KeycloakOidcOptions
): Promise<KeycloakOidcResult> {
  return new KeycloakAdapter(options).ensureRealmAndOidcClients(options);
}

export async function validateOrProvisionKeycloakRbac(
  options: KeycloakRbacOptions
): Promise<KeycloakRbacResult> {
  return new KeycloakAdapter(options).ensureRolesAndGroups(options);
}
