import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { canDecideAlone } from '$lib/domain/options';
import { canCloseObjection, canResolveSpecificObjection } from '$lib/domain/debate';
import { canArbitrateSubject } from '$lib/server/projects/arbitrationDb';
import { resolveProjectActor } from '$lib/server/projects/actorHelper';
import { createArgument, resolveArgument } from '$lib/server/projects/debateDb';
import type { RequestEvent } from '@sveltejs/kit';

describe('Role Unification (admin vs lead_architect) & Objection Author Separation', () => {
	const projectId = 'test-proj-roles-obj-1';
	const subjectId = 'test-subj-roles-obj-1';
	const userA = 'test-user-lead-a';
	const userB = 'test-user-admin-lead-b';
	const userAdminOnly = 'test-user-admin-only';

	beforeEach(async () => {
		await prisma.project.deleteMany({ where: { id: projectId } });
		await prisma.user.deleteMany({ where: { id: { in: [userA, userB, userAdminOnly] } } });

		await prisma.user.createMany({
			data: [
				{ id: userA, name: 'Lead A', email: 'leada@example.test', passwordHash: 'h', role: 'user' },
				{ id: userB, name: 'Admin Lead B', email: 'adminleadb@example.test', passwordHash: 'h', role: 'admin' },
				{ id: userAdminOnly, name: 'Pure Admin', email: 'pureadmin@example.test', passwordHash: 'h', role: 'admin' }
			]
		});

		await prisma.project.create({
			data: {
				id: projectId,
				title: 'Test Roles Project',
				shortName: 'TRP',
				type: 'rfp',
				badge: 'TEST',
				description: 'Test',
				status: 'active',
				strategy: 'test',
				members: {
					create: [
						{ userId: userA, role: 'lead_architect', domains: '[]' },
						{ userId: userB, role: 'lead_architect', domains: '[]' }
					]
				}
			}
		});

		await prisma.subject.create({
			data: {
				id: subjectId,
				projectId,
				sectionRef: '§1.1',
				name: 'Sujet test séparation',
				domain: 'general',
				problemStatement: 'Test',
				maturityLevel: 'L1_dilemma',
				deliberationStatus: 'open',
				waitingForRole: 'lead_architect',
				relativeEffort: 'M'
			}
		});
	});

	afterEach(async () => {
		await prisma.project.deleteMany({ where: { id: projectId } });
		await prisma.user.deleteMany({ where: { id: { in: [userA, userB, userAdminOnly] } } });
	});

	it('separates platform admin from project lead_architect in decision and arbitration helpers', () => {
		expect(canDecideAlone('admin')).toBe(false);
		expect(canDecideAlone('lead_architect')).toBe(true);
		expect(canCloseObjection('admin', true)).toBe(false);
		expect(canCloseObjection('lead_architect', true)).toBe(true);
		expect(canArbitrateSubject({ userId: userAdminOnly, role: 'admin' }, 'general')).toBe(false);
		expect(canArbitrateSubject({ userId: userA, role: 'lead_architect' }, 'general')).toBe(true);
	});

	it('resolveProjectActor resolves project_members.role even when session user.role is admin', async () => {
		const mockEvent = {
			locals: { session: { user: { id: userB, email: 'adminleadb@example.test', name: 'Admin Lead B', role: 'admin' } } },
			request: new Request('http://localhost/api/test')
		} as unknown as RequestEvent;

		const actor = await resolveProjectActor(mockEvent, projectId);
		expect(actor.role).toBe('lead_architect');

		const nonMemberAdminEvent = {
			locals: { session: { user: { id: userAdminOnly, email: 'pureadmin@example.test', name: 'Pure Admin', role: 'admin' } } },
			request: new Request('http://localhost/api/test')
		} as unknown as RequestEvent;

		const nonMemberActor = await resolveProjectActor(nonMemberAdminEvent, projectId);
		expect(nonMemberActor.role).toBe('admin');
	});

	it('prevents an author from answering/accepting their own objection, allows withdrawing it, and allows another lead_architect to close it', async () => {
		const obj = await createArgument(
			subjectId,
			{
				id: 'arg-obj-sep-1',
				stance: 'objection',
				claim: 'Risque de latence critique',
				grounds: 'Le saut réseau dépasse le seuil.',
				kbRefs: [],
				confidence: 'designed',
				authorKind: 'human',
				round: 1
			},
			{ userId: userA, role: 'lead_architect', userName: 'Lead A' }
		);

		// Pure checks
		expect(
			canResolveSpecificObjection(
				{ userId: userA, userName: 'Lead A', role: 'lead_architect', isHuman: true },
				{ authorId: obj.authorId ?? userA, authorName: obj.author },
				'answered'
			).allowed
		).toBe(false);

		expect(
			canResolveSpecificObjection(
				{ userId: userA, userName: 'Lead A', role: 'lead_architect', isHuman: true },
				{ authorId: obj.authorId ?? userA, authorName: obj.author },
				'withdrawn'
			).allowed
		).toBe(true);

		// DB-level enforcement: author cannot answer or accept_risk
		await expect(
			resolveArgument(obj.id, { resolution: 'answered', expectedVersion: 1 }, { userId: userA, role: 'lead_architect' }, true)
		).rejects.toThrow(/propre objection/i);

		await expect(
			resolveArgument(obj.id, { resolution: 'accepted_risk', expectedVersion: 1 }, { userId: userA, role: 'lead_architect' }, true)
		).rejects.toThrow(/propre objection/i);

		// Platform admin without lead_architect project role cannot close it
		await expect(
			resolveArgument(obj.id, { resolution: 'answered', expectedVersion: 1 }, { userId: userAdminOnly, role: 'admin' }, true)
		).rejects.toThrow(/non habilité/i);

		// Another lead_architect (userB) CAN close it
		const resolved = await resolveArgument(
			obj.id,
			{ resolution: 'answered', expectedVersion: 1 },
			{ userId: userB, role: 'lead_architect', userName: 'Admin Lead B' },
			true
		);
		expect(resolved.resolution).toBe('answered');

		// Author CAN withdraw their own objection
		const obj2 = await createArgument(
			subjectId,
			{
				id: 'arg-obj-sep-2',
				stance: 'objection',
				claim: 'Autre point à vérifier',
				grounds: 'Vérification complémentaire requise.',
				kbRefs: [],
				confidence: 'assumed',
				authorKind: 'human',
				round: 1
			},
			{ userId: userA, role: 'lead_architect', userName: 'Lead A' }
		);
		const withdrawn = await resolveArgument(
			obj2.id,
			{ resolution: 'withdrawn', expectedVersion: 1 },
			{ userId: userA, role: 'lead_architect', userName: 'Lead A' },
			true
		);
		expect(withdrawn.resolution).toBe('withdrawn');
	});
});
