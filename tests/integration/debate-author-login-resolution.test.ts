import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { createArgument, listArguments } from '$lib/server/projects/debateDb';
import { createProject, createSubject, type ActorInfo } from '$lib/server/projects/projectsDb';

describe('Deliberation Chat - Résolution des IDs obscurs vers le nom du login', () => {
	const testProjectId = `proj-login-res-${Date.now()}`;
	const testSubjectId = `subj-login-res-${Date.now()}`;

	const user1Id = 'cmv4bb2ev0002wqzsx6amtw2t';
	const user2Id = 'cmv4bb2ev0002wqzsx6amtw2u';

	const user1Actor: ActorInfo = { userId: user1Id, role: 'lead_architect' };
	const user2Actor: ActorInfo = { userId: user2Id, role: 'domain_expert' };

	beforeAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
		await prisma.user.deleteMany({ where: { id: { in: [user1Id, user2Id] } } });

		// Créer utilisateur 1 avec un nom complet
		await prisma.user.create({
			data: {
				id: user1Id,
				name: 'Lead Architect (Admin)',
				email: 'admin@archinex.local',
				passwordHash: 'dummy-hash',
				role: 'admin'
			}
		});

		// Créer utilisateur 2 sans nom (seulement email)
		await prisma.user.create({
			data: {
				id: user2Id,
				name: '',
				email: 'architect@archinex.local',
				passwordHash: 'dummy-hash',
				role: 'user'
			}
		});

		await createProject(
			{
				id: testProjectId,
				title: 'Projet Test Résolution Login',
				shortName: 'PTRL',
				badge: 'TEST',
				description: 'Vérification du remplacement des IDs cuid par le login'
			},
			user1Actor
		);

		await createSubject(
			testProjectId,
			{
				id: testSubjectId,
				name: 'Sujet Choix Protocole',
				sectionRef: '§4.1',
				domain: 'general',
				problemStatement: 'Quel protocole de synchronisation retenir ?'
			},
			user1Actor
		);
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
		await prisma.user.deleteMany({ where: { id: { in: [user1Id, user2Id] } } });
	});

	it('1. Remplace l\'ID cuid par le nom du compte lors de la création d\'un argument', async () => {
		const arg = await createArgument(
			testSubjectId,
			{
				stance: 'support',
				claim: 'Option retenue pour la scalabilité',
				grounds: 'Banc d’essai validé à 100k messages par seconde.',
				confidence: 'verified',
				authorKind: 'human'
			},
			user1Actor
		);

		expect(arg.author).not.toBe(user1Id);
		expect(arg.author).toBe('Lead Architect (Admin)');
	});

	it('2. Remplace l\'ID cuid par l\'email de connexion si le nom est vide', async () => {
		const arg = await createArgument(
			testSubjectId,
			{
				stance: 'objection',
				claim: 'Contrainte sur les licences',
				grounds: 'Coût excessif par socket physique.',
				confidence: 'assumed',
				authorKind: 'human'
			},
			user2Actor
		);

		expect(arg.author).not.toBe(user2Id);
		expect(arg.author).toBe('architect@archinex.local');
	});

	it('3. listArguments résout dynamiquement les anciens arguments stockés avec un CUID brut', async () => {
		// Insérer directement en base un argument avec le CUID brut dans la colonne author
		const legacyArgId = `arg-legacy-${Date.now()}`;
		await prisma.argument.create({
			data: {
				id: legacyArgId,
				subjectId: testSubjectId,
				stance: 'question',
				claim: 'Question sur la conformité ANSSI',
				grounds: 'Vérification de la conformité au référentiel PSSI.',
				author: user1Id, // Ancien comportement : ID cuid stocké
				authorKind: 'human',
				productionMode: 'human-authored',
				round: 1,
				resolution: 'open',
				version: 1
			}
		});

		const args = await listArguments(testSubjectId);
		const legacyArg = args.find((a) => a.id === legacyArgId);

		expect(legacyArg).toBeDefined();
		expect(legacyArg?.author).not.toBe(user1Id);
		expect(legacyArg?.author).toBe('Lead Architect (Admin)');
	});

	it('4. Conserve l\'identité des agents intacte sans altération', async () => {
		const agentArg = await createArgument(
			testSubjectId,
			{
				stance: 'objection',
				claim: 'Risque de dérive de débit',
				grounds: 'Latence non bornée en situation de pic.',
				confidence: 'assumed',
				authorKind: 'agent:challenger'
			},
			{ userId: 'agent:challenger', role: 'architect_agent' }
		);

		expect(agentArg.author).toBe('agent:challenger');
	});
});
