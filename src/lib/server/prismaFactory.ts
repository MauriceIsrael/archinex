import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../../generated/prisma/client';
import { resolveDatabaseUrl } from './dbUrl';

export { PrismaClient };

function extractStringField(value: unknown): string | undefined {
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object' && 'set' in value && typeof (value as { set?: unknown }).set === 'string') {
		return (value as { set: string }).set;
	}
	return undefined;
}

function assertEpistemicInvariant(
	confidence: string | undefined,
	productionMode: string | undefined,
	entity: 'Argument' | 'Statement'
): void {
	if (confidence === 'verified' && productionMode === 'llm-derived') {
		throw new Error(
			`Invariant II Violation (${entity}): la combinaison confidence="verified" et productionMode="llm-derived" est strictement interdite en base.`
		);
	}
}

function assertCreateRecords(data: unknown, entity: 'Argument' | 'Statement'): void {
	const records = Array.isArray(data) ? data : [data];
	for (const rec of records) {
		if (!rec || typeof rec !== 'object') continue;
		const r = rec as Record<string, unknown>;
		assertEpistemicInvariant(
			extractStringField(r.confidence),
			extractStringField(r.productionMode),
			entity
		);
	}
}

/** Crée un PrismaClient (Prisma 7 : adaptateur better-sqlite3 obligatoire) avec garde-fou épistémique. */
export function createPrismaClient(databaseUrl?: string): PrismaClient {
	const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl(databaseUrl) });
	const base = new PrismaClient({ adapter });

	const extended = base.$extends({
		query: {
			argument: {
				async create({ args, query }) {
					assertCreateRecords(args.data, 'Argument');
					return query(args);
				},
				async createMany({ args, query }) {
					assertCreateRecords(args.data, 'Argument');
					return query(args);
				},
				async createManyAndReturn({ args, query }) {
					assertCreateRecords(args.data, 'Argument');
					return query(args);
				},
				async update({ args, query }) {
					const data = args.data as Record<string, unknown>;
					const nextConfidence = extractStringField(data.confidence);
					const nextProductionMode = extractStringField(data.productionMode);
					if (nextConfidence !== undefined && nextProductionMode !== undefined) {
						assertEpistemicInvariant(nextConfidence, nextProductionMode, 'Argument');
					} else if (nextConfidence === 'verified') {
						const existing = await base.argument.findUnique({
							where: args.where,
							select: { productionMode: true }
						});
						assertEpistemicInvariant('verified', existing?.productionMode, 'Argument');
					} else if (nextProductionMode === 'llm-derived') {
						const existing = await base.argument.findUnique({
							where: args.where,
							select: { confidence: true }
						});
						assertEpistemicInvariant(existing?.confidence, 'llm-derived', 'Argument');
					}
					return query(args);
				},
				async updateMany({ args, query }) {
					const data = args.data as Record<string, unknown>;
					const nextConfidence = extractStringField(data.confidence);
					const nextProductionMode = extractStringField(data.productionMode);
					if (nextConfidence !== undefined && nextProductionMode !== undefined) {
						assertEpistemicInvariant(nextConfidence, nextProductionMode, 'Argument');
					} else if (nextConfidence === 'verified') {
						const violatingCount = await base.argument.count({
							where: args.where
								? { AND: [args.where, { productionMode: 'llm-derived' }] }
								: { productionMode: 'llm-derived' }
						});
						if (violatingCount > 0) {
							assertEpistemicInvariant('verified', 'llm-derived', 'Argument');
						}
					} else if (nextProductionMode === 'llm-derived') {
						const violatingCount = await base.argument.count({
							where: args.where
								? { AND: [args.where, { confidence: 'verified' }] }
								: { confidence: 'verified' }
						});
						if (violatingCount > 0) {
							assertEpistemicInvariant('verified', 'llm-derived', 'Argument');
						}
					}
					return query(args);
				},
				async upsert({ args, query }) {
					assertCreateRecords(args.create, 'Argument');
					const updateData = args.update as Record<string, unknown>;
					const nextConfidence = extractStringField(updateData.confidence);
					const nextProductionMode = extractStringField(updateData.productionMode);
					if (nextConfidence !== undefined && nextProductionMode !== undefined) {
						assertEpistemicInvariant(nextConfidence, nextProductionMode, 'Argument');
					} else if (nextConfidence === 'verified') {
						const existing = await base.argument.findUnique({
							where: args.where,
							select: { productionMode: true }
						});
						assertEpistemicInvariant('verified', existing?.productionMode, 'Argument');
					} else if (nextProductionMode === 'llm-derived') {
						const existing = await base.argument.findUnique({
							where: args.where,
							select: { confidence: true }
						});
						assertEpistemicInvariant(existing?.confidence, 'llm-derived', 'Argument');
					}
					return query(args);
				}
			}
		}
	});

	return extended as unknown as PrismaClient;
}