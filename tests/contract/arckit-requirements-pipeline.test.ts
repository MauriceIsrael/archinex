import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { ExtractedClause } from '$lib/domain/corpus';
import { shredRfpTextToClauses } from '$lib/domain/rfpConfrontation';
import {
	applyClassificationInvariants,
	normalizeProposal,
	applySubjectInvariants,
	runRequirementsAudit,
	toFactorizationResponse,
	type AuditedRequirement,
	type AuditProgress,
	type ClassifyItem,
	type LlmPort,
	type RawSubject
} from '$lib/server/ingest/arckitRequirementsPipeline';

function clause(ref: string, criticality: ExtractedClause['criticality'] = 'majeur', title = `Exigence ${ref}`): ExtractedClause {
	return { id: `id-${ref}`, clauseRef: ref, title, text: `Texte de l'exigence ${ref}, suffisamment long.`, criticality };
}

const item = (ref: string, disposition: string, extra: Partial<ClassifyItem> = {}): ClassifyItem => ({
	ref,
	disposition,
	category: 'FR',
	reason: null,
	question: null,
	...extra
});

describe('Découpage du RFP de démonstration', () => {
	it('découpe la section 4 en 92 clauses natives REQ-Lot1', () => {
		const md = fs.readFileSync(path.resolve(process.cwd(), 'examples/lumicc-noc/rfp-section4-noc.md'), 'utf-8');
		const clauses = shredRfpTextToClauses(md);
		expect(clauses.length).toBe(92);
		expect(clauses[0].clauseRef).toBe('REQ-Lot1-191');
		expect(clauses[clauses.length - 1].clauseRef).toBe('REQ-Lot1-282');
	});
});

describe('Contrôles déterministes du classement', () => {
	const clauses = [clause('A'), clause('B'), clause('C', 'bloquant'), clause('D'), clause('E')];

	it('produit exactement une entrée par clause reçue, dans l\'ordre, quoi que réponde le modèle', () => {
		const out = applyClassificationInvariants(clauses, [
			item('B', 'deliberate', { reason: 'tension réelle entre coût et disponibilité' }),
			item('A', 'deliberate', { reason: 'tension réelle' }),
			item('ZZZ', 'commodity', { reason: 'référence inconnue du RFP' }), // ignorée
			item('A', 'commodity', { reason: 'doublon : le premier doit l\'emporter' }) // doublon
		]);
		expect(out.map((r) => r.clauseRef)).toEqual(['A', 'B', 'C', 'D', 'E']);
		expect(out.find((r) => r.clauseRef === 'A')!.disposition).toBe('deliberated');
	});

	it('laisse « à qualifier » toute clause absente de la réponse du modèle', () => {
		const out = applyClassificationInvariants(clauses, [item('A', 'deliberate')]);
		const missing = out.filter((r) => r.clauseRef !== 'A');
		expect(missing.every((r) => r.disposition === 'to_qualify' && !!r.qualifyReason)).toBe(true);
	});

	it('refuse d\'évacuer sans motif exploitable', () => {
		const out = applyClassificationInvariants([clause('A')], [item('A', 'commodity', { reason: 'ok' })]);
		expect(out[0].disposition).toBe('to_qualify');
	});

	it('n\'évacue jamais une clause bloquante, mais conserve la proposition du modèle pour l\'humain', () => {
		const out = applyClassificationInvariants(
			[clause('C', 'bloquant')],
			[item('C', 'commodity', { reason: 'fonction standard du marché sans arbitrage' })]
		);
		expect(out[0].disposition).toBe('to_qualify');
		expect(out[0].evacuationReason).toBeUndefined();
		expect(out[0].qualifyReason).toContain('fonction standard du marché');
	});

	it('accepte une évacuation motivée sur une clause non bloquante', () => {
		const out = applyClassificationInvariants(
			[clause('A', 'info')],
			[item('A', 'commodity', { reason: 'Fonction standard couverte par tout progiciel du marché' })]
		);
		expect(out[0].disposition).toBe('evacuated');
		expect(out[0].evacuationReason).toContain('progiciel');
	});

	it('exige une question pour une clarification, rejette une disposition inconnue et une catégorie invalide', () => {
		const out = applyClassificationInvariants(
			[clause('A'), clause('B'), clause('D')],
			[
				item('A', 'clarify', { question: null }),
				item('B', 'banane'),
				item('D', 'clarify', { question: 'Quel est le délai de bascule toléré ?', category: 'XYZ' })
			]
		);
		expect(out.map((r) => r.disposition)).toEqual(['to_qualify', 'to_qualify', 'clarification_needed']);
		expect(out[2].category).toBeUndefined();
	});

	it('tolère les variantes de vocabulaire du modèle', () => {
		const out = applyClassificationInvariants(
			[clause('A'), clause('B', 'info')],
			[item('A', 'Deliberated'), item('B', 'evacuate', { reason: 'Besoin standard sans arbitrage possible' })]
		);
		expect(out.map((r) => r.disposition)).toEqual(['deliberated', 'evacuated']);
	});
});

describe('Contrôles déterministes du regroupement en sujets', () => {
	const refs = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];
	const deliberated: AuditedRequirement[] = refs.map((r) => ({
		id: r,
		clauseRef: r,
		title: r,
		text: r,
		criticality: 'majeur',
		disposition: 'deliberated'
	}));
	const raw = (name: string, covered: string[], extra: Partial<RawSubject> = {}): RawSubject => ({
		name,
		coveredClauseRefs: covered,
		...extra
	});

	it('place chaque clause dans exactement un sujet (le premier qui la revendique)', () => {
		const { subjects } = applySubjectInvariants(deliberated, [raw('S1', ['R1', 'R2', 'R3']), raw('S2', ['R3', 'R4', 'R5', 'R6'])], []);
		const all = subjects.flatMap((s) => s.coveredClauseRefs);
		expect(all.sort()).toEqual([...refs].sort());
		expect(new Set(all).size).toBe(all.length);
		expect(subjects[0].coveredClauseRefs).toContain('R3');
		expect(subjects[1].coveredClauseRefs).not.toContain('R3');
	});

	it('rattache par proximité une clause oubliée et la signale', () => {
		const { subjects, attachedByProximity } = applySubjectInvariants(deliberated, [raw('S1', ['R1', 'R2']), raw('S2', ['R5', 'R6'])], []);
		expect(attachedByProximity.sort()).toEqual(['R3', 'R4']);
		expect(subjects.flatMap((s) => s.coveredClauseRefs).sort()).toEqual([...refs].sort());
		expect(subjects[0].coveredClauseRefs).toContain('R3'); // voisin R2
		expect(subjects[1].coveredClauseRefs).toContain('R4'); // voisin R5
	});

	it('ignore les références inventées et écarte les sujets vides', () => {
		const { subjects, droppedEmpty } = applySubjectInvariants(deliberated, [raw('Fantôme', ['X1', 'X2']), raw('Réel', refs)], []);
		expect(droppedEmpty).toBe(1);
		expect(subjects).toHaveLength(1);
		expect(subjects[0].coveredClauseRefs).toEqual(refs);
	});

	it('ne conserve que des ids de doctrine réellement fournis et ne prétend pas « standard » sans appui', () => {
		const kb = [{ id: 'KH:ADR-0001', title: 't', category: 'c', ruleOrStatement: 'r' }];
		const { subjects } = applySubjectInvariants(
			deliberated,
			[
				raw('Appuyé', ['R1', 'R2', 'R3'], { knowledgeAlignment: 'standard_established', matchedKbItemIds: ['KH:ADR-0001', 'KH:INVENTE'] }),
				raw('Sans appui', ['R4', 'R5', 'R6'], { knowledgeAlignment: 'standard_established', matchedKbItemIds: ['KH:INVENTE'] })
			],
			kb
		);
		expect(subjects[0].matchedKbItemIds).toEqual(['KH:ADR-0001']);
		expect(subjects[0].knowledgeAlignment).toBe('standard_established');
		expect(subjects[1].matchedKbItemIds).toEqual([]);
		expect(subjects[1].knowledgeAlignment).toBe('novel_requirement');
	});

	it('normalise rôle, effort, niveau et identifiants', () => {
		const { subjects } = applySubjectInvariants(
			deliberated,
			[raw('S1', refs, { waitingForRole: 'roi du monde', effort: 'énorme' })],
			[],
			3
		);
		expect(subjects[0].id).toBe('SUBJ-04');
		expect(subjects[0].waitingForRole).toBe('lead_architect');
		expect(subjects[0].effort).toBe('M');
		expect(subjects[0].initialLevel).toBe('L0_unassessed');
	});
});

/** Faux LLM déterministe : lit les références envoyées et répond selon une règle simple. */
function fakeLlm(
	opts: { failClassify?: boolean; failGroup?: boolean; badJsonOnce?: boolean; failInstruct?: boolean; failPartitionContaining?: string; failTriage?: boolean } = {}
) {
	const calls = { classify: 0, group: 0, instruct: 0, triage: 0 };
	let badServed = false;
	const llm: LlmPort = {
		async chat({ messages }) {
			const system = messages.find((m) => m.role === 'system')!.content;
			const user = messages.find((m) => m.role === 'user')!.content;
			const refs = [...user.matchAll(/^\[([^\]]+)\] \(criticité/gm)].map((m) => m[1]);
			if (system.includes('plan de délibération')) {
				calls.triage++;
				if (opts.failTriage) return 'pas du JSON';
				const ids = [...user.matchAll(/^\[(SUBJ-[^\]]+)\]/gm)].map((m) => m[1]);
				return JSON.stringify({
					subjects: ids.map((id, i) => ({
						id,
						importance: i === ids.length - 1 ? 'H' : 'M',
						difficulty: 'H',
						nature: i === 0 ? 'contractuel' : 'architecture',
						dependsOn: i > 0 ? [ids[0], 'SUBJ-INVENTE', id] : [],
						overlapsWith: i === 1 ? [ids[0]] : [],
						rationale: "Pèse sur la conformité de l'offre."
					}))
				});
			}
			if (system.includes('Tu instruis UN sujet')) {
				calls.instruct++;
				if (opts.failInstruct) throw new Error('Délai d\'inférence dépassé');
				return JSON.stringify({
					waitingForRole: 'infra_expert_architect',
					effort: 'L',
					knowledgeAlignment: 'novel_requirement',
					matchedKbItemIds: [],
					alignmentRationale: 'Aucune règle de doctrine ne couvre ce choix.',
					seed: {
						initialQuestion: `Quelle option retenir pour ${refs.length} exigences ?`,
						initialHypothesis: 'Hypothèse : option A, car l\'option B ne tient pas le délai de bascule.',
						initialConflict: `${refs[0]} contre ${refs[refs.length - 1]}`,
						initialRetenu: refs.slice(0, 3).map((r) => `${r} : exigence`),
						expertQuestions: ['Le délai de bascule est-il contractuel ?']
					}
				});
			}
			if (system.includes('Tu tries les exigences')) {
				calls.classify++;
				if (opts.failClassify) throw new Error('ECONNREFUSED');
				if (opts.badJsonOnce && !badServed) {
					badServed = true;
					return 'Voici mon analyse : pas de JSON';
				}
				return JSON.stringify({
					items: refs.map((ref) => {
						const n = parseInt(ref.replace(/\D/g, ''), 10) || 0;
						if (n % 5 === 0) return { ref, category: 'FAC', disposition: 'commodity', reason: 'Fonction standard couverte par le marché' };
						if (n % 7 === 0) return { ref, category: 'BR', disposition: 'clarify', question: 'Quelle est la frontière de responsabilité exacte ?' };
						return { ref, category: 'NFR', disposition: 'deliberate', reason: 'Tension entre disponibilité et coût' };
					})
				});
			}
			calls.group++;
			if (opts.failGroup) return 'pas du JSON';
			if (opts.failPartitionContaining && refs.includes(opts.failPartitionContaining)) return 'pas du JSON';
			const third = Math.ceil(refs.length / 3);
			return JSON.stringify({
				subjects: [0, 1, 2]
					.map((i) => refs.slice(i * third, (i + 1) * third))
					.filter((part) => part.length > 0)
					.map((part, i) => ({
						name: `Dilemme ${refs[0]}-${i + 1}`,
						dilemma: `Que choisir pour ${i + 1} ?`,
						sectionRef: '§4',
						coveredClauseRefs: part
					}))
			});
		}
	};
	return { llm, calls };
}

describe('Pipeline complet avec un faux modèle', () => {
	const md = fs.readFileSync(path.resolve(process.cwd(), 'examples/lumicc-noc/rfp-section4-noc.md'), 'utf-8');
	const clauses = shredRfpTextToClauses(md);

	it('traite les 92 clauses : une disposition chacune, aucune évacuation bloquante, sujets sans trou', async () => {
		const { llm, calls } = fakeLlm();
		const res = await runRequirementsAudit(clauses, { llm, model: 'faux-modele', classifyBatchSize: 40 });

		expect(res.status).toBe('ok');
		expect(calls.classify).toBe(3); // 92 clauses en lots de 40
		const r = res.report;
		expect(calls.group).toBe(Math.ceil(r.deliberatedCount / 40)); // cartographie par parties de 40 (petite fenêtre)
		expect(calls.instruct).toBe(res.subjects.length); // chaque sujet est instruit
		expect(res.subjects.every((s) => s.waitingForRole === 'infra_expert_architect' && s.effort === 'L')).toBe(true);
		expect(res.subjects.every((s) => (s.seed.expertQuestions ?? []).length > 0)).toBe(true);
		expect(res.subjects.map((s) => s.id)).toEqual(res.subjects.map((_, i) => `SUBJ-${String(i + 1).padStart(2, '0')}`));
		expect(r.requirements).toHaveLength(92);
		expect(r.deliberatedCount + r.evacuatedCount + r.clarificationCount + r.toQualifyCount).toBe(92);
		expect(r.requirements.filter((x) => x.disposition === 'evacuated' && x.criticality === 'bloquant')).toHaveLength(0);
		expect(r.requirements.filter((x) => x.disposition === 'evacuated').every((x) => !!x.evacuationReason)).toBe(true);

		const deliberated = r.requirements.filter((x) => x.disposition === 'deliberated').map((x) => x.clauseRef);
		const inSubjects = res.subjects.flatMap((s) => s.coveredClauseRefs);
		expect(inSubjects.sort()).toEqual([...deliberated].sort());
		expect(new Set(inSubjects).size).toBe(inSubjects.length);
		expect(r.requirements.filter((x) => x.disposition === 'deliberated').every((x) => !!x.linkedSubjectId)).toBe(true);
		expect(res.subjects.every((s) => s.initialLevel === 'L0_unassessed')).toBe(true);
	});

	it('la réponse d\'API ne prétend pas à une couverture complète quand des clauses restent à qualifier', async () => {
		const { llm } = fakeLlm();
		// Les clauses que le faux modèle veut évacuer (numéro multiple de 5) deviennent bloquantes :
		// le contrôle d'intégrité doit toutes les renvoyer à l'humain.
		const hardened = clauses.map((c) => (parseInt(c.clauseRef.replace(/\D/g, ''), 10) % 5 === 0 ? { ...c, criticality: 'bloquant' as const } : c));
		const res = await runRequirementsAudit(hardened, { llm, model: 'faux-modele' });
		expect(res.report.evacuatedCount).toBe(0);
		const api = toFactorizationResponse(res);
		const expected = Math.round(((res.report.totalCount - res.report.toQualifyCount) / res.report.totalCount) * 100);
		expect(api.coverageRate).toBe(expected);
		expect(res.report.toQualifyCount).toBeGreaterThan(0); // les évacuations bloquantes sont renvoyées à l'humain
		expect(api.coverageRate).toBeLessThan(100);
		expect(api.summary).toContain('propositions du modèle');
	});

	it('LLM injoignable : tout est « à qualifier », rien n\'est évacué, aucun sujet inventé', async () => {
		const { llm } = fakeLlm({ failClassify: true });
		const res = await runRequirementsAudit(clauses, { llm, model: 'faux-modele' });
		expect(res.status).toBe('unavailable');
		expect(res.subjects).toEqual([]);
		expect(res.report.evacuatedCount).toBe(0);
		expect(res.report.toQualifyCount).toBe(92);
		expect(res.report.requirements.every((x) => x.disposition === 'to_qualify')).toBe(true);
	});

	it('JSON invalide une fois : une relance suffit', async () => {
		const { llm, calls } = fakeLlm({ badJsonOnce: true });
		const res = await runRequirementsAudit(clauses.slice(0, 10), { llm, model: 'faux-modele' });
		expect(res.status).toBe('ok');
		expect(calls.classify).toBe(2);
	});

	it('regroupement impossible : le classement est conservé, le statut est « partiel »', async () => {
		const { llm } = fakeLlm({ failGroup: true });
		const res = await runRequirementsAudit(clauses, { llm, model: 'faux-modele' });
		expect(res.status).toBe('partial');
		expect(res.subjects).toEqual([]);
		expect(res.report.deliberatedCount).toBeGreaterThan(0);
		expect(res.warnings.join(' ')).toContain('Regroupement');
	});

	it('grande fenêtre : la cartographie voit toutes les clauses à délibérer en un seul appel', async () => {
		const { llm, calls } = fakeLlm();
		const res = await runRequirementsAudit(clauses, { llm, model: 'faux-modele', largeContext: true });
		expect(res.status).toBe('ok');
		expect(calls.group).toBe(1);
		expect(res.subjects.length).toBe(3);
	});

	it('sujet non instruit : son périmètre est conservé et signalé, rien n\'est perdu', async () => {
		const { llm } = fakeLlm({ failInstruct: true });
		const res = await runRequirementsAudit(clauses, { llm, model: 'faux-modele', largeContext: true });
		expect(res.status).toBe('ok');
		expect(res.subjects.length).toBe(3);
		expect(res.subjects[0].seed.initialQuestion).toBe('Que choisir pour 1 ?'); // dilemme de la cartographie
		expect(res.warnings.join(' ')).toContain('pas pu être instruits');
		const deliberated = res.report.requirements.filter((x) => x.disposition === 'deliberated');
		expect(deliberated.every((x) => !!x.linkedSubjectId)).toBe(true);
	});

	it('partie de cartographie en échec : ses clauses restent sans sujet, jamais rattachées par proximité', async () => {
		const probe = await runRequirementsAudit(clauses, { llm: fakeLlm().llm, model: 'faux-modele' });
		const firstDeliberated = probe.report.requirements.find((x) => x.disposition === 'deliberated')!.clauseRef;
		const { llm } = fakeLlm({ failPartitionContaining: firstDeliberated });
		const res = await runRequirementsAudit(clauses, { llm, model: 'faux-modele' });
		expect(res.status).toBe('partial');
		const failed = res.report.requirements.find((x) => x.clauseRef === firstDeliberated)!;
		expect(failed.linkedSubjectId).toBeUndefined();
		expect(res.subjects.length).toBeGreaterThan(0);
		expect(res.subjects.flatMap((s) => s.coveredClauseRefs)).not.toContain(firstDeliberated);
	});

	it('publie son avancement, avec un état exploitable après le tri puis après la cartographie', async () => {
		const events: AuditProgress[] = [];
		const res = await runRequirementsAudit(clauses, { llm: fakeLlm().llm, model: 'faux-modele', largeContext: true, onProgress: (p) => events.push(p) });
		const classify = events.filter((e) => e.stage === 'classify');
		expect(classify.at(-1)).toMatchObject({ done: 3, total: 3 });
		const [afterTriage, afterMapping] = events.filter((e) => e.snapshot);
		expect(afterTriage.snapshot!.subjects).toEqual([]);
		expect(afterTriage.snapshot!.report.deliberatedCount).toBe(res.report.deliberatedCount);
		expect(afterMapping.snapshot!.subjects.map((s) => s.coveredClauseRefs)).toEqual(res.subjects.map((s) => s.coveredClauseRefs));
		expect(events.filter((e) => e.stage === 'instruct').at(-1)).toMatchObject({ done: 3, total: 3 });
	});

	it('un suivi d\'avancement défaillant ne fait jamais échouer l\'audit', async () => {
		const res = await runRequirementsAudit(clauses.slice(0, 10), {
			llm: fakeLlm().llm,
			model: 'faux-modele',
			onProgress: () => {
				throw new Error('base indisponible');
			}
		});
		expect(res.status).toBe('ok');
	});

	it('synthèse transverse : priorités, nature, dépendances et recouvrements contrôlés', async () => {
		const { llm, calls } = fakeLlm();
		const res = await runRequirementsAudit(clauses, { llm, model: 'faux-modele', largeContext: true });
		expect(calls.triage).toBe(1);
		const [first, second, third] = res.subjects;
		expect(third.triage).toMatchObject({ importance: 'H', difficulty: 'H', rank: 1 }); // seul H/H : en tête
		expect(first.triage!.nature).toBe('contractuel');
		expect(second.triage!.dependsOn).toEqual([first.id]); // id inventé et auto-référence écartés
		expect(first.triage!.overlapsWith).toEqual([second.id]); // recouvrement rendu symétrique
		expect(res.warnings.join(' ')).not.toContain('Priorités');
	});

	it('synthèse transverse indisponible : les sujets restent complets, sans priorités inventées', async () => {
		const res = await runRequirementsAudit(clauses, { llm: fakeLlm({ failTriage: true }).llm, model: 'faux-modele', largeContext: true });
		expect(res.status).toBe('ok');
		expect(res.subjects).toHaveLength(3);
		expect(res.subjects.every((s) => s.triage === undefined)).toBe(true);
		expect(res.warnings.join(' ')).toContain('Priorités et dépendances indisponibles pour 3 sujet(s)');
	});

	it('relance avec cache : les étapes déjà calculées ne rappellent pas le modèle', async () => {
		const store = new Map<string, unknown>();
		const cache = {
			get: async (key: string) => store.get(key),
			set: async (key: string, _stage: string, value: unknown) => void store.set(key, value)
		};
		const first = fakeLlm();
		const a = await runRequirementsAudit(clauses, { llm: first.llm, model: 'faux-modele', cache });
		expect(first.calls.classify + first.calls.group + first.calls.instruct).toBeGreaterThan(0);

		const second = fakeLlm({ failClassify: true, failGroup: true, failInstruct: true });
		const b = await runRequirementsAudit(clauses, { llm: second.llm, model: 'faux-modele', cache });
		expect(second.calls).toEqual({ classify: 0, group: 0, instruct: 0, triage: 0 });
		expect(b.status).toBe('ok');
		expect(b.subjects).toEqual(a.subjects);
	});

	it('un autre RFP n\'est pas déclaré « sans enjeu » : les exigences dures sont délibérées', async () => {
		const other = [
			clause('§3.1', 'bloquant', 'Holdover 30 jours'),
			clause('§3.2', 'bloquant', 'Chiffrement SecNumCloud'),
			clause('§5.1', 'info', 'Mobilier')
		];
		const llm: LlmPort = {
			async chat({ messages }) {
				const system = messages[0].content;
				if (system.includes('Tu tries les exigences')) {
					return JSON.stringify({
						items: [
							{ ref: '§3.1', category: 'NFR', disposition: 'deliberate', reason: 'Autonomie 30 jours : coût des oscillateurs contre dépendance au transport' },
							{ ref: '§3.2', category: 'NFR', disposition: 'commodity', reason: 'Chiffrement standard' },
							{ ref: '§5.1', category: 'FAC', disposition: 'commodity', reason: 'Aménagement de salle hors périmètre d\'architecture' }
						]
					});
				}
				return JSON.stringify({ subjects: [{ name: 'Tenue de la synchronisation sans GNSS', coveredClauseRefs: ['§3.1'] }] });
			}
		};
		const res = await runRequirementsAudit(other, { llm, model: 'faux-modele' });
		const byRef = Object.fromEntries(res.report.requirements.map((r) => [r.clauseRef, r.disposition]));
		expect(byRef['§3.1']).toBe('deliberated');
		expect(byRef['§3.2']).toBe('to_qualify'); // bloquant : jamais évacué sans humain
		expect(byRef['§5.1']).toBe('evacuated');
		expect(res.subjects).toHaveLength(1);
	});
});

describe('Aucune donnée de RFP dans le code', () => {
	it('le pipeline ne contient aucune référence ni nom propre à un RFP', () => {
		const src = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/server/ingest/arckitRequirementsPipeline.ts'), 'utf-8');
		for (const forbidden of [/REQ-Lot/i, /LUMICC/i, /ADR-NOC/i, /\bNOC\b/, /Rubidium/i, /\bMNO\b/]) {
			expect(src).not.toMatch(forbidden);
		}
	});
});

describe('Proposition d\'options et de critères : contrôles déterministes', () => {
	it('ne garde que des évaluations justifiées visant des options et critères proposés, scores bornés', () => {
		const p = normalizeProposal({
			options: [{ title: 'A', summary: 'a' }, { title: 'a', summary: 'doublon' }, { title: 'B', summary: null }],
			criteria: [{ name: 'Coût', kind: 'cost', weight: 9 }, { name: 'Risque', kind: 'inconnu', weight: null }],
			evaluations: [
				{ option: 'A', criterion: 'coût', score: 7, justification: 'Cher.' },
				{ option: 'B', criterion: 'Risque', score: -1, justification: '' },
				{ option: 'Z', criterion: 'Coût', score: 1, justification: 'Option inventée.' }
			],
			singleOptionRationale: 'Ignorée : deux options'
		})!;
		expect(p.options.map((o) => o.title)).toEqual(['A', 'B']);
		expect(p.criteria).toEqual([
			{ name: 'Coût', kind: 'cost', weight: 5, description: '' },
			{ name: 'Risque', kind: 'nfr', weight: 3, description: '' }
		]);
		expect(p.evaluations).toEqual([{ option: 'A', criterion: 'Coût', score: 2, justification: 'Cher.' }]);
		expect(p.singleOptionRationale).toBeUndefined();
	});

	it('option unique : la justification est conservée ; sans option, pas de proposition', () => {
		expect(normalizeProposal({ options: [{ title: 'Seule voie' }], singleOptionRationale: ' Imposée par le RFP. ' })!.singleOptionRationale).toBe('Imposée par le RFP.');
		expect(normalizeProposal({ options: [], criteria: [{ name: 'Coût' }] })).toBeUndefined();
	});
});
