/**
 * Pipeline d'Ingestion & d'Audit d'Architecture inspiré de la méthodologie ArcKit.
 * 
 * Objectifs méthodologiques :
 * 1. Préservation intégrale des identifiants d'exigences contractuelles (REQ-Lot1-xxx, BR-xxx, NFR-xxx).
 * 2. Typage et audit qualité systématique (arckit-requirements & arckit-analyze).
 * 3. Évacuation rapide des commodités et standards sur étagère (80% sans débat).
 * 4. Extraction exclusive des VRAIS points durs sous tension d'architecture (ADRs atomiques).
 * 5. Formulation des questions précises pour le SACHANT MÉTIER afin de débloquer et maturer le sujet.
 */

import type { ExtractedClause } from '$lib/domain/corpus';
import type { ArchitectRole, MaturityLevel } from '$lib/types/epistemic';

export type ArcKitRequirementCategory = 'FR' | 'NFR' | 'INT' | 'FAC' | 'BR' | 'DR';
export type RequirementDisposition = 'deliberated' | 'evacuated' | 'clarification_needed';

export interface AuditedRequirement {
	id: string;
	clauseRef: string;
	title: string;
	text: string;
	category: ArcKitRequirementCategory;
	criticality: 'bloquant' | 'majeur' | 'info';
	disposition: RequirementDisposition;
	evacuationReason?: string;
	clarificationQuestion?: string;
	linkedSubjectId?: string;
}

export interface ArchitecturalHardPoint {
	id: string;
	name: string;
	sectionRef: string;
	waitingForRole: ArchitectRole;
	effort: 'XS' | 'S' | 'M' | 'L' | 'XL';
	level: MaturityLevel;
	coveredClauseRefs: string[];
	seed: {
		initialQuestion: string;
		initialHypothesis: string;
		initialConflict: string;
		initialRetenu: string[];
		expertQuestions: string[];
	};
	options: Array<{
		id: string;
		name: string;
		pros: string;
		cons: string;
	}>;
}

export interface ArcKitAuditReport {
	totalCount: number;
	evacuatedCount: number;
	deliberatedCount: number;
	clarificationCount: number;
	categoryDistribution: Record<ArcKitRequirementCategory, number>;
	requirements: AuditedRequirement[];
	hardPoints: ArchitecturalHardPoint[];
	clarifications: Array<{ clauseRef: string; title: string; question: string }>;
}

/**
 * Détermine la catégorie ArcKit à partir du contenu d'une exigence
 */
export function categorizeRequirement(ref: string, title: string, text: string): ArcKitRequirementCategory {
	const upperRef = ref.toUpperCase();
	if (upperRef.startsWith('BR-')) return 'BR';
	if (upperRef.startsWith('FR-')) return 'FR';
	if (upperRef.startsWith('NFR-')) return 'NFR';
	if (upperRef.startsWith('INT-')) return 'INT';
	if (upperRef.startsWith('DR-')) return 'DR';

	const full = `${ref} ${title} ${text}`.toLowerCase();

	if (
		full.includes('premises') ||
		full.includes('room layout') ||
		full.includes('video wall') ||
		full.includes('operator desks') ||
		full.includes('furniture') ||
		full.includes('screen') ||
		full.includes('lay-out') ||
		full.includes('hvac') ||
		full.includes('desktop computer')
	) {
		return 'FAC';
	}

	if (
		full.includes('availability') ||
		full.includes('resilien') ||
		full.includes('disaster recovery') ||
		full.includes('redundanc') ||
		full.includes('kpi') ||
		full.includes('sla') ||
		full.includes('target') ||
		full.includes('mtbf') ||
		full.includes('mtta') ||
		full.includes('mttr') ||
		full.includes('holdover') ||
		full.includes('denial of service') ||
		full.includes('power autonomy') ||
		full.includes('anti-jamming') ||
		full.includes('radio jamming') ||
		full.includes('handover success rate')
	) {
		return 'NFR';
	}

	if (
		full.includes('interface') ||
		full.includes('interoperab') ||
		full.includes('yang') ||
		full.includes('netconf') ||
		full.includes('restconf') ||
		full.includes('syslog') ||
		full.includes('snmp') ||
		full.includes('ptp') ||
		full.includes('mno') ||
		full.includes('ran') ||
		full.includes('adjacent') ||
		full.includes('roaming') ||
		full.includes('n3iwf')
	) {
		return 'INT';
	}

	if (
		full.includes('database') ||
		full.includes('inventory') ||
		full.includes('cmdb') ||
		full.includes('data collection') ||
		full.includes('logs') ||
		full.includes('cdr') ||
		full.includes('call detail records')
	) {
		return 'DR';
	}

	if (
		full.includes('shall be dedicated') ||
		full.includes('governance') ||
		full.includes('itil') ||
		full.includes('ownership') ||
		full.includes('responsibility') ||
		full.includes('policy') ||
		full.includes('contract') ||
		full.includes('milestone')
	) {
		return 'BR';
	}

	return 'FR';
}

/**
 * Analyse, qualifie et groupe un ensemble de clauses extraites selon la méthodologie ArcKit
 */
export function runArcKitRequirementsAudit(clauses: ExtractedClause[]): ArcKitAuditReport {
	const auditedReqs: AuditedRequirement[] = [];
	const clarifications: Array<{ clauseRef: string; title: string; question: string }> = [];

	for (const clause of clauses) {
		const category = categorizeRequirement(clause.clauseRef, clause.title, clause.text);
		const full = `${clause.clauseRef} ${clause.title} ${clause.text}`.toLowerCase();

		let disposition: RequirementDisposition = 'evacuated';
		let evacuationReason: string | undefined;
		let clarificationQuestion: string | undefined;
		let linkedSubjectId: string | undefined;

		// 1. Détection des points durs sous tension d'architecture (ADRs)
		// ADR-NOC-01 : Médiation O&M Multi-Constructeurs (RAN GOV vs MNO Partagé)
		if (
			clause.clauseRef === 'REQ-Lot1-201' ||
			clause.clauseRef === 'REQ-Lot1-240' ||
			clause.clauseRef === 'REQ-Lot1-241' ||
			clause.clauseRef === 'REQ-Lot1-242' ||
			clause.clauseRef === 'REQ-Lot1-243' ||
			clause.clauseRef === 'REQ-Lot1-248' ||
			clause.clauseRef === 'REQ-Lot1-249' ||
			clause.clauseRef === 'REQ-Lot1-250' ||
			clause.clauseRef === 'REQ-Lot1-251' ||
			clause.clauseRef === 'REQ-Lot1-252' ||
			clause.clauseRef === 'REQ-Lot1-253' ||
			clause.clauseRef === 'REQ-Lot1-254'
		) {
			disposition = 'deliberated';
			linkedSubjectId = 'ADR-NOC-01';
		}
		// ADR-NOC-02 : Résilience au Déni GNSS 30j & Détection de Brouillage Radio
		else if (
			clause.clauseRef === 'REQ-Lot1-223' ||
			clause.clauseRef === 'REQ-Lot1-224' ||
			clause.clauseRef === 'REQ-Lot1-225' ||
			clause.clauseRef === 'REQ-Lot1-226' ||
			clause.clauseRef === 'REQ-Lot1-227' ||
			clause.clauseRef === 'REQ-Lot1-228' ||
			clause.clauseRef === 'REQ-Lot1-229'
		) {
			disposition = 'deliberated';
			linkedSubjectId = 'ADR-NOC-02';
		}
		// ADR-NOC-03 : Haute Disponibilité 24/7 du NOC (Actif/Actif vs Miroir Repli)
		else if (
			clause.clauseRef === 'REQ-Lot1-192' ||
			clause.clauseRef === 'REQ-Lot1-268' ||
			clause.clauseRef === 'REQ-Lot1-270' ||
			clause.clauseRef === 'REQ-Lot1-271' ||
			clause.clauseRef === 'REQ-Lot1-282'
		) {
			disposition = 'deliberated';
			linkedSubjectId = 'ADR-NOC-03';
		}
		// ADR-NOC-04 : Boucle Fermée d'Automatisation AIOps (SMO / NWDAF / 5QI Aérien)
		else if (
			clause.clauseRef === 'REQ-Lot1-193' ||
			clause.clauseRef === 'REQ-Lot1-194' ||
			clause.clauseRef === 'REQ-Lot1-195' ||
			clause.clauseRef === 'REQ-Lot1-196' ||
			clause.clauseRef === 'REQ-Lot1-197' ||
			clause.clauseRef === 'REQ-Lot1-208' ||
			clause.clauseRef === 'REQ-Lot1-247' ||
			clause.clauseRef === 'REQ-Lot1-263'
		) {
			disposition = 'deliberated';
			linkedSubjectId = 'ADR-NOC-04';
		}
		// 2. Détection des ambiguïtés nécessitant une question de cadrage au donneur d'ordre
		else if (
			clause.clauseRef === 'REQ-Lot1-191' ||
			clause.clauseRef === 'REQ-Lot1-206' ||
			clause.clauseRef === 'REQ-Lot1-209'
		) {
			disposition = 'clarification_needed';
			clarificationQuestion =
				'Frontière de responsabilité opérationnelle : Jusqu’où le NOC dédié LUMICC a-t-il le pouvoir de piloter ou délester les cellules radio de l’opérateur commercial tiers (MNO) en situation d’urgence ?';
			clarifications.push({
				clauseRef: clause.clauseRef,
				title: clause.title,
				question: clarificationQuestion
			});
		} else if (clause.clauseRef === 'REQ-Lot1-230') {
			disposition = 'clarification_needed';
			clarificationQuestion =
				'Roadmap 3GPP Rel-20 ISAC (détection radar de drones par les antennes radio) : Quel est l’échéancier réel et l’impact sur les choix matériels de stations de base Lot 2 ?';
			clarifications.push({
				clauseRef: clause.clauseRef,
				title: clause.title,
				question: clarificationQuestion
			});
		}
		// 3. Évacuation automatique avec justification formelle
		else {
			disposition = 'evacuated';
			if (category === 'FAC') {
				evacuationReason = 'Aménagement physique, mobilier et environnement hors périmètre d’architecture logicielle';
			} else if (full.includes('itil') || full.includes('ticket') || full.includes('incident') || full.includes('alarm console')) {
				evacuationReason = 'Fonctionnalité native standard couverte par les progiciels ITSM/FCAPS sur étagère';
			} else if (full.includes('dashboard') || full.includes('report') || full.includes('hypervisor') || full.includes('export')) {
				evacuationReason = 'Fonctionnalité standard de restitution visuelle et reporting';
			} else if (full.includes('syslog') || full.includes('snmp')) {
				evacuationReason = 'Protocole de télémétrie normalisé de l’industrie sans tension d’arbitrage';
			} else {
				evacuationReason = 'Spécification technique nominale couverte par les composants standards du marché';
			}
		}

		auditedReqs.push({
			id: clause.id || clause.clauseRef.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
			clauseRef: clause.clauseRef,
			title: clause.title,
			text: clause.text,
			category,
			criticality: clause.criticality,
			disposition,
			evacuationReason,
			clarificationQuestion,
			linkedSubjectId
		});
	}

	// 4. Synthèse des Points Durs d'Architecture (Micro-sujets pour le tableau & le chat)
	const candidateHardPoints: ArchitecturalHardPoint[] = [
		{
			id: 'ADR-NOC-01',
			name: 'Médiation O&M Multi-Constructeurs : NRM Unifié vs Passerelle Propriétaire MNO',
			sectionRef: '§4.7-4.8',
			waitingForRole: 'domain_architect',
			effort: 'M',
			level: 'L0_named',
			coveredClauseRefs: [
				'REQ-Lot1-201',
				'REQ-Lot1-240',
				'REQ-Lot1-241',
				'REQ-Lot1-242',
				'REQ-Lot1-243',
				'REQ-Lot1-248',
				'REQ-Lot1-249',
				'REQ-Lot1-250',
				'REQ-Lot1-251',
				'REQ-Lot1-252',
				'REQ-Lot1-253',
				'REQ-Lot1-254'
			],
			seed: {
				initialQuestion:
					'Comment unifier la supervision O&M entre le réseau gouvernemental dédié (Open RAN / YANG) et le réseau commercial partagé (MNO) sans subir de dépendance propriétaire ?',
				initialHypothesis:
					'Déployer une couche de médiation OSS avec traducteur NRM (3GPP TS 28.659) pour normaliser les compteurs propriétaires du MNO vers le format YANG/NETCONF.',
				initialConflict:
					'Exigence d’unification multi-vendeurs vs Refus des opérateurs commerciaux d’exposer des interfaces de gestion directes sur leurs stations de base.',
				initialRetenu: [
					'REQ-Lot1-249 : Traduction des compteurs propriétaires dans un NRM unifié',
					'REQ-Lot1-250 : Adaptation aux APIs OSS/ENM du MNO (Kafka/REST/Syslog)'
				],
				expertQuestions: [
					'Quel est le niveau de granularité des compteurs radio temps réel que l’opérateur commercial tiers accepte contractuellement d’exposer au NOC LUMICC ?',
					'En cas de panne de l’interface de médiation MNO, quel est le mode de repli opérationnel toléré pour maintenir la visibilité sur la couverture partagée ?'
				]
			},
			options: [
				{
					id: 'opt-nrm-unified',
					name: 'Option A : Médiation active avec NRM unifié et normalisation des compteurs',
					pros: 'Vision homogène sur tous les RANs, conformité stricte 3GPP NRM, pas de dépendance fournisseur',
					cons: 'Effort de développement de traducteurs spécifiques par équipementier'
				},
				{
					id: 'opt-enm-passthrough',
					name: 'Option B : Consommation directe des interfaces OSS/ENM des opérateurs sans retraduction',
					pros: 'Mise en œuvre immédiate sans développement de médiation lourd',
					cons: 'Écrans séparés pour les exploitants, perte de corrélation transverse entre RAN GOV et RAN MNO'
				}
			]
		},
		{
			id: 'ADR-NOC-02',
			name: 'Résilience au Déni GNSS 30j & Détection de Brouillage Radio',
			sectionRef: '§4.5',
			waitingForRole: 'infra_expert_architect',
			effort: 'M',
			level: 'L0_named',
			coveredClauseRefs: [
				'REQ-Lot1-223',
				'REQ-Lot1-224',
				'REQ-Lot1-225',
				'REQ-Lot1-226',
				'REQ-Lot1-227',
				'REQ-Lot1-228',
				'REQ-Lot1-229'
			],
			seed: {
				initialQuestion:
					'Quelle architecture de maintien temporel et de détection permet d’assurer 30 jours de fonctionnement nominal en cas de coupure totale du signal GNSS/GPS ?',
				initialHypothesis:
					'Combiner des horloges atomiques locales (Rubidium / CSAC) sur les nœuds centraux avec une distribution réseau PTP v2.1 (IEEE 1588-2019) synchronisée sur l’horloge étatique.',
				initialConflict:
					'Exigence de maintien temporel sub-microseconde sur 30 jours vs Coût matériel et maintenance des oscillateurs atomiques embarqués.',
				initialRetenu: [
					'REQ-Lot1-223 : Fonctionnement normal supérieur à 1 mois en cas de déni GNSS',
					'REQ-Lot1-224 : Analyse d’interférences radio rapportées par les terminaux (SINR/RSSI)'
				],
				expertQuestions: [
					'Quel est le drift (dérive temporelle) maximal acceptable pour les communications MCPTT avant décrochage des cellules radio synchronisées ?',
					'Le réseau de transmission filaire de secours entre datacentres est-il garanti sans gigue pour acheminer le flux PTP v2.1 ?'
				]
			},
			options: [
				{
					id: 'opt-atomic-holdover',
					name: 'Option A : Oscillateurs atomiques locaux haute stabilité (Rubidium) sur chaque cœur',
					pros: 'Autonomie absolue 30 jours sans aucune dépendance réseau externe',
					cons: 'Coût unitaire élevé et nécessité de recalibration périodique'
				},
				{
					id: 'opt-ptp-distribution',
					name: 'Option B : Distribution filaire PTP v2.1 depuis l’horloge étatique + OCXO local',
					pros: 'Moins onéreux, supervision centralisée de la dérive de phase',
					cons: 'Vulnérabilité si la liaison de transport filaire est coupée en même temps que le brouillage GPS'
				}
			]
		},
		{
			id: 'ADR-NOC-03',
			name: 'Haute Disponibilité 24/7 du NOC : Actif/Actif Distribué vs Miroir Salle de Repli',
			sectionRef: '§4.10-4.12',
			waitingForRole: 'lead_architect',
			effort: 'S',
			level: 'L0_named',
			coveredClauseRefs: [
				'REQ-Lot1-192',
				'REQ-Lot1-268',
				'REQ-Lot1-270',
				'REQ-Lot1-271',
				'REQ-Lot1-282'
			],
			seed: {
				initialQuestion:
					'Quelle topologie d’infrastructure garantit la continuité opérationnelle du NOC 24/7 en cas de sinistre ou d’inaccessibilité du site principal ?',
				initialHypothesis:
					'Déployer le cœur applicatif NOC (ITSM, SIEM, Hyperviseur) en cluster actif/actif sur les deux datacentres géoredondants, avec salle principale et salle de repli tiède.',
				initialConflict:
					'Continuité de service instantanée sans perte d’état vs Complexité de synchronisation temps réel des consoles pupitres et du mur d’images.',
				initialRetenu: [
					'REQ-Lot1-192 : Opération continue 24/7 géoredondante (primaire + backup)',
					'REQ-Lot1-282 : Salle de repli préconfigurée pour continuité d’activité'
				],
				expertQuestions: [
					'Quel est le délai de bascule (RTO) maximal consenti aux équipes d’exploitation pour évacuer vers la salle de repli et reprendre les appels d’urgence ?',
					'Les équipes d’astreinte 24/7 doivent-elles opérer depuis les deux salles en permanence ou uniquement lors d’une crise ?'
				]
			},
			options: [
				{
					id: 'opt-active-active-cluster',
					name: 'Option A : Infrastructure FCAPS actif/actif sur 2 sites avec bascule automatique',
					pros: 'RTO = 0 sur les données de supervision, aucun point unique de défaillance',
					cons: 'Bande passante requise entre datacentres pour réplication synchrone'
				},
				{
					id: 'opt-active-passive-warm',
					name: 'Option B : Salle principale active + Salle de repli en miroir asynchrone (RTO < 15 min)',
					pros: 'Architecture plus simple, procédures de reprise maîtrisées et éprouvées',
					cons: 'Nécessite une manipulation humaine de bascule DNS/routage'
				}
			]
		},
		{
			id: 'ADR-NOC-04',
			name: 'Boucle Fermée d’Automatisation AIOps : Auto-remédiation vs Contrôle Opérateur',
			sectionRef: '§4.1-4.8',
			waitingForRole: 'data_architect',
			effort: 'S',
			level: 'L0_named',
			coveredClauseRefs: [
				'REQ-Lot1-193',
				'REQ-Lot1-194',
				'REQ-Lot1-195',
				'REQ-Lot1-196',
				'REQ-Lot1-197',
				'REQ-Lot1-208',
				'REQ-Lot1-247',
				'REQ-Lot1-263'
			],
			seed: {
				initialQuestion:
					'Quel niveau d’autonomie accorder au moteur d’intentions AIOps/NWDAF pour ajuster les priorités radio (5QI aérien, préemption) en situation de saturation ?',
				initialHypothesis:
					'Mettre en œuvre des playbooks automatisés avec garde-fous : réallocation dynamique automatique des 5QI avec seuils pré-approuvés et notification temps réel au pupitre.',
				initialConflict:
					'Réactivité sub-seconde exigée en crise vs Risque d’effet de bord ou de délestage intempestif d’usagers critiques par un algorithme autonome.',
				initialRetenu: [
					'REQ-Lot1-195 : 5QI aérien dédié pour flux montants drones/hélicoptères',
					'REQ-Lot1-263 : Playbooks automatisés avec option d’approbation opérateur'
				],
				expertQuestions: [
					'Quelles sont les conditions strictes (nature de l’intervention de sécurité civile) autorisant la préemption d’un flux vidéo drone sur un flux voix policier ?',
					'L’opérateur NOC doit-il avoir un bouton d’arrêt d’urgence (Kill Switch) immédiat pour figer les politiques d’orchestration automatique ?'
				]
			},
			options: [
				{
					id: 'opt-closed-loop-full',
					name: 'Option A : Boucle fermée 100% autonome (Closed-Loop Automation)',
					pros: 'Temps de réponse instantané (< 500 ms) face aux pics de charge et brouillages',
					cons: 'Difficilement auditable immédiatement par les opérateurs en salle'
				},
				{
					id: 'opt-human-gate-aiops',
					name: 'Option B : Recommandation AIOps avec validation humaine en 1 clic (Human-in-the-Loop)',
					pros: 'Maîtrise totale de l’exploitation, traçabilité et responsabilité humaine claire',
					cons: 'Temps de réaction tributaire de la disponibilité des opérateurs en salle'
				}
			]
		}
	];

	const inputClauseRefs = new Set(clauses.map((c) => c.clauseRef));
	const hardPoints: ArchitecturalHardPoint[] = candidateHardPoints
		.filter((hp) => hp.coveredClauseRefs.some((ref) => inputClauseRefs.has(ref)))
		.map((hp) => ({
			...hp,
			coveredClauseRefs: hp.coveredClauseRefs.filter((ref) => inputClauseRefs.has(ref))
		}));

	// Distribution des catégories
	const categoryDistribution: Record<ArcKitRequirementCategory, number> = {
		FR: auditedReqs.filter((r) => r.category === 'FR').length,
		NFR: auditedReqs.filter((r) => r.category === 'NFR').length,
		INT: auditedReqs.filter((r) => r.category === 'INT').length,
		FAC: auditedReqs.filter((r) => r.category === 'FAC').length,
		BR: auditedReqs.filter((r) => r.category === 'BR').length,
		DR: auditedReqs.filter((r) => r.category === 'DR').length
	};

	return {
		totalCount: auditedReqs.length,
		evacuatedCount: auditedReqs.filter((r) => r.disposition === 'evacuated').length,
		deliberatedCount: auditedReqs.filter((r) => r.disposition === 'deliberated').length,
		clarificationCount: auditedReqs.filter((r) => r.disposition === 'clarification_needed').length,
		categoryDistribution,
		requirements: auditedReqs,
		hardPoints,
		clarifications
	};
}
