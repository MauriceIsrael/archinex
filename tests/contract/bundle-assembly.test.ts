import { describe, it, expect } from 'vitest';
import { canonicalJson } from '$lib/domain/canonicalJson';
import { assembleEngagementBundle, sanitizeHandle, type AssemblyInput } from '$lib/domain/bundleAssembly';
import { verifyEngagementBundle, sealEngagementBundle } from '$lib/domain/bundleVerifier';
import { requirementBundleId, sourceBundleId, sourceSha256 } from '$lib/domain/requirementAudit';

const SHA = sourceSha256('texte intégral du RFP');
const SRC = sourceBundleId(SHA);
const rid = (ref: string) => requirementBundleId(SHA, ref);
const T0 = new Date('2026-10-01T08:00:00Z');

function baseInput(): AssemblyInput {
	return {
		project: { id: 'proj-1', title: 'Projet A' },
		confidentiality: 'internal',
		now: new Date('2026-10-09T12:00:00Z'),
		sources: [
			{
				sha256: SHA,
				title: 'RFP A',
				kind: 'rfp',
				language: 'fr',
				requirements: [
					{ position: 0, clauseRef: 'R-1', title: 'Autonomie', text: 'Autonomie de 30 jours.', criticality: 'bloquant', category: 'NFR', proposedDisposition: 'deliberated', proposedReason: 'Coût contre dépendance', proposedBy: 'model:m1', proposedAt: T0, decidedDisposition: 'deliberated', decidedBy: 'alice@exemple.org', decidedAt: new Date('2026-10-02T09:00:00Z') },
					{ position: 1, clauseRef: 'R-2', title: 'Mobilier', text: 'Six postes.', criticality: 'info', proposedDisposition: 'evacuated', proposedReason: 'Hors périmètre', proposedBy: 'model:m1', proposedAt: T0 },
					{ position: 2, clauseRef: 'R-3', title: 'Chiffrement', text: 'Flux chiffrés.', criticality: 'bloquant', proposedDisposition: 'to_qualify', proposedReason: 'Clause bloquante proposée à l\'évacuation', proposedBy: 'model:m1', proposedAt: T0 },
					{ position: 3, clauseRef: 'R-4', title: 'Délai', text: 'Délai de reprise ?', criticality: 'majeur', proposedDisposition: 'clarification_needed', clarificationQuestion: 'Quel délai de reprise est toléré ?', proposedBy: 'model:m1', proposedAt: T0 }
				]
			}
		],
		subjects: [
			{
				id: 'sub-b', sectionRef: '§2', name: 'Synchronisation', domain: 'network', maturityLevel: 'L3_decided', requirementRefs: [rid('R-1')],
				decision: { id: 'dec-b', retainedOptionId: 'opt-1', rejected: [{ optionId: 'opt-2', reason: 'Trop dépendant du transport' }], rationale: 'Autonomie locale retenue.', arbiterId: 'bob@exemple.org', decidedAt: new Date('2026-10-05T10:30:00Z') },
				options: [{ id: 'opt-1', title: 'Horloge locale' }, { id: 'opt-2', title: 'Distribution réseau' }],
				questions: [{ id: 'q-2', text: 'Quel MTIE ?', blocking: true, status: 'open' }, { id: 'q-1', text: 'Résolue', blocking: false, status: 'answered' }]
			},
			{ id: 'sub-a', sectionRef: '§1', name: 'Résilience', maturityLevel: 'L1_framed', requirementRefs: [], decision: null, options: [], questions: [] }
		],
		statements: [
			{ id: 'st-2', subjectId: 'sub-b', subjectRef: 'site', predicate: 'has_property', value: 'holdover 30', unit: 'j', productionMode: 'human-authored', author: 'bob@exemple.org', createdAt: new Date('2026-10-04T10:00:00Z') },
			{ id: 'st-1', subjectId: 'sub-b', subjectRef: 'site', predicate: 'uses', value: 'PTP', productionMode: 'llm-derived', author: 'agent', createdAt: new Date('2026-10-03T10:00:00Z') }
		]
	};
}

const reseal = (b: ReturnType<typeof assembleEngagementBundle>) => sealEngagementBundle(b);
const codes = (b: ReturnType<typeof assembleEngagementBundle>) => verifyEngagementBundle(b).map((p) => p.code);

describe('Assemblage déterministe du dossier scellé', () => {
	it('un état cohérent produit un dossier qui passe le vérificateur', () => {
		const b = assembleEngagementBundle(baseInput());
		expect(verifyEngagementBundle(b)).toEqual([]);
	});

	it('même état, heures d\'export différentes : exactement le même sceau', () => {
		const a = assembleEngagementBundle({ ...baseInput(), now: new Date('2026-10-09T12:00:00Z') });
		const b = assembleEngagementBundle({ ...baseInput(), now: new Date('2031-01-01T00:00:00Z') });
		expect(a.checksum).toBe(b.checksum);
		expect(canonicalJson(a.data)).toBe(canonicalJson(b.data));
		expect(a.createdAt).not.toBe(b.createdAt); // l'heure n'est que hors du sceau
	});

	it('l\'ordre dans lequel la base renvoie les lignes ne change pas le sceau', () => {
		const ref = assembleEngagementBundle(baseInput());
		const shuffled = baseInput();
		shuffled.subjects.reverse();
		shuffled.statements.reverse();
		shuffled.sources[0].requirements.reverse();
		shuffled.subjects.forEach((s) => s.questions.reverse());
		expect(assembleEngagementBundle(shuffled).checksum).toBe(ref.checksum);
	});

	it('une modification de l\'état change le sceau', () => {
		const ref = assembleEngagementBundle(baseInput());
		const changed = baseInput();
		changed.sources[0].requirements[1].proposedReason = 'Autre motif';
		expect(assembleEngagementBundle(changed).checksum).not.toBe(ref.checksum);
	});

	it('altérer une exigence après scellement est détecté', () => {
		const b = assembleEngagementBundle(baseInput());
		b.data.requirements[0].text = 'Autonomie de 3 jours.';
		expect(codes(b)).toContain('SEAL');
	});
});

describe('Rien n\'est fabriqué', () => {
	it('un projet sans sujet donne un dossier sans sujet, sans validation inventée', () => {
		const b = assembleEngagementBundle({ ...baseInput(), subjects: [], statements: [], sources: [] });
		expect(b.data.subjects).toEqual([]);
		expect(b.data.decisions).toEqual([]);
		expect(verifyEngagementBundle(b)).toEqual([]);
	});

	it('une décision est attribuée à son arbitre et datée de son arbitrage, pas de l\'export', () => {
		const b = assembleEngagementBundle(baseInput());
		const d = b.data.decisions[0];
		expect(d.provenance.by).toEqual(['@bob']);
		expect(d.provenance.at).toBe('2026-10-05T10:30:00.000Z');
		expect(d.decision).toBe('Option retenue : Horloge locale');
		expect(d.alternatives).toEqual([{ title: 'Distribution réseau', rejected_because: 'Trop dépendant du transport' }]);
		expect(d.title).toBe('Horloge locale');
		expect(d.rationale).toBe('Autonomie locale retenue.');
		expect(JSON.stringify(b)).not.toMatch(/@exemple\.org/);
	});

	it('un sujet au niveau décidé sans décision enregistrée reste ouvert et devient une lacune bloquante', () => {
		const input = baseInput();
		input.subjects[1].maturityLevel = 'L3_decided'; // sub-a n'a pas de décision
		const b = assembleEngagementBundle(input);
		expect(b.data.subjects.find((s) => s.id === 'sub-a')!.status).toBe('open');
		expect(b.data.gaps.find((g) => g.id === 'GAP-NODEC-sub-a')).toMatchObject({ blocking: true });
		expect(b.data.decisions.some((d) => d.subject_id === 'sub-a')).toBe(false);
		expect(verifyEngagementBundle(b)).toEqual([]);
	});

	it('un énoncé sans sujet n\'est pas rattaché au premier sujet venu : il devient une lacune', () => {
		const input = baseInput();
		input.statements[0].subjectId = null;
		const b = assembleEngagementBundle(input);
		expect(b.data.statements.find((s) => s.id === 'st-2')!.subject_id).toBe('');
		expect(b.data.gaps.some((g) => g.kind === 'statement_without_subject')).toBe(true);
	});
});

describe('Les exigences dans le dossier scellé', () => {
	it('liste la source avec son empreinte et chaque exigence dans l\'ordre du document', () => {
		const b = assembleEngagementBundle(baseInput());
		expect(b.data.source_documents).toEqual([{ id: SRC, kind: 'rfp', title: 'RFP A', language: 'fr', sha256: SHA.replace('sha256:', '') }]);
		expect(b.data.requirements.map((r) => r.clause_ref)).toEqual(['R-1', 'R-2', 'R-3', 'R-4']);
		expect(b.data.requirements.every((r) => r.source_document_id === SRC)).toBe(true);
	});

	it('une décision humaine l\'emporte sur la proposition du modèle et reste attribuée à une personne', () => {
		const b = assembleEngagementBundle(baseInput());
		const r1 = b.data.requirements.find((r) => r.clause_ref === 'R-1')!;
		expect(r1).toMatchObject({ disposition: 'deliberated', assertion_level: 'asserted' });
		expect(r1.provenance).toEqual({ basis: 'human_validation', by: ['@alice'], at: '2026-10-02T09:00:00.000Z' });
	});

	it('une proposition non revue reste « proposée » ; une clause non qualifiée reste « ouverte »', () => {
		const b = assembleEngagementBundle(baseInput());
		const by = (ref: string) => b.data.requirements.find((r) => r.clause_ref === ref)!;
		expect(by('R-2')).toMatchObject({ disposition: 'evacuated', assertion_level: 'proposed', disposition_reason: 'Hors périmètre' });
		expect(by('R-2').provenance).toMatchObject({ basis: 'ai_proposal', by: ['@model-m1'] });
		expect(by('R-3')).toMatchObject({ disposition: 'to_qualify', assertion_level: 'open' });
	});

	it('chaque clause non résolue apparaît comme lacune, bloquante si la clause est bloquante', () => {
		const b = assembleEngagementBundle(baseInput());
		const gap = (ref: string) => b.data.gaps.find((g) => g.requirement_id === rid(ref));
		expect(gap('R-3')).toMatchObject({ kind: 'requirement_unqualified', blocking: true });
		expect(gap('R-4')).toMatchObject({ kind: 'requirement_clarification', blocking: false });
		expect(gap('R-1')).toBeUndefined();
		expect(gap('R-2')).toBeUndefined();
	});

	it('le sujet cite ses exigences dans l\'ordre du document', () => {
		const input = baseInput();
		input.sources[0].requirements.push({ position: 4, clauseRef: 'R-5', title: 't', text: 'x', criticality: 'majeur', proposedDisposition: 'deliberated', proposedBy: 'model:m1', proposedAt: T0 });
		input.subjects[0].requirementRefs = [rid('R-5'), rid('R-1')];
		const b = assembleEngagementBundle(input);
		expect(b.data.subjects.find((s) => s.id === 'sub-b')!.requirement_ids).toEqual([rid('R-1'), rid('R-5')]);
	});
});

describe('Règles du vérificateur sur les exigences', () => {
	function tampered(mutate: (b: ReturnType<typeof assembleEngagementBundle>) => void) {
		const b = assembleEngagementBundle(baseInput());
		mutate(b);
		return reseal(b);
	}

	it('refuse une clause bloquante évacuée sans décision humaine', () => {
		const b = tampered((x) => {
			const r = x.data.requirements.find((q) => q.clause_ref === 'R-3')!;
			r.disposition = 'evacuated';
			r.disposition_reason = 'Fonction standard du marché';
			r.assertion_level = 'proposed';
			x.data.gaps = x.data.gaps.filter((g) => g.requirement_id !== r.id);
		});
		expect(codes(b)).toContain('REQ_BLOCKING_EVACUATED');
	});

	it('accepte une clause bloquante évacuée si un humain l\'a décidé', () => {
		const input = baseInput();
		Object.assign(input.sources[0].requirements[2], { decidedDisposition: 'evacuated', decidedReason: 'Couvert par le socle standard, validé en revue', decidedBy: 'alice@exemple.org', decidedAt: T0 });
		expect(verifyEngagementBundle(assembleEngagementBundle(input))).toEqual([]);
	});

	it('refuse une clause à délibérer qu\'aucun sujet ne porte', () => {
		const b = tampered((x) => {
			x.data.subjects.forEach((s) => (s.requirement_ids = []));
		});
		expect(codes(b)).toContain('REQ_UNCOVERED');
	});

	it('refuse qu\'un sujet cite une clause qui n\'est pas à délibérer', () => {
		const b = tampered((x) => {
			x.data.subjects[1].requirement_ids = [rid('R-2')];
		});
		expect(codes(b)).toContain('REQ_NOT_DELIBERATED');
	});

	it('refuse une clause non résolue qui n\'est pas listée dans les lacunes', () => {
		const b = tampered((x) => {
			x.data.gaps = x.data.gaps.filter((g) => !g.requirement_id);
		});
		expect(codes(b)).toContain('REQ_NO_GAP');
	});

	it('refuse une évacuation sans motif et une disposition inconnue', () => {
		const b1 = tampered((x) => {
			x.data.requirements.find((q) => q.clause_ref === 'R-2')!.disposition_reason = '';
		});
		expect(codes(b1)).toContain('REQ_UNJUSTIFIED');
		const b2 = tampered((x) => {
			(x.data.requirements[1] as { disposition: string }).disposition = 'banane';
		});
		expect(codes(b2)).toContain('REQ_DISPOSITION');
	});

	it('refuse « affirmé » sans humain identifié', () => {
		const b = tampered((x) => {
			const r = x.data.requirements.find((q) => q.clause_ref === 'R-2')!;
			r.assertion_level = 'asserted'; // mais la provenance reste « ai_proposal »
		});
		expect(codes(b)).toContain('UNBACKED_CLAIM');
	});

	it('un dossier sans audit des exigences (ancien format) reste valide', () => {
		const b = assembleEngagementBundle({ ...baseInput(), sources: [] });
		b.data.subjects.forEach((s) => (s.requirement_ids = []));
		expect(verifyEngagementBundle(reseal(b))).toEqual([]);
	});

	it('sanitizeHandle ne laisse jamais passer une adresse e-mail', () => {
		expect(sanitizeHandle('Alice.Martin@exemple.org')).toBe('@alice-martin');
		expect(sanitizeHandle('')).toBe('@lead-architect');
	});
});

describe('sanitizeHandle', () => {
	it('est idempotent et ne crédite jamais un auteur fantôme', () => {
		expect(sanitizeHandle('bob@exemple.org')).toBe('@bob');
		expect(sanitizeHandle('@bob')).toBe('@bob');
		expect(sanitizeHandle(sanitizeHandle('Bob.Martin@exemple.org'))).toBe(sanitizeHandle('Bob.Martin@exemple.org'));
	});
});
