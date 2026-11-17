import { describe, expect, it } from 'vitest';
import { computeMaturity } from '$lib/domain/maturityRules';
import type { Criterion, Option, OptionEvaluation } from '$lib/domain/options';
import type { Argument } from '$lib/domain/debate';
import { resolveTogafDomain } from '$lib/domain/edp/togafTaxonomy';
import { generateTargetArchitectureDiagram } from '$lib/domain/artifactProjections';
import type { Encoder } from '$lib/server/similarity/encoder';
import { classifyArgumentsForMaturity } from '$lib/server/similarity/maturitySemanticClassifier';
import { resolveTogafDomainSemantically } from '$lib/server/similarity/togafSemanticResolver';
import { resolveProjectionPatternSemantically } from '$lib/server/similarity/projectionSemanticClassifier';

function createWave1MockEncoder(): Encoder {
  return {
    model: 'mock-wave1-bge',
    version: async () => '1.0',
    encode: async (text: string) => {
      const t = text.toLowerCase();
      // [blocking, non_blocking, violation, compliant, security_domain, active_active_geo]
      const v = [0, 0, 0, 0, 0, 0];
      if (/emp[êe]chant de trancher|bloqu|suspend|critique/.test(t)) v[0] += 1;
      if (/mineure|informatif|non[- ]bloqu|ult[ée]rieurement/.test(t)) v[1] += 1;
      if (/incompatibilit[ée] r[ée]glementaire|[ée]cart critique|violat|dispense/.test(t)) v[2] += 1;
      if (/conforme|satisfait|aucune?\s+violat/.test(t)) v[3] += 1;
      if (/chiffrement|pki|hsm|identit[ée]s|iam|zero-trust|homologation/.test(t)) v[4] += 1;
      if (/g[eé]oredondan|bi-site|actif\/actif|split-brain|gslb/.test(t)) v[5] += 1;
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      return norm > 0 ? v.map((x) => x / norm) : [0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
    }
  };
}

const baseSubject = {
  id: 'sub-1',
  name: 'Architecture Résilience',
  problemStatement: 'Définir le modèle de continuité inter-sites.'
};
const baseCriteria: Criterion[] = [
  {
    id: 'c1',
    subjectId: 'sub-1',
    name: 'Disponibilité',
    description: 'Continuité inter-sites',
    kind: 'nfr',
    weight: 4,
    author: 'Lead Architect',
    role: 'lead_architect',
    productionMode: 'human-authored',
    version: 1
  },
  {
    id: 'c2',
    subjectId: 'sub-1',
    name: 'Coût',
    description: 'Maîtrise TCO',
    kind: 'cost',
    weight: 3,
    author: 'Lead Architect',
    role: 'lead_architect',
    productionMode: 'human-authored',
    version: 1
  }
];
const baseOptions: Option[] = [
  {
    id: 'o1',
    subjectId: 'sub-1',
    title: 'Option A',
    summary: 'Actif/Actif',
    origin: 'human',
    kbRefs: [],
    status: 'proposed',
    author: 'Lead Architect',
    role: 'lead_architect',
    productionMode: 'human-authored',
    version: 1
  },
  {
    id: 'o2',
    subjectId: 'sub-1',
    title: 'Option B',
    summary: 'Actif/Passif',
    origin: 'human',
    kbRefs: [],
    status: 'proposed',
    author: 'Lead Architect',
    role: 'lead_architect',
    productionMode: 'human-authored',
    version: 1
  }
];
const baseEvaluations: OptionEvaluation[] = [
  { optionId: 'o1', criterionId: 'c1', score: 4, justification: 'OK', evidenceRefs: [], author: 'Lead', role: 'lead_architect', productionMode: 'human-authored' },
  { optionId: 'o1', criterionId: 'c2', score: 3, justification: 'OK', evidenceRefs: [], author: 'Lead', role: 'lead_architect', productionMode: 'human-authored' },
  { optionId: 'o2', criterionId: 'c1', score: 3, justification: 'OK', evidenceRefs: [], author: 'Lead', role: 'lead_architect', productionMode: 'human-authored' },
  { optionId: 'o2', criterionId: 'c2', score: 4, justification: 'OK', evidenceRefs: [], author: 'Lead', role: 'lead_architect', productionMode: 'human-authored' }
];

describe('Vague 1 — Remplacement des matchs syntaxiques critiques', () => {
  it('maturityRules : respecte les champs structurés et les négations lexicales', () => {
    const args: Argument[] = [
      {
        id: 'q-neg',
        subjectId: 'sub-1',
        author: 'expert',
        authorKind: 'human',
        stance: 'question',
        claim: 'Question non bloquante sur la documentation',
        grounds: 'Sans caractère bloquant pour la suite.',
        kbRefs: [],
        confidence: 'assumed',
        productionMode: 'human-authored',
        round: 1,
        version: 1,
        resolution: 'open',
        createdAt: new Date().toISOString()
      },
      {
        id: 'v-neg',
        subjectId: 'sub-1',
        author: 'verifier',
        authorKind: 'agent:verifier',
        stance: 'verification',
        claim: 'Contrôle terminé : aucune violation détectée',
        grounds: 'Conforme aux exigences.',
        kbRefs: [],
        confidence: 'verified',
        productionMode: 'llm-derived',
        round: 1,
        version: 1,
        resolution: 'open',
        createdAt: new Date().toISOString()
      }
    ];

    const res = computeMaturity({
      subject: baseSubject,
      criteria: baseCriteria,
      options: baseOptions,
      evaluations: baseEvaluations,
      arguments: args
    });

    expect(res.readyForArbitration).toBe(true);
    expect(res.blockers).toHaveLength(0);
  });

  it('maturityRules + SemanticAnchorClassifier : détecte un blocage ou une violation paraphrasés sans mot-clé littéral', async () => {
    const encoder = createWave1MockEncoder();
    const args: Argument[] = [
      {
        id: 'q-paraphrase',
        subjectId: 'sub-1',
        author: 'expert',
        authorKind: 'human',
        stance: 'question',
        claim: 'Point critique empêchant de trancher avant réponse du RSSI',
        grounds: 'Incertitude majeure sur le périmètre.',
        kbRefs: [],
        confidence: 'assumed',
        productionMode: 'human-authored',
        round: 1,
        version: 1,
        resolution: 'open',
        createdAt: new Date().toISOString()
      },
      {
        id: 'v-paraphrase',
        subjectId: 'sub-1',
        author: 'verifier',
        authorKind: 'agent:verifier',
        stance: 'verification',
        claim: 'Écart critique et incompatibilité réglementaire avec la doctrine',
        grounds: 'Nécessite une dispense formelle.',
        kbRefs: [],
        confidence: 'verified',
        productionMode: 'llm-derived',
        round: 1,
        version: 1,
        resolution: 'open',
        createdAt: new Date().toISOString()
      }
    ];

    const semanticClassification = await classifyArgumentsForMaturity(args, encoder);
    expect(semanticClassification['q-paraphrase']).toBe('blocking');
    expect(semanticClassification['v-paraphrase']).toBe('violation');

    const res = computeMaturity({
      subject: baseSubject,
      criteria: baseCriteria,
      options: baseOptions,
      evaluations: baseEvaluations,
      arguments: args,
      semanticClassification
    });

    expect(res.readyForArbitration).toBe(false);
    expect(res.blockers.map((b) => b.code)).toEqual(
      expect.arrayContaining(['OPEN_BLOCKING_QUESTION', 'UNRESOLVED_VIOLATION'])
    );
  });

  it('togafTaxonomy : évite les faux positifs de sous-chaînes 3 lettres (secteur, internet) et résout sémantiquement', async () => {
    expect(resolveTogafDomain('secteur-public')).not.toBe('security-trust');
    expect(resolveTogafDomain('internet-portal')).not.toBe('network-connectivity');

    const encoder = createWave1MockEncoder();
    const sem = await resolveTogafDomainSemantically(
      'Gestion des clés cryptographiques sur HSM et fédération des identités',
      undefined,
      encoder
    );
    expect(sem.matchMode).toBe('semantic');
    expect(sem.domain).toBe('security-trust');
  });

  it('artifactProjections : extrait dynamiquement tout REQ-* sans couplage projet et honore resolvedPattern', async () => {
    const encoder = createWave1MockEncoder();
    const pattern = await resolveProjectionPatternSemantically(
      'Topologie bi-site géoredondante avec bascule GSLB',
      encoder
    );
    expect(pattern).toBe('active_active_geo');

    const diagram = generateTargetArchitectureDiagram(
      { id: 'sub-x', name: 'Continuité', section_ref: '§2.1' },
      null,
      [],
      {
        resolvedPattern: pattern,
        decision: {
          retainedOptionTitle: 'Architecture dual-site',
          rationale: 'Couvre REQ-CUSTOM-42 et REQ-GEN-99.'
        }
      }
    );

    expect(diagram).toContain('REQ-CUSTOM-42');
    expect(diagram).toContain('REQ-GEN-99');
  });
});
