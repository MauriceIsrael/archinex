import type { CheckClausesList, ComplianceFrameworkOverview } from '$lib/types/llmops';

export interface FrameworkClausesHealth {
	framework: string;
	/** Nombre de contrôles actifs recensés pour ce référentiel. */
	activeControlsCount: number;
	/** Nombre de contrôles disposant d'au moins une clause `checks:` validée et d'aucune clause en brouillon. */
	validatedControlsCount: number;
	/** Nombre de contrôles dont les clauses `checks:` sont en brouillon (`draft`) ou absentes (`none`). */
	unvalidatedControlsCount: number;
	/** Nombre de contrôles obligatoires dépourvus de toute clause `checks:` (`none`). */
	withoutClauseControlsCount: number;
	/** Nombre de clauses `checks:` à l'état `validated`. */
	validatedClausesCount: number;
	/** Nombre de clauses `checks:` à l'état `draft`. */
	draftClausesCount: number;
	/** Nombre de clauses `checks:` à l'état `rejected`. */
	rejectedClausesCount: number;
	/** Vrai si le référentiel possède au moins un contrôle actif et que tous ses contrôles ont leurs clauses validées. */
	isFullyValidated: boolean;
}

export interface KbClausesHealthSummary {
	offline: boolean;
	/** Référentiels analysés (référentiels applicables du projet si fournis, sinon l'ensemble des référentiels KB). */
	scopedFrameworks: string[];
	/** Nombre total de contrôles actifs sur le périmètre. */
	activeControlsCount: number;
	/** Nombre de contrôles actifs dont les clauses `checks:` sont validées. */
	validatedControlsCount: number;
	/** Nombre de contrôles ayant des clauses non validées (`draft` ou `none`) et qui ne seront pas évalués. */
	unvalidatedControlsCount: number;
	/** Nombre de contrôles obligatoires sans aucune clause `checks:` (`none`). */
	withoutClauseControlsCount: number;
	/** Nombre total de clauses `checks:` validées sur le périmètre. */
	validatedClausesCount: number;
	/** Nombre total de clauses `checks:` à l'état `draft` sur le périmètre. */
	draftClausesCount: number;
	/** Nombre total de clauses `checks:` à l'état `rejected` sur le périmètre. */
	rejectedClausesCount: number;
	/** Nombre de décisions de clauses en attente de publication scellée dans LLMOps. */
	pendingPublicationCount: number;
	/** Indique si une alerte de couverture / validation des clauses doit être affichée. */
	hasAlert: boolean;
	/** Référentiels applicables dépourvus de tout contrôle ou de toute clause validée dans LLMOps. */
	uncoveredFrameworks: string[];
	/** Statut synthétique de santé des clauses KB. */
	status: 'ok' | 'warning' | 'offline';
	/** Message d'alerte explicite destiné à l'interface. */
	alertMessage: string | null;
	/** Détail par référentiel. */
	byFramework: Record<string, FrameworkClausesHealth>;
}

export interface ComputeKbClausesHealthOptions {
	/** Codes des référentiels applicables au projet (ex. `['NIS2', 'RGPD']`). Si omis ou vide, agrège tous les référentiels. */
	applicableFrameworks?: string[];
	/** Vue d'ensemble optionnelle des référentiels de conformité (`/api/compliance/frameworks`). */
	frameworksOverview?: ComplianceFrameworkOverview[];
	/** Force l'état hors-ligne si LLMOps est injoignable. */
	offline?: boolean;
}

function normalizeFw(fw: string | null | undefined): string {
	const trimmed = (fw ?? '').trim().toUpperCase();
	return trimmed || 'DOCTRINE';
}

/**
 * Calcule l'indicateur de santé des contrôles et clauses vérifiables (`checks:`) de la KB LLMOps.
 *
 * Règle métier : tant que les clauses `checks:` d'un contrôle sont à l'état `draft`, `none` (sans clause)
 * ou non publiées, le juge déterministe ne lève aucun conflit réglementaire sur ce contrôle.
 */
export function computeKbClausesHealth(
	clausesList: CheckClausesList | null | undefined,
	options: ComputeKbClausesHealthOptions = {}
): KbClausesHealthSummary {
	const requestedFrameworks = (options.applicableFrameworks ?? [])
		.map((f) => f.trim().toUpperCase())
		.filter(Boolean);

	if (options.offline || (!clausesList && (!options.frameworksOverview || options.frameworksOverview.length === 0))) {
		return {
			offline: true,
			scopedFrameworks: requestedFrameworks,
			activeControlsCount: 0,
			validatedControlsCount: 0,
			unvalidatedControlsCount: 0,
			withoutClauseControlsCount: 0,
			validatedClausesCount: 0,
			draftClausesCount: 0,
			rejectedClausesCount: 0,
			pendingPublicationCount: 0,
			hasAlert: false,
			uncoveredFrameworks: [],
			status: 'offline',
			alertMessage: null,
			byFramework: {}
		};
	}

	const clauses = clausesList?.clauses ?? [];
	const mandatoryWithoutClause = clausesList?.mandatory_without_clause ?? [];
	const pendingPublicationCount = clausesList?.pending_publication ?? 0;

	// Regroupement par référentiel -> par actif (contrôle)
	const fwControlsMap = new Map<
		string,
		Map<string, { validated: number; draft: number; rejected: number; withoutClause: boolean }>
	>();
	const fwClauseCounts = new Map<string, { validated: number; draft: number; rejected: number }>();

	function ensureFw(fw: string) {
		if (!fwControlsMap.has(fw)) {
			fwControlsMap.set(fw, new Map());
		}
		if (!fwClauseCounts.has(fw)) {
			fwClauseCounts.set(fw, { validated: 0, draft: 0, rejected: 0 });
		}
	}

	for (const row of clauses) {
		const fw = normalizeFw(row.framework);
		ensureFw(fw);
		const controls = fwControlsMap.get(fw)!;
		const counts = fwClauseCounts.get(fw)!;

		const assetEntry = controls.get(row.asset_id) ?? {
			validated: 0,
			draft: 0,
			rejected: 0,
			withoutClause: false
		};

		if (row.status === 'validated') {
			assetEntry.validated += 1;
			counts.validated += 1;
		} else if (row.status === 'draft') {
			assetEntry.draft += 1;
			counts.draft += 1;
		} else if (row.status === 'rejected') {
			assetEntry.rejected += 1;
			counts.rejected += 1;
		}

		controls.set(row.asset_id, assetEntry);
	}

	for (const missing of mandatoryWithoutClause) {
		const fw = normalizeFw(missing.framework);
		ensureFw(fw);
		const controls = fwControlsMap.get(fw)!;
		const existing = controls.get(missing.asset_id);
		if (!existing) {
			controls.set(missing.asset_id, {
				validated: 0,
				draft: 0,
				rejected: 0,
				withoutClause: true
			});
		} else if (existing.validated === 0 && existing.draft === 0) {
			existing.withoutClause = true;
		}
	}

	// Consolidation avec frameworksOverview si fourni
	const overviewByFw = new Map<string, ComplianceFrameworkOverview>();
	for (const ov of options.frameworksOverview ?? []) {
		const fw = normalizeFw(ov.framework);
		ensureFw(fw);
		overviewByFw.set(fw, ov);
	}

	// S'assurer que tous les référentiels applicables demandés ont une entrée
	for (const reqFw of requestedFrameworks) {
		ensureFw(reqFw);
	}

	const byFramework: Record<string, FrameworkClausesHealth> = {};

	for (const [fw, controls] of fwControlsMap.entries()) {
		const clauseCounts = fwClauseCounts.get(fw) ?? { validated: 0, draft: 0, rejected: 0 };
		let activeControlsCount = 0;
		let validatedControlsCount = 0;
		let unvalidatedControlsCount = 0;
		let withoutClauseControlsCount = 0;

		for (const [, st] of controls.entries()) {
			activeControlsCount += 1;
			if (st.withoutClause || (st.validated === 0 && st.draft === 0)) {
				withoutClauseControlsCount += 1;
				unvalidatedControlsCount += 1;
			} else if (st.draft > 0 || st.validated === 0) {
				unvalidatedControlsCount += 1;
			} else {
				validatedControlsCount += 1;
			}
		}

		const ov = overviewByFw.get(fw);
		if (ov) {
			const ovPresent = Math.max(ov.present ?? 0, ov.control_count ?? 0);
			if (ovPresent > activeControlsCount) {
				const extraUnvalidated = ovPresent - activeControlsCount;
				activeControlsCount = ovPresent;
				unvalidatedControlsCount += extraUnvalidated;
				withoutClauseControlsCount += extraUnvalidated;
			}
		}

		const isFullyValidated =
			activeControlsCount > 0 &&
			unvalidatedControlsCount === 0 &&
			withoutClauseControlsCount === 0 &&
			clauseCounts.draft === 0 &&
			clauseCounts.validated > 0;

		byFramework[fw] = {
			framework: fw,
			activeControlsCount,
			validatedControlsCount,
			unvalidatedControlsCount,
			withoutClauseControlsCount,
			validatedClausesCount: clauseCounts.validated,
			draftClausesCount: clauseCounts.draft,
			rejectedClausesCount: clauseCounts.rejected,
			isFullyValidated
		};
	}

	const scopedFrameworks =
		requestedFrameworks.length > 0
			? requestedFrameworks
			: Object.keys(byFramework).sort();

	let activeControlsCount = 0;
	let validatedControlsCount = 0;
	let unvalidatedControlsCount = 0;
	let withoutClauseControlsCount = 0;
	let validatedClausesCount = 0;
	let draftClausesCount = 0;
	let rejectedClausesCount = 0;
	const uncoveredFrameworks: string[] = [];

	for (const fw of scopedFrameworks) {
		const stats = byFramework[fw];
		if (!stats || stats.activeControlsCount === 0 || stats.validatedClausesCount === 0) {
			if (requestedFrameworks.includes(fw) && (!stats || stats.activeControlsCount === 0)) {
				uncoveredFrameworks.push(fw);
			}
		}
		if (stats) {
			activeControlsCount += stats.activeControlsCount;
			validatedControlsCount += stats.validatedControlsCount;
			unvalidatedControlsCount += stats.unvalidatedControlsCount;
			withoutClauseControlsCount += stats.withoutClauseControlsCount;
			validatedClausesCount += stats.validatedClausesCount;
			draftClausesCount += stats.draftClausesCount;
			rejectedClausesCount += stats.rejectedClausesCount;
		}
	}

	const hasAlert =
		unvalidatedControlsCount > 0 ||
		draftClausesCount > 0 ||
		withoutClauseControlsCount > 0 ||
		pendingPublicationCount > 0 ||
		uncoveredFrameworks.length > 0;

	const alertParts: string[] = [];
	if (unvalidatedControlsCount > 0) {
		alertParts.push(
			`${unvalidatedControlsCount} contrôle${unvalidatedControlsCount > 1 ? 's' : ''} applicable${unvalidatedControlsCount > 1 ? 's' : ''} ${unvalidatedControlsCount > 1 ? 'ont' : 'a'} des clauses non validées (draft/none) et ne ${unvalidatedControlsCount > 1 ? 'seront' : 'sera'} pas évalué${unvalidatedControlsCount > 1 ? 's' : ''}`
		);
	} else if (draftClausesCount > 0) {
		alertParts.push(
			`${draftClausesCount} clause${draftClausesCount > 1 ? 's' : ''} checks: en brouillon (draft) ne ${draftClausesCount > 1 ? 'seront' : 'sera'} pas évaluée${draftClausesCount > 1 ? 's' : ''}`
		);
	}
	if (uncoveredFrameworks.length > 0) {
		alertParts.push(
			`aucun contrôle actif avec clause checks: publiée pour ${uncoveredFrameworks.join(', ')}`
		);
	}
	if (pendingPublicationCount > 0) {
		alertParts.push(
			`${pendingPublicationCount} décision${pendingPublicationCount > 1 ? 's' : ''} de clause en attente de publication scellée`
		);
	}

	const alertMessage = alertParts.length > 0 ? `${alertParts.join(' · ')}.` : null;

	return {
		offline: false,
		scopedFrameworks,
		activeControlsCount,
		validatedControlsCount,
		unvalidatedControlsCount,
		withoutClauseControlsCount,
		validatedClausesCount,
		draftClausesCount,
		rejectedClausesCount,
		pendingPublicationCount,
		hasAlert,
		uncoveredFrameworks,
		status: hasAlert ? 'warning' : 'ok',
		alertMessage,
		byFramework
	};
}

/**
 * Recalcule les totaux et le message d'alerte d'un résumé `KbClausesHealthSummary` existant
 * pour une nouvelle sélection de référentiels applicables (sans nouvel appel réseau).
 */
export function rescopeKbClausesHealth(
	base: KbClausesHealthSummary,
	applicableFrameworks: string[]
): KbClausesHealthSummary {
	if (base.offline) return base;

	const requested = applicableFrameworks
		.map((f) => f.trim().toUpperCase())
		.filter(Boolean);

	const byFramework: Record<string, FrameworkClausesHealth> = { ...base.byFramework };
	for (const fw of requested) {
		if (!byFramework[fw]) {
			byFramework[fw] = {
				framework: fw,
				activeControlsCount: 0,
				validatedControlsCount: 0,
				unvalidatedControlsCount: 0,
				withoutClauseControlsCount: 0,
				validatedClausesCount: 0,
				draftClausesCount: 0,
				rejectedClausesCount: 0,
				isFullyValidated: false
			};
		}
	}

	const scopedFrameworks =
		requested.length > 0 ? requested : Object.keys(byFramework).sort();

	let activeControlsCount = 0;
	let validatedControlsCount = 0;
	let unvalidatedControlsCount = 0;
	let withoutClauseControlsCount = 0;
	let validatedClausesCount = 0;
	let draftClausesCount = 0;
	let rejectedClausesCount = 0;
	const uncoveredFrameworks: string[] = [];

	for (const fw of scopedFrameworks) {
		const stats = byFramework[fw];
		if (requested.includes(fw) && (!stats || stats.activeControlsCount === 0)) {
			uncoveredFrameworks.push(fw);
		}
		if (stats) {
			activeControlsCount += stats.activeControlsCount;
			validatedControlsCount += stats.validatedControlsCount;
			unvalidatedControlsCount += stats.unvalidatedControlsCount;
			withoutClauseControlsCount += stats.withoutClauseControlsCount;
			validatedClausesCount += stats.validatedClausesCount;
			draftClausesCount += stats.draftClausesCount;
			rejectedClausesCount += stats.rejectedClausesCount;
		}
	}

	const hasAlert =
		unvalidatedControlsCount > 0 ||
		draftClausesCount > 0 ||
		withoutClauseControlsCount > 0 ||
		base.pendingPublicationCount > 0 ||
		uncoveredFrameworks.length > 0;

	const alertParts: string[] = [];
	if (unvalidatedControlsCount > 0) {
		alertParts.push(
			`${unvalidatedControlsCount} contrôle${unvalidatedControlsCount > 1 ? 's' : ''} applicable${unvalidatedControlsCount > 1 ? 's' : ''} ${unvalidatedControlsCount > 1 ? 'ont' : 'a'} des clauses non validées (draft/none) et ne ${unvalidatedControlsCount > 1 ? 'seront' : 'sera'} pas évalué${unvalidatedControlsCount > 1 ? 's' : ''}`
		);
	} else if (draftClausesCount > 0) {
		alertParts.push(
			`${draftClausesCount} clause${draftClausesCount > 1 ? 's' : ''} checks: en brouillon (draft) ne ${draftClausesCount > 1 ? 'seront' : 'sera'} pas évaluée${draftClausesCount > 1 ? 's' : ''}`
		);
	}
	if (uncoveredFrameworks.length > 0) {
		alertParts.push(
			`aucun contrôle actif avec clause checks: publiée pour ${uncoveredFrameworks.join(', ')}`
		);
	}
	if (base.pendingPublicationCount > 0) {
		alertParts.push(
			`${base.pendingPublicationCount} décision${base.pendingPublicationCount > 1 ? 's' : ''} de clause en attente de publication scellée`
		);
	}

	const alertMessage = alertParts.length > 0 ? `${alertParts.join(' · ')}.` : null;

	return {
		...base,
		scopedFrameworks,
		activeControlsCount,
		validatedControlsCount,
		unvalidatedControlsCount,
		withoutClauseControlsCount,
		validatedClausesCount,
		draftClausesCount,
		rejectedClausesCount,
		hasAlert,
		uncoveredFrameworks,
		status: hasAlert ? 'warning' : 'ok',
		alertMessage,
		byFramework
	};
}

