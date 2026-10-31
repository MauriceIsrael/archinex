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

		// Doit contenir les frontières Système (Après-TETRA) et SI RATP Existant
		expect(diagram).toContain('Système Après-TETRA');
		expect(diagram).toContain('Outillage de Maintenance & Exploitation RATP');

		// Doit contenir les composants internes autonomes
		expect(diagram).toContain('AgentLocal');
		expect(diagram).toContain('MetrologieLocale');
		expect(diagram).toContain('ConsoleAdmin');
		expect(diagram).toContain('ModuleExport');

		// Doit contenir les interfaces d\'exportation vers la RATP
		expect(diagram).toContain('Supervision RATP');
		expect(diagram).toContain('Plateforme Logs RATP');
		expect(diagram).toContain('Alarmes (SNMP Trap / Webhook)');
		expect(diagram).toContain('Export logs d\'audit (Syslog TLS)');

		// Doit contenir la chaîne WAPT avec signature et validation humaine
		expect(diagram).toContain('ValideurHumain');
		expect(diagram).toContain('Guichet Homologation / Validation Humaine (RATP)');
		expect(diagram).toContain('Paquet WAPT Signé');
		expect(diagram).toContain('Agent WAPT Client');
		expect(diagram).toContain('Dépôt & Serveur WAPT RATP');
	});

	it('7. Diagramme de séquence de déploiement modélise les 3 phases avec validation humaine', () => {
		const ratpSubject = {
			id: 'sub-supervision',
			section_ref: '§11, §1.3',
			name: 'Outillage de supervision'
		};

		const ratpContext: ProjectionContext = {
			decision: {
				retainedOptionId: 'opt-hybrid',
				retainedOptionTitle: 'Hybride RATP WAPT validation humaine',
				rationale: 'Validation humaine requise sur INT avant déploiement en production'
			}
		};

		const seq = generateDeploymentSequenceDiagram(ratpSubject, null, [], ratpContext);

		expect(seq).toContain('sequenceDiagram');
		expect(seq).toContain('autonumber');
		expect(seq).toContain('Phase 1 : Construction et Signature Cryptographique');
		expect(seq).toContain('Phase 2 : Porte d\'Homologation (Validation Humaine)');
		expect(seq).toContain('Phase 3 : Déploiement Sécurisé & Exécution Contrôlée');
		expect(seq).toContain('Responsable Exploitation RATP');
		expect(seq).toContain('Serveur WAPT');
		expect(seq).toContain('Hôte Après-TETRA');
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
		expect(seq).toContain('MME as MME Tiers (Lot 3)');
		expect(seq).toContain('SecGW as SecGW-Lot1 (Security Gateway)');
		expect(seq).toContain('DEA as DEA-Lot1 (Diameter Edge Agent)');
		expect(seq).toContain('HSS as HSS-Lot1 (Home Subscriber Server)');
		expect(seq).toContain('Phase 1 : Négociation IKEv2 et Établissement du Tunnel IPsec ESP');
		expect(seq).toContain('Phase 2 : Envoi Sécurisé du Flux S6a Encapsulé');
		expect(seq).toContain('Phase 3 : Médiation & Inspection Applicative Diameter');
		expect(seq).toContain("Phase 4 : Résolution et Réponse de l'Authentification");
	});
});
