import { prisma } from './prisma';
import { llmopsClient, type LLMOpsClient } from './llmops/client';
import type { KbEvent } from '$lib/types/llmops';

/**
 * Service de scrutation (polling) et de distribution des notifications KB (Lot A7 - Porte G5)
 * Garantit l'idempotence stricte via le curseur scellé `KbEventCursor` et l'historique d'événements.
 */
export class KbNotificationService {
  private static CURSOR_ID = 'llmops_events_cursor';
  private client: LLMOpsClient;

  constructor(client: LLMOpsClient = llmopsClient) {
    this.client = client;
  }

  /**
   * Récupère le curseur actuel de polling stocké en base.
   */
  async getCurrentCursor(): Promise<string | undefined> {
    const record = await prisma.kbEventCursor.findUnique({
      where: { id: KbNotificationService.CURSOR_ID }
    });
    return record?.cursor;
  }

  /**
   * Effectue un cycle de scrutation et distribue les notifications aux experts concernés.
   */
  async pollAndDispatchEvents(customClient?: LLMOpsClient): Promise<{
    processedCount: number;
    newCursor: string;
    events: KbEvent[];
  }> {
    const currentCursor = await this.getCurrentCursor();
    const clientToUse = customClient || this.client;
    const response = await clientToUse.pollEvents(currentCursor);

    if (response.status !== 'ok' || !response.data) {
      return {
        processedCount: 0,
        newCursor: currentCursor || '',
        events: []
      };
    }

    const { events, next_cursor } = response.data;
    let processedCount = 0;

    for (const evt of events) {
      // 1. Distribution à chaque destinataire
      for (const recipientHandle of evt.recipients || []) {
        // Trouver le profil expert / utilisateur associé
        const profile = await prisma.kbProfile.findUnique({
          where: { kbHandle: recipientHandle },
          include: { user: true }
        });

        const targetUser =
          profile?.user ||
          (await prisma.user.findFirst({
            where: {
              email: { contains: recipientHandle.replace('@', '') }
            }
          }));

        if (targetUser) {
          // Vérification d'idempotence : ne pas dupliquer si cet événement a déjà été notifié
          const existing = await prisma.kbNotification.findFirst({
            where: {
              userId: targetUser.id,
              metadata: { contains: `"eventId":"${evt.id}"` }
            }
          });

          if (!existing) {
            const title =
              evt.payload.title ||
              this.formatDefaultTitle(evt.type, evt.candidate_id);

            const message =
              evt.payload.message ||
              this.formatDefaultMessage(evt.type, evt.payload);

            await prisma.kbNotification.create({
              data: {
                userId: targetUser.id,
                recipientHandle,
                eventType: evt.type,
                candidateId: evt.candidate_id || null,
                title,
                message,
                read: false,
                metadata: JSON.stringify({
                  eventId: evt.id,
                  cursor: evt.cursor,
                  payload: evt.payload,
                  timestamp: evt.timestamp
                })
              }
            });
            processedCount++;
          }
        }
      }

      // 2. Traçabilité append-only DomainEvent si rattaché à un engagement
      if (evt.payload?.engagement || evt.payload?.engagementId) {
        const engId = evt.payload.engagement || evt.payload.engagementId;
        const project = await prisma.project.findUnique({
          where: { id: engId }
        });

        if (project) {
          await prisma.domainEvent.create({
            data: {
              projectId: project.id,
              entityType: 'kb_candidate',
              entityId: evt.candidate_id || 'kb-governance',
              type: `KB_${evt.type.toUpperCase().replace(/\./g, '_')}`,
              actorId: evt.payload.actor || 'system',
              actorRole: 'domain_expert',
              productionMode: 'human-authored',
              payload: JSON.stringify(evt.payload)
            }
          });
        }
      }
    }

    // 3. Mise à jour persistante du curseur
    await prisma.kbEventCursor.upsert({
      where: { id: KbNotificationService.CURSOR_ID },
      create: {
        id: KbNotificationService.CURSOR_ID,
        cursor: next_cursor,
        lastPolledAt: new Date()
      },
      update: {
        cursor: next_cursor,
        lastPolledAt: new Date()
      }
    });

    return {
      processedCount,
      newCursor: next_cursor,
      events
    };
  }

  /**
   * Récupère la liste des notifications pour un utilisateur donné.
   */
  async getUserNotifications(userId: string, unreadOnly = false) {
    return prisma.kbNotification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { read: false } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
  }

  /**
   * Marque une notification comme lue.
   */
  async markNotificationRead(notificationId: string, userId: string) {
    return prisma.kbNotification.updateMany({
      where: {
        id: notificationId,
        userId
      },
      data: {
        read: true
      }
    });
  }

  /**
   * Marque toutes les notifications d'un utilisateur comme lues.
   */
  async markAllNotificationsRead(userId: string) {
    return prisma.kbNotification.updateMany({
      where: {
        userId,
        read: false
      },
      data: {
        read: true
      }
    });
  }

  private formatDefaultTitle(type: string, candidateId?: string): string {
    switch (type) {
      case 'candidate.submitted':
        return `Nouveau candidat KB à examiner`;
      case 'candidate.assigned':
        return `Candidat KB assigné`;
      case 'review.requested':
        return `Sollicitation d'expertise KB`;
      case 'candidate.reviewed':
        return `Décision d'examen enregistrée`;
      case 'candidate.commented':
        return `Nouveau commentaire sur un candidat`;
      case 'reminder.due':
        return `Rappel d'échéance de revue (en retard)`;
      default:
        return `Notification de gouvernance KB`;
    }
  }

  private formatDefaultMessage(type: string, payload: any): string {
    const actor = payload.actor || 'Un collègue';
    const title = payload.title ? `« ${payload.title} »` : '';
    switch (type) {
      case 'candidate.submitted':
        return `${actor} a soumis le candidat ${title} pour votre domaine.`;
      case 'candidate.assigned':
        return `${actor} vous a assigné l'examen de ${title}.`;
      case 'review.requested':
        return `${actor} sollicite votre second avis sur ${title}.`;
      case 'candidate.reviewed':
        return `L'examen de ${title} a été finalisé (${payload.action}).`;
      case 'candidate.commented':
        return `${actor} a commenté : "${payload.message || ''}"`;
      case 'reminder.due':
        return `Le délai d'examen pour ${title} est dépassé.`;
      default:
        return payload.message || 'Mise à jour enregistrée.';
    }
  }
}

export const kbNotificationService = new KbNotificationService();
