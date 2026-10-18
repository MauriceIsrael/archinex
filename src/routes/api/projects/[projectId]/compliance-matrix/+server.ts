import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { exportEngagementBundle } from '$lib/server/bundleExportService';
import { sanitizeHandle } from '$lib/domain/bundleAssembly';
import { BundleRejectedError } from '$lib/domain/bundleRtm';
import {
	buildComplianceMatrix,
	renderComplianceMatrixMarkdown,
	renderComplianceMatrixCsv
} from '$lib/domain/complianceMatrix';
import type { ConfidentialityLevel } from '$lib/domain/engagementBundle';

const LEVELS: ConfidentialityLevel[] = ['public', 'internal', 'confidential', 'secret'];

/**
 * Matrice de conformité de base (Compliant / Partially compliant / Non-compliant / Provisional)
 * produite à partir du dossier d'engagement scellé d'Archinex.
 *
 * Formats supportés via ?format= :
 * - markdown (défaut) : document textuel opposable
 * - csv : tableur RFC 4180 avec BOM UTF-8
 * - json : structure typée pour l'API et le client
 */
export const GET: RequestHandler = async (event) => {
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;
	const session = auth.session!;

	try {
		const confidentialityParam = event.url.searchParams.get('confidentiality') as ConfidentialityLevel | null;
		const confidentiality: ConfidentialityLevel =
			confidentialityParam && LEVELS.includes(confidentialityParam)
				? confidentialityParam
				: 'internal';

		const { bundle } = await exportEngagementBundle({
			projectId: event.params.projectId,
			confidentiality,
			actorHandle: sanitizeHandle(session.user.email)
		});

		const matrix = buildComplianceMatrix(bundle);
		const format = event.url.searchParams.get('format') || 'markdown';

		if (format === 'csv') {
			return new Response(renderComplianceMatrixCsv(matrix), {
				headers: {
					'Content-Type': 'text/csv; charset=utf-8',
					'Content-Disposition': `attachment; filename="matrice-conformite-${matrix.snapshotId || 'export'}.csv"`,
					'X-Snapshot-Id': bundle.snapshotId
				}
			});
		}

		if (format === 'json') {
			return json({
				status: 'ok',
				matrix
			});
		}

		return new Response(renderComplianceMatrixMarkdown(matrix), {
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				'X-Snapshot-Id': bundle.snapshotId
			}
		});
	} catch (e) {
		if (e instanceof BundleRejectedError) {
			return json({ status: 'error', error: e.message }, { status: 422 });
		}
		const message = e instanceof Error ? e.message : String(e);
		if (message.startsWith('BUNDLE_VERIFICATION_FAILED')) {
			return json({ status: 'error', error: message }, { status: 422 });
		}
		return json({ status: 'error', error: message }, { status: 500 });
	}
};

