/**
 * svelte-i18n initialization module.
 *
 * CRITICAL: All `register()` calls MUST happen before `init()`.
 *
 * @architecture
 * - The default locale ('en') is statically imported to ensure 
 *   instant availability during SSR (minimizing TTFB).
 * - Other locales are lazily loaded via dynamic imports to keep
 *   the initial bundle small.
 */

import { addMessages, init, waitLocale } from 'svelte-i18n';
import en from './locales/en.json';
import fr from './locales/fr-FR.json';
import es from './locales/es.json';
import enUK from './locales/en-UK.json';

// ── Step 1: Synchronously register all locales so SSR + Vite HMR stay in sync ─
addMessages('en', en);
addMessages('en-US', en);
addMessages('fr', fr);
addMessages('fr-FR', fr);
addMessages('es', es);
addMessages('en-UK', enUK);
addMessages('en-GB', enUK);

// ── Step 2: Initialize ─────────────────────────────────────────────────────
init({
  fallbackLocale: 'fr-FR',
  initialLocale: 'fr-FR',
});

export { waitLocale };