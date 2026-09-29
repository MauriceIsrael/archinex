import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface MigrationStats {
	projects: number;
	members: number;
	subjects: number;
	statements: number;
	antecedents: number;
}

export async function runMigration(options: { dryRun?: boolean; backupFile?: string }): Promise<MigrationStats> {
	const dryRun = options.dryRun ?? false;
	const backupFile = options.backupFile;

	console.log(`[Migration] Démarrage de la migration JSON Engagement -> Tables relationnelles`);
	console.log(`[Migration] Options : dryRun = ${dryRun}, backup = ${backupFile || 'aucun'}`);

	const engagements = await prisma.engagement.findMany();
	console.log(`[Migration] ${engagements.length} engagements trouvés dans la table 'engagements'`);

	if (backupFile) {
		const backupPath = path.resolve(process.cwd(), backupFile);
		const dir = path.dirname(backupPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(backupPath, JSON.stringify(engagements, null, 2), 'utf-8');
		console.log(`[Migration] Sauvegarde effectuée dans ${backupPath}`);
	}

	const stats: MigrationStats = {
		projects: 0,
		members: 0,
		subjects: 0,
		statements: 0,
		antecedents: 0
	};

	for (const eng of engagements) {
		console.log(`[Migration] Traitement de l'engagement ${eng.id} ("${eng.title}")`);

		const strategy = eng.strategy || '{}';
		const participants: any[] = eng.participants ? JSON.parse(eng.participants) : [];
		const subjects: any[] = eng.subjects ? JSON.parse(eng.subjects) : [];
		const statements: any[] = eng.statements ? JSON.parse(eng.statements) : [];

		if (!dryRun) {
			// 1. Projet
			await prisma.project.upsert({
				where: { id: eng.id },
				create: {
					id: eng.id,
					title: eng.title,
					shortName: eng.shortName,
					type: eng.type,
					badge: eng.badge,
					description: eng.description,
					status: eng.status || 'active',
					strategy,
					version: 1
				},
				update: {
					title: eng.title,
					shortName: eng.shortName,
					type: eng.type,
					badge: eng.badge,
					description: eng.description,
					status: eng.status || 'active',
					strategy
				}
			});
		}
		stats.projects++;

		// 2. Membres / Participants
		for (const p of participants) {
			const userId = p.id || p.userId;
			if (!userId) continue;
			const role = p.role || 'contributor';
			const domains = JSON.stringify(p.domains || []);

			if (!dryRun) {
				await prisma.projectMember.upsert({
					where: {
						projectId_userId: {
							projectId: eng.id,
							userId
						}
					},
					create: {
						projectId: eng.id,
						userId,
						role,
						domains
					},
					update: {
						role,
						domains
					}
				});
			}
			stats.members++;
		}

		// 3. Sujets
		for (const s of subjects) {
			const subjectId = s.id;
			if (!subjectId) continue;
			const sectionRef = s.section_ref || s.sectionRef || '§0.0';
			const name = s.name || 'Sujet sans titre';
			const domain = s.domain || 'general';
			const problemStatement = s.problemStatement || s.problem_statement || '';
			const maturityLevel = s.level || s.maturityLevel || 'L0_named';
			const deliberationStatus = s.deliberationStatus || 'open';
			const waitingForRole = s.waiting_for_role || s.waitingForRole || 'lead_architect';
			const relativeEffort = s.relative_effort || s.relativeEffort || 'M';
			const blockingCount = s.blocking_count ?? s.blockingCount ?? 0;
			const unlocksCount = s.unlocks_count ?? s.unlocksCount ?? 0;

			if (!dryRun) {
				await prisma.subject.upsert({
					where: { id: subjectId },
					create: {
						id: subjectId,
						projectId: eng.id,
						sectionRef,
						name,
						domain,
						problemStatement,
						maturityLevel,
						deliberationStatus,
						waitingForRole,
						relativeEffort,
						blockingCount,
						unlocksCount,
						version: 1
					},
					update: {
						sectionRef,
						name,
						domain,
						problemStatement,
						maturityLevel,
						deliberationStatus,
						waitingForRole,
						relativeEffort,
						blockingCount,
						unlocksCount
					}
				});
			}
			stats.subjects++;
		}

		// 4. Énoncés (Statements)
		for (const stmt of statements) {
			const stmtId = stmt.id;
			if (!stmtId) continue;

			const subjectId = stmt.subjectId || null;
			const section = stmt.section || '§0.0';
			const subjectRef = stmt.triplet?.subject || stmt.subjectRef || 'system';
			const predicate = stmt.triplet?.predicate || stmt.predicate || 'requires';
			const value = String(stmt.triplet?.value ?? stmt.value ?? '');
			const unit = stmt.triplet?.unit || stmt.unit || null;
			const basedOn = JSON.stringify(stmt.justification?.basedOn || stmt.basedOn || []);
			const appliedRule = stmt.justification?.appliedRule || stmt.appliedRule || null;
			const author = stmt.authority?.author || stmt.author || 'system';
			const role = stmt.authority?.role || stmt.role || 'lead_architect';
			const productionMode = stmt.authority?.productionMode || stmt.productionMode || 'human-authored';
			const confidence = stmt.maturity?.confidence || stmt.confidence || 'assumed';
			const subjectLevel = stmt.maturity?.subjectLevel || stmt.subjectLevel || 'L1_framed';
			const consequences = stmt.revisability?.consequencesIfInvalidated || stmt.consequences || null;
			const status = stmt.status || 'active';

			if (!dryRun) {
				await prisma.statement.upsert({
					where: { id: stmtId },
					create: {
						id: stmtId,
						projectId: eng.id,
						subjectId,
						section,
						subjectRef,
						predicate,
						value,
						unit,
						basedOn,
						appliedRule,
						author,
						role,
						productionMode,
						confidence,
						subjectLevel,
						consequences,
						status,
						version: 1
					},
					update: {
						subjectId,
						section,
						subjectRef,
						predicate,
						value,
						unit,
						basedOn,
						appliedRule,
						author,
						role,
						productionMode,
						confidence,
						subjectLevel,
						consequences,
						status
					}
				});
			}
			stats.statements++;

			// Antécédents
			const antecedentList: string[] = stmt.revisability?.antecedents || stmt.antecedentIds || [];
			for (const antId of antecedentList) {
				if (!dryRun) {
					// On vérifie que l'antécédent existe avant de créer le lien de clé étrangère
					const exists = await prisma.statement.findUnique({ where: { id: antId } });
					if (exists) {
						await prisma.statementAntecedent.upsert({
							where: {
								statementId_antecedentId: {
									statementId: stmtId,
									antecedentId: antId
								}
							},
							create: {
								statementId: stmtId,
								antecedentId: antId
							},
							update: {}
						});
						stats.antecedents++;
					}
				} else {
					stats.antecedents++;
				}
			}
		}
	}

	console.log(`[Migration] Terminée avec succès ! Statistiques :`, stats);
	return stats;
}

// Exécution directe CLI
if (process.argv[1] && process.argv[1].endsWith('migrate-json-engagements.ts')) {
	const args = process.argv.slice(2);
	const dryRun = args.includes('--dry-run');
	const backupIndex = args.indexOf('--backup');
	const backupFile = backupIndex !== -1 ? args[backupIndex + 1] : undefined;

	runMigration({ dryRun, backupFile })
		.then(() => {
			process.exit(0);
		})
		.catch((err) => {
			console.error(`[Migration] Erreur fatale :`, err);
			process.exit(1);
		});
}
