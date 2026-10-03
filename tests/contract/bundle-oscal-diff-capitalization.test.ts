import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EngagementBundle } from '$lib/domain/engagementBundle';
import { exportOscalCompliance } from '$lib/domain/oscalExport';
import { diffEngagementBundles } from '$lib/domain/bundleDiff';
import { extractBundleKbCandidates } from '$lib/domain/capitalizationFeedback';
import { sealEngagementBundle } from '$lib/domain/bundleVerifier';

const EXAMPLE_PATH = resolve(
	__dirname,
	'../fixtures/bundle/engagement_bundle.example.json'
);

function loadExample(): EngagementBundle {
	return JSON.parse(readFileSync(EXAMPLE_PATH, 'utf-8'));
}

describe('OSCAL Export, Bundle Diff & Capitalization Feedback Contract Tests (A19)', () => {
	describe('1. Export OSCAL de la matrice de conformité', () => {
		it('génère un document OSCAL System Security Plan valide', () => {
			const example = loadExample();
			const oscal = exportOscalCompliance(example);

			const ssp = oscal['system-security-plan'];
			expect(ssp).toBeDefined();
			expect(ssp.metadata['oscal-version']).toBe('1.0.0');
			expect(ssp['control-implementation']['implemented-requirements'].length).toBe(
				example.data.compliance.length
			);
		});

		it('règle d or : seul ce qui est asserted est exporté comme implemented, proposed reste planned', () => {
			const example = loadExample();
			const oscal = exportOscalCompliance(example);
			const reqs = oscal['system-security-plan']['control-implementation']['implemented-requirements'];

			// CMP-001 dans l'exemple est asserted (validé par humain avec control_ref: NIS2-ART21-2B)
			const cmp001 = reqs.find((r) => r['control-id'] === 'NIS2-ART21-2B');
			expect(cmp001).toBeDefined();
			expect(cmp001?.status.state).toBe('satisfied');
			expect(cmp001?.['by-components'][0]['implementation-status'].state).toBe('implemented');
			expect(cmp001?.remarks).toContain('[VALIDÉ]');

			// CMP-002 dans l'exemple est proposed (IA proposal, texte légal non confirmé par humain)
			const cmp002 = reqs.find((r) => r['control-id'] === 'NIS2-ART23-4');
			expect(cmp002).toBeDefined();
			expect(cmp002?.status.state).toBe('planned');
			expect(cmp002?.['by-components'][0]['implementation-status'].state).toBe('planned');
			expect(cmp002?.remarks).toContain('[UNASSERTED PROPOSAL]');
		});

		it('aucun élément non affirmé n est jamais présenté comme mis en œuvre dans le document OSCAL', () => {
			const example = loadExample();
			const oscal = exportOscalCompliance(example);
			const reqs = oscal['system-security-plan']['control-implementation']['implemented-requirements'];

			reqs.forEach((r, idx) => {
				const sourceItem = example.data.compliance[idx];
				const implState = r['by-components'][0]['implementation-status'].state;

				if (sourceItem.assertion_level !== 'asserted') {
					expect(implState).not.toBe('implemented');
					expect(r.status.state).not.toBe('satisfied');
				}
			});
		});
	});

	describe('2. Différence déterministe entre deux dossiers d engagement', () => {
		it('retourne une différence vide et identical: true pour deux dossiers identiques', () => {
			const bundleA = loadExample();
			const bundleB = loadExample();

			const diff = diffEngagementBundles(bundleA, bundleB);
			expect(diff.identical).toBe(true);
			expect(diff.added).toEqual([]);
			expect(diff.removed).toEqual([]);
			expect(diff.modified).toEqual([]);
			expect(diff.regressions).toEqual([]);
			expect(diff.snapshotA.checksum).toBe(diff.snapshotB.checksum);
		});

		it('détecte les ajouts, suppressions et modifications entre deux versions', () => {
			const bundleA = loadExample();
			const bundleB = structuredClone(bundleA);
			bundleB.snapshotId = 'bundle-v2';

			// Modification dans B
			bundleB.data.decisions[0].decision += ' (Version révisée)';
			// Ajout dans B
			bundleB.data.statements.push({
				id: 'ST-NEW-99',
				subject_id: 'SUBJ-config-restore',
				epistemic_status: 'validated',
				assertion_level: 'asserted',
				text: 'Nouveau contrôle de redondance',
				property: 'redundancy',
				value: 'N+1',
				provenance: {
					basis: 'human_validation',
					by: ['@lead-architect'],
					at: '2026-10-03T15:00:00Z'
				}
			});
			// Suppression dans B (retrait du second statement)
			bundleB.data.statements.splice(1, 1);

			sealEngagementBundle(bundleB);

			const diff = diffEngagementBundles(bundleA, bundleB);
			expect(diff.identical).toBe(false);
			expect(diff.added.some((it) => it.id === 'ST-NEW-99')).toBe(true);
			expect(diff.removed.some((it) => it.id === 'ST-002')).toBe(true);
			expect(diff.modified.some((it) => it.id === 'DEC-001')).toBe(true);
		});

		it('signale avec force toute régression de niveau d affirmation (asserted -> proposed)', () => {
			const bundleA = loadExample();
			const bundleB = structuredClone(bundleA);

			// Régression volontaire : une décision préalablement affirmée redevient proposée
			bundleB.data.decisions[0].assertion_level = 'proposed';
			bundleB.data.decisions[0].epistemic_status = 'ai_proposed';
			bundleB.data.decisions[0].status = 'proposed';
			sealEngagementBundle(bundleB);

			const diff = diffEngagementBundles(bundleA, bundleB);
			expect(diff.regressions.length).toBe(1);
			expect(diff.regressions[0].id).toBe('DEC-001');
			expect(diff.regressions[0].previousLevel).toBe('asserted');
			expect(diff.regressions[0].newLevel).toBe('proposed');
			expect(diff.regressions[0].warning).toContain('RÉGRESSION ÉPISTÉMIQUE');
		});
	});

	describe('3. Retour vers la capitalisation (candidats KB depuis dossier)', () => {
		it('extrait les décisions affirmées sans origine KB comme candidats de capitalisation', () => {
			const example = loadExample();

			// Ajout d'une décision affirmée native (non issue d'un actif KB existant)
			example.data.decisions.push({
				id: 'DEC-NATIVE-003',
				subject_id: 'SUBJ-config-restore',
				status: 'validated',
				epistemic_status: 'validated',
				assertion_level: 'asserted',
				decision: 'Partitionnement dynamique des VLANs opérationnels.',
				justification: 'Arbitrage validé en atelier pour isoler les flux industriels.',
				provenance: {
					basis: 'human_validation',
					by: ['@lead-architect'],
					at: '2026-10-03T16:00:00Z'
				}
				// derived_from absent !
			});

			const candidates = extractBundleKbCandidates(example);

			// DEC-001 a derived_from (reused de ADR-0001) -> ne doit PAS être extraite
			expect(candidates.some((c) => c.provenance.decision_id === 'DEC-001')).toBe(false);

			// DEC-002 est proposed -> ne doit PAS être extraite
			expect(candidates.some((c) => c.provenance.decision_id === 'DEC-002')).toBe(false);

			// DEC-NATIVE-003 est asserted et native -> DOIT être extraite
			const nativeCandidate = candidates.find(
				(c) => c.provenance.decision_id === 'DEC-NATIVE-003'
			);
			expect(nativeCandidate).toBeDefined();
			expect(nativeCandidate?.title).toBe('Partitionnement dynamique des VLANs opérationnels.');
			expect(nativeCandidate?.status).toBe('in_review'); // Toujours in_review, jamais promu automatiquement
			expect(nativeCandidate?.provenance.source_bundle_id).toBe(example.snapshotId);
			expect(nativeCandidate?.provenance.bundle_checksum).toBe(example.checksum);
		});
	});
});
