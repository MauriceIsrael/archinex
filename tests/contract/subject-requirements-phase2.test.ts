import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'svelte/server';

vi.mock('$app/environment', () => ({ browser: false }));

import SubjectRequirementsDrawer, {
	type SubjectRequirementItem
} from '$lib/components/deliberation/SubjectRequirementsDrawer.svelte';
import SubjectThreadView from '$lib/components/deliberation/SubjectThreadView.svelte';
import HldFragmentView from '$lib/components/deliberation/HldFragmentView.svelte';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { createTestDefaultEngagements } from '../fixtures/sample-data';
import { prisma } from '$lib/server/prisma';
import { resolveSubjectRequirements } from '$lib/server/projects/requirementsDb';
import { requirementBundleId } from '$lib/domain/requirementAudit';
import { GET as getWorkbench } from '../../src/routes/api/projects/[projectId]/subjects/[subjectId]/workbench/+server';

describe('Issue #309 — Exigences du sujet en Phase 2 & recentrage Phase 3', () => {
	const sampleRequirements: SubjectRequirementItem[] = [
		{
			id: 'req:abc:REQ-1.1',
			clauseRef: 'REQ-1.1',
			title: 'Chiffrement de bout en bout des flux critiques',
			criticality: 'bloquant',
			text: 'Tous les flux inter-sites doivent être chiffrés via TLS 1.3 ou IPsec avec renouvellement automatique des clés.',
			sourceTitle: 'CCTP Lot 1'
		},
		{
			id: 'req:abc:REQ-1.2',
			clauseRef: 'REQ-1.2',
			title: 'Journalisation centralisée et horodatée',
			criticality: 'majeur',
			text: 'Les journaux de sécurité doivent être conservés 12 mois avec horodatage NTP sécurisé.',
			sourceTitle: 'CCTP Lot 1'
		}
	];

	describe('SubjectRequirementsDrawer (Phase 2)', () => {
		it('affiche un tiroir compact par défaut avec compteur et criticités', () => {
			const { html } = render(SubjectRequirementsDrawer, {
				props: {
					requirements: sampleRequirements,
					defaultOpen: false
				}
			});

			expect(html).toContain('data-testid="subject-requirements-drawer"');
			expect(html).toContain('data-testid="toggle-subject-requirements-btn"');
			expect(html).toContain('Exigences RFP rattachées');
			expect(html).toContain('2');
			expect(html).toContain('1 bloquant');
			expect(html).toContain('1 majeur');
			expect(html).not.toContain('data-testid="subject-requirements-list"');
		});

		it('déplie la liste avec clauseRef, titre, criticité et bouton texte complet', () => {
			const { html } = render(SubjectRequirementsDrawer, {
				props: {
					requirements: sampleRequirements,
					defaultOpen: true
				}
			});

			expect(html).toContain('data-testid="subject-requirements-list"');
			expect(html).toContain('REQ-1.1');
			expect(html).toContain('Chiffrement de bout en bout des flux critiques');
			expect(html).toContain('bloquant');
			expect(html).toContain('REQ-1.2');
			expect(html).toContain('Journalisation centralisée et horodatée');
			expect(html).toContain('majeur');
			expect(html).toContain('data-testid="toggle-requirement-text-REQ-1.1"');
			expect(html).toContain('data-testid="toggle-all-requirements-text-btn"');
		});

		it('signale les références non résolues si le dossier RFP est absent', () => {
			const { html } = render(SubjectRequirementsDrawer, {
				props: {
					requirements: [],
					unresolvedRefs: ['req:missing:CLAUSE-9'],
					dossierPresent: false,
					defaultOpen: true
				}
			});

			expect(html).toContain("Dossier d'exigences RFP non enregistré");
			expect(html).toContain('req:missing:CLAUSE-9');
		});
	});

	describe('Intégration SubjectThreadView (Phase 2) & HldFragmentView (Phase 3)', () => {
		it('SubjectThreadView expose le tiroir des exigences RFP dès la Phase 2', () => {
			deliberationStore.initFromDb(createTestDefaultEngagements(), []);
			const targetSubject = deliberationStore.subjects[0];
			deliberationStore.selectSubject(targetSubject.id);

			const { html } = render(SubjectThreadView, {
				props: {
					subjectId: targetSubject.id,
					projectId: deliberationStore.activeEngagement.id,
					userRole: 'lead_architect',
					isHumanUser: true,
					initialRequirements: sampleRequirements
				}
			});

			expect(html).toContain('data-testid="subject-requirements-drawer"');
			expect(html).toContain('Exigences RFP rattachées');
			expect(html).toContain('1 bloquant');
			expect(html).toContain('1 majeur');
		});

		it('HldFragmentView ne crash pas au rendu et expose le composant Phase 3', () => {
			const { html } = render(HldFragmentView, { props: {} });
			expect(html).toBeDefined();
		});
	});

	describe('Résolution serveur & API /workbench', () => {
		const projectId = 'proj-issue309-test';
		const subjectId = 'subj-issue309-test';
		const sha = 'sha256:' + 'a'.repeat(64);
		const reqCanonicalId = requirementBundleId(sha, 'ART-4.2');

		beforeEach(async () => {
			await prisma.subject.deleteMany({ where: { id: subjectId } });
			await prisma.requirement.deleteMany({ where: { source: { projectId } } });
			await prisma.requirementSource.deleteMany({ where: { projectId } });
			await prisma.project.deleteMany({ where: { id: projectId } });

			await prisma.project.create({
				data: {
					id: projectId,
					title: 'Projet Test Issue 309',
					shortName: 'P309',
					type: 'project_rfp',
					badge: 'TEST',
					description: 'Test requirements resolution'
				}
			});

			const source = await prisma.requirementSource.create({
				data: {
					id: `${projectId}:src-1`,
					projectId,
					kind: 'rfp',
					title: 'CCTP Réseau',
					language: 'fr',
					version: 'v1.0',
					sha256: sha,
					auditModel: 'test-model',
					auditedAt: new Date()
				}
			});

			await prisma.requirement.create({
				data: {
					sourceId: source.id,
					position: 0,
					clauseRef: 'ART-4.2',
					title: 'Redondance des liens WAN',
					text: 'Chaque site critique doit disposer de deux liens opérateurs physiquement distincts.',
					criticality: 'bloquant',
					proposedDisposition: 'deliberated',
					proposedBy: 'model:test',
					proposedAt: new Date()
				}
			});

			await prisma.subject.create({
				data: {
					id: subjectId,
					projectId,
					sectionRef: '4.2',
					name: 'Architecture WAN',
					problemStatement: 'Choisir la topologie WAN redondante',
					maturityLevel: 'L1_framed',
					requirementRefs: JSON.stringify([reqCanonicalId, 'req:unknown:MISSING-1']),
					waitingForRole: 'lead_architect'
				}
			});
		});

		afterEach(async () => {
			await prisma.subject.deleteMany({ where: { id: subjectId } });
			await prisma.requirement.deleteMany({ where: { source: { projectId } } });
			await prisma.requirementSource.deleteMany({ where: { projectId } });
			await prisma.project.deleteMany({ where: { id: projectId } });
		});

		it('resolveSubjectRequirements résout le texte complet et isole les références manquantes', async () => {
			const res = await resolveSubjectRequirements(
				projectId,
				JSON.stringify([reqCanonicalId, 'req:unknown:MISSING-1'])
			);

			expect(res.dossierPresent).toBe(true);
			expect(res.items).toHaveLength(1);
			expect(res.items[0]).toMatchObject({
				id: reqCanonicalId,
				clauseRef: 'ART-4.2',
				title: 'Redondance des liens WAN',
				criticality: 'bloquant',
				text: 'Chaque site critique doit disposer de deux liens opérateurs physiquement distincts.',
				sourceTitle: 'CCTP Réseau'
			});
			expect(res.unresolvedRefs).toEqual(['req:unknown:MISSING-1']);
		});

		it('GET /workbench inclut requirements, requirementsUnresolvedRefs et requirementsDossierPresent', async () => {
			const event = {
				params: { projectId, subjectId },
				request: new Request(`http://localhost/api/projects/${projectId}/subjects/${subjectId}/workbench`),
				locals: {
					session: {
						user: { id: 'u1', email: 'alice@test.local', name: 'Alice', role: 'admin' },
						expires: new Date(Date.now() + 60_000).toISOString()
					}
				}
			} as unknown as Parameters<typeof getWorkbench>[0];

			const res = await getWorkbench(event);
			expect(res.status).toBe(200);
			const body = await res.json();

			expect(body.requirementsDossierPresent).toBe(true);
			expect(body.requirements).toHaveLength(1);
			expect(body.requirements[0].clauseRef).toBe('ART-4.2');
			expect(body.requirements[0].text).toContain('deux liens opérateurs physiquement distincts');
			expect(body.requirementsUnresolvedRefs).toEqual(['req:unknown:MISSING-1']);
		});
	});
});
