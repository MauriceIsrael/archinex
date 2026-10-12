import { prisma } from '../prisma';
import { llmopsClient } from '../llmops/client';
import { getProjectFrameworks } from '../projects/frameworksDb';
import { coverageWarnings } from '$lib/domain/maturityRules';

/**
 * Conformité réglementaire des options d'un sujet, jugée par LLMOps (POST /api/knowledge/check) contre les
 * référentiels applicables à l'espace. LLMOps est déterministe : un verdict « violates » vient d'une clause
 * « exige / interdit » d'une règle. Seules les clauses validées par l'expert du domaine bloquent l'arbitrage ;
 * une clause encore en brouillon donne une alerte à vérifier.
 */
export interface ComplianceViolation {
	optionId: string;
	typedId: string;
	checkId: string | null;
	message: string;
	matchedTerms: string[];
	sourceRef: string | null;
	/** Clause validée par l'expert : bloque l'arbitrage tant que l'écart n'est pas accepté et justifié. */
	validated: boolean;
}

export interface SubjectCompliance {
	frameworks: string[];
	offline: boolean;
	violations: ComplianceViolation[];
	/** Règles applicables que LLMOps ne sait pas juger automatiquement (à vérifier par l'architecte). */
	unassessedCount: number;
	/** Référentiels applicables pas encore couverts par la base : alerte, jamais blocage. */
	coverageWarnings: string[];
}

interface RawVerdict {
	typed_id?: string;
	check_id?: string | null;
	verdict?: string;
	message?: string | null;
	matched_terms?: string[];
	source_ref?: string | null;
	check_status?: string | null;
}

/** Référentiels déclarés applicables à l'espace (stratégie de l'engagement, confirmée à la création). */
export async function getApplicableFrameworks(projectId: string): Promise<string[]> {
	const row = await prisma.engagement.findUnique({ where: { id: projectId }, select: { strategy: true } });
	try {
		const fws = JSON.parse(row?.strategy || '{}').applicableFrameworks;
		return Array.isArray(fws) ? fws.filter((f: unknown): f is string => typeof f === 'string' && f.length > 0) : [];
	} catch {
		return [];
	}
}

/** Déclare à LLMOps les référentiels applicables de l'espace ; sans effet bloquant si LLMOps est injoignable. */
export async function pushApplicableFrameworks(projectId: string, frameworks: string[]): Promise<string> {
	const res = await llmopsClient.setApplicableFrameworks(projectId, frameworks);
	if (res.status !== 'ok') console.warn(`[Conformité] Référentiels de ${projectId} non déclarés à LLMOps (${res.status}).`);
	return res.status;
}

export function toViolations(optionId: string, verdicts: RawVerdict[]): ComplianceViolation[] {
	return verdicts
		.filter((v) => v.verdict === 'violates' && v.typed_id)
		.map((v) => ({
			optionId,
			typedId: v.typed_id!,
			checkId: v.check_id ?? null,
			message: v.message || `Non conforme à ${v.typed_id}`,
			matchedTerms: v.matched_terms ?? [],
			sourceRef: v.source_ref ?? null,
			validated: String(v.check_status || '').toLowerCase() === 'validated'
		}));
}

/** Juge chaque option du sujet (ou seulement celles indiquées) contre les référentiels applicables. */
export async function checkSubjectCompliance(projectId: string, subjectId: string, optionIds?: string[]): Promise<SubjectCompliance> {
	const [subject, frameworks] = await Promise.all([
		prisma.subject.findUnique({ where: { id: subjectId }, include: { options: true } }),
		getApplicableFrameworks(projectId)
	]);
	if (!subject || subject.projectId !== projectId) throw new Error(`NOT_FOUND: sujet ${subjectId}`);

	const options = subject.options.filter((o) => !optionIds || optionIds.includes(o.id));
	let offline = false;
	let unassessedCount = 0;
	const violations: ComplianceViolation[] = [];
	for (const option of options) {
		const result = (await llmopsClient.checkOption({
			option: { id: option.id, title: option.title, summary: option.summary, kbRefs: JSON.parse(option.kbRefs || '[]') },
			subject: subject.name,
			domain: subject.domain || undefined,
			frameworks
		})) as unknown as { verdicts?: RawVerdict[]; offline?: boolean };
		if (result.offline) {
			offline = true;
			continue;
		}
		const verdicts = result.verdicts ?? [];
		unassessedCount = Math.max(unassessedCount, verdicts.filter((v) => v.verdict === 'unassessed').length);
		violations.push(...toViolations(option.id, verdicts));
	}
	const coverage = await getProjectFrameworks(projectId).catch(() => ({ frameworks: [] }));
	return { frameworks, offline, violations, unassessedCount, coverageWarnings: coverageWarnings(coverage.frameworks).map((w) => w.message) };
}
