import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
	computeObjectIntentHash,
	planIntentWrite,
	buildTraceCustomFields,
	readIntentHash,
	TRACE_FIELD_KEYS
} from '$lib/server/edp/traceMarkers';
import {
	payloadAlreadyApplied,
	scopedNautobotName,
	unscopeNautobotName,
	normalizeProjectScope
} from '$lib/server/edp/nautobotSync';
import type { OwnedObjectType } from '$lib/domain/edp/fieldOwnership';

const OWNED_TYPES: OwnedObjectType[] = [
	'tenancy.tenant',
	'dcim.device',
	'ipam.prefix',
	'ipam.vlan',
	'ipam.ipaddress'
];

const intentPayloadArb = fc.record({
	name: fc.stringMatching(/^[a-z0-9-]{2,20}$/),
	description: fc.string({ minLength: 0, maxLength: 40 }),
	role: fc.stringMatching(/^[a-z-]{2,15}$/),
	vid: fc.integer({ min: 1, max: 4094 })
});

describe('Propriétés — Idempotence du push Nautobot (fast-check)', () => {
	it('computeObjectIntentHash est déterministe et invariant à l’ordre des clés et aux métadonnées', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...OWNED_TYPES),
				intentPayloadArb,
				fc.array(fc.stringMatching(/^[a-z-]{2,12}$/), { maxLength: 4 }),
				(type, payload, tags) => {
					const keys = Object.keys(payload);
					const reversed: Record<string, unknown> = {};
					for (const k of [...keys].reverse()) {
						reversed[k] = (payload as Record<string, unknown>)[k];
					}

					const h1 = computeObjectIntentHash(type, payload);
					const h2 = computeObjectIntentHash(type, reversed);
					const h3 = computeObjectIntentHash(type, {
						...payload,
						tags,
						custom_fields: { [TRACE_FIELD_KEYS.intentHash]: 'ignored' }
					});

					expect(h1).toMatch(/^v1:[0-9a-f]{64}$/);
					expect(h1).toBe(h2);
					expect(h1).toBe(h3);
				}
			),
			{ numRuns: 150 }
		);
	});

	it('planIntentWrite est idempotent : après création ou mise à jour, un second push avec la même intention produit toujours noop', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...OWNED_TYPES),
				intentPayloadArb,
				fc.option(fc.stringMatching(/^[a-z0-9-]{2,12}$/), { nil: undefined }),
				fc.boolean(),
				(type, payload, projectId, initiallyExists) => {
					const desiredHash = computeObjectIntentHash(type, payload);

					// Premier push
					const first = planIntentWrite({
						exists: initiallyExists,
						existingHash: initiallyExists ? 'v1:oldhash' : undefined,
						desiredHash
					});
					expect(['create', 'update']).toContain(first.action);

					// Simulation de l'état Nautobot après écriture des custom_fields de traçabilité
					const customFields = buildTraceCustomFields({ projectId }, 'fallback', desiredHash);
					const persistedNautobotObj = {
						...payload,
						_custom_field_data: customFields
					};

					// Second push strictement identique -> MUST be noop
					const persistedHash = readIntentHash(persistedNautobotObj);
					expect(persistedHash).toBe(desiredHash);

					const second = planIntentWrite({
						exists: true,
						existingHash: persistedHash,
						desiredHash
					});
					expect(second.action).toBe('noop');
				}
			),
			{ numRuns: 150 }
		);
	});

	it('un objet existant non marqué n’est jamais écrasé sans adoptUnmarked=true', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...OWNED_TYPES),
				intentPayloadArb,
				fc.boolean(),
				(type, payload, adoptUnmarked) => {
					const desiredHash = computeObjectIntentHash(type, payload);
					const decision = planIntentWrite({
						exists: true,
						existingHash: undefined,
						desiredHash,
						adoptUnmarked
					});
					if (adoptUnmarked) {
						expect(decision.action).toBe('adopt');
					} else {
						expect(decision.action).toBe('skip_unmarked');
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('payloadAlreadyApplied retourne toujours true lorsqu’un objet porte déjà exactement le payload', () => {
		fc.assert(
			fc.property(
				intentPayloadArb,
				fc.array(fc.stringMatching(/^[a-z0-9-]{2,10}$/), { maxLength: 3 }),
				(payload, tagNames) => {
					const uniqueTags = Array.from(new Set(tagNames));
					const existing = {
						...payload,
						tags: uniqueTags.map((name) => ({ name })),
						_custom_field_data: {
							[TRACE_FIELD_KEYS.project]: 'proj-1'
						}
					};
					const desired = {
						...payload,
						tags: uniqueTags.map((name) => ({ name })),
						custom_fields: {
							[TRACE_FIELD_KEYS.project]: 'proj-1'
						}
					};
					expect(payloadAlreadyApplied(existing, desired)).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('scopedNautobotName est idempotent et unscopeNautobotName est son inverse exact dans la limite de longueur', () => {
		fc.assert(
			fc.property(
				fc.stringMatching(/^[a-z0-9][a-z0-9-]{1,20}$/),
				fc.stringMatching(/^[a-z0-9][a-z0-9-]{1,12}$/),
				(baseName, rawScope) => {
					const scope = normalizeProjectScope(rawScope);
					const once = scopedNautobotName(baseName, scope);
					const twice = scopedNautobotName(once, scope);

					// Idempotence du préfixage
					expect(twice).toBe(once);
					// Réversibilité
					expect(unscopeNautobotName(once, scope)).toBe(baseName);
				}
			),
			{ numRuns: 120 }
		);
	});
});
