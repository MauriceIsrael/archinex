import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import { resolve } from 'node:path';
import { loadOntologyCatalog, type OntologyCatalog } from '../../src/lib/server/edp/ontologyClient';
import { doctrineService } from '../../src/lib/server/doctrine/doctrineService';
import { llmopsClient } from '../../src/lib/server/llmops/client';
import {
	prepareSubjectKbCandidates,
	submitSubjectKbCandidates,
	getSubjectKbCandidatesStatus
} from '../../src/lib/server/projects/capitalizationDb';
import { prisma } from '../../src/lib/server/prisma';
import type { KbCandidate } from '../../src/lib/types/llmops';

describe('Knowledge Hub Source of Truth & Stateless Engine Contract (Issue #253, Épopée #251)', () => {
	let mockHubServer: Server;
	let hubUrl: string;
	const hubReceivedCandidates: any[] = [];

	const mockOntologyExport: OntologyCatalog = {
		catalog_version: '2.0-sovereign',
		generated_at: '2026-11-11T10:00:00Z',
		entities: {
			'urn:archinex:ontology:infrastructure:cloud:k8s': {
				urn: 'urn:archinex:ontology:infrastructure:cloud:k8s',
				revision: 2,
				kind: 'concept',
				title: 'Kubernetes Sovereign Node (from Remote Hub)'
			}
		},
		triplets: [
			{
				id: 'tr-hub-01',
				subject: 'urn:archinex:ontology:infrastructure:cloud:k8s',
				predicate: 'requires_aspect',
				object: 'urn:archinex:ontology:security:zone:oam'
			}
		]
	};

	const mockDoctrineItems = [
		{
			id: 'RULE-HUB-SEC-01',
			type: 'rule' as const,
			title: 'Chiffrement post-quantique obligatoire sur le plan de contrôle (Hub LLMOps)',
			content: 'Toutes les communications internes au cluster doivent utiliser Kyber/ML-KEM.',
			domain: 'security',
			confidence: 'verified'
		}
	];

	beforeAll(async () => {
		mockHubServer = http.createServer(async (req, res) => {
			const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
			const pathname = parsed.pathname;
			const method = req.method?.toUpperCase();

			const json = (status: number, data: unknown) => {
				res.writeHead(status, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(data));
			};

			if (pathname === '/api/knowledge/ontology/export' && method === 'GET') {
				return json(200, { status: 'ok', data: mockOntologyExport });
			}

			if (pathname === '/api/knowledge/context' && method === 'GET') {
				return json(200, {
					status: 'ok',
					data: {
						subject: parsed.searchParams.get('subject'),
						items: mockDoctrineItems,
						total_items: mockDoctrineItems.length,
						truncated: false
					}
				});
			}

			if (pathname === '/api/knowledge/candidates' && method === 'POST') {
				const chunks: Buffer[] = [];
				for await (const chunk of req) chunks.push(chunk);
				const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
				hubReceivedCandidates.push(body);
				return json(201, {
					status: 'ok',
					data: {
						candidate_id: `CAND-HUB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
						status: 'in_review'
					}
				});
			}

			if (pathname === '/api/knowledge/candidates' && method === 'GET') {
				return json(200, {
					status: 'ok',
					data: hubReceivedCandidates.map((c, i) => ({
						id: `CAND-HUB-${i}`,
						...c,
						status: 'in_review'
					}))
				});
			}

			return json(404, { error: `Not found: ${method} ${pathname}` });
		});

		await new Promise<void>((resolvePromise) => {
			mockHubServer.listen(0, '127.0.0.1', () => resolvePromise());
		});
		const port = (mockHubServer.address() as AddressInfo).port;
		hubUrl = `http://127.0.0.1:${port}`;
	});

	afterAll(async () => {
		await new Promise<void>((resolvePromise) => {
			mockHubServer.close(() => resolvePromise());
		});
	});

	describe('1. Ontologie SI : Priorité Knowledge Hub et Fallback propre hors-ligne', () => {
		it('interroge en priorité le Knowledge Hub LLMOps lorsque celui-ci est accessible', async () => {
			const catalog = await loadOntologyCatalog({ hubUrl });
			expect(catalog.catalog_version).toBe('2.0-sovereign');
			expect(catalog.entities['urn:archinex:ontology:infrastructure:cloud:k8s']).toBeDefined();
			expect(catalog.entities['urn:archinex:ontology:infrastructure:cloud:k8s'].title).toContain('from Remote Hub');
			expect(catalog.triplets).toHaveLength(1);
			expect(catalog.triplets?.[0].id).toBe('tr-hub-01');
		});

		it('bascule proprement sur la fixture locale sans erreur lorsque le Hub distant est inaccessible (hors production)', async () => {
			const unreachableHubUrl = 'http://127.0.0.1:59999';
			const catalog = await loadOntologyCatalog({ hubUrl: unreachableHubUrl, fallbackToFixture: true });
			
			// Le fallback sur fixture de référence (version 1.0) doit s'effectuer sans crash
			expect(catalog.catalog_version).toBe('1.0');
			expect(catalog.entities['urn:archinex:ontology:infrastructure:server:baremetal']).toBeDefined();
		});

		it('refuse tout repli sur fixture en production (NODE_ENV=production) si le Hub est injoignable', async () => {
			const originalEnv = process.env.NODE_ENV;
			process.env.NODE_ENV = 'production';

			try {
				await expect(
					loadOntologyCatalog({ hubUrl: 'http://127.0.0.1:59999', fallbackToFixture: true })
				).rejects.toThrow(/aucun mock en dur ni repli gracieux n'est autorisé en production/i);
			} finally {
				process.env.NODE_ENV = originalEnv;
			}
		});

		it('lève une erreur explicite si une URL dédiée hubUrl est imposée sans fallback autorisé', async () => {
			await expect(
				loadOntologyCatalog({ hubUrl: 'http://127.0.0.1:59999' })
			).rejects.toThrow(/Knowledge Hub indisponible pour la synchronisation d’ontologie/);
		});
	});

	describe('2. Doctrine & Règles de Conformité : Priorité Knowledge Hub et Fallback propre', () => {
		it('consomme en priorité les règles fournies par le Knowledge Hub LLMOps', async () => {
			// On pointe le client LLMOps vers le serveur Hub mocké
			const originalBaseUrl = llmopsClient.getBaseUrl();
			llmopsClient.setBaseUrl(hubUrl);

			try {
				const ctx = await doctrineService.getDoctrineContext({
					topics: ['post-quantique'],
					domains: ['security']
				});

				expect(ctx.offline).toBe(false);
				expect(ctx.items.length).toBeGreaterThan(0);
				expect(ctx.items[0].id).toBe('RULE-HUB-SEC-01');
				expect(ctx.items[0].title).toContain('Chiffrement post-quantique');
			} finally {
				llmopsClient.setBaseUrl(originalBaseUrl);
			}
		});

		it('active le fallback propre sur les fixtures scellées hors-ligne si le Hub est déconnecté', async () => {
			// Simule un Hub injoignable (port 1 fermé)
			const originalBaseUrl = process.env.LLMOPS_BASE_URL;
			const originalLiveUrl = process.env.LLMOPS_LIVE_URL;
			process.env.LLMOPS_BASE_URL = 'http://127.0.0.1:1';
			delete process.env.LLMOPS_LIVE_URL;

			try {
				const ctx = await doctrineService.getDoctrineContext({
					topics: ['network', 'git'],
					domains: ['network-automation']
				});

				// Fallback actif sur tests/fixtures/llmops/llmops-sealed-snapshot.json
				expect(ctx.offline).toBe(true);
				expect(ctx.items.length).toBeGreaterThan(0);
				// ADR-0001 est dans network-automation et concerne Git
				const hasAdr01 = ctx.items.some((i) => i.id === 'ADR-0001');
				expect(hasAdr01).toBe(true);
			} finally {
				process.env.LLMOPS_BASE_URL = originalBaseUrl;
				process.env.LLMOPS_LIVE_URL = originalLiveUrl;
			}
		});

		it('refuse d’inventer des données en mode production si le Hub est déconnecté', async () => {
			const originalNodeEnv = process.env.NODE_ENV;
			const originalBaseUrl = process.env.LLMOPS_BASE_URL;
			process.env.NODE_ENV = 'production';
			process.env.LLMOPS_BASE_URL = 'http://127.0.0.1:1';

			try {
				const ctx = await doctrineService.getDoctrineContext({
					topics: ['network'],
					domains: ['network-automation']
				});

				expect(ctx.offline).toBe(true);
				expect(ctx.items).toEqual([]);
			} finally {
				process.env.NODE_ENV = originalNodeEnv;
				process.env.LLMOPS_BASE_URL = originalBaseUrl;
			}
		});
	});

	describe('3. Porte G4 : Capitalisation Souveraine vers LLMOps sans fichiers locaux', () => {
		let testProjectId: string;
		let testSubjectId: string;
		const actorLead = {
			userId: 'lead.architect@archinex.souverain',
			role: 'lead_architect',
			productionMode: 'human-authored' as const,
			domains: ['cloud-platform', 'infrastructure']
		};

		beforeAll(async () => {
			testProjectId = `proj-g4-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
			testSubjectId = `subj-g4-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

			// Configuration de données de délibération en base pour la Porte G4
			await prisma.project.create({
				data: {
					id: testProjectId,
					shortName: 'G4-TEST',
					badge: 'G4-TEST',
					description: 'Projet de test pour la validation de Porte G4',
					title: 'Projet Souverain Validation G4',
					type: 'it_system',
					status: 'active',
					strategy: JSON.stringify({ clientName: 'Client Confidentiel Défense', sites: ['Brest'] }),
					members: {
						create: [
							{
								userId: actorLead.userId,
								role: actorLead.role,
								domains: JSON.stringify(actorLead.domains)
							}
						]
					}
				}
			});

			await prisma.subject.create({
				data: {
					id: testSubjectId,
					projectId: testProjectId,
					sectionRef: 'SEC-STORAGE',
					name: 'Stockage distribué Ceph',
					domain: 'cloud-platform',
					maturityLevel: 'L3_decided',
					deliberationStatus: 'arbitrated',
					options: {
						create: [
							{
								id: `opt-ceph-${testSubjectId}`,
								title: 'Ceph SDS Découplé',
								summary: 'Déploiement Ceph baremetal sans licence externe sur /dev/nvme0n1',
								origin: 'human',
								kbRefs: '[]', // Aucun antécédent -> Génère un new_asset
								status: 'retained',
								author: actorLead.userId,
								role: actorLead.role,
								productionMode: 'human-authored',
								version: 1
							},
							{
								id: `opt-cloud-prop-${testSubjectId}`,
								title: 'Solution propriétaire externe',
								summary: 'Stockage managé propriétaire cloud',
								origin: 'human',
								kbRefs: '["RULE-STORAGE-01"]',
								status: 'rejected',
								author: 'expert@archinex.souverain',
								role: 'domain_expert',
								productionMode: 'human-authored',
								version: 1
							}
						]
					},
					decision: {
						create: {
							id: `dec-${testSubjectId}`,
							retainedOptionId: `opt-ceph-${testSubjectId}`,
							rejected: JSON.stringify([
								{ optionId: `opt-cloud-prop-${testSubjectId}`, reason: 'Non souverain et verrouillage éditeur' }
							]),
							rationale: 'Autonomie souveraine requise pour le site nodal',
							reversibility: 'reversible',
							arbiterId: actorLead.userId,
							arbiterRole: actorLead.role,
							acceptedViolations: JSON.stringify([
								{
									typedId: 'RULE-STORAGE-REPLICATION-3',
									justification: 'Tolérance acceptée pour réplication factor 2 sur volumes de cache'
								},
								{
									typedId: 'PORTABILITY:reusable_architecture_doctrine',
									justification: ''
								}
							]),
							kbCandidateIds: '[]',
							version: 1
						}
					}
				}
			});
		});

		afterAll(async () => {
			try {
				await prisma.domainEvent.deleteMany({ where: { projectId: testProjectId } });
				await prisma.decision.deleteMany({ where: { subjectId: testSubjectId } });
				await prisma.option.deleteMany({ where: { subjectId: testSubjectId } });
				await prisma.subject.deleteMany({ where: { id: testSubjectId } });
				await prisma.projectMember.deleteMany({ where: { projectId: testProjectId } });
				await prisma.project.deleteMany({ where: { id: testProjectId } });
			} catch {
				// ignore cleanup error
			}
		});

		it('prépare les candidats new_asset, amendment et rex de manière pure sans fichier local', async () => {
			const prep = await prepareSubjectKbCandidates(testSubjectId, actorLead);

			expect(prep.candidates.length).toBeGreaterThanOrEqual(3);

			// 1. new_asset
			const newAsset = prep.candidates.find((c) => c.kind === 'new_asset');
			expect(newAsset).toBeDefined();
			expect(newAsset?.title).toContain('Ceph SDS Découplé');
			expect(newAsset?.summary).not.toContain('/dev/nvme0n1'); // Anonymisé
			expect(newAsset?.portability).toBe('reusable_architecture_doctrine');
			expect(newAsset?.harvestable).toBe(true);

			// 2. amendment
			const amendment = prep.candidates.find((c) => c.kind === 'amendment');
			expect(amendment).toBeDefined();
			expect(amendment?.target_asset_ref).toBe('RULE-STORAGE-REPLICATION-3');
			expect(amendment?.accepted_violation_justification).toContain('réplication factor 2');

			// 3. rex
			const rex = prep.candidates.find((c) => c.kind === 'rex');
			expect(rex).toBeDefined();
			expect(rex?.title).toContain('Stockage distribué Ceph');
		});

		it('transmet les nouveaux assets et amendements vers l’API LLMOps sans aucune dépendance à des fichiers locaux', async () => {
			const originalBaseUrl = llmopsClient.getBaseUrl();
			llmopsClient.setBaseUrl(hubUrl);

			// Espion sur les fonctions fs d'écriture pour prouver l'absence totale de persistance fichier locale
			const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync');
			const writeFileSpy = vi.spyOn(fs.promises, 'writeFile');

			try {
				const prep = await prepareSubjectKbCandidates(testSubjectId, actorLead);
				const toSubmit = prep.candidates.filter((c) => c.kind === 'new_asset' || c.kind === 'amendment');
				expect(toSubmit.length).toBe(2);

				const initialCount = hubReceivedCandidates.length;
				const submitRes = await submitSubjectKbCandidates(testSubjectId, toSubmit, actorLead);

				// Vérification que les requêtes sont bien arrivées sur l'API HTTP du Hub
				expect(submitRes.submitted).toHaveLength(2);
				expect(hubReceivedCandidates.length).toBe(initialCount + 2);

				const receivedNewAsset = hubReceivedCandidates.find((c) => c.kind === 'new_asset');
				expect(receivedNewAsset).toBeDefined();
				expect(receivedNewAsset?.title).toContain('Ceph SDS Découplé');
				expect(receivedNewAsset?.portability).toBe('reusable_architecture_doctrine');

				const receivedAmendment = hubReceivedCandidates.find((c) => c.kind === 'amendment');
				expect(receivedAmendment).toBeDefined();
				expect(receivedAmendment?.target_asset_id).toBe('RULE-STORAGE-REPLICATION-3');

				// Garantie Stateless Engine : aucune écriture de fichier local n'a eu lieu
				expect(writeFileSyncSpy).not.toHaveBeenCalled();
				expect(writeFileSpy).not.toHaveBeenCalled();

				// La décision en base a bien enregistré les identifiants reçus du Hub
				const updatedDecision = await prisma.decision.findUnique({ where: { subjectId: testSubjectId } });
				const candidateIds = JSON.parse(updatedDecision?.kbCandidateIds || '[]');
				expect(candidateIds.length).toBe(2);
				expect(candidateIds[0]).toMatch(/^CAND-HUB-/);
			} finally {
				writeFileSyncSpy.mockRestore();
				writeFileSpy.mockRestore();
				llmopsClient.setBaseUrl(originalBaseUrl);
			}
		});
	});
});
