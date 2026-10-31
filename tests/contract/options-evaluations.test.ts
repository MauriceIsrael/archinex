import { describe, it, expect } from 'vitest';
import {
	validateEvaluation,
	weightedScore,
	convertVarianteBToOption,
	type Criterion,
	type OptionEvaluation
} from '$lib/domain/options';
import {
	CreateOptionSchema,
	CreateCriterionSchema,
	CreateTradeOffSchema
} from '$lib/schemas/optionsApiSchemas';
import { CreateDecisionSchema } from '$lib/schemas/decisionApiSchemas';

describe('Options & Multi-Criteria Contract (Lot A2)', () => {
	describe('1. Validation stricte des évaluations d\'options (validateEvaluation)', () => {
		it('accepte une évaluation complète avec justification factuelle', () => {
			const result = validateEvaluation({
				optionId: 'opt-slicing-hardware',
				criterionId: 'crit-nis2-isolation',
				score: 2,
				justification: 'Isolation physique des cartes réseaux garantissant la conformité ANSSI PSSI.'
			});
			expect(result.valid).toBe(true);
			expect(result.reason).toBeUndefined();
		});

		it('rejette impérativement une évaluation sans justification (chaine vide ou espaces)', () => {
			const resEmpty = validateEvaluation({
				optionId: 'opt-1',
				criterionId: 'crit-1',
				score: 1,
				justification: ''
			});
			expect(resEmpty.valid).toBe(false);
			expect(resEmpty.reason).toContain('justification argumentée');

			const resWhitespace = validateEvaluation({
				optionId: 'opt-1',
				criterionId: 'crit-1',
				score: -1,
				justification: '    '
			});
			expect(resWhitespace.valid).toBe(false);
		});

		it('rejette les scores hors de l\'intervalle [-2, +2]', () => {
			const resTooHigh = validateEvaluation({
				optionId: 'opt-1',
				criterionId: 'crit-1',
				score: 3,
				justification: 'Très bon'
			});
			expect(resTooHigh.valid).toBe(false);
			expect(resTooHigh.reason).toContain('comprise entre -2 et +2');

			const resTooLow = validateEvaluation({
				optionId: 'opt-1',
				criterionId: 'crit-1',
				score: -5,
				justification: 'Inacceptable'
			});
			expect(resTooLow.valid).toBe(false);
		});
	});

	describe('2. Calcul indicatif de score pondéré (weightedScore)', () => {
		const criteria: Criterion[] = [
			{
				id: 'crit-nis2',
				subjectId: 'subj-1',
				name: 'Conformité NIS2',
				description: 'Exigences réglementaires',
				kind: 'compliance',
				weight: 5,
				author: 'Alice',
				role: 'lead_architect',
				productionMode: 'human-authored',
				version: 1
			},
			{
				id: 'crit-cost',
				subjectId: 'subj-1',
				name: 'Coût CAPEX/OPEX',
				description: 'Budget matériel',
				kind: 'cost',
				weight: 2,
				author: 'Bob',
				role: 'procurement',
				productionMode: 'human-authored',
				version: 1
			}
		];

		it('calcule la moyenne pondérée exacte', () => {
			// Option A : +2 en NIS2 (poids 5) et -1 en coût (poids 2)
			// Total = (2 * 5) + (-1 * 2) = 10 - 2 = 8
			// Poids total = 5 + 2 = 7
			// Score = 8 / 7 = 1.14
			const evalsOptionA: OptionEvaluation[] = [
				{
					optionId: 'opt-a',
					criterionId: 'crit-nis2',
					score: 2,
					justification: 'Parfaitement conforme',
					evidenceRefs: [],
					author: 'Alice',
					role: 'lead_architect',
					productionMode: 'human-authored'
				},
				{
					optionId: 'opt-a',
					criterionId: 'crit-cost',
					score: -1,
					justification: 'Surcoût licences et appliance',
					evidenceRefs: [],
					author: 'Bob',
					role: 'procurement',
					productionMode: 'human-authored'
				}
			];

			const scoreA = weightedScore('opt-a', criteria, evalsOptionA);
			expect(scoreA).toBe(1.14);
		});

		it('renvoie 0 lorsqu\'aucune évaluation n\'est renseignée', () => {
			const score = weightedScore('opt-unknown', criteria, []);
			expect(score).toBe(0);
		});
	});

	describe('3. Rétrocompatibilité variante_b (convertVarianteBToOption)', () => {
		it('convertit un texte de variante B en Option valide du domaine', () => {
			const rawText = 'Déploiement en conteneurs bare-metal sur Kubernetes sans virtualisation.';
			const converted = convertVarianteBToOption('subj-core-5g', rawText, 'Générateur IA');

			expect(converted.id).toBe('opt-subj-core-5g-var-b');
			expect(converted.subjectId).toBe('subj-core-5g');
			expect(converted.origin).toBe('llm-proposed');
			expect(converted.productionMode).toBe('llm-derived');
			expect(converted.status).toBe('proposed');
			expect(converted.summary).toBe(rawText);
		});
	});

	describe('4. Validation des schémas d\'API de création (optionsApiSchemas)', () => {
		it('CreateOptionSchema valide une option avec ou sans id pré-assigné', () => {
			const withoutId = CreateOptionSchema.safeParse({
				title: 'Passerelle eBPF Edge',
				summary: 'Routage direct sans matériel dédié',
				origin: 'human'
			});
			expect(withoutId.success).toBe(true);

			const withId = CreateOptionSchema.safeParse({
				id: 'opt-custom-1',
				title: 'Passerelle Hardware',
				summary: 'Boîtier physique appliance',
				origin: 'kb-pattern'
			});
			expect(withId.success).toBe(true);

			const missingTitle = CreateOptionSchema.safeParse({
				summary: 'Sans titre'
			});
			expect(missingTitle.success).toBe(false);
		});

		it('CreateCriterionSchema valide un critère avec ou sans id', () => {
			const withoutId = CreateCriterionSchema.safeParse({
				name: 'Latence < 5ms',
				kind: 'nfr',
				weight: 4
			});
			expect(withoutId.success).toBe(true);
		});

		it('CreateTradeOffSchema valide un compromis avec ou sans id', () => {
			const withoutId = CreateTradeOffSchema.safeParse({
				optionId: 'opt-1',
				gains: 'Meilleure latence',
				sacrifices: 'Coût matériel plus élevé'
			});
			expect(withoutId.success).toBe(true);
		});
	});
	describe('5. Validation stricte et clarté des erreurs d\'arbitrage (CreateDecisionSchema)', () => {
		it('rejette une motivation trop courte (< 10 caractères) avec message explicite', () => {
			const res = CreateDecisionSchema.safeParse({
				retainedOptionId: 'opt-1',
				rationale: 'Court',
				reversibility: 'reversible'
			});
			expect(res.success).toBe(false);
			if (!res.success) {
				const errors = res.error.flatten().fieldErrors;
				expect(errors.rationale).toBeDefined();
				expect(errors.rationale?.[0]).toContain('au moins 10 caractères');
			}
		});

		it('rejette une décision sans option retenue', () => {
			const res = CreateDecisionSchema.safeParse({
				retainedOptionId: '',
				rationale: 'Motivation substantielle et claire pour le projet.',
				reversibility: 'reversible'
			});
			expect(res.success).toBe(false);
			if (!res.success) {
				const errors = res.error.flatten().fieldErrors;
				expect(errors.retainedOptionId).toBeDefined();
				expect(errors.retainedOptionId?.[0]).toContain('obligatoire');
			}
		});

		it('exige une justification de conformité explicite si Partially compliant', () => {
			const res = CreateDecisionSchema.safeParse({
				retainedOptionId: 'opt-1',
				rationale: 'Motivation substantielle et claire pour le projet.',
				reversibility: 'reversible',
				complianceStatus: 'Partially compliant',
				complianceRationale: 'Non'
			});
			expect(res.success).toBe(false);
			if (!res.success) {
				const errors = res.error.flatten().fieldErrors;
				expect(errors.complianceRationale).toBeDefined();
				expect(errors.complianceRationale?.[0]).toContain('au moins 5 caractères');
			}
		});

		it('valide une décision complète et conforme', () => {
			const res = CreateDecisionSchema.safeParse({
				retainedOptionId: 'opt-1',
				rationale: 'Motivation substantielle et claire pour le projet.',
				reversibility: 'reversible',
				rejected: [{ optionId: 'opt-2', reason: 'Trop coûteux' }],
				complianceStatus: 'Compliant'
			});
			expect(res.success).toBe(true);
		});
	});
});
