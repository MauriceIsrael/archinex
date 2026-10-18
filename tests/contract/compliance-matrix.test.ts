import { describe, it, expect } from 'vitest';
import {
	validateCompliancePosition,
	buildComplianceMatrix,
	renderComplianceMatrixMarkdown,
	renderComplianceMatrixCsv,
	COMPLIANCE_STATUSES,
	DECIDED_COMPLIANCE_STATUSES
} from '$lib/domain/complianceMatrix';
import { CreateDecisionSchema } from '$lib/schemas/decisionApiSchemas';
import { buildEngagementBundle, type EngagementBundle } from '$lib/domain/engagementBundle';
import { verifyEngagementBundle } from '$lib/domain/bundleVerifier';

describe('Matrice de Conformité Standardisée (Issue #118)', () => {
	describe('Règles de validation des statuts de conformité', () => {
		it('accepte Compliant sans réserve obligatoire', () => {
			const res = validateCompliancePosition('Compliant');
			expect(res.valid).toBe(true);
		});

		it('refuse Partially compliant ou Non-compliant sans justification substantielle', () => {
			const res1 = validateCompliancePosition('Partially compliant', '');
			expect(res1.valid).toBe(false);
			expect(res1.reason).toContain('justification ou réserve explicite');

			const res2 = validateCompliancePosition('Non-compliant', '1234');
			expect(res2.valid).toBe(false);

			const res3 = validateCompliancePosition('Partially compliant', 'Dispense accordée sous réserve de chiffrement TLS 1.3');
			expect(res3.valid).toBe(true);
		});

		it('valide la cohérence via CreateDecisionSchema (Zod)', () => {
			const invalid = CreateDecisionSchema.safeParse({
				retainedOptionId: 'opt-1',
				rejected: [{ optionId: 'opt-2', reason: 'Trop coûteux' }],
				rationale: 'Architecture modulaire retenue pour scalabilité',
				reversibility: 'costly',
				complianceStatus: 'Partially compliant',
				complianceRationale: ''
			});
			expect(invalid.success).toBe(false);

			const valid = CreateDecisionSchema.safeParse({
				retainedOptionId: 'opt-1',
				rejected: [{ optionId: 'opt-2', reason: 'Trop coûteux' }],
				rationale: 'Architecture modulaire retenue pour scalabilité',
				reversibility: 'costly',
				complianceStatus: 'Partially compliant',
				complianceRationale: 'Écart toléré temporairement en phase pilote'
			});
			expect(valid.success).toBe(true);
			if (valid.success) {
				expect(valid.data.complianceStatus).toBe('Partially compliant');
				expect(valid.data.complianceRationale).toBe('Écart toléré temporairement en phase pilote');
			}
		});
	});

	describe('Construction et Dérivation Déterministe de la Matrice', () => {
		function createSampleBundle(): EngagementBundle {
			return buildEngagementBundle({
				engagement: {
					id: 'test-engagement',
					title: 'Engagement Démonstrateur',
					language: 'fr',
					confidentiality: 'internal',
					client_label: 'Organisation Test'
				},
				sourceDocuments: [
					{
						id: 'src-1',
						kind: 'rfp',
						title: 'Cahier des Charges',
						language: 'fr',
						sha256: 'abc123456789'
					}
				],
				requirements: [
					{
						id: 'REQ-01',
						source_document_id: 'src-1',
						clause_ref: 'SEC-01',
						text: 'Authentification multifacteur obligatoire pour tous les accès distants.',
						language: 'fr',
						title: 'MFA Distant',
						criticality: 'bloquant',
						disposition: 'deliberated',
						assertion_level: 'asserted',
						provenance: { basis: 'human_validation', by: ['@lead-architect'], at: '2026-01-01T00:00:00Z' }
					},
					{
						id: 'REQ-02',
						source_document_id: 'src-1',
						clause_ref: 'SEC-02',
						text: 'Chiffrement au repos en AES-256 avec clé HSM dédiée.',
						language: 'fr',
						title: 'Chiffrement HSM',
						criticality: 'majeur',
						disposition: 'deliberated',
						assertion_level: 'asserted',
						provenance: { basis: 'human_validation', by: ['@lead-architect'], at: '2026-01-01T00:00:00Z' }
					},
					{
						id: 'REQ-03',
						source_document_id: 'src-1',
						clause_ref: 'LEG-01',
						text: 'Hébergement sur infrastructure mainframe historique dédiée.',
						language: 'fr',
						title: 'Mainframe hérité',
						criticality: 'bloquant',
						disposition: 'evacuated',
						disposition_reason: 'Remplacé par une architecture Cloud native souveraine.',
						assertion_level: 'asserted',
						provenance: { basis: 'human_validation', by: ['@lead-architect'], at: '2026-01-01T00:00:00Z' }
					},
					{
						id: 'REQ-04',
						source_document_id: 'src-1',
						clause_ref: 'PERF-01',
						text: 'Temps de réponse p99 inférieur à 50ms sous 10 000 RPS.',
						language: 'fr',
						title: 'Latence p99',
						criticality: 'info',
						disposition: 'clarification_needed',
						clarification_question: 'Préciser la volumétrie réseau associée.',
						assertion_level: 'proposed',
						provenance: { basis: 'ai_proposal', by: ['@model-1'], at: '2026-01-01T00:00:00Z' }
					}
				],
				subjects: [
					{
						id: 'SUBJ-IAM',
						title: 'Gestion des Identités et Accès',
						domains: ['security'],
						maturity: 'L3_decided',
						status: 'decided',
						requirement_ids: ['REQ-01'],
						decision_ids: ['DEC-IAM']
					},
					{
						id: 'SUBJ-CRYPTO',
						title: 'Cryptographie & Chiffrement des données',
						domains: ['security'],
						maturity: 'L3_decided',
						status: 'decided',
						requirement_ids: ['REQ-02'],
						decision_ids: ['DEC-CRYPTO']
					}
				],
				decisions: [
					{
						id: 'DEC-IAM',
						subject_id: 'SUBJ-IAM',
						status: 'validated',
						epistemic_status: 'validated',
						assertion_level: 'asserted',
						decision: 'Option retenue : Passerelle OpenID Connect avec FIDO2/WebAuthn',
						title: 'Passerelle OIDC FIDO2',
						rationale: 'Conformité complète aux exigences de sécurité NIST et ANSSI.',
						compliance_status: 'Compliant',
						provenance: { basis: 'human_validation', by: ['@lead-architect'], at: '2026-01-01T00:00:00Z' }
					},
					{
						id: 'DEC-CRYPTO',
						subject_id: 'SUBJ-CRYPTO',
						status: 'validated',
						epistemic_status: 'validated',
						assertion_level: 'asserted',
						decision: 'Option retenue : Chiffrement KMS Cloud managé avec BYOK',
						title: 'KMS Managé BYOK',
						rationale: 'Arbitrage budgétaire retenant KMS managé plutôt que HSM sur site.',
						compliance_status: 'Partially compliant',
						compliance_rationale: 'Clés gérées par KMS souverain avec rotation annuelle (dérogation HSM physique accordée)',
						provenance: { basis: 'human_validation', by: ['@lead-architect'], at: '2026-01-01T00:00:00Z' }
					}
				],
				statements: [],
				compliance: [
					{
						id: 'COMP-01',
						requirement_id: 'REQ-01',
						control_ref: 'NIS2-AUTH-01',
						epistemic_status: 'validated',
						assertion_level: 'asserted',
						implementation_statement: 'MFA FIDO2 systématique.',
						decision_ids: ['DEC-IAM'],
						provenance: { basis: 'human_validation', by: ['@lead-architect'], at: '2026-01-01T00:00:00Z' }
					}
				],
				gaps: [
					{
						id: 'GAP-REQ-04',
						kind: 'requirement_clarification',
						requirement_id: 'REQ-04',
						description: 'À clarifier auprès du donneur d ordre : Préciser la volumétrie réseau associée',
						blocking: false
					}
				],
				kbReferences: [{ ref: 'NIS2-AUTH-01', citable: true }]
			});
		}

		it('construit la matrice avec cohérence 100% sur les statuts et dérives', () => {
			const bundle = createSampleBundle();
			const matrix = buildComplianceMatrix(bundle);

			expect(matrix.title).toBe('Engagement Démonstrateur');
			expect(matrix.summary.total).toBe(4);
			expect(matrix.summary.compliant).toBe(1); // REQ-01
			expect(matrix.summary.partiallyCompliant).toBe(1); // REQ-02
			expect(matrix.summary.nonCompliant).toBe(1); // REQ-03 (évacuée)
			expect(matrix.summary.provisional).toBe(1); // REQ-04 (clarification_needed)

			// Vérification REQ-01 (Compliant)
			const row1 = matrix.rows.find((r) => r.clauseRef === 'SEC-01')!;
			expect(row1.status).toBe('Compliant');
			expect(row1.decisionRef).toBe('DEC-IAM');
			expect(row1.kbReferences).toContain('NIS2-AUTH-01');

			// Vérification REQ-02 (Partially compliant avec réserve)
			const row2 = matrix.rows.find((r) => r.clauseRef === 'SEC-02')!;
			expect(row2.status).toBe('Partially compliant');
			expect(row2.justification).toContain('dérogation HSM physique accordée');

			// Vérification REQ-03 (Non-compliant car évacuée)
			const row3 = matrix.rows.find((r) => r.clauseRef === 'LEG-01')!;
			expect(row3.status).toBe('Non-compliant');
			expect(row3.justification).toContain('Remplacé par une architecture Cloud');

			// Vérification REQ-04 (Provisional)
			const row4 = matrix.rows.find((r) => r.clauseRef === 'PERF-01')!;
			expect(row4.status).toBe('Provisional');
			expect(row4.isProvisional).toBe(true);
		});

		it('génère un rendu Markdown structuré avec tableau opposable', () => {
			const bundle = createSampleBundle();
			const matrix = buildComplianceMatrix(bundle);
			const md = renderComplianceMatrixMarkdown(matrix);

			expect(md).toContain('# Matrice de Conformité : Engagement Démonstrateur');
			expect(md).toContain('## Synthèse Exécutive de Conformité');
			expect(md).toContain('| Conformes (Compliant) | **1** |');
			expect(md).toContain('| Partiellement conformes (Partially compliant) | **1** |');
			expect(md).toContain('| Non conformes / Écartées (Non-compliant) | **1** |');
			expect(md).toContain('| Provisoires / En délibération (Provisional) | **1** |');
			expect(md).toContain('| `SEC-01`');
			expect(md).toContain('**Compliant**');
			expect(md).toContain('| `SEC-02`');
			expect(md).toContain('**Partially compliant**');
		});

		it('génère un export CSV conforme avec BOM UTF-8', () => {
			const bundle = createSampleBundle();
			const matrix = buildComplianceMatrix(bundle);
			const csv = renderComplianceMatrixCsv(matrix);

			expect(csv.startsWith('\uFEFF')).toBe(true);
			expect(csv).toContain('"Exigence ID","Clause","Titre Exigence"');
			expect(csv).toContain('"SEC-01"');
			expect(csv).toContain('"Compliant"');
			expect(csv).toContain('"SEC-02"');
			expect(csv).toContain('"Partially compliant"');
		});

		it('valide dans bundleVerifier que toute décision partiellement conforme comporte une justification', () => {
			const bundle = createSampleBundle();
			// Retirer la justification de la décision partiellement conforme
			bundle.data.decisions[1].compliance_rationale = '';
			bundle.data.decisions[1].rationale = '';

			const problems = verifyEngagementBundle(bundle);
			const complianceProblem = problems.find((p) => p.code === 'COMPLIANCE_UNJUSTIFIED');
			expect(complianceProblem).toBeDefined();
			expect(complianceProblem?.path).toContain('/data/decisions/1');
		});

		it('assembleEngagementBundle préserve le statut et la justification de conformité via consequences sans casser le schéma 1.1', async () => {
			const { assembleEngagementBundle } = await import('$lib/domain/bundleAssembly');
			const { requirementBundleId } = await import('$lib/domain/requirementAudit');
			const Ajv = (await import('ajv')).default;
			const addFormats = (await import('ajv-formats')).default;
			const { readFileSync } = await import('node:fs');

			const schema11 = JSON.parse(
				readFileSync(new URL('../fixtures/bundle/engagement_bundle.schema.1.1.json', import.meta.url), 'utf-8')
			);
			const ajv = new Ajv({ allErrors: true, strict: false });
			addFormats(ajv);
			const validate11 = ajv.compile(schema11);

			const sha = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
			const reqId = requirementBundleId(sha, 'REQ-A');

			const assembled = assembleEngagementBundle({
				project: { id: 'prj-test', title: 'Projet Assemble' },
				confidentiality: 'internal',
				now: new Date('2026-10-01T08:00:00Z'),
				sources: [
					{
						sha256: sha,
						title: 'Cahier',
						kind: 'rfp',
						language: 'fr',
						requirements: [
							{
								position: 0,
								clauseRef: 'REQ-A',
								title: 'Exigence Alpha',
								text: 'Texte Alpha',
								criticality: 'bloquant',
								proposedDisposition: 'deliberated',
								proposedBy: 'model:m1',
								proposedAt: new Date('2026-10-01T08:00:00Z'),
								decidedDisposition: 'deliberated',
								decidedBy: '@alice',
								decidedAt: new Date('2026-10-02T00:00:00Z')
							}
						]
					}
				],
				subjects: [
					{
						id: 'subj-1',
						sectionRef: '§1',
						name: 'Sujet Alpha',
						maturityLevel: 'L3_decided',
						requirementRefs: [reqId],
						options: [{ id: 'opt-1', title: 'Option 1' }],
						questions: [],
						decision: {
							id: 'dec-1',
							retainedOptionId: 'opt-1',
							rejected: [],
							rationale: 'Arbitrage standard.',
							complianceStatus: 'Partially compliant',
							complianceRationale: 'Dérogation temporaire accordée pour la phase pilote.',
							arbiterId: 'alice@example.com',
							decidedAt: new Date('2026-10-03T00:00:00Z')
						}
					}
				],
				statements: []
			});

			// 1. Doit respecter strictement le schéma 1.1 sans additionalProperties
			const isValid = validate11(assembled);
			expect(isValid).toBe(true);
			expect(validate11.errors ?? []).toEqual([]);

			// 2. Doit être vérifiable par bundleVerifier
			const problems = verifyEngagementBundle(assembled);
			expect(problems).toEqual([]);

			// 3. buildComplianceMatrix doit retrouver le statut et la justification
			const matrix = buildComplianceMatrix(assembled);
			expect(matrix.summary.partiallyCompliant).toBe(1);
			expect(matrix.rows[0].status).toBe('Partially compliant');
			expect(matrix.rows[0].justification).toBe('Dérogation temporaire accordée pour la phase pilote.');
		});
	});
});

