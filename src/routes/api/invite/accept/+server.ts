import { json, error } from '@sveltejs/kit';
import { getInvitationByToken, updateInvitationStatus } from '$lib/server/invitations';
import { prisma } from '$lib/server/prisma';
import { signAccessToken, signRefreshToken } from '$lib/auth/jwt.server';
import bcrypt from 'bcryptjs';
import { verifyPassword } from '$lib/auth/password.server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	const body = await request.json().catch(() => ({}));
	const { token, name, password } = body;

	if (!token) {
		throw error(400, 'Jeton d\'invitation manquant');
	}

	// 1. Vérifier l'invitation
	const invitation = getInvitationByToken(token);
	if (!invitation) {
		throw error(404, 'Invitation introuvable');
	}

	if (invitation.status === 'expired') {
		throw error(410, 'Cette invitation a expiré. Veuillez demander un nouveau lien.');
	}

	if (invitation.status === 'accepted') {
		throw error(400, 'Cette invitation a déjà été acceptée.');
	}

	const email = invitation.email.toLowerCase();

	// 2. Vérifier si l'utilisateur existe déjà
	let user = await prisma.user.findUnique({
		where: { email }
	});

	if (!user) {
		// CAS 1 : L'EXPERT N'A PAS ENCORE DE COMPTE -> CRÉATION IMMÉDIATE
		if (!password || password.length < 6) {
			throw error(400, 'Le mot de passe doit contenir au moins 6 caractères');
		}

		const displayName = name?.trim() || invitation.name || email.split('@')[0];
		const passwordHash = await bcrypt.hash(password, 10);

		user = await prisma.user.create({
			data: {
				name: displayName,
				email,
				passwordHash,
				role: invitation.role || 'user',
				attributes: JSON.stringify({
					expertRole: invitation.expertRole,
					projectIds: invitation.projectId ? [invitation.projectId] : [],
					invitedAt: invitation.createdAt
				})
			}
		});
	} else {
		// CAS 2 : L'EXPERT POSSÈDE DÉJÀ UN COMPTE -> VÉRIFICATION & RATTACHEMENT
		const isCurrentUser = locals.session?.user?.email === email;

		if (!isCurrentUser) {
			if (!password) {
				throw error(400, 'Mot de passe requis pour confirmer votre identité');
			}
			if (!(await verifyPassword(password, user.passwordHash))) {
				throw error(401, 'Mot de passe incorrect pour ce compte existant');
			}
		}

		// Mettre à jour les attributs avec le projet invité et le rôle
		try {
			const existingAttrs = JSON.parse(user.attributes || '{}');
			const projectIds = Array.isArray(existingAttrs.projectIds) ? existingAttrs.projectIds : [];
			if (invitation.projectId && !projectIds.includes(invitation.projectId)) {
				projectIds.push(invitation.projectId);
			}

			user = await prisma.user.update({
				where: { id: user.id },
				data: {
					attributes: JSON.stringify({
						...existingAttrs,
						expertRole: invitation.expertRole || existingAttrs.expertRole,
						projectIds
					})
				}
			});
		} catch {
			// Continuer si parsing attributs échoue
		}
	}

	// Rattacher explicitement le compte aux participants de l'espace et à ProjectMember (#61)
	if (invitation.projectId) {
		try {
			const eng = await prisma.engagement.findUnique({
				where: { id: invitation.projectId },
				select: { participants: true }
			});
			if (eng) {
				const participants = JSON.parse(eng.participants || '[]') as any[];
				const existingIdx = participants.findIndex(
					(p) =>
						(p.email && p.email.toLowerCase() === email) ||
						(p.id && p.id === user.id)
				);
				const partObj = {
					id: user.id,
					name: user.name,
					email: user.email,
					role: invitation.expertRole || 'infra_expert_architect',
					isLead: invitation.expertRole === 'lead_architect'
				};
				if (existingIdx !== -1) {
					participants[existingIdx] = { ...participants[existingIdx], ...partObj };
				} else {
					participants.push(partObj);
				}
				await prisma.engagement.update({
					where: { id: invitation.projectId },
					data: { participants: JSON.stringify(participants) }
				});
			}

			await prisma.projectMember
				.upsert({
					where: {
						projectId_userId: {
							projectId: invitation.projectId,
							userId: user.id
						}
					},
					create: {
						projectId: invitation.projectId,
						userId: user.id,
						role: invitation.expertRole || 'infra_expert_architect',
						domains: '[]'
					},
					update: {
						role: invitation.expertRole || 'infra_expert_architect'
					}
				})
				.catch(() => {});
		} catch {
			// Non bloquant
		}
	}

	// 3. Marquer l'invitation comme acceptée
	updateInvitationStatus(invitation.id, 'accepted');

	// 4. Émettre les tokens de session
	const accessToken = await signAccessToken({
		id: user.id,
		email: user.email,
		name: user.name,
		role: user.role as 'admin' | 'user'
	});

	const refreshToken = await signRefreshToken(user.id);

	cookies.set('accessToken', accessToken, {
		path: '/',
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		maxAge: 60 * 15 // 15 mins
	});

	cookies.set('refreshToken', refreshToken, {
		path: '/',
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		maxAge: 60 * 60 * 24 * 7 // 7 jours
	});

	return json({
		success: true,
		message: 'Compte validé et invitation acceptée !',
		user: {
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role
		},
		projectId: invitation.projectId,
		redirectUrl: '/deliberation'
	});
};
