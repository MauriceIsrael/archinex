import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	buildEngagementBundle,
	ASSERTION_OF
} from '$lib/domain/engagementBundle';
import type { EngagementBundle } from '$lib/domain/engagementBundle';
import {
	verifyEngagementBundle,
	payloadSha256,
	sealEngagementBundle
} from '$lib/domain/bundleVerifier';

const EXAMPLE_PATH = resolve(
	__dirname,
	'../fixtures/bundle/engagement_bundle.example.json'
);

function loadExample(): EngagementBundle {
	return JSON.parse(readFileSync(EXAMPLE_PATH, 'utf-8'));
}

function codes(bundle: EngagementBundle): Set<string> {
	return new Set(verifyEngagementBundle(bundle).map((p) => p.code));
}

function mutated(
	change: (data: EngagementBundle['data']) => void
): EngagementBundle {
	const bundle = structuredClone(loadExample());
	change(bundle.data);
	return sealEngagementBundle(bundle);
}

describe('Engagement Bundle & Verifier Contract Tests (A16 - engagement-bundle)', () => {
	it('vérifie que l exemple scellé de référence de la suite passe sans aucune erreur', () => {
		const example = loadExample();
		const problems = verifyEngagementBundle(example);
		expect(problems).toEqual([]);
	});

	it('vérifie que le sceau utilise le profil canonical-json v1 et donne le checksum exact', () => {
		const example = loadExample();
		const calculated = payloadSha256(example.data);
		expect(calculated).toBe(example.checksum);
		expect(example.checksum).toBe(
			'sha256:474341b304aa04ca16e53a6dfb51106fc833b48faafe537086a9ebc05f49b313'
		);
	});

	it('détecte une rupture de sceau si le payload est altéré', () => {
		const bundle = structuredClone(loadExample());
		bundle.data.decisions[0].decision += ' (modifié illégalement)';
		expect(codes(bundle)).toContain('SEAL');
	});

	it('rejette les valeurs hors plage sûre pour le profil canonique', () => {
		const bundle = structuredClone(loadExample());
		(bundle.data.statements[0] as unknown as Record<string, unknown>).value =
			12345678901234567890;
		const c = codes(bundle);
		expect(c.has('CANONICAL') || c.has('SCHEMA')).toBe(true);
	});

	it('prouve que is_provisional et ses raisons sont strictement dérivés, jamais déclarés', () => {
		// Mensonge : déclarer non provisoire alors qu'un sujet est L1_framed
		const lie = mutated((d) => {
			d.is_provisional = false;
		});
		expect(codes(lie)).toContain('PROVISIONAL');

		// Mûrir le bundle : tous les sujets à L3_decided minimum et 0 conflit ouvert
		const ripen = mutated((d) => {
			d.subjects[1].maturity = 'L3_decided';
			d.is_provisional = false;
			d.provisional_reasons.unripe_subjects = [];
		});
		expect(codes(ripen).size).toBe(0);

		// Conflit ouvert : rend immédiatement le bundle provisoire
		const openConflict = mutated((d) => {
			d.subjects[1].maturity = 'L3_decided';
			d.is_provisional = true;
			d.provisional_reasons.unripe_subjects = [];
			d.conflicts = [
				{
					id: 'CON-1',
					kind: 'contradiction',
					status: 'open',
					statement_ids: ['ST-001', 'ST-002']
				}
			];
			d.provisional_reasons.open_conflicts = ['CON-1'];
		});
		expect(codes(openConflict).size).toBe(0);

		// Dangling ref dans un conflit
		const danglingConflict = mutated((d) => {
			d.conflicts = [
				{
					id: 'CON-1',
					kind: 'stale_basis',
					status: 'arbitrated',
					statement_ids: ['ST-404-NONEXISTENT']
				}
			];
		});
		expect(codes(danglingConflict)).toContain('DANGLING_REF');
	});

	it('signale les erreurs de structure / schéma en priorité', () => {
		const bundle = structuredClone(loadExample());
		(bundle.data.decisions[0] as unknown as Record<string, unknown>).surprise = 1;
		expect(codes(bundle)).toContain('SCHEMA');
	});

	it('dérive assertion_level de epistemic_status et interdit une promotion non autorisée', () => {
		const promoteAi = mutated((d) => {
			// Tenter d'affirmer une proposition IA sans validation humaine
			d.decisions[1].assertion_level = 'asserted';
		});
		const c = codes(promoteAi);
		expect(c.has('LEVEL')).toBe(true);
		expect(c.has('UNBACKED_CLAIM')).toBe(true);
		expect(c.has('STATUS')).toBe(true);
	});

	it('exige qu une affirmation porte un validateur humain et une base humaine', () => {
		const dropValidator = mutated((d) => {
			d.statements[0].provenance.by = [];
		});
		expect(codes(dropValidator)).toContain('UNBACKED_CLAIM');

		const machineBasis = mutated((d) => {
			d.compliance[0].provenance.basis = 'ai_proposal';
		});
		expect(codes(machineBasis)).toContain('UNBACKED_CLAIM');
	});

	it('maintient les correspondances automatisées au niveau proposed sans intervention humaine', () => {
		const promoteMatch = mutated((d) => {
			d.compliance[1].epistemic_status = 'validated';
			d.compliance[1].assertion_level = 'asserted';
		});
		expect(codes(promoteMatch)).toContain('UNBACKED_CLAIM');
	});

	it('exige qu une réutilisation renvoie à une entrée de journal avec hypothèses jugées', () => {
		const noDerived = mutated((d) => {
			delete d.decisions[0].derived_from;
		});
		expect(codes(noDerived)).toContain('REUSE_UNBACKED');

		const wrongLogId = mutated((d) => {
			if (d.decisions[0].derived_from) {
				d.decisions[0].derived_from.reuse_log_id = 'RL-NONEXISTENT';
			}
		});
		expect(codes(wrongLogId)).toContain('REUSE_UNBACKED');

		const wrongMatchRef = mutated((d) => {
			d.reuse_log[0].matched_ref = 'OTHER-ASSET';
		});
		expect(codes(wrongMatchRef)).toContain('REUSE_UNBACKED');

		const rejectedOutcome = mutated((d) => {
			d.reuse_log[0].outcome = 'rejected_not_same';
		});
		expect(codes(rejectedOutcome)).toContain('REUSE_UNBACKED');

		const emptyAssumptions = mutated((d) => {
			d.reuse_log[0].assumptions = [];
		});
		expect(codes(emptyAssumptions)).toContain('REUSE_UNBACKED');

		const unheldAssumption = mutated((d) => {
			d.reuse_log[0].assumptions[0].status = 'unknown';
		});
		expect(codes(unheldAssumption)).toContain('REUSE_UNBACKED');

		const unmotivatedException = mutated((d) => {
			d.reuse_log[0].outcome = 'reused_with_exception';
			d.reuse_log[0].comment = '   ';
		});
		expect(codes(unmotivatedException)).toContain('REUSE_UNBACKED');
	});

	it('accepte une réutilisation avec exception lorsque motivée', () => {
		const motivated = mutated((d) => {
			d.reuse_log[0].outcome = 'reused_with_exception';
			d.reuse_log[0].comment = 'Volume supérieur à 10000 : repli manuel convenu.';
			d.reuse_log[0].assumptions[0].status = 'does_not_hold';
		});
		expect(codes(motivated).size).toBe(0);
	});

	it('garantit l unicité et la résolution de tous les identifiants', () => {
		const duplicate = mutated((d) => {
			d.statements[0].id = 'DEC-001'; // Déjà pris par decisions[0]
		});
		expect(codes(duplicate)).toContain('DUPLICATE_ID');

		const danglingSubject = mutated((d) => {
			d.decisions[0].subject_id = 'SUBJ-404';
		});
		expect(codes(danglingSubject)).toContain('DANGLING_REF');

		const danglingRelation = mutated((d) => {
			d.architecture.relations[0].to = 'EL-404';
		});
		expect(codes(danglingRelation)).toContain('DANGLING_REF');
	});

	it('exige que tout actif de KB cité soit listé dans kb_references', () => {
		const unlistedControl = mutated((d) => {
			d.compliance[0].control_ref = 'NIS2-ART99-9';
		});
		expect(codes(unlistedControl)).toContain('KB_REF_UNLISTED');

		const missingRef = mutated((d) => {
			d.kb_references = d.kb_references.filter((k) => k.ref !== 'ADR-0001');
		});
		expect(codes(missingRef)).toContain('KB_REF_UNLISTED');
	});

	it('exige qu un sujet décidé possède au moins une décision affirmée', () => {
		const undecide = mutated((d) => {
			// Sujet 1 dont la seule décision est une proposition IA
			d.subjects[1].status = 'decided';
		});
		expect(codes(undecide)).toContain('DECIDED_WITHOUT_DECISION');
	});

	it('interdit rigoureusement la moindre adresse e-mail dans le bundle', () => {
		const leaked = mutated((d) => {
			d.statements[0].text = 'Contactez john.doe@example.com pour les volumétries.';
		});
		expect(codes(leaked)).toContain('EMAIL');

		const leakedHandle = structuredClone(loadExample());
		leakedHandle.data.reuse_log[0].by = 'john.doe@example.com';
		expect(codes(leakedHandle)).toContain('SCHEMA');
	});

	it('permet la construction déterministe via buildEngagementBundle', () => {
		const example = loadExample();
		const constructed = buildEngagementBundle({
			engagement: example.data.engagement,
			pins: example.data.pins,
			sourceDocuments: example.data.source_documents,
			requirements: example.data.requirements,
			subjects: example.data.subjects,
			decisions: example.data.decisions,
			statements: example.data.statements,
			conflicts: example.data.conflicts,
			compliance: example.data.compliance,
			gaps: example.data.gaps,
			architecture: example.data.architecture,
			kbReferences: example.data.kb_references,
			reuseLog: example.data.reuse_log,
			glossary: example.data.glossary,
			snapshotId: example.snapshotId,
			sourceRevision: example.sourceRevision,
			createdAt: example.createdAt
		});

		expect(constructed.checksum).toBe(example.checksum);
		expect(constructed.data.is_provisional).toBe(example.data.is_provisional);
		expect(verifyEngagementBundle(constructed)).toEqual([]);
	});
});
