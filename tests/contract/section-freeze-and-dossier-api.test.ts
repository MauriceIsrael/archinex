import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { POST as freezeSectionEndpoint, GET as getFreezeEndpoint } from '../../src/routes/api/projects/[projectId]/subjects/[subjectId]/freeze/+server';
import { GET as getHldDossierEndpoint } from '../../src/routes/api/projects/[projectId]/hld-dossier/+server';
import { POST as exportProjectBundle } from '../../src/routes/api/projects/[projectId]/bundle-export/+server';
import type { RequestEvent } from '@sveltejs/kit';

describe('Section Freeze, HLD Dossier & OSCAL API Contract Tests (Issue #64)', () => {
	const projectId = 'test-proj-freeze';
	const subjectId = 'test-subj-freeze';

	beforeEach(async () => {
		await prisma.project.upsert({
			where: { id: projectId },
			create: {
				id: projectId,
				shortName: 'proj-freeze',
				type: 'generic_blueprint',
				badge: 'TEST',
				title: 'Projet Test Scellement & HLD',
				description: 'Projet pour tester le scellement L5 et le dossier HLD'
			},
			update: {}
		});

		await prisma.subject.upsert({
			where: { id: subjectId },
			create: {
				id: subjectId,
				projectId,
				sectionRef: '§1.1',
				name: 'Architecture Cœur de Réseau',
				maturityLevel: 'L3_decided',
				deliberationStatus: 'arbitrated'
			},
			update: {
				maturityLevel: 'L3_decided'
			}
		});
	});

	it('1. Refuse le scellement sans session (401)', async () => {
		const mockEvent = {
			params: { projectId, subjectId },
			locals: { session: null },
			request: new Request(`http://localhost/api/projects/${projectId}/subjects/${subjectId}/freeze`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ snapshot: { sealSha256: 'abc' } })
			}),
			url: new URL(`http://localhost/api/projects/${projectId}/subjects/${subjectId}/freeze`)
		} as unknown as RequestEvent;

		const res = await freezeSectionEndpoint(mockEvent as any);
		expect(res.status).toBe(401);
	});

	it('2. Refuse le scellement si l\'utilisateur n\'est pas Lead Architect ni Admin (403)', async () => {
		// Création d'un membre avec rôle contributor
		await prisma.user.upsert({
			where: { email: 'contributor@archinex.local' },
			create: {
				id: 'user-contrib',
				name: 'Contributeur',
				email: 'contributor@archinex.local',
				passwordHash: 'hash',
				role: 'user'
			},
			update: {}
		});

		await prisma.projectMember.upsert({
			where: { projectId_userId: { projectId, userId: 'user-contrib' } },
			create: {
				projectId,
				userId: 'user-contrib',
				role: 'contributor'
			},
			update: { role: 'contributor' }
		});

		const mockEvent = {
			params: { projectId, subjectId },
			locals: {
				session: {
					user: { id: 'user-contrib', email: 'contributor@archinex.local', role: 'user' }
				}
			},
			request: new Request(`http://localhost/api/projects/${projectId}/subjects/${subjectId}/freeze`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ snapshot: { sealSha256: 'abc' } })
			}),
			url: new URL(`http://localhost/api/projects/${projectId}/subjects/${subjectId}/freeze`)
		} as unknown as RequestEvent;

		const res = await freezeSectionEndpoint(mockEvent as any);
		expect(res.status).toBe(403);
		const json = await res.json();
		expect(json.code).toBe('ROLE_NOT_AUTHORIZED');
	});

	it('3. Scelle avec succès une section par le Lead Architect, met à jour L5 et enregistre DomainEvent', async () => {
		const mockSnapshot = {
			sectionRef: '§1.1',
			subjectId,
			subjectName: 'Architecture Cœur de Réseau',
			maturityLevel: 'L3_decided',
			sealedAt: new Date().toISOString(),
			sealedBy: { name: 'Lead Architect', role: 'lead_architect' },
			sealSha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
			externalRefs: [],
			statements: [],
			projections: { mermaid: '', structurizrDSL: '', sysmlV2: '', configJSON: '{}' }
		};

		const mockEvent = {
			params: { projectId, subjectId },
			locals: {
				session: {
					user: { id: 'admin-lead', name: 'M. Israel (Lead)', email: 'lead@archinex.local', role: 'admin' }
				}
			},
			request: new Request(`http://localhost/api/projects/${projectId}/subjects/${subjectId}/freeze`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ snapshot: mockSnapshot })
			}),
			url: new URL(`http://localhost/api/projects/${projectId}/subjects/${subjectId}/freeze`)
		} as unknown as RequestEvent;

		const res = await freezeSectionEndpoint(mockEvent as any);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.status).toBe('ok');
		expect(json.snapshot.sealSha256).toBe(mockSnapshot.sealSha256);

		// Vérification en base : le sujet est bien passé en L5_archived
		const updatedSubj = await prisma.subject.findUnique({ where: { id: subjectId } });
		expect(updatedSubj?.maturityLevel).toBe('L5_archived');

		// Vérification de la lecture via GET /freeze
		const getEvent = {
			params: { projectId, subjectId },
			locals: {
				session: {
					user: { id: 'admin-lead', email: 'lead@archinex.local', role: 'admin' }
				}
			},
			url: new URL(`http://localhost/api/projects/${projectId}/subjects/${subjectId}/freeze`)
		} as unknown as RequestEvent;

		const getRes = await getFreezeEndpoint(getEvent as any);
		expect(getRes.status).toBe(200);
		const getJson = await getRes.json();
		expect(getJson.snapshot).not.toBeNull();
		expect(getJson.snapshot.sealSha256).toBe(mockSnapshot.sealSha256);
	});

	it('4. GET /api/projects/:projectId/hld-dossier génère le dossier complet multi-sujets', async () => {
		const mockEvent = {
			params: { projectId },
			locals: {
				session: {
					user: { id: 'admin-lead', email: 'lead@archinex.local', role: 'admin' }
				}
			},
			url: new URL(`http://localhost/api/projects/${projectId}/hld-dossier`)
		} as unknown as RequestEvent;

		const res = await getHldDossierEndpoint(mockEvent as any);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.status).toBe('ok');
		expect(json.dossier.markdown).toContain('# Dossier de Conception d\'Architecture (HLD)');
		expect(json.dossier.markdown).toContain(projectId);
	});

	it('5. POST /bundle-export?format=oscal exporte la matrice au format NIST OSCAL SSP', async () => {
		const mockEvent = {
			params: { projectId },
			locals: {
				session: {
					user: { id: 'admin-lead', email: 'lead@archinex.local', role: 'admin' }
				}
			},
			request: new Request(`http://localhost/api/projects/${projectId}/bundle-export?format=oscal`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ confidentiality: 'internal' })
			}),
			url: new URL(`http://localhost/api/projects/${projectId}/bundle-export?format=oscal`)
		} as unknown as RequestEvent;

		const res = await exportProjectBundle(mockEvent as any);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json['system-security-plan']).toBeDefined();
		expect(json['system-security-plan'].metadata['oscal-version']).toBe('1.0.0');
	});
});
