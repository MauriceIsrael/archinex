import type { Argument } from '$lib/domain/debate';
import type {
	Criterion,
	Option,
	OptionEvaluation,
	TradeOff,
	Decision
} from '$lib/domain/options';
import type { CascadeResult, DiscoveryTreeData } from '$lib/domain/cascade';
import type { MaturityTransitionsReport } from '$lib/domain/maturityCriteria';
import type { SubjectRequirementItem } from '../SubjectRequirementsDrawer.svelte';

export type UnifiedWorkspaceTab = 'thread' | 'matrix' | 'kb' | 'cascade';

export interface SubjectSessionUser {
	id: string;
	email: string;
	name?: string;
	role?: string;
}

export interface SubjectDoctrineItem {
	id: string;
	type: string;
	title: string;
	status?: string;
	confidence?: string;
	excerpt?: string;
	source_ref?: string;
	relevance?: number;
	framework?: string;
	required?: boolean;
	relevant?: boolean;
	relevance_method?: string;
}

export interface CachedWorkbench {
	singleOptionRationale: string | null;
	arguments: Argument[];
	options: Option[];
	criteria: Criterion[];
	evaluations: OptionEvaluation[];
	tradeOffs: TradeOff[];
	decision: Decision | null;
	criteriaReport: MaturityTransitionsReport | null;
	requirements: SubjectRequirementItem[];
	requirementsUnresolvedRefs: string[];
	requirementsDossierPresent: boolean;
}

export interface CachedCascade {
	cascade: CascadeResult | null;
	treeSeries: any[];
	discoveryTree: DiscoveryTreeData | null;
	foundationContested: boolean;
	contestationReason?: string;
}

export interface CachedDoctrine {
	allowedKbRefs: string[];
	items: SubjectDoctrineItem[];
}

export function buildDetailedSpecTemplate(
	subjectDecision: Decision | null,
	subjectOptions: Option[]
): string {
	const retainedOpt = subjectOptions.find((o) => o.id === subjectDecision?.retainedOptionId);
	const optTitle =
		retainedOpt?.title || subjectDecision?.retainedOptionId || "Option d'architecture retenue";
	const optSummary = retainedOpt?.summary || '';
	const rationale = subjectDecision?.rationale || '';
	const reversibility = subjectDecision?.reversibility || 'reversible';
	const compliance = subjectDecision?.complianceStatus || 'Compliant';

	return `## 1. Contexte & Choix d'Architecture Validé (Socle L3)
- **Option retenue** : ${optTitle}
- **Motivation d'arbitrage** : ${rationale}
- **Réversibilité & Conformité** : ${reversibility} · ${compliance}

## 2. Décomposition des Composants & Architecture Cible
- **Composant principal** : ${optTitle}
- **Rôle fonctionnel & principes clés** : ${optSummary}

## 3. Interfaces, Protocoles & Matrice de Flux
- **Chiffrement & Sécurité** : Chiffrement matériel / logique de bout en bout (suites cryptographiques fortes).
- **Médiation & Contrôle** : Passerelle dédiée de médiation pour l'isolation et la conformité aux exigences réglementaires.
- **Séparation des zones** : Cloisonnement strict entre le périmètre du projet et les tiers.

## 4. Exploitation, Supervision & Points de Vigilance
- **Supervision NOC** : Sondes de télémétrie temps réel et alertes d'intégrité opérationnelle.
- **Haute Disponibilité** : Résilience et bascule automatique sans rupture de service.
`;
}

export async function patchSubjectWithRetry(
	projectId: string,
	subjectId: string,
	payload: Record<string, unknown>
): Promise<Response> {
	const url = `/api/projects/${projectId}/subjects/${subjectId}`;
	const current = await fetch(url)
		.then((r) => (r.ok ? r.json() : null))
		.catch(() => null);
	const send = (expectedVersion: number) =>
		fetch(url, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...payload, expectedVersion })
		});
	let res = await send(current?.subject?.version ?? 1);
	if (res.status === 409) {
		const conflict = await res.clone().json().catch(() => ({}));
		if (typeof conflict.currentVersion === 'number') res = await send(conflict.currentVersion);
	}
	return res;
}
