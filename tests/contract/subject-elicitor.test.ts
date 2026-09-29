import { describe, it, expect, vi } from 'vitest';
import {
	buildElicitationPrompt,
	fallbackDeterministicElicitation,
	elicitSubjectDetails
} from '../../src/lib/server/llm/subjectElicitor';
import { localLlmClient } from '../../src/lib/server/llm/localLlmClient';

describe('Subject Elicitor & Provocation Dialectique (raptor-nino)', () => {
	const sampleRequest = {
		subjectId: 'sub-telco-01',
		subjectName: 'Synchronisation PTP & Maintien Holdover',
		sectionRef: '§2.1',
		currentLevel: 'L1_framed',
		existingRetenu: ['Profil ITU-T G.8275.1'],
		clausesText: 'Le système doit garantir une précision sous 1.5 µs avec maintien 30 jours sans GNSS.'
	};

	it('construit un prompt d élicitation orienté débusquage des non-dits et provocation', () => {
		const { systemPrompt, userMessage } = buildElicitationPrompt(sampleRequest, []);
		expect(systemPrompt).toContain('PROVOQUER L\'ÉLICITATION');
		expect(systemPrompt).toContain('DÉBUSQUER LES NON-DITS');
		expect(systemPrompt).toContain('FORMAT DE SORTIE');
		expect(userMessage).toContain('Synchronisation PTP & Maintien Holdover');
		expect(userMessage).toContain('Profil ITU-T G.8275.1');
	});

	it('assure une élicitation de repli déterministe avec quadrants complets et provocation', () => {
		const res = fallbackDeterministicElicitation(sampleRequest);
		expect(res.status).toBe('fallback');
		expect(res.subjectId).toBe('sub-telco-01');
		expect(res.elicitedDraft.suppose.length).toBeGreaterThan(0);
		expect(res.elicitedDraft.conflit.length).toBeGreaterThan(0);
		expect(res.elicitedDraft.manque.length).toBeGreaterThan(0);
		expect(res.elicitedDraft.variante_b?.title).toBeTruthy();
		expect(res.provocationMessage).toContain('Synchronisation PTP & Maintien Holdover');
	});

	it('parse correctement la réponse structurée issue du LLM souverain local', async () => {
		const mockLlmJson = JSON.stringify({
			summary: 'Élicitation du nœud de décision PTP.',
			suppose: [
				{
					text: 'Gigue fibre inférieure à 2 µs sur le réseau de collecte',
					consequence: 'Conditionne la faisabilité du maintien en phase',
					cost_hint: 'Sans surcoût si fibre noire'
				}
			],
			conflit: [
				{
					text: 'Maintien 30 jours vs encombrement des cartes oscillateur en baie outdoor',
					opposing_reference: 'Spécification physique châssis',
					requires_arbitration: true
				}
			],
			manque: [
				{
					id: 'Q-01',
					question: 'Quelle est la dérive maximale tolérée par l équipement radio aval ?',
					assigned_role: 'domain_architect'
				}
			],
			variante_b: {
				title: 'Variante Quartz OCXO durci',
				cost_delta: '-50% coût unitaire',
				trade_off: 'Maintien réduit à 7 jours au lieu de 30 jours'
			},
			provocationMessage: '[Agent IA] Question aux experts télécom : la variante 7 jours est-elle défendable auprès du client ?'
		});

		const chatSpy = vi.spyOn(localLlmClient, 'chat').mockResolvedValueOnce(mockLlmJson);

		const result = await elicitSubjectDetails(sampleRequest, []);

		expect(chatSpy).toHaveBeenCalled();
		expect(result.status).toBe('ok');
		expect(result.elicitedDraft.suppose[0].text).toContain('Gigue fibre');
		expect(result.elicitedDraft.conflit[0].requires_arbitration).toBe(true);
		expect(result.elicitedDraft.manque[0].assigned_role).toBe('domain_architect');
		expect(result.elicitedDraft.variante_b?.title).toBe('Variante Quartz OCXO durci');
		expect(result.provocationMessage).toContain('variante 7 jours');

		chatSpy.mockRestore();
	});
});
