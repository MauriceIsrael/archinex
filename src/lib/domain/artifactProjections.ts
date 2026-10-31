import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';
import { renderStructurizrWorkspace, type C4Container, type C4Relation } from '$lib/domain/structurizrDsl';
import { badgeOf, c4Styles, draftOverlay, epistemicCounts, mermaidClassDefs, mmdText, partitionStatements, withdrawnNote } from '$lib/domain/epistemicBadge';

export interface ProjectionActor {
	name: string;
	role?: string;
	description?: string;
}

export interface ProjectionDecision {
	retainedOptionId?: string;
	retainedOptionTitle?: string;
	rationale?: string;
	reversibility?: string;
	decidedAt?: string;
	arbiterId?: string;
	arbiterRole?: string;
}

export interface ProjectionContext {
	projectName?: string;
	enterpriseName?: string;
	actors?: ProjectionActor[];
	decision?: ProjectionDecision | null;
	options?: Array<{ id: string; title: string; summary?: string; status?: string }>;
	requirements?: Array<{ clauseRef: string; title: string }>;
	sealSha256?: string;
}

/** Les énoncés d'une section, partagés en « à dessiner » et « écartés » : le même tri pour tous les artefacts. */
function scoped(subject: MaturitySubject, statements: Statement[]) {
	return partitionStatements(statements.filter((s) => s.section === subject.section_ref || s.triplet.subject === subject.id));
}

/** Liens causaux entre énoncés dessinés : `basedOn` qui désigne un autre énoncé de la section (une référence externe est ignorée). */
function causalLinks(shown: Statement[]): Array<{ from: Statement; to: Statement }> {
	const byId = new Map(shown.map((s) => [s.id, s]));
	return shown.flatMap((to) => to.justification.basedOn.flatMap((id) => (byId.has(id) ? [{ from: byId.get(id)!, to }] : [])));
}

/**
 * Génère le diagramme d'architecture Mermaid à partir des énoncés de la section.
 *
 * Chaque énoncé porte son badge de solidité (vérifié, conçu, hypothèse, contesté, en conflit…) en couleur **et** en toutes lettres ;
 * un énoncé remplacé ou retiré n'est pas dessiné, et le dit.
 */
export function generateMermaidDiagram(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const index = new Map(shown.map((s, i) => [s.id, i]));
	const hasOption = Boolean(context?.decision?.retainedOptionTitle);
	const overlay = draftOverlay(draft);

	const lines: string[] = ['flowchart TD', ...mermaidClassDefs(), `    subgraph "${mmdText(`${subject.section_ref} · ${subject.name}`)}"`];

	if (overlay.banner) lines.push(`        BANNER["⚠ ${mmdText(overlay.banner)}"]:::Provisional`);
	if (hasOption) lines.push(`        OPT["⭐ Option retenue : ${mmdText(context!.decision!.retainedOptionTitle!)}"]:::Retained`);

	if (shown.length === 0 && !context?.decision && overlay.points.length === 0) {
		lines.push('        A["Architecture en cours de délibération"]');
	} else {
		shown.forEach((stmt, i) => {
			const badge = badgeOf(stmt, conflictIds.has(stmt.id));
			lines.push(`        N_${i}["${mmdText(`${stmt.triplet.predicate} : ${stmt.triplet.value}`)}<br/><i>${mmdText(badge.label)}</i>"]:::${badge.tag}`);
		});
		for (const { from, to } of causalLinks(shown)) lines.push(`        N_${index.get(from.id)} --> N_${index.get(to.id)}`);
		if (hasOption) {
			// L'option retenue précède les énoncés qui ne se fondent sur aucun autre de la section.
			const founded = new Set(causalLinks(shown).map((l) => l.to.id));
			shown.filter((s) => !founded.has(s.id)).forEach((s) => lines.push(`        OPT --> N_${index.get(s.id)}`));
		}
	}

	overlay.points.forEach((p, i) => lines.push(`        P_${i}["${mmdText(p.title)}<br/><i>${mmdText(`${p.label} · ${p.detail}`)}</i>"]:::${p.tag}`));

	const note = withdrawnNote(withdrawn);
	if (note) lines.push(`        W["${mmdText(note)}"]:::Withdrawn`);
	lines.push('    end');
	return lines.join('\n');
}

/**
 * Génère la spécification C4 au format Structurizr DSL (.dsl), **acceptée par Structurizr** (voir `structurizrDsl.ts`).
 *
 * Chaque container porte, comme « technologie » et comme étiquette de style, la solidité de l'énoncé dont il vient. Les personnes
 * sont celles que l'appelant déclare comme acteurs du système : aucune n'est inventée.
 */
export function generateStructurizrDSL(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const enterpriseName = context?.enterpriseName || context?.projectName || 'Organisation';
	const containers: C4Container[] = [];
	const overlay = draftOverlay(draft);

	if (context?.decision?.retainedOptionTitle) {
		containers.push({
			id: 'retained_option',
			name: context.decision.retainedOptionTitle,
			description: context.decision.rationale || 'Option retenue',
			technology: 'Option retenue',
			tags: ['Retained']
		});
	}

	shown.forEach((s) => {
		const badge = badgeOf(s, conflictIds.has(s.id));
		containers.push({ id: s.id, name: s.triplet.predicate, description: String(s.triplet.value), technology: badge.label, tags: [badge.tag] });
	});

	overlay.points.forEach((p, i) =>
		containers.push({ id: `open_${i}`, name: p.title, description: p.detail, technology: p.label, tags: [p.tag] })
	);

	if (containers.length === 0) {
		containers.push({ id: 'default', name: 'Socle Architectural', description: 'En cours de spécification', technology: 'non spécifié', tags: ['Unqualified'] });
	}

	const note = withdrawnNote(withdrawn);
	const systemDescription = [overlay.banner, note].filter(Boolean).join(' — ') || undefined;
	const relations: C4Relation[] = causalLinks(shown).map(({ from, to }) => ({ from: from.id, to: to.id, label: 'fonde' }));

	return renderStructurizrWorkspace({
		name: subject.name,
		description: overlay.banner ? `Projeté depuis Archinex — ${overlay.banner}` : 'Projeté sans dérive depuis Archinex',
		group: enterpriseName,
		persons: (context?.actors ?? []).map((a) => ({ name: a.name, description: a.description })),
		systems: [{ id: subject.id, name: subject.name, description: systemDescription, containers }],
		relations,
		viewKey: subject.id,
		styles: c4Styles(),
		notes: [overlay.banner, note].filter((n): n is string => Boolean(n))
	});
}

/** Texte sûr dans un commentaire `doc` SysML : la fin de commentaire est neutralisée. */
const sysmlDoc = (value: string) => value.replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ');
const sysmlString = (value: string) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');

/**
 * Génère la modélisation système en langage SysML v2 / SysON.
 *
 * Non validé par un outil SysML v2 : les noms sont uniques et échappés, mais aucun analyseur n'a relu ce texte.
 */
export function generateSysMLv2(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const overlay = draftOverlay(draft);
	const taken = new Set<string>();
	const unique = (raw: string) => {
		const base = raw.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'element';
		let name = base;
		for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
		taken.add(name);
		return name;
	};
	const parts: string[] = [];

	if (context?.decision?.retainedOptionTitle) {
		parts.push(`    part def ${unique(`Opt_${context.decision.retainedOptionTitle}`)} {`);
		parts.push(`        doc /* Option retenue : ${sysmlDoc(context.decision.retainedOptionTitle)} */`);
		if (context.decision.reversibility) {
			parts.push(`        attribute reversibility : String = "${sysmlString(context.decision.reversibility)}";`);
		}
		parts.push(`    }`);
	}

	shown.forEach((s) => {
		const badge = badgeOf(s, conflictIds.has(s.id));
		parts.push(`    part def ${unique(s.triplet.predicate)} {`);
		parts.push(`        attribute specification : String = "${sysmlString(String(s.triplet.value))}";`);
		parts.push(`        attribute confidence : String = "${sysmlString(String(s.maturity.confidence))}";`);
		parts.push(`        attribute status : String = "${sysmlString(String(s.status))}";`);
		parts.push(`        attribute epistemic : String = "${sysmlString(badge.label)}";`);
		parts.push(`    }`);
	});

	overlay.points.forEach((p) => {
		parts.push(`    part def ${unique(`Open_${p.kind}`)} {`);
		parts.push(`        doc /* ${sysmlDoc(p.title)} */`);
		parts.push(`        attribute detail : String = "${sysmlString(p.detail)}";`);
		parts.push(`        attribute epistemic : String = "${sysmlString(p.label)}";`);
		parts.push(`    }`);
	});

	if (context?.requirements && context.requirements.length > 0) {
		context.requirements.forEach((r) => {
			const safeClause = r.clauseRef.replace(/[^a-zA-Z0-9_]/g, '_');
			parts.push(`    // Exigence couverte : ${r.clauseRef} - ${r.title.replace(/[\r\n]+/g, ' ')}`);
			parts.push(`    // satisfy requirement req_${safeClause};`);
		});
	}

	const note = withdrawnNote(withdrawn);
	const header = [`    doc /* Projeté sans doc drift depuis Archinex snapshot scellé */`];
	if (overlay.banner) header.push(`    doc /* ${sysmlDoc(overlay.banner)} */`);
	if (note) header.push(`    doc /* ${sysmlDoc(note)} */`);
	return `package '${subject.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' {\n${[...header, ...parts].join('\n')}\n}`;
}

/** Valeur typée d'un paramètre : « true », « 15 » deviennent un booléen, un nombre. */
function typed(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	if (value.toLowerCase() === 'true') return true;
	if (value.toLowerCase() === 'false') return false;
	return /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
}

/**
 * Génère la configuration opérationnelle JSON à partir des énoncés de la section et de la décision.
 *
 * Un prédicat qui porte deux valeurs actives différentes n'est **pas** tranché ici : il sort dans `conflicts`, pas dans `parameters`
 * (avant, la dernière valeur lue l'emportait, au gré de l'ordre des énoncés). Les paramètres qui ne sont pas vérifiés sont listés
 * dans `unsettled` avec leur solidité.
 */
export function generateConfigJSON(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	/** Horodatage de génération : à fournir pour une projection reproductible (le gel y passe l'instant du scellement). */
	generatedAt: string = new Date().toISOString(),
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const overlay = draftOverlay(draft);
	const key = (s: Statement) => s.triplet.predicate.replace(/[^a-zA-Z0-9_]/g, '_');

	const parameters: Record<string, unknown> = {};
	const unsettled: Record<string, string> = {};
	const conflicts: Record<string, unknown[]> = {};
	for (const stmt of shown) {
		const k = key(stmt);
		if (conflictIds.has(stmt.id)) {
			(conflicts[k] ??= []).push(typed(stmt.triplet.value));
			continue;
		}
		parameters[k] = typed(stmt.triplet.value);
		const badge = badgeOf(stmt, false);
		if (!badge.settled) unsettled[k] = badge.label;
	}

	const config = {
		subject: { id: subject.id, sectionRef: subject.section_ref, name: subject.name, maturityLevel: subject.level },
		decision: context?.decision
			? {
					retainedOptionId: context.decision.retainedOptionId,
					retainedOptionTitle: context.decision.retainedOptionTitle,
					rationale: context.decision.rationale,
					reversibility: context.decision.reversibility,
					decidedAt: context.decision.decidedAt,
					arbiterRole: context.decision.arbiterRole
				}
			: null,
		parameters: Object.keys(parameters).length > 0 ? parameters : { status: subject.level, statementsCount: shown.length },
		provisional: overlay.banner,
		unsettled,
		conflicts,
		openPoints: overlay.points.map((p) => ({ kind: p.kind, text: p.title, detail: p.detail })),
		withdrawnStatements: withdrawn,
		epistemic: epistemicCounts(shown, conflictIds),
		coveredRequirements: context?.requirements?.map((r) => r.clauseRef) ?? [],
		provenance: { sealedEngine: 'Archinex Deliberation Workbench', generatedAt, sealSha256: context?.sealSha256 }
	};

	return JSON.stringify(config, null, 2);
}

/**
 * Génère une projection visuelle C4 interprétable par Mermaid pour le modèle Structurizr.
 */
export function generateStructurizrVisualMermaid(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const enterpriseName = context?.enterpriseName || context?.projectName || 'Organisation';
	const actors = context?.actors ?? [];
	const overlay = draftOverlay(draft);

	const lines: string[] = [
		'flowchart TB',
		'    classDef person fill:#08427b,stroke:#073b6e,color:#fff,font-weight:bold',
		...mermaidClassDefs(),
		'',
		...actors.map(
			(a, i) => `    user_${i}["👤 ${mmdText(a.name)}<br/><small>[Personne]</small><br/>${mmdText(a.description || '')}"]:::person`
		),
		'',
		...(overlay.banner ? [`    banner["⚠ ${mmdText(overlay.banner)}"]:::Provisional`, ''] : []),
		`    subgraph Enterprise["🏢 Entreprise : ${mmdText(enterpriseName)}"]`,
		`        subgraph SysBound["Système : ${mmdText(subject.name)}"]`,
		`            direction TB`
	];

	if (context?.decision?.retainedOptionTitle) {
		const safeRat = (context.decision.rationale || '').slice(0, 50);
		lines.push(`            c_opt["⭐ ${mmdText(context.decision.retainedOptionTitle)}<br/><small>[Option retenue · arbitrée]</small><br/>${mmdText(safeRat)}"]:::Retained`);
	}

	if (shown.length === 0 && !context?.decision && overlay.points.length === 0) {
		lines.push(`            c_default["⚙️ Composant Architectural<br/><small>[non spécifié]</small><br/>En cours de délibération"]:::Unqualified`);
	} else {
		shown.forEach((s, idx) => {
			const badge = badgeOf(s, conflictIds.has(s.id));
			lines.push(`            c_${idx}["⚙️ ${mmdText(s.triplet.predicate)}<br/><small>[Container · ${mmdText(badge.label)}]</small><br/>${mmdText(String(s.triplet.value))}"]:::${badge.tag}`);
		});
		const index = new Map(shown.map((s, i) => [s.id, i]));
		for (const { from, to } of causalLinks(shown)) lines.push(`            c_${index.get(from.id)} -->|"fonde"| c_${index.get(to.id)}`);
	}

	overlay.points.forEach((p, i) =>
		lines.push(`            c_open_${i}["❓ ${mmdText(p.title)}<br/><small>[${mmdText(p.label)}]</small><br/>${mmdText(p.detail)}"]:::${p.tag}`)
	);

	const note = withdrawnNote(withdrawn);
	if (note) lines.push(`            c_withdrawn["${mmdText(note)}"]:::Withdrawn`);
	lines.push('        end');
	lines.push('    end');
	lines.push('');
	actors.forEach((_, i) => lines.push(`    user_${i} -->|"Utilise"| SysBound`));

	return lines.join('\n');
}

/**
 * Génère une projection visuelle SysML v2 interprétable sous forme de diagramme de blocs (BDD).
 */
export function generateSysMLVisualMermaid(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const { shown, withdrawn, conflictIds } = scoped(subject, statements);
	const overlay = draftOverlay(draft);
	// Un membre de classe Mermaid : on garde les accents (avant, chacun devenait « _ »), on retire ce qui casse la syntaxe.
	const member = (value: string) => value.replace(/[{}"<>`]/g, '').replace(/[()]/g, ' ').replace(/\s*[\r\n]+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

	const lines: string[] = [
		'classDiagram',
		`    class Block_${subject.id.replace(/[^a-zA-Z0-9_]/g, '_')} {`,
		`        <<system>>`,
		`        +section: ${member(subject.section_ref)}`,
		`        +status: ${member(String(subject.level))}`
	];

	if (context?.decision?.retainedOptionTitle) {
		lines.push(`        +retainedOption: ${member(context.decision.retainedOptionTitle)}`);
	}

	shown.forEach((s) => {
		const badge = badgeOf(s, conflictIds.has(s.id));
		const name = s.triplet.predicate.replace(/[^\p{L}\p{N}_]/gu, '_');
		lines.push(`        +${name}: ${member(String(s.triplet.value))} · ${member(badge.label)}`);
	});

	if (overlay.banner) lines.push(`        +provisoire: ${member(overlay.banner)}`);
	overlay.points.forEach((p) => lines.push(`        +${p.kind}: ${member(p.title.replace(/^[^:]+ : /, ''))} · ${member(p.label)}`));

	const note = withdrawnNote(withdrawn);
	if (note) lines.push(`        +écartés: ${member(note)}`);
	lines.push('    }');

	return lines.join('\n');
}


/** Styles standards pour les diagrammes d'architecture technique cible (C4 / Flowchart). */
export function targetArchitectureClassDefs(indent = '    '): string[] {
	return [
		`${indent}classDef boundary fill:#f8f9fa,stroke:#495057,stroke-width:2px,stroke-dasharray:4 4`,
		`${indent}classDef core fill:#e3f2fd,stroke:#1565c0,stroke-width:2px,color:#0d47a1`,
		`${indent}classDef agent fill:#bbdefb,stroke:#1976d2,stroke-width:1px,color:#0d47a1`,
		`${indent}classDef ext fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#4a148c`,
		`${indent}classDef human fill:#fff3e0,stroke:#e65100,stroke-width:2px,stroke-dasharray:3 3,color:#bf360c`,
		`${indent}classDef deploy fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#1b5e20`,
		`${indent}classDef person fill:#08427b,stroke:#073b6e,color:#fff,font-weight:bold`,
		`${indent}classDef draft fill:#fff8e1,stroke:#f57f17,stroke-width:2px,stroke-dasharray:5 5,color:#b78103`
	];
}

/**
 * Génère le schéma d'architecture technique spécifiée (Topologie, Conteneurs, Interfaces et Déploiement)
 * dérivé de l'option retenue et des énoncés techniques d'ingénierie (C4 Container / Flowchart).
 *
 * Contrairement au diagramme causal/épistémique (qui trace l'arbre de justification et les débats),
 * ce diagramme représente littéralement la solution technique retenue pour le dossier d'homologation et de rendu HLD :
 * - Périmètre Système / Solution (modules internes, agents embarqués, console, stockage)
 * - Périmètre Existant / SI Tiers (outillage client, supervision externe, SIEM, dépôts)
 * - Flux d'interfaces étiquetés avec protocoles (Alarmes SNMP, Métriques API, Logs Syslog TLS)
 * - Chaîne de confiance et déploiement (WAPT, paquets signés, sas de validation humaine)
 */
export function generateTargetArchitectureDiagram(
	subject: MaturitySubject | { id: string; name: string; section_ref?: string; sectionRef?: string; level?: string },
	_draft?: TelegraphicDraft | null,
	statements: Statement[] = [],
	context?: ProjectionContext
): string {
	const sectionRef = (subject as any).section_ref || (subject as any).sectionRef || '§0';
	const subjectName = subject.name || 'Système';
	const decision = context?.decision;
	const retainedOptionTitle = decision?.retainedOptionTitle;
	const retainedOption = context?.options?.find(
		(o) => o.id === decision?.retainedOptionId || o.title === retainedOptionTitle
	);
	const summary = retainedOption?.summary || '';
	const rationale = decision?.rationale || '';
	const fullSpec = `${context?.projectName || ''} ${retainedOptionTitle || ''} ${summary} ${rationale}`.trim();

	// Si aucune décision n'est encore actée et aucun énoncé présent
	if (!retainedOptionTitle && (!statements || statements.length === 0)) {
		return [
			'flowchart TB',
			...targetArchitectureClassDefs(),
			`    subgraph SYSTEM["Système : ${mmdText(subjectName)} (${mmdText(sectionRef)})"]`,
			'        direction TB',
			`        PENDING["⏳ Architecture Cible en Attente d'Arbitrage L3<br/><small>Veuillez acter une option retenue dans la Matrice pour générer le schéma d'architecture spécifiée</small>"]:::draft`,
			'    end'
		].join('\n');
	}

	const lower = fullSpec.toLowerCase();
	const mentionsRATP = lower.includes('ratp');
	const hasSupervision = /supervision|m[eé]trologie|alarmes?|m[eé]triques?|centreon|hypervis|zabbix|prometheus/.test(lower);
	const hasLogs = /logs?|audit|siem|syslog|splunk|elk/.test(lower);
	const hasWapt = /wapt/.test(lower);
	const hasDeployment = hasWapt || /d[eé]ploiement|paquets?|mise [aà] jour|ansible|ci\/cd|pipeline/.test(lower);
	const hasHumanGate = /validation humaine|humain|contr[oô]le humain|homologation|recette|approbation/.test(lower);
	const hasSignedPackages = /sign[eé]s?|signature|cl[eé]|pki|certificat/.test(lower);
	const hasAuth = /oidc|oauth|saml|authentification|pro sant[eé]|iam|keycloak|sso|mfa/.test(lower);
	const isHybrid = /hybride|interfac|existant|remont|export|tiers/.test(lower) || mentionsRATP;

	let externalLabel = 'Écosystème Existant (SI Client / Partenaire)';
	if (mentionsRATP) {
		externalLabel = 'Outillage de Maintenance & Exploitation RATP (Existant §11)';
	} else if (lower.includes('pro santé connect') || lower.includes('pro sante connect')) {
		externalLabel = 'Fédération Nationale & Services Régaliens (Pro Santé Connect)';
	} else if (context?.enterpriseName && context.enterpriseName !== context.projectName) {
		externalLabel = `SI ${context.enterpriseName} (Existant)`;
	}

	let systemLabel = `Système : ${subjectName} (Périmètre Solution - Autonome)`;
	if (lower.includes('après-tetra') || lower.includes('apres-tetra') || lower.includes('tetra')) {
		systemLabel = 'Système Après-TETRA (Périmètre Titulaire - Autonome)';
	}

	const lines: string[] = ['flowchart TB', ...targetArchitectureClassDefs(), ''];

	// 1. Acteurs
	const user0Label = 'Équipe Exploitation Titulaire';
	const user1Label = mentionsRATP ? 'Exploitants PCC RATP' : 'Exploitants & Utilisateurs Externes';
	lines.push(`    user_0["👤 ${mmdText(user0Label)}"]:::person`);
	lines.push(`    user_1["👤 ${mmdText(user1Label)}"]:::person`);

	if (hasHumanGate || hasDeployment) {
		const humanLabel = mentionsRATP
			? 'Guichet Homologation / Validation Humaine (RATP)'
			: 'Guichet Validation Humaine & Homologation';
		lines.push(`    ValideurHumain["🛡️ ${mmdText(humanLabel)}<br/><small>(Contrôle intégrité & recette)</small>"]:::human`);
		const pkgLabel = hasSignedPackages ? 'Paquet WAPT Signé' : 'Paquet Applicatif Validé';
		lines.push(`    PaquetSigne["📦 ${mmdText(pkgLabel)}<br/><small>(Signature cryptographique éditeur)</small>"]:::deploy`);
	}
	lines.push('');

	// 2. Périmètre Système
	lines.push(`    subgraph SYSTEM["${mmdText(systemLabel)}"]`);
	lines.push('        direction TB');
	lines.push('        subgraph APPS["Noeuds Applicatifs & Métier"]');
	lines.push('            direction TB');
	lines.push(`            ServiceMetier["Services Critiques & Cœur Applicatif<br/><small>(Spécification ${mmdText(sectionRef)})</small>"]:::core`);
	if (hasSupervision) {
		lines.push('            AgentLocal["Agents de collecte embarqués<br/><small>(Telegraf / Node-Exporter / Fluentbit)</small>"]:::agent');
	}
	if (hasDeployment) {
		const deployAgentLabel = hasWapt ? 'Agent WAPT Client' : 'Agent Client de Déploiement';
		lines.push(`            AgentDeploy["${deployAgentLabel}<br/><small>(Exécution locale des paquets)</small>"]:::deploy`);
	}
	if (statements && statements.length > 0) {
		const activeStmts = statements.filter((s) => s.status === 'active').slice(0, 3);
		activeStmts.forEach((s, idx) => {
			lines.push(`            Param_${idx}["⚙️ ${mmdText(s.triplet.predicate)}: ${mmdText(String(s.triplet.value))}"]:::core`);
		});
	}
	lines.push('        end');

	if (lower.includes('console') || lower.includes('admin') || !hasSupervision) {
		lines.push(`        ConsoleAdmin["Console d'Exploitation & Admin Titulaire<br/><small>(Gestion locale & exploitation autonome)</small>"]:::core`);
	}
	if (hasSupervision) {
		lines.push('        MetrologieLocale["Moteur Métrologie & Stockage Local<br/><small>(Autonomie locale & TSDB)</small>"]:::core');
	}
	if (isHybrid || hasSupervision || hasLogs) {
		lines.push(`        ModuleExport["Passerelle d'Export & Connecteurs RATP<br/><small>(Interfaçage standardisé vers l'existant)</small>"]:::agent`);
	}
	lines.push('    end');
	lines.push('    class SYSTEM boundary');
	lines.push('');

	// 3. Périmètre Existant
	lines.push(`    subgraph EXTERNAL["${mmdText(externalLabel)}"]`);
	lines.push('        direction TB');
	if (hasSupervision) {
		const supLabel = mentionsRATP
			? 'Supervision RATP<br/><small>(Centreon / Hyperviseur global)</small>'
			: 'Supervision Externe<br/><small>(Hyperviseur & Alerting)</small>';
		lines.push(`        SupervisionExt["${supLabel}"]:::ext`);
	}
	if (hasLogs) {
		const logsLabel = mentionsRATP
			? 'Plateforme Logs RATP<br/><small>(SIEM / Centralisation Syslog)</small>'
			: 'Plateforme Centralisée de Logs<br/><small>(SIEM / Audit distant)</small>';
		lines.push(`        CentralLogs["${logsLabel}"]:::ext`);
	}
	if (hasDeployment) {
		const deploySrvLabel = hasWapt
			? 'Dépôt & Serveur WAPT RATP<br/><small>(Distribution paquets validés)</small>'
			: 'Serveur de Déploiement Central<br/><small>(Dépôt paquets & orchestration)</small>';
		lines.push(`        ServeurDeploy["${deploySrvLabel}"]:::ext`);
	}
	if (hasAuth) {
		const idpLabel = lower.includes('pro santé')
			? 'Fournisseur d\'Identité National<br/><small>(Pro Santé Connect / OIDC)</small>'
			: 'Fournisseur d\'Identité Externe<br/><small>(IdP / Fédération OIDC)</small>';
		lines.push(`        IdpExt["${idpLabel}"]:::ext`);
	}
	if (!hasSupervision && !hasLogs && !hasDeployment && !hasAuth) {
		lines.push('        EcosystemeExt["Services & Annuaires Existants<br/><small>(Interfaces d\'intégration)</small>"]:::ext');
	}
	lines.push('    end');
	lines.push('    class EXTERNAL boundary');
	lines.push('');

	// 4. Flux et Liaisons
	if (hasSupervision) {
		lines.push('    ServiceMetier -->|"Métriques & logs internes"| AgentLocal');
		lines.push('    AgentLocal -->|"Alimentation locale"| MetrologieLocale');
		if (lower.includes('console') || lower.includes('admin') || !hasSupervision) {
			lines.push('    MetrologieLocale -->|"Affichage temps réel"| ConsoleAdmin');
			lines.push('    user_0 -->|"Administration locale"| ConsoleAdmin');
		}
		if (isHybrid) {
			lines.push('    MetrologieLocale -->|"Consolidation flux"| ModuleExport');
			lines.push('    ModuleExport -->|"Alarmes (SNMP Trap / Webhook)"| SupervisionExt');
			lines.push('    ModuleExport -->|"Métriques de synthèse (API REST)"| SupervisionExt');
			if (hasLogs) {
				lines.push('    ModuleExport -->|"Export logs d\'audit (Syslog TLS)"| CentralLogs');
			}
			lines.push('    user_1 -->|"Vue globale PCC"| SupervisionExt');
		}
	} else if (hasAuth) {
		lines.push('    user_1 -->|"Accès applicatif (HTTPS)"| ServiceMetier');
		lines.push('    ServiceMetier -->|"Fédération OIDC (Auth Code + PKCE)"| IdpExt');
		lines.push('    user_0 -->|"Gestion des accès"| ConsoleAdmin');
	} else {
		lines.push('    user_0 -->|"Administration & Configuration"| ServiceMetier');
		lines.push('    user_1 -->|"Utilisation & Consommation API"| ServiceMetier');
		lines.push('    ServiceMetier -->|"Interfaces standards"| EcosystemeExt');
	}

	if (hasDeployment) {
		lines.push('    user_0 -->|"1. Package & signature cryptographique"| PaquetSigne');
		if (hasHumanGate) {
			lines.push('    PaquetSigne -->|"2. Soumission recette / INT"| ValideurHumain');
			lines.push('    ValideurHumain -->|"3. Approbation formelle"| ServeurDeploy');
			lines.push('    ServeurDeploy -->|"4. Déploiement contrôlé (HTTPS)"| AgentDeploy');
		} else {
			lines.push('    PaquetSigne -->|"2. Dépôt central"| ServeurDeploy');
			lines.push('    ServeurDeploy -->|"3. Déploiement (HTTPS)"| AgentDeploy');
		}
		lines.push('    AgentDeploy -->|"5. Installation locale & vérification signature"| ServiceMetier');
	}

	return lines.join('\n');
}

/**
 * Génère le diagramme de séquence de la chaîne de déploiement sécurisée et d'homologation.
 * Modélise les interactions entre Titulaire, Valideur Humain, Dépôt/Serveur WAPT et Hôte cible.
 */
export function generateDeploymentSequenceDiagram(
	subject: MaturitySubject | { id: string; name: string; section_ref?: string; sectionRef?: string },
	_draft?: TelegraphicDraft | null,
	_statements?: Statement[],
	context?: ProjectionContext
): string {
	const decision = context?.decision;
	const retainedOpt = context?.options?.find(
		(o) => o.id === decision?.retainedOptionId || o.title === decision?.retainedOptionTitle
	);
	const fullSpec = `${decision?.retainedOptionTitle || ''} ${retainedOpt?.summary || ''} ${decision?.rationale || ''}`.toLowerCase();
	const isRATP = fullSpec.includes('ratp');
	const isWapt = fullSpec.includes('wapt');

	const tituActor = 'Titulaire (Ingénierie & Packaging)';
	const clientActor = isRATP ? 'Responsable Exploitation RATP' : 'Responsable Exploitation / RSSI';
	const serverParticipant = isWapt ? 'Serveur WAPT (Dépôt officiel)' : 'Serveur de Déploiement (Dépôt)';
	const targetParticipant = isRATP ? 'Hôte Après-TETRA (Agent WAPT)' : 'Hôte Cible (Agent Client)';

	return [
		'sequenceDiagram',
		'    autonumber',
		`    actor Dev as ${tituActor}`,
		`    actor Valideur as ${clientActor}`,
		`    participant Srv as ${serverParticipant}`,
		`    participant Host as ${targetParticipant}`,
		'',
		'    Note over Dev,Host: Phase 1 : Construction et Signature Cryptographique',
		'    Dev->>Dev: Construction du paquet applicatif',
		'    Dev->>Dev: Signature cryptographique avec clé privée Titulaire',
		`    Dev->>Valideur: Dépôt du paquet signé en environnement d'Intégration / Recette`,
		'',
		`    Note over Valideur,Srv: Phase 2 : Porte d'Homologation (Validation Humaine)`,
		`    Valideur->>Valideur: Contrôle d'intégrité, signature & tests de non-régression (INT)`,
		'    Valideur->>Srv: Approbation formelle et publication sur le dépôt de production',
		'',
		'    Note over Srv,Host: Phase 3 : Déploiement Sécurisé & Exécution Contrôlée',
		'    Srv->>Host: Notification / Distribution du paquet validé (HTTPS)',
		'    Host->>Host: Contrôle de validité de la signature avant exécution',
		'    Host->>Host: Installation locale et mise à jour des services',
		`    Host-->>Srv: Compte-rendu d'état d'installation (Succès / Échec)`
	].join('\n');
}
