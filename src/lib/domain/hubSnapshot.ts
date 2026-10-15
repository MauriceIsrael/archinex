/**
 * Instantané d'engagement émis par le Hub (K11, schéma `engagement_snapshot` 1.7, contrat 1.31).
 *
 * Archinex le LIT : le Hub est l'émetteur unique de l'instantané d'un projet basculé. On ne le re-scelle pas et on ne le
 * complète pas. La lecture vérifie le sceau (même profil canonical-json v1 que le Hub) avant toute utilisation, et ne
 * produit rien d'un instantané altéré.
 */

import { canonicalJson } from './canonicalJson';
import { universalSha256 } from '$lib/validation/epistemicEnvelope';

export type HubDispositionValue = 'deliberated' | 'evacuated' | 'clarification_needed';

export interface HubSnapshotDisposition {
	value: HubDispositionValue;
	reason: string;
	status: 'proposed' | 'active';
	assertion_level: 'asserted' | 'proposed';
	author: string;
	validated_by: string;
	validated_at: string;
}

export interface HubSnapshotRequirement {
	id: string;
	text: string;
	section: string;
	category: string;
	criticality: string;
	status: string;
	disposition?: HubSnapshotDisposition;
}

export interface HubSnapshotSubject {
	id: string;
	name: string;
	definition: string;
	maturity: string;
	origin: string;
	requirement_ids?: string[];
}

export interface HubSnapshotDecision {
	id: string;
	subject: string;
	decision: string;
	rationale: string;
	status: string;
	assertion_level: string;
	author: string;
	validated_by: string;
	validated_at: string;
}

/**
 * Couverture exigence → contrôle calculée par le Hub (K17, contrat 1.31) : DÉCLARATIVE, jamais une vérification.
 * `allocated` : une décision affirmée cite le contrôle ou un actif qui le met en œuvre ; `proposed` : seule une décision proposée
 * le fait ; `uncovered` : aucune. Un contrôle que la base épinglée ne connaît pas figure dans `unresolved`, il n'est pas inventé.
 */
export type HubComplianceStatus = 'allocated' | 'proposed' | 'uncovered';

export interface HubSnapshotComplianceItem {
	requirement_id: string;
	control_id: string;
	framework: string;
	severity: string;
	status: HubComplianceStatus;
	decisions: string[];
	assets: string[];
}

export interface HubSnapshotCompliance {
	origin: 'knowledge-hub';
	kb_snapshot: { snapshot_id: string; checksum: string } | null;
	items: HubSnapshotComplianceItem[];
	unresolved: Array<{ requirement_id: string; control_id: string }>;
}

export interface HubSnapshotGap {
	id: string;
	kind: string;
	description: string;
	subject: string;
	blocking: boolean;
}

export interface HubEngagementSnapshot {
	schemaVersion: string;
	snapshotId: string;
	sourceSystem: string;
	emitter: string;
	createdAt: string;
	sourceRevision: string;
	checksum: string;
	data: {
		engagement: { id: string; confidentiality: string };
		is_provisional: boolean;
		provisional_reasons: { unripe_subjects: number; open_conflicts: number };
		requirements: HubSnapshotRequirement[];
		subjects: HubSnapshotSubject[];
		decisions: HubSnapshotDecision[];
		gaps: HubSnapshotGap[];
		/** Présente dans les instantanés 1.7 (contrat 1.31) ; absente des plus anciens. */
		compliance?: HubSnapshotCompliance;
		[other: string]: unknown;
	};
}

export class HubSnapshotRejectedError extends Error {
	constructor(readonly problems: string[]) {
		super(`Instantané du Hub refusé (${problems.length} problème(s)) : ${problems.slice(0, 3).join(' ; ')}`);
		this.name = 'HubSnapshotRejectedError';
	}
}

/** Problèmes de forme et de sceau d'un instantané reçu du Hub. Liste vide : on peut s'en servir. */
export function hubSnapshotProblems(env: unknown): string[] {
	const out: string[] = [];
	const e = env as Partial<HubEngagementSnapshot> | null;
	if (!e || typeof e !== 'object') return ['l\'instantané n\'est pas un objet'];
	if (e.emitter !== 'knowledge-hub' || e.sourceSystem !== 'knowledge-hub') out.push('l\'émetteur n\'est pas le Hub');
	if (typeof e.schemaVersion !== 'string' || !/^1\.\d+$/.test(e.schemaVersion)) out.push('schemaVersion absent ou inattendu');
	const d = e.data;
	if (!d || typeof d !== 'object') return [...out, 'data absent'];
	for (const key of ['requirements', 'subjects', 'decisions', 'gaps'] as const) {
		if (!Array.isArray(d[key])) out.push(`data.${key} n'est pas une liste`);
	}
	if (!d.engagement?.id) out.push('data.engagement.id absent');
	if (out.length > 0) return out;

	const expected = `sha256:${universalSha256(canonicalJson(d))}`;
	if (e.checksum !== expected) out.push('le sceau ne correspond pas au contenu (checksum)');
	else if (e.snapshotId !== `eng-${d.engagement.id}-${expected.slice('sha256:'.length, 'sha256:'.length + 12)}`) {
		out.push('l\'identifiant de l\'instantané ne dérive pas de son sceau');
	}
	// Le Hub ne vérifie rien (D2) : une couverture « vérifiée », ou d'une autre origine que le Hub, n'est pas de lui.
	// Un instantané plus ancien n'a pas cette section : ce n'est pas un défaut.
	const compliance = d.compliance;
	if (compliance !== undefined) {
		if (!compliance || typeof compliance !== 'object' || !Array.isArray(compliance.items)) {
			out.push('data.compliance n\'a pas la forme {origin, kb_snapshot, items, unresolved}');
		} else {
			if (compliance.origin !== 'knowledge-hub') out.push(`conformité : origine « ${String(compliance.origin)} » inattendue (le Hub seul l\'émet)`);
			for (const item of compliance.items) {
				if (!['allocated', 'proposed', 'uncovered'].includes(item.status)) {
					out.push(`conformité ${item.requirement_id} → ${item.control_id} : statut « ${String(item.status)} » inattendu (le Hub ne vérifie rien)`);
				}
			}
		}
	}
	// Le Hub ne livre jamais d'adresse e-mail : s'il y en a une, l'instantané n'est pas celui qu'il a émis.
	if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/.test(JSON.stringify(d))) out.push('une adresse e-mail figure dans l\'instantané');
	return out;
}

/** L'instantané, ou une exception : on ne rend jamais un contenu non vérifié. */
export function requireVerifiedHubSnapshot(env: unknown): HubEngagementSnapshot {
	const problems = hubSnapshotProblems(env);
	if (problems.length > 0) throw new HubSnapshotRejectedError(problems);
	return env as HubEngagementSnapshot;
}
