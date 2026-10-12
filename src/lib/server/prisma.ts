import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client singleton (instanciation paresseuse pour éviter
 * d'initialiser le moteur natif lors du build SSR / adapter-node).
 */
let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
	if (!_prisma) {
		console.log('[Prisma Init] CWD:', process.cwd());
		console.log('[Prisma Init] DATABASE_URL:', process.env.DATABASE_URL);
		_prisma = new PrismaClient();
	}
	return _prisma;
}

const prisma = new Proxy({} as PrismaClient, {
	get(_target, prop, receiver) {
		const client = getPrisma();
		const value = Reflect.get(client, prop, receiver);
		if (typeof value === 'function') {
			return value.bind(client);
		}
		return value;
	}
});

export { prisma };
