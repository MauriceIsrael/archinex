import { describe, it, expect } from 'vitest';
import { assembleEngagementBundle, type AssemblyInput } from '$lib/domain/bundleAssembly';
import { sealEngagementBundle } from '$lib/domain/bundleVerifier';
import { renderTraceabilityMatrix, BundleRejectedError } from '$lib/domain/bundleRtm';
import { requirementBundleId, sourceSha256 } from '$lib/domain/requirementAudit';

const SHA = sourceSha256('RFP intégral');
const rid = (ref: string) => requirementBundleId(SHA, ref);
const T0 = new Date('2026-10-01T08:00:00Z');

function input(now: Date): AssemblyInput {
	return {
		project: { id: 'p1', title: 'Projet A' },
		confidentiality: 'internal',
		now,
		sources: [
			{
				sha256: SHA, title: 'RFP A', kind: 'rfp', language: 'fr',
				requirements: [
					{ position: 0, clauseRef: 'R-1', title: 'Autonomie', text: '30 jours.', criticality: 'bloquant', proposedDisposition: 'deliberated', proposedReason: 'Coût contre dépendance', proposedBy: 'model:m1', proposedAt: T0, decidedDisposition: 'deliberated', decidedBy: '@alice', decidedAt: new Date('2026-10-02T09:00:00Z') },
					{ position: 1, clauseRef: 'R-2', title: 'Mobilier', text: 'Six postes.', criticality: 'info', proposedDisposition: 'evacuated', proposedReason: 'Hors périmètre', proposedBy: 'model:m1', proposedAt: T0 },
					{ position: 2, clauseRef: 'R-3', title: 'Chiffrement', text: 'Flux chiffrés.', criticality: 'bloquant', proposedDisposition: 'to_qualify', proposedReason: 'Indécis', proposedBy: 'model:m1', proposedAt: T0 }
				]
			}
		],
		subjects: [
			{
				id: 's1', sectionRef: '§1', name: 'Synchronisation', maturityLevel: 'L3_decided', requirementRefs: [rid('R-1')],
				decision: { id: 'd1', retainedOptionId: 'o1', rejected: [], rationale: 'Autonomie locale.', arbiterId: 'bob@exemple.org', decidedAt: new Date('2026-10-05T10:00:00Z') },
				options: [{ id: 'o1', title: 'Horloge locale' }], questions: []
			}
		],
		statements: []
	};
}

describe('Matrice de traçabilité générée depuis le dossier scellé', () => {
	it('est déterministe : deux exports à des heures différentes donnent le même document', () => {
		const a = renderTraceabilityMatrix(assembleEngagementBundle(input(new Date('2026-10-09T12:00:00Z'))));
		const b = renderTraceabilityMatrix(assembleEngagementBundle(input(new Date('2030-01-01T00:00:00Z'))));
		expect(a).toBe(b);
	});

	it('relie chaque exigence à son état, son auteur, son sujet et sa décision, sans rien inventer', () => {
		const md = renderTraceabilityMatrix(assembleEngagementBundle(input(T0)));
		expect(md).toContain('`SRC-');
		expect(md).toMatch(/R-1.*À délibérer.*décidé par un humain.*@alice.*Synchronisation.*Option retenue : Horloge locale/);
		expect(md).toMatch(/R-2.*Évacuée.*proposé par le modèle.*model:m1/);
		expect(md).toMatch(/R-3.*À qualifier.*non tranché.*G_requirement_unqualified \(bloquante\)/);
	});

	it('refuse un dossier altéré après scellement', () => {
		const b = assembleEngagementBundle(input(T0));
		b.data.requirements[1].text = 'Texte modifié après coup';
		expect(() => renderTraceabilityMatrix(b)).toThrow(BundleRejectedError);
	});

	it('refuse un dossier incohérent même rescellé (clause à délibérer sans sujet)', () => {
		const b = assembleEngagementBundle(input(T0));
		b.data.subjects[0].requirement_ids = [];
		expect(() => renderTraceabilityMatrix(sealEngagementBundle(b))).toThrow(BundleRejectedError);
	});
});
