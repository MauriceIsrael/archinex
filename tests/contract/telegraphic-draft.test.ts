import { describe, it, expect } from 'vitest';
import {
	renderTelegraphicDraft,
	validateTelegraphicTone,
	type TelegraphicDraft
} from '$lib/domain/telegraphic';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';

describe('Lot 2 - Telegraphic Draft & Tone Non-Regression Contract Tests', () => {
	it('Scénario 1: Rendu d\'un brouillon-appât provoquant sur un sujet non stabilisé (§4.2 Synchronisation)', () => {
		const draft: TelegraphicDraft = {
			section_id: '§4.2',
			subject: 'Synchronisation',
			maturity: 'L2_decomposed',
			is_provisional: true,
			retenu: ['KH:ADR-0042@v2 PTP G.8275.1 boundary clocks'],
			suppose: [
				{
					text: 'holdover ≥ 30 j',
					consequence: 'rubidium/site ⇒ Tier IV nord ⇒ +1 salle technique',
					cost_hint: '+180 k€'
				}
			],
			conflit: [
				{
					text: 'buffer MTIE (PTP)',
					opposing_reference: 'SLA Operateur (ADR-0019)',
					requires_arbitration: true
				}
			],
			manque: [
				{
					id: 'Q-0012',
					question: 'MTIE toléré en holdover ?',
					assigned_role: 'infra_expert_architect'
				}
			],
			variante_b: {
				title: 'GNSS + NTP dégradé',
				cost_delta: '÷3 le coût',
				trade_off: 'perd MCX prio 1'
			}
		};

		const rendered = renderTelegraphicDraft(draft);

		// Assertions BDD selon spec.md
		expect(rendered).toContain('[PROVISOIRE]');
		expect(rendered).toContain('§4.2 Synchronisation · L2_decomposed');
		expect(rendered).toContain('+180 k€');
		expect(rendered).toContain('variante B : GNSS + NTP dégradé (÷3 le coût · perd MCX prio 1)');
		expect(rendered).toContain('[Q-0012] MTIE toléré en holdover ? → infra_expert_architect');
		expect(rendered).toContain('[ARBITRAGE REQUIS]');
	});

	it('Scénario 2: Échec du test de ton sur détection de prose lissée (polite/diplomatic blabla)', () => {
		const diplomaticText =
			'Il est recommandé de mettre en œuvre une solution PTP conforme au profil télécom G.8275.1 afin de garantir la synchronisation.';
		const result = validateTelegraphicTone(diplomaticText);

		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.code === 'BLACKLISTED_POLITE_PROSE_DETECTED')).toBe(true);
		expect(result.errors[0].snippet).toBe('Il est recommandé');
	});

	it('Scénario 3: Échec du test de ton sur coche de complaisance non justifiée', () => {
		const complacencyText = 'Sécurité des flux : ✅ Conforme aux exigences NIS2.';
		const result = validateTelegraphicTone(complacencyText);

		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.code === 'COMPLACENCY_CHECKMARK_DETECTED')).toBe(true);
	});

	it('Scénario 4: Échec du test de ton sur phrase narrative trop longue (> 15 mots)', () => {
		const longSentence =
			'La solution de synchronisation temporelle devra assurer la distribution du signal horloge sur l ensemble des nœuds du réseau fédérateur sans interruption de service.';
		const result = validateTelegraphicTone(longSentence);

		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.code === 'SENTENCE_TOO_LONG')).toBe(true);
	});

	it('Scénario 5: Succès du test de ton sur une formulation télégraphique concise et percutante', () => {
		const crispText =
			'retenu : PTP G.8275.1\nsupposé : holdover ≥ 30 j ⇒ rubidium ⇒ +180 k€\nmanque : MTIE toléré ?';
		const result = validateTelegraphicTone(crispText);

		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it('Scénario 6: Formulation d une alternative libre / variante innovante par un expert', () => {
		const res = deliberationStore.proposeCustomVariant('suse_neuvector_mesh', {
			title: 'Passerelle eBPF Cilium Mesh',
			cost_delta: '-45 k€ OPEX',
			trade_off: 'Supprime l overhead de routage mais requiert un noyau Linux 6.x récent'
		});

		expect(res.success).toBe(true);
		expect(res.statement).toBeDefined();
		expect(res.statement?.triplet.predicate).toBe('proposes_innovative_variant');
		expect(deliberationStore.drafts['suse_neuvector_mesh'].variante_b?.title).toBe('Passerelle eBPF Cilium Mesh');
		// Le sujet passe en L2_decomposed car il y a confrontation d'options
		expect(deliberationStore.subjects.find((s) => s.id === 'suse_neuvector_mesh')?.level).toBe('L2_decomposed');
	});
});
