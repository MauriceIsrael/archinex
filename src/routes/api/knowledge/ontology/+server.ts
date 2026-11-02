import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  loadOntologyCatalog,
  addOntologyTriplet,
  removeOntologyTriplet,
  upsertOntologyEntity,
  resetRuntimeOntologyOverlay,
  type OntologyPredicate
} from '$lib/server/edp/ontologyClient';

const ALLOWED_PREDICATES: OntologyPredicate[] = [
  'requires_aspect',
  'implemented_by',
  'depends_on',
  'constrains',
  'conflicts_with'
];

export const GET: RequestHandler = async () => {
  try {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const entitiesList = Object.values(catalog.entities);
    const triplets = catalog.triplets || [];

    return json({
      catalog_version: catalog.catalog_version,
      generated_at: catalog.generated_at,
      entities: catalog.entities,
      triplets,
      stats: {
        totalEntities: entitiesList.length,
        conceptsCount: entitiesList.filter((e) => e.kind === 'concept').length,
        axesCount: entitiesList.filter((e) => e.kind === 'axis').length,
        leavesCount: entitiesList.filter((e) => e.kind === 'leaf' || !e.kind).length,
        tripletsCount: triplets.length
      }
    });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const action = body.action || 'add_triplet';

  try {
    if (action === 'add_triplet') {
      const { subject, predicate, object, rationale, subjectTitle, objectTitle } = body;
      if (!subject || !predicate || !object) {
        return json(
          { error: 'Les champs subject (Sujet), predicate (Verbe) et object (Complément) sont requis.' },
          { status: 400 }
        );
      }
      if (!ALLOWED_PREDICATES.includes(predicate)) {
        return json(
          { error: `Verbe de relation invalide : ${predicate}. Valeurs autorisées : ${ALLOWED_PREDICATES.join(', ')}` },
          { status: 400 }
        );
      }

      const { triplet, catalog } = await addOntologyTriplet({
        subject,
        predicate,
        object,
        rationale,
        subjectTitle,
        objectTitle
      });

      return json({
        success: true,
        triplet,
        catalog,
        message: `Triplet { ${subject}, ${predicate}, ${object} } enregistré dans l'ontologie.`
      });
    }

    if (action === 'upsert_entity') {
      const { urn, title, kind, domain, keywords, oracle_rules, projections } = body;
      if (!urn) {
        return json({ error: 'Le champ urn est obligatoire.' }, { status: 400 });
      }
      const catalog = await upsertOntologyEntity({
        urn,
        revision: body.revision ?? 1,
        kind: kind || 'leaf',
        title: title || urn,
        domain: domain || 'architecture',
        keywords: Array.isArray(keywords) ? keywords : [],
        oracle_rules: Array.isArray(oracle_rules) ? oracle_rules : [],
        projections: projections || {}
      });

      return json({
        success: true,
        catalog,
        message: `Entité d'ontologie ${urn} mise à jour.`
      });
    }

    if (action === 'reset_overlay') {
      resetRuntimeOntologyOverlay();
      const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
      return json({
        success: true,
        catalog,
        message: 'Modifications dynamiques réinitialisées.'
      });
    }

    return json({ error: `Action non reconnue : ${action}` }, { status: 400 });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ url, request }) => {
  try {
    let tripletId = url.searchParams.get('id');
    if (!tripletId) {
      const body = await request.json().catch(() => ({}));
      tripletId = body.id;
    }
    if (!tripletId) {
      return json({ error: 'Identifiant du triplet (id) requis.' }, { status: 400 });
    }

    const catalog = await removeOntologyTriplet(tripletId);
    return json({
      success: true,
      catalog,
      message: `Triplet ${tripletId} supprimé.`
    });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
};
