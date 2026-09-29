import { describe, it, expect } from 'vitest';
import {
	buildKbCandidates,
	anonymizeText,
	anonymizeCandidate,
	type AnonymizationContext
} from '$lib/domain/capitalization';
import type { Decision, Option } from '$lib/domain/options';

describe('Lot A5 - Domain Capitalization & KB Candidate Generation Contract', () => {
	const mockOptions: Option[] = [
		{
			id: 'opt-cloud-native',
			subjectId: 'subj-storage',
			title: 'Solution Cloud Native Distribuée',
			summary: 'Architecture distribuée sur Kubernetes avec Ceph.',
			origin: 'human',
			kbRefs: [], // Aucun antécédent doctrinal
			status: 'retained',
			author: 'Alice Lead',
			role: 'lead_architect',
			productionMode: 'human-authored',
			version: 1
		},
		{
			id: 'opt-legacy-san',
			subjectId: 'subj-storage',
			title: 'SAN Fibre Channel Externe',
			summary: 'Baie SAN propriétaire en datacenter.',
			origin: 'human',
			kbRefs: ['RULE-SAN-01'],
			status: 'rejected',
			author: 'Bob Infra',
			role: 'domain_expert',
			productionMode: 'human-authored',
			version: 1
		}
	];

	it('génère un candidat new_asset et un candidat rex si l option retenue n a pas de kbRefs', () => {
		const decision: Decision = {
			id: 'dec-101',
			subjectId: 'subj-storage',
			retainedOptionId: 'opt-cloud-native',
			rejected: [{ optionId: 'opt-legacy-san', reason: 'Coût trop élevé et manque de portabilité' }],
			rationale: 'Le cloud-native offre la résilience requise à coût maîtrisé.',
			reversibility: 'costly',
			arbiterId: 'alice-architect',
			arbiterRole: 'lead_architect',
			decidedAt: new Date().toISOString(),
			acceptedViolations: [],
			kbCandidateIds: [],
			version: 1
		};

		const candidates = buildKbCandidates({
			decision,
			subject: { id: 'subj-storage', name: 'Stockage persistant', domain: 'infrastructure' },
			options: mockOptions,
			engagement: 'test-engagement',
			author: 'Alice Lead',
			authorRole: 'lead_architect'
		});

		expect(candidates).toHaveLength(2);

		const newAsset = candidates.find((c) => c.kind === 'new_asset');
		expect(newAsset).toBeDefined();
		expect(newAsset?.title).toContain('Pattern architectural émergent');
		expect(newAsset?.title).toContain('Solution Cloud Native Distribuée');
		expect(newAsset?.production_mode).toBe('human-authored');

		const rex = candidates.find((c) => c.kind === 'rex');
		expect(rex).toBeDefined();
		expect(rex?.title).toContain('REX Décision : Stockage persistant');
		expect(rex?.summary).toContain('Option retenue : Solution Cloud Native Distribuée');
		expect(rex?.summary).toContain('SAN Fibre Channel Externe (motif: Coût trop élevé et manque de portabilité)');
	});

	it('ne génère pas de new_asset si l option retenue possède déjà des kbRefs', () => {
		const optionsWithKbRefs: Option[] = [
			{
				...mockOptions[0],
				kbRefs: ['PAT-CEPH-01', 'RULE-K8S-STORE']
			}
		];

		const decision: Decision = {
			id: 'dec-102',
			subjectId: 'subj-storage',
			retainedOptionId: 'opt-cloud-native',
			rejected: [],
			rationale: 'Pattern standard déjà répertorié.',
			reversibility: 'reversible',
			arbiterId: 'alice-architect',
			arbiterRole: 'lead_architect',
			decidedAt: new Date().toISOString(),
			acceptedViolations: [],
			kbCandidateIds: [],
			version: 1
		};

		const candidates = buildKbCandidates({
			decision,
			subject: { id: 'subj-storage', name: 'Stockage persistant', domain: 'infrastructure' },
			options: optionsWithKbRefs,
			engagement: 'test-engagement',
			author: 'Alice Lead'
		});

		expect(candidates).toHaveLength(1);
		expect(candidates[0].kind).toBe('rex');
	});

	it('génère un candidat amendment pour chaque violation doctrinale acceptée', () => {
		const decision: Decision = {
			id: 'dec-103',
			subjectId: 'subj-secu',
			retainedOptionId: 'opt-cloud-native',
			rejected: [],
			rationale: 'Choix validé avec dérogation de chiffrement.',
			reversibility: 'reversible',
			arbiterId: 'alice-architect',
			arbiterRole: 'lead_architect',
			decidedAt: new Date().toISOString(),
			acceptedViolations: [
				{
					typedId: 'RULE-CRYPTO-STRICT',
					justification: 'Chiffrement matériel au niveau du contrôleur suffisant pour ce POC isolé.'
				},
				{
					typedId: 'RULE-NET-AIRGAP',
					justification: 'Accès limité au sous-réseau technique de maintenance.'
				}
			],
			kbCandidateIds: [],
			version: 1
		};

		const candidates = buildKbCandidates({
			decision,
			subject: { id: 'subj-secu', name: 'Sécurité Réseau', domain: 'security' },
			options: [
				{
					...mockOptions[0],
					kbRefs: ['RULE-SEC-01']
				}
			],
			engagement: 'test-engagement',
			author: 'Alice Lead'
		});

		// 2 amendements + 1 rex
		expect(candidates).toHaveLength(3);

		const amendments = candidates.filter((c) => c.kind === 'amendment');
		expect(amendments).toHaveLength(2);

		const cryptoAmend = amendments.find((a) => a.target_asset_ref === 'RULE-CRYPTO-STRICT');
		expect(cryptoAmend).toBeDefined();
		expect(cryptoAmend?.accepted_violation_justification).toContain('Chiffrement matériel');
		expect(cryptoAmend?.title).toContain('RULE-CRYPTO-STRICT');

		const netAmend = amendments.find((a) => a.target_asset_ref === 'RULE-NET-AIRGAP');
		expect(netAmend).toBeDefined();
		expect(netAmend?.accepted_violation_justification).toContain('sous-réseau technique');
	});
});

describe('Lot A5 - Anonymization Engine Contract', () => {
	const anonymCtx: AnonymizationContext = {
		projectNames: ['Projet Alpha', 'Alpha'],
		clientNames: ['Banque Nationale', 'Acme Corp'],
		siteNames: ['Site Aubervilliers', 'DC2 Courbevoie'],
		participantNames: ['Jean Dupont', 'Marie Curie']
	};

	it('anonymise les entités projet, client, sites et participants', () => {
		const raw =
			'Pour le Projet Alpha chez Banque Nationale, Jean Dupont a validé le déploiement sur DC2 Courbevoie.';
		const redacted = anonymizeText(raw, anonymCtx);

		expect(redacted).not.toContain('Projet Alpha');
		expect(redacted).not.toContain('Banque Nationale');
		expect(redacted).not.toContain('Jean Dupont');
		expect(redacted).not.toContain('DC2 Courbevoie');

		expect(redacted).toContain('[PROJECT]');
		expect(redacted).toContain('[CLIENT]');
		expect(redacted).toContain('[PARTICIPANT]');
		expect(redacted).toContain('[SITE]');
	});

	it('anonymise les adresses IPv4 et IPv6', () => {
		const raw =
			'Le serveur DNS écoute sur 192.168.1.10 et 10.0.0.254, ou en IPv6 2001:0db8:85a3:0000:0000:8a2e:0370:7334.';
		const redacted = anonymizeText(raw, anonymCtx);

		expect(redacted).not.toContain('192.168.1.10');
		expect(redacted).not.toContain('10.0.0.254');
		expect(redacted).not.toContain('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
		expect(redacted).toBe('Le serveur DNS écoute sur [IP] et [IP], ou en IPv6 [IP].');
	});

	it('anonymise les volumes de stockage et chemins de périphériques chiffrés', () => {
		const raw =
			'Données montées sur /dev/mapper/vg0-data_crypt et le disque /dev/sdb1, UUID=a1b2c3d4-e5f6-7890-abcd-ef1234567890 ou vol-0123456789abcdef0.';
		const redacted = anonymizeText(raw, anonymCtx);

		expect(redacted).not.toContain('/dev/mapper/vg0-data_crypt');
		expect(redacted).not.toContain('/dev/sdb1');
		expect(redacted).not.toContain('UUID=a1b2c3d4-e5f6-7890-abcd-ef1234567890');
		expect(redacted).not.toContain('vol-0123456789abcdef0');
		expect(redacted).toBe(
			'Données montées sur [STORAGE_VOLUME] et le disque [STORAGE_VOLUME], [STORAGE_VOLUME] ou [STORAGE_VOLUME].'
		);
	});

	it('anonymise l ensemble des champs d un KbCandidate', () => {
		const candidate = {
			kind: 'new_asset' as const,
			title: 'Pattern chez Banque Nationale par Marie Curie',
			summary: 'Projet Alpha utilise l IP 172.16.0.5 et /dev/mapper/secret-luks.',
			suggested_change: 'Adopter pour Acme Corp',
			rationale: 'Décidé par Marie Curie sur Site Aubervilliers',
			source: {
				system: 'archinex' as const,
				engagement: 'proj-123'
			},
			author: 'Marie Curie',
			production_mode: 'human-authored' as const
		};

		const clean = anonymizeCandidate(candidate, anonymCtx);

		expect(clean.title).toBe('Pattern chez [CLIENT] par [PARTICIPANT]');
		expect(clean.summary).toBe('[PROJECT] utilise l IP [IP] et [STORAGE_VOLUME].');
		expect(clean.suggested_change).toBe('Adopter pour [CLIENT]');
		expect(clean.rationale).toBe('Décidé par [PARTICIPANT] sur [SITE]');
		expect(clean.author).toBe('[PARTICIPANT]');
	});
});
