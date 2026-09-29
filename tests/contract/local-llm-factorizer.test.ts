import { describe, it, expect, vi } from 'vitest';
import { LocalLlmClient, localLlmClient } from '../../src/lib/server/llm/localLlmClient';
import {
	buildSystemPrompt,
	buildUserMessage,
	fallbackDeterministicFactorization,
	promoteClauseToSubject,
	factorizeRfpWithLocalLlm,
	DEFAULT_KB_STANDARDS
} from '../../src/lib/server/llm/rfpFactorizer';
import type { ExtractedClause } from '../../src/lib/domain/corpus';

describe('Local LLM Souverain (raptor-nino) & Factorisation de RFP', () => {
	const client = new LocalLlmClient({ endpoint: 'http://raptor-nino:11434' });

	const sampleClauses: ExtractedClause[] = [
		{
			id: 'c-1',
			clauseRef: '§1.1',
			title: 'Hébergement Souverain et Immunité Juridique',
			text: 'L infrastructure doit être qualifiée SecNumCloud 3.2 avec immunité Cloud Act.',
			criticality: 'bloquant',
			impactSummary: 'Souveraineté'
		},
		{
			id: 'c-2',
			clauseRef: '§2.1',
			title: 'Synchronisation PTP IEEE 1588v2',
			text: 'Précision temporelle de phase sub-1.5 microseconde et maintien autonome 30 jours sans GNSS.',
			criticality: 'bloquant',
			impactSummary: 'Télécoms'
		},
		{
			id: 'c-3',
			clauseRef: '§3.4',
			title: 'Accélération UPF et SR-IOV',
			text: 'Plan de données accéléré par DPDK/SR-IOV sans contention.',
			criticality: 'majeur',
			impactSummary: 'Performance'
		},
		{
			id: 'c-4',
			clauseRef: '§4.2',
			title: 'Chiffrement TLS 1.3 et Homologation ANSSI',
			text: 'Toutes les liaisons inter-sites chiffrées selon les recommandations ANSSI.',
			criticality: 'bloquant',
			impactSummary: 'Sécurité'
		}
	];

	describe('1. Sécurité Réseau & Air-Gap Souverain', () => {
		it('autorise raptor-nino:11434 et les hôtes intranet', () => {
			expect(client.isLocalNetworkUrl('http://raptor-nino:11434')).toBe(true);
			expect(client.isLocalNetworkUrl('http://raptor-nino:11434/api/chat')).toBe(true);
			expect(client.isLocalNetworkUrl('http://127.0.0.1:11434')).toBe(true);
			expect(client.isLocalNetworkUrl('http://localhost:8000')).toBe(true);
			expect(client.isLocalNetworkUrl('http://192.168.1.100:11434')).toBe(true);
		});

		it('bloque rigoureusement tout appel vers les clouds publics', () => {
			expect(client.isLocalNetworkUrl('https://api.openai.com/v1/chat/completions')).toBe(false);
			expect(client.isLocalNetworkUrl('https://europe-west1-run.googleapis.com')).toBe(false);
			expect(client.isLocalNetworkUrl('https://api.anthropic.com')).toBe(false);
			expect(client.isLocalNetworkUrl('https://llmops.run.app')).toBe(false);
		});
	});

	describe('2. Moteur de Factorisation & Prompting Modifiable', () => {
		it('construit un prompt système d orientation architecturale avec directives libres', () => {
			const prompt = buildSystemPrompt('Insister impérativement sur la résilience déconnectée et le maintien Holdover.');
			expect(prompt).toContain('FACTORISATION SÉMANTIQUE');
			expect(prompt).toContain('NE PAS CRÉER UN SUJET PAR EXIGENCE');
			expect(prompt).toContain('DIRECTIVES PARTICULIÈRES');
			expect(prompt).toContain('résilience déconnectée');
		});

		it('génère le message utilisateur avec les clauses brutes et l index KB', () => {
			const userMsg = buildUserMessage(sampleClauses, DEFAULT_KB_STANDARDS);
			expect(userMsg).toContain('PATRIMOINE COMMUN');
			expect(userMsg).toContain('STD-SOUV-01');
			expect(userMsg).toContain('§1.1');
			expect(userMsg).toContain('§2.1');
		});

		it('assure une factorisation déterministe de repli avec 100% de couverture', () => {
			const res = fallbackDeterministicFactorization(sampleClauses, DEFAULT_KB_STANDARDS);
			expect(res.status).toBe('fallback');
			expect(res.totalClauses).toBe(4);
			expect(res.coverageRate).toBe(100);
			expect(res.subjects.length).toBeGreaterThanOrEqual(2);
			for (const subj of res.subjects) {
				expect(subj.lotId).toMatch(/^LOT-/);
				expect(subj.name).toBeTruthy();
				expect(subj.seed.initialQuestion).toBeTruthy();
			}
		});

		it('permet la promotion manuelle d une clause en sujet d architecture dédié (appropriation humaine)', () => {
			const clause = sampleClauses[0];
			const subj = promoteClauseToSubject(clause, 2, 'lead_architect');
			expect(subj.id).toContain('SUBJ-PROMOTED-');
			expect(subj.name).toContain('Hébergement Souverain');
			expect(subj.coveredClauseRefs).toEqual(['§1.1']);
			expect(subj.waitingForRole).toBe('lead_architect');
			expect(subj.initialLevel).toBe('L1_dilemma');
			expect(subj.alignmentRationale).toContain('revue d\'appropriation');
		});
	});

	describe('3. Inférence Mockée & Normalisation JSON', () => {
		it('parse le JSON généré par le LLM local et enrichit les métriques', async () => {
			const mockJson = JSON.stringify({
				summary: 'Synthèse du CCTP télécom critique.',
				subjects: [
					{
						id: 'SUBJ-01',
						lotId: 'LOT-01-SOUV',
						name: 'Socle Souverain & Chiffrement ANSSI',
						sectionRef: '§1.0',
						coveredClauseRefs: ['§1.1', '§4.2'],
						matchedKbItemIds: ['STD-SOUV-01', 'STD-SECOPS-01'],
						knowledgeAlignment: 'standard_established',
						alignmentRationale: 'Conforme au standard SecNumCloud 3.2.',
						initialLevel: 'L2_decomposed',
						waitingForRole: 'lead_architect',
						effort: 'M',
						seed: {
							initialRetenu: ['Datacenter qualifié'],
							initialHypothesis: 'IPsec certifié ANSSI',
							initialQuestion: 'Quel HSM souverain retenir ?'
						}
					},
					{
						id: 'SUBJ-02',
						lotId: 'LOT-03-TELCO',
						name: 'Synchronisation PTP & UPF Accéléré',
						sectionRef: '§2.0',
						coveredClauseRefs: ['§2.1', '§3.4'],
						matchedKbItemIds: ['STD-TELCO-01', 'STD-TELCO-02'],
						knowledgeAlignment: 'conflict_detected',
						alignmentRationale: 'Holdover de 30 jours sans GNSS.',
						initialLevel: 'L1_dilemma',
						waitingForRole: 'domain_architect',
						effort: 'L',
						seed: {
							initialRetenu: ['Profil G.8275.1'],
							initialHypothesis: 'Carte PCIe avec oscillateur rubidium',
							initialConflict: 'Surcoût matériel à arbitrer',
							initialQuestion: 'Comment garantir l autonomie sans dérive ?'
						}
					}
				]
			});

			const chatSpy = vi.spyOn(localLlmClient, 'chat').mockResolvedValueOnce(mockJson);

			const result = await factorizeRfpWithLocalLlm({
				clauses: sampleClauses,
				model: 'ministral:latest',
				customPromptDirectives: 'Mettre l accent sur la souveraineté.'
			});

			expect(chatSpy).toHaveBeenCalled();
			expect(result.status).toBe('ok');
			expect(result.coverageRate).toBe(100);
			expect(result.subjects.length).toBe(2);
			expect(result.subjects[0].name).toBe('Socle Souverain & Chiffrement ANSSI');
			expect(result.subjects[1].waitingForRole).toBe('domain_architect');

			chatSpy.mockRestore();
		});
	});
});
