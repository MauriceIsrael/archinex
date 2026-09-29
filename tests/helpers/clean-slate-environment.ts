import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

export const TEST_ENGAGEMENT_ID = 'test-engagement-clean-2026';
export const TEST_AUTH_TOKEN = 'test-token-ephemeral-2026';
const DB_FILE = resolve(process.cwd(), 'prisma/test-clean.db');
const DATABASE_URL = `file:${DB_FILE}`;

export interface CleanTestEnvironment {
	container: StartedTestContainer;
	baseUrl: string;
	authToken: string;
	engagement: string;
	prisma: PrismaClient;
}

/**
 * Démarre le conteneur Docker éphémère LLMOps et initialise une base SQLite Archinex 100% vierge.
 */
export async function setupCleanEnvironment(): Promise<CleanTestEnvironment> {
	// 1. Démarrage du conteneur LLMOps éphémère avec volume mémoire tmpfs
	console.log('[TestEnv] Démarrage du conteneur LLMOps éphémère (llmops-test:latest)...');
	const container = await new GenericContainer('llmops-test:latest')
		.withExposedPorts(8000)
		.withEnvironment({
			SERVER_TOKEN: TEST_AUTH_TOKEN,
			LLMOPS_PLANE: 'all',
			LLMOPS_TRANSPORT: 'sse'
		})
		.withTmpFs({ '/app/data': 'rw,uid=10001,gid=10001' })
		.withWaitStrategy(
			Wait.forHttp('/health', 8000).withHeaders({
				Authorization: `Bearer ${TEST_AUTH_TOKEN}`
			})
		)
		.start();

	const host = container.getHost();
	const port = container.getMappedPort(8000);
	const baseUrl = `http://${host}:${port}`;
	console.log(`[TestEnv] Conteneur démarré avec succès sur ${baseUrl}`);

	// 2. Configuration des variables d'environnement
	process.env.DATABASE_URL = DATABASE_URL;
	process.env.LLMOPS_BASE_URL = baseUrl;
	process.env.LLMOPS_AUTH_TOKEN = TEST_AUTH_TOKEN;
	process.env.LLMOPS_ENGAGEMENT = TEST_ENGAGEMENT_ID;

	// 3. Reset physique de la base SQLite Archinex
	if (existsSync(DB_FILE)) {
		try {
			unlinkSync(DB_FILE);
		} catch {
			// Ignorer si verrouillé temporairement
		}
	}

	console.log('[TestEnv] Initialisation du schéma Prisma vierge...');
	execSync(`npx prisma db push --skip-generate --accept-data-loss`, {
		env: { ...process.env, DATABASE_URL },
		stdio: 'pipe'
	});

	const prisma = new PrismaClient({
		datasources: { db: { url: DATABASE_URL } }
	});

	// 4. Insertion du Lead Architect et des permissions Casbin
	await prisma.user.create({
		data: {
			id: 'usr_lead_arch_test',
			name: 'Maurice Israel (Lead Architect)',
			email: 'maurice.israel@free.fr',
			passwordHash: '$2a$10$wT8hM..test.hash',
			role: 'admin',
			attributes: JSON.stringify({
				clearance: 3,
				department: 'Architecture & Systèmes',
				role: 'lead_architect'
			})
		}
	});

	await prisma.casbinRule.createMany({
		data: [
			{ ptype: 'p', v0: 'admin', v1: '*', v2: '*' },
			{ ptype: 'g', v0: 'usr_lead_arch_test', v1: 'admin' }
		]
	});

	// 5. Création de l'engagement vierge (0 sujet, 0 énoncé, 0 brouillon)
	await prisma.engagement.create({
		data: {
			id: TEST_ENGAGEMENT_ID,
			title: 'Test Clean Slate 2026',
			shortName: 'CleanSlate',
			type: 'poc_migration',
			badge: 'TEST',
			description: 'Espace de test sans antécédents pour preuve de capitalisation',
			status: 'active',
			strategy: JSON.stringify({ corePriority: 'Preuve Élicitation & Capitalisation' }),
			participants: JSON.stringify([
				{ id: 'usr_lead_arch_test', name: 'M. Israel', role: 'lead_architect' }
			]),
			subjects: '[]',
			drafts: '{}',
			statements: '[]',
			dialogueMessages: '[]'
		}
	});

	// Vérification de vacuité absolue de la table des documents de doctrine
	await prisma.corpusDocument.deleteMany({});

	return {
		container,
		baseUrl,
		authToken: TEST_AUTH_TOKEN,
		engagement: TEST_ENGAGEMENT_ID,
		prisma
	};
}

/**
 * Arrête le conteneur Docker et nettoie les fichiers temporaires.
 */
export async function teardownCleanEnvironment(env: CleanTestEnvironment): Promise<void> {
	console.log('[TestEnv] Arrêt du conteneur Docker et nettoyage...');
	try {
		await env.prisma.$disconnect();
	} catch {}

	try {
		await env.container.stop();
	} catch {}

	if (existsSync(DB_FILE)) {
		try {
			unlinkSync(DB_FILE);
		} catch {}
	}
	console.log('[TestEnv] Nettoyage terminé.');
}
