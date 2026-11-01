export interface FixtureValidationOptions {
  rules: string[];
  mockPass: { name: string; content: unknown };
  mockFails: Array<{ rule: string; name: string; content: unknown }>;
  evaluatedResults?: Array<{ name: string; violations: string[] }>;
}

export interface FixtureViolation {
  fixture: string;
  field?: string;
  value?: string;
  reason: string;
}

export interface FixtureValidationResult {
  valid: boolean;
  violations: FixtureViolation[];
  coverage: {
    totalRules: number;
    coveredRules: number;
    missingRules: string[];
  };
}

// Plages d'adresses IP réservées à la documentation (RFC 5737 et RFC 3849)
export function isDocumentationIp(ipStr: string): boolean {
  const cleanIp = ipStr.trim().toLowerCase();

  // IPv4 TEST-NET-1 (192.0.2.0/24)
  if (cleanIp.startsWith('192.0.2.')) return true;

  // IPv4 TEST-NET-2 (198.51.100.0/24)
  if (cleanIp.startsWith('198.51.100.')) return true;

  // IPv4 TEST-NET-3 (203.0.113.0/24)
  if (cleanIp.startsWith('203.0.113.')) return true;

  // IPv6 Documentation prefix (2001:db8::/32)
  if (cleanIp.startsWith('2001:db8:') || cleanIp === '2001:db8::' || cleanIp.startsWith('2001:0db8:')) {
    return true;
  }

  return false;
}

// Détection de toutes les adresses IP présentes dans un contenu JSON arbitraire
const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g;

export function findNonDocumentationIps(content: unknown): string[] {
  const text = JSON.stringify(content);
  const foundIps: string[] = [];
  let match: RegExpExecArray | null;
  const rx = new RegExp(IPV4_REGEX.source, IPV4_REGEX.flags);

  while ((match = rx.exec(text)) !== null) {
    const ip = match[0];
    if (!isDocumentationIp(ip)) {
      foundIps.push(ip);
    }
  }

  return foundIps;
}

/**
 * Valide le contrat des fixtures d'un EDP (Issue #172).
 * Exigences :
 * - Exactement un mock conforme ('pass')
 * - Pour chaque règle déclarée, exactement un mock défaillant ciblant uniquement cette règle
 * - Aucune adresse IP de production ou privée hors plages documentaires RFC 5737 / RFC 3849
 */
export function validateFixturesContract(options: FixtureValidationOptions): FixtureValidationResult {
  const violations: FixtureViolation[] = [];
  const rulesSet = new Set(options.rules);
  const coveredRules = new Set<string>();

  // 1. Contrôle des adresses réservées sur le mock pass
  const passIllegalIps = findNonDocumentationIps(options.mockPass.content);
  for (const ip of passIllegalIps) {
    violations.push({
      fixture: options.mockPass.name,
      value: ip,
      reason: `Adresse IP hors plage documentaire réservée détectée : ${ip}. Utiliser 192.0.2.0/24, 198.51.100.0/24 ou 203.0.113.0/24.`
    });
  }

  // 2. Contrôle de chaque mock fail
  for (const failMock of options.mockFails) {
    if (!rulesSet.has(failMock.rule)) {
      violations.push({
        fixture: failMock.name,
        reason: `Le mock fail cible une règle inconnue ou non déclarée : "${failMock.rule}"`
      });
    } else {
      coveredRules.add(failMock.rule);
    }

    const illegalIps = findNonDocumentationIps(failMock.content);
    for (const ip of illegalIps) {
      violations.push({
        fixture: failMock.name,
        value: ip,
        reason: `Adresse IP hors plage documentaire réservée détectée : ${ip}.`
      });
    }
  }

  // 3. Vérification de la couverture complète (chaque règle doit avoir son mock dédié)
  const missingRules = options.rules.filter((r) => !coveredRules.has(r));
  for (const missing of missingRules) {
    violations.push({
      fixture: 'missing_fixture',
      reason: `Règle obligatoire sans mock fail dédié : "${missing}".`
    });
  }

  // 4. Contrôle du défaut unique par règle (si résultats d'évaluation fournis)
  if (options.evaluatedResults) {
    for (const res of options.evaluatedResults) {
      const targetFail = options.mockFails.find((m) => m.name === res.name);
      if (targetFail) {
        if (res.violations.length === 0) {
          violations.push({
            fixture: res.name,
            reason: `Le mock fail "${res.name}" n'a déclenché aucune violation (attendu : "${targetFail.rule}").`
          });
        } else if (res.violations.length > 1) {
          violations.push({
            fixture: res.name,
            value: res.violations.join(', '),
            reason: `Le mock fail "${res.name}" a déclenché ${res.violations.length} règles simultanées (${res.violations.join(', ')}). Un mock fail doit cibler un défaut unique.`
          });
        } else if (res.violations[0] !== targetFail.rule) {
          violations.push({
            fixture: res.name,
            value: res.violations[0],
            reason: `Le mock fail "${res.name}" a déclenché "${res.violations[0]}" au lieu de "${targetFail.rule}".`
          });
        }
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    coverage: {
      totalRules: options.rules.length,
      coveredRules: coveredRules.size,
      missingRules
    }
  };
}
