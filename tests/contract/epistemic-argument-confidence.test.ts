import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { validateArgument } from '$lib/domain/debate';
import { createProject, createSubject, type ActorInfo } from '$lib/server/projects/projectsDb';
import { createArgument } from '$lib/server/projects/debateDb';

describe('Invariant constitutionnel verified × llm-derived pour les arguments (Issue #383)', () => {
	const suffix = Date.now();
	const projectId = `proj-epistemic-arg-${suffix}`;
	const subjectId = `subj-epistemic-arg-${suffix}`;
	const leadArchitect: ActorInfo = { userId: 'lead-arch-test', role: 'lead_architect' };
	const verifierAgent: ActorInfo = {
		userId: 'agent:verifier',
		role: 'compliance_agent',
		productionMode: 'llm-derived'
	};

	beforeAll(async () => {
		await prisma.project.deleteMany({ where: { id: projectId } });
		await createProject(
			{
				id: projectId,
				title: 'Projet Test Invariant Épistémique Arguments',
				shortName: 'PTEA',
				badge: 'TEST',
				description: 'Vérification du plafonnement verified × llm-derived sur les arguments'
			},
			leadArchitect
		);
		await createSubject(
			projectId,
			{
				id: subjectId,
				sectionRef: '§2.1',
				name: 'Sujet Test Invariant Arguments',
				domain: 'security',
				maturityLevel: 'L1_framed'
			},
			leadArchitect
		);
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: projectId } });
	});

	it('1. validateArgument rejette explicitement un argument llm-derived avec confidence="verified"', () => {
		const res = validateArgument({
			claim: 'Conformité totale démontrée',
			grounds: 'Analyse automatique par agent de la règle de sécurité',
			stance: 'verification',
			kbRefs: [],
			confidence: 'verified',
			authorKind: 'agent:verifier',
			productionMode: 'llm-derived'
		});

		expect(res.valid).toBe(false);
		expect(res.reason).toMatch(/verified/i);
		expect(res.reason).toMatch(/llm-derived/i);
	});

	it('2. validateArgument autorise un argument llm-derived avec confidence="designed" et un argument humain "verified"', () => {
		const agentDesigned = validateArgument({
			claim: 'Conformité présumée à valider',
			grounds: 'Analyse automatique par agent de la règle de sécurité',
			stance: 'verification',
			kbRefs: [],
			confidence: 'designed',
			authorKind: 'agent:verifier',
			productionMode: 'llm-derived'
		});
		expect(agentDesigned.valid).toBe(true);

		const humanVerified = validateArgument({
			claim: 'Conformité prouvée par audit',
			grounds: 'Rapport d\'audit interne signé et vérifié par l\'architecte',
			stance: 'verification',
			kbRefs: [],
			confidence: 'verified',
			authorKind: 'human',
			productionMode: 'human-authored'
		});
		expect(humanVerified.valid).toBe(true);
	});

	it('3. createArgument plafonne à "designed" un argument d\'agent qui renvoie confidence="verified" et journalise un avertissement', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const created = await createArgument(
				subjectId,
				{
					id: `arg-agent-capped-${suffix}`,
					stance: 'verification',
					claim: 'Vérification automatique de conformité',
					grounds: 'L\'agent vérificateur a contrôlé les critères documentaires.',
					kbRefs: [],
					confidence: 'verified',
					authorKind: 'agent:verifier',
					round: 1
				},
				verifierAgent
			);

			expect(created.productionMode).toBe('llm-derived');
			expect(created.confidence).toBe('designed');

			// Vérifier la persistance réelle en base
			const persisted = await prisma.argument.findUnique({ where: { id: created.id } });
			expect(persisted?.confidence).toBe('designed');
			expect(persisted?.productionMode).toBe('llm-derived');

			// Vérifier qu'un avertissement a bien été journalisé
			expect(warnSpy).toHaveBeenCalled();
			const warnMessage = warnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
			expect(warnMessage).toMatch(/verified/i);
			expect(warnMessage).toMatch(/designed/i);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it('4. createArgument conserve confidence="verified" pour un argument humain sans avertissement', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const created = await createArgument(
				subjectId,
				{
					id: `arg-human-verified-${suffix}`,
					stance: 'verification',
					claim: 'Audit terrain validé',
					grounds: 'Résultats de banc de test signés par l\'équipe sécurité.',
					kbRefs: [],
					confidence: 'verified',
					authorKind: 'human',
					round: 1
				},
				leadArchitect
			);

			expect(created.productionMode).toBe('human-authored');
			expect(created.confidence).toBe('verified');
			expect(warnSpy).not.toHaveBeenCalled();
		} finally {
			warnSpy.mockRestore();
		}
	});

	it('5. Garde Prisma : bloque tout contournement direct via prisma.argument.create (verified × llm-derived)', async () => {
		await expect(
			prisma.argument.create({
				data: {
					id: `arg-bypass-create-${suffix}`,
					subjectId,
					stance: 'verification',
					claim: 'Contournement direct create',
					grounds: 'Tentative d\'écriture directe en base sans passer par createArgument',
					kbRefs: '[]',
					confidence: 'verified',
					author: 'agent:verifier',
					authorKind: 'agent:verifier',
					productionMode: 'llm-derived',
					round: 1,
					resolution: 'open',
					version: 1
				}
			})
		).rejects.toThrow(/verified.*llm-derived|llm-derived.*verified/i);
	});

	it('6. Garde Prisma : bloque tout contournement via prisma.argument.update (promotion en verified d\'un argument llm-derived)', async () => {
		const existing = await prisma.argument.create({
			data: {
				id: `arg-bypass-update-${suffix}`,
				subjectId,
				stance: 'support',
				claim: 'Argument agent initialement assumed',
				grounds: 'Fondement technique initial de l\'agent',
				kbRefs: '[]',
				confidence: 'assumed',
				author: 'agent:proposer',
				authorKind: 'agent:proposer',
				productionMode: 'llm-derived',
				round: 1,
				resolution: 'open',
				version: 1
			}
		});

		await expect(
			prisma.argument.update({
				where: { id: existing.id },
				data: { confidence: 'verified' }
			})
		).rejects.toThrow(/verified.*llm-derived|llm-derived.*verified/i);
	});

	it('7. Garde Prisma : bloque tout contournement via prisma.argument.createMany et upsert', async () => {
		await expect(
			prisma.argument.createMany({
				data: [
					{
						id: `arg-bypass-many-${suffix}`,
						subjectId,
						stance: 'verification',
						claim: 'Contournement createMany',
						grounds: 'Tentative d\'insertion batch interdite',
						kbRefs: '[]',
						confidence: 'verified',
						author: 'agent:verifier',
						authorKind: 'agent:verifier',
						productionMode: 'llm-derived',
						round: 1,
						resolution: 'open',
						version: 1
					}
				]
			})
		).rejects.toThrow(/verified.*llm-derived|llm-derived.*verified/i);

		await expect(
			prisma.argument.upsert({
				where: { id: `arg-bypass-upsert-${suffix}` },
				create: {
					id: `arg-bypass-upsert-${suffix}`,
					subjectId,
					stance: 'verification',
					claim: 'Contournement upsert',
					grounds: 'Tentative d\'upsert interdite',
					kbRefs: '[]',
					confidence: 'verified',
					author: 'agent:verifier',
					authorKind: 'agent:verifier',
					productionMode: 'llm-derived',
					round: 1,
					resolution: 'open',
					version: 1
				},
				update: {
					confidence: 'verified'
				}
			})
		).rejects.toThrow(/verified.*llm-derived|llm-derived.*verified/i);
	});
});
