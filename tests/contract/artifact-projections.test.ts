import { describe, it, expect } from 'vitest';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';
import {
	generateMermaidDiagram,
	generateTargetArchitectureDiagram,
	generateDeploymentSequenceDiagram,
	generateStructurizrDSL,
	generateSysMLv2,
	generateConfigJSON,
	generateStructurizrVisualMermaid,
	generateSysMLVisualMermaid,
	type ProjectionContext
} from '$lib/domain/artifactProjections';

describe('Projections dynamiques d\'architecture (No Doc Drift - Issue #64)', () => {
	const subject: MaturitySubject = {
		id: 'sub-auth',
		section_ref: '§3.1',
		name: 'Gestion des Identités et Accès',
		level: 'L3_decided',
		blocking_count: 0,
		unlocks_count: 1,
		waiting_for_role: 'lead_architect',
		relative_effort: 'M',
		last_transition_date: '2026-10-14T00:00:00Z',
		stall_days: 0,
		is_stalled: false,
		dependent_subject_ids: []
	};

	const draft: TelegraphicDraft = {
		section_id: '§3.1',
		subject: 'Gestion des Identités et Accès',
		maturity: 'L3_decided',
		is_provisional: false,
		retenu: ['KH:ADR-0021'],
		suppose: [],
		conflit: [],
		manque: []
	};

	const statements: Statement[] = [
		{
			id: 'stmt-1',
			section: '§3.1',
			triplet: { subject: 'sub-auth', predicate: 'session_ttl_minutes', value: '15' },
			justification: { basedOn: ['KH:ADR-0021'] },
			authority: { author: 'sec-lead', role: 'security_architect', productionMode: 'human-authored' },
			maturity: { subjectLevel: 'L3_decided', confidence: 'designed' },
			revisability: { antecedents: [] },
			status: 'active',
			createdAt: '2026-10-14T00:00:00Z',
			updatedAt: '2026-10-14T00:00:00Z'
		},
		{
			id: 'stmt-2',
			section: '§3.1',
			triplet: { subject: 'sub-auth', predicate: 'mfa_enforced', value: 'true' },
			justification: { basedOn: [] },
			authority: { author: 'lead', role: 'lead_architect', productionMode: 'human-authored' },
			maturity: { subjectLevel: 'L3_decided', confidence: 'verified' },
			revisability: { antecedents: [] },
			status: 'active',
			createdAt: '2026-10-14T00:00:00Z',
			updatedAt: '2026-10-14T00:00:00Z'
		}
	];

	const context: ProjectionContext = {
		projectName: 'Plateforme E-Santé Régionale',
		enterpriseName: 'GCS e-Santé',
		actors: [
			{ name: 'Praticien Hospitalier', role: 'domain_user', description: 'Accède aux dossiers patients' }
		],
		decision: {
			retainedOptionId: 'opt-oidc',
			retainedOptionTitle: 'Fédération OIDC avec Pro Santé Connect',
			rationale: 'Obligation régalienne et interopérabilité nationale',
			reversibility: 'costly',
			decidedAt: '2026-10-14T10:00:00Z',
			arbiterId: 'lead-arch',
			arbiterRole: 'lead_architect'
		},
		requirements: [
			{ clauseRef: 'EX-042', title: 'Authentification forte CPS / e-CPS' }
		],
		sealSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
	};

	it('1. C4 Structurizr DSL reflète le projet, l\'acteur réel et l\'option retenue sans données fixes', () => {
		const dsl = generateStructurizrDSL(subject, draft, statements, context);
		expect(dsl).toContain('group "GCS e-Santé"'); // `enterprise` n'existe plus dans Structurizr
		expect(dsl).not.toContain('enterprise');
		expect(dsl).toContain('person "Praticien Hospitalier"');
		expect(dsl).toContain('container "Fédération OIDC avec Pro Santé Connect"');
		expect(dsl).toContain('session_ttl_minutes');
		// Ne doit plus contenir les valeurs en dur
		expect(dsl).not.toContain('Opérateur Réseau');
		expect(dsl).not.toContain('Infrastructure Critiques');
	});

	it('2. C4 Mermaid visuel intègre l\'acteur et l\'option retenue', () => {
		const visual = generateStructurizrVisualMermaid(subject, draft, statements, context);
		expect(visual).toContain('Praticien Hospitalier');
		expect(visual).toContain('GCS e-Santé');
		expect(visual).toContain('Fédération OIDC avec Pro Santé Connect');
		expect(visual).not.toContain('Opérateur Réseau');
	});

	it('3. Configuration JSON dynamique ne contient aucun profil télécom PTP en dur et type les valeurs', () => {
		const jsonStr = generateConfigJSON(subject, draft, statements, '2026-10-14T12:00:00Z', context);
		const parsed = JSON.parse(jsonStr);

		expect(parsed.subject.id).toBe('sub-auth');
		expect(parsed.decision.retainedOptionTitle).toBe('Fédération OIDC avec Pro Santé Connect');
		expect(parsed.parameters.session_ttl_minutes).toBe(15); // Converti en nombre
		expect(parsed.parameters.mfa_enforced).toBe(true); // Converti en booléen
		expect(parsed.coveredRequirements).toEqual(['EX-042']);
		expect(parsed.provenance.sealSha256).toBe(context.sealSha256);

		// Ne doit plus contenir de PTP IEEE 1588
		expect(jsonStr).not.toContain('IEEE_1588_G8275_1');
		expect(jsonStr).not.toContain('domainNumber');
		expect(jsonStr).not.toContain('holdoverSpec');
	});

	it('4. SysML v2 modélise l\'option retenue et les exigences sans dérive', () => {
		const sysml = generateSysMLv2(subject, draft, statements, context);
		expect(sysml).toContain("package 'Gestion des Identités et Accès'");
		expect(sysml).toContain('part def Opt_F_d_ration_OIDC_avec_Pro_Sant__Connect');
		expect(sysml).toContain('session_ttl_minutes');
		expect(sysml).toContain('EX-042');
	});

	it('5. Mermaid causal intègre l\'option retenue et les triplets prouvés', () => {
		const mmd = generateMermaidDiagram(subject, draft, statements, context);
		expect(mmd).toContain('flowchart TD');
		expect(mmd).toContain('Fédération OIDC avec Pro Santé Connect');
		expect(mmd).toContain('session_ttl_minutes');
	});


	it('6. Schéma d\'architecture cible (C4 / Flowchart) génère la topologie spécifiée (Cas Hybride RATP / WAPT)', () => {
		const ratpSubject: MaturitySubject = {
			id: 'sub-supervision',
			section_ref: '§11, §1.3',
			name: 'Outillage de supervision, logs et déploiement WAPT',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'lead_architect',
			relative_effort: 'M',
			last_transition_date: '2026-10-14T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		};

		const ratpContext: ProjectionContext = {
			projectId: 'csft-tetra-ratp',
			projectName: 'Système Après-TETRA',
			enterpriseName: 'RATP',
			decision: {
				retainedOptionId: 'opt-hybrid',
				retainedOptionTitle: 'Hybride : outils propres interfacés à l\'existant',
				rationale: 'Le système embarque ses agents, sa métrologie et sa console, et exporte alarmes, métriques et logs vers l\'outillage RATP. Le déploiement passe par WAPT avec paquets signés et validation humaine.',
				reversibility: 'costly',
				decidedAt: '2026-10-31T19:00:00Z',
				arbiterRole: 'lead_architect'
			},
			options: [
				{
					id: 'opt-hybrid',
					title: 'Hybride : outils propres interfacés à l\'existant',
					summary: 'Le système embarque ses agents, sa métrologie et sa console, et exporte alarmes, métriques et logs vers l\'outillage RATP. Le déploiement passe par WAPT avec paquets signés et validation humaine.',
					status: 'retained'
				}
			]
		};

		const diagram = generateTargetArchitectureDiagram(ratpSubject, null, [], ratpContext);

		// Doit contenir le flowchart avec les styles C4
		expect(diagram).toContain('flowchart TB');
		expect(diagram).toContain('classDef boundary');
		expect(diagram).toContain('classDef core');
		expect(diagram).toContain('classDef deploy');

		// Doit contenir les frontières Système (Après-TETRA) et SI RATP Existant avec tag de projet formel
		expect(diagram).toContain('Système : Système Après-TETRA (§11, §1.3) [Projet: csft-tetra-ratp]');
		expect(diagram).toContain('SI RATP (Existant)');

		// Doit contenir les composants internes autonomes
		expect(diagram).toContain('AgentLocal');
		expect(diagram).toContain('MetrologieLocale');
		expect(diagram).toContain('ConsoleAdmin');
		expect(diagram).toContain('ModuleExport');

		// Doit contenir les interfaces d\'exportation dynamiquement liées à l\'entreprise
		expect(diagram).toContain('Supervision Externe (RATP)');
		expect(diagram).toContain('Plateforme Logs (RATP)');
		expect(diagram).toContain('Alarmes (SNMP Trap / Webhook)');
		expect(diagram).toContain('Export logs d\'audit (Syslog TLS)');

		// Doit contenir la chaîne WAPT avec signature et validation humaine
		expect(diagram).toContain('ValideurHumain');
		expect(diagram).toContain('Guichet Homologation / Validation Humaine (RATP)');
		expect(diagram).toContain('Paquet WAPT Signé');
		expect(diagram).toContain('Agent WAPT Client');
		expect(diagram).toContain('Dépôt & Serveur WAPT (RATP)');
	});

	it('7. Diagramme de séquence de déploiement modélise les 3 phases avec validation humaine', () => {
		const ratpSubject = {
			id: 'sub-supervision',
			section_ref: '§11, §1.3',
			name: 'Outillage de supervision'
		};

		const ratpContext: ProjectionContext = {
			projectName: 'Système Après-TETRA',
			enterpriseName: 'RATP',
			decision: {
				retainedOptionId: 'opt-hybrid',
				retainedOptionTitle: 'Hybride RATP WAPT validation humaine',
				rationale: 'Validation humaine requise sur INT avant déploiement en production'
			}
		};

		const seq = generateDeploymentSequenceDiagram(ratpSubject, null, [], ratpContext);

		expect(seq).toContain('sequenceDiagram');
		expect(seq).toContain('autonumber');
		expect(seq).toContain('Phase 1 : Préparation & Assemblage (Outillage de supervision)');
		expect(seq).toContain('Phase 2 : Intégration Intégration (INT)');
		expect(seq).toContain('Phase 3 : Porte d\'Homologation & Sécurité');
		expect(seq).toContain('Phase 4 : Mise en Production & Exploitation');
		expect(seq).toContain('Responsable Homologation (RATP)');
		expect(seq).toContain('Serveur WAPT (Dépôt officiel)');
		expect(seq).toContain('Outillage de supervision');
	});

	it('8. Schéma cible affiche un état d\'attente propre sans décision L3', () => {
		const emptySubject = {
			id: 'sub-draft',
			section_ref: '§4.2',
			name: 'Stockage Distribué'
		};
		const diagram = generateTargetArchitectureDiagram(emptySubject, null, []);
		expect(diagram).toContain('flowchart TB');
		expect(diagram).toContain('Architecture Cible en Attente d\'Arbitrage L3');
	});
	it('9. Génère la topologie de sécurité réseau pour flux S6a avec terminaison IPsec SecGW et médiation DEA', () => {
		const s6aSubject = {
			id: 'sub-s6a-crypto',
			section_ref: '§4.1',
			name: 'Sécurité des flux S6a inter-lots'
		};

		const s6aContext: ProjectionContext = {
			decision: {
				retainedOptionId: 'opt-ipsec-dea',
				retainedOptionTitle: 'Obligation de chiffrement IPsec ESP et médiation DEA pour les flux S6a Lot 3 ↔ Lot 1',
				rationale: 'Tout échange S6a initié par un MME tiers doit obligatoirement terminer son tunnel IPsec sur le SecGW-Lot1, puis être inspecté par le DEA-Lot1. Tous les flux directs vers le HSS-Lot1 doivent être chiffrés.'
			}
		};

		const diagram = generateTargetArchitectureDiagram(s6aSubject, null, [], s6aContext);

		expect(diagram).toContain('flowchart TB');
		expect(diagram).toContain('MME_Lot3');
		expect(diagram).toContain('SecGW_Lot1');
		expect(diagram).toContain('DEA_Lot1');
		expect(diagram).toContain('HSS_Lot1');
		expect(diagram).toContain('Tunnel IPsec ESP chiffré (IKEv2 / AES-256)');
		expect(diagram).toContain('Médiation S6a, filtrage AVP & masquage topologique TH');
		expect(diagram).toContain('INTERDIT : Flux direct non chiffré ou sans DEA');
	});

	it('10. Génère le diagramme de séquence télécom 3GPP pour la négociation IPsec ESP et médiation S6a', () => {
		const s6aSubject = {
			id: 'sub-s6a-crypto',
			section_ref: '§4.1',
			name: 'Sécurité des flux S6a inter-lots'
		};

		const s6aContext: ProjectionContext = {
			decision: {
				retainedOptionId: 'opt-ipsec-dea',
				retainedOptionTitle: 'Obligation de chiffrement IPsec ESP et médiation DEA pour les flux S6a Lot 3 ↔ Lot 1',
				rationale: 'Tout échange S6a initié par un MME tiers doit obligatoirement terminer son tunnel IPsec sur le SecGW-Lot1, puis être inspecté par le DEA-Lot1.'
			}
		};

		const seq = generateDeploymentSequenceDiagram(s6aSubject, null, [], s6aContext);

		expect(seq).toContain('sequenceDiagram');
		expect(seq).toContain('Sécurité des flux S6a inter-lots');
		expect(seq).toContain('SecGW-Lot1');
		expect(seq).toContain('DEA-Lot1');
		expect(seq).toContain('IPsec');
		expect(seq).toContain('Chiffrement & certificats PKI');
	});
	it('11. Isole les spécifications multi-plateformes (Lulu) : génère le socle 3 plateformes sans fuite RATP/PCC', () => {
		const luluSubject = {
			id: 'sub-lulu-env',
			section_ref: '§2.4',
			name: "Socle d'environnements et représentativité des bancs"
		};

		const luluContext: ProjectionContext = {
			projectId: 'lulu-lot1-noc',
			projectName: 'Lulu',
			enterpriseName: 'Grand-Duché de Luxembourg',
			decision: {
				retainedOptionId: 'opt-lulu-3p',
				retainedOptionTitle: 'Socle 3 plateformes, pré-prod iso-état',
				rationale: "Production, pré-production unique au Luxembourg répliquant l'état technique de la production (et capable d'accueillir un état candidat), test réduit avec Test-RAN. Qualification fournisseurs chez les fournisseurs, avec contrôle d'audit et de représentativité."
			}
		};

		const diagram = generateTargetArchitectureDiagram(luluSubject, null, [], luluContext);

		// Doit refléter fidèlement le socle 3 plateformes lié formellement à son projet
		expect(diagram).toContain('Socle d\'Environnements Multi-Plateformes (Grand-Duché de Luxembourg) [Projet: lulu-lot1-noc]');
		expect(diagram).toContain('Plateforme de Production (PROD)');
		expect(diagram).toContain('Pré-production Unique Iso-État');
		expect(diagram).toContain('Test Réduit avec Test-RAN');
		expect(diagram).toContain('Qualification Fournisseurs');
		expect(diagram).toContain("Contrôle d'Audit & Représentativité");

		// Isolation stricte : aucune mention de la RATP ou du PCC
		expect(diagram).not.toContain('RATP');
		expect(diagram).not.toContain('PCC');
		expect(diagram).not.toContain('WAPT');

		const seq = generateDeploymentSequenceDiagram(luluSubject, null, [], luluContext);
		expect(seq).toContain('sequenceDiagram');
		expect(seq).toContain('Grand-Duché de Luxembourg');
		expect(seq).toContain('Test-RAN');
		expect(seq).toContain('Pré-production');
		expect(seq).toContain('Production');
		expect(seq).not.toContain('RATP');
		expect(seq).not.toContain('WAPT');
	});

	it("12. Isole les connecteurs d'intégration génériques : aucune fuite RATP sans mention explicite", () => {
		const genericSubject = {
			id: 'sub-generic-integration',
			section_ref: '§1.2',
			name: 'Supervision et Métrologie Externe'
		};

		const genericContext: ProjectionContext = {
			projectName: 'Projet Souverain',
			decision: {
				retainedOptionId: 'opt-gen-sup',
				retainedOptionTitle: "Architecture hybride avec connecteurs d'export standardisés",
				rationale: "Le système embarque sa métrologie locale et exporte les métriques et logs vers le SI d'exploitation existant."
			}
		};

		const diagram = generateTargetArchitectureDiagram(genericSubject, null, [], genericContext);

		// Ne doit pas mentionner la RATP ni le PCC si non présent dans la spec
		expect(diagram).not.toContain('RATP');
		expect(diagram).not.toContain('PCC');
		expect(diagram).toContain("Passerelle d'Export & Connecteurs d'Intégration");
		expect(diagram).toContain('Supervision & Exploitation Externe');
	});
	it('13. Réactivité en direct : la modification de detailedSpecText transforme dynamiquement l\'architecture sans altérer la décision L3', () => {
		const subject: MaturitySubject = {
			id: 'sub-crypto',
			section_ref: '§4.1',
			name: 'Sécurité et flux inter-lots',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'lead_architect',
			relative_effort: 'M',
			last_transition_date: '2026-10-14T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		};

		const baseContext: ProjectionContext = {
			projectId: 'projet-interop',
			projectName: 'Système Interop',
			enterpriseName: 'Entité Opératrice',
			decision: {
				retainedOptionId: 'opt-base',
				retainedOptionTitle: 'Option de base approuvée',
				rationale: 'Conforme aux exigences générales'
			}
		};

		// Sans spec détaillée : schéma général
		const initialDiagram = generateTargetArchitectureDiagram(subject, null, [], baseContext);
		expect(initialDiagram).not.toContain('SecGW-Lot1');
		expect(initialDiagram).not.toContain('DEA-Lot1');

		// Mise à jour de detailedSpecText (saisie live dans le workbench L4)
		const updatedContext: ProjectionContext = {
			...baseContext,
			detailedSpecText: 'Obligation de chiffrement IPsec ESP et médiation DEA pour les flux S6a Lot 3 <-> Lot 1'
		};

		const liveDiagram = generateTargetArchitectureDiagram(subject, null, [], updatedContext);
		// Le schéma doit immédiatement basculer vers la topologie télécom S6a sécurisée
		expect(liveDiagram).toContain('SecGW-Lot1');
		expect(liveDiagram).toContain('DEA-Lot1');
		expect(liveDiagram).toContain('HSS-Lot1');
		expect(liveDiagram).toContain('Tunnel IPsec ESP chiffré');
		expect(liveDiagram).toContain('INTERDIT : Flux direct non chiffré');

		const liveSeq = generateDeploymentSequenceDiagram(subject, null, [], updatedContext);
		expect(liveSeq).toContain('sequenceDiagram');
		expect(liveSeq).toContain('IPsec');
		expect(liveSeq).toContain('Chiffrement & certificats PKI');
	});

	it('14. Pattern Actif/Actif Géoredondant Bi-Site : modélise les 2 Datacenters, Anycast/GSLB et arbitrage Split-Brain', () => {
		const subject: MaturitySubject = {
			id: 'sub-ha',
			section_ref: '§2.3, §10, §15',
			name: 'Topologie de haute disponibilité et reprise : actif/actif géoredondant ou schéma alternatif',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'lead_architect',
			relative_effort: 'L',
			last_transition_date: '2026-11-11T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		};

		const context: ProjectionContext = {
			projectId: 'lot1-mcx',
			projectName: 'Système Radio Critique',
			decision: {
				retainedOptionId: 'opt-aa-geo',
				retainedOptionTitle: 'Actif/actif géoredondant généralisé',
				rationale: 'Zones indépendantes et routage multiple sur toutes les chaînes répondent directement à REQ-Lot1-22 et REQ-Lot1-1387.'
			},
			options: [
				{
					id: 'opt-aa-geo',
					title: 'Actif/actif géoredondant généralisé',
					summary: 'Cœur, OSS et MCX en actif/actif sur au moins deux zones indépendantes, avec répartition de charge géoredondante, réplication des données et routage multiple depuis plusieurs couches radio.',
					status: 'retained'
				}
			]
		};

		const diagram = generateTargetArchitectureDiagram(subject, null, [], context);

		expect(diagram).toContain('flowchart TB');
		expect(diagram).toContain('DATACENTER 1 — Zone Primaire A (Actif 50%)');
		expect(diagram).toContain('DATACENTER 2 — Zone Primaire B (Actif 50%)');
		expect(diagram).toContain('Anycast BGP & GSLB / Geo-DNS');
		expect(diagram).toContain('Témoin de Quorum / Tie-Breaker');
		expect(diagram).toContain('Interconnect DCI (Fibre Noire / DWDM)');
		expect(diagram).toContain('REQ-Lot1-22');
		expect(diagram).toContain('REQ-Lot1-1387');
		expect(diagram).toContain('Cœur Réseau A');
		expect(diagram).toContain('Cœur Réseau B');
		expect(diagram).toContain('Services Critiques A');
		expect(diagram).toContain('Services Critiques B');
		expect(diagram).toContain('OSS / Supervision A');
		expect(diagram).toContain('OSS / Supervision B');
	});

	it('15. Pattern Survie Edge Tactique : modélise le mode îlotage et la bulle autonome', () => {
		const subject: MaturitySubject = {
			id: 'sub-edge',
			section_ref: '§3.2',
			name: 'Bulle tactique projetable',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'lead_architect',
			relative_effort: 'M',
			last_transition_date: '2026-11-11T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		};

		const context: ProjectionContext = {
			projectId: 'tactical-edge',
			projectName: 'Système Edge Tactique',
			decision: {
				retainedOptionId: 'opt-edge-survie',
				retainedOptionTitle: 'Survie locale Edge autonome en mode îlotage',
				rationale: 'Maintien des communications de groupe locales en cas de rupture du backhaul national.'
			}
		};

		const diagram = generateTargetArchitectureDiagram(subject, null, [], context);

		expect(diagram).toContain('Cœur National Central');
		expect(diagram).toContain('Bulle Tactique Locale / Site Edge Autonome (Survie Locale)');
		expect(diagram).toContain('UPF Locale (User Plane Function)');
		expect(diagram).toContain('Serveur Edge Autonome');
		expect(diagram).toContain('RUPTURE : Déconnexion Backhaul');
	});

	it('16. Pattern Découplage Canonique 3GPP MCX : sépare SIP Core Kamailio, MCX App Servers et Common Services', () => {
		const subject: MaturitySubject = {
			id: 'sub-mcx-stack',
			section_ref: '§5.1',
			name: 'Architecture applicative MCX',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'lead_architect',
			relative_effort: 'M',
			last_transition_date: '2026-11-11T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		};

		const context: ProjectionContext = {
			projectId: 'openmcx-platform',
			projectName: 'Serveur MCX 3GPP',
			decision: {
				retainedOptionId: 'opt-mcx-stack',
				retainedOptionTitle: 'Découplage openMCX modulaire 3GPP Rel-19',
				rationale: 'Séparation SIP Core, App Servers MCPTT/MCData/MCVideo et Common Services OIDC/XCAP.'
			}
		};

		const diagram = generateTargetArchitectureDiagram(subject, null, [], context);

		expect(diagram).toContain('SIP Core Layer (Kamailio / CSCF)');
		expect(diagram).toContain('MCPTT Server');
		expect(diagram).toContain('MCData Server');
		expect(diagram).toContain('MCVideo Server');
		expect(diagram).toContain('Group Management (XCAP / CMS / GMS)');
	});

	it('17. Pattern Passerelle Hybride LMR / MCX : modélise la fonction IWF et le transcodage vocodeur', () => {
		const subject: MaturitySubject = {
			id: 'sub-interop',
			section_ref: '§7.4',
			name: 'Interopérabilité radio legacy',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'lead_architect',
			relative_effort: 'M',
			last_transition_date: '2026-11-11T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		};

		const context: ProjectionContext = {
			projectId: 'interop-pmr',
			projectName: 'Passerelle LMR Cible',
			decision: {
				retainedOptionId: 'opt-iwf',
				retainedOptionTitle: 'Passerelle d\'interconnexion hybride IWF TETRA vers MCX',
				rationale: 'Conforme 3GPP TS 29.314 avec transcodage vocodeur ACELP vers AMR-WB.'
			}
		};

		const diagram = generateTargetArchitectureDiagram(subject, null, [], context);

		expect(diagram).toContain('Réseau Radio Historique (PMR / TETRA / P25)');
		expect(diagram).toContain('Passerelle d\'Interconnexion Sécurisée (3GPP TS 29.314)');
		expect(diagram).toContain('Contrôleur IWF (InterWorking Function)');
		expect(diagram).toContain('Passerelle Vocodeur & Média');
		expect(diagram).toContain('Système Haut-Débit Cible (3GPP / MCPTT)');
	});

	it('18. Chaîne de déploiement actif/actif progressive : modélise le drainage GSLB, le déploiement GitOps par zone et le contrôle de quorum', () => {
		const subject: MaturitySubject = {
			id: 'sub-ha',
			section_ref: '§2.3, §10, §15',
			name: 'Topologie de haute disponibilité et reprise',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'lead_architect',
			relative_effort: 'L',
			last_transition_date: '2026-11-11T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		};

		const context: ProjectionContext = {
			projectId: 'lot1-mcx',
			projectName: 'Système Radio Critique',
			enterpriseName: 'Gendarmerie Nationale',
			decision: {
				retainedOptionId: 'opt-aa-geo',
				retainedOptionTitle: 'Actif/actif géoredondant généralisé',
				rationale: 'Zones indépendantes et routage multiple sur toutes les chaînes répondent directement à REQ-Lot1-22 et REQ-Lot1-1387.'
			}
		};

		const seq = generateDeploymentSequenceDiagram(subject, null, [], context);

		expect(seq).toContain('sequenceDiagram');
		expect(seq).toContain('autonumber');
		expect(seq).toContain('REQ-Lot1-22');
		expect(seq).toContain('REQ-Lot1-1387');
		expect(seq).toContain('Actif/actif géoredondant généralisé');
		expect(seq).toContain('Gendarmerie Nationale');
		expect(seq).toContain('Résilience, sauvegarde & reprise');
		expect(seq).not.toContain('WAPT');
	});

	it('19. Chaîne de déploiement Survie Edge : modélise l\'épreuve d\'îlotage et la resynchronisation au retour du backhaul', () => {
		const subject: MaturitySubject = {
			id: 'sub-edge-seq',
			section_ref: '§3.2',
			name: 'Bulle tactique projetable',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'lead_architect',
			relative_effort: 'M',
			last_transition_date: '2026-11-11T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		};

		const context: ProjectionContext = {
			projectId: 'tactical-edge',
			projectName: 'Système Edge Tactique',
			decision: {
				retainedOptionId: 'opt-edge-survie',
				retainedOptionTitle: 'Survie locale Edge autonome en mode îlotage',
				rationale: 'Maintien des communications de groupe locales sans dépendance centrale.'
			}
		};

		const seq = generateDeploymentSequenceDiagram(subject, null, [], context);

		expect(seq).toContain('sequenceDiagram');
		expect(seq).toContain('Bulle tactique projetable');
		expect(seq).toContain('Survie locale Edge autonome en mode îlotage');
		expect(seq).not.toContain('WAPT');
	});

	it('20. Chaîne de déploiement Passerelle IWF/LMR : modélise la double écoute audio et la migration progressive', () => {
		const subject: MaturitySubject = {
			id: 'sub-iwf-seq',
			section_ref: '§7.4',
			name: 'Migration radio LMR vers 3GPP',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'lead_architect',
			relative_effort: 'M',
			last_transition_date: '2026-11-11T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		};

		const context: ProjectionContext = {
			projectId: 'interop-pmr',
			projectName: 'Passerelle LMR Cible',
			decision: {
				retainedOptionId: 'opt-iwf',
				retainedOptionTitle: 'Passerelle d\'interconnexion hybride IWF TETRA vers MCX',
				rationale: 'Migration progressive avec transcodage ACELP vers AMR-WB sans interruption.'
			}
		};

		const seq = generateDeploymentSequenceDiagram(subject, null, [], context);

		expect(seq).toContain('sequenceDiagram');
		expect(seq).toContain('Migration radio LMR vers 3GPP');
		expect(seq).toContain('Passerelle d\'interconnexion hybride IWF TETRA vers MCX');
		expect(seq).not.toContain('WAPT');
	});

	it('21. Issue #311 : Contextualise le diagramme de séquence à partir des énoncés, du brouillon et des protocoles (cas SIG/Carto sans WAPT)', () => {
		const cartoSubject: MaturitySubject = {
			id: 'sub-carto',
			section_ref: '§6.2',
			name: 'Service Cartographique & Tuiles Vecteur',
			level: 'L2_decomposed',
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'domain_architect',
			relative_effort: 'M',
			last_transition_date: '2026-11-12T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		};

		const cartoDraft: TelegraphicDraft = {
			section_id: 'sub-carto',
			subject: 'Service Cartographique & Tuiles Vecteur',
			maturity: 'L2_decomposed',
			is_provisional: true,
			retenu: [
				'Serveur de tuiles : Tegola / Martin',
				'Stockage géospatial : PostGIS + cache MBTiles'
			],
			suppose: [
				{ text: 'Débit WMS/WMTS < 500 req/s en pointe', consequence: 'Dimensionnement 2 nœuds suffisant' }
			],
			conflit: [
				{ text: 'Format MBTiles embarqué', opposing_reference: 'REQ-SIG-04 (flux OGC temps réel)', requires_arbitration: true }
			],
			manque: []
		};

		const cartoStatements: Statement[] = [
			{
				id: 'ENG:sig/S-101',
				section: '§6.2',
				triplet: { subject: 'sub-carto', predicate: 'Serveur cartographique', value: 'GeoServer OGC' },
				justification: { basedOn: [], appliedRule: 'Homologation RGS / HTTPS mTLS' },
				authority: { author: 'arch-1', role: 'domain_architect', productionMode: 'human-authored' },
				maturity: { subjectLevel: 'L2_decomposed', confidence: 'designed' },
				revisability: { antecedents: [] },
				status: 'active',
				createdAt: '2026-11-12T00:00:00Z',
				updatedAt: '2026-11-12T00:00:00Z'
			},
			{
				id: 'ENG:sig/S-102',
				section: '§6.2',
				triplet: { subject: 'sub-carto', predicate: 'Base géospatiale', value: 'Cluster PostGIS' },
				justification: { basedOn: ['ENG:sig/S-101'] },
				authority: { author: 'arch-1', role: 'data_architect', productionMode: 'human-authored' },
				maturity: { subjectLevel: 'L2_decomposed', confidence: 'verified' },
				revisability: { antecedents: ['ENG:sig/S-101'] },
				status: 'active',
				createdAt: '2026-11-12T00:00:00Z',
				updatedAt: '2026-11-12T00:00:00Z'
			}
		];

		const cartoContext: ProjectionContext = {
			projectId: 'proj-sig',
			projectName: 'Portail Géomatique',
			enterpriseName: 'Collectivité Territoriale',
			decision: {
				retainedOptionId: 'opt-ogc-hybride',
				retainedOptionTitle: 'Publication OGC WMTS/WMS sur PostGIS avec cache embarqué',
				reversibility: 'Bascule vers tuiles statiques S3 en < 15 min',
				arbiterRole: 'RSSI & Lead Architect'
			},
			requirements: [{ clauseRef: 'REQ-SIG-04', title: 'Conformité OGC & TLS' }],
			detailedSpecText: 'Déploiement en Qualification puis Production sur infrastructure dédiée avec chiffrement mTLS.'
		};

		const seq = generateDeploymentSequenceDiagram(cartoSubject, cartoDraft, cartoStatements, cartoContext);

		expect(seq).toContain('sequenceDiagram');
		expect(seq).not.toContain('WAPT');
		expect(seq).not.toContain('Paquet applicatif');
		expect(seq).toContain('GeoServer OGC');
		expect(seq).toContain('Cluster PostGIS');
		expect(seq).toContain('Qualification / Recette');
		expect(seq).toContain('Production');
		expect(seq).toContain('WMTS');
		expect(seq).toContain('WMS');
		expect(seq).toContain('mTLS');
		expect(seq).toContain('REQ-SIG-04');
		expect(seq).toContain('RSSI & Lead Architect');
		expect(seq).toContain('Section provisoire');
		expect(seq).toContain('Arbitrage requis');
		expect(seq).toContain('Vérification hypothèse');
		expect(seq).toContain('Plan de retour');
	});

	it('22. Issue #311 : Exploite les slots Phase 4, environnements et acteurs explicites du contexte', () => {
		const subjectSlot: MaturitySubject = {
			id: 'sub-iam',
			section_ref: '§3.4',
			name: 'Fédération d\'Identité OIDC',
			level: 'L4_specified',
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'security_architect',
			relative_effort: 'M',
			last_transition_date: '2026-11-15T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		};

		const slotContext: ProjectionContext = {
			projectName: 'Socle Identité',
			actors: [
				{ name: 'Équipe IAM', role: 'Intégration' },
				{ name: 'Autorité Homologation', role: 'RSSI' }
			],
			environments: ['Staging / INT', 'Production Souveraine'],
			slots: [
				{
					slotId: 'slot-idp',
					axisTitle: 'Fournisseur OIDC',
					instantiatedComponents: ['Keycloak Cluster', 'Passerelle API OIDC'],
					executableOracleRules: ['RBAC strict + PKCE obligatoire']
				}
			],
			sealSha256: 'a1b2c3d4e5f60000'
		};

		const seq = generateDeploymentSequenceDiagram(subjectSlot, null, [], slotContext);

		expect(seq).toContain('sequenceDiagram');
		expect(seq).toContain('Équipe IAM (Intégration)');
		expect(seq).toContain('Autorité Homologation (RSSI)');
		expect(seq).toContain('Keycloak Cluster');
		expect(seq).toContain('Passerelle API OIDC');
		expect(seq).toContain('Staging / INT');
		expect(seq).toContain('Production Souveraine');
		expect(seq).toContain('RBAC strict + PKCE obligatoire');
		expect(seq).toContain('Scellement a1b2c3d4');
		expect(seq).not.toContain('WAPT');
	});

	it('23. Issue #311 : Conserve un fallback propre si aucun signal contextuel n\'est fourni', () => {
		const bareSubject = {
			id: 'sub-bare',
			section_ref: '§1.0',
			name: 'Module Initial'
		};
		const seq = generateDeploymentSequenceDiagram(bareSubject, null, [], {});
		expect(seq).toContain('sequenceDiagram');
		expect(seq).toContain('Phase 1 : Construction et Signature Cryptographique');
	});
});