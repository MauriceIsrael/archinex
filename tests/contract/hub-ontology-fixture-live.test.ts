/**
 * La fixture d'ontologie est une copie de l'export du Hub (LLMOps#192, Archinex#417) : elle doit être identique à ce que
 * sert un Hub réel. Lancé par `hub-live` (chaque nuit, et sur les PR) : échoue dès que l'ontologie du Hub a changé, il faut
 * alors la resynchroniser (`node scripts/sync-ontology-fixture.mjs --from-hub …`) et relire les tests qui en dépendent.
 *
 *   LLMOPS_LIVE_URL=http://127.0.0.1:8099 npx vitest run tests/contract/hub-ontology-fixture-live.test.ts
 *
 * Sans LLMOPS_LIVE_URL, ces tests sont ignorés (comme les autres tests « live »).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonical } from '../../scripts/sync-ontology-fixture.mjs';

const LIVE = process.env.LLMOPS_LIVE_URL;
const fixtureText = readFileSync(resolve(process.cwd(), 'tests/fixtures/edp/ontology_export.json'), 'utf-8');

describe.skipIf(!LIVE)('Fixture d\'ontologie contre le Hub réel', () => {
	it('est identique à GET /api/knowledge/ontology/export', async () => {
		const res = await fetch(`${LIVE!.replace(/\/$/, '')}/api/knowledge/ontology/export`, {
			headers: { Accept: 'application/json', Authorization: `Bearer ${process.env.LLMOPS_LIVE_TOKEN ?? 'contract-service-token'}` }
		});
		expect(res.status).toBe(200);
		const json = await res.json();
		const live = json.data || json;
		expect(canonical(live) === fixtureText, 'la fixture est périmée par rapport au Hub : la resynchroniser et relire les tests').toBe(true);
	});
});
