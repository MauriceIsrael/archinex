/**
 * i18n Store — Force la locale française (`fr-FR`) pour garantir la cohérence
 * linguistique de l'interface Archinex (cf. issue #393).
 */

import { locale as i18nLocale } from 'svelte-i18n';

export const DEFAULT_LOCALE = 'fr-FR';

if (typeof window !== 'undefined') {
  i18nLocale.set(DEFAULT_LOCALE);
}

/**
 * Définit la locale active (maintenue en français par défaut).
 */
export function setLocale(_newLocale?: string): void {
  i18nLocale.set(DEFAULT_LOCALE);
}
