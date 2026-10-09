import type { MaturityLevel, ArchitectRole } from '$lib/types/epistemic';

export interface TelegraphicHypothesis {
	text: string;
	consequence: string;
	cost_hint?: string;
}

export interface TelegraphicConflict {
	text: string;
	opposing_reference: string;
	requires_arbitration: boolean;
}

export interface TelegraphicGap {
	id: string;
	question: string;
	assigned_role: ArchitectRole;
}

export interface TelegraphicVariant {
	title: string;
	cost_delta: string;
	trade_off: string;
}

export interface TelegraphicDraft {
	section_id: string;
	subject: string;
	maturity: MaturityLevel;
	is_provisional: boolean;
	retenu: string[];
	suppose: TelegraphicHypothesis[];
	conflit: TelegraphicConflict[];
	manque: TelegraphicGap[];
	variante_b?: TelegraphicVariant;
	expertQuestions?: string[];
}

export interface ToneValidationError {
	code: 'SENTENCE_TOO_LONG' | 'BLACKLISTED_POLITE_PROSE_DETECTED' | 'COMPLACENCY_CHECKMARK_DETECTED';
	message: string;
	snippet?: string;
}

export interface ToneValidationResult {
	valid: boolean;
	errors: ToneValidationError[];
}

/**
 * Liste noire des tournures diplomatiques, consensuelles ou floues interdites dans le HLD télégraphique.
 */
export const BLACKLISTED_POLITE_PROSE_PATTERNS = [
	/il est recommandé/i,
	/il convient de/i,
	/il conviendrait de/i,
	/une attention particulière/i,
	/conformément aux bonnes pratiques/i,
	/il est à noter/i,
	/dans une démarche agile/i,
	/synergie/i,
	/de manière optimale/i,
	/alignement stratégique/i,
	/dans le cadre de/i,
	/afin de garantir/i,
	/nous préconisons/i,
	/il va de soi/i,
	/au vu des éléments/i,
	/force est de constater/i
];

/**
 * Valide le ton télégraphique d'un texte de section HLD.
 * Applique strictement le test de non-régression anti-blabla.
 */
export function validateTelegraphicTone(content: string): ToneValidationResult {
	const errors: ToneValidationError[] = [];

	// 1. Vérification des tournures diplomatiques/consensuelles
	for (const pattern of BLACKLISTED_POLITE_PROSE_PATTERNS) {
		const match = content.match(pattern);
		if (match) {
			errors.push({
				code: 'BLACKLISTED_POLITE_PROSE_DETECTED',
				message: `Tournure diplomatique ou passive interdite détectée : "${match[0]}"`,
				snippet: match[0]
			});
		}
	}

	// 2. Vérification des coches de complaisance sans justification formelle
	const complacencyPatterns = [/✅\s*conforme/i, /\[x\]\s*conforme/i, /conforme sans réserve/i];
	for (const pattern of complacencyPatterns) {
		const match = content.match(pattern);
		if (match) {
			errors.push({
				code: 'COMPLACENCY_CHECKMARK_DETECTED',
				message: `Coche de complaisance interdite : "${match[0]}". Remplacer par "couvert par [Règle/Test]" ou "sous hypothèse".`,
				snippet: match[0]
			});
		}
	}

	// 3. Vérification de la longueur maximale des phrases narratives (max 15 mots par segment logique)
	const lines = content.split('\n');
	for (const line of lines) {
		const trimmed = line.trim();
		// Ne compte pas les en-têtes ou lignes de données de titre
		if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('§')) continue;

		// Découpage par séparateurs de phrases et séparateurs télégraphiques (⇒, ·, ;)
		const telegraphicSegments = trimmed
			.replace(/^(retenu|supposé|conflit|manque|variante(\s+[a-z0-9]+)?)\s*:\s*/i, '')
			.split(/[.!?]|⇒|·|;/)
			.map((s) => s.trim())
			.filter(Boolean);

		for (const segment of telegraphicSegments) {
			const words = segment.split(/\s+/).filter(Boolean);
			if (words.length > 15) {
				errors.push({
					code: 'SENTENCE_TOO_LONG',
					message: `Phrase narrative trop longue (${words.length} mots > 15 mots max). Condenser en notation télégraphique avec flèches (⇒).`,
					snippet: segment
				});
			}
		}
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * Restitue l'état d'une section HLD sous format télégraphique structuré.
 */
export function renderTelegraphicDraft(draft: TelegraphicDraft): string {
	const headerParts: string[] = [];
	if (draft.is_provisional) {
		headerParts.push('[PROVISOIRE]');
	}
	headerParts.push(`${draft.section_id} ${draft.subject} · ${draft.maturity}`);

	const lines: string[] = [headerParts.join(' ')];

	// Retenu
	if (draft.retenu.length > 0) {
		lines.push(`retenu : ${draft.retenu.join(' · ')}`);
	}

	// Supposé avec conséquences et cost hint
	for (const hyp of draft.suppose) {
		let line = `supposé : ${hyp.text} ⇒ ${hyp.consequence}`;
		if (hyp.cost_hint) {
			line += ` · ${hyp.cost_hint}`;
		}
		lines.push(line);
	}

	// Conflit
	for (const conf of draft.conflit) {
		lines.push(`conflit : ${conf.text} vs ${conf.opposing_reference}${conf.requires_arbitration ? ' [ARBITRAGE REQUIS]' : ''}`);
	}

	// Manque
	for (const m of draft.manque) {
		lines.push(`manque : [${m.id}] ${m.question} → ${m.assigned_role}`);
	}

	// Variante B
	if (draft.variante_b) {
		lines.push(`variante B : ${draft.variante_b.title} (${draft.variante_b.cost_delta} · ${draft.variante_b.trade_off})`);
	}

	return lines.join('\n');
}
