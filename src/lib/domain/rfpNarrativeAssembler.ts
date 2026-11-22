/**
 * Assembleur Narratif du Mémoire Technique RFP (Issue #448).
 *
 * Combine sans dérive documentaire (*No Doc Drift*) les engagements techniques scellés
 * d'Archinex (`EngagementBundle`, amendements Q&R #443, BOM FinOps #446, contrats inter-lots #448)
 * avec la trame narrative commerciale (Executive Summary, méthodologie, planning, gouvernance).
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
}

export interface RfpTechnicalMemoOutput {
	markdown: string;
	isProvisional: boolean;
	provisionalWarnings: string[];
	sectionsCount: number;
	sourceChecksum: string;
}

/**
 * Assemble de manière 100 % déterministe le mémoire technique RFP en Markdown structuré.
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

	// Section 1 : Synthèse exécutive
	out.push('## 1. Synthèse Exécutive & Positionnement');
	out.push('');
	out.push(framing.executiveSummary.trim());
	out.push('');

	// Section 2 : Arbitrages d'Architecture Scellés
	out.push("## 2. Choix d'Architecture & Compromis Arbitrés");
	out.push('');
	if (d.decisions.length === 0) {
		out.push('_Aucune décision arbitrée enregistrée à ce stade._');
	} else {
		for (const dec of d.decisions) {
			out.push(`### ${dec.id} — ${dec.decision}`);
			out.push(`- **Motivation** : ${dec.rationale}`);
			if (dec.compliance_status) {
				out.push(
					`- **Position de conformité** : ${dec.compliance_status}${dec.compliance_rationale ? ` (${dec.compliance_rationale})` : ''}`
				);
			}
			out.push('');
		}
	}

	// Section 3 : Matrice de Conformité Contractuelle & Q&R Acheteur
	out.push('## 3. Matrice de Conformité Contractuelle & Intégration Q&R');
	out.push('');
	if (amendments.length > 0) {
		out.push(`_${amendments.length} amendement(s) Q&R acheteur intégré(s) dans la matrice ci-dessous._`);
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
	}
	out.push('');

	// Section 5 : Capacité Planifiée & Synthèse FinOps / BOM
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
	} else {
		out.push('_Valorisation BOM FinOps non rattachée à cet assemblage._');
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
		sourceChecksum: bundle.checksum
	};
}
