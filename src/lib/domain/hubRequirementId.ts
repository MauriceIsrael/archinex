/**
 * Identifiant d'une exigence dans le Hub.
 *
 * Le Hub n'accepte que `[A-Za-z0-9][A-Za-z0-9._:-]{0,63}`. Les identifiants du dossier (`SRC-<8 hex>:<clause>`) sont
 * repris tels quels quand ils conviennent. Sinon la partie « clause » est assainie de façon déterministe, et un suffixe tiré
 * de la référence d'origine (`.h<8 hex>`) garde l'application injective : deux références différentes ne se confondent pas
 * parce qu'elles ne diffèrent que par des caractères refusés (`REQ#2` et `REQ-2`).
 */

import { universalSha256 } from '$lib/validation/epistemicEnvelope';

export const HUB_REQUIREMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const MAX = 64;

export function hubRequirementId(bundleId: string): string {
	if (HUB_REQUIREMENT_ID.test(bundleId)) return bundleId;

	const sep = bundleId.indexOf(':');
	const prefix = sep > 0 ? bundleId.slice(0, sep + 1) : '';
	const clause = sep > 0 ? bundleId.slice(sep + 1) : bundleId;
	const suffix = `.h${universalSha256(bundleId).slice(0, 8)}`;

	// Le préfixe lui-même peut contenir des caractères refusés : on l'assainit comme le reste.
	const clean = (s: string) =>
		s
			.normalize('NFKD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^A-Za-z0-9._-]/g, '-')
			.replace(/-{2,}/g, '-')
			.replace(/^[-._]+|[-._]+$/g, '');
	const safePrefix = prefix ? `${clean(prefix.slice(0, -1)) || 'SRC'}:` : '';
	const room = MAX - safePrefix.length - suffix.length;
	let body = clean(clause).slice(0, Math.max(room, 0)).replace(/[-._]+$/g, '');
	if (!body) body = 'clause';
	const id = `${safePrefix}${body}${suffix}`;
	// Un préfixe vide ne doit pas commencer par un séparateur ; l'assainissement l'a déjà retiré.
	return HUB_REQUIREMENT_ID.test(id) ? id : `R${suffix}`;
}

/**
 * Table identifiant du dossier → identifiant Hub, pour un ensemble d'exigences. Refuse (au lieu de choisir) quand deux
 * identifiants différents donnent le même identifiant Hub : le cas est rare, mais une confusion serait silencieuse.
 */
export function hubRequirementIdMap(bundleIds: Iterable<string>): Map<string, string> {
	const out = new Map<string, string>();
	const owner = new Map<string, string>();
	for (const id of bundleIds) {
		if (out.has(id)) continue;
		const hub = hubRequirementId(id);
		const other = owner.get(hub);
		if (other && other !== id) {
			throw new Error(`HUB_ID_COLLISION: '${id}' et '${other}' donnent le même identifiant Hub '${hub}'.`);
		}
		owner.set(hub, id);
		out.set(id, hub);
	}
	return out;
}
