import { describe, it, expect } from 'vitest';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';
import {
	generateConfigJSON,
	generateMermaidDiagram,
	generateStructurizrDSL,
	generateStructurizrVisualMermaid,
	generateSysMLVisualMermaid,
	generateSysMLv2
} from '$lib/domain/artifactProjections';
import { assembleEngagementBundle, type AssemblyInput } from '$lib/domain/bundleAssembly';
import { badgeOf, confidenceBadge, elementBadge, partitionStatements, withdrawnNote } from '$lib/domain/epistemicBadge';

/**
 * Un schéma de tableau blanc sert d'abord à voir ce qui est acquis et ce qui ne l'est pas.
 *
 * Avant : tous les énoncés d'une section étaient dessinés de la même façon, un énoncé remplacé (« 30 ») à côté de son remplaçant
 * (« 15 »), un énoncé contesté ou supposé avec l'allure d'un fait ; le C4 écrivait « Verified Architecture » sur chaque élément ; le JSON
 * gardait « la dernière valeur lue » d'un prédicat répété ; l'export scellé codait `confidence: 'verified'` pour tous.
 */
const subject = {
	id: 'sub-api', section_ref: '§3.2', name: "Passerelle d'API", level: 'L2_decomposed', blocking_count: 0, unlocks_count: 0,
	waiting_for_role: 'lead_architect', relative_effort: 'M', last_transition_date: '2026-10-14T00:00:00Z', stall_days: 0,
	is_stalled: false, dependent_subject_ids: []
} as MaturitySubject;
const draft = { section_id: '§3.2', subject: subject.name, maturity: 'L2_decomposed', is_provisional: false, retenu: [], suppose: [], conflit: [], manque: [] } as TelegraphicDraft;
const st = (id: string, predicate: string, value: string, confidence: string, status = 'active', basedOn: string[] = []): Statement =>
	({
		id, section: '§3.2', triplet: { subject: 'sub-api', predicate, value }, justification: { basedOn },
		authority: { author: 'a', role: 'lead_architect', productionMode: 'human-authored' },
		maturity: { subjectLevel: 'L2_decomposed', confidence }, revisability: { antecedents: [] }, status,
		createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z'
	}) as unknown as Statement;

const statements: Statement[] = [
	st('S1', 'ingress', 'Passerelle Envoy cluster 3 nœuds', 'designed'),
	st('S2', 'tls_termination', 'Terminaison TLS 1.3', 'verified', 'active', ['S1']),
	st('S3', 'peak_load_rps', '12000', 'assumed', 'active', ['S1']),
	st('S4', 'cloud_region', 'eu-west-3', 'assumed', 'under_review'),
	st('S5', 'encryption_at_rest', 'AES-256-GCM clé fournisseur', 'designed', 'contested'),
	st('S6', 'session_ttl_minutes', '30', 'verified', 'superseded'),
	st('S7', 'session_ttl_minutes', '15', 'verified', 'active')
];
const decision = { retainedOptionId: 'o', retainedOptionTitle: 'Envoy en cluster', rationale: 'Clés souveraines', reversibility: 'costly' };

describe('badges épistémiques', () => {
	it('écarte les énoncés remplacés ou retirés, et compte ce qu\'il écarte', () => {
		const p = partitionStatements([...statements, st('S8', 'x', '1', 'verified', 'retracted')]);
		expect(p.shown.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S7']);
		expect(p.withdrawn).toBe(2);
		expect(withdrawnNote(2)).toBe('2 énoncés remplacés ou retirés ne sont pas affichés');
		expect(withdrawnNote(0)).toBeNull();
	});

	it('le statut l\'emporte sur la confiance, et seul un énoncé vérifié et actif est « acquis »', () => {
		const by = (id: string, conflict = false) => badgeOf(statements.find((s) => s.id === id)!, conflict);
		expect(by('S2')).toMatchObject({ tag: 'Verified', settled: true });
		expect(by('S1')).toMatchObject({ tag: 'Designed', settled: false });
		expect(by('S3')).toMatchObject({ tag: 'Assumed', label: 'hypothèse' });
		expect(by('S4').tag).toBe('InReview');
		expect(by('S5').tag).toBe('Contested');
		expect(by('S2', true)).toMatchObject({ tag: 'Conflict', settled: false });
	});

	it('deux énoncés actifs de même prédicat et de valeurs différentes sont en conflit : on ne choisit pas', () => {
		const p = partitionStatements([st('A', 'ttl', '15', 'verified'), st('B', 'ttl', '30', 'verified'), st('C', 'ttl', '15', 'verified', 'active')]);
		expect([...p.conflictIds].sort()).toEqual(['A', 'B', 'C']);
		expect(partitionStatements([st('A', 'ttl', '15', 'verified'), st('B', 'ttl', '15', 'designed')]).conflictIds.size).toBe(0); // même valeur : pas un conflit
	});

	it('une confiance absente n\'est jamais prise pour « vérifié »', () => {
		expect(confidenceBadge('')).toMatchObject({ tag: 'Unqualified', settled: false });
		expect(confidenceBadge(undefined).label).toBe('confiance non renseignée');
		expect(confidenceBadge('observed').label).toBe('confiance « observed »');
		expect(elementBadge({ assertion_level: 'proposed' }).settled).toBe(false);
		expect(elementBadge({ assertion_level: 'asserted' }).label).toBe('validé par un humain');
	});
});

describe('Mermaid causal', () => {
	const mmd = generateMermaidDiagram(subject, draft, statements, { decision });

	it('chaque énoncé dessiné dit sa solidité en toutes lettres ; l\'énoncé remplacé n\'y est plus', () => {
		for (const label of ['conçu, non vérifié', 'vérifié', 'hypothèse', 'en revue', 'contesté']) expect(mmd).toContain(`<i>${label}</i>`);
		expect(mmd).toContain('session_ttl_minutes : 15');
		expect(mmd).not.toContain('session_ttl_minutes : 30');
		expect(mmd).toContain('1 énoncé remplacé ou retiré n\'est pas affiché');
		expect(mmd).toMatch(/N_\d\["peak_load_rps : 12000<br\/><i>hypothèse<\/i>"\]:::Assumed/);
		expect(mmd).toMatch(/:::Contested/);
	});

	it('l\'option retenue précède les énoncés sans antécédent, pas seulement le premier', () => {
		const roots = mmd.split('\n').filter((l) => l.includes('OPT -->'));
		// S1, S4, S5, S7 ne se fondent sur aucun autre énoncé ; S2 et S3 se fondent sur S1
		expect(roots).toHaveLength(4);
		expect(mmd).toMatch(/N_0 --> N_1/);
		expect(mmd).toMatch(/N_0 --> N_2/);
	});

	it('garde les parenthèses et crochets des valeurs (avant : supprimés) et protège les guillemets', () => {
		const out = generateMermaidDiagram(subject, draft, [st('P', 'cipher', 'AES-256 (GCM) [FIPS] "strict"', 'verified')], undefined);
		expect(out).toContain('AES-256 (GCM) [FIPS] #quot;strict#quot;');
	});

	it('deux valeurs actives différentes pour un même prédicat sont marquées en conflit', () => {
		const out = generateMermaidDiagram(subject, draft, [st('A', 'ttl', '15', 'verified'), st('B', 'ttl', '30', 'verified')], undefined);
		expect(out.match(/<i>en conflit : valeurs différentes<\/i>/g)).toHaveLength(2);
	});
});

describe('C4', () => {
	const dsl = generateStructurizrDSL(subject, draft, statements, { decision });

	it('ne dit « vérifié » que des énoncés vérifiés : plus de « Verified Architecture » partout', () => {
		expect(dsl).not.toContain('Verified Architecture');
		expect(dsl).toContain('container "tls_termination" "Terminaison TLS 1.3" "vérifié"');
		expect(dsl).toContain('container "peak_load_rps" "12000" "hypothèse"');
		expect(dsl).toContain('container "encryption_at_rest" "AES-256-GCM clé fournisseur" "contesté"');
		expect(dsl).not.toContain('"30"');
	});

	it('étiquette chaque container et style chaque étiquette', () => {
		for (const tag of ['Verified', 'Designed', 'Assumed', 'InReview', 'Contested', 'Retained']) {
			expect(dsl).toContain(`tags "${tag}"`);
			expect(dsl).toContain(`element "${tag}" {`);
		}
		expect(dsl).toMatch(/\/\/ 1 énoncé remplacé ou retiré n'est pas affiché/);
	});

	it('la version Mermaid du C4 dit la même chose, avec la même classe', () => {
		const visual = generateStructurizrVisualMermaid(subject, draft, statements, { decision });
		expect(visual).toContain('[Container · hypothèse]');
		expect(visual).toMatch(/c_\d\["⚙️ peak_load_rps[^\n]*:::Assumed/);
		expect(visual).not.toContain('lead_architect'); // avant : le rôle de l'auteur tenait lieu de « type » de container
	});
});

describe('SysML', () => {
	it('noms de définitions uniques, apostrophe échappée, solidité écrite', () => {
		const sysml = generateSysMLv2(subject, draft, [st('A', 'ttl', '15', 'verified'), st('B', 'ttl', '30', 'verified')], { decision });
		const defs = [...sysml.matchAll(/part def (\w+)/g)].map((m) => m[1]);
		expect(new Set(defs).size).toBe(defs.length);
		expect(sysml).toContain("package 'Passerelle d\\'API'");
		expect(sysml).toContain('attribute epistemic : String = "en conflit : valeurs différentes";');
		expect(sysml).not.toContain('part def ttl {\n        attribute specification : String = "30"');
	});

	it('la vue en blocs garde les accents et la solidité', () => {
		const out = generateSysMLVisualMermaid(subject, draft, statements, { decision });
		expect(out).toContain('+cloud_region: eu-west-3 · en revue');
		expect(out).toContain('Passerelle Envoy cluster 3 nœuds · conçu, non vérifié');
		expect(out).not.toMatch(/n_uds|g_r_e/);
	});
});

describe('configuration JSON', () => {
	const cfg = JSON.parse(generateConfigJSON(subject, draft, statements, '2026-10-14T00:00:00Z', { decision }));

	it('ne tranche pas un conflit et ne garde pas un énoncé remplacé', () => {
		const conflicting = JSON.parse(generateConfigJSON(subject, draft, [st('A', 'ttl', '15', 'verified'), st('B', 'ttl', '30', 'verified')], 'x'));
		expect(conflicting.parameters.ttl).toBeUndefined();
		expect(conflicting.conflicts.ttl).toEqual([15, 30]);
		expect(cfg.parameters.session_ttl_minutes).toBe(15);
		expect(cfg.withdrawnStatements).toBe(1);
	});

	it('liste ce qui n\'est pas vérifié, et n\'affirme plus « enforcedTruth »', () => {
		expect(cfg.unsettled).toMatchObject({ peak_load_rps: 'hypothèse', ingress: 'conçu, non vérifié' });
		expect(cfg.unsettled.tls_termination).toBeUndefined();
		expect(cfg.epistemic).toMatchObject({ vérifié: 2, hypothèse: 1, contesté: 1 });
		expect(JSON.stringify(cfg)).not.toContain('enforcedTruth');
	});

	it('un résultat ne dépend pas de l\'ordre des énoncés', () => {
		const a = generateConfigJSON(subject, draft, statements, 'x');
		const b = generateConfigJSON(subject, draft, [...statements].reverse(), 'x');
		expect(JSON.parse(a).parameters).toEqual(JSON.parse(b).parameters);
	});
});

describe('dossier scellé : la vraie confiance et le vrai statut', () => {
	const input = (extra: Partial<AssemblyInput['statements'][number]>[]): AssemblyInput =>
		({
			project: { id: 'p', title: 'Projet' }, confidentiality: 'confidential', now: new Date('2026-10-14T00:00:00Z'), sources: [],
			subjects: [{ id: 'sub-api', sectionRef: '§3.2', name: "Passerelle d'API", domain: 'infra', maturityLevel: 'L2_decomposed', requirementRefs: [], decision: null, options: [], questions: [] }],
			statements: extra.map((e, i) => ({ id: `st-${i}`, subjectId: 'sub-api', subjectRef: 'api', productionMode: 'human-authored', author: 'a@x.org', createdAt: new Date('2026-10-14T00:00:00Z'), ...e }))
		}) as unknown as AssemblyInput;
	const arch = (i: AssemblyInput) => (assembleEngagementBundle(i).data as any).architecture;
	const base = { predicate: 'p', value: 'v' };

	it('un énoncé retiré n\'est pas un élément de l\'architecture', () => {
		const a = arch(input([{ ...base, predicate: 'a', confidence: 'verified' }, { ...base, predicate: 'b', confidence: 'verified', status: 'retracted' }]));
		const names = a.elements.map((e: any) => e.name);
		expect(names.some((n: string) => n.startsWith('a:'))).toBe(true);
		expect(names.some((n: string) => n.startsWith('b:'))).toBe(false);
	});

	it('l\'élément dit la confiance de l\'énoncé, et une confiance inconnue n\'est pas « vérifié »', () => {
		const a = arch(input([{ ...base, predicate: 'a', confidence: 'assumed' }, { ...base, predicate: 'b' }, { ...base, predicate: 'c', confidence: 'verified', status: 'contested' }]));
		const desc = (prefix: string) => a.elements.find((e: any) => e.name.startsWith(prefix)).description;
		expect(desc('a:')).toBe('hypothèse');
		expect(desc('b:')).toBe('confiance non renseignée');
		expect(desc('c:')).toBe('contesté');
	});

	it('les projections par sujet reçoivent la vraie confiance, plus un « verified » codé en dur', () => {
		const bundle = assembleEngagementBundle(input([{ ...base, predicate: 'a', value: '1', confidence: 'assumed' }, { ...base, predicate: 'b', value: '2', confidence: 'verified', status: 'retracted' }]));
		const bySubject = (bundle.data as any).architecture.projections.by_subject['sub-api'];
		expect(bySubject.mermaid).toContain('<i>hypothèse</i>');
		expect(bySubject.mermaid).not.toContain('b : 2');
		expect(bySubject.structurizr_dsl).toContain('"hypothèse"');
		expect(bySubject.structurizr_dsl).not.toContain('Verified Architecture');
	});

	it('le Mermaid global dit « proposé » ou « validé par un humain » et ne redessine pas la relation de contenance', () => {
		const b = arch(input([{ ...base, predicate: 'a', confidence: 'verified' }, { ...base, predicate: 'b', productionMode: 'llm-derived', author: 'agent' }]));
		expect(b.projections.mermaid).toContain('<i>vérifié · validé par un humain</i>');
		expect(b.projections.mermaid).toContain('<i>confiance non renseignée · proposé, non relu</i>');
		expect(b.projections.mermaid).not.toContain('|"Contient"|');
	});
});

/**
 * Le brouillon de la section dit ce qui reste ouvert. Avant, `draft` n'était lu par aucun générateur : une section provisoire,
 * avec une question bloquante et un conflit en attente d'arbitrage, se dessinait comme une architecture décidée.
 */
describe('brouillon : provisoire, hypothèses, conflits, questions', () => {
	const open = {
		...draft,
		is_provisional: true,
		suppose: [{ text: 'Pic de 12 000 req/s', consequence: 'dimensionnement x2', cost_hint: '+18 k€/an' }],
		conflit: [{ text: 'Clés fournisseur', opposing_reference: 'exigence souveraineté', requires_arbitration: true }],
		manque: [{ id: 'q1', question: 'Qui héberge le HSM ?', assigned_role: 'security_architect' }]
	} as unknown as TelegraphicDraft;
	const settled = { ...open, is_provisional: false, suppose: [], conflit: [], manque: [] } as TelegraphicDraft;

	it('Mermaid : bandeau et points ouverts dans leur classe, avec la conséquence et qui tranche', () => {
		const out = generateMermaidDiagram(subject, open, statements, { decision });
		expect(out).toMatch(/BANNER\["⚠ PROVISOIRE · maturité L2 · decomposed · ne se lit pas comme une décision"\]:::Provisional/);
		expect(out).toContain('supposé : Pic de 12 000 req/s<br/><i>hypothèse · ⇒ dimensionnement x2 · +18 k€/an</i>"]:::Assumed');
		expect(out).toContain('conflit : Clés fournisseur vs exigence souveraineté<br/><i>en conflit · arbitrage requis</i>"]:::Conflict');
		expect(out).toContain('question ouverte : Qui héberge le HSM ?<br/><i>à instruire · → security_architect</i>"]:::Open');
	});

	it('une section tranchée n\'a ni bandeau ni point ouvert', () => {
		for (const out of [generateMermaidDiagram(subject, settled, statements, { decision }), generateStructurizrDSL(subject, settled, statements, { decision })]) {
			expect(out).not.toContain('PROVISOIRE');
			expect(out).not.toContain('question ouverte');
		}
	});

	it('C4 : chaque point ouvert est un container étiqueté, et le bandeau figure sur le système', () => {
		const dsl = generateStructurizrDSL(subject, open, statements, { decision });
		expect(dsl).toContain('"question ouverte : Qui héberge le HSM ?" "→ security_architect" "à instruire"');
		expect(dsl).toMatch(/tags "Open"/);
		expect(dsl).toMatch(/softwareSystem "Passerelle d'API" "PROVISOIRE · maturité/);
		expect(generateStructurizrVisualMermaid(subject, open, statements, { decision })).toContain('c_open_2["❓ question ouverte');
	});

	it('une section sans énoncé mais avec des questions ne se dit pas « en cours de délibération » à vide', () => {
		expect(generateMermaidDiagram(subject, open, [], undefined)).not.toContain('Architecture en cours de délibération');
		expect(generateStructurizrDSL(subject, open, [], undefined)).not.toContain('Socle Architectural');
	});

	it('SysML et JSON portent la même information', () => {
		expect(generateSysMLv2(subject, open, statements, { decision })).toContain('attribute detail : String = "→ security_architect";');
		expect(generateSysMLVisualMermaid(subject, open, statements, { decision })).toContain('+provisoire: PROVISOIRE');
		const cfg = JSON.parse(generateConfigJSON(subject, open, statements, 'x', { decision }));
		expect(cfg.provisional).toMatch(/^PROVISOIRE/);
		expect(cfg.openPoints.map((p: any) => p.kind)).toEqual(['suppose', 'conflit', 'manque']);
		expect(JSON.parse(generateConfigJSON(subject, settled, statements, 'x')).provisional).toBeNull();
	});
});

describe('dossier scellé : le bandeau provisoire des schémas globaux', () => {
	const decided = { id: 'd', retainedOptionId: 'o', rejected: [], rationale: 'r', complianceStatus: 'Compliant', complianceRationale: 'ok', arbiterId: 'lead@x.org', decidedAt: new Date('2026-10-14T00:00:00Z') };
	const build = (subjectExtra: object) =>
		(assembleEngagementBundle({
			project: { id: 'p', title: 'Projet' }, confidentiality: 'confidential', now: new Date('2026-10-14T00:00:00Z'), sources: [],
			subjects: [{ id: 'sub-api', sectionRef: '§3.2', name: 'API', domain: 'infra', maturityLevel: 'L3_decided', requirementRefs: [], decision: decided, options: [{ id: 'o', title: 'Envoy' }], questions: [], ...subjectExtra }],
			statements: [{ id: 'st-0', subjectId: 'sub-api', subjectRef: 'api', predicate: 'a', value: 'v', confidence: 'verified', productionMode: 'human-authored', author: 'a@x.org', createdAt: new Date('2026-10-14T00:00:00Z') }]
		} as unknown as AssemblyInput).data as any).architecture.projections;

	it('une question ouverte ou un sujet sans décision rend les trois schémas globaux provisoires', () => {
		const p = build({ questions: [{ id: 'q', text: 'HSM ?', blocking: true, status: 'open' }] });
		expect(p.mermaid).toContain('BANNER["⚠ PROVISOIRE · 1 question ouverte');
		expect(p.structurizr_dsl).toContain('PROVISOIRE · 1 question ouverte');
		expect(p.sysml_v2).toContain('PROVISOIRE · 1 question ouverte');
		expect(build({ decision: null }).mermaid).toContain('1 sujet sans décision');
	});

	it('un dossier entièrement décidé, sans question ouverte, n\'a pas de bandeau', () => {
		expect(build({}).mermaid).not.toContain('PROVISOIRE');
	});
});

/**
 * L'option retenue doit atteindre les schémas affichés à l'écran et ceux qu'on scelle. Avant, `getProjectionContext` ne passait ni la
 * décision ni les options (la matrice les charge dans ses propres composants) : aucun schéma de l'interface ne montrait l'option retenue.
 */
describe('contexte de projection du store', () => {
	it('sans décision chargée, aucune option n\'est « retenue » ; avec, elle l\'est avec son titre — et l\'arbitre n\'est pas transmis', async () => {
		const { deliberationStore } = await import('$lib/stores/deliberationStore.svelte');
		deliberationStore.subjects = [subject];
		deliberationStore.drafts = { [subject.id]: draft };
		deliberationStore.statements = statements;

		expect(deliberationStore.getProjectionContext(subject.id).decision).toBeNull();
		expect(deliberationStore.getProjections(subject.id)!.mermaid).not.toContain('Option retenue');

		deliberationStore.decisionContexts[subject.id] = {
			decision: { id: 'd', subjectId: subject.id, retainedOptionId: 'o2', rejected: [], rationale: 'Clés souveraines', reversibility: 'costly', arbiterId: 'lead@x.org', arbiterRole: 'lead_architect', decidedAt: '2026-10-14T00:00:00Z', acceptedViolations: [], kbCandidateIds: [] },
			options: [
				{ id: 'o1', subjectId: subject.id, title: 'HAProxy', summary: '', origin: 'human', kbRefs: [], status: 'rejected', author: 'a', role: 'r', productionMode: 'human-authored', version: 1 },
				{ id: 'o2', subjectId: subject.id, title: 'Envoy en cluster', summary: '', origin: 'human', kbRefs: [], status: 'retained', author: 'a', role: 'r', productionMode: 'human-authored', version: 1 }
			]
		} as never;

		const ctx = deliberationStore.getProjectionContext(subject.id);
		expect(ctx.decision).toMatchObject({ retainedOptionId: 'o2', retainedOptionTitle: 'Envoy en cluster', reversibility: 'costly', arbiterRole: 'lead_architect' });
		expect(JSON.stringify(ctx)).not.toContain('lead@x.org');
		expect(ctx.options!.map((o) => o.title)).toEqual(['HAProxy', 'Envoy en cluster']);

		const p = deliberationStore.getProjections(subject.id)!;
		expect(p.mermaid).toContain('Option retenue : Envoy en cluster');
		expect(p.structurizrDSL).toContain('"Envoy en cluster"');
		expect(JSON.parse(p.configJSON).decision.retainedOptionTitle).toBe('Envoy en cluster');
	});
});
