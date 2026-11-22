/**
 * Moteur de valorisation BOM / BPU dynamique calculé depuis l'inventaire résolu,
 * la CMDB Planned et le Jumeau Numérique Sylva (Issue #446).
 *
 * Produit des quantitatifs matériels, licences, empreinte physique (U de baie, kW),
 * CAPEX, OPEX annuel, TCO et jours-hommes d'intégration directement exportables vers le BPU financier.
 */

import type { MultiAxisHydratedInventory } from '$lib/server/edp/refinementCoverage';
import type { SylvaTwinArbitrationReport, SylvaTwinModel, SylvaTopologyProfileId } from './sylvaTwin.js';

export interface HardwareUnitRate {
	capexEur: number;
	opexAnnualEur: number;
	rackUnits: number;
	powerWatts: number;
	integrationManDays: number;
}

export interface FinOpsUnitRateCatalog {
	/** Barème par profil matériel (`sriov-dpdk`, `standard-worker`, `witness`, `default`). */
	hardwareByProfile: Record<string, HardwareUnitRate>;
	/** Barème unitaire par composant logique déployé (licence / souscription annuelle + jours d'intégration). */
	softwarePerComponent: {
		capexEur: number;
		opexAnnualEur: number;
		integrationManDays: number;
	};
	/** Barème par zone de sécurité / VRF (ingénierie pare-feu & durcissement). */
	securityZoneIntegrationManDays: number;
	/** Coût journalier moyen (TJM) utilisé pour valoriser l'intégration en euros. */
	integrationDailyRateEur: number;
}

/**
 * Barème de référence par défaut (surchargeable par projet/catalogue commercial).
 * Sert de socle indicatif lorsqu'aucune grille tarifaire projet n'est fournie.
 */
export const DEFAULT_FINOPS_RATE_CARD: FinOpsUnitRateCatalog = {
	hardwareByProfile: {
		'sriov-dpdk': {
			capexEur: 28000,
			opexAnnualEur: 4200,
			rackUnits: 2,
			powerWatts: 750,
			integrationManDays: 3
		},
		'standard-worker': {
			capexEur: 18500,
			opexAnnualEur: 2800,
			rackUnits: 2,
			powerWatts: 550,
			integrationManDays: 2
		},
		witness: {
			capexEur: 6500,
			opexAnnualEur: 1200,
			rackUnits: 1,
			powerWatts: 220,
			integrationManDays: 1.5
		},
		default: {
			capexEur: 20000,
			opexAnnualEur: 3000,
			rackUnits: 2,
			powerWatts: 600,
			integrationManDays: 2
		}
	},
	softwarePerComponent: {
		capexEur: 4500,
		opexAnnualEur: 2400,
		integrationManDays: 4
	},
	securityZoneIntegrationManDays: 2.5,
	integrationDailyRateEur: 950
};

export type BomCategory = 'hardware_compute' | 'hardware_witness' | 'software_component' | 'security_integration';

export interface BomLineItem {
	sku: string;
	category: BomCategory;
	label: string;
	unit: 'node' | 'component' | 'zone';
	quantity: number;
	unitCapexEur: number;
	unitOpexAnnualEur: number;
	totalCapexEur: number;
	totalOpexAnnualEur: number;
	rackUnitsTotal: number;
	powerKwTotal: number;
	buildManDays: number;
}

export interface DynamicBomTotals {
	capexHardwareAndLicenseEur: number;
	buildServicesEur: number;
	capexTotalEur: number;
	opexAnnualEur: number;
	tcoDurationYears: number;
	tcoTotalEur: number;
	buildManDaysTotal: number;
	rackUnitsTotal: number;
	powerKwTotal: number;
}

export interface DynamicBomReport {
	profileId: SylvaTopologyProfileId | 'hydrated-baseline';
	planningStageLabel: 'Planned-Capacity' | 'Planned-Allocated';
	datacentersCount: number;
	lines: BomLineItem[];
	totals: DynamicBomTotals;
}

function resolveHardwareProfileKey(poolOrProfile: string, role?: string): string {
	const text = `${poolOrProfile} ${role || ''}`.toLowerCase();
	if (text.includes('witness')) return 'witness';
	if (text.includes('sriov') || text.includes('dpdk') || text.includes('cnf')) return 'sriov-dpdk';
	if (text.includes('standard') || text.includes('nis2') || text.includes('worker')) return 'standard-worker';
	return 'default';
}

function mergeRates(override?: Partial<FinOpsUnitRateCatalog>): FinOpsUnitRateCatalog {
	if (!override) return DEFAULT_FINOPS_RATE_CARD;
	return {
		hardwareByProfile: {
			...DEFAULT_FINOPS_RATE_CARD.hardwareByProfile,
			...(override.hardwareByProfile ?? {})
		},
		softwarePerComponent: {
			...DEFAULT_FINOPS_RATE_CARD.softwarePerComponent,
			...(override.softwarePerComponent ?? {})
		},
		securityZoneIntegrationManDays:
			override.securityZoneIntegrationManDays ?? DEFAULT_FINOPS_RATE_CARD.securityZoneIntegrationManDays,
		integrationDailyRateEur:
			override.integrationDailyRateEur ?? DEFAULT_FINOPS_RATE_CARD.integrationDailyRateEur
	};
}

/**
 * Calcule la Bill of Materials (BOM) et la valorisation CAPEX / OPEX / TCO / JH
 * depuis l'inventaire hydraté (`MultiAxisHydratedInventory`) et, le cas échéant,
 * un profil du Jumeau Numérique Sylva (`SylvaTwinModel`).
 */
export function computeDynamicBomFromHydration(params: {
	hydrated: MultiAxisHydratedInventory;
	twinModel?: SylvaTwinModel | null;
	rates?: Partial<FinOpsUnitRateCatalog>;
	durationYears?: number;
}): DynamicBomReport {
	const rates = mergeRates(params.rates);
	const durationYears = Math.max(1, params.durationYears ?? 3);
	const lines: BomLineItem[] = [];

	// 1. Matériel : depuis le Jumeau Numérique si fourni (topologie complète multi-DC), sinon depuis nautobot_planned_devices
	const hwBuckets = new Map<string, { label: string; profileKey: string; isWitness: boolean; qty: number }>();

	if (params.twinModel && params.twinModel.bareMetalHosts.length > 0) {
		for (const host of params.twinModel.bareMetalHosts) {
			const profileKey = resolveHardwareProfileKey(`${host.pool} ${host.dataplaneProfile}`, host.role);
			const bucketKey = `${profileKey}::${host.deviceType}`;
			const existing = hwBuckets.get(bucketKey);
			if (existing) {
				existing.qty += 1;
			} else {
				hwBuckets.set(bucketKey, {
					label: `${host.deviceType} (${host.dataplaneProfile})`,
					profileKey,
					isWitness: host.role === 'witness',
					qty: 1
				});
			}
		}
	} else {
		for (const dev of params.hydrated.nautobot_planned_devices || []) {
			const pool = String(dev.cluster_pool || 'sylva-default');
			const dp = String(dev.dataplane_profile || 'Standard');
			const dtype = String(dev.device_type || 'BareMetal-Server');
			const role = String(dev.role || 'worker');
			const profileKey = resolveHardwareProfileKey(`${pool} ${dp}`, role);
			const bucketKey = `${profileKey}::${dtype}`;
			const existing = hwBuckets.get(bucketKey);
			if (existing) {
				existing.qty += 1;
			} else {
				hwBuckets.set(bucketKey, {
					label: `${dtype} (${dp})`,
					profileKey,
					isWitness: role.toLowerCase().includes('witness'),
					qty: 1
				});
			}
		}
	}

	for (const [key, bucket] of hwBuckets.entries()) {
		const unitRate = rates.hardwareByProfile[bucket.profileKey] ?? rates.hardwareByProfile.default;
		lines.push({
			sku: `HW-${bucket.profileKey.toUpperCase()}-${key.split('::')[1].replace(/[^A-Z0-9]+/gi, '-').toUpperCase().slice(0, 18)}`,
			category: bucket.isWitness ? 'hardware_witness' : 'hardware_compute',
			label: bucket.label,
			unit: 'node',
			quantity: bucket.qty,
			unitCapexEur: unitRate.capexEur,
			unitOpexAnnualEur: unitRate.opexAnnualEur,
			totalCapexEur: unitRate.capexEur * bucket.qty,
			totalOpexAnnualEur: unitRate.opexAnnualEur * bucket.qty,
			rackUnitsTotal: unitRate.rackUnits * bucket.qty,
			powerKwTotal: Number(((unitRate.powerWatts * bucket.qty) / 1000).toFixed(2)),
			buildManDays: Number((unitRate.integrationManDays * bucket.qty).toFixed(1))
		});
	}

	// 2. Composants logiciels / briques logiques résolues
	const logicalComponents = params.hydrated.resolved_components ?? [];
	if (logicalComponents.length > 0) {
		const sw = rates.softwarePerComponent;
		const qty = logicalComponents.length;
		lines.push({
			sku: 'SW-LOGICAL-COMPONENTS',
			category: 'software_component',
			label: `Composants logiques & tenants (${logicalComponents.map((c) => c.name).slice(0, 5).join(', ')}${qty > 5 ? '…' : ''})`,
			unit: 'component',
			quantity: qty,
			unitCapexEur: sw.capexEur,
			unitOpexAnnualEur: sw.opexAnnualEur,
			totalCapexEur: sw.capexEur * qty,
			totalOpexAnnualEur: sw.opexAnnualEur * qty,
			rackUnitsTotal: 0,
			powerKwTotal: 0,
			buildManDays: Number((sw.integrationManDays * qty).toFixed(1))
		});
	}

	// 3. Intégration zones de sécurité / VRF
	const secZonesCount = (params.hydrated.security_zones ?? []).length;
	if (secZonesCount > 0) {
		lines.push({
			sku: 'SEC-ZONES-VRF-HARDENING',
			category: 'security_integration',
			label: 'Cloisonnement zones de sécurité, VRF & politiques réseau',
			unit: 'zone',
			quantity: secZonesCount,
			unitCapexEur: 0,
			unitOpexAnnualEur: 0,
			totalCapexEur: 0,
			totalOpexAnnualEur: 0,
			rackUnitsTotal: 0,
			powerKwTotal: 0,
			buildManDays: Number((rates.securityZoneIntegrationManDays * secZonesCount).toFixed(1))
		});
	}

	const capexHardwareAndLicenseEur = lines.reduce((sum, l) => sum + l.totalCapexEur, 0);
	const opexAnnualEur = lines.reduce((sum, l) => sum + l.totalOpexAnnualEur, 0);
	const buildManDaysTotal = Number(lines.reduce((sum, l) => sum + l.buildManDays, 0).toFixed(1));
	const buildServicesEur = Math.round(buildManDaysTotal * rates.integrationDailyRateEur);
	const capexTotalEur = capexHardwareAndLicenseEur + buildServicesEur;
	const tcoTotalEur = capexTotalEur + opexAnnualEur * durationYears;
	const rackUnitsTotal = lines.reduce((sum, l) => sum + l.rackUnitsTotal, 0);
	const powerKwTotal = Number(lines.reduce((sum, l) => sum + l.powerKwTotal, 0).toFixed(2));

	const datacentersCount = params.twinModel
		? params.twinModel.failureDomains.length
		: params.hydrated.capacity_summary?.datacenters_count ??
			Object.keys(params.hydrated.resolved_components_by_dc ?? {}).length ??
			1;

	return {
		profileId: params.twinModel?.profileId ?? 'hydrated-baseline',
		planningStageLabel: params.hydrated.planning_stage_label ?? 'Planned-Allocated',
		datacentersCount,
		lines,
		totals: {
			capexHardwareAndLicenseEur,
			buildServicesEur,
			capexTotalEur,
			opexAnnualEur,
			tcoDurationYears: durationYears,
			tcoTotalEur,
			buildManDaysTotal,
			rackUnitsTotal,
			powerKwTotal
		}
	};
}

/**
 * Compare dynamiquement la valorisation BOM / TCO des 3 profils du Jumeau Numérique Sylva
 * (`3dc-active`, `2dc-witness`, `2dc-split`) pour éclairer l'arbitrage coût vs résilience.
 */
export function compareTopologyProfilesBom(
	twinReport: SylvaTwinArbitrationReport,
	hydrated: MultiAxisHydratedInventory,
	rates?: Partial<FinOpsUnitRateCatalog>,
	durationYears = 3
): Record<SylvaTopologyProfileId, DynamicBomReport> {
	const result = {} as Record<SylvaTopologyProfileId, DynamicBomReport>;
	for (const evalItem of twinReport.profiles) {
		result[evalItem.model.profileId] = computeDynamicBomFromHydration({
			hydrated,
			twinModel: evalItem.model,
			rates,
			durationYears
		});
	}
	return result;
}

/**
 * Exporte la BOM valorisée au format CSV BPU/DQE prêt pour l'équipe chiffrage financier.
 */
export function exportBomToBpuCsv(report: DynamicBomReport, delimiter = ';'): string {
	const esc = (v: string | number) => {
		const s = String(v).replace(/\r?\n/g, ' ').trim();
		return s.includes(delimiter) || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const headers = [
		'SKU',
		'Catégorie',
		'Désignation',
		'Unité',
		'Quantité',
		'CAPEX Unitaire (€)',
		'CAPEX Total (€)',
		'OPEX Annuel Unitaire (€)',
		'OPEX Annuel Total (€)',
		'U de Baie',
		'Puissance (kW)',
		'Intégration (JH)'
	];
	const rows = [headers.map(esc).join(delimiter)];
	for (const l of report.lines) {
		rows.push(
			[
				l.sku,
				l.category,
				l.label,
				l.unit,
				l.quantity,
				l.unitCapexEur,
				l.totalCapexEur,
				l.unitOpexAnnualEur,
				l.totalOpexAnnualEur,
				l.rackUnitsTotal,
				l.powerKwTotal,
				l.buildManDays
			]
				.map(esc)
				.join(delimiter)
		);
	}
	rows.push(
		[
			'TOTAL',
			report.profileId,
			`Synthèse ${report.planningStageLabel} (TCO ${report.totals.tcoDurationYears} ans = ${report.totals.tcoTotalEur} €)`,
			'lot',
			1,
			report.totals.capexTotalEur,
			report.totals.capexTotalEur,
			report.totals.opexAnnualEur,
			report.totals.opexAnnualEur,
			report.totals.rackUnitsTotal,
			report.totals.powerKwTotal,
			report.totals.buildManDaysTotal
		]
			.map(esc)
			.join(delimiter)
	);
	return rows.join('\n') + '\n';
}
