import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  createEmergentLogicalComponent,
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
  summarizeSylvaTwinProfiles,
  summarizeWhatIfComparison
} from '$lib/domain/edp/logicalViews';
import {
  runSylvaDigitalTwinMatrix,
  type SylvaTopologyProfileId,
  type TwinArbitrationMode
} from '$lib/domain/edp/sylvaTwin';
import {
  loadProjectComponentCatalog,
  saveProjectComponentCatalog,
  upsertCatalogComponent,
  upsertEnvironmentOverlay
} from '$lib/server/edp/componentCatalogRepository';
import { buildProjectCompletenessLedger } from '$lib/server/edp/decisionSlotRegistry';
import { loadProjectHydrationContextFromDb } from '$lib/server/edp/projectHydrationContext';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';

export const GET: RequestHandler = async (event) => {
  const { params, url } = event;
  const projectId = params.projectId || 'default';
  const auth = await authorizeProjectAccess(event, projectId);
  if (auth.error) return auth.error;
  const env = url.searchParams.get('env') || 'prod';
  const modeParam = (url.searchParams.get('mode') || 'proposal') as TwinArbitrationMode;
  const mandatedProfileParam = (url.searchParams.get('mandatedProfile') ||
    '2dc-split') as SylvaTopologyProfileId;
  const includeReferenceCatalog = url.searchParams.get('includeReferenceCatalog') === 'true';
  const bundle = loadProjectComponentCatalog(projectId, {
    includeDefaultComponents: includeReferenceCatalog
  });

  // Hydrater la vue topologique à partir du catalogue projet + des composants actifs issus du ledger
  let effectiveComponents = bundle.components;
  if (!includeReferenceCatalog) {
    try {
      const dbContext = await loadProjectHydrationContextFromDb(projectId, auth.project?.title);
      const ledger = await buildProjectCompletenessLedger({
        ...dbContext,
        projectId,
        projectTitle: auth.project?.title
      });
      const byName = new Map<string, LogicalComponent>();
      for (const comp of bundle.components) {
        byName.set(comp.metadata.name, comp);
      }
      for (const comp of ledger.activeCatalog) {
        if (!byName.has(comp.metadata.name)) {
          byName.set(comp.metadata.name, comp);
        }
      }
      effectiveComponents = Array.from(byName.values());
    } catch {
      // Non bloquant : repli sur bundle.components uniquement
    }
  }

  const effectiveBundle = {
    ...bundle,
    components: effectiveComponents
  };

  const overlay =
    effectiveBundle.overlays.find((o) => o.metadata.environment === env) || effectiveBundle.overlays[0];

  const dcs = overlay?.spec.datacenters || ['dc1', 'dc2', 'dc3'];
  const resolvedInstances = dcs.flatMap((dc) =>
    effectiveComponents
      .filter((c) => !c.metadata.external && c.metadata.status !== 'inactive')
      .map((c) => resolveComponentInstance(c, overlay, dc, effectiveBundle.catalogs))
  );

  const topology = composeProjectLogicalTopology(
    projectId,
    env,
    dcs,
    effectiveComponents,
    resolvedInstances
  );

  const whatIfScenarios = summarizeWhatIfComparison(
    simulateWhatIfDatacenters(effectiveComponents, overlay, [2, 3], effectiveBundle.catalogs)
  );

  const sylvaTwinReport = runSylvaDigitalTwinMatrix({
    components: effectiveComponents,
    overlay,
    catalogs: effectiveBundle.catalogs,
    governance: {
      mode: modeParam === 'client-mandated' ? 'client-mandated' : 'proposal',
      mandatedProfileId: mandatedProfileParam
    }
  });

  const sylvaTwinProfiles = summarizeSylvaTwinProfiles(sylvaTwinReport);

  const referenceGraph = buildReferenceGraph(effectiveComponents);

  return json({
    success: true,
    hydrationScope: includeReferenceCatalog ? 'reference' : 'hydrated',
    bundle: effectiveBundle,
    topology,
    whatIfScenarios,
    sylvaTwinReport,
    sylvaTwinProfiles,
    referenceGraph
  });
};

const CATALOG_POST_HANDLERS: Record<
  string,
  (projectId: string, body: Record<string, any>) => Response
> = {
  upsert_component: (projectId, body) => {
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
  },
  instantiate_emergent_component: (projectId, body) => {
    const rawName = String(body.name || '').trim();
    if (!rawName) {
      return json({ success: false, error: 'Nom du composant émergent requis.' }, { status: 400 });
    }
    const comp = createEmergentLogicalComponent(rawName, body.displayName ? String(body.displayName) : undefined);
    const updated = upsertCatalogComponent(projectId, comp);
    return json({ success: true, component: comp, bundle: updated });
  },
  upsert_overlay: (projectId, body) => {
    const overlay = body.overlay as EnvironmentOverlay;
    if (!overlay?.metadata?.environment) {
      return json({ success: false, error: 'Overlay invalide : metadata.environment requis.' }, { status: 400 });
    }
    const updated = upsertEnvironmentOverlay(projectId, overlay);
    return json({ success: true, bundle: updated });
  },
  import_bundle: (projectId, body) => {
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
};

export const POST: RequestHandler = async (event) => {
  const { params, request } = event;
  const projectId = params.projectId || 'default';
  const auth = await authorizeProjectAccess(event, projectId);
  if (auth.error) return auth.error;
  const body = (await request.json()) as Record<string, any>;
  const action = String(body.action || '');
  const handler = CATALOG_POST_HANDLERS[action];
  if (!handler) {
    return json({ success: false, error: `Action catalogue inconnue : '${action}'` }, { status: 400 });
  }
  return handler(projectId, body);
};
