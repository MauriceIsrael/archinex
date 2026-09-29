import { describe, it, expect } from 'vitest';
import { detectProactiveDoctrineRecalls } from '$lib/domain/dialectic';
import { TEST_DOCTRINE_RULES } from '../fixtures/sample-doctrine-rules';

describe('Dialectic Dialogue Recall Contract Tests (Lot 4 - dialectic-dialogue-recall)', () => {
	it('Scenario: Rappel proactif d une décision antérieure lors de l évocation d un sujet (ADR-0014 holdover)', () => {
		const messageContent = 'Pour le site nodal, est-ce qu un holdover de 10 jours avec oscillateur atomique suffit ?';
		const recalls = detectProactiveDoctrineRecalls(messageContent, TEST_DOCTRINE_RULES);

		expect(recalls.length).toBeGreaterThanOrEqual(1);
		const adr14 = recalls.find((r) => r.id === 'KH:ADR-0014');
		expect(adr14).toBeDefined();
		expect(adr14?.enforcementLevel).toBe('mandatory');
		expect(adr14?.summary).toContain('30 jours');
	});

	it('Scenario: Détection de la conformité NIS2 pour l autonomie électrique (ADR-0008)', () => {
		const messageContent = 'Concernant le groupe électrogène, on vise quelle autonomie sous NIS2 ?';
		const recalls = detectProactiveDoctrineRecalls(messageContent, TEST_DOCTRINE_RULES);

		const adr8 = recalls.find((r) => r.id === 'KH:ADR-0008');
		expect(adr8).toBeDefined();
		expect(adr8?.referenceDocument).toContain('ADR-0008');
	});

	it('Scenario: Message anodin sans mot-clé architectural ne déclenche aucun rappel', () => {
		const messageContent = 'Bonjour à tous, la réunion de debrief débute dans 5 minutes.';
		const recalls = detectProactiveDoctrineRecalls(messageContent, TEST_DOCTRINE_RULES);

		expect(recalls.length).toBe(0);
	});
});
