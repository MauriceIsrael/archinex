/**
 * svelte-i18n initialization module.
 *
 * Archinex assume le français comme langue unique de l'interface (cf. issue #393).
 * Toutes les clés utilisées par `$t(...)` sont résolues de manière synchrone depuis `fr-FR.json`.
 */

import { addMessages, init, waitLocale } from 'svelte-i18n';
import fr from './locales/fr-FR.json';

addMessages('fr', fr);
addMessages('fr-FR', fr);

init({
  fallbackLocale: 'fr-FR',
  initialLocale: 'fr-FR',
});

export { waitLocale };
