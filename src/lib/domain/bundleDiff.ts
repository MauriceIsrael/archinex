import type { EngagementBundle, AssertionLevel } from './engagementBundle';

export interface DiffItem {
	collection: string;
	id: string;
	titleOrText: string;
	changeType: 'added' | 'removed' | 'modified';
	details?: string;
}

export interface AssertionRegression {
	collection: string;
	id: string;
	titleOrText: string;
	previousLevel: AssertionLevel;
	newLevel: AssertionLevel;
	warning: string;
}

export interface BundleDiff {
	identical: boolean;
	snapshotA: {
		id: string;
		checksum: string;
		isProvisional: boolean;
	};
	snapshotB: {
		id: string;
		checksum: string;
		isProvisional: boolean;
	};
	added: DiffItem[];
	removed: DiffItem[];
	modified: DiffItem[];
	regressions: AssertionRegression[];
}

/**
 * Calcule la différence déterministe entre deux dossiers d'engagement scellés (A19).
 * Détecte les ajouts, suppressions, modifications et signale avec force les régressions
 * de niveau d'affirmation (par exemple un élément 'asserted' rétrogradé en 'proposed').
 */
export function diffEngagementBundles(
	bundleA: EngagementBundle,
	bundleB: EngagementBundle
): BundleDiff {
	const dataA = bundleA.data;
	const dataB = bundleB.data;

	const added: DiffItem[] = [];
	const removed: DiffItem[] = [];
	const modified: DiffItem[] = [];
	const regressions: AssertionRegression[] = [];

	type GenericItem = {
		id: string;
		title?: string;
		text?: string;
		decision?: string;
		assertion_level?: AssertionLevel;
		epistemic_status?: string;
		maturity?: string;
		status?: string;
	};

	function compareCollections(
		name: string,
		itemsA: GenericItem[],
		itemsB: GenericItem[]
	) {
		const mapA = new Map(itemsA.map((it) => [it.id, it]));
		const mapB = new Map(itemsB.map((it) => [it.id, it]));

		// Détection des ajouts
		for (const [id, itemB] of mapB.entries()) {
			const label = itemB.title || itemB.decision || itemB.text || id;
			if (!mapA.has(id)) {
				added.push({
					collection: name,
					id,
					titleOrText: label,
					changeType: 'added',
					details: `Élément ajouté dans ${name}`
				});
			} else {
				// Détection des modifications
				const itemA = mapA.get(id)!;
				const levelA = itemA.assertion_level;
				const levelB = itemB.assertion_level;

				// Alerte de régression : asserted -> proposed / assumption
				if (levelA === 'asserted' && (levelB === 'proposed' || levelB === 'assumption' || levelB === 'open')) {
					regressions.push({
						collection: name,
						id,
						titleOrText: label,
						previousLevel: levelA,
						newLevel: levelB,
						warning: `RÉGRESSION ÉPISTÉMIQUE : L élément ${id} préalablement affirmé a régressé vers '${levelB}'.`
					});
				}

				const isDifferent =
					itemA.status !== itemB.status ||
					itemA.maturity !== itemB.maturity ||
					itemA.epistemic_status !== itemB.epistemic_status ||
					levelA !== levelB ||
					itemA.decision !== itemB.decision ||
					itemA.text !== itemB.text;

				if (isDifferent) {
					modified.push({
						collection: name,
						id,
						titleOrText: label,
						changeType: 'modified',
						details: `Statut (${itemA.status ?? ''} -> ${itemB.status ?? ''}), Niveau (${levelA ?? ''} -> ${levelB ?? ''})`
					});
				}
			}
		}

		// Détection des suppressions
		for (const [id, itemA] of mapA.entries()) {
			if (!mapB.has(id)) {
				const label = itemA.title || itemA.decision || itemA.text || id;
				removed.push({
					collection: name,
					id,
					titleOrText: label,
					changeType: 'removed',
					details: `Élément supprimé de ${name}`
				});
			}
		}
	}

	compareCollections('subjects', dataA.subjects || [], dataB.subjects || []);
	compareCollections('decisions', dataA.decisions || [], dataB.decisions || []);
	compareCollections('statements', dataA.statements || [], dataB.statements || []);
	compareCollections('compliance', dataA.compliance || [], dataB.compliance || []);
	compareCollections('gaps', (dataA.gaps as unknown as GenericItem[]) || [], (dataB.gaps as unknown as GenericItem[]) || []);
	compareCollections('conflicts', (dataA.conflicts as unknown as GenericItem[]) || [], (dataB.conflicts as unknown as GenericItem[]) || []);

	const identical =
		bundleA.checksum === bundleB.checksum &&
		added.length === 0 &&
		removed.length === 0 &&
		modified.length === 0 &&
		regressions.length === 0;

	return {
		identical,
		snapshotA: {
			id: bundleA.snapshotId,
			checksum: bundleA.checksum,
			isProvisional: dataA.is_provisional
		},
		snapshotB: {
			id: bundleB.snapshotId,
			checksum: bundleB.checksum,
			isProvisional: dataB.is_provisional
		},
		added,
		removed,
		modified,
		regressions
	};
}
