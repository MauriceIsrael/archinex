export interface ReplayedSubject {
	id: string;
	projectId: string;
	sectionRef: string;
	name: string;
	domain: string;
	problemStatement: string;
	maturityLevel: string;
	deliberationStatus: string;
	waitingForRole: string;
	relativeEffort: string;
	blockingCount: number;
	unlocksCount: number;
	version: number;
	deleted?: boolean;
	lastUpdatedBy?: string;
	lastUpdatedAt?: string;
}

export interface ReplayDomainEvent {
	id?: string;
	projectId: string;
	entityType: string;
	entityId: string;
	type: string;
	payload: string | Record<string, any>;
	actorId?: string;
	actorRole?: string;
	productionMode?: string;
	createdAt?: Date | string;
}

/**
 * Rejoue une suite d'événements de domaine pour reconstituer l'état exact d'un sujet (Subject).
 * Fonction pure et déterministe garantissant l'auditabilité et la reproductibilité (Porte G2).
 */
export function replaySubject(
	events: ReplayDomainEvent[],
	initialState?: Partial<ReplayedSubject>
): ReplayedSubject | null {
	if (!events || events.length === 0) {
		if (!initialState || !initialState.id) return null;
		return {
			id: initialState.id,
			projectId: initialState.projectId || '',
			sectionRef: initialState.sectionRef || '',
			name: initialState.name || '',
			domain: initialState.domain || 'general',
			problemStatement: initialState.problemStatement || '',
			maturityLevel: initialState.maturityLevel || 'L0_named',
			deliberationStatus: initialState.deliberationStatus || 'open',
			waitingForRole: initialState.waitingForRole || 'lead_architect',
			relativeEffort: initialState.relativeEffort || 'M',
			blockingCount: initialState.blockingCount ?? 0,
			unlocksCount: initialState.unlocksCount ?? 0,
			version: initialState.version ?? 1,
			deleted: initialState.deleted ?? false,
			lastUpdatedBy: initialState.lastUpdatedBy,
			lastUpdatedAt: initialState.lastUpdatedAt
		};
	}

	let state: ReplayedSubject = {
		id: initialState?.id || '',
		projectId: initialState?.projectId || '',
		sectionRef: initialState?.sectionRef || '',
		name: initialState?.name || '',
		domain: initialState?.domain || 'general',
		problemStatement: initialState?.problemStatement || '',
		maturityLevel: initialState?.maturityLevel || 'L0_named',
		deliberationStatus: initialState?.deliberationStatus || 'open',
		waitingForRole: initialState?.waitingForRole || 'lead_architect',
		relativeEffort: initialState?.relativeEffort || 'M',
		blockingCount: initialState?.blockingCount ?? 0,
		unlocksCount: initialState?.unlocksCount ?? 0,
		version: initialState?.version ?? 0,
		deleted: initialState?.deleted ?? false,
		lastUpdatedBy: initialState?.lastUpdatedBy,
		lastUpdatedAt: initialState?.lastUpdatedAt
	};

	// Tri par date / ordre si pertinent
	const sorted = [...events].sort((a, b) => {
		const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
		const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
		return ta - tb;
	});

	for (const ev of sorted) {
		if (ev.entityType !== 'subject') continue;

		let payload: Record<string, any> = {};
		if (typeof ev.payload === 'string') {
			try {
				payload = JSON.parse(ev.payload);
			} catch {
				payload = {};
			}
		} else if (ev.payload && typeof ev.payload === 'object') {
			payload = ev.payload;
		}

		state.version += 1;
		if (ev.actorId) state.lastUpdatedBy = ev.actorId;
		if (ev.createdAt) {
			state.lastUpdatedAt =
				typeof ev.createdAt === 'string' ? ev.createdAt : ev.createdAt.toISOString();
		}

		switch (ev.type) {
			case 'SUBJECT_CREATED':
				state.id = ev.entityId || payload.id || state.id;
				state.projectId = ev.projectId || payload.projectId || state.projectId;
				state.sectionRef = payload.sectionRef ?? state.sectionRef;
				state.name = payload.name ?? state.name;
				state.domain = payload.domain ?? state.domain;
				state.problemStatement = payload.problemStatement ?? state.problemStatement;
				state.maturityLevel = payload.maturityLevel ?? state.maturityLevel;
				state.deliberationStatus = payload.deliberationStatus ?? state.deliberationStatus;
				state.waitingForRole = payload.waitingForRole ?? state.waitingForRole;
				state.relativeEffort = payload.relativeEffort ?? state.relativeEffort;
				state.blockingCount = payload.blockingCount ?? state.blockingCount;
				state.unlocksCount = payload.unlocksCount ?? state.unlocksCount;
				state.deleted = false;
				break;

			case 'SUBJECT_UPDATED':
			case 'MATURITY_CHANGED':
			case 'DELIBERATION_STATUS_CHANGED':
				if (payload.sectionRef !== undefined) state.sectionRef = payload.sectionRef;
				if (payload.name !== undefined) state.name = payload.name;
				if (payload.domain !== undefined) state.domain = payload.domain;
				if (payload.problemStatement !== undefined) state.problemStatement = payload.problemStatement;
				if (payload.maturityLevel !== undefined) state.maturityLevel = payload.maturityLevel;
				if (payload.level !== undefined) state.maturityLevel = payload.level;
				if (payload.deliberationStatus !== undefined)
					state.deliberationStatus = payload.deliberationStatus;
				if (payload.status !== undefined) state.deliberationStatus = payload.status;
				if (payload.waitingForRole !== undefined) state.waitingForRole = payload.waitingForRole;
				if (payload.relativeEffort !== undefined) state.relativeEffort = payload.relativeEffort;
				if (payload.blockingCount !== undefined) state.blockingCount = payload.blockingCount;
				if (payload.unlocksCount !== undefined) state.unlocksCount = payload.unlocksCount;
				break;

			case 'SUBJECT_DELETED':
				state.deleted = true;
				break;

			default:
				// Si le payload contient des champs connus, les appliquer
				for (const key of Object.keys(payload)) {
					if (key in state && key !== 'id' && key !== 'projectId' && key !== 'version') {
						(state as any)[key] = payload[key];
					}
				}
				break;
		}
	}

	return state.id ? state : null;
}
