import { describe, it, expect } from 'vitest';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';
import {
	generateMermaidDiagram,
	generateStructurizrDSL,
	generateSysMLv2,
	generateConfigJSON,
	generateStructurizrVisualMermaid,
	generateSysMLVisualMermaid,
	type ProjectionContext
} from '$lib/domain/artifactProjections';

describe('Projections dynamiques d\'architecture (No Doc Drift - Issue #64)', () => {
	const subject: MaturitySubject = {
		id: 'sub-auth',
		section_ref: '§3.1',
		name: 'Gestion des Identités et Accès',
		level: 'L3_decided',
		blocking_count: 0,
		unlocks_count: 1,
		waiting_for_role: 'lead_architect',
		relative_effort: 'M',
		last_transition_date: '2026-10-14T00:00:00Z',
		stall_days: 0,
		is_stalled: false,
		dependent_subject_ids: []
	};

	const draft: TelegraphicDraft = {
		section_id: '§3.1',
		subject: 'Gestion des Identités et Accès',
		maturity: 'L3_decided',
		is_provisional: false,
		retenu: ['KH:ADR-0021'],
		suppose: [],
		conflit: [],
		manque: []
	};

	const statements: Statement[] = [
		{
			id: 'stmt-1',
			section: '§3.1',
			triplet: { subject: 'sub-auth', predicate: 'session_ttl_minutes', value: '15' },
			justification: { basedOn: ['KH:ADR-0021'] },
			authority: { author: 'sec-lead', role: 'security_architect', productionMode: 'human-authored' },
			maturity: { subjectLevel: 'L3_decided', confidence: 'designed' },
			revisability: { antecedents: [] },
			status: 'active',
			createdAt: '2026-10-14T00:00:00Z',
			updatedAt: '2026-10-14T00:00:00Z'
		},
		{
			id: 'stmt-2',
			section: '§3.1',
			triplet: { subject: 'sub-auth', predicate: 'mfa_enforced', value: 'true' },
			justification: { basedOn: [] },
			authority: { author: 'lead', role: 'lead_architect', productionMode: 'human-authored' },
			maturity: { subjectLevel: 'L3_decided', confidence: 'verified' },
			revisability: { antecedents: [] },
			status: 'active',
			createdAt: '2026-10-14T00:00:00Z',
			updatedAt: '2026-10-14T00:00:00Z'
		}
	];

	const context: ProjectionContext = {
		projectName: 'Plateforme E-Santé Régionale',
		enterpriseName: 'GCS e-Santé',
		actors: [
			{ name: 'Praticien Hospitalier', role: 'domain_user', description: 'Accède aux dossiers patients' }
		],
		decision: {
			retainedOptionId: 'opt-oidc',
			retainedOptionTitle: 'Fédération OIDC avec Pro Santé Connect',
			rationale: 'Obligation régalienne et interopérabilité nationale',
			reversibility: 'costly',
			decidedAt: '2026-10-14T10:00:00Z',
			arbiterId: 'lead-arch',
			arbiterRole: 'lead_architect'
		},
		requirements: [
			{ clauseRef: 'EX-042', title: 'Authentification forte CPS / e-CPS' }
		],
		sealSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
	};

	it('1. C4 Structurizr DSL reflète le projet, l\'acteur réel et l\'option retenue sans données fixes', () => {
		const dsl = generateStructurizrDSL(subject, draft, statements, context);
		expect(dsl).toContain('enterprise "GCS e-Santé"');
		expect(dsl).toContain('person "Praticien Hospitalier"');
		expect(dsl).toContain('container "Fédération OIDC avec Pro Santé Connect"');
		expect(dsl).toContain('session_ttl_minutes');
		// Ne doit plus contenir les valeurs en dur
		expect(dsl).not.toContain('Opérateur Réseau');
		expect(dsl).not.toContain('Infrastructure Critiques');
	});

	it('2. C4 Mermaid visuel intègre l\'acteur et l\'option retenue', () => {
		const visual = generateStructurizrVisualMermaid(subject, draft, statements, context);
		expect(visual).toContain('Praticien Hospitalier');
		expect(visual).toContain('GCS e-Santé');
		expect(visual).toContain('Fédération OIDC avec Pro Santé Connect');
		expect(visual).not.toContain('Opérateur Réseau');
	});

	it('3. Configuration JSON dynamique ne contient aucun profil télécom PTP en dur et type les valeurs', () => {
		const jsonStr = generateConfigJSON(subject, draft, statements, '2026-10-14T12:00:00Z', context);
		const parsed = JSON.parse(jsonStr);

		expect(parsed.subject.id).toBe('sub-auth');
		expect(parsed.decision.retainedOptionTitle).toBe('Fédération OIDC avec Pro Santé Connect');
		expect(parsed.parameters.session_ttl_minutes).toBe(15); // Converti en nombre
		expect(parsed.parameters.mfa_enforced).toBe(true); // Converti en booléen
		expect(parsed.coveredRequirements).toEqual(['EX-042']);
		expect(parsed.provenance.sealSha256).toBe(context.sealSha256);

		// Ne doit plus contenir de PTP IEEE 1588
		expect(jsonStr).not.toContain('IEEE_1588_G8275_1');
		expect(jsonStr).not.toContain('domainNumber');
		expect(jsonStr).not.toContain('holdoverSpec');
	});

	it('4. SysML v2 modélise l\'option retenue et les exigences sans dérive', () => {
		const sysml = generateSysMLv2(subject, draft, statements, context);
		expect(sysml).toContain("package 'Gestion des Identités et Accès'");
		expect(sysml).toContain('part def Opt_F_d_ration_OIDC_avec_Pro_Sant__Connect');
		expect(sysml).toContain('session_ttl_minutes');
		expect(sysml).toContain('EX-042');
	});

	it('5. Mermaid causal intègre l\'option retenue et les triplets prouvés', () => {
		const mmd = generateMermaidDiagram(subject, draft, statements, context);
		expect(mmd).toContain('flowchart TD');
		expect(mmd).toContain('Fédération OIDC avec Pro Santé Connect');
		expect(mmd).toContain('session_ttl_minutes');
	});
});
