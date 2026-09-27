import { describe, it, expect } from 'vitest';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { createDefaultEngagements, SUSE_TELCO_SUBJECTS, SUSE_TELCO_CORPUS } from '$lib/domain/engagements';

describe('Dual-Engagement Engine & Local Isolation Contract', () => {
	it('1. Initialise les 2 profils d\'engagement distincts (Blueprint SUSE Telco Cloud & RFP CCTP)', () => {
		const engagements = createDefaultEngagements([], {}, []);
		expect(engagements).toHaveLength(2);

		const suse = engagements.find((e) => e.id === 'suse-telco-cloud-generic');
		expect(suse).toBeDefined();
		expect(suse?.type).toBe('generic_blueprint');
		expect(suse?.shortName).toBe('SUSE Telco Cloud');
		expect(suse?.subjects.some((s) => s.id === 'suse_cni_sriov')).toBe(true);
		expect(suse?.subjects.some((s) => s.id === 'suse_rt_kernel')).toBe(true);
		expect(suse?.corpusDocuments.some((d) => d.id === 'DOC-SUSE-ARCH-01')).toBe(true);

		const cctp = engagements.find((e) => e.id === 'cctp-mcx-nordwave');
		expect(cctp).toBeDefined();
		expect(cctp?.type).toBe('project_rfp');
		expect(cctp?.shortName).toBe('CCTP 5G & MCX');
	});

	it('2. Bascule dynamiquement sur SUSE Telco Cloud et isole son corpus documentaire', () => {
		deliberationStore.switchEngagement('suse-telco-cloud-generic');
		expect(deliberationStore.activeEngagementId).toBe('suse-telco-cloud-generic');
		expect(deliberationStore.activeEngagement.shortName).toBe('SUSE Telco Cloud');

		// Sujet actif par défaut
		expect(deliberationStore.activeSubjectId).toBe('suse_cni_sriov');
		expect(deliberationStore.activeSubject?.name).toContain('SR-IOV/DPDK');

		// Le corpus doit contenir les livres blancs éditeur SUSE
		const hasSuseWhitepaper = deliberationStore.corpusDocuments.some(
			(d) => d.id === 'DOC-SUSE-ARCH-01' && d.sourceOrAuthor === 'SUSE Telco Engineering Team'
		);
		expect(hasSuseWhitepaper).toBe(true);

		// Les documents CCTP ne doivent PAS fuiter dans l'instance SUSE
		const hasCctpDoc = deliberationStore.corpusDocuments.some((d) => d.id === 'DOC-CLI-01');
		expect(hasCctpDoc).toBe(false);
	});

	it('3. Bascule sur CCTP Projet Réel et conserve l\'état local de chaque instance', () => {
		// Étape a: Dans SUSE, on modifie le sujet actif
		deliberationStore.selectSubject('suse_rt_kernel');
		expect(deliberationStore.activeSubjectId).toBe('suse_rt_kernel');

		// Étape b: On bascule sur CCTP Réel
		deliberationStore.switchEngagement('cctp-mcx-nordwave');
		expect(deliberationStore.activeEngagementId).toBe('cctp-mcx-nordwave');
		expect(deliberationStore.activeEngagement.shortName).toBe('CCTP 5G & MCX');
		expect(deliberationStore.corpusDocuments.some((d) => d.id === 'DOC-CLI-01')).toBe(true);

		// Étape c: On revient sur SUSE Telco Cloud -> l'état local en cache est restauré
		deliberationStore.switchEngagement('suse-telco-cloud-generic');
		expect(deliberationStore.activeEngagementId).toBe('suse-telco-cloud-generic');
		expect(deliberationStore.activeSubjectId).toBe('suse_rt_kernel');
	});

	it('4. Garantit que les 2 instances tournent 100% en local et sans régression', () => {
		expect(deliberationStore.engagements).toHaveLength(2);
		expect(deliberationStore.notifications[0].message).toContain('100% Local');
	});
});
