/**
 * Persistance du Catalogue de Composants & Overlays par Projet (Lot 1 & Lot 3).
 * Séparé de l'ontologie normative : permet l'édition, l'import JSON/YAML et la simulation What-If.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  DEFAULT_COMPONENT_CATALOG,
  DEFAULT_ENVIRONMENT_OVERLAYS,
  DEFAULT_VALUE_CATALOGS,
  type ComponentCatalogBundle,
  type EnvironmentOverlay,
  type LogicalComponent
} from '../../domain/edp/componentCatalog.js';

const CATALOG_DIR = resolve(process.cwd(), '.archinex-catalogs');

function getCatalogPath(projectId: string): string {
  const safeId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return resolve(CATALOG_DIR, `${safeId}.json`);
}

export function getDefaultCatalogBundle(): ComponentCatalogBundle {
  return {
    catalogs: structuredClone(DEFAULT_VALUE_CATALOGS),
    components: structuredClone(DEFAULT_COMPONENT_CATALOG),
    overlays: structuredClone(DEFAULT_ENVIRONMENT_OVERLAYS)
  };
}

export function loadProjectComponentCatalog(projectId: string): ComponentCatalogBundle {
  const filePath = getCatalogPath(projectId);
  if (existsSync(filePath)) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<ComponentCatalogBundle>;
      return {
        catalogs: parsed.catalogs || structuredClone(DEFAULT_VALUE_CATALOGS),
        components: Array.isArray(parsed.components)
          ? parsed.components
          : structuredClone(DEFAULT_COMPONENT_CATALOG),
        overlays: Array.isArray(parsed.overlays)
          ? parsed.overlays
          : structuredClone(DEFAULT_ENVIRONMENT_OVERLAYS)
      };
    } catch {
      return getDefaultCatalogBundle();
    }
  }
  return getDefaultCatalogBundle();
}

export function saveProjectComponentCatalog(
  projectId: string,
  bundle: ComponentCatalogBundle
): ComponentCatalogBundle {
  const filePath = getCatalogPath(projectId);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf-8');
  return bundle;
}

export function upsertCatalogComponent(
  projectId: string,
  component: LogicalComponent
): ComponentCatalogBundle {
  const bundle = loadProjectComponentCatalog(projectId);
  const idx = bundle.components.findIndex((c) => c.metadata.name === component.metadata.name);
  if (idx >= 0) {
    bundle.components[idx] = component;
  } else {
    bundle.components.push(component);
  }
  return saveProjectComponentCatalog(projectId, bundle);
}

export function upsertEnvironmentOverlay(
  projectId: string,
  overlay: EnvironmentOverlay
): ComponentCatalogBundle {
  const bundle = loadProjectComponentCatalog(projectId);
  const idx = bundle.overlays.findIndex(
    (o) => o.metadata.environment === overlay.metadata.environment
  );
  if (idx >= 0) {
    bundle.overlays[idx] = overlay;
  } else {
    bundle.overlays.push(overlay);
  }
  return saveProjectComponentCatalog(projectId, bundle);
}
