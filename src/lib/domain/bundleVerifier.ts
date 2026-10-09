import { canonicalJson, CanonicalError } from '$lib/domain/canonicalJson';
import { universalSha256 } from '$lib/validation/epistemicEnvelope';
import type {
	EngagementBundle,
	EngagementBundleData,
	EpistemicStatus,
	AssertionLevel
} from './engagementBundle';
import { ASSERTION_OF, HUMAN_BASES, UNRIPE_MATURITIES } from './engagementBundle';

export interface BundleProblem {
	code: string;
	path: string;
	message: string;
}

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const CLAIM_COLLECTIONS = ['decisions', 'statements', 'compliance'] as const;

function walkStrings(node: unknown, path = ''): Array<{ path: string; text: string }> {
	const out: Array<{ path: string; text: string }> = [];
	if (typeof node === 'string') {
		out.push({ path, text: node });
	} else if (Array.isArray(node)) {
		node.forEach((item, index) => {
			out.push(...walkStrings(item, `${path}/${index}`));
		});
	} else if (node && typeof node === 'object') {
		for (const [k, v] of Object.entries(node)) {
			out.push(...walkStrings(v, `${path}/${k}`));
		}
	}
	return out;
}

/**
 * Calcule l'empreinte cryptographique canonique de data au profil canonical-json v1.
 */
export function payloadSha256(data: unknown): string {
	return `sha256:${universalSha256(canonicalJson(data))}`;
}

/**
 * Scelle un EngagementBundle avec l'empreinte canonique calculée sur data.
 */
export function sealEngagementBundle(bundle: EngagementBundle): EngagementBundle {
	return {
		...bundle,
		checksum: payloadSha256(bundle.data)
	};
}

/**
 * Vérification structurelle de base (schema-like checks).
 */
export function checkSchemaProblems(bundle: EngagementBundle): BundleProblem[] {
	const problems: BundleProblem[] = [];

	if (!bundle.schemaVersion || (bundle.schemaVersion !== '1.0' && bundle.schemaVersion !== '1.1')) {
		problems.push({
			code: 'SCHEMA',
			path: '/schemaVersion',
			message: "schemaVersion must be '1.0' or '1.1'"
		});
	}
	const hub = bundle.data?.pins?.hub_snapshot;
	if (hub && !/^sha256:[0-9a-f]{64}$/.test(hub.checksum ?? '')) {
		problems.push({ code: 'SCHEMA', path: '/data/pins/hub_snapshot/checksum', message: 'hub snapshot checksum must be sha256:<64 hex>' });
	}
	if (hub && (!hub.snapshot_id || !hub.engagement_id)) {
		problems.push({ code: 'SCHEMA', path: '/data/pins/hub_snapshot', message: 'hub snapshot needs engagement_id and snapshot_id' });
	}
	if (!bundle.snapshotId) {
		problems.push({
			code: 'SCHEMA',
			path: '/snapshotId',
			message: 'snapshotId is required'
		});
	}
	if (bundle.sourceSystem !== 'archinex') {
		problems.push({
			code: 'SCHEMA',
			path: '/sourceSystem',
			message: "sourceSystem must be 'archinex'"
		});
	}
	if (!bundle.createdAt) {
		problems.push({
			code: 'SCHEMA',
			path: '/createdAt',
			message: 'createdAt is required'
		});
	}
	if (!bundle.data || typeof bundle.data !== 'object') {
		problems.push({
			code: 'SCHEMA',
			path: '/data',
			message: 'data object is required'
		});
		return problems;
	}

	const data = bundle.data;
	if (!data.engagement) {
		problems.push({
			code: 'SCHEMA',
			path: '/data/engagement',
			message: 'data.engagement is required'
		});
	} else {
		if (!data.engagement.id) {
			problems.push({
				code: 'SCHEMA',
				path: '/data/engagement/id',
				message: 'engagement.id is required'
			});
		}
		if (!data.engagement.confidentiality) {
			problems.push({
				code: 'SCHEMA',
				path: '/data/engagement/confidentiality',
				message: 'engagement.confidentiality is required'
			});
		}
	}

	// Vérification de champs inattendus interdits dans les collections critiques
	const decisions = (data.decisions as unknown as Array<Record<string, unknown>>) || [];
	decisions.forEach((d, i) => {
		if ('surprise' in d) {
			problems.push({
				code: 'SCHEMA',
				path: `/data/decisions/${i}/surprise`,
				message: 'Unexpected property surprise'
			});
		}
	});

	// Vérification du format handle dans reuse_log (doit commencer par @ ou ne pas être une adresse mail)
	const reuseLog = data.reuse_log || [];
	reuseLog.forEach((r, i) => {
		if (r.by && EMAIL_REGEX.test(r.by)) {
			problems.push({
				code: 'SCHEMA',
				path: `/data/reuse_log/${i}/by`,
				message: 'Handle must not be an email address'
			});
		}
	});

	return problems;
}

/**
 * Vérifie l'ensemble des invariants métier et cryptographiques d'un engagement bundle.
 * Conforme à la vérification de référence pipelines/bundle/verify.py.
 */
export function verifyEngagementBundle(bundle: EngagementBundle): BundleProblem[] {
	const schemaErrors = checkSchemaProblems(bundle);
	if (schemaErrors.length > 0) {
		return schemaErrors;
	}

	const out: BundleProblem[] = [];
	const data = bundle.data;

	// 1. Sceau canonique
	try {
		const expectedChecksum = payloadSha256(data);
		if (bundle.checksum !== expectedChecksum) {
			out.push({
				code: 'SEAL',
				path: '/checksum',
				message: 'does not match the suite canonical-json serialisation of data'
			});
		}
	} catch (err) {
		if (err instanceof CanonicalError) {
			out.push({
				code: 'CANONICAL',
				path: '/data',
				message: err.message
			});
		} else {
			out.push({
				code: 'CANONICAL',
				path: '/data',
				message: String(err)
			});
		}
	}

	// 2. Identifiants uniques dans un namespace unique et résolution des références
	const owners: Record<string, string> = {};

	function register(ident: string, where: string) {
		if (!ident) return;
		if (ident in owners) {
			out.push({
				code: 'DUPLICATE_ID',
				path: where,
				message: `'${ident}' is already used at ${owners[ident]}`
			});
		}
		if (!owners[ident]) {
			owners[ident] = where;
		}
	}

	const arch = data.architecture || { elements: [], relations: [] };
	const collections: Record<string, Array<any>> = {
		source_documents: data.source_documents || [],
		requirements: data.requirements || [],
		subjects: data.subjects || [],
		decisions: data.decisions || [],
		statements: data.statements || [],
		compliance: data.compliance || [],
		gaps: data.gaps || [],
		reuse_log: data.reuse_log || [],
		conflicts: data.conflicts || [],
		elements: arch.elements || [],
		relations: arch.relations || []
	};

	for (const [name, items] of Object.entries(collections)) {
		items.forEach((item, i) => {
			register(item.id || '', `/data/${name}/${i}`);
		});
	}

	(data.subjects || []).forEach((subject, i) => {
		(subject.open_questions || []).forEach((q, j) => {
			register(q.id || '', `/data/subjects/${i}/open_questions/${j}`);
		});
	});

	const ids: Record<string, Set<string>> = {};
	for (const [name, items] of Object.entries(collections)) {
		ids[name] = new Set(items.map((it) => it.id || '').filter(Boolean));
	}

	function mustResolve(value: string | undefined | null, collection: string, where: string) {
		if (value && !ids[collection]?.has(value)) {
			out.push({
				code: 'DANGLING_REF',
				path: where,
				message: `'${value}' is not in ${collection}`
			});
		}
	}

	(data.requirements || []).forEach((r, i) => {
		mustResolve(r.source_document_id, 'source_documents', `/data/requirements/${i}/source_document_id`);
	});

	(data.subjects || []).forEach((s, i) => {
		(s.requirement_ids || []).forEach((rid) => {
			mustResolve(rid, 'requirements', `/data/subjects/${i}/requirement_ids`);
		});
		(s.decision_ids || []).forEach((did) => {
			mustResolve(did, 'decisions', `/data/subjects/${i}/decision_ids`);
		});
	});

	['decisions', 'statements'].forEach((name) => {
		(collections[name] || []).forEach((it, i) => {
			mustResolve(it.subject_id as string, 'subjects', `/data/${name}/${i}/subject_id`);
		});
	});

	(data.compliance || []).forEach((c, i) => {
		mustResolve(c.requirement_id, 'requirements', `/data/compliance/${i}/requirement_id`);
	});

	['compliance', 'elements', 'relations'].forEach((name) => {
		(collections[name] || []).forEach((it, i) => {
			((it.decision_ids as string[]) || []).forEach((did) => {
				mustResolve(did, 'decisions', `/data/${name}/${i}/decision_ids`);
			});
		});
	});

	(data.conflicts || []).forEach((c, i) => {
		(c.statement_ids || []).forEach((sid) => {
			mustResolve(sid, 'statements', `/data/conflicts/${i}/statement_ids`);
		});
	});

	(data.gaps || []).forEach((g, i) => {
		if (g.subject_id) mustResolve(g.subject_id, 'subjects', `/data/gaps/${i}/subject_id`);
		if (g.requirement_id) mustResolve(g.requirement_id, 'requirements', `/data/gaps/${i}/requirement_id`);
	});

	(arch.elements || []).forEach((e, i) => {
		if (e.boundary_id) mustResolve(e.boundary_id, 'elements', `/data/architecture/elements/${i}/boundary_id`);
	});

	(arch.relations || []).forEach((rel, i) => {
		mustResolve(rel.from, 'elements', `/data/architecture/relations/${i}/from`);
		mustResolve(rel.to, 'elements', `/data/architecture/relations/${i}/to`);
	});

	CLAIM_COLLECTIONS.forEach((name) => {
		(collections[name] || []).forEach((it, i) => {
			const prov = (it.provenance as { references?: string[] }) || {};
			(prov.references || []).forEach((ref) => {
				if (!(ref in owners)) {
					out.push({
						code: 'DANGLING_REF',
						path: `/data/${name}/${i}/provenance/references`,
						message: `'${ref}' is not an identifier of this bundle`
					});
				}
			});
		});
	});

	// 3. Références KB citées listées dans data.kb_references
	const listedKbRefs = new Set((data.kb_references || []).map((k) => k.ref));
	const citedKbRefs: Array<{ where: string; ref: string }> = [];

	(data.decisions || []).forEach((d, i) => {
		if (d.derived_from?.kb_ref) {
			citedKbRefs.push({
				where: `/data/decisions/${i}/derived_from/kb_ref`,
				ref: d.derived_from.kb_ref
			});
		}
	});

	(data.compliance || []).forEach((c, i) => {
		if (c.control_ref) {
			citedKbRefs.push({
				where: `/data/compliance/${i}/control_ref`,
				ref: c.control_ref
			});
		}
	});

	(data.reuse_log || []).forEach((r, i) => {
		if (r.matched_ref) {
			citedKbRefs.push({
				where: `/data/reuse_log/${i}/matched_ref`,
				ref: r.matched_ref
			});
		}
	});

	(data.glossary || []).forEach((g, i) => {
		if (g.kb_ref) {
			citedKbRefs.push({
				where: `/data/glossary/${i}/kb_ref`,
				ref: g.kb_ref
			});
		}
	});

	citedKbRefs.forEach(({ where, ref }) => {
		if (!listedKbRefs.has(ref)) {
			out.push({
				code: 'KB_REF_UNLISTED',
				path: where,
				message: `'${ref}' is cited but missing from data.kb_references`
			});
		}
	});

	// 4. Dérivation des niveaux d'affirmation & personne requise pour "asserted"
	const claimsToCheck: Array<{ where: string; item: { epistemic_status?: EpistemicStatus; assertion_level?: AssertionLevel; provenance?: { basis?: string; by?: string[] } } }> = [];

	CLAIM_COLLECTIONS.forEach((n) => {
		(collections[n] || []).forEach((it, i) => {
			claimsToCheck.push({ where: `/data/${n}/${i}`, item: it });
		});
	});

	['elements', 'relations'].forEach((n) => {
		(collections[n] || []).forEach((it, i) => {
			claimsToCheck.push({ where: `/data/architecture/${n}/${i}`, item: it });
		});
	});

	// Les exigences auditées portent aussi un niveau d'affirmation : « affirmé » exige un humain identifié.
	(data.requirements || []).forEach((r, i) => {
		if (r.disposition !== undefined) claimsToCheck.push({ where: `/data/requirements/${i}`, item: r });
	});

	claimsToCheck.forEach(({ where, item }) => {
		const status = item.epistemic_status;
		const level = item.assertion_level;
		const expectedLevel = status ? ASSERTION_OF[status] : undefined;

		if (expectedLevel && level !== expectedLevel) {
			out.push({
				code: 'LEVEL',
				path: where,
				message: `assertion_level '${level}' is not the one derived from epistemic_status '${status}' (${expectedLevel})`
			});
		}

		const prov = item.provenance || {};
		if (level === 'asserted') {
			if (!prov.basis || !(HUMAN_BASES as readonly string[]).includes(prov.basis) || !prov.by || prov.by.length === 0) {
				out.push({
					code: 'UNBACKED_CLAIM',
					path: where,
					message: 'an asserted item needs provenance.basis human_validation or reuse_confirmation and at least one validator'
				});
			}
		}
	});

	// 5. Réutilisation prouvée par une entrée du journal avec hypothèses jugées
	const reuseLogMap = new Map((data.reuse_log || []).map((r) => [r.id, r]));

	(data.decisions || []).forEach((d, i) => {
		const where = `/data/decisions/${i}`;
		const status = d.status;

		if ((status === 'validated' || status === 'reused') && d.assertion_level !== 'asserted') {
			out.push({
				code: 'STATUS',
				path: where,
				message: `a ${status} decision must be asserted`
			});
		}

		if (status === 'proposed' && d.assertion_level === 'asserted') {
			out.push({
				code: 'STATUS',
				path: where,
				message: 'a proposed decision cannot be asserted'
			});
		}

		if (status !== 'reused') {
			return;
		}

		const derived = d.derived_from;
		if (!derived?.reuse_log_id) {
			out.push({
				code: 'REUSE_UNBACKED',
				path: where,
				message: 'a reused decision needs derived_from.reuse_log_id pointing to a reuse_log entry'
			});
			return;
		}

		const entry = reuseLogMap.get(derived.reuse_log_id);
		if (!entry) {
			out.push({
				code: 'REUSE_UNBACKED',
				path: where,
				message: 'a reused decision needs derived_from.reuse_log_id pointing to a reuse_log entry'
			});
			return;
		}

		if (entry.matched_ref !== derived.kb_ref) {
			out.push({
				code: 'REUSE_UNBACKED',
				path: where,
				message: 'the reuse_log entry is about another KB asset'
			});
		}

		if (entry.outcome !== 'reused' && entry.outcome !== 'reused_with_exception') {
			out.push({
				code: 'REUSE_UNBACKED',
				path: where,
				message: `the reuse_log outcome is '${entry.outcome}', not a reuse`
			});
		}

		const judged = entry.assumptions || [];
		if (judged.length === 0) {
			out.push({
				code: 'REUSE_UNBACKED',
				path: where,
				message: 'a reuse without any judged assumption is not allowed'
			});
		}

		if (entry.outcome === 'reused' && judged.some((a) => a.status !== 'holds')) {
			out.push({
				code: 'REUSE_UNBACKED',
				path: where,
				message: "outcome 'reused' requires every assumption to hold"
			});
		}

		if (entry.outcome === 'reused_with_exception' && (!entry.comment || !entry.comment.trim())) {
			out.push({
				code: 'REUSE_UNBACKED',
				path: where,
				message: 'a reuse with exception needs its comment'
			});
		}
	});

	// 6. Sujet décidé = décision affirmée
	const decisionsMap = new Map((data.decisions || []).map((d) => [d.id, d]));
	(data.subjects || []).forEach((s, i) => {
		if (s.status === 'decided') {
			const hasAssertedDecision = (s.decision_ids || []).some(
				(did) => decisionsMap.get(did)?.assertion_level === 'asserted'
			);
			if (!hasAssertedDecision) {
				out.push({
					code: 'DECIDED_WITHOUT_DECISION',
					path: `/data/subjects/${i}`,
					message: 'a decided subject needs at least one asserted decision'
				});
			}
		}
	});

	// 7. Deux étages épistémiques : is_provisional et provisional_reasons
	const unripe = (data.subjects || [])
		.filter((s) => (UNRIPE_MATURITIES as readonly string[]).includes(s.maturity))
		.map((s) => s.id)
		.sort();

	const openConflicts = (data.conflicts || [])
		.filter((c) => c.status === 'open')
		.map((c) => c.id)
		.sort();

	const expectedProvisional = unripe.length > 0 || openConflicts.length > 0;
	if (Boolean(data.is_provisional) !== expectedProvisional) {
		out.push({
			code: 'PROVISIONAL',
			path: '/data/is_provisional',
			message: `must be ${expectedProvisional}: unripe subjects [${unripe.join(', ')}], open conflicts [${openConflicts.join(', ')}]`
		});
	}

	const reasons = data.provisional_reasons || { unripe_subjects: [], open_conflicts: [] };
	const reasonsUnripe = [...(reasons.unripe_subjects || [])].sort();
	const reasonsConflicts = [...(reasons.open_conflicts || [])].sort();

	const unripeMismatch =
		reasonsUnripe.length !== unripe.length ||
		reasonsUnripe.some((v, idx) => v !== unripe[idx]);
	const conflictMismatch =
		reasonsConflicts.length !== openConflicts.length ||
		reasonsConflicts.some((v, idx) => v !== openConflicts[idx]);

	if (unripeMismatch || conflictMismatch) {
		out.push({
			code: 'PROVISIONAL',
			path: '/data/provisional_reasons',
			message: 'must list exactly the subjects below L3_decided and the open conflicts'
		});
	}

	// 7 bis. Exigences auditées : chaque clause est rattachée, justifiée, et rien de bloquant n'est évacué sans humain
	const REQ_DISPOSITIONS = ['deliberated', 'evacuated', 'clarification_needed', 'to_qualify'];
	const subjectsOfRequirement = new Map<string, string[]>();
	(data.subjects || []).forEach((s) => {
		(s.requirement_ids || []).forEach((rid) => {
			subjectsOfRequirement.set(rid, [...(subjectsOfRequirement.get(rid) || []), s.id]);
		});
	});
	const requirementsWithGap = new Set((data.gaps || []).map((g) => g.requirement_id).filter(Boolean));

	(data.requirements || []).forEach((r, i) => {
		if (r.disposition === undefined) return; // dossier sans audit des exigences
		const where = `/data/requirements/${i}`;
		if (!REQ_DISPOSITIONS.includes(r.disposition)) {
			out.push({ code: 'REQ_DISPOSITION', path: `${where}/disposition`, message: `'${r.disposition}' is not one of ${REQ_DISPOSITIONS.join(', ')}` });
			return;
		}
		if (r.disposition === 'evacuated' && !(r.disposition_reason || '').trim()) {
			out.push({ code: 'REQ_UNJUSTIFIED', path: where, message: 'an evacuated requirement needs a disposition_reason' });
		}
		if (r.disposition === 'clarification_needed' && !(r.clarification_question || '').trim()) {
			out.push({ code: 'REQ_UNJUSTIFIED', path: where, message: 'a requirement to clarify needs a clarification_question' });
		}
		if (r.disposition === 'evacuated' && r.criticality === 'bloquant' && r.assertion_level !== 'asserted') {
			out.push({
				code: 'REQ_BLOCKING_EVACUATED',
				path: where,
				message: 'a blocking requirement cannot be evacuated unless a human decided it (assertion_level asserted)'
			});
		}
		const linked = subjectsOfRequirement.get(r.id) || [];
		if (r.disposition === 'deliberated' && linked.length === 0) {
			out.push({ code: 'REQ_UNCOVERED', path: where, message: 'a requirement to deliberate must belong to at least one subject' });
		}
		if (r.disposition !== 'deliberated' && linked.length > 0) {
			out.push({
				code: 'REQ_NOT_DELIBERATED',
				path: where,
				message: `listed by subject(s) ${linked.join(', ')} but its disposition is '${r.disposition}'`
			});
		}
		if ((r.disposition === 'to_qualify' || r.disposition === 'clarification_needed') && !requirementsWithGap.has(r.id)) {
			out.push({ code: 'REQ_NO_GAP', path: where, message: 'an unresolved requirement must be listed in data.gaps so no generator can miss it' });
		}
	});

	// 8. Vie privée : aucun e-mail
	const allStrings = walkStrings(bundle);
	for (const { path, text } of allStrings) {
		if (EMAIL_REGEX.test(text)) {
			out.push({
				code: 'EMAIL',
				path,
				message: 'an e-mail address must not appear in a bundle (use owner handles)'
			});
		}
	}

	return out;
}
