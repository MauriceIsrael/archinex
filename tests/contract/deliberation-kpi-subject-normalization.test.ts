import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	normalizeMaturitySubject,
	normalizeMaturitySubjects,
	sortMaturityBoard,
	toSafeCount,
	type MaturitySubject
} from '$lib/domain/maturityBoard';
import { mapPrismaToEngagementProfile } from '$lib/server/engagementsDb';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import type { EngagementProfile } from '$lib/domain/engagements';

describe('Issue #392 — Normalisation des sujets serveur -> store et garde KPI sans NaN', () => {
	beforeEach(() => {
		deliberationStore.engagements = [];
		deliberationStore.activeEngagementId = '';
		deliberationStore.subjects = [];
		deliberationStore.notifications = [];
	});

	it('normalise un sujet au format serveur Prisma (camelCase) vers MaturitySubject canonique', () => {
		const updatedAt = new Date('2026-10-20T09:00:00.000Z');
		const normalized = normalizeMaturitySubject({
			id: 'sub-srv-1',
			sectionRef: '§4.2',
			name: 'Architecture réseau résiliente',
			maturityLevel: 'L2_decomposed',
			blockingCount: 2,
			unlocksCount: 5,
			waitingForRole: 'network_architect',
			relativeEffort: 'L',
			updatedAt,
			deliberationStatus: 'awaiting_review',
			problemStatement: 'Choisir le plan de redondance inter-sites',
			requirementRefs: '["REQ-01","REQ-02"]',
			dependsOn: '["sub-srv-0"]'
		});

		expect(normalized.id).toBe('sub-srv-1');
		expect(normalized.section_ref).toBe('§4.2');
		expect(normalized.name).toBe('Architecture réseau résiliente');
		expect(normalized.level).toBe('L2_decomposed');
		expect(normalized.blocking_count).toBe(2);
		expect(normalized.unlocks_count).toBe(5);
		expect(normalized.waiting_for_role).toBe('network_architect');
		expect(normalized.relative_effort).toBe('L');
		expect(normalized.last_transition_date).toBe(updatedAt.toISOString());
		expect(normalized.stall_days).toBe(0);
		expect(normalized.is_stalled).toBe(false);
		expect(normalized.awaiting_review).toBe(true);
		expect(normalized.problem_statement).toBe('Choisir le plan de redondance inter-sites');
		expect(normalized.requirement_ids).toEqual(['REQ-01', 'REQ-02']);
		expect(normalized.depends_on_subject_ids).toEqual(['sub-srv-0']);
	});

	it('applique des valeurs par défaut finies (0) pour un sujet partiel ou corrompu', () => {
		const partial = normalizeMaturitySubject({
			id: 'sub-partial-1',
			section_ref: '§14',
			name: 'Sujet sans compteurs',
			level: 'L3_decided'
		});

		expect(partial.blocking_count).toBe(0);
		expect(partial.unlocks_count).toBe(0);
		expect(partial.stall_days).toBe(0);
		expect(partial.is_stalled).toBe(false);
		expect(partial.dependent_subject_ids).toEqual([]);
		expect(Number.isFinite(partial.blocking_count)).toBe(true);
		expect(Number.isFinite(partial.unlocks_count)).toBe(true);

		expect(toSafeCount(undefined)).toBe(0);
		expect(toSafeCount(null)).toBe(0);
		expect(toSafeCount(Number.NaN)).toBe(0);
		expect(toSafeCount(Number.POSITIVE_INFINITY)).toBe(0);
		expect(toSafeCount(-3)).toBe(0);
		expect(toSafeCount('abc')).toBe(0);
		expect(toSafeCount('4')).toBe(4);
	});

	it('mapPrismaToEngagementProfile normalise les sujets JSON partiels et camelCase', () => {
		const profile = mapPrismaToEngagementProfile({
			id: 'eng-test-norm',
			title: 'Projet de test',
			shortName: 'Test',
			type: 'project_rfp',
			badge: 'TEST',
			description: 'Description',
			defaultSubjectId: 'sub-1',
			defaultDocId: '',
			strategy: '{}',
			participants: '[]',
			subjects: JSON.stringify([
				{
					id: 'sub-1',
					sectionRef: '§1',
					name: 'Sujet camelCase',
					maturityLevel: 'L1_framed',
					blockingCount: 3,
					unlocksCount: 4
				},
				{
					id: 'sub-2',
					section_ref: '§2',
					name: 'Sujet sans compteurs',
					level: 'L3_decided'
				}
			]),
			drafts: '{}',
			statements: '[]',
			dialogueMessages: '[]',
			createdAt: new Date('2026-10-01T00:00:00.000Z')
		});

		expect(profile.subjects).toHaveLength(2);
		expect(profile.subjects[0].blocking_count).toBe(3);
		expect(profile.subjects[0].unlocks_count).toBe(4);
		expect(profile.subjects[1].blocking_count).toBe(0);
		expect(profile.subjects[1].unlocks_count).toBe(0);
	});

	it('calcule totalUnlocks et totalBlocking sans jamais produire NaN avec des sujets au format serveur', () => {
		const serverFormattedEngagement = {
			id: 'eng-server-shape',
			title: 'Engagement format serveur',
			shortName: 'Serveur',
			type: 'project_rfp',
			badge: 'SRV',
			description: 'Test de non-régression',
			defaultSubjectId: 'sub-a',
			defaultDocId: '',
			subjects: [
				{
					id: 'sub-a',
					sectionRef: '§1.1',
					name: 'Sujet serveur camelCase',
					maturityLevel: 'L2_decomposed',
					blockingCount: 2,
					unlocksCount: 3,
					waitingForRole: 'lead_architect',
					relativeEffort: 'M'
				},
				{
					id: 'sub-b',
					section_ref: '§1.2',
					name: 'Sujet démo sans compteurs',
					level: 'L3_decided'
				},
				{
					id: 'sub-c',
					section_ref: '§1.3',
					name: 'Sujet corrompu NaN',
					level: 'L1_framed',
					blocking_count: Number.NaN,
					unlocks_count: undefined
				}
			] as unknown as MaturitySubject[],
			drafts: {},
			statements: [],
			corpusDocuments: [],
			dialogueMessages: []
		} satisfies EngagementProfile;

		deliberationStore.initFromDb([serverFormattedEngagement], []);

		expect(Number.isFinite(deliberationStore.totalUnlocks)).toBe(true);
		expect(Number.isFinite(deliberationStore.totalBlocking)).toBe(true);
		expect(deliberationStore.totalUnlocks).toBe(3);
		expect(deliberationStore.totalBlocking).toBe(2);

		const sorted = deliberationStore.sortedSubjects;
		expect(sorted.map((s) => s.id)).toEqual(['sub-a', 'sub-b', 'sub-c']);
		expect(sortMaturityBoard(normalizeMaturitySubjects(serverFormattedEngagement.subjects))[0].unlocks_count).toBe(3);
	});

	it('protège l affichage KPI dans DeliberationDashboardKpis.svelte avec Number.isFinite', () => {
		const source = readFileSync(
			resolve(process.cwd(), 'src/lib/components/deliberation/DeliberationDashboardKpis.svelte'),
			'utf-8'
		);
		expect(source).toContain('Number.isFinite(deliberationStore.totalUnlocks)');
		expect(source).toContain('Number.isFinite(deliberationStore.totalBlocking)');
	});
});
