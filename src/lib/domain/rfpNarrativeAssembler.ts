/**
 * Assembleur Narratif & Visuel du Mémoire Technique RFP (Issue #448).
 *
 * Combine sans dérive documentaire (*No Doc Drift*) les engagements techniques scellés
 * d'Archinex (`EngagementBundle`, amendements Q&R #443, BOM FinOps #446, contrats inter-lots #448)
 * avec la trame narrative commerciale et injecte à chaque section le diagramme déterministe
 * pertinent (`DecisionDiagramModel`, Graphe d'impact Q&R, Topologie Inter-Lots, Vues Logique /
 * Déploiement / CMDB Planned et Directeur Éditorial SVG).
 */

import type { EngagementBundle } from './engagementBundle';
import {
	buildBuyerComplianceMatrix,
	exportBuyerComplianceMatrixMarkdown,
	type BuyerQaAmendment
} from './rfpErrata';
import type { DynamicBomReport } from './edp/finopsBom';
import {
	evaluateInterLotCoSignatureGate,
	getInterLotContractStatus,
	type InterLotInterfaceContract
} from './interLotCollaboration';
import {
	buildDecisionDiagramModel,
	projectDecisionModelToMermaid
} from './decisionDiagramModel';
import {
	recommendEditorialViews,
	type EditorialViewRecommendation
} from './editorialSvg/recommender';
import type { ProjectLogicalTopology } from './edp/logicalViews';

export interface RfpNarrativeFraming {
	executiveSummary: string;
	deliveryMethodology?: string;
	governanceAndSchedule?: string;
	bidderOrganization?: string;
}

export interface RfpTechnicalMemoInput {
	bundle: EngagementBundle;
	framing: RfpNarrativeFraming;
	amendments?: BuyerQaAmendment[];
	bomReport?: DynamicBomReport | null;
	interLotContracts?: InterLotInterfaceContract[];
	/** Les 3 vues Mermaid synchronisées (Vue Logique, Vue Déploiement Multi-DC, Vue Physique/CMDB) issues de `composeProjectLogicalTopology`. */
	topologyMermaid?: ProjectLogicalTopology['mermaid'] | null;
}

export interface RfpEmbeddedDiagramsSummary {
	executiveGovernanceMermaid: string;
	decisionDiagramsByDecisionId: Record<string, string>;
	qaImpactMermaid: string | null;
	interLotBoundariesMermaid: string | null;
	finopsCapacityMermaid: string | null;
	editorialRecommendations: EditorialViewRecommendation[];
}

export interface RfpTechnicalMemoOutput {
	markdown: string;
	isProvisional: boolean;
	provisionalWarnings: string[];
	sectionsCount: number;
	sourceChecksum: string;
	diagrams: RfpEmbeddedDiagramsSummary;
}

function safeNodeId(raw: string): string {
	const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '');
	return cleaned ? (/^[0-9]/.test(cleaned) ? `n_${cleaned}` : cleaned) : 'node';
}

function escMermaid(raw: string): string {
	return raw.replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Diagramme 1 (Section 1) : Chaîne de gouvernance et de couverture de bout en bout de l'offre.
 */
export function buildExecutiveGovernanceMermaid(params: {
	requirementsCount: number;
	amendmentsCount: number;
	subjectsCount: number;
	decisionsCount: number;
	interLotCount: number;
	planningStageLabel?: string;
	tcoTotalEur?: number;
}): string {
	const lines: string[] = [
		'flowchart LR',
		'    classDef phase fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,stroke-width:1.5px',
		'    classDef gate fill:#ecfdf5,stroke:#059669,color:#065f46,stroke-width:2px',
		'    classDef cmdb fill:#f0fdfa,stroke:#0d9488,color:#115e59,stroke-width:1.5px',
		`    P1["Phase 1 · Corpus CCTP (${params.requirementsCount} exig. / ${params.amendmentsCount} Q&R)"]:::phase`,
		`    P2["Phase 2 · Délibération (${params.subjectsCount} sujet(s))"]:::phase`,
		`    G3["Porte G3 · Arbitrages (${params.decisionsCount} décision(s))"]:::gate`,
		`    P3["Phase 3 · HLD & Interfaces (${params.interLotCount} contrat(s) inter-lots)"]:::phase`,
		`    P4["Phase 4 · CMDB ${escMermaid(params.planningStageLabel || 'Planned-Capacity')}"]:::cmdb`,
		params.tcoTotalEur !== undefined
			? `    P5["Phase 5 · BOM & FinOps (TCO ${params.tcoTotalEur.toLocaleString('fr-FR')} €)"]:::gate`
			: '    P5["Phase 5 · Consolidation & Réconciliation"]:::gate',
		'    P1 --> P2 --> G3 --> P3 --> P4 --> P5'
	];
	return lines.join('\n');
}

/**
 * Diagramme 3 (Section 3) : Propagation causale des vagues Q&R acheteur vers les clauses et sujets.
 */
export function buildQaAmendmentsImpactMermaid(
	amendments: BuyerQaAmendment[],
	subjects: EngagementBundle['data']['subjects']
): string {
	const lines: string[] = [
		'flowchart LR',
		'    classDef clarify fill:#ecfdf5,stroke:#059669,color:#065f46',
		'    classDef disrupt fill:#fffbeb,stroke:#d97706,color:#92400e,stroke-width:2px',
		'    classDef withdraw fill:#fef2f2,stroke:#dc2626,color:#991b1b,stroke-dasharray: 4 2',
		'    classDef subj fill:#eff6ff,stroke:#3b82f6,color:#1e3a8a'
	];

	const subjectsByReq = new Map<string, typeof subjects>();
	for (const s of subjects) {
		for (const rid of s.requirement_ids) {
			const norm = rid.trim().toLowerCase();
			subjectsByReq.set(norm, [...(subjectsByReq.get(norm) ?? []), s]);
		}
	}

	const declaredSubjects = new Set<string>();
	for (const am of amendments) {
		const amId = safeNodeId(`qa_${am.id}`);
		const clId = safeNodeId(`cl_${am.targetClauseRef}`);
		const cls =
			am.effect === 'withdraws'
				? 'withdraw'
				: am.effect === 'modifies'
					? 'disrupt'
					: 'clarify';
		lines.push(`    ${amId}["${escMermaid(am.id)} (${escMermaid(am.waveLabel)})"]:::${cls}`);
		lines.push(`    ${clId}["Clause ${escMermaid(am.targetClauseRef)}"]:::${cls}`);
		lines.push(`    ${amId} -->|"${escMermaid(am.effect)}"| ${clId}`);

		const linkedSubs = subjectsByReq.get(am.targetClauseRef.trim().toLowerCase()) ?? [];
		for (const sub of linkedSubs) {
			const sId = safeNodeId(`sub_${sub.id}`);
			if (!declaredSubjects.has(sId)) {
				declaredSubjects.add(sId);
				lines.push(`    ${sId}["Sujet : ${escMermaid(sub.title)}"]:::subj`);
			}
			const edgeLabel =
				am.effect === 'modifies' || am.effect === 'withdraws'
					? 'Ré-arbitrage requis'
					: 'Clarifie';
			lines.push(`    ${clId} -->|"${edgeLabel}"| ${sId}`);
		}
	}

	return lines.join('\n');
}

/**
 * Diagramme 4 (Section 4) : Frontières et statuts de co-signature entre lots.
 */
export function buildInterLotBoundariesMermaid(contracts: InterLotInterfaceContract[]): string {
	const lines: string[] = [
		'flowchart LR',
		'    classDef lot fill:#f8fafc,stroke:#475569,color:#0f172a,stroke-width:1.5px',
		'    classDef signed fill:#ecfdf5,stroke:#059669,color:#065f46,stroke-width:2px',
		'    classDef pending fill:#fffbeb,stroke:#d97706,color:#92400e,stroke-dasharray: 4 2',
		'    classDef contested fill:#fef2f2,stroke:#dc2626,color:#991b1b,stroke-width:2px'
	];

	const declaredLots = new Set<string>();
	for (const c of contracts) {
		const upId = safeNodeId(`lot_${c.upstreamLot}`);
		const downId = safeNodeId(`lot_${c.downstreamLot}`);
		const ifId = safeNodeId(`if_${c.id}`);
		const status = getInterLotContractStatus(c);
		const cls =
			status === 'co_signed'
				? 'signed'
				: status === 'contested'
					? 'contested'
					: 'pending';

		if (!declaredLots.has(upId)) {
			declaredLots.add(upId);
			lines.push(`    ${upId}["${escMermaid(c.upstreamLot)}"]:::lot`);
		}
		if (!declaredLots.has(downId)) {
			declaredLots.add(downId);
			lines.push(`    ${downId}["${escMermaid(c.downstreamLot)}"]:::lot`);
		}

		lines.push(
			`    ${ifId}["${escMermaid(c.id)} · ${escMermaid(c.interfaceBoundary)} [${status}]"]:::${cls}`
		);
		lines.push(`    ${upId} --> ${ifId} --> ${downId}`);
	}

	return lines.join('\n');
}

/**
 * Diagramme 5 (Section 5) : Synthèse visuelle de la capacité planifiée (CMDB Planned) et de la BOM FinOps.
 */
export function buildFinOpsBomMermaid(bom: DynamicBomReport): string {
	const lines: string[] = [
		'flowchart TB',
		'    classDef root fill:#f0fdfa,stroke:#0d9488,color:#115e59,stroke-width:2px',
		'    classDef item fill:#f8fafc,stroke:#64748b,color:#0f172a',
		'    classDef total fill:#ecfdf5,stroke:#059669,color:#065f46,stroke-width:2px',
		`    ROOT["CMDB ${escMermaid(bom.planningStageLabel)} · Profil ${escMermaid(bom.profileId)} (${bom.datacentersCount} DC)"]:::root`
	];

	bom.lines.forEach((line, idx) => {
		const nodeId = `BOM_${idx + 1}`;
		lines.push(
			`    ${nodeId}["${escMermaid(line.label)} : ${line.quantity} ${line.unit}(s) · CAPEX ${line.totalCapexEur.toLocaleString('fr-FR')} € · ${line.buildManDays} JH"]:::item`
		);
		lines.push(`    ROOT --> ${nodeId}`);
	});

	lines.push(
		`    TOT["Synthèse FinOps : CAPEX ${bom.totals.capexTotalEur.toLocaleString('fr-FR')} € · OPEX ${bom.totals.opexAnnualEur.toLocaleString('fr-FR')} €/an · TCO (${bom.totals.tcoDurationYears} ans) ${bom.totals.tcoTotalEur.toLocaleString('fr-FR')} € · ${bom.totals.rackUnitsTotal} U / ${bom.totals.powerKwTotal} kW"]:::total`
	);
	for (let idx = 0; idx < bom.lines.length; idx++) {
		lines.push(`    BOM_${idx + 1} --> TOT`);
	}

	return lines.join('\n');
}

/**
 * Assemble de manière 100 % déterministe le mémoire technique RFP en Markdown structuré,
 * enrichi des diagrammes pertinents à chaque section.
 */
export function assembleRfpTechnicalMemo(input: RfpTechnicalMemoInput): RfpTechnicalMemoOutput {
	const { bundle, framing } = input;
	const d = bundle.data;
	const amendments = input.amendments ?? [];
	const interLotContracts = input.interLotContracts ?? [];

	const coSigGate = evaluateInterLotCoSignatureGate(interLotContracts);
	const provisionalWarnings: string[] = [];
	if (d.is_provisional) {
		provisionalWarnings.push(
			`Dossier technique encore provisoire (${d.provisional_reasons.unripe_subjects.length} sujet(s) immature(s), ${d.provisional_reasons.open_conflicts.length} conflit(s) ouvert(s)).`
		);
	}
	if (!coSigGate.canFreeze) {
		provisionalWarnings.push(
			`${coSigGate.blockers.length} contrat(s) d'interface inter-lots non cosigné(s) ou contesté(s).`
		);
	}

	const isProvisional = provisionalWarnings.length > 0;
	const out: string[] = [];

	// Recommandations du Directeur Éditorial SVG basées sur la volumétrie réelle du dossier
	const editorialRecommendations = recommendEditorialViews({
		blockCount: Math.max(1, d.subjects.length),
		statementCount: d.decisions.length * 2 + d.requirements.length,
		unsettledCount: d.provisional_reasons.unripe_subjects.length + d.provisional_reasons.open_conflicts.length,
		requirementCount: d.requirements.length,
		missingVerificationCount: d.gaps.filter((g) => g.blocking).length,
		optionCount: Math.max(2, d.decisions.length),
		criteriaCount: 3,
		hasRetainedDecision: d.decisions.length > 0,
		hasAcceptedViolations: d.decisions.some((dec) => dec.compliance_status === 'Partially compliant'),
		hasDriftSignals: amendments.some((a) => a.effect === 'modifies' || a.effect === 'withdraws')
	});

	const executiveGovernanceMermaid = buildExecutiveGovernanceMermaid({
		requirementsCount: d.requirements.length,
		amendmentsCount: amendments.length,
		subjectsCount: d.subjects.length,
		decisionsCount: d.decisions.length,
		interLotCount: interLotContracts.length,
		planningStageLabel: input.bomReport?.planningStageLabel,
		tcoTotalEur: input.bomReport?.totals.tcoTotalEur
	});

	const decisionDiagramsByDecisionId: Record<string, string> = {};
	const qaImpactMermaid =
		amendments.length > 0 ? buildQaAmendmentsImpactMermaid(amendments, d.subjects) : null;
	const interLotBoundariesMermaid =
		interLotContracts.length > 0 ? buildInterLotBoundariesMermaid(interLotContracts) : null;
	const finopsCapacityMermaid = input.bomReport ? buildFinOpsBomMermaid(input.bomReport) : null;

	out.push(`# Mémoire Technique — ${d.engagement.title}`);
	out.push('');
	if (framing.bidderOrganization) {
		out.push(`> **Soumissionnaire** : ${framing.bidderOrganization}`);
	}
	out.push(
		`> **Empreinte d'intégrité Archinex** : \`${bundle.checksum}\` · **Statut** : ${isProvisional ? '**PROVISOIRE**' : '**SCELLÉ / OPPOSABLE**'}`
	);
	out.push('');

	if (isProvisional) {
		out.push('> [!WARNING]');
		for (const w of provisionalWarnings) {
			out.push(`> - ${w}`);
		}
		out.push('');
	}

	// Section 1 : Synthèse exécutive & Chaîne de gouvernance visuelle
	out.push('## 1. Synthèse Exécutive & Positionnement');
	out.push('');
	out.push(framing.executiveSummary.trim());
	out.push('');
	out.push('### 1.1 Chaîne de Gouvernance & Traçabilité de l’Offre');
	out.push('');
	out.push('```mermaid');
	out.push(executiveGovernanceMermaid);
	out.push('```');
	out.push('');
	out.push('### 1.2 Vues Éditoriales SVG Recommandées (Directeur Éditorial)');
	out.push('');
	for (const rec of editorialRecommendations.slice(0, 4)) {
		out.push(
			`- **${rec.label}** (\`${rec.viewId}\`, pertinence **${rec.score}/100**, audience *${rec.suggestedAudience}*) : ${rec.rationale}`
		);
	}
	out.push('');

	// Section 2 : Arbitrages d'Architecture Scellés & Schémas Causaux de Décision
	out.push("## 2. Choix d'Architecture & Compromis Arbitrés");
	out.push('');
	if (d.decisions.length === 0) {
		out.push('_Aucune décision arbitrée enregistrée à ce stade._');
		out.push('');
	} else {
		const reqById = new Map(d.requirements.map((r) => [r.id, r]));
		const subById = new Map(d.subjects.map((s) => [s.id, s]));

		for (const dec of d.decisions) {
			const parentSub = subById.get(dec.subject_id);
			const linkedReqs = (parentSub?.requirement_ids ?? [])
				.map((rid) => reqById.get(rid))
				.filter((r): r is NonNullable<typeof r> => Boolean(r));

			const diagramModel = buildDecisionDiagramModel({
				subjectId: dec.subject_id,
				subjectTitle: parentSub?.title || dec.subject_id,
				requirements: linkedReqs.map((r) => ({
					id: r.id,
					clauseRef: r.id,
					title: r.title || r.id,
					criticality: r.criticality
				})),
				options: [
					{
						id: `opt_${dec.id}`,
						title: dec.decision
					}
				],
				decision: {
					id: dec.id,
					retainedOptionId: `opt_${dec.id}`,
					rationale: dec.rationale
				}
			});
			const decisionMermaid = projectDecisionModelToMermaid(diagramModel);
			decisionDiagramsByDecisionId[dec.id] = decisionMermaid;

			out.push(`### ${dec.id} — ${dec.decision}`);
			out.push(`- **Motivation** : ${dec.rationale}`);
			if (dec.compliance_status) {
				out.push(
					`- **Position de conformité** : ${dec.compliance_status}${dec.compliance_rationale ? ` (${dec.compliance_rationale})` : ''}`
				);
			}
			out.push(`- **Empreinte du schéma causal** : \`${diagramModel.modelFingerprint}\``);
			out.push('');
			out.push('```mermaid');
			out.push(decisionMermaid);
			out.push('```');
			out.push('');
		}
	}

	// Section 3 : Matrice de Conformité Contractuelle & Q&R Acheteur
	out.push('## 3. Matrice de Conformité Contractuelle & Intégration Q&R');
	out.push('');
	if (amendments.length > 0 && qaImpactMermaid) {
		out.push(`_${amendments.length} amendement(s) Q&R acheteur intégré(s) dans la matrice et le graphe d'impact ci-dessous._`);
		out.push('');
		out.push('### 3.1 Graphe de Propagation Causale des Vagues Q&R Acheteur');
		out.push('');
		out.push('```mermaid');
		out.push(qaImpactMermaid);
		out.push('```');
		out.push('');
	}
	const complianceRows = buildBuyerComplianceMatrix(bundle, amendments);
	out.push(exportBuyerComplianceMatrixMarkdown(complianceRows).trim());
	out.push('');

	// Section 4 : Contrats d'Interface Inter-Lots & Co-Signatures
	out.push("## 4. Engagements d'Interface Inter-Lots & Co-Signatures");
	out.push('');
	if (interLotContracts.length === 0) {
		out.push("_Aucun contrat d'interface inter-lots déclaré._");
	} else {
		out.push('| Contrat | Périmètre | Interface | Hypothèse d’interface | Statut Co-Signature |');
		out.push('| :--- | :--- | :--- | :--- | :--- |');
		for (const c of interLotContracts) {
			const status = getInterLotContractStatus(c);
			const statusLabel =
				status === 'co_signed'
					? `Cosigné (${c.upstreamSignOff?.actorId} & ${c.downstreamSignOff?.actorId})`
					: status === 'contested'
						? `Contesté (${c.contestedReason})`
						: `En attente (${status})`;
			out.push(
				`| \`${c.id}\` | ${c.upstreamLot} ↔ ${c.downstreamLot} | ${c.interfaceBoundary} | ${c.hypothesisStatement} | **${statusLabel}** |`
			);
		}
		if (interLotBoundariesMermaid) {
			out.push('');
			out.push('### 4.1 Topologie des Frontières & Co-Signatures Inter-Lots');
			out.push('');
			out.push('```mermaid');
			out.push(interLotBoundariesMermaid);
			out.push('```');
		}
	}
	out.push('');

	// Section 5 : Capacité Planifiée & Synthèse FinOps / BOM + 3 Vues Synchronisées
	out.push('## 5. Dimensionnement Planifié (CMDB Planned) & Synthèse FinOps');
	out.push('');
	if (input.bomReport) {
		const b = input.bomReport;
		out.push(`- **Stade de planification CMDB** : \`${b.planningStageLabel}\` (profil \`${b.profileId}\`, ${b.datacentersCount} datacenter(s))`);
		out.push(`- **CAPEX Matériel & Licences** : ${b.totals.capexHardwareAndLicenseEur.toLocaleString('fr-FR')} €`);
		out.push(`- **Intégration & Build** : ${b.totals.buildManDaysTotal} JH (${b.totals.buildServicesEur.toLocaleString('fr-FR')} €)`);
		out.push(`- **OPEX Annuel** : ${b.totals.opexAnnualEur.toLocaleString('fr-FR')} € / an`);
		out.push(`- **TCO (${b.totals.tcoDurationYears} ans)** : **${b.totals.tcoTotalEur.toLocaleString('fr-FR')} €**`);
		out.push(`- **Empreinte Datacenter** : ${b.totals.rackUnitsTotal} U · ${b.totals.powerKwTotal} kW`);
		if (finopsCapacityMermaid) {
			out.push('');
			out.push('### 5.1 Arbre Capacitaire & Décomposition FinOps (BOM)');
			out.push('');
			out.push('```mermaid');
			out.push(finopsCapacityMermaid);
			out.push('```');
		}
	} else {
		out.push('_Valorisation BOM FinOps non rattachée à cet assemblage._');
	}
	if (input.topologyMermaid) {
		out.push('');
		out.push('### 5.2 Vue Logique Fonctionnelle & Flux');
		out.push('');
		out.push('```mermaid');
		out.push(input.topologyMermaid.logicalView);
		out.push('```');
		out.push('');
		out.push('### 5.3 Vue Déploiement Multi-Datacenters & Pools');
		out.push('');
		out.push('```mermaid');
		out.push(input.topologyMermaid.deploymentView);
		out.push('```');
		out.push('');
		out.push('### 5.4 Vue Physique & Objets Planifiés CMDB (Nautobot)');
		out.push('');
		out.push('```mermaid');
		out.push(input.topologyMermaid.physicalCmdbView);
		out.push('```');
	}
	out.push('');

	// Section 6 : Méthodologie, Planning & Gouvernance
	out.push('## 6. Méthodologie de Réalisation, Planning & Gouvernance');
	out.push('');
	out.push(
		framing.deliveryMethodology?.trim() ||
			'Pilotage itératif avec réconciliation continue via Nautobot (Planned → Réalisé prouvé).'
	);
	out.push('');
	if (framing.governanceAndSchedule?.trim()) {
		out.push(framing.governanceAndSchedule.trim());
		out.push('');
	}

	return {
		markdown: out.join('\n'),
		isProvisional,
		provisionalWarnings,
		sectionsCount: 6,
		sourceChecksum: bundle.checksum,
		diagrams: {
			executiveGovernanceMermaid,
			decisionDiagramsByDecisionId,
			qaImpactMermaid,
			interLotBoundariesMermaid,
			finopsCapacityMermaid,
			editorialRecommendations
		}
	};
}
