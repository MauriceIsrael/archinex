/**
 * Profil canonical-json v1 de l'Architecture Suite (contracts/canonical-json.md de la suite).
 *
 * Une valeur est sérialisable ou REFUSÉE : jamais approximée. `JSON.stringify` seul ne suffit pas : il tronque en silence
 * au-delà de 2^53 − 1, écrit un `NaN` en `null`, laisse passer un substitut isolé et une `Date` en `{}`.
 * Référence partagée : `tests/fixtures/canonical-json.vectors.json` (48 cas, identiques dans les dépôts de la suite).
 */
export const MAX_SAFE = Number.MAX_SAFE_INTEGER;

export class CanonicalError extends Error {
	constructor(
		public readonly code: string,
		message: string
	) {
		super(`${code}: ${message}`);
		this.name = 'CanonicalError';
	}
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function serializeNumber(value: number): string {
	if (!Number.isFinite(value)) {
		throw new CanonicalError('CANONICAL_NON_FINITE_NUMBER', 'NaN et les infinis n’existent pas en JSON');
	}
	if (Math.abs(value) > MAX_SAFE) {
		throw new CanonicalError('CANONICAL_UNSAFE_INTEGER', `${value} dépasse 2^53 − 1 en magnitude (l’écrire en chaîne)`);
	}
	return Object.is(value, -0) ? '0' : String(value); // Number::toString d'ECMAScript, celui de JSON.stringify
}

function serializeString(value: string): string {
	if (LONE_SURROGATE.test(value)) {
		throw new CanonicalError('CANONICAL_LONE_SURROGATE', 'un substitut isolé ne peut pas être scellé');
	}
	return JSON.stringify(value);
}

/** Texte canonique de `value` ; lève `CanonicalError` pour tout ce que le profil refuse. */
export function canonicalJson(value: unknown): string {
	if (value === null) return 'null';
	switch (typeof value) {
		case 'boolean':
			return value ? 'true' : 'false';
		case 'number':
			return serializeNumber(value);
		case 'string':
			return serializeString(value);
		case 'object': {
			if (Array.isArray(value)) {
				// `undefined` dans un tableau s'écrit `null` : un tableau a des positions.
				return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
			}
			const proto = Object.getPrototypeOf(value);
			if (proto !== Object.prototype && proto !== null) {
				throw new CanonicalError('CANONICAL_UNSUPPORTED_TYPE', `${value.constructor?.name ?? 'objet'} n’est pas du JSON (Date, Map, Set… refusés)`);
			}
			const record = value as Record<string, unknown>;
			const keys = Object.keys(record)
				.filter((k) => record[k] !== undefined) // une clé `undefined` est omise ; `null`, lui, est conservé
				.sort(); // ordre par unité de code UTF-16, celui que la suite impose
			return `{${keys.map((k) => `${serializeString(k)}:${canonicalJson(record[k])}`).join(',')}}`;
		}
		default:
			throw new CanonicalError('CANONICAL_UNSUPPORTED_TYPE', `${typeof value} n’est pas du JSON`);
	}
}
