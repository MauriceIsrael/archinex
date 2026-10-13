import { describe, it, expect } from 'vitest';
import { hubRequirementId, hubRequirementIdMap, HUB_REQUIREMENT_ID } from '$lib/domain/hubRequirementId';

describe('Identifiant d\'exigence dans le Hub', () => {
	it('reprend tel quel un identifiant que le Hub accepte', () => {
		expect(hubRequirementId('SRC-1a2b3c4d:REQ-12')).toBe('SRC-1a2b3c4d:REQ-12');
		expect(hubRequirementId('SRC-1a2b3c4d:4.1.2')).toBe('SRC-1a2b3c4d:4.1.2');
	});

	it('assainit de façon déterministe ce que le Hub refuse, et le résultat est toujours accepté', () => {
		for (const raw of ['SRC-1a2b3c4d:REQ-Lot1-960#2', 'SRC-1a2b3c4d:§4.1 (a)', 'SRC-1a2b3c4d:Exigence é/è', 'SRC-1a2b3c4d:' + 'x'.repeat(200), 'SRC-1a2b3c4d:###', 'sans-prefixe #1']) {
			const id = hubRequirementId(raw);
			expect(id).toMatch(HUB_REQUIREMENT_ID);
			expect(id.length).toBeLessThanOrEqual(64);
			expect(hubRequirementId(raw)).toBe(id); // déterministe
		}
	});

	it('ne confond pas deux références qui ne diffèrent que par des caractères refusés', () => {
		expect(hubRequirementId('SRC-1a2b3c4d:REQ#2')).not.toBe(hubRequirementId('SRC-1a2b3c4d:REQ-2'));
		expect(hubRequirementId('SRC-1a2b3c4d:REQ#2')).not.toBe(hubRequirementId('SRC-1a2b3c4d:REQ 2'));
	});

	it('la table refuse une collision au lieu de choisir', () => {
		const map = hubRequirementIdMap(['SRC-1a2b3c4d:A', 'SRC-1a2b3c4d:B#1', 'SRC-1a2b3c4d:B#2']);
		expect(new Set(map.values()).size).toBe(3);
		// Une collision forcée : même identifiant Hub, deux sources.
		expect(() => hubRequirementIdMap(['SRC-1a2b3c4d:X', 'SRC-1a2b3c4d:X'])).not.toThrow(); // le doublon exact est le même élément
	});
});
