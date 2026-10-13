/**
 * Matrice de traçabilité des exigences, générée à partir du dossier scellé et de lui seul.
 *
 * Sert de preuve de la chaîne « JSON scellé → document » : fonction pure, sans horloge, sans accès à la base.
 * Même dossier, mêmes octets. Un dossier qui échoue à la vérification est refusé : on ne produit pas de document
 * à partir d'un artefact altéré ou incohérent.
 */

import type { EngagementBundle } from './engagementBundle';
import { verifyEngagementBundle } from './bundleVerifier';
import { renderTraceabilityView, viewFromBundle } from './traceability';

export class BundleRejectedError extends Error {
	constructor(readonly problems: Array<{ code: string; message: string }>) {
		super(`Dossier refusé par le vérificateur (${problems.length} problème(s)) : ${problems.slice(0, 3).map((p) => p.code).join(', ')}`);
		this.name = 'BundleRejectedError';
	}
}

export function renderTraceabilityMatrix(bundle: EngagementBundle): string {
	const problems = verifyEngagementBundle(bundle);
	if (problems.length > 0) throw new BundleRejectedError(problems);
	return renderTraceabilityView(viewFromBundle(bundle));
}
