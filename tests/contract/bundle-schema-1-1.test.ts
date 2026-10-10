import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { assembleEngagementBundle, type AssemblyInput } from '$lib/domain/bundleAssembly';
import { verifyEngagementBundle } from '$lib/domain/bundleVerifier';
import { renderTraceabilityMatrix } from '$lib/domain/bundleRtm';
import { requirementBundleId, sourceSha256 } from '$lib/domain/requirementAudit';

const load = (f: string) => JSON.parse(readFileSync(new URL(`../fixtures/bundle/${f}`, import.meta.url), 'utf-8'));
const compile = (schema: object) => {
	const ajv = new Ajv({ allErrors: true, strict: false });
	addFormats(ajv);
	return ajv.compile(schema);
};
const errors = (v: ReturnType<typeof compile>) => (v.errors ?? []).map((e) => `${e.instancePath} ${e.message} ${JSON.stringify(e.params)}`);

const SHA = sourceSha256('RFP intégral');
const rid = (ref: string) => requirementBundleId(SHA, ref);
const T0 = new Date('2026-10-01T08:00:00Z');
const HUB = { engagement_id: 'eng-1', snapshot_id: 'eng-eng-1-0123456789ab', checksum: `sha256:${'a'.repeat(64)}` };

function input(): AssemblyInput {
	return {
		project: { id: 'p1', title: 'Projet A' },
		confidentiality: 'internal',
		now: T0,
		sources: [
			{
				sha256: SHA, title: 'RFP A', kind: 'rfp', language: 'fr',
				requirements: [
					{ position: 0, clauseRef: 'R-1', title: 'Autonomie', text: '30 jours.', criticality: 'bloquant', category: 'NFR', proposedDisposition: 'deliberated', proposedReason: 'Coût contre dépendance', proposedBy: 'model:m1', proposedAt: T0, decidedDisposition: 'deliberated', decidedBy: '@alice', decidedAt: new Date('2026-10-02T09:00:00Z') },
					{ position: 1, clauseRef: 'R-2', title: 'Mobilier', text: 'Six postes.', criticality: 'info', proposedDisposition: 'evacuated', proposedReason: 'Hors périmètre', proposedBy: 'model:m1', proposedAt: T0 },
					{ position: 2, clauseRef: 'R-3', title: 'Chiffrement', text: 'Flux chiffrés.', criticality: 'bloquant', proposedDisposition: 'to_qualify', proposedReason: 'Indécis', proposedBy: 'model:m1', proposedAt: T0 },
					{ position: 3, clauseRef: 'R-4', title: 'Délai', text: 'Délai ?', criticality: 'majeur', proposedDisposition: 'clarification_needed', clarificationQuestion: 'Quel délai de reprise est toléré ?', proposedBy: 'model:m1', proposedAt: T0 }
				]
			}
		],
		subjects: [
			{
				id: 's1', sectionRef: '§1', name: 'Synchronisation', maturityLevel: 'L3_decided', requirementRefs: [rid('R-1')],
				decision: { id: 'd1', retainedOptionId: 'o1', rejected: [{ optionId: 'o2', reason: 'Dépendant du transport' }], rationale: 'Autonomie locale.', arbiterId: 'bob@exemple.org', decidedAt: new Date('2026-10-05T10:00:00Z') },
				options: [{ id: 'o1', title: 'Horloge locale' }, { id: 'o2', title: 'Distribution réseau' }],
				questions: [{ id: 'q1', text: 'Quel MTIE ?', blocking: true, status: 'open' }]
			}
		],
		statements: [
			{ id: 'st1', subjectId: 's1', subjectRef: 'site', predicate: 'has_property', value: 'holdover 30', unit: 'j', productionMode: 'human-authored', author: 'bob@exemple.org', createdAt: T0 }
		]
	};
}

describe('Conformité au schéma 1.1', () => {
	const v11 = compile(load('engagement_bundle.schema.1.1.json'));

	it('un dossier assemblé par Archinex respecte le schéma 1.1', () => {
		const b = assembleEngagementBundle(input());
		expect(b.schemaVersion).toBe('1.1');
		v11(b);
		expect(errors(v11)).toEqual([]);
	});

	it('le schéma 1.1 refuse un champ inconnu sur une exigence (contrat fermé)', () => {
		const b = assembleEngagementBundle(input());
		(b.data.requirements[0] as unknown as Record<string, unknown>).surprise = 1;
		expect(v11(b)).toBe(false);
	});

	it('le dossier d\'exemple de la suite (1.0) reste vérifiable et conforme au schéma 1.0', () => {
		const v10 = compile(load('engagement_bundle.schema.json'));
		const example = load('engagement_bundle.example.json');
		v10(example);
		expect(errors(v10)).toEqual([]);
		expect(verifyEngagementBundle(example)).toEqual([]);
	});

	it('mode Hub : faits laissés au Hub, snapshot épinglé, dossier conforme et vérifié', () => {
		const b = assembleEngagementBundle({ ...input(), factsFromHub: HUB });
		v11(b);
		expect(errors(v11)).toEqual([]);
		expect(verifyEngagementBundle(b)).toEqual([]);
		expect(b.data.pins.hub_snapshot).toEqual(HUB);
		expect(b.data.decisions).toEqual([]);
		expect(b.data.statements).toEqual([]);
		// Archinex ne dit plus « décidé » : c'est un fait du Hub.
		expect(b.data.subjects[0].status).toBe('open');
		expect(b.data.subjects[0].decision_ids).toEqual([]);
		// Le processus reste dans le dossier.
		expect(b.data.requirements).toHaveLength(4);
		expect(b.data.gaps.some((g) => g.kind === 'requirement_unqualified')).toBe(true);
		expect(b.data.gaps.some((g) => g.kind === 'decided_without_decision')).toBe(false);
	});

	it('mode Hub : le sceau dépend du snapshot épinglé', () => {
		const a = assembleEngagementBundle({ ...input(), factsFromHub: HUB });
		const b = assembleEngagementBundle({ ...input(), factsFromHub: { ...HUB, checksum: `sha256:${'b'.repeat(64)}` } });
		const again = assembleEngagementBundle({ ...input(), factsFromHub: HUB, now: new Date('2031-01-01T00:00:00Z') });
		expect(a.checksum).not.toBe(b.checksum);
		expect(a.checksum).toBe(again.checksum);
	});

	it('refuse un snapshot Hub dont l\'empreinte est mal formée', () => {
		const b = assembleEngagementBundle({ ...input(), factsFromHub: { ...HUB, checksum: 'sha256:court' } });
		expect(verifyEngagementBundle(b).map((p) => p.path)).toContain('/data/pins/hub_snapshot/checksum');
	});

	it('la matrice de traçabilité se génère aussi depuis un dossier en mode Hub', () => {
		const md = renderTraceabilityMatrix(assembleEngagementBundle({ ...input(), factsFromHub: HUB }));
		expect(md).toMatch(/R-1.*À délibérer/);
	});
});
