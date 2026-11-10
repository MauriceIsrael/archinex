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
		views?: Array<{
			id: string;
			name: string;
			itemIds: string[];
		}>;
		scenarios?: Array<{
			id: string;
			name: string;
			description?: string;
			steps: Array<{
				id: string;
				relationRef: string;
				label?: string;
			}>;
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
 * Infère un `kind` d'item Document Engine à partir d'un libellé pour appliquer la charte
 * visuelle native (palette de couleurs et icônes : System, Container, Component, Service, Database, Person).
 */
export function inferKind(label: string): string {
	const l = label.toLowerCase();
	if (/base|donn[ée]es?|bdd|database|storage|stockage|sql|hss|registre/.test(l)) return 'Database';
	if (/service|gateway|passerelle|proxy|agent|dea|secgw|api|microservice/.test(l)) return 'Service';
	if (/person|utilisateur|humain|op[ée]rateur|admin|exploitant|client/.test(l)) return 'Person';
	if (/syst[èe]me|system|c[œo]ur|plateforme|r[ée]seau|network|mme|cloud/.test(l)) return 'System';
	if (/module|serveur|conteneur|container/.test(l)) return 'Container';
	return 'Component';
}

/**
 * Extrait les composants (items) et les flux (relations) d'un schéma Mermaid pour alimenter
 * le graphe sémantique (`projectedGraph`) de Document Engine et générer des figures vectorielles réelles.
 */
export function parseMermaidToGraphElements(
	mermaid: string,
	prefix: string
): {
	items: Array<{
		id: string;
		kind: string;
		layer: 'application';
		attributes: Record<string, unknown>;
	}>;
	relations: Array<{
		id: string;
		kind: string;
		sourceId: string;
		targetId: string;
		provenance: 'fact';
	}>;
} {
	const items: Array<{
		id: string;
		kind: string;
		layer: 'application';
		attributes: Record<string, unknown>;
	}> = [];
	const relations: Array<{
		id: string;
		kind: string;
		sourceId: string;
		targetId: string;
		provenance: 'fact';
	}> = [];
	const seenItems = new Map<string, { id: string; kind: string; layer: 'application'; attributes: Record<string, unknown> }>();

	const getOrCreateItem = (rawId: string, rawLabel?: string) => {
		const cleanId = rawId.trim();
		if (!cleanId || ['SYSTEM', 'direction', 'BANNER', 'PENDING', 'OPT', 'classDef'].includes(cleanId)) return null;
		const itemId = `${prefix}-${cleanId.toLowerCase()}`;
		if (!seenItems.has(itemId)) {
			const labelToClean = rawLabel || cleanId;
			// Séparer le titre principal et le sous-titre éventuel (délimités par <br/> ou <small>)
			const splitParts = labelToClean.split(/<br\s*\/?>/i);
			const cleanName = splitParts[0]
				.replace(/<[^>]*>/g, ' ')
				.replace(/:::[\w-]+/g, '')
				.replace(/\s+/g, ' ')
				.trim();
			const cleanDesc = (splitParts[1] || '')
				.replace(/<[^>]*>/g, ' ')
				.replace(/:::[\w-]+/g, '')
				.replace(/\s+/g, ' ')
				.trim();

			const item = {
				id: itemId,
				kind: inferKind(cleanName || cleanId),
				layer: 'application' as const,
				attributes: {
					name: cleanName || cleanId,
					...(cleanDesc ? { description: cleanDesc } : {})
				}
			};
			seenItems.set(itemId, item);
			items.push(item);
		}
		return seenItems.get(itemId)!;
	};

	const lines = mermaid.split('\n');
	let relCount = 1;
	const arrowRegex = /\s*(?:==>|-->|-\.->|-\.-x|-\.-|---|--x|==)\s*/;

	for (const line of lines) {
		const trimmed = line.trim();
		if (
			!trimmed ||
			trimmed.startsWith('%%') ||
			trimmed.startsWith('subgraph') ||
			trimmed.startsWith('end') ||
			trimmed.startsWith('direction') ||
			trimmed.startsWith('classDef') ||
			trimmed.startsWith('class ')
		)
			continue;

		// 1. Déclarations de nœuds isolés : id["..."] ou id[...] ou id(...)
		const nodeDefMatch = trimmed.match(
			/^([a-zA-Z0-9_-]+)\s*(?:\[(?:"([^"]+)"|([^\]]+))\]|\((?:"([^"]+)"|([^)]+))\))/
		);
		if (nodeDefMatch && !arrowRegex.test(trimmed)) {
			getOrCreateItem(
				nodeDefMatch[1],
				nodeDefMatch[2] || nodeDefMatch[3] || nodeDefMatch[4] || nodeDefMatch[5]
			);
			continue;
		}

		// 2. Lignes avec flèches (simples, enchaînées, interdites ou annotées)
		if (arrowRegex.test(trimmed)) {
			const segments = trimmed.split(arrowRegex);
			let prevItem: ReturnType<typeof getOrCreateItem> = null;

			for (let i = 0; i < segments.length; i++) {
				let seg = segments[i].trim();
				let edgeLabel = 'connecte';

				const edgeLabelMatch = seg.match(/^\|([^|]+)\|\s*(.*)$/);
				if (edgeLabelMatch) {
					edgeLabel = edgeLabelMatch[1].replace(/^["']|["']$/g, '').trim();
					seg = edgeLabelMatch[2].trim();
				}

				const segNodeMatch = seg.match(
					/^([a-zA-Z0-9_-]+)(?:\s*(?:\[(?:"([^"]+)"|([^\]]+))\]|\((?:"([^"]+)"|([^)]+))\)))?/
				);
				if (!segNodeMatch) continue;

				const rawId = segNodeMatch[1];
				const rawLabel =
					segNodeMatch[2] || segNodeMatch[3] || segNodeMatch[4] || segNodeMatch[5] || rawId;
				const currentItem = getOrCreateItem(rawId, rawLabel);

				if (prevItem && currentItem) {
					relations.push({
						id: `${prefix}-rel-${relCount++}`,
						kind: edgeLabel,
						sourceId: prevItem.id,
						targetId: currentItem.id,
						provenance: 'fact'
					});
				}
				prevItem = currentItem;
			}
		}
	}

	return { items, relations };
}

/**
 * Extrait les acteurs, participants, interactions et étapes de phases d'un diagramme de séquence Mermaid (`sequenceDiagram`).
 * Génère les items/relations pour le graphe, la chaîne ordonnée pour `ProjectedScenario` et les lignes tabulaires pour le document Word.
 */
export function parseMermaidSequenceToElements(
	mermaid: string,
	prefix: string
): {
	items: Array<{
		id: string;
		kind: string;
		layer: 'application';
		attributes: Record<string, unknown>;
	}>;
	relations: Array<{
		id: string;
		kind: string;
		sourceId: string;
		targetId: string;
		provenance: 'fact';
	}>;
	scenario: {
		id: string;
		name: string;
		steps: Array<{
			id: string;
			relationRef: string;
			label: string;
		}>;
	};
	tableRows: string[][];
} {
	const items: Array<{
		id: string;
		kind: string;
		layer: 'application';
		attributes: Record<string, unknown>;
	}> = [];
	const relations: Array<{
		id: string;
		kind: string;
		sourceId: string;
		targetId: string;
		provenance: 'fact';
	}> = [];
	const steps: Array<{
		id: string;
		relationRef: string;
		label: string;
	}> = [];
	const tableRows: string[][] = [];

	const seenItems = new Map<string, { id: string; name: string }>();

	const getOrCreateItem = (rawId: string, rawLabel?: string, isActor?: boolean) => {
		const cleanId = rawId.trim();
		if (!cleanId || ['autonumber'].includes(cleanId)) return null;
		const itemId = `${prefix}-${cleanId.toLowerCase()}`;
		if (!seenItems.has(itemId)) {
			const cleanName = (rawLabel || cleanId)
				.replace(/<[^>]*>/g, ' ')
				.replace(/\s+/g, ' ')
				.trim();
			const item = {
				id: itemId,
				kind: isActor ? 'Person' : inferKind(cleanName),
				layer: 'application' as const,
				attributes: {
					name: cleanName
				}
			};
			items.push(item);
			seenItems.set(itemId, { id: itemId, name: cleanName });
		}
		return seenItems.get(itemId)!;
	};

	let currentPhase = 'Processus Nominal';
	let stepCounter = 1;
	const lines = mermaid.split('\n');

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('%%') || trimmed === 'sequenceDiagram' || trimmed === 'autonumber') {
			continue;
		}

		// 1. Détection des acteurs et participants (ex: actor MME as MME Tiers (Lot 3))
		const actorParticipantMatch = trimmed.match(/^(actor|participant)\s+([a-zA-Z0-9_-]+)(?:\s+as\s+(.+))?$/i);
		if (actorParticipantMatch) {
			const isActor = actorParticipantMatch[1].toLowerCase() === 'actor';
			const rawId = actorParticipantMatch[2];
			const rawLabel = actorParticipantMatch[3] || rawId;
			getOrCreateItem(rawId, rawLabel, isActor);
			continue;
		}

		// 2. Détection des Notes de phase (ex: Note over MME,SecGW: Phase 1 : Négociation IKEv2...)
		const noteMatch = trimmed.match(/^Note(?:\s+over\s+[^:]+)?:\s*(.+)$/i);
		if (noteMatch) {
			currentPhase = noteMatch[1].trim();
			continue;
		}

		// 3. Détection des messages et interactions (ex: MME->>SecGW: IKE_SA_INIT..., SecGW-->>MME: SA...)
		// Noter l'utilisation de [a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)* pour éviter d'avaler le premier tiret de -->> ou -->
		const interactionMatch = trimmed.match(
			/^([a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)\s*(?:-->>|->>|-->|->)\s*([a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)\s*:\s*(.+)$/
		);
		if (interactionMatch) {
			const sourceRaw = interactionMatch[1];
			const targetRaw = interactionMatch[2];
			const actionText = interactionMatch[3].trim();

			const sourceItem = getOrCreateItem(sourceRaw, sourceRaw);
			const targetItem = getOrCreateItem(targetRaw, targetRaw);

			if (sourceItem && targetItem) {
				const relationId = `${prefix}-seq-rel-${stepCounter}`;
				relations.push({
					id: relationId,
					kind: actionText.slice(0, 50),
					sourceId: sourceItem.id,
					targetId: targetItem.id,
					provenance: 'fact'
				});

				steps.push({
					id: `step-${stepCounter}`,
					relationRef: relationId,
					label: actionText
				});

				tableRows.push([
					String(stepCounter),
					currentPhase,
					sourceItem.name,
					targetItem.name,
					actionText
				]);

				stepCounter++;
			}
		}
	}

	return {
		items,
		relations,
		scenario: {
			id: `scenario-${prefix}`,
			name: `Chaîne de Déploiement Sécurisée & Homologation`,
			steps
		},
		tableRows
	};
}

/**
 * Traduit un fragment HLD Archinex en blocs de Blueprint conformes au contrat Document Engine.
 */
function fragmentToBlueprintBlocks(
	frag: HldFragment,
	viewId?: string,
	sequenceTableRows?: string[][]
): Array<Record<string, unknown>> {
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

	// 6. Architecture Spécifiée (Diagramme vectoriel C4 natif & code Mermaid)
	if (frag.targetArchitectureMermaid) {
		blocks.push({
			type: 'heading',
			level: 3,
			text: 'Architecture Spécifiée (Topologie C4 & Flux)'
		});
		blocks.push({
			type: 'figure',
			layerId: 'application',
			...(viewId ? { viewRef: viewId } : {}),
			caption: `Architecture Spécifiée — ${frag.title}`,
			altText: `Schéma d'architecture vectoriel illustrant la topologie et les flux pour ${frag.title}`
		});
		blocks.push({
			type: 'code',
			language: 'mermaid',
			content: frag.targetArchitectureMermaid
		});
	}

	// 6.b. Chaîne de Déploiement Sécurisée & Homologation
	if (frag.deploymentSequenceMermaid) {
		blocks.push({
			type: 'heading',
			level: 3,
			text: 'Chaîne de Déploiement Sécurisée & Homologation'
		});
		blocks.push({
			type: 'callout',
			variant: 'info',
			text: 'Séquence ordonnancée des jalons de qualification, de validation cryptographique et d homologation continue.'
		});
		if (sequenceTableRows && sequenceTableRows.length > 0) {
			blocks.push({
				type: 'authored-table',
				caption: `Jalons & Interactions de Déploiement / Homologation — ${frag.title}`,
				headers: ['Étape', 'Phase / Contexte', 'Émetteur', 'Destinataire', 'Opération / Contrôle'],
				rows: sequenceTableRows
			});
		}
		blocks.push({
			type: 'code',
			language: 'mermaid',
			content: frag.deploymentSequenceMermaid
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

	const allItems: DocumentEnginePayload['projectedGraph']['items'] = [];
	const allRelations: DocumentEnginePayload['projectedGraph']['relations'] = [];
	const views: Array<{ id: string; name: string; itemIds: string[] }> = [];
	const allScenarios: NonNullable<DocumentEnginePayload['projectedGraph']['scenarios']> = [];
	const seenItemIds = new Set<string>();

	// Sections 2..N : Chaque sujet d'architecture instruit
	for (const frag of dossier.fragments) {
		const prefix = sanitizeId(frag.subjectId);
		let fragItems: typeof allItems = [];
		let fragRelations: typeof allRelations = [];

		if (frag.targetArchitectureMermaid) {
			const parsed = parseMermaidToGraphElements(frag.targetArchitectureMermaid, prefix);
			fragItems = parsed.items;
			fragRelations = parsed.relations;
		}

		let seqTableRows: string[][] = [];
		if (frag.deploymentSequenceMermaid) {
			const seqParsed = parseMermaidSequenceToElements(frag.deploymentSequenceMermaid, prefix);
			seqTableRows = seqParsed.tableRows;
			if (seqParsed.scenario.steps.length > 0) {
				allScenarios.push(seqParsed.scenario);
			}
			for (const seqIt of seqParsed.items) {
				if (!seenItemIds.has(seqIt.id)) {
					seenItemIds.add(seqIt.id);
					allItems.push(seqIt);
				}
				// Assurer la présence des participants dans les éléments du fragment pour la vue
				if (!fragItems.some((it) => it.id === seqIt.id)) {
					fragItems.push(seqIt);
				}
			}
			fragRelations.push(...seqParsed.relations);
		}

		// Si le diagramme Mermaid n'a pas produit de nœuds, créer des nœuds par défaut
		if (fragItems.length === 0) {
			const subjId = `subj-${prefix}`;
			fragItems.push({
				id: subjId,
				kind: 'System',
				layer: 'application',
				attributes: { name: frag.title }
			});
			if (frag.decision?.retained) {
				const decId = `dec-${prefix}`;
				fragItems.push({
					id: decId,
					kind: 'Service',
					layer: 'application',
					attributes: { name: frag.decision.retained }
				});
				fragRelations.push({
					id: `rel-${prefix}-dec`,
					kind: 'Retient',
					sourceId: subjId,
					targetId: decId,
					provenance: 'fact'
				});
			}
		}

		for (const it of fragItems) {
			if (!seenItemIds.has(it.id)) {
				seenItemIds.add(it.id);
				allItems.push(it);
			}
		}
		allRelations.push(...fragRelations);

		const viewId = `view-${prefix}`;
		views.push({
			id: viewId,
			name: frag.title,
			itemIds: fragItems.map((i) => i.id)
		});

		const secId = `sec-${prefix}-${sanitizeId(frag.title).slice(0, 30)}`;
		sections.push({
			id: secId,
			title: frag.title,
			blocks: fragmentToBlueprintBlocks(frag, viewId, seqTableRows)
		});
	}

	return {
		projectedGraph: {
			items: allItems,
			relations: allRelations,
			views,
			...(allScenarios.length > 0 ? { scenarios: allScenarios } : {})
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
