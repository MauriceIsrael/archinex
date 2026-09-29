/**
 * Domaine de Découpage & Partitionnement des Sujets par Parties / Lots d'Architecture
 * Permet de segmenter les grands cahiers des charges et corpus complexes en unités de délibération digestes.
 */

import type { MaturitySubject } from './maturityBoard';
import type { ArchitectRole } from '$lib/types/epistemic';

export interface SubjectPart {
	id: string;
	partNumber: number;
	name: string;
	code: string;
	description: string;
	sectionRange: string;
	leadRole: ArchitectRole;
	subjects: MaturitySubject[];
	metrics: {
		totalCount: number;
		decidedCount: number; // L3, L4, L5
		debatingCount: number; // L2
		framedCount: number; // L1
		namedCount: number; // L0
		blockingCount: number;
		unlocksCount: number;
		maturityRate: number; // 0 to 100%
		status: 'completed' | 'in_progress' | 'blocked' | 'unstarted';
	};
}

/**
 * Noms et thématiques par défaut pour les parties déduites des sections
 */
const DEFAULT_PART_METADATA: Record<number, { name: string; code: string; role: ArchitectRole; desc: string }> = {
	1: {
		name: 'Cadrage Stratégique, Souveraineté & Gouvernance',
		code: 'LOT-01-SOUV',
		role: 'lead_architect',
		desc: 'Principes directeurs, conformité doctrinale, immunité juridique et gouvernance globale'
	},
	2: {
		name: 'Socle d\'Infrastructure, Calcul & Résilience',
		code: 'LOT-02-INFRA',
		role: 'infra_expert_architect',
		desc: 'Plateforme matérielle, virtualisation, dimensionnement N+1 et redondance datacenter'
	},
	3: {
		name: 'Réseau, Synchronisation & Cœur de Système',
		code: 'LOT-03-TELCO',
		role: 'infra_expert_architect',
		desc: 'Synchronisation de phase G.8275.1, holdover, interfaces réseau CNI/SR-IOV et routage'
	},
	4: {
		name: 'Cybersécurité, Zero-Trust & Homologation',
		code: 'LOT-04-SECOPS',
		role: 'security_architect',
		desc: 'Conformité NIS2, chiffrement au repos/transit, gestion des secrets et cloisonnement'
	},
	5: {
		name: 'Exploitation, Observabilité & Télémétrie',
		code: 'LOT-05-OPS',
		role: 'lead_architect',
		desc: 'Supervision air-gapped, alertes temps-réel, intégration GitOps et maintien en condition opérationnelle'
	},
	6: {
		name: 'Services Métiers & Intégration Client',
		code: 'LOT-06-APPS',
		role: 'domain_architect',
		desc: 'Applications verticales, terminaux durcis, protocoles applicatifs et interfaces utilisateurs'
	}
};

/**
 * Extrait le numéro de partie / chapitre à partir de la référence de section (ex: "§4.2" -> 4)
 */
export function extractPartNumberFromSection(sectionRef: string): number {
	const match = sectionRef.match(/(?:§|art\.?\s*|lot\s*|partie\s*)?(\d+)/i);
	if (match && match[1]) {
		const num = parseInt(match[1], 10);
		if (!isNaN(num) && num > 0) return num;
	}
	return 1;
}

/**
 * Calcule les métriques consolidées d'une partie de sujets
 */
export function computePartMetrics(subjects: MaturitySubject[]): SubjectPart['metrics'] {
	const totalCount = subjects.length;
	if (totalCount === 0) {
		return {
			totalCount: 0,
			decidedCount: 0,
			debatingCount: 0,
			framedCount: 0,
			namedCount: 0,
			blockingCount: 0,
			unlocksCount: 0,
			maturityRate: 0,
			status: 'unstarted'
		};
	}

	let decidedCount = 0;
	let debatingCount = 0;
	let framedCount = 0;
	let namedCount = 0;
	let blockingCount = 0;
	let unlocksCount = 0;

	for (const s of subjects) {
		blockingCount += s.blocking_count || 0;
		unlocksCount += s.unlocks_count || 0;

		switch (s.level) {
			case 'L3_decided':
			case 'L4_specified':
			case 'L5_archived':
				decidedCount++;
				break;
			case 'L2_decomposed':
				debatingCount++;
				break;
			case 'L1_framed':
				framedCount++;
				break;
			case 'L0_named':
			default:
				namedCount++;
				break;
		}
	}

	const maturityRate = Math.round((decidedCount / totalCount) * 100);

	let status: SubjectPart['metrics']['status'] = 'in_progress';
	if (decidedCount === totalCount) {
		status = 'completed';
	} else if (blockingCount > 0) {
		status = 'blocked';
	} else if (decidedCount === 0 && debatingCount === 0) {
		status = 'unstarted';
	}

	return {
		totalCount,
		decidedCount,
		debatingCount,
		framedCount,
		namedCount,
		blockingCount,
		unlocksCount,
		maturityRate,
		status
	};
}

/**
 * Découpe un ensemble plat de sujets de maturité en Parties / Lots ordonnés
 */
export function partitionSubjectsByParts(subjects: MaturitySubject[]): SubjectPart[] {
	if (!subjects || subjects.length === 0) {
		return [];
	}

	// Regrouper par numéro de partie extrait de la section
	const groups = new Map<number, MaturitySubject[]>();

	for (const sub of subjects) {
		const partNum = extractPartNumberFromSection(sub.section_ref || '§1.0');
		if (!groups.has(partNum)) {
			groups.set(partNum, []);
		}
		groups.get(partNum)!.push(sub);
	}

	// Si tout se retrouve dans une seule partie et qu'il y a plus de 10 sujets,
	// découper par tranches de 8 sujets pour préserver l'ergonomie
	if (groups.size === 1 && subjects.length > 10) {
		groups.clear();
		const chunkSize = 8;
		for (let i = 0; i < subjects.length; i++) {
			const partIndex = Math.floor(i / chunkSize) + 1;
			if (!groups.has(partIndex)) {
				groups.set(partIndex, []);
			}
			groups.get(partIndex)!.push(subjects[i]);
		}
	}

	const sortedPartNumbers = Array.from(groups.keys()).sort((a, b) => a - b);

	return sortedPartNumbers.map((num) => {
		const partSubjects = groups.get(num) || [];
		const meta = DEFAULT_PART_METADATA[num] || {
			name: `Lot ${num} · Exigences & Sous-système ${num}`,
			code: `LOT-${String(num).padStart(2, '0')}`,
			role: partSubjects[0]?.waiting_for_role || 'lead_architect',
			desc: `Ensemble des sujets d'architecture rattachés au chapitre §${num}`
		};

		// Déterminer la plage de sections (ex: §3.1 - §3.4)
		const sectionRefs = partSubjects.map((s) => s.section_ref).filter(Boolean);
		const sectionRange = sectionRefs.length > 1
			? `${sectionRefs[0]} → ${sectionRefs[sectionRefs.length - 1]}`
			: sectionRefs[0] || `§${num}.x`;

		// Rôle prépondérant parmi les sujets de la partie
		const roleCounts = new Map<ArchitectRole, number>();
		for (const s of partSubjects) {
			if (s.waiting_for_role) {
				roleCounts.set(s.waiting_for_role, (roleCounts.get(s.waiting_for_role) || 0) + 1);
			}
		}
		let dominantRole = meta.role;
		let maxRoleCount = 0;
		for (const [r, count] of roleCounts.entries()) {
			if (count > maxRoleCount) {
				dominantRole = r;
				maxRoleCount = count;
			}
		}

		return {
			id: `part-${num}`,
			partNumber: num,
			name: meta.name,
			code: meta.code,
			description: meta.desc,
			sectionRange,
			leadRole: dominantRole,
			subjects: partSubjects,
			metrics: computePartMetrics(partSubjects)
		};
	});
}
