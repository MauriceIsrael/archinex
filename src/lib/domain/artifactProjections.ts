import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';

/**
 * Génère le diagramme d'architecture Mermaid normalisé à partir des faits prouvés (No Doc Drift).
 */
export function generateMermaidDiagram(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[]
): string {
	const relevantStatements = statements.filter(
		(s) => s.section === subject.section_ref || s.triplet.subject === subject.id
	);

	const lines: string[] = [
		'flowchart TD',
		`    subgraph "${subject.section_ref} · ${subject.name}"`
	];

	if (relevantStatements.length === 0) {
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
	}

	lines.push('    end');
	return lines.join('\n');
}

/**
 * Génère la spécification C4 au format Structurizr DSL (.dsl).
 */
export function generateStructurizrDSL(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[]
): string {
	const relevantStatements = statements.filter(
		(s) => s.section === subject.section_ref || s.triplet.subject === subject.id
	);

	const elements: string[] = [];
	relevantStatements.forEach((s) => {
		const safeId = s.id.replace(/[^a-zA-Z0-9_]/g, '_');
		const safeDesc = String(s.triplet.value).replace(/"/g, '\\"');
		elements.push(`            ${safeId} = container "${s.triplet.predicate}" "${safeDesc}" "Verified Architecture"`);
	});

	return `workspace "${subject.name}" "Projeté sans dérive depuis Archinex" {
    model {
        user = person "Opérateur Réseau" "Supervise les communications critiques"
        enterprise "Infrastructure Critiques" {
            system = softwareSystem "${subject.name}" {
${elements.join('\n')}
            }
        }
        user -> system "Opère via protocole sécurisé"
    }
    views {
        systemContext system "Context_${subject.id}" {
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
	statements: Statement[]
): string {
	const relevantStatements = statements.filter(
		(s) => s.section === subject.section_ref || s.triplet.subject === subject.id
	);

	const parts: string[] = [];
	relevantStatements.forEach((s) => {
		const safeName = s.triplet.predicate.replace(/[^a-zA-Z0-9_]/g, '_');
		parts.push(`    part def ${safeName} {`);
		parts.push(`        attribute specification : String = "${String(s.triplet.value).replace(/"/g, '\\"')}";`);
		parts.push(`        attribute confidence : String = "${s.maturity.confidence}";`);
		parts.push(`    }`);
	});

	return `package '${subject.name}' {
    doc /* Projeté sans doc drift depuis Archinex snapshot scellé */
${parts.join('\n')}
}`;
}

/**
 * Génère la configuration opérationnelle JSON (No Doc Drift).
 */
export function generateConfigJSON(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[]
): string {
	const holdoverStmt = statements.find((s) => s.triplet.predicate.includes('holdover'));
	const powerStmt = statements.find((s) => s.triplet.predicate.includes('power'));

	const config = {
		profile: 'IEEE_1588_G8275_1',
		sectionRef: subject.section_ref,
		subjectId: subject.id,
		parameters: {
			domainNumber: 24,
			clockClass: holdoverStmt ? 6 : 7,
			holdoverSpec: holdoverStmt ? String(holdoverStmt.triplet.value) : '24h',
			powerRedundancy: powerStmt ? String(powerStmt.triplet.value) : 'Single_feed',
			transport: 'Ethernet_Multicast',
			twoStepFlag: true
		},
		provenance: {
			sealedEngine: 'Archinex Deliberation Workbench',
			generatedAt: new Date().toISOString(),
			enforcedTruth: true
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
	statements: Statement[]
): string {
	const relevantStatements = statements.filter(
		(s) => s.section === subject.section_ref || s.triplet.subject === subject.id
	);

	const lines: string[] = [
		'flowchart TB',
		'    classDef person fill:#08427b,stroke:#073b6e,color:#fff,font-weight:bold',
		'    classDef system fill:#1168bd,stroke:#0b4884,color:#fff,font-weight:bold',
		'    classDef container fill:#438dd5,stroke:#2e6295,color:#fff',
		'',
		'    user["👤 Opérateur Réseau<br/><small>[Personne]</small><br/>Supervise les flux"]:::person',
		'',
		`    subgraph Enterprise["🏢 Entreprise : Infrastructure Critique"]`,
		`        subgraph SysBound["Système : ${subject.name}"]`,
		`            direction TB`
	];

	if (relevantStatements.length === 0) {
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
	lines.push('    user -->|"Supervision sécurisée mTLS"| SysBound');

	return lines.join('\n');
}

/**
 * Génère une projection visuelle SysML v2 interprétable sous forme de diagramme de blocs (BDD).
 */
export function generateSysMLVisualMermaid(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[]
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

	relevantStatements.forEach((s) => {
		const safePred = s.triplet.predicate.replace(/[^a-zA-Z0-9_]/g, '_');
		const safeVal = String(s.triplet.value).replace(/[^a-zA-Z0-9_]/g, '_');
		lines.push(`        +${safePred}: ${safeVal}`);
	});

	lines.push('    }');

	return lines.join('\n');
}
