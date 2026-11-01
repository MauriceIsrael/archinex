import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NAUTOBOT_PLANNED_EXTRACT_QUERY } from '../../src/lib/server/edp/adapters/nautobotAdapter.js';

describe('EDP Integrator Tools Docker Stack Contract', () => {
  const deployDir = resolve(process.cwd(), 'deploy/integrator-tools');

  it('fournit tous les fichiers d infrastructure requis', () => {
    expect(existsSync(resolve(deployDir, 'compose.yml'))).toBe(true);
    expect(existsSync(resolve(deployDir, 'seed-nautobot.py'))).toBe(true);
    expect(existsSync(resolve(deployDir, 'tools.ps1'))).toBe(true);
    expect(existsSync(resolve(deployDir, 'tools.sh'))).toBe(true);
    expect(existsSync(resolve(deployDir, 'README.md'))).toBe(true);
  });

  it('définit tous les services nécessaires dans compose.yml avec leurs ports canoniques', () => {
    const composeContent = readFileSync(resolve(deployDir, 'compose.yml'), 'utf-8');

    expect(composeContent).toContain('name: archinex-integrator-tools');
    expect(composeContent).toContain('nautobot-db:');
    expect(composeContent).toContain('nautobot-redis:');
    expect(composeContent).toContain('nautobot:');
    expect(composeContent).toContain('nautobot-worker:');
    expect(composeContent).toContain('batfish:');
    expect(composeContent).toContain('opa:');

    // Vérification des ports
    expect(composeContent).toContain('8080:8080');
    expect(composeContent).toContain('9997:9997');
    expect(composeContent).toContain('8181:8181');
    expect(composeContent).toContain('5433:5432');
    expect(composeContent).toContain('6380:6379');
  });

  it('aligne le token superuser Nautobot avec la configuration des adaptateurs', () => {
    const composeContent = readFileSync(resolve(deployDir, 'compose.yml'), 'utf-8');
    expect(composeContent).toContain('0123456789abcdef0123456789abcdef01234567');
  });

  it('configure le seed Nautobot pour respecter l extraction GraphQL et les IP RFC 5737', () => {
    const seedContent = readFileSync(resolve(deployDir, 'seed-nautobot.py'), 'utf-8');

    // Doit correspondre au site interrogé par NAUTOBOT_PLANNED_EXTRACT_QUERY
    expect(NAUTOBOT_PLANNED_EXTRACT_QUERY).toContain('pop-valmondois');
    expect(seedContent).toContain('pop-valmondois');

    // Doit déclarer le rôle et le statut Planned
    expect(seedContent).toContain('telco-baremetal-worker');
    expect(seedContent).toContain('srv-telco-bm-01');
    expect(seedContent).toContain('Planned');

    // Doit assigner l IP RFC 5737 (pureté d intention)
    expect(seedContent).toContain('192.0.2.10/24');
    expect(seedContent).toContain('bmc');
  });
});
