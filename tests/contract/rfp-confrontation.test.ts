import { describe, it, expect } from 'vitest';
import {
	shredRfpTextToClauses,
	confrontClausesWithKnowledgeBase,
	SAMPLE_RFP_TEMPLATES
} from '$lib/domain/rfpConfrontation';
import { INITIAL_CORPUS_DOCUMENTS } from '$lib/domain/corpus';
import { SUSE_TELCO_CORPUS, SUSE_TELCO_STATEMENTS } from '$lib/domain/engagements';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';

describe('RFP Shredding & Knowledge Base Confrontation Contract', () => {
	const sampleText = SAMPLE_RFP_TEMPLATES[0].text;
	const fullKnowledgeBase = [...INITIAL_CORPUS_DOCUMENTS, ...SUSE_TELCO_CORPUS];

	it('1. Dépouille un texte de CCTP en clauses et exigences atomiques', () => {
		const clauses = shredRfpTextToClauses(sampleText);

		expect(clauses.length).toBeGreaterThanOrEqual(4);
		expect(clauses[0].clauseRef).toBe('§1.1');
		expect(clauses[0].title).toContain('Hébergement Souverain');
		expect(clauses[0].criticality).toBe('bloquant');

		const ptpClause = clauses.find((c) => c.clauseRef.includes('2.1'));
		expect(ptpClause).toBeDefined();
		expect(ptpClause?.text).toContain('G.8275.1');
		expect(ptpClause?.text).toContain('Holdover');
	});

	it('2. Confronte les exigences au patrimoine de connaissances commun et qualifie la conformité', () => {
		const clauses = shredRfpTextToClauses(sampleText);
		const result = confrontClausesWithKnowledgeBase(
			clauses,
			fullKnowledgeBase,
			SUSE_TELCO_STATEMENTS
		);

		expect(result).toBeDefined();
		expect(result.stats.totalClauses).toBe(clauses.length);
		expect(result.stats.compliantCount).toBeGreaterThanOrEqual(2);
		expect(result.stats.complianceRate).toBeGreaterThan(0);

		// Exigence SecNumCloud / PTP doit être reconnue conforme
		const ptpConfrontation = result.confrontations.find((c) => c.text.includes('G.8275.1'));
		expect(ptpConfrontation).toBeDefined();
		expect(ptpConfrontation?.status).toBe('compliant');
		expect(ptpConfrontation?.matchedDocumentId).toBeDefined();

		// Doit proposer un document amont prêt à être intégré
		expect(result.document.clauses?.length).toBe(clauses.length);
		expect(result.document.category).toBe('cctp');
	});

	it('3. Détecte les conflits et génère automatiquement les sujets d\'arbitrage L0/L1', () => {
		const conflictingText = `Art. 9.1 - Déport Cloud Hors UE
Le plan de contrôle doit envoyer les métriques brutes non chiffrées sur un cluster situé hors UE soumis au Cloud Act sans chiffrement.`;

		const clauses = shredRfpTextToClauses(conflictingText);
		const result = confrontClausesWithKnowledgeBase(clauses, fullKnowledgeBase, []);

		expect(result.stats.conflictCount).toBe(1);
		const conflict = result.confrontations[0];
		expect(conflict.status).toBe('conflict');
		expect(conflict.rationale).toContain('Conflit critique');

		// Le conflit doit avoir généré un sujet d'arbitrage
		expect(result.suggestedInitialSubjects.length).toBe(1);
		expect(result.suggestedInitialSubjects[0].initialConflict).toBeDefined();
		expect(result.suggestedInitialSubjects[0].waitingForRole).toBe('security_architect');
	});

	it('4. Intègre un nouveau sujet de délibération dérivé d\'un écart dans le store actif', () => {
		const initialCount = deliberationStore.subjects.length;

		const created = deliberationStore.addMaturitySubject({
			sectionRef: '§9.4',
			name: 'Controverse Déport Télémétrie',
			waitingForRole: 'security_architect',
			effort: 'L',
			initialRetenu: ['Rejet du déport hors UE non souverain'],
			initialHypothesis: 'Chiffrement de bout en bout et rétention locale',
			initialQuestion: 'Quel protocole de télémétrie souverain déployer ?'
		});

		expect(created.id).toBeDefined();
		expect(deliberationStore.subjects.length).toBe(initialCount + 1);
		expect(deliberationStore.drafts[created.id]).toBeDefined();
		expect(deliberationStore.drafts[created.id].retenu[0]).toContain('Rejet du déport');
	});

	it('5. Décode un binaire PDF sans corrompre le texte en données binaires brutes', async () => {
		const { PDFParse } = await import('pdf-parse');

		// Génération d'un binaire PDF valide avec une clause contractuelle
		const pdfBinary = Buffer.from(
			'%PDF-1.4\n' +
			'1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n' +
			'2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n' +
			'3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >> endobj\n' +
			'4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n' +
			'5 0 obj << /Length 72 >> stream\n' +
			'BT /F1 12 Tf 100 700 Td (Art. 4.2 - Chiffrement SecNumCloud Obligatoire) Tj ET\n' +
			'endstream\n' +
			'endobj\n' +
			'xref\n' +
			'0 6\n' +
			'0000000000 65535 f \n' +
			'0000000009 00000 n \n' +
			'0000000058 00000 n \n' +
			'0000000115 00000 n \n' +
			'0000000244 00000 n \n' +
			'0000000323 00000 n \n' +
			'trailer << /Size 6 /Root 1 0 R >>\n' +
			'startxref\n' +
			'445\n' +
			'%%EOF'
		);

		const parser = new PDFParse({ data: pdfBinary });
		const result = await parser.getText();
		const extractedText = (result.text || '').trim();
		await parser.destroy();

		// Le texte extrait ne doit JAMAIS contenir d'en-tête binaire %PDF- ni de marqueurs d'objets
		expect(extractedText).not.toContain('%PDF-1.4');
		expect(extractedText).not.toContain('endobj');
		expect(extractedText).toContain('Chiffrement SecNumCloud Obligatoire');

		// Ce texte propre est immédiatement exploitable par le découpeur de clauses
		const clauses = shredRfpTextToClauses(extractedText);
		expect(clauses.length).toBeGreaterThanOrEqual(1);
		expect(clauses[0].criticality).toBe('bloquant');
	});
});
