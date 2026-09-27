import type { ArchitectRole } from './epistemic';

export interface Invitation {
	id: string;
	email: string;
	name: string | null;
	role: 'admin' | 'user';
	expertRole: ArchitectRole | string;
	projectId: string | null;
	projectName: string | null;
	invitedBy: string;
	message: string | null;
	token: string;
	status: 'pending' | 'accepted' | 'expired';
	expiresAt: string;
	createdAt: string;
	updatedAt: string;
}

export type InvitationRecord = Invitation;
