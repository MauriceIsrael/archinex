/**
 * Vocabulaire des faits d'architecture du Hub (K18) : les clés, leur type, leurs bornes.
 *
 * Le Hub refuse un fait dont la clé n'est pas dans son vocabulaire ou dont la valeur n'est pas du bon type (rien n'est réparé
 * en silence). Pour un projet basculé, Archinex travaille donc dans CE vocabulaire : le sien (`resilience_mode`, `site_count`…)
 * ne recoupe aucune clé du Hub. Une valeur saisie comme texte n'est convertie que quand la conversion est sans ambiguïté ;
 * sinon elle est refusée avec la raison, jamais devinée.
 */

export type HubFactType = 'int' | 'bool' | 'enum' | 'duration';

export interface HubFactKey {
	key: string;
	type: HubFactType;
	values?: string[];
	min?: number;
	max?: number;
	unit?: string;
	label?: { fr?: string; en?: string };
}

export interface HubFactVocabulary {
	version: number;
	keys: HubFactKey[];
}

export function parseHubFactVocabulary(snapshot: unknown): HubFactVocabulary {
	const section = (snapshot as { fact_vocabulary?: { version?: number; keys?: unknown[] } } | null)?.fact_vocabulary;
	if (!section || !Array.isArray(section.keys)) {
		throw new Error("VOCABULARY_UNAVAILABLE: l'instantané du Hub ne porte pas de vocabulaire de faits (fact_vocabulary).");
	}
	const keys = section.keys.filter((k): k is HubFactKey => {
		const x = k as Partial<HubFactKey>;
		return typeof x?.key === 'string' && ['int', 'bool', 'enum', 'duration'].includes(String(x.type));
	});
	return { version: Number(section.version ?? 0), keys };
}

/** Description courte d'une clé, pour guider l'extraction : « int ≥ 1 », « enum : a | b », « durée en secondes ». */
export function describeFactKey(def: HubFactKey): string {
	switch (def.type) {
		case 'bool':
			return 'booléen : true ou false';
		case 'enum':
			return `une de ces valeurs exactes : ${(def.values ?? []).join(' | ')}`;
		case 'duration':
			return `nombre entier de secondes${def.min !== undefined ? ` ≥ ${def.min}` : ''}`;
		default:
			return `nombre entier${def.min !== undefined ? ` ≥ ${def.min}` : ''}${def.max !== undefined ? ` ≤ ${def.max}` : ''}${def.unit ? ` (${def.unit})` : ''}`;
	}
}

export type CoerceResult = { ok: true; value: string | number | boolean } | { ok: false; reason: string };

const TRUE = new Set(['true', 'vrai', 'oui']);
const FALSE = new Set(['false', 'faux', 'non']);

/** Convertit la valeur saisie (texte) au type du Hub, sans rien deviner : « 2 » → 2, « actif/actif » n'est pas une valeur d'énumération. */
export function coerceFactValue(def: HubFactKey, raw: unknown): CoerceResult {
	if (def.type === 'bool') {
		if (typeof raw === 'boolean') return { ok: true, value: raw };
		const t = String(raw).trim().toLowerCase();
		if (TRUE.has(t)) return { ok: true, value: true };
		if (FALSE.has(t)) return { ok: true, value: false };
		return { ok: false, reason: 'booléen attendu (true ou false)' };
	}
	if (def.type === 'enum') {
		const wanted = String(raw).trim().toLowerCase();
		const hit = (def.values ?? []).find((v) => v.toLowerCase() === wanted);
		return hit ? { ok: true, value: hit } : { ok: false, reason: `une valeur parmi ${(def.values ?? []).join(', ')}` };
	}
	const text = typeof raw === 'number' ? String(raw) : String(raw).trim();
	if (!/^-?\d+$/.test(text)) {
		return { ok: false, reason: def.type === 'duration' ? 'nombre entier de secondes attendu' : 'nombre entier attendu' };
	}
	const n = Number(text);
	if (!Number.isSafeInteger(n)) return { ok: false, reason: 'entier trop grand' };
	const low = def.min ?? (def.type === 'duration' ? 0 : undefined);
	if ((low !== undefined && n < low) || (def.max !== undefined && n > def.max)) {
		return { ok: false, reason: `hors bornes [${low ?? '-∞'}, ${def.max ?? '+∞'}]` };
	}
	return { ok: true, value: n };
}
