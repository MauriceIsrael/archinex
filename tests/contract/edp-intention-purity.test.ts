import { describe, it, expect } from 'vitest';
import {
  checkIntentionPurity,
  type DecisionContextInput
} from '../../src/lib/domain/edp/intentionPurity.js';

describe('EDP Intention Purity Checker (Issue #169)', () => {
  describe('Détection des Valeurs d’Instanciation (HLD / LLD Leaks)', () => {
    it('détecte une adresse IPv4 privée dans le problème', () => {
      const context: DecisionContextInput = {
        problem: 'Le serveur principal sur 10.240.12.101 ne répond plus aux requêtes.',
        decision: 'Remplacer le serveur par un cluster de répartition.',
        tradeoffs: 'Coût additionnel'
      };

      const result = checkIntentionPurity(context);
      expect(result.pure).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('ipv4');
      expect(result.violations[0].value).toBe('10.240.12.101');
      expect(result.violations[0].field).toBe('problem');
      expect(result.violations[0].position).toBe(25);
    });

    it('détecte un préfixe CIDR IPv4 dans la décision', () => {
      const context: DecisionContextInput = {
        problem: 'Besoin d adresser le réseau de gestion.',
        decision: 'Attribuer le bloc 192.168.1.0/24 pour l interface hors-bande.',
        tradeoffs: 'Sous-réseau isolé'
      };

      const result = checkIntentionPurity(context);
      expect(result.pure).toBe(false);
      expect(result.violations[0].type).toBe('cidr');
      expect(result.violations[0].value).toBe('192.168.1.0/24');
      expect(result.violations[0].field).toBe('decision');
    });

    it('détecte une adresse IPv6 dans les compromis', () => {
      const context: DecisionContextInput = {
        problem: 'Migration vers IPv6.',
        decision: 'Activer le routage double pile.',
        tradeoffs: ['Risque de routage vers 2001:db8::1 non filtré']
      };

      const result = checkIntentionPurity(context);
      expect(result.pure).toBe(false);
      expect(result.violations[0].type).toBe('ipv6');
      expect(result.violations[0].value).toBe('2001:db8::1');
      expect(result.violations[0].field).toBe('tradeoffs[0]');
    });

    it('détecte différentes syntaxes d’adresses MAC matérielles', () => {
      const macs = [
        '00:1A:2B:3C:4D:5E',
        '00-11-22-33-44-55',
        '001a.2b3c.4d5e'
      ];

      for (const mac of macs) {
        const context: DecisionContextInput = {
          problem: `Affectation de la carte réseau ${mac}.`,
          decision: 'Fixer la configuration.',
          tradeoffs: 'Statique'
        };

        const result = checkIntentionPurity(context);
        expect(result.pure).toBe(false);
        expect(result.violations.some((v) => v.type === 'mac' && v.value.toLowerCase() === mac.toLowerCase())).toBe(true);
      }
    });

    it('détecte un nom d’hôte logique ou physique pointé', () => {
      const hostnames = [
        'srv-01.exemple.local',
        'node1.k8s.internal',
        'gw-edge.prod.corp'
      ];

      for (const host of hostnames) {
        const context: DecisionContextInput = {
          problem: `Connexion vers ${host} requise.`,
          decision: 'Ouvrir le flux.',
          tradeoffs: 'Audit renforcé'
        };

        const result = checkIntentionPurity(context);
        expect(result.pure).toBe(false);
        expect(result.violations.some((v) => v.type === 'hostname' && v.value === host)).toBe(true);
      }
    });
  });

  describe('Non-Régression & Zéro Faux Positif Garanti', () => {
    it('n’émet AUCUNE violation sur les normes, spécifications et versions autorisées', () => {
      const legitimateContext: DecisionContextInput = {
        problem:
          'Architecture alignée avec 3GPP TS 23.501, 3GPP 38.300 et les recommandations RFC 5737.',
        decision:
          'Déploiement sur cluster bare-metal avec RKE2 1.28 et noyau Linux 6.6, configuration 5QI 128-254 et QoS 5.1.',
        tradeoffs: [
          'Isolation par VLAN 100 avec MTU 1500 sous AS 65001.',
          'Remplacement des adresses de production par le gabarit <IP> et variable ${NODE_IP} documentée sur example.com.'
        ]
      };

      const result = checkIntentionPurity(legitimateContext);
      expect(result.pure).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('ignore les versions logicielles classiques du type 5.5 ou 1.2.3', () => {
      const context: DecisionContextInput = {
        problem: 'Mise à niveau de la version 5.5 vers la version 1.28.',
        decision: 'Standardiser le socle en version 2.4.1.',
        tradeoffs: 'Rétrocompatibilité garantie'
      };

      const result = checkIntentionPurity(context);
      expect(result.pure).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Propriétés de Fonction Pure', () => {
    it('est déterministe et n’effectue aucun appel réseau', () => {
      const context: DecisionContextInput = {
        problem: 'Question intensionnelle',
        decision: 'Choix architectural',
        tradeoffs: 'Compromis'
      };

      const r1 = checkIntentionPurity(context);
      const r2 = checkIntentionPurity(context);
      expect(r1).toEqual(r2);
      expect(r1.pure).toBe(true);
    });
  });
});
