import { describe, it, expect } from 'vitest';
import {
	buildDocumentEnginePayload,
	DocumentEngineUnavailableError,
	getDocumentEngineUrl,
	getDocumentStudioUrl,
	parseMermaidToGraphElements
} from '$lib/server/projects/documentEngineBridge';
import type { ProjectHldDossier } from '$lib/server/projects/hldFragmentDb';
import type { HldFragment } from '$lib/domain/hldFragment';

describe('Passerelle Document Engine (Bridge)', () => {
	const mockFragment: HldFragment = {
		subjectId: 'sub-s6a',
		title: '§14.5 Médiation & Sécurisation Roaming S6a',
		status: 'decided',
		statusLabel: 'Tranché',
		control: [{ label: 'Décideur', value: 'lead_architect' }],
		synthesis: {
			headline: 'Interconnexion sécurisée par passerelle SecGW IPsec ESP et filtrage DEA',
			details: ['Chiffrement obligatoire', 'Aucun flux direct MME -> HSS autorisé']
		},
		context: {
			problem: 'Comment garantir l étanchéité du cœur 5G/4G face aux opérateurs partenaires en roaming ?',
			dependsOn: ['Choix du site']
		},
		requirements: {
			items: [
				{
					id: 'req-1',
					clauseRef: 'REQ-Lot1-35',
					title: 'Terminaison IPsec SecGW',
					criticality: 'bloquant'
				}
			],
			unresolvedRefs: [],
			dossierPresent: true
		},
		drivers: [{ name: 'Sécurité Régalienne', kind: 'security', weight: 5 }],
		options: [
			{
				id: 'opt-ipsec',
				title: 'SecGW + DEA Dédié',
				summary: 'Chiffrement AES-256-GCM et filtrage AVP Diameter',
				status: 'retained',
				proposedByModel: false,
				scores: [{ criterion: 'Sécurité', score: 2, justification: 'Conforme PSSI' }],
				weightedScore: 2
			}
		],
		decision: {
			retained: 'SecGW + DEA Dédié',
			rationale: 'Seule solution opposable face à l ANSSI',
			yStatement: 'Pour le roaming S6a, nous avons retenu « SecGW + DEA Dédié » afin de garantir l étanchéité.',
			reversibility: 'reversible'
		},
		consequences: {
			acceptedRisks: ['Surcoût licences SecGW'],
			acceptedViolations: [],
			coverageWarnings: []
		},
		openPoints: [],
		provenance: {
			modelProposedOptions: 0,
			humanOptions: 1,
			modelEvaluations: 0,
			humanEvaluations: 1
		},
		targetArchitectureMermaid: 'flowchart TD\n  MME --> SecGW --> DEA --> HSS',
		generatedAt: '2026-11-10T12:00:00.000Z'
	};

	const mockDossier: ProjectHldDossier = {
		projectId: 'proj-roaming-demo',
		projectTitle: 'Programme Souverain Télécom',
		markdown: '# HLD\nContenu',
		fragments: [mockFragment],
		generatedAt: '2026-11-10T12:00:00.000Z'
	};

	it('génère un payload valide et strictement conforme au schéma Document Engine', () => {
		const payload = buildDocumentEnginePayload(mockDossier);

		// 1. Contexte de génération
		expect(payload.generationContext).toMatchObject({
			author: 'Archinex Lead Architect',
			date: '2026-11-10',
			project: {
				name: 'Programme Souverain Télécom',
				version: '1.0.0'
			}
		});

		// 2. Blueprint
		expect(payload.blueprint.version).toBe('1.0');
		expect(payload.blueprint.documentType).toBe('hld');
		expect(payload.blueprint.sections.length).toBe(2);

		// Section 0 : Cadrage
		const sec0 = payload.blueprint.sections[0];
		expect(sec0.id).toBe('cadrage-dossier-hld');
		expect(sec0.blocks[1]).toMatchObject({
			type: 'authored-table',
			caption: 'Synthèse des métadonnées du dossier',
			headers: ['Propriété', 'Valeur']
		});

		// Section 1 : Sujet S6a
		const sec1 = payload.blueprint.sections[1];
		expect(sec1.title).toBe(mockFragment.title);
		expect(sec1.blocks.some((b) => b.type === 'callout' && b.variant === 'decision')).toBe(true);
		expect(sec1.blocks.some((b) => b.type === 'authored-table' && b.caption?.toString().includes('Exigences'))).toBe(true);
		// Vérification du bloc Figure vectoriel et du bloc code Mermaid
		const figureBlock = sec1.blocks.find((b) => b.type === 'figure');
		expect(figureBlock).toMatchObject({
			type: 'figure',
			layerId: 'application',
			viewRef: 'view-sub-s6a'
		});
		expect(sec1.blocks.some((b) => b.type === 'code' && b.language === 'mermaid')).toBe(true);

		// 3. ProjectedGraph (Extraction sémantique des composants et flux du schéma)
		expect(payload.projectedGraph.items.length).toBe(4);
		expect(payload.projectedGraph.items.map((i) => i.id)).toEqual([
			'sub-s6a-mme',
			'sub-s6a-secgw',
			'sub-s6a-dea',
			'sub-s6a-hss'
		]);
		expect(payload.projectedGraph.relations.length).toBe(3);
		expect(payload.projectedGraph.views).toEqual([
			{
				id: 'view-sub-s6a',
				name: mockFragment.title,
				itemIds: ['sub-s6a-mme', 'sub-s6a-secgw', 'sub-s6a-dea', 'sub-s6a-hss']
			}
		]);
	});

	it('extrait fidèlement les composants et flux depuis un diagramme Mermaid complexe', () => {
		const mmd = `flowchart TD
			subgraph SYSTEM["Système : Cœur Roaming"]
				MME["MME (Opérateur Visité)"]
				SecGW["SecGW IPsec ESP"]
				DEA["DEA (Diameter Edge Agent)"]
				HSS["HSS Base Profils"]
			end
			MME -->|Flux Roaming S6a| SecGW
			SecGW -->|Trafic Déchiffré| DEA
			DEA -->|Requête Filtrée| HSS`;

		const { items, relations } = parseMermaidToGraphElements(mmd, 'demo');
		expect(items).toHaveLength(4);
		expect(items[0]).toMatchObject({ id: 'demo-mme', kind: 'Person' });
		expect(items[1]).toMatchObject({ id: 'demo-secgw', kind: 'Service' });
		expect(items[2]).toMatchObject({ id: 'demo-dea', kind: 'Service' });
		expect(items[3]).toMatchObject({ id: 'demo-hss', kind: 'Database' });

		expect(relations).toHaveLength(3);
		expect(relations[0]).toMatchObject({
			sourceId: 'demo-mme',
			targetId: 'demo-secgw',
			kind: 'Flux Roaming S6a'
		});
		expect(relations[1]).toMatchObject({
			sourceId: 'demo-secgw',
			targetId: 'demo-dea',
			kind: 'Trafic Déchiffré'
		});
	});

	it('gère les schémas multi-zones avec sous-titres HTML, flèches épaisses et interdictions', () => {
		const userMmd = `flowchart TB
			classDef boundary fill:#f8f9fa
			subgraph LOT3["Réseau Tiers (Lot 3)"]
				MME_Lot3["📡 MME Tiers<br/><small>Initie les requêtes S6a</small>"]:::ext
			end
			subgraph DMZ_LOT1["DMZ Frontière (Lot 1)"]
				SecGW_Lot1["🛡️ SecGW-Lot1<br/><small>Terminaison IPsec ESP</small>"]:::core
				DEA_Lot1["🔍 DEA-Lot1<br/><small>Médiation S6a</small>"]:::agent
			end
			subgraph CORE_LOT1["Cœur Sécurisé (Lot 1)"]
				HSS_Lot1["🔐 HSS-Lot1<br/><small>Bases abonnés AKA</small>"]:::core
			end
			MME_Lot3 ==>|"1. Tunnel IPsec ESP chiffré"| SecGW_Lot1
			SecGW_Lot1 -->|"2. Flux Diameter décapsulé"| DEA_Lot1
			DEA_Lot1 -->|"3. Requête médiée"| HSS_Lot1
			MME_Lot3 -.-x|"⛔ INTERDIT : Flux direct"| HSS_Lot1`;

		const { items, relations } = parseMermaidToGraphElements(userMmd, 'sec-8');
		expect(items).toHaveLength(4);
		expect(items[0]).toMatchObject({
			id: 'sec-8-mme_lot3',
			attributes: {
				name: '📡 MME Tiers',
				description: 'Initie les requêtes S6a'
			}
		});
		expect(items[1]).toMatchObject({
			id: 'sec-8-secgw_lot1',
			attributes: {
				name: '🛡️ SecGW-Lot1',
				description: 'Terminaison IPsec ESP'
			}
		});
		// 4 flux dont 1 avec ==>, 2 avec --> et 1 avec -.-x
		expect(relations).toHaveLength(4);
		expect(relations[0].kind).toBe('1. Tunnel IPsec ESP chiffré');
		expect(relations[3].kind).toBe('⛔ INTERDIT : Flux direct');
		expect(relations[3]).toMatchObject({
			sourceId: 'sec-8-mme_lot3',
			targetId: 'sec-8-hss_lot1'
		});
	});

	it('formate correctement les erreurs de disponibilité de Document Engine', () => {
		const err = new DocumentEngineUnavailableError('http://localhost:3001');
		expect(err.name).toBe('DocumentEngineUnavailableError');
		expect(err.message).toContain('http://localhost:3001');
		expect(err.message).toContain('npm run server');
	});

	it('résout les URLs par défaut de Document Engine et Document Studio', () => {
		expect(getDocumentEngineUrl()).toContain('3001');
		expect(getDocumentStudioUrl()).toContain('5174');
	});

	it('normalise les URLs en supprimant les slashs de fin accidentels', () => {
		const prevEngine = process.env.DOCUMENT_ENGINE_URL;
		const prevStudio = process.env.DOCUMENT_STUDIO_URL;
		try {
			process.env.DOCUMENT_ENGINE_URL = 'http://localhost:3001///';
			process.env.DOCUMENT_STUDIO_URL = 'http://localhost:5174/';
			expect(getDocumentEngineUrl()).toBe('http://localhost:3001');
			expect(getDocumentStudioUrl()).toBe('http://localhost:5174');
		} finally {
			if (prevEngine !== undefined) process.env.DOCUMENT_ENGINE_URL = prevEngine;
			else delete process.env.DOCUMENT_ENGINE_URL;
			if (prevStudio !== undefined) process.env.DOCUMENT_STUDIO_URL = prevStudio;
			else delete process.env.DOCUMENT_STUDIO_URL;
		}
	});

	it('compile un livrable réel (.docx et .md) face à Document Engine lorsque le service est démarré', async () => {
		const { compileDossierWithDocumentEngine, checkDocumentEngineHealth } = await import('$lib/server/projects/documentEngineBridge');
		const health = await checkDocumentEngineHealth(1000);
		if (!health.available) {
			console.log('[test skipped] Document Engine non actif sur le port 3001');
			return;
		}

		// 1. Markdown
		const mdResult = await compileDossierWithDocumentEngine(mockDossier, 'markdown');
		expect(mdResult.contentType).toMatch(/text\/(markdown|plain)/);
		const mdText = Buffer.from(mdResult.buffer).toString('utf-8');
		expect(mdText).toContain('# HLD');
		expect(mdText).toContain('Programme Souverain Télécom');

		// 2. DOCX
		const docxResult = await compileDossierWithDocumentEngine(mockDossier, 'docx');
		expect(docxResult.contentType).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
		expect(docxResult.buffer.byteLength).toBeGreaterThan(1000);
		expect(docxResult.filename).toContain('.docx');
	});
});
