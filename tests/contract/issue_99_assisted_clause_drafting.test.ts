import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn(),
	goto: vi.fn()
}));

import { render } from 'svelte/server';
import KbClausesPage from '../../src/routes/kb/clauses/+page.svelte';
import { draftCheckClause, generateFallbackClause } from '$lib/server/doctrine/clauseDrafter';
import { POST as draftPost } from '../../src/routes/api/kb/clauses/[assetId]/draft/+server';
import { POST as saveDraftPost } from '../../src/routes/api/kb/clauses/[assetId]/save-draft/+server';
import { llmopsClient } from '$lib/server/llmops/client';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';
import type { CheckClausesList, MandatoryControlWithoutClause } from '$lib/types/llmops';

describe('Issue #99 — Rédaction assistée d’une clause pour les contrôles sans clause', () => {
	let fakeLlmops: FakeLlmopsServer;
	let originalBaseUrl: string;

	beforeAll(async () => {
		fakeLlmops = await startFakeLlmopsServer();
		originalBaseUrl = (llmopsClient as any).baseUrl;
		(llmopsClient as any).baseUrl = fakeLlmops.url;
	});

	afterAll(async () => {
		(llmopsClient as any).baseUrl = originalBaseUrl;
		await fakeLlmops.close();
	});

	const mockMissingControl: MandatoryControlWithoutClause = {
		asset_id: 'NIS2-ART21-2A',
		asset_title: 'Politiques relatives à l’analyse des risques et à la sécurité des SI',
		asset_title_fr: 'Politiques d’analyse des risques',
		framework: 'NIS2',
		domain: ['security'],
		source_ref: 'Article 21(2)(a)',
		asset_excerpt: 'Policies on risk analysis and information system security. Entities shall establish formal risk assessments.'
	};

	describe('1. Service de rédaction assistée (draftCheckClause & fallback)', () => {
		it('génère un brouillon structuré à partir du modèle avec termes FR/EN et provenance llm-derived', async () => {
			const mockLlm = {
				chat: vi.fn().mockResolvedValue(
					JSON.stringify({
						kind: 'requires',
						when: {
							terms_any: ['analyse de risques', 'évaluation des risques', 'risk analysis', 'risk assessment']
						},
						expect: {
							terms_any: ['ebios', 'iso 27005', 'méthodologie formelle', 'formal risk assessment']
						},
						message: 'NIS2 Art. 21(2)(a) : Une analyse formelle des risques est obligatoire.',
						provenance: 'llm-derived'
					})
				)
			} as any;

			const result = await draftCheckClause(mockMissingControl, mockLlm);

			expect(result.kind).toBe('requires');
			expect(result.when.terms_any).toContain('analyse de risques');
			expect(result.when.terms_any).toContain('risk analysis');
			expect(result.expect?.terms_any).toContain('ebios');
			expect(result.expect?.terms_any).toContain('formal risk assessment');
			expect(result.message).toContain('NIS2 Art. 21(2)(a)');
			expect(result.provenance).toBe('llm-derived');
		});

		it('active le repli déterministe en cas de défaillance ou timeout du LLM', async () => {
			const mockFailingLlm = {
				chat: vi.fn().mockRejectedValue(new Error('LLM connection timed out'))
			} as any;

			const result = await draftCheckClause(mockMissingControl, mockFailingLlm);

			expect(result.kind).toBe('requires');
			expect(result.provenance).toBe('llm-derived');
			expect(result.when.terms_any.length).toBeGreaterThan(0);
			expect(result.expect?.terms_any?.length).toBeGreaterThan(0);
			expect(result.when.terms_any.some((t) => t.includes('risque') || t.includes('risk'))).toBe(true);
		});

		it('génère des clauses pour différentes thématiques réglementaires via le fallback', () => {
			const backupControl: MandatoryControlWithoutClause = {
				asset_id: 'NIS2-ART21-2C',
				asset_title: 'Continuité des activités et sauvegardes',
				framework: 'NIS2',
				domain: ['security'],
				asset_excerpt: 'Business continuity, backup management and disaster recovery.'
			};

			const draft = generateFallbackClause(backupControl);
			expect(draft.kind).toBe('requires');
			expect(draft.when.terms_any.some((t) => t.includes('sauvegarde') || t.includes('backup'))).toBe(true);
			expect(draft.expect?.terms_any.some((t) => t.includes('hors-site') || t.includes('off-site'))).toBe(true);
			expect(draft.provenance).toBe('llm-derived');
		});
	});

	describe('2. Endpoint API POST /api/kb/clauses/[assetId]/draft', () => {
		it('refuse les requêtes non authentifiées (401)', async () => {
			const event: any = {
				params: { assetId: 'NIS2-ART21-2A' },
				request: new Request('http://localhost/api/kb/clauses/NIS2-ART21-2A/draft', {
					method: 'POST',
					body: JSON.stringify(mockMissingControl)
				}),
				locals: {}
			};

			const response = await draftPost(event);
			expect(response.status).toBe(401);
		});

		it('renvoie une proposition de clause pour un contrôle avec le code 200', async () => {
			const event: any = {
				params: { assetId: 'NIS2-ART21-2A' },
				request: new Request('http://localhost/api/kb/clauses/NIS2-ART21-2A/draft', {
					method: 'POST',
					body: JSON.stringify(mockMissingControl)
				}),
				locals: { session: { user: { email: 'expert@example.com' } } }
			};

			const response = await draftPost(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.status).toBe('ok');
			expect(body.data.kind).toBeDefined();
			expect(body.data.when?.terms_any?.length).toBeGreaterThan(0);
			expect(body.data.provenance).toBe('llm-derived');
		});
	});

	describe('3. Endpoint API POST /api/kb/clauses/[assetId]/save-draft', () => {
		it('refuse une clause incomplète sans terme when (400)', async () => {
			const event: any = {
				params: { assetId: 'NIS2-ART21-2A' },
				request: new Request('http://localhost/api/kb/clauses/NIS2-ART21-2A/save-draft', {
					method: 'POST',
					body: JSON.stringify({
						clause: { kind: 'requires', when: { terms_any: [] } }
					})
				}),
				locals: { session: { user: { email: 'expert@example.com' } } }
			};

			const response = await saveDraftPost(event);
			expect(response.status).toBe(400);
		});

		it('enregistre la clause avec le statut draft et provenance llm-derived', async () => {
			const event: any = {
				params: { assetId: 'NIS2-ART21-2A' },
				request: new Request('http://localhost/api/kb/clauses/NIS2-ART21-2A/save-draft', {
					method: 'POST',
					body: JSON.stringify({
						clause: {
							kind: 'requires',
							when: { terms_any: ['analyse de risques', 'risk analysis'] },
							expect: { terms_any: ['ebios', 'iso 27005'] },
							message: 'Analyse des risques obligatoire',
							provenance: 'llm-derived'
						}
					})
				}),
				locals: { session: { user: { email: 'expert@example.com' } } }
			};

			const response = await saveDraftPost(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.status).toBe('ok');

			// Vérifie l'état dans fakeLlmops
			const state = fakeLlmops.state;
			const savedCheck = state.checkClauses.find((c) => c.asset_id === 'NIS2-ART21-2A');
			expect(savedCheck).toBeDefined();
			expect(savedCheck?.status).toBe('draft');
			expect(savedCheck?.provenance).toBe('llm-derived');
			expect(savedCheck?.when.terms_any).toContain('analyse de risques');
		});
	});

	describe('4. Interface utilisateur (/kb/clauses - onglet Contrôles sans clause)', () => {
		it('affiche le bouton « Proposer une clause » pour les contrôles sans clause', () => {
			const mockClauses: CheckClausesList = {
				clauses: [],
				counts: { draft: 0, validated: 0, rejected: 0 },
				mandatory_without_clause: [mockMissingControl],
				pending_publication: 0
			};

			const { html } = render(KbClausesPage, {
				props: {
					data: {
						framework: 'NIS2',
						tab: 'missing',
						clauses: mockClauses,
						error: null,
						expert: { handle: '@expert', canPublish: true }
					}
				}
			});

			expect(html).toContain('Clauses vérifiables');
			expect(html).toContain('Contrôles sans clause');
			expect(html).toContain('Proposer une clause');
			expect(html).toContain('data-testid="btn-draft-clause-NIS2-ART21-2A"');
		});
	});
});
