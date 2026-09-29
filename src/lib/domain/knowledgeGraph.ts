/**
 * Modèle et moteur d'alignement neuro-symbolique pour le Patrimoine de Connaissances Communes.
 * Transforme le snapshot scellé (assets, controls, frameworks, applicability_index)
 * en hiérarchies arborescentes compatibles ECharts (Tree-Legend) et calcule la projection
 * et l'éclairage des concepts selon le projet/engagement actif.
 */

import type { EngagementProfile } from './engagements';

export interface KnowledgeProvenance {
  document: string;
  version: string;
  section: string;
  text_sha256?: string;
}

export interface KnowledgeAsset {
  id: string;
  typed_id?: string;
  title: string;
  type: 'decision' | 'principle' | 'pattern' | 'template' | 'skill' | 'questionnaire' | 'risk-register' | 'estimate' | 'yaml-asset' | string;
  status: 'active' | 'superseded' | 'draft' | string;
  confidence: 'verified' | 'assumed' | 'vendor-stated' | string;
  domain: string;
  phase?: string;
  owner?: string;
  last_reviewed?: string;
  provenance?: KnowledgeProvenance;
  supersedes?: string[];
  superseded_by?: string[];
  summary?: string;
  [key: string]: unknown;
}

export interface KnowledgeControl {
  id: string;
  framework: string;
  version?: string;
  title: string;
  domain: string;
  severity?: 'mandatory' | 'recommended' | 'optional' | string;
  implemented_by?: string[];
  [key: string]: unknown;
}

export interface KnowledgeFramework {
  framework: string;
  version: string;
  controls_count: number;
}

export interface KnowledgeSnapshot {
  snapshot_id: string;
  created_at: string;
  source_revision?: string;
  payload_sha256?: string;
  schema_version?: string;
  applicability_index?: Record<string, {
    domains?: string[];
    phases?: string[];
    rules?: string[];
  }>;
  assets: KnowledgeAsset[];
  controls: KnowledgeControl[];
  frameworks?: KnowledgeFramework[];
  glossary?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ConceptMatch {
  isMatched: boolean;
  score: number;
  reasons: string[];
  matchedSubjects: string[];
}

export interface KnowledgeTreeNode {
  name: string;
  id?: string;
  category: 'root' | 'domain' | 'framework' | 'decision' | 'control' | 'principle' | 'pattern' | 'template' | 'group';
  typeLabel?: string;
  raw?: KnowledgeAsset | KnowledgeControl | unknown;
  match?: ConceptMatch;
  symbolSize?: number;
  itemStyle?: {
    color?: string;
    borderColor?: string;
    borderWidth?: number;
    opacity?: number;
  };
  label?: {
    color?: string;
    fontWeight?: string;
    fontSize?: number;
    formatter?: string;
    opacity?: number;
  };
  lineStyle?: {
    color?: string;
    width?: number;
    opacity?: number;
    curveness?: number;
  };
  children?: KnowledgeTreeNode[];
  collapsed?: boolean;
}

export interface KnowledgeMatchSummary {
  totalConcepts: number;
  matchedConcepts: number;
  matchPercentage: number;
  matchedDecisions: number;
  totalDecisions: number;
  matchedControls: number;
  totalControls: number;
  matchedPrinciples: number;
  totalPrinciples: number;
  topMatchingDomains: Array<{ domain: string; count: number }>;
}

/**
 * Normalise un nom de domaine technique en libellé lisible en français
 */
export function formatDomainName(rawDomain: string): string {
  const map: Record<string, string> = {
    'network-automation': 'Réseau & Automatisation',
    'cloud-platform': 'Plateforme Cloud & Infrastructure',
    'observability': 'Observabilité & Télémétrie',
    'ai-assistance': 'Assistance IA & MLOps',
    'mobile-core': 'Cœur Mobile & 5G/Mission-Critique',
    'security': 'Sécurité & Confiance Numérique',
    'security-architecture': 'Architecture de Sécurité',
    'security-cryptography': 'Cryptographie & PQC',
    'telecom-core': 'Réseau Télécom & Sol-Bord',
    'delivery': 'Ingénierie & Déploiement',
    'service-management': 'Gestion de Service (ITIL)',
    'governance': 'Gouvernance & Conformité'
  };
  return map[rawDomain] || rawDomain;
}

/**
 * Calcule l'alignement et l'éclairage de l'ensemble des concepts
 * par rapport à l'engagement (projet) sélectionné.
 */
export function computeProjectMatching(
  snapshot: KnowledgeSnapshot,
  engagement: EngagementProfile | null
): {
  assetMatches: Map<string, ConceptMatch>;
  controlMatches: Map<string, ConceptMatch>;
  summary: KnowledgeMatchSummary;
} {
  const assetMatches = new Map<string, ConceptMatch>();
  const controlMatches = new Map<string, ConceptMatch>();

  const totalDecisions = snapshot.assets.filter((a) => a.type === 'decision').length;
  const totalPrinciples = snapshot.assets.filter((a) => a.type === 'principle' || a.type === 'pattern').length;
  const totalControls = (snapshot.controls || []).length;
  const totalConcepts = snapshot.assets.length + totalControls;

  if (!engagement) {
    // Mode Global / Neutre : aucun projet sélectionné
    for (const a of snapshot.assets) {
      assetMatches.set(a.id, { isMatched: false, score: 0, reasons: [], matchedSubjects: [] });
    }
    for (const c of snapshot.controls || []) {
      controlMatches.set(c.id, { isMatched: false, score: 0, reasons: [], matchedSubjects: [] });
    }
    return {
      assetMatches,
      controlMatches,
      summary: {
        totalConcepts,
        matchedConcepts: 0,
        matchPercentage: 0,
        matchedDecisions: 0,
        totalDecisions,
        matchedControls: 0,
        totalControls,
        matchedPrinciples: 0,
        totalPrinciples,
        topMatchingDomains: []
      }
    };
  }

  // 1. Extraire l'empreinte textuelle et conceptuelle du projet
  const projectTexts: string[] = [];

  // Titre & description
  projectTexts.push(engagement.title, engagement.description || '', engagement.badge || '');

  // Stratégie
  if (engagement.strategy) {
    projectTexts.push(...(engagement.strategy.objectives || []));
    projectTexts.push(...(engagement.strategy.principles || []));
    projectTexts.push(...(engagement.strategy.constraints || []));
  }

  // Sujets de délibération
  const subjectMap = new Map<string, string>();
  for (const s of engagement.subjects || []) {
    subjectMap.set(s.id, s.name);
    projectTexts.push(s.name, s.section_ref || '');
  }

  // Brouillons télégraphiques (retenu, suppose, conflit, manque)
  if (engagement.drafts) {
    for (const [subId, d] of Object.entries(engagement.drafts)) {
      if (d.retenu) projectTexts.push(...d.retenu);
      if (d.suppose) projectTexts.push(...d.suppose.map((item) => item.text + ' ' + (item.consequence || '')));
      if (d.conflit) {
        projectTexts.push(
          ...d.conflit.map((item) => item.text + ' ' + (item.opposing_reference || ''))
        );
      }
      if (d.manque) projectTexts.push(...d.manque.map((item) => item.question));
      if (d.variante_b) projectTexts.push(d.variante_b.title, d.variante_b.trade_off || '');
    }
  }

  // Énoncés épistémiques
  if (engagement.statements) {
    for (const st of engagement.statements) {
      if (st.triplet) {
        projectTexts.push(
          String(st.triplet.predicate || ''),
          String(st.triplet.value ?? ''),
          String(st.triplet.subject || '')
        );
      }
      if (st.justification?.basedOn) {
        projectTexts.push(...st.justification.basedOn);
      }
    }
  }

  // Documents du corpus projet
  if (engagement.corpusDocuments) {
    for (const doc of engagement.corpusDocuments) {
      projectTexts.push(doc.title, doc.summary || '');
      if (doc.keyIdeas) projectTexts.push(...doc.keyIdeas);
      if (doc.inducedRules) {
        projectTexts.push(...doc.inducedRules.map((r) => r.title + ' ' + r.description));
      }
    }
  }

  const consolidatedProjectText = projectTexts.join(' ').toLowerCase();

  // Détection des domaines chauds dans le projet
  const projectDomainKeywords: Record<string, string[]> = {
    'network-automation': ['réseau', 'network', 'cni', 'sriov', 'dpdk', 'routant', 'bgp', 'gitops', 'automatisation', 'transmission'],
    'cloud-platform': ['kubernetes', 'cluster', 'kvm', 'cloud', 'conteneur', 'worker', 'baremetal', 'iaas', 'plateforme'],
    'observability': ['observabilité', 'mda', 'télémétrie', 'monitoring', 'metrics', 'logs', 'traces', 'gigue', 'cyclictest'],
    'ai-assistance': ['ia', 'llm', 'inférence', 'mlops', 'modèle', 'assistant', 'prompt', 'vllm'],
    'mobile-core': ['5g', 'upf', 'cœur', 'core', 'slicing', 'tranches', '3gpp', 'amf', 'smf', 'qcis', 'sba'],
    'security': ['sécurité', 'secnumcloud', 'nis2', 'chiffrement', 'pqc', 'fips', 'cis', 'durci', 'zero-trust', 'homologation', 'anssi'],
    'telecom-core': ['ferroviaire', 'frmcs', 'gsm-r', 'sol-bord', 'signalisation', 'etcs', 'radio', 'uic', 'atomique']
  };

  const activeProjectDomains = new Set<string>();
  for (const [dom, kws] of Object.entries(projectDomainKeywords)) {
    if (kws.some((kw) => consolidatedProjectText.includes(kw))) {
      activeProjectDomains.add(dom);
    }
  }

  // 2. Évaluation des Actifs (Assets)
  const matchedAssetIds = new Set<string>();
  const domainMatchCounts: Record<string, number> = {};

  for (const asset of snapshot.assets) {
    const reasons: string[] = [];
    const matchedSubjects: string[] = [];
    let score = 0;

    const idLower = asset.id.toLowerCase();
    const titleLower = asset.title.toLowerCase();

    // 2.a Citation directe par ID (ex: "ADR-0001", "P-003", etc.)
    if (consolidatedProjectText.includes(idLower)) {
      score += 100;
      reasons.push(`Actif ${asset.id} directement cité dans les délibérations ou énoncés du projet.`);
    }

    // 2.b Mots-clés discriminants du titre de l'actif
    const titleWords = titleLower
      .split(/[\s,()\/'-]+/)
      .filter((w) => w.length >= 4 && !['pour', 'dans', 'avec', 'sans', 'cette', 'sous', 'vers', 'sont'].includes(w));
    const matchingWords = titleWords.filter((w) => consolidatedProjectText.includes(w));
    if (matchingWords.length >= 2) {
      score += 40;
      reasons.push(`Correspondance thématique forte : "${matchingWords.slice(0, 3).join(', ')}"`);
    }

    // 2.c Alignement de domaine
    const assetDomains = (asset.domain || '')
      .split(',')
      .map((d) => d.trim().toLowerCase());
    const matchedDomains = assetDomains.filter((d) => activeProjectDomains.has(d));
    if (matchedDomains.length > 0) {
      score += 30 + matchedDomains.length * 15;
      reasons.push(`Domaine(s) actif(s) dans le projet : ${matchedDomains.map(formatDomainName).join(', ')}`);
    }

    // 2.d Applicabilité (Phase & Règles de l'index d'applicabilité)
    const appIndex = snapshot.applicability_index?.[asset.id];
    if (appIndex?.domains?.some((d) => activeProjectDomains.has(d.toLowerCase()))) {
      score += 20;
      reasons.push(`Référencé dans l'index d'applicabilité pour le domaine.`);
    }

    // Association avec les sujets du projet
    for (const [subId, subName] of subjectMap.entries()) {
      const subNameLower = subName.toLowerCase();
      if (
        assetDomains.some((d) => subNameLower.includes(d)) ||
        matchingWords.some((w) => subNameLower.includes(w))
      ) {
        matchedSubjects.push(subName);
      }
    }

    const isMatched = score >= 40;
    if (isMatched) {
      matchedAssetIds.add(asset.id);
      for (const d of assetDomains) {
        domainMatchCounts[d] = (domainMatchCounts[d] || 0) + 1;
      }
    }

    assetMatches.set(asset.id, {
      isMatched,
      score,
      reasons,
      matchedSubjects: [...new Set(matchedSubjects)]
    });
  }

  // 3. Évaluation des Contrôles Réglementaires (Controls)
  for (const control of snapshot.controls || []) {
    const reasons: string[] = [];
    const matchedSubjects: string[] = [];
    let score = 0;

    const fwLower = control.framework.toLowerCase();
    const ctrlIdLower = control.id.toLowerCase();
    const ctrlTitleLower = control.title.toLowerCase();

    // 3.a Citation du référentiel (ex: "SecNumCloud", "NIS2", "3GPP", "ISO27001", "RGPD")
    if (consolidatedProjectText.includes(fwLower)) {
      score += 65;
      reasons.push(`Référentiel réglementaire ${control.framework} requis par la stratégie du projet.`);
    }

    // 3.b Citation directe du contrôle
    if (consolidatedProjectText.includes(ctrlIdLower)) {
      score += 100;
      reasons.push(`Contrôle ${control.id} directement visé par le projet.`);
    }

    // 3.c Mis en œuvre par un actif retenu/matché
    const implementingActiveAssets = (control.implemented_by || []).filter((aid) =>
      matchedAssetIds.has(aid)
    );
    if (implementingActiveAssets.length > 0) {
      score += 50;
      reasons.push(
        `Mis en œuvre par ${implementingActiveAssets.length} actif(s) mobilisé(s) : ${implementingActiveAssets.slice(0, 3).join(', ')}`
      );
    }

    // 3.d Alignement de domaine
    const ctrlDomains = (control.domain || '')
      .split(',')
      .map((d) => d.trim().toLowerCase());
    if (ctrlDomains.some((d) => activeProjectDomains.has(d))) {
      score += 25;
      reasons.push(`Domaine d'application couvert par le périmètre du projet.`);
    }

    const isMatched = score >= 50;
    controlMatches.set(control.id, {
      isMatched,
      score,
      reasons,
      matchedSubjects: [...new Set(matchedSubjects)]
    });
  }

  // 4. Calcul du résumé
  let matchedDecisions = 0;
  let matchedPrinciples = 0;
  let matchedControls = 0;

  for (const a of snapshot.assets) {
    if (assetMatches.get(a.id)?.isMatched) {
      if (a.type === 'decision') matchedDecisions++;
      else if (a.type === 'principle' || a.type === 'pattern') matchedPrinciples++;
    }
  }

  for (const c of snapshot.controls || []) {
    if (controlMatches.get(c.id)?.isMatched) {
      matchedControls++;
    }
  }

  const totalMatched = matchedDecisions + matchedPrinciples + matchedControls;
  const matchPercentage = Math.round((totalMatched / (totalConcepts || 1)) * 100);

  const topMatchingDomains = Object.entries(domainMatchCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, count]) => ({ domain: formatDomainName(domain), count }));

  return {
    assetMatches,
    controlMatches,
    summary: {
      totalConcepts,
      matchedConcepts: totalMatched,
      matchPercentage,
      matchedDecisions,
      totalDecisions,
      matchedControls,
      totalControls,
      matchedPrinciples,
      totalPrinciples,
      topMatchingDomains
    }
  };
}

/**
 * Construit les données pour l'arborescence multi-séries ECharts (Tree-Legend)
 * Conforme à la disposition officielle Apache ECharts tree-legend :
 * 3 séries de type 'tree' affichées avec une légende latérale/supérieure.
 */
export function buildTreeLegendSeries(
  snapshot: KnowledgeSnapshot,
  engagement: EngagementProfile | null,
  isDarkTheme: boolean = true,
  filterOnlyMatched: boolean = false
): {
  legendData: Array<{ name: string; icon: string }>;
  series: any[];
} {
  const { assetMatches, controlMatches } = computeProjectMatching(snapshot, engagement);
  const hasActiveProject = engagement !== null;

  // Palette de styles
  const colors = {
    decision: '#3b82f6', // Bleu vif
    decisionMatched: '#10b981', // Émeraude lumineux
    control: '#8b5cf6', // Violet
    controlMatched: '#06b6d4', // Cyan lumineux
    principle: '#f59e0b', // Ambre doré
    principleMatched: '#f97316', // Orange flamboyant
    muted: isDarkTheme ? '#334155' : '#cbd5e1',
    textNormal: isDarkTheme ? '#e2e8f0' : '#1e293b',
    textMuted: isDarkTheme ? '#64748b' : '#94a3b8',
    textHighlight: isDarkTheme ? '#ffffff' : '#0f172a',
    lineNormal: isDarkTheme ? '#334155' : '#e2e8f0',
    lineHighlight: isDarkTheme ? '#38bdf8' : '#0284c7'
  };

  function applyNodeStyle(
    node: KnowledgeTreeNode,
    defaultColor: string,
    matchedColor: string
  ): KnowledgeTreeNode {
    const isMatched = node.match?.isMatched ?? false;

    if (!hasActiveProject) {
      // Vue Globale / Neutre
      node.symbolSize = node.category === 'root' ? 14 : node.children && node.children.length > 0 ? 10 : 7;
      node.itemStyle = {
        color: defaultColor,
        borderColor: isDarkTheme ? '#1e293b' : '#ffffff',
        borderWidth: 1.5,
        opacity: 0.95
      };
      node.label = {
        color: colors.textNormal,
        fontSize: node.children && node.children.length > 0 ? 12 : 11,
        fontWeight: node.children && node.children.length > 0 ? '600' : 'normal'
      };
      node.lineStyle = {
        color: colors.lineNormal,
        width: 1.5,
        opacity: 0.7
      };
    } else if (isMatched) {
      // Actif ou branche éclairée !
      node.symbolSize = node.children && node.children.length > 0 ? 13 : 11;
      node.itemStyle = {
        color: matchedColor,
        borderColor: '#ffffff',
        borderWidth: 2,
        opacity: 1
      };
      node.label = {
        color: colors.textHighlight,
        fontSize: node.children && node.children.length > 0 ? 12 : 11,
        fontWeight: 'bold',
        opacity: 1
      };
      node.lineStyle = {
        color: matchedColor,
        width: 2.2,
        opacity: 0.9
      };
    } else {
      // Actif atténué (non mobilisé par le projet)
      node.symbolSize = 5;
      node.itemStyle = {
        color: colors.muted,
        borderColor: colors.muted,
        borderWidth: 1,
        opacity: 0.25
      };
      node.label = {
        color: colors.textMuted,
        fontSize: 10,
        fontWeight: 'normal',
        opacity: 0.35
      };
      node.lineStyle = {
        color: colors.muted,
        width: 1,
        opacity: 0.15
      };
    }

    if (node.children) {
      node.children = node.children.map((child) =>
        applyNodeStyle(child, defaultColor, matchedColor)
      );
    }

    return node;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SÉRIE 1 : DÉCISIONS D'ARCHITECTURE (ADRs & ASSETS)
  // ─────────────────────────────────────────────────────────────────────────────
  const decisions = snapshot.assets.filter((a) => a.type === 'decision');
  const decisionsByDomain: Record<string, KnowledgeAsset[]> = {};

  for (const d of decisions) {
    const rawDom = (d.domain || 'general').split(',')[0].trim();
    if (!decisionsByDomain[rawDom]) decisionsByDomain[rawDom] = [];
    decisionsByDomain[rawDom].push(d);
  }

  const decisionDomainNodes: KnowledgeTreeNode[] = Object.entries(decisionsByDomain).map(
    ([dom, assets]) => {
      let domainMatched = false;
      const assetNodes: KnowledgeTreeNode[] = [];

      for (const a of assets) {
        const match = assetMatches.get(a.id) || { isMatched: false, score: 0, reasons: [], matchedSubjects: [] };
        if (match.isMatched) domainMatched = true;

        if (filterOnlyMatched && hasActiveProject && !match.isMatched) {
          continue;
        }

        assetNodes.push({
          name: `${a.id}: ${a.title.length > 50 ? a.title.slice(0, 48) + '…' : a.title}`,
          id: a.id,
          category: 'decision',
          typeLabel: 'Décision d\'Architecture (ADR)',
          raw: a,
          match
        });
      }

      return {
        name: formatDomainName(dom),
        category: 'domain' as const,
        typeLabel: 'Domaine d\'Architecture',
        match: {
          isMatched: domainMatched,
          score: domainMatched ? 80 : 0,
          reasons: domainMatched ? ['Contient des décisions mobilisées par le projet'] : [],
          matchedSubjects: []
        },
        children: assetNodes,
        collapsed: false
      };
    }
  ).filter((d) => !filterOnlyMatched || !hasActiveProject || d.children?.length! > 0);

  const tree1Root: KnowledgeTreeNode = applyNodeStyle(
    {
      name: '🏛️ Décisions & Architecture (ADRs)',
      category: 'root',
      typeLabel: 'Patrimoine Décisionnel',
      match: {
        isMatched: decisionDomainNodes.some((n) => n.match?.isMatched),
        score: 100,
        reasons: [],
        matchedSubjects: []
      },
      children: decisionDomainNodes
    },
    colors.decision,
    colors.decisionMatched
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SÉRIE 2 : RÉFÉRENTIELS & CONFORMITÉ RÉGLEMENTAIRE (CONTROLS)
  // ─────────────────────────────────────────────────────────────────────────────
  const controlsByFramework: Record<string, KnowledgeControl[]> = {};
  for (const c of snapshot.controls || []) {
    const fw = c.framework || 'Autre';
    if (!controlsByFramework[fw]) controlsByFramework[fw] = [];
    controlsByFramework[fw].push(c);
  }

  const frameworkNodes: KnowledgeTreeNode[] = Object.entries(controlsByFramework).map(
    ([fw, controls]) => {
      let fwMatched = false;
      const controlNodes: KnowledgeTreeNode[] = [];

      for (const c of controls) {
        const match = controlMatches.get(c.id) || { isMatched: false, score: 0, reasons: [], matchedSubjects: [] };
        if (match.isMatched) fwMatched = true;

        if (filterOnlyMatched && hasActiveProject && !match.isMatched) {
          continue;
        }

        controlNodes.push({
          name: `${c.id} (${c.severity === 'mandatory' ? 'Req' : 'Rec'}): ${c.title.length > 46 ? c.title.slice(0, 44) + '…' : c.title}`,
          id: c.id,
          category: 'control',
          typeLabel: `Contrôle Réglementaire ${fw}`,
          raw: c,
          match
        });
      }

      return {
        name: `${fw} (${controls.length} règles)`,
        category: 'framework' as const,
        typeLabel: 'Référentiel de Conformité',
        match: {
          isMatched: fwMatched,
          score: fwMatched ? 90 : 0,
          reasons: fwMatched ? ['Référentiel engagé par le projet'] : [],
          matchedSubjects: []
        },
        children: controlNodes,
        collapsed: false
      };
    }
  ).filter((f) => !filterOnlyMatched || !hasActiveProject || f.children?.length! > 0);

  const tree2Root: KnowledgeTreeNode = applyNodeStyle(
    {
      name: '⚖️ Référentiels & Conformité',
      category: 'root',
      typeLabel: 'Contraintes et Réglementations',
      match: {
        isMatched: frameworkNodes.some((n) => n.match?.isMatched),
        score: 100,
        reasons: [],
        matchedSubjects: []
      },
      children: frameworkNodes
    },
    colors.control,
    colors.controlMatched
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SÉRIE 3 : PRINCIPES, PATTERNS & MODÈLES (DOCTRINE)
  // ─────────────────────────────────────────────────────────────────────────────
  const principles = snapshot.assets.filter((a) => a.type === 'principle');
  const patterns = snapshot.assets.filter((a) => a.type === 'pattern');
  const templates = snapshot.assets.filter((a) => a.type === 'template' || a.type === 'blueprint' || a.type === 'skill');

  function makeLeafNodes(items: KnowledgeAsset[], typeLabel: string, category: 'principle' | 'pattern' | 'template'): KnowledgeTreeNode[] {
    return items
      .map((item) => {
        const match = assetMatches.get(item.id) || { isMatched: false, score: 0, reasons: [], matchedSubjects: [] };
        if (filterOnlyMatched && hasActiveProject && !match.isMatched) {
          return null;
        }
        return {
          name: `${item.id}: ${item.title.length > 50 ? item.title.slice(0, 48) + '…' : item.title}`,
          id: item.id,
          category,
          typeLabel,
          raw: item,
          match
        } as KnowledgeTreeNode;
      })
      .filter(Boolean) as KnowledgeTreeNode[];
  }

  const doctrineGroups: KnowledgeTreeNode[] = [
    {
      name: `Principes Directeurs (${principles.length})`,
      category: 'group' as const,
      typeLabel: 'Principes EA',
      match: {
        isMatched: principles.some((p) => assetMatches.get(p.id)?.isMatched),
        score: 75,
        reasons: [],
        matchedSubjects: []
      },
      children: makeLeafNodes(principles, 'Principe d\'Architecture', 'principle'),
      collapsed: false
    },
    {
      name: `Patrons de Conception (${patterns.length})`,
      category: 'group' as const,
      typeLabel: 'Architecture Patterns',
      match: {
        isMatched: patterns.some((p) => assetMatches.get(p.id)?.isMatched),
        score: 75,
        reasons: [],
        matchedSubjects: []
      },
      children: makeLeafNodes(patterns, 'Patron de Conception', 'pattern'),
      collapsed: false
    },
    {
      name: `Modèles & Blueprints (${templates.length})`,
      category: 'group' as const,
      typeLabel: 'Blueprints et Modèles',
      match: {
        isMatched: templates.some((t) => assetMatches.get(t.id)?.isMatched),
        score: 75,
        reasons: [],
        matchedSubjects: []
      },
      children: makeLeafNodes(templates, 'Modèle / Blueprint', 'template'),
      collapsed: false
    }
  ].filter((g) => !filterOnlyMatched || !hasActiveProject || g.children?.length! > 0);

  const tree3Root: KnowledgeTreeNode = applyNodeStyle(
    {
      name: '📐 Principes, Patterns & Doctrine',
      category: 'root',
      typeLabel: 'Doctrine d\'Ingénierie',
      match: {
        isMatched: doctrineGroups.some((g) => g.match?.isMatched),
        score: 100,
        reasons: [],
        matchedSubjects: []
      },
      children: doctrineGroups
    },
    colors.principle,
    colors.principleMatched
  );

  const legendData = [
    { name: '🏛️ Décisions & ADRs', icon: 'rectangle' },
    { name: '⚖️ Référentiels & Conformité', icon: 'rectangle' },
    { name: '📐 Principes & Patterns', icon: 'rectangle' }
  ];

  // Configuration multi-séries side-by-side / superposée avec affichage clair
  // Disposition inspirée directement du canevas ECharts tree-legend officiel
  const series = [
    {
      type: 'tree',
      name: '🏛️ Décisions & ADRs',
      data: [tree1Root],
      top: '5%',
      left: '4%',
      bottom: '5%',
      right: '68%',
      layout: 'orthogonal',
      orient: 'LR',
      initialTreeDepth: 2,
      expandAndCollapse: true,
      animationDuration: 400,
      animationDurationUpdate: 500,
      label: {
        position: 'left',
        verticalAlign: 'middle',
        align: 'right',
        distance: 8
      },
      leaves: {
        label: {
          position: 'right',
          verticalAlign: 'middle',
          align: 'left',
          distance: 8
        }
      },
      emphasis: {
        focus: 'descendant'
      }
    },
    {
      type: 'tree',
      name: '⚖️ Référentiels & Conformité',
      data: [tree2Root],
      top: '5%',
      left: '36%',
      bottom: '5%',
      right: '36%',
      layout: 'orthogonal',
      orient: 'LR',
      initialTreeDepth: 2,
      expandAndCollapse: true,
      animationDuration: 400,
      animationDurationUpdate: 500,
      label: {
        position: 'left',
        verticalAlign: 'middle',
        align: 'right',
        distance: 8
      },
      leaves: {
        label: {
          position: 'right',
          verticalAlign: 'middle',
          align: 'left',
          distance: 8
        }
      },
      emphasis: {
        focus: 'descendant'
      }
    },
    {
      type: 'tree',
      name: '📐 Principes & Patterns',
      data: [tree3Root],
      top: '5%',
      left: '68%',
      bottom: '5%',
      right: '4%',
      layout: 'orthogonal',
      orient: 'LR',
      initialTreeDepth: 2,
      expandAndCollapse: true,
      animationDuration: 400,
      animationDurationUpdate: 500,
      label: {
        position: 'left',
        verticalAlign: 'middle',
        align: 'right',
        distance: 8
      },
      leaves: {
        label: {
          position: 'right',
          verticalAlign: 'middle',
          align: 'left',
          distance: 8
        }
      },
      emphasis: {
        focus: 'descendant'
      }
    }
  ];

  return { legendData, series };
}

export interface StackedTreeWidgetConfig {
  id: 'decisions' | 'controls' | 'doctrine';
  title: string;
  badge: string;
  categoryName: string;
  description: string;
  root: KnowledgeTreeNode;
  series: any[];
  matchedCount: number;
  totalCount: number;
  color: string;
}

/**
 * Génère 3 widgets arborescents autonomes empilables verticalement.
 * Chaque arbre bénéficie de 100% de la largeur du conteneur avec un grand confort de lecture.
 */
export function buildStackedTreeWidgets(
  snapshot: KnowledgeSnapshot,
  engagement: EngagementProfile | null,
  isDarkTheme: boolean = true,
  filterOnlyMatched: boolean = false
): StackedTreeWidgetConfig[] {
  const { summary } = computeProjectMatching(snapshot, engagement);
  const { series } = buildTreeLegendSeries(snapshot, engagement, isDarkTheme, filterOnlyMatched);

  const tree1Root = series[0]?.data?.[0];
  const tree2Root = series[1]?.data?.[0];
  const tree3Root = series[2]?.data?.[0];

  function makeFullWidthSeries(name: string, rootNode: KnowledgeTreeNode) {
    return [
      {
        type: 'tree',
        name,
        data: [rootNode],
        top: '2%',
        left: '1%', // Partir tout à gauche pour maximiser l'espace des branches
        bottom: '2%',
        right: '25%', // Grand espace pour les libellés des feuilles
        layout: 'orthogonal',
        orient: 'LR',
        initialTreeDepth: 2,
        expandAndCollapse: true,
        animationDuration: 400,
        animationDurationUpdate: 500,
        label: {
          position: 'left',
          verticalAlign: 'middle',
          align: 'right',
          distance: 12
        },
        leaves: {
          label: {
            position: 'right',
            verticalAlign: 'middle',
            align: 'left',
            distance: 12
          }
        },
        emphasis: {
          focus: 'descendant'
        }
      }
    ];
  }

  return [
    {
      id: 'decisions',
      title: '1. Décisions d\'Architecture (ADRs & Choix Structurants)',
      categoryName: 'Décisions & ADRs',
      badge: `${summary.matchedDecisions} / ${summary.totalDecisions} éclairées`,
      description: 'Gouvernance des choix techniques majeurs classés par domaines fonctionnels (Réseau, Cloud, Observabilité, IA, Sécurité...).',
      root: tree1Root,
      series: makeFullWidthSeries('Décisions & ADRs', tree1Root),
      matchedCount: summary.matchedDecisions,
      totalCount: summary.totalDecisions,
      color: '#3b82f6'
    },
    {
      id: 'controls',
      title: '2. Référentiels Réglementaires & Contrôles de Sécurité',
      categoryName: 'Référentiels & Contrôles',
      badge: `${summary.matchedControls} / ${summary.totalControls} éclairés`,
      description: 'Exigences et mesures normatives imposées par les cadres légaux (NIS2, 3GPP Rel-18, SecNumCloud 3.2, CRA, ISO 27001, RGPD...).',
      root: tree2Root,
      series: makeFullWidthSeries('Référentiels & Contrôles', tree2Root),
      matchedCount: summary.matchedControls,
      totalCount: summary.totalControls,
      color: '#8b5cf6'
    },
    {
      id: 'doctrine',
      title: '3. Doctrine d\'Ingénierie, Principes & Patrons de Conception',
      categoryName: 'Doctrine & Patterns',
      badge: `${summary.matchedPrinciples} / ${summary.totalPrinciples} éclairés`,
      description: 'Lignes directrices d\'architecture, patrons de conception éprouvés et modèles d\'ingénierie réutilisables.',
      root: tree3Root,
      series: makeFullWidthSeries('Doctrine & Patterns', tree3Root),
      matchedCount: summary.matchedPrinciples,
      totalCount: summary.totalPrinciples,
      color: '#f59e0b'
    }
  ];
}

