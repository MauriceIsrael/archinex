import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import {
	normalizeFactValue,
	extractFactsHeuristicallyFromText,
	evaluateSemanticReflexMatch,
	detectOverlappingReflexes,
	type ReflexRuleRecord
} from '$lib/domain/reflexStudio';
import { evaluateCondition } from '$lib/domain/projectRules';
import { listPublishedReferenceRules } from '$lib/server/rules/reflexCatalogService';
import { getOrCreateCascadeForDecision } from '$lib/server/cascade/cascadeService';
import { GET as getStudioEndpoint, POST as createReflexEndpoint } from '../../src/routes/api/admin/reflexes/+server';
import {
	PATCH as patchReflexEndpoint,
	DELETE as deleteReflexEndpoint
} from '../../src/routes/api/admin/reflexes/[ruleId]/+server';
import { POST as simulateEndpoint } from '../../src/routes/api/admin/reflexes/simulate/+server';
import { PUT as putVocabEndpoint } from '../../src/routes/api/admin/reflexes/vocabulary/+server';

describe('Studio Admin des Réflexes d’Architecture (Contrat & Domaine)', () => {
	const testProjectId = 'test-proj-reflex-studio';
	const testSubjectId = 'sub-reflex-studio-1';
	const customRuleId = 'RFX-TEST-LATENCY';

	const adminLocals = {
		session: {
			user: { id: 'usr-admin-rfx', email: 'admin-rfx@archinex.local', name: 'Admin RFX', role: 'admin' }
		}
	};

	const regularUserLocals = {
		session: {
			user: { id: 'usr-user-rfx', email: 'user-rfx@archinex.local', name: 'User RFX', role: 'user' }
		}
	};

	beforeAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
		await prisma.reflexRule.deleteMany({ where: { id: customRuleId } });

		await prisma.project.create({
			data: {
				id: testProjectId,
				title: 'Projet Test Studio Réflexes',
				shortName: 'proj-rfx',
				type: 'project_rfp',
				badge: 'RFX',
				description: 'Validation du studio admin et de la normalisation par alias'
			}
		});

		await prisma.subject.create({
			data: {
				id: testSubjectId,
				projectId: testProjectId,
				sectionRef: '§8',
				name: 'Architecture Interconnexion WAN',
				problemStatement: 'Latence inter-sites',
				maturityLevel: 'L3_decided',
				deliberationStatus: 'arbitrated',
				waitingForRole: 'lead_architect',
				relativeEffort: 'M',
				version: 1
			}
		});

		await prisma.statement.create({
			data: {
				id: `stmt-${testSubjectId}-latency`,
				projectId: testProjectId,
				subjectId: testSubjectId,
				section: '§8',
				subjectRef: 'WAN',
				predicate: 'latency_target',
				value: '8',
				author: 'admin-rfx',
				role: 'lead_architect',
				productionMode: 'human-authored',
				confidence: 'verified',
				subjectLevel: 'L3_decided',
				status: 'active'
			}
		});
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
		await prisma.reflexRule.deleteMany({ where: { id: customRuleId } });
	});

	it('1. Normalisation par alias : active-active et 2 datacenters matchent les règles canoniques', () => {
		const normResil = normalizeFactValue('resilience_mode', 'active-active');
		expect(normResil.canonical).toBe('actif/actif');
		expect(normResil.matchedAlias).toBe('active-active');

		expect(
			evaluateCondition({ key: 'resilience_mode', op: 'eq', value: 'actif/actif' }, 'active-active')
		).toBe(true);

		expect(evaluateCondition({ key: 'site_count', op: 'gte', value: '2' }, '2 sites')).toBe(true);
		expect(
			evaluateCondition({ key: 'sovereignty_level', op: 'eq', value: 'secnumcloud' }, 'SecNumCloud 3.2')
		).toBe(true);
	});

	it('2. Extraction heuristique sur texte libre, filet sémantique et détection de recouvrement', () => {
		const facts = extractFactsHeuristicallyFromText(
			'Nous retenons une topologie sur 2 datacenters en mode active-active avec hébergement qualifié ANSSI.'
		);
		expect(facts.find((f) => f.key === 'site_count')?.value).toBe('2');
		expect(facts.find((f) => f.key === 'resilience_mode')?.value).toBe('actif/actif');
		expect(facts.find((f) => f.key === 'sovereignty_level')?.value).toBe('secnumcloud');

		const sem = evaluateSemanticReflexMatch(
			'Arbitrage sur la réplication synchrone et le rpo nul entre deux salles.',
			{
				title: 'Continuité Bi-Site',
				semanticHints: ['réplication synchrone', 'rpo nul', 'bi-site'],
				action: {
					subjectName: 'Réplication et RPO',
					question: 'Quelle stratégie RPO ?',
					rationale: '',
					initialLevel: 'L1_framed',
					suggestedRole: 'lead_architect',
					mandatory: true
				}
			}
		);
		expect(sem.score).toBeGreaterThanOrEqual(0.35);

		const dummyA: ReflexRuleRecord = {
			id: 'A',
			version: 1,
			status: 'published',
			title: 'A',
			domain: 'resilience',
			assetRef: 'A',
			assetType: 'pattern',
			mandatory: false,
			conditions: [{ key: 'site_count', op: 'gte', value: '2' }],
			semanticHints: [],
			action: {
				subjectName: 'Quorum',
				question: 'Q1?',
				rationale: '',
				initialLevel: 'L1_framed',
				suggestedRole: 'lead_architect',
				mandatory: false
			},
			source: 'admin_authored'
		};
		const dummyB: ReflexRuleRecord = { ...dummyA, id: 'B', title: 'B' };
		const overlaps = detectOverlappingReflexes([dummyA, dummyB]);
		expect(overlaps).toHaveLength(1);
	});

	it('3. Sécurité RBAC : un utilisateur non-admin reçoit HTTP 403 sur les endpoints /api/admin/reflexes', async () => {
		await expect(
			getStudioEndpoint({
				locals: regularUserLocals,
				request: new Request('http://localhost')
			} as any)
		).rejects.toMatchObject({ status: 403 });

		await expect(
			createReflexEndpoint({
				locals: regularUserLocals,
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				})
			} as any)
		).rejects.toMatchObject({ status: 403 });
	});

	it('4. Cycle de vie complet : brouillon isolé -> publication -> cascade projet -> révision -> simulation', async () => {
		// Seed initial + chargement studio
		const getRes = await getStudioEndpoint({
			locals: adminLocals,
			request: new Request('http://localhost')
		} as any);
		expect(getRes.status).toBe(200);
		const studio = await getRes.json();
		expect(studio.rules.some((r: any) => r.id === 'DOC-HA-01')).toBe(true);
		expect(studio.vocabulary.some((v: any) => v.key === 'resilience_mode')).toBe(true);

		// Créer un réflexe en brouillon (latency_target <= 10)
		const createRes = await createReflexEndpoint({
			locals: adminLocals,
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: customRuleId,
					title: 'Budget Latence Fibre Noire',
					domain: 'network',
					assetType: 'control',
					mandatory: true,
					status: 'draft',
					conditions: [{ key: 'latency_target', op: 'lte', value: '10' }],
					semanticHints: ['latence', 'fibre noire', 'rtt'],
					action: {
						subjectName: 'Budget Latence Optique',
						question: 'Quelle marge de latence RTT sur les liaisons optiques ?',
						rationale: 'Une latence cible <= 10ms contraint le routage physique.',
						initialLevel: 'L1_framed',
						suggestedRole: 'lead_architect',
						mandatory: true
					}
				})
			})
		} as any);
		expect(createRes.status).toBe(201);

		// Tant qu'il est en brouillon, il ne doit PAS être publié ni déclencher de cascade sur le projet
		const publishedWhileDraft = await listPublishedReferenceRules();
		expect(publishedWhileDraft.some((r) => r.id === customRuleId)).toBe(false);
		const cascadeBefore = await getOrCreateCascadeForDecision({
			projectId: testProjectId,
			subjectId: testSubjectId
		});
		expect(cascadeBefore.questions.some((q) => q.lineage.ruleRef === customRuleId)).toBe(false);

		// Publication puis révision (v1 -> v2)
		const publishRes = await patchReflexEndpoint({
			locals: adminLocals,
			params: { ruleId: customRuleId },
			request: new Request('http://localhost', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'published' })
			})
		} as any);
		expect(publishRes.status).toBe(200);
		expect((await publishRes.json()).rule.version).toBe(1);

		const reviseRes = await patchReflexEndpoint({
			locals: adminLocals,
			params: { ruleId: customRuleId },
			request: new Request('http://localhost', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Budget Latence Fibre Noire (Révisé)' })
			})
		} as any);
		expect(reviseRes.status).toBe(200);
		expect((await reviseRes.json()).rule.version).toBe(2);

		// Une fois publié, le projet (latency_target=8 <= 10) déclenche ce réflexe en cascade !
		const cascadeAfter = await getOrCreateCascadeForDecision({
			projectId: testProjectId,
			subjectId: testSubjectId
		});
		expect(cascadeAfter.questions.some((q) => q.lineage.ruleRef === customRuleId)).toBe(true);

		// Simulation bac à sable + replay historique
		const simRes = await simulateEndpoint({
			locals: adminLocals,
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text: 'Architecture active-active sur 2 sites avec contrainte 5 ms.',
					ruleId: customRuleId,
					includeHistoricalReplay: true
				})
			})
		} as any);
		expect(simRes.status).toBe(200);
		const simBody = await simRes.json();
		expect(simBody.matches.some((m: any) => m.ruleId === customRuleId && m.matchKind === 'deterministic')).toBe(true);
		expect(simBody.replaySummary).toBeDefined();

		// Mise à jour du vocabulaire avec un nouvel alias
		const vocabRes = await putVocabEndpoint({
			locals: adminLocals,
			request: new Request('http://localhost', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					key: 'resilience_mode',
					label: 'Mode de résilience',
					valueType: 'enum',
					description: 'Test update alias',
					canonicalValues: [
						{
							canonical: 'actif/actif',
							label: 'Actif / Actif (synchrone)',
							aliases: ['active/active', 'active-active', 'ultra-dispo']
						}
					]
				})
			})
		} as any);
		expect(vocabRes.status).toBe(200);

		const delRes = await deleteReflexEndpoint({
			locals: adminLocals,
			params: { ruleId: customRuleId },
			request: new Request('http://localhost', { method: 'DELETE' })
		} as any);
		expect(delRes.status).toBe(200);
	});
});
