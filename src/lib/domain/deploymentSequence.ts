import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';
import type { ProjectionContext, ProjectionSlotSummary } from '$lib/domain/artifactProjections';
import { partitionStatements } from '$lib/domain/epistemicBadge';

export type SubjectInput = MaturitySubject | { id: string; name: string; section_ref?: string; sectionRef?: string; problem_statement?: string };

export interface ExtractedDeploymentSignals {
	components: string[];
	environments: string[];
	protocols: string[];
	securityConstraints: string[];
	requirementRefs: string[];
	actors: Array<{ id: string; label: string }>;
	sourceLabel: string;
	isProvisional: boolean;
	hypotheses: string[];
	conflicts: string[];
	hasContextualSignals: boolean;
}

/** Nettoie un libellé pour la syntaxe `sequenceDiagram` de Mermaid (pas de saut de ligne, `;`, `#`, `<`, `>`). */
export function seqText(value: string, maxLen = 76): string {
	const cleaned = String(value || '')
		.replace(/[\r\n]+/g, ' ')
		.replace(/[;<>#]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (cleaned.length <= maxLen) return cleaned;
	return `${cleaned.slice(0, maxLen - 1).trimEnd()}…`;
}

const KNOWN_PROTOCOLS: Array<{ pattern: RegExp; label: string }> = [
	{ pattern: /\bmTLS\b/i, label: 'mTLS' },
	{ pattern: /\bHTTPS\b/i, label: 'HTTPS' },
	{ pattern: /\bTLS(?:\s*1\.[23])?\b/i, label: 'TLS' },
	{ pattern: /\bREST\b/i, label: 'REST' },
	{ pattern: /\bGraphQL\b/i, label: 'GraphQL' },
	{ pattern: /\bgRPC\b/i, label: 'gRPC' },
	{ pattern: /\bWebSocket\b/i, label: 'WebSocket' },
	{ pattern: /\bOIDC\b/i, label: 'OIDC' },
	{ pattern: /\bOAuth\s*2(?:\.0)?\b/i, label: 'OAuth2' },
	{ pattern: /\bSAML\b/i, label: 'SAML' },
	{ pattern: /\bJWT\b/i, label: 'JWT' },
	{ pattern: /\bPKCE\b/i, label: 'PKCE' },
	{ pattern: /\bWMTS\b/i, label: 'WMTS' },
	{ pattern: /\bWMS\b/i, label: 'WMS' },
	{ pattern: /\bWFS\b/i, label: 'WFS' },
	{ pattern: /\bOGC\b/i, label: 'OGC' },
	{ pattern: /\bGeoJSON\b/i, label: 'GeoJSON' },
	{ pattern: /\bMBTiles\b/i, label: 'MBTiles' },
	{ pattern: /\bPostGIS\b/i, label: 'PostGIS' },
	{ pattern: /\bPostgreSQL\b/i, label: 'PostgreSQL' },
	{ pattern: /\bSQL\b/i, label: 'SQL' },
	{ pattern: /\bS3\b/i, label: 'S3' },
	{ pattern: /\bAMQP\b/i, label: 'AMQP' },
	{ pattern: /\bKafka\b/i, label: 'Kafka' },
	{ pattern: /\bMQTT\b/i, label: 'MQTT' },
	{ pattern: /\bSyslog\b/i, label: 'Syslog' },
	{ pattern: /\bSNMP\b/i, label: 'SNMP' },
	{ pattern: /\bSFTP\b/i, label: 'SFTP' },
	{ pattern: /\bSSH\b/i, label: 'SSH' },
	{ pattern: /\bIPsec\b/i, label: 'IPsec' },
	{ pattern: /\bIKEv2\b/i, label: 'IKEv2' },
	{ pattern: /\bDiameter\b/i, label: 'Diameter' },
	{ pattern: /\bSIP\b/i, label: 'SIP' },
	{ pattern: /\bWireGuard\b/i, label: 'WireGuard' },
	{ pattern: /\bBGP\b/i, label: 'BGP' },
	{ pattern: /\bGitOps\b/i, label: 'GitOps' },
	{ pattern: /\bHelm\b/i, label: 'Helm' },
	{ pattern: /\bKubernetes\b|\bK8s\b/i, label: 'Kubernetes' },
	{ pattern: /\bOCI\b|\bDocker\b/i, label: 'OCI/Conteneurs' },
	{ pattern: /\bCI\/CD\b/i, label: 'CI/CD' }
];

const ENVIRONMENT_RULES: Array<{ pattern: RegExp; label: string }> = [
	{ pattern: /\b(?:dev|d[eé]veloppement|labo(?:ratoire)?)\b/i, label: 'Développement / Labo' },
	{ pattern: /\b(?:int[eé]gration|int)\b/i, label: 'Intégration (INT)' },
	{ pattern: /\b(?:recette|qualification|staging|uat|va[rl])\b/i, label: 'Qualification / Recette' },
	{ pattern: /\b(?:pr[eé]-?prod(?:uction)?|iso-?prod)\b/i, label: 'Pré-production' },
	{ pattern: /\b(?:prod(?:uction)?|exploitation)\b/i, label: 'Production' },
	{ pattern: /\b(?:terrain|embarqu[eé]|offline|hors[- ]?ligne|poste\s+client|mobile)\b/i, label: 'Cible Terrain / Embarquée' },
	{ pattern: /\b(?:dmz)\b/i, label: 'Zone DMZ' },
	{ pattern: /\b(?:secnumcloud|cloud\s+souverain)\b/i, label: 'Cloud Souverain' },
	{ pattern: /\b(?:on-?prem(?:ise)?|h[eé]bergement\s+d[eé]di[eé])\b/i, label: 'Infrastructure Dédiée' }
];

const SECURITY_RULES: Array<{ pattern: RegExp; label: string }> = [
	{ pattern: /signat|sbom|sha-?256|int[eé]grit[eé]/i, label: 'Signature & intégrité des artefacts' },
	{ pattern: /chiffr|tls|mtls|ipsec|pki|certificat|hsm|aes/i, label: 'Chiffrement & certificats PKI' },
	{ pattern: /rbac|iam|mfa|authentification|habilit|moindre\s+privil[eè]ge/i, label: 'Contrôle d\'accès & habilitations' },
	{ pattern: /audit|journal|siem|syslog|tra[cç]abilit/i, label: 'Journalisation & piste d\'audit' },
	{ pattern: /homologation|anssi|rgs|secnumcloud|iso\s*27001|pentest|p[eé]n[eé]tration/i, label: 'Homologation & conformité sécurité' },
	{ pattern: /pra|pca|rpo|rto|sauvegarde|backup|bascule|redondan/i, label: 'Résilience, sauvegarde & reprise' }
];

const COMPONENT_PREDICATE_HINT = /composant|service|serveur|passerelle|base|stockage|client|module|bus|api|moteur|plateforme|syst[eè]me|[eé]quipement|interface|portail|cache|broker|tuile|flux|d[eé]p[oô]t|outil/i;

function dedupePush(target: string[], raw: string, maxLen = 48): void {
	const cleaned = seqText(raw, maxLen);
	if (!cleaned) return;
	const key = cleaned.toLowerCase();
	if (!target.some((item) => item.toLowerCase() === key)) {
		target.push(cleaned);
	}
}

function extractComponents(
	subject: SubjectInput,
	shown: Statement[],
	draft?: TelegraphicDraft | null,
	context?: ProjectionContext
): string[] {
	const components: string[] = [];

	// 1. Phase 4 slots (instantiatedComponents en priorité, sinon axisTitle)
	for (const slot of context?.slots ?? []) {
		if (slot.instantiatedComponents && slot.instantiatedComponents.length > 0) {
			for (const comp of slot.instantiatedComponents) {
				dedupePush(components, comp, 44);
			}
		} else if (slot.axisTitle) {
			dedupePush(components, slot.axisTitle, 44);
		}
	}

	// 2. Énoncés actifs de la section
	for (const s of shown) {
		const pred = String(s.triplet.predicate || '').trim();
		const val = String(s.triplet.value || '').trim();
		if (!pred && !val) continue;
		if (COMPONENT_PREDICATE_HINT.test(pred) && val) {
			dedupePush(components, val, 44);
		} else if (pred && val) {
			dedupePush(components, `${pred} (${val})`, 48);
		}
	}

	// 3. Points retenus du brouillon télégraphique
	for (const line of draft?.retenu ?? []) {
		const head = line.split(':')[0]?.trim() || line.trim();
		if (head.length >= 3) {
			dedupePush(components, head, 44);
		}
	}

	// 4. Toujours ancrer sur le sujet si aucun composant explicite, puis compléter par les identifiants techniques composés
	if (components.length === 0) {
		dedupePush(components, subject.name || 'Service Cible', 44);
	}
	if (components.length < 3) {
		const specSource = [
			context?.decision?.retainedOptionTitle || '',
			context?.decision?.rationale || '',
			context?.detailedSpecText || ''
		].join(' ');
		const techTokens = specSource.match(/\b[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+\b/g) ?? [];
		for (const token of techTokens) {
			if (!/^REQ-/i.test(token)) {
				dedupePush(components, token, 44);
			}
		}
	}

	return components.slice(0, 3);
}

function extractEnvironments(corpus: string, context?: ProjectionContext): string[] {
	const envs: string[] = [];
	for (const env of context?.environments ?? []) {
		dedupePush(envs, env, 40);
	}
	for (const rule of ENVIRONMENT_RULES) {
		if (rule.pattern.test(corpus)) {
			dedupePush(envs, rule.label, 40);
		}
	}
	if (envs.length === 0) {
		return ['Qualification / Recette', 'Production'];
	}
	return envs.slice(0, 3);
}

function extractProtocols(corpus: string): string[] {
	const protocols: string[] = [];
	for (const rule of KNOWN_PROTOCOLS) {
		if (rule.pattern.test(corpus)) {
			dedupePush(protocols, rule.label, 24);
		}
	}
	return protocols.slice(0, 5);
}

function extractSecurityConstraints(
	corpus: string,
	shown: Statement[],
	slots?: ProjectionSlotSummary[]
): string[] {
	const constraints: string[] = [];

	for (const slot of slots ?? []) {
		for (const rule of slot.executableOracleRules ?? []) {
			dedupePush(constraints, rule, 52);
		}
	}
	for (const s of shown) {
		if (s.justification.appliedRule) {
			dedupePush(constraints, s.justification.appliedRule, 52);
		}
	}
	for (const rule of SECURITY_RULES) {
		if (rule.pattern.test(corpus)) {
			dedupePush(constraints, rule.label, 52);
		}
	}
	return constraints.slice(0, 4);
}

/**
 * Extrait dynamiquement les signaux de déploiement et d'homologation depuis
 * le sujet, le brouillon télégraphique, les énoncés actifs et le contexte de projection.
 */
export function extractDeploymentSignals(
	subject: SubjectInput,
	draft?: TelegraphicDraft | null,
	statements?: Statement[],
	context?: ProjectionContext
): ExtractedDeploymentSignals {
	const { shown, conflictIds } = partitionStatements(statements ?? []);
	const decision = context?.decision;
	const retainedOpt = context?.options?.find(
		(o) => o.id === decision?.retainedOptionId || o.title === decision?.retainedOptionTitle || o.status === 'retained'
	);

	const corpusParts: string[] = [
		subject.name || '',
		'problem_statement' in subject ? subject.problem_statement || '' : '',
		decision?.retainedOptionTitle || '',
		decision?.rationale || '',
		decision?.reversibility || '',
		retainedOpt?.summary || '',
		context?.detailedSpecText || '',
		...(draft?.retenu ?? []),
		...Object.values(draft?.expertAnswers ?? {}).map((a) => a.answer),
		...shown.map((s) => `${s.triplet.predicate} ${s.triplet.value} ${s.justification.appliedRule || ''}`),
		...(context?.slots ?? []).flatMap((sl) => [
			sl.axisTitle,
			...(sl.instantiatedComponents ?? []),
			...(sl.executableOracleRules ?? [])
		]),
		...(context?.requirements ?? []).map((r) => `${r.clauseRef} ${r.title}`)
	];
	const corpus = corpusParts.filter(Boolean).join(' ');

	const components = extractComponents(subject, shown, draft, context);
	const environments = extractEnvironments(corpus, context);
	const protocols = extractProtocols(corpus);
	const securityConstraints = extractSecurityConstraints(corpus, shown, context?.slots);
	const requirementRefs: string[] = [];
	for (const r of context?.requirements ?? []) {
		dedupePush(requirementRefs, r.clauseRef, 28);
	}
	for (const reqMatch of corpus.match(/\bREQ-[A-Za-z0-9_-]+\b/gi) ?? []) {
		dedupePush(requirementRefs, reqMatch, 28);
	}
	const boundedRequirementRefs = requirementRefs.slice(0, 3);

	const enterpriseName = context?.enterpriseName?.trim() || 'Organisation';
	const projectName = context?.projectName?.trim() || subject.name || 'Système';

	const actors: Array<{ id: string; label: string }> = [];
	if (context?.actors && context.actors.length > 0) {
		context.actors.slice(0, 3).forEach((a, idx) => {
			const roleSuffix = a.role ? ` (${a.role})` : '';
			actors.push({ id: `Actor${idx}`, label: seqText(`${a.name}${roleSuffix}`, 44) });
		});
	} else {
		const validatorRole =
			decision?.arbiterRole ||
			shown.find((s) => s.authority.validator?.role)?.authority.validator?.role ||
			(enterpriseName !== 'Organisation' ? `Responsable Homologation (${enterpriseName})` : 'Responsable Homologation / RSSI');
		actors.push({ id: 'Ops', label: seqText(`Équipe Déploiement (${projectName})`, 64) });
		actors.push({ id: 'Valideur', label: seqText(validatorRole, 64) });
	}

	const hypotheses = (draft?.suppose ?? []).map((h) => seqText(h.text, 56)).filter(Boolean);
	const conflicts = [
		...(draft?.conflit ?? []).map((c) => seqText(`${c.text} vs ${c.opposing_reference}`, 56)),
		...shown
			.filter((s) => s.status === 'contested' || conflictIds.has(s.id))
			.map((s) => seqText(`${s.triplet.predicate} (${s.status === 'contested' ? 'contesté' : 'conflit'})`, 56))
	];

	const sourceLabel = /\bwapt\b/i.test(corpus)
		? 'Serveur WAPT (Dépôt officiel)'
		: /\bgitops\b/i.test(corpus)
			? 'Dépôt GitOps & Manifestes'
			: /\bci\/cd\b|\bpipeline\b/i.test(corpus)
				? 'Chaîne CI/CD & Artefacts'
				: /\bhelm\b|\boci\b|\bdocker\b|\bkubernetes\b/i.test(corpus)
					? 'Registre OCI & Manifestes'
					: 'Dépôt de Configuration & Artefacts';

	const hasContextualSignals =
		shown.length > 0 ||
		(draft?.retenu?.length ?? 0) > 0 ||
		(draft?.suppose?.length ?? 0) > 0 ||
		(draft?.conflit?.length ?? 0) > 0 ||
		Object.keys(draft?.expertAnswers ?? {}).length > 0 ||
		(context?.slots?.length ?? 0) > 0 ||
		(context?.actors?.length ?? 0) > 0 ||
		(context?.environments?.length ?? 0) > 0 ||
		boundedRequirementRefs.length > 0 ||
		Boolean(context?.detailedSpecText?.trim()) ||
		Boolean(decision?.retainedOptionTitle?.trim()) ||
		protocols.length > 0 ||
		securityConstraints.length > 0;

	return {
		components,
		environments,
		protocols,
		securityConstraints,
		requirementRefs: boundedRequirementRefs,
		actors,
		sourceLabel,
		isProvisional: Boolean(draft?.is_provisional),
		hypotheses,
		conflicts,
		hasContextualSignals
	};
}

/**
 * Construit un diagramme de séquence Mermaid contextualisé par les composants,
 * environnements, protocoles, contraintes d'homologation et acteurs réels du sujet.
 */
export function buildDynamicDeploymentSequence(
	subject: SubjectInput,
	signals: ExtractedDeploymentSignals,
	context?: ProjectionContext
): string {
	const subjectName = seqText(subject.name || 'Système', 44);
	const optionTitle = context?.decision?.retainedOptionTitle
		? seqText(context.decision.retainedOptionTitle, 56)
		: subjectName;

	const opsActor = signals.actors[0] ?? { id: 'Ops', label: `Équipe Déploiement (${subjectName})` };
	const gateActor = signals.actors[1] ?? { id: 'Valideur', label: 'Responsable Homologation / RSSI' };

	const lines: string[] = ['sequenceDiagram', '    autonumber'];
	for (const actor of signals.actors) {
		lines.push(`    actor ${actor.id} as ${actor.label}`);
	}
	lines.push(`    participant Source as ${signals.sourceLabel}`);

	signals.components.forEach((comp, idx) => {
		lines.push(`    participant Comp${idx} as ${comp}`);
	});

	const hasMultiStageEnv = signals.environments.length > 1;
	const qualifEnv = signals.environments[0];
	const midEnv = signals.environments.length > 2 ? signals.environments[1] : null;
	const prodEnv = signals.environments[signals.environments.length - 1];
	if (hasMultiStageEnv) {
		lines.push(`    participant EnvQualif as ${qualifEnv}`);
	}
	if (midEnv) {
		lines.push(`    participant EnvMid as ${midEnv}`);
	}
	lines.push(`    participant EnvProd as ${prodEnv}`);
	lines.push('');

	const lastParticipant = 'EnvProd';
	if (signals.isProvisional || signals.conflicts.length > 0) {
		const alertParts: string[] = [];
		if (signals.isProvisional) alertParts.push('Section provisoire (non scellée)');
		if (signals.conflicts.length > 0) alertParts.push(`Arbitrage requis : ${signals.conflicts[0]}`);
		lines.push(`    Note over ${opsActor.id},${lastParticipant}: ⚠️ ${seqText(alertParts.join(' · '), 88)}`);
		lines.push('');
	}

	// Phase 1 : Préparation & Assemblage des Composants
	lines.push(`    Note over ${opsActor.id},Comp0: Phase 1 : Préparation & Assemblage (${subjectName})`);
	lines.push(`    ${opsActor.id}->>Source: Préparation configuration & artefacts (${optionTitle})`);
	if (signals.securityConstraints.length > 0) {
		lines.push(`    Source->>Source: Contrôle préliminaire (${signals.securityConstraints[0]})`);
	}
	lines.push(`    Source->>Comp0: Provisioning composant ${signals.components[0]}`);

	// Phase 2 : Déploiement en Environnement de Qualification & Flux Protocolaires
	const protoLabel = signals.protocols.length > 0 ? signals.protocols.join(' / ') : 'flux applicatifs nominaux';
	const stageTarget = midEnv ? 'EnvMid' : (hasMultiStageEnv ? 'EnvQualif' : 'EnvProd');
	const stageLabel = midEnv ?? (hasMultiStageEnv ? qualifEnv : prodEnv);

	lines.push('');
	lines.push(`    Note over Comp0,${stageTarget}: Phase 2 : Intégration ${qualifEnv} & Vérification des Flux`);
	if (signals.components.length > 1) {
		for (let i = 1; i < signals.components.length; i++) {
			lines.push(`    Comp0->>Comp${i}: Raccordement & échange (${protoLabel})`);
		}
	}
	const entryEnv = hasMultiStageEnv ? 'EnvQualif' : 'EnvProd';
	lines.push(`    Comp0->>${entryEnv}: Déploiement et tests de flux (${protoLabel})`);
	if (midEnv) {
		lines.push(`    EnvQualif->>EnvMid: Promotion vers ${midEnv}`);
	}
	if (signals.hypotheses.length > 0) {
		lines.push(`    Note over ${stageTarget}: Vérification hypothèse : ${signals.hypotheses[0]}`);
	}

	// Phase 3 : Porte d'Homologation & Contraintes de Sécurité
	lines.push('');
	const reqSuffix = signals.requirementRefs.length > 0 ? ` [${signals.requirementRefs.join(', ')}]` : '';
	lines.push(`    Note over ${gateActor.id},${stageTarget}: Phase 3 : Porte d'Homologation & Sécurité (${stageLabel})${reqSuffix}`);
	const securitySummary =
		signals.securityConstraints.length > 0
			? signals.securityConstraints.slice(0, 2).join(' + ')
			: 'Contrôle conformité, intégrité & non-régression';
	lines.push(`    ${gateActor.id}->>${stageTarget}: Audit & validation (${seqText(securitySummary, 64)})`);

	if (signals.conflicts.length > 0) {
		lines.push(`    ${gateActor.id}->>${opsActor.id}: Arbitrage requis avant bascule (${signals.conflicts[0]})`);
	}
	const sealNote = context?.sealSha256 ? ` (Scellement ${context.sealSha256.slice(0, 8)})` : '';
	lines.push(`    ${gateActor.id}->>Source: Approbation formelle d'homologation${sealNote}`);

	// Phase 4 : Mise en Production & Exploitation
	lines.push('');
	lines.push(`    Note over Source,EnvProd: Phase 4 : Mise en ${prodEnv} & Exploitation`);
	lines.push(`    Source->>EnvProd: Promotion de la version homologuée vers ${prodEnv}`);
	const reversibilityNote = context?.decision?.reversibility
		? `Plan de retour : ${seqText(context.decision.reversibility, 52)}`
		: 'Contrôle santé & activation supervision';
	lines.push(`    EnvProd->>EnvProd: Validation post-bascule (${reversibilityNote})`);
	lines.push(`    EnvProd-->>${opsActor.id}: Compte-rendu d'état opérationnel (${protoLabel})`);

	return lines.join('\n');
}
