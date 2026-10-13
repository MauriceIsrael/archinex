import { describe, it, expect } from 'vitest';
import {
	resolveUserSpaceRole,
	explainActionRefusal,
	getRoleLabel,
	getRolePrivileges,
	ARCHITECT_ROLE_LABELS
} from '$lib/domain/spaceActor';
import type { EngagementProfile, ProjectParticipant } from '$lib/domain/engagements';

describe('Archinex #61 : Rattachement et affichage contextuel du rôle (« Vous êtes : <rôle> »)', () => {
	const sampleParticipants: ProjectParticipant[] = [
		{
			id: 'user-lead-1',
			name: 'Maurice Israel',
			email: 'lead@archinex.local',
			role: 'lead_architect',
			isLead: true
		},
		{
			id: 'user-sec-2',
			name: 'Alice Security',
			email: 'alice@security.local',
			role: 'security_architect'
		},
		{
			id: 'user-infra-3',
			name: 'Bob Infra',
			email: 'bob@infra.local',
			role: 'infra_expert_architect'
		}
	];

	const sampleEngagement: Partial<EngagementProfile> = {
		id: 'proj-omega',
		title: 'Projet Oméga',
		participants: sampleParticipants
	};

	it('1. Résout le rôle d’un participant explicite par email', () => {
		const user = { id: 'some-id', email: 'alice@security.local', name: 'Alice' };
		const info = resolveUserSpaceRole(sampleEngagement as EngagementProfile, user);

		expect(info.isAssigned).toBe(true);
		expect(info.role).toBe('security_architect');
		expect(info.roleLabel).toBe('Architecte Sécurité NIS2');
		expect(info.displayText).toBe('Vous êtes : Architecte Sécurité NIS2');
		expect(info.privilegesSummary).toContain('sécurité NIS2');
	});

	it('2. Résout le rôle d’un participant explicite par ID de compte', () => {
		const user = { id: 'user-infra-3', email: 'other-email@domain.com', name: 'Bob' };
		const info = resolveUserSpaceRole(sampleEngagement as EngagementProfile, user);

		expect(info.isAssigned).toBe(true);
		expect(info.role).toBe('infra_expert_architect');
		expect(info.roleLabel).toBe('Architecte Infra / Réseau');
		expect(info.displayText).toBe('Vous êtes : Architecte Infra / Réseau');
	});

	it('3. Fallback pour un administrateur non présent dans la liste des participants : Lead Architect avec pleins pouvoirs', () => {
		const adminUser = { id: 'admin-99', email: 'superadmin@archinex.local', name: 'Root', role: 'admin' };
		const info = resolveUserSpaceRole(sampleEngagement as EngagementProfile, adminUser);

		expect(info.isAssigned).toBe(true);
		expect(info.isAdmin).toBe(true);
		expect(info.role).toBe('lead_architect');
		expect(info.roleLabel).toBe('Administrateur (Lead Architect)');
		expect(info.displayText).toBe('Vous êtes : Administrateur (Lead Architect)');
		expect(info.privilegesSummary).toContain('Autorité complète');
	});

	it('4. Utilisateur authentifié mais non affecté à l’espace : statut Observateur (lecture seule explicite)', () => {
		const externalUser = { id: 'guest-1', email: 'guest@external.org', name: 'Invité' };
		const info = resolveUserSpaceRole(sampleEngagement as EngagementProfile, externalUser);

		expect(info.isAssigned).toBe(false);
		expect(info.isAdmin).toBe(false);
		expect(info.displayText).toBe('Vous êtes : Observateur (aucun rôle attribué dans cet espace)');
		expect(info.privilegesSummary).toContain('participant');
	});

	it('5. Sans utilisateur connecté (session absente) : rôle par défaut Lead Architect', () => {
		const info = resolveUserSpaceRole(sampleEngagement as EngagementProfile, null);

		expect(info.isAssigned).toBe(false);
		expect(info.role).toBe('lead_architect');
		expect(info.displayText).toBe('Vous êtes : Lead Architect (Arbitre)');
	});

	it('6. getRoleLabel formate les rôles en libellés français clairs', () => {
		expect(getRoleLabel('lead_architect')).toBe('Lead Architect (Arbitre)');
		expect(getRoleLabel('security_architect')).toBe('Architecte Sécurité NIS2');
		expect(getRoleLabel('infra_expert_architect')).toBe('Architecte Infra / Réseau');
		expect(getRoleLabel('domain_architect')).toBe('Architecte Métier & Domaine');
		expect(getRoleLabel('data_architect')).toBe('Architecte Données & IA');
		expect(getRoleLabel(null)).toBe('Observateur (non affecté)');
	});

	it('7. explainActionRefusal explique en clair pourquoi le scellement officiel (freeze) est bloqué', () => {
		const msg = explainActionRefusal('freeze', 'infra_expert_architect');
		expect(msg).toContain('Architecte Infra / Réseau');
		expect(msg).toContain('Seul le Lead Architect est habilité à sceller');
	});

	it('8. explainActionRefusal explique en clair pourquoi l’homologation L4/L5 est bloquée', () => {
		const msg = explainActionRefusal('homologate', 'security_architect', { targetLevel: 'L4' });
		expect(msg).toContain('Architecte Sécurité NIS2');
		expect(msg).toContain('Seul le Lead Architect peut homologuer (L4)');
	});

	it('9. explainActionRefusal explique la séparation des pouvoirs K16 lors de l’auto-validation', () => {
		const msg = explainActionRefusal('affirm', 'lead_architect', { isAuthor: true });
		expect(msg).toContain('Auto-validation interdite (règle K16)');
		expect(msg).toContain('auteur de cette proposition de décision');
		expect(msg).toContain('décideur distinct');
	});

	it('10. explainActionRefusal explique le refus d’affirmation pour un profil non qualifié', () => {
		const msg = explainActionRefusal('affirm', 'infra_expert_architect', { isAuthor: false });
		expect(msg).toContain('Architecte Infra / Réseau');
		expect(msg).toContain('décideur distinct qualifié');
	});
});
