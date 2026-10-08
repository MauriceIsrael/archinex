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
	partitionMicroSubjectsForReduce,
	buildBatchReducePrompt,
	MAX_REDUCE_BATCH_MICRO_SUBJECTS,
	MAX_REDUCE_BATCH_CHARS,
	factorizeRfpMapReduce,
	safeParseJson,
	MAX_MAP_CHUNK_CHARS,
	type KbItemSummary,
	type MicroArchitecturalSubject
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
				id: 'massive-1',
				clauseRef: '§9.9',
				title: 'Exigence ultra-volumineuse avec volumétrie contractuelle',
				text: 'A'.repeat(30000),
				criticality: 'bloquant'
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
					id: `huge-${i}`,
					clauseRef: `§${sec}.${i}`,
					title: `Exigence technique détaillée numéro ${i}`,
					text: `Ceci est le texte complet de l'article ${i} qui contient beaucoup de détails contractuels et juridiques.`,
					criticality: 'info'
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
					criticality: i % 5 === 0 ? 'bloquant' : 'info',
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

		it('découpe un corpus géant de 1600 exigences en blocs strictement bornés sous MAX_MAP_CHUNK_CHARS', () => {
			const clauses = generateLotsOfClauses(1594);
			const chunks = partitionClausesIntoMapChunks(clauses);

			const totalInChunks = chunks.reduce((acc, ch) => acc + ch.length, 0);
			expect(totalInChunks).toBe(1594);
			expect(chunks.length).toBeGreaterThanOrEqual(15);
			for (const ch of chunks) {
				expect(ch.length).toBeLessThanOrEqual(35);
				const chars = ch.reduce((acc, c) => acc + (c.text?.length || 0) + (c.title?.length || 0), 0);
				expect(chars).toBeLessThanOrEqual(MAX_MAP_CHUNK_CHARS);
			}
		});

		it('safeParseJson répare avec succès les JSON tronqués et les chaînes non terminées', () => {
			// Cas 1 : Markdown fence standard
			const json1 = '```json\n{"microSubjects": [{"id": "MICRO-01", "title": "Sujet 1"}]}\n```';
			expect(safeParseJson(json1).microSubjects.length).toBe(1);

			// Cas 2 : Markdown fence non fermée
			const json2 = '```json\n{"microSubjects": [{"id": "MICRO-01", "title": "Sujet 1"}]}';
			expect(safeParseJson(json2).microSubjects.length).toBe(1);

			// Cas 3 : Chaîne et objet tronqués en cours de génération (ex: Unterminated string)
			const truncatedJson = '{"microSubjects": [{"id": "MICRO-01", "title": "Architecture de haute dispo';
			const repaired = safeParseJson(truncatedJson);
			expect(repaired).toBeDefined();
			expect(repaired.microSubjects.length).toBeGreaterThanOrEqual(1);
			expect(repaired.microSubjects[0].id).toBe('MICRO-01');

			// Cas 4 : Cas exact rencontré par l'utilisateur lors de la passe Reduce (troncature après une virgule sur name)
			const userTruncatedCase1 = `{
  "subjects": [
    {
      "id": "SUBJ-01",
      "lotId": "LOT-04-SECOPS",
      "name": "Architecture de Sécurité et Opérations Centralisées (SOC/NOC)",`;
			const repairedUser1 = safeParseJson(userTruncatedCase1);
			expect(repairedUser1).toBeDefined();
			expect(repairedUser1.subjects.length).toBe(1);
			expect(repairedUser1.subjects[0].id).toBe('SUBJ-01');
			expect(repairedUser1.subjects[0].name).toBe('Architecture de Sécurité et Opérations Centralisées (SOC/NOC)');

			// Cas 5 : Troncature au milieu d'un deuxième sujet avec premier sujet complet
			const userTruncatedCase2 = `{
  "subjects": [
    {
      "id": "SUBJ-01",
      "lotId": "LOT-01-SOUV",
      "name": "Socle Souveraineté & SecNumCloud",
      "sectionRef": "§1.0",
      "coveredMicroIds": ["MICRO-01"]
    },
    {
      "id": "SUBJ-02",
      "lotId": "LOT-01-SOUV",
      "name": "NOC Centralisé et Gestion des Opérations Multi-Fournisseurs",`;
			const repairedUser2 = safeParseJson(userTruncatedCase2);
			expect(repairedUser2).toBeDefined();
			expect(repairedUser2.subjects.length).toBeGreaterThanOrEqual(1);
			expect(repairedUser2.subjects[0].id).toBe('SUBJ-01');
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

		it('partitionne 278 micro-sujets en sous-lots bornés sous MAX_REDUCE_BATCH_MICRO_SUBJECTS et MAX_REDUCE_BATCH_CHARS', () => {
			const lots = ['LOT-01-SOUV', 'LOT-02-INFRA', 'LOT-03-TELCO', 'LOT-04-SECOPS', 'LOT-05-RESIL'];
			const fakeMicroSubjects: MicroArchitecturalSubject[] = [];

			for (let i = 1; i <= 278; i++) {
				const assignedLot = lots[i % lots.length];
				fakeMicroSubjects.push({
					id: `MICRO-${i}`,
					title: `Micro-sujet d'ingénierie ${i} sur le socle ${assignedLot}`,
					lotId: assignedLot,
					coveredClauseRefs: [`§${(i % 10) + 1}.${i}`, `§${(i % 10) + 1}.${i + 1}`],
					criticalPoints: [`Point critique bloquant numéro ${i}`],
					keyDilemmaOrHypothesis: `Hypothèse d'architecture détaillée pour le micro-sujet ${i}`
				});
			}

			const batches = partitionMicroSubjectsForReduce(fakeMicroSubjects);

			expect(batches.length).toBeGreaterThan(5); // Au moins plusieurs sous-lots
			const totalInBatches = batches.reduce((acc, b) => acc + b.subjects.length, 0);
			expect(totalInBatches).toBe(278);

			for (const batch of batches) {
				expect(batch.subjects.length).toBeLessThanOrEqual(MAX_REDUCE_BATCH_MICRO_SUBJECTS);
				const batchChars = batch.subjects.reduce(
					(acc, s) => acc + (s.title?.length || 0) + (s.keyDilemmaOrHypothesis?.length || 0) + 120,
					0
				);
				expect(batchChars).toBeLessThanOrEqual(MAX_REDUCE_BATCH_CHARS + 500);
			}
		});

		it('construit un prompt Reduce de lot compact sans risque de dépassement de 8192 tokens', () => {
			const batchMicros: MicroArchitecturalSubject[] = [
				{
					id: 'MICRO-01',
					title: 'Hébergement SecNumCloud',
					lotId: 'LOT-01-SOUV',
					coveredClauseRefs: ['§1.1', '§1.2'],
					criticalPoints: ['Immunité Cloud Act'],
					keyDilemmaOrHypothesis: 'Opérateur qualifié français'
				},
				{
					id: 'MICRO-02',
					title: 'Chiffrement souverain HSM',
					lotId: 'LOT-01-SOUV',
					coveredClauseRefs: ['§1.5'],
					criticalPoints: ['Certification ANSSI'],
					keyDilemmaOrHypothesis: 'Clés hébergées localement'
				}
			];

			const prompt = buildBatchReducePrompt(batchMicros, testKbStandards, 'LOT-01-SOUV', '1 à 2');

			expect(prompt.system).toContain('LOT-01-SOUV');
			expect(prompt.system).toContain('coveredMicroIds');
			expect(prompt.user).toContain('MICRO-01');
			expect(prompt.user).toContain('MICRO-02');
			expect(prompt.user.length).toBeLessThan(4000); // Reste ultra compact
		});

		it('exécute la réduction hiérarchique avec succès lorsque le nombre de micro-sujets dépasse MAX_REDUCE_BATCH_MICRO_SUBJECTS', async () => {
			const clauses = generateLotsOfClauses(60);

			// Génère 24 micro-sujets (dépasse MAX_REDUCE_BATCH_MICRO_SUBJECTS = 20)
			const mockManyMicros = Array.from({ length: 24 }, (_, idx) => ({
				id: `MICRO-${idx + 1}`,
				title: `Micro-sujet ${idx + 1}`,
				lotId: idx < 12 ? 'LOT-01-SOUV' : 'LOT-02-INFRA',
				coveredClauseRefs: [clauses[idx * 2]?.clauseRef || `§1.${idx}`, clauses[idx * 2 + 1]?.clauseRef || `§1.${idx + 1}`],
				criticalPoints: ['Point critique'],
				keyDilemmaOrHypothesis: 'Hypothèse'
			}));

			const mockMapResponse = JSON.stringify({
				microSubjects: mockManyMicros
			});

			const mockBatchReduceResponse1 = JSON.stringify({
				subjects: [
					{
						id: 'SUBJ-01',
						lotId: 'LOT-01-SOUV',
						name: 'Sujet Consolidé Souveraineté',
						sectionRef: '§1.0',
						coveredMicroIds: mockManyMicros.slice(0, 12).map((m) => m.id),
						coveredClauseRefs: [],
						matchedKbItemIds: ['STD-SOUV-01'],
						knowledgeAlignment: 'standard_established',
						alignmentRationale: 'Consolidation souveraineté',
						initialLevel: 'L2_decomposed',
						waitingForRole: 'lead_architect',
						effort: 'L',
						seed: {
							initialRetenu: ['Souveraineté validée'],
							initialHypothesis: 'Isolation',
							initialQuestion: 'Comment qualifier le socle ?'
						}
					}
				]
			});

			const mockBatchReduceResponse2 = JSON.stringify({
				subjects: [
					{
						id: 'SUBJ-02',
						lotId: 'LOT-02-INFRA',
						name: 'Sujet Consolidé Infrastructure',
						sectionRef: '§2.0',
						coveredMicroIds: mockManyMicros.slice(12, 24).map((m) => m.id),
						coveredClauseRefs: [],
						matchedKbItemIds: [],
						knowledgeAlignment: 'standard_established',
						alignmentRationale: 'Consolidation infra',
						initialLevel: 'L2_decomposed',
						waitingForRole: 'infra_expert_architect',
						effort: 'M',
						seed: {
							initialRetenu: ['Infra validée'],
							initialHypothesis: 'Virtualisation',
							initialQuestion: 'Quel dimensionnement ?'
						}
					}
				]
			});

			const chatSpy = vi.spyOn(localLlmClient, 'chat').mockImplementation(async (opts) => {
				const isMap = opts.messages.some((m) => m.content.includes('EXIGENCES DU BLOC') || m.content.includes('microSubjects'));
				if (isMap) {
					return mockMapResponse;
				}
				return mockBatchReduceResponse1;
			});

			const result = await factorizeRfpWithLocalLlm({
				clauses,
				model: 'ministral:latest'
			}, testKbStandards);

			expect(result.status).toBe('ok');
			expect(result.engine).toBe('map-reduce-llm');
			expect(result.subjects.length).toBeGreaterThanOrEqual(1);
			expect(result.coverageRate).toBe(100);
			// Vérifie l'héritage des clauses depuis coveredMicroIds
			expect(result.subjects[0].coveredClauseRefs.length).toBeGreaterThan(0);

			chatSpy.mockRestore();
		});
	});

	describe('10. Multi-Provider & Intégration Anthropic Claude Cloud', () => {
		it('détecte la clé API Claude et expose les modèles Claude avec contexte 200k', async () => {
			const claudeClient = new LocalLlmClient({
				anthropicApiKey: 'sk-ant-test-key-12345',
				endpoint: 'http://localhost:11434'
			});

			expect(claudeClient.hasAnthropicConfigured()).toBe(true);
			expect(claudeClient.getDefaultModel()).toBe('claude-sonnet-4-5-20250929');

			const models = await claudeClient.getAvailableModels();
			const modelIds = models.map((m) => m.id);

			expect(modelIds).toContain('claude-sonnet-4-5-20250929');

			const sonnet = models.find((m) => m.id === 'claude-sonnet-4-5-20250929');
			expect(sonnet?.contextLength).toBe(200000);
		});

		it('route vers l API Anthropic Messages avec extraction du prompt system et entêtes corrects', async () => {
			const claudeClient = new LocalLlmClient({
				anthropicApiKey: 'sk-ant-live-dummy-key',
				endpoint: 'http://localhost:11434'
			});

			let capturedUrl = '';
			let capturedHeaders: Record<string, string> = {};
			let capturedBody: any = null;

			const originalFetch = global.fetch;
			global.fetch = vi.fn().mockImplementation(async (url, init) => {
				capturedUrl = String(url);
				capturedHeaders = (init?.headers as Record<string, string>) || {};
				capturedBody = JSON.parse(init?.body as string);

				return {
					ok: true,
					json: async () => ({
						id: 'msg_123',
						type: 'message',
						role: 'assistant',
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									summary: 'Factorisation via Claude 3.5 Sonnet',
									subjects: []
								})
							}
						]
					})
				};
			}) as any;

			try {
				const response = await claudeClient.chat({
					model: 'claude-3-5-sonnet',
					messages: [
						{ role: 'system', content: 'Tu es un architecte expert.' },
						{ role: 'user', content: 'Analyse les exigences §1.1 et §1.2.' }
					],
					format: 'json',
					temperature: 0.1
				});

				expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages');
				expect(capturedHeaders['x-api-key']).toBe('sk-ant-live-dummy-key');
				expect(capturedHeaders['anthropic-version']).toBe('2023-06-01');
				expect(capturedBody.model).toBe('claude-sonnet-4-5-20250929');
				expect(capturedBody.system).toContain('Tu es un architecte expert.');
				expect(capturedBody.system).toContain('INSTRUCTION STRICTE');
				expect(capturedBody.messages).toEqual([
					{ role: 'user', content: 'Analyse les exigences §1.1 et §1.2.' }
				]);
				expect(response).toContain('Factorisation via Claude 3.5 Sonnet');
			} finally {
				global.fetch = originalFetch;
			}
		});

		it('utilise engine anthropic-claude lors de la factorisation avec un modèle Claude', async () => {
			const mockClaudeJson = JSON.stringify({
				summary: 'Synthèse haute-fidélité via Claude',
				subjects: [
					{
						id: 'SUBJ-01',
						name: 'Souveraineté des Données et SecNumCloud',
						sectionRef: '§1.0',
						coveredClauseRefs: ['§1.1'],
						matchedKbItemIds: ['STD-SOUV-01'],
						knowledgeAlignment: 'standard_established',
						initialLevel: 'L3_retained',
						waitingForRole: 'lead_architect',
						effort: 'M',
						seed: {
							initialRetenu: ['Hébergement SecNumCloud qualifié'],
							initialHypothesis: 'SecNumCloud 3.2',
							initialQuestion: 'Quel niveau de qualification ?'
						}
					}
				]
			});

			const chatSpy = vi.spyOn(localLlmClient, 'chat').mockResolvedValueOnce(mockClaudeJson);

			const result = await factorizeRfpWithLocalLlm(
				{
					clauses: [sampleClauses[0]],
					model: 'claude-3-5-sonnet-20241022'
				},
				testKbStandards
			);

			expect(result.status).toBe('ok');
			expect(result.engine).toBe('anthropic-claude');
			expect(result.modelUsed).toBe('claude-3-5-sonnet-20241022');
			expect(result.subjects.length).toBe(1);

			chatSpy.mockRestore();
		});
	});
});

