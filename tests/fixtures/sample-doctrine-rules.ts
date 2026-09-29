import type { DoctrineRecallRule } from '$lib/domain/dialectic';

export const TEST_DOCTRINE_RULES: DoctrineRecallRule[] = [
	{
		id: 'KH:ADR-0014',
		title: 'Tenue en holdover de synchronisation temporelle',
		keywords: [/holdover/i, /synchronisation/i, /horloge/i, /phase/i],
		summary: 'Holdover de 30 jours requis pour les sites nodaux',
		referenceDocument: 'ADR-0014 v1.2',
		enforcementLevel: 'mandatory',
		guidance: 'Privilégier oscillateur atomique ou double source GNSS.'
	},
	{
		id: 'KH:ADR-0008',
		title: 'Autonomie électrique et directive NIS2',
		keywords: [/nis2/i, /autonomie/i, /groupe.*électrog/i, /groupe.*electrog/i, /onduleur/i],
		summary: 'Autonomie minimale de 72h requise sous directive NIS2',
		referenceDocument: 'ADR-0008 v1.0',
		enforcementLevel: 'mandatory',
		guidance: 'Groupe électrogène secouru avec cuve dédiée.'
	}
];
