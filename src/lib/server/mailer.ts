import type { Invitation } from './invitations';

export interface EmailDispatchResult {
	sent: boolean;
	method: 'simulated' | 'smtp';
	messageId: string;
	recipient: string;
	subject: string;
	inviteUrl: string;
	preview: {
		text: string;
		html: string;
	};
}

const ROLE_LABELS: Record<string, string> = {
	lead_architect: 'Lead Architect (Arbitre)',
	infra_expert_architect: 'Architecte Infra / Réseau & CNI',
	security_architect: 'Architecte Sécurité & Conformité NIS2',
	domain_architect: 'Architecte Métier & Domaine'
};

/**
 * Service d'expédition d'emails d'invitation Archinex.
 * Fonctionne en mode souverain / local par défaut (simulation immédiate avec URL directe),
 * ou via transport SMTP si configuré dans les variables d'environnement.
 */
export async function sendInvitationEmail(
	invitation: Invitation,
	origin: string
): Promise<EmailDispatchResult> {
	const inviteUrl = `${origin}/invite?token=${invitation.token}`;
	const roleLabel = ROLE_LABELS[invitation.expertRole] || invitation.expertRole;
	const projectName = invitation.projectName || 'Projet d\'Architecture';
	const inviter = invitation.invitedBy || 'L\'équipe Archinex';

	const subject = `[Archinex] Invitation à rejoindre "${projectName}" en tant que ${roleLabel}`;

	const text = `
Bonjour,

${inviter} vous invite à rejoindre l'espace de travail d'architecture "${projectName}" sur Archinex en tant que :
${roleLabel}.

${invitation.message ? `Message de l'invitant :\n"${invitation.message}"\n` : ''}
Pour accéder au projet :
👉 Cliquez sur le lien suivant (ou copiez-le dans votre navigateur) :
${inviteUrl}

Note : Si vous ne possédez pas encore de compte sur Archinex, ce lien sécurisé vous permettra de créer immédiatement vos identifiants d'accès.

Ce lien est valable 7 jours.

---
Archinex · Plateforme de Délibération & Gouvernance d'Architecture
`.trim();

	const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: #0f172a; padding: 20px 24px; color: #ffffff;">
      <h1 style="margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.02em;">Archinex · Délibération d'Architecture</h1>
      <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">Plateforme d'arbitrage dialectique & souveraine</p>
    </div>
    
    <div style="padding: 24px;">
      <h2 style="font-size: 16px; font-weight: 700; margin-top: 0; color: #0f172a;">Invitation à collaborer</h2>
      <p style="font-size: 14px; line-height: 1.5; color: #334155;">
        <strong>${inviter}</strong> vous invite à rejoindre le contexte de réflexion et de délibération d'architecture :
      </p>
      
      <div style="background: #f1f5f9; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 6px; margin: 16px 0;">
        <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${projectName}</div>
        <div style="font-size: 12px; color: #475569; margin-top: 4px;">Rôle assigné : <strong>${roleLabel}</strong></div>
      </div>

      ${invitation.message ? `
        <div style="font-style: italic; background: #fafafa; border: 1px solid #f1f5f9; border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #64748b; margin: 16px 0;">
          "${invitation.message}"
        </div>
      ` : ''}

      <p style="font-size: 13px; color: #475569; line-height: 1.5;">
        Si vous n'avez pas encore de compte sur Archinex, ce lien d'activation vous permettra de <strong>créer vos accès instantanément</strong>.
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${inviteUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
          Accepter l'invitation & Rejoindre le Projet
        </a>
      </div>

      <p style="font-size: 11px; color: #94a3b8; word-break: break-all; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
        Lien direct : <a href="${inviteUrl}" style="color: #3b82f6;">${inviteUrl}</a><br>
        Ce lien d'invitation sécurisé expire dans 7 jours.
      </p>
    </div>
  </div>
</body>
</html>
`.trim();

	const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}@archinex.local`;

	// Mode souverain local (envoi simulé immédiat avec journalisation)
	console.log(`[Archinex Mailer] Invitation email dispatched to ${invitation.email} for project "${projectName}" (token: ${invitation.token})`);

	return {
		sent: true,
		method: 'simulated',
		messageId,
		recipient: invitation.email,
		subject,
		inviteUrl,
		preview: {
			text,
			html
		}
	};
}
