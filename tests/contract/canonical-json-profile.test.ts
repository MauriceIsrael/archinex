import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonicalJson, CanonicalError } from '$lib/domain/canonicalJson';
import { universalSha256 } from '$lib/validation/epistemicEnvelope';

const vectors = JSON.parse(readFileSync('tests/fixtures/canonical-json.vectors.json', 'utf-8'));

describe('canonical-json v1 de la suite : vecteurs partagés', () => {
	it.each(vectors.accept as any[])('accepté : $name', (c: any) => {
		const text = canonicalJson(JSON.parse(c.json));
		expect(text).toBe(c.canonical);
		expect(`sha256:${universalSha256(text)}`).toBe(c.sha256);
		expect(`sha256:${createHash('sha256').update(text, 'utf-8').digest('hex')}`).toBe(c.sha256);
	});

	it.each(vectors.reject as any[])('refusé : $name', (c: any) => {
		if (c.refusedAt === 'parse') {
			expect(() => JSON.parse(c.json)).toThrow(); // le lecteur JSON refuse NaN et Infinity
		} else {
			const value = JSON.parse(c.json);
			expect(() => canonicalJson(value)).toThrow(CanonicalError);
			try {
				canonicalJson(value);
			} catch (e) {
				expect((e as CanonicalError).code).toBe(c.code);
			}
		}
	});

	it('refuse ce qu’aucun vecteur ne couvre : types non JSON et substituts isolés', () => {
		for (const bad of [new Date(0), new Map(), new Set(), BigInt(1), () => 1, Symbol('x'), '\ud800', { a: Number.NaN }]) {
			expect(() => canonicalJson(bad)).toThrow(CanonicalError);
		}
		expect(canonicalJson({ a: undefined, b: [undefined, 1] })).toBe('{"b":[null,1]}');
	});
});
