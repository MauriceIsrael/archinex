import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { PrismaClient } from '@prisma/client';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { signAccessToken, signRefreshToken } from '../../../src/lib/auth/jwt.server';

const SERVICE_TOKEN = process.env.LLMOPS_LIVE_TOKEN || 'contract-service-token';
const DB_FILE = resolve(process.cwd(), 'prisma/test-playwright.db');
const DATABASE_URL = `file:${DB_FILE}`;
const AUTH_DIR = resolve(process.cwd(), 'tests/e2e/.auth');

export const USERS = {
  lead: { id: 'usr_lead_arch', name: 'Lead Architect', email: 'lead@archinex.local', role: 'admin', handle: '@lead-arch', roles: ['kb:review', 'kb:maintain', 'kb:admin'], domains: ['architecture'] },
  alice: { id: 'usr_alice', name: 'Alice Core Owner', email: 'alice@example.org', role: 'domain_expert', handle: '@core-owner-architecture', roles: ['kb:review'], domains: ['network-automation', 'architecture', 'automation'] },
  sec: { id: 'usr_sec', name: 'Security Compliance', email: 'sec@example.org', role: 'domain_expert', handle: '@security-compliance-team', roles: ['kb:review'], domains: ['security-governance', 'security'] },
  eva: { id: 'usr_eva', name: 'Eva CISO Evaluator', email: 'eva@example.org', role: 'domain_expert', handle: '@ciso-office', roles: ['kb:review', 'kb:evaluate'], domains: [] },
  maint: { id: 'usr_maint', name: 'Maintainer Admin', email: 'maint@example.org', role: 'admin', handle: '@maintainers', roles: ['kb:review', 'kb:maintain', 'kb:admin'], domains: [] },
  unknown: { id: 'usr_unknown', name: 'Unknown User', email: 'unknown@example.org', role: 'user', handle: '@unknown-user', roles: [], domains: [] }
};

async function isUrlResponding(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  console.log('\n[Playwright Global Setup] Initialisation de l’environnement E2E navigateur...');
  const t0 = Date.now();

  // 1. Démarrage du conteneur LLMOps si nécessaire
  let container: StartedTestContainer | null = null;
  let llmopsBaseUrl = process.env.LLMOPS_LIVE_URL;

  if (llmopsBaseUrl) {
    console.log(`[Playwright Global Setup] Réutilisation serveur LLMOps : ${llmopsBaseUrl}`);
  } else {
    console.log('[Playwright Global Setup] Démarrage du conteneur llmops-contract:latest...');
    container = await new GenericContainer('llmops-contract:latest')
      .withExposedPorts(8000)
      .withEnvironment({
        ENGAGEMENT_TOKENS: 'contract-service-token:kb:admin,kb:review,kb:evaluate,kb:maintain,kb:delegate',
        KNOWLEDGE_HUB_API_KEY: 'test-key',
        STORAGE_MODE: 'persistent'
      })
      .withWaitStrategy(
        Wait.forHttp('/health', 8000).withHeaders({
          Authorization: `Bearer ${SERVICE_TOKEN}`
        })
      )
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(8000);
    llmopsBaseUrl = `http://${host}:${port}`;
    console.log(`[Playwright Global Setup] Conteneur LLMOps prêt sur ${llmopsBaseUrl}`);
  }

  // 2. Base SQLite Archinex propre
  if (existsSync(DB_FILE)) {
    try {
      unlinkSync(DB_FILE);
    } catch {
      // Ignorer si verrouillé
    }
  }

  process.env.DATABASE_URL = DATABASE_URL;
  console.log('[Playwright Global Setup] Initialisation du schéma SQLite...');
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL },
    stdio: 'pipe'
  });

  const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } }
  });

  // Nettoyage et seed des utilisateurs
  await prisma.kbEventCursor.deleteMany();
  for (const u of Object.values(USERS)) {
    await prisma.user.create({
      data: {
        id: u.id,
        name: u.name,
        email: u.email,
        passwordHash: '$2a$10$wT8hM..test.hash',
        role: u.role,
        attributes: JSON.stringify({ role: u.role, clearance: 3 }),
        kbProfile: {
          create: {
            kbHandle: u.handle,
            kbRoles: JSON.stringify(u.roles),
            ownedDomains: JSON.stringify(u.domains),
            delegated: u.roles.length > 0,
            isActive: true
          }
        }
      }
    });
  }

  await prisma.casbinRule.createMany({
    data: [
      { ptype: 'p', v0: 'admin', v1: '*', v2: '*' },
      { ptype: 'g', v0: USERS.lead.id, v1: 'admin' },
      { ptype: 'g', v0: USERS.maint.id, v1: 'admin' }
    ]
  });

  // Création du projet et de l'engagement de démonstration
  const projId = 'proj-e2e-demo';
  const engId = 'eng-e2e-demo';

  await prisma.project.create({
    data: {
      id: projId,
      title: 'Plateforme Opérations Réseau 5G & Cloud',
      shortName: 'NETOPS',
      type: 'poc_migration',
      badge: 'E2E',
      description: 'Projet d architecture souveraine et résiliente sous NIS2',
      status: 'active'
    }
  });

  await prisma.engagement.create({
    data: {
      id: engId,
      title: 'Démonstration E2E Réglementation vers Capitalisation',
      shortName: 'E2E-NIS2',
      type: 'poc_migration',
      badge: 'E2E',
      description: 'Engagement de démonstration des 6 actes de gouvernance',
      status: 'active',
      strategy: JSON.stringify({ corePriority: 'Conformité NIS2 & Haute Disponibilité' }),
      participants: JSON.stringify([
        { id: USERS.lead.id, name: USERS.lead.name, role: 'lead_architect' },
        { id: USERS.alice.id, name: USERS.alice.name, role: 'domain_expert' }
      ]),
      subjects: '[]',
      drafts: '{}',
      statements: '[]',
      dialogueMessages: '[]'
    }
  });

  await prisma.$disconnect();

  // 3. Génération des fichiers storageState (.auth/*.json)
  if (!existsSync(AUTH_DIR)) {
    mkdirSync(AUTH_DIR, { recursive: true });
  }

  for (const [key, u] of Object.entries(USERS)) {
    const accessToken = await signAccessToken({
      id: u.id,
      email: u.email,
      name: u.name,
      role: (u.role === 'admin' ? 'admin' : 'user') as 'admin' | 'user'
    });
    const refreshToken = await signRefreshToken(u.id);

    const storageState = {
      cookies: [
        {
          name: 'accessToken',
          value: accessToken,
          domain: '127.0.0.1',
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const
        },
        {
          name: 'refreshToken',
          value: refreshToken,
          domain: '127.0.0.1',
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const
        },
        {
          name: 'accessToken',
          value: accessToken,
          domain: 'localhost',
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const
        },
        {
          name: 'refreshToken',
          value: refreshToken,
          domain: 'localhost',
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const
        }
      ],
      origins: []
    };

    writeFileSync(resolve(AUTH_DIR, `${key}.json`), JSON.stringify(storageState, null, 2));
  }
  writeFileSync(resolve(AUTH_DIR, 'env.json'), JSON.stringify({ llmopsBaseUrl, SERVICE_TOKEN }, null, 2));
  console.log('[Playwright Global Setup] Fichiers storageState créés dans tests/e2e/.auth');

  // 4. Démarrage de Vite dev server (toujours une instance fraîche avec DATABASE_URL et LLMOPS_BASE_URL du run)
  let viteProcess: ChildProcess | null = null;
  if (process.platform === 'win32') {
    try {
      execSync('powershell -Command "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
    } catch {}
  }

  console.log('[Playwright Global Setup] Démarrage du serveur Archinex (Vite dev)...');
  const isWindows = process.platform === 'win32';
  const npmCmd = isWindows ? 'npx.cmd' : 'npx';
  viteProcess = spawn(npmCmd, ['vite', 'dev', '--host', '127.0.0.1', '--port', '5173', '--force'], {
    shell: true,
    env: {
      ...process.env,
      PORT: '5173',
      DATABASE_URL,
      LLMOPS_BASE_URL: llmopsBaseUrl,
      LLMOPS_AUTH_TOKEN: SERVICE_TOKEN,
      LLMOPS_ALLOWED_HOSTS: 'localhost,127.0.0.1',
      FAKE_LLM_DETERMINISTIC: '1',
      LLMOPS_TIMEOUT_MS: '20000'
    }
  });

    viteProcess.stdout?.on('data', (d) => {
      console.log('[Vite]', d.toString().trim());
    });
    viteProcess.stderr?.on('data', (d) => {
      console.error('[Vite ERR]', d.toString().trim());
    });

    // Attente que le serveur réponde
    const serverStartTimeout = 60000;
    const pollInterval = 1000;
    const startWait = Date.now();
    let ready = false;

    while (Date.now() - startWait < serverStartTimeout) {
      if (await isUrlResponding('http://127.0.0.1:5173')) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, pollInterval));
    }

    if (!ready) {
      if (viteProcess) viteProcess.kill();
      if (container) await container.stop();
      throw new Error('[Playwright Global Setup] Le serveur Vite n a pas répondu dans le délai imparti');
    }

    console.log('[Playwright Global Setup] Serveur Archinex prêt sur http://127.0.0.1:5173');

  // Enregistrement des ressources globales
  (globalThis as any).__CONTAINER__ = container;
  (globalThis as any).__VITE_PROCESS__ = viteProcess;
  (globalThis as any).__LLMOPS_BASE_URL__ = llmopsBaseUrl;

  console.log(`[Playwright Global Setup] Terminé avec succès en ${(Date.now() - t0)} ms\n`);
}
