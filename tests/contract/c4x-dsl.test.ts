import { describe, it, expect } from 'vitest';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';
import { generateC4xDSL } from '$lib/domain/artifactProjections';
import { assembleEngagementBundle, type AssemblyInput } from '$lib/domain/bundleAssembly';
import { c4xString, renderC4xDiagram, wrapC4xMarkdown } from '$lib/domain/c4xDsl';
import { freezeSectionAndGenerateSnapshot } from '$lib/domain/freezeExport';

const subject: MaturitySubject = {
	id: 'sub-api',
	section_ref: '§3.2',
	name: "Passerelle d'API et segmentation réseau",
	level: 'L3_decided',
	blocking_count: 0,
	unlocks_count: 0,
	waiting_for_role: 'lead_architect',
	relative_effort: 'M',
	last_transition_date: '2026-10-14T00:00:00Z',
	stall_days: 0,
	is_stalled: false,
	dependent_subject_ids: []
} as MaturitySubject;

const draft = {
	section_id: '§3.2',
	subject: subject.name,
	maturity: 'L3_decided',
	is_provisional: false,
	retenu: [],
	suppose: [],
	conflit: [],
	manque: []
} as TelegraphicDraft;

const stmt = (id: string, predicate: string, value: string, basedOn: string[] = []): Statement =>
	({
		id,
		section: '§3.2',
		triplet: { subject: 'sub-api', predicate, value },
		justification: { basedOn },
		authority: { author: 'a', role: 'lead_architect', productionMode: 'human-authored' },
		confidence: 'verified',
		maturity: { subjectLevel: 'L3_decided', confidence: 'verified' },
		revisability: { antecedents: [] },
		status: 'active',
		createdAt: '2026-10-14T00:00:00Z',
		updatedAt: '2026-10-14T00:00:00Z'
	}) as Statement;

const statements: Statement[] = [
	stmt('S1', 'ingress', 'Passerelle "Envoy" cluster 3 nœuds'),
	stmt('S2', 'session_ttl_minutes', '30'),
	stmt('S3', 'session_ttl_minutes', '15', ['S1']),
	stmt('S4', 'tls', 'back\\slash', ['S1', 'S2'])
];

describe('Contrat C4X DSL (zéro dépendance invasive)', () => {
	it('échappe correctement les guillemets, antislashs et retours à la ligne', () => {
		expect(c4xString('a "b"\nc\\d')).toBe('"a \\"b\\" c\\\\d"');
	});

	it('produit un modèle C4X déterministe avec Person, Boundary, System_Boundary, Container et Rel', () => {
		const out1 = generateC4xDSL(subject, draft, statements, {
			enterpriseName: 'Org Test',
			actors: [{ name: 'Opérateur', description: 'Exploitation' }],
			decision: { retainedOptionTitle: 'Envoy Gateway', rationale: 'Performance et mTLS' }
		});
		const out2 = generateC4xDSL(subject, draft, statements, {
			enterpriseName: 'Org Test',
			actors: [{ name: 'Opérateur', description: 'Exploitation' }],
			decision: { retainedOptionTitle: 'Envoy Gateway', rationale: 'Performance et mTLS' }
		});

		expect(out1).toBe(out2);
		expect(out1).toContain('Person(person_1, "Opérateur", "Exploitation")');
		expect(out1).toContain('Boundary(grp_Org_Test, "Org Test") {');
		expect(out1).toContain('System_Boundary(sys_sub_api, "Passerelle d\'API et segmentation réseau") {');
		expect(out1).toContain('Container(c_retained_option, "Envoy Gateway", "Option retenue", "Performance et mTLS")');
		expect(out1).toContain('Container(c_S2, "session_ttl_minutes",');
		expect(out1).toContain('Container(c_S3, "session_ttl_minutes (2)",');
		expect(out1).toContain('Rel(c_S1, c_S3, "fonde")');
		expect(out1).toContain('Rel(person_1, sys_sub_api, "Utilise")');
	});

	it('inclut les métadonnées épistémiques en annotation %% @meta lorsqu’activées', () => {
		const withMeta = generateC4xDSL(subject, draft, statements, undefined, { includeMetadata: true });
		expect(withMeta).toContain('%% @meta tags=');
		expect(withMeta).toContain('confidence=verified');
		expect(withMeta).toContain('productionMode=human-authored');

		const withoutMeta = generateC4xDSL(subject, draft, statements, undefined, { includeMetadata: false });
		expect(withoutMeta).not.toContain('%% @meta');
	});

	it('ajoute des coordonnées déterministes $x/$y uniquement lorsque includeLayoutHints est activé', () => {
		const withLayout = generateC4xDSL(subject, draft, statements, undefined, { includeLayoutHints: true });
		expect(withLayout).toMatch(/\$x=\d+, \$y=\d+/);
	});

	it('filtre les relations invalides (boucles, parent-enfant, éléments non déclarés, doublons)', () => {
		const c4x = renderC4xDiagram({
			name: 'Sys',
			description: 'Desc',
			systems: [
				{
					id: 'sys1',
					name: 'Systeme 1',
					containers: [{ id: 'c1', name: 'API' }, { id: 'c2', name: 'DB' }]
				}
			],
			relations: [
				{ from: 'c1', to: 'c1', label: 'self' },
				{ from: 'sys1', to: 'c1', label: 'parent-child' },
				{ from: 'c1', to: 'unknown', label: 'dangling' },
				{ from: 'c1', to: 'c2', label: 'SQL' },
				{ from: 'c1', to: 'c2', label: 'SQL' }
			],
			viewKey: 'sys1'
		});

		expect(c4x).not.toContain('"self"');
		expect(c4x).not.toContain('"parent-child"');
		expect(c4x).not.toContain('"dangling"');
		expect(c4x.match(/Rel\(c_c1, c_c2, "SQL"\)/g)?.length).toBe(1);
	});

	it('encapsule proprement en bloc Markdown ```c4x', () => {
		const md = wrapC4xMarkdown('Person(u, "User", "Desc")', 'Vue C4X');
		expect(md).toBe('### Vue C4X\n\n```c4x\nPerson(u, "User", "Desc")\n```');
	});

	it('propage c4x dans EngagementBundle et FrozenSnapshot sans casser la rétrocompatibilité', () => {
		const input: AssemblyInput = {
			project: { id: 'p', title: 'Plateforme Test' },
			confidentiality: 'internal',
			now: new Date('2026-10-14T00:00:00Z'),
			sources: [],
			subjects: [
				{
					id: 'sub-a',
					sectionRef: '§1',
					name: 'Passerelle API',
					domain: 'infra',
					maturityLevel: 'L3_decided',
					requirementRefs: [],
					decision: {
						id: 'd-a',
						retainedOptionId: 'o-a',
						rejected: [],
						rationale: 'r',
						complianceStatus: 'Compliant',
						complianceRationale: 'ok',
						arbiterId: 'lead@x.org',
						decidedAt: new Date('2026-10-14T00:00:00Z')
					},
					options: [{ id: 'o-a', title: 'Envoy' }],
					questions: []
				}
			],
			statements: [
				{
					id: 'st-1',
					subjectId: 'sub-a',
					subjectRef: '§1',
					predicate: 'protocole',
					value: 'HTTPS',
					unit: null,
					productionMode: 'human-authored',
					author: 'lead@x.org',
					createdAt: new Date('2026-10-14T00:00:00Z'),
					confidence: 'verified',
					status: 'active',
					basedOn: []
				}
			]
		};

		const bundle = assembleEngagementBundle(input);
		expect(bundle.data.subjects[0].projections?.c4x).toContain('System_Boundary(');
		expect(bundle.data.architecture?.projections?.c4x).toContain('Boundary(');

		const snap = freezeSectionAndGenerateSnapshot({
			subject,
			draft,
			statements,
			authorName: 'Lead',
			authorRole: 'lead_architect',
			now: new Date('2026-10-14T00:00:00Z')
		});
		expect(snap.projections.c4x).toContain('System_Boundary(');
		expect(snap.sealSha256).toMatch(/^[a-f0-9]{64}$/);
	});
});
