import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';
import { generateStructurizrDSL } from '$lib/domain/artifactProjections';
import { assembleEngagementBundle, type AssemblyInput } from '$lib/domain/bundleAssembly';
import { dslString, renderStructurizrWorkspace, uniqueName } from '$lib/domain/structurizrDsl';

/**
 * Le C4 produit doit être ACCEPTÉ par Structurizr, pas seulement « ressembler » à du DSL.
 *
 * Avant ce test, les trois workspaces d'un scénario d'architecte étaient refusés par le CLI officiel (2025.11.09) : mot-clé
 * `enterprise` retiré, deux containers de même nom, relation parent → enfant ; et la vue de contexte, une fois acceptée, ne montrait
 * aucun container. Les invariants ci-dessous sont vérifiés sans Java ; la dernière suite appelle le vrai CLI.
 *
 * Vrai CLI : `STRUCTURIZR_CLI=/chemin/structurizr.sh`. Sans lui, ces tests sont ignorés (comme les tests « live » du dépôt) ;
 * `REQUIRE_STRUCTURIZR=1` transforme l'absence en échec (`npm run test:structurizr`).
 */
const subject: MaturitySubject = {
	id: 'sub-api', section_ref: '§3.2', name: "Passerelle d'API et segmentation réseau", level: 'L2_decomposed', blocking_count: 0,
	unlocks_count: 0, waiting_for_role: 'lead_architect', relative_effort: 'M', last_transition_date: '2026-10-14T00:00:00Z',
	stall_days: 0, is_stalled: false, dependent_subject_ids: []
} as MaturitySubject;
const draft = { section_id: '§3.2', subject: subject.name, maturity: 'L2_decomposed', is_provisional: false, retenu: [], suppose: [], conflit: [], manque: [] } as TelegraphicDraft;
const stmt = (id: string, predicate: string, value: string, basedOn: string[] = []): Statement =>
	({
		id, section: '§3.2', triplet: { subject: 'sub-api', predicate, value }, justification: { basedOn },
		authority: { author: 'a', role: 'lead_architect', productionMode: 'human-authored' },
		maturity: { subjectLevel: 'L2_decomposed', confidence: 'verified' }, revisability: { antecedents: [] }, status: 'active',
		createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z'
	}) as Statement;

const awkward: Statement[] = [
	stmt('S1', 'ingress', 'Passerelle "Envoy" cluster 3 nœuds'),
	stmt('S2', 'session_ttl_minutes', '30'),
	stmt('S3', 'session_ttl_minutes', '15', ['S1']), // même prédicat : le nom de container ne doit pas se répéter
	stmt('S4', 'tls', 'back\\slash', ['S1', 'S2'])
];

function bundleDsl(): string {
	const input = {
		project: { id: 'p', title: "Plateforme d'e-santé" }, confidentiality: 'confidential', now: new Date('2026-10-14T00:00:00Z'), sources: [],
		subjects: [
			{ id: 'sub-a', sectionRef: '§1', name: "Passerelle d'API", domain: 'infra', maturityLevel: 'L3_decided', requirementRefs: [],
				decision: { id: 'd-a', retainedOptionId: 'o-a', rejected: [], rationale: 'r', complianceStatus: 'Compliant', complianceRationale: 'ok', arbiterId: 'lead@x.org', decidedAt: new Date('2026-10-14T00:00:00Z') },
				options: [{ id: 'o-a', title: 'Envoy' }], questions: [] },
			{ id: 'sub-b', sectionRef: '§2', name: 'Stockage', domain: 'infra', maturityLevel: 'L2_decomposed', requirementRefs: [], decision: null, options: [], questions: [] }
		],
		statements: [
			{ id: 'st-1', subjectId: 'sub-a', subjectRef: 'a', predicate: 'ingress', value: 'Envoy', productionMode: 'human-authored', author: 'a@x.org', createdAt: new Date('2026-10-14T00:00:00Z') },
			{ id: 'st-2', subjectId: 'sub-a', subjectRef: 'a', predicate: 'ingress', value: 'Envoy bis', productionMode: 'human-authored', author: 'a@x.org', createdAt: new Date('2026-10-14T00:00:00Z') },
			{ id: 'st-3', subjectId: 'sub-b', subjectRef: 'b', predicate: 'database', value: 'PostgreSQL', productionMode: 'human-authored', author: 'a@x.org', createdAt: new Date('2026-10-14T00:00:00Z') }
		]
	} as unknown as AssemblyInput;
	return (assembleEngagementBundle(input).data as any).architecture.projections.structurizr_dsl;
}

const unitDsl = () => generateStructurizrDSL(subject, draft, awkward, { projectName: 'GCS e-Santé', enterpriseName: 'GCS e-Santé' });
const containerNames = (dsl: string) => [...dsl.matchAll(/= container ("(?:[^"\\]|\\.)*")/g)].map((m) => m[1]);

describe('Structurizr DSL : invariants (sans Java)', () => {
	it("n'écrit plus `enterprise` (retiré du langage) mais un `group`", () => {
		for (const dsl of [unitDsl(), bundleDsl()]) {
			expect(dsl).not.toMatch(/^\s*enterprise\b/m);
			expect(dsl).toMatch(/^\s*group "/m);
		}
	});

	it('deux énoncés de même prédicat donnent deux containers de noms distincts', () => {
		const names = containerNames(unitDsl());
		expect(new Set(names).size).toBe(names.length);
		expect(names).toContain('"session_ttl_minutes"');
		expect(names).toContain('"session_ttl_minutes (2)"');
		expect(uniqueName('x', new Set(['x', 'x (2)']))).toBe('x (3)');
	});

	it('ne relie jamais un parent à son enfant, ni ne référence un élément non déclaré', () => {
		const dsl = bundleDsl();
		expect(dsl).not.toMatch(/elem_sys_\w+ -> elem_opt_/); // système → option qu'il contient : refusé par Structurizr
		const declared = new Set([...dsl.matchAll(/^\s*(\w+) = (?:softwareSystem|container|person)/gm)].map((m) => m[1]));
		for (const [, from, to] of dsl.matchAll(/^\s*(\w+) -> (\w+) /gm)) {
			expect(declared.has(from), `source non déclarée : ${from}`).toBe(true);
			expect(declared.has(to), `cible non déclarée : ${to}`).toBe(true);
		}
	});

	it('écrit une vue de containers : la vue de contexte ne les montre pas', () => {
		for (const dsl of [unitDsl(), bundleDsl()]) {
			expect(dsl).toMatch(/^\s*systemContext \w+ "/m);
			expect(dsl).toMatch(/^\s*container \w+ "Containers_/m);
		}
		// plusieurs systèmes : une vue d'ensemble, et une vue de containers par système qui en a
		expect(bundleDsl()).toMatch(/systemLandscape "Landscape_/);
		expect(bundleDsl().match(/^\s*container \w+ "Containers_/gm)).toHaveLength(2);
	});

	it("n'invente aucune personne quand l'appelant n'en donne pas, et reprend celles qu'il donne", () => {
		expect(unitDsl()).not.toContain('person');
		const withActor = generateStructurizrDSL(subject, draft, awkward, { actors: [{ name: 'Praticien Hospitalier', description: 'Accède aux dossiers' }] });
		expect(withActor).toContain('person "Praticien Hospitalier"');
		expect(bundleDsl()).not.toContain('person');
	});

	it('échappe guillemets et antislash, et le lien causal existe aussi dans le C4', () => {
		const dsl = unitDsl();
		expect(dsl).toContain('Passerelle \\"Envoy\\" cluster 3 nœuds');
		expect(dsl).toContain('back\\\\slash');
		expect(dsl).toMatch(/c_S1 -> c_S3 "fonde"/);
		expect(dslString('a\nb')).toBe('"a b"');
	});

	it('est déterministe', () => {
		expect(unitDsl()).toBe(unitDsl());
		expect(bundleDsl()).toBe(bundleDsl());
	});

	it('un système sans container ne reçoit pas de vue de containers', () => {
		const dsl = renderStructurizrWorkspace({ name: 'w', description: 'd', systems: [{ id: 'a', name: 'A', containers: [] }], viewKey: 'k' });
		expect(dsl).toContain('systemContext');
		expect(dsl).not.toMatch(/^\s*container /m);
	});
});

const cli = process.env.STRUCTURIZR_CLI;
const required = process.env.REQUIRE_STRUCTURIZR === '1';

describe.skipIf(!cli && !required)('Structurizr DSL : validé par le vrai CLI', () => {
	it('le CLI est disponible', () => {
		expect(cli, 'REQUIRE_STRUCTURIZR=1 sans STRUCTURIZR_CLI (chemin de structurizr.sh)').toBeTruthy();
		expect(existsSync(cli!)).toBe(true);
	});

	const validate = (name: string, dsl: string) => {
		const file = join(mkdtempSync(join(tmpdir(), 'structurizr-')), `${name}.dsl`);
		writeFileSync(file, dsl, 'utf-8');
		try {
			execFileSync(cli!, ['validate', '-workspace', file], { stdio: 'pipe', encoding: 'utf-8' });
		} catch (e: any) {
			throw new Error(`${name} refusé par Structurizr : ${String(e.stdout || e.stderr || e).split('\n').filter((l) => !l.includes('JAVA_TOOL_OPTIONS')).slice(-3).join(' | ')}`);
		}
	};

	it('le workspace d\'un sujet (noms en double, guillemets, antislash, apostrophe) est accepté', () => validate('sujet', unitDsl()));
	it('le workspace global (plusieurs systèmes, décision, relations) est accepté', () => validate('global', bundleDsl()));
	it('un workspace sans énoncé ni personne est accepté', () => validate('vide', generateStructurizrDSL(subject, draft, [], undefined)));
	it('un workspace aux statuts mêlés (styles, étiquettes, énoncé remplacé écarté) est accepté', () => {
		const mixed = [
			{ ...stmt('M1', 'ingress', 'Envoy'), maturity: { subjectLevel: 'L2_decomposed', confidence: 'designed' } },
			{ ...stmt('M2', 'region', 'eu-west-3', ['M1']), maturity: { subjectLevel: 'L2_decomposed', confidence: 'assumed' }, status: 'under_review' },
			{ ...stmt('M3', 'kms', 'clé fournisseur', ['M1']), status: 'contested' },
			{ ...stmt('M4', 'ttl', '30'), status: 'superseded' },
			stmt('M5', 'ttl', '15')
		] as Statement[];
		validate('statuts', generateStructurizrDSL(subject, draft, mixed, { decision: { retainedOptionId: 'o', retainedOptionTitle: 'Envoy', rationale: 'r', reversibility: 'costly' } } as never));
	});
});
