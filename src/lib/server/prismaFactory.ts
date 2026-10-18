import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../../generated/prisma/client';
import { resolveDatabaseUrl } from './dbUrl';

export { PrismaClient };

/** Crée un PrismaClient (Prisma 7 : adaptateur better-sqlite3 obligatoire). */
export function createPrismaClient(databaseUrl?: string): PrismaClient {
	const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl(databaseUrl) });
	return new PrismaClient({ adapter });
}