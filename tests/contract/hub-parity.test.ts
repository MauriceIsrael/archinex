import { describe, it, expect } from 'vitest';
import { assembleEngagementBundle, type AssemblyInput } from '$lib/domain/bundleAssembly';
import { compareBundleWithHubSnapshot } from '$lib/domain/hubParity';
import { hubSnapshotProblems, requireVerifiedHubSnapshot, type HubEngagementSnapshot } from '$lib/domain/hubSnapshot';
import { viewFromHubSnapshot, renderTraceabilityView } from '$lib/domain/traceability';
import { hubRequirementId } from '$lib/domain/hubRequirementId';
import { canonicalJson } from '$lib/domain/canonicalJson';
import { universalSha256 } from '$lib/validation/epistemicEnvelope';
import { requirementBundleId, sourceSha256 } from '$lib/domain/requirementAudit';

const SHA = sourceSha256('RFP intégral');
const R1 = requirementBundleId(SHA, 'R-1');
const R2 = requirementBundleId(SHA, 'R-2');
const T0 = new Date('2026-10-01T08:00:00Z');

function bundle() {
	const input: AssemblyInput = {
		project: { id: 'p1', title: 'Projet' },
		confidentiality: 'internal',
		now: T0,
		sources: [{
			sha256: SHA, title: 'RFP', kind: 'rfp', language: 'fr',
			requirements: [
				{ position: 0, clauseRef: 'R-1', title: 'Autonomie', text: 'Autonomie de 30 jours.', criticality: 'bloquant', proposedDisposition: 'deliberated', proposedBy: 'model:m', proposedAt: T0, decidedDisposition: 'deliberated', decidedBy: '@dan', decidedAt: T0 },
				{ position: 1, clauseRef: 'R-2', title: 'Mobilier', text: 'Six postes.', criticality: 'info', proposedDisposition: 'evacuated', proposedReason: 'Hors périmètre technique', proposedBy: 'model:m', proposedAt: T0, decidedDisposition: 'evacuated', decidedReason: 'Hors périmètre technique', decidedBy: '@dan', decidedAt: T0 }
			]
		}],
		subjects: [{
			id: 's1', sectionRef: '§1', name: 'Autonomie', maturityLevel: 'L3_decided', requirementRefs: [R1],
			decision: { id: 'd1', retainedOptionId: 'oa', rejected: [{ optionId: 'ob', reason: 'Dépend du transport' }], rationale: 'Horloge locale.', arbiterId: 'dan@x.org', decidedAt: T0 },
			options: [{ id: 'oa', title: 'Horloge locale' }, { id: 'ob', title: 'Distribution réseau' }], questions: []
		}],
		statements: []
	};
	return assembleEngagementBundle(input);
}

function snapshot(change: (d: HubEngagementSnapshot['data']) => void = () => {}): HubEngagementSnapshot {
	const data = {
		engagement: { id: 'eng-x', confidentiality: 'internal' },
		is_provisional: false,
		provisional_reasons: { unripe_subjects: 0, open_conflicts: 0 },
		requirements: [
			{ id: hubRequirementId(R1), text: 'Autonomie de 30 jours.', section: 'R-1', category: 'general', criticality: 'bloquant', status: 'gap',
			  disposition: { value: 'deliberated', reason: '', status: 'active', assertion_level: 'asserted', author: '@carl', validated_by: '@dan', validated_at: '2026-10-02T10:00:00' } },
			{ id: hubRequirementId(R2), text: 'Six postes.', section: 'R-2', category: 'general', criticality: 'info', status: 'gap',
			  disposition: { value: 'evacuated', reason: 'Hors périmètre technique', status: 'active', assertion_level: 'asserted', author: '@carl', validated_by: '@dan', validated_at: '2026-10-02T10:00:00' } }
		],
		subjects: [{ id: 'eng-x:Autonomie', name: 'Autonomie', definition: '', maturity: 'L3_decided', origin: 'declared', requirement_ids: [hubRequirementId(R1)] }],
		decisions: [{ id: 'D-1', subject: 'Autonomie', decision: 'Horloge locale', rationale: 'Horloge locale.', rejected: [{ option: 'Distribution réseau', reason: 'Dépend du transport' }], status: 'active', assertion_level: 'asserted', author: '@carl', validated_by: '@dan', validated_at: '2026-10-03T10:00:00' }],
		statements: [], conflicts: [], gaps: [], kb_references: []
	} as unknown as HubEngagementSnapshot['data'];
	change(data);
	const checksum = `sha256:${universalSha256(canonicalJson(data))}`;
	return { schemaVersion: '1.6', snapshotId: `eng-eng-x-${checksum.slice(7, 19)}`, sourceSystem: 'knowledge-hub', emitter: 'knowledge-hub', createdAt: '2026-10-03T12:00:00Z', sourceRevision: 'test', checksum, data };
}

describe('Parité dossier / instantané du Hub', () => {
	it('un même état des deux côtés : aucun écart de contenu, sections absentes listées', () => {
		const r = compareBundleWithHubSnapshot(bundle(), snapshot());
		expect(r.differences).toEqual([]);
		expect(r.absentInHub.sort()).toEqual(['architecture', 'compliance', 'glossary', 'reuse_log', 'source_documents']);
	});

	it.each([
		['une exigence manque au Hub', (d: HubEngagementSnapshot['data']) => d.requirements.pop(), /absente de l'instantané/],
		['une décision affirmée est autre au Hub', (d: HubEngagementSnapshot['data']) => { d.requirements[1].disposition!.value = 'deliberated'; }, /« evacuated » dans le dossier, « deliberated » au Hub/],
		['une décision humaine n\'est qu\'une proposition au Hub', (d: HubEngagementSnapshot['data']) => { d.requirements[1].disposition!.status = 'proposed'; }, /sans décision affirmée au Hub/],
		['le motif d\'une évacuation diffère', (d: HubEngagementSnapshot['data']) => { d.requirements[1].disposition!.reason = 'Un autre motif tout à fait différent'; }, /le motif diffère/],
		['la maturité d\'un sujet diffère', (d: HubEngagementSnapshot['data']) => { d.subjects[0].maturity = 'L2_decomposed'; }, /maturité/],
		['un sujet ne porte pas les mêmes exigences', (d: HubEngagementSnapshot['data']) => { d.subjects[0].requirement_ids = []; }, /exigences portées différentes/],
		['aucune décision affirmée au Hub', (d: HubEngagementSnapshot['data']) => { d.decisions[0].status = 'proposed'; }, /aucune décision affirmée/],
		['l\'option retenue diffère', (d: HubEngagementSnapshot['data']) => { d.decisions[0].decision = 'Autre option'; }, /option retenue diffère/],
		['les alternatives écartées diffèrent', (d: HubEngagementSnapshot['data']) => { (d.decisions[0] as unknown as { rejected: unknown[] }).rejected = []; }, /alternatives écartées diffèrent/]
	])('repère l\'écart : %s', (_name, change, expected) => {
		const r = compareBundleWithHubSnapshot(bundle(), snapshot(change as never));
		expect(r.differences.join(' | ')).toMatch(expected as RegExp);
	});
});

describe('Lecture d\'un instantané du Hub', () => {
	it('accepte un instantané dont le sceau et l\'identifiant sont corrects', () => {
		expect(hubSnapshotProblems(snapshot())).toEqual([]);
	});

	it('refuse un contenu modifié après scellement, un identifiant qui ne dérive pas du sceau, un autre émetteur et une adresse e-mail', () => {
		const tampered = snapshot();
		tampered.data.requirements[0].text = 'modifié';
		expect(hubSnapshotProblems(tampered).join(' ')).toMatch(/sceau/);

		const badId = { ...snapshot(), snapshotId: 'eng-eng-x-000000000000' };
		expect(hubSnapshotProblems(badId).join(' ')).toMatch(/identifiant/);

		const other = { ...snapshot(), emitter: 'archinex' };
		expect(hubSnapshotProblems(other).join(' ')).toMatch(/émetteur/);

		const mail = snapshot((d) => { d.requirements[0].text = 'Contact jane.doe@exemple.org'; });
		expect(hubSnapshotProblems(mail).join(' ')).toMatch(/e-mail/);
		expect(() => requireVerifiedHubSnapshot(mail)).toThrow(/refusé/);
	});

	it('la matrice rendue depuis l\'instantané est déterministe et distingue décidé, proposé et sans décision', () => {
		const snap = snapshot((d) => {
			d.requirements[1].disposition!.status = 'proposed';
			d.requirements[1].disposition!.assertion_level = 'proposed';
			d.requirements[1].disposition!.validated_by = '';
			d.requirements[1].disposition!.validated_at = '';
			d.requirements.push({ id: 'SRC-ffffffff:R-9', text: 'Sans décision.', section: 'R-9', category: 'general', criticality: 'majeur', status: 'gap' });
		});
		const md = renderTraceabilityView(viewFromHubSnapshot(snap));
		expect(md).toMatch(/Autonomie de 30 jours.*À délibérer.*décidé par une personne.*@dan/);
		expect(md).toMatch(/Six postes.*Évacuée.*proposé, en attente d'affirmation.*@carl/);
		expect(md).toMatch(/Sans décision\..*Sans décision.*non décidé/);
		expect(renderTraceabilityView(viewFromHubSnapshot(snap))).toBe(md);
	});
});
