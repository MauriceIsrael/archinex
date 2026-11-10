import { describe, it, expect } from 'vitest';
import {
	buildDocumentEnginePayload,
	DocumentEngineUnavailableError,
	getDocumentEngineUrl,
	getDocumentStudioUrl
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
		expect(sec1.blocks.some((b) => b.type === 'code' && b.language === 'mermaid')).toBe(true);

		// 3. ProjectedGraph
		expect(payload.projectedGraph.items.length).toBe(1);
		expect(payload.projectedGraph.items[0]).toMatchObject({
			id: 'subj-sub-s6a',
			kind: 'ArchitectureSubject',
			layer: 'application'
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
