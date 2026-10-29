export interface IntentionViolation {
  field: string;
  value: string;
  type: 'ipv4' | 'ipv6' | 'cidr' | 'mac' | 'hostname';
  position: number;
  reason: string;
}

export interface IntentionPurityResult {
  pure: boolean;
  violations: IntentionViolation[];
}

export interface DecisionContextInput {
  problem?: string;
  decision?: string;
  tradeoffs?: string | string[];
  [key: string]: unknown;
}

// Domaines et gabarits expressément autorisés pour la documentation
const EXEMPTED_HOSTNAMES = new Set([
  'example.com',
  'example.org',
  'example.net',
  'example.edu'
]);

// Tokens et acronymes techniques avec numéros de version ou spécifications à ne pas confondre avec des IP/hôtes
const EXEMPTED_EXPRESSIONS = [
  /\b3GPP\s+TS\s+[\d.]+/gi,
  /\b3GPP\s+[\d.]+/gi,
  /\bTS\s+[\d.]+/gi,
  /\bRFC\s+\d+/gi,
  /\bRKE2\s+[\d.]+/gi,
  /\bLinux\s+[\d.]+/gi,
  /\b5QI\s+[\d-]+/gi,
  /\bQoS\s+[\d.]+/gi,
  /\bVLAN\s+\d+/gi,
  /\bMTU\s+\d+/gi,
  /\bAS\s+\d+/gi,
  /\bv?\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9_.]+)?\b/g, // Versions à 1 ou 2 points (ex: 5.5, 1.28, 2.4.1), jamais 3 points (IPv4)
  /<(?:IP|HOST|CIDR|MAC|NODE_IP)>/gi,
  /\$\{[A-Z0-9_]+\}/g
];

// MAC patterns (ex: 00:1A:2B:3C:4D:5E ou 00-1A-2B-3C-4D-5E ou 001A.2B3C.4D5E)
const MAC_COLON_REGEX = /\b[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5}\b/g;
const MAC_DASH_REGEX = /\b[0-9a-fA-F]{2}(?:-[0-9a-fA-F]{2}){5}\b/g;
const MAC_DOT_REGEX = /\b[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\b/g;

// CIDR IPv4
const CIDR_IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\/(?:3[0-2]|[12]?\d)\b/g;

// IPv4 pure
const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g;

// CIDR IPv6
const CIDR_IPV6_REGEX = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\/(?:12[0-8]|1[01]\d|[1-9]?\d)\b|\b(?:[0-9a-fA-F]{1,4}:)*:[0-9a-fA-F]{1,4}\/(?:12[0-8]|1[01]\d|[1-9]?\d)\b/g;

// IPv6 pure
const IPV6_REGEX = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:[0-9a-fA-F]{0,4}\b|\b::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}\b/g;

// Nom d'hôte pointé (ex: srv-01.exemple.local, node1.k8s.internal, api.prod.corp)
const HOSTNAME_REGEX = /\b[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?:\.[a-zA-Z]{2,}|(?:\.local|\.internal|\.lan|\.corp|\.home|\.priv|\.test))\b/g;

interface TextRange {
  start: number;
  end: number;
}

function findExemptedRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  for (const regex of EXEMPTED_EXPRESSIONS) {
    const rx = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = rx.exec(text)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length
      });
    }
  }
  return ranges;
}

function isRangeExempted(start: number, end: number, exempted: TextRange[]): boolean {
  return exempted.some((range) => start >= range.start && end <= range.end);
}

function scanFieldText(fieldName: string, text: string): IntentionViolation[] {
  if (!text || typeof text !== 'string') return [];

  const violations: IntentionViolation[] = [];
  const exempted = findExemptedRanges(text);
  const occupiedSpans: TextRange[] = [];

  const isOccupied = (start: number, end: number) => {
    return (
      isRangeExempted(start, end, exempted) ||
      occupiedSpans.some((span) => Math.max(start, span.start) < Math.min(end, span.end))
    );
  };

  // 1. Détection CIDR IPv4
  let match: RegExpExecArray | null;
  const cidrV4 = new RegExp(CIDR_IPV4_REGEX.source, CIDR_IPV4_REGEX.flags);
  while ((match = cidrV4.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (!isOccupied(start, end)) {
      occupiedSpans.push({ start, end });
      violations.push({
        field: fieldName,
        value: match[0],
        type: 'cidr',
        position: start,
        reason: `Préfixe CIDR IPv4 détecté (${match[0]}), interdit au niveau HLD.`
      });
    }
  }

  // 2. Détection IPv4 pure
  const ipV4 = new RegExp(IPV4_REGEX.source, IPV4_REGEX.flags);
  while ((match = ipV4.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (!isOccupied(start, end)) {
      occupiedSpans.push({ start, end });
      violations.push({
        field: fieldName,
        value: match[0],
        type: 'ipv4',
        position: start,
        reason: `Adresse IPv4 détectée (${match[0]}), interdite dans le contexte de décision HLD.`
      });
    }
  }

  // 3. Détection CIDR IPv6
  const cidrV6 = new RegExp(CIDR_IPV6_REGEX.source, CIDR_IPV6_REGEX.flags);
  while ((match = cidrV6.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (!isOccupied(start, end)) {
      occupiedSpans.push({ start, end });
      violations.push({
        field: fieldName,
        value: match[0],
        type: 'cidr',
        position: start,
        reason: `Préfixe CIDR IPv6 détecté (${match[0]}), interdit au niveau HLD.`
      });
    }
  }

  // 4. Détection IPv6 pure
  const ipV6 = new RegExp(IPV6_REGEX.source, IPV6_REGEX.flags);
  while ((match = ipV6.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    // S'assurer qu'il contient au moins 2 deux-points pour éviter les faux positifs d'heures ou de clés
    if (match[0].includes(':') && (match[0].match(/:/g) || []).length >= 2) {
      if (!isOccupied(start, end)) {
        occupiedSpans.push({ start, end });
        violations.push({
          field: fieldName,
          value: match[0],
          type: 'ipv6',
          position: start,
          reason: `Adresse IPv6 détectée (${match[0]}), interdite dans le contexte de décision HLD.`
        });
      }
    }
  }

  // 5. Détection Adresses MAC
  const macRegexes = [MAC_COLON_REGEX, MAC_DASH_REGEX, MAC_DOT_REGEX];
  for (const rx of macRegexes) {
    const mRx = new RegExp(rx.source, rx.flags);
    while ((match = mRx.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (!isOccupied(start, end)) {
        occupiedSpans.push({ start, end });
        violations.push({
          field: fieldName,
          value: match[0],
          type: 'mac',
          position: start,
          reason: `Adresse MAC matérielle détectée (${match[0]}), interdite dans l'intension pure.`
        });
      }
    }
  }

  // 6. Détection Noms d'Hôtes pointés
  const hostRx = new RegExp(HOSTNAME_REGEX.source, HOSTNAME_REGEX.flags);
  while ((match = hostRx.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const candidate = match[0].toLowerCase();

    // Vérifier si c'est une version pure (uniquement chiffres et points)
    if (/^\d+(?:\.\d+)+$/.test(candidate)) {
      continue;
    }

    // Vérifier si c'est un nom d'hôte de documentation exempté
    if (EXEMPTED_HOSTNAMES.has(candidate)) {
      continue;
    }

    if (!isOccupied(start, end)) {
      occupiedSpans.push({ start, end });
      violations.push({
        field: fieldName,
        value: match[0],
        type: 'hostname',
        position: start,
        reason: `Nom d'hôte physique ou logique pointé détecté (${match[0]}), interdit au niveau HLD.`
      });
    }
  }

  return violations;
}

/**
 * Contrôle la pureté de l'intension d'un contexte de décision EDP (Issue #169).
 * Aucune adresse IP, préfixe CIDR, adresse MAC ou nom d'hôte pointé réel ne doit figurer dans le HLD.
 */
export function checkIntentionPurity(context: DecisionContextInput): IntentionPurityResult {
  if (!context || typeof context !== 'object') {
    return { pure: true, violations: [] };
  }

  const allViolations: IntentionViolation[] = [];

  if (typeof context.problem === 'string') {
    allViolations.push(...scanFieldText('problem', context.problem));
  }

  if (typeof context.decision === 'string') {
    allViolations.push(...scanFieldText('decision', context.decision));
  }

  if (typeof context.tradeoffs === 'string') {
    allViolations.push(...scanFieldText('tradeoffs', context.tradeoffs));
  } else if (Array.isArray(context.tradeoffs)) {
    context.tradeoffs.forEach((item, index) => {
      if (typeof item === 'string') {
        allViolations.push(...scanFieldText(`tradeoffs[${index}]`, item));
      }
    });
  }

  return {
    pure: allViolations.length === 0,
    violations: allViolations
  };
}
