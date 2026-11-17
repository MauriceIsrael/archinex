/**
 * Classification sémantique des arguments de délibération (questions bloquantes et
 * vérifications doctrinales) via `SemanticAnchorClassifier` pour `maturityRules.ts`.
 */
import type { Argument } from '$lib/domain/debate';
import type { Encoder } from './encoder';
import { SemanticAnchorClassifier, tryResolveSemanticEncoder } from './semanticClassifier';

export type MaturityArgumentSemanticClass = 'blocking' | 'non_blocking' | 'violation' | 'compliant';

const questionBlockingClassifier = new SemanticAnchorClassifier<'blocking' | 'non_blocking'>({
  blocking: {
    prototypes: [
      'Question bloquante empêchant de trancher ou de valider la décision tant qu’elle reste sans réponse',
      'Point critique bloquant la gouvernance et la conformité de la solution',
      'Blocking open question that prevents arbitration or sign-off'
    ],
    lexicalPatterns: [/\bbloqu\w*\b/i, /\bemp[êe]ch\w*\b/i, /\bsuspend\w*\b/i]
  },
  non_blocking: {
    prototypes: [
      'Question informative ou précision mineure non bloquante pour la décision',
      'Clarification secondaire pouvant être traitée ultérieurement sans bloquer',
      'Non-blocking informational question or minor clarification'
    ],
    lexicalPatterns: [/\bnon[- ]bloqu\w*\b/i, /\binformatif\b/i, /\bmineur\b/i]
  }
});

const verificationViolationClassifier = new SemanticAnchorClassifier<'violation' | 'compliant'>({
  violation: {
    prototypes: [
      'Violation doctrinale ou non-conformité réglementaire détectée nécessitant une dispense formelle',
      'Écart critique vis-à-vis d’une règle d’architecture ou d’une exigence de sécurité',
      'Policy violation or non-compliance detected requiring formal waiver'
    ],
    lexicalPatterns: [/\bviolat\w*\b/i, /\bnon[- ]conform\w*\b/i, /\binfraction\b/i]
  },
  compliant: {
    prototypes: [
      'Vérification conforme à la doctrine et aux exigences de sécurité sans aucun écart',
      'Contrôle satisfait, aucune violation détectée',
      'Compliant verification with no policy violation'
    ],
    lexicalPatterns: [/\bconforme\b/i, /\baucune?\s+violat\w*\b/i, /\bsatisfait\b/i]
  }
});

/**
 * Pré-calcule la classification sémantique des arguments pertinents pour `computeMaturity()`
 * lorsque un encodeur sémantique réel est configuré (retourne `{}` sinon, pour laisser
 * `computeMaturity()` appliquer son repli lexical borné).
 */
export async function classifyArgumentsForMaturity(
  args: ReadonlyArray<Argument>,
  encoderOverride?: Encoder
): Promise<Record<string, MaturityArgumentSemanticClass>> {
  const encoder = tryResolveSemanticEncoder(encoderOverride);
  if (!encoder) return {};

  const result: Record<string, MaturityArgumentSemanticClass> = {};
  for (const arg of args) {
    const text = `${arg.claim} ${arg.grounds}`.trim();
    if (!text) continue;

    if (arg.stance === 'question' && arg.resolution === 'open') {
      const cls = await questionBlockingClassifier.classify(text, { encoder });
      if (cls.label && cls.zone !== 'none') {
        result[arg.id] = cls.label;
      }
    } else if (
      arg.stance === 'verification' &&
      arg.resolution !== 'answered' &&
      arg.resolution !== 'accepted_risk' &&
      arg.resolution !== 'withdrawn'
    ) {
      const cls = await verificationViolationClassifier.classify(text, { encoder });
      if (cls.label && cls.zone !== 'none') {
        result[arg.id] = cls.label;
      }
    }
  }
  return result;
}
