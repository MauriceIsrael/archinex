import { describe, it, expect } from 'vitest';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';
import {
	extractProjectionBlocks,
	generateStructurizrDSL,
	generateStructurizrVisualMermaid,
	generateSysMLVisualMermaid,
	generateSysMLv2,
	type ProjectionContext
} from '$lib/domain/artifactProjections';

const subject: MaturitySubject = {
	id: 'sub-core',
	section_ref: '§4.1',
	name: 'Socle Plateforme & Sécurité',
	level: 'L3_decided',
	blocking_count: 0,
	unlocks_count: 0,
	waiting_for_role: 'lead_architect',
	relative_effort: 'M',
	last_transition_date: '2026-10-14T00:00:00Z',
	stall_days: 0,
	is_stalled: false,
	dependent_subject_ids: []
};

const draft: TelegraphicDraft = {
	section_id: '§4.1',
	subject: subject.name,
	maturity: 'L3_decided',
	is_provisional: false,
	retenu: ['KH:ADR-101'],
	suppose: [],
	conflit: [],
	manque: []
};

const makeStmt = (
	id: string,
	predicate: string,
	value: string,
	confidence: Statement['maturity']['confidence'] = 'verified',
	basedOn: string[] = []
): Statement => ({
	id,
	section: '§4.1',
	triplet: { subject: 'sub-core', predicate, value },
	justification: { basedOn },
	authority: { author: 'arch', role: 'lead_architect', productionMode: 'human-authored' },
	maturity: { subjectLevel: 'L3_decided', confidence },
	revisability: { antecedents: [] },
	status: 'active',
	createdAt: '2026-10-14T00:00:00Z',
	updatedAt: '2026-10-14T00:00:00Z'
});

const multiDomainStatements: Statement[] = [
	makeStmt('S1', 'hsm_root_pki', 'HSM FIPS 140-3 Level 3 + PKI interne', 'verified'),
	makeStmt('S2', 'waf_reverse_proxy', 'WAF TLS 1.3 en coupure protocolaire', 'designed', ['S1']),
	makeStmt('S3', 'backup_worm', 'Sauvegarde immuable WORM RPO 15m', 'verified'),
	makeStmt('S4', 'custom_cadence_hz', '50', 'assumed')
];

const context: ProjectionContext = {
	projectName: 'Plateforme Souveraine',
	enterpriseName: 'Opérateur Public',
	actors: [{ name: 'Exploitant SOC', description: 'Supervise la plateforme' }],
	decision: {
		retainedOptionId: 'opt-1',
		retainedOptionTitle: 'Architecture Zonée Zero-Trust',
		rationale: 'Isolement des plans de contrôle et chiffrement matériel',
		reversibility: 'costly'
	},
	requirements: [
		{ clauseRef: 'REQ-SEC-01', title: 'Chiffrement matériel HSM et certificats PKI' },
		{ clauseRef: 'REQ-OPS-99', title: 'Sauvegarde immuable WORM hors-ligne' }
	]
};

describe('Issue #312 : Structuration par blocs fonctionnels, traçabilité et SysML v2 exploitable', () => {
	it('regroupe dynamiquement les énoncés par axe TOGAF et associe les exigences pertinentes', () => {
		const graph = extractProjectionBlocks(subject, draft, multiDomainStatements, context);
		const axisIds = graph.blocks.map((b) => b.axisId);

		expect(axisIds).toContain('security-trust');
		expect(axisIds).toContain('network-connectivity');
		expect(axisIds).toContain('data-persistence');
		expect(axisIds).toContain('general');

		const secBlock = graph.blocks.find((b) => b.axisId === 'security-trust')!;
		expect(secBlock.requirementRefs).toContain('REQ-SEC-01');
		expect(secBlock.settledCount).toBe(1);

		const dataBlock = graph.blocks.find((b) => b.axisId === 'data-persistence')!;
		expect(dataBlock.requirementRefs).toContain('REQ-OPS-99');
	});

	it('generateStructurizrVisualMermaid structure les conteneurs par sous-graphes d’axes et trace les exigences', () => {
		const mmd = generateStructurizrVisualMermaid(subject, draft, multiDomainStatements, context);

		expect(mmd).toContain('subgraph Axis_security_trust[');
		expect(mmd).toContain('subgraph Axis_network_connectivity[');
		expect(mmd).toContain('subgraph Axis_data_persistence[');
		expect(mmd).toContain('c_opt -->|"structure"| Axis_security_trust');
		expect(mmd).toContain('c_0 -->|"fonde"| c_1');
		expect(mmd).toContain('subgraph ReqTrace["📋 Traçabilité des Exigences"]');
		expect(mmd).toContain('Axis_security_trust -.->|"satisfait"| req_0');
		expect(mmd).toContain('Axis_data_persistence -.->|"satisfait"| req_1');
	});

	it('generateStructurizrVisualMermaid supporte le filtrage sur un bloc fonctionnel unique', () => {
		const focused = generateStructurizrVisualMermaid(
			subject,
			draft,
			multiDomainStatements,
			context,
			'security-trust'
		);

		expect(focused).toContain('subgraph Axis_security_trust[');
		expect(focused).not.toContain('subgraph Axis_data_persistence[');
		expect(focused).toContain('REQ-SEC-01');
		expect(focused).not.toContain('REQ-OPS-99');
	});

	it('generateSysMLVisualMermaid génère un BDD multi-blocs avec composition, flux inter-axes et exigences', () => {
		const bdd = generateSysMLVisualMermaid(subject, draft, multiDomainStatements, context);

		expect(bdd).toContain('class Block_sub_core {');
		expect(bdd).toContain('class Axis_security_trust {');
		expect(bdd).toContain('class Axis_network_connectivity {');
		expect(bdd).toContain('Block_sub_core *-- Axis_security_trust : compose');
		expect(bdd).toContain('Axis_security_trust --> Axis_network_connectivity : fonde');
		expect(bdd).toContain('class Req_REQ_SEC_01 {');
		expect(bdd).toContain('<<requirement>>');
		expect(bdd).toContain('Axis_security_trust ..> Req_REQ_SEC_01 : satisfait');
	});

	it('generateSysMLv2 émet des blocs structurés, des dépendances typées et de vraies relations satisfy sans commentaire mort', () => {
		const sysml = generateSysMLv2(subject, draft, multiDomainStatements, context);

		// Pas de satisfy commenté
		expect(sysml).not.toContain('// satisfy requirement');

		// Blocs d'axes et composition système
		expect(sysml).toContain('part def Axis_security_trust {');
		expect(sysml).toContain('part def System_sub_core {');
		expect(sysml).toContain('part system_sub_core : System_sub_core;');

		// Dépendances causales typées
		expect(sysml).toContain('dependency from system_sub_core.security_trust.hsm_root_pki_part to system_sub_core.network_connectivity.waf_reverse_proxy_part;');

		// Exigences réelles et satisfaction
		expect(sysml).toContain('requirement def Req_REQ_SEC_01 {');
		expect(sysml).toContain('requirement req_REQ_SEC_01 : Req_REQ_SEC_01;');
		expect(sysml).toContain('satisfy req_REQ_SEC_01 by system_sub_core.security_trust;');

		// Validation structurelle : accolades équilibrées et définitions uniques
		const opens = (sysml.match(/\{/g) || []).length;
		const closes = (sysml.match(/\}/g) || []).length;
		expect(opens).toBe(closes);

		const defs = [...sysml.matchAll(/(?:part|requirement) def (\w+)/g)].map((m) => m[1]);
		expect(new Set(defs).size).toBe(defs.length);
	});

	it('generateStructurizrDSL relie l’option retenue aux conteneurs racines', () => {
		const dsl = generateStructurizrDSL(subject, draft, multiDomainStatements, context);
		expect(dsl).toContain('c_retained_option -> c_S1 "structure"');
		expect(dsl).toContain('c_S1 -> c_S2 "fonde"');
	});
});
