/**
 * Tests de contrat de l'adaptateur de banc de test boîte noire (Jalon J3).
 *
 * Vérifie :
 *   1. Le mode S2 (autonome) : détection des contradictions, conservation stricte de l'état
 *      provisoire, zéro affirmation arbitraire sans humain, sceau cryptographique intègre.
 *   2. Le mode S3 (assisté) : résolution des sujets par rejeu de fixtures d'experts, passage
 *      des décisions en `asserted`, clôture des conflits, bundle non provisoire si tous les sujets sont mûrs.
 *   3. Le comportement en cas de sollicitation d'expert non couverte (`expert_unanswered`).
 *   4. L'exécution en ligne de commande de bout en bout via `scripts/benchmark-run.ts`.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import {
	runBenchmarkCase,
	type RFPCaseInput,
	type ExpertActionFixture
} from '../../src/lib/server/benchmark/benchmarkRunner';
import { verifyEngagementBundle } from '../../src/lib/domain/bundleVerifier';

const TC_CASE_PATH = resolve(__dirname, '../../fixtures/benchmark/tc-contra-001.json');
const TC_EXPERT_PATH = resolve(__dirname, '../../fixtures/benchmark/tc-contra-001-expert.json');

const TMP_OUT_S2 = resolve(__dirname, '../../tmp-test-bundle-s2.json');
const TMP_OUT_S3 = resolve(__dirname, '../../tmp-test-bundle-s3.json');
const TMP_SUMMARY_S3 = resolve(__dirname, '../../tmp-test-summary-s3.json');

function cleanup() {
	for (const p of [TMP_OUT_S2, TMP_OUT_S3, TMP_SUMMARY_S3]) {
		if (existsSync(p)) {
			try {
				unlinkSync(p);
			} catch {}
		}
	}
}

describe('Banc de Test Boîte Noire — Adaptateur Archinex (Jalon J3)', () => {
	let rfpCase: RFPCaseInput;
	let expertFixtures: ExpertActionFixture[];

	beforeAll(() => {
		cleanup();
		rfpCase = JSON.parse(readFileSync(TC_CASE_PATH, 'utf-8'));
		expertFixtures = JSON.parse(readFileSync(TC_EXPERT_PATH, 'utf-8'));
	});

	afterAll(() => {
		cleanup();
	});

	it('Mode S2 (Autonome) : analyse sans intervention humaine, reste provisoire et détecte les contradictions', async () => {
		const result = await runBenchmarkCase(rfpCase, {
			mode: 's2',
			iteration: 1
		});

		expect(result.system).toBe('S2');
		expect(result.case_id).toBe('TC-CONTRA-001');

		// D2 / H6 : L'état doit obligatoirement être déclaré provisoire car aucun humain n'a arbitré
		expect(result.declared_provisional).toBe(true);
		expect(result.provisional_reasons.unripe_subjects.length).toBeGreaterThan(0);

		// Zéro interaction humaine en mode autonome
		expect(result.expert_interactions).toBe(0);

		// Les décisions produites en S2 ne doivent JAMAIS être 'asserted'
		for (const dec of result.bundle.data.decisions) {
			expect(dec.assertion_level).toBe('proposed');
			expect(dec.epistemic_status).toBe('ai_proposed');
			expect(dec.provenance.basis).toBe('ai_proposal');
		}

		// Validité instrumentale : le bundle scellé doit être intègre
		const problems = verifyEngagementBundle(result.bundle);
		expect(problems).toEqual([]);
		expect(result.bundle.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
	});

	it('Mode S3 (Assisté) : rejoue les fixtures d\'experts, arbitre les décisions et scelle le dossier affirmé', async () => {
		const result = await runBenchmarkCase(rfpCase, {
			mode: 's3',
			iteration: 1,
			expertFixtures
		});

		expect(result.system).toBe('S3');
		expect(result.case_id).toBe('TC-CONTRA-001');

		// Toutes les actions d'experts ont été consommées
		expect(result.expert_interactions).toBe(3);
		expect(result.expert_unanswered).toBe(0);

		// Les sujets sont passés en maturité L3_decided
		for (const subj of result.bundle.data.subjects) {
			expect(subj.maturity).toBe('L3_decided');
			expect(subj.status).toBe('decided');
		}

		// Toutes les décisions sont des affirmations opposables ('asserted') portées par un humain
		expect(result.bundle.data.decisions.length).toBeGreaterThan(0);
		for (const dec of result.bundle.data.decisions) {
			expect(dec.assertion_level).toBe('asserted');
			expect(dec.epistemic_status).toBe('validated');
			expect(dec.provenance.basis).toBe('human_validation');
			expect(dec.provenance.by[0]).toMatch(/^@/); // Handles d'experts, pas d'e-mails en clair
		}

		// Tous les conflits associés ont été arbitrés
		for (const conflict of result.bundle.data.conflicts) {
			expect(conflict.status).toBe('arbitrated');
			expect(conflict.resolution).toBeTruthy();
		}

		// Le dossier n'est plus provisoire puisque tous les sujets sont mûrs (L3) et tous les conflits arbitrés
		expect(result.declared_provisional).toBe(false);

		// Validité instrumentale : vérification stricte
		const problems = verifyEngagementBundle(result.bundle);
		expect(problems).toEqual([]);
		expect(result.bundle.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
	});

	it('Mode S3 Partiel : compte fidèlement les sollicitations non couvertes (expert_unanswered) et reste provisoire', async () => {
		// On ne fournit qu'une seule réponse d'expert sur les 3 sujets du cas
		const partialFixture = [expertFixtures[0]];

		const result = await runBenchmarkCase(rfpCase, {
			mode: 's3',
			iteration: 1,
			expertFixtures: partialFixture
		});

		expect(result.expert_interactions).toBe(1);
		expect(result.expert_unanswered).toBe(2);

		// Comme 2 sujets ne sont pas instruits, le dossier reste provisoire
		expect(result.declared_provisional).toBe(true);
		expect(result.provisional_reasons.unripe_subjects).toHaveLength(2);

		const problems = verifyEngagementBundle(result.bundle);
		expect(problems).toEqual([]);
	});

	it('Point d\'Entrée CLI : exécution sans IHM via scripts/benchmark-run.ts (Jalon J3)', () => {
		// 1. Exécution CLI en mode S2
		const cmdS2 = `npx tsx scripts/benchmark-run.ts --rfp fixtures/benchmark/tc-contra-001.json --output ${TMP_OUT_S2} --mode s2 --verify`;
		const outS2 = execSync(cmdS2, { encoding: 'utf-8' });
		expect(outS2).toContain('Archinex Benchmark Runner — Mode S2');
		expect(outS2).toContain('Vérification instrumentale validée à 100%');
		expect(existsSync(TMP_OUT_S2)).toBe(true);

		const bundleS2 = JSON.parse(readFileSync(TMP_OUT_S2, 'utf-8'));
		expect(bundleS2.data.is_provisional).toBe(true);

		// 2. Exécution CLI en mode S3 avec fixtures et résumé RunArtifact
		const cmdS3 = `npx tsx scripts/benchmark-run.ts --rfp fixtures/benchmark/tc-contra-001.json --expert-fixture fixtures/benchmark/tc-contra-001-expert.json --output ${TMP_OUT_S3} --summary-out ${TMP_SUMMARY_S3} --verify`;
		const outS3 = execSync(cmdS3, { encoding: 'utf-8' });
		expect(outS3).toContain('Archinex Benchmark Runner — Mode S3');
		expect(outS3).toContain('Actions expert jouées : 3');
		expect(outS3).toContain('Sollicitations manquées: 0');
		expect(outS3).toContain('Vérification instrumentale validée à 100%');

		expect(existsSync(TMP_OUT_S3)).toBe(true);
		expect(existsSync(TMP_SUMMARY_S3)).toBe(true);

		const bundleS3 = JSON.parse(readFileSync(TMP_OUT_S3, 'utf-8'));
		expect(bundleS3.data.is_provisional).toBe(false);

		const summaryS3 = JSON.parse(readFileSync(TMP_SUMMARY_S3, 'utf-8'));
		expect(summaryS3.system).toBe('S3');
		expect(summaryS3.case_id).toBe('TC-CONTRA-001');
		expect(summaryS3.expert_interactions).toBe(3);
		expect(summaryS3.checksum).toBe(bundleS3.checksum);
	});
});
