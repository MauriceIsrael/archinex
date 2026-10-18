import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { assembleEngagementBundle, type AssemblyInput } from '$lib/domain/bundleAssembly';
import { verifyEngagementBundle, sealEngagementBundle } from '$lib/domain/bundleVerifier';
import { requirementBundleId, sourceSha256 } from '$lib/domain/requirementAudit';
import { canonicalJson } from '$lib/domain/canonicalJson';

const load = (f: string) => JSON.parse(readFileSync(new URL(`../fixtures/bundle/${f}`, import.meta.url), 'utf-8'));
const compile = (schema: object) => {
	const ajv = new Ajv({ allErrors: true, strict: false });
	addFormats(ajv);
	return ajv.compile(schema);
};
const errors = (v: ReturnType<typeof compile>) => (v.errors ?? []).map((e) => `${e.instancePath} ${e.message} ${JSON.stringify(e.params)}`);

const SHA = sourceSha256('CCTP HLD Haute Disponibilité Télécom');
const rid = (ref: string) => requirementBundleId(SHA, ref);
const T0 = new Date('2026-10-01T08:00:00Z');

function testInput(): AssemblyInput {
	return {
		project: { id: 'proj-lumicc', title: 'HLD Télécom Critique' },
		confidentiality: 'confidential',
		now: new Date('2026-10-18T12:00:00Z'),
		sources: [
			{
				sha256: SHA,
				title: 'CCTP Lot 1',
				kind: 'cctp',
				language: 'fr',
				requirements: [
					{
						position: 0,
						clauseRef: 'REQ-DC-01',
						title: 'Topologie multi-DC',
						text: 'Déploiement sur 3 Datacenters Tier IV.',
						criticality: 'bloquant',
						category: 'Architecture',
						proposedDisposition: 'deliberated',
						proposedReason: 'Haute disponibilité obligatoire',
						proposedBy: 'model:m1',
						proposedAt: T0,
						decidedDisposition: 'deliberated',
						decidedBy: 'architecte@telecom.org',
						decidedAt: new Date('2026-10-02T10:00:00Z')
					},
					{
						position: 1,
						clauseRef: 'REQ-SEC-02',
						title: 'Isolation eSIM SM-DP+',
						text: 'Passerelle eSIM isolée en DMZ sécurisée.',
						criticality: 'bloquant',
						category: 'Sécurité',
						proposedDisposition: 'deliberated',
						proposedReason: 'Sécurité bancaire GSMA SAS-SM',
						proposedBy: 'model:m1',
						proposedAt: T0,
						decidedDisposition: 'deliberated',
						decidedBy: 'sec-lead@telecom.org',
						decidedAt: new Date('2026-10-03T11:00:00Z')
					}
				]
			}
		],
		subjects: [
			{
				id: 'sub-dc',
				sectionRef: '§1.1',
				name: 'Topologie Datacenters',
				domain: 'infrastructure',
				maturityLevel: 'L3_decided',
				requirementRefs: [rid('REQ-DC-01')],
				decision: {
					id: 'dec-dc',
					retainedOptionId: 'opt-3dc-active',
					rejected: [{ optionId: 'opt-2dc-standby', reason: 'RPO > 0 intolérable' }],
					rationale: 'Topologie active/active/active sur 3 sites Tier IV retenue.',
					complianceStatus: 'Compliant',
					complianceRationale: 'Conforme aux exigences de résilience',
					arbiterId: 'lead@telecom.org',
					decidedAt: new Date('2026-10-05T14:00:00Z')
				},
				options: [
					{ id: 'opt-3dc-active', title: 'Triple Datacenter Actif-Actif' },
					{ id: 'opt-2dc-standby', title: 'Datacenter Actif-Secours' }
				],
				questions: []
			},
			{
				id: 'sub-esim',
				sectionRef: '§2.3',
				name: 'Gouvernance eSIM SM-DP+',
				domain: 'security',
				maturityLevel: 'L3_decided',
				requirementRefs: [rid('REQ-SEC-02')],
				decision: {
					id: 'dec-esim',
					retainedOptionId: 'opt-dmz-vault',
					rejected: [{ optionId: 'opt-cloud-public', reason: 'Interdit par GSMA SAS-SM' }],
					rationale: 'Enclave SM-DP+ en DMZ souveraine avec HSM Thales.',
					complianceStatus: 'Compliant',
					complianceRationale: 'Homologation GSMA SAS-SM',
					arbiterId: 'sec-lead@telecom.org',
					decidedAt: new Date('2026-10-06T16:00:00Z')
				},
				options: [
					{ id: 'opt-dmz-vault', title: 'Enclave DMZ avec HSM Dédié' },
					{ id: 'opt-cloud-public', title: 'Hébergement Cloud Public' }
				],
				questions: []
			}
		],
		statements: [
			{
				id: 'st-dc-storage',
				subjectId: 'sub-dc',
				subjectRef: 'storage',
				predicate: 'database_replication',
				value: 'PostgreSQL Active-Active BDR',
				productionMode: 'human-authored',
				author: 'lead@telecom.org',
				createdAt: new Date('2026-10-04T09:00:00Z')
			},
			{
				id: 'st-esim-net',
				subjectId: 'sub-esim',
				subjectRef: 'network',
				predicate: 'ptp_sync_network',
				value: 'VLAN PTP IEEE 1588v2',
				productionMode: 'llm-derived',
				author: 'agent',
				createdAt: new Date('2026-10-04T12:00:00Z')
			}
		]
	};
}

describe('Export d\'architecture HLD dans assembleEngagementBundle (#122)', () => {
	const v11 = compile(load('engagement_bundle.schema.1.1.json'));

	it('peuple data.architecture.elements et data.architecture.relations à partir des sujets, options et énoncés', () => {
		const bundle = assembleEngagementBundle(testInput());

		expect(bundle.data.architecture).toBeDefined();
		expect(bundle.data.architecture.elements.length).toBeGreaterThan(0);
		expect(bundle.data.architecture.relations.length).toBeGreaterThan(0);

		// Systèmes
		const sysDc = bundle.data.architecture.elements.find((e) => e.id === 'elem-sys-sub-dc');
		expect(sysDc).toBeDefined();
		expect(sysDc?.name).toBe('Topologie Datacenters');
		expect(sysDc?.kind).toBe('system');
		expect(sysDc?.epistemic_status).toBe('validated');
		expect(sysDc?.assertion_level).toBe('asserted');
		expect(sysDc?.provenance?.by).toEqual(['@lead']);

		// Brique / Composant option retenue
		const optDc = bundle.data.architecture.elements.find((e) => e.id === 'elem-opt-sub-dc-opt-3dc-active');
		expect(optDc).toBeDefined();
		expect(optDc?.name).toBe('Triple Datacenter Actif-Actif');
		expect(optDc?.kind).toBe('component');
		expect(optDc?.boundary_id).toBe('elem-sys-sub-dc');
		expect(optDc?.decision_ids).toEqual(['dec-dc']);

		// Relation de contenance système -> option
		const relContainsDc = bundle.data.architecture.relations.find((r) => r.id === 'rel-contains-sub-dc-opt-3dc-active');
		expect(relContainsDc).toBeDefined();
		expect(relContainsDc?.from).toBe('elem-sys-sub-dc');
		expect(relContainsDc?.to).toBe('elem-opt-sub-dc-opt-3dc-active');
		expect(relContainsDc?.kind).toBe('contains');

		// Énoncés classifiés en briques d'architecture
		const elemStorage = bundle.data.architecture.elements.find((e) => e.id === 'elem-stmt-st-dc-storage');
		expect(elemStorage).toBeDefined();
		expect(elemStorage?.kind).toBe('datastore'); // classifié par database
		expect(elemStorage?.boundary_id).toBe('elem-sys-sub-dc');

		const elemNet = bundle.data.architecture.elements.find((e) => e.id === 'elem-stmt-st-esim-net');
		expect(elemNet).toBeDefined();
		expect(elemNet?.kind).toBe('network'); // classifié par ptp/network

		// Relation option -> énoncé
		const relStorage = bundle.data.architecture.relations.find((r) => r.to === 'elem-stmt-st-dc-storage');
		expect(relStorage).toBeDefined();
		expect(relStorage?.from).toBe('elem-opt-sub-dc-opt-3dc-active');
	});

	it('embarque les projections standards scellées (Mermaid, Structurizr C4 DSL, SysML v2) par sujet et globalement', () => {
		const bundle = assembleEngagementBundle(testInput());

		// 1. Projections au niveau de chaque sujet
		const subDc = bundle.data.subjects.find((s) => s.id === 'sub-dc');
		expect(subDc?.projections).toBeDefined();
		expect(subDc?.projections?.mermaid).toContain('flowchart TD');
		expect(subDc?.projections?.mermaid).toContain('Triple Datacenter Actif-Actif');
		expect(subDc?.projections?.structurizrDSL).toContain('workspace "Topologie Datacenters"');
		expect(subDc?.projections?.structurizrDSL).toContain('softwareSystem');
		expect(subDc?.projections?.sysmlV2).toContain("package 'Topologie Datacenters'");

		// 2. Projections consolidées dans data.architecture.projections
		const archProj = bundle.data.architecture.projections;
		expect(archProj).toBeDefined();
		expect(archProj?.mermaid).toContain('flowchart TD');
		expect(archProj?.mermaid).toContain('subgraph elem_sys_sub_dc');
		expect(archProj?.structurizrDSL).toContain('workspace "HLD Télécom Critique"');
		expect(archProj?.sysmlV2).toContain("package 'HLD Télécom Critique'");
		expect(archProj?.by_subject?.['sub-dc']).toBeDefined();
		expect(archProj?.by_subject?.['sub-esim']).toBeDefined();
	});

	it('produit un Bundle 100% conforme au schéma 1.1 sans violer additionalProperties', () => {
		const bundle = assembleEngagementBundle(testInput());
		expect(bundle.schemaVersion).toBe('1.1');
		const valid = v11(bundle);
		expect(errors(v11)).toEqual([]);
		expect(valid).toBe(true);
	});

	it('est 100% déterministe et vérifiable sans altération de signature SHA-256', () => {
		const bundle1 = assembleEngagementBundle(testInput());
		const bundle2 = assembleEngagementBundle({
			...testInput(),
			now: new Date('2035-01-01T00:00:00Z') // L'heure d'export n'affecte pas le sceau
		});

		expect(bundle1.checksum).toBe(bundle2.checksum);
		expect(canonicalJson(bundle1.data)).toBe(canonicalJson(bundle2.data));
		expect(verifyEngagementBundle(bundle1)).toEqual([]);
	});

	it('verifyEngagementBundle valide la cohérence des kinds d\'éléments et de relations', () => {
		const validBundle = assembleEngagementBundle(testInput());
		expect(verifyEngagementBundle(validBundle)).toEqual([]);

		// Altération d'un kind d'élément
		const corruptedElem = JSON.parse(JSON.stringify(validBundle));
		corruptedElem.data.architecture.elements[0].kind = 'invalid_kind';
		const resealedElem = sealEngagementBundle(corruptedElem);
		const problemsElem = verifyEngagementBundle(resealedElem);
		expect(problemsElem.some((p) => p.code === 'ELEMENT_KIND_INVALID')).toBe(true);

		// Altération d'un kind de relation
		const corruptedRel = JSON.parse(JSON.stringify(validBundle));
		corruptedRel.data.architecture.relations[0].kind = 'invalid_rel';
		const resealedRel = sealEngagementBundle(corruptedRel);
		const problemsRel = verifyEngagementBundle(resealedRel);
		expect(problemsRel.some((p) => p.code === 'RELATION_KIND_INVALID')).toBe(true);

		// Frontière circulaire
		const circularElem = JSON.parse(JSON.stringify(validBundle));
		circularElem.data.architecture.elements[0].boundary_id = circularElem.data.architecture.elements[0].id;
		const resealedCircular = sealEngagementBundle(circularElem);
		const problemsCircular = verifyEngagementBundle(resealedCircular);
		expect(problemsCircular.some((p) => p.code === 'CIRCULAR_BOUNDARY')).toBe(true);

		// Référence orpheline dans by_subject
		const danglingProj = JSON.parse(JSON.stringify(validBundle));
		danglingProj.data.architecture.projections.by_subject['orphan-subject-id'] = { mermaid: 'flowchart TD' };
		const resealedProj = sealEngagementBundle(danglingProj);
		const problemsProj = verifyEngagementBundle(resealedProj);
		expect(problemsProj.some((p) => p.code === 'DANGLING_REF')).toBe(true);
	});
});

