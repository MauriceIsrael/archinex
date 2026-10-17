import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // If the user already has an active session, redirect to the dashboard
  if (locals.session) {
    throw redirect(302, '/');
  }
  return {};
};

