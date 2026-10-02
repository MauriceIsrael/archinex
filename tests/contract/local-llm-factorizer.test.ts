import { describe, it, expect, vi } from 'vitest';
import { LocalLlmClient, localLlmClient } from '../../src/lib/server/llm/localLlmClient';
import {
	buildSystemPrompt,
	buildUserMessage,
	inferTargetSubjectsCount,
	shouldCondenseClauses,
	fallbackDeterministicFactorization,
	promoteClauseToSubject,
	factorizeRfpWithLocalLlm,
	partitionClausesIntoMapChunks,
	buildMapPrompt,
	buildReducePrompt,
	factorizeRfpMapReduce,
	type KbItemSummary
} from '../../src/lib/server/llm/rfpFactorizer';
import type { ExtractedClause } from '../../src/lib/domain/corpus';

describe('Local LLM Souverain & Factorisation de RFP', () => {
	const client = new LocalLlmClient({ endpoint: 'http://localhost:11434' });

	const testKbStandards: KbItemSummary[] = [
		{
			id: 'STD-SOUV-01',
			title: 'Souveraineté des Données & Immunité Extraterritoriale',
			category: 'SOUVERAINETE',
			ruleOrStatement: 'Hébergement souverain qualifié SecNumCloud.'
		},
		{
			id: 'STD-TELCO-01',
			title: 'Synchronisation de Précision Temporelle',
			category: 'TELECOM',
			ruleOrStatement: 'Synchronisation de phase <= 1.5 µs.'
		}
	];

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
			const userMsg = buildUserMessage(sampleClauses, testKbStandards);
			expect(userMsg).toContain('PATRIMOINE COMMUN');
			expect(userMsg).toContain('STD-SOUV-01');
			expect(userMsg).toContain('§1.1');
			expect(userMsg).toContain('§2.1');
		});

		it('calcule le nombre cible de sujets adaptatif selon le volume d exigences', () => {
			expect(inferTargetSubjectsCount(5)).toBe('3 à 6');
			expect(inferTargetSubjectsCount(25)).toBe('6 à 10');
			expect(inferTargetSubjectsCount(60)).toBe('8 à 12');
			expect(inferTargetSubjectsCount(150)).toBe('12 à 18');
			expect(inferTargetSubjectsCount(400)).toBe('15 à 25');
		});

		it('active la condensation automatique pour les documents massifs sans perte de référence', () => {
			// Crée une clause avec un texte très long
			const massiveClause: ExtractedClause = {
				clauseRef: '§9.9',
				title: 'Exigence ultra-volumineuse avec volumétrie contractuelle',
				text: 'A'.repeat(30000),
				criticality: 'bloquant',
				suggestedSubjectName: 'Gros Sujet'
			};
			expect(shouldCondenseClauses([massiveClause])).toBe(true);

			const msg = buildUserMessage([massiveClause], testKbStandards, { condense: true });
			expect(msg).toContain('Synthèse structurée');
			expect(msg).toContain('§9.9');
			expect(msg).toContain('Extrait :');
			expect(msg.length).toBeLessThan(1000); // Très compressé
		});

		it('gère un corpus massif de 500 exigences sans jamais dépasser la fenêtre de contexte', () => {
			const hugeClauses: ExtractedClause[] = [];
			for (let i = 1; i <= 500; i++) {
				const sec = Math.ceil(i / 25);
				hugeClauses.push({
					clauseRef: `§${sec}.${i}`,
					title: `Exigence technique détaillée numéro ${i}`,
					text: `Ceci est le texte complet de l'article ${i} qui contient beaucoup de détails contractuels et juridiques.`
				});
			}

			const msg = buildUserMessage(hugeClauses, testKbStandards);
			expect(msg).toContain('Synthèse hiérarchique');
			expect(msg).toContain('500 exigences');
			// Le message ne doit JAMAIS dépasser le budget de sécurité (28 000 caractères, ~7 000 tokens)
			expect(msg.length).toBeLessThan(28000);
		});

		it('assure une factorisation déterministe de repli avec avertissement explicite (tolérance zéro au silence)', () => {
			const res = fallbackDeterministicFactorization(sampleClauses, testKbStandards, 'Dépassement de contexte (152053 tokens > 16384 tokens)');
			expect(res.status).toBe('fallback');
			expect(res.warning).toContain('152053 tokens');
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

	describe('4. Pipeline Hiérarchique Map-Reduce (Proposition C)', () => {
		const generateLotsOfClauses = (count: number): ExtractedClause[] => {
			const clauses: ExtractedClause[] = [];
			for (let i = 1; i <= count; i++) {
				const section = Math.ceil(i / 15);
				clauses.push({
					id: `c-${i}`,
					clauseRef: `§${section}.${i}`,
					title: `Exigence technique §${section}.${i}`,
					text: `Texte intégral et complet pour l'exigence §${section}.${i} avec contraintes fortes.`,
					criticality: i % 5 === 0 ? 'bloquant' : 'standard',
					impactSummary: `Impact ${section}`
				});
			}
			return clauses;
		};

		it('découpe un volume de clauses en blocs de taille maîtrisée (partitionClausesIntoMapChunks)', () => {
			const clauses = generateLotsOfClauses(95);
			const chunks = partitionClausesIntoMapChunks(clauses, 35);

			expect(chunks.length).toBeGreaterThanOrEqual(3);
			const totalInChunks = chunks.reduce((acc, ch) => acc + ch.length, 0);
			expect(totalInChunks).toBe(95);

			for (const ch of chunks) {
				expect(ch.length).toBeLessThanOrEqual(35);
			}
		});

		it('borne le nombre de blocs Map à 6-7 maximum pour un corpus géant de 1600 exigences', () => {
			const clauses = generateLotsOfClauses(1594);
			const chunks = partitionClausesIntoMapChunks(clauses);

			expect(chunks.length).toBeLessThanOrEqual(7);
			expect(chunks.length).toBeGreaterThanOrEqual(4);
			const totalInChunks = chunks.reduce((acc, ch) => acc + ch.length, 0);
			expect(totalInChunks).toBe(1594);
		});

		it('construit un prompt Map contenant 100% du texte intégral des exigences du bloc', () => {
			const chunk = sampleClauses;
			const prompt = buildMapPrompt(chunk, 0, 1);

			expect(prompt.system).toContain('FORMAT DE SORTIE JSON STRICT');
			expect(prompt.system).toContain('microSubjects');
			expect(prompt.user).toContain('EXIGENCES DU BLOC 1/1');
			expect(prompt.user).toContain('§1.1');
			expect(prompt.user).toContain('L infrastructure doit être qualifiée SecNumCloud');
			expect(prompt.user).toContain('[CRITICITÉ: bloquant]');
		});

		it('construit un prompt Reduce qui consolide tous les micro-sujets avec ancrage KB', () => {
			const mockMicro = [
				{
					id: 'MICRO-01',
					title: 'Hébergement Souverain',
					lotId: 'LOT-01-SOUV',
					coveredClauseRefs: ['§1.1'],
					criticalPoints: ['SecNumCloud 3.2'],
					keyDilemmaOrHypothesis: 'Opérateur qualifié'
				},
				{
					id: 'MICRO-02',
					title: 'Synchronisation PTP',
					lotId: 'LOT-03-TELCO',
					coveredClauseRefs: ['§2.1'],
					criticalPoints: ['1.5 µs'],
					keyDilemmaOrHypothesis: 'Rubidium holdover'
				}
			];

			const reducePrompt = buildReducePrompt(mockMicro, testKbStandards, '6 à 10', 'Priorité souveraineté');

			expect(reducePrompt.system).toContain('Tu es un Lead Solutions Architect');
			expect(reducePrompt.system).toContain('CONSOLIDER');
			expect(reducePrompt.system).toContain('DIRECTIVES DE L\'ARCHITECTE');
			expect(reducePrompt.system).toContain('Priorité souveraineté');
			expect(reducePrompt.user).toContain('[MICRO-1]');
			expect(reducePrompt.user).toContain('STD-SOUV-01');
		});

		it('exécute avec succès le pipeline Map-Reduce complet avec traçabilité et couverture intégrale', async () => {
			const clauses = generateLotsOfClauses(50); // > 40 clauses déclenche Map-Reduce

			const mockMapResponse = JSON.stringify({
				microSubjects: [
					{
						id: 'MICRO-01',
						title: 'Micro-sujet Infrastructure et Souveraineté',
						lotId: 'LOT-01-SOUV',
						coveredClauseRefs: clauses.slice(0, 20).map((c) => c.clauseRef),
						criticalPoints: ['SecNumCloud impératif'],
						keyDilemmaOrHypothesis: 'Choix de la région souveraine'
					},
					{
						id: 'MICRO-02',
						title: 'Micro-sujet Réseau et Télécoms',
						lotId: 'LOT-03-TELCO',
						coveredClauseRefs: clauses.slice(20, 50).map((c) => c.clauseRef),
						criticalPoints: ['Précision PTP'],
						keyDilemmaOrHypothesis: 'Architecture UPF distribuée'
					}
				]
			});

			const mockReduceResponse = JSON.stringify({
				summary: 'Consolidation complète des exigences souveraines et télécoms.',
				subjects: [
					{
						id: 'SUBJ-01',
						lotId: 'LOT-01-SOUV',
						name: 'Socle Hébergement & Souveraineté Juridique',
						sectionRef: '§1.0',
						coveredClauseRefs: clauses.slice(0, 20).map((c) => c.clauseRef),
						matchedKbItemIds: ['STD-SOUV-01'],
						knowledgeAlignment: 'standard_established',
						alignmentRationale: 'Conforme au standard souverain existant.',
						initialLevel: 'L2_decomposed',
						waitingForRole: 'infra_expert_architect',
						effort: 'L',
						seed: {
							initialRetenu: ['Région souveraine qualifiée'],
							initialHypothesis: 'Isolation matérielle stricte',
							initialQuestion: 'Quelle homologation retenir ?'
						}
					},
					{
						id: 'SUBJ-02',
						lotId: 'LOT-03-TELCO',
						name: 'Réseau Coeur & Synchronisation Horlogère',
						sectionRef: '§2.0',
						coveredClauseRefs: clauses.slice(20, 50).map((c) => c.clauseRef),
						matchedKbItemIds: ['STD-TELCO-01'],
						knowledgeAlignment: 'conflict_detected',
						alignmentRationale: 'Exigences temps réel critiques.',
						initialLevel: 'L1_dilemma',
						waitingForRole: 'telco_expert_architect',
						effort: 'XL',
						seed: {
							initialRetenu: ['Grandmaster PTP'],
							initialHypothesis: 'Holdover rubidium 30 jours',
							initialQuestion: 'Comment concilier coût et maintien sans GNSS ?'
						}
					}
				]
			});

			// Le mock renvoie Map pour les blocs, puis Reduce pour la synthèse
			const chatSpy = vi.spyOn(localLlmClient, 'chat')
				.mockResolvedValueOnce(mockMapResponse) // Chunk 1 Map
				.mockResolvedValueOnce(mockMapResponse) // Chunk 2 Map
				.mockResolvedValueOnce(mockReduceResponse); // Reduce

			const result = await factorizeRfpWithLocalLlm({
				clauses,
				model: 'ministral:latest'
			}, testKbStandards);

			expect(chatSpy).toHaveBeenCalled();
			expect(result.status).toBe('ok');
			expect(result.engine).toBe('map-reduce-llm');
			expect(result.coverageRate).toBe(100);
			expect(result.coveredClausesCount).toBe(50);
			expect(result.unassignedClauses.length).toBe(0);
			expect(result.subjects.length).toBe(2);
			expect(result.subjects[0].lotId).toBe('LOT-01-SOUV');
			expect(result.subjects[1].lotId).toBe('LOT-03-TELCO');

			chatSpy.mockRestore();
		});
	});
});
