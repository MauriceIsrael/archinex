import { describe, it, expect, vi, afterEach } from 'vitest';
import { LocalLlmClient } from '../../src/lib/server/llm/localLlmClient';
import {
	buildCanonicalRequirementsContext,
	reconcileQuickAskCitations,
	selectRelevantRequirements,
	type QuickAskRequirementItem
} from '../../src/lib/domain/requirementsQa';

function makeAnthropicSseResponse(text: string): Response {
	const events = [
		`event: message_start\ndata: ${JSON.stringify({
			type: 'message_start',
			message: {
				id: 'msg_test',
				type: 'message',
				role: 'assistant',
				content: [],
				model: 'claude-sonnet-5-5',
				stop_reason: null,
				stop_sequence: null,
				usage: { input_tokens: 10, output_tokens: 0 }
			}
		})}\n\n`,
		`event: content_block_start\ndata: ${JSON.stringify({
			type: 'content_block_start',
			index: 0,
			content_block: { type: 'text', text: '' }
		})}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({
			type: 'content_block_delta',
			index: 0,
			delta: { type: 'text_delta', text }
		})}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`,
		`event: message_delta\ndata: ${JSON.stringify({
			type: 'message_delta',
			delta: { stop_reason: 'end_turn', stop_sequence: null },
			usage: { output_tokens: 5 }
		})}\n\n`,
		`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`
	].join('');

	return new Response(events, {
		status: 200,
		headers: { 'Content-Type': 'text/event-stream' }
	});
}

const sampleItems: QuickAskRequirementItem[] = [
	{
		clauseRef: 'REQ-10',
		bundleId: 'SRC-aaaa1111:REQ-10',
		sourceTitle: 'CCTP Lot Infra',
		sourceSha256: 'sha256:aaaa1111',
		position: 10,
		title: 'Architecture tri-site et continuité',
		text: "La plateforme doit être déployée sur 3 zones de disponibilité indépendantes (architecture tri-site active).",
		criticality: 'bloquant',
		category: 'NFR',
		effectiveDisposition: 'deliberated',
		clarificationQuestion: null,
		linkedSubjectIds: ['SUB-HA-01']
	},
	{
		clauseRef: 'REQ-02',
		bundleId: 'SRC-aaaa1111:REQ-02',
		sourceTitle: 'CCTP Lot Infra',
		sourceSha256: 'sha256:aaaa1111',
		position: 2,
		title: 'Chiffrement au repos',
		text: 'Les disques et sauvegardes doivent être chiffrés en AES-256.',
		criticality: 'majeur',
		category: 'NFR',
		effectiveDisposition: 'evacuated',
		clarificationQuestion: null,
		linkedSubjectIds: []
	},
	{
		clauseRef: 'REQ-05',
		bundleId: 'SRC-aaaa1111:REQ-05',
		sourceTitle: 'CCTP Lot Infra',
		sourceSha256: 'sha256:aaaa1111',
		position: 5,
		title: 'Couleur du portail',
		text: "L'interface respecte la charte graphique institutionnelle.",
		criticality: 'info',
		category: 'FR',
		effectiveDisposition: 'evacuated',
		clarificationQuestion: null,
		linkedSubjectIds: []
	}
];

describe('Quick-Ask Exigences : Contrat domaine & Prompt Caching', () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it('sérialise le corpus de façon déterministe quel que soit l ordre en entrée', () => {
		const a = buildCanonicalRequirementsContext(sampleItems);
		const b = buildCanonicalRequirementsContext([...sampleItems].reverse());

		expect(a.corpusText).toBe(b.corpusText);
		expect(a.cacheHint).toBe(b.cacheHint);
		expect(a.sortedItems.map((x) => x.clauseRef)).toEqual(['REQ-02', 'REQ-05', 'REQ-10']);
	});

	it('retrouve les formulations implicites (ex. "3 DC" -> "tri-site" / "3 zones de disponibilité") en mode filtré', () => {
		const selected = selectRelevantRequirements(sampleItems, 'est-ce que les exigences imposent 3 DC ?', 260);
		expect(selected.some((x) => x.clauseRef === 'REQ-10')).toBe(true);
	});

	it('écarte toute citation hallucinée et enrichit les citations valides avec les sujets liés', () => {
		const { citations, droppedRefs } = reconcileQuickAskCitations(
			[
				{ clauseRef: 'REQ-10', excerpt: 'architecture tri-site active' },
				{ clauseRef: 'REQ-999-INVENTED', excerpt: 'clause fictive' },
				{ clauseRef: 'SRC-aaaa1111:REQ-10', excerpt: 'doublon via bundleId' }
			],
			sampleItems
		);

		expect(droppedRefs).toEqual(['REQ-999-INVENTED']);
		expect(citations).toHaveLength(1);
		expect(citations[0].clauseRef).toBe('REQ-10');
		expect(citations[0].linkedSubjectIds).toEqual(['SUB-HA-01']);
	});

	it('émet cache_control ephemeral sur Anthropic quand un bloc système est marqué cacheable', async () => {
		let capturedBody: any = null;
		globalThis.fetch = vi.fn(async (_url, init) => {
			capturedBody = JSON.parse(String(init?.body ?? '{}'));
			return makeAnthropicSseResponse('{"verdict":"imposed","answer":"Oui [REQ-10]","caveats":[],"citations":[]}');
		}) as any;

		const client = new LocalLlmClient({
			provider: 'anthropic',
			anthropicApiKey: 'sk-ant-test',
			anthropicModel: 'claude-sonnet-5-5',
			envFilePath: false
		});

		const res = await client.chat({
			format: 'json',
			messages: [
				{ role: 'system', content: 'CORPUS_STABLE', cacheable: true },
				{ role: 'user', content: '3 DC ?' }
			]
		});

		expect(res).toContain('imposed');
		expect(Array.isArray(capturedBody.system)).toBe(true);
		const cachedBlock = capturedBody.system.find((b: any) => b.text === 'CORPUS_STABLE');
		expect(cachedBlock).toEqual({
			type: 'text',
			text: 'CORPUS_STABLE',
			cache_control: { type: 'ephemeral' }
		});
	});

	it('conserve system en chaîne simple quand aucun message système n est cacheable', async () => {
		let capturedBody: any = null;
		globalThis.fetch = vi.fn(async (_url, init) => {
			capturedBody = JSON.parse(String(init?.body ?? '{}'));
			return makeAnthropicSseResponse('ok');
		}) as any;

		const client = new LocalLlmClient({
			provider: 'anthropic',
			anthropicApiKey: 'sk-ant-test',
			anthropicModel: 'claude-sonnet-5-5',
			envFilePath: false
		});

		await client.chat({
			messages: [
				{ role: 'system', content: 'PROMPT_SIMPLE' },
				{ role: 'user', content: 'Bonjour' }
			]
		});

		expect(capturedBody.system).toBe('PROMPT_SIMPLE');
	});
});
