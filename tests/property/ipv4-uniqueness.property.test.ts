import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeIpFromCidrOffset, resolveComponentInstance } from '$lib/domain/edp/refResolver';
import {
	DEFAULT_VALUE_CATALOGS,
	type EnvironmentOverlay,
	type LogicalComponent,
	type ValueCatalogs
} from '$lib/domain/edp/componentCatalog';

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4ToUint32(ip: string): number {
	const parts = ip.split('.').map(Number);
	return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

const validCidrArb = fc
	.tuple(
		fc.integer({ min: 10, max: 223 }).filter((o) => o !== 127),
		fc.integer({ min: 0, max: 255 }),
		fc.integer({ min: 0, max: 255 }),
		fc.integer({ min: 0, max: 255 }),
		fc.integer({ min: 16, max: 30 })
	)
	.map(([a, b, c, d, prefix]) => ({
		cidr: `${a}.${b}.${c}.${d}/${prefix}`,
		prefix,
		hostMask: (0xffffffff >>> prefix) >>> 0
	}));

describe('Propriétés — Unicité et bornes d’allocation IPv4 (fast-check)', () => {
	it('computeIpFromCidrOffset est strictement injective : offsets distincts => IPv4 distinctes dans le même CIDR', () => {
		fc.assert(
			fc.property(
				validCidrArb.chain((c) =>
					fc.tuple(
						fc.constant(c),
						fc.integer({ min: 0, max: c.hostMask }),
						fc.integer({ min: 0, max: c.hostMask })
					)
				),
				([{ cidr, prefix, hostMask }, off1, off2]) => {
					const ip1 = computeIpFromCidrOffset(cidr, off1);
					const ip2 = computeIpFromCidrOffset(cidr, off2);

					// Format IPv4 canonique
					expect(ip1).toMatch(IPV4_REGEX);
					expect(ip2).toMatch(IPV4_REGEX);
					for (const octet of ip1.split('.').map(Number)) {
						expect(octet).toBeGreaterThanOrEqual(0);
						expect(octet).toBeLessThanOrEqual(255);
					}

					// Appartenance au sous-réseau (même préfixe réseau)
					const baseNum = ipv4ToUint32(cidr.split('/')[0]);
					const netMask = (~hostMask) >>> 0;
					const expectedNet = (baseNum & netMask) >>> 0;
					expect((ipv4ToUint32(ip1) & netMask) >>> 0).toBe(expectedNet);
					expect((ipv4ToUint32(ip2) & netMask) >>> 0).toBe(expectedNet);

					// Injectivité exacte
					if (off1 === off2) {
						expect(ip1).toBe(ip2);
					} else {
						expect(ip1).not.toBe(ip2);
					}
					expect(prefix).toBeGreaterThanOrEqual(16);
				}
			),
			{ numRuns: 200 }
		);
	});

	it('computeIpFromCidrOffset rejette tout offset négatif ou supérieur à hostMask (aucun débordement inter-sous-réseau)', () => {
		fc.assert(
			fc.property(
				validCidrArb.chain((c) =>
					fc.tuple(
						fc.constant(c),
						fc.oneof(
							fc.integer({ min: -1000, max: -1 }),
							fc.integer({ min: c.hostMask + 1, max: c.hostMask + 1000 })
						)
					)
				),
				([{ cidr }, badOffset]) => {
					expect(() => computeIpFromCidrOffset(cidr, badOffset)).toThrow();
				}
			),
			{ numRuns: 100 }
		);
	});

	it('resolveComponentInstance garantit l’unicité globale IPv4 sur toutes les instances et tous les datacenters', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 12 }),
				fc.integer({ min: 1, max: 3 }),
				fc.integer({ min: 10, max: 30 }),
				fc.integer({ min: 1, max: 200 }),
				(replicas, dcCount, baseOffset, thirdOctet) => {
					const datacenters = Array.from({ length: dcCount }, (_, i) => ({
						name: `dc${i + 1}`,
						region: 'eu-west',
						failureDomain: `fd-${i + 1}`,
						drRole: (i === 0 ? 'primary' : 'secondary') as 'primary' | 'secondary'
					}));

					const catalogs: ValueCatalogs = {
						...DEFAULT_VALUE_CATALOGS,
						datacenters
					};

					const component: LogicalComponent = {
						apiVersion: 'archinex.io/v1alpha1',
						kind: 'LogicalComponent',
						metadata: {
							name: 'generic-service',
							displayName: 'Generic Service',
							version: '1.0.0',
							manifestVersion: 1,
							functionalDomain: 'platform',
							editor: 'internal',
							external: false,
							status: 'active',
							tenant: 'tenant-a'
						},
						spec: {
							class: 'business',
							network: {
								vrfs: [{ name: 'vrf-app', domain: 'app.internal' }],
								subnets: [
									{
										name: 'sub-app',
										cidr: 'ref(param.app_cidr)',
										vrf: 'vrf-app',
										zone: 'app-zone',
										class: 'business'
									}
								]
							},
							compute: {
								modules: [
									{
										name: 'worker',
										kind: 'vm',
										role: 'worker',
										status: 'active',
										placement: { zone: 'app-zone', requiredDataplane: 'standard-nis2' },
										instances: 'ref(param.worker_replicas)',
										nics: [
											{
												class: 'business',
												index: 0,
												vrf: 'vrf-app',
												subnetRef: 'sub-app',
												ip: { by: 'offset', value: baseOffset, perInstance: true },
												defaultRoute: true
											}
										]
									}
								]
							}
						}
					};

					const overlay: EnvironmentOverlay = {
						apiVersion: 'archinex.io/v1alpha1',
						kind: 'EnvironmentOverlay',
						metadata: {
							name: 'prod-overlay',
							environment: 'prod',
							version: '1.0.0',
							manifestVersion: 1
						},
						spec: {
							datacenters: datacenters.map((d) => d.name),
							substitutions: {
								app_cidr: `10.100.${thirdOctet}.0/24`,
								worker_replicas: replicas
							}
						}
					};

					const allocatedIps: string[] = [];
					for (const dc of datacenters) {
						const resolved = resolveComponentInstance(component, overlay, dc.name, catalogs);
						for (const mod of resolved.modules) {
							for (const inst of mod.instances) {
								for (const nic of inst.nics) {
									allocatedIps.push(nic.ip);
								}
							}
						}
					}

					const uniqueIps = new Set(allocatedIps);
					expect(allocatedIps).toHaveLength(replicas * dcCount);
					expect(uniqueIps.size).toBe(allocatedIps.length);
				}
			),
			{ numRuns: 100 }
		);
	});
});
