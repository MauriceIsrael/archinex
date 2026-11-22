import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import fs from 'node:fs';
import path from 'node:path';
import { computePhaseNavigation } from '$lib/domain/phaseNavigation';
import { buildResourceName, sanitizeResourceSegment } from '$lib/domain/edp/resourceNaming';
import { composeMultiAxisHydration } from '$lib/server/edp/refinementCoverage';
import ProjectEngagementHeader from '$lib/components/deliberation/ProjectEngagementHeader.svelte';
import '$lib/i18n';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { createTestDefaultEngagements } from '../fixtures/sample-data';

describe('Issue #393 — Stepper à états par phase, i18n française cohérente et génération de noms', () => {
	describe('1. Calcul des états par phase et prochaine action unique', () => {
		it('projet vide : Phase 1 non démarrée, Phases 2–5 bloquées, prochaine action = Importer le corpus', () => {
			const nav = computePhaseNavigation({
				corpusCount: 0,
				subjects: [],
				activeSubject: null,
				frozenSnapshotIds: []
			});

			expect(nav.phases.appropriation.status).toBe('not_started');
			expect(nav.phases.deliberation.status).toBe('blocked');
			expect(nav.phases.rendu.status).toBe('blocked');
			expect(nav.phases.refinement.status).toBe('blocked');
			expect(nav.phases.consolidation.status).toBe('blocked');
			expect(nav.nextAction.phaseId).toBe('appropriation');
			expect(nav.nextAction.label).toContain('Importer le corpus');
			for (const p of Object.values(nav.phases)) {
				expect(p.reason.length).toBeGreaterThan(10);
			}
		});

		it('sujet en cours (L2) non décidé : Phase 2 en cours, Phases 3/4/5 bloquées (Phase 4 jamais verte avant L3)', () => {
			const subj = {
				id: 'subj-1',
				section_ref: '§2.1',
				name: 'Topologie réseau',
				level: 'L2_decomposed' as const,
				blocking_count: 0,
				awaiting_review: false
			};
			const nav = computePhaseNavigation({
				corpusCount: 2,
				subjects: [subj],
				activeSubject: subj,
				frozenSnapshotIds: []
			});

			expect(nav.phases.appropriation.status).toBe('ready');
			expect(nav.phases.deliberation.status).toBe('in_progress');
			expect(nav.phases.rendu.status).toBe('blocked');
			expect(nav.phases.refinement.status).toBe('blocked');
			expect(nav.phases.refinement.reason).toContain('L3');
			expect(nav.phases.consolidation.status).toBe('blocked');
			expect(nav.nextAction.phaseId).toBe('deliberation');
			expect(nav.nextAction.viewMode).toBe('conversation');
		});

		it('sujet avec blocages ouverts : Phase 2 bloquée avec la raison chiffrée', () => {
			const subj = {
				id: 'subj-2',
				section_ref: '§3.4',
				name: 'Chiffrement inter-sites',
				level: 'L2_decomposed' as const,
				blocking_count: 2,
				awaiting_review: false
			};
			const nav = computePhaseNavigation({
				corpusCount: 1,
				subjects: [subj],
				activeSubject: subj,
				frozenSnapshotIds: []
			});

			expect(nav.phases.deliberation.status).toBe('blocked');
			expect(nav.phases.deliberation.reason).toContain('2 blocage');
			expect(nav.nextAction.label).toContain('Lever les blocages');
		});

		it('sujet décidé (L3) non scellé -> prochaine action = Sceller le HLD ; puis scellé -> Raffiner en LLD ; puis L4 -> Consolider', () => {
			const subjL3 = {
				id: 'subj-3',
				section_ref: '§4.1',
				name: 'Haute disponibilité',
				level: 'L3_decided' as const,
				blocking_count: 0,
				awaiting_review: false
			};

			const navUnsealed = computePhaseNavigation({
				corpusCount: 3,
				subjects: [subjL3],
				activeSubject: subjL3,
				frozenSnapshotIds: []
			});
			expect(navUnsealed.phases.deliberation.status).toBe('ready');
			expect(navUnsealed.phases.rendu.status).toBe('in_progress');
			expect(navUnsealed.phases.refinement.status).toBe('in_progress');
			expect(navUnsealed.phases.consolidation.status).toBe('ready');
			expect(navUnsealed.nextAction.phaseId).toBe('rendu');

			const navSealed = computePhaseNavigation({
				corpusCount: 3,
				subjects: [subjL3],
				activeSubject: subjL3,
				frozenSnapshotIds: ['subj-3']
			});
			expect(navSealed.phases.rendu.status).toBe('ready');
			expect(navSealed.nextAction.phaseId).toBe('refinement');

			const subjL4 = { ...subjL3, level: 'L4_specified' as const };
			const navSpecified = computePhaseNavigation({
				corpusCount: 3,
				subjects: [subjL4],
				activeSubject: subjL4,
				frozenSnapshotIds: ['subj-3']
			});
			expect(navSpecified.phases.refinement.status).toBe('ready');
			expect(navSpecified.nextAction.phaseId).toBe('consolidation');
		});

		it('ProjectEngagementHeader rend un état calculé, une infobulle de raison sur chaque phase et une prochaine action unique', () => {
			deliberationStore.initFromDb(createTestDefaultEngagements(), []);
			const { html } = render(ProjectEngagementHeader, {
				props: {
					onOpenQuickAsk: () => {},
					onOpenLiveLock: () => {}
				}
			});

			for (const testId of [
				'phase-tab-appropriation',
				'phase-tab-deliberation',
				'phase-tab-rendu',
				'phase-tab-refinement',
				'phase-tab-consolidation'
			]) {
				const idx = html.indexOf(`data-testid="${testId}"`);
				expect(idx, `${testId} doit être présent`).toBeGreaterThan(-1);
				const snippet = html.slice(idx, idx + 450);
				expect(snippet, `${testId} doit exposer data-phase-status`).toMatch(
					/data-phase-status="(not_started|in_progress|ready|blocked)"/
				);
				expect(snippet, `${testId} doit exposer une infobulle title`).toContain('title="');
			}

			expect(html).toContain('data-testid="next-action-cta"');
			expect(html).toContain('Prochaine action :');
		});
	});

	describe('2. i18n française cohérente (zéro résidu anglais dans connexion → délibération)', () => {
		it('retire le sélecteur de langue du layout et fixe lang="fr" dans app.html', () => {
			const appHtml = fs.readFileSync(path.resolve('src/app.html'), 'utf-8');
			expect(appHtml).toContain('<html lang="fr">');

			const layout = fs.readFileSync(path.resolve('src/routes/+layout.svelte'), 'utf-8');
			expect(layout).not.toContain('LanguageSwitcher');
			expect(layout).not.toContain('Open menu');
			expect(layout).not.toContain('Expand sidebar');
			expect(layout).not.toContain('Collapse sidebar');
		});

		it('traduit intégralement /login et /api/auth/login en français sans chaîne anglaise résiduelle', () => {
			const loginPage = fs.readFileSync(path.resolve('src/routes/login/+page.svelte'), 'utf-8');
			expect(loginPage).toContain('Connexion');
			expect(loginPage).toContain('Adresse e-mail');
			expect(loginPage).toContain('Mot de passe');
			expect(loginPage).toContain('Se connecter');
			expect(loginPage).toContain('Comptes de démonstration');

			for (const forbidden of [
				'Sign In',
				'Enter your credentials',
				'Demo accounts',
				'Welcome back',
				'Signing in',
				'Hide password',
				'Show password'
			]) {
				expect(loginPage, `Chaîne anglaise interdite dans /login : ${forbidden}`).not.toContain(
					forbidden
				);
			}

			const loginApi = fs.readFileSync(
				path.resolve('src/routes/api/auth/login/+server.ts'),
				'utf-8'
			);
			expect(loginApi).not.toContain('Invalid email or password');
			expect(loginApi).not.toContain('Email and password are required');
		});

		it('toutes les clés $t(...) statiques utilisées dans src/ existent dans fr-FR.json', () => {
			const frMessages = JSON.parse(
				fs.readFileSync(path.resolve('src/lib/locales/fr-FR.json'), 'utf-8')
			) as Record<string, unknown>;

			function hasKey(obj: Record<string, unknown>, dottedKey: string): boolean {
				let cur: unknown = obj;
				for (const part of dottedKey.split('.')) {
					if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
						cur = (cur as Record<string, unknown>)[part];
					} else {
						return false;
					}
				}
				return typeof cur === 'string' && cur.length > 0;
			}

			const filesToScan = [
				'src/routes/+layout.svelte',
				'src/lib/components/HelpMenu.svelte',
				'src/lib/components/ThemeSelector.svelte'
			];

			const missingKeys: string[] = [];
			for (const relPath of filesToScan) {
				const content = fs.readFileSync(path.resolve(relPath), 'utf-8');
				const regex = /\$t\(\s*'([a-zA-Z0-9_.-]+)'/g;
				let match: RegExpExecArray | null;
				while ((match = regex.exec(content)) !== null) {
					const key = match[1];
					if (!hasKey(frMessages, key)) {
						missingKeys.push(`${relPath}:${key}`);
					}
				}
			}

			expect(missingKeys).toEqual([]);
			expect(frMessages.menu).toMatchObject({ title: 'Navigation' });
		});
	});

	describe('3. Génération de noms propres sans double tiret (--)', () => {
		it('normalise les identifiants sujets et supprime tout double tiret (--)', () => {
			// Cas historique qui produisait `srv--proposes-89-01`
			expect(
				buildResourceName('srv', 'subj_arch_proposes_89', 'edge', {
					maxSegmentLen: 12,
					suffix: '01'
				})
			).toBe('srv-proposes-89-01');

			expect(
				buildResourceName('wc', 'subj_arch_proposes_89', 'workload', {
					maxSegmentLen: 12
				})
			).toBe('wc-proposes-89');

			for (const raw of [
				'---',
				'',
				'subj--double__dash--42',
				'Réseau & Sécurité #1',
				'-leading-and-trailing-'
			]) {
				const name = buildResourceName('srv', raw, 'edge', {
					maxSegmentLen: 12,
					suffix: '01'
				});
				expect(name, `Nom invalide pour "${raw}"`).not.toContain('--');
				expect(name, `Format DNS invalide pour "${raw}"`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
			}

			expect(sanitizeResourceSegment('___', 'fallback')).toBe('fallback');
		});

		it('composeMultiAxisHydration ne génère jamais de double tiret dans les noms d hôtes ou clusters', () => {
			const emptyCatalog = {
				entities: {},
				triplets: [],
				relations: [],
				version: 'test'
			} as any;

			const hydrated = composeMultiAxisHydration('subj_arch_proposes_89', [], emptyCatalog);
			for (const dev of hydrated.nautobot_planned_devices) {
				const devName = String(dev.name ?? '');
				expect(devName).not.toContain('--');
				expect(devName).toMatch(/^srv-[a-z0-9]+(-[a-z0-9]+)*$/);
			}
			const wcMeta = (hydrated.sylva_workload_cluster_values as any)?.metadata;
			expect(String(wcMeta?.name ?? '')).not.toContain('--');
			expect(String(wcMeta?.annotations?.['archinex.io/gitops-target'] ?? '')).not.toContain('--');
		});
	});
});
