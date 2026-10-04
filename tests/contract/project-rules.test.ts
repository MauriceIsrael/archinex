import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import {
	ARCHINEX_FACT_VOCABULARY,
	DEFAULT_REFERENCE_RULES,
	validateRuleConditionsVocabulary,
	evaluateRuleConditions,
	previewRuleEvaluation,
	buildAnonymizedCandidateFromLocalRule
} from '$lib/domain/projectRules';
import {
	getProjectRules,
	disableReferenceRule,
	enableReferenceRule,
	proposeLocalRule,
	affirmLocalRule,
	previewRuleAgainstProjectFacts,
	proposeLocalRuleToKnowledgeBase
} from '$lib/server/rules/projectRulesService';
import { getOrCreateCascadeForDecision } from '$lib/server/cascade/cascadeService';
import { buildDiscoveryTreeData } from '$lib/domain/cascade';
import { POST as disableEndpoint } from '../../src/routes/api/projects/[projectId]/rules/[ruleId]/disable/+server';
import { POST as localRuleEndpoint } from '../../src/routes/api/projects/[projectId]/rules/+server';
import { POST as affirmEndpoint } from '../../src/routes/api/projects/[projectId]/rules/[ruleId]/affirm/+server';
import { POST as proposeKbEndpoint } from '../../src/routes/api/projects/[projectId]/rules/[ruleId]/propose-kb/+server';
import type { RequestEvent } from '@sveltejs/kit';

describe('Lot A30 Contract Tests: Règles du projet, désactivation justifiée, règles locales & capitalisation (#41)', () => {
	const testProjectId = 'test-proj-rules-41';
	const testSubjectId = 'sub-rules-ha-41';

	beforeAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });

		await prisma.project.create({
			data: {
				id: testProjectId,
				title: 'Projet Secret Titan',
				shortName: 'titan-core',
				type: 'project_rfp',
				badge: 'A30',
				description: 'Vérification des règles projet et K13/K16',
				strategy: JSON.stringify({
					clientName: 'Banque Nationale Titan',
					sites: ['DC-Paris-01', 'DC-Lyon-02']
				})
			}
		});

		await prisma.subject.create({
			data: {
				id: testSubjectId,
				projectId: testProjectId,
				sectionRef: '§4',
				name: 'Topologie Haute Disponibilité et Continuité',
				problemStatement: 'Architecture de résilience multi-site',
				maturityLevel: 'L3_decided',
				deliberationStatus: 'decided',
				waitingForRole: 'lead_architect',
				relativeEffort: 'L',
				version: 1
			}
		});

		await prisma.decision.create({
			data: {
				id: `dec-${testSubjectId}`,
				subjectId: testSubjectId,
				retainedOptionId: 'opt-bi-site',
				rationale: 'Bi-site actif/actif retenu.',
				reversibility: 'costly',
				arbiterId: 'user-lead-41',
				arbiterRole: 'lead_architect',
				version: 1
			}
		});

		// Faits initiaux : bi-site actif/actif
		await prisma.statement.create({
			data: {
				id: `stmt-site-${testSubjectId}`,
				projectId: testProjectId,
				subjectId: testSubjectId,
				section: '§4',
				subjectRef: testSubjectId,
				predicate: 'site_count',
				value: '2',
				author: 'user-lead-41',
				role: 'lead_architect',
				productionMode: 'human-authored',
				confidence: 'verified',
				subjectLevel: 'L3_decided',
				status: 'active'
			}
		});

		await prisma.statement.create({
			data: {
				id: `stmt-resil-${testSubjectId}`,
				projectId: testProjectId,
				subjectId: testSubjectId,
				section: '§4',
				subjectRef: testSubjectId,
				predicate: 'resilience_mode',
				value: 'actif/actif',
				author: 'user-lead-41',
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
	});

	it('1. Rejette la désactivation d’une règle de référence sans justification obligatoire (HTTP 400)', async () => {
		// Mock RequestEvent sans justification
		const mockEvent = {
			params: { projectId: testProjectId, ruleId: 'DOC-HA-01' },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'x-user-role': 'decider' },
				body: JSON.stringify({ justification: '' })
			})
		} as unknown as RequestEvent;

		const response = await disableEndpoint(mockEvent);
		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toContain('justification explicite');
	});

	it('2. Rejette la désactivation d’une règle par un rôle non-décideur (HTTP 403)', async () => {
		const mockEvent = {
			params: { projectId: testProjectId, ruleId: 'DOC-HA-01' },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'x-user-role': 'contributor' },
				body: JSON.stringify({ justification: 'Non pertinent pour ce projet.' })
			})
		} as unknown as RequestEvent;

		const response = await disableEndpoint(mockEvent);
		expect(response.status).toBe(403);
	});

	it('3. Désactive une règle avec justification par un decider et la fait apparaître dans l’arbre de découverte', async () => {
		const mockEvent = {
			params: { projectId: testProjectId, ruleId: 'DOC-HA-01' },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-user-role': 'lead_architect',
					'x-user-id': 'user-lead-41'
				},
				body: JSON.stringify({
					justification: 'Les deux sites sont situés sur le même campus avec latence < 0.5ms sous fibre noire dédiée.'
				})
			})
		} as unknown as RequestEvent;

		const response = await disableEndpoint(mockEvent);
		expect(response.status).toBe(200);

		// Vérifier l'état dans la base
		const rulesState = await getProjectRules(testProjectId);
		const docHaRule = rulesState.referenceRules.find((r) => r.id === 'DOC-HA-01');
		expect(docHaRule?.status).toBe('disabled');
		expect(docHaRule?.override?.justification).toContain('fibre noire dédiée');

		// Vérifier l'apparition dans l'arbre de découverte (buildDiscoveryTreeData)
		const treeSeries = buildDiscoveryTreeData({
			parentSubject: { id: testSubjectId, name: 'Topologie HA' },
			childSubjects: [],
			disabledRules: [
				{
					ruleId: 'DOC-HA-01',
					ruleName: 'Topologie Bi-Site',
					justification: docHaRule!.override!.justification,
					disabledBy: docHaRule!.override!.disabledBy,
					mandatory: true
				}
			]
		});

		const rootChildren = treeSeries[0].data[0].children[0].children;
		const disabledNode = rootChildren.find((n: any) => n.name.includes('DOC-HA-01'));
		expect(disabledNode).toBeDefined();
		expect(disabledNode.category).toContain('Désactivée');
		expect(disabledNode.match.reasons[0]).toContain('fibre noire dédiée');
	});

	it('4. Rejette une règle locale contenant des clés hors du vocabulaire K18 (HTTP 400)', async () => {
		const mockEvent = {
			params: { projectId: testProjectId },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'x-user-role': 'contributor' },
				body: JSON.stringify({
					name: 'Règle avec clé arbitraire non conforme',
					conditions: [{ key: 'cle_inventee_non_reconnue', op: 'eq', value: 'quelque_chose' }],
					action: {
						question: 'Une question arbitraire valide ?',
						subjectName: 'Sujet test',
						rationale: 'Test',
						initialLevel: 'L1_framed',
						suggestedRole: 'lead_architect',
						mandatory: false
					}
				})
			})
		} as unknown as RequestEvent;

		const response = await localRuleEndpoint(mockEvent);
		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toContain('Vocabulaire invalide');
	});

	it('5. Valide que l’aperçu d’une règle locale donne le même résultat que le moteur déterministe pour les mêmes faits', async () => {
		const testConditions = [
			{ key: 'resilience_mode', op: 'eq' as const, value: 'actif/actif' },
			{ key: 'site_count', op: 'gte' as const, value: '2' }
		];
		const facts = [
			{ key: 'resilience_mode', value: 'actif/actif' },
			{ key: 'site_count', value: '2' }
		];

		const pureEvaluation = evaluateRuleConditions(testConditions, facts);
		expect(pureEvaluation).toBe(true);

		const preview = previewRuleEvaluation(
			{
				id: 'preview-rule-1',
				name: 'Test Règle',
				conditions: testConditions,
				action: {
					question: 'Quel protocole de synchronisation ?',
					subjectName: 'Synchro Data',
					rationale: 'HA multi-site',
					initialLevel: 'L1_framed',
					suggestedRole: 'lead_architect',
					mandatory: true
				}
			},
			facts
		);

		expect(preview.matches).toBe(pureEvaluation);
		expect(preview.triggeredSubjectName).toBe('Synchro Data');
		expect(preview.triggeredQuestion).toBe('Quel protocole de synchronisation ?');
	});

	it('6. Propose une règle locale puis interdit son auto-affirmation par son auteur (Invariant K16, HTTP 409)', async () => {
		const authorId = 'user-contributor-bob';

		// 1. Bob propose la règle
		const proposedRule = await proposeLocalRule({
			projectId: testProjectId,
			name: 'Règle locale de partitionnement réseau',
			conditions: [{ key: 'site_count', op: 'gte', value: '2' }],
			action: {
				question: 'Quel mécanisme de détection de partition réseau déployer ?',
				subjectName: 'Partition Réseau',
				rationale: 'Éviter split-brain local',
				initialLevel: 'L1_framed',
				suggestedRole: 'security_officer',
				mandatory: true
			},
			actor: { userId: authorId, role: 'contributor', productionMode: 'human-authored' }
		});

		expect(proposedRule.status).toBe('proposed');
		expect(proposedRule.authorId).toBe(authorId);

		// 2. Bob (même avec un rôle temporaire de decider) essaie d'affirmer sa propre règle -> Rejet K16
		const mockSelfAffirmEvent = {
			params: { projectId: testProjectId, ruleId: proposedRule.id },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-user-role': 'lead_architect',
					'x-user-id': authorId // Même auteur !
				}
			})
		} as unknown as RequestEvent;

		const response = await affirmEndpoint(mockSelfAffirmEvent);
		expect(response.status).toBe(409);
		const data = await response.json();
		expect(data.error).toContain('Invariant K16 violé');
	});

	it('7. Affirme la règle locale par un decider distinct (Invariant K16 respecté)', async () => {
		const rulesState = await getProjectRules(testProjectId);
		const localRule = rulesState.localRules.find((r) => r.status === 'proposed');
		expect(localRule).toBeDefined();

		const distinctDeciderId = 'user-decider-alice';

		const mockDistinctAffirmEvent = {
			params: { projectId: testProjectId, ruleId: localRule!.id },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-user-role': 'decider',
					'x-user-id': distinctDeciderId // Décideur distinct !
				}
			})
		} as unknown as RequestEvent;

		const response = await affirmEndpoint(mockDistinctAffirmEvent);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.rule.status).toBe('affirmed');
		expect(data.rule.affirmedById).toBe(distinctDeciderId);
	});

	it('8. Évalue la cascade : la règle désactivée (DOC-HA-01) n’est pas générée, la règle locale affirmée l’est', async () => {
		const cascade = await getOrCreateCascadeForDecision({
			projectId: testProjectId,
			subjectId: testSubjectId
		});

		// 1. DOC-HA-01 était désactivée -> non présente dans les questions générées
		const hasDocHa = cascade.questions.some((q) => q.lineage.ruleRef === 'DOC-HA-01');
		expect(hasDocHa).toBe(false);

		// 2. SEC-RESIL-02 est active -> présente
		const hasSecResil = cascade.questions.some((q) => q.lineage.ruleRef === 'SEC-RESIL-02');
		expect(hasSecResil).toBe(true);

		// 3. La règle locale affirmée dont les faits matchent (site_count >= 2) -> présente
		const hasLocalPartition = cascade.questions.some((q) => q.subjectName === 'Partition Réseau');
		expect(hasLocalPartition).toBe(true);
	});

	it('9. Capitalisation K22 : retire toute ancre de programme et handle de membre (Invariant K13)', async () => {
		const rulesState = await getProjectRules(testProjectId);
		const localRule = rulesState.localRules.find((r) => r.status === 'affirmed');
		expect(localRule).toBeDefined();

		// Appel endpoint propose-kb
		const mockKbEvent = {
			params: { projectId: testProjectId, ruleId: localRule!.id },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-user-role': 'lead_architect',
					'x-user-id': 'user-lead-41'
				}
			})
		} as unknown as RequestEvent;

		const response = await proposeKbEndpoint(mockKbEvent);
		expect(response.status).toBe(201);
		const data = await response.json();

		const candidate = data.candidate;
		expect(candidate).toBeDefined();

		// Invariant K13 :
		// 1. Aucun identifiant de projet (testProjectId)
		expect(JSON.stringify(candidate)).not.toContain(testProjectId);
		expect(candidate.source.engagement).toBe('anonymized');

		// 2. Aucun nom de projet ni client spécifique dans les textes
		expect(candidate.title).not.toContain('Titan');
		expect(candidate.summary).not.toContain('Titan');
		expect(candidate.suggested_change).not.toContain('Titan');

		// 3. Aucun handle d'utilisateur personnel
		expect(candidate.author).toBe('architect');
		expect(JSON.stringify(candidate)).not.toContain('user-contributor-bob');
		expect(JSON.stringify(candidate)).not.toContain('user-decider-alice');
		expect(JSON.stringify(candidate)).not.toContain('user-lead-41');
	});
});
