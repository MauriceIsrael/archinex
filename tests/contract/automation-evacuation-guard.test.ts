import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import type { ExtractedClause } from '$lib/domain/corpus';
import { findAutomationMarker } from '$lib/domain/automationMarkers';
import { shredRfpTextToClauses } from '$lib/domain/rfpConfrontation';
import { applyClassificationInvariants, type ClassifyItem } from '$lib/server/ingest/arckitRequirementsPipeline';

const REASON = 'Fonction standard du marché, sans arbitrage d’architecture à mener.';

const clause = (ref: string, text: string, criticality: ExtractedClause['criticality'] = 'majeur', title = `Exigence ${ref}`): ExtractedClause => ({
	id: `id-${ref}`,
	clauseRef: ref,
	title,
	text,
	criticality
});
const commodity = (ref: string): ClassifyItem => ({ ref, disposition: 'commodity', category: 'FR', reason: REASON, question: null });

describe('Automatisation : jamais évacuée par le modèle seul (J0, archinex#132)', () => {
	describe('findAutomationMarker : une famille de formulations, pas le vocabulaire d’un dossier', () => {
		it.each([
			['The system shall automatically open a ticket for each alarm.'],
			['Automated incident creation from monitoring events.'],
			['La plateforme déclenche automatiquement la bascule vers le site de secours.'],
			['Création automatique des demandes de changement.'],
			['Remédiation automatisée des dérives de configuration.'],
			['Self-healing of failed nodes is required.'],
			['A closed-loop control adjusts capacity.'],
			['Régulation en boucle fermée de la charge.'],
			['Restart the service without human intervention.'],
			['Redémarrage sans intervention humaine du service.'],
			['Auto-remediation of expired certificates.']
		])('reconnaît : %s', (text) => {
			expect(findAutomationMarker(text)).not.toBeNull();
		});

		it.each([
			['Adjustable height desks with monitor mounts and cable management.'],
			['Autonomie de 72 heures sur batteries.'],
			['The console shall allow the operator to acknowledge alarms and add annotations.'],
			['Les rapports SLA sont exportés en PDF, CSV et JSON.'],
			['Authentication of every operator is mandatory.'],
			['Manual approval is required before any change.']
		])('ne signale pas : %s', (text) => {
			expect(findAutomationMarker(text)).toBeNull();
		});
	});

	describe('applyClassificationInvariants', () => {
		it('renvoie à un humain une clause d’automatisation que le modèle voulait évacuer, et garde sa proposition', () => {
			const c = clause('R-1', 'Le système crée automatiquement les incidents depuis les alarmes.');
			const [out] = applyClassificationInvariants([c], [commodity('R-1')]);
			expect(out.disposition).toBe('to_qualify');
			expect(out.evacuationReason).toBeUndefined();
			expect(out.qualifyReason).toMatch(/Automatisation/);
			expect(out.qualifyReason).toContain('Fonction standard du marché');
		});

		it('vaut pour une clause « bloquant » comme pour « majeur », et lit aussi le titre', () => {
			const [a] = applyClassificationInvariants([clause('R-2', 'Texte neutre.', 'majeur', 'Automated rollback')], [commodity('R-2')]);
			expect(a.disposition).toBe('to_qualify');
			const [b] = applyClassificationInvariants([clause('R-3', 'Self-healing of the cluster.', 'bloquant')], [commodity('R-3')]);
			expect(b.disposition).toBe('to_qualify');
		});

		it('n’empêche pas d’évacuer une clause d’information (mobilier, câblage) même si le mot apparaît', () => {
			const [out] = applyClassificationInvariants([clause('R-4', 'Prise électrique avec coupure automatique.', 'info')], [commodity('R-4')]);
			expect(out.disposition).toBe('evacuated');
		});

		it('n’empêche pas d’évacuer une commodité sans automatisation', () => {
			const [out] = applyClassificationInvariants([clause('R-5', 'Les rapports sont exportés en PDF et en CSV.')], [commodity('R-5')]);
			expect(out.disposition).toBe('evacuated');
		});

		it('ne touche ni une clause à délibérer ni une clarification', () => {
			const c = clause('R-6', 'Le système corrige automatiquement les erreurs.');
			const delib: ClassifyItem = { ref: 'R-6', disposition: 'deliberate', category: 'FR', reason: 'tension réelle', question: null };
			expect(applyClassificationInvariants([c], [delib])[0].disposition).toBe('deliberated');
		});
	});

	describe('rejeu sur les évacuations archivées du jalon J0 (eval-results/rapport-1.md, 92 clauses LUMICC)', () => {
		const md = fs.readFileSync(path.resolve(process.cwd(), 'examples/lumicc-noc/rfp-section4-noc.md'), 'utf-8');
		const clauses = shredRfpTextToClauses(md);
		// Les six clauses que le modèle a proposé d’évacuer aux deux passes.
		const EVACUATED = ['REQ-Lot1-199', 'REQ-Lot1-216', 'REQ-Lot1-258', 'REQ-Lot1-259', 'REQ-Lot1-265', 'REQ-Lot1-275'];

		// Réponse du modèle reconstituée : les six évacuations, toutes les autres clauses à délibérer.
		const modelAnswer = (): ClassifyItem[] =>
			clauses.map((c) =>
				EVACUATED.includes(c.clauseRef)
					? commodity(c.clauseRef)
					: { ref: c.clauseRef, disposition: 'deliberate', category: 'FR', reason: 'tension réelle', question: null }
			);

		it('la clause qui était un faux négatif dangereux n’est plus évacuée, et les autres évacuations restent', () => {
			const out = applyClassificationInvariants(clauses, modelAnswer());
			const status = (ref: string) => out.find((r) => r.clauseRef === ref)!.disposition;
			expect(status('REQ-Lot1-216')).toBe('to_qualify');
			// Même famille (création automatisée d’incident depuis une alarme) : renvoyée aussi, c’est le compromis assumé.
			expect(status('REQ-Lot1-259')).toBe('to_qualify');
			for (const ref of ['REQ-Lot1-199', 'REQ-Lot1-258', 'REQ-Lot1-265', 'REQ-Lot1-275']) expect(status(ref)).toBe('evacuated');
		});

		it('coût en « à qualifier » sur ce dossier : deux clauses sur 92, loin du plafond de 30 % de jalon-j0.md', () => {
			const out = applyClassificationInvariants(clauses, modelAnswer());
			const toQualify = out.filter((r) => r.disposition === 'to_qualify').length;
			expect(toQualify).toBe(2);
			expect(toQualify / clauses.length).toBeLessThan(0.3);
		});
	});
});
