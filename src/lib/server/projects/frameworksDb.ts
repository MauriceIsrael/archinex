import { prisma } from '../prisma';
import { doctrineService } from '../doctrine/doctrineService';
import type { FrameworkCoverageStatus } from '$lib/domain/maturityRules';
import type { FrameworkCoverage } from '$lib/types/llmops';

type CoverageLevel = 'covered' | 'partial' | 'missing' | 'unknown';

function overallOf(frameworks: FrameworkCoverageStatus[]): CoverageLevel {
	if (frameworks.length === 0) return 'unknown';
	if (frameworks.some((f) => f.status === 'missing')) return 'missing';
	if (frameworks.some((f) => f.status === 'partial')) return 'partial';
	if (frameworks.some((f) => f.status === 'unknown')) return 'unknown';
	return 'covered';
}

/**
 * Couverture réglementaire du projet selon LLMOps (référentiels déclarés applicables à l'engagement), recopiée
 * dans ProjectFramework pour servir de repli quand LLMOps est injoignable (Lot A4).
 */
export async function syncProjectFrameworkCoverage(
	projectId: string
): Promise<{
	frameworks: FrameworkCoverageStatus[];
	overall: CoverageLevel;
	offline: boolean;
}> {
	const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
	if (!project) {
		throw new Error(`Projet introuvable : ${projectId}`);
	}

	// L'engagement LLMOps porte l'identifiant du projet (jamais son titre).
	let coverage: FrameworkCoverage;
	try {
		coverage = await doctrineService.getFrameworkCoverage(projectId);
	} catch (err) {
		console.warn(`[FrameworksDb] Impossible de contacter LLMOps pour le projet ${projectId} :`, (err as any).message);
		return { frameworks: [], overall: 'unknown', offline: true };
	}
	if (coverage.offline) return { frameworks: [], overall: 'unknown', offline: true };

	const statuses: FrameworkCoverageStatus[] = [];
	for (const fw of coverage.frameworks ?? []) {
		const detail = JSON.stringify({
			required: fw.required,
			coveredCount: fw.covered_count,
			totalCount: fw.total_count,
			missingClauses: fw.missing_clauses || []
		});
		const checkedAt = new Date(coverage.checked_at || Date.now());
		await prisma.projectFramework.upsert({
			where: { projectId_framework: { projectId, framework: fw.name } },
			create: { projectId, framework: fw.name, coverageStatus: fw.status, coverageDetail: detail, checkedAt },
			update: { coverageStatus: fw.status, coverageDetail: detail, checkedAt }
		});
		statuses.push({
			frameworkId: fw.name,
			name: fw.name,
			status: fw.status,
			validatedCount: fw.covered_count,
			expectedCount: fw.total_count
		});
	}
	// Un référentiel retiré des applicables ne doit plus apparaître
	await prisma.projectFramework.deleteMany({
		where: { projectId, framework: { notIn: statuses.map((s) => s.frameworkId) } }
	});

	return { frameworks: statuses, overall: overallOf(statuses), offline: false };
}

/**
 * Couverture réglementaire du projet : LLMOps d'abord (elle évolue à chaque revue de référentiel),
 * la dernière copie enregistrée seulement si LLMOps est injoignable.
 */
export async function getProjectFrameworks(projectId: string): Promise<{
	frameworks: FrameworkCoverageStatus[];
	overall: CoverageLevel;
}> {
	try {
		const live = await syncProjectFrameworkCoverage(projectId);
		if (!live.offline) return { frameworks: live.frameworks, overall: live.overall };
	} catch {
		// projet absent des tables relationnelles ou LLMOps en erreur : repli sur la copie enregistrée
	}

	const stored = await prisma.projectFramework.findMany({
		where: { projectId },
		orderBy: { framework: 'asc' }
	});
	const frameworks: FrameworkCoverageStatus[] = stored.map((f) => {
		let detail: { coveredCount?: number; totalCount?: number } = {};
		try {
			detail = JSON.parse(f.coverageDetail || '{}');
		} catch {
			// détail illisible : statut seul
		}
		return {
			frameworkId: f.framework,
			name: f.framework,
			status: f.coverageStatus as CoverageLevel,
			validatedCount: detail.coveredCount,
			expectedCount: detail.totalCount
		};
	});
	return { frameworks, overall: overallOf(frameworks) };
}
