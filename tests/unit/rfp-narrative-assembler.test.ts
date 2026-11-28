import { describe, it, expect } from 'vitest';
import {
	assembleRfpTechnicalMemo,
	buildExecutiveGovernanceMermaid,
	buildFinOpsBomMermaid,
	buildInterLotBoundariesMermaid,
	buildQaAmendmentsImpactMermaid
} from '$lib/domain/rfpNarrativeAssembler';
import type { EngagementBundle } from '$lib/domain/engagementBundle';
import type { BuyerQaAmendment } from '$lib/domain/rfpErrata';
import type { InterLotInterfaceContract } from '$lib/domain/interLotCollaboration';
import type { DynamicBomReport } from '$lib/domain/edp/finopsBom';

function makeBundle(overrides: Partial<EngagementBundle['data']> = {}): EngagementBundle {
	return {
		schema_version: '1.0',
		exported_at: '2026-11-25T10:00:00Z',
		checksum: 'sha256-narrative-test',
		data: {
			engagement: {
				id: 'eng-branch',
				title: 'Offre Socle Cloud',
				status: 'active',
				created_at: '2026-11-01T08:00:00Z'
			},
			source_documents: [
				{ id: 'doc-1', title: 'CCTP Lot A', sha256: 'hash1', imported_at: '2026-11-01T08:00:00Z' }
			],
			requirements: [
				{
					id: 'REQ-01',
					source_document_id: 'doc-1',
					title: 'Haute disponibilité active',
					criticality: 'bloquant',
					disposition: 'deliberated',
					assertion_level: 'asserted'
				},
				{
					id: 'REQ-02',
					source_document_id: 'doc-1',
					title: '',
					criticality: 'majeur',
					disposition: 'deliberated',
					assertion_level: 'proposed'
				}
			],
			subjects: [
				{
					id: 'sub-1',
					title: 'Résilience "Active"\nMulti-Sites',
					requirement_ids: ['REQ-01', 'REQ-02'],
					decision_ids: ['dec-1'],
					maturity_level: 'L3_decided'
				}
			],
			decisions: [],
			compliance: [],
			gaps: [],
			is_provisional: false,
			provisional_reasons: { unripe_subjects: [], open_conflicts: [] },
			...overrides
		}
	} as unknown as EngagementBundle;
}

describe('rfpNarrativeAssembler — Couverture des branches et diagrammes déterministes', () => {
	describe('buildExecutiveGovernanceMermaid', () => {
		it('utilise les libellés par défaut lorsque planningStageLabel et tcoTotalEur sont absents', () => {
			const mermaid = buildExecutiveGovernanceMermaid({
				requirementsCount: 10,
				amendmentsCount: 0,
				subjectsCount: 3,
				decisionsCount: 2,
				interLotCount: 0
			});

			expect(mermaid).toContain('CMDB Planned-Capacity');
			expect(mermaid).toContain('Phase 5 · Consolidation & Réconciliation');
		});

		it('formate planningStageLabel et tcoTotalEur lorsqu’ils sont renseignés', () => {
			const mermaid = buildExecutiveGovernanceMermaid({
				requirementsCount: 12,
				amendmentsCount: 4,
				subjectsCount: 5,
				decisionsCount: 5,
				interLotCount: 2,
				planningStageLabel: 'Planned-Detailed',
				tcoTotalEur: 450000
			});

			expect(mermaid).toContain('CMDB Planned-Detailed');
			expect(mermaid).toContain('Phase 5 · BOM & FinOps');
			expect(mermaid).toContain('€');
		});
	});

	describe('buildQaAmendmentsImpactMermaid', () => {
		it('couvre les effets clarifies, modifies, withdraws, les sujets partagés et les clauses orphelines', () => {
			const amendments: BuyerQaAmendment[] = [
				{
					id: '01-qa',
					waveLabel: 'Vague 1',
					targetClauseRef: 'req-01',
					buyerQuestion: 'Question 1',
					buyerAnswer: 'Précision',
					effect: 'clarifies',
					recordedBy: 'lead@org.local',
					recordedAt: '2026-11-20T10:00:00Z'
				},
				{
					id: '---',
					waveLabel: 'Vague 2',
					targetClauseRef: 'REQ-01',
					buyerQuestion: 'Question 2',
					buyerAnswer: 'Modification majeure',
					effect: 'modifies',
					recordedBy: 'lead@org.local',
					recordedAt: '2026-11-21T10:00:00Z'
				},
				{
					id: 'QA-03',
					waveLabel: 'Vague 3',
					targetClauseRef: 'REQ-ORPHAN',
					buyerQuestion: 'Question 3',
					buyerAnswer: 'Retrait',
					effect: 'withdraws',
					recordedBy: 'lead@org.local',
					recordedAt: '2026-11-22T10:00:00Z'
				}
			];

			const subjects = makeBundle().data.subjects;
			const mermaid = buildQaAmendmentsImpactMermaid(amendments, subjects);

			expect(mermaid).toContain(':::clarify');
			expect(mermaid).toContain(':::disrupt');
			expect(mermaid).toContain(':::withdraw');
			expect(mermaid).toContain('|"Clarifie"|');
			expect(mermaid).toContain('|"Ré-arbitrage requis"|');
			// Le sujet ne doit être déclaré qu'une seule fois même si 2 amendements le ciblent
			const subjectDecls = mermaid.match(/sub_sub_1\["Sujet :/g) ?? [];
			expect(subjectDecls).toHaveLength(1);
			// Les guillemets et sauts de ligne sont échappés
			expect(mermaid).toContain("Résilience 'Active' Multi-Sites");
			// La clause orpheline apparaît bien sans arête sujet
			expect(mermaid).toContain('Clause REQ-ORPHAN');
		});
	});

	describe('buildInterLotBoundariesMermaid', () => {
		it('distingue co_signed, contested et pending tout en dédupliquant les nœuds de lots', () => {
			const contracts: InterLotInterfaceContract[] = [
				{
					id: 'IF-SIGNED',
					subjectId: 'sub-1',
					upstreamLot: 'Lot A',
					downstreamLot: 'Lot B',
					interfaceBoundary: 'API REST',
					hypothesisStatement: 'TLS 1.3',
					requirementRefs: ['REQ-01'],
					upstreamSignOff: { actorId: 'alice', actorRole: 'lead_architect', signedAt: '2026-11-20T10:00:00Z' },
					downstreamSignOff: { actorId: 'bob', actorRole: 'domain_expert', signedAt: '2026-11-20T11:00:00Z' }
				},
				{
					id: 'IF-CONTESTED',
					subjectId: 'sub-1',
					upstreamLot: 'Lot A',
					downstreamLot: 'Lot B',
					interfaceBoundary: 'Flux Temps Réel',
					hypothesisStatement: 'Latence < 5ms',
					requirementRefs: ['REQ-01'],
					contestedReason: 'Budget latence insuffisant'
				},
				{
					id: 'IF-PENDING',
					subjectId: 'sub-1',
					upstreamLot: 'Lot B',
					downstreamLot: 'Lot C',
					interfaceBoundary: 'Bus Événements',
					hypothesisStatement: 'Débit 10k msg/s',
					requirementRefs: ['REQ-02']
				}
			];

			const mermaid = buildInterLotBoundariesMermaid(contracts);

			expect(mermaid).toContain('[co_signed]"]:::signed');
			expect(mermaid).toContain('[contested]"]:::contested');
			expect(mermaid).toContain('[pending_both]"]:::pending');
			// Lot A et Lot B déclarés une seule fois
			expect(mermaid.match(/lot_Lot_A\["Lot A"\]:::lot/g)).toHaveLength(1);
			expect(mermaid.match(/lot_Lot_B\["Lot B"\]:::lot/g)).toHaveLength(1);
			expect(mermaid.match(/lot_Lot_C\["Lot C"\]:::lot/g)).toHaveLength(1);
		});
	});

	describe('buildFinOpsBomMermaid', () => {
		it('génère un arbre complet reliant ROOT -> lignes BOM -> TOT', () => {
			const bom: DynamicBomReport = {
				planningStageLabel: 'Planned-Capacity',
				profileId: '3dc-active',
				datacentersCount: 3,
				lines: [
					{
						sku: 'SRV-STD',
						category: 'compute',
						label: 'Serveur Compute',
						quantity: 6,
						unit: 'serveur',
						unitCapexEur: 12000,
						totalCapexEur: 72000,
						annualOpexEur: 14400,
						buildManDays: 12,
						rackUnits: 12,
						powerKw: 3.6
					}
				],
				totals: {
					capexHardwareAndLicenseEur: 72000,
					buildManDaysTotal: 12,
					buildServicesEur: 10800,
					capexTotalEur: 82800,
					opexAnnualEur: 14400,
					tcoDurationYears: 3,
					tcoTotalEur: 126000,
					rackUnitsTotal: 12,
					powerKwTotal: 3.6
				}
			} as unknown as DynamicBomReport;

			const mermaid = buildFinOpsBomMermaid(bom);
			expect(mermaid).toContain('flowchart TB');
			expect(mermaid).toContain('ROOT --> BOM_1');
			expect(mermaid).toContain('BOM_1 --> TOT');
			expect(mermaid).toContain('Serveur Compute');
		});
	});

	describe('assembleRfpTechnicalMemo — branches conditionnelles', () => {
		it('gère un dossier provisoire sans décisions, sans BOM, sans topologie, sans contrats ni options de framing', () => {
			const bundle = makeBundle({
				is_provisional: true,
				provisional_reasons: {
					unripe_subjects: ['sub-1'],
					open_conflicts: ['conflict-1']
				},
				gaps: [{ id: 'gap-1', blocking: true, description: 'Preuve manquante' } as any],
				decisions: []
			});

			const memo = assembleRfpTechnicalMemo({
				bundle,
				framing: {
					executiveSummary: '  Synthèse minimale.  '
				}
			});

			expect(memo.isProvisional).toBe(true);
			expect(memo.provisionalWarnings).toHaveLength(1);
			expect(memo.provisionalWarnings[0]).toContain('1 sujet(s) immature(s)');
			expect(memo.markdown).toContain('**PROVISOIRE**');
			expect(memo.markdown).toContain('> [!WARNING]');
			expect(memo.markdown).not.toContain('**Soumissionnaire**');
			expect(memo.markdown).toContain('_Aucune décision arbitrée enregistrée à ce stade._');
			expect(memo.markdown).toContain("_Aucun contrat d'interface inter-lots déclaré._");
			expect(memo.markdown).toContain('_Valorisation BOM FinOps non rattachée à cet assemblage._');
			expect(memo.markdown).toContain('Pilotage itératif avec réconciliation continue via Nautobot');
			expect(memo.diagrams.qaImpactMermaid).toBeNull();
			expect(memo.diagrams.interLotBoundariesMermaid).toBeNull();
			expect(memo.diagrams.finopsCapacityMermaid).toBeNull();
		});

		it('couvre les décisions avec/sans compliance_status, sujet parent manquant, contrats contestés/en attente et governanceAndSchedule', () => {
			const bundle = makeBundle({
				decisions: [
					{
						id: 'dec-partial',
						subject_id: 'sub-1',
						decision: 'Option Partielle',
						rationale: 'Compromis calendaire',
						compliance_status: 'Partially compliant',
						compliance_rationale: 'Dérogation temporaire validée'
					},
					{
						id: 'dec-no-rationale',
						subject_id: 'sub-missing',
						decision: 'Option Sans Sujet Parent',
						rationale: 'Arbitrage transverse',
						compliance_status: 'Compliant'
					},
					{
						id: 'dec-plain',
						subject_id: 'sub-missing',
						decision: 'Option Sans Statut Conformité',
						rationale: 'Décision purement technique'
					}
				] as any
			});

			const contracts: InterLotInterfaceContract[] = [
				{
					id: 'IF-C1',
					subjectId: 'sub-1',
					upstreamLot: 'Lot 1',
					downstreamLot: 'Lot 2',
					interfaceBoundary: 'BGP',
					hypothesisStatement: 'Peering redondé',
					requirementRefs: ['REQ-01'],
					contestedReason: 'ASN non défini'
				},
				{
					id: 'IF-P1',
					subjectId: 'sub-1',
					upstreamLot: 'Lot 2',
					downstreamLot: 'Lot 3',
					interfaceBoundary: 'OIDC',
					hypothesisStatement: 'Fédération SSO',
					requirementRefs: ['REQ-02'],
					upstreamSignOff: { actorId: 'lead@org.local', actorRole: 'lead_architect', signedAt: '2026-11-22T10:00:00Z' }
				}
			];

			const memo = assembleRfpTechnicalMemo({
				bundle,
				framing: {
					executiveSummary: 'Synthèse avec écarts et gouvernance.',
					governanceAndSchedule: 'Comité de pilotage hebdomadaire sur 16 semaines.'
				},
				interLotContracts: contracts
			});

			expect(memo.isProvisional).toBe(true);
			expect(memo.provisionalWarnings.some((w) => w.includes("contrat(s) d'interface inter-lots"))).toBe(true);
			expect(memo.markdown).toContain('Partially compliant (Dérogation temporaire validée)');
			expect(memo.markdown).toContain('- **Position de conformité** : Compliant');
			expect(memo.markdown).toContain('Contesté (ASN non défini)');
			expect(memo.markdown).toContain('En attente (pending_downstream)');
			expect(memo.markdown).toContain('Comité de pilotage hebdomadaire sur 16 semaines.');
			expect(Object.keys(memo.diagrams.decisionDiagramsByDecisionId)).toEqual([
				'dec-partial',
				'dec-no-rationale',
				'dec-plain'
			]);
		});

		it('inclut la section FinOps BOM et les 3 vues synchronisées topologyMermaid quand fournis', () => {
			const bundle = makeBundle();
			const bomReport = {
				planningStageLabel: 'Planned-Capacity',
				profileId: '2dc-witness',
				datacentersCount: 2,
				lines: [
					{
						sku: 'SRV-01',
						category: 'compute',
						label: 'Serveur Bare-Metal',
						quantity: 4,
						unit: 'serveur',
						unitCapexEur: 10000,
						totalCapexEur: 40000,
						annualOpexEur: 8000,
						buildManDays: 8,
						rackUnits: 8,
						powerKw: 2.4
					}
				],
				totals: {
					capexHardwareAndLicenseEur: 40000,
					buildManDaysTotal: 8,
					buildServicesEur: 7200,
					capexTotalEur: 47200,
					opexAnnualEur: 8000,
					tcoDurationYears: 3,
					tcoTotalEur: 71200,
					rackUnitsTotal: 8,
					powerKwTotal: 2.4
				}
			} as unknown as DynamicBomReport;

			const memo = assembleRfpTechnicalMemo({
				bundle,
				framing: {
					executiveSummary: 'Synthèse complète.',
					bidderOrganization: 'Groupement A',
					deliveryMethodology: 'Approche agile.'
				},
				bomReport,
				topologyMermaid: {
					logicalView: 'flowchart LR\n  A --> B',
					deploymentView: 'flowchart TB\n  DC1 --> DC2',
					physicalCmdbView: 'flowchart LR\n  RACK1 --> SRV1'
				}
			});

			expect(memo.isProvisional).toBe(false);
			expect(memo.markdown).toContain('### 5.1 Arbre Capacitaire & Décomposition FinOps (BOM)');
			expect(memo.markdown).toContain('### 5.2 Vue Logique Fonctionnelle & Flux');
			expect(memo.markdown).toContain('### 5.3 Vue Déploiement Multi-Datacenters & Pools');
			expect(memo.markdown).toContain('### 5.4 Vue Physique & Objets Planifiés CMDB (Nautobot)');
			expect(memo.diagrams.finopsCapacityMermaid).toContain('ROOT --> BOM_1');
		});
	});
});
