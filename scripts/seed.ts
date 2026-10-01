import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { EngagementProfile } from '../src/lib/domain/engagements';
import type { CorpusDocument } from '../src/lib/domain/corpus';

const globalPrisma = new PrismaClient();

function readJsonFile<T>(path: string): T | null {
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf-8')) as T;
	} catch (e) {
		console.warn(`[seed] Impossible de lire ${path}:`, e);
		return null;
	}
}

export async function seedProject(targetArg: string, client?: PrismaClient) {
	const prisma = client || globalPrisma;
	const projectDir = resolve(process.cwd(), targetArg);
	if (!existsSync(projectDir)) {
		throw new Error(`[seed] Dossier introuvable : ${projectDir}`);
	}

	const projectMeta = readJsonFile<Partial<EngagementProfile>>(resolve(projectDir, 'project.json'));
	if (!projectMeta || !projectMeta.id) {
		throw new Error(`[seed] Fichier project.json invalide ou manquant dans ${projectDir}`);
	}

	const subjects = readJsonFile<any[]>(resolve(projectDir, 'subjects.json')) || [];
	const drafts = readJsonFile<Record<string, any>>(resolve(projectDir, 'drafts.json')) || {};
	const statements = readJsonFile<any[]>(resolve(projectDir, 'statements.json')) || [];
	const dialogueMessages = readJsonFile<any[]>(resolve(projectDir, 'dialogue.json')) || [];

	// Documents de corpus : soit corpus.json soit dossier corpus/*.json
	let corpusDocuments: CorpusDocument[] = readJsonFile<CorpusDocument[]>(resolve(projectDir, 'corpus.json')) || [];
	const corpusSubdir = resolve(projectDir, 'corpus');
	if (existsSync(corpusSubdir)) {
		const files = readdirSync(corpusSubdir).filter((f) => f.endsWith('.json'));
		for (const file of files) {
			const doc = readJsonFile<CorpusDocument>(resolve(corpusSubdir, file));
			if (doc && !corpusDocuments.some((d) => d.id === doc.id)) {
				corpusDocuments.push(doc);
			}
		}
	}

	// 1. Sauvegarder les documents du corpus dans la base
	for (const doc of corpusDocuments) {
		await prisma.corpusDocument.upsert({
			where: { id: doc.id },
			create: {
				id: doc.id,
				title: doc.title,
				origin: doc.origin,
				category: doc.category,
				categoryLabel: doc.categoryLabel,
				sourceOrAuthor: doc.sourceOrAuthor,
				contributorRole: doc.contributorRole || null,
				version: doc.version,
				pageCount: doc.pageCount || 0,
				extractedClausesCount: doc.extractedClausesCount || doc.keyClauses?.length || 0,
				summary: doc.summary,
				isGlobalStandard: Boolean(doc.isGlobalStandard),
				engagementIds: JSON.stringify(doc.engagementIds || [projectMeta.id]),
				relatedSubjectIds: JSON.stringify(doc.relatedSubjectIds || []),
				keyIdeas: JSON.stringify(doc.keyIdeas || []),
				inducedRules: JSON.stringify(doc.inducedRules || []),
				keyClauses: JSON.stringify(doc.keyClauses || [])
			},
			update: {
				title: doc.title,
				origin: doc.origin,
				category: doc.category,
				categoryLabel: doc.categoryLabel,
				sourceOrAuthor: doc.sourceOrAuthor,
				contributorRole: doc.contributorRole || null,
				version: doc.version,
				pageCount: doc.pageCount || 0,
				extractedClausesCount: doc.extractedClausesCount || doc.keyClauses?.length || 0,
				summary: doc.summary,
				isGlobalStandard: Boolean(doc.isGlobalStandard),
				engagementIds: JSON.stringify(doc.engagementIds || [projectMeta.id]),
				relatedSubjectIds: JSON.stringify(doc.relatedSubjectIds || []),
				keyIdeas: JSON.stringify(doc.keyIdeas || []),
				inducedRules: JSON.stringify(doc.inducedRules || []),
				keyClauses: JSON.stringify(doc.keyClauses || [])
			}
		});
	}

	// 2. Sauvegarder l'engagement dans Prisma (idempotent upsert)
	const engagementData = {
		id: projectMeta.id,
		title: projectMeta.title || 'Projet sans titre',
		shortName: projectMeta.shortName || projectMeta.title || 'Projet',
		type: projectMeta.type || 'project_rfp',
		badge: projectMeta.badge || 'PROJET',
		description: projectMeta.description || '',
		defaultSubjectId: projectMeta.defaultSubjectId || subjects[0]?.id || null,
		defaultDocId: projectMeta.defaultDocId || corpusDocuments[0]?.id || null,
		status: projectMeta.status || 'active',
		strategy: JSON.stringify(projectMeta.strategy || {}),
		participants: JSON.stringify(projectMeta.participants || []),
		subjects: JSON.stringify(subjects),
		drafts: JSON.stringify(drafts),
		statements: JSON.stringify(statements),
		dialogueMessages: JSON.stringify(dialogueMessages)
	};

	await prisma.engagement.upsert({
		where: { id: projectMeta.id },
		create: engagementData,
		update: engagementData
	});

	console.log(`✅ [seed] Projet "${projectMeta.title}" (${projectMeta.id}) chargé avec succès :`);
	console.log(`   - ${subjects.length} sections / sujets de maturité`);
	console.log(`   - ${statements.length} énoncés formalisés`);
	console.log(`   - ${corpusDocuments.length} documents versés au corpus`);
	console.log(`   - ${dialogueMessages.length} messages dialectiques`);
}

async function main() {
	const targetArg = process.argv[2];
	if (!targetArg) {
		console.error('Usage: npm run seed -- examples/<projet>');
		console.error('Exemples disponibles :');
		console.error('  npm run seed -- examples/suse-telco-cloud');
		console.error('  npm run seed -- examples/cctp-rfp');
		process.exit(1);
	}

	await seedProject(targetArg);
}

// Run directly if invoked via CLI
if (process.argv[1] && (process.argv[1].endsWith('scripts/seed.ts') || process.argv[1].endsWith('scripts\\seed.ts'))) {
	main()
		.catch((e) => {
			console.error('[seed] Erreur critique :', e);
			process.exit(1);
		})
		.finally(async () => {
			await globalPrisma.$disconnect();
		});
}
