import { describe, it, expect } from 'vitest';
import { coerceFactValue, describeFactKey, parseHubFactVocabulary, type HubFactKey } from '$lib/domain/hubFactVocabulary';
import { toHubFacts, HubDecisionError } from '$lib/server/projects/hubDecisions';

const DC: HubFactKey = { key: 'topology.dc_count', type: 'int', min: 1, unit: 'datacentres' };
const MODE: HubFactKey = { key: 'topology.mode', type: 'enum', values: ['single-site', 'active-passive', 'active-active'] };
const RPO: HubFactKey = { key: 'data.rpo_target_s', type: 'duration' };
const NIS2: HubFactKey = { key: 'continuity.nis2_in_scope', type: 'bool' };
const VOCAB = { version: 1, keys: [DC, MODE, RPO, NIS2] };

describe('Vocabulaire de faits du Hub : conversion sans rien deviner', () => {
	it('convertit un texte qui ne laisse aucun doute', () => {
		expect(coerceFactValue(DC, '2')).toEqual({ ok: true, value: 2 });
		expect(coerceFactValue(DC, ' 12 ')).toEqual({ ok: true, value: 12 });
		expect(coerceFactValue(RPO, '300')).toEqual({ ok: true, value: 300 });
		expect(coerceFactValue(NIS2, 'oui')).toEqual({ ok: true, value: true });
		expect(coerceFactValue(NIS2, 'False')).toEqual({ ok: true, value: false });
		expect(coerceFactValue(MODE, 'Active-Active')).toEqual({ ok: true, value: 'active-active' });
	});

	it('refuse, avec la raison, ce qui n\'est pas du bon type ou hors bornes', () => {
		for (const [def, raw] of [[DC, 'deux'], [DC, '0'], [DC, '2.5'], [RPO, '5 min'], [RPO, '-1'], [NIS2, 'peut-être'], [MODE, 'actif/actif']] as const) {
			const r = coerceFactValue(def, raw);
			expect(r.ok, `${def.key} ← ${raw}`).toBe(false);
			if (!r.ok) expect(r.reason.length).toBeGreaterThan(5);
		}
	});

	it('décrit chaque type pour guider l\'extraction', () => {
		expect(describeFactKey(DC)).toContain('≥ 1');
		expect(describeFactKey(MODE)).toContain('active-active');
		expect(describeFactKey(RPO)).toContain('secondes');
		expect(describeFactKey(NIS2)).toContain('booléen');
	});

	it('lit le vocabulaire dans l\'instantané du Hub, et refuse un instantané qui n\'en porte pas', () => {
		expect(parseHubFactVocabulary({ fact_vocabulary: { version: 1, keys: [DC, { key: 'x', type: 'weird' }] } }).keys).toHaveLength(1);
		expect(() => parseHubFactVocabulary({ snapshot_id: 's' })).toThrow(/VOCABULARY_UNAVAILABLE/);
	});
});

describe('Faits sélectionnés → faits du Hub', () => {
	it('typés, avec leur extrait source', () => {
		const facts = toHubFacts([{ key: 'topology.dc_count', value: '2', source_excerpt: 'sur deux sites' }, { key: 'topology.mode', value: 'active-active', source_excerpt: 'actif/actif' }], VOCAB);
		expect(facts).toEqual([
			{ key: 'topology.dc_count', value: 2, source_excerpt: 'sur deux sites' },
			{ key: 'topology.mode', value: 'active-active', source_excerpt: 'actif/actif' }
		]);
	});

	it('refuse une clé hors du vocabulaire et une valeur qui ne se convertit pas, en nommant la clé', () => {
		expect(() => toHubFacts([{ key: 'resilience_mode', value: 'actif/actif' }], VOCAB)).toThrow(HubDecisionError);
		try {
			toHubFacts([{ key: 'topology.mode', value: 'actif/actif' }], VOCAB);
			throw new Error('aurait dû refuser');
		} catch (e) {
			expect(e).toBeInstanceOf(HubDecisionError);
			expect((e as HubDecisionError).detail).toEqual({ key: 'topology.mode' });
			expect((e as HubDecisionError).code).toBe('FACT_VALUE');
		}
	});
});
