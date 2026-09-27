import { describe, it, expect } from 'vitest';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import {
	buildEngagementProfileFromWorkspaceInput,
	WORKSPACE_PRESETS,
	DEFAULT_PARTICIPANTS,
	type WorkspaceCreationInput
} from '$lib/domain/engagements';
import { INITIAL_CORPUS_DOCUMENTS } from '$lib/domain/corpus';

describe('Workspace Creation & Common Knowledge Base Contract', () => {
	it('1. Construit un profil d\'engagement complet à partir de la saisie de l\'espace de travail', () => {
		const input: WorkspaceCreationInput = {
			title: 'Supervision Réseau Critique 2027',
			type: 'project_rfp',
			description: 'Cahier des charges pour la supervision résiliente et la télémétrie des sites sensibles.',
			strategy: {
				objectives: [
					'Disponibilité 99.999% sans point unique de défaillance',
					'Conformité stricte Directive NIS2',
					'Déterminisme de transmission sub-seconde'
				],
				principles: [
					'Zero-Trust par défaut',
					'Validation formelle humaine obligatoire',
					'Pas de blabla dans les livrables'
				],
				constraints: [
					'Hébergement souverain exclusivement en France',
					'Budget infrastructure max 850 k€'
				],
				targetDate: '2027-11-30',
				budget: '850 k€'
			},
			participants: DEFAULT_PARTICIPANTS,
			upstreamDocuments: [
				{
					title: 'CCTP Lot Supervision · Exigences de Télémétrie',
					category: 'cctp',
					sourceOrAuthor: 'Direction des Télécoms (MOA)',
					summary: 'Exigences d\'ingestion haut débit et d\'alerte temps réel sous NIS2.',
					clauses: [
						{
							clauseRef: '§2.1.3',
							title: 'Chiffrement des flux de supervision',
							text: 'Les sondes de télémétrie doivent chiffrer les flux en transit via TLS 1.3 certifié ANSSI.',
							criticality: 'bloquant',
							impactSummary: 'Dimensionne les passerelles de collecte'
						}
					]
				}
			],
			linkedStandardIds: ['DOC-EXT-03', 'DOC-EXT-04'],
			initialSubjects: [
				{
					sectionRef: '§2.1',
					name: 'Ingestion Haute Vitesse & Bus de Télémétrie',
					waitingForRole: 'infra_expert_architect',
					effort: 'M',
					initialRetenu: ['Kafka sécurisé sur socle RKE2'],
					initialHypothesis: 'Capacité d\'ingestion 100k msg/s sans perte',
					initialQuestion: 'Quel protocole de sérialisation imposé par les sondes ?'
				}
			]
		};

		const { engagement, newUpstreamDocuments } = buildEngagementProfileFromWorkspaceInput(
			input,
			INITIAL_CORPUS_DOCUMENTS
		);

		expect(engagement.id).toBe('supervision-reseau-critique-2027');
		expect(engagement.title).toBe('Supervision Réseau Critique 2027');
		expect(engagement.type).toBe('project_rfp');
		expect(engagement.strategy?.objectives).toHaveLength(3);
		expect(engagement.participants).toHaveLength(4);
		expect(engagement.subjects).toHaveLength(1);
		expect(engagement.subjects[0].name).toContain('Ingestion Haute Vitesse');
		expect(engagement.drafts[engagement.subjects[0].id]).toBeDefined();
		expect(engagement.statements).toHaveLength(1);
		expect(engagement.dialogueMessages).toHaveLength(1);

		// Documents amonts
		expect(newUpstreamDocuments).toHaveLength(1);
		expect(newUpstreamDocuments[0].id).toContain('SUPERVISION-RESEAU-CRITIQUE-2027');
		expect(newUpstreamDocuments[0].keyClauses).toHaveLength(1);
		expect(newUpstreamDocuments[0].keyClauses[0].criticality).toBe('bloquant');

		// Le corpus de l'engagement contient le document amont + les standards liés
		expect(engagement.corpusDocuments.some((d) => d.id === newUpstreamDocuments[0].id)).toBe(true);
		expect(engagement.corpusDocuments.some((d) => d.id === 'DOC-EXT-03')).toBe(true);
	});

	it('2. Crée et active le nouvel espace de travail dans le deliberationStore', () => {
		const initialEngagementsCount = deliberationStore.engagements.length;
		const initialCommonKbCount = deliberationStore.commonKnowledgeBase.length;

		const input: WorkspaceCreationInput = {
			title: 'Projet Maritime Portuaire 5G',
			type: 'generic_blueprint',
			description: 'Architecture privée 5G pour automatisation de grues portuaires.',
			strategy: {
				objectives: ['Pilotage à distance temps réel des portiques', 'Latence sub-10ms'],
				principles: ['Double couverture antennaire', 'Anti-blabla'],
				constraints: ['Environnement salin corrosif']
			},
			participants: DEFAULT_PARTICIPANTS,
			upstreamDocuments: [
				{
					title: 'Spécification Portuaire · Lot Radio Maritime',
					category: 'business_spec',
					sourceOrAuthor: 'Autorité Portuaire',
					summary: 'Spécifications pour la transmission vidéo 4K et le guidage automatisé.',
					clauses: [
						{
							clauseRef: 'Spéc §4.2',
							title: 'Disponibilité radio quais',
							text: 'Couverture 99.999% requise sur les 4 km de quais.',
							criticality: 'bloquant'
						}
					]
				}
			]
		};

		const created = deliberationStore.createNewWorkspace(input);

		// Vérification de l'ajout
		expect(deliberationStore.engagements.length).toBe(initialEngagementsCount + 1);
		expect(deliberationStore.activeEngagementId).toBe(created.id);
		expect(deliberationStore.activeEngagement.title).toBe('Projet Maritime Portuaire 5G');

		// Sujet actif automatiquement configuré
		expect(deliberationStore.activeSubject).toBeDefined();
		expect(deliberationStore.activeDraft).toBeDefined();

		// La base de connaissances commune a été enrichie !
		expect(deliberationStore.commonKnowledgeBase.length).toBe(initialCommonKbCount + 1);
		const addedDoc = deliberationStore.commonKnowledgeBase.find(
			(d) => d.title === 'Spécification Portuaire · Lot Radio Maritime'
		);
		expect(addedDoc).toBeDefined();
	});

	it('3. Invariant Clé : la base de connaissance reste commune et enrichie lors des bascules d\'engagement', () => {
		// La base commune contient actuellement le document maritime ajouté au test précédent
		const hasMaritimeInCommon = deliberationStore.commonKnowledgeBase.some(
			(d) => d.title === 'Spécification Portuaire · Lot Radio Maritime'
		);
		expect(hasMaritimeInCommon).toBe(true);

		// On bascule sur SUSE Telco Cloud
		deliberationStore.switchEngagement('suse-telco-cloud-generic');
		expect(deliberationStore.activeEngagementId).toBe('suse-telco-cloud-generic');

		// Invariant : la base de connaissance commune CONSERVE tous les documents accumulés
		expect(
			deliberationStore.commonKnowledgeBase.some(
				(d) => d.title === 'Spécification Portuaire · Lot Radio Maritime'
			)
		).toBe(true);

		// On bascule sur CCTP Réel Nordwave
		deliberationStore.switchEngagement('cctp-mcx-nordwave');
		expect(deliberationStore.activeEngagementId).toBe('cctp-mcx-nordwave');
		expect(
			deliberationStore.commonKnowledgeBase.some(
				(d) => d.title === 'Spécification Portuaire · Lot Radio Maritime'
			)
		).toBe(true);
	});

	it('4. Valide l\'instanciation des présets de démarrage rapide (FRMCS, Cloud Souverain)', () => {
		expect(WORKSPACE_PRESETS.length).toBeGreaterThanOrEqual(2);

		for (const presetItem of WORKSPACE_PRESETS) {
			const { engagement, newUpstreamDocuments } = buildEngagementProfileFromWorkspaceInput(
				presetItem.preset,
				INITIAL_CORPUS_DOCUMENTS
			);
			expect(engagement.id).toBeTruthy();
			expect(engagement.title).toBeTruthy();
			expect(engagement.subjects.length).toBeGreaterThanOrEqual(2);
			expect(engagement.strategy?.objectives.length).toBeGreaterThanOrEqual(2);
			expect(newUpstreamDocuments.length).toBeGreaterThanOrEqual(1);
			expect(newUpstreamDocuments[0].keyClauses.length).toBeGreaterThanOrEqual(1);
		}
	});
});
