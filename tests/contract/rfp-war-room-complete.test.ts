import { describe, expect, it } from 'vitest';
import {
	buildBuyerComplianceMatrix,
	exportBuyerComplianceMatrixCsv,
	exportBuyerComplianceMatrixMarkdown,
	parseBuyerQaWaveCsv,
	propagateAmendmentToDeliberation
} from '$lib/domain/rfpErrata';
import {
	evaluateEmergentBaselineGuards,
	scaffoldEmergentComponent
} from '$lib/domain/edp/emergentColdStart';
import {
	compareTopologyProfilesBom,
	computeDynamicBomFromHydration,
	exportBomToBpuCsv
} from '$lib/domain/edp/finopsBom';
import {
	evaluateInterLotCoSignatureGate,
	getInterLotContractStatus,
	signInterLotContract,
	type InterLotInterfaceContract
} from '$lib/domain/interLotCollaboration';
import { assembleRfpTechnicalMemo } from '$lib/domain/rfpNarrativeAssembler';
import { composeMultiAxisHydration } from '$lib/server/edp/refinementCoverage';
import { composeProjectLogicalTopology } from '$lib/domain/edp/logicalViews';
import { loadOntologyCatalog } from '$lib/server/edp/ontologyClient';
import type { EngagementBundle } from '$lib/domain/engagementBundle';
import type { Statement } from '$lib/types/epistemic';
import type { MaturitySubject } from '$lib/domain/maturityBoard';

function makeMinimalBundle(): EngagementBundle {
	return {
		schema_version: '1.0',
		exported_at: '2026-11-22T20:00:00Z',
		checksum: 'sha256-test-bundle-001',
		data: {
			engagement: {
				id: 'eng-1',
				title: 'Offre Plateforme Souveraine',
				status: 'active',
				created_at: '2026-11-01T10:00:00Z'
			},
			source_documents: [
				{ id: 'doc-cctp', title: 'CCTP Technique', sha256: 'abc123', imported_at: '2026-11-01T10:00:00Z' }
			],
			requirements: [
				{
					id: 'REQ-01',
					source_document_id: 'doc-cctp',
					title: 'Résilience multi-sites RPO=0',
					criticality: 'bloquant',
					disposition: 'deliberated',
					assertion_level: 'asserted'
				},
				{
					id: 'REQ-02',
					source_document_id: 'doc-cctp',
					title: 'Journalisation centralisée standard',
					criticality: 'majeur',
					disposition: 'evacuated',
					disposition_reason: 'Traité par le socle SIEM standard.',
					assertion_level: 'asserted'
				},
				{
					id: 'REQ-03',
					source_document_id: 'doc-cctp',
					title: 'Interface héritée optionnelle',
					criticality: 'info',
					disposition: 'deliberated',
					assertion_level: 'proposed'
				}
			],
			subjects: [
				{
					id: 'sub-resilience',
					title: 'Topologie Multi-DC',
					requirement_ids: ['REQ-01'],
					decision_ids: ['dec-resilience'],
					maturity_level: 'L3_decided'
				}
			],
			decisions: [
				{
					id: 'dec-resilience',
					subject_id: 'sub-resilience',
					decision: 'Topologie 3DC Actif-Actif',
					rationale: 'Garantit le quorum etcd et un RPO nul en perte de site.',
					compliance_status: 'Compliant'
				}
			],
			compliance: [],
			gaps: [],
			is_provisional: false,
			provisional_reasons: { unripe_subjects: [], open_conflicts: [] }
		}
	} as unknown as EngagementBundle;
}

describe('RFP War Room Suite (#443, #444, #446, #448)', () => {
	describe('Issue #443 — Vagues Q&R Acheteur / Errata CCTP & Matrice de Conformité', () => {
		it('parse une vague Q&R CSV et propage un amendement disruptif sur le DAG basedOn + Board', () => {
			const csv = [
				'clauseRef;question;answer;effect',
				'REQ-01;Le RPO=0 est-il exigé sur 3 sites ?;Oui, 3 datacenters actifs exigés.;modifies',
				'REQ-03;La clause REQ-03 est-elle maintenue ?;Clause annulée par addendum.;withdraws'
			].join('\n');

			const { amendments, errors } = parseBuyerQaWaveCsv(csv, 'Vague 2', 'bid-manager@org.local');
			expect(errors).toEqual([]);
			expect(amendments).toHaveLength(2);
			expect(amendments[0].effect).toBe('modifies');
			expect(amendments[1].effect).toBe('withdraws');

			const rootStmt: Statement = {
				id: 'S-100',
				section: '§3.1',
				triplet: { subject: 'sub-resilience', predicate: 'topology', value: '2dc-split' },
				justification: { basedOn: ['REQ-01'] },
				authority: { author: 'Lead', role: 'lead_architect', productionMode: 'human-authored' },
				maturity: { subjectLevel: 'L3_decided', confidence: 'verified' },
				revisability: { antecedents: ['REQ-01'] },
				status: 'active',
				createdAt: '2026-11-10T10:00:00Z',
				updatedAt: '2026-11-10T10:00:00Z'
			};
			const childStmt: Statement = {
				id: 'S-101',
				section: '§3.1',
				triplet: { subject: 'sub-resilience', predicate: 'storage_rf', value: 'RF=2' },
				justification: { basedOn: ['S-100'] },
				authority: { author: 'Lead', role: 'lead_architect', productionMode: 'human-authored' },
				maturity: { subjectLevel: 'L3_decided', confidence: 'verified' },
				revisability: { antecedents: ['S-100'] },
				status: 'active',
				createdAt: '2026-11-10T10:00:00Z',
				updatedAt: '2026-11-10T10:00:00Z'
			};
			const subjects: MaturitySubject[] = [
				{
					id: 'sub-resilience',
					name: 'Topologie Multi-DC',
					section_ref: '§3.1',
					level: 'L3_decided',
					requirement_ids: ['REQ-01'],
					blocking_count: 0,
					unlocks_count: 3,
					waiting_for_role: 'lead_architect',
					relative_effort: 'M',
					last_transition_date: '2026-11-20T10:00:00Z',
					stall_days: 2,
					is_stalled: false,
					dependent_subject_ids: []
				}
			];

			const result = propagateAmendmentToDeliberation({
				amendment: amendments[0],
				subjects,
				statements: [rootStmt, childStmt],
				drafts: {}
			});

			expect(result.impactedStatementIds).toContain('S-100');
			expect(result.impactedStatementIds).toContain('S-101');
			expect(result.demotedSubjectIds).toContain('sub-resilience');
			expect(result.staleEdpSubjectIds).toContain('sub-resilience');
			expect(result.updatedSubjects[0].level).toBe('L2_decomposed');
			expect(result.updatedStatements.find((s) => s.id === 'S-101')?.maturity.confidence).toBe('assumed');
		});

		it('construit et exporte la Matrice de Conformité Contractuelle (CSV & Markdown)', () => {
			const bundle = makeMinimalBundle();
			const { amendments } = parseBuyerQaWaveCsv(
				'REQ-03;Maintenue ?;Clause retirée.;withdraws',
				'Vague 1',
				'lead@org.local'
			);
			const rows = buildBuyerComplianceMatrix(bundle, amendments);

			expect(rows).toHaveLength(3);
			expect(rows[0].complianceStatus).toBe('Conforme');
			expect(rows[1].complianceStatus).toBe('Conforme (Standard)');
			expect(rows[2].complianceStatus).toBe('Retirée (Q&R)');

			const csv = exportBuyerComplianceMatrixCsv(rows);
			expect(csv).toContain('Réf. Clause;Document Source;Exigence');
			expect(csv).toContain('REQ-01');
			expect(csv).toContain('Retirée (Q&R)');

			const md = exportBuyerComplianceMatrixMarkdown(rows);
			expect(md).toContain('| `REQ-01` |');
			expect(md).toContain('**Conforme**');
		});
	});

	describe('Issue #444 — Cold Start Ontologique pour Briques Émergentes', () => {
		it('instancie un composant émergent conforme aux 6 garde-fous transverses et génère un candidat Porte G4', () => {
			const res = scaffoldEmergentComponent({
				name: 'analytics-portal',
				displayName: 'Portail Analytique Métier',
				archetypeId: 'web_api_service',
				externallyExposed: true,
				persistentStorage: true,
				handlesSensitiveData: true,
				requirementRefs: ['REQ-99']
			});

			expect(res.component.metadata.name).toBe('analytics-portal');
			expect(res.guardEvaluation.compliant).toBe(true);
			expect(res.guardEvaluation.checkedRulesCount).toBe(6);
			expect(res.guardEvaluation.appliedTrustDependencies).toEqual(
				expect.arrayContaining(['iam-keycloak', 'ingress-waf-proxy', 'siem-soc', 'vault-cluster'])
			);
			expect(res.g4Candidate.kind).toBe('new_asset');
			expect(res.g4Candidate.ontologyLeafSkeleton.urn).toBe(
				'urn:archinex:ontology:application-business:emergent:analytics-portal'
			);
		});

		it('détecte les violations de garde-fous transverses si les dépendances de confiance sont absentes', () => {
			const scaffolded = scaffoldEmergentComponent({
				name: 'raw-gateway',
				archetypeId: 'realtime_gateway'
			});
			(scaffolded.component.spec as any).dependsOn = [];

			const evalRes = evaluateEmergentBaselineGuards(scaffolded.component, {
				externallyExposed: true,
				handlesSensitiveData: true,
				trustDependencies: []
			});

			expect(evalRes.compliant).toBe(false);
			expect(evalRes.violations.map((v) => v.ruleId)).toEqual(
				expect.arrayContaining([
					'emergent.deny_unmanaged_secrets',
					'emergent.deny_missing_siem_observability',
					'emergent.deny_direct_unprotected_exposure'
				])
			);
		});
	});

	describe('Issue #446 — Moteur de Valorisation BOM / BPU Dynamique FinOps', () => {
		it('calcule CAPEX, OPEX, TCO, U de baie, kW et JH depuis l’inventaire hydraté et compare les profils Sylva', async () => {
			const catalog = await loadOntologyCatalog();
			const bindings = [
				{
					axisUrn: 'urn:archinex:ontology:axis:compute_substrate',
					urn: 'urn:archinex:ontology:infrastructure:server:baremetal',
					revision: 1
				}
			];
			const hydrated = composeMultiAxisHydration('sub-finops-1', bindings, catalog, {
				planningGranularity: 'capacity_sizing'
			});

			const bom = computeDynamicBomFromHydration({ hydrated, durationYears: 3 });
			expect(bom.planningStageLabel).toBe('Planned-Capacity');
			expect(bom.lines.length).toBeGreaterThan(0);
			expect(bom.totals.capexTotalEur).toBeGreaterThan(0);
			expect(bom.totals.tcoTotalEur).toBeGreaterThan(bom.totals.capexTotalEur);
			expect(bom.totals.rackUnitsTotal).toBeGreaterThan(0);

			const csv = exportBomToBpuCsv(bom);
			expect(csv).toContain('SKU;Catégorie;Désignation');
			expect(csv).toContain('TOTAL;');

			if (hydrated.sylva_twin_report) {
				const compared = compareTopologyProfilesBom(hydrated.sylva_twin_report, hydrated);
				expect(compared['3dc-active'].totals.capexTotalEur).toBeGreaterThan(0);
				expect(compared['2dc-witness'].totals.capexTotalEur).toBeGreaterThan(0);
				expect(compared['2dc-split'].totals.capexTotalEur).toBeGreaterThan(0);
			}
		});
	});

	describe('Issue #448 — Co-Signature Inter-Lots & Assembleur Narratif Mémoire Technique', () => {
		it('impose la double signature humaine par deux acteurs distincts avant le gel L4', () => {
			const baseContract: InterLotInterfaceContract = {
				id: 'IF-01',
				subjectId: 'sub-resilience',
				upstreamLot: 'Lot Réseau',
				downstreamLot: 'Lot Applicatif',
				interfaceBoundary: 'Passerelle API / Flux mTLS',
				hypothesisStatement: 'Le Lot Réseau fournit une terminaison mTLS avec latence < 5 ms.',
				requirementRefs: ['REQ-01']
			};

			expect(getInterLotContractStatus(baseContract)).toBe('pending_both');
			expect(evaluateInterLotCoSignatureGate([baseContract]).canFreeze).toBe(false);

			const afterUp = signInterLotContract(baseContract, {
				side: 'upstream',
				actorId: 'alice@org.local',
				actorRole: 'network_architect',
				isHuman: true
			});
			expect(getInterLotContractStatus(afterUp)).toBe('pending_downstream');

			// Interdiction d'auto-cosignature sur deux lots distincts
			expect(() =>
				signInterLotContract(afterUp, {
					side: 'downstream',
					actorId: 'alice@org.local',
					actorRole: 'lead_architect',
					isHuman: true
				})
			).toThrow(/Séparation des responsabilités inter-lots/);

			const coSigned = signInterLotContract(afterUp, {
				side: 'downstream',
				actorId: 'bob@org.local',
				actorRole: 'domain_expert',
				isHuman: true,
				comment: 'Latence validée pour le moteur applicatif.'
			});
			expect(getInterLotContractStatus(coSigned)).toBe('co_signed');
			expect(evaluateInterLotCoSignatureGate([coSigned]).canFreeze).toBe(true);
		});

		it('assemble le mémoire technique RFP sans dérive documentaire', async () => {
			const bundle = makeMinimalBundle();
			const catalog = await loadOntologyCatalog();
			const hydrated = composeMultiAxisHydration(
				'sub-resilience',
				[
					{
						urn: 'urn:archinex:ontology:infrastructure:server:baremetal',
						revision: 1
					}
				],
				catalog,
				{ planningGranularity: 'capacity_sizing' }
			);
			const bomReport = computeDynamicBomFromHydration({ hydrated });

			const coSignedContract = signInterLotContract(
				signInterLotContract(
					{
						id: 'IF-01',
						subjectId: 'sub-resilience',
						upstreamLot: 'Lot Réseau',
						downstreamLot: 'Lot Applicatif',
						interfaceBoundary: 'Passerelle API',
						hypothesisStatement: 'mTLS bout-en-bout',
						requirementRefs: ['REQ-01']
					},
					{ side: 'upstream', actorId: 'alice@org.local', actorRole: 'network_architect', isHuman: true }
				),
				{ side: 'downstream', actorId: 'bob@org.local', actorRole: 'domain_expert', isHuman: true }
			);

			const { amendments } = parseBuyerQaWaveCsv(
				'REQ-01;Le RPO=0 est-il confirmé ?;Confirmé sur 3 sites.;clarifies',
				'Vague 1',
				'lead@org.local'
			);
			const topology = composeProjectLogicalTopology(
				'eng-1',
				'prod',
				['dc1', 'dc2'],
				[],
				hydrated.resolved_components ?? [],
				hydrated.nautobot_planned_devices
			);

			const memo = assembleRfpTechnicalMemo({
				bundle,
				framing: {
					executiveSummary: 'Notre offre propose une architecture souveraine résiliente 3DC.',
					bidderOrganization: 'Consortium Architecture',
					deliveryMethodology: 'Livraison par jalons vérifiés dans Nautobot.'
				},
				amendments,
				bomReport,
				interLotContracts: [coSignedContract],
				topologyMermaid: topology.mermaid
			});

			expect(memo.isProvisional).toBe(false);
			expect(memo.sectionsCount).toBe(6);
			expect(memo.markdown).toContain('# Mémoire Technique — Offre Plateforme Souveraine');
			expect(memo.markdown).toContain('**SCELLÉ / OPPOSABLE**');
			expect(memo.markdown).toContain('Topologie 3DC Actif-Actif');
			expect(memo.markdown).toContain('Planned-Capacity');
			expect(memo.markdown).toContain('Cosigné (alice@org.local & bob@org.local)');

			// Vérification de la présence et du positionnement des diagrammes déterministes
			expect(memo.diagrams.executiveGovernanceMermaid).toContain('flowchart LR');
			expect(memo.diagrams.decisionDiagramsByDecisionId['dec-resilience']).toContain('flowchart TB');
			expect(memo.diagrams.qaImpactMermaid).toContain('flowchart LR');
			expect(memo.diagrams.interLotBoundariesMermaid).toContain('flowchart LR');
			expect(memo.diagrams.finopsCapacityMermaid).toContain('flowchart TB');
			expect(memo.diagrams.editorialRecommendations.length).toBeGreaterThan(0);
			expect(memo.markdown).toContain('### 1.1 Chaîne de Gouvernance & Traçabilité de l’Offre');
			expect(memo.markdown).toContain('### 1.2 Vues Éditoriales SVG Recommandées (Directeur Éditorial)');
			expect(memo.markdown).toContain('### 3.1 Graphe de Propagation Causale des Vagues Q&R Acheteur');
			expect(memo.markdown).toContain('### 4.1 Topologie des Frontières & Co-Signatures Inter-Lots');
			expect(memo.markdown).toContain('### 5.1 Arbre Capacitaire & Décomposition FinOps (BOM)');
			expect(memo.markdown).toContain('### 5.2 Vue Logique Fonctionnelle & Flux');
			expect(memo.markdown).toContain('### 5.3 Vue Déploiement Multi-Datacenters & Pools');
			expect(memo.markdown).toContain('### 5.4 Vue Physique & Objets Planifiés CMDB (Nautobot)');
		});
	});
});
