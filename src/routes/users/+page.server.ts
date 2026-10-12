import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Redirection de l'ancienne page /users vers l'interface centralisée de gestion des comptes (/admin).
 * Issue #76 : suppression des données en dur et centralisation des comptes, rôles et identités LLMOps.
 */
export const load: PageServerLoad = async () => {
  throw redirect(302, '/admin');
};

