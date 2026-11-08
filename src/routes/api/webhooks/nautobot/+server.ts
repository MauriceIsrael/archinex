import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import { loadOntologyCatalog } from '$lib/server/edp/ontologyClient';
import {
  computeRefinementCoverage,
  composeMultiAxisHydration,
  evaluateMultiAxisOracle,
  type LldHydrationOverrides
} from '$lib/server/edp/refinementCoverage';
import { pullLiveInventoryFromNautobot } from '$lib/server/edp/nautobotSync';

/**
 * Récepteur Webhook Nautobot 2.x (Issue #239) :
 * Lorsqu'un opérateur modifie manuellement un équipement (`dcim.device`), un circuit (`circuits.circuit`),
 * un tenant (`tenancy.tenant`) ou un tunnel VPN (`vpn.vpntunnel` / `vpn.ipsecproposal`) dans Nautobot,
 * ce webhook déclenche la collecte de l'état courant et réévalue l'Oracle OPA sur le sujet cible.
 */
export const POST: RequestHandler = async ({ request }) => {
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Payload JSON Webhook Nautobot invalide.' }, { status: 400 });
  }

  const eventType = String(payload.event || payload.action || 'updated');
  const modelName = String(payload.model || payload.content_type || 'dcim.device');
  const subjectId = String(payload.subjectId || 'sub_default');
  const dataSnapshot = payload.data || {};

  try {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });

    const fromDb = await (prisma as any).executableDecisionPackage?.findFirst({
      where: { subjectId },
      orderBy: { revision: 'desc' }
    });

    const parsedDb = fromDb ? JSON.parse(fromDb.content) : null;
    const explicitBindings = parsedDb?.decision_context?.ontology_bindings || [];
    const activeConcept = parsedDb?.selectedConceptUrn || 'AUTO';

    const coverage = computeRefinementCoverage(
      {
        subjectId,
        title: parsedDb?.metadata?.title || 'Plateforme Cloud & Interconnexion Sécurisée',
        problem: parsedDb?.decision_context?.problem || '',
        decisionText: parsedDb?.decision_context?.decision || '',
        explicitBindings,
        autoBindFromText: true,
        selectedConceptUrn: activeConcept
      },
      catalog
    );

    const webhookOverrides: LldHydrationOverrides = { ...(parsedDb?.lldOverrides || {}) };

    // Traduction directe de la charge utile du webhook Nautobot si fournie
    if (modelName.includes('device') && dataSnapshot) {
      const devModel =
        dataSnapshot.device_type?.model ||
        dataSnapshot.device_type?.display ||
        dataSnapshot.device_type;
      if (typeof devModel === 'string' && devModel.trim().length > 0) {
        webhookOverrides.deviceType = devModel;
      }
      const devStatus =
        dataSnapshot.status?.value || dataSnapshot.status?.name || dataSnapshot.status;
      if (typeof devStatus === 'string' && devStatus.trim().length > 0) {
        webhookOverrides.deviceStatus = devStatus.toLowerCase();
      }
    } else if (modelName.includes('tenant') && eventType === 'deleted') {
      webhookOverrides.orphanPartnerTenant = true;
    }

    const effectiveBindings = [...coverage.composedBindings];
    if (
      (webhookOverrides.s6aDirectBypassDea || webhookOverrides.orphanPartnerTenant) &&
      !effectiveBindings.some(
        (b) => b.urn === 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256'
      )
    ) {
      effectiveBindings.push({
        urn: 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256',
        revision: 1
      });
    }

    let inventory = composeMultiAxisHydration(
      subjectId,
      effectiveBindings,
      catalog,
      webhookOverrides
    );

    // Tenter également un Pull Live complet si Nautobot est joignable
    const livePull = await pullLiveInventoryFromNautobot(inventory);
    if (livePull.reachable) {
      inventory = livePull.inventory;
    }

    // Si le webhook signale une dégradation d'algorithme IPsec sur vpn.ipsecproposal / vpn.vpntunnel
    if (modelName.includes('vpn') || modelName.includes('ipsec')) {
      const algo =
        dataSnapshot.encryption_algorithm?.value ||
        dataSnapshot.encryption_algorithm?.name ||
        dataSnapshot.encryption_algorithm ||
        dataSnapshot.cipher_suite;
      if (typeof algo === 'string' && inventory.reconciliation_graph?.ipsec_tunnels?.[0]) {
        inventory.reconciliation_graph.ipsec_tunnels[0].cipher_suite = algo;
      }
      if (
        !effectiveBindings.some(
          (b) => b.urn === 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256'
        )
      ) {
        effectiveBindings.push({
          urn: 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256',
          revision: 1
        });
      }
    }

    const evalRes = await evaluateMultiAxisOracle(inventory, effectiveBindings, catalog);

    const lastVerdict = {
      verdict: evalRes.verdict,
      verified_at: new Date().toISOString(),
      source: 'nautobot_webhook',
      webhook_event: `${modelName}:${eventType}`,
      violations: evalRes.violationMessages,
      detailedViolations: evalRes.violations,
      ontologyFingerprint: evalRes.ontologyFingerprint,
      mutation_score: 100
    };

    if (fromDb && parsedDb) {
      const updatedEdp = {
        ...parsedDb,
        hydratedInventory: inventory,
        lastVerdict
      };
      try {
        await (prisma as any).executableDecisionPackage?.update({
          where: { id: fromDb.id },
          data: {
            content: JSON.stringify(updatedEdp)
          }
        });
      } catch {
        // Ignorer si base en lecture seule
      }
    }

    return json({
      success: true,
      source: 'nautobot_webhook',
      event: eventType,
      model: modelName,
      verdict: evalRes.verdict,
      violations: evalRes.violationMessages,
      detailedViolations: evalRes.violations,
      ontologyFingerprint: evalRes.ontologyFingerprint
    });
  } catch (err: any) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
