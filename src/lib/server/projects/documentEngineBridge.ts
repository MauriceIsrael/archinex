import type { ProjectHldDossier } from './hldFragmentDb';
import type { HldFragment } from '$lib/domain/hldFragment';

export interface DocumentEngineContext {
	author: string;
	date: string;
	project: {
		name: string;
		version: string;
	};
}

export interface DocumentEnginePayload {
	projectedGraph: {
		items: Array<{
			id: string;
			kind: string;
			layer: 'context' | 'application' | 'component' | 'infrastructure' | 'iaas';
			attributes: Record<string, unknown>;
		}>;
		relations: Array<{
			id: string;
			kind: string;
			sourceId: string;
			targetId: string;
			provenance: 'fact' | 'presumption';
		}>;
	};
	blueprint: {
		version: string;
		documentType: string;
		expectedContext: Record<string, string>;
		sections: Array<{
			id: string;
			title: string;
			blocks: Array<Record<string, unknown>>;
		}>;
	};
	generationContext: DocumentEngineContext;
}

export class DocumentEngineUnavailableError extends Error {
	constructor(public readonly url: string, cause?: unknown) {
		super(
			`Document Engine n'est pas joignable sur ${url}. Veuillez vérifier qu'il est bien démarré (commande : 'npm run server' dans document-engine).`
		);
		this.name = 'DocumentEngineUnavailableError';
		if (cause) this.cause = cause;
	}
}

export function getDocumentEngineUrl(): string {
	return (process.env.DOCUMENT_ENGINE_URL?.trim() || 'http://localhost:3001').replace(/\/+$/, '');
}

export function getDocumentStudioUrl(): string {
	return (process.env.DOCUMENT_STUDIO_URL?.trim() || 'http://localhost:5174').replace(/\/+$/, '');
}

function sanitizeId(str: string): string {
	return str
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-|-$/g, '')
		.toLowerCase() || 'section';
}

/**
 * Traduit un fragment HLD Archinex en blocs de Blueprint conformes au contrat Document Engine.
 */
function fragmentToBlueprintBlocks(frag: HldFragment): Array<Record<string, unknown>> {
	const blocks: Array<Record<string, unknown>> = [];

	// 1. Décision / Statut
	if (frag.decision?.yStatement) {
		blocks.push({
			type: 'callout',
			variant: frag.status === 'decided' ? 'decision' : 'warning',
			text: frag.decision.yStatement
		});
	} else {
		blocks.push({
			type: 'callout',
			variant: 'warning',
			text: `Statut de délibération : ${frag.statusLabel}. Décision en cours d'instruction.`
		});
	}

	// 2. Synthèse & En bref
	blocks.push({
		type: 'heading',
		level: 3,
		text: 'Synthèse du Sujet'
	});
	blocks.push({
		type: 'callout',
		variant: 'info',
		text: frag.synthesis.headline
	});
	if (frag.synthesis.details.length) {
		blocks.push({
			type: 'list',
			style: 'unordered',
			items: frag.synthesis.details
		});
	}

	// 3. Contexte & Problème
	blocks.push({
		type: 'heading',
		level: 3,
		text: 'Contexte et Problématique'
	});
	blocks.push({
		type: 'callout',
		variant: 'info',
		text: frag.context.problem
	});

	if (frag.context.dependsOn.length) {
		blocks.push({
			type: 'list',
			style: 'unordered',
			items: frag.context.dependsOn.map((d) => `À trancher avant : ${d}`)
		});
	}

	// 4. Exigences Couvertes
	if (frag.requirements.items.length) {
		blocks.push({
			type: 'heading',
			level: 3,
			text: 'Exigences Couvertes'
		});
		blocks.push({
			type: 'authored-table',
			caption: `Exigences du RFP rattachées au sujet ${frag.title}`,
			headers: ['Exigence', 'Intitulé', 'Criticité'],
			rows: frag.requirements.items.map((r) => [r.clauseRef, r.title, r.criticality])
		});
	}

	// 5. Options Étudiées
	if (frag.options.length) {
		blocks.push({
			type: 'heading',
			level: 3,
			text: 'Options Étudiées & Arbitrages'
		});
		for (const opt of frag.options) {
			const tag = opt.status === 'retained' ? ' [RETENUE]' : opt.status === 'rejected' ? ' [ÉCARTÉE]' : '';
			blocks.push({
				type: 'callout',
				variant: opt.status === 'retained' ? 'decision' : 'info',
				text: `${opt.title}${tag} : ${opt.summary}`
			});
			if (opt.scores.length) {
				blocks.push({
					type: 'authored-table',
					caption: `Évaluation multicritère : ${opt.title}`,
					headers: ['Critère', 'Score', 'Justification'],
					rows: opt.scores.map((s) => [s.criterion, String(s.score), s.justification || '—'])
				});
			}
		}
	}

	// 6. Architecture Spécifiée (Mermaid C4)
	if (frag.targetArchitectureMermaid) {
		blocks.push({
			type: 'heading',
			level: 3,
			text: 'Architecture Spécifiée (Topologie C4 & Flux)'
		});
		blocks.push({
			type: 'code',
			language: 'mermaid',
			content: frag.targetArchitectureMermaid
		});
	}

	// 7. Conséquences & Risques acceptés
	if (frag.consequences.acceptedViolations.length || frag.consequences.acceptedRisks.length) {
		blocks.push({
			type: 'heading',
			level: 3,
			text: 'Conséquences & Risques Acceptés'
		});
		const items = [
			...frag.consequences.acceptedViolations.map((v) => `Écart accepté : ${v}`),
			...frag.consequences.acceptedRisks.map((r) => `Risque accepté : ${r}`)
		];
		blocks.push({
			type: 'list',
			style: 'unordered',
			items
		});
	}

	// 8. Points Ouverts
	if (frag.openPoints.length) {
		blocks.push({
			type: 'heading',
			level: 3,
			text: 'Points Ouverts'
		});
		blocks.push({
			type: 'list',
			style: 'unordered',
			items: frag.openPoints
		});
	}

	return blocks;
}

/**
 * Construit le payload complet pour l'API `/compile/*` de Document Engine
 * à partir du dossier HLD assemblé sous Archinex.
 */
export function buildDocumentEnginePayload(dossier: ProjectHldDossier): DocumentEnginePayload {
	const now = dossier.generatedAt.slice(0, 10);

	const sections: Array<{ id: string; title: string; blocks: Array<Record<string, unknown>> }> = [];

	// Section 1 : Cadrage et Métadonnées
	sections.push({
		id: 'cadrage-dossier-hld',
		title: 'Cadrage & Métadonnées du Dossier HLD',
		blocks: [
			{
				type: 'callout',
				variant: 'info',
				text: `Dossier de Conception d'Architecture de Haut Niveau (HLD) pour le projet « ${dossier.projectTitle} », généré sans dérive documentaire depuis les arbitrages et décisions enregistrés dans Archinex.`
			},
			{
				type: 'authored-table',
				caption: 'Synthèse des métadonnées du dossier',
				headers: ['Propriété', 'Valeur'],
				rows: [
					['Projet', dossier.projectTitle],
					['Identifiant Projet', dossier.projectId],
					['Sujets d Architecture', `${dossier.fragments.length}`],
					['Généré le', now]
				]
			}
		]
	});

	// Sections 2..N : Chaque sujet d'architecture instruit
	for (const frag of dossier.fragments) {
		const secId = `sec-${sanitizeId(frag.subjectId)}-${sanitizeId(frag.title).slice(0, 30)}`;
		sections.push({
			id: secId,
			title: frag.title,
			blocks: fragmentToBlueprintBlocks(frag)
		});
	}

	return {
		projectedGraph: {
			items: dossier.fragments.map((frag) => ({
				id: `subj-${frag.subjectId}`,
				kind: 'ArchitectureSubject',
				layer: 'application',
				attributes: {
					title: frag.title,
					status: frag.status,
					statusLabel: frag.statusLabel
				}
			})),
			relations: []
		},
		blueprint: {
			version: '1.0',
			documentType: 'hld',
			expectedContext: {
				Author: 'string',
				Date: 'date',
				'Project.Name': 'string',
				'Project.Version': 'string'
			},
			sections
		},
		generationContext: {
			author: 'Archinex Lead Architect',
			date: now,
			project: {
				name: dossier.projectTitle,
				version: '1.0.0'
			}
		}
	};
}

/**
 * Vérifie l'accessibilité du service Document Engine.
 */
export async function checkDocumentEngineHealth(timeoutMs = 1500): Promise<{ available: boolean; url: string }> {
	const url = getDocumentEngineUrl();
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		const res = await fetch(`${url}/fixtures/graphs`, {
			method: 'GET',
			signal: controller.signal
		});
		clearTimeout(timer);
		return { available: res.ok, url };
	} catch {
		return { available: false, url };
	}
}

/**
 * Invoque l'API de Document Engine pour compiler le dossier HLD vers DOCX, Markdown ou PDF.
 */
export async function compileDossierWithDocumentEngine(
	dossier: ProjectHldDossier,
	format: 'docx' | 'markdown' | 'pdf' = 'docx'
): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }> {
	const url = getDocumentEngineUrl();
	const payload = buildDocumentEnginePayload(dossier);

	const sanitizedProject = sanitizeId(dossier.projectTitle || dossier.projectId);
	const filename = `hld-${sanitizedProject}-${dossier.generatedAt.slice(0, 10)}.${format === 'markdown' ? 'md' : format}`;

	const endpoint = `${url}/compile/${format}`;

	let res: Response;
	try {
		res = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
	} catch (err) {
		throw new DocumentEngineUnavailableError(url, err);
	}

	if (!res.ok) {
		const errorText = await res.text().catch(() => '');
		throw new Error(`Erreur Document Engine (${res.status} ${res.statusText}) : ${errorText || 'Compilation échouée'}`);
	}

	const buffer = await res.arrayBuffer();
	const contentType =
		res.headers.get('content-type') ||
		(format === 'docx'
			? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
			: format === 'pdf'
				? 'application/pdf'
				: 'text/markdown; charset=utf-8');

	return {
		buffer,
		contentType,
		filename
	};
}
