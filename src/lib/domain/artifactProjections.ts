import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';

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

/**
 * Génère le diagramme d'architecture Mermaid normalisé à partir des faits prouvés (No Doc Drift).
 */
export function generateMermaidDiagram(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const relevantStatements = statements.filter(
		(s) => s.section === subject.section_ref || s.triplet.subject === subject.id
	);

	const lines: string[] = [
		'flowchart TD',
		`    subgraph "${subject.section_ref} · ${subject.name}"`
	];

	if (context?.decision?.retainedOptionTitle) {
		const safeOpt = context.decision.retainedOptionTitle.replace(/["[\]()]/g, '');
		lines.push(`        OPT["⭐ Option Retenue : ${safeOpt}"]`);
	}

	if (relevantStatements.length === 0 && !context?.decision) {
		lines.push('        A["Architecture en cours de délibération"]');
	} else {
		relevantStatements.forEach((stmt, idx) => {
			const sanitizedVal = String(stmt.triplet.value).replace(/["[\]()]/g, '');
			const nodeId = `N_${idx}`;
			lines.push(`        ${nodeId}["${stmt.triplet.predicate} : ${sanitizedVal}"]`);
		});

		// Liens causaux entre énoncés
		relevantStatements.forEach((stmt, idx) => {
			if (stmt.justification.basedOn.length > 0) {
				stmt.justification.basedOn.forEach((baseId) => {
					const parentIdx = relevantStatements.findIndex((s) => s.id === baseId);
					if (parentIdx >= 0) {
						lines.push(`        N_${parentIdx} --> N_${idx}`);
					}
				});
			}
		});

		if (context?.decision?.retainedOptionTitle && relevantStatements.length > 0) {
			lines.push(`        OPT --> N_0`);
		}
	}

	lines.push('    end');
	return lines.join('\n');
}

/**
 * Génère la spécification C4 au format Structurizr DSL (.dsl) dynamique et contextualisée.
 */
export function generateStructurizrDSL(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const relevantStatements = statements.filter(
		(s) => s.section === subject.section_ref || s.triplet.subject === subject.id
	);

	const enterpriseName = context?.enterpriseName || context?.projectName || 'Organisation';
	const primaryActor = context?.actors && context.actors.length > 0
		? context.actors[0]
		: { name: 'Utilisateur du Système', description: `Interagit avec ${subject.name}` };

	const elements: string[] = [];

	if (context?.decision?.retainedOptionTitle) {
		const safeTitle = context.decision.retainedOptionTitle.replace(/"/g, '\\"');
		const safeRat = (context.decision.rationale || 'Option retenue').replace(/"/g, '\\"');
		elements.push(`            retained_option = container "${safeTitle}" "${safeRat}" "Architecture Retenue"`);
	}

	relevantStatements.forEach((s) => {
		const safeId = s.id.replace(/[^a-zA-Z0-9_]/g, '_');
		const safeDesc = String(s.triplet.value).replace(/"/g, '\\"');
		elements.push(`            ${safeId} = container "${s.triplet.predicate}" "${safeDesc}" "Verified Architecture"`);
	});

	if (elements.length === 0) {
		elements.push(`            c_default = container "Socle Architectural" "En cours de spécification" "Verified Architecture"`);
	}

	const safeActorName = primaryActor.name.replace(/"/g, '\\"');
	const safeActorDesc = (primaryActor.description || 'Interagit avec le système').replace(/"/g, '\\"');
	const safeEnterprise = enterpriseName.replace(/"/g, '\\"');
	const safeSubject = subject.name.replace(/"/g, '\\"');

	return `workspace "${safeSubject}" "Projeté sans dérive depuis Archinex" {
    model {
        user = person "${safeActorName}" "${safeActorDesc}"
        enterprise "${safeEnterprise}" {
            system = softwareSystem "${safeSubject}" {
${elements.join('\n')}
            }
        }
        user -> system "Utilise les services du système"
    }
    views {
        systemContext system "Context_${subject.id.replace(/[^a-zA-Z0-9_]/g, '_')}" {
            include *
            autoLayout lr
        }
    }
}`;
}

/**
 * Génère la modélisation système en langage SysML v2 / SysON.
 */
export function generateSysMLv2(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	context?: ProjectionContext
): string {
	const relevantStatements = statements.filter(
		(s) => s.section === subject.section_ref || s.triplet.subject === subject.id
	);

	const parts: string[] = [];

	if (context?.decision?.retainedOptionTitle) {
		const safeTitle = context.decision.retainedOptionTitle.replace(/[^a-zA-Z0-9_]/g, '_');
		parts.push(`    part def Opt_${safeTitle} {`);
		parts.push(`        doc /* Option retenue : ${context.decision.retainedOptionTitle.replace(/"/g, '\\"')} */`);
		if (context.decision.reversibility) {
			parts.push(`        attribute reversibility : String = "${context.decision.reversibility}";`);
		}
		parts.push(`    }`);
	}

	relevantStatements.forEach((s) => {
		const safeName = s.triplet.predicate.replace(/[^a-zA-Z0-9_]/g, '_');
		parts.push(`    part def ${safeName} {`);
		parts.push(`        attribute specification : String = "${String(s.triplet.value).replace(/"/g, '\\"')}";`);
		parts.push(`        attribute confidence : String = "${s.maturity.confidence}";`);
		parts.push(`    }`);
	});

	if (context?.requirements && context.requirements.length > 0) {
		context.requirements.forEach((r) => {
			const safeClause = r.clauseRef.replace(/[^a-zA-Z0-9_]/g, '_');
			parts.push(`    // Exigence couverte : ${r.clauseRef} - ${r.title.replace(/"/g, '\\"')}`);
			parts.push(`    // satisfy requirement req_${safeClause};`);
		});
	}

	return `package '${subject.name}' {
    doc /* Projeté sans doc drift depuis Archinex snapshot scellé */
${parts.join('\n')}
}`;
}

/**
 * Génère la configuration opérationnelle JSON dynamique à partir des faits prouvés et de la décision (No Doc Drift).
 */
export function generateConfigJSON(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	/** Horodatage de génération : à fournir pour une projection reproductible (le gel y passe l'instant du scellement). */
	generatedAt: string = new Date().toISOString(),
	context?: ProjectionContext
): string {
	const relevantStatements = statements.filter(
		(s) => s.section === subject.section_ref || s.triplet.subject === subject.id
	);

	const parameters: Record<string, unknown> = {};
	for (const stmt of relevantStatements) {
		const key = stmt.triplet.predicate.replace(/[^a-zA-Z0-9_]/g, '_');
		let val: any = stmt.triplet.value;
		if (typeof val === 'string') {
			if (val.toLowerCase() === 'true') val = true;
			else if (val.toLowerCase() === 'false') val = false;
			else if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
		}
		parameters[key] = val;
	}

	const config = {
		subject: {
			id: subject.id,
			sectionRef: subject.section_ref,
			name: subject.name,
			maturityLevel: subject.level
		},
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
		parameters: Object.keys(parameters).length > 0 ? parameters : {
			status: subject.level,
			verifiedStatementsCount: relevantStatements.length
		},
		coveredRequirements: context?.requirements?.map((r) => r.clauseRef) ?? [],
		provenance: {
			sealedEngine: 'Archinex Deliberation Workbench',
			generatedAt,
			enforcedTruth: true,
			sealSha256: context?.sealSha256
		}
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
	const relevantStatements = statements.filter(
		(s) => s.section === subject.section_ref || s.triplet.subject === subject.id
	);

	const enterpriseName = context?.enterpriseName || context?.projectName || 'Organisation';
	const primaryActor = context?.actors && context.actors.length > 0
		? context.actors[0]
		: { name: 'Utilisateur', description: 'Consomme les services du système' };

	const lines: string[] = [
		'flowchart TB',
		'    classDef person fill:#08427b,stroke:#073b6e,color:#fff,font-weight:bold',
		'    classDef system fill:#1168bd,stroke:#0b4884,color:#fff,font-weight:bold',
		'    classDef container fill:#438dd5,stroke:#2e6295,color:#fff',
		'    classDef retained fill:#2b8a3e,stroke:#1b5e20,color:#fff,font-weight:bold',
		'',
		`    user["👤 ${primaryActor.name}<br/><small>[Personne]</small><br/>${primaryActor.description || ''}"]:::person`,
		'',
		`    subgraph Enterprise["🏢 Entreprise : ${enterpriseName}"]`,
		`        subgraph SysBound["Système : ${subject.name}"]`,
		`            direction TB`
	];

	if (context?.decision?.retainedOptionTitle) {
		const safeOpt = context.decision.retainedOptionTitle.replace(/["[\]()]/g, '');
		const safeRat = (context.decision.rationale || '').slice(0, 50).replace(/["[\]()]/g, '');
		lines.push(`            c_opt["⭐ ${safeOpt}<br/><small>[Option Retenue · Arbitrée]</small><br/>${safeRat}"]:::retained`);
	}

	if (relevantStatements.length === 0 && !context?.decision) {
		lines.push(`            c_default["⚙️ Composant Architectural<br/><small>[Container]</small><br/>En cours de délibération"]:::container`);
	} else {
		relevantStatements.forEach((s, idx) => {
			const safeVal = String(s.triplet.value).replace(/["[\]()]/g, '');
			lines.push(`            c_${idx}["⚙️ ${s.triplet.predicate}<br/><small>[Container · ${s.authority.role}]</small><br/>${safeVal}"]:::container`);
		});
	}

	lines.push('        end');
	lines.push('    end');
	lines.push('');
	lines.push('    user -->|"Supervision / Utilisation sécurisée"| SysBound');

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
	const relevantStatements = statements.filter(
		(s) => s.section === subject.section_ref || s.triplet.subject === subject.id
	);

	const lines: string[] = [
		'classDiagram',
		`    class Block_${subject.id.replace(/[^a-zA-Z0-9_]/g, '_')} {`,
		`        <<system>>`,
		`        +section: "${subject.section_ref}"`,
		`        +status: "${subject.level}"`
	];

	if (context?.decision?.retainedOptionTitle) {
		lines.push(`        +retainedOption: "${context.decision.retainedOptionTitle.replace(/"/g, '')}"`);
	}

	relevantStatements.forEach((s) => {
		const safePred = s.triplet.predicate.replace(/[^a-zA-Z0-9_]/g, '_');
		const safeVal = String(s.triplet.value).replace(/[^a-zA-Z0-9_]/g, '_');
		lines.push(`        +${safePred}: ${safeVal}`);
	});

	lines.push('    }');

	return lines.join('\n');
}
