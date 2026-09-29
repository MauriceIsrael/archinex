import type { EngagementProfile, EngagementType, ProjectParticipant } from '$lib/domain/engagements';
import type { MaturityLevel, ArchitectRole } from '$lib/types/epistemic';
import type { CorpusDocument } from '$lib/domain/corpus';

export interface EngagementSizeMetric {
	id: string;
	title: string;
	shortName: string;
	badge: string;
	type: EngagementType;
	typeLabel: string;
	subjectsCount: number;
	effortScore: number;
	statementsCount: number;
	clausesCount: number;
	documentsCount: number;
	budget?: string;
	completionPct: number;
	stalledCount: number;
	blockingCount: number;
	participantsCount: number;
	participants: ProjectParticipant[];
	maturityCounts: Record<MaturityLevel, number>;
	targetDate?: string;
	financialImpactTotal: number; // in k€
	openConflictsCount: number;
}

export interface TeamMonopolizationMetric {
	role: ArchitectRole;
	roleLabel: string;
	shortRole: string;
	color: string;
	assignedSubjectsCount: number;
	effortPoints: number;
	blockingSubjectsCount: number;
	stalledSubjectsCount: number;
	participantsCount: number;
	activeParticipants: string[];
	engagementsInvolved: string[];
	workloadSharePct: number;
}

export interface KnowledgeGrowthPoint {
	date: string;
	formattedDate: string;
	documentTitle: string;
	category: string;
	totalDocuments: number;
	totalClauses: number;
	deltaClauses: number;
}

export interface KnowledgeCategoryDistribution {
	category: string;
	label: string;
	count: number;
	clausesCount: number;
	color: string;
}

export interface EpistemicAlert {
	id: string;
	engagementId: string;
	engagementShortName: string;
	subjectName: string;
	sectionRef: string;
	type: 'stalled' | 'conflict' | 'financial_overrun' | 'blocking_bottleneck';
	severity: 'critical' | 'warning' | 'info';
	title: string;
	description: string;
	assignedRole: ArchitectRole;
	extraBadge?: string;
}

export interface GlobalOverviewSummary {
	totalEngagements: number;
	engagementsByType: Record<EngagementType, number>;
	totalSubjects: number;
	totalEffortScore: number;
	averageCompletionPct: number;
	totalBudgetString: string;
	totalBudgetKiloEuros: number;
	totalStatements: number;
	totalClauses: number;
	totalKnowledgeDocuments: number;
	crossProjectReusePct: number;
	activeArchitectsCount: number;
	stalledSectionsCount: number;
	openConflictsCount: number;
	totalFinancialOverrunsKiloEuros: number;
	engagements: EngagementSizeMetric[];
	teams: TeamMonopolizationMetric[];
	knowledgeGrowth: KnowledgeGrowthPoint[];
	knowledgeCategories: KnowledgeCategoryDistribution[];
	epistemicAlerts: EpistemicAlert[];
}

export const ROLE_LABELS: Record<string, { label: string; short: string; color: string }> = {
	lead_architect: {
		label: 'Lead Architect (Stratégie & Arbitrage)',
		short: 'Lead Architect',
		color: '#8b5cf6' // Violet
	},
	infra_expert_architect: {
		label: 'Architecte Infra & Réseau (CNI, Temps Réel)',
		short: 'Infra & Réseau',
		color: '#0ea5e9' // Sky / Cyan
	},
	security_architect: {
		label: 'Architecte Sécurité (NIS2, PQC, SecNumCloud)',
		short: 'Sécurité & NIS2',
		color: '#10b981' // Emerald
	},
	domain_architect: {
		label: 'Architecte Métier & Normes (3GPP, FRMCS)',
		short: 'Métier & Normes',
		color: '#f59e0b' // Amber
	},
	data_architect: {
		label: 'Architecte Données & Lignage',
		short: 'Données',
		color: '#ec4899' // Pink
	}
};

export const ENGAGEMENT_TYPE_LABELS: Record<EngagementType, string> = {
	generic_blueprint: 'Socle Blueprint',
	project_rfp: 'Appel d’Offres (RFP)',
	audit_resilience: 'Audit de Résilience (NIS2)',
	poc_migration: 'POC & Migration'
};

const EFFORT_WEIGHTS: Record<string, number> = {
	S: 1,
	M: 2,
	L: 3,
	XL: 5
};

const CATEGORY_COLORS: Record<string, { label: string; color: string }> = {
	cctp: { label: 'CCTP Contractuels', color: '#3b82f6' },
	standard: { label: 'Standards & Normes (3GPP, ITU)', color: '#8b5cf6' },
	regulation: { label: 'Directives & Sécurité (ANSSI, NIS2)', color: '#10b981' },
	vendor_whitepaper: { label: 'Blueprints Éditeur (OS, Cloud)', color: '#06b6d4' },
	business_spec: { label: 'Spécifications Métier', color: '#f59e0b' },
	rfp_annex: { label: 'Annexes Techniques RFP', color: '#ec4899' },
	guideline: { label: 'Guides & Bonnes Pratiques', color: '#64748b' },
	benchmark: { label: 'Benchmarks & Mesures', color: '#84cc16' }
};

export const CANONICAL_ROLES: ArchitectRole[] = [
	'lead_architect',
	'infra_expert_architect',
	'security_architect',
	'domain_architect',
	'data_architect'
];

/**
 * Calcule l'ensemble des indicateurs pour la vue Overview Global
 */
export function computeGlobalOverview(
	engagements: EngagementProfile[],
	knowledgeBase: CorpusDocument[]
): GlobalOverviewSummary {
	const engagementsByType: Record<EngagementType, number> = {
		generic_blueprint: 0,
		project_rfp: 0,
		audit_resilience: 0,
		poc_migration: 0
	};

	let totalSubjects = 0;
	let totalEffortScore = 0;
	let totalStatements = 0;
	let totalClauses = 0;
	let stalledSectionsCount = 0;
	let openConflictsCount = 0;
	let totalFinancialOverrunsKiloEuros = 0;
	let totalBudgetKiloEuros = 0;

	const allParticipantsMap = new Map<string, ProjectParticipant>();
	const epistemicAlerts: EpistemicAlert[] = [];

	// Rôles tracking
	const roleWorkloadMap: Record<
		string,
		{
			assignedSubjectsCount: number;
			effortPoints: number;
			blockingSubjectsCount: number;
			stalledSubjectsCount: number;
			activeParticipants: Set<string>;
			engagementsInvolved: Set<string>;
		}
	> = {
		lead_architect: { assignedSubjectsCount: 0, effortPoints: 0, blockingSubjectsCount: 0, stalledSubjectsCount: 0, activeParticipants: new Set(), engagementsInvolved: new Set() },
		infra_expert_architect: { assignedSubjectsCount: 0, effortPoints: 0, blockingSubjectsCount: 0, stalledSubjectsCount: 0, activeParticipants: new Set(), engagementsInvolved: new Set() },
		security_architect: { assignedSubjectsCount: 0, effortPoints: 0, blockingSubjectsCount: 0, stalledSubjectsCount: 0, activeParticipants: new Set(), engagementsInvolved: new Set() },
		domain_architect: { assignedSubjectsCount: 0, effortPoints: 0, blockingSubjectsCount: 0, stalledSubjectsCount: 0, activeParticipants: new Set(), engagementsInvolved: new Set() },
		data_architect: { assignedSubjectsCount: 0, effortPoints: 0, blockingSubjectsCount: 0, stalledSubjectsCount: 0, activeParticipants: new Set(), engagementsInvolved: new Set() }
	};

	// 1. Analyse détaillée par engagement
	const engagementMetrics: EngagementSizeMetric[] = engagements.map((eng) => {
		engagementsByType[eng.type] = (engagementsByType[eng.type] || 0) + 1;

		const maturityCounts: Record<MaturityLevel, number> = {
			L0_named: 0,
			L1_framed: 0,
			L2_decomposed: 0,
			L3_decided: 0,
			L4_specified: 0,
			L5_archived: 0
		};

		let engEffort = 0;
		let engStalled = 0;
		let engBlocking = 0;
		let engFinancialCost = 0;
		let engConflicts = 0;

		eng.subjects.forEach((subj) => {
			totalSubjects++;
			maturityCounts[subj.level] = (maturityCounts[subj.level] || 0) + 1;

			const effortWeight = EFFORT_WEIGHTS[subj.relative_effort] || 2;
			engEffort += effortWeight;
			totalEffortScore += effortWeight;

			if (subj.is_stalled || subj.stall_days > 14) {
				engStalled++;
				stalledSectionsCount++;
				epistemicAlerts.push({
					id: `alert-stalled-${eng.id}-${subj.id}`,
					engagementId: eng.id,
					engagementShortName: eng.shortName,
					subjectName: subj.name,
					sectionRef: subj.section_ref,
					type: 'stalled',
					severity: subj.stall_days > 20 ? 'critical' : 'warning',
					title: `Stagnation : ${subj.stall_days} jours sans transition`,
					description: `La section ${subj.section_ref} est bloquée au stade ${subj.level}. Arbitrage requis de la part de l'expert.`,
					assignedRole: subj.waiting_for_role,
					extraBadge: `Stagnation ${subj.stall_days}j`
				});
			}

			if (subj.blocking_count > 0) {
				engBlocking += subj.blocking_count;
			}

			// Suivi par rôle
			const rStats = roleWorkloadMap[subj.waiting_for_role];
			if (rStats) {
				rStats.assignedSubjectsCount++;
				rStats.effortPoints += effortWeight;
				rStats.engagementsInvolved.add(eng.id);
				if (subj.blocking_count > 0) rStats.blockingSubjectsCount += subj.blocking_count;
				if (subj.is_stalled || subj.stall_days > 14) rStats.stalledSubjectsCount++;
			}

			// Analyse des drafts télégraphiques pour détecter surcoûts et conflits
			const draft = eng.drafts[subj.id];
			if (draft) {
				if (draft.conflit && draft.conflit.length > 0) {
					engConflicts += draft.conflit.length;
					openConflictsCount += draft.conflit.length;
					draft.conflit.forEach((c, idx) => {
						epistemicAlerts.push({
							id: `alert-conflict-${eng.id}-${subj.id}-${idx}`,
							engagementId: eng.id,
							engagementShortName: eng.shortName,
							subjectName: subj.name,
							sectionRef: subj.section_ref,
							type: 'conflict',
							severity: 'critical',
							title: `Conflit Ouvert : ${c.text.slice(0, 45)}…`,
							description: `${c.text} (Réf : ${c.opposing_reference || 'En séance'})`,
							assignedRole: subj.waiting_for_role,
							extraBadge: 'Arbitrage Requis'
						});
					});
				}

				if (draft.suppose) {
					draft.suppose.forEach((sup) => {
						if (sup.cost_hint) {
							const match = sup.cost_hint.match(/\+?(\d+)\s*k€/i);
							if (match) {
								const cost = parseInt(match[1], 10);
								engFinancialCost += cost;
								totalFinancialOverrunsKiloEuros += cost;
							}
						}
					});
				}

				if (draft.conflit) {
					draft.conflit.forEach((c) => {
						const match = c.text.match(/\+?(\d+)\s*k€/i);
						if (match) {
							const cost = parseInt(match[1], 10);
							engFinancialCost += cost;
							totalFinancialOverrunsKiloEuros += cost;
						}
					});
				}
			}
		});

		// Parsing du budget de l'engagement (ex: '2.4 M€' -> 2400 k€)
		if (eng.strategy?.budget) {
			const bMatch = eng.strategy.budget.match(/([\d.]+)\s*M€/i);
			if (bMatch) {
				totalBudgetKiloEuros += parseFloat(bMatch[1]) * 1000;
			} else {
				const kMatch = eng.strategy.budget.match(/(\d+)\s*k€/i);
				if (kMatch) totalBudgetKiloEuros += parseInt(kMatch[1], 10);
			}
		}

		// Participants
		const participants = eng.participants || [];
		participants.forEach((p) => {
			allParticipantsMap.set(p.id, p);
			if (roleWorkloadMap[p.role]) {
				roleWorkloadMap[p.role].activeParticipants.add(p.name);
				roleWorkloadMap[p.role].engagementsInvolved.add(eng.id);
			}
		});

		// Énoncés et clauses
		totalStatements += eng.statements.length;
		const engClauses = eng.corpusDocuments.reduce(
			(acc, d) => acc + (d.extractedClausesCount || d.keyClauses?.length || 0),
			0
		);
		totalClauses += engClauses;

		// Taux d'avancement / maturité
		const decidedCount =
			maturityCounts.L3_decided + maturityCounts.L4_specified + maturityCounts.L5_archived;
		const completionPct =
			eng.subjects.length > 0 ? Math.round((decidedCount / eng.subjects.length) * 100) : 0;

		return {
			id: eng.id,
			title: eng.title,
			shortName: eng.shortName,
			badge: eng.badge,
			type: eng.type,
			typeLabel: ENGAGEMENT_TYPE_LABELS[eng.type] || eng.type,
			subjectsCount: eng.subjects.length,
			effortScore: engEffort,
			statementsCount: eng.statements.length,
			clausesCount: engClauses,
			documentsCount: eng.corpusDocuments.length,
			budget: eng.strategy?.budget,
			completionPct,
			stalledCount: engStalled,
			blockingCount: engBlocking,
			participantsCount: participants.length,
			participants,
			maturityCounts,
			targetDate: eng.strategy?.targetDate,
			financialImpactTotal: engFinancialCost,
			openConflictsCount: engConflicts
		};
	});

	// 2. Équipes monopolisées (taux de charge et monopolisation)
	const teams: TeamMonopolizationMetric[] = CANONICAL_ROLES.map((role) => {
		const info = ROLE_LABELS[role] || {
			label: role,
			short: role,
			color: '#94a3b8'
		};
		const data = roleWorkloadMap[role] || {
			assignedSubjectsCount: 0,
			effortPoints: 0,
			blockingSubjectsCount: 0,
			stalledSubjectsCount: 0,
			activeParticipants: new Set<string>(),
			engagementsInvolved: new Set<string>()
		};
		const workloadSharePct =
			totalEffortScore > 0 ? Math.round((data.effortPoints / totalEffortScore) * 100) : 0;

		return {
			role,
			roleLabel: info.label,
			shortRole: info.short,
			color: info.color,
			assignedSubjectsCount: data.assignedSubjectsCount,
			effortPoints: data.effortPoints,
			blockingSubjectsCount: data.blockingSubjectsCount,
			stalledSubjectsCount: data.stalledSubjectsCount,
			participantsCount: data.activeParticipants.size,
			activeParticipants: Array.from(data.activeParticipants),
			engagementsInvolved: Array.from(data.engagementsInvolved),
			workloadSharePct
		};
	});

	// 3. Grossissement et dynamiques de la base de connaissance commune
	// Consolidation unique des documents du socle commun
	const uniqueDocsMap = new Map<string, CorpusDocument>();
	knowledgeBase.forEach((doc) => {
		uniqueDocsMap.set(doc.id, doc);
	});
	engagements.forEach((eng) => {
		eng.corpusDocuments.forEach((doc) => {
			if (!uniqueDocsMap.has(doc.id)) {
				uniqueDocsMap.set(doc.id, doc);
			}
		});
	});

	const uniqueDocs = Array.from(uniqueDocsMap.values());

	// Tri par date d'ajout pour reconstruire l'historique de grossissement
	const sortedDocs = [...uniqueDocs].sort((a, b) => {
		const dateA = a.addedDate || '2026-08-01';
		const dateB = b.addedDate || '2026-08-01';
		return dateA.localeCompare(dateB);
	});

	let runningDocsCount = 0;
	let runningClausesCount = 0;
	const knowledgeGrowth: KnowledgeGrowthPoint[] = [];

	sortedDocs.forEach((doc) => {
		runningDocsCount += 1;
		const clauses = doc.extractedClausesCount || doc.keyClauses?.length || 0;
		runningClausesCount += clauses;

		const d = doc.addedDate ? new Date(doc.addedDate) : new Date('2026-09-01');
		const formattedDate = d.toLocaleDateString('fr-FR', {
			day: '2-digit',
			month: 'short'
		});

		knowledgeGrowth.push({
			date: doc.addedDate || '2026-09-01',
			formattedDate,
			documentTitle: doc.title,
			category: doc.categoryLabel || doc.category,
			totalDocuments: runningDocsCount,
			totalClauses: runningClausesCount,
			deltaClauses: clauses
		});
	});

	// Répartition par catégorie
	const categoryCountMap = new Map<string, { count: number; clauses: number }>();
	uniqueDocs.forEach((doc) => {
		const cat = doc.category || 'other';
		const cur = categoryCountMap.get(cat) || { count: 0, clauses: 0 };
		const clauses = doc.extractedClausesCount || doc.keyClauses?.length || 0;
		categoryCountMap.set(cat, {
			count: cur.count + 1,
			clauses: cur.clauses + clauses
		});
	});

	const knowledgeCategories: KnowledgeCategoryDistribution[] = Array.from(
		categoryCountMap.entries()
	).map(([cat, val]) => {
		const catConfig = CATEGORY_COLORS[cat] || {
			label: cat.toUpperCase(),
			color: '#94a3b8'
		};
		return {
			category: cat,
			label: catConfig.label,
			count: val.count,
			clausesCount: val.clauses,
			color: catConfig.color
		};
	});

	// Facteur de réutilisation transverse (% de documents rattachés à au moins 2 projets ou socle global)
	const sharedDocsCount = uniqueDocs.filter(
		(d) => d.isGlobalStandard || (d.engagementIds && d.engagementIds.length > 1)
	).length;
	const crossProjectReusePct =
		uniqueDocs.length > 0 ? Math.round((sharedDocsCount / uniqueDocs.length) * 100) : 0;

	// Moyenne d'avancement
	const averageCompletionPct =
		engagementMetrics.length > 0
			? Math.round(
					engagementMetrics.reduce((acc, m) => acc + m.completionPct, 0) /
						engagementMetrics.length
			  )
			: 0;

	// Total Budget formaté
	const totalBudgetString =
		totalBudgetKiloEuros >= 1000
			? `${(totalBudgetKiloEuros / 1000).toFixed(1)} M€`
			: `${totalBudgetKiloEuros} k€`;

	return {
		totalEngagements: engagements.length,
		engagementsByType,
		totalSubjects,
		totalEffortScore,
		averageCompletionPct,
		totalBudgetString,
		totalBudgetKiloEuros,
		totalStatements,
		totalClauses: runningClausesCount,
		totalKnowledgeDocuments: uniqueDocs.length,
		crossProjectReusePct,
		activeArchitectsCount: allParticipantsMap.size,
		stalledSectionsCount,
		openConflictsCount,
		totalFinancialOverrunsKiloEuros,
		engagements: engagementMetrics,
		teams,
		knowledgeGrowth,
		knowledgeCategories,
		epistemicAlerts
	};
}
