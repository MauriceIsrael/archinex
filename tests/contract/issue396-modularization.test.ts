import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
	EDP_ACTION_SLUGS,
	EdpActionPayloadSchema,
	AxisScopeInputSchema,
	ValidateEdpInputSchema,
	SimulateDriftInputSchema,
	dispatchEdpAction
} from '$lib/server/edp/actions';
import {
	LLMOpsClient,
	HUB_CONTRACT_VERSION,
	isContractVersionCompatible
} from '$lib/server/llmops/client';
import { HUB_CONTRACT_PATHS } from '$lib/server/llmops/contract/generated-types';

const ROOT = process.cwd();

function collectServerRoutes(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			collectServerRoutes(full, acc);
		} else if (
			entry.isFile() &&
			(entry.name === '+server.ts' ||
				entry.name === '+page.server.ts' ||
				entry.name === '+layout.server.ts')
		) {
			acc.push(full);
		}
	}
	return acc;
}

describe('Issue #396 — Découpage EDP, client LLMOps, SubjectThreadView & garde-fou taille', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('1. EDP : endpoints dédiés par action + validation Zod + couche service', () => {
		it('expose un endpoint +server.ts dédié pour chacune des 11 actions EDP', () => {
			const baseDir = resolve(
				ROOT,
				'src/routes/api/projects/[projectId]/subjects/[subjectId]/edp'
			);
			for (const slug of Object.values(EDP_ACTION_SLUGS)) {
				const routeFile = resolve(baseDir, slug, '+server.ts');
				expect(existsSync(routeFile), `Route manquante : ${slug}/+server.ts`).toBe(true);
				const lines = readFileSync(routeFile, 'utf-8').split(/\r?\n/).length;
				expect(lines).toBeLessThanOrEqual(40);
			}
		});

		it('valide les entrées EDP via Zod (succès et erreurs explicites)', () => {
			expect(ValidateEdpInputSchema.safeParse({ edpId: '' }).success).toBe(false);
			expect(ValidateEdpInputSchema.safeParse({ edpId: 'EDP-1' }).success).toBe(true);

			expect(AxisScopeInputSchema.safeParse({}).success).toBe(false);
			expect(AxisScopeInputSchema.safeParse({ axisUrn: 'urn:archinex:ontology:axis:test' }).success).toBe(true);

			expect(
				SimulateDriftInputSchema.safeParse({ driftScenario: 'unknown_scenario' }).success
			).toBe(false);
			expect(
				SimulateDriftInputSchema.safeParse({ driftScenario: 'reset_clean' }).success
			).toBe(true);

			expect(EdpActionPayloadSchema.safeParse({ action: 'unknown_action' }).success).toBe(false);
		});

		it('dispatchEdpAction exécute challenge et rejette une action inconnue en 400 sans chaîne de if', async () => {
			const ctx = {
				projectId: 'proj-1',
				subjectId: 'sub-1',
				actor: { id: 'arch@example.com', role: 'lead_architect' }
			};

			const challengeRes = await dispatchEdpAction(ctx, {
				action: 'challenge',
				edpId: 'EDP-sub-1',
				reason: 'Justification technique'
			});
			expect(challengeRes.status ?? 200).toBe(200);
			expect(challengeRes.body.success).toBe(true);
			expect((challengeRes.body.challenge as any)?.reason).toBe('Justification technique');

			const unknownRes = await dispatchEdpAction(ctx, { action: 'not_a_real_action' });
			expect(unknownRes.status).toBe(400);
			expect(unknownRes.body.error).toBe('Action non reconnue.');
		});
	});

	describe('2. LLMOpsClient : modules par domaine, types générés & négociation de version', () => {
		it('expose les modules de domaine et les constantes générées du contrat Hub', () => {
			const client = new LLMOpsClient({ baseUrl: 'http://127.0.0.1:8000', cacheTtlMs: 0 });
			expect(client.transport).toBeDefined();
			expect(client.doctrine).toBeDefined();
			expect(client.frameworks).toBeDefined();
			expect(client.knowledge).toBeDefined();
			expect(client.knowledgeAdmin).toBeDefined();
			expect(client.evaluations).toBeDefined();
			expect(client.engagements).toBeDefined();
			expect(HUB_CONTRACT_VERSION).toBe('1.0');
			expect(HUB_CONTRACT_PATHS).toContain('/health');
		});

		it('négocie la version de contrat via les en-têtes HTTP (compatible et mismatch)', async () => {
			expect(isContractVersionCompatible('1.0', '1.0')).toBe(true);
			expect(isContractVersionCompatible('1.0', '1.3')).toBe(true);
			expect(isContractVersionCompatible('1.0', '2.0')).toBe(false);

			const client = new LLMOpsClient({ baseUrl: 'http://127.0.0.1:8000', cacheTtlMs: 0 });
			let sentContractHeader: string | null = null;

			vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
				const h = init?.headers as Record<string, string> | undefined;
				if (h && h['X-Hub-Contract-Version']) {
					sentContractHeader = h['X-Hub-Contract-Version'];
				}
				return new Response(
					JSON.stringify({
						status: 'ok',
						plane: 'local',
						schema_version: '1.0',
						service: 'llmops-hub',
						engine_version: '1.0.0',
						engine_commit: 'abc'
					}),
					{
						status: 200,
						headers: {
							'Content-Type': 'application/json',
							'X-Hub-Contract-Version': '1.2'
						}
					}
				);
			});

			const negotiation = await client.negotiateContractVersion({ bypassCache: true });
			expect(negotiation.status).toBe('negotiated');
			expect(negotiation.compatible).toBe(true);
			expect(negotiation.serverVersion).toBe('1.2');

			// Vérifie aussi l'en-tête sortant sur un appel authentifié
			await client.getBoard('demo');
			expect(sentContractHeader).toBe(HUB_CONTRACT_VERSION);
		});
	});

	describe('3. SubjectThreadView : sous-composants extraits (fil, matrice, doctrine, cascade)', () => {
		it('extrait les sous-composants spécialisés dans thread/', () => {
			const expected = [
				'src/lib/components/deliberation/thread/types.ts',
				'src/lib/components/deliberation/thread/SubjectThreadHeader.svelte',
				'src/lib/components/deliberation/thread/SubjectDiscussionPane.svelte',
				'src/lib/components/deliberation/thread/SubjectMatrixPane.svelte',
				'src/lib/components/deliberation/thread/SubjectDoctrinePane.svelte',
				'src/lib/components/deliberation/thread/SubjectCascadePane.svelte'
			];
			for (const rel of expected) {
				expect(existsSync(resolve(ROOT, rel)), `Sous-composant manquant : ${rel}`).toBe(true);
			}
		});
	});

	describe('4. Critères d’acceptation globaux sur les routes serveur', () => {
		it('aucune route serveur ne dépasse 300 lignes et aucune route API ne traite les actions par chaîne de if', () => {
			const routes = collectServerRoutes(resolve(ROOT, 'src/routes'));
			for (const routeFile of routes) {
				const content = readFileSync(routeFile, 'utf-8');
				const lineCount = content.split(/\r?\n/).length;
				expect(lineCount, `Route > 300 lignes : ${routeFile}`).toBeLessThanOrEqual(300);
				if (routeFile.endsWith('+server.ts')) {
					const ifActionMatches = content.match(/\bif\s*\(\s*action\s*===/g) ?? [];
					expect(
						ifActionMatches.length,
						`Chaîne if (action === ...) détectée dans ${routeFile}`
					).toBeLessThan(2);
				}
			}
		});
	});
});
