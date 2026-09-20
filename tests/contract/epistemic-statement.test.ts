import { describe, it, expect } from 'vitest';
import type { ContributionEnvelope, StatementTriplet } from '$lib/types/epistemic';
import {
	computeTripletSha256,
	validateInboundEnvelope
} from '$lib/validation/epistemicEnvelope';

describe('Epistemic Statement Contract Tests (Lot 1)', () => {
	const validTriplet: StatementTriplet = {
		subject: 'site-mcx-nord',
		predicate: 'has_property',
		value: 'holdover ≥ 30 j',
		unit: 'days'
	};

	const baseStatement = {
		id: 'ENG:nordwave-mcx-2027/S-0042',
		section: '§4.2',
		triplet: validTriplet,
		justification: {
			answersQuestion: 'Q-0007',
			basedOn: ['KH:ADR-0014@v1.2', 'S-0031'],
			appliedRule: 'holdover_from_tier_iv'
		},
		authority: {
			author: 'M. Israel',
			role: 'Network Architect',
			productionMode: 'human-authored' as const
		},
		maturity: {
			subjectLevel: 'L2_decomposed' as const,
			confidence: 'designed' as const
		},
		revisability: {
			antecedents: ['S-0031', 'KH:ADR-0014'],
			consequencesIfInvalidated: 'S-0042 retombe à assumed'
		},
		status: 'active' as const
	};

	it('Scenario: Enregistrement nominal d un énoncé rédigé par un architecte', () => {
		const sha = computeTripletSha256(validTriplet);
		const envelope: ContributionEnvelope = {
			producer: {
				type: 'human',
				authorId: 'arch-001'
			},
			productionMode: 'human-authored',
			payloadSha256: sha,
			statement: baseStatement
		};

		const result = validateInboundEnvelope(envelope);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.statement.authority.productionMode).toBe('human-authored');
			expect(result.statement.maturity.confidence).toBe('designed');
			expect(result.statement.createdAt).toBeDefined();
		}
	});

	it('Scenario: Enregistrement d une proposition d agent validée par le Lead Architect', () => {
		const sha = computeTripletSha256(validTriplet);
		const envelope: ContributionEnvelope = {
			producer: {
				type: 'llm',
				authorId: 'agent-elicitation-01',
				model: 'gemini-3.8-flash',
				provider: 'google'
			},
			validator: {
				id: 'lead-arch-01',
				role: 'Lead Architect',
				timestamp: '2026-09-20T18:00:00.000Z'
			},
			productionMode: 'llm-proposed-human-approved',
			payloadSha256: sha,
			statement: {
				...baseStatement,
				authority: {
					...baseStatement.authority,
					productionMode: 'llm-proposed-human-approved'
				}
			}
		};

		const result = validateInboundEnvelope(envelope);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.statement.authority.validator?.id).toBe('lead-arch-01');
			expect(result.statement.authority.productionMode).toBe('llm-proposed-human-approved');
		}
	});

	it('Scenario: Rejet absolu du croisement verified x llm-derived (Invariant II)', () => {
		const sha = computeTripletSha256(validTriplet);
		const envelope: ContributionEnvelope = {
			producer: {
				type: 'llm',
				authorId: 'agent-inference-01'
			},
			productionMode: 'llm-derived',
			payloadSha256: sha,
			statement: {
				...baseStatement,
				maturity: {
					subjectLevel: 'L3_decided',
					confidence: 'verified' // INTERDIT avec llm-derived !
				},
				authority: {
					...baseStatement.authority,
					productionMode: 'llm-derived'
				}
			}
		};

		const result = validateInboundEnvelope(envelope);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('INVALID_EPISTEMIC_COMBINATION');
			expect(result.details).toContain('verified');
		}
	});

	it('Scenario: Rejet d une proposition d agent sans validateur humain', () => {
		const sha = computeTripletSha256(validTriplet);
		const envelope: ContributionEnvelope = {
			producer: {
				type: 'llm',
				authorId: 'agent-elicitation-01'
			},
			productionMode: 'llm-proposed-human-approved',
			// validator manquant intentionnellement !
			payloadSha256: sha,
			statement: {
				...baseStatement,
				authority: {
					...baseStatement.authority,
					productionMode: 'llm-proposed-human-approved'
				}
			}
		};

		const result = validateInboundEnvelope(envelope);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('VALIDATOR_REQUIRED');
		}
	});

	it('Scenario: Rejet d une charge utile altérée (Checksum Mismatch)', () => {
		const sha = computeTripletSha256(validTriplet);
		const corruptedSha = sha.replace(/^./, 'f'); // Modification du hash

		const envelope: ContributionEnvelope = {
			producer: {
				type: 'human',
				authorId: 'arch-001'
			},
			productionMode: 'human-authored',
			payloadSha256: corruptedSha,
			statement: baseStatement
		};

		const result = validateInboundEnvelope(envelope);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('CHECKSUM_MISMATCH');
		}
	});
});
