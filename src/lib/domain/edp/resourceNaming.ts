/**
 * Normalisation générique des noms et identifiants techniques (hôtes, clusters, slugs).
 * Garantit l'absence de doubles tirets (`--`), de tirets en début/fin et de caractères invalides.
 */

export function sanitizeResourceSegment(
	raw: string | null | undefined,
	fallback = 'item',
	maxLen?: number
): string {
	const normalized = (raw ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	const sliced =
		typeof maxLen === 'number' && maxLen > 0 && normalized.length > maxLen
			? normalized.slice(-maxLen).replace(/^-+|-+$/g, '')
			: normalized;

	const cleanFallback = fallback
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'item';

	return sliced || cleanFallback;
}

export function buildResourceName(
	prefix: string,
	rawSegment: string | null | undefined,
	fallback = 'item',
	options?: { suffix?: string; maxSegmentLen?: number }
): string {
	const cleanPrefix = sanitizeResourceSegment(prefix, 'res');
	const cleanSegment = sanitizeResourceSegment(rawSegment, fallback, options?.maxSegmentLen);
	const cleanSuffix = options?.suffix
		? sanitizeResourceSegment(options.suffix, '')
		: '';

	return [cleanPrefix, cleanSegment, cleanSuffix]
		.filter((part) => part.length > 0)
		.join('-')
		.replace(/-{2,}/g, '-')
		.replace(/^-+|-+$/g, '');
}
