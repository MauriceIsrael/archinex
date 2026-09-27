import { describe, it, expect } from 'vitest';
import {
  computeProjectMatching,
  buildTreeLegendSeries,
  formatDomainName,
  type KnowledgeSnapshot
} from '$lib/domain/knowledgeGraph';
import sealedSnapshot from '$lib/fixtures/llmops-sealed-snapshot.json';
import {
  createDefaultEngagements,
  SUSE_TELCO_SUBJECTS,
  SUSE_TELCO_DRAFTS,
  SUSE_TELCO_STATEMENTS
} from '$lib/domain/engagements';

describe('Knowledge Graph & Project Matching Engine', () => {
  const snapshot = sealedSnapshot as unknown as KnowledgeSnapshot;
  const defaultEngagements = createDefaultEngagements(SUSE_TELCO_SUBJECTS, SUSE_TELCO_DRAFTS, SUSE_TELCO_STATEMENTS);

  it('formatDomainName converts tech domains to clean French labels', () => {
    expect(formatDomainName('network-automation')).toBe('Réseau & Automatisation');
    expect(formatDomainName('cloud-platform')).toBe('Plateforme Cloud & Infrastructure');
    expect(formatDomainName('security')).toBe('Sécurité & Confiance Numérique');
    expect(formatDomainName('unknown-dom')).toBe('unknown-dom');
  });

  it('computes neutral match when no project is selected', () => {
    const { assetMatches, controlMatches, summary } = computeProjectMatching(snapshot, null);
    
    expect(summary.totalConcepts).toBeGreaterThan(100);
    expect(summary.matchedConcepts).toBe(0);
    expect(summary.matchPercentage).toBe(0);
    expect(summary.matchedDecisions).toBe(0);
    expect(summary.matchedControls).toBe(0);

    const firstAsset = snapshot.assets[0];
    expect(assetMatches.get(firstAsset.id)?.isMatched).toBe(false);
  });

  it('projects and matches concepts for SUSE Telco Cloud engagement', () => {
    const suseEngagement = defaultEngagements.find((e) => e.id === 'suse-telco-cloud-generic')!;
    expect(suseEngagement).toBeDefined();

    const { assetMatches, controlMatches, summary } = computeProjectMatching(snapshot, suseEngagement);

    // In SUSE Telco, network automation, cloud platform, and security are primary
    expect(summary.matchedConcepts).toBeGreaterThan(10);
    expect(summary.matchPercentage).toBeGreaterThan(10);
    expect(summary.matchedDecisions).toBeGreaterThan(0);

    // Check specific assets that are expected to match (e.g. ADR-0001, ADR-0002, ADR-0006)
    const adr01 = assetMatches.get('ADR-0001');
    expect(adr01).toBeDefined();
    expect(adr01?.isMatched).toBe(true);
    expect(adr01?.reasons.length).toBeGreaterThan(0);
  });

  it('projects and matches concepts for CCTP MCX Nordwave engagement', () => {
    const mcxEngagement = defaultEngagements.find((e) => e.id === 'cctp-mcx-nordwave')!;
    expect(mcxEngagement).toBeDefined();

    const { controlMatches, summary } = computeProjectMatching(snapshot, mcxEngagement);

    // In CCTP MCX, 3GPP and NIS2 are prominent
    expect(summary.matchedControls).toBeGreaterThan(0);

    const ts3gpp = controlMatches.get('3GPP-TS28104-MDA');
    expect(ts3gpp).toBeDefined();
    expect(ts3gpp?.isMatched).toBe(true);
    expect(ts3gpp?.reasons.some((r) => r.includes('3GPP'))).toBe(true);
  });

  it('generates valid multi-tree series for ECharts tree-legend', () => {
    const suseEngagement = defaultEngagements.find((e) => e.id === 'suse-telco-cloud-generic')!;
    const { legendData, series } = buildTreeLegendSeries(snapshot, suseEngagement, true, false);

    expect(legendData.length).toBe(3);
    expect(legendData[0].name).toBe('🏛️ Décisions & ADRs');
    expect(legendData[1].name).toBe('⚖️ Référentiels & Conformité');
    expect(legendData[2].name).toBe('📐 Principes & Patterns');

    expect(series.length).toBe(3);
    for (const tree of series) {
      expect(tree.type).toBe('tree');
      expect(tree.data.length).toBe(1);
      expect(tree.data[0].children.length).toBeGreaterThan(0);
    }
  });

  it('filters only matched nodes when filterOnlyMatched is true', () => {
    const suseEngagement = defaultEngagements.find((e) => e.id === 'suse-telco-cloud-generic')!;
    const { series: allSeries } = buildTreeLegendSeries(snapshot, suseEngagement, true, false);
    const { series: filteredSeries } = buildTreeLegendSeries(snapshot, suseEngagement, true, true);

    const totalDecisionsAll = allSeries[0].data[0].children.reduce(
      (acc: number, d: any) => acc + (d.children?.length || 0),
      0
    );
    const totalDecisionsFiltered = filteredSeries[0].data[0].children.reduce(
      (acc: number, d: any) => acc + (d.children?.length || 0),
      0
    );

    expect(totalDecisionsFiltered).toBeLessThanOrEqual(totalDecisionsAll);
    expect(totalDecisionsFiltered).toBeGreaterThan(0);
  });
});
