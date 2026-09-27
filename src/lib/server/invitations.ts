import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import type { Invitation, InvitationRecord } from '$lib/types/invitation';

export type { Invitation, InvitationRecord };

export interface CreateInvitationDTO {
	email: string;
	name?: string;
	role?: string;
	expertRole?: string;
	projectId?: string;
	projectName?: string;
	invitedBy?: string;
	message?: string;
}

let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
	if (!dbInstance) {
		const dbPath = path.resolve(process.cwd(), 'prisma', 'dev.db');
		const db = new Database(dbPath);
		db.exec(`
			CREATE TABLE IF NOT EXISTS invitations (
				id TEXT PRIMARY KEY,
				email TEXT NOT NULL,
				name TEXT,
				role TEXT NOT NULL DEFAULT 'user',
				expert_role TEXT NOT NULL DEFAULT 'infra_expert_architect',
				project_id TEXT,
				project_name TEXT,
				invited_by TEXT,
				message TEXT,
				token TEXT UNIQUE NOT NULL,
				status TEXT NOT NULL DEFAULT 'pending',
				expires_at TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
			CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
		`);
		dbInstance = db;
	}
	return dbInstance;
}

function mapRow(row: any): Invitation {
	return {
		id: row.id,
		email: row.email,
		name: row.name,
		role: row.role,
		expertRole: row.expert_role,
		projectId: row.project_id,
		projectName: row.project_name,
		invitedBy: row.invited_by,
		message: row.message,
		token: row.token,
		status: row.status as 'pending' | 'accepted' | 'expired',
		expiresAt: row.expires_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

export function createInvitation(dto: CreateInvitationDTO): Invitation {
	const db = getDb();
	const id = `inv_${crypto.randomUUID()}`;
	const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
	const now = new Date().toISOString();
	// 7 days expiration
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

	const role = dto.role || 'user';
	const expertRole = dto.expertRole || 'infra_expert_architect';
	const email = dto.email.trim().toLowerCase();
	const name = dto.name?.trim() || null;
	const projectId = dto.projectId?.trim() || null;
	const projectName = dto.projectName?.trim() || null;
	const invitedBy = dto.invitedBy?.trim() || 'Lead Architect';
	const message = dto.message?.trim() || null;

	const stmt = db.prepare(`
		INSERT INTO invitations (
			id, email, name, role, expert_role, project_id, project_name,
			invited_by, message, token, status, expires_at, created_at, updated_at
		) VALUES (
			?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?
		)
	`);

	stmt.run(
		id,
		email,
		name,
		role,
		expertRole,
		projectId,
		projectName,
		invitedBy,
		message,
		token,
		expiresAt,
		now,
		now
	);

	return getInvitationById(id)!;
}

export function getInvitationById(id: string): Invitation | null {
	const db = getDb();
	const row = db.prepare('SELECT * FROM invitations WHERE id = ?').get(id);
	return row ? mapRow(row) : null;
}

export function getInvitationByToken(token: string): Invitation | null {
	const db = getDb();
	const row = db.prepare('SELECT * FROM invitations WHERE token = ?').get(token);
	if (!row) return null;
	const inv = mapRow(row);
	// Check expiration
	if (inv.status === 'pending' && new Date(inv.expiresAt) < new Date()) {
		updateInvitationStatus(inv.id, 'expired');
		return { ...inv, status: 'expired' };
	}
	return inv;
}

export function listInvitations(options?: { email?: string; status?: string }): Invitation[] {
	const db = getDb();
	let query = 'SELECT * FROM invitations';
	const params: any[] = [];

	if (options?.email && options?.status) {
		query += ' WHERE email = ? AND status = ? ORDER BY created_at DESC';
		params.push(options.email.toLowerCase(), options.status);
	} else if (options?.email) {
		query += ' WHERE email = ? ORDER BY created_at DESC';
		params.push(options.email.toLowerCase());
	} else if (options?.status) {
		query += ' WHERE status = ? ORDER BY created_at DESC';
		params.push(options.status);
	} else {
		query += ' ORDER BY created_at DESC';
	}

	const rows = db.prepare(query).all(...params);
	return rows.map(mapRow);
}

export function updateInvitationStatus(id: string, status: 'pending' | 'accepted' | 'expired'): boolean {
	const db = getDb();
	const now = new Date().toISOString();
	const res = db.prepare('UPDATE invitations SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
	return res.changes > 0;
}

export function deleteInvitation(id: string): boolean {
	const db = getDb();
	const res = db.prepare('DELETE FROM invitations WHERE id = ?').run(id);
	return res.changes > 0;
}
