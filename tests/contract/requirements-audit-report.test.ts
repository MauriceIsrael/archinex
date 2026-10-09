import { describe, it, expect } from 'vitest';
import { buildAuditReportMarkdown, cell, type ReportRequirement, type ReportSubject } from '$lib/domain/requirementsAuditReport';
import { computeAuditMetrics } from '$lib/domain/requirementsAuditEval';

const req = (ref: string, disposition: ReportRequirement['disposition'], extra: Partial<ReportRequirement> = {}): ReportRequirement => ({
	clauseRef: ref,
	title: `Titre ${ref}`,
	text: `Texte ${ref}`,
	criticality: 'majeur',
	disposition,
	...extra
});

const requirements: ReportRequirement[] = [
	req('R1', 'deliberated', { deliberationReason: 'Autonomie 30 jours : coût contre dépendance au transport' }),
	req('R2', 'deliberated', { deliberationReason: 'Tension entre souveraineté et disponibilité' }),
	req('R3', 'deliberated'), // sans motif du modèle
	req('R4', 'to_qualify', { criticality: 'bloquant', qualifyReason: "Clause bloquante : le modèle proposait de l'évacuer" }),
	req('R5', 'clarification_needed', { clarificationQuestion: 'Quel délai de bascule est toléré ?' }),
	req('R6', 'evacuated', { criticality: 'info', evacuationReason: 'Mobilier hors périmètre | sans arbitrage' }),
	req('R7', 'evacuated', { criticality: 'majeur', evacuationReason: 'Fonction standard du marché' })
];
const subjects: ReportSubject[] = [
	{
		id: 'SUBJ-01',
		name: 'Tenue de la synchronisation sans GNSS',
		sectionRef: '§3',
		coveredClauseRefs: ['R1', 'R2'],
		waitingForRole: 'infra_expert_architect',
		effort: 'M',
		matchedKbItemIds: [],
		seed: { initialQuestion: 'Quelle autonomie retenir ?', initialConflict: 'Coût contre dépendance', initialHypothesis: 'Horloge locale', expertQuestions: ['Quel drift tolérer ?'] }
	}
];
const base = { title: 'RFP test', model: 'faux-modele', generatedAt: '2026-10-09T12:00:00Z' };

/** Nombre de lignes de tableau ou de listes qui citent la clause entre accents graves. */
const occurrences = (md: string, ref: string) => (md.match(new RegExp(`\`${ref}\``, 'g')) || []).length;

describe('Rapport lisible de l\'audit des exigences', () => {
	it('chaque clause apparaît exactement une fois, même si un sujet est absent', () => {
		const md = buildAuditReportMarkdown({ ...base, requirements, subjects });
		for (const r of requirements) expect(occurrences(md, r.clauseRef), r.clauseRef).toBe(1);
	});

	it('une clause à délibérer sans sujet n\'est pas perdue : elle a sa propre section', () => {
		const md = buildAuditReportMarkdown({ ...base, requirements, subjects });
		expect(md).toContain('À délibérer mais sans sujet (1)');
		const section = md.split('## À délibérer mais sans sujet')[1].split('## ')[0];
		expect(section).toContain('`R3`');
	});

	it('explique pourquoi chaque clause est dans son sujet, ou le dit quand le modèle ne l\'a pas précisé', () => {
		const md = buildAuditReportMarkdown({ ...base, requirements, subjects });
		expect(md).toContain('Autonomie 30 jours : coût contre dépendance au transport');
		expect(md).toContain('Tension entre souveraineté et disponibilité');
		expect(md).toContain('Quelle autonomie retenir ?');
		expect(md).toContain('Quel drift tolérer ?');
	});

	it('les comptes de la lecture rapide correspondent aux sections', () => {
		const md = buildAuditReportMarkdown({ ...base, requirements, subjects });
		expect(md).toContain('| À délibérer | 3 |');
		expect(md).toContain('| À qualifier | 1 |');
		expect(md).toContain('| À clarifier | 1 |');
		expect(md).toContain('| Évacuation proposée | 2 |');
		expect(md).toContain('| **Total** | **7** |');
	});

	it('met les évacuations « majeur » avant les « info », et protège les cellules de tableau', () => {
		const md = buildAuditReportMarkdown({ ...base, requirements, subjects });
		const section = md.split('## Évacuations proposées')[1];
		expect(section.indexOf('`R7`')).toBeLessThan(section.indexOf('`R6`'));
		expect(section).toContain('Mobilier hors périmètre \\| sans arbitrage');
		expect(cell('a\nb | c')).toBe('a b \\| c');
	});

	it('une panne du modèle (tout « à qualifier ») donne un rapport sans sujet et sans évacuation', () => {
		const down = requirements.map((r) => ({ ...r, disposition: 'to_qualify' as const, qualifyReason: 'Classement indisponible', evacuationReason: undefined }));
		const md = buildAuditReportMarkdown({ ...base, requirements: down, subjects: [], status: 'unavailable' });
		expect(md).toContain('Aucun sujet');
		expect(md).toContain('| Évacuation proposée | 0 |');
		for (const r of down) expect(occurrences(md, r.clauseRef)).toBe(1);
	});

	it('ajoute la comparaison avec la référence quand elle est fournie', () => {
		const metrics = computeAuditMetrics(
			requirements,
			subjects,
			{ hardPoints: [{ id: 'HP1', name: 'Synchro', coveredClauseRefs: ['R1', 'R2', 'R7'] }], clarifications: [{ clauseRefs: ['R5'], question: 'q' }] }
		);
		const md = buildAuditReportMarkdown({ ...base, requirements, subjects, metrics });
		expect(md).toContain('Comparaison avec l\'analyse de référence');
		expect(md).toContain('Faux négatifs dangereux (clause de référence évacuée) : **1** : `R7`');
		expect(md).toContain('Intégrité : **ÉCHEC**');
		expect(md).toContain('HP1 · Synchro');
	});
});
