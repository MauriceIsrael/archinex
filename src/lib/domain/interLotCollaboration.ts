/**
 * Co-signature des contrats d'interface inter-lots (Issue #448).
 *
 * Empêche que des hypothèses d'interface incompatibles entre deux lots (ex: lot Réseau vs lot Applicatif)
 * soient découvertes à J-3 du dépôt : chaque contrat d'interface actif requiert la double signature humaine
 * des responsables amont et aval avant le scellement L4_frozen / architecture.lock.
 */

export interface LotSignOff {
	actorId: string;
	actorRole: string;
	signedAt: string;
	comment?: string;
}

export type InterLotContractStatus = 'pending_both' | 'pending_downstream' | 'pending_upstream' | 'co_signed' | 'contested';

export interface InterLotInterfaceContract {
	id: string;
	subjectId: string;
	upstreamLot: string;
	downstreamLot: string;
	interfaceBoundary: string;
	hypothesisStatement: string;
	requirementRefs: string[];
	upstreamSignOff?: LotSignOff | null;
	downstreamSignOff?: LotSignOff | null;
	contestedReason?: string | null;
}

export interface InterLotCoSignatureGateResult {
	canFreeze: boolean;
	totalContracts: number;
	coSignedCount: number;
	pendingCount: number;
	contestedCount: number;
	blockers: Array<{
		contractId: string;
		subjectId: string;
		status: InterLotContractStatus;
		message: string;
	}>;
}

export function getInterLotContractStatus(contract: InterLotInterfaceContract): InterLotContractStatus {
	if (contract.contestedReason && contract.contestedReason.trim().length > 0) {
		return 'contested';
	}
	const hasUp = Boolean(contract.upstreamSignOff?.actorId);
	const hasDown = Boolean(contract.downstreamSignOff?.actorId);
	if (hasUp && hasDown) return 'co_signed';
	if (hasUp) return 'pending_downstream';
	if (hasDown) return 'pending_upstream';
	return 'pending_both';
}

/**
 * Enregistre la signature humaine d'un responsable de lot (amont ou aval) sur un contrat d'interface.
 * Applique la séparation des signataires : une même personne ne peut pas cosigner les deux côtés
 * d'un contrat d'interface entre deux lots distincts.
 */
export function signInterLotContract(
	contract: InterLotInterfaceContract,
	params: {
		side: 'upstream' | 'downstream';
		actorId: string;
		actorRole: string;
		isHuman: boolean;
		comment?: string;
		signedAt?: string;
	}
): InterLotInterfaceContract {
	if (!params.isHuman) {
		throw new Error("Invariant III : la co-signature d'un contrat d'interface inter-lots requiert un acteur humain.");
	}
	const actorId = params.actorId.trim();
	if (!actorId) {
		throw new Error("L'identifiant du signataire est obligatoire.");
	}

	const oppositeSignOff = params.side === 'upstream' ? contract.downstreamSignOff : contract.upstreamSignOff;
	if (
		oppositeSignOff &&
		oppositeSignOff.actorId.trim().toLowerCase() === actorId.toLowerCase() &&
		contract.upstreamLot.trim().toLowerCase() !== contract.downstreamLot.trim().toLowerCase()
	) {
		throw new Error(
			`Séparation des responsabilités inter-lots : ${actorId} ne peut pas cosigner à la fois '${contract.upstreamLot}' et '${contract.downstreamLot}'.`
		);
	}

	const signOff: LotSignOff = {
		actorId,
		actorRole: params.actorRole,
		signedAt: params.signedAt ?? new Date().toISOString(),
		...(params.comment?.trim() ? { comment: params.comment.trim() } : {})
	};

	return {
		...contract,
		contestedReason: null,
		...(params.side === 'upstream' ? { upstreamSignOff: signOff } : { downstreamSignOff: signOff })
	};
}

/**
 * Évalue la barrière de co-signature inter-lots avant le passage à L4_frozen / architecture.lock.
 */
export function evaluateInterLotCoSignatureGate(
	contracts: InterLotInterfaceContract[]
): InterLotCoSignatureGateResult {
	let coSignedCount = 0;
	let pendingCount = 0;
	let contestedCount = 0;
	const blockers: InterLotCoSignatureGateResult['blockers'] = [];

	for (const c of contracts) {
		const status = getInterLotContractStatus(c);
		if (status === 'co_signed') {
			coSignedCount++;
			continue;
		}
		if (status === 'contested') {
			contestedCount++;
			blockers.push({
				contractId: c.id,
				subjectId: c.subjectId,
				status,
				message: `Interface inter-lots '${c.interfaceBoundary}' (${c.upstreamLot} ↔ ${c.downstreamLot}) contestée : ${c.contestedReason}`
			});
		} else {
			pendingCount++;
			const missingSide =
				status === 'pending_downstream'
					? `signature aval (${c.downstreamLot})`
					: status === 'pending_upstream'
						? `signature amont (${c.upstreamLot})`
						: `double signature (${c.upstreamLot} et ${c.downstreamLot})`;
			blockers.push({
				contractId: c.id,
				subjectId: c.subjectId,
				status,
				message: `Interface inter-lots '${c.interfaceBoundary}' en attente de ${missingSide}.`
			});
		}
	}

	return {
		canFreeze: blockers.length === 0,
		totalContracts: contracts.length,
		coSignedCount,
		pendingCount,
		contestedCount,
		blockers
	};
}
