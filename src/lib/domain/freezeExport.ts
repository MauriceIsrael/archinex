import type { Statement, ArchitectRole } from '$lib/types/epistemic';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import { universalSha256 } from '$lib/validation/epistemicEnvelope';
import {
	generateMermaidDiagram,
	generateStructurizrDSL,
	generateSysMLv2,
	generateConfigJSON
} from '$lib/domain/artifactProjections';

export interface ExternalRef {
	raw: string;
	canonical: string; // ex: "KH:ADR-0014@v1.2"
	sha256Seal: string;
}

export interface SealedSnapshot {
	sectionRef: string;
	subjectId: string;
	subjectName: string;
	maturityLevel: string;
	sealedAt: string; // ISO-8601
	sealedBy: {
		name: string;
		role: ArchitectRole;
	};
	sealSha256: string;
	externalRefs: ExternalRef[];
	statements: Statement[];
	projections: {
		mermaid: string;
		structurizrDSL: string;
		sysmlV2: string;
		configJSON: string;
	};
}

export type FreezeGatingViolationCode =
	| 'MATURITY_INSUFFICIENT'
	| 'OPEN_CONFLICT_GATING_VIOLATION'
	| 'UNPROVEN_HYPOTHESIS_PRESENT'
	| 'ROLE_NOT_AUTHORIZED';

export interface FreezeGatingResult {
	allowed: boolean;
	code?: FreezeGatingViolationCode | 'SUCCESS';
	reason?: string;
}

/**
 * Vérifie rigoureusement la barrière d'homologation avant gel d'une section :
 * 1. Niveau >= L3_decided.
 * 2. Zéro conflit d'architecture ouvert.
 * 3. Zéro hypothèse 'assumed' non justifiée.
 * 4. Rôle Lead Architect requis pour scellement officiel.
 */
export function canFreezeSection(
	subject: MaturitySubject,
	draft: TelegraphicDraft,
	statements: Statement[],
	actorRole: ArchitectRole
): FreezeGatingResult {
	if (actorRole !== 'lead_architect' && actorRole !== 'Lead Architect') {
		return {
			allowed: false,
			code: 'ROLE_NOT_AUTHORIZED',
			reason: 'Seul le Lead Architect est habilité à sceller officiellement une section pour homologation.'
		};
	}

	if (subject.level !== 'L3_decided' && subject.level !== 'L4_specified' && subject.level !== 'L5_archived') {
		return {
			allowed: false,
			code: 'MATURITY_INSUFFICIENT',
			reason: `La maturité du sujet (${subject.level}) est insuffisante pour le gel. Un niveau L3_decided minimum est requis.`
		};
	}

	if (draft.conflit && draft.conflit.length > 0) {
		return {
			allowed: false,
			code: 'OPEN_CONFLICT_GATING_VIOLATION',
			reason: `Il subsiste ${draft.conflit.length} conflit(s) ouvert(s) non arbitré(s) sur cette section.`
		};
	}

	const sectionStatements = statements.filter(
		(s) => s.section === subject.section_ref || s.triplet.subject === subject.id
	);

	const hasAssumedStatements = sectionStatements.some(
		(s) => s.status === 'active' && s.maturity.confidence === 'assumed'
	);

	if (hasAssumedStatements) {
		return {
			allowed: false,
			code: 'UNPROVEN_HYPOTHESIS_PRESENT',
			reason: 'La section contient encore des énoncés au statut provisoire "assumed" non étayés par des preuves.'
		};
	}

	return { allowed: true, code: 'SUCCESS' };
}

/**
 * Convertit les références libres en références externes immuables (ExternalRef scellées).
 */
export function convertRefsToImmutable(references: string[]): ExternalRef[] {
	return references.map((ref) => {
		const trimmed = ref.trim();
		let canonical = trimmed;

		// Si pas de version explicite, fige une version d'homologation @v1.0
		if (!canonical.includes('@')) {
			canonical = `${canonical}@v1.0`;
		}

		const sha256Seal = universalSha256(canonical);
		return {
			raw: trimmed,
			canonical,
			sha256Seal
		};
	});
}

/**
 * Gèle officiellement une section et génère le snapshot scellé SHA-256 avec ses projections sans dérive.
 */
export function freezeSectionAndGenerateSnapshot(params: {
	subject: MaturitySubject;
	draft: TelegraphicDraft;
	statements: Statement[];
	authorName: string;
	authorRole: ArchitectRole;
}): SealedSnapshot {
	const externalRefs = convertRefsToImmutable(params.draft.retenu || []);

	const sectionStatements = params.statements.filter(
		(s) => s.section === params.subject.section_ref || s.triplet.subject === params.subject.id
	);

	const projections = {
		mermaid: generateMermaidDiagram(params.subject, params.draft, sectionStatements),
		structurizrDSL: generateStructurizrDSL(params.subject, params.draft, sectionStatements),
		sysmlV2: generateSysMLv2(params.subject, params.draft, sectionStatements),
		configJSON: generateConfigJSON(params.subject, params.draft, sectionStatements)
	};

	const sealedAt = new Date().toISOString();

	// Calcul du condensat cryptographique d'homologation scellant l'ensemble du livrable
	const canonicalPayload = JSON.stringify({
		section: params.subject.section_ref,
		subject: params.subject.id,
		sealedAt,
		externalRefs: externalRefs.map((r) => r.canonical),
		statementsSha: sectionStatements.map((s) => s.id),
		projectionsHash: {
			mermaid: universalSha256(projections.mermaid),
			structurizr: universalSha256(projections.structurizrDSL),
			sysml: universalSha256(projections.sysmlV2),
			config: universalSha256(projections.configJSON)
		}
	});

	const sealSha256 = universalSha256(canonicalPayload);

	return {
		sectionRef: params.subject.section_ref,
		subjectId: params.subject.id,
		subjectName: params.subject.name,
		maturityLevel: params.subject.level,
		sealedAt,
		sealedBy: {
			name: params.authorName,
			role: params.authorRole
		},
		sealSha256,
		externalRefs,
		statements: sectionStatements,
		projections
	};
}
