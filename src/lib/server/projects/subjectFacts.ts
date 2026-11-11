import { prisma } from '../prisma';

export interface AffirmedFactItem {
	key: string;
	value: string;
}

/**
 * Résout les faits machine-lisibles affirmés pour un sujet donné (ou pour le projet entier).
 * Fusionne les faits de l'événement DECISION_ASSERTED lié à la décision du sujet et les
 * énoncés (Statement) actifs, sans fuite entre sujets distincts.
 */
export async function getSubjectAffirmedFacts(params: {
	projectId: string;
	subjectId?: string;
	decisionId?: string;
}): Promise<{ facts: AffirmedFactItem[]; hasAssertionEvent: boolean }> {
	const { projectId, subjectId } = params;
	let resolvedDecisionId = params.decisionId;

	if (subjectId && !resolvedDecisionId) {
		const dec = await prisma.decision.findUnique({
			where: { subjectId },
			select: { id: true }
		});
		resolvedDecisionId = dec?.id;
	}

	const factMap = new Map<string, string>();
	let hasAssertionEvent = false;

	if (!subjectId || resolvedDecisionId) {
		const assertionEvent = await prisma.domainEvent.findFirst({
			where: {
				projectId,
				entityType: 'decision',
				...(resolvedDecisionId ? { entityId: resolvedDecisionId } : {}),
				type: 'DECISION_ASSERTED'
			},
			orderBy: { createdAt: 'desc' }
		});

		if (assertionEvent) {
			hasAssertionEvent = true;
			try {
				const payload = JSON.parse(assertionEvent.payload || '{}');
				if (Array.isArray(payload.facts)) {
					for (const f of payload.facts) {
						if (f?.key && f?.value !== undefined && f?.value !== null) {
							factMap.set(String(f.key), String(f.value));
						}
					}
				}
			} catch {
				// ignore malformed payload
			}
		}
	}

	const activeStmts = await prisma.statement.findMany({
		where: {
			projectId,
			...(subjectId ? { subjectId } : {}),
			status: 'active'
		},
		orderBy: { createdAt: 'asc' }
	});

	for (const stmt of activeStmts) {
		factMap.set(stmt.predicate, stmt.value);
	}

	return {
		facts: Array.from(factMap.entries()).map(([key, value]) => ({ key, value })),
		hasAssertionEvent
	};
}
