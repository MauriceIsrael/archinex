import { describe, it, expect, beforeEach } from 'vitest';
import { exportEngagementBundle } from '$lib/server/bundleExportService';
import { verifyEngagementBundle } from '$lib/domain/bundleVerifier';
import { prisma } from '$lib/server/prisma';
import { POST as exportProjectBundle } from '../../src/routes/api/projects/[projectId]/bundle-export/+server';
import { POST as exportEngagementBundleEndpoint } from '../../src/routes/api/engagements/[id]/export-bundle/+server';
import type { RequestEvent } from '@sveltejs/kit';

describe('Bundle Publication & Endpoint Contract Tests (A17 - bundle-publication)', () => {
	beforeEach(async () => {
		await prisma.project.upsert({
			where: { id: 'cctp-mcx-nordwave' },
			create: {
				id: 'cctp-mcx-nordwave',
				shortName: 'cctp-mcx',
				type: 'project_rfp',
				badge: 'RFP',
				title: 'Projet CCTP MCX Nordwave',
				description: 'Test project for bundle export'
			},
			update: {}
		});
	});

	it('refuse tout export direct sans session avec code HTTP 401', async () => {
		const mockEventNoSession = {
			params: { projectId: 'project-mcx' },
			locals: { session: null },
			request: new Request('http://localhost/api/projects/project-mcx/bundle-export', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ confidentiality: 'internal' })
			}),
			url: new URL('http://localhost/api/projects/project-mcx/bundle-export')
		} as unknown as RequestEvent;

		const response = await exportProjectBundle(mockEventNoSession as any);
		expect(response.status).toBe(401);
		const json = await response.json();
		expect(json.error).toContain('Non authentifié');
	});

	it('ignore catégoriquement tout en-tête X-Actor-Email envoyé par le client', async () => {
		// Session authentifiée valide pour l'utilisateur @m-israel
		const mockEvent = {
			params: { projectId: 'cctp-mcx-nordwave' },
			locals: {
				session: {
					user: { id: 'u1', name: 'Lead Architect M. Israel', email: 'legit@archinex.local', role: 'admin' },
					expires: '2026-10-31T00:00:00Z'
				}
			},
			request: new Request('http://localhost/api/projects/cctp-mcx-nordwave/bundle-export', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					// En-tête pirate ou spoofé qui DOIT être ignoré
					'X-Actor-Email': 'hacker@malicious.org'
				},
				body: JSON.stringify({ confidentiality: 'internal' })
			}),
			url: new URL('http://localhost/api/projects/cctp-mcx-nordwave/bundle-export')
		} as unknown as RequestEvent;

		const response = await exportProjectBundle(mockEvent as any);
		expect(response.status).toBe(200);
		const body = await response.json();

		expect(body.status).toBe('ok');
		expect(body.bundle).toBeDefined();
		expect(body.snapshotRef).toBeDefined();

		// L'acteur utilisé pour le scellement ne doit JAMAIS être le spoofed header
		const serialized = JSON.stringify(body.bundle);
		expect(serialized).not.toContain('hacker@malicious.org');
		expect(serialized).not.toContain('legit@archinex.local'); // Aucune adresse e-mail dans le bundle scellé
		expect(body.snapshotRef.checksum).toBe(body.bundle.checksum);
	});

	it('exige obligatoirement le niveau de confidentialité et refuse l export sinon (400)', async () => {
		const mockEvent = {
			params: { projectId: 'cctp-mcx-nordwave' },
			locals: {
				session: {
					user: { id: 'u1', name: 'Lead Architect', email: 'lead@local', role: 'admin' },
					expires: '2026-10-31T00:00:00Z'
				}
			},
			request: new Request('http://localhost/api/projects/cctp-mcx-nordwave/bundle-export', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}) // confidentiality absent
			}),
			url: new URL('http://localhost/api/projects/cctp-mcx-nordwave/bundle-export')
		} as unknown as RequestEvent;

		const response = await exportProjectBundle(mockEvent as any);
		expect(response.status).toBe(400);
		const json = await response.json();
		expect(json.error).toContain('CONFIDENTIALITY_REQUIRED');
	});

	it('produit un bundle valide passant à 100% le vérificateur A16 et un SnapshotRef séparé', async () => {
		const result = await exportEngagementBundle({
			projectId: 'cctp-mcx-nordwave',
			confidentiality: 'confidential',
			actorHandle: 'lead-architect',
			now: new Date('2026-10-03T14:00:00Z')
		});

		expect(result.bundle.schemaVersion).toBe('1.1');
		expect(result.bundle.sourceSystem).toBe('archinex');
		expect(result.bundle.data.engagement.confidentiality).toBe('confidential');
		expect(result.snapshotRef.checksum).toBe(result.bundle.checksum);
		expect(result.snapshotRef.producedAt).toBe(result.bundle.createdAt);

		// Passage vérificateur TypeScript (strictement 0 problème)
		const problems = verifyEngagementBundle(result.bundle);
		expect(problems).toEqual([]);
	});

	it('fonctionne également sur l endpoint alias /api/engagements/[id]/export-bundle', async () => {
		const mockEvent = {
			params: { id: 'cctp-mcx-nordwave' },
			locals: {
				session: {
					user: { id: 'u1', name: 'Lead Architect', email: 'lead@local', role: 'admin' },
					expires: '2026-10-31T00:00:00Z'
				}
			},
			request: new Request('http://localhost/api/engagements/cctp-mcx-nordwave/export-bundle', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ confidentiality: 'secret' })
			}),
			url: new URL('http://localhost/api/engagements/cctp-mcx-nordwave/export-bundle')
		} as unknown as RequestEvent;

		const response = await exportEngagementBundleEndpoint(mockEvent as any);
		expect(response.status).toBe(200);
		const json = await response.json();
		expect(json.status).toBe('ok');
		expect(json.bundle.data.engagement.confidentiality).toBe('secret');
	});
});
