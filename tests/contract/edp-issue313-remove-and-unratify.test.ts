import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { OntologyCatalog } from '$lib/server/edp/ontologyClient';
import { computeRefinementCoverage } from '$lib/server/edp/refinementCoverage';
import {
	buildLiveArchitectureLockSnapshot,
	getProjectRatificationAuditLog,
	recordExplicitProjectSlotRatification,
	resetProjectSlotRegistry,
	revokeProjectSlotRatification
} from '$lib/server/edp/decisionSlotRegistry';
import { readFixtureCatalog } from '../helpers/ontologyFixture';

const fixtureCatalog = readFixtureCatalog() as OntologyCatalog;

describe('Issue #313 : Retrait de feuille ontologique (excludedLeafUrns) & Révocation de ratification (unratify)', () => {
	const testProjectId = 'proj-test-issue313';

	afterEach(() => {
		resetProjectSlotRegistry(testProjectId);
	});

	it('empêche autoBindFromText de ré-inférer une feuille retirée (même si c’est la seule feuille de l’axe)', () => {
		const baseInput = {
			subjectId: 'sub_issue313_remove',
			title: 'Plateforme Bare-Metal avec réseau OOB dédié',
			problem: 'Assurer le déploiement bare-metal avec gestion OOB et énergie 2N.',
			decisionText: 'Déploiement sur substrat serveur Bare-Metal avec réseau OOB dédié.',
			autoBindFromText: true,
			selectedConceptUrn: 'AUTO'
		};

		const initial = computeRefinementCoverage(baseInput, fixtureCatalog);
		const firstCoveredAxis = initial.axes.find((a) => a.boundLeaves.length > 0);
		expect(firstCoveredAxis).toBeDefined();

		const targetAxisUrn = firstCoveredAxis!.axisUrn;
		const removedLeafUrn = firstCoveredAxis!.boundLeaves[0].urn;

		const afterRemove = computeRefinementCoverage(
			{
				...baseInput,
				explicitBindings: [],
				excludedLeafUrns: [removedLeafUrn]
			},
			fixtureCatalog
		);

		const axisAfterRemove = afterRemove.axes.find((a) => a.axisUrn === targetAxisUrn);
		expect(axisAfterRemove).toBeDefined();
		expect(axisAfterRemove!.boundLeaves).toHaveLength(0);
		expect(axisAfterRemove!.status).toBe('missing_refinement');
		expect(afterRemove.composedBindings.some((b) => b.urn === removedLeafUrn)).toBe(false);

		// Ré-ajout explicite après retrait
		const afterReAdd = computeRefinementCoverage(
			{
				...baseInput,
				explicitBindings: [{ urn: removedLeafUrn, revision: 1 }],
				excludedLeafUrns: []
			},
			fixtureCatalog
		);
		const axisAfterReAdd = afterReAdd.axes.find((a) => a.axisUrn === targetAxisUrn);
		expect(axisAfterReAdd?.boundLeaves.some((l) => l.urn === removedLeafUrn)).toBe(true);
		expect(axisAfterReAdd?.bindingOrigin).toBe('explicit');
	});

	it('conserve les autres feuilles liées lors du retrait d’une variante sur un axe multi-variantes', () => {
		const initial = computeRefinementCoverage(
			{
				subjectId: 'sub_issue313_multi',
				title: 'Plateforme Bare-Metal',
				decisionText: 'Déploiement sur substrat serveur Bare-Metal.',
				autoBindFromText: true,
				selectedConceptUrn: 'AUTO'
			},
			fixtureCatalog
		);

		const multiCandAxis = initial.axes.find((a) => a.candidateLeaves.length >= 2);
		expect(multiCandAxis).toBeDefined();

		const leafA = multiCandAxis!.candidateLeaves[0].urn;
		const leafB = multiCandAxis!.candidateLeaves[1].urn;

		const afterRemoveA = computeRefinementCoverage(
			{
				subjectId: 'sub_issue313_multi',
				title: 'Plateforme Bare-Metal',
				decisionText: 'Déploiement sur substrat serveur Bare-Metal.',
				explicitBindings: [{ urn: leafB, revision: 1 }],
				excludedLeafUrns: [leafA],
				autoBindFromText: true,
				selectedConceptUrn: 'AUTO'
			},
			fixtureCatalog
		);

		const axis = afterRemoveA.axes.find((a) => a.axisUrn === multiCandAxis!.axisUrn);
		expect(axis?.boundLeaves.map((l) => l.urn)).toEqual([leafB]);
		expect(axis?.bindingOrigin).toBe('explicit');
	});

	it('respecte excludedLeafUrns sur l’axe émergent (isNovelSubject)', () => {
		const novelInput = {
			subjectId: 'sub_issue313_novel',
			title: 'Passerelle IoT LoRaWAN',
			decisionText: 'Déployer une passerelle IoT LoRaWAN MQTT.',
			isNovelSubject: true,
			autoBindFromText: true,
			selectedConceptUrn: 'AUTO'
		};

		const initial = computeRefinementCoverage(novelInput, fixtureCatalog);
		const emergentAxis = initial.axes.find(
			(a) => a.axisUrn === 'urn:archinex:ontology:axis:emergent_component_allocation'
		);
		expect(emergentAxis).toBeDefined();
		expect(emergentAxis!.boundLeaves.length).toBeGreaterThan(0);

		const removedUrn = emergentAxis!.boundLeaves[0].urn;
		const afterRemove = computeRefinementCoverage(
			{
				...novelInput,
				explicitBindings: [],
				excludedLeafUrns: [removedUrn]
			},
			fixtureCatalog
		);

		const emergentAfter = afterRemove.axes.find(
			(a) => a.axisUrn === 'urn:archinex:ontology:axis:emergent_component_allocation'
		);
		expect(emergentAfter?.boundLeaves).toHaveLength(0);
		expect(emergentAfter?.status).toBe('missing_refinement');
	});

	it('révoque une ratification enregistrée et journalise une trace d’audit complète', async () => {
		resetProjectSlotRegistry(testProjectId);

		const coverage = computeRefinementCoverage(
			{
				subjectId: 'sub_issue313_ratif',
				title: 'Plateforme Bare-Metal',
				decisionText: 'Déploiement Bare-Metal.',
				autoBindFromText: true,
				selectedConceptUrn: 'AUTO'
			},
			fixtureCatalog
		);

		const targetAxis = coverage.axes.find((a) => a.candidateLeaves.length > 0)!;
		const targetLeaf = targetAxis.candidateLeaves[0].urn;
		const slotId = `slot:${targetAxis.axisUrn}`;

		await recordExplicitProjectSlotRatification(
			{
				projectId: testProjectId,
				axisUrn: targetAxis.axisUrn,
				leafUrn: targetLeaf,
				actorId: 'alice@archinex.io',
				actorRole: 'lead_architect',
				rationale: 'Choix initial acté.'
			},
			fixtureCatalog
		);

		const snapBefore = await buildLiveArchitectureLockSnapshot(
			{ projectId: testProjectId },
			fixtureCatalog
		);
		const slotBefore = snapBefore.slots.find((s) => s.slotId === slotId);
		expect(slotBefore?.lockBadge).toBe('locked');
		expect(slotBefore?.ratifiedBy).toBe('alice@archinex.io');

		const revocation = await revokeProjectSlotRatification({
			projectId: testProjectId,
			slotId,
			axisUrn: targetAxis.axisUrn,
			actorId: 'bob@archinex.io',
			actorRole: 'lead_architect',
			reason: 'Changement de contrainte réseau.',
			source: 'phase5'
		});

		expect(revocation).not.toBeNull();
		expect(revocation!.previousLeafUrn).toBe(targetLeaf);
		expect(revocation!.revokedBy).toBe('bob@archinex.io');
		expect(revocation!.source).toBe('phase5');
		expect(revocation!.reason).toBe('Changement de contrainte réseau.');

		const auditLog = getProjectRatificationAuditLog(testProjectId);
		expect(auditLog).toHaveLength(1);
		expect(auditLog[0].revocationId).toBe(revocation!.revocationId);

		const snapAfter = await buildLiveArchitectureLockSnapshot(
			{ projectId: testProjectId },
			fixtureCatalog
		);
		const slotAfter = snapAfter.slots.find((s) => s.slotId === slotId);
		expect(slotAfter?.lockBadge).not.toBe('locked');
		expect(slotAfter?.ratifiedBy).toBeUndefined();
	});
});
