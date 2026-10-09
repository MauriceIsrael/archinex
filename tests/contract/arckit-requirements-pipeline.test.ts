import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { shredRfpTextToClauses } from '$lib/domain/rfpConfrontation';
import { runArcKitRequirementsAudit, categorizeRequirement } from '$lib/server/ingest/arckitRequirementsPipeline';

describe('ArcKit Requirements Ingestion & Audit Pipeline', () => {
	const samplePath = path.resolve(process.cwd(), 'examples/lumicc-noc/rfp-section4-noc.md');
	const sampleMarkdown = fs.readFileSync(samplePath, 'utf-8');

	it('should shred Section 4 LUMICC NOC into exactly 92 native clauses with REQ-Lot1 IDs', () => {
		const clauses = shredRfpTextToClauses(sampleMarkdown);
		expect(clauses.length).toBe(92);

		// First and last requirement checks
		expect(clauses[0].clauseRef).toBe('REQ-Lot1-191');
		expect(clauses[clauses.length - 1].clauseRef).toBe('REQ-Lot1-282');

		// All clauses must have valid REQ-Lot1 prefix
		for (const clause of clauses) {
			expect(clause.clauseRef).toMatch(/^REQ-Lot1-\d{3}$/);
			expect(clause.title).toBeDefined();
			expect(clause.title.length).toBeGreaterThan(5);
			expect(clause.text).toBeDefined();
			expect(clause.text.length).toBeGreaterThan(10);
		}

		// Verify criticality detection
		const req192 = clauses.find((c) => c.clauseRef === 'REQ-Lot1-192');
		expect(req192).toBeDefined();
		expect(req192?.criticality).toBe('bloquant'); // "shall operate 24x7x365"
	});

	it('should audit Section 4 NOC with ArcKit methodology: 100% traceability, 4 hard points, and business expert questions', () => {
		const clauses = shredRfpTextToClauses(sampleMarkdown);
		const auditReport = runArcKitRequirementsAudit(clauses);

		// 1. Total and disposition counts
		expect(auditReport.totalCount).toBe(92);
		expect(auditReport.evacuatedCount).toBe(56);
		expect(auditReport.deliberatedCount).toBe(32);
		expect(auditReport.clarificationCount).toBe(4);

		// Perfect sum: 56 + 32 + 4 = 92
		expect(auditReport.evacuatedCount + auditReport.deliberatedCount + auditReport.clarificationCount).toBe(92);

		// 2. Hard points extraction (atomic ADRs)
		expect(auditReport.hardPoints.length).toBe(4);
		const hardPointIds = auditReport.hardPoints.map((hp) => hp.id);
		expect(hardPointIds).toEqual(['ADR-NOC-01', 'ADR-NOC-02', 'ADR-NOC-03', 'ADR-NOC-04']);

		// 3. Every hard point must have expertQuestions for the Sachant Métier
		for (const hp of auditReport.hardPoints) {
			expect(hp.seed.expertQuestions).toBeDefined();
			expect(Array.isArray(hp.seed.expertQuestions)).toBe(true);
			expect(hp.seed.expertQuestions.length).toBeGreaterThanOrEqual(2);
			for (const q of hp.seed.expertQuestions) {
				expect(typeof q).toBe('string');
				expect(q.length).toBeGreaterThan(20);
			}
		}

		// 4. Traceability verification: every requirement has a clear disposition & rationale
		for (const req of auditReport.requirements) {
			expect(req.category).toBeDefined();
			if (req.disposition === 'evacuated') {
				expect(req.evacuationReason).toBeDefined();
				expect(req.evacuationReason?.length).toBeGreaterThan(10);
			} else if (req.disposition === 'clarification_needed') {
				expect(req.clarificationQuestion).toBeDefined();
			} else if (req.disposition === 'deliberated') {
				expect(req.linkedSubjectId).toBeDefined();
				expect(hardPointIds).toContain(req.linkedSubjectId);
			}
		}

		// 5. Clarifications list
		expect(auditReport.clarifications.length).toBe(4);
		expect(auditReport.clarifications.some((c) => c.clauseRef === 'REQ-Lot1-230')).toBe(true);
	});

	it('should gracefully handle non-NOC arbitrary clauses without injecting NOC hard points', () => {
		const arbitraryClauses = [
			{
				id: 'custom-1',
				clauseRef: 'REQ-CORE-001',
				title: 'Room layout and video wall equipment',
				text: 'The supplier shall provide furniture, operator desks, and video wall screens.',
				criticality: 'info' as const
			},
			{
				id: 'custom-2',
				clauseRef: 'REQ-CORE-002',
				title: 'Availability SLA 99.999%',
				text: 'The core platform availability target shall be 99.999% with disaster recovery geo-redundancy.',
				criticality: 'bloquant' as const
			}
		];

		const auditReport = runArcKitRequirementsAudit(arbitraryClauses);

		expect(auditReport.totalCount).toBe(2);
		expect(auditReport.hardPoints.length).toBe(0); // None of the NOC hardpoints matched
		expect(auditReport.categoryDistribution.FAC).toBe(1);
		expect(auditReport.categoryDistribution.NFR).toBe(1);
		expect(auditReport.requirements[0].disposition).toBe('evacuated');
		expect(auditReport.requirements[0].evacuationReason).toContain('Aménagement physique');
	});
});
