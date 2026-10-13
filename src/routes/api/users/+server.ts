import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { requireAuth } from '$lib/auth/guard.server';
import type { RequestHandler } from './$types';

/**
 * GET /api/users — Annuaire des utilisateurs pour alimenter le sélecteur de participants (#61)
 */
export const GET: RequestHandler = async ({ locals }) => {
	requireAuth(locals);

	const users = await prisma.user.findMany({
		select: {
			id: true,
			name: true,
			email: true,
			role: true
		},
		orderBy: { name: 'asc' }
	});

	return json({
		status: 'ok',
		users
	});
};

