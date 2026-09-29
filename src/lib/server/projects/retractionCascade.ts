import type { Prisma } from '@prisma/client';

export interface RetractionCascadeResult {
	retractedId: string;
	affectedStatementIds: string[];
	affectedSubjectIds: string[];
	eventsCreated: number;
}

/**
 * Exécute la cascade de rétractation transactionnelle (Invariant VI de la constitution Archinex).
 * Lorsqu'un énoncé antécédent est rétracté ou invalidé, la clôture logique est rompue :
 * tous ses descendants sont récursivement rétrogradés (confidence -> 'assumed', status -> 'contested').
 *
 * Toutes les écritures et événements de domaine sont atomiques au sein de la transaction `tx`.
 */
export async function executeRetractionCascade(
	tx: Prisma.TransactionClient,
	params: {
		projectId: string;
		statementId: string;
		actorId: string;
		actorRole: string;
		productionMode?: string;
		reason?: string;
	}
): Promise<RetractionCascadeResult> {
	const { projectId, statementId, actorId, actorRole, productionMode = 'human-authored', reason } = params;

	// 1. Récupération et rétractation de l'énoncé racine
	const root = await tx.statement.findUnique({
		where: { id: statementId }
	});

	if (!root || root.projectId !== projectId) {
		throw new Error(`Statement ${statementId} non trouvé pour le projet ${projectId}`);
	}

	const updatedRoot = await tx.statement.update({
		where: { id: statementId },
		data: {
			status: 'retracted',
			version: root.version + 1
		}
	});

	await tx.domainEvent.create({
		data: {
			projectId,
			entityType: 'statement',
			entityId: statementId,
			type: 'STATEMENT_RETRACTED',
			payload: JSON.stringify({
				statementId,
				previousStatus: root.status,
				reason: reason || 'Retracted by architect'
			}),
			actorId,
			actorRole,
			productionMode
		}
	});

	let eventsCreated = 1;
	const affectedStatementIds: string[] = [];
	const affectedSubjectIds = new Set<string>();

	if (root.subjectId) {
		affectedSubjectIds.add(root.subjectId);
	}

	// 2. Traversal BFS pour rétrograder tous les descendants
	const queue: string[] = [statementId];
	const visited = new Set<string>([statementId]);

	while (queue.length > 0) {
		const currentAncestorId = queue.shift()!;

		// Trouver tous les énoncés descendants directs dont l'antécédent est currentAncestorId
		const dependencies = await tx.statementAntecedent.findMany({
			where: { antecedentId: currentAncestorId }
		});

		for (const dep of dependencies) {
			const descId = dep.statementId;
			if (visited.has(descId)) continue;
			visited.add(descId);

			const descendant = await tx.statement.findUnique({
				where: { id: descId }
			});

			if (!descendant || descendant.projectId !== projectId) continue;

			// Rétrogradation au statut 'assumed' selon l'Invariant VI
			const newStatus = descendant.status === 'retracted' ? 'retracted' : 'contested';
			await tx.statement.update({
				where: { id: descId },
				data: {
					confidence: 'assumed',
					status: newStatus,
					version: descendant.version + 1
				}
			});

			await tx.domainEvent.create({
				data: {
					projectId,
					entityType: 'statement',
					entityId: descId,
					type: 'STATEMENT_DOWNGRADED_CASCADED',
					payload: JSON.stringify({
						antecedentId: currentAncestorId,
						rootRetractedId: statementId,
						previousConfidence: descendant.confidence,
						previousStatus: descendant.status,
						newConfidence: 'assumed',
						newStatus,
						reason: `Broken chain of truth: antecedent ${currentAncestorId} retracted`
					}),
					actorId,
					actorRole,
					productionMode
				}
			});

			eventsCreated++;
			affectedStatementIds.push(descId);
			if (descendant.subjectId) {
				affectedSubjectIds.add(descendant.subjectId);
			}

			// Poursuivre la propagation en profondeur
			queue.push(descId);
		}
	}

	return {
		retractedId: statementId,
		affectedStatementIds,
		affectedSubjectIds: Array.from(affectedSubjectIds),
		eventsCreated
	};
}
