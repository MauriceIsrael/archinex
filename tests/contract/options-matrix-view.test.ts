import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import OptionsMatrix from '$lib/components/deliberation/OptionsMatrix.svelte';
import type { Option, Criterion, OptionEvaluation } from '$lib/domain/options';

describe('OptionsMatrix Column Titles & Readability Contract (Lot A2)', () => {
	const sampleCriteria: Criterion[] = [
		{
			id: 'crit-sec-1',
			subjectId: 'subj-architecture-data',
			name: 'Sécurité et Isolation',
			description: 'Conformité aux recommandations ANSSI et chiffrement de bout en bout',
			kind: 'compliance',
			weight: 5,
			author: 'Alice',
			role: 'lead_architect',
			productionMode: 'human-authored',
			version: 1
		}
	];

	const sampleOptions: Option[] = [
		{
			id: 'opt-kafka-event-streaming',
			subjectId: 'subj-architecture-data',
			title: 'Architecture Broker Hybride Kafka avec connecteurs Debezium CDC et schéma Avro managé',
			summary: 'Cluster Apache Kafka avec bus d\'événements temps réel hautement disponible et sécurisé mTLS.',
			origin: 'human',
			kbRefs: ['RULE-DATA-01'],
			status: 'proposed',
			author: 'Alice',
			role: 'lead_architect',
			productionMode: 'human-authored',
			version: 1
		},
		{
			id: 'opt-rabbitmq-amqp',
			subjectId: 'subj-architecture-data',
			title: 'Broker RabbitMQ avec files quorum et réplication inter-datacenters active/passive',
			summary: 'File d\'attente AMQP 0-9-1 orientée messages avec haute cohérence transactionnelle.',
			origin: 'llm-proposed',
			kbRefs: [],
			status: 'proposed',
			author: 'AI Proposer',
			role: 'agent:proposer',
			productionMode: 'llm-derived',
			version: 1
		}
	];

	const sampleEvaluations: OptionEvaluation[] = [
		{
			id: 'eval-1',
			optionId: 'opt-kafka-event-streaming',
			criterionId: 'crit-sec-1',
			score: 2,
			justification: 'Chiffrement mTLS natif et conformité stricte.',
			evidenceRefs: [],
			author: 'Alice',
			role: 'lead_architect',
			productionMode: 'human-authored',
			version: 1
		}
	];

	it('affiche un badge distinctif (Option A, Option B) pour chaque proposition', () => {
		const { html } = render(OptionsMatrix, {
			props: {
				projectId: 'proj-1',
				subjectId: 'subj-architecture-data',
				criteria: sampleCriteria,
				options: sampleOptions,
				evaluations: sampleEvaluations,
				tradeOffs: [],
				decision: null
			}
		});

		expect(html).toContain('Option A');
		expect(html).toContain('Option B');
	});

	it('affiche les titres longs en multi-lignes lisibles sans coupure line-clamp-1', () => {
		const { html } = render(OptionsMatrix, {
			props: {
				projectId: 'proj-1',
				subjectId: 'subj-architecture-data',
				criteria: sampleCriteria,
				options: sampleOptions,
				evaluations: sampleEvaluations,
				tradeOffs: [],
				decision: null
			}
		});

		// Vérifie l'absence de tronquage forcé line-clamp-1 sur les titres
		expect(html).not.toMatch(/line-clamp-1[^>]*>Architecture Broker Hybride/);

		// Vérifie la présence des classes d'enroulement naturel multi-lignes
		expect(html).toContain('whitespace-normal');
		expect(html).toContain('break-words');
		expect(html).toContain('leading-snug');

		// Le titre complet doit être intégralement présent
		expect(html).toContain('Architecture Broker Hybride Kafka avec connecteurs Debezium CDC et schéma Avro managé');
		expect(html).toContain('Broker RabbitMQ avec files quorum et réplication inter-datacenters active/passive');
	});

	it('inclut des infobulles natives (title) et un bouton de détail pour le résumé technique', () => {
		const { html } = render(OptionsMatrix, {
			props: {
				projectId: 'proj-1',
				subjectId: 'subj-architecture-data',
				criteria: sampleCriteria,
				options: sampleOptions,
				evaluations: sampleEvaluations,
				tradeOffs: [],
				decision: null
			}
		});

		// Titre dans l'attribut title de l'en-tête et du conteneur
		expect(html).toContain('title="Option A : Architecture Broker Hybride Kafka');
		expect(html).toContain('Détails');
		expect(html).toContain('aria-label="Détail de Option A"');
		expect(html).toContain('aria-label="Détail de Option B"');
	});

	it('élargit la colonne minimale des options pour assurer une lecture confortable', () => {
		const { html } = render(OptionsMatrix, {
			props: {
				projectId: 'proj-1',
				subjectId: 'subj-architecture-data',
				criteria: sampleCriteria,
				options: sampleOptions,
				evaluations: sampleEvaluations,
				tradeOffs: [],
				decision: null
			}
		});

		// Vérifie la classe de largeur élargie
		expect(html).toContain('min-w-[220px]');
		expect(html).toContain('max-w-[320px]');
	});

	it('affiche une 4ème colonne (Option C) lorsqu\'une 3ème option humaine est ajoutée', () => {
		const threeOptions: Option[] = [
			...sampleOptions,
			{
				id: 'opt-custom-human',
				subjectId: 'subj-architecture-data',
				title: 'Solution Edge locale souveraine',
				summary: 'Déploiement sur site sécurisé sans dépendance externe.',
				origin: 'human',
				kbRefs: [],
				status: 'proposed',
				author: 'Bob',
				role: 'lead_architect',
				productionMode: 'human-authored',
				version: 1
			}
		];

		const { html } = render(OptionsMatrix, {
			props: {
				projectId: 'proj-1',
				subjectId: 'subj-architecture-data',
				criteria: sampleCriteria,
				options: threeOptions,
				evaluations: sampleEvaluations,
				tradeOffs: [],
				decision: null
			}
		});

		expect(html).toContain('Option A');
		expect(html).toContain('Option B');
		expect(html).toContain('Option C');
		expect(html).toContain('Solution Edge locale souveraine');
		// 1 colonne critères + 3 colonnes options = 4 colonnes d'en-tête th
		const thMatches = html.match(/<th\b/g);
		expect(thMatches?.length).toBe(4);
	});

	it('affiche un bouton Modifier pour les options d\'origine humaine mais pas pour les propositions LLM', () => {
		const { html } = render(OptionsMatrix, {
			props: {
				projectId: 'proj-1',
				subjectId: 'subj-architecture-data',
				criteria: sampleCriteria,
				options: sampleOptions,
				evaluations: sampleEvaluations,
				tradeOffs: [],
				decision: null
			}
		});

		// Option A est 'human', Option B est 'llm-proposed'
		expect(html).toContain('aria-label="Modifier Option A"');
		expect(html).not.toContain('aria-label="Modifier Option B"');
		expect(html).toContain('Modifier');
	});

	it('intègre la section de capitalisation KB (id=capitalization-section) dès qu\'une décision est actée', () => {
		const sampleDecision: Decision = {
			id: 'dec-1',
			subjectId: 'subj-architecture-data',
			retainedOptionId: 'opt-kafka-event-streaming',
			rejected: [{ optionId: 'opt-rabbitmq-amqp', reason: 'Moins adapté' }],
			rationale: 'Solution souveraine hautement résiliente.',
			reversibility: 'reversible',
			arbiterId: 'Alice',
			arbiterRole: 'lead_architect',
			decidedAt: new Date().toISOString(),
			acceptedViolations: [],
			kbCandidateIds: []
		};

		const { html } = render(OptionsMatrix, {
			props: {
				projectId: 'proj-1',
				subjectId: 'subj-architecture-data',
				criteria: sampleCriteria,
				options: sampleOptions,
				evaluations: sampleEvaluations,
				tradeOffs: [],
				decision: sampleDecision
			}
		});

		expect(html).toContain('id="capitalization-section"');
		expect(html).toContain('Capitalisation vers le Knowledge Hub (Porte G4)');
		expect(html).toContain('Préparer les Candidats KB');
	});
});
