import type { Statement, ArchitectRole } from '$lib/types/epistemic';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import { universalSha256 } from '$lib/validation/epistemicEnvelope';
import { canonicalJson } from '$lib/domain/canonicalJson';
import {
	generateMermaidDiagram,
	generateStructurizrDSL,
	generateSysMLv2,
	generateConfigJSON
} from '$lib/domain/artifactProjections';

/**
 * Référence vers la base de connaissance, au motif `{type}:{slug}` de la suite (ex. `knowledge-hub:adr-0014`).
 * `version` est celle que l'auteur a ÉCRITE (`KH:ADR-0014@v1.2`), jamais une version inventée : le Hub ne publie pas encore de
 * coordonnée de version par élément. Tant que ce n'est pas le cas, `citable` reste faux : une référence sans version
 * résolue n'est pas citable dans un document figé (ADR-KH-01 D3).
 */
export interface ExternalRef {
	raw: string;
	canonical: string; // ex: "knowledge-hub:adr-0014"
	version: string | null; // déclarée par l'auteur, non vérifiée auprès du Hub
	citable: boolean;
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
	/** Profil de sérialisation du sceau ; absent sur les anciens snapshots (sceau couvrant seulement les identifiants). */
	sealProfile?: 'canonical-json-v1';
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
		const raw = ref.trim();
		const [identity, ...rest] = raw.split('@');
		const declared = rest.join('@').trim();
		const bare = identity.replace(/^(kh|knowledge-hub):/i, '').trim();
		// Jamais de version fabriquée : sans `@version` écrite par l'auteur, la référence reste sans version (non citable).
		const canonical = `knowledge-hub:${bare.toLowerCase()}`;
		return {
			raw,
			canonical,
			version: declared || null,
			citable: false,
			sha256Seal: universalSha256(canonicalJson({ canonical, version: declared || null }))
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
	/** Horodatage du scellement (injectable pour les tests) ; par défaut l'instant courant. */
	now?: Date;
}): SealedSnapshot {
	const externalRefs = convertRefsToImmutable(params.draft.retenu || []);

	const sectionStatements = params.statements.filter(
		(s) => s.section === params.subject.section_ref || s.triplet.subject === params.subject.id
	);

	const sealedAt = (params.now ?? new Date()).toISOString();

	const projections = {
		mermaid: generateMermaidDiagram(params.subject, params.draft, sectionStatements),
		structurizrDSL: generateStructurizrDSL(params.subject, params.draft, sectionStatements),
		sysmlV2: generateSysMLv2(params.subject, params.draft, sectionStatements),
		configJSON: generateConfigJSON(params.subject, params.draft, sectionStatements, sealedAt)
	};


	// Calcul du condensat cryptographique d'homologation scellant l'ensemble du livrable
	// Le sceau couvre le CONTENU : chaque énoncé y entre par l'empreinte de sa forme canonique, pas seulement par son
	// identifiant (un énoncé modifié sous le même identifiant doit changer le sceau). Sérialisation au profil de la suite.
	const canonicalPayload = canonicalJson({
		section: params.subject.section_ref,
		subject: params.subject.id,
		sealedAt,
		externalRefs: externalRefs.map((r) => ({ canonical: r.canonical, version: r.version })),
		statements: sectionStatements.map((st) => ({ id: st.id, sha256: universalSha256(canonicalJson(st)) })),
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
		sealProfile: 'canonical-json-v1',
		externalRefs,
		statements: sectionStatements,
		projections
	};
}
