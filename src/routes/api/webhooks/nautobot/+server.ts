import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyNautobotWebhookHmac } from '$lib/server/edp/nautobotWebhookAuth';
import { processAuthenticatedNautobotWebhook } from '$lib/server/edp/nautobotWebhookProcessor';

/**
 * Récepteur Webhook Nautobot 2.x authentifié par HMAC par projet (Issue #377) :
 * - Rejette (401) toute requête non signée ou dont la signature HMAC échoue, sans aucun effet de bord.
 * - Rattache le sujet/décision exclusivement par les marqueurs `archinex_*` de l'objet Nautobot
 *   (jamais par un identifiant de sujet libre dans le corps du message). Un objet non marqué produit un écart « hors décision » distinct.
 * - Ne modifie jamais l'EDP d'origine (`executable_decision_packages`).
 * - Assure l'idempotence par identifiant d'événement (`webhook_event_receipts`) et la déduplication
 *   des `DriftFinding` par `(projectId, fingerprint)`.
 * - Répond rapidement (202 Accepted) et exécute l'évaluation oracle en asynchrone.
 * - Remonte explicitement les erreurs de persistance (journal + 500).
 */
export const POST: RequestHandler = async ({ request, url }) => {
  const rawBody = await request.text();

  const auth = await verifyNautobotWebhookHmac({
    headers: request.headers,
    url,
    rawBody
  });
  if (!auth.ok || !auth.projectId) {
    return json(
      { accepted: false, error: auth.error || 'Signature HMAC webhook invalide.' },
      { status: 401 }
    );
  }

  let payload: Record<string, any>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json(
        { accepted: false, error: 'Payload JSON Webhook Nautobot invalide (objet attendu).' },
        { status: 400 }
      );
    }
    payload = parsed;
  } catch {
    return json(
      { accepted: false, error: 'Payload JSON Webhook Nautobot invalide.' },
      { status: 400 }
    );
  }

  const sync = url.searchParams.get('sync') === 'true';

  const result = await processAuthenticatedNautobotWebhook({
    projectId: auth.projectId,
    headers: request.headers,
    rawBody,
    payload,
    sync
  });

  return json(result.body, { status: result.status });
};
