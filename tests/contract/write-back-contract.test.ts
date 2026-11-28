import { describe, it, expect, vi } from 'vitest';
import {
	WRITE_BACK_CONTRACT_VERSION,
	buildConnectorWriteBackPayload,
	validateWriteBackPayload,
	toNautobotPatchBody,
	writeBackToNautobot,
	type ConnectorWriteBackPayload,
	type RealizedStatus
} from '../../connectors/writeBackContract.js';

function createMockResponse(
	body: unknown,
	init: { status?: number; headers?: Record<string, string> } = {}
): Response {
	const status = init.status ?? 200;
	const text = typeof body === 'string' ? body : JSON.stringify(body);
	return new Response(text, {
		status,
		headers: {
			'Content-Type': 'application/json',
			...(init.headers ?? {})
		}
	});
}

describe('Contrat de write-back Nautobot (connectors/writeBackContract.ts — ADR-017, #399, #411)', () => {
	describe('buildConnectorWriteBackPayload', () => {
		it('construit un payload conforme avec horodatage explicite et trim de evidence_ref', () => {
			const payload = buildConnectorWriteBackPayload({
				realizedStatus: 'staged',
				realizedRevision: 4,
				connectorName: 'gitops-forge-connector',
				connectorVersion: '1.2.3',
				evidenceRef: '  https://forge.example/org/repo/pulls/42  ',
				realizedAt: '2026-11-25T10:30:00.000Z'
			});

			expect(payload).toEqual({
				schema_version: WRITE_BACK_CONTRACT_VERSION,
				realized_status: 'staged',
				realized_at: '2026-11-25T10:30:00.000Z',
				realized_revision: 4,
				realized_by: 'gitops-forge-connector@1.2.3',
				evidence_ref: 'https://forge.example/org/repo/pulls/42'
			});
		});

		it('génère un horodatage ISO-8601 par défaut et accepte tous les statuts réalisés', () => {
			const statuses: RealizedStatus[] = [
				'staged',
				'provisioning',
				'active',
				'failed',
				'decommissioning',
				'decommissioned',
				'unverified'
			];

			for (const status of statuses) {
				const payload = buildConnectorWriteBackPayload({
					realizedStatus: status,
					realizedRevision: 'rev-7',
					connectorName: 'net-connector',
					connectorVersion: '2.0.0',
					evidenceRef: 'https://ci.example/jobs/99'
				});

				expect(payload.schema_version).toBe('1.0');
				expect(payload.realized_status).toBe(status);
				expect(Number.isNaN(Date.parse(payload.realized_at))).toBe(false);
				expect(validateWriteBackPayload(payload, 'rev-7')).toEqual({
					valid: true,
					proven: true,
					errors: []
				});
			}
		});
	});

	describe('validateWriteBackPayload', () => {
		const validPayload: ConnectorWriteBackPayload = {
			schema_version: '1.0',
			realized_status: 'active',
			realized_at: '2026-11-25T12:00:00.000Z',
			realized_revision: 3,
			realized_by: 'sylva-connector@1.0.0',
			evidence_ref: 'https://ci.example/runs/1001'
		};

		it('valide et prouve un payload complet avec ou sans révision attendue (comparaison chaîne/nombre)', () => {
			expect(validateWriteBackPayload(validPayload)).toEqual({
				valid: true,
				proven: true,
				errors: []
			});
			expect(validateWriteBackPayload(validPayload, '3')).toEqual({
				valid: true,
				proven: true,
				errors: []
			});
			expect(validateWriteBackPayload(validPayload, 3)).toEqual({
				valid: true,
				proven: true,
				errors: []
			});
		});

		it('marque valid=true mais proven=false si realized_revision diverge de expectedRevision', () => {
			const res = validateWriteBackPayload(validPayload, 4);
			expect(res.valid).toBe(true);
			expect(res.proven).toBe(false);
			expect(res.errors).toHaveLength(1);
			expect(res.errors[0]).toContain('ne correspond pas à la révision attendue');
		});

		it('rejette un schema_version invalide, un statut inconnu et une date non ISO', () => {
			const res = validateWriteBackPayload({
				schema_version: '2.0' as unknown as '1.0',
				realized_status: 'unknown_status' as unknown as RealizedStatus,
				realized_at: 'not-a-valid-date',
				realized_revision: 1,
				realized_by: 'conn@1.0',
				evidence_ref: 'https://ci.example/runs/1'
			});

			expect(res.valid).toBe(false);
			expect(res.proven).toBe(false);
			expect(res.errors).toHaveLength(3);
			expect(res.errors[0]).toContain('schema_version invalide');
			expect(res.errors[1]).toContain('realized_status invalide');
			expect(res.errors[2]).toContain('ISO-8601');
		});

		it('rejette les champs obligatoires manquants ou vides (revision, realized_by, evidence_ref)', () => {
			const emptyRev = validateWriteBackPayload({
				...validPayload,
				realized_revision: '   '
			});
			expect(emptyRev.valid).toBe(false);
			expect(emptyRev.errors).toContain('realized_revision est obligatoire');

			const nullRev = validateWriteBackPayload({
				...validPayload,
				realized_revision: null as unknown as string
			});
			expect(nullRev.valid).toBe(false);
			expect(nullRev.errors).toContain('realized_revision est obligatoire');

			const missingMeta = validateWriteBackPayload({
				schema_version: '1.0',
				realized_status: 'failed',
				realized_at: '2026-11-25T12:00:00.000Z',
				realized_revision: undefined,
				realized_by: '   ',
				evidence_ref: ''
			});
			expect(missingMeta.valid).toBe(false);
			expect(missingMeta.proven).toBe(false);
			expect(missingMeta.errors).toHaveLength(3);
		});
	});

	describe('toNautobotPatchBody', () => {
		it('n’écrit que les custom_fields realized_* / evidence_ref et n’inclut status que s’il est fourni', () => {
			const payload = buildConnectorWriteBackPayload({
				realizedStatus: 'provisioning',
				realizedRevision: 5,
				connectorName: 'baremetal-connector',
				connectorVersion: '0.9.0',
				evidenceRef: 'commit:abcdef1234',
				realizedAt: '2026-11-25T14:00:00.000Z'
			});

			const withoutStatus = toNautobotPatchBody(payload);
			expect(withoutStatus).toEqual({
				custom_fields: {
					realized_status: 'provisioning',
					realized_at: '2026-11-25T14:00:00.000Z',
					realized_revision: '5',
					realized_by: 'baremetal-connector@0.9.0',
					evidence_ref: 'commit:abcdef1234'
				}
			});
			expect('status' in withoutStatus).toBe(false);

			const withStatus = toNautobotPatchBody(payload, 'Active');
			expect(withStatus.status).toBe('Active');
			expect(
				Object.keys(withStatus.custom_fields as Record<string, unknown>).some((k) =>
					k.startsWith('archinex_')
				)
			).toBe(false);
		});
	});

	describe('writeBackToNautobot', () => {
		const validPayload = buildConnectorWriteBackPayload({
			realizedStatus: 'active',
			realizedRevision: 2,
			connectorName: 'gitops-connector',
			connectorVersion: '1.1.0',
			evidenceRef: 'https://forge.example/org/repo/commit/abc',
			realizedAt: '2026-11-25T15:00:00.000Z'
		});

		it('court-circuite avant tout appel réseau si le payload est invalide', async () => {
			const fetchSpy = vi.fn();
			const invalidPayload = { ...validPayload, evidence_ref: '' };

			const res = await writeBackToNautobot(
				{
					baseUrl: 'http://127.0.0.1:8080',
					nautobotToken: 'secret-token',
					objectPath: '/api/dcim/devices/dev-1/',
					fetchImpl: fetchSpy as unknown as typeof fetch
				},
				invalidPayload
			);

			expect(fetchSpy).not.toHaveBeenCalled();
			expect(res.reachable).toBe(false);
			expect(res.mode).toBe('degraded');
			expect(res.applied).toBe(false);
			expect(res.statusCode).toBe(0);
			expect(res.errors.length).toBeGreaterThan(0);
		});

		it('exécute le PATCH REST avec normalisation du chemin, en-tête Token et statut optionnel', async () => {
			let capturedUrl = '';
			let capturedInit: RequestInit | undefined;
			const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
				capturedUrl = String(input);
				capturedInit = init;
				return createMockResponse({ id: 'dev-99' }, { status: 200 });
			}) as unknown as typeof fetch;

			const res = await writeBackToNautobot(
				{
					baseUrl: 'https://nautobot.example.internal///',
					nautobotToken: 'connector-lp-token',
					objectPath: 'api/dcim/devices/dev-99/',
					nautobotStatus: 'Active',
					timeoutMs: 2500,
					fetchImpl: mockFetch
				},
				validPayload
			);

			expect(res.reachable).toBe(true);
			expect(res.mode).toBe('live');
			expect(res.applied).toBe(true);
			expect(res.statusCode).toBe(200);
			expect(res.objectPath).toBe('/api/dcim/devices/dev-99/');
			expect(res.errors).toEqual([]);

			expect(capturedUrl).toBe('https://nautobot.example.internal/api/dcim/devices/dev-99/');
			expect(capturedInit?.method).toBe('PATCH');
			const headers = new Headers(capturedInit?.headers);
			expect(headers.get('Authorization')).toBe('Token connector-lp-token');
			expect(headers.get('Content-Type')).toBe('application/json');
			expect(headers.get('Accept')).toBe('application/json');
			const parsedBody = JSON.parse(String(capturedInit?.body));
			expect(parsedBody.status).toBe('Active');
			expect(parsedBody.custom_fields.realized_revision).toBe('2');
		});

		it('retourne reachable=true, mode=degraded, applied=false sur erreur HTTP (403/500)', async () => {
			const mockFetch = (async () =>
				createMockResponse({ detail: 'Forbidden field' }, { status: 403 })) as unknown as typeof fetch;

			const res = await writeBackToNautobot(
				{
					baseUrl: 'http://127.0.0.1:8080',
					nautobotToken: 'bad-token',
					objectPath: '/api/dcim/devices/dev-403/',
					fetchImpl: mockFetch
				},
				validPayload
			);

			expect(res.reachable).toBe(true);
			expect(res.mode).toBe('degraded');
			expect(res.applied).toBe(false);
			expect(res.statusCode).toBe(403);
			expect(res.errors[0]).toContain('403');
		});

		it('dégrade proprement sur erreur réseau et sur timeout (AbortError)', async () => {
			const netErrFetch = (async () => {
				throw new Error('connect ECONNREFUSED 127.0.0.1:8080');
			}) as unknown as typeof fetch;

			const netRes = await writeBackToNautobot(
				{
					baseUrl: 'http://127.0.0.1:8080',
					nautobotToken: 'tok',
					objectPath: '/api/dcim/devices/dev-net/',
					fetchImpl: netErrFetch
				},
				validPayload
			);
			expect(netRes.reachable).toBe(false);
			expect(netRes.mode).toBe('degraded');
			expect(netRes.applied).toBe(false);
			expect(netRes.statusCode).toBe(0);
			expect(netRes.errors[0]).toContain('ECONNREFUSED');

			const abortFetch = (async () => {
				const err = new Error('The operation was aborted');
				err.name = 'AbortError';
				throw err;
			}) as unknown as typeof fetch;

			const timeoutRes = await writeBackToNautobot(
				{
					baseUrl: 'http://127.0.0.1:8080',
					nautobotToken: 'tok',
					objectPath: '/api/dcim/devices/dev-timeout/',
					timeoutMs: 1200,
					fetchImpl: abortFetch
				},
				validPayload
			);
			expect(timeoutRes.reachable).toBe(false);
			expect(timeoutRes.mode).toBe('degraded');
			expect(timeoutRes.applied).toBe(false);
			expect(timeoutRes.errors[0]).toContain('Timeout');
		});
	});
});
