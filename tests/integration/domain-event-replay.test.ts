import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { replaySubject, type ReplayDomainEvent } from '$lib/domain/eventReplay';
import { prisma } from '$lib/server/prisma';
import {
	createProject,
	createSubject,
	updateSubject,
	getDomainEvents,
	type ActorInfo
} from '$lib/server/projects/projectsDb';

describe('Domain Event Replay (replaySubject)', () => {
	it('1. Reconstitue un sujet de façon pure et déterministe à partir d\'une série d\'événements', () => {
		const baseDate = new Date('2026-09-01T10:00:00Z');

		const events: ReplayDomainEvent[] = [
			{
				projectId: 'proj-1',
				entityType: 'subject',
				entityId: 'subj-101',
				type: 'SUBJECT_CREATED',
				payload: {
					name: 'Cœur de Réseau & Tranches 5G',
					sectionRef: '§4.4',
					domain: 'telecom',
					maturityLevel: 'L0_named',
					deliberationStatus: 'open',
					waitingForRole: 'lead_architect',
					relativeEffort: 'XL',
					blockingCount: 3,
					unlocksCount: 5
				},
				actorId: 'architect-1',
				createdAt: new Date(baseDate.getTime() + 1000)
			},
			{
				projectId: 'proj-1',
				entityType: 'subject',
				entityId: 'subj-101',
				type: 'SUBJECT_UPDATED',
				payload: {
					problemStatement: 'Découpage du plan utilisateur (UPF) sous contraintes d\'isolation matérielle.'
				},
				actorId: 'expert-upf',
				createdAt: new Date(baseDate.getTime() + 2000)
			},
			{
				projectId: 'proj-1',
				entityType: 'subject',
				entityId: 'subj-101',
				type: 'MATURITY_CHANGED',
				payload: {
					maturityLevel: 'L2_decomposed'
				},
				actorId: 'architect-1',
				createdAt: new Date(baseDate.getTime() + 3000)
			},
			{
				projectId: 'proj-1',
				entityType: 'subject',
				entityId: 'subj-101',
				type: 'DELIBERATION_STATUS_CHANGED',
				payload: {
					deliberationStatus: 'ready_for_arbitration'
				},
				actorId: 'architect-1',
				createdAt: new Date(baseDate.getTime() + 4000)
			},
			{
				projectId: 'proj-1',
				entityType: 'subject',
				entityId: 'subj-101',
				type: 'MATURITY_CHANGED',
				payload: {
					maturityLevel: 'L3_decided'
				},
				actorId: 'lead-architect',
				createdAt: new Date(baseDate.getTime() + 5000)
			}
		];

		const replayed = replaySubject(events);
		expect(replayed).not.toBeNull();
		expect(replayed?.id).toBe('subj-101');
		expect(replayed?.name).toBe('Cœur de Réseau & Tranches 5G');
		expect(replayed?.sectionRef).toBe('§4.4');
		expect(replayed?.maturityLevel).toBe('L3_decided');
		expect(replayed?.deliberationStatus).toBe('ready_for_arbitration');
		expect(replayed?.relativeEffort).toBe('XL');
		expect(replayed?.problemStatement).toContain('Découpage du plan utilisateur');
		expect(replayed?.version).toBe(5);
		expect(replayed?.lastUpdatedBy).toBe('lead-architect');
	});

	it('2. Permet le voyage dans le temps (Time-Travel) en rejouant jusqu\'à un instant t', () => {
		const baseDate = new Date('2026-09-01T10:00:00Z');

		const allEvents: ReplayDomainEvent[] = [
			{
				projectId: 'proj-1',
				entityType: 'subject',
				entityId: 'subj-101',
				type: 'SUBJECT_CREATED',
				payload: {
					name: 'Cœur de Réseau 5G',
					sectionRef: '§4.4',
					maturityLevel: 'L0_named'
				},
				createdAt: new Date(baseDate.getTime() + 1000)
			},
			{
				projectId: 'proj-1',
				entityType: 'subject',
				entityId: 'subj-101',
				type: 'MATURITY_CHANGED',
				payload: { maturityLevel: 'L1_framed' },
				createdAt: new Date(baseDate.getTime() + 2000)
			},
			{
				projectId: 'proj-1',
				entityType: 'subject',
				entityId: 'subj-101',
				type: 'MATURITY_CHANGED',
				payload: { maturityLevel: 'L2_decomposed' },
				createdAt: new Date(baseDate.getTime() + 3000)
			}
		];

		// Rejeu uniquement jusqu'à l'étape 2 (L1_framed)
		const slice = allEvents.slice(0, 2);
		const stateAtT2 = replaySubject(slice);

		expect(stateAtT2?.maturityLevel).toBe('L1_framed');
		expect(stateAtT2?.version).toBe(2);
	});

	it('3. Rejoue les événements persistés dans la base de données réelle', async () => {
		const pId = `proj-replay-${Date.now()}`;
		const sId = `subj-replay-${Date.now()}`;
		const actor: ActorInfo = { userId: 'alice', role: 'lead_architect' };

		try {
			await createProject(
				{
					id: pId,
					title: 'Projet Rejeu Test',
					shortName: 'PRT',
					badge: 'REPLAY'
				},
				actor
			);

			await createSubject(
				pId,
				{
					id: sId,
					sectionRef: '§2.1',
					name: 'Sujet Rejeu DB',
					maturityLevel: 'L0_named'
				},
				actor
			);

			await updateSubject(
				pId,
				sId,
				{
					expectedVersion: 1,
					maturityLevel: 'L1_framed'
				},
				actor
			);

			await updateSubject(
				pId,
				sId,
				{
					expectedVersion: 2,
					maturityLevel: 'L2_decomposed',
					problemStatement: 'Problème identifié et documenté'
				},
				actor
			);

			// Lecture du ledger d'événements
			const dbEvents = await getDomainEvents(pId, { entityType: 'subject' });
			const subjectEvents = dbEvents.filter((e) => e.entityId === sId);

			expect(subjectEvents.length).toBe(3);

			const replayed = replaySubject(subjectEvents);
			expect(replayed?.id).toBe(sId);
			expect(replayed?.maturityLevel).toBe('L2_decomposed');
			expect(replayed?.problemStatement).toBe('Problème identifié et documenté');
			expect(replayed?.version).toBe(3);
		} finally {
			await prisma.project.deleteMany({ where: { id: pId } });
		}
	});
});
