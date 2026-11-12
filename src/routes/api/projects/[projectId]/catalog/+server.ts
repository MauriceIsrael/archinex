import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  lintBaseComponentNoHardcodedEnv,
  validateComponentAgainstCatalogs,
  type EnvironmentOverlay,
  type LogicalComponent
} from '$lib/domain/edp/componentCatalog';
import {
  buildReferenceGraph,
  resolveComponentInstance,
  simulateWhatIfDatacenters
} from '$lib/domain/edp/refResolver';
import {
  composeProjectLogicalTopology,
  summarizeWhatIfComparison
} from '$lib/domain/edp/logicalViews';
import {
  loadProjectComponentCatalog,
  saveProjectComponentCatalog,
  upsertCatalogComponent,
  upsertEnvironmentOverlay
} from '$lib/server/edp/componentCatalogRepository';

export const GET: RequestHandler = async ({ params, url }) => {
  const projectId = params.projectId || 'default';
  const env = url.searchParams.get('env') || 'prod';
  const bundle = loadProjectComponentCatalog(projectId);

  const overlay =
    bundle.overlays.find((o) => o.metadata.environment === env) || bundle.overlays[0];

  const dcs = overlay?.spec.datacenters || ['dc1', 'dc2'];
  const resolvedInstances = dcs.flatMap((dc) =>
    bundle.components
      .filter((c) => !c.metadata.external && c.metadata.status !== 'inactive')
      .map((c) => resolveComponentInstance(c, overlay, dc, bundle.catalogs))
  );

  const topology = composeProjectLogicalTopology(
    projectId,
    env,
    dcs,
    bundle.components,
    resolvedInstances
  );

  const whatIfScenarios = summarizeWhatIfComparison(
    simulateWhatIfDatacenters(bundle.components, overlay, [2, 3], bundle.catalogs)
  );

  const referenceGraph = buildReferenceGraph(bundle.components);

  return json({
    success: true,
    bundle,
    topology,
    whatIfScenarios,
    referenceGraph
  });
};

export const POST: RequestHandler = async ({ params, request }) => {
  const projectId = params.projectId || 'default';
  const body = (await request.json()) as Record<string, any>;
  const action = String(body.action || '');

  if (action === 'upsert_component') {
    const component = body.component as LogicalComponent;
    if (!component?.metadata?.name) {
      return json({ success: false, error: 'Composant invalide : metadata.name requis.' }, { status: 400 });
    }
    const bundle = loadProjectComponentCatalog(projectId);
    const lintIssues = [
      ...lintBaseComponentNoHardcodedEnv(component),
      ...validateComponentAgainstCatalogs(component, bundle.catalogs)
    ];
    if (lintIssues.length > 0) {
      return json({ success: false, error: 'Erreurs de validation du composant', lintIssues }, { status: 422 });
    }
    const updated = upsertCatalogComponent(projectId, component);
    return json({ success: true, bundle: updated });
  }

  if (action === 'upsert_overlay') {
    const overlay = body.overlay as EnvironmentOverlay;
    if (!overlay?.metadata?.environment) {
      return json({ success: false, error: 'Overlay invalide : metadata.environment requis.' }, { status: 400 });
    }
    const updated = upsertEnvironmentOverlay(projectId, overlay);
    return json({ success: true, bundle: updated });
  }

  if (action === 'import_bundle') {
    if (!body.bundle?.components || !body.bundle?.overlays) {
      return json({ success: false, error: 'Bundle JSON invalide (components et overlays requis).' }, { status: 400 });
    }
    const current = loadProjectComponentCatalog(projectId);
    const saved = saveProjectComponentCatalog(projectId, {
      catalogs: body.bundle.catalogs || current.catalogs,
      components: body.bundle.components,
      overlays: body.bundle.overlays
    });
    return json({ success: true, bundle: saved });
  }

  return json({ success: false, error: `Action catalogue inconnue : '${action}'` }, { status: 400 });
};
