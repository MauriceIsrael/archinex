import { prisma } from '../prisma';
import { doctrineService } from '../doctrine/doctrineService';
import type { FrameworkCoverageStatus } from '$lib/domain/maturityRules';
import type { FrameworkCoverage, FrameworkStatus } from '$lib/types/llmops';

/**
 * Service de gestion et synchronisation de la couverture réglementaire des projets (Lot A4).
 */
export async function syncProjectFrameworkCoverage(
	projectId: string
): Promise<{
	frameworks: FrameworkCoverageStatus[];
	overall: 'covered' | 'partial' | 'missing' | 'unknown';
	offline: boolean;
}> {
	const project = await prisma.project.findUnique({
		where: { id: projectId },
		include: { frameworks: true }
	});

	if (!project) {
		throw new Error(`Projet introuvable : ${projectId}`);
	}

	// Récupération de la couverture depuis LLMOps / Service de doctrine
	let coverage: FrameworkCoverage;
	try {
		coverage = await doctrineService.getFrameworkCoverage(project.title);
	} catch (err) {
		console.warn(`[FrameworksDb] Impossible de contacter LLMOps pour le projet ${projectId} :`, (err as any).message);
		coverage = {
			frameworks: [],
			overall_coverage: 'unknown',
			checked_at: new Date().toISOString(),
			offline: true
		};
	}

	const statuses: FrameworkCoverageStatus[] = [];

	// Mise à jour ou insertion dans la base locale (ProjectFramework)
	for (const fw of coverage.frameworks) {
		const status: 'covered' | 'partial' | 'missing' | 'unknown' = fw.status;
		const detail = JSON.stringify({
			required: fw.required,
			coveredCount: fw.covered_count,
			totalCount: fw.total_count,
			missingClauses: fw.missing_clauses || []
		});

		await prisma.projectFramework.upsert({
			where: {
				projectId_framework: {
					projectId,
					framework: fw.name
				}
			},
			create: {
				projectId,
				framework: fw.name,
				coverageStatus: status,
				coverageDetail: detail,
				checkedAt: new Date(coverage.checked_at || Date.now())
			},
			update: {
				coverageStatus: status,
				coverageDetail: detail,
				checkedAt: new Date(coverage.checked_at || Date.now())
			}
		});

		statuses.push({
			frameworkId: fw.name,
			name: fw.name,
			status
		});
	}

	return {
		frameworks: statuses,
		overall: coverage.overall_coverage,
		offline: !!coverage.offline
	};
}

/**
 * Récupère la liste des couvertures réglementaires d'un projet, et synchronise si vide.
 */
export async function getProjectFrameworks(projectId: string): Promise<{
	frameworks: FrameworkCoverageStatus[];
	overall: 'covered' | 'partial' | 'missing' | 'unknown';
}> {
	const stored = await prisma.projectFramework.findMany({
		where: { projectId },
		orderBy: { framework: 'asc' }
	});

	if (stored.length === 0) {
		// Tentative de synchronisation initiale
		try {
			const synced = await syncProjectFrameworkCoverage(projectId);
			return {
				frameworks: synced.frameworks,
				overall: synced.overall
			};
		} catch (e) {
			return { frameworks: [], overall: 'unknown' };
		}
	}

	const frameworks: FrameworkCoverageStatus[] = stored.map((f) => ({
		frameworkId: f.framework,
		name: f.framework,
		status: f.coverageStatus as 'covered' | 'partial' | 'missing' | 'unknown'
	}));

	let overall: 'covered' | 'partial' | 'missing' | 'unknown' = 'covered';
	if (frameworks.some((f) => f.status === 'missing')) {
		overall = 'missing';
	} else if (frameworks.some((f) => f.status === 'partial')) {
		overall = 'partial';
	} else if (frameworks.some((f) => f.status === 'unknown')) {
		overall = 'unknown';
	}

	return {
		frameworks,
		overall
	};
}
